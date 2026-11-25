import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { pool } from './db/pool';
import { requestContext } from './middleware/requestContext';
import { authRouter } from './routes/auth.routes';
import { walletsRouter } from './routes/wallets.routes';
import { beneficiariesRouter } from './routes/beneficiaries.routes';
import { transfersRouter } from './routes/transfers.routes';
import { paymentsRouter } from './routes/payments.routes';
import { operationsRouter } from './routes/operations.routes';
import { errorHandler } from './utils/errors';

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(requestContext);

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'fincore-api', mode: 'simulated-sandbox' });
});

app.get('/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ready', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'not_ready', database: 'disconnected' });
  }
});

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/wallets', walletsRouter);
app.use('/api/v1/beneficiaries', beneficiariesRouter);
app.use('/api/v1/transfers', transfersRouter);
app.use('/api/v1/payments', paymentsRouter);
app.use('/api/v1/ops', operationsRouter);

app.use(errorHandler);
