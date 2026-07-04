import { describe, it, expect } from 'vitest';
import { CombatEngine } from './engine';
import { SeededRNG } from './rng';
import { Lane, PlayerSide, countPieces } from './state';
import { chooseAIPerk } from './ai';
import { getValidLanesForPerk } from './targeting';
import { SLOT3_POOL, SLOT4_POOL, PERKS } from './perks';

function engine(seed = 1): CombatEngine {
  return new CombatEngine('test', { rng: new SeededRNG(seed) });
}

/** Fill a side of a lane to a given count (front-fill columns 0..n-1). */
function setPieces(lane: Lane, side: PlayerSide, n: number) {
  const cols = side === 'player1' ? lane.player1Columns : lane.player2Columns;
  for (let i = 0; i < cols.length; i++) cols[i] = i < n;
}

describe('perk catalog', () => {
  it('has the 32 perks + Pass', () => {
    expect(Object.keys(PERKS).length).toBe(33);
  });
  it('pools have 15 perks each and are disjoint', () => {
    expect(SLOT3_POOL.length).toBe(15);
    expect(SLOT4_POOL.length).toBe(15);
    expect(SLOT3_POOL.some((id) => SLOT4_POOL.includes(id))).toBe(false);
  });
});

describe('basic placement & win detection', () => {
  it('placeOnLane fills columns front-first', () => {
    const e = engine();
    expect(e.placeOnLane(0)).toBe(true);
    expect(e.state.lanes[0].player1Columns[0]).toBe(true);
    expect(countPieces(e.state.lanes[0], 'player1')).toBe(1);
  });

  it('winning a lane with 5 pieces increments lanesWon', () => {
    const e = engine();
    setPieces(e.state.lanes[0], 'player1', 4);
    e.placeOnLane(0);
    expect(e.state.lanes[0].winner).toBe('player1');
    expect(e.state.player1LanesWon).toBe(1);
  });

  it('winning 3 lanes finishes the game', () => {
    const e = engine();
    for (let i = 0; i < 3; i++) {
      setPieces(e.state.lanes[i], 'player1', 4);
      e.placeOnLane(i);
    }
    expect(e.state.status).toBe('finished');
    expect(e.state.gameWinner).toBe('player1');
  });
});

describe('removal & redirects', () => {
  it('removeEnemyPiece removes frontmost enemy piece', () => {
    const e = engine();
    setPieces(e.state.lanes[2], 'player2', 3);
    expect(e.removeEnemyPiece(2)).toBe(true);
    expect(countPieces(e.state.lanes[2], 'player2')).toBe(2);
  });

  it('Capture is checked BEFORE Sanctuary (redirect ordering)', () => {
    const e = engine();
    // player1 is current, removing player2's piece.
    // player1 has a Capture zone on lane 4; player2 has a Sanctuary on lane 3.
    e.state.player1Captures.push({ lane: 4, turnsLeft: 3 });
    e.state.player2Sanctuaries.push({ lane: 3, turnsLeft: 4 });
    setPieces(e.state.lanes[2], 'player2', 2);
    e.removeEnemyPiece(2);
    // Capture wins: the removed enemy piece becomes player1's on lane 4.
    expect(countPieces(e.state.lanes[4], 'player1')).toBe(1);
    expect(countPieces(e.state.lanes[3], 'player2')).toBe(0);
    expect(countPieces(e.state.lanes[2], 'player2')).toBe(1);
  });

  it('Sanctuary rescues pieces from Kamikaze kills', () => {
    const e = engine();
    e.state.player2Sanctuaries.push({ lane: 0, turnsLeft: 4 });
    setPieces(e.state.lanes[1], 'player1', 1); // sacrifice fodder
    setPieces(e.state.lanes[2], 'player2', 2);
    e.kamikazePiece(1);
    // Both kills redirect to the sanctuary (a kill landing on the sanctuary
    // lane itself redirects back onto it), so player2's total is conserved.
    const totalP2 = e.state.lanes.reduce((sum, lane) => sum + countPieces(lane, 'player2'), 0);
    expect(totalP2).toBe(2);
    expect(countPieces(e.state.lanes[1], 'player1')).toBe(0); // sacrifice still paid
  });

  it("Steal converts the stolen piece via the stealer's Capture zone", () => {
    const e = engine();
    e.state.player1Captures.push({ lane: 4, turnsLeft: 3 });
    setPieces(e.state.lanes[2], 'player2', 1);
    expect(e.stealPiece()).toBe(true);
    const totalP2 = e.state.lanes.reduce((sum, lane) => sum + countPieces(lane, 'player2'), 0);
    const totalP1 = e.state.lanes.reduce((sum, lane) => sum + countPieces(lane, 'player1'), 0);
    expect(totalP2).toBe(0); // stolen piece gone from player2
    expect(countPieces(e.state.lanes[4], 'player1')).toBeGreaterThanOrEqual(1); // converted
    expect(totalP1).toBe(2); // capture conversion + Steal's unconditional +1
  });

  it('a raid placeholder is NOT rescued by Sanctuary when the raid resolves', () => {
    const e = engine(5);
    e.state.player2Sanctuaries.push({ lane: 3, turnsLeft: 4 });
    setPieces(e.state.lanes[0], 'player2', 1); // the raid placeholder
    e.state.pendingRaids = [{ owner: 1, lane: 0, turnsUntilResolve: 0, source: 'RAID' }];
    e.autoPlace(); // resolves the raid at player1's turn start
    // All four roll branches remove the placeholder outright — never redirected.
    expect(countPieces(e.state.lanes[3], 'player2')).toBe(0);
  });
});

