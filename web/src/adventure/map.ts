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
  connections: string[];
}

export interface AdventureMapJson {
  id: string;
  startNodeId: string;
  nodes: AdventureNode[];
}

export class AdventureMapDef {
  readonly id: string;
  readonly startNodeId: string;
  readonly nodes: AdventureNode[];
  private readonly byId: Map<string, AdventureNode>;

  constructor(json: AdventureMapJson) {
    this.id = json.id;
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

export async function loadAdventureMap(baseUrl: string): Promise<AdventureMapDef> {
  const res = await fetch(`${baseUrl}assets/maps/journey_1.json`);
  if (!res.ok) throw new Error(`Failed to load adventure map: ${res.status}`);
  const json = (await res.json()) as AdventureMapJson;
  return new AdventureMapDef(json);
}
