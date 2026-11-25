import { app } from './app';
import { env } from './config/env';
import { pool } from './db/pool';
import { logger } from './utils/logger';

const server = app.listen(env.API_PORT, () => {
  logger.info(`FinCore API listening on port ${env.API_PORT}`, { env: env.NODE_ENV });
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  server.close(async () => {
    await pool.end();
    logger.info('HTTP server and PostgreSQL pool closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
