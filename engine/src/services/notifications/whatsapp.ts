/**
 * WhatsApp Business API Service
 * One number handles all 10 sites
 * All templates are configurable per site
 */

import axios from 'axios';
import { query } from '../../db/client';
import { Site } from '../../types';
import { logger } from '../../utils/logger';

const WA_BASE = 'https://graph.facebook.com/v18.0';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

async function sendRawMessage(to: string, body: string): Promise<string | null> {
  try {
    const response = await axios.post(
      `${WA_BASE}/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to.startsWith('91') ? to : `91${to}`,
        type: 'text',
        text: { body, preview_url: false },
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data?.messages?.[0]?.id || null;
  } catch (err: any) {
    logger.error('WhatsApp send failed', { to, error: err.response?.data || err.message });
    return null;
  }
}

export async function sendWhatsAppMessage(phone: string, message: string): Promise<void> {
  await sendRawMessage(phone, message);
}

async function logMessage(phone: string, template: string, siteId?: string, customerId?: string, messageId?: string | null): Promise<void> {
  await query(
    `INSERT INTO engine.whatsapp_log (site_id, customer_id, phone, template, message_id, status)
     VALUES ($1, $2, $3, $4, $5, 'sent')`,
    [siteId || null, customerId || null, phone, template, messageId]
  ).catch(() => {});
}

// ── Order notifications ───────────────────────────────────────

export async function sendOrderConfirmation(order: any, customer: any, site: Site): Promise<void> {
  const phone = customer?.phone || order.shipping_address?.phone;
  if (!phone) return;

  const prefix = site.whatsapp_prefix || `[${site.name}]`;
  const name = customer?.name || order.shipping_address?.fullName || 'Customer';
  const items = order.items?.map((i: any) => `${i.title} (Size: ${i.size})`).join(', ');
  const method = order.payment_method === 'cod' ? 'Cash on Delivery' : order.payment_method.toUpperCase();

  const message = `${prefix} ✅ *Order Confirmed!*

Hi ${name}! Your order has been placed.

🛍️ ${items}
💰 ₹${order.total} paid via ${method}
📦 Order ID: ${order.order_number}

We will update you when it ships! 🚀`;

  const msgId = await sendRawMessage(`91${phone}`, message);
  await logMessage(phone, 'order_confirmed', site.id, customer?.id, msgId);
}

export async function sendDispatchAlert(order: any, customer: any, site: Site): Promise<void> {
  const phone = customer?.phone || order.shipping_address?.phone;
  if (!phone) return;

  const prefix = site.whatsapp_prefix || `[${site.name}]`;
  const name = customer?.name || order.shipping_address?.fullName || 'Customer';
  const trackingUrl = order.tracking_url || `https://${site.domain}/track/${order.id}`;

  const message = `${prefix} 🚚 *Your order is on its way!*

Hi ${name}!
📦 Order ${order.order_number} has been dispatched.
🔍 Tracking: ${trackingUrl}
📅 Expected delivery: ${order.estimated_delivery_date || '3-7 business days'}`;

  const msgId = await sendRawMessage(`91${phone}`, message);
  await logMessage(phone, 'order_dispatched', site.id, customer?.id, msgId);
}

export async function sendDeliveryConfirmation(order: any, customer: any, site: Site): Promise<void> {
  const phone = customer?.phone;
  if (!phone) return;

  const prefix = site.whatsapp_prefix || `[${site.name}]`;
  const name = customer?.name || 'Customer';
  const reviewUrl = `https://${site.domain}/product/${order.items?.[0]?.slug}#reviews`;

  const message = `${prefix} 🎉 *Your order has arrived!*

Hi ${name}! How do you like your purchase?
Please rate it here: ${reviewUrl}

Your feedback helps other customers! ⭐`;

  const msgId = await sendRawMessage(`91${phone}`, message);
  await logMessage(phone, 'order_delivered', site.id, customer?.id, msgId);
}

export async function sendNewOrderAlert(order: any, site: Site): Promise<void> {
  const employeePhone = process.env.WHATSAPP_NUMBER;
  if (!employeePhone) return;

  const addr = order.shipping_address;
  const fullAddress = `${addr.address1}${addr.address2 ? ', ' + addr.address2 : ''}, ${addr.city}, ${addr.state} - ${addr.pincode}`;
  const items = order.items?.map((i: any) => `${i.title} | Size: ${i.size} | Qty: ${i.qty}`).join('\n');

  const firstProductUrl = order.items?.[0]?.meeshoUrl || 'N/A';

  const message = `🆕 *NEW ORDER — ${site.name}*

Order: ${order.order_number}
${items}
Amount: ₹${order.total} (${order.payment_method.toUpperCase()})

👤 ${addr.fullName}
📱 ${addr.phone}
📍 ${fullAddress}

Meesho Link: ${firstProductUrl}

Order on Meesho → reply with tracking ID.`;

  await sendRawMessage(employeePhone, message);
  await logMessage(employeePhone, 'new_order_alert', site.id);
}

export async function sendCartRecovery(phone: string, product: any, cartUrl: string, site: Site): Promise<void> {
  const prefix = site.whatsapp_prefix || `[${site.name}]`;
  const message = `${prefix} 👀 *You left something!*

Your cart is waiting.
🛍️ ${product.title} — ₹${product.selling_price}
Only a few left! Complete your order: ${cartUrl}`;

  await sendRawMessage(`91${phone}`, message);
  await logMessage(phone, 'cart_recovery', site.id);
}

export async function sendReturnConfirmation(order: any, customer: any, site: Site): Promise<void> {
  const phone = customer?.phone;
  if (!phone) return;

  const prefix = site.whatsapp_prefix || `[${site.name}]`;
  const name = customer?.name || 'Customer';

  const message = `${prefix} ↩️ *Return Initiated*

Hi ${name}!
📦 Order ${order.order_number} return is in process.
💰 Refund ₹${order.total} within 5–7 days.

If you have any questions, reply to this message.`;

  await sendRawMessage(`91${phone}`, message);
  await logMessage(phone, 'return_confirmed', site.id, customer?.id);
}

export async function sendReviewRequest(order: any, customer: any, site: Site): Promise<void> {
  const phone = customer?.phone;
  if (!phone) return;

  const prefix = site.whatsapp_prefix || `[${site.name}]`;
  const reviewUrl = `https://${site.domain}/account/orders`;

  const message = `${prefix} 💕 *How was your order?*

Hi! We hope you loved your purchase from ${site.name}.
Please take a moment to share your experience: ${reviewUrl}

Your review means a lot to us! ⭐`;

  await sendRawMessage(`91${phone}`, message);
}

export async function sendReengagementMessage(phone: string, discountCode: string, site: Site): Promise<void> {
  const prefix = site.whatsapp_prefix || `[${site.name}]`;
  const message = `${prefix} We miss you! 💕

Here's 10% off your next order: *${discountCode}*
Valid for 48 hours: https://${site.domain}

Shop the latest kurtis now! 🛍️`;

  await sendRawMessage(`91${phone}`, message);
}
