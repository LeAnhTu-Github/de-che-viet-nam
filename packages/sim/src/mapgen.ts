// Map generator có seed cho game RTS — công bằng tuyệt đối cho 2 người chơi
// bằng đối xứng GƯƠNG qua trục dọc giữa map (x -> 127 - x).
// TUYỆT ĐỐI không dùng Math.random()/Date.now() — mọi ngẫu nhiên qua Rng seeded.

import { Rng } from './rng';
import { RESOURCES } from './data/resources';
import type { Vec2 } from './types';

/** Loại địa hình của một tile. */
export type TerrainKind = 'grass' | 'water' | 'forest' | 'dirt';

/** Một ô tile trên map. */
export interface Tile {
  terrain: TerrainKind;
  walkable: boolean;
  cost: number; // chi phí di chuyển (forest = 2, water = Infinity vì không đi được)
}

/** Bản đồ tile-based của trận đấu. */
export class GameMap {
  readonly width = 128;
  readonly height = 128;
  readonly tiles: Tile[] = [];
  readonly seed: string;
  /** Tăng version mỗi khi map bị thay đổi sau khi gen — Phase 3 dùng để invalidate flow field cache. */
  version = 0;

  constructor(seed: string | number) {
    this.seed = String(seed);
    for (let i = 0; i < this.width * this.height; i++) {
      this.tiles.push({ terrain: 'grass', walkable: true, cost: 1 });
    }
  }

  /** Lấy tile tại (x, y). Ngoài biên trả về tile chặn (không walkable). */
  get(x: number, y: number): Tile {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return OUT_OF_BOUNDS;
    }
    return this.tiles[y * this.width + x];
  }

  /** Tile (x, y) có đi được không. */
  isWalkable(x: number, y: number): boolean {
    return this.get(x, y).walkable;
  }
}

/** Tile chặn dùng cho tọa độ ngoài biên — không mutate object này. */
const OUT_OF_BOUNDS: Tile = {
  terrain: 'water',
  walkable: false,
  cost: Number.POSITIVE_INFINITY,
};

/** Tài nguyên đặt trên map (kind = key trong RESOURCES). */
export interface PlacedResource {
  kind: string;
  x: number;
  y: number;
  amount: number;
}

// ---- Hằng số layout (map 128x128) ----
const AXIS = 64; // trục đối xứng nằm giữa cột 63 và 64 (mirror: x -> 127 - x)
const SPAWN_LEFT_X = 20; // spawn phe 1; phe 2 = mirror = 107
const SPAWN_Y = 64;
const SPAWN_CLEAR = 2; // vùng 5x5 quanh spawn phải walkable
const RIVER_MAX_HALF = 3; // nửa chiều rộng sông tối đa -> sông chiếm cột 61..66, xa spawn

export interface GenerateMapResult {
  map: GameMap;
  spawns: Vec2[];
  resources: PlacedResource[];
}

/**
 * Sinh map công bằng cho 2 người chơi.
 * Mọi thứ chỉ gen ở nửa trái (x < 64) rồi mirror sang nửa phải,
 * nên 2 phe có địa hình + tài nguyên giống hệt nhau.
 */
export function generateMap(
  seed: string | number,
  playerCount = 2,
): GenerateMapResult {
  if (playerCount !== 2) {
    throw new Error(
      `generateMap hiện chỉ hỗ trợ 2 người chơi (nhận playerCount=${playerCount})`,
    );
  }
  const rng = new Rng(seed);
  const map = new GameMap(seed);
  const resources: PlacedResource[] = [];

  paintRiver(map, rng);
  // Bến lội dùng RNG riêng để không làm xáo trộn layout map cũ (deterministic theo seed).
  paintFords(map, new Rng('ford:' + String(seed)));
  paintForestClusters(map, rng);
  paintDirtPatches(map, rng);
  mirrorLeftToRight(map);
  clearSpawnAreas(map);

  const spawnL: Vec2 = { x: SPAWN_LEFT_X, y: SPAWN_Y };
  const spawnR: Vec2 = { x: 127 - SPAWN_LEFT_X, y: SPAWN_Y };

  placeSpawnResources(map, rng, resources, spawnL);
  placeContestedResources(map, rng, resources);
  placeFish(map, rng, resources);
  plantTreeNodes(map, rng, resources);

  return { map, spawns: [spawnL, spawnR], resources };
}

