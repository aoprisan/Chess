// Campaign controller — owns the three map definitions plus the shared meta
// state. Movement (BFS free-roam) is ported from the old AdventureController;
// respect, recruitment, withdrawal, and map unlocks are the Neon City rules:
//
//   node respect   = best battle result at that node (1-3, only improves)
//   char respect   = sum of node respect over cleared nodes it defends
//   level 1 (>= JOIN_THRESHOLD)      -> joins the crew
//   level 2 (>= WITHDRAW_THRESHOLD)  -> withdraws from all uncleared nodes,
//                                       on every map; nodes left with no
//                                       defenders auto-restore (no battle,
//                                       no respect, but count as cleared)
//   map complete   = all critical nodes cleared or auto-restored

import { CharacterId, CHARACTERS, characterById } from '../game/characters';
import { CampaignMapDef, CampaignMapId, CampaignNode, CAMPAIGN_MAP_IDS } from './model';
import { JOIN_THRESHOLD, WITHDRAW_THRESHOLD } from './balance';
import { CampaignMeta, loadMeta, saveMeta, resetMeta, seatsFor, nodeKey } from './meta';

/** Everything that changed as a result of one battle (for UI toasts). */
export interface BattleOutcome {
  /** Respect recorded for the node (0 = loss, nothing changed). */
  respect: number;
  /** True when this result improved the node's best. */
  improved: boolean;
  /** Characters that reached level 1 (joined the crew) because of this battle. */
  joined: CharacterId[];
  /** Characters that reached level 2 (withdrew their defenses). */
  withdrew: CharacterId[];
  /** Node keys (map:node) restored without a fight after withdrawals. */
  autoRestored: string[];
  /** Map ids newly completed. */
  mapsCompleted: string[];
}

export class CampaignController {
  readonly maps: Record<CampaignMapId, CampaignMapDef>;
  meta: CampaignMeta;

  constructor(maps: Record<CampaignMapId, CampaignMapDef>, meta?: CampaignMeta) {
    this.maps = maps;
    this.meta = meta ?? loadMeta();
    // Withdrawals earned in a previous session may auto-restore nodes on maps
    // that hadn't been generated/visited yet; settle before first render.
    this.settleAutoClears();
    this.save();
  }

  private save(): void {
    saveMeta(this.meta);
  }

  // --- Respect & levels ---

  isNodeCleared(mapId: CampaignMapId, node: CampaignNode): boolean {
    if (node.kind !== 'system') return true;
    const key = nodeKey(mapId, node.id);
    return key in this.meta.nodeRespect || this.meta.autoCleared.has(key);
  }

  nodeRespect(mapId: CampaignMapId, nodeId: string): number {
    return this.meta.nodeRespect[nodeKey(mapId, nodeId)] ?? 0;
  }

  /** Sum of best respect over cleared nodes this character defends (all maps). */
  respectFor(charId: CharacterId): number {
    let total = 0;
    for (const mapId of CAMPAIGN_MAP_IDS) {
      for (const node of this.maps[mapId].systemNodes) {
        if (!node.defenders.includes(charId)) continue;
        total += this.meta.nodeRespect[nodeKey(mapId, node.id)] ?? 0;
      }
    }
    return total;
  }

  /** Highest respect this character can ever reach (3 per node it defends). */
  maxRespectFor(charId: CharacterId): number {
    let nodes = 0;
    for (const mapId of CAMPAIGN_MAP_IDS) {
      for (const node of this.maps[mapId].systemNodes) {
        if (node.defenders.includes(charId)) nodes++;
      }
    }
    return nodes * 3;
  }

  respectLevel(charId: CharacterId): 0 | 1 | 2 {
    if (characterById(charId).homeMap === 0) {
      // Starters are on the crew from the beginning and never defend nodes.
      return 1;
    }
    const r = this.respectFor(charId);
    if (r >= WITHDRAW_THRESHOLD) return 2;
    if (r >= JOIN_THRESHOLD) return 1;
    return 0;
  }

