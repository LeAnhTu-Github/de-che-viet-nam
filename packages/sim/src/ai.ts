// AI máy rule-based 3 cấp độ cho Đế Chế Việt Nam.
// Dùng cho local mode (phe máy) và có thể gắn vào server sau này.
// TUYỆT ĐỐI không dùng Math.random/Date.now — mọi ngẫu nhiên qua game.rng.

import type { Game } from './Game';
import { UNITS } from './data/units';
import { BUILDINGS } from './data/buildings';
import { TECHS } from './data/techs';
import type { ResourceType } from './types';
import { isUnit, isBuilding, type UnitEntity, type BuildingEntity, type ResourceNodeEntity } from './entities';

export type AIDifficulty = 'de' | 'trungbinh' | 'kho';

interface DifficultyParam {
  /** AI ra quyết định mỗi N tick. */
  interval: number;
  /** Đủ bao nhiêu lính thì tấn công. */
  attackAt: number;
  /** Tối đa dân. */
  maxVillagers: number;
}

const PARAMS: Record<AIDifficulty, DifficultyParam> = {
  de: { interval: 80, attackAt: 12, maxVillagers: 10 },
  trungbinh: { interval: 40, attackAt: 10, maxVillagers: 12 },
  kho: { interval: 30, attackAt: 8, maxVillagers: 14 },
};

/** Tên hiển thị + ghi chú cheat minh bạch. */
export const AI_LABEL: Record<AIDifficulty, string> = {
  de: 'Máy (Dễ)',
  trungbinh: 'Máy (Trung bình)',
  kho: 'Máy (Khó, +10% khai thác)',
};

function isVillager(u: UnitEntity): boolean {
  return u.defId === 'villager_m' || u.defId === 'villager_f';
}

/** Loại tài nguyên → kind node trong RESOURCES. */
const GATHER_KIND: Record<ResourceType, string[]> = {
  wood: ['tree'],
  food: ['berry', 'gazelle', 'wild_elephant', 'fish'],
  gold: ['gold_mine'],
  stone: ['stone_mine'],
};

export class RuleAI {
  private readonly params: DifficultyParam;
  private hardBonusApplied = false;
  private lastWarTargetId: number | null = null;

  constructor(readonly difficulty: AIDifficulty) {
    this.params = PARAMS[difficulty];
  }

  /** Gọi mỗi tick game; AI tự quyết định theo interval của độ khó. */
  update(game: Game, pid: number): void {
    if (game.winner !== null && game.winner !== undefined) return;
    if (game.getTick() % this.params.interval !== 0) return;
    const p = game.players[pid];
    if (!p) return;

    // Cheat minh bạch của độ khó: +10% tốc độ khai thác.
    if (this.difficulty === 'kho' && !this.hardBonusApplied) {
      p.gatherMul = { wood: 1.1, food: 1.1, gold: 1.1, stone: 1.1 };
      this.hardBonusApplied = true;
    }

    const units = [...game.entities.values()].filter(
      (e): e is UnitEntity => isUnit(e) && e.playerId === pid && e.hp > 0,
    );
    const buildings = [...game.entities.values()].filter(
      (e): e is BuildingEntity => isBuilding(e) && e.playerId === pid && e.hp > 0,
    );
    const villagers = units.filter(isVillager);
    const military = units.filter((u) => !isVillager(u) && (UNITS[u.defId]?.attack ?? 0) > 0);
    const tc = buildings.find((b) => b.defId === 'town_center' && b.complete);

    // 1. Train dân — ưu tiên cao nhất.
    // Thời đá: giữ tối đa 8 dân + dành dụm thịt (không train khi thịt ≥ 400)
    // để lên đời càng sớm càng tốt.
    // Từ tool: "súng trước bơ" — nhà quân sự đang rảnh và chưa đủ quân tấn công
    // thì nhường thịt cho train lính, không train dân.
    const villCap = p.age === 'stone' ? 8 : this.params.maxVillagers;
    const reservingFood = p.age === 'stone' && p.resources.food >= 400;
    const queuedVills = tc?.trainQueue.length ?? 1;
    const villCost = UNITS['villager_m']?.cost?.food ?? 50;
    const gunsFirst = this.needsMilitary(buildings, military);
    if (
      tc && queuedVills === 0 &&
      villagers.length < villCap && p.pop < p.popCap &&
      !reservingFood && !gunsFirst && p.resources.food >= villCost
    ) {
      const defId = game.rng.float() < 0.5 ? 'villager_m' : 'villager_f';
      game.addCommand({ type: 'train', playerId: pid, buildingId: tc.id, unitDefId: defId });
    }

    // 2. Lên đời khi đủ tiền (ưu tiên trước train quân).
    if (tc && this.tryAgeUp(game, pid, tc)) return;

    // 3. Nhà sàn khi sắp hết dân số.
    this.ensureHousing(game, pid, tc, villagers, buildings, p.pop, p.popCap);

    // 3b. Kho thóc gần bầy voi rừng (drop-off gần → thịt về nhanh).
    this.buildGranaryNearElephants(game, pid, tc, villagers, buildings);

    // 4. Phân bổ dân đi khai thác theo tỉ lệ 40/30/20/10 (+ gán lại dân bị cạn node).
    this.assignGatherers(game, pid, villagers);

    // 5. Build order quân sự theo thời.
    this.militaryBuildOrder(game, pid, tc, villagers, buildings);

    // 6. Train quân từ nhà quân sự đầu tiên có thể.
    this.trainArmy(game, pid, buildings);

    // 7. Đủ quân → tấn công.
    if (military.length >= this.params.attackAt) {
      this.attack(game, pid, military);
    }
  }

