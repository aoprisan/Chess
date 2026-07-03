import { useEffect, useLayoutEffect, useRef, useState, useCallback, MouseEvent as ReactMouseEvent } from 'react';
import { AdventureMapDef, AdventureNode, Biome, ObstacleType } from '../adventure/map';
import { AdventureController, clearSavedJourney } from '../adventure/progress';
import { journeyById, nextJourney, recordJourneyCompletion } from '../adventure/levels';
import { HeroType } from '../game/hero';
import { Combat, CombatResult } from './Combat';
import { biomeBg, obstacleArt, OBSTACLE_INFO, heroImage, ui } from './assets';
import { AssetGate } from './AssetGate';
import { Icon } from './Icons';

// Visuals mirror client/lib/screens/adventure_map_screen.dart:
// mapHeight = viewport * map.heightFactor (bigger levels scroll longer),
// three biome panels, dashed trails, pulse rings on quest objectives,
// cream chips, cream dialogs.
// Movement goes further than the Flutter client: tap anywhere on the
// trail — however far — and the hero roams there hop-by-hop (BFS path
// through cleared nodes), so the map plays like a quest rather than a
// level select.

// One hop along a trail edge while the hero walks (must match the
// .player-token CSS transition duration).
const HOP_MS = 380;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Popup =
  | null
  | { kind: 'obstacle'; node: AdventureNode }
  | { kind: 'treasure'; node: AdventureNode }
  | { kind: 'encounter'; node: AdventureNode }
  | { kind: 'fight'; node: AdventureNode }
  | { kind: 'startOver' };

