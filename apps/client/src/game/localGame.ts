/**
 * localGame.ts — Phase 2b: điều khiển trận CHƠI ĐƠN local (multiplayer ở Phase 6).
 *
 * ── Interface đã chốt với worker sim (packages/sim/src/entities.ts) ──
 *   new Game()
 *   game.setupMatch(seed: string, names: string[])
 *   game.entities: Map<number, Entity>
 *     Entity:      { kind, id, playerId, x, y, hp, maxHp }
 *     UnitEntity:  Entity & { defId, state }
 *   game.addCommand({ type: 'move', playerId, unitIds, x, y })
 *   game.update() — 1 tick (fixed 1/20s)
 *
 * GIẢ ĐỊNH QUAN TRỌNG: x/y của Entity là WORLD PX (đơn vị renderer dùng).
 * Nếu worker sim chốt x/y theo tile, nhân TILE_SIZE tại syncToRenderer().
 *
 * TÌNH TRẠNG: sim thật chưa có entities.ts/setupMatch nên file này kèm
 * LocalSimShim — game tạm implement đúng 100% interface trên (spawn đủ
 * 50+ unit phe người + hệ di chuyển + tách đội hình) để chơi/test được ngay.
 * Khi sim xong: new LocalGameController(seed, new Game()) — KHÔNG sửa gì khác.
 */
import type { MoveCommand, Command, PlayerState, ResourceBag, ResourceType, UnitState, GameEvent } from '@aoe-vn/sim';
import { AGES, RuleAI, AI_LABEL, type AIDifficulty } from '@aoe-vn/sim';
export type { AIDifficulty };
import { TILE_SIZE } from './map';
import type { EntityView } from './entityView';
import type { GameRenderer } from './renderer';
import { SelectionManager } from './selection';
import { syncEntitiesToRenderer, defIdOf } from './entitySync';
import { pickEntity } from './picking';

/* ───────────────── Interface chốt với worker sim ───────────────── */

export type SimEntityKind = 'unit' | 'building' | 'resource';

/** Entity tối thiểu theo spec — x/y tính bằng world px. */
export interface SimEntity {
  kind: SimEntityKind;
  id: number;
  /** 0 = người chơi, 1 = máy, -1 = trung lập (tài nguyên). */
  playerId: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
}

/** Unit theo spec: thêm defId + state. */
export interface SimUnitEntity extends SimEntity {
  kind: 'unit';
  /** id trong UNITS của sim, vd 'villager_m', 'short_swordsman'. */
  defId: string;
  state: UnitState;
}

export function isSimUnit(e: SimEntity): e is SimUnitEntity {
  return e.kind === 'unit';
}

/** Lệnh move theo spec = MoveCommand của sim + playerId. */
export interface SimMoveCommand extends MoveCommand {
  playerId: number;
}

/**
 * Lệnh train — INTERFACE CHỐT với worker sim (Phase 4b):
 * buildingId = entity id của nhà đang đứng, unitDefId = id trong UNITS.
 */
export interface SimTrainCommand {
  type: 'train';
  playerId: number;
  buildingId: number;
  unitDefId: string;
}

/**
 * Lệnh build — INTERFACE CHỐT với worker sim (Phase 4b):
 * buildingId = defId trong BUILDINGS; x/y tính bằng world px (adapter đổi sang tile).
 */
export interface SimBuildCommand {
  type: 'build';
  playerId: number;
  unitIds: number[];
  buildingId: string;
  x: number;
  y: number;
  /** Có → xây tiếp công trường đã có thay vì dựng nhà mới. */
  siteId?: number;
}

/** Lệnh attack — click phải vào địch (khớp AttackCommand của sim). */
export interface SimAttackCommand {
  type: 'attack';
  playerId: number;
  unitIds: number[];
  targetId: number;
}

/**
 * Lệnh attack-move — INTERFACE CHỐT với worker sim (Phase 5b):
 * x/y tính bằng world px (adapter đổi sang tile).
 */
export interface SimAttackMoveCommand {
  type: 'attackmove';
  playerId: number;
  unitIds: number[];
  x: number;
  y: number;
}

/**
 * Lệnh research — INTERFACE CHỐT với worker sim (Phase 5b):
 * buildingId = entity id của nhà đang nghiên cứu, techId = id trong TECHS.
 */
export interface SimResearchCommand {
  type: 'research';
  playerId: number;
  buildingId: number;
  techId: string;
}