describe('placement triggers', () => {
  it('Trap makes an enemy placement vanish', () => {
    const e = engine();
    // player2 owns a TRAP on lane 0. player1 places there via autoPlace path.
    e.state.lanes[0].triggers.push({ type: 'TRAP', owner: 2, turnsLeft: 2, orderId: 0 });
    e.placeOnLane(0);
    // The just-placed player1 piece is removed by trap.
    expect(countPieces(e.state.lanes[0], 'player1')).toBe(0);
  });

  it("Trap owner's Capture converts the trapped piece", () => {
    const e = engine();
    e.state.lanes[0].triggers.push({ type: 'TRAP', owner: 2, turnsLeft: 2, orderId: 0 });
    e.state.player2Captures.push({ lane: 4, turnsLeft: 3 });
    e.placeOnLane(0);
    expect(countPieces(e.state.lanes[0], 'player1')).toBe(0); // trapped
    expect(countPieces(e.state.lanes[4], 'player2')).toBe(1); // converted, not vanished
  });

  it('Mirror grants the owner +2 when enemy places on the lane', () => {
    const e = engine();
    e.state.lanes[0].triggers.push({ type: 'MIRROR', owner: 2, turnsLeft: 2, orderId: 0 });
    e.placeOnLane(0);
    expect(countPieces(e.state.lanes[0], 'player1')).toBe(1); // placer keeps piece
    expect(countPieces(e.state.lanes[0], 'player2')).toBe(2); // owner +2
  });

  it('triggers are one-time use', () => {
    const e = engine();
    e.state.lanes[0].triggers.push({ type: 'TRAP', owner: 2, turnsLeft: 2, orderId: 0 });
    e.placeOnLane(0);
    expect(e.state.lanes[0].triggers.length).toBe(0);
  });

  it('buffed triggers place +1 own piece at cast and live 2 opponent turns', () => {
    const e = engine();
    expect(e.setMirrorTrigger(0)).toBe(true);
    expect(countPieces(e.state.lanes[0], 'player1')).toBe(1);
    expect(e.state.lanes[0].triggers).toHaveLength(1);
    expect(e.state.lanes[0].triggers[0]).toMatchObject({ type: 'MIRROR', owner: 1, turnsLeft: 4 });
  });

  it('cast +1 that wins the lane pushes no trigger', () => {
    const e = engine();
    setPieces(e.state.lanes[0], 'player1', 4);
    expect(e.setMirrorTrigger(0)).toBe(true);
    expect(e.state.lanes[0].winner).toBe('player1');
    expect(e.state.lanes[0].triggers).toHaveLength(0);
  });

  it('buffed trigger still fires on the opponent 2nd turn, then is gone by the 3rd', () => {
    const e = engine();
    e.setMirrorTrigger(0);
    e.endTurn(); // p1 -> p2 (opponent turn 1, unused)
    e.endTurn(); // p2 -> p1
    e.endTurn(); // p1 -> p2 (opponent turn 2)
    expect(e.state.lanes[0].triggers).toHaveLength(1);
    e.placeOnLane(0); // p2 places on the mirrored lane
    expect(countPieces(e.state.lanes[0], 'player1')).toBe(3); // 1 at cast + 2 mirrored
    expect(e.state.lanes[0].triggers).toHaveLength(0); // one-shot

    const e2 = engine();
    e2.setMirrorTrigger(0);
    for (let i = 0; i < 4; i++) e2.endTurn();
    expect(e2.state.lanes[0].triggers).toHaveLength(0); // expired unfired
  });

  it('Portal/Trap keep the old 1-opponent-turn lifetime and no cast bonus', () => {
    const e = engine();
    e.setPortalTrigger(0);
    expect(countPieces(e.state.lanes[0], 'player1')).toBe(0);
    expect(e.state.lanes[0].triggers[0]).toMatchObject({ type: 'PORTAL', turnsLeft: 2 });
    e.endTurn();
    e.endTurn();
    expect(e.state.lanes[0].triggers).toHaveLength(0);
  });

  it('Retaliate spawns a raid piece on the placer side', () => {
    const e = engine();
    e.state.lanes[0].triggers.push({ type: 'RETALIATE', owner: 2, turnsLeft: 4, orderId: 0 });
    setPieces(e.state.lanes[0], 'player1', 1);
    e.placeOnLane(0); // player1's 2nd piece fires the trigger
    expect(countPieces(e.state.lanes[0], 'player1')).toBe(3); // 2 placed + raid piece
    expect(e.state.pendingRaids).toHaveLength(1);
    expect(e.state.pendingRaids[0]).toMatchObject({ owner: 2, lane: 0, source: 'RETALIATE' });
  });

  it('Retaliate fizzles instead of winning the lane for the placer', () => {
    const e = engine();
    e.state.lanes[0].triggers.push({ type: 'RETALIATE', owner: 2, turnsLeft: 4, orderId: 0 });
    setPieces(e.state.lanes[0], 'player1', 3);
    e.placeOnLane(0); // player1 now has 4; a raid piece would be their winning 5th
    expect(e.state.lanes[0].winner).toBeNull();
    expect(countPieces(e.state.lanes[0], 'player1')).toBe(4);
    expect(e.state.pendingRaids).toHaveLength(0);
  });

  it('trigger chaining respects depth guard (no infinite loop)', () => {
    const e = engine();
    // Portal on every lane owned by player2; player1 placement bounces around.
    for (let i = 0; i < 5; i++) {
      e.state.lanes[i].triggers.push({ type: 'PORTAL', owner: 2, turnsLeft: 2, orderId: i });
    }
    // Should terminate without throwing.
    expect(() => e.placeOnLane(0)).not.toThrow();
  });
});

