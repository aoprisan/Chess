import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { AdventureMapDef, AdventureMapJson, AdventureNode } from './map';
import { AdventureController } from './progress';

// The real journey map, same file the app fetches at runtime.
const mapJson = JSON.parse(
  readFileSync(new URL('../../public/assets/maps/journey_1.json', import.meta.url), 'utf-8'),
) as AdventureMapJson;

// Minimal in-memory localStorage for the node test environment.
function stubLocalStorage() {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

function newController(): AdventureController {
  return new AdventureController(new AdventureMapDef(mapJson), 'sloth');
}

describe('free roaming (pathTo / canReach)', () => {
  beforeEach(stubLocalStorage);

  const node = (ctrl: AdventureController, id: string): AdventureNode => ctrl.map.nodeById(id);

  it('walks multiple hops through open trail with a single destination', () => {
    const ctrl = newController();
    // start -> mA is plain path, mL1 (fallen log) sits beyond it.
    expect(ctrl.pathTo('mA')).toEqual(['mA']);
    expect(ctrl.pathTo('mL1')).toEqual(['mA', 'mL1']);
    expect(ctrl.canReach(node(ctrl, 'mL1'))).toBe(true);
  });

  it('returns the shortest path', () => {
    const ctrl = newController();
    const path = ctrl.pathTo('mL1')!;
    expect(path[path.length - 1]).toBe('mL1');
    expect(new Set(path).size).toBe(path.length); // no revisits
  });

  it('uncleared event nodes are reachable but block travel beyond them', () => {
    const ctrl = newController();
    // mL2 lies past the uncleared fallen log mL1.
    expect(ctrl.pathTo('mL2')).toBeNull();
    ctrl.moveToNode('mA');
    ctrl.moveToNode('mL1');
    ctrl.markObstacleCleared('mL1');
    expect(ctrl.pathTo('mL2')).toEqual(['mL2']);
  });

  it('standing on an uncleared node only allows retreating to visited trail', () => {
    const ctrl = newController();
    ctrl.moveToNode('mA');
    ctrl.moveToNode('mL1'); // fallen log, uncleared
    expect(ctrl.pathTo('mL2')).toBeNull();
    expect(ctrl.pathTo('mA')).toEqual(['mA']);
    // Retreat can keep going through the visited/cleared trail behind,
    // even roaming onto the other open route — just never past the blocker.
    expect(ctrl.pathTo('start')).toEqual(['mA', 'start']);
    expect(ctrl.pathTo('mR1')).toEqual(['mA', 'mR1']);
  });

  it('after clearing, the whole open region is one tap away', () => {
    const ctrl = newController();
    ctrl.moveToNode('mA');
    ctrl.moveToNode('mL1');
    ctrl.markObstacleCleared('mL1');
    // From the cleared log, the other meadow route is reachable in one tap
    // (back through mA and up the right-hand trail to the raft).
    const path = ctrl.pathTo('mR2')!;
    expect(path[0]).toBe('mA');
    expect(path[path.length - 1]).toBe('mR2');
    expect(ctrl.canTapNode(node(ctrl, 'mR2'))).toBe(true);
  });

  it('cannot reach across an undefeated gate rival into the next biome', () => {
    const ctrl = newController();
    // Open the left meadow route up to the gate rival.
    ctrl.markObstacleCleared('mL1');
    expect(ctrl.pathTo('mGate')).toEqual(['mA', 'mL1', 'mL2', 'mB', 'mGate']);
    // fA is the first forest node, behind the meadow gate rival mGate.
    expect(ctrl.pathTo('fA')).toBeNull();
    ctrl.recordFightResult('mGate', 2);
    expect(ctrl.pathTo('fA')).not.toBeNull();
  });

  it('pathTo the current node is an empty walk and canReach is false', () => {
    const ctrl = newController();
    expect(ctrl.pathTo('start')).toEqual([]);
    expect(ctrl.canReach(node(ctrl, 'start'))).toBe(false);
  });
});