/**
 * Lệnh gather — Phase 7 (khớp GatherCommand của sim):
 * targetId = entity id của node tài nguyên, resource = loại tài nguyên.
 */
export interface SimGatherCommand {
  type: 'gather';
  playerId: number;
  unitIds: number[];
  targetId: number;
  resource: ResourceType;
}

/** Lệnh stop — phím S (giống AoE): unit đứng yên, hủy nhiệm vụ. */
export interface SimStopCommand {
  type: 'stop';
  playerId: number;
  unitIds: number[];
}

/** Lệnh delete — phím Delete (giống AoE): phá unit/nhà của chính mình. */
export interface SimDeleteCommand {
  type: 'delete';
  playerId: number;
  unitIds: number[];
}

/** Mọi lệnh client gửi xuống sim. */
export type SimCommand =
  | SimMoveCommand
  | SimTrainCommand
  | SimBuildCommand
  | SimAttackCommand
  | SimAttackMoveCommand
  | SimResearchCommand
  | SimGatherCommand
  | SimStopCommand
  | SimDeleteCommand;

/** Projectile của sim (đạn bay) — x/y tính bằng world px. */
export interface SimProjectile {
  id: number;
  x: number;
  y: number;
}

/** Fog of war — INTERFACE CHỐT với worker sim (Phase 5b). */
export interface VisionMap {
  /** tile đã từng khám phá (1) / chưa (0). */
  explored: Uint8Array;
  /** tile đang nhìn thấy ngay lúc này (1) / không (0). */
  visible: Uint8Array;
  w: number; // số tile ngang
  h: number; // số tile dọc
}

/** Port tối thiểu mà LocalGameController cần ở game sim. */
export interface SimGamePort {
  readonly entities: Map<number, SimEntity>;
  setupMatch(seed: string, names: string[]): void;
  addCommand(cmd: SimCommand): void;
  update(): void;
  /** Trạng thái công khai của người chơi (tài nguyên, pop) — adapter đọc từ Game.players. */
  getPlayerState(pid: number): PlayerState | undefined;
  /**
   * Fog of war (Phase 5b) — sim thật expose thì dùng, chưa có thì undefined
   * → fog tắt, game vẫn chơi được.
   */
  getVision?(pid: number): VisionMap | undefined;
  /**
   * Đạn bay (Phase 5b) — sim thật expose mảng projectiles (x/y tile) thì
   * adapter đổi sang world px; chưa có thì trả [].
   */
  getProjectiles?(): SimProjectile[];
  /**
   * Event sim (Phase 5): đọc rồi clear — dùng cho banner lên đời.
   * Sim thật expose `events: GameEvent[]`; chưa có → [].
   */
  drainEvents?(): GameEvent[];
  /**
   * Game thật bên dưới adapter (Phase 7: AI máy dùng). Net mode không có.
   */
  getRawGame?(): unknown;
}

/* ── RealGameAdapter: bọc Game thật (tọa độ tile) sang SimGamePort (world px) ── */
import { Game as RealGame } from '@aoe-vn/sim';

class RealGameAdapter implements SimGamePort {
  private inner = new RealGame('adapter');

  /** Map entity đã convert tile→px (build mới mỗi lần đọc — vài trăm entity/frame, rẻ). */
  get entities(): Map<number, SimEntity> {
    const out = new Map<number, SimEntity>();
    for (const e of this.inner.entities.values()) {
      out.set(e.id, { ...e, x: e.x * TILE_SIZE, y: e.y * TILE_SIZE } as SimEntity);
    }
    return out;
  }

  setupMatch(seed: string, names: string[]): void {
    this.inner.setupMatch(seed, names);
  }

  addCommand(cmd: SimCommand): void {
    // lệnh từ client dùng world px → đổi sang tile cho sim (chỉ lệnh có x/y)
    const converted =
      cmd.type === 'move' || cmd.type === 'build' || cmd.type === 'attackmove'
        ? { ...cmd, x: cmd.x / TILE_SIZE, y: cmd.y / TILE_SIZE }
        : { ...cmd };
    // Ép kiểu tạm: worker sim đang cập nhật types.ts theo interface chốt
    // ({type:'train', playerId, buildingId, unitDefId} / {type:'build', playerId, ...}
    //  / {type:'attackmove', playerId, unitIds, x, y} / {type:'research', playerId, buildingId, techId}).
    this.inner.addCommand(converted as unknown as Command);
  }

