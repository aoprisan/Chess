// Campaign meta-progression persistence — a single localStorage key holding
// everything the campaign needs across maps. Character respect, levels, and
// seat count are DERIVED from this state + the map defender lists (see
// controller.ts), never stored, so they can't drift.

import { CharacterId, CHARACTERS, STARTER_IDS } from '../game/characters';
import { BASE_SEATS, MAX_SEATS } from './balance';

export const META_KEY = 'neon_meta_v1';

/** Old Kiddie Chess save keys, purged on first campaign boot. */
const LEGACY_KEY_PREFIXES = ['adventure_progress_v2', 'adventure_levels_v1'];

export interface MapPositionJson {
  currentNodeId: string;
  visitedNodes: string[];
}

export interface MetaJson {
  version: 1;
  /** Characters on the crew (starters + everyone at respect level >= 1). */
  roster: CharacterId[];
  /** Last seated team, reused as the default selection. */
  lastTeam: CharacterId[];
  /** Completed map ids; seats = min(MAX_SEATS, BASE_SEATS + length). */
  mapsCompleted: string[];
  /** 'map_1:n07' -> best respect earned there (1-3). */
  nodeRespect: Record<string, number>;
  /** Node keys restored without a fight because every defender withdrew. */
  autoCleared: string[];
  /** Free-roam position per map. */
  perMap: Record<string, MapPositionJson>;
}

export interface CampaignMeta {
  roster: Set<CharacterId>;
  lastTeam: CharacterId[];
  mapsCompleted: Set<string>;
  nodeRespect: Record<string, number>;
  autoCleared: Set<string>;
  perMap: Record<string, { currentNodeId: string; visitedNodes: Set<string> }>;
}

export function nodeKey(mapId: string, nodeId: string): string {
  return `${mapId}:${nodeId}`;
}

function freshMeta(): CampaignMeta {
  return {
    roster: new Set(STARTER_IDS),
    lastTeam: [...STARTER_IDS.slice(0, BASE_SEATS)],
    mapsCompleted: new Set(),
    nodeRespect: {},
    autoCleared: new Set(),
    perMap: {},
  };
}

function fromJson(json: MetaJson): CampaignMeta {
  const perMap: CampaignMeta['perMap'] = {};
  for (const [mapId, pos] of Object.entries(json.perMap ?? {})) {
    perMap[mapId] = {
      currentNodeId: pos.currentNodeId,
      visitedNodes: new Set(pos.visitedNodes ?? []),
    };
  }
  return {
    roster: new Set(json.roster ?? STARTER_IDS),
    lastTeam: json.lastTeam ?? [...STARTER_IDS.slice(0, BASE_SEATS)],
    mapsCompleted: new Set(json.mapsCompleted ?? []),
    nodeRespect: json.nodeRespect ?? {},
    autoCleared: new Set(json.autoCleared ?? []),
    perMap,
  };
}

function toJson(meta: CampaignMeta): MetaJson {
  const perMap: MetaJson['perMap'] = {};
  for (const [mapId, pos] of Object.entries(meta.perMap)) {
    perMap[mapId] = {
      currentNodeId: pos.currentNodeId,
      visitedNodes: [...pos.visitedNodes],
    };
  }
  return {
    version: 1,
    roster: [...meta.roster],
    lastTeam: meta.lastTeam,
    mapsCompleted: [...meta.mapsCompleted],
    nodeRespect: meta.nodeRespect,
    autoCleared: [...meta.autoCleared],
    perMap,
  };
}

/** Remove pre-pivot Kiddie Chess saves (idempotent). */
export function purgeLegacySaves(): void {
  const stale: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && LEGACY_KEY_PREFIXES.some((p) => key.startsWith(p))) stale.push(key);
  }
  for (const key of stale) localStorage.removeItem(key);
}

export function loadMeta(): CampaignMeta {
  purgeLegacySaves();
  try {
    const stored = localStorage.getItem(META_KEY);
    if (!stored) return freshMeta();
    return fromJson(JSON.parse(stored) as MetaJson);
  } catch {
    return freshMeta();
  }
}

export function saveMeta(meta: CampaignMeta): void {
  localStorage.setItem(META_KEY, JSON.stringify(toJson(meta)));
}

export function resetMeta(): CampaignMeta {
  localStorage.removeItem(META_KEY);
  return freshMeta();
}

export function seatsFor(meta: CampaignMeta): number {
  return Math.min(MAX_SEATS, BASE_SEATS + meta.mapsCompleted.size);
}

/** Crew character ids in catalog order (for pickers outside the campaign). */
export function crewIds(): CharacterId[] {
  const meta = loadMeta();
  return CHARACTERS.filter((c) => meta.roster.has(c.id)).map((c) => c.id);
}
