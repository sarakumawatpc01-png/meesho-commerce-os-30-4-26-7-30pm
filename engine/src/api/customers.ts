import { Router } from 'express';
import { query, queryOne } from '../db/client';
import { requireCustomer } from '../middleware/auth';

const router = Router();

// GET /api/customers/me — customer profile
router.get('/me', requireCustomer, async (req: any, res) => {
  const customer = await queryOne<any>(
    `SELECT id, name, phone, email, created_at FROM engine.customers WHERE id = $1`,
    [req.customer.id]
  );
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const addresses = await query(
    `SELECT * FROM engine.customer_addresses WHERE customer_id = $1 ORDER BY is_default DESC`,
    [req.customer.id]
  );

  const walletRow = await queryOne<{ balance: string }>(
    `SELECT COALESCE(SUM(CASE WHEN type='credit' THEN amount ELSE -amount END),0) AS balance
     FROM engine.wallet_transactions WHERE customer_id = $1`,
    [req.customer.id]
  );

  res.json({
    customer: { ...customer, walletBalance: parseInt(walletRow?.balance || '0') },
    addresses,
  });
});

// PATCH /api/customers/me — update profile
router.patch('/me', requireCustomer, async (req: any, res) => {
  const { name, email } = req.body;
  const customer = await queryOne<any>(
    `UPDATE engine.customers
     SET name = COALESCE($1, name), email = COALESCE($2, email), updated_at = NOW()
     WHERE id = $3 RETURNING id, name, phone, email`,
    [name || null, email || null, req.customer.id]
  );
  res.json({ customer });
});

// GET /api/customers/addresses
router.get('/addresses', requireCustomer, async (req: any, res) => {
  const addresses = await query(
    `SELECT * FROM engine.customer_addresses WHERE customer_id = $1 ORDER BY is_default DESC, created_at DESC`,
    [req.customer.id]
  );
  res.json({ addresses });
});

// POST /api/customers/addresses — save new address
router.post('/addresses', requireCustomer, async (req: any, res) => {
  const {
    name, phone, address1, address2, city, state,
    pincode, country = 'India', isDefault = false,
  } = req.body;

  if (isDefault) {
    await query(
      `UPDATE engine.customer_addresses SET is_default = false WHERE customer_id = $1`,
      [req.customer.id]
    );
  }

  const address = await queryOne<any>(
    `INSERT INTO engine.customer_addresses
       (customer_id, full_name, phone, address1, address2, city, state, pincode, country, is_default)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [req.customer.id, name, phone, address1, address2 || null, city, state, pincode, country, isDefault]
  );
  res.json({ address });
});

// DELETE /api/customers/addresses/:id
router.delete('/addresses/:id', requireCustomer, async (req: any, res) => {
  await query(
    `DELETE FROM engine.customer_addresses WHERE id = $1 AND customer_id = $2`,
    [req.params.id, req.customer.id]
  );
  res.json({ success: true });
});

export default router;
