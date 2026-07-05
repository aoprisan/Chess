import { describe, expect, it } from 'vitest';
import { qrMatrix, _internals } from './qrcode';

describe('qrcode', () => {
  it('computes Reed-Solomon EC codewords for the canonical v1-M vector', () => {
    // The well-known "HELLO WORLD" version-1-M data codewords and their
    // expected 10 error-correction codewords (Thonky QR tutorial vector).
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    const ec = _internals.ecCodewords(data, 10);
    expect(ec).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it('picks the smallest version that fits the payload', () => {
    expect(_internals.encode('1').version).toBe(1); // 1 byte -> v1
    expect(_internals.encode('x'.repeat(14)).version).toBe(1); // v1 caps at 14 bytes
    expect(_internals.encode('x'.repeat(15)).version).toBe(2);
    expect(_internals.encode('https://aoprisan.github.io/Chess/').version).toBe(3);
  });

  it('throws when the payload exceeds the supported range', () => {
    expect(() => _internals.encode('x'.repeat(300))).toThrow();
  });

  it('produces a square matrix of the right size with intact finder patterns', () => {
    const m = qrMatrix('https://aoprisan.github.io/Chess/');
    const size = m.length;
    expect(size).toBe(29); // version 3 -> 4*3 + 17
    m.forEach((row) => expect(row.length).toBe(size));

    // Finder patterns: a dark 7x7 frame with a dark 3x3 centre at each of the
    // three corners.
    const finderOK = (r0: number, c0: number) => {
      for (let r = 0; r < 7; r++)
        for (let c = 0; c < 7; c++) {
          const onFrame = r === 0 || r === 6 || c === 0 || c === 6;
          const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          const expected = onFrame || inCore;
          if (m[r0 + r][c0 + c] !== expected) return false;
        }
      return true;
    };
    expect(finderOK(0, 0)).toBe(true);
    expect(finderOK(0, size - 7)).toBe(true);
    expect(finderOK(size - 7, 0)).toBe(true);

    // Fixed dark module.
    expect(m[size - 8][8]).toBe(true);

    // Timing pattern along row 6 alternates between the finders.
    for (let c = 8; c < size - 8; c++) expect(m[6][c]).toBe(c % 2 === 0);
  });

  it('is deterministic', () => {
    const a = qrMatrix('https://aoprisan.github.io/Chess/');
    const b = qrMatrix('https://aoprisan.github.io/Chess/');
    expect(a).toEqual(b);
  });
});