export function AdventureMap({
  map,
  newJourneyHero,
  onExit,
  onNewJourney,
  onNextLevel,
}: {
  map: AdventureMapDef;
  newJourneyHero?: HeroType;
  onExit: () => void;
  onNewJourney: () => void;
  /** Start the next level's journey with the given hero (absent on the last level). */
  onNextLevel: (hero: HeroType) => void;
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
  const [walking, setWalking] = useState(false);
  const eventLock = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  // Record completion in the level store whenever a completed journey is on
  // screen (idempotent). Catching it here rather than only at the moment the
  // hero steps on the finish node also unlocks the next level for journeys
  // completed before the level system existed.
  const completed = ctrl.progress.completed;
  useEffect(() => {
    if (completed) recordJourneyCompletion(map.id, ctrl.totalStars);
  }, [completed, ctrl, map]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollObserver = useRef<ResizeObserver | null>(null);
  const needsCenter = useRef(true);
  const [dims, setDims] = useState({ width: 0, height: 0 });

  // The scroll container unmounts whenever a battle takes over the screen, so
  // measurement must re-attach on every mount (a mount-once effect left the
  // ResizeObserver bound to the dead element: it reported 0x0 as the old map
  // was torn down and never saw the new one, so the map came back blank after
  // every fight).
  const attachScroll = useCallback((el: HTMLDivElement | null) => {
    scrollRef.current = el;
    scrollObserver.current?.disconnect();
    scrollObserver.current = null;
    if (!el) return;
    needsCenter.current = true;
    const measure = () => setDims({ width: el.clientWidth, height: el.clientHeight });
    measure();
    scrollObserver.current = new ResizeObserver(measure);
    scrollObserver.current.observe(el);
  }, []);

  const mapHeight = dims.height * map.heightFactor;
  const nodeSize = Math.max(52, Math.min(100, dims.width * 0.15));

  // Center the camera on the hero after each (re)mount — both first load and
  // returning from a battle. This must wait until dims are measured and the
  // map div is laid out at full height, or the scroll clamps to the top.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!needsCenter.current || dims.height === 0 || !el) return;
    needsCenter.current = false;
    el.scrollTo({ top: Math.max(0, ctrl.currentNode.y * mapHeight - dims.height / 2) });
  });

  const scrollToCurrent = () => {
    const node = ctrl.currentNode;
    const target = node.y * mapHeight - dims.height / 2;
    scrollRef.current?.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  };

  // Keep the camera on the hero while they roam the trails.
  const followHero = useCallback(
    (node: AdventureNode) => {
      const target = node.y * mapHeight - dims.height / 2;
      scrollRef.current?.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    },
    [mapHeight, dims.height],
  );

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
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

  // Walk the hero hop-by-hop along [path], camera following, then trigger
  // whatever waits at the destination. This is what makes the map feel like
  // a quest: one tap sends the hero roaming the whole trail.
  const walkTo = useCallback(
    async (node: AdventureNode, path: string[]) => {
      eventLock.current = true;
      setWalking(true);
      try {
        for (const stepId of path) {
          mutate(() => ctrl.moveToNode(stepId));
          followHero(ctrl.currentNode);
          await sleep(HOP_MS);
          if (!aliveRef.current) return;
        }
      } finally {
        eventLock.current = false;
        setWalking(false);
      }
      if (!ctrl.isNodeCleared(node)) triggerEvent(node);
    },
    [ctrl, mutate, followHero, triggerEvent],
  );

  const onNodeTap = (node: AdventureNode) => {
    if (eventLock.current || popup !== null) return;
    if (node.id === ctrl.progress.currentNodeId) {
      // Retry the event underfoot, or rematch a defeated rival.
      if (ctrl.canTapNode(node)) triggerEvent(node);
      return;
    }
    const path = ctrl.pathTo(node.id);
    if (path === null || path.length === 0) {
      if (!ctrl.progress.completed && !ctrl.isNodeCleared(ctrl.currentNode)) {
        showToast(blockedHint(ctrl, ctrl.currentNode));
      } else {
        showToast("You can't reach that spot yet — find another way!");
      }
      return;
    }
    void walkTo(node, path);
  };

  // Tap anywhere on the map — the hero walks to the nearest spot on the
  // trail. Node buttons stop propagation, so this only sees ground taps.
  const onMapTap = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (eventLock.current || popup !== null || dims.width === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let nearest: AdventureNode | null = null;
    let nearestDist = Infinity;
    for (const node of map.nodes) {
      const dist = Math.hypot(node.x * dims.width - x, node.y * mapHeight - y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = node;
      }
    }
    if (nearest && nearestDist <= nodeSize * 2) onNodeTap(nearest);
  };

  // --- Fight flow: combat shows its own winner banner; the map shows a snackbar after. ---
  const onFightEnd = (node: AdventureNode, result: CombatResult) => {
    const rival = ctrl.rivalForNode(node);
    setPopup(null);
    if (result.stars > 0) {
      mutate(() => ctrl.recordFightResult(node.id, result.stars));
      showToast(`You defeated ${rival.name}! ${'⭐'.repeat(result.stars)} The path is open!`);
    } else {
      showToast(`${rival.name} won this time — try again!`);
    }
  };

  if (popup?.kind === 'fight') {
    const node = popup.node;
    const rival = ctrl.rivalForNode(node);
    return (
      <AssetGate groups={['combat']}>
        <Combat
          player1Hero={ctrl.playerHero}
          player2Hero={rival}
          aiDifficulty={ctrl.difficultyForNode(node)}
          onGameEnd={(result) => onFightEnd(node, result)}
        />
      </AssetGate>
    );
  }

  return (
    <div className="screen">
      <div className="adv-scroll" ref={attachScroll}>
        <div className="adv-map" style={{ height: mapHeight }} onClick={onMapTap}>
          {/* Biome backgrounds: peaks top, meadow bottom */}
          <BiomePanel biome="peaks" top={0} height={mapHeight / 3} />
          <BiomePanel biome="forest" top={mapHeight / 3} height={mapHeight / 3} />
          <BiomePanel biome="meadow" top={(mapHeight / 3) * 2} height={mapHeight / 3} />

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
                nodeSize={nodeSize}
                onTap={() => onNodeTap(node)}
              />
            ))}

          {/* Player token (sits just above the current node, 650ms ease move) */}
          {dims.width > 0 && (
            <div
              className={`player-token${walking ? ' walking' : ''}`}
              style={{
                left: ctrl.currentNode.x * dims.width - nodeSize * 0.55,
                top: ctrl.currentNode.y * mapHeight - nodeSize * 1.25,
                width: nodeSize * 1.1,
                height: nodeSize * 1.1,
              }}
            >
              <img src={heroImage(ctrl.playerHero.imagePath)} alt="you" />
            </div>
          )}
        </div>
      </div>

      {/* Header overlay */}
      <div className="overlay-header">
        <button className="chip" onClick={onExit}>
          <Icon name="arrowBack" size={20} color="#5D4037" />
          Menu
        </button>
        <span style={{ width: 8 }} />
        <span className="chip">
          {journeyById(map.id) ? `Level ${journeyById(map.id)!.level}` : map.name}
        </span>
        <span style={{ flex: 1 }} />
        <button className="chip" onClick={scrollToCurrent}>
          <Icon name="star" size={20} color="#FFC107" />
          {ctrl.totalStars} / {ctrl.maxStars}
        </button>
        <span style={{ width: 8 }} />
        <button className="chip" onClick={() => setPopup({ kind: 'startOver' })}>
          <Icon name="refresh" size={20} color="#5D4037" />
        </button>
      </div>

      {toast && <div className="snackbar">{toast}</div>}

      {popup?.kind === 'startOver' && (
        <div className="modal-scrim" onClick={() => setPopup(null)}>
          <div className="modal" style={{ alignItems: 'stretch' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="alert-title">Start Over?</h3>
            <p className="alert-body">This will erase your journey and let you pick a new hero.</p>
            <div className="alert-actions">
              <button style={{ color: '#8D6E63' }} onClick={() => setPopup(null)}>Cancel</button>
              <button
                style={{ color: '#5D4037', fontWeight: 700 }}
                onClick={() => {
                  clearSavedJourney(map.id);
                  onNewJourney();
                }}
              >
                Start Over
              </button>
            </div>
          </div>
        </div>
      )}

      {popup?.kind === 'obstacle' && (
        <ObstacleDialog
          obstacle={popup.node.obstacle!}
          onCleared={() => { mutate(() => ctrl.markObstacleCleared(popup.node.id)); setPopup(null); }}
          onClose={() => setPopup(null)}
        />
      )}
      {popup?.kind === 'treasure' && (
        <TreasureDialog
          onOpened={() => { mutate(() => ctrl.openTreasure(popup.node.id)); setPopup(null); }}
          onClose={() => setPopup(null)}
        />
      )}
      {popup?.kind === 'encounter' && (
        <EncounterDialog
          ctrl={ctrl}
          node={popup.node}
          onFight={() => setPopup({ kind: 'fight', node: popup.node })}
          onClose={() => setPopup(null)}
        />
      )}

      {ctrl.progress.completed && (
        <VictoryOverlay
          ctrl={ctrl}
          onNextLevel={nextJourney(map.id) ? () => onNextLevel(ctrl.progress.heroType) : undefined}
          onPlayAgain={() => { clearSavedJourney(map.id); onNewJourney(); }}
          onMenu={onExit}
        />
      )}
    </div>
  );
}

