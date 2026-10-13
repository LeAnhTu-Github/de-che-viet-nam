// Định nghĩa entity trong simulation — Phase 2a.
// Tọa độ (x, y) tính theo đơn vị tile (số thực), KHÔNG phải index tile nguyên.

import type { ResourceType, UnitState } from './types';

/** Loại entity trong sim. */
export type EntityKind = 'unit' | 'building' | 'resource';

/** Unit di động: dân, lính, voi chiến... */
export interface UnitEntity {
  kind: 'unit';
  id: number;
  playerId: number;
  defId: string; // id trong UNITS
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** Phase 4a: idle | moving | gathering | returning | building (+ attacking/dead sau). */
  state: UnitState;
  targetX: number; // điểm đến khi state = 'moving' | 'returning'
  targetY: number;
  speed: number; // tile/giây, lấy từ UNITS
  // --- Phase 4a: kinh tế ---
  /** Loại tài nguyên đang mang (null = tay không). */
  carryType: ResourceType | null;
  /** Lượng tài nguyên đang mang (đơn vị, tối đa CARRY_CAP). */
  carryAmount: number;
  /** Node tài nguyên đang khai thác (nhiệm vụ gather), null = không có. */
  targetNodeId: number | null;
  /** Nhà đang xây (nhiệm vụ build), null = không có. */
  buildTargetId: number | null;
  // --- Phase 5a: chiến đấu ---
  /** Đếm ngược tới đòn đánh tiếp theo (giây, cộng dồn khi trong tầm). */
  attackTimer: number;
  /** Id mục tiêu đang tấn công (null = không có). */
  targetId: number | null;
  /** true = đang attack-move: tự đánh địch trong tầm nhìn khi đi/đứng. */
  attackMove: boolean;
  /** Đích attack-move (giữ riêng vì targetX/Y bị ghi đè khi đuổi địch). */
  attackMoveX: number;
  /** Đích attack-move (giữ riêng vì targetX/Y bị ghi đè khi đuổi địch). */
  attackMoveY: number;
}

/** Nhà: x, y là TÂM (tile). */
export interface BuildingEntity {
  kind: 'building';
  id: number;
  playerId: number;
  defId: string; // id trong BUILDINGS
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  size: number; // cạnh nhà (tile), parse từ def.size dạng 'WxH'
  // --- Phase 4a: xây dựng + train ---
  /** Tiến độ xây 0..1 (spawn trực tiếp = 1). */
  progress: number;
  /** true khi xây xong (mới train/drop-off được). */
  complete: boolean;
  /** Hàng đợi train: phần tử đầu đang chạy, progress 0..1. */
  trainQueue: Array<{ unitDefId: string; progress: number }>;
  // --- Phase 5a: nghiên cứu ---
  /** Hàng đợi research: phần tử đầu đang chạy, progress 0..1. */
  researchQueue: Array<{ techId: string; progress: number }>;
}

/** Node tài nguyên trung lập: cây, mỏ, bụi quả, thú rừng, cá... */
export interface ResourceNodeEntity {
  kind: 'resource';
  id: number;
  defId: string; // id trong RESOURCES
  x: number;
  y: number;
  amount: number; // trữ lượng còn lại
}

/** Mọi entity trong trận. */
export type Entity = UnitEntity | BuildingEntity | ResourceNodeEntity;

/** Type guard tiện ích cho các system. */
export function isUnit(e: Entity): e is UnitEntity {
  return e.kind === 'unit';
}

/** Type guard tiện ích cho các system. */
export function isBuilding(e: Entity): e is BuildingEntity {
  return e.kind === 'building';
}

/** Type guard tiện ích cho các system. */
export function isResourceNode(e: Entity): e is ResourceNodeEntity {
  return e.kind === 'resource';
}
