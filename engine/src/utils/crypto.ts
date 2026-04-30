import CryptoJS from 'crypto-js';

function getKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 16) {
    // Fallback in dev so the app starts — MUST be set properly in production
    if (process.env.NODE_ENV !== 'production') return 'dev-key-change-me-32-chars-padded';
    throw new Error('ENCRYPTION_KEY must be at least 16 characters in production');
  }
  return key;
}

export function encrypt(plaintext: string): Buffer {
  const encrypted = CryptoJS.AES.encrypt(plaintext, getKey()).toString();
  return Buffer.from(encrypted, 'utf8');
}

export function decrypt(cipherBuffer: Buffer): string {
  const ciphertext = cipherBuffer.toString('utf8');
  const bytes = CryptoJS.AES.decrypt(ciphertext, getKey());
  return bytes.toString(CryptoJS.enc.Utf8);
}

export function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.substring(0, 4) + '****' + key.slice(-4);
}

export function generateSecureToken(bytes = 32): string {
  return CryptoJS.lib.WordArray.random(bytes).toString(CryptoJS.enc.Hex);
}
