import bcrypt from 'bcryptjs';
import { query, queryOne } from '../db/client';
import { logger } from '../utils/logger';

const DEFAULT_EMAIL = 'admin@agencyfic.com';
const DEFAULT_PASSWORD = 'Admin@123';

async function passwordMatches(hash: string | null | undefined, password: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

export async function ensureSuperAdminFromEnv(): Promise<void> {
  const desiredEmail = (process.env.SUPER_ADMIN_EMAIL || DEFAULT_EMAIL).trim().toLowerCase();
  const desiredPassword = process.env.SUPER_ADMIN_PASSWORD || DEFAULT_PASSWORD;

  if (!desiredEmail || !desiredPassword) {
    logger.warn('SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD not set; skipping super admin bootstrap.');
    return;
  }

  const existing = await queryOne<{ id: string; password: string }>(
    `SELECT id, password FROM engine.admin_users WHERE email = $1`,
    [desiredEmail]
  );
  if (existing) {
    if (await passwordMatches(existing.password, desiredPassword)) return;
    if (await passwordMatches(existing.password, DEFAULT_PASSWORD) && desiredPassword !== DEFAULT_PASSWORD) {
      const passwordHash = await bcrypt.hash(desiredPassword, 12);
      await query(
        `UPDATE engine.admin_users SET password = $1, updated_at = NOW() WHERE id = $2`,
        [passwordHash, existing.id]
      );
      logger.info('Super admin password updated from environment configuration.');
    }
    return;
  }

  const legacyDefault = await queryOne<{ id: string; password: string }>(
    `SELECT id, password FROM engine.admin_users WHERE email = $1`,
    [DEFAULT_EMAIL]
  );
  if (legacyDefault && desiredEmail !== DEFAULT_EMAIL) {
    if (await passwordMatches(legacyDefault.password, DEFAULT_PASSWORD)) {
      const passwordHash = await bcrypt.hash(desiredPassword, 12);
      await query(
        `UPDATE engine.admin_users
         SET email = $1, password = $2, updated_at = NOW()
         WHERE id = $3`,
        [desiredEmail, passwordHash, legacyDefault.id]
      );
      logger.info('Default super admin updated to use environment credentials.');
      return;
    }
  }

  const passwordHash = await bcrypt.hash(desiredPassword, 12);
  await query(
    `INSERT INTO engine.admin_users (email, name, password, role, is_active)
     VALUES ($1, $2, $3, 'super_admin', true)
     ON CONFLICT (email) DO NOTHING`,
    [desiredEmail, 'Super Admin', passwordHash]
  );
  logger.info('Super admin created from environment configuration.');
}
