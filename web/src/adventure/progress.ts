// Adventure progression + persistence — ported from
// client/lib/services/adventure_service.dart. SharedPreferences -> localStorage,
// same key ('adventure_progress_v2') and JSON shape.

import { AdventureMapDef, AdventureNode } from './map';
import { HeroType, Hero, heroByType, ALL_HEROES } from '../game/hero';

const PREFS_KEY = 'adventure_progress_v2';

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

export function hasSavedJourney(): boolean {
  return localStorage.getItem(PREFS_KEY) !== null;
}

export function clearSavedJourney(): void {
  localStorage.removeItem(PREFS_KEY);
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
      const stored = localStorage.getItem(PREFS_KEY);
      if (stored) {
        this.progress = fromJson(JSON.parse(stored) as AdventureProgressJson);
      } else {
        this.progress = freshProgress(map.id, 'panda', map.startNodeId);
        this.save();
      }
    }
  }

  private save(): void {
    localStorage.setItem(PREFS_KEY, JSON.stringify(toJson(this.progress)));
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

  canTapNode(node: AdventureNode): boolean {
    if (node.id === this.progress.currentNodeId) {
      return !this.isNodeCleared(node) || node.type === 'rival';
    }
    return this.canMoveTo(node);
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
