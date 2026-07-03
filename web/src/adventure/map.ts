// Adventure map model — ported from client/lib/models/adventure.dart.

export type AdventureNodeType = 'start' | 'path' | 'obstacle' | 'rival' | 'treasure' | 'finish';

export type ObstacleType =
  | 'fallenLog'
  | 'riverRaft'
  | 'sleepingCub'
  | 'tangledVines'
  | 'ropeBridge'
  | 'snowballBoulder'
  | 'icePatch';

export type Biome = 'meadow' | 'forest' | 'peaks';

export type AIDifficulty = 'easy' | 'medium' | 'hard';

export interface AdventureNode {
  id: string;
  type: AdventureNodeType;
  /** Horizontal position as fraction of map width (0..1). */
  x: number;
  /** Vertical position as fraction of total map height (0 = summit, 1 = start). */
  y: number;
  biome: Biome;
  obstacle?: ObstacleType;
  /** For rival nodes: index into the journey's rival list (last = boss). */
  rivalIndex?: number;
  /** For rival nodes: explicit AI difficulty (falls back to a rivalIndex heuristic). */
  difficulty?: AIDifficulty;
  connections: string[];
}

export interface AdventureMapJson {
  id: string;
  name?: string;
  /** Map height as a multiple of the viewport height (bigger levels scroll longer). */
  heightFactor?: number;
  startNodeId: string;
  nodes: AdventureNode[];
}

/** Default for maps that predate heightFactor (journey_1's original size). */
const DEFAULT_HEIGHT_FACTOR = 3.6;

export class AdventureMapDef {
  readonly id: string;
  readonly name: string;
  readonly heightFactor: number;
  readonly startNodeId: string;
  readonly nodes: AdventureNode[];
  private readonly byId: Map<string, AdventureNode>;

  constructor(json: AdventureMapJson) {
    this.id = json.id;
    this.name = json.name ?? json.id;
    this.heightFactor = json.heightFactor ?? DEFAULT_HEIGHT_FACTOR;
    this.startNodeId = json.startNodeId;
    this.nodes = json.nodes.map((n) => ({ ...n, connections: n.connections ?? [] }));
    this.byId = new Map(this.nodes.map((n) => [n.id, n]));
  }

  nodeById(id: string): AdventureNode {
    const node = this.byId.get(id);
    if (!node) throw new Error(`Unknown adventure node: ${id}`);
    return node;
  }

  neighborsOf(id: string): string[] {
    return this.nodeById(id).connections;
  }

  /** Deduplicated undirected edges as [a, b] with a < b. */
  get edges(): Array<[string, string]> {
    const seen = new Set<string>();
    const result: Array<[string, string]> = [];
    for (const node of this.nodes) {
      for (const other of node.connections) {
        const key = node.id < other ? `${node.id}|${other}` : `${other}|${node.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push(node.id < other ? [node.id, other] : [other, node.id]);
        }
      }
    }
    return result;
  }

  get rivalCount(): number {
    return this.nodes.filter((n) => n.type === 'rival').length;
  }
}

export async function loadAdventureMap(baseUrl: string, mapId = 'journey_1'): Promise<AdventureMapDef> {
  const res = await fetch(`${baseUrl}assets/maps/${mapId}.json`);
  if (!res.ok) throw new Error(`Failed to load adventure map ${mapId}: ${res.status}`);
  const json = (await res.json()) as AdventureMapJson;
  return new AdventureMapDef(json);
}
