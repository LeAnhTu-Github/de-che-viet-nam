/**
 * spriteManager.ts — Quản lý sprite PNG thật (thay placeholder vẽ bằng code).
 *
 * Assets: apps/client/public/sprites/
 *  - vn_unit_<id>_<state>_<dir>_<frame>.png  (dir: 8 hướng, frame: 0..N)
 *  - vn_bld_<id>_<state>.png                (state: build_1..3, idle, rubble)
 *  - resources/vn_res_*.png, resources/vn_tile_*.png
 *  - manifest.json: liệt kê frame thực có trên đĩa (sinh bởi prepare_client_assets.py)
 *
 * Nguyên tắc: mọi getter trả về null khi thiếu file → caller dùng placeholder cũ.
 * Texture load lazy qua PIXI.Texture.from + cache (không preload 2000+ file).
 */
import * as PIXI from 'pixi.js';
import type { UnitState } from '@aoe-vn/sim';

export const DIRS8 = [
  'down',
  'down-right',
  'right',
  'up-right',
  'up',
  'up-left',
  'left',
  'down-left',
] as const;
export type Dir8 = (typeof DIRS8)[number];

export type SpriteUnitState = 'idle' | 'walk' | 'attack' | 'work' | 'die';

/* ── defId (sim) → sprite id ─────────────────────────────── */

export const UNIT_SPRITE: Record<string, string> = {
  villager_m: 'nongdan',
  villager_f: 'thonnu',
  priest: 'thaymo',
  clubman: 'danbinh',
  axeman: 'danbinh',
  slinger: 'danbinh',
  short_swordsman: 'daobinh',
  broad_swordsman: 'daobinh',
  long_swordsman: 'daobinh',
  legion: 'daobinh',
  hoplite: 'giaobinh',
  phalanx: 'giaobinh',
  centurion: 'giaobinh',
  bowman: 'cungthu',
  improved_bowman: 'cungthu',
  composite_bowman: 'cungthu',
  horse_archer: 'trinhsat',
  heavy_horse_archer: 'trinhsat',
  chariot_archer: 'trinhsat',
  elephant_archer: 'trinhsat',
  scout: 'trinhsat',
  camel_rider: 'trinhsat',
  chariot: 'trinhsat',
  scythe_chariot: 'trinhsat',
  cavalry: 'kybinb',
  heavy_cavalry: 'kybinb',
  cataphract: 'kybinb',
  war_elephant: 'voichien',
  armored_elephant: 'voichien',
  stone_thrower: 'maybanda',
  catapult: 'maybanda',
  heavy_catapult: 'maybanda',
  ballista: 'nothan',
  helepolis: 'nothan',
};

export const BUILDING_SPRITE: Record<string, string> = {
  town_center: 'dinhlang',
  house: 'nhasan',
  granary: 'khothoc',
  storage_pit: 'nhakho',
  farm: 'ruonglua',
  barracks: 'trailinh',
  archery_range: 'truongban',
  stable: 'chuongngua',
  siege_workshop: 'trailinh',
  academy: 'trailinh',
  temple: 'dinhlang',
  market: 'nhakho',
  government_center: 'dinhlang',
  watch_tower: 'choicanh',
  sentry_tower: 'choicanh',
  guard_tower: 'choicanh',
  ballista_tower: 'choicanh',
  small_wall: 'tuongdat',
  medium_wall: 'tuongdat',
  fortification: 'tuongdat',
  wonder: 'dinhlang',
  // dock: không có sprite → placeholder
};

/* ── Chiều cao hiển thị mục tiêu (world px, 1 tile = 64px) ── */

const UNIT_H: Record<string, number> = {
  nongdan: 46, thonnu: 46, danbinh: 48, daobinh: 50, cungthu: 48,
  giaobinh: 54, trinhsat: 70, kybinb: 70, voichien: 100, thaymo: 48,
  maybanda: 64, nothan: 70,
};

const BUILDING_H: Record<string, number> = {
  dinhlang: 150, nhasan: 95, khothoc: 95, nhakho: 95, ruonglua: 55,
  trailinh: 105, truongban: 105, chuongngua: 105, choicanh: 115, tuongdat: 45,
};

/** Tốc độ animation (frame/giây) theo state. */
export const STATE_FPS: Record<SpriteUnitState, number> = {
  idle: 4,
  walk: 10,
  attack: 8,
  work: 6,
  die: 6,
};

/* ── Manifest ────────────────────────────────────────────── */

interface Manifest {
  units: Record<string, Record<string, Record<string, number>>>;
  buildings: Record<string, string[]>;
  resources: string[];
  tiles: string[];
}

let manifest: Manifest | null = null;
let manifestPromise: Promise<void> | null = null;

/** Gọi 1 lần khi init game (renderer.init). Thiếu file → null, game vẫn chạy placeholder. */
export function ensureSpriteManifest(): Promise<void> {
  if (manifestPromise) return manifestPromise;
  manifestPromise = fetch('sprites/manifest.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((m) => {
      manifest = m;
    })
    .catch(() => {
      manifest = null;
    });
  return manifestPromise;
}

export function spriteManifestLoaded(): boolean {
  return manifest !== null;
}

/* ── Texture cache ───────────────────────────────────────── */

const texCache = new Map<string, PIXI.Texture>();

function tex(path: string): PIXI.Texture {
  let t = texCache.get(path);
  if (!t) {
    t = PIXI.Texture.from(path);
    texCache.set(path, t);
  }
  return t;
}

/* ── Unit ────────────────────────────────────────────────── */

