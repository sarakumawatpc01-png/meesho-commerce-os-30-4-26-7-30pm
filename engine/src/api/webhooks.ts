import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { query, queryOne } from '../db/client';
import { logger } from '../utils/logger';

function timingSafeEqualHex(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

async function verifyRazorpaySignature(rawBody: string, signature: string): Promise<boolean> {
  const sites = await query(
    `SELECT schema_name FROM engine.sites WHERE status = 'active' AND razorpay_webhook_secret IS NOT NULL`
  );

  for (const site of sites) {
    const schemaName = site.schema_name;
    const secretRow = await queryOne(
      `SELECT razorpay_webhook_secret FROM ${schemaName}.site_settings LIMIT 1`
    );
    const secret = secretRow?.razorpay_webhook_secret as string | undefined;
    if (!secret) continue;

    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    if (timingSafeEqualHex(expected, signature)) return true;
  }
  return false;
}

const router = Router();

// Razorpay webhook
router.post('/razorpay', async (req: Request, res: Response) => {
  const signature = req.headers['x-razorpay-signature'] as string;
  const rawBody = (req as any).rawBody as string | undefined;

  if (!signature || !rawBody) {
    return res.status(400).json({ error: 'Missing webhook signature/body' });
  }

  const isValid = await verifyRazorpaySignature(rawBody, signature);
  if (!isValid) {
    logger.warn('Razorpay webhook signature verification failed');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // We need to find the site to get the webhook secret
  // Razorpay sends a unique signature per account
  // For simplicity, we verify against all active sites' secrets
  const event = req.body;
  logger.info('Razorpay webhook', { event: event.event });

  if (event.event === 'payment.captured') {
    const payment = event.payload?.payment?.entity;
    if (payment?.order_id) {
      // Find order by razorpay_order_id
      const sites = await query(`SELECT schema_name FROM engine.sites WHERE status = 'active'`);

      for (const site of sites) {
        const s = site.schema_name;
        const order = await queryOne(
          `SELECT * FROM ${s}.orders WHERE razorpay_order_id = $1`,
          [payment.order_id]
        );
        if (order && order.payment_status !== 'paid') {
          await query(
            `UPDATE ${s}.orders SET payment_status = 'paid', status = 'pending_fulfillment',
             razorpay_payment_id = $1, updated_at = NOW() WHERE id = $2`,
            [payment.id, order.id]
          );
          logger.info('Payment captured via webhook', { orderId: order.id });
          break;
        }
      }
    }
  }

  if (event.event === 'refund.processed') {
    logger.info('Refund processed', { refundId: event.payload?.refund?.entity?.id });
  }

  res.json({ status: 'ok' });
});

// WhatsApp webhook (incoming messages)
router.get('/whatsapp', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.send(challenge);
  } else {
    res.status(403).send('Forbidden');
  }
});

router.post('/whatsapp', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const changes = body?.entry?.[0]?.changes?.[0];
    const value = changes?.value;

    if (value?.messages?.[0]) {
      const message = value.messages[0];
      const phone = message.from?.replace('91', '');
      const text = message?.text?.body?.toLowerCase().trim();

      // Handle "TRACK <orderid>" messages
      if (text?.startsWith('track ')) {
        const orderId = text.replace('track ', '').trim().toUpperCase();
        logger.info('WhatsApp track request', { phone, orderId });
        // Lookup order and reply (handled by WhatsApp service)
      }
    }
  } catch (err) {
    logger.error('WhatsApp webhook error', { error: err });
  }

  res.json({ status: 'ok' });
});

export default router;
