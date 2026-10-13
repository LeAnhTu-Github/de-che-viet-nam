// Test Phase 2a: entity + lệnh di chuyển + separation.
// Chạy: npx tsx src/entities.test.ts  (đứng từ packages/sim)

import { Game } from './Game';
import type { UnitEntity } from './entities';

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

const game = new Game('test', 2);
game.setupMatch('test', ['A', 'B']);
const state = game.getState();

// 1. Kiểm tra setup ban đầu
const all = [...state.entities.values()];
const unitsP0 = all.filter(
  (e): e is UnitEntity => e.kind === 'unit' && e.playerId === 0,
);
const unitsP1 = all.filter(
  (e): e is UnitEntity => e.kind === 'unit' && e.playerId === 1,
);
const tcP0 = all.filter((e) => e.kind === 'building' && e.playerId === 0);
const tcP1 = all.filter((e) => e.kind === 'building' && e.playerId === 1);
const resNodes = all.filter((e) => e.kind === 'resource');
check(
  'mỗi player có 1 Đình làng tại spawn',
  tcP0.length === 1 &&
    tcP0[0].defId === 'town_center' &&
    tcP1.length === 1 &&
    tcP1[0].defId === 'town_center',
);
check(
  'mỗi player có 3 nông dân ban đầu',
  unitsP0.length === 3 && unitsP1.length === 3,
);
check('rải node tài nguyên từ mapgen', resNodes.length > 0, `${resNodes.length} nodes`);
check(
  'node tài nguyên có amount từ RESOURCES',
  resNodes.every((r) => r.kind === 'resource' && r.amount > 0),
);
check('map đã gen (128x128)', game.map !== null && game.map.width === 128);
check(
  'player có tên từ setupMatch',
  state.players.length === 2 && state.players[0].name === 'A' && state.players[1].name === 'B',
);

// 2. Spawn thêm 47 nông dân cho player 0 (tổng 50 unit)
//    Spawn player 0 ở (20, 64) theo mapgen (SPAWN_LEFT_X=20, SPAWN_Y=64)
const myIds = unitsP0.map((u) => u.id);
for (let i = 0; i < 47; i++) {
  const x = 20 + (i % 7) - 3;
  const y = 64 + Math.floor(i / 7) - 3;
  myIds.push(game.spawnUnit(0, 'villager_m', x, y));
}
check('tổng 50 unit cho player 0', myIds.length === 50, `${myIds.length} unit`);
check(
  'unit lấy đúng hp/speed từ UNITS',
  myIds.every((id) => {
    const u = asUnit(game, id);
    return u.hp === 25 && u.maxHp === 25 && u.speed === 1.1 && u.state === 'idle';
  }),
);

// 3. Lệnh move từ player LẠ phải bị từ chối (kể cả id không tồn tại)
const probe = asUnit(game, myIds[0]);
const oldTX = probe.targetX;
const oldTY = probe.targetY;
game.addCommand({ type: 'move', playerId: 1, unitIds: [myIds[0], 999999], x: 10, y: 10 });
game.update();
check(
  'từ chối lệnh move của player khác + id lạ',
  probe.targetX === oldTX && probe.targetY === oldTY && probe.state === 'idle',
);

// 4. Move 50 unit tới điểm xa (~30 tile), chạy 900 tick (45 giây).
//    Đích (50, 64) nằm cùng bên sông với spawn (sông dọc x≈61..66 chắn ngang,
//    movement Phase 3 tôn trọng walkable nên không đi xuyên sông).
const TX = 50;
const TY = 64;
game.addCommand({ type: 'move', playerId: 0, unitIds: myIds, x: TX, y: TY });
const TICKS = 900;
for (let t = 0; t < TICKS; t++) game.update();

// 5. Đo kết quả
let arrived = 0;
let maxDist = 0;
let sumDist = 0;
for (const id of myIds) {
  const u = asUnit(game, id);
  const d = Math.hypot(u.x - TX, u.y - TY);
  sumDist += d;
  if (d > maxDist) maxDist = d;
  if (d <= 2) arrived++;
}
let overlapPairs = 0;
const totalPairs = (myIds.length * (myIds.length - 1)) / 2;
const pos = myIds.map((id) => asUnit(game, id));
for (let i = 0; i < pos.length; i++) {
  for (let j = i + 1; j < pos.length; j++) {
    if (Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y) < 0.3) overlapPairs++;
  }
}
const arrivedPct = (arrived / myIds.length) * 100;
const overlapPct = (overlapPairs / totalPairs) * 100;
console.log(
  `  tới nơi trong bán kính 2 tile: ${arrived}/50 (${arrivedPct.toFixed(1)}%)`,
);
console.log(
  `  k/c tới target: trung bình ${(sumDist / myIds.length).toFixed(2)} tile, xa nhất ${maxDist.toFixed(2)} tile`,
);
console.log(
  `  cặp chồng lấn tâm (<0.3 tile): ${overlapPairs}/${totalPairs} (${overlapPct.toFixed(2)}%)`,
);
check('≥95% unit tới trong bán kính 2 tile', arrivedPct >= 95, `${arrivedPct.toFixed(1)}%`);
check('cặp chồng lấn ≤5% tổng cặp', overlapPct <= 5, `${overlapPct.toFixed(2)}%`);

// 6. Unit đối phương không bị ảnh hưởng bởi lệnh của player 0
const foeOk = unitsP1.every((u) => {
  const e = asUnit(game, u.id);
  return e.state === 'idle' && e.hp === e.maxHp;
});
check('unit player 1 đứng yên, không mất máu', foeOk);

// 7. Tick đã chạy đủ
check('sim chạy đủ 900 tick (+1 tick ở bước 3)', game.getState().tick === TICKS + 1);

if (failures === 0) {
  console.log('ENTITIES TEST: PASS');
} else {
  console.error(`ENTITIES TEST: FAIL (${failures} lỗi)`);
  throw new Error(`ENTITIES TEST FAIL: ${failures} lỗi`);
}
