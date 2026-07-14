"""Typed DEPOSIT model, parsed from the ReBIT deposit FI schema.

The raw payload uses decimal rupee strings, mixed enum casing and nested
capitalised objects. We normalise all of that into a flat, typed pydantic model
with integer-paise money, and keep the original under ``raw`` as an escape hatch.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict

from ..errors import SahajError
from ..money import rupees_to_paise

_ACCOUNT_TYPES = {"SAVINGS", "CURRENT", "DEFAULT", "NRE", "NRO"}


class DepositTransaction(BaseModel):
    model_config = ConfigDict(frozen=True)

    txn_id: str
    type: str
    amount_paise: int
    balance_after_paise: int
    value_date: str
    transaction_timestamp: str
    narration: str
    mode: Optional[str] = None
    reference: Optional[str] = None


class DepositSummary(BaseModel):
    model_config = ConfigDict(frozen=True)

    current_balance_paise: int
    currency: str
    balance_date_time: str
    type: str
    status: str
    branch: Optional[str] = None
    ifsc: Optional[str] = None


class DepositHolder(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: str
    mobile: Optional[str] = None
    pan: Optional[str] = None
    dob: Optional[str] = None


class DepositAccount(BaseModel):
    model_config = ConfigDict(frozen=True)

    fi_type: str = "DEPOSIT"
    fip_id: str
    fip_name: str
    masked_account_number: str
    link_reference_number: str
    holders: list[DepositHolder]
    summary: DepositSummary
    transactions: list[DepositTransaction]
    raw: Any = None


def _normalize_account_type(value: str) -> str:
    upper = value.upper()
    return upper if upper in _ACCOUNT_TYPES else "DEFAULT"


def _normalize_account_status(value: str) -> str:
    upper = value.upper()
    return upper if upper in {"INACTIVE", "CLOSED"} else "ACTIVE"


def _normalize_transaction_type(value: str) -> str:
    return "DEBIT" if value.upper() == "DEBIT" else "CREDIT"


def parse_deposit_account(payload: dict[str, Any], fip_id: str, fip_name: str) -> DepositAccount:
    account = payload.get("Account") if isinstance(payload, dict) else None
    if not account or "Summary" not in account or "Transaction" not in account.get("Transactions", {}):
        raise SahajError("SCHEMA_PARSE_FAILED", fip_id=fip_id, field="Account")

    raw_summary = account["Summary"]
    summary = DepositSummary(
        current_balance_paise=rupees_to_paise(raw_summary["currentBalance"]),
        currency=raw_summary["currency"],
        balance_date_time=raw_summary["balanceDateTime"],
        type=_normalize_account_type(raw_summary["type"]),
        status=_normalize_account_status(raw_summary["status"]),
        branch=raw_summary.get("branch"),
        ifsc=raw_summary.get("ifscCode"),
    )

    transactions = [
        DepositTransaction(
            txn_id=txn["txnId"],
            type=_normalize_transaction_type(txn["type"]),
            amount_paise=rupees_to_paise(txn["amount"]),
            balance_after_paise=rupees_to_paise(txn["currentBalance"]),
            value_date=txn["valueDate"],
            transaction_timestamp=txn["transactionTimestamp"],
            narration=txn["narration"],
            mode=txn.get("mode"),
            reference=txn.get("reference"),
        )
        for txn in account["Transactions"]["Transaction"]
    ]

    holders = [
        DepositHolder(
            name=holder["name"],
            mobile=holder.get("mobile"),
            pan=holder.get("pan"),
            dob=holder.get("dob"),
        )
        for holder in account["Profile"]["Holders"]["Holder"]
    ]

    return DepositAccount(
        fip_id=fip_id,
        fip_name=fip_name,
        masked_account_number=account["maskedAccNumber"],
        link_reference_number=account["linkedAccRef"],
        holders=holders,
        summary=summary,
        transactions=transactions,
        raw=payload,
    )
