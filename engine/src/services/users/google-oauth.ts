import axios from 'axios';
import { query, queryOne } from '../../db/client';
import { Site } from '../../types';
import { logger } from '../../utils/logger';

export async function googleOAuthCallback(code: string, site: Site): Promise<any> {
  const redirectUri = `https://${site.domain}/api/auth/google/callback`;

  // Exchange code for tokens
  const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const { access_token } = tokenResponse.data;

  // Get user info
  const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  const { sub, email, name, picture } = userInfoResponse.data;

  // Find or create customer
  let customer = await queryOne<any>(
    `SELECT * FROM engine.customers WHERE google_sub = $1 OR email = $2`,
    [sub, email]
  );

  if (!customer) {
    const [newCustomer] = await query(
      `INSERT INTO engine.customers (google_sub, email, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET google_sub = $1, name = COALESCE(engine.customers.name, $3)
       RETURNING *`,
      [sub, email, name]
    );
    customer = newCustomer;
  } else if (!customer.google_sub) {
    await query(`UPDATE engine.customers SET google_sub = $1 WHERE id = $2`, [sub, customer.id]);
  }

  logger.info('Google OAuth login', { customerId: customer.id, email });
  return customer;
}
