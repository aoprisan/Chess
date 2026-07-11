import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Character } from '../../game/characters';
import { CombatGameState, PlayerSide } from '../../game/state';
import { CharacterPortrait } from '../CharacterPortrait';
import { Icon } from '../Icons';
import { clamp } from './theme';
import { LaneEffects } from './LaneEffects';
import { LaneSelection } from './LaneSelection';
import { FogOverlay } from './FogOverlay';
import type { LastPlacement } from './useTurnLoop';

// --- Game board ---------------------------------------------------------------

/** A one-shot "bot removed" flash at a board cell. */
interface BoardBurst {
  key: string;
  x: number;
  y: number;
  side: PlayerSide;
}

export function GameBoard({
  W,
  state,
  player1Hero,
  player2Hero,
  hideP1,
  hideP2,
  p1FogLabel,
  p2FogLabel,
  lastPlacement,
  isSelectingLane,
  selectedPerkId,
  firstSelectedLane,
  validLanes,
  onLaneClick,
}: {
  W: number;
  state: CombatGameState;
  player1Hero: Character;
  player2Hero: Character;
  hideP1: boolean;
  hideP2: boolean;
  p1FogLabel: string | null;
  p2FogLabel: string | null;
  lastPlacement: LastPlacement | null;
  isSelectingLane: boolean;
  selectedPerkId: number | null;
  firstSelectedLane: number | null;
  validLanes: number[];
  onLaneClick: (i: number) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const radius = clamp(W * 0.015, 10, 20);
  const padding = clamp(W * 0.008, 4, 10);
  const centerLineW = clamp(W * 0.004, 3, 5);
  const pieceSize = clamp(W * 0.045, 34, 55);

  const bw = box.w;
  const bh = box.h;
  const cellW = bw / 10;
  const cellH = bh / 5;
  const halfW = bw / 2;

  // Removal bursts: bots that vanished since the previous render pop out with
  // a visible flash instead of silently disappearing (readable without text).
  const [bursts, setBursts] = useState<BoardBurst[]>([]);
  const prevColsRef = useRef<Record<PlayerSide, boolean[][]> | null>(null);
  const burstSeq = useRef(0);
  useEffect(() => {
    const snapshot: Record<PlayerSide, boolean[][]> = {
      player1: state.lanes.map((l) => [...l.player1Columns]),
      player2: state.lanes.map((l) => [...l.player2Columns]),
    };
    const prev = prevColsRef.current;
    prevColsRef.current = snapshot;
    if (!prev || bw === 0) return;
    const found: BoardBurst[] = [];
    (['player1', 'player2'] as PlayerSide[]).forEach((side) => {
      if (side === 'player1' ? hideP1 : hideP2) return;
      state.lanes.forEach((lane, li) => {
        const prevCols = prev[side][li] ?? [];
        const cols = side === 'player1' ? lane.player1Columns : lane.player2Columns;
        cols.forEach((filled, c) => {
          if (!prevCols[c] || filled) return;
          const gridCol = side === 'player1' ? c : 9 - c;
          burstSeq.current += 1;
          found.push({
            key: `burst-${burstSeq.current}`,
            x: gridCol * cellW + (cellW - pieceSize) / 2,
            y: li * cellH + (cellH - pieceSize) / 2,
            side,
          });
        });
      });
    });
    if (found.length > 0) {
      setBursts((bs) => [...bs, ...found]);
      const keys = new Set(found.map((b) => b.key));
      setTimeout(() => setBursts((bs) => bs.filter((b) => !keys.has(b.key))), 650);
    }
  });

  const pieces: ReactNode[] = [];
  if (bw > 0) {
    state.lanes.forEach((lane, laneIndex) => {
      (['player1', 'player2'] as PlayerSide[]).forEach((side) => {
        if (side === 'player1' && hideP1) return;
        if (side === 'player2' && hideP2) return;
        const cols = side === 'player1' ? lane.player1Columns : lane.player2Columns;
        const hero = side === 'player1' ? player1Hero : player2Hero;
        const maxFilled = cols.lastIndexOf(true);
        cols.forEach((filled, c) => {
          if (!filled) return;
          const gridCol = side === 'player1' ? c : 9 - c;
          const x = gridCol * cellW + (cellW - pieceSize) / 2;
          const y = laneIndex * cellH + (cellH - pieceSize) / 2;
          const isNewest =
            lastPlacement !== null &&
            lastPlacement.lane === laneIndex &&
            lastPlacement.player === side &&
            c === maxFilled;
          const slideDist = side === 'player1' ? x + pieceSize : bw - x;
          pieces.push(
            <div
              key={
                isNewest
                  ? `${side}-${laneIndex}-${c}-anim${lastPlacement.counter}`
                  : `${side}-${laneIndex}-${c}`
              }
              className={`piece ${side === 'player1' ? 'p1' : 'p2'}${isNewest ? (side === 'player1' ? ' slide-left' : ' slide-right') : ''}`}
              style={
                {
                  left: x,
                  top: y,
                  width: pieceSize,
                  height: pieceSize,
                  '--slide-dist': `${slideDist}px`,
                } as CSSProperties
              }
            >
              <CharacterPortrait character={hero} className="portrait" />
            </div>,
          );
        });
      });
    });
  }

  return (
    <div className="game-field" ref={boardRef} style={{ flex: 1, borderRadius: radius }}>
      <div className="field-inner" style={{ margin: padding }}>
        {/* Cyan energy core rising from the board center (concept art) */}
        <div className="field-core" />

        {/* Neon grid — hot magenta major lines with bloom over a faint
            sub-grid, lit junctions, and cyan connector details, matching
            the pink holo-board concept art. */}
        {bw > 0 && (
          <svg
            width={bw}
            height={bh}
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          >
            {/* faint sub-grid at half-cell pitch */}
            {Array.from({ length: 10 }, (_, i) => (
              <line
                key={`mv${i}`}
                x1={(i + 0.5) * cellW}
                y1={0}
                x2={(i + 0.5) * cellW}
                y2={bh}
                stroke="rgba(255,47,214,0.1)"
                strokeWidth={1}
              />
            ))}
            {Array.from({ length: 5 }, (_, i) => (
              <line
                key={`mh${i}`}
                x1={0}
                y1={(i + 0.5) * cellH}
                x2={bw}
                y2={(i + 0.5) * cellH}
                stroke="rgba(255,47,214,0.1)"
                strokeWidth={1}
              />
            ))}
            {/* major lines: wide glow pass + bright core pass */}
            {Array.from({ length: 9 }, (_, i) => (
              <g key={`v${i}`}>
                <line
                  x1={(i + 1) * cellW}
                  y1={0}
                  x2={(i + 1) * cellW}
                  y2={bh}
                  stroke="rgba(255,47,214,0.4)"
                  strokeWidth={5}
                />
                <line
                  x1={(i + 1) * cellW}
                  y1={0}
                  x2={(i + 1) * cellW}
                  y2={bh}
                  stroke="rgba(255,150,238,0.95)"
                  strokeWidth={1.5}
                />
              </g>
            ))}
            {Array.from({ length: 4 }, (_, i) => (
              <g key={`h${i}`}>
                <line
                  x1={0}
                  y1={(i + 1) * cellH}
                  x2={bw}
                  y2={(i + 1) * cellH}
                  stroke="rgba(255,47,214,0.4)"
                  strokeWidth={5}
                />
                <line
                  x1={0}
                  y1={(i + 1) * cellH}
                  x2={bw}
                  y2={(i + 1) * cellH}
                  stroke="rgba(255,150,238,0.95)"
                  strokeWidth={1.5}
                />
              </g>
            ))}
            {/* lit junction nodes at major intersections */}
            {Array.from({ length: 9 }, (_, c) =>
              Array.from({ length: 4 }, (_, r) => (
                <g key={`j${c}-${r}`}>
                  <circle
                    cx={(c + 1) * cellW}
                    cy={(r + 1) * cellH}
                    r={4}
                    fill="rgba(255,47,214,0.3)"
                  />
                  <circle
                    cx={(c + 1) * cellW}
                    cy={(r + 1) * cellH}
                    r={1.7}
                    fill="rgba(255,190,244,0.95)"
                  />
                </g>
              )),
            )}
            {/* cyan corner brackets */}
            {(
              [
                [4, 4, 1, 1],
                [bw - 4, 4, -1, 1],
                [4, bh - 4, 1, -1],
                [bw - 4, bh - 4, -1, -1],
              ] as const
            ).map(([x, y, sx, sy], i) => (
              <path
                key={`cb${i}`}
                d={`M ${x + sx * 16} ${y} L ${x} ${y} L ${x} ${y + sy * 16}`}
                fill="none"
                stroke="rgba(0,229,255,0.8)"
                strokeWidth={2.5}
              />
            ))}
            {/* cyan connector chips at the mid-edges */}
            {(
              [
                [bw / 2 - 14, 1.5, 28, 4],
                [bw / 2 - 14, bh - 5.5, 28, 4],
                [1.5, bh / 2 - 14, 4, 28],
                [bw - 5.5, bh / 2 - 14, 4, 28],
              ] as const
            ).map(([x, y, w, h], i) => (
              <rect key={`ec${i}`} x={x} y={y} width={w} height={h} fill="rgba(0,229,255,0.55)" />
            ))}
            {/* center emblem on the median line */}
            <g>
              <circle cx={bw / 2} cy={bh / 2} r={13} fill="rgba(0,229,255,0.12)" />
              <path
                d={`M ${bw / 2} ${bh / 2 - 9} L ${bw / 2 + 7} ${bh / 2} L ${bw / 2} ${bh / 2 + 9} L ${bw / 2 - 7} ${bh / 2} Z`}
                fill="rgba(10,14,26,0.85)"
                stroke="rgba(0,229,255,0.9)"
                strokeWidth={1.5}
              />
              <circle cx={bw / 2} cy={bh / 2} r={2} fill="#00e5ff" />
            </g>
          </svg>
        )}

        {/* Lane win tints */}
        {bw > 0 &&
          state.lanes.map((lane, i) =>
            lane.winner ? (
              <div
                key={`win${i}`}
                className="lane-overlay"
                style={{
                  left: 0,
                  top: i * cellH,
                  width: bw,
                  height: cellH,
                  background:
                    lane.winner === 'player1' ? 'rgba(0,229,255,0.16)' : 'rgba(255,47,214,0.16)',
                  border: `2px solid ${lane.winner === 'player1' ? '#00e5ff' : '#ff2fd6'}`,
                }}
              />
            ) : null,
          )}

        {/* Frozen lane tints */}
        {bw > 0 &&
          Object.entries(state.frozenLanes).map(([laneStr, frozenBy]) => {
            const i = Number(laneStr);
            if (state.lanes[i]?.winner) return null;
            const rightSide = frozenBy === 'player1';
            return (
              <div
                key={`frozen${i}`}
                className="lane-overlay"
                style={{
                  left: rightSide ? halfW : 0,
                  top: i * cellH,
                  width: halfW,
                  height: cellH,
                  background: 'rgba(33,150,243,0.25)',
                  border: '2px solid #42A5F5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <Icon name="snowflake" size={16} color="#64B5F6" />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#64B5F6' }}>FROZEN</span>
              </div>
            );
          })}

        {/* Lane effect pills */}
        {bw > 0 && <LaneEffects state={state} cellH={cellH} halfW={halfW} />}

        {/* Center line */}
        <div className="center-line" style={{ width: centerLineW, marginLeft: -centerLineW / 2 }} />

        {/* Pieces */}
        {pieces}

        {/* Removal bursts */}
        {bursts.map((b) => (
          <div
            key={b.key}
            className={`piece ${b.side === 'player1' ? 'p1' : 'p2'} burst-out`}
            style={{ left: b.x, top: b.y, width: pieceSize, height: pieceSize }}
          >
            <Icon
              name="burst"
              size={pieceSize * 0.6}
              color={b.side === 'player1' ? '#00e5ff' : '#ff2fd6'}
            />
          </div>
        ))}

        {/* Fog banners over halves hidden by Cloak/Blind */}
        {bw > 0 && hideP1 && p1FogLabel && (
          <FogOverlay left={0} width={halfW} height={bh} label={p1FogLabel} />
        )}
        {bw > 0 && hideP2 && p2FogLabel && (
          <FogOverlay left={halfW} width={halfW} height={bh} label={p2FogLabel} />
        )}

        {/* Lane selection highlights */}
        {bw > 0 && isSelectingLane && selectedPerkId !== null && (
          <LaneSelection
            state={state}
            selectedPerkId={selectedPerkId}
            firstSelectedLane={firstSelectedLane}
            validLanes={validLanes}
            cellH={cellH}
            halfW={halfW}
            bw={bw}
            onLaneClick={onLaneClick}
          />
        )}
      </div>
    </div>
  );
}
