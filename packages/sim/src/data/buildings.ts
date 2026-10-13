// Định nghĩa nhà — số liệu placeholder kiểu AoE1.

import type { ResourceBag } from '../types';
import type { AgeId } from './ages';

export interface BuildingDef {
  id: string;
  vnName: string;
  original: string;
  hp: number;
  size: string; // 'WxH' tile
  cost: Partial<ResourceBag>;
  buildTime: number; // giây
  trains: string[];  // id unit train được
  researches: string[]; // id tech nghiên cứu được
  // --- Phase 5a: thời đại ---
  age: AgeId;    // thời mở khóa (theo kich-ban-4-thoi-dai.md)
  mvp: boolean; // true = thuộc 10 nhà MVP
}

export const BUILDINGS: Record<string, BuildingDef> = {
  town_center: { id: 'town_center', vnName: 'Đình làng', original: 'Town Center', hp: 1200, size: '4x4', cost: { wood: 200 }, buildTime: 120, trains: ['villager_m', 'villager_f'], researches: ['age_tool', 'age_bronze', 'age_iron'], age: 'stone', mvp: true },
  house: { id: 'house', vnName: 'Nhà sàn', original: 'House', hp: 75, size: '2x2', cost: { wood: 30 }, buildTime: 20, trains: [], researches: [], age: 'stone', mvp: true },
  granary: { id: 'granary', vnName: 'Kho thóc', original: 'Granary', hp: 350, size: '2x2', cost: { wood: 120 }, buildTime: 40, trains: [], researches: [], age: 'stone', mvp: true },
  storage_pit: { id: 'storage_pit', vnName: 'Nhà kho', original: 'Storage Pit', hp: 350, size: '2x2', cost: { wood: 120 }, buildTime: 40, trains: [], researches: [], age: 'stone', mvp: true },
  farm: { id: 'farm', vnName: 'Ruộng lúa', original: 'Farm', hp: 0, size: '1x1', cost: { wood: 75 }, buildTime: 10, trains: [], researches: [], age: 'tool', mvp: true },
  dock: { id: 'dock', vnName: 'Bến nước', original: 'Dock', hp: 600, size: '3x3', cost: { wood: 150 }, buildTime: 50, trains: ['fishing_boat', 'trade_boat', 'scout_ship', 'war_galley'], researches: [], age: 'tool', mvp: false },
  barracks: { id: 'barracks', vnName: 'Trại lính', original: 'Barracks', hp: 350, size: '3x3', cost: { wood: 125 }, buildTime: 45, trains: ['clubman', 'axeman', 'slinger', 'short_swordsman', 'hoplite'], researches: [], age: 'tool', mvp: true },
  archery_range: { id: 'archery_range', vnName: 'Trường bắn', original: 'Archery Range', hp: 350, size: '3x3', cost: { wood: 150 }, buildTime: 45, trains: ['bowman', 'improved_bowman', 'horse_archer'], researches: [], age: 'tool', mvp: true },
  stable: { id: 'stable', vnName: 'Chuồng ngựa', original: 'Stable', hp: 350, size: '3x3', cost: { wood: 150 }, buildTime: 50, trains: ['scout', 'cavalry', 'war_elephant', 'chariot'], researches: [], age: 'tool', mvp: true },
  siege_workshop: { id: 'siege_workshop', vnName: 'Xưởng chế tạo', original: 'Siege Workshop', hp: 400, size: '3x3', cost: { wood: 200 }, buildTime: 60, trains: ['stone_thrower', 'catapult', 'ballista'], researches: [], age: 'bronze', mvp: false },
  academy: { id: 'academy', vnName: 'Võ đường', original: 'Academy', hp: 400, size: '3x3', cost: { wood: 200 }, buildTime: 60, trains: ['hoplite', 'phalanx', 'centurion'], researches: [], age: 'bronze', mvp: false },
  temple: { id: 'temple', vnName: 'Đền thờ', original: 'Temple', hp: 400, size: '3x3', cost: { wood: 200 }, buildTime: 60, trains: ['priest'], researches: [], age: 'bronze', mvp: false },
  market: { id: 'market', vnName: 'Chợ quê', original: 'Market', hp: 350, size: '3x3', cost: { wood: 150 }, buildTime: 50, trains: [], researches: [], age: 'bronze', mvp: false },
  government_center: { id: 'government_center', vnName: 'Dinh quan', original: 'Government Center', hp: 600, size: '4x4', cost: { wood: 175 }, buildTime: 80, trains: [], researches: ['woodcutting', 'gold_mining', 'stone_mining', 'leather_armor', 'saw', 'plow', 'wheel', 'bronze_shield', 'irrigation', 'iron_shield', 'ballistics', 'engineering'], age: 'iron', mvp: false },
  watch_tower: { id: 'watch_tower', vnName: 'Chòi canh', original: 'Watch Tower', hp: 100, size: '1x1', cost: { stone: 150 }, buildTime: 40, trains: [], researches: [], age: 'stone', mvp: true },
  sentry_tower: { id: 'sentry_tower', vnName: 'Tháp canh', original: 'Sentry Tower', hp: 150, size: '1x1', cost: { stone: 150 }, buildTime: 45, trains: [], researches: [], age: 'bronze', mvp: false },
  guard_tower: { id: 'guard_tower', vnName: 'Lầu canh', original: 'Guard Tower', hp: 200, size: '1x1', cost: { stone: 150 }, buildTime: 50, trains: [], researches: [], age: 'iron', mvp: false },
  ballista_tower: { id: 'ballista_tower', vnName: 'Tháp nỏ', original: 'Ballista Tower', hp: 200, size: '2x2', cost: { stone: 150 }, buildTime: 60, trains: [], researches: [], age: 'iron', mvp: false },
  small_wall: { id: 'small_wall', vnName: 'Lũy đất', original: 'Small Wall', hp: 200, size: '1x1', cost: { stone: 5 }, buildTime: 5, trains: [], researches: [], age: 'tool', mvp: true },
  medium_wall: { id: 'medium_wall', vnName: 'Tường gạch', original: 'Medium Wall', hp: 400, size: '1x1', cost: { stone: 5 }, buildTime: 8, trains: [], researches: [], age: 'bronze', mvp: false },
  fortification: { id: 'fortification', vnName: 'Thành lũy', original: 'Fortification', hp: 600, size: '1x1', cost: { stone: 5 }, buildTime: 10, trains: [], researches: [], age: 'iron', mvp: false },
  wonder: { id: 'wonder', vnName: 'Đền Hùng', original: 'Wonder', hp: 1000, size: '6x6', cost: { wood: 1000, gold: 1000, stone: 1000 }, buildTime: 300, trains: [], researches: [], age: 'iron', mvp: false },
};
