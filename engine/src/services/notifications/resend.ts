import { Resend } from 'resend';
import { logger } from '../../utils/logger';

let resendClient: Resend | null = null;
let resendInitialized = false;
let missingResendKeyLogged = false;
let missingEmailFromLogged = false;

function formatPrefix(prefix?: string): string {
  return prefix ? `${prefix} ` : '';
}

export function getResendClient(prefix?: string): Resend | null {
  if (resendInitialized) return resendClient;
  resendInitialized = true;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (!missingResendKeyLogged) {
      logger.warn(`${formatPrefix(prefix)}RESEND_API_KEY not configured; email sending disabled.`);
      missingResendKeyLogged = true;
    }
    return resendClient;
  }
  try {
    resendClient = new Resend(apiKey);
  } catch (err) {
    logger.error(`${formatPrefix(prefix)}Failed to initialize Resend client`, { error: err });
    resendClient = null;
  }
  return resendClient;
}

export function getEmailFrom(prefix?: string): string | null {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    if (!missingEmailFromLogged) {
      logger.warn(`${formatPrefix(prefix)}EMAIL_FROM not configured; email sending disabled.`);
      missingEmailFromLogged = true;
    }
    return null;
  }
  return from;
}
