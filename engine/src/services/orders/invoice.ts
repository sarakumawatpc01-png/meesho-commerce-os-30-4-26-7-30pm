import PDFDocument from 'pdfkit';
import { Site } from '../../types';
import dayjs from 'dayjs';

export async function generateInvoicePDF(order: any, site: Site): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const addr = order.shipping_address;

    // Header
    doc.fontSize(20).text(site.name, 50, 50);
    doc.fontSize(10).fillColor('#666').text(`https://${site.domain}`, 50, 75);

    // Invoice title
    doc.moveTo(50, 100).lineTo(545, 100).stroke();
    doc.fontSize(16).fillColor('#000').text('TAX INVOICE', 50, 110);
    doc.fontSize(10).fillColor('#444');
    doc.text(`Invoice No: ${order.order_number}`, 50, 135);
    doc.text(`Date: ${dayjs(order.created_at).format('DD MMM YYYY')}`, 50, 150);
    doc.text(`Payment: ${order.payment_method.toUpperCase()}`, 50, 165);

    // Ship to
    doc.text('Ship To:', 350, 135);
    doc.text(`${addr.fullName}`, 350, 150);
    doc.text(`${addr.address1}${addr.address2 ? ', ' + addr.address2 : ''}`, 350, 165);
    doc.text(`${addr.city}, ${addr.state} - ${addr.pincode}`, 350, 180);
    doc.text(`Phone: ${addr.phone}`, 350, 195);

    doc.moveTo(50, 215).lineTo(545, 215).stroke();

    // Items table header
    doc.fontSize(10).fillColor('#000');
    doc.text('Product', 50, 225);
    doc.text('Size', 300, 225);
    doc.text('Qty', 370, 225);
    doc.text('Price', 420, 225);
    doc.text('Total', 490, 225);
    doc.moveTo(50, 240).lineTo(545, 240).stroke();

    let y = 250;
    for (const item of order.items || []) {
      doc.text(item.title?.substring(0, 40) || '', 50, y);
      doc.text(item.size || '', 300, y);
      doc.text(item.qty?.toString() || '1', 370, y);
      doc.text(`₹${item.price}`, 420, y);
      doc.text(`₹${(item.price * (item.qty || 1)).toFixed(2)}`, 490, y);
      y += 20;
    }

    doc.moveTo(50, y + 5).lineTo(545, y + 5).stroke();
    y += 15;

    // Totals
    doc.text(`Subtotal: ₹${order.subtotal}`, 370, y);
    y += 15;
    if (order.prepaid_discount > 0) { doc.fillColor('green').text(`Prepaid Discount: -₹${order.prepaid_discount}`, 370, y); y += 15; doc.fillColor('#000'); }
    if (order.coupon_discount > 0) { doc.text(`Coupon Discount: -₹${order.coupon_discount}`, 370, y); y += 15; }
    doc.fontSize(12).text(`Total: ₹${order.total}`, 370, y);

    doc.fontSize(8).fillColor('#999').text('All prices are inclusive of applicable taxes.', 50, y + 40);

    doc.end();
  });
}