  // ----------------------------------------------------------

  /**
   * true khi cần ưu tiên train quân thay vì dân: chưa đủ quân để tấn công
   * mà đã có nhà quân sự đang rảnh.
   */
  private needsMilitary(buildings: BuildingEntity[], military: UnitEntity[]): boolean {
    if (military.length >= this.params.attackAt) return false;
    return buildings.some(
      (b) =>
        b.complete &&
        b.defId !== 'town_center' &&
        (BUILDINGS[b.defId]?.trains.length ?? 0) > 0 &&
        b.trainQueue.length === 0,
    );
  }

  private tryAgeUp(game: Game, pid: number, tc: BuildingEntity): boolean {
    const p = game.players[pid]!;
    const next: Record<string, string> = { stone: 'age_tool', tool: 'age_bronze', bronze: 'age_iron' };
    const techId = next[p.age];
    if (!techId || p.techs.has(techId)) return false;
    // Chỉ research khi không có research nào đang chạy ở đình làng.
    if (tc.researchQueue.length > 0) return false;
    // Chưa đủ tiền → không chiếm lượt AI (để dân đi gather/xây nhà).
    const tech = TECHS[techId];
    if (!tech || !this.canAfford(p, tech.cost)) return false;
    game.addCommand({ type: 'research', playerId: pid, buildingId: tc.id, techId });
    return true;
  }

  private ensureHousing(
    game: Game, pid: number, tc: BuildingEntity | undefined,
    villagers: UnitEntity[], buildings: BuildingEntity[], pop: number, popCap: number,
  ): void {
    if (!tc || pop < popCap - 2) return;
    const pending = buildings.some((b) => b.defId === 'house' && !b.complete);
    if (pending || villagers.length < 2) return;
    const spot = this.findBuildSpot(game, tc.x, tc.y);
    if (!spot) return;
    game.addCommand({
      type: 'build', playerId: pid,
      unitIds: villagers.slice(-2).map((v) => v.id),
      buildingId: 'house', x: spot.x, y: spot.y,
    });
  }

  private assignGatherers(game: Game, pid: number, villagers: UnitEntity[]): void {
    // Dân idle HOẶC đang bám node đã cạn → gán lại.
    const needy = villagers.filter((v) => {
      if (v.state === 'idle' && v.targetNodeId === null) return true;
      if (v.targetNodeId !== null) {
        const n = game.entities.get(v.targetNodeId);
        if (!n || n.kind !== 'resource' || (n as ResourceNodeEntity).amount <= 0) return true;
      }
      return false;
    });
    if (needy.length === 0) return;
    // Tỉ lệ khai thác theo thời (học từ AI thắng trong aiwar.test.ts: ít dân, dồn thịt):
    // - Thời đá: DỒN THỊT để lên đời sớm (60% thịt / 20% gỗ / 10% vàng / 10% đá).
    // - Từ tool: 50% thịt / 20% gỗ / 15% đá (cần đá cho slinger) / 15% vàng.
    const p = game.players[pid]!;
    const stone = p.age === 'stone';
    const plan: ResourceType[] = stone
      ? ['food', 'food', 'food', 'food', 'food', 'food', 'wood', 'wood', 'gold', 'stone']
      : ['food', 'food', 'food', 'food', 'food', 'wood', 'wood', 'stone', 'gold', 'food'];
    const sorted = [...needy].sort((a, b) => a.id - b.id);
    sorted.forEach((v, i) => {
      const rt = plan[(v.id + i) % plan.length]!;
      const node = this.bestResource(game, v.x, v.y, rt);
      if (node) {
        game.addCommand({ type: 'gather', playerId: pid, unitIds: [v.id], targetId: node.id, resource: rt });
      }
    });
  }

