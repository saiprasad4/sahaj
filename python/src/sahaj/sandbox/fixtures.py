"""Deterministic sandbox data. Given a VUA and a run seed, the same accounts and
transactions come out every time, so tests and demos are reproducible. Dates are
derived from a fixed epoch rather than the wall clock for the same reason.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from .rng import Rng, hash_seed

_SANDBOX_EPOCH = datetime(2026, 6, 1, 9, 30, 0, tzinfo=timezone.utc)


@dataclass(frozen=True)
class _SandboxFip:
    id: str
    name: str


_FIPS: tuple[_SandboxFip, ...] = (
    _SandboxFip("SBIN", "State Bank of India"),
    _SandboxFip("HDFC", "HDFC Bank"),
)

_CREDIT_NARRATIONS = ["Salary credit", "UPI/refund", "NEFT inward", "Interest paid", "IMPS from savings"]
_DEBIT_NARRATIONS = ["UPI/merchant", "Card purchase", "Rent payment", "Electricity bill", "SIP debit"]
_MODES = ["UPI", "NEFT", "IMPS", "CARD", "OTHERS"]


@dataclass(frozen=True)
class FixtureFipData:
    """The result of preparing one FIP's data in the sandbox session."""

    fip_id: str
    fip_name: str
    status: str
    payload: Optional[dict[str, Any]] = None


def _paise_to_rupee_string(paise: int) -> str:
    sign = "-" if paise < 0 else ""
    absolute = abs(paise)
    whole, fraction = divmod(absolute, 100)
    return f"{sign}{whole}.{fraction:02d}"


def _iso_at(day_offset: int) -> str:
    moment = _SANDBOX_EPOCH - timedelta(days=day_offset)
    return moment.isoformat().replace("+00:00", "Z")


def _build_deposit_payload(fip: _SandboxFip, rng: Rng) -> dict[str, Any]:
    transaction_count = rng.int(8, 14)
    balance_paise = rng.int(50_000, 400_000) * 100  # opening balance, whole rupees in paise

    transactions: list[dict[str, Any]] = []
    for index in range(transaction_count - 1, -1, -1):
        is_credit = rng.next() > 0.45
        amount_paise = rng.int(200, 60_000) * 100
        balance_paise += amount_paise if is_credit else -amount_paise
        transactions.append(
            {
                "txnId": f"{fip.id}-TXN-{transaction_count - index:04d}",
                "type": "CREDIT" if is_credit else "DEBIT",
                "amount": _paise_to_rupee_string(amount_paise),
                "currentBalance": _paise_to_rupee_string(balance_paise),
                "valueDate": _iso_at(index)[:10],
                "transactionTimestamp": _iso_at(index),
                "narration": rng.pick(_CREDIT_NARRATIONS if is_credit else _DEBIT_NARRATIONS),
                "mode": rng.pick(_MODES),
                "reference": f"{fip.id}{rng.int(100000, 999999)}",
            }
        )

    return {
        "Account": {
            "maskedAccNumber": f"XXXXXX{rng.int(1000, 9999)}",
            "linkedAccRef": f"{fip.id}-{rng.int(10000000, 99999999)}",
            "Profile": {
                "Holders": {
                    "Holder": [
                        {
                            "name": rng.pick(["Aarav Sharma", "Diya Nair", "Vivaan Rao", "Ananya Iyer"]),
                            "mobile": "9999999999",
                            "pan": "ABCDE1234F",
                        }
                    ]
                }
            },
            "Summary": {
                "currentBalance": _paise_to_rupee_string(balance_paise),
                "currency": "INR",
                "balanceDateTime": _iso_at(0),
                "type": rng.pick(["SAVINGS", "CURRENT"]),
                "status": "ACTIVE",
                "branch": rng.pick(["Koramangala", "Andheri East", "Salt Lake", "T Nagar"]),
                "ifscCode": f"{fip.id}0001234",
            },
            "Transactions": {"Transaction": transactions},
        }
    }


def build_deposit_fixtures(mobile: str, scenario: str, seed: int) -> list[FixtureFipData]:
    """Build the per-FIP deposit data for a scenario.

    Only ``healthy`` and ``partial`` produce delivered data here. The earlier
    failure scenarios are decided by the consent and session state machine before
    fetch ever reaches fixtures.
    """
    rng = Rng(hash_seed(f"{mobile}:{seed}"))
    primary_fip, secondary_fip = _FIPS

    if scenario == "partial":
        return [
            FixtureFipData(primary_fip.id, primary_fip.name, "DELIVERED", _build_deposit_payload(primary_fip, rng)),
            FixtureFipData(secondary_fip.id, secondary_fip.name, "FAILED"),
        ]

    return [
        FixtureFipData(fip.id, fip.name, "DELIVERED", _build_deposit_payload(fip, rng)) for fip in _FIPS
    ]
