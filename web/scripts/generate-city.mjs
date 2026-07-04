// Authoring tool: generates the three Neon City campaign maps.
//
//   node scripts/generate-city.mjs
//
// Each map is a city block grid (columns x rows) with some street links
// removed for variety, guaranteed connected, laid out bottom (entry) to top
// (final critical system). System nodes are guarded by 1-6 characters;
// every character guards at least MIN_HOME_NODES nodes on its home map, and
// maps 2-3 mix in characters from earlier maps ("mode 2" in the spec).
// Output is deterministic (seeded RNG per map), so re-running the script
// never churns the committed JSON.
//
// Balancing invariants enforced here (and re-checked in campaign tests):
//  - exact node/critical counts per the spec (24/48/72, 6/12/18)
//  - every character can reach WITHDRAW_THRESHOLD respect (>= 4 nodes -> 12)
//  - the last 2 home characters of each map never guard critical nodes, so
//    clearing criticals alone cannot recruit a map's full cast

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'maps');

// --- Deterministic RNG -------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const shuffled = (rng, arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// --- Character roster (ids must match web/src/game/characters.ts) ------------

const MAP_CHARS = {
  1: ['popcorn', 'reverb', 'forky', 'swipe', 'scatterbug', 'recruta'],
  2: ['static', 'warp', 'twinsy', 'sparkplug', 'beacon', 'shuffle'],
  3: ['vex', 'sponge', 'payback', 'gamba', 'magnet', 'nullo'],
};

/** Last 2 home characters per map never guard criticals (recruitment knob). */
const NON_CRITICAL_CHARS = new Set(
  Object.values(MAP_CHARS).flatMap((chars) => chars.slice(4)),
);

/**
 * Minimum nodes each character guards on its home map. Keeps the withdraw
 * threshold (9 respect) attainable: 3 nodes x 3 respect on the small map 1
 * (its characters also reappear on maps 2-3), 4 nodes elsewhere.
 */
const MIN_HOME_NODES = { 1: 3, 2: 4, 3: 4 };

// --- Map specs ----------------------------------------------------------------

const SPECS = [
  {
    id: 'map_1',
    name: 'Street Grid',
    seed: 101,
    cols: 3,
    rows: 8,
    systems: 15,
    criticals: 6,
    heightFactor: 3.2,
    level: 1,
    districts: ['neon-strip', 'market', 'arcade'],
    defenderCount: (rng, critical) => (critical ? 2 + Math.floor(rng() * 2) : 1 + Math.floor(rng() * 2)),
    difficulty: (critical, defenders, isFinal) => {
      if (isFinal) return 'hard';
      if (critical) return 'medium';
      return defenders <= 1 ? 'easy' : 'medium';
    },
    earlierMixRate: 0,
  },
  {
    id: 'map_2',
    name: 'Metro Net',
    seed: 202,
    cols: 4,
    rows: 12,
    systems: 31,
    criticals: 12,
    heightFactor: 4.8,
    level: 2,
    districts: ['platform', 'tunnel', 'junction', 'depot'],
    defenderCount: (rng, critical) => (critical ? 3 + Math.floor(rng() * 2) : 1 + Math.floor(rng() * 3)),
    difficulty: (critical, defenders) => {
      if (critical || defenders >= 3) return 'hard';
      return defenders === 1 ? 'easy' : 'medium';
    },
    earlierMixRate: 0.4,
  },
  {
    id: 'map_3',
    name: 'Sky Core',
    seed: 303,
    cols: 6,
    rows: 12,
    systems: 45,
    criticals: 18,
    heightFactor: 6.4,
    level: 3,
    districts: ['uplink', 'stratos', 'core'],
    defenderCount: (rng, critical, isFinal) =>
      isFinal ? 6 : critical ? 4 + Math.floor(rng() * 2) : 2 + Math.floor(rng() * 3),
    difficulty: (critical, defenders) => {
      if (critical) return 'hard';
      return defenders <= 2 ? 'medium' : 'hard';
    },
    earlierMixRate: 0.4,
  },
];

// --- Generation ---------------------------------------------------------------

