import { query, queryOne } from '../../db/client';
import { initiateRefund } from './razorpay';
import { sendReturnConfirmation } from '../notifications/whatsapp';
import { auditLog } from '../audit';
import { logger } from '../../utils/logger';

export async function processRefund(orderId: string, siteId: string, schema: string): Promise<void> {
  const order = await queryOne(`SELECT * FROM ${schema}.orders WHERE id = $1`, [orderId]);
  if (!order) throw new Error('Order not found');

  const site = await queryOne(`SELECT * FROM engine.sites WHERE id = $1`, [siteId]);
  if (!site) throw new Error('Site not found');

  const customer = await queryOne(`SELECT * FROM engine.customers WHERE id = $1`, [order.customer_id]);

  let refundMethod: 'razorpay' | 'wallet' = 'wallet';

  if (order.payment_method !== 'cod' && order.razorpay_payment_id) {
    try {
      await initiateRefund(order.razorpay_payment_id, order.total, 'Customer return', site);
      refundMethod = 'razorpay';

      await query(
        `UPDATE ${schema}.orders SET payment_status = 'refunded', status = 'refunded', updated_at = NOW() WHERE id = $1`,
        [orderId]
      );
    } catch (err) {
      logger.error('Razorpay refund failed, falling back to wallet', { orderId, error: err });
      refundMethod = 'wallet';
    }
  }

  if (refundMethod === 'wallet' && order.customer_id) {
    // Credit wallet
    const currentWallet = await queryOne<{ wallet_balance: number }>(
      `SELECT wallet_balance FROM engine.customers WHERE id = $1`,
      [order.customer_id]
    );
    const newBalance = (currentWallet?.wallet_balance || 0) + order.total;

    await query(`UPDATE engine.customers SET wallet_balance = $1 WHERE id = $2`, [newBalance, order.customer_id]);
    await query(
      `INSERT INTO engine.wallet_transactions (customer_id, site_id, amount, type, reason, reference_id, balance_after)
       VALUES ($1, $2, $3, 'credit', 'refund', $4, $5)`,
      [order.customer_id, siteId, order.total, orderId, newBalance]
    );

    await query(
      `UPDATE ${schema}.orders SET payment_status = 'refunded', status = 'refunded', updated_at = NOW() WHERE id = $1`,
      [orderId]
    );
  }

  // Notify customer
  sendReturnConfirmation(order, customer, site).catch(() => {});

  auditLog({ actorType: 'system', action: 'order.refunded', siteId, resourceId: orderId, details: { method: refundMethod, amount: order.total } });
}