  getPlayerState(pid: number): PlayerState | undefined {
    return this.inner.players[pid];
  }

  /** Trả về Game thật (Phase 7: AI máy). */
  getRawGame(): unknown {
    return this.inner;
  }

  /**
   * Fog of war: sim thật expose getVision thì dùng; chưa có → undefined (fog tắt).
   * Defensive: đọc qua cast để không vỡ type khi sim chưa implement.
   */
  getVision(pid: number): VisionMap | undefined {
    const g = this.inner as unknown as { getVision?: (id: number) => VisionMap | undefined };
    return typeof g.getVision === 'function' ? g.getVision(pid) : undefined;
  }

  /**
   * Projectile: sim thật expose mảng `projectiles` (x/y tile) thì đổi sang
   * world px; chưa có → [] (không vẽ gì, game vẫn chạy).
   */
  getProjectiles(): SimProjectile[] {
    const g = this.inner as unknown as {
      projectiles?: Array<{ id: number; x: number; y: number }>;
    };
    const arr = Array.isArray(g.projectiles) ? g.projectiles : [];
    return arr.map((p) => ({ id: p.id, x: p.x * TILE_SIZE, y: p.y * TILE_SIZE }));
  }

  /** Đọc events sim rồi clear (banner lên đời...). */
  drainEvents(): GameEvent[] {
    const ev = this.inner.events as GameEvent[];
    const out = [...ev];
    ev.length = 0;
    return out;
  }

  update(): void {
    this.inner.update();
  }
}

/* (Đã xóa LocalSimShim — dùng RealGameAdapter với Game thật) */

const TICK_DT = 1 / 20;


/* ───────────────── LocalGameController ───────────────── */

export class LocalGameController {
  readonly selection = new SelectionManager();
  /** Phe người chơi local. */
  readonly humanPlayerId = 0;
  readonly game: SimGamePort;

  private readonly views = new Map<number, EntityView>();
  /** Entity đang bị rê chuột lên (GameView gán). */
  hoverId: number | null = null;
  private accum = 0;

  /**
   * @param seed seed trận (string).
   * @param game game sim — mặc định dùng Game thật qua RealGameAdapter.
   */
  constructor(
    readonly seed: string,
    game?: SimGamePort,
  ) {
    this.game = game ?? new RealGameAdapter();
  }

  /** Dựng trận: gọi game.setupMatch(seed, ['Người chơi', 'Máy']). */
  setup(): void {
    this.game.setupMatch(this.seed, ['Người chơi', 'Máy']);
    this.views.clear();
    this.selection.clear();
    this.accum = 0;
  }

  /**
   * Fixed-step accumulator: gọi mỗi frame với dt thực (giây),
   * chạy game.update() đúng nhịp 20 tick/s.
   */
  stepAccum(dtReal: number): void {
    if (this.paused) return; // phím P/F3: dừng sim local
    this.accum += Math.min(dtReal, 0.25);
    let n = 0;
    while (this.accum >= TICK_DT && n < 5) {
      this.game.update();
      // AI máy (Phase 7): ra quyết định trên Game thật sau mỗi tick.
      if (this.ai) {
        const raw = this.game.getRawGame?.();
        if (raw) this.ai.update(raw as RealGame, 1);
      }
      this.accum -= TICK_DT;
      n++;
    }
    if (n === 5) this.accum = 0; // tránh spiral of death khi lag nặng
  }

  /** Bật/tắt AI máy cho phe 1 (local mode). null = tắt. */
  setAI(diff: AIDifficulty | null): void {
    this.ai = diff ? new RuleAI(diff) : null;
    this.aiDifficulty = diff;
  }

  get aiDifficultyName(): string {
    return this.aiDifficulty ? AI_LABEL[this.aiDifficulty] : 'Tắt';
  }

  /** Winner của sim local (null = chưa kết thúc). */
  getWinner(): number | null {
    const raw = this.game.getRawGame?.() as { winner?: number | null } | undefined;
    return raw?.winner ?? null;
  }

  private ai: RuleAI | null = null;
  private aiDifficulty: AIDifficulty | null = null;

  /**
   * Đồng bộ state sim → renderer mỗi frame (dùng helper dùng chung với net mode).
   */
  syncToRenderer(renderer: GameRenderer): void {
    let projectiles: SimProjectile[] = [];
    try {
      projectiles = this.game.getProjectiles?.() ?? [];
    } catch {
      /* defensive: adapter nào không có getProjectiles thì bỏ qua */
    }
    syncEntitiesToRenderer(this.views, renderer, this.game.entities, this.selection, projectiles, this.hoverId);
  }

