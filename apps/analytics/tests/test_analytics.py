"""Automated tests for FinCore Analytics & Financial Math Service (Assessments 05 & 06)."""
from decimal import Decimal
import time
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.finance_math import to_decimal, calculate_transfer_fee

client = TestClient(app)


def test_health_and_ready():
    assert client.get("/health").status_code == 200
    assert client.get("/ready").status_code == 200


def test_decimal_rejects_float_and_avoids_binary_drift():
    with pytest.raises(ValueError, match="Binary float is prohibited"):
        to_decimal(0.1)

    # Classic float failure: 0.1 + 0.2 != 0.3 in binary float
    assert to_decimal("0.1") + to_decimal("0.2") == Decimal("0.3")


def test_fee_bankers_rounding_and_boundaries():
    # 0.50% of 100.00 = 0.50 + 0.25 = 0.75
    res = client.post("/api/v1/calc/fee", json={"amount": "100.00"})
    assert res.status_code == 200
    data = res.json()
    assert data["fee"] == "0.75"
    assert data["total_debit"] == "100.75"

    # Max cap boundary: 0.50% of 10000.00 = 50.00 -> capped at 25.00
    res_max = client.post("/api/v1/calc/fee", json={"amount": "10000.00"})
    assert res_max.status_code == 200
    assert res_max.json()["fee"] == "25.00"

    # Invalid negative amount
    res_bad = client.post("/api/v1/calc/fee", json={"amount": "-10.00"})
    assert res_bad.status_code == 422


def test_interest_and_statement_calculations():
    res = client.post(
        "/api/v1/calc/interest",
        json={"principal": "1000.00", "annual_rate_pct": "3.65", "days": 10, "compound": False},
    )
    assert res.status_code == 200
    # 1000 * 0.0365 / 365 * 10 = 1.0000
    assert res.json()["interest_accrued"] == "1.0000"
    assert res.json()["ending_balance"] == "1001.00"

    stmt = client.post(
        "/api/v1/calc/statement",
        json={
            "opening_balance": "500.00",
            "entries": [
                {"entry_type": "CREDIT", "amount": "250.50"},
                {"entry_type": "DEBIT", "amount": "100.25"},
            ],
        },
    )
    assert stmt.status_code == 200
    assert stmt.json()["closing_balance"] == "650.25"


def test_reconciliation_matched_and_mismatched():
    res = client.post(
        "/api/v1/calc/reconcile",
        json={
            "expected_items": [{"provider_intent_id": "pi_1", "amount": "100.00"}],
            "settled_items": [{"provider_intent_id": "pi_1", "amount": "95.00"}],
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "mismatched"
    assert body["net_discrepancy"] == "-5.00"
    assert len(body["discrepancies"]) == 1


def test_risk_scoring_and_decision_support_disclaimer():
    res = client.post(
        "/api/v1/risk/score",
        json={
            "amount": "6000.00",
            "tx_count_1h": 11,
            "tx_count_24h": 12,
            "volume_24h": "10000.00",
            "avg_tx_amount": "500.00",
            "is_new_beneficiary": True,
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["severity"] == "critical"
    assert data["should_flag"] is True
    assert "decision support" in data["disclaimer"].lower()


def test_risk_report_aggregation():
    res = client.post(
        "/api/v1/risk/report",
        json={
            "alerts": [
                {"severity": "high", "status": "open", "risk_score": 65.0},
                {"severity": "low", "status": "resolved_false_positive", "risk_score": 15.0},
            ]
        },
    )
    assert res.status_code == 200
    assert res.json()["total_alerts"] == 2
    assert res.json()["average_risk_score"] == 40.0


def test_decimal_fee_benchmark_1000_iterations():
    start = time.perf_counter()
    for _ in range(1000):
        calculate_transfer_fee(Decimal("1234.56"))
    elapsed = time.perf_counter() - start
    assert elapsed < 1.0
