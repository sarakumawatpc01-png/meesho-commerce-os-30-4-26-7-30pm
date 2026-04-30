import Razorpay from 'razorpay';
import crypto from 'crypto';
import { queryOne } from '../../db/client';
import { decrypt } from '../../utils/crypto';
import { Site } from '../../types';
import { logger } from '../../utils/logger';

async function getRazorpayInstance(site: Site): Promise<Razorpay> {
  // Get encrypted secret from DB
  const keyRow = await queryOne<{ key_value: Buffer }>(
    `SELECT key_value FROM engine.api_keys WHERE site_id = $1 AND key_name = 'razorpay_secret'`,
    [site.id]
  );

  if (!keyRow) throw new Error(`Razorpay secret not configured for site ${site.domain}`);

  const secret = decrypt(keyRow.key_value);

  return new Razorpay({
    key_id: site.razorpay_key_id!,
    key_secret: secret,
  });
}

export async function createRazorpayOrder(order: any, site: Site) {
  const razorpay = await getRazorpayInstance(site);

  const rzpOrder = await razorpay.orders.create({
    amount: Math.round(order.total * 100), // in paise
    currency: 'INR',
    receipt: order.order_number,
    notes: {
      orderId: order.id,
      siteId: site.id,
      siteName: site.name,
    },
  });

  logger.info('Razorpay order created', { orderId: order.id, rzpOrderId: rzpOrder.id });
  return rzpOrder;
}

export async function verifyRazorpayPayment(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string,
  site: Site
): Promise<boolean> {
  const keyRow = await queryOne<{ key_value: Buffer }>(
    `SELECT key_value FROM engine.api_keys WHERE site_id = $1 AND key_name = 'razorpay_secret'`,
    [site.id]
  );
  if (!keyRow) return false;

  const secret = decrypt(keyRow.key_value);
  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  return expectedSignature === razorpaySignature;
}

export async function initiateRefund(
  paymentId: string,
  amount: number,  // in rupees
  reason: string,
  site: Site
): Promise<{ refundId: string }> {
  const razorpay = await getRazorpayInstance(site);

  const refund = await (razorpay.payments as any).refund(paymentId, {
    amount: Math.round(amount * 100),
    notes: { reason },
  });

  logger.info('Razorpay refund initiated', { paymentId, refundId: refund.id, amount });
  return { refundId: refund.id };
}