  /** Entities hiện tại — cho interface GameController dùng chung với net mode. */
  get entities(): Map<number, SimEntity> {
    return this.game.entities;
  }

  /** Fog of war — ủy quyền cho sim (Phase 5b); chưa có → undefined (fog tắt). */
  getVision(pid: number): VisionMap | undefined {
    try {
      return this.game.getVision?.(pid);
    } catch {
      return undefined;
    }
  }

  /** Projectile — ủy quyền cho sim; chưa có → []. */
  getProjectiles(): SimProjectile[] {
    try {
      return this.game.getProjectiles?.() ?? [];
    } catch {
      return [];
    }
  }

  /** Ra lệnh move cho các unit đang chọn của phe người tới world (x, y). */
  issueMove(x: number, y: number): void {
    const owned = new Set(this.unitsOfPlayer(this.humanPlayerId).map((u) => u.id));
    const ids = [...this.selection.selected].filter((id) => owned.has(id));
    if (ids.length === 0) return;
    this.game.addCommand({ type: 'move', playerId: this.humanPlayerId, unitIds: ids, x, y });
  }

  /** Tất cả dân (villager) đang được chọn của phe người. */
  selectedVillagers(): SimUnitEntity[] {
    const out: SimUnitEntity[] = [];
    for (const id of this.selection.selected) {
      const e = this.game.entities.get(id);
      if (
        e &&
        e.kind === 'unit' &&
        e.playerId === this.humanPlayerId &&
        isSimUnit(e) &&
        e.defId.includes('villager')
      ) {
        out.push(e);
      }
    }
    return out;
  }

  /**
   * Ra lệnh xây nhà cho các dân đang chọn của phe người tại world (x, y) px.
   * Adapter tự đổi px → tile theo interface chốt của sim.
   */
  issueBuild(buildingDefId: string, x: number, y: number): void {
    const ids = this.selectedVillagers().map((v) => v.id);
    if (ids.length === 0) return;
    this.game.addCommand({
      type: 'build',
      playerId: this.humanPlayerId,
      unitIds: ids,
      buildingId: buildingDefId,
      x,
      y,
    });
  }

  /** Ra lệnh train 1 unit tại nhà (entity id) theo interface chốt của sim. */
  trainUnit(buildingId: number, unitDefId: string): void {
    this.game.addCommand({
      type: 'train',
      playerId: this.humanPlayerId,
      buildingId,
      unitDefId,
    });
  }

  /**
   * Ra lệnh attack-move cho các unit quân sự đang chọn của phe người tới world (x, y).
   * Quân sự = defId không chứa 'villager' (theo spec Phase 5b).
   */
  issueAttackMove(x: number, y: number): void {
    const ids = this.selectedMilitary().map((u) => u.id);
    if (ids.length === 0) return;
    this.game.addCommand({ type: 'attackmove', playerId: this.humanPlayerId, unitIds: ids, x, y });
  }

  /** Ra lệnh khai thác node tài nguyên (Phase 7: client trước đây chưa từng gửi!). */
  issueGather(targetId: number, resource: ResourceType): void {
    const ids = this.selectedVillagers().map((u) => u.id);
    if (ids.length === 0) return;
    this.game.addCommand({ type: 'gather', playerId: this.humanPlayerId, unitIds: ids, targetId, resource });
  }

  /** Click phải vào địch: mọi unit đang chọn của phe mình tấn công mục tiêu. */
  issueAttack(targetId: number): void {
    const owned = new Set(this.unitsOfPlayer(this.humanPlayerId).map((u) => u.id));
    const ids = [...this.selection.selected].filter((id) => owned.has(id));
    if (ids.length === 0) return;
    this.game.addCommand({ type: 'attack', playerId: this.humanPlayerId, unitIds: ids, targetId });
  }

  /** Click phải vào nhà đang xây của mình: dân đang chọn tới xây tiếp. */
  issueBuildSite(siteId: number): void {
    const site = this.entities.get(siteId);
    const ids = this.selectedVillagers().map((v) => v.id);
    if (!site || ids.length === 0) return;
    this.game.addCommand({
      type: 'build',
      playerId: this.humanPlayerId,
      unitIds: ids,
      buildingId: defIdOf(site),
      x: site.x,
      y: site.y,
      siteId,
    });
  }

