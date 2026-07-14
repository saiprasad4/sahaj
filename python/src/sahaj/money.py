"""Money is carried as an integer number of paise everywhere in sahaj, the same
money-safe convention as the TypeScript package. ReBIT amounts arrive as decimal
rupee strings, so we parse them without ever touching a float.
"""

from __future__ import annotations

import re

from .errors import SahajError

_RUPEE_AMOUNT = re.compile(r"^(-?)(\d+)(?:\.(\d{1,2}))?$")


def rupees_to_paise(amount: str) -> int:
    """Parse a ReBIT decimal rupee string ("152340.75") into integer paise (15234075)."""
    match = _RUPEE_AMOUNT.match(amount.strip())
    if not match:
        raise SahajError("SCHEMA_PARSE_FAILED", field="amount")
    sign, whole_rupees, fractional_digits = match.groups()
    paise = int(whole_rupees) * 100 + int((fractional_digits or "").ljust(2, "0"))
    return -paise if sign == "-" else paise


def format_paise(paise: int) -> str:
    """Format integer paise as an Indian-grouped rupee string ("₹1,52,340.75"). Display only."""
    sign = "-" if paise < 0 else ""
    absolute = abs(paise)
    rupees, fraction = divmod(absolute, 100)
    return f"{sign}₹{_group_indian(rupees)}.{fraction:02d}"


def _group_indian(rupees: int) -> str:
    digits = str(rupees)
    if len(digits) <= 3:
        return digits
    head, tail = digits[:-3], digits[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    return f"{','.join(groups)},{tail}"
