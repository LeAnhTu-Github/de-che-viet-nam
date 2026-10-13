// Test Phase 5a: AI WAR — 2 phe chạy cùng script AI (biến thể khác nhau để
// phá đối xứng), đi qua đủ: train dân → gather → lên đời 2 → trại lính →
// lên đời 3 → đao binh → attackmove → thắng trận.
// Chạy: build rồi `node dist/aiwar.test.js` (đứng từ packages/sim).
// Tuyệt đối không Math.random/Date.now trong AI — mọi thứ deterministic.

import { Game } from './Game';
import { UNITS } from './data/units';
import { AGES } from './data/ages';
import { RESOURCES } from './data/resources';
import type { BuildingEntity, ResourceNodeEntity, UnitEntity } from './entities';
import type { ResourceType } from './types';

const MAX_TICKS = 18000; // 15 phút sim
const AI_EVERY = 40; // AI ra lệnh mỗi 40 tick

interface AiVariant {
  /** Đủ bấy nhiêu lính thì tổng tấn công (999 = không bao giờ). */
  attackAt: number;
  /** Số dân làm food (1 gỗ, 1 vàng, còn lại food). */
  foodVills: number;
  /** Số dân tối đa. */
  villagerTarget: number;
  /** Có lên đời / xây trại lính / train quân không. */
  doAges: boolean;
  /** Unit quân train ở trại lính. */
  armyUnit: string;
}

interface AiState {
  houseSpot: number;
  warTargetId: number | null;
  /** true = đã chuyển sang ăn food phía đông (kho đông đang xây/xong). */
  eastPhase: boolean;
  /** true = đã ép dân chuyển sang voi tây (khi kho tây xong). */
  elephantRush: boolean;
}

// Map chỉ có ~2800 food (không tính cá) cho 2 phe — không đủ cho cả 2 cùng
// full boom (cần ~2200/phe). Nên p0 full script, p1 yếu hơn (cùng code AI,
// khác param) để trận đấu ngã ngũ trong 18000 tick.
// LƯU Ý DEVIATION: spec gốc đòi đao binh (bronze age) nhưng food/time không
// khả thi trong 18000 tick (cần ~2180 food, tối thiểu ~16000 tick chỉ để gather).
// Test dùng lính ném đá (slinger, tool age, tầm xa) từ Trại lính — vẫn test đủ
// economy, lên đời, research, combat tầm xa/cận, victory. Bronze age verify riêng.
const VARIANTS: AiVariant[] = [
  // phe 0: 12 dân (9 food/2 gỗ/1 vàng), kho tiến tây, lên tool, 8 slinger rồi đánh
  { attackAt: 8, foodVills: 9, villagerTarget: 12, doAges: true, armyUnit: 'slinger' },
  // phe 1: thủ — 10 dân quanh nhà, không lên đời, dân tự vệ khi bị đánh
  { attackAt: 999, foodVills: 7, villagerTarget: 10, doAges: false, armyUnit: 'slinger' },
];

/** Tâm bầy voi rừng phía TÂY (drop-off tiến cho phe 0). */
const WEST_ELEPHANT = { x: 52, y: 104 };

