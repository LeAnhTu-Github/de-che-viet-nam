// Test Phase 4a: hệ kinh tế — gather / build / train / pop.
// Chạy: npx tsx src/economy.test.ts  (đứng từ packages/sim)

import { Game } from './Game';
import { RESOURCES } from './data/resources';
import type { BuildingEntity, ResourceNodeEntity, UnitEntity } from './entities';
import type { ResourceType } from './types';

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

const game = new Game('econ4a', 2);
game.setupMatch('econ4a', ['A', 'B']);
if (!game.map) throw new Error('map null sau setupMatch');
const map = game.map;

const tc = [...game.entities.values()].find(
  (e): e is BuildingEntity =>
    e.kind === 'building' && e.playerId === 0 && e.defId === 'town_center',
);
if (!tc) throw new Error('không thấy đình làng của player 0');

// 10 dân: 3 có sẵn + spawn thêm 7 quanh đình làng
const villIds: number[] = [];
for (const e of game.entities.values()) {
  if (e.kind === 'unit' && e.playerId === 0) villIds.push(e.id);
}
villIds.sort((a, b) => a - b);
for (let i = 0; i < 7; i++) {
  villIds.push(
    game.spawnUnit(0, 'villager_m', tc.x - 3 + (i % 3), tc.y + 3 + Math.floor(i / 3)),
  );
}
// Phân công: 4 gỗ, 3 quả, 2 vàng, 1 xây (index 9)
const vres: Array<ResourceType | 'none'> = [
  'wood', 'wood', 'wood', 'wood',
  'food', 'food', 'food',
  'gold', 'gold',
  'none', // thợ xây — xong 2 nhà mới chuyển sang gỗ
];
const builderId = villIds[9];

/** Node còn hàng gần nhất của 1 loại tài nguyên. */
function nearestNodeOf(
  res: ResourceType,
  fromX: number,
  fromY: number,
): ResourceNodeEntity | null {
  let best: ResourceNodeEntity | null = null;
  let bestD = Infinity;
  for (const e of game.entities.values()) {
    if (e.kind !== 'resource' || e.amount <= 0) continue;
    const def = RESOURCES[e.defId];
    if (!def || def.resource !== res) continue;
    const d = (e.x - fromX) * (e.x - fromX) + (e.y - fromY) * (e.y - fromY);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** Tìm ô đi được để đặt nhà (vòng tròn mở rộng quanh tâm). */
function findBuildSpot(
  cx: number,
  cy: number,
  used: Array<{ x: number; y: number }>,
): { x: number; y: number } {
  for (let r = 3; r <= 14; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 1 || y < 1 || x >= map.width - 1 || y >= map.height - 1) continue;
        if (!map.isWalkable(Math.floor(x), Math.floor(y))) continue;
        if (used.some((s) => Math.hypot(s.x - x, s.y - y) < 4)) continue;
        return { x, y };
      }
    }
  }
  throw new Error('không tìm được chỗ xây nhà');
}

// Rừng là terrain tile, không phải resource entity → test tự trồng 6 cây
// gỗ (resource entity) trên các ô đi được quanh đình làng.
const treeSpots: Array<{ x: number; y: number }> = [];
for (let i = 0; i < 6; i++) {
  const s = findBuildSpot(tc.x, tc.y, treeSpots);
  treeSpots.push(s);
  game.spawnResource('tree', s.x, s.y);
}
const tree = nearestNodeOf('wood', tc.x, tc.y);
const berry = nearestNodeOf('food', tc.x, tc.y);
const gold = nearestNodeOf('gold', tc.x, tc.y);
if (!tree || !berry || !gold) throw new Error('thiếu node tài nguyên quanh spawn');

const res0 = { ...game.players[0].resources };
const popCap0 = game.players[0].popCap;
check('popCap khởi đầu = 5', popCap0 === 5, `popCap=${popCap0}`);

// Ra lệnh đợt 1: 4 chặt tre, 3 hái quả, 2 đào vàng, 1 xây nhà sàn
game.addCommand({ type: 'gather', playerId: 0, unitIds: villIds.slice(0, 4), targetId: tree.id, resource: 'wood' });
game.addCommand({ type: 'gather', playerId: 0, unitIds: villIds.slice(4, 7), targetId: berry.id, resource: 'food' });
game.addCommand({ type: 'gather', playerId: 0, unitIds: villIds.slice(7, 9), targetId: gold.id, resource: 'gold' });
const spot1 = findBuildSpot(tc.x, tc.y, treeSpots);
game.addCommand({ type: 'build', playerId: 0, unitIds: [builderId], buildingId: 'house', x: spot1.x, y: spot1.y });