/**
 * Trồng cây gỗ (resource entity 'tree') trên các ô rừng.
 * Mỗi ô forest có 30% thành cây chặt được — mirror sang nửa phải để đối xứng.
 * Cần thiết vì dân chỉ chặt được resource entity, không chặt được tile terrain.
 */
function plantTreeNodes(map: GameMap, rng: Rng, resources: PlacedResource[]): void {
  const amount = RESOURCES['tree'].amount;
  for (let y = 1; y < map.height - 1; y++) {
    for (let x = 1; x < AXIS; x++) {
      if (map.get(x, y).terrain !== 'forest') continue;
      if (rng.float() >= 0.3) continue;
      resources.push({ kind: 'tree', x, y, amount });
      resources.push({ kind: 'tree', x: mirrorX(x), y, amount });
    }
  }
}

// ---------------------------------------------------------------------------
// Địa hình
// ---------------------------------------------------------------------------

/** Nửa chiều rộng sông tại hàng y (1..RIVER_MAX_HALF), uốn lượn theo sine seeded. */
function riverHalfWidthAt(y: number, phases: number[]): number {
  const t = (y / 128) * Math.PI * 2;
  const w =
    2 +
    Math.sin(t * 2 + phases[0]) * 0.9 +
    Math.sin(t * 5 + phases[1]) * 0.5;
  return Math.max(1, Math.min(RIVER_MAX_HALF, Math.round(w)));
}

/** Sông dọc giữa map: tâm nằm trên trục đối xứng, bề rộng uốn lượn theo y. */
function paintRiver(map: GameMap, rng: Rng): void {
  const phases = [rng.float() * Math.PI * 2, rng.float() * Math.PI * 2];
  for (let y = 0; y < map.height; y++) {
    const h = riverHalfWidthAt(y, phases);
    for (let x = AXIS - h; x < AXIS + h; x++) {
      setTile(map, x, y, 'water', false, Number.POSITIVE_INFINITY);
    }
    // Bờ đất 2 bên sông (trang trí, vẫn đi được)
    for (const bx of [AXIS - h - 1, AXIS + h]) {
      if (rng.float() < 0.7 && bx >= 0 && bx < AXIS) {
        setTile(map, bx, y, 'dirt', true, 1);
      }
    }
  }
}

/** Bến lội (ford): 2 chỗ cạn qua sông để bộ binh qua được — không có là 2 phe đánh nhau không tới nhau. */
function paintFords(map: GameMap, rng: Rng): void {
  const fys = [
    20 + Math.floor(rng.float() * 30),
    78 + Math.floor(rng.float() * 30),
  ];
  for (const fy of fys) {
    for (let dy = 0; dy < 3; dy++) {
      const y = Math.min(map.height - 2, fy + dy);
      // Chỉ vẽ nửa trái + trục; mirrorLeftToRight lo nửa phải (đối xứng tuyệt đối).
      for (let x = AXIS - RIVER_MAX_HALF - 1; x <= AXIS; x++) {
        setTile(map, x, y, 'dirt', true, 1);
      }
    }
  }
}

/** Vẽ cụm rừng tre: đĩa tròn bán kính r tại (cx, cy), chỉ ở nửa trái. */
function paintForestDisc(
  map: GameMap,
  rng: Rng,
  cx: number,
  cy: number,
  r: number,
): void {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x < 1 || x >= AXIS - RIVER_MAX_HALF - 2 || y < 1 || y >= map.height - 1) {
        continue;
      }
      const t = map.get(x, y);
      if (t.terrain === 'water') continue;
      // Rừng không mọc quá sát spawn (giữ sân nhà thoáng)
      if (Math.abs(x - SPAWN_LEFT_X) <= 4 && Math.abs(y - SPAWN_Y) <= 4) continue;
      if (rng.float() < 0.85) setTile(map, x, y, 'forest', true, 2);
    }
  }
}

