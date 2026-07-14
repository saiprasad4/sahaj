"""Magic VUAs: the AA analogue of Stripe's 4242 card and Plaid's user_good.

The trailing digits of the sandbox mobile number select a deterministic scenario,
so every state (the happy path and each failure) is reproducible offline with no
licence, no registration and no real bank.
"""

from __future__ import annotations

_SCENARIO_BY_VUA: dict[str, str] = {
    "9999999999": "healthy",
    "9999999001": "reject",
    "9999999002": "no_accounts",
    "9999999003": "expire",
    "9999999004": "fip_down",
    "9999999005": "partial",
}


def resolve_scenario(mobile: str) -> str:
    """Resolve a sandbox mobile number to a scenario.

    Any number that is not a reserved magic VUA maps to the healthy happy path, so
    casual exploration just works while the specific numbers unlock the failures.
    """
    return _SCENARIO_BY_VUA.get(mobile, "healthy")


MAGIC_VUAS: tuple[tuple[str, str], ...] = tuple(_SCENARIO_BY_VUA.items())
