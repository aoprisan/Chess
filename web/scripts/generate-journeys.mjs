// Authoring tool: generates the journey_2..journey_5 adventure maps.
//
//   node scripts/generate-journeys.mjs
//
// journey_1.json is the original hand-crafted map and is never touched. Each
// generated level reuses its shape language — a winding trail that splits
// into a left and a right branch and re-merges (so there is always another
// way around a blocked path), guarded treasure spurs off the branches, a
// rival gate between biomes, and a boss before the summit — but with more
// "cells" (split/merge sections) per biome, longer branches, and more spurs
// as the levels go up. Output is deterministic (seeded RNG per level), so
// re-running the script never churns the committed JSON.

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

// --- Level specs --------------------------------------------------------------

const BIOMES = ['meadow', 'forest', 'peaks'];

/** Obstacle art per biome (all types exist in assets/images/obstacles). */
const OBSTACLES = {
  meadow: ['fallenLog', 'riverRaft', 'sleepingCub'],
  forest: ['tangledVines', 'ropeBridge', 'sleepingCub', 'fallenLog'],
  peaks: ['snowballBoulder', 'icePatch', 'ropeBridge'],
};

/** Vertical band (fraction of map height) each biome's trail occupies, bottom→top. */
const BANDS = { meadow: [0.945, 0.7], forest: [0.645, 0.4], peaks: [0.35, 0.1] };

// difficulty: rivals sorted bottom→top consume this queue, so battles get
// harder as the journey climbs. Rival totals per level:
//   gates between biomes (2) + boss (1) + sum(rivalSpursPerBiome).
const LEVELS = [
  {
    id: 'journey_2',
    name: 'Winding Woods',
    seed: 202,
    heightFactor: 4.6,
    cellsPerBiome: 1,
    branchLen: 3,
    rivalSpursPerBiome: [1, 1, 1],
    treasureSpursPerBiome: [1, 1, 1],
    difficulty: { easy: 2, medium: 3, hard: 1 },
  },
  {
    id: 'journey_3',
    name: 'Twin Rivers',
    seed: 303,
    heightFactor: 5.8,
    cellsPerBiome: 2,
    branchLen: 2,
    rivalSpursPerBiome: [1, 1, 2],
    treasureSpursPerBiome: [1, 2, 1],
    difficulty: { easy: 1, medium: 4, hard: 2 },
  },
  {
    id: 'journey_4',
    name: 'Stormy Highlands',
    seed: 404,
    heightFactor: 7.2,
    cellsPerBiome: 2,
    branchLen: 3,
    rivalSpursPerBiome: [2, 2, 2],
    treasureSpursPerBiome: [2, 1, 2],
    difficulty: { easy: 0, medium: 5, hard: 4 },
  },
  {
    id: 'journey_5',
    name: 'Summit of Legends',
    seed: 505,
    heightFactor: 8.6,
    cellsPerBiome: 3,
    branchLen: 2,
    rivalSpursPerBiome: [2, 3, 3],
    treasureSpursPerBiome: [2, 2, 2],
    difficulty: { easy: 0, medium: 4, hard: 7 },
  },
];

// --- Builder -------------------------------------------------------------------

