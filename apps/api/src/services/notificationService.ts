import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/pool';
import { logger } from '../utils/logger';

export async function sendSandboxNotification(params: {
  userId?: string;
  channel: 'email_sandbox' | 'sms_sandbox';
  recipient: string;
  subject?: string;
  body: string;
}): Promise<{ id: string; providerMessageId: string }> {
  const providerMessageId = `sim_${params.channel}_${uuidv4().slice(0, 12)}`;
  const res = await pool.query(
    `INSERT INTO notifications (user_id, channel, recipient, subject, body, status, provider_message_id)
     VALUES ($1, $2, $3, $4, $5, 'sent', $6)
     RETURNING id`,
    [params.userId ?? null, params.channel, params.recipient, params.subject ?? null, params.body, providerMessageId]
  );
  logger.info('sandbox_notification_dispatched', {
    channel: params.channel,
    providerMessageId,
    userId: params.userId,
  });
  return { id: res.rows[0].id, providerMessageId };
}