describe('removal triggers', () => {
  it("Ambush fires the victim's Hydra on the hit lane", () => {
    const e = engine(3);
    // player1 owns a pending Ambush on lane 1; player2 has pieces only there,
    // protected by their Hydra trigger.
    e.state.lanes[1].deferred.push({ type: 'AMBUSH', owner: 1, targetLane: 1 });
    e.state.lanes[1].triggers.push({ type: 'HYDRA', owner: 2, turnsLeft: 4, orderId: 0 });
    setPieces(e.state.lanes[1], 'player2', 2);
    e.autoPlace(); // player1 turn start resolves the deferred Ambush
    expect(countPieces(e.state.lanes[1], 'player2')).toBe(1); // lost 1 to the ambush
    const totalP2 = e.state.lanes.reduce((sum, lane) => sum + countPieces(lane, 'player2'), 0);
    expect(totalP2).toBe(3); // Hydra spawned 2 elsewhere: net +1
    expect(e.state.lanes[1].triggers).toHaveLength(0); // one-shot, consumed
  });

  it('Backfire-vs-Backfire chains terminate within the depth guard', () => {
    const e = engine(9);
    for (let i = 0; i < 5; i++) {
      setPieces(e.state.lanes[i], 'player1', 3);
      setPieces(e.state.lanes[i], 'player2', 3);
      e.state.lanes[i].triggers.push({ type: 'BACKFIRE', owner: 1, turnsLeft: 4, orderId: i * 2 });
      e.state.lanes[i].triggers.push({
        type: 'BACKFIRE',
        owner: 2,
        turnsLeft: 4,
        orderId: i * 2 + 1,
      });
    }
    expect(() => e.removeEnemyPiece(0)).not.toThrow();
    for (const lane of e.state.lanes) {
      expect(countPieces(lane, 'player1')).toBeLessThanOrEqual(5);
      expect(countPieces(lane, 'player2')).toBeLessThanOrEqual(5);
    }
  });
});

