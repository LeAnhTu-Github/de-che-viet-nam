// Tech theo AoE1 — unlock theo thời trong kich-ban-4-thoi-dai.md.
// effects: chỉ 3 loại được sim hỗ trợ (attackAdd, gatherMul, hpAdd);
// tech không thuộc 3 loại → research xong log bỏ qua (sim giữ nguyên).

import type { ResourceBag, ResourceType } from '../types';
import type { AgeId } from './ages';

/** Loại effect mà sim Phase 5a hỗ trợ. */
export type TechEffectType = 'attackAdd' | 'gatherMul' | 'hpAdd';

export interface TechEffect {
  type: TechEffectType;
  value: number;
  /** Dùng cho gatherMul: loại tài nguyên được nhân tốc độ. */
  resource?: ResourceType;
}

export interface TechDef {
  id: string;
  vnName: string;
  effect: string; // mô tả hiệu ứng
  cost: Partial<ResourceBag>;
  researchTime: number; // giây
  age: AgeId; // thời mở khóa (player phải ở thời này mới research được)
  effects: TechEffect[]; // effect sim áp dụng (rỗng = chỉ mở khóa/không effect số)
  /** Lên đời: research xong player.age = grantsAge + phát event ageUp. */
  grantsAge?: AgeId;
}

export const TECHS: Record<string, TechDef> = {
  // ---- Thời 2 (tool) ----
  woodcutting: { id: 'woodcutting', vnName: 'Kỹ thuật đốn gỗ', effect: 'Tăng 20% tốc độ chặt gỗ', cost: { food: 120, wood: 80 }, researchTime: 30, age: 'tool',
    effects: [{ type: 'gatherMul', value: 1.2, resource: 'wood' }] },
  gold_mining: { id: 'gold_mining', vnName: 'Đào vàng', effect: 'Tăng 20% tốc độ đào vàng', cost: { food: 120, wood: 80 }, researchTime: 30, age: 'tool',
    effects: [{ type: 'gatherMul', value: 1.2, resource: 'gold' }] },
  stone_mining: { id: 'stone_mining', vnName: 'Khai thác đá', effect: 'Tăng 20% tốc độ đào đá', cost: { food: 150, wood: 100 }, researchTime: 30, age: 'tool',
    effects: [{ type: 'gatherMul', value: 1.2, resource: 'stone' }] },
  leather_armor: { id: 'leather_armor', vnName: 'Giáp da', effect: 'Bộ binh +2 giáp', cost: { food: 100, gold: 80 }, researchTime: 30, age: 'tool',
    effects: [] }, // giáp chưa có loại effect hỗ trợ → log bỏ qua
  // ---- Thời 3 (bronze) ----
  saw: { id: 'saw', vnName: 'Cưa xẻ', effect: 'Tăng thêm 20% tốc độ chặt gỗ', cost: { food: 200, wood: 150 }, researchTime: 40, age: 'bronze',
    effects: [{ type: 'gatherMul', value: 1.2, resource: 'wood' }] },
  plow: { id: 'plow', vnName: 'Cày ruộng', effect: 'Ruộng +75 thịt', cost: { food: 250, wood: 150 }, researchTime: 40, age: 'bronze',
    effects: [{ type: 'gatherMul', value: 1.25, resource: 'food' }] },
  wheel: { id: 'wheel', vnName: 'Bánh xe', effect: 'Dân di chuyển nhanh hơn', cost: { food: 200, wood: 150 }, researchTime: 40, age: 'bronze',
    effects: [] }, // tốc độ di chuyển chưa có loại effect hỗ trợ → log bỏ qua
  bronze_shield: { id: 'bronze_shield', vnName: 'Khiên đồng', effect: 'Bộ binh +2 giáp', cost: { food: 150, gold: 120 }, researchTime: 40, age: 'bronze',
    effects: [] }, // giáp chưa có loại effect hỗ trợ → log bỏ qua
  // ---- Thời 4 (iron) ----
  irrigation: { id: 'irrigation', vnName: 'Thủy lợi', effect: 'Tốc độ làm ruộng +40%', cost: { food: 300, wood: 200 }, researchTime: 50, age: 'iron',
    effects: [{ type: 'gatherMul', value: 1.4, resource: 'food' }] },
  iron_shield: { id: 'iron_shield', vnName: 'Khiên sắt', effect: 'Bộ binh +2 giáp', cost: { food: 200, gold: 150 }, researchTime: 50, age: 'iron',
    effects: [] }, // giáp chưa có loại effect hỗ trợ → log bỏ qua
  ballistics: { id: 'ballistics', vnName: 'Đạn đạo', effect: 'Đánh xa chính xác hơn', cost: { food: 200, gold: 150 }, researchTime: 50, age: 'iron',
    effects: [] }, // độ chính xác chưa có loại effect hỗ trợ → log bỏ qua
  engineering: { id: 'engineering', vnName: 'Công trình', effect: 'Máy bắn đá +2 tầm', cost: { food: 250, gold: 200 }, researchTime: 60, age: 'iron',
    effects: [] }, // tầm đánh chưa có loại effect hỗ trợ → log bỏ qua
  // ---- Lên đời tại Đình làng (giữ nguyên 100% cơ chế AoE1) ----
  age_tool: { id: 'age_tool', vnName: 'Lên Thời dựng nước', effect: 'Mở khóa Thời 2', cost: { food: 500 }, researchTime: 60, age: 'stone',
    effects: [], grantsAge: 'tool' },
  age_bronze: { id: 'age_bronze', vnName: 'Lên Thời Đồ Đồng', effect: 'Mở khóa Thời 3', cost: { food: 800 }, researchTime: 90, age: 'tool',
    effects: [], grantsAge: 'bronze' },
  age_iron: { id: 'age_iron', vnName: 'Lên Thời Âu Lạc', effect: 'Mở khóa Thời 4', cost: { food: 1000, gold: 800 }, researchTime: 120, age: 'bronze',
    effects: [], grantsAge: 'iron' },
};
