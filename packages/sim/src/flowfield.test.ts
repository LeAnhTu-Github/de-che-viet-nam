// Test Phase 3: flow field pathfinding + steering.
// Chạy: npx tsx src/flowfield.test.ts  (đứng từ packages/sim)

import { Game } from './Game';
import { FlowField, FlowFieldCache } from './flowfield';
import type { GameMap } from './mapgen';
import type { UnitEntity } from './entities';

// @types/node không có trong repo → khai báo tối thiểu cho performance.now().
declare const performance: { now(): number };

let failures = 0;

function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}

function asUnit(game: Game, id: number): UnitEntity {
  const e = game.entities.get(id);
  if (!e || e.kind !== 'unit') throw new Error(`entity ${id} không phải unit`);
  return e;
}

// ---------------------------------------------------------------------------
// Map test 64x64: tường dọc x=32 (trừ khe hở 3 tile y=30..32) → choke point.
// ---------------------------------------------------------------------------

type Walls = Array<[number, number, number, number]>; // [x0, x1, y0, y1]
const CHOKE_WALLS: Walls = [
  [32, 32, 0, 29],
  [32, 32, 33, 63],
];

class TestMap {
  readonly width = 64;
  readonly height = 64;
  version = 0;
  private readonly walk: Uint8Array;

  constructor(walls: Walls) {
    this.walk = new Uint8Array(64 * 64).fill(1);
    for (const [x0, x1, y0, y1] of walls) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (x >= 0 && y >= 0 && x < 64 && y < 64) this.walk[y * 64 + x] = 0;
        }
      }
    }
  }

  get(x: number, y: number): { walkable: boolean; cost: number } {
    if (x < 0 || y < 0 || x >= 64 || y >= 64) {
      return { walkable: false, cost: Number.POSITIVE_INFINITY };
    }
    return this.walk[y * 64 + x] === 1
      ? { walkable: true, cost: 1 }
      : { walkable: false, cost: Number.POSITIVE_INFINITY };
  }

  isWalkable(x: number, y: number): boolean {
    return this.get(x, y).walkable;
  }
}

// ---------------------------------------------------------------------------
// Phần 1: FlowField.compute — Dijkstra, hướng đi, chéo, unreachable.
// ---------------------------------------------------------------------------

{
  const map = new TestMap(CHOKE_WALLS);
  const goal: [number, number] = [55, 32];
  const f = FlowField.compute(goal[0], goal[1], map);

  check('cost tại ô đích = 0', f.costAt(55, 32) === 0);
  const dAdj = f.directionAt(56, 32);
  check(
    'hướng tại ô kề đích trỏ về đích',
    dAdj !== null && dAdj.dx === -1 && dAdj.dy === 0,
    JSON.stringify(dAdj),
  );

  // Unit bên trái tường, phía trên khe hở → field dẫn xuống khe (0, +1).
  const dWall = f.directionAt(31, 10);
  check(
    'field vòng qua tường về phía khe hở',
    dWall !== null && dWall.dx === 0 && dWall.dy === 1,
    JSON.stringify(dWall),
  );
  check(
    'cost bên trái tường hữu hạn (đi được qua khe)',
    Number.isFinite(f.costAt(31, 10)),
    `cost=${f.costAt(31, 10)}`,
  );
  check(
    'càng gần khe cost càng rẻ',
    f.costAt(31, 28) < f.costAt(31, 10),
    `${f.costAt(31, 28)} < ${f.costAt(31, 10)}`,
  );

  // Ô đích nằm trên tường → snap tới ô walkable gần nhất.
  const fWall = FlowField.compute(32, 10, map);
  check(
    'đích trên tường: snap tới ô đi được gần nhất',
    fWall.goalX === 31 && fWall.goalY === 9 && fWall.costAt(31, 9) === 0,
    `goal=(${fWall.goalX},${fWall.goalY})`,
  );
  check(
    'ô tường: cost = Infinity, direction = null',
    fWall.costAt(32, 10) === Number.POSITIVE_INFINITY &&
      fWall.directionAt(32, 10) === null,
  );

  // Cấm cắt góc tường: tường đơn tại (5,4), đích (6,4).
  // Từ (4,4), đường chéo (5,3) cắt góc tường → bị cấm → phải đi vòng (dx=0).
  const cornerMap = new TestMap([[5, 5, 4, 4]]);
  const fCorner = FlowField.compute(6, 4, cornerMap);
  const dCorner = fCorner.directionAt(4, 4);
  check(
    'chéo qua góc tường bị cấm (phải đi vòng)',
    dCorner !== null && dCorner.dx === 0 && dCorner.dy !== 0,
    JSON.stringify(dCorner),
  );

  // Ô bị vây kín → không tới được.
  const boxMap = new TestMap([
    [7, 9, 7, 7],
    [7, 9, 9, 9],
    [7, 7, 7, 9],
    [9, 9, 7, 9],
  ]);
  const fBox = FlowField.compute(0, 0, boxMap);
  check(
    'ô bị vây kín: cost = Infinity, direction = null',
    fBox.costAt(8, 8) === Number.POSITIVE_INFINITY &&
      fBox.directionAt(8, 8) === null,
  );
  check(
    'ngoài biên: cost = Infinity, direction = null',
    fBox.costAt(-1, 0) === Number.POSITIVE_INFINITY &&
      fBox.directionAt(64, 0) === null,
  );
}

// ---------------------------------------------------------------------------
// Phần 2: FlowFieldCache — identity, invalidate theo version, LRU 32.
// ---------------------------------------------------------------------------

