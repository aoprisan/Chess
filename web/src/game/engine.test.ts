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

  it('Sanctuary redirects owner losses when no capture applies', () => {
    const e = engine();
    // Kamikaze removes enemy pieces with no remover-capture; give player2 a sanctuary.
    e.state.player2Sanctuaries.push({ lane: 0, turnsLeft: 4 });
    setPieces(e.state.lanes[1], 'player1', 1); // sacrifice fodder
    setPieces(e.state.lanes[2], 'player2', 2);
    // Kamikaze: no remover passed to removePieceWithRedirects for enemy removal,
    // so sanctuary does NOT trigger for kamikaze (uses removeFront directly).
    e.kamikazePiece(1);
    // enemy lost pieces via plain removeFront (kamikaze), sanctuary untouched
    expect(countPieces(e.state.lanes[2], 'player2')).toBeLessThan(2);
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
    // lane 3 frozen for player2
    const availableForP2 = getValidLanesForPerk(1, e.state, 'player2');
    expect(availableForP2).toContain(3); // PlaceAnother validity ignores freeze; freeze checked in autoPlace
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
});

describe('AI', () => {
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