function BiomePanel({ biome, top, height }: { biome: Biome; top: number; height: number }) {
  return (
    <div
      className="biome-panel"
      style={{ top, height, backgroundImage: `url(${biomeBg(biome)})` }}
    />
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
  nodeSize,
  onTap,
}: {
  node: AdventureNode;
  ctrl: AdventureController;
  width: number;
  height: number;
  nodeSize: number;
  onTap: () => void;
}) {
  const size = node.type === 'rival' ? nodeSize * 1.2 : nodeSize;
  const state = visualState(ctrl, node);
  const pulsing = state === 'next' || state === 'current';
  const stars = node.type === 'rival' ? ctrl.starsForNode(node.id) : 0;
  const starSize = nodeSize * 0.2;

  return (
    <button
      className={`adv-node ${state}`}
      style={{
        left: node.x * width - size / 2,
        top: node.y * height - size / 2,
        width: size,
        height: size * 1.25,
      }}
      onClick={(e) => {
        e.stopPropagation(); // keep ground-tap handler from also walking here
        onTap();
      }}
    >
      {pulsing && <div className="pulse-ring" style={{ width: size, height: size }} />}
      <div className="node-content" style={{ width: size, height: size }}>
        <NodeGlyph node={node} ctrl={ctrl} size={size} />
        {state === 'locked' && node.type !== 'path' && (
          <span className="lock-badge">
            <Icon name="lock" size={size * 0.3} color="rgba(93,64,55,0.8)" />
          </span>
        )}
      </div>
      {node.type === 'rival' && stars > 0 && (
        <div className="node-star-pill" style={{ padding: `0 ${nodeSize * 0.2}px` }}>
          {[0, 1, 2].map((i) => (
            <Icon
              key={i}
              name="star"
              size={starSize}
              color={i < stars ? '#FFC107' : 'rgba(141,110,99,0.3)'}
            />
          ))}
        </div>
      )}
    </button>
  );
}

