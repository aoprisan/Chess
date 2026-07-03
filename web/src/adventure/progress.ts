// Adventure progression + persistence — ported from
// client/lib/services/adventure_service.dart. SharedPreferences -> localStorage,
// same key ('adventure_progress_v2') and JSON shape.

import { AdventureMapDef, AdventureNode } from './map';
import { HeroType, Hero, heroByType, ALL_HEROES } from '../game/hero';

const PREFS_KEY = 'adventure_progress_v2';

/** Per-journey storage key. journey_1 keeps the legacy key so old saves survive. */
export function journeyStorageKey(mapId: string): string {
  return mapId === 'journey_1' ? PREFS_KEY : `${PREFS_KEY}:${mapId}`;
}

/** Fixed rival order; the player's own hero is removed, leaving exactly 5. */
const RIVAL_ORDER: HeroType[] = ['gnom', 'panda', 'sloth', 'unicorn', 'snowman', 'yeti'];

export interface AdventureProgressJson {
  mapId: string;
  heroType: HeroType;
  currentNodeId: string;
  visitedNodes: string[];
  rivalStars: Record<string, number>;
  clearedNodes: string[];
  completed: boolean;
}

export interface AdventureProgress {
  mapId: string;
  heroType: HeroType;
  currentNodeId: string;
  visitedNodes: Set<string>;
  rivalStars: Record<string, number>;
  clearedNodes: Set<string>;
  completed: boolean;
}

function freshProgress(mapId: string, heroType: HeroType, startNodeId: string): AdventureProgress {
  return {
    mapId,
    heroType,
    currentNodeId: startNodeId,
    visitedNodes: new Set([startNodeId]),
    rivalStars: {},
    clearedNodes: new Set(),
    completed: false,
  };
}

function fromJson(json: AdventureProgressJson): AdventureProgress {
  return {
    mapId: json.mapId,
    heroType: json.heroType,
    currentNodeId: json.currentNodeId,
    visitedNodes: new Set(json.visitedNodes ?? []),
    rivalStars: json.rivalStars ?? {},
    clearedNodes: new Set(json.clearedNodes ?? []),
    completed: json.completed ?? false,
  };
}

function toJson(p: AdventureProgress): AdventureProgressJson {
  return {
    mapId: p.mapId,
    heroType: p.heroType,
    currentNodeId: p.currentNodeId,
    visitedNodes: [...p.visitedNodes],
    rivalStars: p.rivalStars,
    clearedNodes: [...p.clearedNodes],
    completed: p.completed,
  };
}

export function hasSavedJourney(mapId = 'journey_1'): boolean {
  return localStorage.getItem(journeyStorageKey(mapId)) !== null;
}

export function clearSavedJourney(mapId = 'journey_1'): void {
  localStorage.removeItem(journeyStorageKey(mapId));
}

/** Hero of the saved journey for [mapId], or undefined when there is none. */
export function savedJourneyHero(mapId: string): HeroType | undefined {
  try {
    const stored = localStorage.getItem(journeyStorageKey(mapId));
    if (!stored) return undefined;
    return (JSON.parse(stored) as AdventureProgressJson).heroType;
  } catch {
    return undefined;
  }
}

/**
 * Owns the maze definition + the player's journey progress. Mutating methods
 * persist immediately, mirroring the Dart service. UI reads through the getters
 * and re-renders via a version bump the controller returns after each mutation.
 */
export class AdventureController {
  readonly map: AdventureMapDef;
  progress: AdventureProgress;

  constructor(map: AdventureMapDef, newJourneyHero?: HeroType) {
    this.map = map;
    if (newJourneyHero) {
      this.progress = freshProgress(map.id, newJourneyHero, map.startNodeId);
      this.save();
    } else {
      const stored = localStorage.getItem(journeyStorageKey(map.id));
      const parsed = stored ? (JSON.parse(stored) as AdventureProgressJson) : null;
      if (parsed && parsed.mapId === map.id) {
        this.progress = fromJson(parsed);
      } else {
        this.progress = freshProgress(map.id, 'panda', map.startNodeId);
        this.save();
      }
    }
  }

  private save(): void {
    localStorage.setItem(journeyStorageKey(this.progress.mapId), JSON.stringify(toJson(this.progress)));
  }

  get playerHero(): Hero {
    return heroByType(this.progress.heroType);
  }

  get rivals(): Hero[] {
    return RIVAL_ORDER.filter((t) => t !== this.progress.heroType).map((t) =>
      ALL_HEROES.find((h) => h.type === t)!,
    );
  }

