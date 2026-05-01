import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db/client';
import { requireCustomer, optionalAuth } from '../middleware/auth';
import { checkoutLimiter } from '../middleware/rate-limit';
import { createError } from '../middleware/error-handler';
import { createRazorpayOrder, verifyRazorpayPayment } from '../services/payments/razorpay';
import { handleCodOrder } from '../services/payments/cod';
import { sendOrderConfirmation } from '../services/notifications/whatsapp';
import { sendOrderConfirmationEmail } from '../services/notifications/email';
import { scoreCodRisk } from '../services/orders/cod-risk';
import { auditLog } from '../services/audit';
import { logger } from '../utils/logger';
import dayjs from 'dayjs';

const router = Router();

const addressSchema = z.object({
  fullName:  z.string().min(2),
  phone:     z.string().regex(/^[6-9]\d{9}$/),
  pincode:   z.string().length(6),
  address1:  z.string().min(5),
  address2:  z.string().optional(),
  city:      z.string().min(2),
  state:     z.string().min(2),
  country:   z.string().default('India'),
});

// POST /api/checkout/initiate — validate cart + create order draft
router.post('/initiate', checkoutLimiter, optionalAuth, async (req: Request, res: Response) => {
  if (!req.site) throw createError(404, 'Site not found');
  const s = req.siteSchema!;

  const { cartId, addressId, newAddress, paymentMethod, useWallet } = z.object({
    cartId:        z.string().uuid(),
    addressId:     z.string().uuid().optional(),
    newAddress:    addressSchema.optional(),
    paymentMethod: z.enum(['upi','card','netbanking','wallet','emi','cod']),
    useWallet:     z.boolean().default(false),
  }).parse(req.body);

  if (!addressId && !newAddress) throw createError(400, 'Delivery address required');
  if (paymentMethod === 'cod' && !req.site.cod_enabled) throw createError(400, 'COD is not available');

  // Get cart
  const cart = await queryOne(`SELECT * FROM ${s}.carts WHERE id = $1`, [cartId]);
  if (!cart || !cart.items?.length) throw createError(400, 'Cart is empty');

  // Validate all items are still available
  for (const item of cart.items) {
    const product = await queryOne(
      `SELECT id, selling_price, sizes FROM ${s}.products WHERE id = $1 AND status = 'active'`,
      [item.productId]
    );
    if (!product) throw createError(400, `Product ${item.productId} is no longer available`);
    const size = product.sizes?.find((s: any) => s.name === item.size);
    if (!size?.available) throw createError(400, `Size ${item.size} is no longer available`);
  }

  // Calculate financials
  let subtotal = cart.items.reduce((sum: number, item: any) => sum + (item.price * item.qty), 0);
  let prepaidDiscount = 0;
  let couponDiscount = 0;
  let walletUsed = 0;

  // Apply prepaid discount
  if (paymentMethod !== 'cod' && req.site.prepaid_discount_enabled) {
    if (subtotal >= (req.site.prepaid_discount_min_order || 0)) {
      prepaidDiscount = req.site.prepaid_discount_type === 'percent'
        ? Math.round((subtotal * req.site.prepaid_discount_value) / 100)
        : req.site.prepaid_discount_value;
    }
  }

  // Apply coupon
  if (cart.coupon_code) {
    const coupon = await queryOne(
      `SELECT * FROM ${s}.coupons WHERE code = $1 AND is_active = true`,
      [cart.coupon_code]
    );
    if (coupon && subtotal >= coupon.min_order_value) {
      couponDiscount = coupon.discount_type === 'percent'
        ? Math.min(Math.round((subtotal * coupon.discount_value) / 100), coupon.max_discount || Infinity)
        : coupon.discount_value;
    }
  }

  // Apply wallet
  if (useWallet && req.user) {
    const customer = await queryOne(`SELECT wallet_balance FROM engine.customers WHERE id = $1`, [req.user.sub]);
    walletUsed = Math.min(customer?.wallet_balance || 0, subtotal - prepaidDiscount - couponDiscount);
  }

  const total = Math.max(0, subtotal - prepaidDiscount - couponDiscount - walletUsed);

  // COD risk score
  let codRiskScore = 0;
  let codRiskFlags: string[] = [];
  if (paymentMethod === 'cod') {
    const riskResult = await scoreCodRisk({
      customerId: req.user?.sub,
      phone: newAddress?.phone || '',
      total,
      addressComplete: !!(newAddress?.address1 && newAddress?.city && newAddress?.pincode),
      siteSchema: s,
    });
    codRiskScore = riskResult.score;
    codRiskFlags = riskResult.flags;
  }

  // Resolve address
  let shippingAddress = newAddress;
  if (addressId && req.user) {
    const addr = await queryOne(`SELECT * FROM engine.customer_addresses WHERE id = $1 AND customer_id = $2`, [addressId, req.user.sub]);
    if (!addr) throw createError(404, 'Address not found');
    shippingAddress = addr;
  }

  // Save new address if provided and logged in
  if (newAddress && req.user) {
    await query(
      `INSERT INTO engine.customer_addresses (customer_id, full_name, phone, pincode, address1, address2, city, state, country)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [req.user.sub, newAddress.fullName, newAddress.phone, newAddress.pincode, newAddress.address1, newAddress.address2 || null, newAddress.city, newAddress.state, newAddress.country]
    );
  }

  // Generate order number
  const siteCode = req.site.slug.substring(0, 2).toUpperCase();
  const orderNumber = `${siteCode}-${dayjs().format('YYYYMMDD')}-${Math.floor(Math.random() * 90000 + 10000)}`;

  // Build items array
  const orderItems = await Promise.all(cart.items.map(async (item: any) => {
    const product = await queryOne(`SELECT title, images, meesho_url FROM ${s}.products WHERE id = $1`, [item.productId]);
    return {
      productId: item.productId,
      title: product?.title,
      size: item.size,
      qty: item.qty,
      price: item.price,
      imageUrl: product?.images?.[0]?.url,
      meeshoUrl: product?.meesho_url,
    };
  }));

  // Create order
  const customerId = req.user?.sub;
  const [order] = await query(
    `INSERT INTO ${s}.orders (
       order_number, customer_id, site_id, status, items, shipping_address,
       subtotal, discount_amount, prepaid_discount, coupon_code, coupon_discount,
       wallet_used, total, payment_method, cod_risk_score, cod_risk_flags
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [
      orderNumber, customerId, req.site.id,
      paymentMethod === 'cod' ? 'pending_fulfillment' : 'pending_payment',
      JSON.stringify(orderItems), JSON.stringify(shippingAddress),
      subtotal, 0, prepaidDiscount, cart.coupon_code || null, couponDiscount,
      walletUsed, total, paymentMethod, codRiskScore, codRiskFlags,
    ]
  );

  if (paymentMethod === 'cod') {
    // Process COD order directly
    await handleCodOrder(order, req.site, s);
    return res.json({ orderId: order.id, orderNumber, paymentMethod: 'cod', total });
  }

  // Create Razorpay order
  const razorpayOrder = await createRazorpayOrder(order, req.site);

  await query(
    `UPDATE ${s}.orders SET razorpay_order_id = $1 WHERE id = $2`,
    [razorpayOrder.id, order.id]
  );

  const razorpayAmount = Number(razorpayOrder.amount);
  const razorpayTotal = Number.isFinite(razorpayAmount) ? razorpayAmount / 100 : order.total;
  if (!Number.isFinite(razorpayAmount)) {
    logger.warn('Razorpay order amount was not numeric; falling back to order total', {
      orderId: order.id,
      razorpayAmount: razorpayOrder.amount,
    });
  }

  res.json({
    orderId: order.id,
    orderNumber,
    razorpayOrderId: razorpayOrder.id,
    razorpayKeyId: req.site.razorpay_key_id,
    total: razorpayTotal,
    currency: 'INR',
  });
});

// POST /api/checkout/verify — verify Razorpay payment
router.post('/verify', checkoutLimiter, optionalAuth, async (req: Request, res: Response) => {
  if (!req.site) throw createError(404, 'Site not found');
  const s = req.siteSchema!;

  const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = z.object({
    orderId:           z.string().uuid(),
    razorpayOrderId:   z.string(),
    razorpayPaymentId: z.string(),
    razorpaySignature: z.string(),
  }).parse(req.body);

  const order = await queryOne(`SELECT * FROM ${s}.orders WHERE id = $1`, [orderId]);
  if (!order) throw createError(404, 'Order not found');
  if (order.payment_status === 'paid') throw createError(400, 'Order already paid');

  // Verify signature
  const isValid = await verifyRazorpayPayment(
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    req.site
  );
  if (!isValid) throw createError(400, 'Payment verification failed');

  // Update order
  await query(
    `UPDATE ${s}.orders SET
       payment_status = 'paid', status = 'pending_fulfillment',
       razorpay_payment_id = $1, razorpay_signature = $2, updated_at = NOW()
     WHERE id = $3`,
    [razorpayPaymentId, razorpaySignature, orderId]
  );

  // Deduct wallet if used
  if (order.wallet_used > 0 && order.customer_id) {
    await query(
      `UPDATE engine.customers SET wallet_balance = wallet_balance - $1 WHERE id = $2`,
      [order.wallet_used, order.customer_id]
    );
  }

  // Update coupon usage
  if (order.coupon_code) {
    await query(`UPDATE ${s}.coupons SET usage_count = usage_count + 1 WHERE code = $1`, [order.coupon_code]);
  }

  // Clear cart
  await query(`UPDATE ${s}.carts SET items = '[]', coupon_code = NULL WHERE customer_id = $1`, [order.customer_id]);

  // Track purchase
  await query(`UPDATE ${s}.products SET purchases = purchases + 1 WHERE id = ANY($1)`,
    [order.items.map((i: any) => i.productId)]).catch(() => {});

  // Send notifications (async)
  const customer = await queryOne(`SELECT * FROM engine.customers WHERE id = $1`, [order.customer_id]);
  sendOrderConfirmation(order, customer, req.site).catch(() => {});
  sendOrderConfirmationEmail(order, customer, req.site).catch(() => {});

  auditLog({ actorType: 'system', action: 'order.paid', siteId: req.site.id, resourceId: orderId, details: { amount: order.total } });

  res.json({ message: 'Payment verified', orderId, orderNumber: order.order_number });
});

export default router;
