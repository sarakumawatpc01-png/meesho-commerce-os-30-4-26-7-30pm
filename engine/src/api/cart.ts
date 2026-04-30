import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/client';
import { optionalAuth } from '../middleware/auth';
import { apiLimiter } from '../middleware/rate-limit';
import { createError } from '../middleware/error-handler';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

function getCartIdentifier(req: Request): { type: 'customer' | 'session'; id: string } {
  if (req.user?.sub) return { type: 'customer', id: req.user.sub };
  const sessionId = req.headers['x-session-id'] as string || uuidv4();
  return { type: 'session', id: sessionId };
}

// GET /api/cart
router.get('/', apiLimiter, optionalAuth, async (req: Request, res: Response) => {
  if (!req.site) throw createError(404, 'Site not found');
  const s = req.siteSchema!;
  const ident = getCartIdentifier(req);

  const whereClause = ident.type === 'customer'
    ? `customer_id = '${ident.id}'`
    : `session_id = '${ident.id}'`;

  const cart = await queryOne(`SELECT * FROM ${s}.carts WHERE ${whereClause} ORDER BY updated_at DESC LIMIT 1`);

  if (!cart) return res.json({ items: [], total: 0, itemCount: 0 });

  // Enrich cart items with current product data
  const enrichedItems = await Promise.all(
    (cart.items || []).map(async (item: any) => {
      const product = await queryOne(
        `SELECT id, title, selling_price, images, sizes, slug FROM ${s}.products WHERE id = $1`,
        [item.productId]
      );
      if (!product) return null;
      const size = product.sizes?.find((s: any) => s.name === item.size);
      return {
        ...item,
        title: product.title,
        price: size?.price || product.selling_price,
        imageUrl: product.images?.[0]?.url,
        slug: product.slug,
        available: size?.available !== false,
      };
    })
  );

  const validItems = enrichedItems.filter(Boolean);
  const subtotal = validItems.reduce((sum, item) => sum + (item.price * item.qty), 0);

  // Apply prepaid discount info
  const prepaidDiscount = req.site.prepaid_discount_enabled
    ? calculatePrepaidDiscount(subtotal, req.site)
    : 0;

  res.json({
    id: cart.id,
    items: validItems,
    subtotal,
    prepaidDiscount,
    prepaidDiscountText: req.site.prepaid_discount_text,
    couponCode: cart.coupon_code,
    itemCount: validItems.reduce((sum: number, i: any) => sum + i.qty, 0),
  });
});

// POST /api/cart/add
router.post('/add', apiLimiter, optionalAuth, async (req: Request, res: Response) => {
  if (!req.site) throw createError(404, 'Site not found');
  const s = req.siteSchema!;

  const { productId, size, qty } = z.object({
    productId: z.string().uuid(),
    size: z.string(),
    qty: z.number().int().min(1).max(10).default(1),
  }).parse(req.body);

  // Verify product and size availability
  const product = await queryOne(`SELECT id, sizes, selling_price FROM ${s}.products WHERE id = $1 AND status = 'active'`, [productId]);
  if (!product) throw createError(404, 'Product not found');

  const sizeData = product.sizes?.find((s: any) => s.name === size);
  if (!sizeData) throw createError(400, 'Size not available');
  if (sizeData.available === false) throw createError(400, 'This size is currently unavailable');

  const ident = getCartIdentifier(req);
  const whereClause = ident.type === 'customer' ? `customer_id = '${ident.id}'` : `session_id = '${ident.id}'`;

  let cart = await queryOne(`SELECT * FROM ${s}.carts WHERE ${whereClause} ORDER BY updated_at DESC LIMIT 1`);

  if (!cart) {
    const insertCols = ident.type === 'customer' ? 'customer_id' : 'session_id';
    const [newCart] = await query(
      `INSERT INTO ${s}.carts (${insertCols}, items) VALUES ($1, $2) RETURNING *`,
      [ident.id, JSON.stringify([])]
    );
    cart = newCart;
  }

  const items: any[] = cart.items || [];
  const existingIdx = items.findIndex(i => i.productId === productId && i.size === size);

  if (existingIdx >= 0) {
    items[existingIdx].qty = Math.min(items[existingIdx].qty + qty, 10);
  } else {
    items.push({ productId, size, qty, price: sizeData.price || product.selling_price });
  }

  await query(`UPDATE ${s}.carts SET items = $1, updated_at = NOW() WHERE id = $2`, [JSON.stringify(items), cart.id]);

  // Track cart add event
  query(`UPDATE ${s}.products SET cart_adds = cart_adds + 1 WHERE id = $1`, [productId]).catch(() => {});

  res.json({ message: 'Added to cart', itemCount: items.reduce((s, i) => s + i.qty, 0) });
});

// PUT /api/cart/item/:productId — update qty
router.put('/item/:productId', apiLimiter, optionalAuth, async (req: Request, res: Response) => {
  if (!req.site) throw createError(404, 'Site not found');
  const s = req.siteSchema!;
  const { qty, size } = z.object({ qty: z.number().int().min(0).max(10), size: z.string() }).parse(req.body);

  const ident = getCartIdentifier(req);
  const whereClause = ident.type === 'customer' ? `customer_id = '${ident.id}'` : `session_id = '${ident.id}'`;
  const cart = await queryOne(`SELECT * FROM ${s}.carts WHERE ${whereClause} ORDER BY updated_at DESC LIMIT 1`);
  if (!cart) throw createError(404, 'Cart not found');

  let items: any[] = cart.items || [];
  if (qty === 0) {
    items = items.filter(i => !(i.productId === req.params.productId && i.size === size));
  } else {
    const idx = items.findIndex(i => i.productId === req.params.productId && i.size === size);
    if (idx >= 0) items[idx].qty = qty;
  }

  await query(`UPDATE ${s}.carts SET items = $1, updated_at = NOW() WHERE id = $2`, [JSON.stringify(items), cart.id]);
  res.json({ message: 'Cart updated' });
});

// POST /api/cart/coupon — apply coupon
router.post('/coupon', apiLimiter, optionalAuth, async (req: Request, res: Response) => {
  if (!req.site) throw createError(404, 'Site not found');
  const s = req.siteSchema!;
  const { code } = z.object({ code: z.string().toUpperCase() }).parse(req.body);

  const coupon = await queryOne(
    `SELECT * FROM ${s}.coupons WHERE code = $1 AND is_active = true AND (valid_until IS NULL OR valid_until > NOW()) AND (usage_limit IS NULL OR usage_count < usage_limit)`,
    [code]
  );
  if (!coupon) throw createError(400, 'Invalid or expired coupon code');

  const ident = getCartIdentifier(req);
  const whereClause = ident.type === 'customer' ? `customer_id = '${ident.id}'` : `session_id = '${ident.id}'`;
  await query(`UPDATE ${s}.carts SET coupon_code = $1, updated_at = NOW() WHERE ${whereClause}`, [code]);

  res.json({
    message: 'Coupon applied!',
    discount_type: coupon.discount_type,
    discount_value: coupon.discount_value,
    max_discount: coupon.max_discount,
  });
});

function calculatePrepaidDiscount(subtotal: number, site: any): number {
  if (subtotal < (site.prepaid_discount_min_order || 0)) return 0;
  if (site.prepaid_discount_type === 'percent') {
    return Math.round((subtotal * site.prepaid_discount_value) / 100);
  }
  return site.prepaid_discount_value;
}

export default router;
