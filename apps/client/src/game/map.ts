/**
 * map.ts — Interface map tối thiểu cho client render (Phase 1b).
 *
 * Worker mapgen (packages/sim/src/mapgen.ts) đang được làm song song.
 * Map thật của sim chỉ cần thỏa mãn cấu trúc GameMap bên dưới
 * (width / height / tiles / get / spawnPoints) là cắm thẳng vào
 * GameRenderer được ngay — không cần sửa code render.
 */

export const TILE_SIZE = 64; // 1 tile = 64px world

export type TerrainKind = 'grass' | 'grass2' | 'dirt' | 'forest' | 'water';

export interface TileInfo {
  terrain: TerrainKind;
}

export interface SpawnPoint {
  tx: number; // tile X
  ty: number; // tile Y
}

export interface GameMap {
  width: number; // số tile ngang
  height: number; // số tile dọc
  tiles: TerrainKind[][]; // tiles[y][x]
  get(x: number, y: number): TileInfo;
  spawnPoints: SpawnPoint[];
}

/**
 * Chuẩn hoá tên terrain lạ (từ mapgen thật của sim sau này) về
 * TerrainKind mà renderer hiểu.
 */
export function normalizeTerrain(t: string): TerrainKind {
  const s = t.toLowerCase();
  if (/(water|sea|river|lake|ocean|nuoc|song|bien|ho)/.test(s)) return 'water';
  if (/(forest|tree|woods|rung|cay|tre)/.test(s)) return 'forest';
  if (/(dirt|sand|road|dat|cat|duong)/.test(s)) return 'dirt';
  if (/(grass2|meadow|field|dong)/.test(s)) return 'grass2';
  return 'grass';
}

/** RNG seed-able nhỏ cho demo (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface NoiseGrid {
  g: number[][];
  cols: number;
  rows: number;
  cell: number;
}

function makeNoise(rand: () => number, cols: number, rows: number, cell: number): NoiseGrid {
  const g: number[][] = [];
  for (let y = 0; y < rows; y++) {
    const row: number[] = [];
    for (let x = 0; x < cols; x++) row.push(rand());
    g.push(row);
  }
  return { g, cols, rows, cell };
}

function sampleNoise(n: NoiseGrid, x: number, y: number): number {
  const gx = x / n.cell;
  const gy = y / n.cell;
  const x0 = Math.max(0, Math.min(n.cols - 2, Math.floor(gx)));
  const y0 = Math.max(0, Math.min(n.rows - 2, Math.floor(gy)));
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = n.g[y0][x0];
  const b = n.g[y0][x0 + 1];
  const c = n.g[y0 + 1][x0];
  const d = n.g[y0 + 1][x0 + 1];
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/**
 * Map demo 128×128 sinh bằng value-noise có seed — dùng tạm cho tới khi
 * mapgen thật của sim xong. Địa hình: sông/hồ (water), rừng tre (forest),
 * bãi đất (dirt), 2 biến thể cỏ (grass/grass2).
 */
export class DemoMap implements GameMap {
  readonly width: number;
  readonly height: number;
  readonly tiles: TerrainKind[][];
  readonly spawnPoints: SpawnPoint[];

  constructor(
    public readonly seed: number,
    width = 128,
    height = 128,
  ) {
    this.width = width;
    this.height = height;
    const rand = mulberry32(seed);

    const elev = makeNoise(rand, 12, 12, 12);
    const veg = makeNoise(rand, 18, 18, 8);
    const dirtN = makeNoise(rand, 14, 14, 10);
    const varN = makeNoise(rand, 22, 22, 6);

    const tiles: TerrainKind[][] = [];
    for (let y = 0; y < height; y++) {
      const row: TerrainKind[] = [];
      for (let x = 0; x < width; x++) {
        const e = sampleNoise(elev, x, y);
        const v = sampleNoise(veg, x, y);
        const d = sampleNoise(dirtN, x, y);
        const vv = sampleNoise(varN, x, y);
        let t: TerrainKind = 'grass';
        if (e < 0.3) t = 'water';
        else if (v > 0.62) t = 'forest';
        else if (d > 0.7) t = 'dirt';
        else if (vv > 0.58) t = 'grass2';
        row.push(t);
      }
      tiles.push(row);
    }

    // Chọn 2 điểm spawn trên đất (không phải nước), dọn sạch cỏ quanh spawn 1.
    const spawns: SpawnPoint[] = [];
    const candidates: Array<[number, number]> = [
      [Math.floor(width * 0.25), Math.floor(height * 0.25)],
      [Math.floor(width * 0.75), Math.floor(height * 0.75)],
    ];
    for (const [cx, cy] of candidates) {
      let best: SpawnPoint = { tx: cx, ty: cy };
      outer: for (let r = 0; r < 20; r++) {
        for (let a = 0; a < 16; a++) {
          const tx = cx + Math.round(Math.cos((a / 16) * Math.PI * 2) * r);
          const ty = cy + Math.round(Math.sin((a / 16) * Math.PI * 2) * r);
          if (tx < 2 || ty < 2 || tx >= width - 2 || ty >= height - 2) continue;
          if (tiles[ty][tx] !== 'water') {
            best = { tx, ty };
            break outer;
          }
        }
      }
      spawns.push(best);
    }
    // Dọn vùng đất trống quanh spawn 1 để đặt entity demo.
    const s0 = spawns[0];
    for (let y = s0.ty - 9; y <= s0.ty + 9; y++) {
      for (let x = s0.tx - 9; x <= s0.tx + 9; x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        if (tiles[y][x] === 'water') tiles[y][x] = 'grass';
      }
    }

    this.tiles = tiles;
    this.spawnPoints = spawns;
  }

  get(x: number, y: number): TileInfo {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= this.width || yi >= this.height) {
      return { terrain: 'water' };
    }
    return { terrain: this.tiles[yi][xi] };
  }
}

/** Tâm tile (tx,ty) đổi sang world px. */
export function tileToWorld(tx: number, ty: number): { x: number; y: number } {
  return { x: (tx + 0.5) * TILE_SIZE, y: (ty + 0.5) * TILE_SIZE };
}
