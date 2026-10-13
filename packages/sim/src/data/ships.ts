// Định nghĩa SHIPS — SỐ LIỆU placeholder kiểu AoE1, cân bằng sau ở Phase 5.
// Tên tiếng Việt lấy từ aoe-vietnam-mapping.json.

import type { ResourceBag } from '../types';

export interface ShipDef {
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
}

export const SHIPS: Record<string, ShipDef> = {
  fishing_boat: { id: 'fishing_boat', vnName: 'Thuyền câu', original: 'Fishing Boat', role: '', hp: 45, speed: 1.4, attack: 0, range: 0, los: 5, cost: { wood: 50 }, trainTime: 20, popCost: 1 },
  fishing_ship: { id: 'fishing_ship', vnName: 'Thuyền chài', original: 'Fishing Ship', role: '', hp: 60, speed: 1.5, attack: 0, range: 0, los: 6, cost: { wood: 80 }, trainTime: 25, popCost: 1 },
  trade_boat: { id: 'trade_boat', vnName: 'Thuyền buôn', original: 'Trade Boat', role: '', hp: 80, speed: 1.6, attack: 0, range: 0, los: 6, cost: { wood: 100 }, trainTime: 25, popCost: 1 },
  merchant_ship: { id: 'merchant_ship', vnName: 'Thương thuyền', original: 'Merchant Ship', role: '', hp: 100, speed: 1.6, attack: 0, range: 0, los: 7, cost: { wood: 120 }, trainTime: 30, popCost: 1 },
  light_transport: { id: 'light_transport', vnName: 'Thuyền vận tải nhẹ', original: 'Light Transport', role: '', hp: 120, speed: 1.5, attack: 0, range: 0, los: 5, cost: { wood: 150 }, trainTime: 30, popCost: 1 },
  heavy_transport: { id: 'heavy_transport', vnName: 'Thuyền vận tải nặng', original: 'Heavy Transport', role: '', hp: 180, speed: 1.5, attack: 0, range: 0, los: 5, cost: { wood: 150 }, trainTime: 35, popCost: 1 },
  scout_ship: { id: 'scout_ship', vnName: 'Thuyền tuần', original: 'Scout Ship', role: '', hp: 120, speed: 1.8, attack: 5, range: 5, los: 7, cost: { wood: 135 }, trainTime: 30, popCost: 1 },
  war_galley: { id: 'war_galley', vnName: 'Thuyền chiến', original: 'War Galley', role: '', hp: 160, speed: 1.6, attack: 8, range: 6, los: 7, cost: { wood: 135 }, trainTime: 35, popCost: 1 },
  fire_galley: { id: 'fire_galley', vnName: 'Thuyền lửa', original: 'Fire Galley', role: '', hp: 200, speed: 1.5, attack: 24, range: 1, los: 6, cost: { wood: 115, gold: 40 }, trainTime: 35, popCost: 1 },
  trireme: { id: 'trireme', vnName: 'Lâu thuyền', original: 'Trireme', role: '', hp: 200, speed: 1.6, attack: 12, range: 7, los: 8, cost: { wood: 135 }, trainTime: 40, popCost: 1 },
  catapult_trireme: { id: 'catapult_trireme', vnName: 'Lâu thuyền pháo đá', original: 'Catapult Trireme', role: '', hp: 120, speed: 1.5, attack: 35, range: 9, los: 8, cost: { wood: 135, gold: 75 }, trainTime: 40, popCost: 2 },
  juggernaught: { id: 'juggernaught', vnName: 'Đại chiến thuyền', original: 'Juggernaught', role: '', hp: 200, speed: 1.5, attack: 35, range: 10, los: 9, cost: { wood: 135, gold: 75 }, trainTime: 45, popCost: 2 },
};
