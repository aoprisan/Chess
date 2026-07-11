import { describe, it, expect, beforeEach } from 'vitest';
import { CampaignMapDef, CampaignMapJson, CampaignMapId } from './model';
import { CampaignController } from './controller';
import { META_KEY, loadMeta } from './meta';
import { STARTER_IDS } from '../game/characters';

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

// Synthetic three-map campaign small enough to reason about:
//   map_1: e1 - s1* - j1 - s2 - s3*      (* = critical)
//     s1 [popcorn], s2 [popcorn, reverb], s3 [popcorn]
//   map_2: e2 - s4* - s5*
//     s4 [popcorn], s5 [static, popcorn]
//   map_3: e3 - s6*
//     s6 [vex]
// Clearing all of map_1 with 3 respect pushes popcorn to 9 (level 2), which
// must auto-restore s4 (its only defender) and thin s5 to [static].
function node(
  id: string,
  kind: 'entry' | 'junction' | 'system',
  connections: string[],
  opts: { critical?: boolean; defenders?: string[] } = {},
) {
  return {
    id,
    kind,
    critical: opts.critical ?? false,
    defenders: opts.defenders ?? [],
    difficulty: 'medium' as const,
    x: 0.5,
    y: 0.5,
    district: 'test',
    connections,
  };
}

function testMaps(): Record<CampaignMapId, CampaignMapDef> {
  const map_1: CampaignMapJson = {
    id: 'map_1',
    name: 'Test Grid',
    heightFactor: 2,
    entryNodeId: 'e1',
    nodes: [
      node('e1', 'entry', ['s1']),
      node('s1', 'system', ['e1', 'j1'], { critical: true, defenders: ['popcorn'] }),
      node('j1', 'junction', ['s1', 's2']),
      node('s2', 'system', ['j1', 's3'], { defenders: ['popcorn', 'reverb'] }),
      node('s3', 'system', ['s2'], { critical: true, defenders: ['popcorn'] }),
    ],
  };
  const map_2: CampaignMapJson = {
    id: 'map_2',
    name: 'Test Net',
    heightFactor: 2,
    entryNodeId: 'e2',
    nodes: [
      node('e2', 'entry', ['s4']),
      node('s4', 'system', ['e2', 's5'], { critical: true, defenders: ['popcorn'] }),
      node('s5', 'system', ['s4'], { critical: true, defenders: ['static', 'popcorn'] }),
    ],
  };
  const map_3: CampaignMapJson = {
    id: 'map_3',
    name: 'Test Core',
    heightFactor: 2,
    entryNodeId: 'e3',
    nodes: [
      node('e3', 'entry', ['s6']),
      node('s6', 'system', ['e3'], { critical: true, defenders: ['vex'] }),
    ],
  };
  return {
    map_1: new CampaignMapDef(map_1),
    map_2: new CampaignMapDef(map_2),
    map_3: new CampaignMapDef(map_3),
  };
}

function newController(): CampaignController {
  return new CampaignController(testMaps());
}

beforeEach(() => {
  stubLocalStorage();
});

describe('fresh campaign', () => {
  it('starts with the 5 starters, 3 seats, only map_1 unlocked', () => {
    const c = newController();
    expect(c.crew).toEqual([...STARTER_IDS]);
    expect(c.seats).toBe(3);
    expect(c.isMapUnlocked('map_1')).toBe(true);
    expect(c.isMapUnlocked('map_2')).toBe(false);
    expect(c.isMapUnlocked('map_3')).toBe(false);
    expect(c.campaignWon).toBe(false);
  });

  it('starters are always level 1 and on the crew', () => {
    const c = newController();
    for (const id of STARTER_IDS) {
      expect(c.respectLevel(id)).toBe(1);
      expect(c.isOnCrew(id)).toBe(true);
    }
    expect(c.respectLevel('popcorn')).toBe(0);
    expect(c.isOnCrew('popcorn')).toBe(false);
  });

  it('resetProgress restores the starter roster, seats and saves the wipe', () => {
    const c = newController();
    c.recordBattleResult('map_1', 's1', 3);
    c.recordBattleResult('map_1', 's2', 3);
    c.recordBattleResult('map_1', 's3', 3);
    expect(c.crew.length).toBeGreaterThan(STARTER_IDS.length);
    expect(c.isMapCompleted('map_1')).toBe(true);

    c.resetProgress();

    expect(c.crew).toEqual([...STARTER_IDS]);
    expect(c.seats).toBe(3);
    expect(c.isMapCompleted('map_1')).toBe(false);
    expect(c.campaignWon).toBe(false);
    // The wipe is persisted: a fresh controller sees the same clean slate.
    const c2 = new CampaignController(testMaps());
    expect(c2.crew).toEqual([...STARTER_IDS]);
    expect(c2.isMapCompleted('map_1')).toBe(false);
  });
});

