// System nghiên cứu Phase 5a: research tech + lên đời tại Đình làng.
// Lên đời là tech đặc biệt (grantsAge): xong → player.age mới + event ageUp.
// Deterministic tuyệt đối: không Math.random/Date.now, duyệt theo id tăng dần.

import { BUILDINGS } from '../data/buildings';
import { TECHS, type TechDef } from '../data/techs';
import type { Game } from '../Game';
import type { BuildingEntity } from '../entities';
import type { ResearchCommand } from '../types';

/** dt của 1 tick (giây) — đồng bộ với Game.TICK_RATE = 20. */
const DT = 1 / 20;

/**
 * Lệnh research: validate (nhà complete + thuộc player + nhà research được
 * tech này + đủ thời + chưa research + chưa có trong hàng đợi + đủ tiền)
 * → trừ tiền → xếp hàng đợi trong building.
 */
export function applyResearchCommand(game: Game, cmd: ResearchCommand): void {
  const b = game.entities.get(cmd.buildingId);
  if (!b || b.kind !== 'building') return;
  if (b.playerId !== cmd.playerId) return;
  if (!b.complete) return;
  const tech = TECHS[cmd.techId];
  if (!tech) return;
  const bdef = BUILDINGS[b.defId];
  if (!bdef || !bdef.researches.includes(cmd.techId)) return;
  const p = game.players[cmd.playerId];
  if (!p) return;
  if (p.techs.has(cmd.techId)) return; // đã research rồi
  if (b.researchQueue.some((q) => q.techId === cmd.techId)) return;
  if (!game.ageAllows(cmd.playerId, tech.age)) return; // chưa đủ thời
  if (!game.canAfford(p, tech.cost)) return;
  game.payCost(p, tech.cost);
  b.researchQueue.push({ techId: cmd.techId, progress: 0 });
}

/** Mỗi tick: chạy research đầu hàng đợi của từng nhà; xong → apply effect. */
export function updateResearch(game: Game): void {
  for (const b of sortedBuildings(game)) {
    const q = b.researchQueue[0];
    if (!q) continue;
    const tech = TECHS[q.techId];
    if (!tech || tech.researchTime <= 0) {
      b.researchQueue.shift();
      continue;
    }
    q.progress += DT / tech.researchTime;
    if (q.progress >= 1) {
      b.researchQueue.shift();
      completeResearch(game, b.playerId, tech);
    }
  }
}

/** Research xong: ghi tech, cộng bonus, lên đời (nếu là tech age) + event. */
function completeResearch(game: Game, playerId: number, tech: TechDef): void {
  const p = game.players[playerId];
  if (!p || p.techs.has(tech.id)) return;
  p.techs.add(tech.id);
  for (const fx of tech.effects) {
    if (fx.type === 'attackAdd') {
      p.attackBonus += fx.value;
    } else if (fx.type === 'hpAdd') {
      for (const e of game.entities.values()) {
        if (e.kind === 'unit' && e.playerId === playerId && e.hp > 0) {
          e.maxHp += fx.value;
          e.hp += fx.value;
        }
      }
    } else if (fx.type === 'gatherMul' && fx.resource) {
      p.gatherMul[fx.resource] *= fx.value;
    } else {
      console.log(
        `research: bỏ qua effect không hỗ trợ của tech '${tech.id}'`,
      );
    }
  }
  if (tech.grantsAge) {
    p.age = tech.grantsAge;
    game.events.push({ type: 'ageUp', playerId, newAge: tech.grantsAge });
  }
}

/** Building sắp xếp theo id tăng dần (deterministic). */
function sortedBuildings(game: Game): BuildingEntity[] {
  const out: BuildingEntity[] = [];
  for (const e of game.entities.values()) {
    if (e.kind === 'building') out.push(e);
  }
  out.sort((a, b) => a.id - b.id);
  return out;
}