function buildJourney(spec) {
  const rnd = mulberry32(spec.seed);
  const jitter = (amp) => (rnd() * 2 - 1) * amp;
  const nodes = [];
  const byId = new Map();
  const obstacleCursor = { meadow: 0, forest: 0, peaks: 0 };

  const addNode = (node) => {
    if (byId.has(node.id)) throw new Error(`duplicate node id ${node.id}`);
    node.connections = [];
    byId.set(node.id, node);
    nodes.push(node);
    return node;
  };
  const addEdge = (a, b) => {
    byId.get(a).connections.push(b);
    byId.get(b).connections.push(a);
  };
  const nextObstacle = (biome) => {
    const list = OBSTACLES[biome];
    return list[obstacleCursor[biome]++ % list.length];
  };

  addNode({ id: 'start', type: 'start', x: 0.5, y: 0.972, biome: 'meadow' });
  let prevId = 'start';

  for (const biome of BIOMES) {
    const [yBot, yTop] = BANDS[biome];
    const cells = spec.cellsPerBiome;
    const rowsPerCell = spec.branchLen + 2; // A + branch rows + B
    const rowsTotal = cells * rowsPerCell;
    const rowY = (row) => yBot - ((yBot - yTop) * row) / (rowsTotal - 1);

    // Spread this biome's spurs round-robin across its cells.
    const rivalSpurs = spec.rivalSpursPerBiome[BIOMES.indexOf(biome)];
    const treasureSpurs = spec.treasureSpursPerBiome[BIOMES.indexOf(biome)];

    for (let cell = 0; cell < cells; cell++) {
      const p = `${biome[0]}${cell}`;
      const base = cell * rowsPerCell;

      const a = addNode({ id: `${p}A`, type: 'path', x: 0.5 + jitter(0.04), y: rowY(base), biome });
      addEdge(prevId, a.id);

      // Left/right branches: each gets at least one obstacle so neither side
      // is a free walk, but never *all* obstacles so backtracking stays cheap.
      const branchIds = { L: [], R: [] };
      for (const side of ['L', 'R']) {
        const baseX = side === 'L' ? 0.22 : 0.78;
        const drift = side === 'L' ? -0.04 : 0.04;
        const obstacleRow = Math.floor(rnd() * spec.branchLen);
        const extraObstacle =
          spec.branchLen >= 3 && rnd() < 0.5
            ? (obstacleRow + 1 + Math.floor(rnd() * (spec.branchLen - 1))) % spec.branchLen
            : -1;
        let prev = a.id;
        for (let i = 0; i < spec.branchLen; i++) {
          const isObstacle = i === obstacleRow || i === extraObstacle;
          const node = addNode({
            id: `${p}${side}${i + 1}`,
            type: isObstacle ? 'obstacle' : 'path',
            ...(isObstacle ? { obstacle: nextObstacle(biome) } : {}),
            x: baseX + drift * i + jitter(0.035),
            y: rowY(base + 1 + i),
            biome,
          });
          addEdge(prev, node.id);
          branchIds[side].push(node.id);
          prev = node.id;
        }
      }

      const b = addNode({
        id: `${p}B`,
        type: 'path',
        x: 0.45 + jitter(0.06),
        y: rowY(base + rowsPerCell - 1),
        biome,
      });
      addEdge(branchIds.L[branchIds.L.length - 1], b.id);
      addEdge(branchIds.R[branchIds.R.length - 1], b.id);

      // Guarded treasure spur: rival -> treasure, hanging off a mid-branch
      // node on the outside of the trail (fight is optional, loot behind it).
      if (cell < rivalSpurs) {
        const side = cell % 2 === 0 ? 'R' : 'L';
        const attach = byId.get(branchIds[side][Math.floor(spec.branchLen / 2)]);
        const dx = side === 'R' ? 0.12 : -0.12;
        const rival = addNode({
          id: `${p}${side}S`,
          type: 'rival',
          x: Math.min(0.93, Math.max(0.07, attach.x + dx)),
          y: attach.y - 0.012,
          biome,
        });
        const chest = addNode({
          id: `${p}${side}T`,
          type: 'treasure',
          x: Math.min(0.95, Math.max(0.05, rival.x + dx * 0.4)),
          y: rival.y - 0.03,
          biome,
        });
        addEdge(attach.id, rival.id);
        addEdge(rival.id, chest.id);
      }

      // Free treasure spur off the merge node (opposite side of the rival spur).
      if (cell < treasureSpurs) {
        const dx = cell % 2 === 0 ? -0.17 : 0.17;
        const chest = addNode({
          id: `${p}BT`,
          type: 'treasure',
          x: Math.min(0.95, Math.max(0.05, b.x + dx)),
          y: b.y - 0.022,
          biome,
        });
        addEdge(b.id, chest.id);
      }

      prevId = b.id;
    }

    // Rival gate between biomes (the boss handles the peaks exit).
    if (biome !== 'peaks') {
      const gate = addNode({
        id: `gate_${biome[0]}`,
        type: 'rival',
        x: 0.5 + jitter(0.03),
        y: yTop - 0.028,
        biome,
      });
      addEdge(prevId, gate.id);
      prevId = gate.id;
    }
  }

  const boss = addNode({ id: 'boss', type: 'rival', x: 0.51, y: 0.072, biome: 'peaks' });
  addEdge(prevId, boss.id);
  const finish = addNode({ id: 'finish', type: 'finish', x: 0.5, y: 0.032, biome: 'peaks' });
  addEdge(boss.id, finish.id);

  // Rival indexes + difficulty: bottom→top encounter order, boss always last
  // (rivalIndex 4 marks the boss for the UI). Non-boss rivals cycle 0..3.
  const rivals = nodes.filter((n) => n.type === 'rival').sort((x, y) => y.y - x.y);
  const queue = [
    ...Array(spec.difficulty.easy).fill('easy'),
    ...Array(spec.difficulty.medium).fill('medium'),
    ...Array(spec.difficulty.hard).fill('hard'),
  ];
  if (queue.length !== rivals.length) {
    throw new Error(`${spec.id}: difficulty queue ${queue.length} != rivals ${rivals.length}`);
  }
  rivals.forEach((r, i) => {
    r.rivalIndex = r === boss ? 4 : i % 4;
    r.difficulty = queue[i];
  });

  return {
    id: spec.id,
    name: spec.name,
    heightFactor: spec.heightFactor,
    startNodeId: 'start',
    nodes,
  };
}

// --- Emit ------------------------------------------------------------------------

for (const spec of LEVELS) {
  const journey = buildJourney(spec);
  const counts = journey.nodes.reduce((m, n) => ((m[n.type] = (m[n.type] ?? 0) + 1), m), {});
  const rivalCount = counts.rival ?? 0;
  const treasureCount = counts.treasure ?? 0;
  const file = join(OUT_DIR, `${spec.id}.json`);
  writeFileSync(
    file,
    JSON.stringify(journey, (k, v) => (typeof v === 'number' ? Number(v.toFixed(4)) : v), 2) + '\n',
  );
  console.log(
    `${spec.id} (${spec.name}): ${journey.nodes.length} nodes`,
    counts,
    `maxStars=${rivalCount * 3 + treasureCount * 2}`,
  );
}