describe('raid probability resolution', () => {
  it('resolves a pending raid at owner turn start without corrupting state', () => {
    const e = engine(5);
    // player1 owns a raid on lane 0: raid piece sits on player2's side, ready now.
    setPieces(e.state.lanes[0], 'player2', 1);
    e.state.pendingRaids = [{ owner: 1, lane: 0, turnsUntilResolve: 0, source: 'RAID' }];
    e.state.currentPlayer = 'player1';
    e.state.currentPhase = 'autoPlacement';
    expect(() => e.autoPlace()).not.toThrow();
    // Raid consumed from the pending list.
    expect(e.state.pendingRaids.length).toBe(0);
    // Every lane's piece counts stay within [0,5].
    for (const lane of e.state.lanes) {
      expect(countPieces(lane, 'player1')).toBeLessThanOrEqual(5);
      expect(countPieces(lane, 'player2')).toBeLessThanOrEqual(5);
    }
  });
});

describe('turn end decrements timers', () => {
  it('cloak counts down and clears', () => {
    const e = engine();
    e.cloakField();
    expect(e.state.player1Cloaked).toBe(2);
    e.endTurn(); // player1 -> player2
    expect(e.state.player1Cloaked).toBe(1);
    e.endTurn(); // player2 -> player1
    expect(e.state.player1Cloaked).toBe(0);
  });

  it('frozen lane blocks the opponent then clears', () => {
    const e = engine();
    e.freezeLane(3); // player1 freezes lane 3 -> blocks player2
    e.endTurn();
    expect(e.state.currentPlayer).toBe('player2');
    // lane 3 frozen for player2: chosen placements are blocked
    expect(getValidLanesForPerk(1, e.state, 'player2')).not.toContain(3);
    expect(getValidLanesForPerk(39, e.state, 'player2')).not.toContain(3);
    expect(e.placeOnLane(3)).toBe(false);
    expect(e.rushLane(3)).toBe(false);
    // ...but not the freezer's own
    expect(getValidLanesForPerk(1, e.state, 'player1')).toContain(3);
    // freeze expires after the frozen player's turn
    e.endTurn();
    expect(getValidLanesForPerk(1, e.state, 'player2')).toContain(3);
  });
});