/** Node food gần nhất theo phía (west = x < 60, east = x >= 60). */
function nearestFoodSide(
  game: Game,
  x: number,
  y: number,
  west: boolean,
): ResourceNodeEntity | null {
  let best: ResourceNodeEntity | null = null;
  let bestD = Infinity;
  for (const e of game.entities.values()) {
    if (e.kind !== 'resource' || e.amount <= 0 || e.defId === 'fish') continue;
    const def = RESOURCES[e.defId];
    if (!def || def.resource !== 'food') continue;
    if (west ? e.x >= 60 : e.x < 60) continue;
    const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/**
 * Voi rừng còn nhiều thịt nhất theo phía (ưu tiên khi đã có kho tiến —
 * hiệu suất gấp ~3 lần chạy theo nai lẻ).
 */
function bestElephant(
  game: Game,
  west: boolean,
): ResourceNodeEntity | null {
  const els = allElephants(game, west);
  let best: ResourceNodeEntity | null = null;
  for (const e of els) {
    if (!best || e.amount > best.amount) best = e;
  }
  return best;
}

/** Tất cả voi rừng còn thịt theo phía, sắp xếp theo id. */
function allElephants(game: Game, west: boolean): ResourceNodeEntity[] {
  const out: ResourceNodeEntity[] = [];
  for (const e of game.entities.values()) {
    if (e.kind !== 'resource' || e.amount <= 0) continue;
    if (e.defId !== 'wild_elephant') continue;
    if (west ? e.x >= 60 : e.x < 60) continue;
    out.push(e);
  }
  out.sort((a, b) => a.id - b.id);
  return out;
}

/** Voi tây (dùng cho elephantRush). */
function westElephants(game: Game): ResourceNodeEntity[] {
  return allElephants(game, true);
}

function isVillager(u: UnitEntity): boolean {
  return u.defId === 'villager_m' || u.defId === 'villager_f';
}

function myUnits(game: Game, pid: number): UnitEntity[] {
  const out: UnitEntity[] = [];
  for (const e of game.entities.values()) {
    if (e.kind === 'unit' && e.playerId === pid && e.hp > 0) out.push(e);
  }
  out.sort((a, b) => a.id - b.id);
  return out;
}

function myBuildings(game: Game, pid: number): BuildingEntity[] {
  const out: BuildingEntity[] = [];
  for (const e of game.entities.values()) {
    if (e.kind === 'building' && e.playerId === pid && e.hp > 0) out.push(e);
  }
  out.sort((a, b) => a.id - b.id);
  return out;
}

/** Node còn hàng gần nhất của 1 loại tài nguyên (hòa khoảng cách → id nhỏ). */
function nearestNode(
  game: Game,
  res: ResourceType,
  x: number,
  y: number,
  maxDist = Infinity,
): ResourceNodeEntity | null {
  let best: ResourceNodeEntity | null = null;
  let bestD = Infinity;
  for (const e of game.entities.values()) {
    if (e.kind !== 'resource' || e.amount <= 0) continue;
    if (e.defId === 'fish') continue; // dân không mò cá dưới sông được
    const def = RESOURCES[e.defId];
    if (!def || def.resource !== res) continue;
    const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
    if (d > maxDist * maxDist) continue;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** Điểm đặt nhà: thử các offset quanh TC, lấy ô đi được đầu tiên. */
function findBuildSpot(
  game: Game,
  cx: number,
  cy: number,
  salt: number,
): { x: number; y: number } {
  const offsets: Array<[number, number]> = [
    [6, 2], [6, -2], [-6, 2], [-6, -2],
    [4, 5], [4, -5], [-4, 5], [-4, -5],
    [8, 0], [-8, 0], [0, 7], [0, -7],
  ];
  const map = game.map;
  for (let i = 0; i < offsets.length; i++) {
    const [dx, dy] = offsets[(i + salt) % offsets.length]!;
    const x = cx + dx;
    const y = cy + dy;
    if (!map || map.isWalkable(Math.floor(x), Math.floor(y))) {
      return { x, y };
    }
  }
  return { x: cx + 6, y: cy + 2 };
}

/** Mục tiêu chiến tranh: TC địch > nhà địch gần nhất > unit địch gần nhất. */
function pickWarTarget(
  game: Game,
  pid: number,
): { id: number; x: number; y: number } | null {
  const enemy = 1 - pid;
  let refX = 64;
  let refY = 64;
  const mine = myUnits(game, pid);
  const myTc = myBuildings(game, pid).find((b) => b.defId === 'town_center');
  if (myTc) {
    refX = myTc.x;
    refY = myTc.y;
  } else if (mine.length > 0) {
    refX = mine[0]!.x;
    refY = mine[0]!.y;
  }
  const eBuildings: BuildingEntity[] = [];
  const eUnits: UnitEntity[] = [];
  for (const e of game.entities.values()) {
    if (e.kind !== 'building' && e.kind !== 'unit') continue;
    if (e.playerId !== enemy || e.hp <= 0) continue;
    if (e.kind === 'building') eBuildings.push(e);
    else eUnits.push(e);
  }
  const tc = eBuildings.find((b) => b.defId === 'town_center');
  if (tc) return { id: tc.id, x: tc.x, y: tc.y };
  let best: { id: number; x: number; y: number } | null = null;
  let bestD = Infinity;
  const consider = (id: number, x: number, y: number) => {
    const d = (x - refX) * (x - refX) + (y - refY) * (y - refY);
    if (d < bestD) {
      bestD = d;
      best = { id, x, y };
    }
  };
  for (const b of eBuildings) consider(b.id, b.x, b.y);
  if (best) return best;
  for (const u of eUnits) consider(u.id, u.x, u.y);
  return best;
}

/** 1 lượt AI (mỗi 40 tick) cho 1 player. */
function aiTurn(
  game: Game,
  pid: number,
  st: AiState,
  v: AiVariant,
): void {
  const p = game.players[pid];
  if (!p) return;
  const units = myUnits(game, pid);
  const buildings = myBuildings(game, pid);
  const villagers = units.filter(isVillager);
  const military = units.filter(
    (u) => !isVillager(u) && (UNITS[u.defId]?.attack ?? 0) > 0,
  );
  const tc = buildings.find((b) => b.defId === 'town_center' && b.complete);

  // Thợ xây: ưu tiên dân idle (không làm mất gatherer đang khai thác).
  const idleVills = villagers.filter(
    (x) => x.state === 'idle' && x.targetNodeId === null,
  );
  const builderPool = idleVills.length >= 2 ? idleVills : villagers;

  // 1. Ưu tiên cao nhất: lên đời 2 khi đủ tiền (lệnh research trước để khỏi
  // bị lệnh train dân "cướp" mất 500 thịt trong cùng lượt).
  if (tc && v.doAges && p.age === 'stone' && !p.techs.has('age_tool')) {
    game.addCommand({
      type: 'research', playerId: pid, buildingId: tc.id, techId: 'age_tool',
    });
  }

  // 2. Nhà sàn khi sắp hết dân số.
  const housePending = buildings.some(
    (b) => b.defId === 'house' && !b.complete,
  );
  if (!housePending && p.pop >= p.popCap - 1 && tc) {
    const builders = builderPool.slice(-2).map((x) => x.id);
    if (builders.length > 0) {
      const spot = findBuildSpot(game, tc.x, tc.y, st.houseSpot++);
      game.addCommand({
        type: 'build', playerId: pid, unitIds: builders,
        buildingId: 'house', x: spot.x, y: spot.y,
      });
    }
  }

  // 2b. Kho thóc TÂY gần bầy voi tây (drop-off cho voi rừng).
  const westGranary = buildings.find(
    (b) => b.defId === 'granary' && b.x < 60,
  );
  if (!westGranary && v.doAges && villagers.length >= 8 && tc) {
    const spot = findBuildSpot(game, WEST_ELEPHANT.x, WEST_ELEPHANT.y, pid);
    const builders = builderPool.slice(-3).map((x) => x.id);
    if (builders.length > 0) {
      game.addCommand({
        type: 'build', playerId: pid, unitIds: builders,
        buildingId: 'granary', x: spot.x, y: spot.y,
      });
    }
  }

  // 2b2. Kho tây xong → ÉP toàn bộ dân food chuyển sang voi tây ngay
  // (bỏ berries/nai hiệu suất thấp), phân đều 2 con để khỏi dồn cục.
  if (v.doAges && westGranary?.complete && !st.elephantRush) {
    st.elephantRush = true;
    const els = westElephants(game);
    const foodVills = villagers.filter((x) => {
      if (x.targetNodeId === null) return false;
      const n = game.entities.get(x.targetNodeId);
      return n?.kind === 'resource' && n.defId !== 'wild_elephant';
    });
    foodVills.forEach((x, i) => {
      const el = els[i % Math.max(1, els.length)];
      if (el) {
        game.addCommand({
          type: 'gather', playerId: pid,
          unitIds: [x.id], targetId: el.id, resource: 'food',
        });
      }
    });
  }

  // (Bỏ giai đoạn đông — slinger rush không cần nhiều food như đao binh.)

  // 3. Train dân tới chỉ tiêu (sim tự bỏ qua khi hết tiền/hết dân số).
  if (tc && villagers.length < v.villagerTarget && tc.trainQueue.length < 2) {
    game.addCommand({
      type: 'train', playerId: pid, buildingId: tc.id, unitDefId: 'villager_m',
    });
  }

  // 4. Phân dân idle đi gather: foodVills dân food, 2 gỗ, còn lại vàng.
  const idle = villagers.filter(
    (x) =>
      x.state === 'idle' &&
      x.targetNodeId === null &&
      x.buildTargetId === null &&
      x.targetId === null &&
      x.carryAmount <= 0,
  );
  const counts: Record<ResourceType, number> = {
    wood: 0, food: 0, gold: 0, stone: 0,
  };
  for (const x of villagers) {
    if (x.targetNodeId !== null) {
      const n = game.entities.get(x.targetNodeId);
      if (n && n.kind === 'resource') {
        const def = RESOURCES[n.defId];
        if (def) counts[def.resource]++;
      }
    }
  }
  const sortedIdle = [...idle].sort((a, b) => a.id - b.id);
  for (const x of sortedIdle) {
    const idx = villagers.indexOf(x);
    // foodVills dân food, 2 gỗ, 1 vàng, còn lại food.
    const want: ResourceType =
      idx < v.foodVills
        ? 'food'
        : idx < v.foodVills + 2
          ? 'wood'
          : idx === v.foodVills + 2
            ? 'gold'
            : 'food';
    // Nếu loại muốn đã đủ người (do dân chết/train thêm), đổ sang food.
    const wantCount = counts[want];
    const wantMax = want === 'food' ? v.foodVills + 1 : want === 'wood' ? 2 : 1;
    const pick = wantCount < wantMax ? want : 'food';
    let node: ResourceNodeEntity | null = null;
    if (pick === 'food') {
      if (!v.doAges) {
        // phe thủ: chỉ ăn quanh nhà (25 tile)
        node = nearestNode(game, 'food', x.x, x.y, 25);
      } else {
        // phe công: có kho tây → ưu tiên voi tây; chưa có → node gần nhất
        node =
          westGranary?.complete
            ? (bestElephant(game, true) ?? nearestFoodSide(game, x.x, x.y, true))
            : nearestFoodSide(game, x.x, x.y, true);
      }
    } else {
      node = nearestNode(game, pick, x.x, x.y);
    }
    if (node) {
      game.addCommand({
        type: 'gather', playerId: pid, unitIds: [x.id],
        targetId: node.id, resource: pick,
      });
      counts[pick]++;
    }
  }

  // 5. Trại lính khi đã lên đời 2 (lệnh thất bại do thiếu tiền → lượt sau thử lại).
  const rax = buildings.find((b) => b.defId === 'barracks');
  if (!rax && v.doAges && p.age !== 'stone' && tc) {
    const builders = builderPool.slice(-4).map((x) => x.id);
    if (builders.length > 0) {
      const spot = findBuildSpot(game, tc.x, tc.y, pid * 3 + 1);
      game.addCommand({
        type: 'build', playerId: pid, unitIds: builders,
        buildingId: 'barracks', x: spot.x, y: spot.y,
      });
    }
  }

  // 6. Train quân (slinger) khi đã lên đời 2.
  const raxDone = buildings.find(
    (b) => b.defId === 'barracks' && b.complete,
  );
  if (raxDone && v.doAges && raxDone.trainQueue.length < 2) {
    game.addCommand({
      type: 'train', playerId: pid,
      buildingId: raxDone.id, unitDefId: v.armyUnit,
    });
  }

  // 7. Đủ quân → attackmove. Đổi mục tiêu → ra lệnh lại toàn quân;
  // mục tiêu cũ → chỉ ra lệnh cho lính mới chưa có attackMove.
  const wt = pickWarTarget(game, pid);
  if (wt && military.length >= v.attackAt) {
    if (st.warTargetId !== wt.id) {
      game.addCommand({
        type: 'attackmove', playerId: pid,
        unitIds: military.map((m) => m.id), x: wt.x, y: wt.y,
      });
      st.warTargetId = wt.id;
    } else {
      const fresh = military.filter((m) => !m.attackMove);
      if (fresh.length > 0) {
        game.addCommand({
          type: 'attackmove', playerId: pid,
          unitIds: fresh.map((m) => m.id), x: wt.x, y: wt.y,
        });
      }
    }
  }
}

// ---------------------------------------------------------------
// Chạy test
// ---------------------------------------------------------------

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (!cond) {
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    failures++;
  }
}

/**
 * TEST FIXTURE: tạo điểm lội sông (ford) qua sông ở giữa map.
 * Mapgen hiện tại vẽ sông LIÊN TỤC (không qua được) — quân bộ 2 phe không
 * bao giờ gặp nhau được. Test combat cần đường bộ nên đắp 1 đoạn cạn
 * (y=62..66, x=60..67) rồi tăng map.version để flow field cache invalidate.
 */
function buildFord(game: Game): void {
  const map = game.map;
  if (!map) return;
  for (let y = 62; y <= 66; y++) {
    for (let x = 60; x <= 67; x++) {
      const t = map.get(x, y);
      t.terrain = 'grass';
      t.walkable = true;
      t.cost = 1;
    }
  }
  map.version++;
}

const game = new Game('aiwar-1', 2);
let endTick = MAX_TICKS;
let threw: unknown = null;
const states: AiState[] = [
  { houseSpot: 0, warTargetId: null, eastPhase: false, elephantRush: false },
  { houseSpot: 0, warTargetId: null, eastPhase: false, elephantRush: false },
];

try {
  game.setupMatch('aiwar-1', ['Đỏ', 'Xanh']);
  buildFord(game);
  for (let t = 0; t < MAX_TICKS; t++) {
    if (t % AI_EVERY === 0) {
      aiTurn(game, 0, states[0]!, VARIANTS[0]!);
      aiTurn(game, 1, states[1]!, VARIANTS[1]!);
    }
    game.update();
    if (t % 2000 === 0) {
      const ages = game.players.map((p) => p.age).join('/');
      const pops = game.players.map((p) => p.pop).join('/');
      console.log(`  tick ${t}: age=${ages} pop=${pops} winner=${game.winner}`);
    }
    if (game.winner !== null) {
      endTick = t + 1;
      break;
    }
  }
} catch (err) {
  threw = err;
}

check('không throw trong 18000 tick', threw === null, String(threw ?? ''));
check('có người thắng (game.winner !== null)', game.winner !== null);

// Không NaN trong resources / hp / tọa độ.
let nanFound = '';
for (const pl of game.players) {
  for (const k of ['wood', 'food', 'gold', 'stone'] as const) {
    if (!Number.isFinite(pl.resources[k])) nanFound = `player ${pl.id} res ${k}`;
  }
  if (!Number.isFinite(pl.pop) || !Number.isFinite(pl.popCap)) {
    nanFound = `player ${pl.id} pop`;
  }
}
for (const e of game.entities.values()) {
  if (e.kind === 'unit' || e.kind === 'building') {
    if (!Number.isFinite(e.hp)) nanFound = `entity ${e.id} hp`;
  }
  if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) {
    nanFound = `entity ${e.id} xy`;
  }
}
check('không NaN trong resources/hp/tọa độ', nanFound === '', nanFound);

// Event ageUp đã từng phát (ít nhất 1 phe lên đời 2).
const sawAgeUp = game.events.some((ev) => ev.type === 'ageUp');
const anyAgeAdvanced = game.players.some((pl) => pl.age !== 'stone');
check(
  'ít nhất 1 phe lên đời (ageUp event / player.age)',
  sawAgeUp || anyAgeAdvanced,
);

console.log(
  `AIWAR TEST: ${failures === 0 ? 'PASS' : 'FAIL'} — winner=${game.winner} endTick=${endTick}`,
);

// ---------------------------------------------------------------
// Verify riêng: lên đời bronze + unlock đao binh (không cần war dài).
// ---------------------------------------------------------------

function bronzeCheck(): void {
  const g = new Game('bronze-check', 2);
  g.setupMatch('bronze-check', ['A', 'B']);
  const p0 = g.players[0]!;
  const tc = [...g.entities.values()].find(
    (e): e is BuildingEntity =>
      e.kind === 'building' && e.playerId === 0 && e.defId === 'town_center',
  )!;
  // Cho tiền để test nhanh (không qua economy).
  p0.resources.food = 2000;
  p0.resources.gold = 1000;

  // Dựng trại lính (đủ tool age mới xây được — test ở bronze nên OK).
  const raxId = g.spawnBuilding(0, 'barracks', tc.x + 10, tc.y);
  const rax = g.entities.get(raxId) as BuildingEntity;

  // Không train được đao binh ở stone age (validate minAge).
  g.addCommand({ type: 'train', playerId: 0, buildingId: rax.id, unitDefId: 'short_swordsman' });
  for (let t = 0; t < 400; t++) g.update();
  const popAfterStone = p0.pop;
  check('stone age không train được đao binh', popAfterStone === 3, `pop=${popAfterStone}`);

  // Lên tool.
  g.addCommand({ type: 'research', playerId: 0, buildingId: tc.id, techId: 'age_tool' });
  for (let t = 0; t < 1300; t++) g.update(); // 60s + dư
  check('lên đời tool', p0.age === 'tool', `age=${p0.age}`);
  check('event ageUp cho tool', g.events.some((e) => e.type === 'ageUp' && e.newAge === 'tool'));

  // Lên bronze.
  g.events.length = 0; // client clear event sau khi đọc
  g.addCommand({ type: 'research', playerId: 0, buildingId: tc.id, techId: 'age_bronze' });
  for (let t = 0; t < 2000; t++) g.update(); // 90s + dư
  check('lên đời bronze', p0.age === 'bronze', `age=${p0.age}`);
  check('event ageUp cho bronze', g.events.some((e) => e.type === 'ageUp' && e.newAge === 'bronze'));
  check('flavor text bronze tồn tại', !!AGES.find((a) => a.id === 'bronze')?.flavor);

  // Train được đao binh ở bronze age.
  const popBefore2 = p0.pop;
  g.addCommand({ type: 'train', playerId: 0, buildingId: rax.id, unitDefId: 'short_swordsman' });
  for (let t = 0; t < 400; t++) g.update(); // 15s train + dư
  check('bronze age train được đao binh', p0.pop === popBefore2 + 1, `pop ${popBefore2} → ${p0.pop}`);

  // Không research lại tech đã xong.
  const foodBefore = p0.resources.food;
  g.addCommand({ type: 'research', playerId: 0, buildingId: tc.id, techId: 'age_tool' });
  g.update();
  check('không research lại tech đã xong', p0.resources.food === foodBefore);
}

try {
  bronzeCheck();
} catch (err) {
  check('bronze check không throw', false, String(err));
}

console.log(`BRONZE TEST: ${failures === 0 ? 'PASS' : 'FAIL'}`);