describe('respect derivation and recruitment', () => {
  it('node respect keeps the best result and only improves', () => {
    const c = newController();
    let r = c.recordBattleResult('map_1', 's1', 1);
    expect(r.improved).toBe(true);
    expect(c.respectFor('popcorn')).toBe(1);
    expect(r.joined).toEqual([]);

    r = c.recordBattleResult('map_1', 's1', 3);
    expect(r.improved).toBe(true);
    expect(c.respectFor('popcorn')).toBe(3);

    r = c.recordBattleResult('map_1', 's1', 2);
    expect(r.improved).toBe(false);
    expect(c.respectFor('popcorn')).toBe(3);
  });

  it('a loss changes nothing', () => {
    const c = newController();
    const r = c.recordBattleResult('map_1', 's1', 0);
    expect(r.improved).toBe(false);
    expect(Object.keys(c.meta.nodeRespect)).toHaveLength(0);
  });

  it('reaching the join threshold recruits exactly once', () => {
    const c = newController();
    const r = c.recordBattleResult('map_1', 's1', 3);
    expect(r.joined).toEqual(['popcorn']);
    expect(c.isOnCrew('popcorn')).toBe(true);
    // Further wins never re-fire the join event.
    const r2 = c.recordBattleResult('map_1', 's2', 3);
    expect(r2.joined).toEqual(['reverb']); // popcorn not repeated
  });

  it('respect sums across every node the character defends', () => {
    const c = newController();
    c.recordBattleResult('map_1', 's1', 2);
    c.recordBattleResult('map_1', 's2', 3);
    expect(c.respectFor('popcorn')).toBe(5);
    expect(c.respectFor('reverb')).toBe(3);
    expect(c.maxRespectFor('popcorn')).toBe(15); // 5 nodes x 3
  });
});

describe('withdrawal (level 2) and auto-restore', () => {
  it('level 2 withdraws the character from uncleared nodes on all maps', () => {
    const c = newController();
    c.recordBattleResult('map_1', 's1', 3);
    c.recordBattleResult('map_1', 's2', 3);
    const r = c.recordBattleResult('map_1', 's3', 3); // popcorn respect = 9
    expect(r.withdrew).toEqual(['popcorn']);
    expect(c.respectLevel('popcorn')).toBe(2);
    // s4 (map_2) had only popcorn -> restored without a fight.
    expect(r.autoRestored).toEqual(['map_2:s4']);
    expect(c.isNodeCleared('map_2', c.maps.map_2.nodeById('s4'))).toBe(true);
    // s5 still stands, now defended by static alone.
    expect(c.effectiveDefenders(c.maps.map_2.nodeById('s5'))).toEqual(['static']);
    expect(c.isNodeCleared('map_2', c.maps.map_2.nodeById('s5'))).toBe(false);
  });

  it('auto-restored criticals count toward map completion', () => {
    const c = newController();
    c.recordBattleResult('map_1', 's1', 3);
    c.recordBattleResult('map_1', 's2', 3);
    c.recordBattleResult('map_1', 's3', 3);
    expect(c.criticalProgress('map_2')).toEqual([1, 2]); // s4 restored, s5 pending
  });

  it('auto-restored nodes award no respect', () => {
    const c = newController();
    c.recordBattleResult('map_1', 's1', 3);
    c.recordBattleResult('map_1', 's2', 3);
    c.recordBattleResult('map_1', 's3', 3);
    // static defends only s5; the s4 restore must not touch anyone's respect.
    expect(c.respectFor('static')).toBe(0);
    expect(c.nodeRespect('map_2', 's4')).toBe(0);
  });
});

describe('map completion, unlocks, and seats', () => {
  it('clearing all criticals completes the map and adds a seat', () => {
    const c = newController();
    c.recordBattleResult('map_1', 's1', 1);
    expect(c.isMapCompleted('map_1')).toBe(false);
    const r = c.recordBattleResult('map_1', 's3', 2);
    expect(r.mapsCompleted).toEqual(['map_1']);
    expect(c.isMapCompleted('map_1')).toBe(true);
    expect(c.isMapUnlocked('map_2')).toBe(true);
    expect(c.isMapUnlocked('map_3')).toBe(false);
    expect(c.seats).toBe(4);
  });

  it('completing map_3 wins the campaign (seats cap at 5)', () => {
    const c = newController();
    c.recordBattleResult('map_1', 's1', 1);
    c.recordBattleResult('map_1', 's3', 1);
    c.recordBattleResult('map_2', 's4', 1);
    c.recordBattleResult('map_2', 's5', 1);
    const r = c.recordBattleResult('map_3', 's6', 3);
    expect(r.mapsCompleted).toEqual(['map_3']);
    expect(c.campaignWon).toBe(true);
    expect(c.seats).toBe(5);
  });
});

