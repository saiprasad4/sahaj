/**
 * A tiny deterministic PRNG so sandbox fixtures are reproducible. Seeded from the
 * VUA plus an optional run seed, never from wall-clock or Math.random, so the same
 * inputs always produce the same accounts and transactions across machines and CI.
 */

/** FNV-1a 32-bit hash, used to turn a string seed into a numeric one. */
export function hashSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface Rng {
  next(): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
}

/** mulberry32: fast, deterministic, good enough for fixtures (not for crypto). */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(minInclusive, maxInclusive) {
      return minInclusive + Math.floor(next() * (maxInclusive - minInclusive + 1));
    },
    pick(items) {
      if (items.length === 0) {
        throw new Error('cannot pick from an empty list');
      }
      return items[this.int(0, items.length - 1)] as (typeof items)[number];
    },
  };
}
