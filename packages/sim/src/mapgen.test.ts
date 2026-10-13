// Test mapgen: gen 100 map (seed 1..100), kiểm tra công bằng + walkability.
// Chạy: ../../node_modules/.bin/tsx src/mapgen.test.ts

import { generateMap } from './mapgen';
import type { PlacedResource } from './mapgen';

const SEEDS = 100;
const R = 25; // bán kính kiểm tra tài nguyên quanh spawn
const MAP_W = 128;

interface Fail {
  seed: number;
  msg: string;
}

const fails: Fail[] = [];

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function countKind(resources: PlacedResource[], kind: string, sx: number, sy: number): number {
  return resources.filter(
    (r) => r.kind === kind && dist(r.x, r.y, sx, sy) <= R,
  ).length;
}

for (let seed = 1; seed <= SEEDS; seed++) {
  const fail = (msg: string) => fails.push({ seed, msg });
  let gen;
  try {
    gen = generateMap(seed, 2);
  } catch (e) {
    fail(`throw khi generateMap: ${(e as Error).message}`);
    continue;
  }
  const { map, spawns, resources } = gen;

  if (spawns.length !== 2) {
    fail(`spawns.length = ${spawns.length}, mong đợi 2`);
    continue;
  }

  // 1. Đối xứng gương tuyệt đối qua trục dọc
  outer: for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < MAP_W / 2; x++) {
      const a = map.get(x, y);
      const b = map.get(MAP_W - 1 - x, y);
      if (a.terrain !== b.terrain || a.walkable !== b.walkable || a.cost !== b.cost) {
        fail(`mất đối xứng gương tại (${x},${y}) vs (${MAP_W - 1 - x},${y})`);
        break outer;
      }
    }
  }

  // 2. Có nước (sông)
  let waterCount = 0;
  for (const t of map.tiles) if (t.terrain === 'water') waterCount++;
  if (waterCount === 0) fail('map không có tile water nào');

  // 3. Có cá
  if (!resources.some((r) => r.kind === 'fish')) fail('không có cá fish nào');

  for (let p = 0; p < 2; p++) {
    const s = spawns[p];

    // 4. Spawn tile + vùng 5x5 walkable
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (!map.isWalkable(s.x + dx, s.y + dy)) {
          fail(`phe ${p}: tile (${s.x + dx},${s.y + dy}) quanh spawn không walkable`);
          dy = 3;
          break;
        }
      }
    }

    // 5. Tài nguyên tối thiểu trong bán kính 25
    let forestTiles = 0;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        if (map.get(s.x + dx, s.y + dy).terrain === 'forest') forestTiles++;
      }
    }
    if (forestTiles < 20) fail(`phe ${p}: chỉ ${forestTiles} tile rừng trong R=25 (< 20)`);
    const checks: [string, number, string][] = [
      ['berry', 2, 'bụi quả'],
      ['gold_mine', 1, 'mỏ vàng'],
      ['stone_mine', 1, 'mỏ đá'],
      ['gazelle', 3, 'nai'],
    ];
    for (const [kind, min, label] of checks) {
      const n = countKind(resources, kind, s.x, s.y);
      if (n < min) fail(`phe ${p}: chỉ ${n} ${label} trong R=25 (< ${min})`);
    }
  }

  // 6. Tài nguyên tranh chấp giữa map (mỏ vàng + mỏ đá + voi)
  if (!resources.some((r) => r.kind === 'gold_mine' && Math.abs(r.x - 63.5) < 20)) {
    fail('không có mỏ vàng tranh chấp ở giữa map');
  }
  if (!resources.some((r) => r.kind === 'stone_mine' && Math.abs(r.x - 63.5) < 20)) {
    fail('không có mỏ đá tranh chấp ở giữa map');
  }
  if (!resources.some((r) => r.kind === 'wild_elephant')) {
    fail('không có voi rừng');
  }

  // 7. Tài nguyên đối xứng (mỗi node có bản mirror)
  for (const r of resources) {
    const mirror = resources.find(
      (o) => o !== r && o.kind === r.kind && o.x === MAP_W - 1 - r.x && o.y === r.y,
    );
    if (!mirror) {
      fail(`node ${r.kind} tại (${r.x},${r.y}) không có bản mirror`);
      break;
    }
  }
}

if (fails.length === 0) {
  console.log('MAPGEN TEST: 100/100 PASS');
} else {
  console.error(`MAPGEN TEST: FAIL (${fails.length} lỗi)`);
  for (const f of fails.slice(0, 30)) {
    console.error(`  seed ${f.seed}: ${f.msg}`);
  }
  if (fails.length > 30) console.error(`  ... và ${fails.length - 30} lỗi nữa`);
  throw new Error(`MAPGEN TEST FAIL: ${fails.length} lỗi`);
}
