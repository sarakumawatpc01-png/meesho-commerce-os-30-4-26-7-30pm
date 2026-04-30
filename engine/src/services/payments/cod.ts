import { query } from '../../db/client';
import { sendNewOrderAlert, sendOrderConfirmation } from '../notifications/whatsapp';
import { sendOrderConfirmationEmail } from '../notifications/email';
import { Site } from '../../types';
import { logger } from '../../utils/logger';

export async function handleCodOrder(order: any, site: Site, schema: string): Promise<void> {
  // Update order status
  await query(
    `UPDATE ${schema}.orders SET
       payment_status = 'pending', status = 'pending_fulfillment',
       updated_at = NOW()
     WHERE id = $1`,
    [order.id]
  );

  // Get customer
  const customer = order.customer_id
    ? await require('../../db/client').queryOne(
        `SELECT * FROM engine.customers WHERE id = $1`,
        [order.customer_id]
      )
    : { phone: order.shipping_address?.phone, name: order.shipping_address?.fullName };

  // Send notifications
  await Promise.allSettled([
    sendOrderConfirmation(order, customer, site),
    sendOrderConfirmationEmail(order, customer, site),
    sendNewOrderAlert(order, site),
  ]);

  logger.info('COD order created', { orderId: order.id, total: order.total });
}
