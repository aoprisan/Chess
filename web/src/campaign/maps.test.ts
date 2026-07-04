import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CampaignMapDef, CampaignMapJson, CampaignMapId } from './model';
import { CHARACTERS, charactersForMap } from '../game/characters';
import { WITHDRAW_THRESHOLD, MAX_NODE_RESPECT, JOIN_THRESHOLD } from './balance';

// Structural validation of the shipped campaign maps (from
// scripts/generate-city.mjs) against the Neon City spec numbers.

const SPEC: Record<CampaignMapId, { total: number; criticals: number; homeMap: 1 | 2 | 3 }> = {
  map_1: { total: 24, criticals: 6, homeMap: 1 },
  map_2: { total: 48, criticals: 12, homeMap: 2 },
  map_3: { total: 72, criticals: 18, homeMap: 3 },
};

function loadJson(id: string): CampaignMapJson {
  return JSON.parse(
    readFileSync(new URL(`../../public/assets/maps/${id}.json`, import.meta.url), 'utf-8'),
  ) as CampaignMapJson;
}

const maps = (Object.keys(SPEC) as CampaignMapId[]).map((id) => ({
  id,
  spec: SPEC[id],
  map: new CampaignMapDef(loadJson(id)),
}));
const allSystems = maps.flatMap(({ id, map }) =>
  map.systemNodes.map((n) => ({ mapId: id, node: n })),
);
const CHAR_IDS = new Set(CHARACTERS.map((c) => c.id));
const STARTER_SET = new Set(charactersForMap(0).map((c) => c.id));

describe.each(maps)('$id', ({ id, spec, map }) => {
  it('matches the spec node counts', () => {
    expect(map.id).toBe(id);
    expect(map.nodes).toHaveLength(spec.total);
    expect(map.criticalNodes).toHaveLength(spec.criticals);
    expect(map.nodes.filter((n) => n.kind === 'entry')).toHaveLength(1);
    expect(map.nodeById(map.entryNodeId).kind).toBe('entry');
  });

  it('has unique ids and symmetric connections', () => {
    expect(new Set(map.nodes.map((n) => n.id)).size).toBe(map.nodes.length);
    for (const node of map.nodes) {
      expect(node.connections.length).toBeGreaterThan(0);
      for (const other of node.connections) {
        expect(map.nodeById(other).connections).toContain(node.id);
        expect(other).not.toBe(node.id);
      }
    }
  });

  it('is fully connected from the entry node', () => {
    const seen = new Set([map.entryNodeId]);
    const queue = [map.entryNodeId];
    while (queue.length > 0) {
      for (const next of map.neighborsOf(queue.shift()!)) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    expect(seen.size).toBe(map.nodes.length);
  });

  it('system nodes have 1-6 unique known defenders; others have none', () => {
    for (const node of map.nodes) {
      if (node.kind === 'system') {
        expect(node.defenders.length, node.id).toBeGreaterThanOrEqual(1);
        expect(node.defenders.length, node.id).toBeLessThanOrEqual(6);
        expect(new Set(node.defenders).size).toBe(node.defenders.length);
        for (const d of node.defenders) {
          expect(CHAR_IDS.has(d), `${node.id} unknown defender ${d}`).toBe(true);
          expect(STARTER_SET.has(d), `${node.id} starter ${d} cannot defend`).toBe(false);
        }
        expect(['easy', 'medium', 'hard']).toContain(node.difficulty);
      } else {
        expect(node.defenders).toHaveLength(0);
        expect(node.critical).toBe(false);
      }
    }
  });

  it('only uses characters from this map or earlier', () => {
    const allowed = new Set(
      CHARACTERS.filter((c) => c.homeMap >= 1 && c.homeMap <= spec.homeMap).map((c) => c.id),
    );
    for (const node of map.systemNodes) {
      for (const d of node.defenders) expect(allowed.has(d), `${node.id}: ${d}`).toBe(true);
    }
  });

  it('every home character defends at least 3 nodes on its home map', () => {
    for (const c of charactersForMap(spec.homeMap)) {
      const count = map.systemNodes.filter((n) => n.defenders.includes(c.id)).length;
      expect(count, c.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('criticals alone cannot recruit the full home cast (balancing knob)', () => {
    // Best case: every critical on every map cleared with max respect.
    const critRespect = new Map<string, number>();
    for (const { node } of allSystems) {
      if (!node.critical) continue;
      for (const d of node.defenders) {
        critRespect.set(d, (critRespect.get(d) ?? 0) + MAX_NODE_RESPECT);
      }
    }
    const unjoined = charactersForMap(spec.homeMap).filter(
      (c) => (critRespect.get(c.id) ?? 0) < JOIN_THRESHOLD,
    );
    expect(unjoined.length, `map ${spec.homeMap} home cast`).toBeGreaterThanOrEqual(1);
  });
});

describe('cross-map invariants', () => {
  it('every defender can reach the withdraw threshold', () => {
    const nodeCount = new Map<string, number>();
    for (const { node } of allSystems) {
      for (const d of node.defenders) nodeCount.set(d, (nodeCount.get(d) ?? 0) + 1);
    }
    for (const c of CHARACTERS.filter((ch) => ch.homeMap >= 1)) {
      const attainable = (nodeCount.get(c.id) ?? 0) * MAX_NODE_RESPECT;
      expect(attainable, c.id).toBeGreaterThanOrEqual(WITHDRAW_THRESHOLD);
    }
  });

  it('maps 2-3 reuse characters from earlier maps (spec mode 2)', () => {
    for (const { id, map } of maps) {
      if (id === 'map_1') continue;
      const homeMap = SPEC[id].homeMap;
      const earlier = new Set(
        CHARACTERS.filter((c) => c.homeMap >= 1 && c.homeMap < homeMap).map((c) => c.id),
      );
      const mixed = map.systemNodes.filter((n) => n.defenders.some((d) => earlier.has(d)));
      expect(mixed.length, id).toBeGreaterThanOrEqual(Math.floor(map.systemNodes.length * 0.2));
    }
  });

  it('the AI Core (final map_3 critical) has the full 6-defender crew', () => {
    const map3 = maps.find((m) => m.id === 'map_3')!.map;
    const top = [...map3.criticalNodes].sort((a, b) => a.y - b.y)[0];
    expect(top.defenders).toHaveLength(6);
    expect(top.difficulty).toBe('hard');
  });
});
