"""ReBIT Financial Information (FI) types.

The full ReBIT spec defines 23 FI types across banking, investments, insurance and
taxes. v0.1 models DEPOSIT end to end and declares the rest so the surface is stable
before their parsers land in later milestones.
"""

from __future__ import annotations

FI_TYPES: tuple[str, ...] = (
    "DEPOSIT",
    "TERM_DEPOSIT",
    "RECURRING_DEPOSIT",
    "SIP",
    "CP",
    "GOVT_SECURITIES",
    "EQUITIES",
    "BONDS",
    "DEBENTURES",
    "MUTUAL_FUNDS",
    "ETF",
    "IDR",
    "CIS",
    "AIF",
    "INSURANCE_POLICIES",
    "NPS",
    "INVIT",
    "REIT",
    "GSTR",
    "OTHER",
)

# FI types with a full typed parser in v0.1.
SUPPORTED_FI_TYPES: tuple[str, ...] = ("DEPOSIT",)

_FI_TYPE_SET = frozenset(FI_TYPES)


def is_fi_type(value: str) -> bool:
    return value in _FI_TYPE_SET
