// Kiểu dữ liệu dùng chung cho simulation — không phụ thuộc DOM/WebGL.

/** Tọa độ 2D (đơn vị: tile). */
export interface Vec2 {
  x: number;
  y: number;
}

/** ID duy nhất của một entity trong trận. */
export type EntityId = number;

/** ID người chơi trong trận (0..n-1). */
export type PlayerId = number;

/** 4 loại tài nguyên chuẩn AoE. */
export type ResourceType = 'wood' | 'food' | 'gold' | 'stone';

/** Trạng thái của một unit. */
export type UnitState =
  | 'idle'
  | 'moving'
  | 'attacking'
  | 'gathering'
  | 'returning'
  | 'building'
  | 'dead';

/** Túi tài nguyên của người chơi. */
export type ResourceBag = Record<ResourceType, number>;

/** Lệnh di chuyển: click phải / move. */
export interface MoveCommand {
  type: 'move';
  playerId: PlayerId; // người chơi gửi lệnh — sim validate quyền sở hữu unit
  unitIds: EntityId[];
  x: number;
  y: number;
}

/** Lệnh tấn công mục tiêu. */
export interface AttackCommand {
  type: 'attack';
  unitIds: EntityId[];
  targetId: EntityId;
}

/** Lệnh attack-move: đi tới (x, y), tự tấn công địch trong tầm nhìn. */
export interface AttackMoveCommand {
  type: 'attackmove';
  playerId: PlayerId; // người chơi gửi lệnh — sim validate quyền sở hữu unit
  unitIds: EntityId[];
  x: number;
  y: number;
}

/** Lệnh nghiên cứu công nghệ (kể cả lên đời) tại một nhà. */
export interface ResearchCommand {
  type: 'research';
  playerId: PlayerId; // người chơi gửi lệnh — validate sở hữu nhà + trừ tiền
  buildingId: EntityId; // entity id của nhà đang đứng
  techId: string; // id trong TECHS ('age_tool' | 'age_bronze' | 'age_iron' = lên đời)
}

/** Lệnh dân đi khai thác tài nguyên. */
export interface GatherCommand {
  type: 'gather';
  playerId: PlayerId; // người chơi gửi lệnh — sim validate quyền sở hữu unit
  unitIds: EntityId[];
  targetId: EntityId; // id của cây/mỏ/bụi quả...
  resource: ResourceType;
}

/** Lệnh xây nhà. */
export interface BuildCommand {
  type: 'build';
  playerId: PlayerId; // người chơi gửi lệnh — tiền trừ từ người này
  unitIds: EntityId[]; // dân xây
  buildingId: string; // id trong BUILDINGS
  x: number;
  y: number;
}

/** Lệnh train unit / research tech tại một nhà. */
export interface TrainCommand {
  type: 'train';
  playerId: PlayerId; // người chơi gửi lệnh — validate sở hữu nhà + trừ tiền
  buildingId: EntityId; // entity id của nhà đang đứng
  unitDefId: string; // id trong UNITS
}

/** Mọi lệnh player có thể gửi — server validate rồi mới đưa vào sim. */
export type Command =
  | MoveCommand
  | AttackCommand
  | AttackMoveCommand
  | GatherCommand
  | BuildCommand
  | TrainCommand
  | ResearchCommand;

/** Event sim phát cho client (client đọc rồi clear). */
export interface AgeUpEvent {
  type: 'ageUp';
  playerId: PlayerId;
  newAge: string; // AgeId
}

/** Mọi event sim có thể phát trong 1 tick. */
export type GameEvent = AgeUpEvent;