  /**
   * Chọn node tài nguyên tốt nhất:
   * - thịt: ưu tiên trữ lượng lớn gần (voi 400 > nai 150 > quả 150) — điểm = amount/(1+dist/8).
   * - còn lại: node gần nhất.
   */
  private bestResource(game: Game, x: number, y: number, rt: ResourceType): ResourceNodeEntity | null {
    const kinds = GATHER_KIND[rt];
    let best: ResourceNodeEntity | null = null;
    let bestScore = -Infinity;
    for (const e of game.entities.values()) {
      if (e.kind !== 'resource' || (e as ResourceNodeEntity).amount <= 0) continue;
      const n = e as ResourceNodeEntity;
      if (!kinds.includes(n.defId)) continue;
      const dist = Math.hypot(n.x - x, n.y - y);
      const score = rt === 'food' ? n.amount / (1 + dist / 8) : -dist;
      if (score > bestScore) { bestScore = score; best = n; }
    }
    return best;
  }

  /**
   * Dựng kho thóc gần bầy voi rừng nhất khi có ≥6 dân và chưa có kho thóc:
   * drop-off gần → dân thịt đi lại ngắn, kinh tế thịt tăng mạnh.
   */
  private buildGranaryNearElephants(
    game: Game, pid: number, tc: BuildingEntity | undefined,
    villagers: UnitEntity[], buildings: BuildingEntity[],
  ): void {
    if (!tc || villagers.length < 6) return;
    if (buildings.some((b) => b.defId === 'granary')) return;
    const def = BUILDINGS['granary'];
    if (!def || !this.canAfford(game.players[pid]!, def.cost)) return;
    // Tìm voi rừng gần đình làng nhất.
    let ex = tc.x, ey = tc.y, bd = Infinity;
    for (const e of game.entities.values()) {
      if (e.kind === 'resource' && (e as ResourceNodeEntity).defId === 'wild_elephant' && (e as ResourceNodeEntity).amount > 0) {
        const d = Math.hypot(e.x - tc.x, e.y - tc.y);
        if (d < bd) { bd = d; ex = e.x; ey = e.y; }
      }
    }
    const spot = this.findBuildSpot(game, ex, ey) ?? this.findBuildSpot(game, tc.x, tc.y);
    if (!spot) return;
    const builders = villagers.filter((v) => v.state === 'idle').slice(0, 2);
    const ids = (builders.length > 0 ? builders : villagers.slice(0, 2)).map((v) => v.id);
    if (ids.length === 0) return;
    game.addCommand({ type: 'build', playerId: pid, unitIds: ids, buildingId: 'granary', x: spot.x, y: spot.y });
  }

  private militaryBuildOrder(
    game: Game, pid: number, tc: BuildingEntity | undefined,
    villagers: UnitEntity[], buildings: BuildingEntity[],
  ): void {
    if (!tc || villagers.length < 4) return;
    const p = game.players[pid]!;
    // Trại lính sau khi lên tool; trường bắn/chuồng ngựa sau bronze.
    const want: string[] = [];
    if (p.age !== 'stone') want.push('barracks');
    if (p.age === 'bronze' || p.age === 'iron') want.push('archery_range', 'stable');
    for (const defId of want) {
      const has = buildings.some((b) => b.defId === defId);
      if (has) continue;
      const def = BUILDINGS[defId];
      if (!def || !this.canAfford(p, def.cost)) continue;
      const spot = this.findBuildSpot(game, tc.x, tc.y);
      if (!spot) continue;
      const builders = villagers.filter((v) => v.state === 'idle').slice(0, 3);
      const ids = (builders.length > 0 ? builders : villagers.slice(0, 3)).map((v) => v.id);
      if (ids.length === 0) continue;
      game.addCommand({ type: 'build', playerId: pid, unitIds: ids, buildingId: defId, x: spot.x, y: spot.y });
      return; // mỗi lượt 1 nhà
    }
  }