describe('team selection', () => {
  it('sanitizes lastTeam to crew members within the seat cap', () => {
    const c = newController();
    c.setLastTeam(['bitzy', 'popcorn', 'pixel', 'cache']);
    // popcorn is not on the crew yet and the 4th pick exceeds 3 seats.
    expect(c.lastTeam).toEqual(['bitzy', 'pixel', 'cache']);
    c.recordBattleResult('map_1', 's1', 3); // recruits popcorn
    c.setLastTeam(['popcorn', 'bitzy', 'popcorn']);
    expect(c.lastTeam).toEqual(['popcorn', 'bitzy']); // dupe dropped
  });
});

describe('free roaming (pathTo / canReach)', () => {
  it('uncleared system nodes are reachable but block travel through', () => {
    const c = newController();
    expect(c.pathTo('map_1', 's1')).toEqual(['s1']);
    expect(c.pathTo('map_1', 'j1')).toBeNull(); // s1 blocks
    expect(c.canReach('map_1', c.maps.map_1.nodeById('s2'))).toBe(false);
    c.recordBattleResult('map_1', 's1', 2);
    expect(c.pathTo('map_1', 's2')).toEqual(['s1', 'j1', 's2']);
    expect(c.pathTo('map_1', 's3')).toBeNull(); // s2 uncleared blocks
  });

  it('standing on an uncleared node only allows retreat to visited neighbors', () => {
    const c = newController();
    c.recordBattleResult('map_1', 's1', 2);
    c.moveToNode('map_1', 's1');
    c.moveToNode('map_1', 'j1');
    c.moveToNode('map_1', 's2'); // s2 uncleared, standing on it
    expect(c.pathTo('map_1', 's3')).toBeNull(); // cannot push past
    expect(c.pathTo('map_1', 'j1')).toEqual(['j1']); // retreat ok
  });

  it('movement persists per map', () => {
    const c = newController();
    c.recordBattleResult('map_1', 's1', 2);
    c.moveToNode('map_1', 's1');
    const c2 = new CampaignController(testMaps(), loadMeta());
    expect(c2.currentNodeId('map_1')).toBe('s1');
    expect(c2.isNodeVisited('map_1', 's1')).toBe(true);
    expect(c2.currentNodeId('map_2')).toBe('e2'); // untouched map at entry
  });
});

describe('persistence', () => {
  it('round-trips the full meta state through localStorage', () => {
    const c = newController();
    c.recordBattleResult('map_1', 's1', 3);
    c.setLastTeam(['popcorn', 'bitzy', 'pixel']);
    const c2 = new CampaignController(testMaps());
    expect(c2.isOnCrew('popcorn')).toBe(true);
    expect(c2.respectFor('popcorn')).toBe(3);
    expect(c2.lastTeam).toEqual(['popcorn', 'bitzy', 'pixel']);
    expect(localStorage.getItem(META_KEY)).toBeTruthy();
  });

  it('a session restored after withdrawals settles pending auto-restores', () => {
    const c = newController();
    c.recordBattleResult('map_1', 's1', 3);
    c.recordBattleResult('map_1', 's2', 3);
    c.recordBattleResult('map_1', 's3', 3);
    // Simulate a save that predates the auto-restore bookkeeping.
    const raw = JSON.parse(localStorage.getItem(META_KEY)!);
    raw.autoCleared = [];
    localStorage.setItem(META_KEY, JSON.stringify(raw));
    const c2 = new CampaignController(testMaps());
    expect(c2.isNodeCleared('map_2', c2.maps.map_2.nodeById('s4'))).toBe(true);
  });

  it('purges legacy Kiddie Chess saves on load', () => {
    localStorage.setItem('adventure_progress_v2', '{}');
    localStorage.setItem('adventure_progress_v2:journey_3', '{}');
    localStorage.setItem('adventure_levels_v1', '{}');
    localStorage.setItem('solo_difficulty_v1', 'hard');
    newController();
    expect(localStorage.getItem('adventure_progress_v2')).toBeNull();
    expect(localStorage.getItem('adventure_progress_v2:journey_3')).toBeNull();
    expect(localStorage.getItem('adventure_levels_v1')).toBeNull();
    expect(localStorage.getItem('solo_difficulty_v1')).toBe('hard'); // kept
  });
});
