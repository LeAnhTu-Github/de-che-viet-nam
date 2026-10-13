/**
 * spriteManager.ts — Quản lý sprite PNG thật (thay placeholder vẽ bằng code).
 *
 * Assets: apps/client/public/sprites/
 *  - vn_unit_<id>_<state>_<dir>_<frame>.png  (dir: 8 hướng, frame: 0..N)
 *  - vn_bld_<id>_<state>.png                (state: build_1..3, idle, rubble)
 *  - resources/vn_res_*.png, resources/vn_tile_*.png
 *  - manifest.json: liệt kê frame thực có trên đĩa (sinh bởi prepare_client_assets.py)
 *
 * Nguyên tắc: mọi getter trả về null khi thiếu file HOẶC chưa load xong → caller dùng
 * placeholder cũ, rồi dựng lại khi spriteEpoch() đổi.
 * Load qua PIXI.Assets (Pixi v8: Texture.from(url) KHÔNG tự tải file):
 *  - tile + nhà + tài nguyên (~70 file): preload ngay sau manifest.
 *  - unit (~180 file/loại): load lazy cả bộ khi loại unit đó xuất hiện lần đầu.
 */
import * as PIXI from 'pixi.js';
import { BUILDINGS } from '@aoe-vn/sim';
import type { UnitState } from '@aoe-vn/sim';
import { TILE_SIZE } from './map';

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
  /**
   * Từng frame unit [ax, ay, k] (sinh bởi normalize_units.py): (ax, ay) = điểm đặt chân
   * trong ảnh đã cắt, k = 1 / chiều-cao-chuẩn → scale vẽ = chiều cao hiển thị * k.
   */
  unitMeta?: Record<string, Record<string, Record<string, [number, number, number][]>>>;
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
    .then((m: Manifest | null) => {
      manifest = m;
      if (!m) return;
      const core = [...m.tiles, ...m.resources].map((f) => `sprites/${f}`);
      for (const [id, states] of Object.entries(m.buildings)) {
        for (const st of states) core.push(`sprites/vn_bld_${id}_${st}.png`);
      }
      return loadPaths(core);
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
let epoch = 0;

/** Tăng mỗi khi có thêm texture load xong — view so sánh để dựng lại từ placeholder. */
export function spriteEpoch(): number {
  return epoch;
}

/** Texture đã load xong, hoặc null (chưa load / thiếu file). */
function tex(path: string): PIXI.Texture | null {
  return texCache.get(path) ?? null;
}

async function loadPaths(paths: string[]): Promise<void> {
  const todo = paths.filter((p) => !texCache.has(p));
  if (todo.length === 0) return;
  const res = (await PIXI.Assets.load(todo)) as Record<string, PIXI.Texture>;
  for (const p of todo) {
    const t = res[p];
    if (t) texCache.set(p, t);
  }
  epoch++;
}

const unitsRequested = new Set<string>();

/** Load lazy toàn bộ frame của 1 loại unit (gọi nhiều lần vô hại). */
function requestUnit(spriteId: string): void {
  if (unitsRequested.has(spriteId)) return;
  const u = manifest?.units[spriteId];
  if (!u) return;
  unitsRequested.add(spriteId);
  const paths: string[] = [];
  for (const [st, dirs] of Object.entries(u)) {
    for (const [dir, count] of Object.entries(dirs)) {
      for (let f = 0; f < count; f++) paths.push(`sprites/vn_unit_${spriteId}_${st}_${dir}_${f}.png`);
    }
  }
  loadPaths(paths).catch(() => unitsRequested.delete(spriteId));
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
): {
  texture: PIXI.Texture;
  state: SpriteUnitState;
  dir: Dir8;
  frame: number;
  count: number;
  /** Điểm đặt chân, tỉ lệ 0..1 trong texture (dùng làm anchor). */
  anchorX: number;
  anchorY: number;
  /** Scale vẽ (world px / px ảnh) — giữ nhân vật cùng cỡ ở mọi frame. */
  scale: number;
} | null {
  const u = manifest?.units[spriteId];
  if (!u) return null;
  const stKey = (u[state] ? state : 'idle') as SpriteUnitState;
  const st = u[stKey];
  const dirKey = (st[dir] ? dir : 'down') as Dir8;
  const count = st[dirKey];
  if (!count) return null;
  const f = Math.min(frame, count - 1);
  const texture = tex(`sprites/vn_unit_${spriteId}_${stKey}_${dirKey}_${f}.png`);
  if (!texture) {
    requestUnit(spriteId);
    return null;
  }
  const meta = manifest?.unitMeta?.[spriteId]?.[stKey]?.[dirKey]?.[f];
  const H = unitDisplayHeight(spriteId);
  return {
    texture,
    anchorX: meta ? meta[0] / texture.width : 0.5,
    anchorY: meta ? meta[1] / texture.height : 1,
    scale: meta ? H * meta[2] : H / Math.max(1, texture.height),
    state: stKey,
    dir: dirKey,
    frame: f,
    count,
  };
}

export function unitDisplayHeight(spriteId: string): number {
  return UNIT_H[spriteId] ?? 48;
}


/** Bán kính ngang vòng chọn dưới chân unit (world px) — theo loại unit, không theo frame. */
export function unitFootRadius(spriteId: string): number {
  return Math.max(13, unitDisplayHeight(spriteId) * 0.3);
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
  return tex(`sprites/vn_bld_${spriteId}_${st}.png`);
}

/** Nền nhà (footprint) theo world px, tâm tại vị trí entity. */
export function buildingFootprint(defId: string): { w: number; h: number } {
  const [tw, th] = (BUILDINGS[defId]?.size ?? '2x2').split('x').map(Number);
  return { w: tw * TILE_SIZE, h: th * TILE_SIZE };
}

/** Bề ngang vẽ sprite nhà: phủ vừa nền nhà (hơi trùm mép cho mái). */
export function buildingDisplayWidth(defId: string): number {
  return buildingFootprint(defId).w * 1.12;
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
  const texture = tex(file);
  if (!texture) return null;
  return { texture, file };
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