/** Cụm rừng: 1 cụm gần mỗi spawn (gỗ khởi đầu) + cụm rải rác nửa trái. */
function paintForestClusters(map: GameMap, rng: Rng): void {
  // Cụm gỗ cạnh nhà: tâm cách spawn 10..17, bán kính 4..6
  const ang = rng.float() * Math.PI * 2;
  const dist = 10 + rng.float() * 7;
  const cx = Math.round(SPAWN_LEFT_X + Math.cos(ang) * dist);
  const cy = Math.round(SPAWN_Y + Math.sin(ang) * dist * 0.8);
  paintForestDisc(map, rng, cx, cy, 4 + Math.floor(rng.float() * 3));

  // Cụm rừng tự nhiên rải rác (tránh xa spawn và sông)
  const count = 7 + Math.floor(rng.float() * 4);
  for (let i = 0; i < count; i++) {
    const gx = 4 + Math.floor(rng.float() * (AXIS - RIVER_MAX_HALF - 10));
    const gy = 4 + Math.floor(rng.float() * (map.height - 8));
    if (Math.hypot(gx - SPAWN_LEFT_X, gy - SPAWN_Y) < 26) continue;
    paintForestDisc(map, rng, gx, gy, 5 + Math.floor(rng.float() * 8));
  }
}

/** Vệt đất trang trí rải rác nửa trái. */
function paintDirtPatches(map: GameMap, rng: Rng): void {
  for (let i = 0; i < 40; i++) {
    const cx = 2 + Math.floor(rng.float() * (AXIS - 4));
    const cy = 2 + Math.floor(rng.float() * (map.height - 4));
    const r = 1 + Math.floor(rng.float() * 2);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const t = map.get(cx + dx, cy + dy);
        if (t.terrain === 'grass' && rng.float() < 0.6) {
          setTile(map, cx + dx, cy + dy, 'dirt', true, 1);
        }
      }
    }
  }
}

/** Mirror nửa trái (x < 64) sang nửa phải (x -> 127 - x). */
function mirrorLeftToRight(map: GameMap): void {
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < AXIS; x++) {
      const src = map.get(x, y);
      map.tiles[y * map.width + (127 - x)] = { ...src };
    }
  }
}

/** Dọn vùng 5x5 quanh 2 spawn thành cỏ đi được. */
function clearSpawnAreas(map: GameMap): void {
  for (const sx of [SPAWN_LEFT_X, 127 - SPAWN_LEFT_X]) {
    for (let dy = -SPAWN_CLEAR; dy <= SPAWN_CLEAR; dy++) {
      for (let dx = -SPAWN_CLEAR; dx <= SPAWN_CLEAR; dx++) {
        setTile(map, sx + dx, SPAWN_Y + dy, 'grass', true, 1);
      }
    }
  }
}

function setTile(
  map: GameMap,
  x: number,
  y: number,
  terrain: TerrainKind,
  walkable: boolean,
  cost: number,
): void {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return;
  map.tiles[y * map.width + x] = { terrain, walkable, cost };
}

// ---------------------------------------------------------------------------
// Tài nguyên
// ---------------------------------------------------------------------------

function mirrorX(x: number): number {
  return 127 - x;
}

/** Đặt 1 node tài nguyên + bản mirror của nó (giữ đối xứng tuyệt đối). */
function placeMirrored(
  map: GameMap,
  resources: PlacedResource[],
  kind: string,
  x: number,
  y: number,
): void {
  // Node cần mặt đất trống: dọn tile rừng/cỏ dưới chân node (cả 2 bên mirror)
  for (const px of [x, mirrorX(x)]) {
    const t = map.get(px, y);
    if (t.terrain === 'forest' || t.terrain === 'dirt') {
      setTile(map, px, y, 'grass', true, 1);
    }
  }
  const amount = RESOURCES[kind].amount;
  resources.push({ kind, x, y, amount });
  resources.push({ kind, x: mirrorX(x), y, amount });
}

/** Tìm vị trí đất trống (grass/dirt, walkable) trong vành khăn quanh tâm. */
function findOpenSpot(
  map: GameMap,
  rng: Rng,
  cx: number,
  cy: number,
  minD: number,
  maxD: number,
  avoid: Vec2[],
  avoidDist: number,
): Vec2 | null {
  for (let attempt = 0; attempt < 120; attempt++) {
    const ang = rng.float() * Math.PI * 2;
    const d = minD + rng.float() * (maxD - minD);
    const x = Math.round(cx + Math.cos(ang) * d);
    const y = Math.round(cy + Math.sin(ang) * d);
    if (x < 2 || x >= AXIS - 1 || y < 2 || y >= map.height - 2) continue;
    const t = map.get(x, y);
    if (!t.walkable || (t.terrain !== 'grass' && t.terrain !== 'dirt')) continue;
    if (avoid.some((p) => Math.hypot(p.x - x, p.y - y) < avoidDist)) continue;
    return { x, y };
  }
  return null;
}

