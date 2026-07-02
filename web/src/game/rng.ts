// RNG abstraction. Single-player only needs plausibly-random behavior (no server
// determinism constraint), but a seedable RNG makes the Vitest parity suite
// reproducible. Mirrors the two Random methods the Dart engine uses.

export interface RNG {
  /** Integer in [0, max). Matches Dart's Random.nextInt(max). */
  nextInt(max: number): number;
  /** Double in [0, 1). Matches Dart's Random.nextDouble(). */
  nextDouble(): number;
}

export class MathRandomRNG implements RNG {
  nextInt(max: number): number {
    return Math.floor(Math.random() * max);
  }
  nextDouble(): number {
    return Math.random();
  }
}

/** Deterministic mulberry32 RNG for tests. */
export class SeededRNG implements RNG {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  private next(): number {
    // mulberry32
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }
  nextDouble(): number {
    return this.next();
  }
}
