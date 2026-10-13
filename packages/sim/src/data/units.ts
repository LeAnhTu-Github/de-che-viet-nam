// Định nghĩa UNITS — SỐ LIỆU placeholder kiểu AoE1, cân bằng sau ở Phase 5.
// Tên tiếng Việt lấy từ aoe-vietnam-mapping.json.

import type { ResourceBag } from '../types';
import type { AgeId } from './ages';

export interface UnitDef {
  id: string;
  vnName: string;   // tên Việt Nam (lớp vỏ)
  original: string; // tên gốc AoE1 (tham chiếu cơ chế)
  role: string;     // vai trò chiến thuật
  hp: number;
  speed: number;   // tile/giây
  attack: number;
  range: number;   // 0 = cận chiến
  los: number;      // tầm nhìn (tile)
  cost: Partial<ResourceBag>;
  trainTime: number; // giây
  popCost: number;
  // --- Phase 5a: chiến đấu + thời đại ---
  meleeArmor: number;   // giáp cận chiến
  pierceArmor: number;  // giáp tầm xa
  attackCooldown: number; // giây giữa 2 đòn đánh
  age: AgeId;           // thời mở khóa (theo kich-ban-4-thoi-dai.md)
  mvp: boolean;        // true = thuộc 12 unit MVP
}