  isOnCrew(charId: CharacterId): boolean {
    return this.meta.roster.has(charId);
  }

  get crew(): CharacterId[] {
    return CHARACTERS.filter((c) => this.meta.roster.has(c.id)).map((c) => c.id);
  }

  get seats(): number {
    return seatsFor(this.meta);
  }

  /** Defenders still standing at a node after level-2 withdrawals. */
  effectiveDefenders(node: CampaignNode): CharacterId[] {
    return node.defenders.filter((id) => this.respectLevel(id) < 2);
  }

  // --- Team selection ---

  get lastTeam(): CharacterId[] {
    // Sanitize: crew members only, capped to the current seat count.
    const seen = new Set<string>();
    const team = this.meta.lastTeam.filter((id) => {
      if (seen.has(id) || !this.meta.roster.has(id)) return false;
      seen.add(id);
      return true;
    });
    return team.slice(0, this.seats);
  }

  setLastTeam(team: CharacterId[]): void {
    const seen = new Set<string>();
    const clean = team.filter((id) => {
      if (seen.has(id) || !this.meta.roster.has(id)) return false;
      seen.add(id);
      return true;
    });
    this.meta.lastTeam = clean.slice(0, this.seats);
    this.save();
  }

  // --- Map progress ---

  isMapUnlocked(mapId: CampaignMapId): boolean {
    const index = CAMPAIGN_MAP_IDS.indexOf(mapId);
    if (index === 0) return true;
    return this.meta.mapsCompleted.has(CAMPAIGN_MAP_IDS[index - 1]);
  }

  isMapCompleted(mapId: CampaignMapId): boolean {
    return this.meta.mapsCompleted.has(mapId);
  }

  /** [cleared, total] critical systems for a map. */
  criticalProgress(mapId: CampaignMapId): [number, number] {
    const criticals = this.maps[mapId].criticalNodes;
    const cleared = criticals.filter((n) => this.isNodeCleared(mapId, n)).length;
    return [cleared, criticals.length];
  }

  get campaignWon(): boolean {
    return this.meta.mapsCompleted.has('map_3');
  }

  /**
   * Wipe all campaign progress back to the starter crew. Replaces the meta in
   * place so existing references to this controller keep working.
   */
  resetProgress(): void {
    this.meta = resetMeta();
    this.settleAutoClears();
    this.save();
  }

  // --- Movement (BFS free-roam, ported from AdventureController) ---

  private position(mapId: CampaignMapId): { currentNodeId: string; visitedNodes: Set<string> } {
    let pos = this.meta.perMap[mapId];
    if (!pos) {
      const entry = this.maps[mapId].entryNodeId;
      pos = { currentNodeId: entry, visitedNodes: new Set([entry]) };
      this.meta.perMap[mapId] = pos;
    }
    return pos;
  }

  currentNodeId(mapId: CampaignMapId): string {
    return this.position(mapId).currentNodeId;
  }

  isNodeVisited(mapId: CampaignMapId, nodeId: string): boolean {
    return this.position(mapId).visitedNodes.has(nodeId);
  }

  /**
   * BFS shortest path from the current node to [targetId]. Only cleared nodes
   * can be walked *through*; an uncleared system node may be the destination
   * but blocks travel beyond it. Standing on an uncleared node, the first
   * step may only retreat to already-visited neighbors.
   */
  pathTo(mapId: CampaignMapId, targetId: string): string[] | null {
    const map = this.maps[mapId];
    const pos = this.position(mapId);
    const startId = pos.currentNodeId;
    if (targetId === startId) return [];
    const startCleared = this.isNodeCleared(mapId, map.nodeById(startId));
    const cameFrom = new Map<string, string>();
    const seen = new Set<string>([startId]);
    const queue: string[] = [startId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (id !== startId && !this.isNodeCleared(mapId, map.nodeById(id))) continue;
      for (const nextId of map.neighborsOf(id)) {
        if (seen.has(nextId)) continue;
        if (id === startId && !startCleared && !pos.visitedNodes.has(nextId)) {
          continue; // retreat rule
        }
        seen.add(nextId);
        cameFrom.set(nextId, id);
        if (nextId === targetId) {
          const path: string[] = [];
          for (let cur = nextId; cur !== startId; cur = cameFrom.get(cur)!) {
            path.push(cur);
          }
          return path.reverse();
        }
        queue.push(nextId);
      }
    }
    return null;
  }