describe('targeting', () => {
  it('RemoveEnemy is blocked while enemy is cloaked', () => {
    const e = engine();
    setPieces(e.state.lanes[0], 'player2', 2);
    e.state.player2Cloaked = 2;
    const valid = getValidLanesForPerk(2, e.state, 'player1');
    expect(valid.length).toBe(0);
  });

  it('Raid excludes lanes where the raid piece would win the lane for the enemy', () => {
    const e = engine();
    setPieces(e.state.lanes[0], 'player2', 4); // raid piece would be their 5th
    setPieces(e.state.lanes[1], 'player2', 3);
    const valid = getValidLanesForPerk(51, e.state, 'player1');
    expect(valid).not.toContain(0);
    expect(valid).toEqual([1, 2, 3, 4]);
  });

  it('Disrupt still requires enemy pieces on the first lane but allows an empty destination', () => {
    const e = engine();
    setPieces(e.state.lanes[0], 'player2', 4);
    expect(getValidLanesForPerk(34, e.state, 'player1')).toEqual([0]);
    expect(getValidLanesForPerk(34, e.state, 'player1', 0)).toEqual([1, 2, 3, 4]);
  });
});

describe('Nullify', () => {
  it('clears triggers, deferred, raids, markers and freeze on the lane only', () => {
    const e = engine();
    e.state.lanes[2].triggers.push({ type: 'PORTAL', owner: 2, turnsLeft: 2, orderId: 0 });
    e.state.lanes[2].deferred.push({ type: 'SIGNAL', owner: 2, targetLane: 2 });
    e.state.pendingRaids.push({ owner: 2, lane: 2, turnsUntilResolve: 1, source: 'RAID' });
    e.state.player1Captures.push({ lane: 2, turnsLeft: 3 });
    e.state.player2Sanctuaries.push({ lane: 2, turnsLeft: 4 });
    e.state.frozenLanes[2] = 'player2';
    // Control markers on lane 3 must survive.
    e.state.player2Sanctuaries.push({ lane: 3, turnsLeft: 4 });
    e.state.frozenLanes[3] = 'player2';

    expect(e.nullifyLane(2)).toBe(true);

    expect(e.state.lanes[2].triggers).toHaveLength(0);
    expect(e.state.lanes[2].deferred).toHaveLength(0);
    expect(e.state.pendingRaids).toHaveLength(0);
    expect(e.state.player1Captures).toHaveLength(0);
    expect(e.state.player2Sanctuaries).toEqual([{ lane: 3, turnsLeft: 4 }]);
    expect(e.state.frozenLanes[2]).toBeUndefined();
    expect(e.state.frozenLanes[3]).toBe('player2');
  });
});

describe('RemoveEnemy cooldown', () => {
  it('a successful use disables the slot for the next turn only', () => {
    const e = engine();
    setPieces(e.state.lanes[1], 'player2', 3);
    e.executePerk(2, 1); // p1 removes; turn passes to p2
    expect(countPieces(e.state.lanes[1], 'player2')).toBe(2);
    expect(e.isRemoveEnemyAvailable('player1')).toBe(false);
    expect(e.isRemoveEnemyAvailable('player2')).toBe(true);

    e.endTurn(); // p2 -> p1: p1's next perk phase is still on cooldown
    expect(e.state.currentPlayer).toBe('player1');
    const slots = e.generatePerkSlots();
    expect(slots[1].perkId).toBe(2);
    expect(slots[1].disabled).toBe(true);

    e.endTurn(); // p1 -> p2 (passing doesn't extend the cooldown)
    e.endTurn(); // p2 -> p1: recharged
    expect(e.isRemoveEnemyAvailable('player1')).toBe(true);
    expect(e.generatePerkSlots()[1].disabled).toBe(false);
  });

  it('a failed use does not start the cooldown', () => {
    const e = engine();
    e.executePerk(2, 1); // no enemy pieces on lane 1
    expect(e.isRemoveEnemyAvailable('player1')).toBe(true);
  });

  it('a blocked use removes nothing but still ends the turn', () => {
    const e = engine();
    setPieces(e.state.lanes[1], 'player2', 3);
    e.executePerk(2, 1); // p1 uses it, cooldown starts
    e.endTurn(); // back to p1, still on cooldown
    e.executePerk(2, 1); // blocked
    expect(countPieces(e.state.lanes[1], 'player2')).toBe(2); // unchanged
    expect(e.state.currentPlayer).toBe('player2'); // turn still ended
  });

  it('the AI never picks a disabled RemoveEnemy slot', () => {
    const e = engine(7);
    e.player1IsAI = true;
    e.player1AIDifficulty = 'hard';
    setPieces(e.state.lanes[0], 'player2', 4); // maximal RemoveEnemy incentive
    e.state.currentPhase = 'perkSelection';
    e.currentPerkSlots = e
      .generatePerkSlots()
      .map((s) => (s.perkId === 2 ? { ...s, disabled: true } : s));
    const [perkId] = chooseAIPerk(e);
    expect(perkId).not.toBe(2);
  });
});

