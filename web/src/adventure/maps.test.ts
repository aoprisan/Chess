import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { AdventureMapDef, AdventureMapJson } from './map';
import { JOURNEYS } from './levels';

// Structural validation of every shipped journey map (journey_1 is
// hand-crafted, the rest come from scripts/generate-journeys.mjs).

const OBSTACLE_TYPES = new Set([
  'fallenLog', 'riverRaft', 'sleepingCub', 'tangledVines', 'ropeBridge', 'snowballBoulder', 'icePatch',
]);
const BIOMES = new Set(['meadow', 'forest', 'peaks']);
const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

function loadJson(id: string): AdventureMapJson {
  return JSON.parse(
    readFileSync(new URL(`../../public/assets/maps/${id}.json`, import.meta.url), 'utf-8'),
  ) as AdventureMapJson;
}

const journeys = JOURNEYS.map((meta) => ({ meta, json: loadJson(meta.id) }));

describe.each(journeys)('$meta.id ($meta.name)', ({ meta, json }) => {
  const map = new AdventureMapDef(json);

  it('has matching id and a start node', () => {
    expect(json.id).toBe(meta.id);
    expect(map.nodeById(map.startNodeId).type).toBe('start');
  });

  it('has unique node ids', () => {
    expect(new Set(map.nodes.map((n) => n.id)).size).toBe(map.nodes.length);
  });

  it('has exactly one start and one finish', () => {
    expect(map.nodes.filter((n) => n.type === 'start')).toHaveLength(1);
    expect(map.nodes.filter((n) => n.type === 'finish')).toHaveLength(1);
  });

  it('has symmetric connections to existing nodes', () => {
    for (const node of map.nodes) {
      expect(node.connections.length).toBeGreaterThan(0);
      for (const other of node.connections) {
        expect(map.nodeById(other).connections).toContain(node.id);
      }
    }
  });

  it('every node is reachable from start', () => {
    const seen = new Set<string>([map.startNodeId]);
    const queue = [map.startNodeId];
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

  it('has valid coordinates and biomes', () => {
    for (const node of map.nodes) {
      expect(node.x).toBeGreaterThan(0);
      expect(node.x).toBeLessThan(1);
      expect(node.y).toBeGreaterThan(0);
      expect(node.y).toBeLessThan(1);
      expect(BIOMES.has(node.biome)).toBe(true);
    }
  });

  it('has well-formed rivals with exactly one boss', () => {
    const rivals = map.nodes.filter((n) => n.type === 'rival');
    expect(rivals.length).toBeGreaterThanOrEqual(5);
    for (const rival of rivals) {
      expect(rival.rivalIndex).toBeGreaterThanOrEqual(0);
      expect(rival.rivalIndex).toBeLessThanOrEqual(4);
      if (rival.difficulty !== undefined) expect(DIFFICULTIES.has(rival.difficulty)).toBe(true);
    }
    expect(rivals.filter((r) => r.rivalIndex === 4)).toHaveLength(1);
  });

  it('obstacle nodes carry a known obstacle type', () => {
    for (const node of map.nodes.filter((n) => n.type === 'obstacle')) {
      expect(OBSTACLE_TYPES.has(node.obstacle!)).toBe(true);
    }
  });
});

describe('level progression sizes', () => {
  it('each level is a bigger map than the last', () => {
    for (let i = 1; i < journeys.length; i++) {
      const prev = new AdventureMapDef(journeys[i - 1].json);
      const cur = new AdventureMapDef(journeys[i].json);
      expect(cur.nodes.length).toBeGreaterThan(prev.nodes.length);
      expect(cur.heightFactor).toBeGreaterThan(prev.heightFactor);
      expect(cur.rivalCount).toBeGreaterThanOrEqual(prev.rivalCount);
    }
  });
});
