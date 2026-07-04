import { describe, it, expect } from 'vitest';
import {
  CHARACTERS,
  STARTER_IDS,
  characterById,
  charactersForMap,
  buildPerkPools,
} from './characters';
import { PERKS, SLOT3_POOL, SLOT4_POOL } from './perks';

const POOL_IDS = new Set([...SLOT3_POOL, ...SLOT4_POOL]);

describe('character roster', () => {
  it('has exactly 23 characters: 5 starters + 6 per map', () => {
    expect(CHARACTERS).toHaveLength(23);
    expect(charactersForMap(0)).toHaveLength(5);
    expect(charactersForMap(1)).toHaveLength(6);
    expect(charactersForMap(2)).toHaveLength(6);
    expect(charactersForMap(3)).toHaveLength(6);
    expect(STARTER_IDS).toHaveLength(5);
  });

  it('has unique ids and names', () => {
    expect(new Set(CHARACTERS.map((c) => c.id)).size).toBe(23);
    expect(new Set(CHARACTERS.map((c) => c.name)).size).toBe(23);
  });

  it('every character owns 1-3 valid pool perks with no duplicates', () => {
    for (const c of CHARACTERS) {
      expect(c.perkIds.length, c.id).toBeGreaterThanOrEqual(1);
      expect(c.perkIds.length, c.id).toBeLessThanOrEqual(3);
      expect(new Set(c.perkIds).size, c.id).toBe(c.perkIds.length);
      for (const id of c.perkIds) {
        expect(POOL_IDS.has(id), `${c.id} owns non-pool perk ${id}`).toBe(true);
        expect(PERKS[id], `${c.id} owns unknown perk ${id}`).toBeDefined();
      }
    }
  });

  it('starters and map 1 own 1 perk; map 2 owns 2; map 3 owns 3', () => {
    for (const c of charactersForMap(0)) expect(c.perkIds, c.id).toHaveLength(1);
    for (const c of charactersForMap(1)) expect(c.perkIds, c.id).toHaveLength(1);
    for (const c of charactersForMap(2)) expect(c.perkIds, c.id).toHaveLength(2);
    for (const c of charactersForMap(3)) expect(c.perkIds, c.id).toHaveLength(3);
  });

  it('every pool perk has exactly one primary owner and full-roster union covers the catalog', () => {
    // Primary ownership: starters/map1/map2 perks + map 3 first-listed
    // signatures. Borrowed perks are the map 3 non-signature slots.
    const primaryCount = new Map<number, number>();
    for (const c of CHARACTERS) {
      const primaries =
        c.homeMap === 3 ? c.perkIds.filter((id) => !isBorrowed(id)) : c.perkIds;
      for (const id of primaries) primaryCount.set(id, (primaryCount.get(id) ?? 0) + 1);
    }
    for (const id of POOL_IDS) {
      expect(primaryCount.get(id), `perk ${id} primary owners`).toBe(1);
    }
    // Recruiting everyone yields the full 30-perk catalog.
    const union = buildPerkPools(CHARACTERS.map((c) => c.id));
    expect([...union.slot3].sort((a, b) => a - b)).toEqual([...SLOT3_POOL].sort((a, b) => a - b));
    expect([...union.slot4].sort((a, b) => a - b)).toEqual([...SLOT4_POOL].sort((a, b) => a - b));
  });

  it('map 2 and map 3 characters cover both slot pools', () => {
    const s3 = new Set(SLOT3_POOL);
    const s4 = new Set(SLOT4_POOL);
    for (const c of [...charactersForMap(2), ...charactersForMap(3)]) {
      expect(c.perkIds.some((id) => s3.has(id)), `${c.id} has no slot-3 perk`).toBe(true);
      expect(c.perkIds.some((id) => s4.has(id)), `${c.id} has no slot-4 perk`).toBe(true);
    }
  });

  it('characterById returns the character or throws', () => {
    expect(characterById('bitzy').name).toBe('Bitzy');
    expect(() => characterById('nope')).toThrow(/Unknown character/);
  });

  it('buildPerkPools dedups and splits by pool membership', () => {
    // gamba borrows swipe's Data Grab (38) — union must contain it once.
    const pools = buildPerkPools(['swipe', 'gamba']);
    const all = [...pools.slot3, ...pools.slot4];
    expect(all.filter((id) => id === 38)).toHaveLength(1);
    expect(pools.slot3).toEqual([22]); // gamba's Stealth Mode
    expect([...pools.slot4].sort((a, b) => a - b)).toEqual([37, 38]);
  });

  it('a starters-only team still yields at least one perk overall', () => {
    const pools = buildPerkPools(['bitzy', 'cache', 'momo']); // all slot-3 signatures
    expect(pools.slot3.length + pools.slot4.length).toBeGreaterThan(0);
  });
});

/** Map 3 borrowed slots: every perk also primarily owned by an earlier map's character. */
function isBorrowed(perkId: number): boolean {
  return CHARACTERS.some((c) => c.homeMap < 3 && c.perkIds.includes(perkId));
}
