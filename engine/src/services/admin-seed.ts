import bcrypt from 'bcryptjs';
import { query, queryOne } from '../db/client';
import { logger } from '../utils/logger';

const DEFAULT_EMAIL = 'admin@agencyfic.com';
const DEFAULT_PASSWORD = 'Admin@123';

async function passwordMatches(hash: string | null | undefined, password: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch (err) {
    logger.warn('Failed to compare admin password hash.', err);
    return false;
  }
}

export async function ensureSuperAdminFromEnv(): Promise<void> {
  const rawEmail = process.env.SUPER_ADMIN_EMAIL?.trim();
  const desiredEmail = (rawEmail || DEFAULT_EMAIL).toLowerCase();
  const rawPassword = process.env.SUPER_ADMIN_PASSWORD;
  const desiredPassword = rawPassword || DEFAULT_PASSWORD;

  if (rawEmail && !rawPassword && rawEmail.toLowerCase() !== DEFAULT_EMAIL) {
    logger.warn('SUPER_ADMIN_EMAIL set without SUPER_ADMIN_PASSWORD; skipping env override.');
    return;
  }

  const existing = await queryOne<{ id: string; password: string }>(
    `SELECT id, password FROM engine.admin_users WHERE email = $1`,
    [desiredEmail]
  );
  if (existing) {
    const matchesDesired = await passwordMatches(existing.password, desiredPassword);
    if (matchesDesired) return;
    const matchesDefault = await passwordMatches(existing.password, DEFAULT_PASSWORD);
    // Only update when the stored password is still the original default to avoid overwriting manual changes.
    if (matchesDefault && desiredPassword !== DEFAULT_PASSWORD) {
      const passwordHash = await bcrypt.hash(desiredPassword, 12);
      await query(
        `UPDATE engine.admin_users SET password = $1, updated_at = NOW() WHERE id = $2`,
        [passwordHash, existing.id]
      );
      logger.info('Super admin password updated from environment configuration.');
    }
    return;
  }

  if (desiredEmail !== DEFAULT_EMAIL) {
    const legacyDefault = await queryOne<{ id: string; password: string }>(
      `SELECT id, password FROM engine.admin_users WHERE email = $1`,
      [DEFAULT_EMAIL]
    );
    if (legacyDefault) {
      // Only migrate the legacy default account when it still uses the default password.
      const legacyMatchesDefault = await passwordMatches(legacyDefault.password, DEFAULT_PASSWORD);
      if (legacyMatchesDefault) {
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