  /** Ra lệnh dừng (phím S): các unit đang chọn của phe người đứng yên, hủy nhiệm vụ. */
  issueStop(): void {
    const owned = new Set(this.unitsOfPlayer(this.humanPlayerId).map((u) => u.id));
    const ids = [...this.selection.selected].filter((id) => owned.has(id));
    if (ids.length === 0) return;
    this.game.addCommand({ type: 'stop', playerId: this.humanPlayerId, unitIds: ids });
  }

  /** Ra lệnh xóa (phím Delete): phá unit/nhà đang chọn của phe người. */
  issueDelete(): void {
    const ids = [...this.selection.selected].filter((id) => {
      const e = this.game.entities.get(id);
      return !!e && e.playerId === this.humanPlayerId && (e.kind === 'unit' || e.kind === 'building');
    });
    if (ids.length === 0) return;
    this.game.addCommand({ type: 'delete', playerId: this.humanPlayerId, unitIds: ids });
    this.selection.clear();
  }

  /** Tạm dừng sim local (phím P/F3) — stepAccum bỏ qua khi paused. */
  paused = false;

  /** Ra lệnh research tech tại nhà (entity id) theo interface chốt của sim. */
  issueResearch(buildingId: number, techId: string): void {
    this.game.addCommand({
      type: 'research',
      playerId: this.humanPlayerId,
      buildingId,
      techId,
    });
  }

  /**
   * Danh sách tech id đã nghiên cứu của 1 phe — sim thật expose `techs` trên
   * PlayerState thì đọc, chưa có thì [] (research UI hiện tất cả).
   */
  playerTechs(pid: number): string[] {
    const st = this.game.getPlayerState(pid) as (PlayerState & { techs?: unknown }) | undefined;
    return Array.isArray(st?.techs) ? (st.techs as string[]) : [];
  }

  /** Thông tin banner lên đời: đọc event ageUp từ sim (đã clear), kèm tên + flavor. */
  drainAgeUpEvents(): { playerId: number; ageName: string; flavor: string }[] {
    const out: { playerId: number; ageName: string; flavor: string }[] = [];
    const evs = this.game.drainEvents?.() ?? [];
    for (const e of evs) {
      if (e.type !== 'ageUp') continue;
      const age = AGES.find((a) => a.id === e.newAge);
      out.push({
        playerId: e.playerId,
        ageName: age?.vnName ?? e.newAge,
        flavor: age?.flavor ?? '',
      });
    }
    return out;
  }

  /**
   * Tất cả unit quân sự (không phải dân) đang được chọn của phe người.
   * Military = defId không chứa 'villager'.
   */
  selectedMilitary(): SimUnitEntity[] {
    const out: SimUnitEntity[] = [];
    for (const id of this.selection.selected) {
      const e = this.game.entities.get(id);
      if (
        e &&
        e.kind === 'unit' &&
        e.playerId === this.humanPlayerId &&
        isSimUnit(e) &&
        !e.defId.includes('villager')
      ) {
        out.push(e);
      }
    }
    return out;
  }

  /** Nhà duy nhất của phe người đang được chọn (count === 1). */
  selectedBuilding(): SimEntity | undefined {
    if (this.selection.count !== 1) return undefined;
    const id = [...this.selection.selected][0];
    const e = this.game.entities.get(id);
    if (e && e.kind === 'building' && e.playerId === this.humanPlayerId) return e;
    return undefined;
  }

  /** Tài nguyên + pop của phe người (đọc qua adapter → Game.players). */
  humanResources(): { resources: ResourceBag; pop: number; popCap: number } {
    const st = this.game.getPlayerState(this.humanPlayerId);
    return {
      resources: st?.resources ?? { wood: 0, food: 0, gold: 0, stone: 0 },
      pop: st?.pop ?? 0,
      popCap: st?.popCap ?? 0,
    };
  }

  /** Tất cả unit của 1 phe. */
  unitsOfPlayer(pid: number): SimEntity[] {
    const out: SimEntity[] = [];
    for (const e of this.game.entities.values()) {
      if (e.kind === 'unit' && e.playerId === pid) out.push(e);
    }
    return out;
  }

  /** Entity (unit/nhà/tài nguyên) dưới con trỏ — bắt theo hình sprite. */
  entityAt(x: number, y: number): SimEntity | undefined {
    return pickEntity(this.game.entities.values(), x, y);
  }
}
