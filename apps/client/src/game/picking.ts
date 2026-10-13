/**
 * picking.ts — Bắt chuột theo HÌNH entity (không phải bán kính quanh điểm chân).
 *
 * Dùng chung cho click trái (chọn), click phải (mục tiêu lệnh) và khung kéo chọn,
 * cả local lẫn net. Hộp bắt = hình sprite đang vẽ (anchor chân) ∪ nền nhà (footprint).
 */
import { defIdOf } from './entitySync';
import type { SimEntity } from './localGame';
import {
  UNIT_SPRITE,
  buildingFootprint,
  resourceDisplayHeight,
  unitDisplayHeight,
  unitFootRadius,
} from './spriteManager';

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Hộp bắt chuột của entity, world px. */
export function entityBox(e: SimEntity): Box {
  const defId = defIdOf(e);
  if (e.kind === 'building') {
    // Sprite nhà: đáy trùng mép dưới nền, cao xấp xỉ 0.8 bề ngang nền.
    const fp = buildingFootprint(defId);
    const fw = fp.w / 2;
    const fh = fp.h / 2;
    return { left: e.x - fw, top: e.y + fh - Math.max(fp.h, fp.w * 0.8), right: e.x + fw, bottom: e.y + fh };
  }
  if (e.kind === 'unit') {
    const h = unitDisplayHeight(UNIT_SPRITE[defId] ?? '');
    const hw = unitFootRadius(UNIT_SPRITE[defId] ?? '') + 3;
    return { left: e.x - hw, top: e.y - h, right: e.x + hw, bottom: e.y + 8 };
  }
  const h = resourceDisplayHeight(defId);
  const hw = Math.max(18, h * 0.45);
  return { left: e.x - hw, top: e.y - h, right: e.x + hw, bottom: e.y + 8 };
}

const KIND_RANK: Record<SimEntity['kind'], number> = { unit: 0, building: 1, resource: 2 };

/**
 * Entity dưới con trỏ. Ưu tiên unit > nhà > tài nguyên (unit đứng trước nhà vẫn bấm được);
 * cùng loại thì lấy cái gần tâm hộp nhất. Unit đã chết bị bỏ qua.
 */
export function pickEntity(entities: Iterable<SimEntity>, x: number, y: number): SimEntity | undefined {
  let best: SimEntity | undefined;
  let bestRank = Infinity;
  let bestD = Infinity;
  for (const e of entities) {
    if (e.kind === 'unit' && e.hp <= 0) continue;
    const b = entityBox(e);
    if (x < b.left || x > b.right || y < b.top || y > b.bottom) continue;
    const rank = KIND_RANK[e.kind];
    const d = Math.hypot((b.left + b.right) / 2 - x, (b.top + b.bottom) / 2 - y);
    if (rank < bestRank || (rank === bestRank && d < bestD)) {
      best = e;
      bestRank = rank;
      bestD = d;
    }
  }
  return best;
}

/** Khung kéo (2 góc bất kỳ) có chạm thân entity không. */
export function boxTouches(e: SimEntity, a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const eb = entityBox(e);
  return (
    eb.left <= Math.max(a.x, b.x) &&
    eb.right >= Math.min(a.x, b.x) &&
    eb.top <= Math.max(a.y, b.y) &&
    eb.bottom >= Math.min(a.y, b.y)
  );
}
