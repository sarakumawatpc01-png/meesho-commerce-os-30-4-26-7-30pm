import bcrypt from 'bcryptjs';
import { query, queryOne } from '../../db/client';
import { sendWhatsAppMessage } from '../notifications/whatsapp';
import { Site } from '../../types';
import { logger } from '../../utils/logger';

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendOtp(phone: string, site: Site): Promise<void> {
  // Invalidate existing OTPs
  await query(
    `UPDATE engine.otps SET used = true WHERE phone = $1 AND used = false`,
    [phone]
  );

  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 8);

  await query(
    `INSERT INTO engine.otps (phone, otp_hash, purpose, expires_at)
     VALUES ($1, $2, 'login', NOW() + INTERVAL '5 minutes')`,
    [phone, otpHash]
  );

  // Send via WhatsApp
  const message = `${site.whatsapp_prefix || `[${site.name}]`} Your OTP is *${otp}*. Valid for 5 minutes. Do not share with anyone.`;
  await sendWhatsAppMessage(`91${phone}`, message);

  logger.info('OTP sent', { phone: phone.slice(-4), siteId: site.id });
}

export async function verifyOtp(phone: string, otp: string): Promise<boolean> {
  const otpRecord = await queryOne<{
    id: string;
    otp_hash: string;
    attempts: number;
    expires_at: Date;
    used: boolean;
  }>(
    `SELECT id, otp_hash, attempts, expires_at, used
     FROM engine.otps
     WHERE phone = $1 AND used = false AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [phone]
  );

  if (!otpRecord) return false;

  // Check max attempts
  if (otpRecord.attempts >= 5) {
    await query(`UPDATE engine.otps SET used = true WHERE id = $1`, [otpRecord.id]);
    return false;
  }

  // Increment attempts
  await query(`UPDATE engine.otps SET attempts = attempts + 1 WHERE id = $1`, [otpRecord.id]);

  const isValid = await bcrypt.compare(otp, otpRecord.otp_hash);

  if (isValid) {
    await query(`UPDATE engine.otps SET used = true WHERE id = $1`, [otpRecord.id]);
  }

  return isValid;
}
