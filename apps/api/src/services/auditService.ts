import { PoolClient } from 'pg';
import { pool } from '../db/pool';

export interface AuditInput {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  ipAddress?: string | null;
  requestId?: string | null;
  details?: Record<string, unknown>;
}

export async function recordAudit(input: AuditInput, client?: PoolClient): Promise<void> {
  const db = client ?? pool;
  await db.query(
    `INSERT INTO audit_logs (actor_id, actor_role, action, resource_type, resource_id, ip_address, request_id, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      input.actorId ?? null,
      input.actorRole ?? null,
      input.action,
      input.resourceType,
      input.resourceId ?? null,
      input.ipAddress ?? null,
      input.requestId ?? null,
      JSON.stringify(input.details ?? {}),
    ]
  );
}