/** Tài nguyên khởi đầu quanh 1 spawn (chỉ đặt nửa trái, mirror tự lo). */
function placeSpawnResources(
  map: GameMap,
  rng: Rng,
  resources: PlacedResource[],
  spawn: Vec2,
): void {
  const placed: Vec2[] = [{ ...spawn }];

  const put = (
    kind: string,
    minD: number,
    maxD: number,
    avoidDist: number,
  ): void => {
    const spot = findOpenSpot(map, rng, spawn.x, spawn.y, minD, maxD, placed, avoidDist);
    if (!spot) {
      throw new Error(
        `mapgen: không đặt được ${kind} quanh spawn (${spawn.x},${spawn.y})`,
      );
    }
    placed.push(spot);
    placeMirrored(map, resources, kind, spot.x, spot.y);
  };

  put('berry', 5, 13, 4); // bụi quả 1
  put('berry', 5, 13, 4); // bụi quả 2
  put('gold_mine', 10, 20, 6); // mỏ vàng
  put('stone_mine', 10, 20, 6); // mỏ đá
  put('gazelle', 8, 18, 3); // nai 1
  put('gazelle', 8, 18, 3); // nai 2
  put('gazelle', 8, 18, 3); // nai 3
}

/** Tài nguyên tranh chấp giữa map: đặt theo cặp mirror, cách đều 2 spawn. */
function placeContestedResources(
  map: GameMap,
  rng: Rng,
  resources: PlacedResource[],
): void {
  const midY = SPAWN_Y;
  // Cặp mỏ vàng / mỏ đá ở vùng giữa (mỗi "1 mỏ" = 1 cặp mirror cho công bằng)
  const goldY = midY - 20 + Math.floor(rng.float() * 9); // ~44..52
  const stoneY = midY + 20 + Math.floor(rng.float() * 9); // ~84..92
  const mineX = 54 + Math.floor(rng.float() * 3); // 54..56, cách sông (>=61) an toàn

  placeMirroredOnOpen(map, rng, resources, 'gold_mine', mineX, goldY);
  placeMirroredOnOpen(map, rng, resources, 'stone_mine', mineX, stoneY);

  // Đàn voi rừng: 2 con nửa trái + 2 con mirror
  const herdY = midY + 34 + Math.floor(rng.float() * 8); // ~98..106
  const herdSpots: Vec2[] = [];
  for (let i = 0; i < 2; i++) {
    const spot = findOpenSpot(
      map, rng,
      52, herdY,
      0, 6,
      herdSpots, 3,
    ) ?? { x: 52 + i * 4, y: herdY };
    herdSpots.push(spot);
    placeMirrored(map, resources, 'wild_elephant', spot.x, spot.y);
  }
}

/** Đặt cặp mirror tại (x, y); nếu tile bận thì dịch tìm chỗ trống gần đó. */
function placeMirroredOnOpen(
  map: GameMap,
  rng: Rng,
  resources: PlacedResource[],
  kind: string,
  x: number,
  y: number,
): void {
  const spot = findOpenSpot(map, rng, x, y, 0, 5, [], 0) ?? { x, y };
  placeMirrored(map, resources, kind, spot.x, spot.y);
}

/** Cá dọc 2 bờ sông (nằm trên tile water). */
function placeFish(map: GameMap, rng: Rng, resources: PlacedResource[]): void {
  const phases = [rng.float() * Math.PI * 2, rng.float() * Math.PI * 2];
  let placed = 0;
  for (let i = 0; i < 40 && placed < 5; i++) {
    const y = 6 + Math.floor(rng.float() * (map.height - 12));
    const h = riverHalfWidthAt(y, phases);
    // Bờ trái của sông: cột nước sát mép
    const x = AXIS - h + Math.floor(rng.float() * 2);
    if (x < AXIS - h || x >= AXIS) continue;
    const t = map.get(x, y);
    if (t.terrain !== 'water') continue;
    const amount = RESOURCES['fish'].amount;
    resources.push({ kind: 'fish', x, y, amount });
    resources.push({ kind: 'fish', x: mirrorX(x), y, amount });
    placed++;
  }
}
