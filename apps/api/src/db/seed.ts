import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { pool } from './pool';

export async function runSeed(): Promise<void> {
  const sysSeedPath = path.resolve(__dirname, '../../../../database/seeds/001_system_accounts.sql');
  const sysSql = fs.readFileSync(sysSeedPath, 'utf8');
  await pool.query(sysSql);

  const demoPasswordHash = await bcrypt.hash('FinCore!Demo2026', 10);

  const users = [
    { email: 'alice.customer@fincore.sim', name: 'Alice Carter', role: 'customer', acc: 'FC-1001-0001', bal: '2500.0000' },
    { email: 'bob.customer@fincore.sim', name: 'Bob Miller', role: 'customer', acc: 'FC-1001-0002', bal: '1200.0000' },
    { email: 'support@fincore.sim', name: 'Sam Support', role: 'support_agent', acc: null, bal: '0.0000' },
    { email: 'analyst@fincore.sim', name: 'Olivia Analyst', role: 'operations_analyst', acc: null, bal: '0.0000' },
    { email: 'finance@fincore.sim', name: 'Frank Finance', role: 'finance_admin', acc: null, bal: '0.0000' },
    { email: 'admin@fincore.sim', name: 'Ada Platform', role: 'platform_admin', acc: null, bal: '0.0000' },
  ];

  for (const u of users) {
    const res = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, mfa_enabled)
       VALUES ($1, $2, $3, $4, FALSE)
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
      [u.email, demoPasswordHash, u.name, u.role]
    );
    const userId = res.rows[0].id;

    if (u.acc) {
      await pool.query(
        `INSERT INTO accounts (user_id, account_number, account_type, currency, balance, available_balance, status)
         VALUES ($1, $2, 'wallet', 'USD', $3, $3, 'active')
         ON CONFLICT (account_number) DO NOTHING`,
        [userId, u.acc, u.bal]
      );
    }
  }

  console.log('Seeded synthetic FinCore users and wallets.');
}

if (require.main === module) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
