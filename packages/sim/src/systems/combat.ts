// System chiến đấu Phase 5a: tấn công cận/xa, projectile, attack-move, tự vệ.
// Deterministic tuyệt đối: không Math.random/Date.now, duyệt entity theo id tăng dần.

import { UNITS } from '../data/units';
import type { Game } from '../Game';
import type { BuildingEntity, Entity, UnitEntity } from '../entities';
import type { AttackCommand, AttackMoveCommand } from '../types';

/** dt của 1 tick (giây) — đồng bộ với Game.TICK_RATE = 20. */
const DT = 1 / 20;
/** Tầm đánh cận chiến (tile) khi def.range = 0. */
const MELEE_RANGE = 0.8;
/** Tốc độ bay của projectile (tile/giây). */
const PROJECTILE_SPEED = 12;
/** Khoảng cách coi như projectile chạm đích. */
const PROJECTILE_HIT_DIST = 0.3;
/** Quét aggro mỗi N tick, stagger theo id để rải tải. */
const AGGRO_SCAN_TICKS = 10;

/** Đạn đang bay: mỗi tick bay về vị trí hiện tại của target. */
export interface Projectile {
  id: number;
  x: number;
  y: number;
  targetId: number;
  attackerId: number;
  speed: number;
  dmg: number;
}

// ---------------------------------------------------------------
// Lệnh
// ---------------------------------------------------------------

/** Lệnh attack: validate rồi gán targetId + state 'attacking' cho từng unit. */
export function applyAttackCommand(game: Game, cmd: AttackCommand): void {
  const target = game.entities.get(cmd.targetId);
  if (!target || (target.kind !== 'unit' && target.kind !== 'building')) return;
  for (const id of cmd.unitIds) {
    const e = game.entities.get(id);
    if (!e || e.kind !== 'unit' || e.hp <= 0) continue;
    if (cmd.playerId !== undefined && e.playerId !== cmd.playerId) continue; // không phải unit của người gửi
    if (target.playerId === e.playerId) continue; // không tự đánh mình
    const def = UNITS[e.defId];
    if (!def || def.attack <= 0) continue; // unit không có khả năng tấn công
    game.clearUnitTasks(id);
    e.attackMove = false;
    e.targetId = target.id;
    e.state = 'attacking';
    e.attackTimer = 0;
  }
}

/** Lệnh attack-move: đi tới (x, y), tự đánh địch trong tầm nhìn trên đường đi. */
export function applyAttackMoveCommand(
  game: Game,
  cmd: AttackMoveCommand,
): void {
  for (const id of cmd.unitIds) {
    const e = game.entities.get(id);
    if (!e || e.kind !== 'unit') continue;
    if (e.playerId !== cmd.playerId) continue; // validate sở hữu
    if (e.hp <= 0) continue;
    const def = UNITS[e.defId];
    if (!def || def.attack <= 0) continue;
    game.clearUnitTasks(id);
    e.attackMove = true;
    e.attackMoveX = cmd.x;
    e.attackMoveY = cmd.y;
    e.targetId = null;
    e.attackTimer = 0;
    game.orderMove(e, cmd.x, cmd.y, 'moving');
  }
}

// ---------------------------------------------------------------
// Update mỗi tick
// ---------------------------------------------------------------

/** Chạy 1 tick chiến đấu: đánh nhau → projectile → dọn xác. */
export function updateCombat(game: Game): void {
  const dead: number[] = [];
  const units = sortedUnits(game);
  for (const u of units) {
    if (u.hp <= 0) continue;
    tickUnitCombat(game, u, dead);
  }
  tickProjectiles(game, dead);
  if (dead.length === 0) return;
  const deadSet = new Set(dead);
  for (const id of deadSet) game.removeEntity(id);
  // Dọn targetId trỏ tới xác chết; unit attack-move quay lại đích cũ.
  for (const u of units) {
    if (u.hp <= 0) continue;
    if (u.targetId !== null && deadSet.has(u.targetId)) {
      u.targetId = null;
      if (u.state === 'attacking') {
        if (u.attackMove) resumeAttackMove(game, u);
        else u.state = 'idle';
      }
    }
  }
}

/** 1 tick chiến đấu của 1 unit: có target → đánh/đuổi; attack-move → quét aggro. */
function tickUnitCombat(game: Game, u: UnitEntity, dead: number[]): void {
  let target = resolveTarget(game, u);
  if (
    !target &&
    u.attackMove &&
    (game.getTick() + u.id) % AGGRO_SCAN_TICKS === 0
  ) {
    const found = findAggroTarget(game, u);
    if (found) {
      u.targetId = found.id;
      target = found;
    }
  }
  if (!target) {
    if (u.state === 'attacking' && !u.attackMove) u.state = 'idle';
    return;
  }
  const def = UNITS[u.defId];
  if (!def || def.attack <= 0) {
    u.targetId = null;
    if (u.state === 'attacking') u.state = 'idle';
    return;
  }
  const tSize = target.kind === 'building' ? target.size : 0;
  const reach = (def.range > 0 ? def.range : MELEE_RANGE) + tSize / 2;
  const d = Math.hypot(target.x - u.x, target.y - u.y);
  if (d <= reach) {
    u.state = 'attacking';
    u.attackTimer += DT;
    if (u.attackTimer >= def.attackCooldown) {
      u.attackTimer = 0;
      fire(game, u, target, def, dead);
    }
  } else {
    // Ngoài tầm: đi tới vị trí hiện tại của target (giữ nguyên targetId).
    game.orderMove(u, target.x, target.y, 'moving');
  }
}

