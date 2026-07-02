import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { AdventureMapDef, AdventureNode, Biome } from '../adventure/map';
import { AdventureController, clearSavedJourney } from '../adventure/progress';
import { HeroType } from '../game/hero';
import { Combat, CombatResult } from './Combat';
import { biomeBg, obstacleArt, OBSTACLE_LABEL, heroImage, ui } from './assets';

const MAP_HEIGHT_FACTOR = 3.6;

type Popup =
  | null
  | { kind: 'obstacle'; node: AdventureNode }
  | { kind: 'treasure'; node: AdventureNode }
  | { kind: 'encounter'; node: AdventureNode }
  | { kind: 'fight'; node: AdventureNode }
  | { kind: 'result'; message: string };

export function AdventureMap({
  map,
  newJourneyHero,
  onExit,
}: {
  map: AdventureMapDef;
  newJourneyHero?: HeroType;
  onExit: () => void;
}) {
  const ctrlRef = useRef<AdventureController | null>(null);
  if (ctrlRef.current === null) {
    ctrlRef.current = new AdventureController(map, newJourneyHero);
  }
  const ctrl = ctrlRef.current;

  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const mutate = useCallback((fn: () => void) => { fn(); bump(); }, [bump]);

  const [popup, setPopup] = useState<Popup>(null);
  const [toast, setToast] = useState<string | null>(null);
  const eventLock = useRef(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 0, height: 0 });
  const scrolledRef = useRef(false);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setDims({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const mapHeight = dims.height * MAP_HEIGHT_FACTOR;

  // Auto-scroll to the current node once measured.
  useEffect(() => {
    if (scrolledRef.current || dims.height === 0) return;
    scrolledRef.current = true;
    const node = ctrl.currentNode;
    const target = node.y * mapHeight - dims.height / 2;
    scrollRef.current?.scrollTo({ top: Math.max(0, target) });
  }, [dims.height, mapHeight, ctrl]);

  const scrollToCurrent = () => {
    const node = ctrl.currentNode;
    const target = node.y * mapHeight - dims.height / 2;
    scrollRef.current?.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const triggerEvent = useCallback(
    (node: AdventureNode) => {
      switch (node.type) {
        case 'start':
        case 'path':
          return;
        case 'finish':
          if (!ctrl.progress.completed) mutate(() => ctrl.completeJourney());
          return;
        case 'obstacle':
          if (ctrl.isNodeCleared(node)) return;
          setPopup({ kind: 'obstacle', node });
          return;
        case 'treasure':
          if (ctrl.isNodeCleared(node)) return;
          setPopup({ kind: 'treasure', node });
          return;
        case 'rival':
          setPopup({ kind: 'encounter', node });
          return;
      }
    },
    [ctrl, mutate],
  );

  const onNodeTap = (node: AdventureNode) => {
    if (eventLock.current || popup !== null) return;
    if (!ctrl.canTapNode(node)) {
      if (!ctrl.progress.completed && !ctrl.isNodeCleared(ctrl.currentNode)) {
        showToast(blockedHint(ctrl, ctrl.currentNode));
      } else if (!ctrl.isAdjacentToPlayer(node) && node.id !== ctrl.progress.currentNodeId) {
        showToast('You can only walk to a connected spot!');
      }
      return;
    }
    eventLock.current = true;
    const standingHere = node.id === ctrl.progress.currentNodeId;
    if (!standingHere) {
      mutate(() => ctrl.moveToNode(node.id));
      setTimeout(() => {
        eventLock.current = false;
        if (!ctrl.isNodeCleared(node)) triggerEvent(node);
      }, 700);
    } else {
      eventLock.current = false;
      triggerEvent(node);
    }
  };

  // --- Fight flow ---
  const onFightEnd = (node: AdventureNode, result: CombatResult) => {
    const rival = ctrl.rivalForNode(node);
    if (result.stars > 0) {
      mutate(() => ctrl.recordFightResult(node.id, result.stars));
      setPopup({ kind: 'result', message: `You defeated ${rival.name}! ${'⭐'.repeat(result.stars)} The path is open!` });
    } else {
      setPopup({ kind: 'result', message: `${rival.name} won this time — try again!` });
    }
  };

  if (popup?.kind === 'fight') {
    const node = popup.node;
    const rival = ctrl.rivalForNode(node);
    return (
      <Combat
        player1Hero={ctrl.playerHero}
        player2Hero={rival}
        aiDifficulty={ctrl.difficultyForNode(node)}
        isBoss={ctrl.isBossNode(node)}
        onGameEnd={(result) => onFightEnd(node, result)}
        onExit={() => setPopup(null)}
      />
    );
  }

  return (
    <div className="screen">
      <div className="adv-scroll" ref={scrollRef}>
        <div className="adv-map" style={{ height: mapHeight }}>
          {/* Biome backgrounds: peaks top, meadow bottom */}
          <BiomePanel biome="peaks" top={0} width={dims.width} height={mapHeight / 3} />
          <BiomePanel biome="forest" top={mapHeight / 3} width={dims.width} height={mapHeight / 3} />
          <BiomePanel biome="meadow" top={(mapHeight / 3) * 2} width={dims.width} height={mapHeight / 3} />

          {/* Dashed trails */}
          {dims.width > 0 && <Edges map={map} ctrl={ctrl} width={dims.width} height={mapHeight} />}

          {/* Nodes */}
          {dims.width > 0 &&
            map.nodes.map((node) => (
              <NodeMarker
                key={node.id}
                node={node}
                ctrl={ctrl}
                width={dims.width}
                height={mapHeight}
                onTap={() => onNodeTap(node)}
              />
            ))}

          {/* Player token */}
          {dims.width > 0 && (
            <div
              className="player-token"
              style={{
                left: ctrl.currentNode.x * dims.width,
                top: ctrl.currentNode.y * mapHeight - nodeSize(dims.width) * 0.8,
                width: nodeSize(dims.width) * 1.05,
                height: nodeSize(dims.width) * 1.05,
              }}
            >
              <img src={heroImage(ctrl.playerHero.imagePath)} alt="you" />
            </div>
          )}
        </div>
      </div>

      {/* Header overlay */}
      <div className="overlay-header">
        <button className="chip" onClick={onExit}>← Menu</button>
        <span style={{ flex: 1 }} />
        <button className="chip" onClick={scrollToCurrent}>
          ⭐ {ctrl.totalStars}/{ctrl.maxStars}
        </button>
        <button
          className="chip"
          onClick={() => {
            if (confirm('Erase this journey and start over?')) {
              clearSavedJourney();
              onExit();
            }
          }}
        >
          ↻
        </button>
      </div>

      {toast && (
        <div style={{ position: 'absolute', bottom: 24, left: 16, right: 16, zIndex: 30, display: 'flex', justifyContent: 'center' }}>
          <div className="chip" style={{ fontSize: 15, textAlign: 'center' }}>{toast}</div>
        </div>
      )}

      {popup?.kind === 'obstacle' && (
        <ObstaclePopup
          node={popup.node}
          onClear={() => { mutate(() => ctrl.markObstacleCleared(popup.node.id)); setPopup(null); }}
          onClose={() => setPopup(null)}
        />
      )}
      {popup?.kind === 'treasure' && (
        <TreasurePopup
          onOpen={() => { mutate(() => ctrl.openTreasure(popup.node.id)); setPopup(null); }}
          onClose={() => setPopup(null)}
        />
      )}
      {popup?.kind === 'encounter' && (
        <EncounterPopup
          ctrl={ctrl}
          node={popup.node}
          onFight={() => setPopup({ kind: 'fight', node: popup.node })}
          onClose={() => setPopup(null)}
        />
      )}
      {popup?.kind === 'result' && (
        <div className="modal-scrim" onClick={() => setPopup(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <p style={{ fontSize: 18 }}>{popup.message}</p>
            <button className="btn" onClick={() => setPopup(null)}>OK</button>
          </div>
        </div>
      )}

      {ctrl.progress.completed && (
        <VictoryOverlay
          ctrl={ctrl}
          onPlayAgain={() => { clearSavedJourney(); onExit(); }}
          onMenu={onExit}
        />
      )}
    </div>
  );
}

function nodeSize(width: number): number {
  return Math.max(52, Math.min(100, width * 0.15));
}

function BiomePanel({ biome, top, width, height }: { biome: Biome; top: number; width: number; height: number }) {
  const labels: Record<Biome, string> = {
    meadow: '🌼 Sunny Meadow',
    forest: '🌲 Whispering Forest',
    peaks: '🏔️ Frosty Peaks',
  };
  return (
    <div
      className="biome-panel"
      style={{ top, height, width, backgroundImage: `url(${biomeBg(biome)})` }}
    >
      <span className="biome-label">{labels[biome]}</span>
    </div>
  );
}

function Edges({ map, ctrl, width, height }: { map: AdventureMapDef; ctrl: AdventureController; width: number; height: number }) {
  return (
    <svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
      {map.edges.map(([a, b], i) => {
        const na = map.nodeById(a);
        const nb = map.nodeById(b);
        const walked = ctrl.progress.visitedNodes.has(a) && ctrl.progress.visitedNodes.has(b);
        return (
          <line
            key={i}
            x1={na.x * width}
            y1={na.y * height}
            x2={nb.x * width}
            y2={nb.y * height}
            stroke={walked ? 'rgba(93,64,55,0.7)' : 'rgba(93,64,55,0.3)'}
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray="10 12"
          />
        );
      })}
    </svg>
  );
}

function NodeMarker({
  node,
  ctrl,
  width,
  height,
  onTap,
}: {
  node: AdventureNode;
  ctrl: AdventureController;
  width: number;
  height: number;
  onTap: () => void;
}) {
  const size = node.type === 'rival' ? nodeSize(width) * 1.2 : nodeSize(width);
  const stateClass = visualState(ctrl, node);
  const stars = node.type === 'rival' ? ctrl.starsForNode(node.id) : 0;

  return (
    <button
      className={`adv-node ${stateClass}`}
      style={{ left: node.x * width, top: node.y * height }}
      onClick={onTap}
    >
      <div className="marker" style={{ width: size, height: size }}>
        <NodeGlyph node={node} ctrl={ctrl} />
      </div>
      {node.type === 'rival' && (
        <div className="node-stars">{stars > 0 ? '⭐'.repeat(stars) : ''}</div>
      )}
    </button>
  );
}

function NodeGlyph({ node, ctrl }: { node: AdventureNode; ctrl: AdventureController }) {
  switch (node.type) {
    case 'start': return <span>🚩</span>;
    case 'path': return <span style={{ fontSize: 12 }}>•</span>;
    case 'finish': return <span>🏰</span>;
    case 'treasure':
      return (
        <img
          src={ctrl.isNodeCleared(node) ? ui.chestOpen : ui.chestClosed}
          alt="chest"
          onError={(e) => (e.currentTarget.replaceWith(document.createTextNode(ctrl.isNodeCleared(node) ? '📭' : '🎁')))}
        />
      );
    case 'obstacle':
      return (
        <img
          src={obstacleArt(node.obstacle!)}
          alt="obstacle"
          onError={(e) => (e.currentTarget.replaceWith(document.createTextNode('🚧')))}
        />
      );
    case 'rival': {
      const rival = ctrl.rivalForNode(node);
      return <img src={heroImage(rival.imagePath)} alt={rival.name} />;
    }
  }
}

function visualState(ctrl: AdventureController, node: AdventureNode): string {
  const isCurrent = node.id === ctrl.progress.currentNodeId;
  if (isCurrent) return ctrl.isNodeCleared(node) ? 'visited' : 'current';
  if (ctrl.canMoveTo(node) && !ctrl.isNodeVisited(node)) return 'next';
  if (ctrl.isNodeVisited(node)) return ctrl.isNodeCleared(node) ? 'cleared' : 'visited';
  return 'locked';
}

function blockedHint(ctrl: AdventureController, node: AdventureNode): string {
  switch (node.type) {
    case 'rival':
      return `Defeat ${ctrl.rivalForNode(node).name} to open the path!`;
    case 'obstacle':
      return 'Clear the obstacle to keep going!';
    case 'treasure':
      return 'Open the treasure chest first!';
    default:
      return 'Tap a glowing spot!';
  }
}

function ObstaclePopup({ node, onClear, onClose }: { node: AdventureNode; onClear: () => void; onClose: () => void }) {
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{OBSTACLE_LABEL[node.obstacle!]}</h2>
        <img className="art" src={obstacleArt(node.obstacle!)} alt="obstacle" onError={(e) => (e.currentTarget.style.display = 'none')} />
        <p>Something's blocking the path. Clear it to move on!</p>
        <div className="row">
          <button className="btn secondary" onClick={onClose}>Back</button>
          <button className="btn" onClick={onClear}>✨ Clear it!</button>
        </div>
      </div>
    </div>
  );
}

function TreasurePopup({ onOpen, onClose }: { onOpen: () => void; onClose: () => void }) {
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Treasure!</h2>
        <img className="art" src={ui.chestClosed} alt="chest" onError={(e) => (e.currentTarget.style.display = 'none')} />
        <p>A shiny chest! Open it for ⭐⭐.</p>
        <div className="row">
          <button className="btn secondary" onClick={onClose}>Back</button>
          <button className="btn" onClick={onOpen}>🎁 Open</button>
        </div>
      </div>
    </div>
  );
}

function EncounterPopup({
  ctrl,
  node,
  onFight,
  onClose,
}: {
  ctrl: AdventureController;
  node: AdventureNode;
  onFight: () => void;
  onClose: () => void;
}) {
  const rival = ctrl.rivalForNode(node);
  const isBoss = ctrl.isBossNode(node);
  const prev = ctrl.starsForNode(node.id);
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isBoss ? `👑 Boss: ${rival.name}` : `Rival: ${rival.name}`}</h2>
        <div className="row" style={{ alignItems: 'center' }}>
          <img className="art" style={{ width: 90, height: 90 }} src={heroImage(ctrl.playerHero.imagePath)} alt="you" />
          <img src={ui.vs} alt="vs" style={{ width: 44, height: 44, objectFit: 'contain' }} onError={(e) => (e.currentTarget.replaceWith(document.createTextNode('⚔️')))} />
          <img className="art" style={{ width: 90, height: 90 }} src={heroImage(rival.imagePath)} alt={rival.name} />
        </div>
        <p>Difficulty: {ctrl.difficultyForNode(node)}{prev > 0 ? ` · best ${'⭐'.repeat(prev)}` : ''}</p>
        <div className="row">
          <button className="btn secondary" onClick={onClose}>Back</button>
          <button className="btn" onClick={onFight}>⚔️ Fight!</button>
        </div>
      </div>
    </div>
  );
}

function VictoryOverlay({ ctrl, onPlayAgain, onMenu }: { ctrl: AdventureController; onPlayAgain: () => void; onMenu: () => void }) {
  return (
    <div className="modal-scrim">
      <div className="modal">
        <div style={{ fontSize: 40 }}>🎉</div>
        <h2>Journey Complete!</h2>
        <img className="art" src={heroImage(ctrl.playerHero.imagePath)} alt="hero" />
        <p>{ctrl.playerHero.name} reached the summit!</p>
        <div className="stars-big">⭐ {ctrl.totalStars} / {ctrl.maxStars}</div>
        <div className="row">
          <button className="btn" onClick={onPlayAgain}>New Journey</button>
          <button className="btn secondary" onClick={onMenu}>Menu</button>
        </div>
      </div>
    </div>
  );
}
