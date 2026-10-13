// Test lệnh điều khiển kiểu AoE: xây tiếp công trường có sẵn (build + siteId)
// và attack có kiểm tra chủ sở hữu.
// Chạy: npx tsx src/controls.test.ts  (đứng từ packages/sim)

import { Game } from './Game';
import type { BuildingEntity, UnitEntity } from './entities';

let failures = 0;

function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}

const game = new Game('controls', 2);
game.setupMatch('controls', ['A', 'B']);

const tc = [...game.entities.values()].find(
  (e): e is BuildingEntity => e.kind === 'building' && e.playerId === 0 && e.defId === 'town_center',
);
if (!tc) throw new Error('không thấy đình làng của player 0');
const unitsOf = (pid: number): UnitEntity[] =>
  [...game.entities.values()].filter((e): e is UnitEntity => e.kind === 'unit' && e.playerId === pid);
const [v1, v2] = unitsOf(0);
const enemy = unitsOf(1)[0];
if (!v1 || !v2 || !enemy) throw new Error('thiếu unit khởi đầu');

// ── Xây tiếp công trường có sẵn ──
const woodBefore = game.players[0]!.resources.wood;
game.addCommand({ type: 'build', playerId: 0, unitIds: [v1.id], buildingId: 'house', x: tc.x + 5, y: tc.y });
game.update();
const site = [...game.entities.values()].find(
  (e): e is BuildingEntity => e.kind === 'building' && e.playerId === 0 && e.defId === 'house',
);
check('build thường dựng công trường', !!site && !site.complete);
const woodAfterFirst = game.players[0]!.resources.wood;
check('build thường trừ gỗ', woodAfterFirst < woodBefore, `${woodBefore} → ${woodAfterFirst}`);
if (!site) throw new Error('không có công trường');

const houses = (): number =>
  [...game.entities.values()].filter((e) => e.kind === 'building' && e.defId === 'house').length;
game.addCommand({ type: 'build', playerId: 0, unitIds: [v2.id], buildingId: 'house', x: 0, y: 0, siteId: site.id });
game.update();
check('siteId: dân thứ 2 nhận công trường cũ', v2.buildTargetId === site.id);
check('siteId: không dựng nhà mới', houses() === 1, `houses=${houses()}`);
check('siteId: không trừ thêm gỗ', game.players[0]!.resources.wood === woodAfterFirst);

game.addCommand({ type: 'build', playerId: 1, unitIds: [enemy.id], buildingId: 'house', x: 0, y: 0, siteId: site.id });
game.update();
check('siteId: địch không xây hộ được', enemy.buildTargetId !== site.id);

// ── Attack có kiểm tra chủ sở hữu ──
game.addCommand({ type: 'attack', playerId: 1, unitIds: [v1.id], targetId: enemy.id });
game.update();
check('attack: không điều được unit của người khác', v1.targetId !== enemy.id);
game.addCommand({ type: 'attack', playerId: 0, unitIds: [v1.id], targetId: enemy.id });
game.update();
check('attack: chủ unit ra lệnh được', v1.targetId === enemy.id);

console.log(`CONTROLS TEST: ${failures === 0 ? 'PASS' : 'FAIL'}`);
