"""FastAPI Application for FinCore Financial Calculations & Risk Analytics."""
from typing import List, Optional, Literal
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.finance_math import (
    to_decimal,
    calculate_transfer_fee,
    calculate_daily_interest,
    calculate_statement_summary,
    reconcile_settlement_batch,
)
from app.risk_engine import evaluate_transaction_risk, build_operations_report

app = FastAPI(
    title="FinCore Analytics & Financial Math Service",
    version="1.0.0",
    description="Decimal-exact financial calculations and decision-support risk analytics.",
)


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "VALIDATION_ERROR", "message": str(exc)}},
    )


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "fincore-analytics"}


@app.get("/ready")
async def ready() -> dict:
    return {"status": "ready", "service": "fincore-analytics"}


class FeeRequest(BaseModel):
    amount: str = Field(..., description="Monetary amount as decimal string")
    rate_bps: int = Field(50, ge=0, le=5000)
    fixed_fee: str = "0.25"
    min_fee: str = "0.25"
    max_fee: str = "25.00"


@app.post("/api/v1/calc/fee")
async def api_calc_fee(req: FeeRequest) -> dict:
    return calculate_transfer_fee(
        amount=to_decimal(req.amount),
        rate_bps=req.rate_bps,
        fixed_fee=to_decimal(req.fixed_fee),
        min_fee=to_decimal(req.min_fee),
        max_fee=to_decimal(req.max_fee),
    )


class InterestRequest(BaseModel):
    principal: str
    annual_rate_pct: str
    days: int = Field(..., ge=0, le=3660)
    compound: bool = False


@app.post("/api/v1/calc/interest")
async def api_calc_interest(req: InterestRequest) -> dict:
    return calculate_daily_interest(
        principal=to_decimal(req.principal),
        annual_rate_pct=to_decimal(req.annual_rate_pct),
        days=req.days,
        compound=req.compound,
    )


class StatementEntry(BaseModel):
    entry_type: Literal["DEBIT", "CREDIT"]
    amount: str


class StatementRequest(BaseModel):
    opening_balance: str
    entries: List[StatementEntry]


@app.post("/api/v1/calc/statement")
async def api_calc_statement(req: StatementRequest) -> dict:
    return calculate_statement_summary(
        opening_balance=to_decimal(req.opening_balance),
        entries=[e.model_dump() for e in req.entries],
    )


class SettlementItem(BaseModel):
    provider_intent_id: str
    amount: str


class ReconcileRequest(BaseModel):
    expected_items: List[SettlementItem]
    settled_items: List[SettlementItem]
    tolerance: str = "0.00"


@app.post("/api/v1/calc/reconcile")
async def api_reconcile(req: ReconcileRequest) -> dict:
    return reconcile_settlement_batch(
        expected_items=[i.model_dump() for i in req.expected_items],
        settled_items=[i.model_dump() for i in req.settled_items],
        tolerance=to_decimal(req.tolerance),
    )


class RiskScoreRequest(BaseModel):
    amount: str
    tx_count_1h: int = Field(0, ge=0)
    tx_count_24h: int = Field(0, ge=0)
    volume_24h: str = "0.00"
    avg_tx_amount: str = "0.00"
    is_new_beneficiary: bool = False


@app.post("/api/v1/risk/score")
async def api_risk_score(req: RiskScoreRequest) -> dict:
    amt = to_decimal(req.amount)
    if amt <= 0:
        raise HTTPException(status_code=422, detail="Amount must be positive")
    return evaluate_transaction_risk(
        amount=amt,
        tx_count_1h=req.tx_count_1h,
        tx_count_24h=req.tx_count_24h,
        volume_24h=to_decimal(req.volume_24h),
        avg_tx_amount=to_decimal(req.avg_tx_amount),
        is_new_beneficiary=req.is_new_beneficiary,
    )


class AlertSummaryItem(BaseModel):
    severity: Literal["low", "medium", "high", "critical"]
    status: str
    risk_score: float = Field(..., ge=0, le=100)


class RiskReportRequest(BaseModel):
    alerts: List[AlertSummaryItem]


@app.post("/api/v1/risk/report")
async def api_risk_report(req: RiskReportRequest) -> dict:
    return build_operations_report([a.model_dump() for a in req.alerts])