  private trainArmy(game: Game, pid: number, buildings: BuildingEntity[]): void {
    const p = game.players[pid]!;
    for (const b of buildings) {
      if (!b.complete || b.trainQueue.length >= 2) continue;
      // Đình làng do khối train dân riêng quản lý (tránh double-train).
      if (b.defId === 'town_center') continue;
      const def = BUILDINGS[b.defId];
      if (!def) continue;
      // Chọn unit rẻ nhất có attack > 0 mà thời hiện tại cho phép.
      // Ưu tiên slinger (lính ném đá: rẻ, đánh xa) như chiến thuật rush đã thắng trong aiwar.test.ts.
      const options = def.trains
        .map((id) => UNITS[id])
        .filter((u) => u && (u.attack ?? 0) > 0 && this.ageOk(p.age, u.age));
      if (options.length === 0) continue;
      options.sort((a, b) => {
        const sa = a!.id === 'slinger' ? -1000 : 0;
        const sb = b!.id === 'slinger' ? -1000 : 0;
        return sa - sb || this.totalCost(a!.cost) - this.totalCost(b!.cost);
      });
      const pick = options[0]!;
      if (p.pop + (pick.popCost ?? 1) > p.popCap) continue;
      if (!this.canAfford(p, pick.cost)) continue; // chưa đủ tiền → đợi, không spam lệnh
      game.addCommand({ type: 'train', playerId: pid, buildingId: b.id, unitDefId: pick.id });
      return; // mỗi lượt 1 lệnh train
    }
  }

  private attack(game: Game, pid: number, military: UnitEntity[]): void {
    const enemy = 1 - pid;
    let target: { id: number; x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const e of game.entities.values()) {
      if (e.kind !== 'building' && e.kind !== 'unit') continue;
      if (e.playerId !== enemy || e.hp <= 0) continue;
      const d = (e.x - 64) * (e.x - 64) + (e.y - 64) * (e.y - 64);
      if (d < bestD) { bestD = d; target = { id: e.id, x: e.x, y: e.y }; }
    }
    if (!target) return;
    if (this.lastWarTargetId === target.id) {
      // Ra lệnh cho lính mới chưa có attackMove.
      const fresh = military.filter((m) => !m.attackMove);
      if (fresh.length === 0) return;
      game.addCommand({ type: 'attackmove', playerId: pid, unitIds: fresh.map((m) => m.id), x: target.x, y: target.y });
      return;
    }
    this.lastWarTargetId = target.id;
    game.addCommand({
      type: 'attackmove', playerId: pid,
      unitIds: military.map((m) => m.id), x: target.x, y: target.y,
    });
  }

  private findBuildSpot(game: Game, cx: number, cy: number): { x: number; y: number } | null {
    const map = game.map;
    if (!map) return null;
    for (let r = 3; r <= 12; r++) {
      for (let a = 0; a < 12; a++) {
        const x = Math.round(cx + Math.cos((a / 12) * Math.PI * 2) * r);
        const y = Math.round(cy + Math.sin((a / 12) * Math.PI * 2) * r);
        if (x < 2 || y < 2 || x >= map.width - 2 || y >= map.height - 2) continue;
        if (!map.isWalkable(x, y)) continue;
        let blocked = false;
        for (const e of game.entities.values()) {
          if (e.kind === 'building' && Math.abs(e.x - x) < 3 && Math.abs(e.y - y) < 3) { blocked = true; break; }
        }
        if (!blocked) return { x, y };
      }
    }
    return null;
  }

  private canAfford(p: { resources: Record<ResourceType, number> }, cost: Partial<Record<ResourceType, number>>): boolean {
    return (['wood', 'food', 'gold', 'stone'] as ResourceType[]).every(
      (r) => p.resources[r] >= (cost[r] ?? 0),
    );
  }

  private totalCost(cost: Partial<Record<ResourceType, number>>): number {
    return (cost.wood ?? 0) + (cost.food ?? 0) + (cost.gold ?? 0) + (cost.stone ?? 0);
  }

  private ageOk(playerAge: string, needAge: string): boolean {
    const order = ['stone', 'tool', 'bronze', 'iron'];
    return order.indexOf(playerAge) >= order.indexOf(needAge);
  }
}
