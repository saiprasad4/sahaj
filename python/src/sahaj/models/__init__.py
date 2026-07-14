"""Parsed financial-data models."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict

from ..errors import SahajError
from .deposit import (
    DepositAccount,
    DepositHolder,
    DepositSummary,
    DepositTransaction,
    parse_deposit_account,
)


class FipResult(BaseModel):
    """Outcome for a single FIP in a data session, so ``fetch`` can report partial data honestly."""

    model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True)

    fip_id: str
    fip_name: str
    status: str
    fi_types: list[str]
    error: Optional[SahajError] = None


class FinancialData(BaseModel):
    """The parsed result of one data session. v0.1 populates ``deposits``."""

    model_config = ConfigDict(frozen=True)

    consent_id: str
    session_id: str
    schema_version: str
    generated_at: str
    deposits: list[DepositAccount]
    fips: list[FipResult]


def total_deposit_balance_paise(data: FinancialData) -> int:
    """Sum of current balances across every delivered deposit account, in paise."""
    return sum(account.summary.current_balance_paise for account in data.deposits)


__all__ = [
    "DepositAccount",
    "DepositHolder",
    "DepositSummary",
    "DepositTransaction",
    "FinancialData",
    "FipResult",
    "parse_deposit_account",
    "total_deposit_balance_paise",
]
