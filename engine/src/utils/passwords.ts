export function normalizeBcryptHash(hash: string): string {
  if (hash.startsWith('$2y$') || hash.startsWith('$2x$')) {
    return `$2b$${hash.slice(4)}`;
  }
  return hash;
}
