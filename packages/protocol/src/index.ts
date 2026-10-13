// Giao thức message client <-> server. Dùng chung 2 phía để khỏi lệch.

import type { Command, EntityId, PlayerId, Vec2 } from '@aoe-vn/sim';

// ---------- Client -> Server ----------

/** Xin vào / tạo phòng. */
export interface JoinMessage {
  kind: 'join';
  playerName: string;
  roomCode?: string; // không có = quick match / tạo mới
}

/** Gửi 1 lệnh game (di chuyển, đánh, xây...). */
export interface CommandMessage {
  kind: 'command';
  command: Command;
  clientTick: number; // tick client đang thấy (để server đối chiếu)
}

/** Chat trong lobby/trận. */
export interface ChatMessage {
  kind: 'chat';
  text: string;
}

/** Xin pause/resume trận (phím P/F3) — server broadcast 'paused'/'resumed'. */
export interface PauseMessage {
  kind: 'pause';
  paused: boolean;
}

export type ClientMessage = JoinMessage | CommandMessage | ChatMessage | PauseMessage;

// ---------- Server -> Client ----------

/** Thông tin entity thay đổi (delta) — Phase 6 gửi 15 lần/giây. */
export interface EntityDelta {
  id: EntityId;
  pos?: Vec2;
  hp?: number;
  removed?: boolean;
}

/** Snapshot/delta state từ server. */
export interface SnapshotMessage {
  kind: 'snapshot';
  tick: number;
  deltas: EntityDelta[];
}

/** Kết quả join: id player + seed trận. */
export interface WelcomeMessage {
  kind: 'welcome';
  playerId: PlayerId;
  seed: string;
}

/** Chat broadcast. */
export interface ChatBroadcast {
  kind: 'chat';
  from: string;
  text: string;
}

/** Trận kết thúc. */
export interface GameOverMessage {
  kind: 'gameover';
  winner: PlayerId;
}

// ---------- Phase 6a: server authoritative (format CHỐT) ----------

/**
 * 1 entity trong snapshot.
 * k: 0 = unit, 1 = building, 2 = resource node
 * p: playerId của chủ (−1 = node tài nguyên trung lập)
 * d: index trong dict defId (gửi 1 lần ở InitMsg)
 * s: state của unit (building/resource = '')
 */
export interface SnapEntity {
  i: number;
  k: 0 | 1 | 2;
  p: number;
  d: number;
  x: number;
  y: number;
  hp: number;
  s: string;
}

/** Snapshot state server → client, 15Hz khi trận đang chạy. */
export interface SnapMsg {
  kind: 'snap';
  /** tick sim tại thời điểm snapshot */
  t: number;
  e: SnapEntity[];
  /** state công khai từng player (thứ tự playerId) */
  p: {
    r: [number, number, number, number]; // [wood, food, gold, stone]
    pop: number;
    cap: number;
    age: string;
  }[];
  /** đạn đang bay */
  pr: { i: number; x: number; y: number }[];
  /** event sim từ lần snapshot trước (server clear sau khi gửi) */
  ev: { type: string; playerId: number; newAge?: string }[];
  /** người thắng (null = trận chưa kết thúc) */
  w: number | null;
}

/** Gửi riêng cho từng client khi trận bắt đầu (hoặc rejoin). */
export interface InitMsg {
  kind: 'init';
  seed: string;
  /** dict defId: [...Object.keys(UNITS), ...Object.keys(BUILDINGS), ...Object.keys(RESOURCES)] */
  dict: string[];
  myPid: number;
  names: string[];
}

/** Lobby: danh sách người chơi hiện tại trong phòng. */
export interface LobbyMsg {
  kind: 'lobby';
  players: { name: string; playerId: number }[];
}

/** Trận bị tạm dừng (1 người out). */
export interface PausedMsg {
  kind: 'paused';
}

/** Trận chạy lại sau pause. */
export interface ResumedMsg {
  kind: 'resumed';
}

/** Đếm ngược trước khi trận bắt đầu. */
export interface CountdownMsg {
  kind: 'countdown';
  seconds: number;
}

export type ServerMessage =
  | SnapshotMessage
  | WelcomeMessage
  | ChatBroadcast
  | GameOverMessage
  | SnapMsg
  | InitMsg
  | LobbyMsg
  | PausedMsg
  | ResumedMsg
  | CountdownMsg;

