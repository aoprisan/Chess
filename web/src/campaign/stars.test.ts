import { describe, it, expect } from 'vitest';
import { starsForBattle } from './balance';

describe('starsForBattle', () => {
  it('gives 3 stars for a flawless win', () => {
    expect(starsForBattle(true, 0)).toBe(3);
  });
  it('gives 2 stars when the rival took one lane', () => {
    expect(starsForBattle(true, 1)).toBe(2);
  });
  it('gives 1 star for any scrappier win', () => {
    expect(starsForBattle(true, 2)).toBe(1);
  });
  it('gives 0 stars for a loss regardless of lanes', () => {
    expect(starsForBattle(false, 0)).toBe(0);
    expect(starsForBattle(false, 2)).toBe(0);
  });
});
