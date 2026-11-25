import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1).default('postgresql://fincore_app:replace_with_local_dev_password@localhost:5432/fincore_db'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(16).default('dev_access_secret_change_in_prod_32chars'),
  JWT_REFRESH_SECRET: z.string().min(16).default('dev_refresh_secret_change_in_prod_32chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  REAUTH_SECRET: z.string().min(16).default('dev_reauth_secret_change_in_prod_32chars'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  ANALYTICS_SERVICE_URL: z.string().default('http://localhost:8000'),
  SANDBOX_PAYMENT_WEBHOOK_SECRET: z.string().default('whsec_sandbox_test_secret'),
});

export const env = envSchema.parse(process.env);