function NodeGlyph({ node, ctrl, size }: { node: AdventureNode; ctrl: AdventureController; size: number }) {
  switch (node.type) {
    case 'start':
      return <img className="node-art" src={ui.flag} alt="start" />;
    case 'finish':
      return <img className="node-art" src={ui.banner} alt="finish" />;
    case 'path':
      return <span className="path-dot" style={{ width: size * 0.4, height: size * 0.4 }} />;
    case 'treasure':
      return (
        <img
          className="node-art"
          src={ctrl.isNodeCleared(node) ? ui.chestOpen : ui.chestClosed}
          alt="chest"
        />
      );
    case 'obstacle':
      return (
        <img
          className="node-art"
          style={{ opacity: ctrl.isNodeCleared(node) ? 0.5 : 1 }}
          src={obstacleArt(node.obstacle!)}
          alt="obstacle"
        />
      );
    case 'rival': {
      const rival = ctrl.rivalForNode(node);
      return <img className="node-art" src={heroImage(rival.imagePath)} alt={rival.name} />;
    }
  }
}

function visualState(ctrl: AdventureController, node: AdventureNode): string {
  const isCurrent = node.id === ctrl.progress.currentNodeId;
  if (isCurrent) return ctrl.isNodeCleared(node) ? 'visited' : 'current';
  if (ctrl.canReach(node) && !ctrl.isNodeVisited(node)) {
    // Only quest objectives pulse; open trail ahead just looks walkable
    // rather than making whole corridors of dots blink.
    return node.type === 'path' ? 'open' : 'next';
  }
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
      return 'Tap anywhere on the trail to walk there!';
  }
}

/** Tap-to-clear obstacle dialog (wobble per tap, shrink + auto-close on clear). */
function ObstacleDialog({
  obstacle,
  onCleared,
  onClose,
}: {
  obstacle: ObstacleType;
  onCleared: () => void;
  onClose: () => void;
}) {
  const info = OBSTACLE_INFO[obstacle];
  const [taps, setTaps] = useState(0);
  const cleared = taps >= info.tapsRequired;

  useEffect(() => {
    if (!cleared) return;
    const t = setTimeout(onCleared, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleared]);

  const remaining = info.tapsRequired - taps;
  return (
    <div className="modal-scrim" onClick={cleared ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{info.title}</h2>
        <div style={{ height: 16 }} />
        <img
          className={`tap-art${cleared ? ' shrunk' : ''}`}
          src={obstacleArt(obstacle)}
          alt="obstacle"
          style={{
            width: 130,
            height: 130,
            objectFit: 'contain',
            cursor: 'pointer',
            transform: cleared ? 'scale(0.6)' : `rotate(${taps * 0.02}turn)`,
            opacity: cleared ? 0.4 : 1,
          }}
          onClick={() => !cleared && setTaps((t) => t + 1)}
        />
        <div style={{ height: 12 }} />
        <p
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: cleared ? 700 : 400,
            color: cleared ? '#4CAF50' : '#8D6E63',
          }}
        >
          {cleared
            ? info.clearedText
            : taps === 0
              ? info.instruction
              : `Keep going! ${remaining} more...`}
        </p>
      </div>
    </div>
  );
}

