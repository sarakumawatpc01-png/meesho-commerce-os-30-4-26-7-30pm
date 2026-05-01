/**
 * Normalize non-standard bcrypt hash prefixes (PHP `$2y$` and `$2x$`)
 * to the `$2b$` format supported by bcryptjs.
 */
export function normalizeBcryptHash(hash: string): string {
  if (hash.startsWith('$2y$') || hash.startsWith('$2x$')) {
    return `$2b$${hash.slice(4)}`;
  }
  return hash;
}
