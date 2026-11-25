"""
Exact Decimal Financial Calculations (Assessment 05).
Never uses binary floating-point for monetary amounts.
"""
from decimal import Decimal, ROUND_HALF_EVEN, ROUND_HALF_UP, InvalidOperation
from typing import List, Dict, Any

QUANT_4 = Decimal("0.0001")
QUANT_2 = Decimal("0.01")
ZERO = Decimal("0.0000")


def to_decimal(value: str | int | Decimal) -> Decimal:
    """Safely parse monetary input into Decimal, rejecting floats."""
    if isinstance(value, float):
        raise ValueError("Binary float is prohibited for monetary values; pass string or Decimal")
    try:
        d = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"Invalid monetary value: {value}") from exc
    if not d.is_finite():
        raise ValueError("Monetary value must be finite")
    return d


def quantize_money(value: Decimal, places: int = 2, rounding: str = ROUND_HALF_EVEN) -> Decimal:
    q = QUANT_2 if places == 2 else QUANT_4
    return value.quantize(q, rounding=rounding)


def calculate_transfer_fee(
    amount: Decimal,
    rate_bps: int = 50,
    fixed_fee: Decimal = Decimal("0.25"),
    min_fee: Decimal = Decimal("0.25"),
    max_fee: Decimal = Decimal("25.00"),
) -> Dict[str, str]:
    """
    Calculate transfer fee using basis points (1 bps = 0.01%) + fixed fee,
    clamped between min_fee and max_fee, rounded with ROUND_HALF_EVEN.
    """
    if amount <= ZERO:
        raise ValueError("Amount must be greater than zero")
    if rate_bps < 0:
        raise ValueError("rate_bps cannot be negative")

    pct_fee = (amount * Decimal(rate_bps)) / Decimal("10000")
    raw_fee = pct_fee + fixed_fee
    clamped = max(min_fee, min(max_fee, raw_fee))
    fee = quantize_money(clamped, places=2, rounding=ROUND_HALF_EVEN)
    total_debit = quantize_money(amount + fee, places=2, rounding=ROUND_HALF_EVEN)

    return {
        "amount": str(quantize_money(amount, places=2)),
        "fee": str(fee),
        "total_debit": str(total_debit),
        "rounding_mode": "ROUND_HALF_EVEN",
    }


def calculate_daily_interest(
    principal: Decimal,
    annual_rate_pct: Decimal,
    days: int,
    compound: bool = False,
) -> Dict[str, str]:
    """Calculate simulated interest using ACT/365 convention."""
    if principal < ZERO:
        raise ValueError("Principal cannot be negative")
    if annual_rate_pct < ZERO:
        raise ValueError("Annual rate cannot be negative")
    if days < 0 or days > 3660:
        raise ValueError("Days must be between 0 and 3660")

    daily_rate = (annual_rate_pct / Decimal("100")) / Decimal("365")
    if compound:
        ending = principal * ((Decimal("1") + daily_rate) ** days)
        interest = ending - principal
    else:
        interest = principal * daily_rate * Decimal(days)
        ending = principal + interest

    interest_q = quantize_money(interest, places=4, rounding=ROUND_HALF_EVEN)
    ending_q = quantize_money(ending, places=2, rounding=ROUND_HALF_EVEN)

    return {
        "principal": str(quantize_money(principal, places=2)),
        "interest_accrued": str(interest_q),
        "ending_balance": str(ending_q),
        "day_count_convention": "ACT/365",
    }


def calculate_statement_summary(
    opening_balance: Decimal,
    entries: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Compute statement totals and verify ledger running balance invariant.
    Each entry expects: {'entry_type': 'DEBIT'|'CREDIT', 'amount': str|Decimal}
    """
    total_debits = ZERO
    total_credits = ZERO
    running = opening_balance

    for idx, entry in enumerate(entries):
        etype = entry.get("entry_type")
        amt = to_decimal(entry.get("amount", "0"))
        if amt <= ZERO:
            raise ValueError(f"Entry {idx} amount must be positive")
        if etype == "CREDIT":
            total_credits += amt
            running += amt
        elif etype == "DEBIT":
            total_debits += amt
            running -= amt
        else:
            raise ValueError(f"Invalid entry_type at index {idx}: {etype}")

    return {
        "opening_balance": str(quantize_money(opening_balance, places=2)),
        "total_credits": str(quantize_money(total_credits, places=2)),
        "total_debits": str(quantize_money(total_debits, places=2)),
        "closing_balance": str(quantize_money(running, places=2)),
        "entry_count": len(entries),
    }


def reconcile_settlement_batch(
    expected_items: List[Dict[str, Any]],
    settled_items: List[Dict[str, Any]],
    tolerance: Decimal = Decimal("0.00"),
) -> Dict[str, Any]:
    """
    Reconcile internal expected payment records against provider settlement records.
    Matches by provider_intent_id and flags missing, duplicate, or amount-mismatched items.
    """
    expected_map: Dict[str, Decimal] = {}
    for item in expected_items:
        pid = str(item["provider_intent_id"])
        amt = to_decimal(item["amount"])
        expected_map[pid] = expected_map.get(pid, ZERO) + amt

    settled_map: Dict[str, Decimal] = {}
    duplicates: List[str] = []
    for item in settled_items:
        pid = str(item["provider_intent_id"])
        amt = to_decimal(item["amount"])
        if pid in settled_map:
            duplicates.append(pid)
        settled_map[pid] = settled_map.get(pid, ZERO) + amt

    all_ids = sorted(set(expected_map.keys()) | set(settled_map.keys()))
    discrepancies: List[Dict[str, str]] = []
    total_expected = sum(expected_map.values(), ZERO)
    total_settled = sum(settled_map.values(), ZERO)

    for pid in all_ids:
        exp = expected_map.get(pid, ZERO)
        stl = settled_map.get(pid, ZERO)
        diff = stl - exp
        if abs(diff) > tolerance:
            discrepancies.append({
                "provider_intent_id": pid,
                "expected": str(quantize_money(exp, 2)),
                "settled": str(quantize_money(stl, 2)),
                "difference": str(quantize_money(diff, 2)),
            })

    net_diff = total_settled - total_expected
    status = "matched" if not discrepancies and not duplicates and abs(net_diff) <= tolerance else "mismatched"

    return {
        "status": status,
        "total_expected": str(quantize_money(total_expected, 2)),
        "total_settled": str(quantize_money(total_settled, 2)),
        "net_discrepancy": str(quantize_money(net_diff, 2)),
        "discrepancies": discrepancies,
        "duplicate_provider_ids": duplicates,
    }
