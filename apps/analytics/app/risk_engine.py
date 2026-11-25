"""
Risk Analytics & Velocity Engine (Assessment 06).
Produces decision-support risk scores using synthetic behavioral signals.
IMPORTANT: Risk scores are decision support for operations analysts, NOT proof of fraud.
"""
from decimal import Decimal
from typing import List, Dict, Any

DECISION_SUPPORT_DISCLAIMER = (
    "Risk scores are decision support indicators for human operations review and do not constitute proof of fraud."
)


def evaluate_transaction_risk(
    amount: Decimal,
    tx_count_1h: int,
    tx_count_24h: int,
    volume_24h: Decimal,
    avg_tx_amount: Decimal,
    is_new_beneficiary: bool = False,
) -> Dict[str, Any]:
    """Compute explainable risk score (0-100) and contributing factors."""
    score = Decimal("0.00")
    factors: List[Dict[str, Any]] = []

    # 1. Velocity: rapid transactions in 1 hour
    if tx_count_1h >= 10:
        score += Decimal("35.00")
        factors.append({"rule": "high_velocity_1h", "weight": 35, "detail": f"{tx_count_1h} transactions in 1h"})
    elif tx_count_1h >= 5:
        score += Decimal("20.00")
        factors.append({"rule": "elevated_velocity_1h", "weight": 20, "detail": f"{tx_count_1h} transactions in 1h"})

    # 2. Daily velocity
    if tx_count_24h >= 25:
        score += Decimal("15.00")
        factors.append({"rule": "high_velocity_24h", "weight": 15, "detail": f"{tx_count_24h} transactions in 24h"})

    # 3. Amount spike relative to customer baseline
    if avg_tx_amount > Decimal("0") and amount >= avg_tx_amount * Decimal("5"):
        score += Decimal("25.00")
        factors.append({
            "rule": "amount_spike_5x",
            "weight": 25,
            "detail": f"Amount {amount} is >= 5x baseline avg {avg_tx_amount}",
        })
    elif amount >= Decimal("5000.00"):
        score += Decimal("15.00")
        factors.append({"rule": "large_transfer_threshold", "weight": 15, "detail": f"Amount {amount} >= 5000.00"})

    # 4. New beneficiary + high value
    if is_new_beneficiary and amount >= Decimal("1000.00"):
        score += Decimal("20.00")
        factors.append({
            "rule": "new_beneficiary_high_value",
            "weight": 20,
            "detail": "First-time beneficiary transfer >= 1000.00",
        })

    # 5. Cumulative 24h volume
    if volume_24h + amount >= Decimal("15000.00"):
        score += Decimal("15.00")
        factors.append({
            "rule": "daily_volume_threshold",
            "weight": 15,
            "detail": f"Projected 24h volume {volume_24h + amount} >= 15000.00",
        })

    capped_score = min(Decimal("100.00"), score)

    if capped_score >= Decimal("75.00"):
        severity = "critical"
    elif capped_score >= Decimal("50.00"):
        severity = "high"
    elif capped_score >= Decimal("25.00"):
        severity = "medium"
    else:
        severity = "low"

    return {
        "risk_score": float(capped_score),
        "severity": severity,
        "should_flag": capped_score >= Decimal("50.00"),
        "factors": factors,
        "disclaimer": DECISION_SUPPORT_DISCLAIMER,
    }


def build_operations_report(alerts: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Aggregate risk alerts for operations analyst reporting."""
    by_severity: Dict[str, int] = {"low": 0, "medium": 0, "high": 0, "critical": 0}
    by_status: Dict[str, int] = {}
    total_score = Decimal("0")

    for alert in alerts:
        sev = str(alert.get("severity", "low"))
        st = str(alert.get("status", "open"))
        by_severity[sev] = by_severity.get(sev, 0) + 1
        by_status[st] = by_status.get(st, 0) + 1
        total_score += Decimal(str(alert.get("risk_score", 0)))

    count = len(alerts)
    avg_score = round(float(total_score / count), 2) if count > 0 else 0.0

    return {
        "total_alerts": count,
        "average_risk_score": avg_score,
        "by_severity": by_severity,
        "by_status": by_status,
        "disclaimer": DECISION_SUPPORT_DISCLAIMER,
    }
