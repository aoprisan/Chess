import { useEffect, useRef, useState, useCallback } from 'react';
import { CharacterId, characterById } from '../game/characters';
import { CampaignController, BattleOutcome } from '../campaign/controller';
import { CampaignMapId, CampaignNode } from '../campaign/model';
import { CAMPAIGN_MAP_IDS } from '../campaign/model';
import { Combat } from './Combat';
import { TeamPicker } from './TeamPicker';
import { CharacterPortrait } from './CharacterPortrait';
import { Icon } from './Icons';

const WALK_STEP_MS = 220;

interface Toast {
  id: number;
  text: string;
  accent: string;
}

// The campaign map: a scrollable neon city grid of nodes. Tap a system node
// to preview its defenders and assemble a team; junctions are free to walk.
export function CampaignMap({
  controller,
  mapId,
  onExit,
  onOpenMap,
}: {
  controller: CampaignController;
  mapId: CampaignMapId;
  onExit: () => void;
  onOpenMap: (mapId: CampaignMapId) => void;
}) {
  const map = controller.maps[mapId];
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const [preview, setPreview] = useState<CampaignNode | null>(null);
  const [teamPickNode, setTeamPickNode] = useState<CampaignNode | null>(null);
  const [battle, setBattle] = useState<{ node: CampaignNode; team: CharacterId[] } | null>(null);
  const [walking, setWalking] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t);
    },
    [],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  // Start scrolled to the player's position (maps are taller than the screen).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const node = map.nodeById(controller.currentNodeId(mapId));
    const target = node.y * el.scrollHeight - el.clientHeight * 0.55;
    el.scrollTop = Math.max(0, target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId]);

  const pushToast = (text: string, accent = '#00e5ff') => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, accent }]);
    timers.current.push(setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000));
  };

  const announceOutcome = (outcome: BattleOutcome) => {
    if (outcome.respect > 0) {
      pushToast(
        `System restored! +${outcome.respect} respect${outcome.improved ? '' : ' (best kept)'}`,
        '#3dff8f',
      );
    }
    for (const id of outcome.joined) {
      pushToast(`${characterById(id).name} joined your crew!`, characterById(id).accent);
    }
    for (const id of outcome.withdrew) {
      pushToast(`${characterById(id).name} pulled their defenses off the city!`, '#ff2fd6');
    }
    if (outcome.autoRestored.length > 0) {
      pushToast(
        `${outcome.autoRestored.length} undefended system${outcome.autoRestored.length > 1 ? 's' : ''} came back online!`,
        '#3dff8f',
      );
    }
    for (const completed of outcome.mapsCompleted) {
      pushToast(
        completed === 'map_3'
          ? 'The AI Core is yours — Neon City reboots!'
          : `${controller.maps[completed as CampaignMapId].name} fully restored — new system and battle seat unlocked!`,
        '#ffd23f',
      );
    }
  };

  const openNode = (node: CampaignNode) => {
    if (node.kind !== 'system') return;
    setPreview(node);
  };

  const onNodeTap = (node: CampaignNode) => {
    if (walking || battle) return;
    if (node.id === controller.currentNodeId(mapId)) {
      openNode(node);
      return;
    }
    const path = controller.pathTo(mapId, node.id);
    if (!path || path.length === 0) return;
    setWalking(true);
    path.forEach((stepId, i) => {
      timers.current.push(
        setTimeout(() => {
          controller.moveToNode(mapId, stepId);
          bump();
          if (i === path.length - 1) {
            setWalking(false);
            const dest = map.nodeById(stepId);
            if (dest.kind === 'system' && !controller.isNodeCleared(mapId, dest)) {
              openNode(dest);
            }
          }
        }, (i + 1) * WALK_STEP_MS),
      );
    });
  };

  // --- Battle ---------------------------------------------------------------

  if (battle) {
    const defenders = controller.effectiveDefenders(battle.node);
    return (
      <Combat
        key={`${mapId}-${battle.node.id}`}
        player1Team={battle.team.map(characterById)}
        player2Team={defenders.map(characterById)}
        aiDifficulty={battle.node.difficulty}
        usePerkPools
        exitLabel="Back to Map"
        onGameEnd={(result) => {
          const outcome = controller.recordBattleResult(mapId, battle.node.id, result.stars);
          setBattle(null);
          announceOutcome(outcome);
          bump();
        }}
      />
    );
  }

  const currentId = controller.currentNodeId(mapId);
  const [criticalsCleared, criticalsTotal] = controller.criticalProgress(mapId);
  const mapIndex = CAMPAIGN_MAP_IDS.indexOf(mapId);
  const nextMapId = CAMPAIGN_MAP_IDS[mapIndex + 1];

  return (
    <div className="screen campaign-screen">
      {/* Header */}
      <div className="cm-header">
        <button className="img-btn grey cm-back" onClick={onExit}>
          <Icon name="arrowBack" size={14} color="#e8f4ff" />
          Systems
        </button>
        <div className="cm-title">
          <span className="cm-map-name">{map.name}</span>
          <span className="cm-progress">
            <Icon name="flash" size={13} color="#00e5ff" />
            {criticalsCleared}/{criticalsTotal} critical systems secured
          </span>
        </div>
        {controller.isMapCompleted(mapId) && nextMapId && (
          <button className="img-btn yellow cm-next" onClick={() => onOpenMap(nextMapId)}>
            Next system
          </button>
        )}
      </div>

      {/* Scrollable city grid */}
      <div className="cm-scroll" ref={scrollRef}>
        <div className="cm-canvas" style={{ height: `${map.heightFactor * 100}vh` }}>
          <svg
            className="cm-edges"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            {map.edges.map(([a, b]) => {
              const na = map.nodeById(a);
              const nb = map.nodeById(b);
              const lit =
                controller.isNodeCleared(mapId, na) || controller.isNodeCleared(mapId, nb);
              return (
                <line
                  key={`${a}-${b}`}
                  x1={na.x * 100}
                  y1={na.y * 100}
                  x2={nb.x * 100}
                  y2={nb.y * 100}
                  className={lit ? 'lit' : undefined}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>

          {map.nodes.map((node) => {
            const cleared = controller.isNodeCleared(mapId, node);
            const isCurrent = node.id === currentId;
            const reachable = !walking && controller.canReach(mapId, node);
            const defenders = controller.effectiveDefenders(node);
            const respect = controller.nodeRespect(mapId, node.id);
            const autoRestored =
              node.kind === 'system' && cleared && respect === 0 && defenders.length === 0;
            return (
              <button
                key={node.id}
                className={[
                  'cm-node',
                  node.kind,
                  node.critical ? 'critical' : '',
                  cleared ? 'cleared' : '',
                  isCurrent ? 'current' : '',
                  reachable || isCurrent ? 'reachable' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ left: `${node.x * 100}%`, top: `${node.y * 100}%` }}
                disabled={!reachable && !isCurrent}
                onClick={() => onNodeTap(node)}
                aria-label={node.kind === 'system' ? `System ${node.id}` : node.id}
              >
                <span className="cm-node-shape" />
                {node.critical && (
                  <span className="cm-node-crit" title="Critical system">
                    <Icon name="flash" size={11} color="#0a0e1a" />
                  </span>
                )}
                {node.kind === 'system' && !cleared && defenders.length > 0 && (
                  <span className="cm-node-defenders">
                    {defenders.slice(0, 3).map((id) => (
                      <CharacterPortrait
                        key={id}
                        character={characterById(id)}
                        style={{ width: 16, height: 16, objectFit: 'contain' }}
                        initialScale={0.7}
                      />
                    ))}
                    {defenders.length > 3 && (
                      <span className="cm-node-more">+{defenders.length - 3}</span>
                    )}
                  </span>
                )}
                {respect > 0 && (
                  <span className="cm-node-pips">
                    {Array.from({ length: 3 }, (_, i) => (
                      <Icon
                        key={i}
                        name="star"
                        size={9}
                        color={i < respect ? '#ffd23f' : '#2a3555'}
                      />
                    ))}
                  </span>
                )}
                {autoRestored && <span className="cm-node-auto">auto</span>}
                {isCurrent && <span className="cm-player-ring" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Toasts */}
      <div className="cm-toasts">
        {toasts.map((t) => (
          <div key={t.id} className="cm-toast" style={{ borderColor: t.accent }}>
            {t.text}
          </div>
        ))}
      </div>

      {/* Node preview popup */}
      {preview && (
        <div className="modal-scrim" style={{ zIndex: 35 }} onClick={() => setPreview(null)}>
          <div className="cm-preview" onClick={(e) => e.stopPropagation()}>
            <div className="cm-preview-title">
              {preview.critical ? 'Critical system' : 'Glitched system'}
              <span className="cm-preview-diff">{preview.difficulty}</span>
            </div>
            {controller.isNodeCleared(mapId, preview) && (
              <p className="cm-preview-note">
                Already restored — win cleaner to improve your respect (best result counts).
              </p>
            )}
            <div className="cm-preview-defenders">
              {controller.effectiveDefenders(preview).map((id) => {
                const c = characterById(id);
                return (
                  <div key={id} className="cm-preview-char">
                    <CharacterPortrait
                      character={c}
                      style={{ width: 44, height: 44, objectFit: 'contain' }}
                    />
                    <span>{controller.isOnCrew(id) ? c.name : '???'}</span>
                  </div>
                );
              })}
              {controller.effectiveDefenders(preview).length === 0 && (
                <p className="cm-preview-note">Nobody is defending this system any more.</p>
              )}
            </div>
            <div className="tp-actions">
              <button className="img-btn grey" onClick={() => setPreview(null)}>
                Not yet
              </button>
              {controller.effectiveDefenders(preview).length > 0 && (
                <button
                  className="img-btn yellow"
                  onClick={() => {
                    setTeamPickNode(preview);
                    setPreview(null);
                  }}
                >
                  Fix it!
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Team picker */}
      {teamPickNode && (
        <TeamPicker
          controller={controller}
          node={teamPickNode}
          onCancel={() => setTeamPickNode(null)}
          onStart={(team) => {
            setBattle({ node: teamPickNode, team });
            setTeamPickNode(null);
          }}
        />
      )}
    </div>
  );
}