function generateMap(spec) {
  const rng = mulberry32(spec.seed);
  const { cols, rows } = spec;
  const total = cols * rows;

  // Grid nodes, row 0 = bottom (entry), row rows-1 = top (final system).
  const idAt = (col, row) => `n${String(row * cols + col + 1).padStart(2, '0')}`;
  const nodes = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const jitterX = (rng() - 0.5) * 0.05;
      const jitterY = (rng() - 0.5) * 0.02;
      const district = spec.districts[Math.floor((row / rows) * spec.districts.length)];
      nodes.push({
        id: idAt(col, row),
        col,
        row,
        x: Math.min(0.92, Math.max(0.08, (col + 0.5) / cols + jitterX)),
        y: 0.94 - (row / (rows - 1)) * 0.86 + jitterY,
        district,
        connections: new Set(),
      });
    }
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const entryId = idAt(Math.floor(cols / 2), 0);
  const finalId = idAt(Math.floor(cols / 2), rows - 1);

  // Streets: vertical links (kept ~85%) + horizontal links (kept ~55%),
  // grid-adjacent only so the layout stays planar and readable.
  const link = (a, b) => {
    byId.get(a).connections.add(b);
    byId.get(b).connections.add(a);
  };
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (row + 1 < rows && rng() < 0.85) link(idAt(col, row), idAt(col, row + 1));
      if (col + 1 < cols && rng() < 0.55) link(idAt(col, row), idAt(col + 1, row));
    }
  }
  // Connectivity repair: attach unreached nodes to a reached grid neighbor.
  const reachable = () => {
    const seen = new Set([entryId]);
    const queue = [entryId];
    while (queue.length) {
      const id = queue.shift();
      for (const next of byId.get(id).connections) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return seen;
  };
  let seen = reachable();
  for (const node of nodes) {
    if (seen.has(node.id)) continue;
    const neighbors = [];
    if (node.row > 0) neighbors.push(idAt(node.col, node.row - 1));
    if (node.row + 1 < rows) neighbors.push(idAt(node.col, node.row + 1));
    if (node.col > 0) neighbors.push(idAt(node.col - 1, node.row));
    if (node.col + 1 < cols) neighbors.push(idAt(node.col + 1, node.row));
    const attached = neighbors.find((id) => seen.has(id));
    link(node.id, attached ?? pick(rng, neighbors));
    seen = reachable();
  }
  if (reachable().size !== total) throw new Error(`${spec.id}: graph is not connected`);

  // Kinds: entry + [systems] system nodes + junctions. The final node is
  // always a system; criticals are spread evenly bottom-to-top.
  const candidates = shuffled(
    rng,
    nodes.filter((n) => n.id !== entryId && n.id !== finalId).map((n) => n.id),
  );
  const systemIds = new Set([finalId, ...candidates.slice(0, spec.systems - 1)]);
  const systemsByRow = nodes
    .filter((n) => systemIds.has(n.id))
    .sort((a, b) => a.row - b.row || a.col - b.col);
  const criticalIds = new Set([finalId]);
  const stride = systemsByRow.length / spec.criticals;
  for (let i = 0; criticalIds.size < spec.criticals; i++) {
    const idx = Math.min(systemsByRow.length - 1, Math.floor(i * stride));
    criticalIds.add(systemsByRow[idx].id);
    if (i > systemsByRow.length) throw new Error(`${spec.id}: cannot place criticals`);
  }

  // Defender slots per system node.
  const systems = systemsByRow.map((n) => {
    const critical = criticalIds.has(n.id);
    const isFinal = n.id === finalId;
    const count = Math.min(6, spec.defenderCount(rng, critical, isFinal));
    return { node: n, critical, isFinal, count, defenders: [] };
  });

  const homeChars = MAP_CHARS[spec.level];
  const earlierChars = Object.entries(MAP_CHARS)
    .filter(([lvl]) => Number(lvl) < spec.level)
    .flatMap(([, chars]) => chars);
  const eligible = (charId, sys) => !(sys.critical && NON_CRITICAL_CHARS.has(charId));
  const hasRoom = (sys) => sys.defenders.length < sys.count;

  // 1) Home quotas, round-robin so no character hogs the scarce slots.
  // Critical-restricted characters pick first each round (fewer options).
  const quota = MIN_HOME_NODES[spec.level];
  const quotaOrder = [...homeChars].sort(
    (a, b) => Number(NON_CRITICAL_CHARS.has(b)) - Number(NON_CRITICAL_CHARS.has(a)),
  );
  const assignedCount = new Map(homeChars.map((id) => [id, 0]));
  for (let round = 0; round < quota; round++) {
    for (const charId of quotaOrder) {
      const options = shuffled(
        rng,
        systems.filter(
          (sys) => hasRoom(sys) && eligible(charId, sys) && !sys.defenders.includes(charId),
        ),
      );
      if (options.length === 0) {
        throw new Error(`${spec.id}: could not give ${charId} ${quota} home nodes`);
      }
      options[0].defenders.push(charId);
      assignedCount.set(charId, assignedCount.get(charId) + 1);
    }
  }

  // 2) Mode 2: a share of nodes gets one character from an earlier map.
  if (earlierChars.length > 0) {
    for (const sys of systems) {
      if (!hasRoom(sys) || rng() >= spec.earlierMixRate) continue;
      const options = earlierChars.filter(
        (id) => eligible(id, sys) && !sys.defenders.includes(id),
      );
      if (options.length > 0) sys.defenders.push(pick(rng, options));
    }
  }

  // 3) Fill remaining slots from home (weighted) + earlier characters.
  for (const sys of systems) {
    while (hasRoom(sys)) {
      const pool = [...homeChars, ...homeChars, ...earlierChars].filter(
        (id) => eligible(id, sys) && !sys.defenders.includes(id),
      );
      if (pool.length === 0) break;
      sys.defenders.push(pick(rng, pool));
    }
    if (sys.defenders.length === 0) {
      // Guarantee 1-6 defenders on every system node.
      sys.defenders.push(pick(rng, homeChars.filter((id) => eligible(id, sys))));
    }
  }

  // Validation.
  for (const sys of systems) {
    if (sys.defenders.length < 1 || sys.defenders.length > 6) {
      throw new Error(`${spec.id}: ${sys.node.id} has ${sys.defenders.length} defenders`);
    }
    if (new Set(sys.defenders).size !== sys.defenders.length) {
      throw new Error(`${spec.id}: duplicate defenders on ${sys.node.id}`);
    }
    if (sys.critical && sys.defenders.some((id) => NON_CRITICAL_CHARS.has(id))) {
      throw new Error(`${spec.id}: non-critical character guards critical ${sys.node.id}`);
    }
  }
  const finalSys = systems.find((s) => s.isFinal);
  if (spec.level === 3 && finalSys.defenders.length !== 6) {
    throw new Error('map_3: the AI Core must have 6 defenders');
  }

  const sysById = new Map(systems.map((s) => [s.node.id, s]));
  const outNodes = nodes.map((n) => {
    const sys = sysById.get(n.id);
    return {
      id: n.id,
      kind: n.id === entryId ? 'entry' : sys ? 'system' : 'junction',
      critical: sys ? sys.critical : false,
      defenders: sys ? sys.defenders : [],
      difficulty: sys ? spec.difficulty(sys.critical, sys.defenders.length, sys.isFinal) : 'easy',
      x: Number(n.x.toFixed(3)),
      y: Number(n.y.toFixed(3)),
      district: n.district,
      connections: [...n.connections].sort(),
    };
  });

  return {
    id: spec.id,
    name: spec.name,
    heightFactor: spec.heightFactor,
    entryNodeId: entryId,
    nodes: outNodes,
  };
}

for (const spec of SPECS) {
  const map = generateMap(spec);
  const systems = map.nodes.filter((n) => n.kind === 'system');
  const criticals = map.nodes.filter((n) => n.critical);
  if (map.nodes.length !== spec.cols * spec.rows) throw new Error(`${spec.id}: node count`);
  if (systems.length !== spec.systems) throw new Error(`${spec.id}: system count`);
  if (criticals.length !== spec.criticals) throw new Error(`${spec.id}: critical count`);
  const file = join(OUT_DIR, `${spec.id}.json`);
  writeFileSync(file, JSON.stringify(map, null, 2) + '\n');
  console.log(
    `${spec.id}: ${map.nodes.length} nodes, ${systems.length} systems, ${criticals.length} critical -> ${file}`,
  );
}
