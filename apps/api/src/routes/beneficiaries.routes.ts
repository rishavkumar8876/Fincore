import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { NotFoundError } from '../utils/errors';

export const beneficiariesRouter = Router();

beneficiariesRouter.use(requireAuth);

beneficiariesRouter.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM beneficiaries WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user!.id]
    );
    res.status(200).json({ data: result.rows });
  } catch (err) {
    next(err);
  }
});

beneficiariesRouter.post('/', async (req, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().min(2).max(150),
        accountNumber: z.string().min(4).max(32),
        bankCode: z.string().min(2).max(32).default('FINCORE'),
      })
      .parse(req.body);

    const result = await pool.query(
      `INSERT INTO beneficiaries (user_id, name, account_number, bank_code)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user!.id, body.name, body.accountNumber, body.bankCode]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

beneficiariesRouter.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `DELETE FROM beneficiaries WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user!.id]
    );
    if (result.rowCount === 0) throw new NotFoundError('Beneficiary not found');
    res.status(200).json({ data: { deleted: true, id: req.params.id } });
  } catch (err) {
    next(err);
  }
});
