import { Resend } from 'resend';
import { Site } from '../../types';
import { logger } from '../../utils/logger';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOrderConfirmationEmail(order: any, customer: any, site: Site): Promise<void> {
  const email = customer?.email;
  if (!email) return;

  const items = order.items?.map((item: any) =>
    `<tr><td>${item.title}</td><td>${item.size}</td><td>₹${item.price}</td><td>${item.qty}</td></tr>`
  ).join('');

  try {
    await resend.emails.send({
      from: `${site.name} <${process.env.EMAIL_FROM}>`,
      to: email,
      subject: `Order Confirmed: ${order.order_number} — ${site.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">✅ Order Confirmed!</h2>
          <p>Hi ${customer.name || 'Customer'}, your order has been placed successfully.</p>
          <p><strong>Order ID:</strong> ${order.order_number}</p>
          <table border="1" cellpadding="8" cellspacing="0" style="width:100%; border-collapse:collapse;">
            <tr style="background:#f5f5f5"><th>Product</th><th>Size</th><th>Price</th><th>Qty</th></tr>
            ${items}
          </table>
          <p><strong>Total:</strong> ₹${order.total}</p>
          <p><strong>Payment:</strong> ${order.payment_method.toUpperCase()}</p>
          <p style="color:#666; font-size:12px;">You can track your order at: https://${site.domain}/track/${order.id}</p>
        </div>
      `,
    });
  } catch (err) {
    logger.error('Email send failed', { email, error: err });
  }
}