/** Kiểm tra target còn hợp lệ không; stale → xóa targetId. */
function resolveTarget(
  game: Game,
  u: UnitEntity,
): UnitEntity | BuildingEntity | null {
  if (u.targetId === null) return null;
  const t = game.entities.get(u.targetId);
  if (!t || t.kind === 'resource') {
    u.targetId = null;
    return null;
  }
  if (t.hp <= 0 || t.playerId === u.playerId) {
    u.targetId = null;
    return null;
  }
  return t;
}

/** Địch (unit/nhà) gần nhất trong tầm nhìn của unit. */
function findAggroTarget(
  game: Game,
  u: UnitEntity,
): UnitEntity | BuildingEntity | null {
  const def = UNITS[u.defId];
  if (!def) return null;
  const los2 = def.los * def.los;
  let best: UnitEntity | BuildingEntity | null = null;
  let bestD = Infinity;
  for (const e of game.entities.values()) {
    if (e.kind !== 'unit' && e.kind !== 'building') continue;
    if (e.hp <= 0 || e.playerId === u.playerId) continue;
    const d = (e.x - u.x) * (e.x - u.x) + (e.y - u.y) * (e.y - u.y);
    if (d > los2) continue;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** Bắn 1 phát: cận chiến gây damage ngay, tầm xa spawn projectile. */
function fire(
  game: Game,
  u: UnitEntity,
  target: UnitEntity | BuildingEntity,
  def: (typeof UNITS)[string],
  dead: number[],
): void {
  const p = game.players[u.playerId];
  const atk = def.attack + (p ? p.attackBonus : 0);
  let armor = 0;
  if (target.kind === 'unit') {
    const tdef = UNITS[target.defId];
    // Giáp cận/xa tính theo range của KẺ TẤN CÔNG.
    armor = tdef ? (def.range > 0 ? tdef.pierceArmor : tdef.meleeArmor) : 0;
  }
  const dmg = Math.max(1, atk - armor);
  if (def.range > 0) {
    game.projectiles.push({
      id: game.nextId++,
      x: u.x,
      y: u.y,
      targetId: target.id,
      attackerId: u.id,
      speed: PROJECTILE_SPEED,
      dmg,
    });
  } else {
    applyDamage(game, target, dmg, u.id, dead);
  }
}

/**
 * Gây damage lên target; chết → ghi vào danh sách dead (sweep cuối tick).
 * Unit đang idle bị đánh → đánh trả nếu kẻ tấn công trong tầm nhìn.
 */
function applyDamage(
  game: Game,
  target: UnitEntity | BuildingEntity,
  dmg: number,
  attackerId: number,
  dead: number[],
): void {
  if (target.hp <= 0) return;
  target.hp -= dmg;
  if (target.hp <= 0) {
    dead.push(target.id);
    return;
  }
  if (target.kind === 'unit' && target.state === 'idle') {
    const atk = game.entities.get(attackerId);
    const tdef = UNITS[target.defId];
    if (atk && atk.kind === 'unit' && tdef && tdef.attack > 0) {
      const d = Math.hypot(atk.x - target.x, atk.y - target.y);
      if (d <= tdef.los) {
        target.targetId = atk.id;
        target.state = 'attacking';
        target.attackTimer = 0;
      }
    }
  }
}

/** Bay projectile: tới vị trí hiện tại của target; trúng (< 0.3) → damage. */
function tickProjectiles(game: Game, dead: number[]): void {
  const keep: Projectile[] = [];
  for (const pr of game.projectiles) {
    const t = game.entities.get(pr.targetId);
    if (!t || t.kind === 'resource' || t.hp <= 0) {
      continue; // target chết/biến mất trước → đạn mất
    }
    const dx = t.x - pr.x;
    const dy = t.y - pr.y;
    const d = Math.hypot(dx, dy);
    const step = pr.speed * DT;
    if (d <= Math.max(step, PROJECTILE_HIT_DIST)) {
      applyDamage(game, t, pr.dmg, pr.attackerId, dead);
    } else {
      pr.x += (dx / d) * step;
      pr.y += (dy / d) * step;
      keep.push(pr);
    }
  }
  game.projectiles = keep;
}

/** Mất target khi đang attack-move: quay lại đích attack-move (hoặc đứng scan). */
function resumeAttackMove(game: Game, u: UnitEntity): void {
  const d = Math.hypot(u.attackMoveX - u.x, u.attackMoveY - u.y);
  if (d < 0.3) u.state = 'idle'; // tới nơi → đứng scan
  else game.orderMove(u, u.attackMoveX, u.attackMoveY, 'moving');
}

/** Unit còn sống, sắp xếp theo id tăng dần (deterministic). */
function sortedUnits(game: Game): UnitEntity[] {
  const out: UnitEntity[] = [];
  for (const e of game.entities.values()) {
    if (e.kind === 'unit') out.push(e);
  }
  out.sort((a, b) => a.id - b.id);
  return out;
}