export const UNITS: Record<string, UnitDef> = {
  villager_m: { id: 'villager_m', vnName: 'Nông dân', original: 'Villager (M)', role: 'Khai thác, xây dựng', hp: 25, speed: 1.1, attack: 3, range: 0, los: 4, cost: { food: 50 }, trainTime: 20, popCost: 1, meleeArmor: 0, pierceArmor: 0, attackCooldown: 1.5, age: 'stone', mvp: true },
  villager_f: { id: 'villager_f', vnName: 'Thôn nữ', original: 'Villager (F)', role: 'Khai thác, xây dựng', hp: 25, speed: 1.1, attack: 3, range: 0, los: 4, cost: { food: 50 }, trainTime: 20, popCost: 1, meleeArmor: 0, pierceArmor: 0, attackCooldown: 1.5, age: 'stone', mvp: true },
  priest: { id: 'priest', vnName: 'Thầy Mo', original: 'Priest', role: 'Hồi máu, thu phục', hp: 50, speed: 1.0, attack: 0, range: 8, los: 9, cost: { gold: 100 }, trainTime: 30, popCost: 1, meleeArmor: 0, pierceArmor: 0, attackCooldown: 2.0, age: 'bronze', mvp: true },
  clubman: { id: 'clubman', vnName: 'Dân binh', original: 'Clubman', role: 'Bộ binh đời đầu', hp: 40, speed: 1.0, attack: 4, range: 0, los: 4, cost: { food: 50 }, trainTime: 15, popCost: 1, meleeArmor: 0, pierceArmor: 0, attackCooldown: 1.5, age: 'stone', mvp: true },
  axeman: { id: 'axeman', vnName: 'Lính rìu', original: 'Axeman', role: 'Bộ binh', hp: 50, speed: 1.0, attack: 5, range: 0, los: 4, cost: { food: 40, wood: 20 }, trainTime: 18, popCost: 1, meleeArmor: 0, pierceArmor: 0, attackCooldown: 1.5, age: 'tool', mvp: false },
  slinger: { id: 'slinger', vnName: 'Lính ném đá', original: 'Slinger', role: 'Khắc cung thủ', hp: 40, speed: 1.0, attack: 5, range: 5, los: 6, cost: { food: 40, stone: 10 }, trainTime: 18, popCost: 1, meleeArmor: 0, pierceArmor: 0, attackCooldown: 2.0, age: 'tool', mvp: false },
  short_swordsman: { id: 'short_swordsman', vnName: 'Đao binh', original: 'Short Swordsman', role: 'Bộ binh chủ lực', hp: 60, speed: 1.0, attack: 6, range: 0, los: 5, cost: { food: 35, gold: 15 }, trainTime: 15, popCost: 1, meleeArmor: 1, pierceArmor: 1, attackCooldown: 1.5, age: 'bronze', mvp: true },
  broad_swordsman: { id: 'broad_swordsman', vnName: 'Đao binh tinh nhuệ', original: 'Broad Swordsman', role: 'Bộ binh nâng cấp', hp: 70, speed: 1.0, attack: 7, range: 0, los: 5, cost: { food: 40, gold: 20 }, trainTime: 16, popCost: 1, meleeArmor: 1, pierceArmor: 1, attackCooldown: 1.5, age: 'iron', mvp: false },
  long_swordsman: { id: 'long_swordsman', vnName: 'Dũng sĩ', original: 'Long Swordsman', role: 'Bộ binh mạnh', hp: 80, speed: 1.0, attack: 9, range: 0, los: 5, cost: { food: 45, gold: 25 }, trainTime: 18, popCost: 1, meleeArmor: 2, pierceArmor: 2, attackCooldown: 1.5, age: 'iron', mvp: false },
  legion: { id: 'legion', vnName: 'Cấm quân', original: 'Legion', role: 'Bộ binh tối thượng', hp: 120, speed: 1.0, attack: 12, range: 0, los: 6, cost: { food: 60, gold: 30 }, trainTime: 22, popCost: 1, meleeArmor: 3, pierceArmor: 3, attackCooldown: 1.5, age: 'iron', mvp: false },
  hoplite: { id: 'hoplite', vnName: 'Giáo binh', original: 'Hoplite', role: 'Giáo dài', hp: 80, speed: 1.0, attack: 8, range: 0, los: 5, cost: { food: 50, wood: 30 }, trainTime: 20, popCost: 1, meleeArmor: 1, pierceArmor: 1, attackCooldown: 2.0, age: 'bronze', mvp: true },
  phalanx: { id: 'phalanx', vnName: 'Giáo binh phương trận', original: 'Phalanx', role: 'Giáo dài nâng cấp', hp: 100, speed: 1.0, attack: 10, range: 0, los: 5, cost: { food: 60, wood: 35 }, trainTime: 22, popCost: 1, meleeArmor: 2, pierceArmor: 2, attackCooldown: 2.0, age: 'iron', mvp: false },
  centurion: { id: 'centurion', vnName: 'Tướng quân', original: 'Centurion', role: 'Chỉ huy', hp: 150, speed: 1.1, attack: 15, range: 0, los: 6, cost: { food: 80, gold: 40 }, trainTime: 25, popCost: 1, meleeArmor: 3, pierceArmor: 3, attackCooldown: 1.5, age: 'iron', mvp: false },
  bowman: { id: 'bowman', vnName: 'Cung thủ', original: 'Bowman', role: 'Tầm xa cơ bản', hp: 35, speed: 1.0, attack: 4, range: 5, los: 7, cost: { wood: 40, gold: 20 }, trainTime: 20, popCost: 1, meleeArmor: 0, pierceArmor: 1, attackCooldown: 2.0, age: 'tool', mvp: true },
  improved_bowman: { id: 'improved_bowman', vnName: 'Cung thủ tinh nhuệ', original: 'Improved Bowman', role: 'Tầm xa nâng cấp', hp: 40, speed: 1.0, attack: 5, range: 5, los: 7, cost: { wood: 45, gold: 25 }, trainTime: 22, popCost: 1, meleeArmor: 0, pierceArmor: 1, attackCooldown: 2.0, age: 'bronze', mvp: false },
  composite_bowman: { id: 'composite_bowman', vnName: 'Thần tiễn', original: 'Composite Bowman', role: 'Tầm xa mạnh', hp: 45, speed: 1.0, attack: 6, range: 6, los: 8, cost: { wood: 50, gold: 30 }, trainTime: 24, popCost: 1, meleeArmor: 1, pierceArmor: 2, attackCooldown: 2.0, age: 'iron', mvp: false },
  horse_archer: { id: 'horse_archer', vnName: 'Kỵ xạ', original: 'Horse Archer', role: 'Kỵ cung', hp: 50, speed: 1.5, attack: 6, range: 5, los: 7, cost: { wood: 50, gold: 40 }, trainTime: 25, popCost: 1, meleeArmor: 0, pierceArmor: 1, attackCooldown: 2.0, age: 'iron', mvp: false },
  heavy_horse_archer: { id: 'heavy_horse_archer', vnName: 'Kỵ xạ tinh nhuệ', original: 'Heavy Horse Archer', role: 'Kỵ cung nâng cấp', hp: 60, speed: 1.5, attack: 7, range: 6, los: 8, cost: { wood: 60, gold: 50 }, trainTime: 28, popCost: 1, meleeArmor: 1, pierceArmor: 2, attackCooldown: 2.0, age: 'iron', mvp: false },
  chariot_archer: { id: 'chariot_archer', vnName: 'Cung thủ chiến xa', original: 'Chariot Archer', role: 'Cung trên xe', hp: 70, speed: 1.4, attack: 6, range: 5, los: 7, cost: { wood: 60, gold: 40 }, trainTime: 26, popCost: 1, meleeArmor: 1, pierceArmor: 1, attackCooldown: 2.0, age: 'iron', mvp: false },
  elephant_archer: { id: 'elephant_archer', vnName: 'Tượng xạ', original: 'Elephant Archer', role: 'Cung trên voi', hp: 200, speed: 0.9, attack: 7, range: 5, los: 7, cost: { food: 100, gold: 60 }, trainTime: 30, popCost: 2, meleeArmor: 2, pierceArmor: 2, attackCooldown: 2.0, age: 'iron', mvp: false },
  scout: { id: 'scout', vnName: 'Trinh sát', original: 'Scout', role: 'Do thám', hp: 60, speed: 1.6, attack: 4, range: 0, los: 6, cost: { food: 60 }, trainTime: 18, popCost: 1, meleeArmor: 0, pierceArmor: 1, attackCooldown: 1.5, age: 'tool', mvp: true },
  camel_rider: { id: 'camel_rider', vnName: 'Lạc đà chiến', original: 'Camel Rider', role: 'Khắc kỵ binh', hp: 100, speed: 1.5, attack: 7, range: 0, los: 5, cost: { food: 70, gold: 30 }, trainTime: 22, popCost: 1, meleeArmor: 0, pierceArmor: 1, attackCooldown: 1.5, age: 'iron', mvp: false },
  chariot: { id: 'chariot', vnName: 'Chiến xa', original: 'Chariot', role: 'Xe chiến', hp: 120, speed: 1.5, attack: 8, range: 0, los: 5, cost: { wood: 80, gold: 40 }, trainTime: 24, popCost: 1, meleeArmor: 1, pierceArmor: 1, attackCooldown: 1.5, age: 'bronze', mvp: false },
  scythe_chariot: { id: 'scythe_chariot', vnName: 'Chiến xa lưỡi hái', original: 'Scythe Chariot', role: 'Xe chiến nâng cấp', hp: 150, speed: 1.5, attack: 10, range: 0, los: 5, cost: { wood: 90, gold: 50 }, trainTime: 26, popCost: 1, meleeArmor: 1, pierceArmor: 1, attackCooldown: 1.5, age: 'iron', mvp: false },
  cavalry: { id: 'cavalry', vnName: 'Kỵ binh', original: 'Cavalry', role: 'Kỵ cơ bản', hp: 110, speed: 1.5, attack: 8, range: 0, los: 5, cost: { food: 70, gold: 40 }, trainTime: 24, popCost: 1, meleeArmor: 1, pierceArmor: 1, attackCooldown: 1.5, age: 'bronze', mvp: true },
  heavy_cavalry: { id: 'heavy_cavalry', vnName: 'Thiết kỵ', original: 'Heavy Cavalry', role: 'Kỵ nặng', hp: 140, speed: 1.5, attack: 10, range: 0, los: 6, cost: { food: 80, gold: 50 }, trainTime: 26, popCost: 1, meleeArmor: 2, pierceArmor: 2, attackCooldown: 1.5, age: 'iron', mvp: false },
  cataphract: { id: 'cataphract', vnName: 'Cấm vệ kỵ', original: 'Cataphract', role: 'Kỵ tối thượng', hp: 160, speed: 1.5, attack: 12, range: 0, los: 6, cost: { food: 90, gold: 60 }, trainTime: 28, popCost: 1, meleeArmor: 3, pierceArmor: 3, attackCooldown: 1.5, age: 'iron', mvp: false },
  war_elephant: { id: 'war_elephant', vnName: 'Voi chiến', original: 'War Elephant', role: 'Trâu bò càn quét', hp: 400, speed: 0.9, attack: 15, range: 0, los: 6, cost: { food: 150, gold: 80 }, trainTime: 35, popCost: 4, meleeArmor: 3, pierceArmor: 3, attackCooldown: 2.5, age: 'iron', mvp: true },
  armored_elephant: { id: 'armored_elephant', vnName: 'Tượng binh giáp', original: 'Armored Elephant', role: 'Voi bọc giáp', hp: 500, speed: 0.9, attack: 18, range: 0, los: 6, cost: { food: 180, gold: 100 }, trainTime: 40, popCost: 4, meleeArmor: 5, pierceArmor: 5, attackCooldown: 2.5, age: 'iron', mvp: false },
  stone_thrower: { id: 'stone_thrower', vnName: 'Máy bắn đá nhỏ', original: 'Stone Thrower', role: 'Công thành đời đầu', hp: 75, speed: 0.8, attack: 50, range: 9, los: 8, cost: { wood: 100, gold: 50 }, trainTime: 30, popCost: 2, meleeArmor: 0, pierceArmor: 0, attackCooldown: 3.0, age: 'bronze', mvp: true },
  catapult: { id: 'catapult', vnName: 'Máy bắn đá', original: 'Catapult', role: 'Công thành', hp: 100, speed: 0.8, attack: 80, range: 10, los: 9, cost: { wood: 120, gold: 80 }, trainTime: 35, popCost: 2, meleeArmor: 0, pierceArmor: 0, attackCooldown: 3.0, age: 'iron', mvp: false },
  heavy_catapult: { id: 'heavy_catapult', vnName: 'Thần uy pháo đá', original: 'Heavy Catapult', role: 'Công thành mạnh', hp: 120, speed: 0.8, attack: 100, range: 11, los: 10, cost: { wood: 150, gold: 100 }, trainTime: 40, popCost: 3, meleeArmor: 0, pierceArmor: 0, attackCooldown: 3.0, age: 'iron', mvp: false },
  ballista: { id: 'ballista', vnName: 'Nỏ thần Liên Châu', original: 'Ballista', role: 'Nỏ công thành', hp: 80, speed: 0.8, attack: 60, range: 9, los: 9, cost: { wood: 100, gold: 80 }, trainTime: 32, popCost: 2, meleeArmor: 0, pierceArmor: 0, attackCooldown: 3.0, age: 'iron', mvp: true },
  helepolis: { id: 'helepolis', vnName: 'Tháp công thành', original: 'Helepolis', role: 'Tháp di động', hp: 200, speed: 0.7, attack: 40, range: 8, los: 8, cost: { wood: 150, gold: 100 }, trainTime: 40, popCost: 3, meleeArmor: 2, pierceArmor: 2, attackCooldown: 3.0, age: 'iron', mvp: false },
};
