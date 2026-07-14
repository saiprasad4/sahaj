"""A tiny deterministic PRNG so sandbox fixtures are reproducible. Seeded from the
VUA plus an optional run seed, never from the wall clock or a global random source,
so the same inputs always produce the same accounts and transactions.
"""

from __future__ import annotations

from typing import Sequence, TypeVar

_MASK = 0xFFFFFFFF
T = TypeVar("T")


def hash_seed(text: str) -> int:
    """FNV-1a 32-bit hash, used to turn a string seed into a numeric one."""
    value = 0x811C9DC5
    for char in text:
        value ^= ord(char)
        value = (value * 0x01000193) & _MASK
    return value


class Rng:
    """mulberry32: fast, deterministic, good enough for fixtures (not for crypto)."""

    def __init__(self, seed: int) -> None:
        self._state = seed & _MASK

    def next(self) -> float:
        self._state = (self._state + 0x6D2B79F5) & _MASK
        mixed = self._state
        mixed = ((mixed ^ (mixed >> 15)) * (mixed | 1)) & _MASK
        mixed ^= (mixed + (((mixed ^ (mixed >> 7)) * (mixed | 61)) & _MASK)) & _MASK
        mixed &= _MASK
        return ((mixed ^ (mixed >> 14)) & _MASK) / 4294967296

    def int(self, min_inclusive: int, max_inclusive: int) -> int:
        return min_inclusive + int(self.next() * (max_inclusive - min_inclusive + 1))

    def pick(self, items: Sequence[T]) -> T:
        if not items:
            raise ValueError("cannot pick from an empty list")
        return items[self.int(0, len(items) - 1)]
