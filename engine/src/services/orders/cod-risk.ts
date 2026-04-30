import { queryOne } from '../../db/client';

interface CodRiskInput {
  customerId?: string;
  phone: string;
  total: number;
  addressComplete: boolean;
  siteSchema: string;
}

export async function scoreCodRisk(input: CodRiskInput): Promise<{ score: number; flags: string[] }> {
  let score = 0;
  const flags: string[] = [];

  // Address completeness
  if (!input.addressComplete) { score += 3; flags.push('incomplete_address'); }

  // Phone pattern check (fake/sequential numbers)
  const phoneDigits = input.phone.replace(/\D/g, '');
  if (/^(.)\1{8,}$/.test(phoneDigits)) { score += 5; flags.push('suspicious_phone'); }
  if (input.total > 2000) { score += 2; flags.push('high_value_cod'); }

  // Customer history
  if (input.customerId) {
    const history = await queryOne<{ orders: string; returns: string }>(
      `SELECT
         (SELECT COUNT(*) FROM ${input.siteSchema}.orders WHERE customer_id = $1) as orders,
         (SELECT COUNT(*) FROM ${input.siteSchema}.orders WHERE customer_id = $1 AND status IN ('return_requested','return_complete')) as returns`,
      [input.customerId]
    );

    if (history) {
      const orderCount = parseInt(history.orders);
      const returnCount = parseInt(history.returns);

      if (orderCount === 0) { score += 1; flags.push('new_customer'); }
      if (orderCount > 0 && returnCount / orderCount > 0.5) {
        score += 4; flags.push('high_return_rate');
      }
    }
  } else {
    score += 1; flags.push('guest_checkout');
  }

  return { score: Math.min(score, 10), flags };
}