{
  const map = new TestMap(CHOKE_WALLS);
  const cache = new FlowFieldCache();
  const f1 = cache.get(55, 32, map);
  const f2 = cache.get(55, 32, map);
  check('cache: cùng goal → cùng instance', f1 === f2);
  const fDiff = cache.get(10, 10, map);
  check('cache: goal khác → instance khác', fDiff !== f1);

  map.version++;
  const f3 = cache.get(55, 32, map);
  check('cache: version đổi → tính field mới', f3 !== f1);

  const c2 = new FlowFieldCache();
  const map2 = new TestMap(CHOKE_WALLS);
  const first = c2.get(0, 0, map2);
  for (let i = 1; i <= 33; i++) c2.get(i, 0, map2);
  check('cache: tối đa 32 field (LRU)', c2.size === 32, `size=${c2.size}`);
  check('cache: LRU đuổi field cũ nhất', c2.get(0, 0, map2) !== first);
}

// ---------------------------------------------------------------------------
// Phần 3: scenario 200 unit qua choke point → đích (55, 32).
// ---------------------------------------------------------------------------

const GX = 55;
const GY = 32;
const N = 200;
const TOTAL_TICKS = 3600; // 3 phút sim
const WARMUP_TICKS = 100;
const MEASURE_TICKS = 500;
const ARRIVE_RADIUS = 3; // "tới đích" = trong bán kính 3 tile
const STUCK_WINDOW = 60; // >60 tick liên tục không tiến triển → kẹt cứng
const PROGRESS_EPS = 0.25; // tiến triển = rút ngắn k/c tới đích ≥ 0.25 tile

const game = new Game('flowfield-test', 1);
const tmap = new TestMap(CHOKE_WALLS);
game.map = tmap as unknown as GameMap;

const ids: number[] = [];
for (let i = 0; i < N; i++) {
  // Spawn deterministic bên trái tường, phía trên khe hở (ép đi vòng + trượt tường).
  const x = 6 + (i % 20) * 1.05;
  const y = 20 + Math.floor(i / 20) * 1.05;
  ids.push(game.spawnUnit(0, 'villager_m', x, y));
}
check('spawn 200 unit', ids.length === N);

// Theo dõi kẹt cứng: với mỗi unit chưa tới (cách đích > 3 tile) và còn 'moving',
// nếu >60 tick liên tục không rút ngắn k/c tới đích ≥ 0.25 tile → kẹt cứng.
const bestDist = new Map<number, number>();
const lastProgressTick = new Map<number, number>();
const stuckUnits = new Set<number>();

function trackStuck(tick: number): void {
  for (const id of ids) {
    if (stuckUnits.has(id)) continue;
    const u = asUnit(game, id);
    if (u.state !== 'moving') continue;
    const d = Math.hypot(u.x - GX, u.y - GY);
    if (d <= ARRIVE_RADIUS) continue; // đã tới → không tính kẹt
    const best = bestDist.get(id) ?? Number.POSITIVE_INFINITY;
    if (d < best - PROGRESS_EPS) {
      bestDist.set(id, d);
      lastProgressTick.set(id, tick);
    } else if (tick - (lastProgressTick.get(id) ?? 0) > STUCK_WINDOW) {
      stuckUnits.add(id);
    }
  }
}

game.addCommand({ type: 'move', playerId: 0, unitIds: ids, x: GX, y: GY });

for (let t = 0; t < WARMUP_TICKS; t++) {
  game.update();
  trackStuck(t);
}

let accMs = 0;
for (let t = WARMUP_TICKS; t < WARMUP_TICKS + MEASURE_TICKS; t++) {
  const t0 = performance.now();
  game.update();
  accMs += performance.now() - t0;
  trackStuck(t);
}
const avgMs = accMs / MEASURE_TICKS;

for (let t = WARMUP_TICKS + MEASURE_TICKS; t < TOTAL_TICKS; t++) {
  game.update();
  trackStuck(t);
}

// Đo kết quả
let arrived = 0;
let maxDist = 0;
for (const id of ids) {
  const u = asUnit(game, id);
  const d = Math.hypot(u.x - GX, u.y - GY);
  if (d > maxDist) maxDist = d;
  if (d <= ARRIVE_RADIUS) arrived++;
}
const arrivedPct = (arrived / N) * 100;
console.log(`  tới đích (≤${ARRIVE_RADIUS} tile): ${arrived}/${N} (${arrivedPct.toFixed(1)}%)`);
console.log(`  xa đích nhất: ${maxDist.toFixed(2)} tile`);
console.log(`  stuckEvents: ${stuckUnits.size}`);
console.log(`  avg update(): ${avgMs.toFixed(3)} ms/tick (${MEASURE_TICKS} tick)`);
console.log(`  sim stuckReports (tự idle do kẹt): ${game.stuckReports}`);

check('≥90% unit tới trong bán kính 3 tile', arrivedPct >= 90, `${arrivedPct.toFixed(1)}%`);
check('không unit kẹt cứng (stuckEvents == 0)', stuckUnits.size === 0, `${stuckUnits.size}`);
check('update() trung bình < 10ms/tick', avgMs < 10, `${avgMs.toFixed(3)}ms`);

if (failures === 0) {
  console.log('FLOWFIELD TEST: PASS');
} else {
  console.error(`FLOWFIELD TEST: FAIL (${failures} lỗi)`);
  throw new Error(`FLOWFIELD TEST FAIL: ${failures} lỗi`);
}
