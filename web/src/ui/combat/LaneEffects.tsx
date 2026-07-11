import type { ReactNode } from 'react';
import { getPerk, PerkCategory } from '../../game/perks';
import { CombatGameState, Lane, PlayerSide } from '../../game/state';
import { Icon, IconName } from '../Icons';
import { CATEGORY_COLOR, perkIcon } from '../perkTheme';
import { useLang, useT, perkName } from '../../i18n';
import type { Lang } from '../../i18n';

// --- Lane effects -------------------------------------------------------------

interface EffectEntry {
  name: string;
  icon: IconName;
  category: PerkCategory;
  turnsLeft: number;
  owner: PlayerSide;
}

const OFFENSIVE_TRIGGERS = new Set(['SHOCKWAVE', 'BACKFIRE', 'RETALIATE']);
const OFFENSIVE_DEFERRED = new Set(['ENLIST', 'AMBUSH']);

/** Engine trigger/deferred/raid type -> the perk it came from (for display names). */
const EFFECT_PERK_IDS: Record<string, number> = {
  PORTAL: 24,
  TRAP: 25,
  MIRROR: 26,
  ECHO: 27,
  SHOCKWAVE: 28,
  HYDRA: 29,
  BACKFIRE: 30,
  ABSORB: 46,
  RETALIATE: 52,
  SIGNAL: 43,
  ENLIST: 40,
  AMBUSH: 41,
  REINFORCE: 42,
  RAID: 51,
};

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

/** Catalog name for an engine effect type (falls back to title-cased type). */
function effectLabel(type: string, lang: Lang): string {
  const perkId = EFFECT_PERK_IDS[type];
  const perk = perkId !== undefined ? getPerk(perkId) : undefined;
  return perk ? perkName(perk, lang) : titleCase(type);
}

/** The originating perk's glyph for an engine effect type, if known. */
function effectIcon(type: string, fallback: IconName): IconName {
  const perkId = EFFECT_PERK_IDS[type];
  return perkId !== undefined ? perkIcon(perkId) : fallback;
}

function effectsForLane(
  state: CombatGameState,
  lane: Lane,
  laneIndex: number,
  lang: Lang,
): EffectEntry[] {
  const entries: EffectEntry[] = [];
  for (const t of lane.triggers) {
    const offensive = OFFENSIVE_TRIGGERS.has(t.type);
    entries.push({
      name: effectLabel(t.type, lang),
      icon: effectIcon(t.type, offensive ? 'warning' : 'shield'),
      category: offensive ? 'offensive' : 'defensive',
      turnsLeft: t.turnsLeft,
      owner: t.owner === 1 ? 'player1' : 'player2',
    });
  }
  for (const d of lane.deferred) {
    entries.push({
      name: effectLabel(d.type, lang),
      icon: effectIcon(d.type, 'schedule'),
      category: OFFENSIVE_DEFERRED.has(d.type) ? 'offensive' : 'utility',
      turnsLeft: 0,
      owner: d.owner === 1 ? 'player1' : 'player2',
    });
  }
  (['player1', 'player2'] as PlayerSide[]).forEach((side) => {
    const sancs = side === 'player1' ? state.player1Sanctuaries : state.player2Sanctuaries;
    for (const s of sancs) {
      if (s.lane === laneIndex) {
        const perk = getPerk(49);
        entries.push({
          name: perk ? perkName(perk, lang) : 'Safe Zone',
          icon: perkIcon(49),
          category: 'defensive',
          turnsLeft: s.turnsLeft,
          owner: side,
        });
      }
    }
    const caps = side === 'player1' ? state.player1Captures : state.player2Captures;
    for (const c of caps) {
      if (c.lane === laneIndex) {
        const perk = getPerk(50);
        entries.push({
          name: perk ? perkName(perk, lang) : 'Magnet',
          icon: perkIcon(50),
          category: 'offensive',
          turnsLeft: c.turnsLeft,
          owner: side,
        });
      }
    }
  });
  for (const r of state.pendingRaids) {
    if (r.lane === laneIndex) {
      entries.push({
        name: effectLabel(r.source, lang),
        icon: effectIcon(r.source, 'raid'),
        category: 'offensive',
        turnsLeft: r.turnsUntilResolve,
        owner: r.owner === 1 ? 'player1' : 'player2',
      });
    }
  }
  return entries;
}

export function LaneEffects({
  state,
  cellH,
  halfW,
}: {
  state: CombatGameState;
  cellH: number;
  halfW: number;
}) {
  const { lang } = useLang();
  const t = useT();
  const out: ReactNode[] = [];
  state.lanes.forEach((lane, i) => {
    if (lane.winner) return;
    const all = effectsForLane(state, lane, i, lang);
    (['player1', 'player2'] as PlayerSide[]).forEach((side) => {
      const effects = all.filter((e) => e.owner === side);
      if (effects.length === 0) return;
      const base = CATEGORY_COLOR[effects[0].category];
      out.push(
        <div
          key={`fx-${i}-${side}`}
          className="effect-overlay"
          style={{
            left: side === 'player1' ? 0 : halfW,
            top: i * cellH,
            width: halfW,
            height: cellH,
            background: `${base}26`, // 15%
            border: `1.5px solid ${base}99`, // 60%
          }}
        >
          {effects.length > 2 ? (
            <span className="effect-pill" style={{ background: `${base}33`, color: base }}>
              <Icon name={effects[0].icon} size={10} color={base} />
              {t('combat.effects', { count: effects.length })}
            </span>
          ) : (
            effects.map((e, j) => (
              <span
                key={j}
                className="effect-pill"
                style={{ background: `${base}33`, color: base }}
              >
                <Icon name={e.icon} size={10} color={base} />
                {e.name}
                {e.turnsLeft > 0 && (
                  <span className="turns" style={{ background: `${base}66` }}>
                    {e.turnsLeft}
                  </span>
                )}
              </span>
            ))
          )}
        </div>,
      );
    });
  });
  return <>{out}</>;
}
