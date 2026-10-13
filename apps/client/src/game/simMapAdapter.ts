/**
 * simMapAdapter — Nối map thật từ @aoe-vn/sim (packages/sim/src/mapgen.ts)
 * vào GameMap interface mà GameRenderer hiểu (định nghĩa trong map.ts).
 * Phase 1c: thay thế DemoMap.
 */
import { generateMap } from '@aoe-vn/sim';
import type { GameMap as SimGameMap } from '@aoe-vn/sim';
import { normalizeTerrain, type GameMap, type SpawnPoint, type TerrainKind } from './map';

export interface RealMapResult {
  map: GameMap;
  seed: string;
}

/** Bọc SimGameMap (tiles phẳng) thành GameMap (tiles[y][x]) cho renderer. */
export function adaptSimMap(simMap: SimGameMap, spawns: { x: number; y: number }[]): GameMap {
  const tiles: TerrainKind[][] = [];
  for (let y = 0; y < simMap.height; y++) {
    const row: TerrainKind[] = [];
    for (let x = 0; x < simMap.width; x++) {
      row.push(normalizeTerrain(simMap.get(x, y).terrain));
    }
    tiles.push(row);
  }
  const spawnPoints: SpawnPoint[] = spawns.map((s) => ({ tx: Math.round(s.x), ty: Math.round(s.y) }));
  return {
    width: simMap.width,
    height: simMap.height,
    tiles,
    get(x: number, y: number): { terrain: TerrainKind } {
      if (x < 0 || y < 0 || x >= simMap.width || y >= simMap.height) return { terrain: 'grass' };
      return { terrain: tiles[y][x] };
    },
    spawnPoints,
  };
}

/** Sinh map thật từ seed (deterministic — cùng seed ra cùng map). */
export function createRealMap(seed: string | number): RealMapResult {
  const s = String(seed);
  const { map: simMap, spawns } = generateMap(s, 2);
  return { map: adaptSimMap(simMap, spawns), seed: s };
}