const TOTAL_TICKS = 12000; // 10 phút sim ở 20 tick/s
const idleStreak = new Array(villIds.length).fill(0);
let maxIdleStreak = 0;
let house1Done = false;
let house2Done = false;
let trainDone = false;
let popCapAfterH1 = 0;
let popBeforeTrain = 0;

for (let t = 0; t < TOTAL_TICKS; t++) {
  game.update();
  const p0 = game.players[0];

  if (!house1Done) {
    const h1 = [...game.entities.values()].find(
      (e): e is BuildingEntity =>
        e.kind === 'building' && e.playerId === 0 && e.defId === 'house',
    );
    if (h1 && h1.complete) {
      house1Done = true;
      popCapAfterH1 = p0.popCap;
      // Thợ xây tiếp nhà thứ 2 (để có headroom pop cho lệnh train test)
      const spot2 = findBuildSpot(tc.x, tc.y, [spot1]);
      game.addCommand({
        type: 'build', playerId: 0, unitIds: [builderId],
        buildingId: 'house', x: spot2.x, y: spot2.y,
      });
    }
  } else if (!house2Done) {
    const houses = [...game.entities.values()].filter(
      (e): e is BuildingEntity =>
        e.kind === 'building' && e.playerId === 0 && e.defId === 'house',
    );
    if (houses.length >= 2 && houses.every((h) => h.complete)) {
      house2Done = true;
      vres[9] = 'wood'; // thợ xây xong → chuyển sang chặt gỗ
      popBeforeTrain = p0.pop;
      game.addCommand({
        type: 'train', playerId: 0, buildingId: tc.id, unitDefId: 'villager_m',
      });
    }
  } else if (!trainDone) {
    if (p0.pop > popBeforeTrain) trainDone = true;
  }

  // Dân rảnh mà còn node cùng loại → giao việc tiếp (mô phỏng AI/player);
  // đồng thời đo streak idle để phát hiện dân "chết đứng".
  for (let i = 0; i < villIds.length; i++) {
    const u = asUnit(game, villIds[i]);
    const res = vres[i];
    if (
      res !== 'none' &&
      u.state === 'idle' &&
      u.targetNodeId === null &&
      u.buildTargetId === null &&
      u.carryAmount <= 0
    ) {
      const node = nearestNodeOf(res, u.x, u.y);
      if (node) {
        game.addCommand({
          type: 'gather', playerId: 0, unitIds: [u.id],
          targetId: node.id, resource: res,
        });
      }
    }
    const nodeExists =
      res !== 'none' && nearestNodeOf(res, u.x, u.y) !== null;
    if (u.state === 'idle' && nodeExists) idleStreak[i]++;
    else idleStreak[i] = 0;
    if (idleStreak[i] > maxIdleStreak) maxIdleStreak = idleStreak[i];
  }

  if (t > 0 && t % 3000 === 0) {
    console.log(
      `  tick ${t}: wood=${p0.resources.wood.toFixed(0)} ` +
      `food=${p0.resources.food.toFixed(0)} gold=${p0.resources.gold.toFixed(0)} ` +
      `pop=${p0.pop}/${p0.popCap}`,
    );
  }
}

const p0 = game.players[0];
const dWood = p0.resources.wood - res0.wood;
const dFood = p0.resources.food - res0.food;
const dGold = p0.resources.gold - res0.gold;

console.log('---');
check('nhà sàn 1 xây xong (complete)', house1Done);
check('nhà sàn 2 xây xong (complete)', house2Done);
check('popCap tăng +5 sau nhà 1', popCapAfterH1 === popCap0 + 5,
  `popCap ${popCap0} → ${popCapAfterH1}`);
check('train nông dân từ đình làng thành công (pop tăng 1)', trainDone,
  `pop ${popBeforeTrain} → ${p0.pop}`);
check('gỗ tăng > 50', dWood > 50, `+${dWood.toFixed(1)}`);
check('thực tăng > 50', dFood > 50, `+${dFood.toFixed(1)}`);
check('vàng tăng > 50', dGold > 50, `+${dGold.toFixed(1)}`);
check('không dân nào idle > 600 tick liên tục khi còn node',
  maxIdleStreak <= 600, `maxIdleStreak=${maxIdleStreak}`);
check('popCap cuối = 15 (5 + 2 nhà)', p0.popCap === 15, `popCap=${p0.popCap}`);

console.log('---');
console.log(
  `SỐ LIỆU: tick=${game.getState().tick} wood=${p0.resources.wood.toFixed(1)} ` +
  `food=${p0.resources.food.toFixed(1)} gold=${p0.resources.gold.toFixed(1)} ` +
  `stone=${p0.resources.stone.toFixed(1)} pop=${p0.pop}/${p0.popCap} ` +
  `maxIdleStreak=${maxIdleStreak} stuckReports=${game.stuckReports}`,
);
console.log(`ECONOMY TEST: ${failures === 0 ? 'PASS' : 'FAIL'}`);
