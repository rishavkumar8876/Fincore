import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface RiskEvaluationResult {
  risk_score: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  should_flag: boolean;
  factors: Array<{ rule: string; weight: number; detail: string }>;
  disclaimer: string;
}

export async function evaluateRiskWithAnalytics(payload: {
  amount: string;
  tx_count_1h: number;
  tx_count_24h: number;
  volume_24h: string;
  avg_tx_amount: string;
  is_new_beneficiary: boolean;
}): Promise<RiskEvaluationResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(`${env.ANALYTICS_SERVICE_URL}/api/v1/risk/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Analytics service returned ${res.status}`);
    }
    return (await res.json()) as RiskEvaluationResult;
  } catch (err) {
    logger.warn('analytics_service_unavailable_fallback', {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      risk_score: 0,
      severity: 'low',
      should_flag: false,
      factors: [],
      disclaimer: 'Analytics service unavailable; fallback decision-support score applied.',
    };
  } finally {
    clearTimeout(timeout);
  }
}
