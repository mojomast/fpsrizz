/** Seeded PRNG (mulberry32). Gameplay randomness must come from here, never Math.random. */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  range(min: number, max: number): number;
  int(minInclusive: number, maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
  /** Independent stream derived from this seed and a name; does not advance this stream. */
  fork(name: string): Rng;
  readonly seed: number;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const rng: Rng = {
    seed: seed >>> 0,
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range: (min, max) => min + rng.next() * (max - min),
    int: (min, max) => Math.floor(min + rng.next() * (max - min)),
    pick: (items) => items[Math.floor(rng.next() * items.length)]!,
    fork: (name) => createRng((seed ^ hashString(name)) >>> 0),
  };
  return rng;
}