export function mapUnitState(s: UnitState): SpriteUnitState {
  switch (s) {
    case 'moving':
    case 'returning':
      return 'walk';
    case 'attacking':
      return 'attack';
    case 'gathering':
    case 'building':
      return 'work';
    case 'dead':
      return 'die';
    default:
      return 'idle';
  }
}

/** Số frame thực có của (unit, state, dir); fallback dir → 'down', state → 'idle'. */
export function unitFrameCount(spriteId: string, state: SpriteUnitState, dir: Dir8): number {
  const u = manifest?.units[spriteId];
  if (!u) return 0;
  const st = u[state] ?? u['idle'];
  if (!st) return 0;
  return st[dir] ?? st['down'] ?? 0;
}

/** Resolve (state, dir, frame) thực tế sau fallback. Trả null nếu không có sprite. */
export function resolveUnitFrame(
  spriteId: string,
  state: SpriteUnitState,
  dir: Dir8,
  frame: number,
): { texture: PIXI.Texture; state: SpriteUnitState; dir: Dir8; frame: number; count: number } | null {
  const u = manifest?.units[spriteId];
  if (!u) return null;
  const stKey = (u[state] ? state : 'idle') as SpriteUnitState;
  const st = u[stKey];
  const dirKey = (st[dir] ? dir : 'down') as Dir8;
  const count = st[dirKey];
  if (!count) return null;
  const f = Math.min(frame, count - 1);
  return {
    texture: tex(`sprites/vn_unit_${spriteId}_${stKey}_${dirKey}_${f}.png`),
    state: stKey,
    dir: dirKey,
    frame: f,
    count,
  };
}

export function unitDisplayHeight(spriteId: string): number {
  return UNIT_H[spriteId] ?? 48;
}

/* ── Building ────────────────────────────────────────────── */

export function buildingSpriteState(progress: number, hp: number): string {
  if (hp <= 0) return 'rubble';
  if (progress < 0.33) return 'build_1';
  if (progress < 0.66) return 'build_2';
  if (progress < 1) return 'build_3';
  return 'idle';
}

export function resolveBuilding(
  spriteId: string,
  state: string,
): PIXI.Texture | null {
  const states = manifest?.buildings[spriteId];
  if (!states) return null;
  const st = states.includes(state) ? state : states.includes('idle') ? 'idle' : states[0];
  if (st === 'straight' || st === 'corner') {
    return tex(`sprites/vn_bld_${spriteId}_${st}.png`);
  }
  return tex(`sprites/vn_bld_${spriteId}_${st}.png`);
}

export function buildingDisplayHeight(spriteId: string): number {
  return BUILDING_H[spriteId] ?? 90;
}

/* ── Resource ────────────────────────────────────────────── */

/** Chọn file sprite tài nguyên theo defId + lượng còn lại. entityId để đa dạng loại cây. */
export function resourceSpriteFile(
  defId: string,
  amount: number,
  maxAmount: number,
  entityId: number,
): string | null {
  const R = (n: string) => `sprites/resources/${n}`;
  const ratio = maxAmount > 0 ? amount / maxAmount : 1;
  switch (defId) {
    case 'tree': {
      const v = ['tre', 'cayto', 'caynho'][Math.abs(entityId) % 3];
      return R(`vn_res_${v}_${ratio < 0.5 ? 'cut' : 'full'}.png`);
    }
    case 'berry':
      return R(`vn_res_buiqua_${ratio < 0.5 ? 'picked' : 'full'}.png`);
    case 'gold_mine':
      return R(`vn_res_vang_${ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3}.png`);
    case 'stone_mine':
      return R(`vn_res_da_${ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3}.png`);
    case 'gazelle':
      return R('vn_res_nai.png');
    case 'wild_elephant':
      return R('vn_res_voinuoi.png');
    case 'lion':
      return R('vn_res_ho.png');
    case 'fish':
      return R('vn_res_ca.png');
    default:
      return null;
  }
}

export function resolveResource(
  defId: string,
  amount: number,
  maxAmount: number,
  entityId: number,
): { texture: PIXI.Texture; file: string } | null {
  const file = resourceSpriteFile(defId, amount, maxAmount, entityId);
  if (!file) return null;
  if (manifest && !manifest.resources.includes(file.replace('sprites/', ''))) return null;
  return { texture: tex(file), file };
}

/** Chiều cao hiển thị tài nguyên (world px). */
export function resourceDisplayHeight(defId: string): number {
  switch (defId) {
    case 'tree':
      return 85;
    case 'gold_mine':
    case 'stone_mine':
      return 55;
    case 'berry':
      return 40;
    case 'gazelle':
    case 'wild_elephant':
    case 'lion':
      return 48;
    case 'fish':
      return 28;
    default:
      return 48;
  }
}

/* ── Terrain tile ────────────────────────────────────────── */

const TILE_PNG: Record<string, string> = {
  grass: 'sprites/resources/vn_tile_co.png',
  grass2: 'sprites/resources/vn_tile_co.png',
  dirt: 'sprites/resources/vn_tile_dat.png',
  forest: 'sprites/resources/vn_tile_co.png',
  water: 'sprites/resources/vn_tile_nuoc.png',
};

export function resolveTile(kind: string): PIXI.Texture | null {
  const p = TILE_PNG[kind];
  if (!p) return null;
  if (manifest && !manifest.tiles.includes(p.replace('sprites/', ''))) return null;
  return tex(p);
}

/* ── Hướng ───────────────────────────────────────────────── */

/** Vector di chuyển (world px, y hướng xuống) → 1 trong 8 hướng. */
export function dir8FromDelta(dx: number, dy: number): Dir8 {
  const order: Dir8[] = [
    'right', 'down-right', 'down', 'down-left',
    'left', 'up-left', 'up', 'up-right',
  ];
  const idx = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  return order[idx];
}
