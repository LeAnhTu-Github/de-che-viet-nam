/**
 * textures.ts — Texture tile 64×64 vẽ bằng PIXI.Graphics → generateTexture.
 * Cache dùng chung toàn app; gọi destroyTileTextures() khi huỷ renderer.
 */
import * as PIXI from 'pixi.js';
import { TILE_SIZE, type TerrainKind } from './map';
import { mulberry32 } from './map';
import { resolveTile } from './spriteManager';

const cache = new Map<TerrainKind, PIXI.Texture>();

function drawGrass(g: PIXI.Graphics, base: number, seed: number): void {
  g.rect(0, 0, TILE_SIZE, TILE_SIZE).fill(base);
  const rand = mulberry32(seed);
  for (let i = 0; i < 48; i++) {
    const x = rand() * TILE_SIZE;
    const y = rand() * TILE_SIZE;
    const s = 1 + rand() * 2;
    g.rect(x, y, s, s).fill({ color: rand() > 0.5 ? 0x000000 : 0xffffff, alpha: 0.07 });
  }
}

function drawDirt(g: PIXI.Graphics, seed: number): void {
  g.rect(0, 0, TILE_SIZE, TILE_SIZE).fill(0x9a7848);
  const rand = mulberry32(seed);
  for (let i = 0; i < 40; i++) {
    const x = rand() * TILE_SIZE;
    const y = rand() * TILE_SIZE;
    const s = 1 + rand() * 3;
    g.rect(x, y, s, s).fill({ color: rand() > 0.5 ? 0x6b4f2a : 0xd9b878, alpha: 0.16 });
  }
}

function drawForest(g: PIXI.Graphics, seed: number): void {
  g.rect(0, 0, TILE_SIZE, TILE_SIZE).fill(0x3a6b2e);
  const rand = mulberry32(seed);
  // Tán cây: chấm tròn xanh đậm nhiều lớp
  for (let i = 0; i < 14; i++) {
    const x = 6 + rand() * (TILE_SIZE - 12);
    const y = 6 + rand() * (TILE_SIZE - 12);
    const r = 4 + rand() * 5;
    g.circle(x, y, r).fill(0x26491d);
    g.circle(x - r * 0.25, y - r * 0.25, r * 0.55).fill(0x35632a);
  }
}

function drawWater(g: PIXI.Graphics, seed: number): void {
  g.rect(0, 0, TILE_SIZE, TILE_SIZE).fill(0x3570b8);
  const rand = mulberry32(seed);
  // Gợn sóng: vệt ngang sáng mờ
  for (let i = 0; i < 5; i++) {
    const x = rand() * TILE_SIZE;
    const y = rand() * TILE_SIZE;
    const w = 10 + rand() * 16;
    g.rect(x, y, w, 2).fill({ color: 0xbfe0f5, alpha: 0.45 });
    g.rect(x + 3, y + 3, w * 0.7, 1.5).fill({ color: 0x1e4f86, alpha: 0.4 });
  }
}

function drawTile(g: PIXI.Graphics, kind: TerrainKind): void {
  switch (kind) {
    case 'grass':
      drawGrass(g, 0x5a8f3c, 1001);
      break;
    case 'grass2':
      drawGrass(g, 0x4e8233, 2002);
      break;
    case 'dirt':
      drawDirt(g, 3003);
      break;
    case 'forest':
      drawForest(g, 4004);
      break;
    case 'water':
      drawWater(g, 5005);
      break;
  }
}

/** Tạo (hoặc lấy từ cache) texture cho 5 loại tile. Cần renderer đã init. */
export function getTileTextures(renderer: PIXI.Renderer): Record<TerrainKind, PIXI.Texture> {
  const out = {} as Record<TerrainKind, PIXI.Texture>;
  const kinds: TerrainKind[] = ['grass', 'grass2', 'dirt', 'forest', 'water'];
  for (const kind of kinds) {
    let tex = cache.get(kind);
    if (!tex) {
      // Ưu tiên sprite PNG thật; thiếu → fallback vẽ bằng code như cũ
      tex = resolveTile(kind) ?? makeGeneratedTile(renderer, kind);
      cache.set(kind, tex);
    }
    out[kind] = tex;
  }
  return out;
}

/** Tile vẽ bằng code (fallback khi thiếu file PNG). */
function makeGeneratedTile(renderer: PIXI.Renderer, kind: TerrainKind): PIXI.Texture {
  const g = new PIXI.Graphics();
  drawTile(g, kind);
  const tex = renderer.generateTexture({ target: g });
  g.destroy();
  return tex;
}

export function destroyTileTextures(): void {
  for (const tex of cache.values()) tex.destroy(true);
  cache.clear();
}