  get currentNode(): AdventureNode {
    return this.map.nodeById(this.progress.currentNodeId);
  }

  isNodeCleared(node: AdventureNode): boolean {
    switch (node.type) {
      case 'start':
      case 'path':
        return true;
      case 'finish':
        return this.progress.completed;
      case 'obstacle':
      case 'treasure':
        return this.progress.clearedNodes.has(node.id);
      case 'rival':
        return node.id in this.progress.rivalStars;
    }
  }

  isNodeVisited(node: AdventureNode): boolean {
    return this.progress.visitedNodes.has(node.id);
  }

  isAdjacentToPlayer(node: AdventureNode): boolean {
    return this.map.neighborsOf(this.progress.currentNodeId).includes(node.id);
  }

  canMoveTo(node: AdventureNode): boolean {
    if (!this.isAdjacentToPlayer(node)) return false;
    if (this.isNodeCleared(this.currentNode)) return true;
    return this.isNodeVisited(node);
  }

  /**
   * BFS shortest path from the current node to [targetId], so the hero can
   * roam freely: any spot on the map is one tap away as long as open trail
   * leads there. Only cleared nodes can be walked *through* — an uncleared
   * event node (obstacle, rival, treasure) may be the destination but blocks
   * travel beyond it. Standing on an uncleared node, the first step may only
   * retreat to already-visited neighbors.
   *
   * Returns the node ids to walk, in order, excluding the current node —
   * or null when the target cannot be reached yet.
   */
  pathTo(targetId: string): string[] | null {
    const startId = this.progress.currentNodeId;
    if (targetId === startId) return [];
    const startCleared = this.isNodeCleared(this.currentNode);
    const cameFrom = new Map<string, string>();
    const seen = new Set<string>([startId]);
    const queue: string[] = [startId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      // Uncleared event nodes are terminal: reachable, but not passable.
      if (id !== startId && !this.isNodeCleared(this.map.nodeById(id))) continue;
      for (const nextId of this.map.neighborsOf(id)) {
        if (seen.has(nextId)) continue;
        if (id === startId && !startCleared && !this.progress.visitedNodes.has(nextId)) {
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

  /** Whether the hero can walk to [node] right now (possibly multiple hops). */
  canReach(node: AdventureNode): boolean {
    if (node.id === this.progress.currentNodeId) return false;
    return this.pathTo(node.id) !== null;
  }

  canTapNode(node: AdventureNode): boolean {
    if (node.id === this.progress.currentNodeId) {
      return !this.isNodeCleared(node) || node.type === 'rival';
    }
    return this.canReach(node);
  }

  moveToNode(nodeId: string): void {
    this.progress.currentNodeId = nodeId;
    this.progress.visitedNodes.add(nodeId);
    this.save();
  }

  markObstacleCleared(nodeId: string): void {
    this.progress.clearedNodes.add(nodeId);
    this.save();
  }

  openTreasure(nodeId: string): void {
    this.progress.clearedNodes.add(nodeId);
    this.save();
  }

  recordFightResult(nodeId: string, stars: number): void {
    if (stars <= 0) return;
    const existing = this.progress.rivalStars[nodeId] ?? 0;
    if (stars > existing) this.progress.rivalStars[nodeId] = stars;
    this.save();
  }

  completeJourney(): void {
    this.progress.completed = true;
    this.save();
  }

  rivalForNode(node: AdventureNode): Hero {
    return this.rivals[node.rivalIndex!];
  }

  isBossNode(node: AdventureNode): boolean {
    return node.rivalIndex !== undefined && node.rivalIndex === this.rivals.length - 1;
  }

  difficultyForNode(node: AdventureNode): string {
    if (node.difficulty) return node.difficulty;
    // Legacy maps without explicit difficulties scale by rival index.
    const index = node.rivalIndex!;
    if (index <= 1) return 'easy';
    if (index <= 3) return 'medium';
    return 'hard';
  }

  starsForNode(nodeId: string): number {
    return this.progress.rivalStars[nodeId] ?? 0;
  }

  get totalStars(): number {
    const fightStars = Object.values(this.progress.rivalStars).reduce((a, b) => a + b, 0);
    const treasureStars =
      this.map.nodes.filter(
        (n) => n.type === 'treasure' && this.progress.clearedNodes.has(n.id),
      ).length * 2;
    return fightStars + treasureStars;
  }

  get maxStars(): number {
    const treasures = this.map.nodes.filter((n) => n.type === 'treasure').length;
    return this.map.rivalCount * 3 + treasures * 2;
  }
}
