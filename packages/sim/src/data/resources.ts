// Định nghĩa RESOURCE NODES — SỐ LIỆU placeholder kiểu AoE1, cân bằng sau ở Phase 4.
// Tên tiếng Việt lấy từ aoe-vietnam-mapping.json.
// Thú săn (nai/voi/hổ) là entity di động (mobile: true), còn lại là node tĩnh.

import type { ResourceType } from '../types';

export interface ResourceNodeDef {
  id: string;
  vnName: string;      // tên Việt Nam (lớp vỏ)
  original: string;    // tên gốc AoE1 (tham chiếu cơ chế)
  resource: ResourceType; // loại tài nguyên khai thác được
  amount: number;      // tổng trữ lượng mỗi node/con
  gatherRate: number;  // đơn vị/giây mỗi dân
  mobile: boolean;     // true = thú di chuyển được, phải săn
  dangerous: boolean;  // true = thú tấn công lại dân (hổ)
  states: string[];    // trạng thái sprite cần vẽ
}

export const RESOURCES: Record<string, ResourceNodeDef> = {
  tree: {
    id: 'tree', vnName: 'Tre/Cây gỗ', original: 'Tree',
    resource: 'wood', amount: 100, gatherRate: 0.5,
    mobile: false, dangerous: false,
    states: ['full', 'half', 'stump'],
  },
  berry: {
    id: 'berry', vnName: 'Bụi quả rừng', original: 'Berry Bush',
    resource: 'food', amount: 150, gatherRate: 0.4,
    mobile: false, dangerous: false,
    states: ['full', 'empty'],
  },
  gold_mine: {
    id: 'gold_mine', vnName: 'Mỏ vàng', original: 'Gold Mine',
    resource: 'gold', amount: 500, gatherRate: 0.4,
    mobile: false, dangerous: false,
    states: ['rich', 'medium', 'poor'],
  },
  stone_mine: {
    id: 'stone_mine', vnName: 'Mỏ đá', original: 'Stone Mine',
    resource: 'stone', amount: 400, gatherRate: 0.35,
    mobile: false, dangerous: false,
    states: ['rich', 'medium', 'poor'],
  },
  gazelle: {
    id: 'gazelle', vnName: 'Nai rừng', original: 'Gazelle',
    resource: 'food', amount: 150, gatherRate: 0.4,
    mobile: true, dangerous: false,
    states: ['idle', 'walk', 'die'],
  },
  wild_elephant: {
    id: 'wild_elephant', vnName: 'Voi rừng', original: 'Elephant',
    resource: 'food', amount: 400, gatherRate: 0.4,
    mobile: true, dangerous: false,
    states: ['idle', 'walk', 'die'],
  },
  lion: {
    id: 'lion', vnName: 'Hổ', original: 'Lion',
    resource: 'food', amount: 100, gatherRate: 0.4,
    mobile: true, dangerous: true, // hổ tấn công dân tới gần
    states: ['idle', 'walk', 'attack', 'die'],
  },
  fish: {
    id: 'fish', vnName: 'Cá sông', original: 'Fish',
    resource: 'food', amount: 200, gatherRate: 0.4,
    mobile: false, dangerous: false,
    states: ['swim'],
  },
};

/** Ruộng lúa là building (đặt bởi dân), không phải node tự nhiên — xem BUILDINGS.farm. */
export const RESOURCE_IDS = Object.keys(RESOURCES);
