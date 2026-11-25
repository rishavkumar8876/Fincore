import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: {
        id: string;
        email: string;
        role: UserRole;
      };
    }
  }
}

export type UserRole =
  | 'customer'
  | 'support_agent'
  | 'operations_analyst'
  | 'finance_admin'
  | 'platform_admin';

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.header('x-request-id');
  const requestId = incomingId && incomingId.length <= 64 ? incomingId : uuidv4();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const startedAt = Date.now();
  res.on('finish', () => {
    logger.info('http_request', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      actorId: req.user?.id,
    });
  });

  next();
}