/** Tap-to-open treasure dialog (+2 stars, auto-close). */
function TreasureDialog({ onOpened, onClose }: { onOpened: () => void; onClose: () => void }) {
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (!opened) return;
    const t = setTimeout(onOpened, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  return (
    <div className="modal-scrim" onClick={opened ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>A Treasure Chest!</h2>
        <div style={{ height: 16 }} />
        <img
          src={opened ? ui.chestOpen : ui.chestClosed}
          alt="chest"
          style={{
            width: 120,
            height: 120,
            objectFit: 'contain',
            cursor: 'pointer',
            transition: 'transform 0.3s ease',
            transform: opened ? 'scale(1.15)' : 'scale(1)',
          }}
          onClick={() => setOpened(true)}
        />
        <div style={{ height: 12 }} />
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: opened ? '#FF9800' : '#8D6E63' }}>
          {opened ? '+2 Stars!' : 'Tap to open!'}
        </p>
      </div>
    </div>
  );
}

function EncounterDialog({
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
  const difficulty = ctrl.difficultyForNode(node);
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isBoss ? `${rival.name} guards the summit!` : `${rival.name} blocks your path!`}</h2>
        <div style={{ height: 16 }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={heroImage(ctrl.playerHero.imagePath)} alt="you" style={{ width: 80, height: 80, objectFit: 'contain' }} />
          <img src={ui.vs} alt="vs" style={{ width: 44, height: 44, objectFit: 'contain', margin: '0 8px' }} />
          <img src={heroImage(rival.imagePath)} alt={rival.name} style={{ width: 80, height: 80, objectFit: 'contain' }} />
        </div>
        <div style={{ height: 8 }} />
        <p className="sub">
          {prev > 0
            ? 'Already defeated — fight again for more stars!'
            : `Difficulty: ${difficulty.charAt(0).toUpperCase()}${difficulty.slice(1)}`}
        </p>
        <div style={{ height: 20 }} />
        <button className="img-btn yellow dialog-btn" onClick={onFight}>Fight!</button>
        <div style={{ height: 10 }} />
        <button className="img-btn grey dialog-btn" onClick={onClose}>Not Yet</button>
      </div>
    </div>
  );
}

function VictoryOverlay({
  ctrl,
  onNextLevel,
  onPlayAgain,
  onMenu,
}: {
  ctrl: AdventureController;
  /** Absent on the final level. */
  onNextLevel?: () => void;
  onPlayAgain: () => void;
  onMenu: () => void;
}) {
  return (
    <div className="modal-scrim">
      <div className="modal" style={{ width: 320, padding: '32px 24px' }}>
        <div style={{ fontSize: 40 }}>🎉</div>
        <h2 style={{ fontSize: 24 }}>{onNextLevel ? 'Journey Complete!' : 'Adventure Complete!'}</h2>
        <div style={{ height: 16 }} />
        <img
          src={heroImage(ctrl.playerHero.imagePath)}
          alt="hero"
          style={{ width: 110, height: 110, objectFit: 'contain' }}
        />
        <div style={{ height: 8 }} />
        <p className="sub" style={{ fontSize: 15 }}>
          {onNextLevel
            ? `${ctrl.playerHero.name} reached the summit!`
            : `${ctrl.playerHero.name} conquered every journey!`}
        </p>
        <div style={{ height: 12 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="star" size={28} color="#FFC107" />
          <span style={{ fontSize: 18, fontWeight: 700, color: '#5D4037' }}>
            {ctrl.totalStars} / {ctrl.maxStars} stars
          </span>
        </div>
        <div style={{ height: 24 }} />
        {onNextLevel && (
          <>
            <button className="img-btn yellow dialog-btn" onClick={onNextLevel}>Next Level!</button>
            <div style={{ height: 10 }} />
          </>
        )}
        <button className={`img-btn ${onNextLevel ? 'grey' : 'yellow'} dialog-btn`} onClick={onPlayAgain}>
          New Journey
        </button>
        <div style={{ height: 10 }} />
        <button className="img-btn grey dialog-btn" onClick={onMenu}>Back to Menu</button>
      </div>
    </div>
  );
}