  canReach(mapId: CampaignMapId, node: CampaignNode): boolean {
    if (node.id === this.position(mapId).currentNodeId) return false;
    return this.pathTo(mapId, node.id) !== null;
  }

  canTapNode(mapId: CampaignMapId, node: CampaignNode): boolean {
    if (node.id === this.position(mapId).currentNodeId) {
      return node.kind === 'system';
    }
    return this.canReach(mapId, node);
  }

  moveToNode(mapId: CampaignMapId, nodeId: string): void {
    const pos = this.position(mapId);
    pos.currentNodeId = nodeId;
    pos.visitedNodes.add(nodeId);
    this.save();
  }

  // --- Battle results ---

  /**
   * Record a battle at [nodeId] and cascade every consequence: node respect,
   * newly joined crew members, level-2 withdrawals, auto-restored nodes, and
   * map completions.
   */
  recordBattleResult(mapId: CampaignMapId, nodeId: string, respect: number): BattleOutcome {
    const outcome: BattleOutcome = {
      respect,
      improved: false,
      joined: [],
      withdrew: [],
      autoRestored: [],
      mapsCompleted: [],
    };
    if (respect <= 0) return outcome;

    const levelsBefore = this.snapshotLevels();
    const completedBefore = new Set(this.meta.mapsCompleted);

    const key = nodeKey(mapId, nodeId);
    const existing = this.meta.nodeRespect[key] ?? 0;
    if (respect > existing) {
      this.meta.nodeRespect[key] = respect;
      outcome.improved = true;
    }

    // Recruitment: level >= 1 joins the crew (fires once, roster is stored).
    for (const c of CHARACTERS) {
      if (c.homeMap === 0 || this.meta.roster.has(c.id)) continue;
      if (this.respectLevel(c.id) >= 1) {
        this.meta.roster.add(c.id);
        outcome.joined.push(c.id);
      }
    }

    // Withdrawals: newly reached level 2.
    for (const c of CHARACTERS) {
      if (c.homeMap === 0) continue;
      if (levelsBefore.get(c.id)! < 2 && this.respectLevel(c.id) === 2) {
        outcome.withdrew.push(c.id);
      }
    }

    outcome.autoRestored = this.settleAutoClears();

    this.settleMapCompletions();
    for (const id of this.meta.mapsCompleted) {
      if (!completedBefore.has(id)) outcome.mapsCompleted.push(id);
    }

    this.save();
    return outcome;
  }

  private snapshotLevels(): Map<CharacterId, number> {
    return new Map(CHARACTERS.map((c) => [c.id, this.respectLevel(c.id)]));
  }

  /** Auto-restore uncleared nodes whose defenders have all withdrawn. */
  private settleAutoClears(): string[] {
    const restored: string[] = [];
    // Withdrawing one node's defenders can complete a map and never adds
    // defenders back, so a single pass suffices (respect only grows).
    for (const mapId of CAMPAIGN_MAP_IDS) {
      for (const node of this.maps[mapId].systemNodes) {
        const key = nodeKey(mapId, node.id);
        if (key in this.meta.nodeRespect || this.meta.autoCleared.has(key)) continue;
        if (this.effectiveDefenders(node).length === 0) {
          this.meta.autoCleared.add(key);
          restored.push(key);
        }
      }
    }
    return restored;
  }

  private settleMapCompletions(): void {
    for (const mapId of CAMPAIGN_MAP_IDS) {
      if (this.meta.mapsCompleted.has(mapId)) continue;
      const [cleared, total] = this.criticalProgress(mapId);
      if (cleared >= total) this.meta.mapsCompleted.add(mapId);
    }
  }
}