describe('AI', () => {
  it('never raids a lane where the enemy has 4 pieces', () => {
    const e = engine(7);
    e.player1IsAI = true;
    e.player1AIDifficulty = 'hard';
    setPieces(e.state.lanes[0], 'player2', 4);
    e.state.currentPhase = 'perkSelection';
    e.currentPerkSlots = [{ slotIndex: 0, perkId: 51, perkName: 'Raid' }];
    const [perkId, target] = chooseAIPerk(e);
    expect(perkId).toBe(51);
    expect(target).not.toBe(0);
  });

  it('drags a stacked enemy lane onto an empty one with Disrupt', () => {
    const e = engine(7);
    e.player1IsAI = true;
    e.player1AIDifficulty = 'hard';
    setPieces(e.state.lanes[0], 'player2', 4);
    e.state.currentPhase = 'perkSelection';
    e.currentPerkSlots = [{ slotIndex: 0, perkId: 34, perkName: 'Disrupt' }];
    const [perkId, target, second] = chooseAIPerk(e);
    expect(perkId).toBe(34);
    expect(second).not.toBeNull();
    const lanes = [target, second as number];
    expect(lanes).toContain(0);
    const destination = lanes.find((l) => l !== 0) as number;
    e.executePerk(perkId, target, second);
    expect(countPieces(e.state.lanes[0], 'player2')).toBe(0);
    expect(countPieces(e.state.lanes[destination], 'player2')).toBe(4);
  });

  it('returns a legal choice and never throws', () => {
    const e = engine(7);
    e.player2IsAI = true;
    e.state.currentPlayer = 'player2';
    e.state.currentPhase = 'perkSelection';
    const [perkId, target, second] = chooseAIPerk(e);
    expect(typeof perkId).toBe('number');
    if (perkId > 0 && PERKS[perkId].requiresTarget && perkId !== 33 && perkId !== 34) {
      expect(target).toBeGreaterThanOrEqual(0);
    }
    void second;
  });
});

describe('full game simulation', () => {
  it('a vs-AI game reaches a terminal state without throwing', () => {
    const e = new CombatEngine('sim', {
      player2IsAI: true,
      player2AIDifficulty: 'hard',
      rng: new SeededRNG(42),
    });
    let guard = 0;
    while (e.state.status === 'playing' && guard < 2000) {
      guard++;
      if (e.state.currentPhase === 'autoPlacement') {
        const placed = e.autoPlace();
        if (placed === -1 && e.state.status === 'playing') {
          // no placement possible; end turn to avoid deadlock
          e.skipTurn();
        }
      } else {
        // perk selection: AI picks for player2, else pass for player1
        if (e.isCurrentPlayerAI) {
          const [perkId, target, second] = chooseAIPerk(e);
          if (perkId === 0) e.skipTurn();
          else e.executePerk(perkId, target, second);
        } else {
          e.skipTurn();
        }
      }
    }
    expect(guard).toBeLessThan(2000);
    expect(e.state.status).toBe('finished');
    expect(['player1', 'player2']).toContain(e.state.gameWinner);
  });
});
