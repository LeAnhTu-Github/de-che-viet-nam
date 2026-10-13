// Game — simulation core, Phase 2a: entity + di chuyển thẳng + separation đơn giản.
// Chạy fixed timestep 20 tick/giây, deterministic tuyệt đối (không Math.random,
// mọi vòng lặp duyệt entity theo id tăng dần). Flow field để Phase 3.

import { generateMap, GameMap } from './mapgen';
import { FlowField, FlowFieldCache } from './flowfield';
import { UNITS } from './data/units';
import { BUILDINGS } from './data/buildings';
import { RESOURCES } from './data/resources';
import type {
  BuildingEntity,
  Entity,
  ResourceNodeEntity,
  UnitEntity,
} from './entities';
import type {
  AttackCommand,
  AttackMoveCommand,
  BuildCommand,
  Command,
  EntityId,
  GatherCommand,
  GameEvent,
  MoveCommand,
  PlayerId,
  ResearchCommand,
  ResourceBag,
  ResourceType,
  StopCommand,
  DeleteCommand,
  TrainCommand,
} from './types';
import { Rng } from './rng';
import { AGES, ageIndex, type AgeId } from './data/ages';
import {
  updateCombat,
  applyAttackCommand,
  applyAttackMoveCommand,
} from './systems/combat';
import type { Projectile } from './systems/combat';
import { updateResearch, applyResearchCommand } from './systems/research';
import { updateVision } from './systems/vision';
import { checkVictory } from './systems/victory';

/** Tần số sim: 20 tick/giây (chuẩn đã chốt). */
export const TICK_RATE = 20;
/** dt của 1 tick (giây). */
const DT = 1 / TICK_RATE;
/** Unit cách target < 0.3 tile thì coi như tới nơi → snap + idle. */
const ARRIVE_DIST = 0.3;
/** cost flow field tại ô < 0.5 (≈ đứng ngay trên ô đích) → tới nơi. */
const ARRIVE_COST = 0.5;
/** Chu kỳ probe kẹt: so vị trí hiện tại với cách đây N tick. */
const STUCK_PROBE_TICKS = 40;
/** Di chuyển < 0.5 tile trong 1 chu kỳ probe mà chưa tới → coi là kẹt. */
const STUCK_MIN_PROGRESS = 0.5;
/** 2 unit cách nhau < 0.4 tile thì bị đẩy tách ra (steering). */
const SEPARATION_DIST = 0.4;
/** Sức chứa túi tài nguyên của dân (đơn vị). */
const CARRY_CAP = 10;
/** Tốc độ xây: tiến độ/giây cho mỗi dân (1 dân xây xong trong 20s). */
const BUILD_RATE = 0.05;
/** Trần dân số tuyệt đối. */
const POP_CAP_MAX = 100;
/** Dân số cơ bản (chưa có nhà sàn). */
const POP_CAP_BASE = 5;
/** Mỗi nhà sàn hoàn thành cộng thêm bấy nhiêu dân số. */
const POP_PER_HOUSE = 5;
/**
 * Trọng số vector tách khi cộng vào hướng di chuyển (steering).
 * Cân bằng với vector field (|.|=1): unit dừng tiến vào khi w*(1-d/0.4) >= 1.
 * w=3 → spacing cân bằng đôi ~0.27 tile (đủ tách để không chồng lấn nặng,
 * vẫn đủ chặt để 200 unit nằm gọn trong bán kính 3 tile).
 */
const SEPARATION_WEIGHT = 3;

/** State công khai của một người chơi. */
export interface PlayerState {
  id: PlayerId;
  name: string;
  resources: ResourceBag;
  pop: number;
  popCap: number;
  // --- Phase 5a: thời đại + tech ---
  /** Thời đại hiện tại (khởi đầu = AGES[0]). */
  age: AgeId;
  /** Tech đã nghiên cứu xong. */
  techs: Set<string>;
  /** Cộng thẳng vào attack mỗi đòn (từ tech attackAdd). */
  attackBonus: number;
  /** Hệ số tốc độ khai thác theo loại tài nguyên (từ tech gatherMul). */
  gatherMul: Record<ResourceType, number>;
}

/** State công khai của một trận. */
export interface GameState {
  tick: number;
  entities: Map<EntityId, Entity>;
  players: PlayerState[];
}

/**
 * Game: vòng lặp simulation chạy fixed timestep.
 * Cùng code chạy ở server (authoritative) và client (dự đoán ở Phase 6).
 */
export class Game {
  readonly rng: Rng;
  /** Toàn bộ entity, key = id cấp tăng dần. */
  entities = new Map<number, Entity>();
  /** Id tiếp theo sẽ cấp. */
  nextId = 1;
  /** Người chơi trong trận. */
  players: PlayerState[] = [];
  /** Map của trận (null cho tới khi setupMatch được gọi). */
  map: GameMap | null = null;

  private tick = 0;
  private commandQueue: Command[] = [];
  /** Cache flow field theo ô đích (tối đa 32 field, LRU). */
  private flowCache = new FlowFieldCache();
  /** Theo dõi tiến triển di chuyển của từng unit (key = unit id). */
  private moveTracks = new Map<number, MoveTrack>();
  /**
   * Đích trả tài nguyên của unit đang 'returning' (key = unit id,
   * value = building id). Lưu ngoài entity để giữ interface gọn.
   */
  private returnTargets = new Map<number, number>();
  /** Số lần unit kẹt cứng phải cho idle (báo kẹt, deterministic). */
  stuckReports = 0;
  // --- Phase 5a ---
  /** Đạn đang bay (combat system quản lý). */
  projectiles: Projectile[] = [];
  /** Người thắng (null = trận chưa kết thúc). */
  winner: number | null = null;
  /** Event sim phát cho client (client đọc rồi clear). */
  events: GameEvent[] = [];
  /** Fog of war: explored/visible theo player (vision.ts cập nhật mỗi 5 tick). */
  visionExplored: Uint8Array[] = [];
  visionVisible: Uint8Array[] = [];

  constructor(seed: number | string, playerCount = 2) {
    this.rng = new Rng(seed);
    this.players = Array.from({ length: playerCount }, (_, id) => ({
      id,
      name: `Người chơi ${id + 1}`,
      resources: { wood: 200, food: 200, gold: 100, stone: 100 },
      pop: 0,
      popCap: POP_CAP_BASE,
      age: AGES[0]?.id ?? 'stone',
      techs: new Set<string>(),
      attackBonus: 0,
      gatherMul: { wood: 1, food: 1, gold: 1, stone: 1 },
    }));
  }

  /**
   * Dựng trận mới: gen map từ seed, mỗi player nhận 1 Đình làng (town_center)
   * tại điểm spawn + 3 Nông dân xung quanh; rải node tài nguyên từ mapgen.
   */
  setupMatch(seed: string, playerNames: string[]): void {
    const { map, spawns, resources } = generateMap(seed, playerNames.length);
    this.map = map;
    this.entities.clear();
    this.nextId = 1;
    this.tick = 0;
    this.commandQueue = [];
    this.flowCache = new FlowFieldCache();
    this.moveTracks.clear();
    this.returnTargets.clear();
    this.stuckReports = 0;
    this.projectiles = [];
    this.winner = null;
    this.events = [];
    this.visionExplored = [];
    this.visionVisible = [];
    this.players = playerNames.map((name, id) => ({
      id,
      name,
      resources: { wood: 200, food: 200, gold: 100, stone: 100 },
      pop: 0,
      popCap: POP_CAP_BASE,
      age: AGES[0]?.id ?? 'stone',
      techs: new Set<string>(),
      attackBonus: 0,
      gatherMul: { wood: 1, food: 1, gold: 1, stone: 1 },
    }));

    playerNames.forEach((_name, pid) => {
      const s = spawns[pid];
      // 1 Đình làng ngay tại điểm spawn
      this.spawnBuilding(pid, 'town_center', s.x, s.y);
      // 3 Nông dân xung quanh
      const offsets: Array<[number, number]> = [
        [-3, -2],
        [3, -2],
        [0, 3],
      ];
      for (const [dx, dy] of offsets) {
        this.spawnUnit(pid, 'villager_m', s.x + dx, s.y + dy);
      }
    });

    // Rải node tài nguyên từ mapgen (amount lấy từ RESOURCES)
    for (const r of resources) {
      if (!RESOURCES[r.kind]) continue; // bỏ qua kind lạ cho an toàn
      this.spawnResource(r.kind, r.x, r.y);
    }
  }

  /** Client/server gọi để đưa lệnh vào hàng đợi tick tiếp theo. */
  addCommand(cmd: Command): void {
    this.commandQueue.push(cmd);
  }

  /**
   * Chạy 1 tick: lệnh → movement → combat → kinh tế → research →
   * vision (mỗi 5 tick) → victory.
   */
  update(): void {
    const commands = this.commandQueue.splice(0, this.commandQueue.length);
    for (const cmd of commands) {
      this.applyCommand(cmd);
    }
    this.updateMovement();
    updateCombat(this);
    this.updateGather();
    this.updateBuild();
    this.updateTrain();
    updateResearch(this);
    this.updatePop();
    if (this.tick % 5 === 0) updateVision(this);
    const vr = checkVictory(this);
    if (vr.over && this.winner === null) this.winner = vr.winner;
    this.tick += 1;
  }

  /** Tick hiện tại (cho system cần stagger theo tick, vd. aggro scan). */
  getTick(): number {
    return this.tick;
  }

  /**
   * Hủy nhiệm vụ gather/build/return của unit (dùng khi ra lệnh tấn công).
   * Public cho combat system.
   */
  clearUnitTasks(id: number): void {
    const e = this.entities.get(id);
    if (e && e.kind === 'unit') {
      e.targetNodeId = null;
      e.buildTargetId = null;
    }
    this.returnTargets.delete(id);
  }

  /**
   * Xóa entity khỏi sim + dọn track nội bộ (dùng khi unit/nhà chết).
   * Public cho combat system.
   */
  removeEntity(id: number): void {
    this.entities.delete(id);
    this.moveTracks.delete(id);
    this.returnTargets.delete(id);
  }

  /**
   * Player đã ở thời đủ để dùng def có age yêu cầu này chưa?
   * Public cho research/combat system validate.
   */
  ageAllows(playerId: PlayerId, age: AgeId): boolean {
    const p = this.players[playerId];
    if (!p) return false;
    return ageIndex(p.age) >= ageIndex(age);
  }

  /** Đọc fog of war của 1 player (client dùng để vẽ). */
  getVision(pid: PlayerId): {
    explored: Uint8Array;
    visible: Uint8Array;
    w: number;
    h: number;
  } {
    const w = this.map ? this.map.width : 0;
    const h = this.map ? this.map.height : 0;
    return {
      explored: this.visionExplored[pid] ?? new Uint8Array(w * h),
      visible: this.visionVisible[pid] ?? new Uint8Array(w * h),
      w,
      h,
    };
  }

  /** Spawn 1 unit từ UNITS (hp/speed lấy từ def). Trả về entity id. */
  spawnUnit(playerId: PlayerId, defId: string, x: number, y: number): EntityId {
    const def = UNITS[defId];
    if (!def) throw new Error(`spawnUnit: không có unit def '${defId}'`);
    const id = this.nextId++;
    const e: UnitEntity = {
      kind: 'unit',
      id,
      playerId,
      defId,
      x,
      y,
      hp: def.hp,
      maxHp: def.hp,
      state: 'idle',
      targetX: x,
      targetY: y,
      speed: def.speed,
      carryType: null,
      carryAmount: 0,
      targetNodeId: null,
      buildTargetId: null,
      attackTimer: 0,
      targetId: null,
      attackMove: false,
      attackMoveX: x,
      attackMoveY: y,
    };
    this.entities.set(id, e);
    return id;
  }

  /** Spawn 1 nhà từ BUILDINGS (x, y = tâm). Trả về entity id. */
  spawnBuilding(
    playerId: PlayerId,
    defId: string,
    x: number,
    y: number,
  ): EntityId {
    const def = BUILDINGS[defId];
    if (!def) throw new Error(`spawnBuilding: không có building def '${defId}'`);
    const id = this.nextId++;
    const e: BuildingEntity = {
      kind: 'building',
      id,
      playerId,
      defId,
      x,
      y,
      hp: def.hp,
      maxHp: def.hp,
      size: parseBuildingSize(def.size),
      progress: 1,
      complete: true,
      trainQueue: [],
      researchQueue: [],
    };
    this.entities.set(id, e);
    return id;
  }

  /** Spawn 1 node tài nguyên trung lập (amount từ RESOURCES). Trả về entity id. */
  spawnResource(defId: string, x: number, y: number): EntityId {
    const def = RESOURCES[defId];
    if (!def) throw new Error(`spawnResource: không có resource def '${defId}'`);
    const id = this.nextId++;
    const e: ResourceNodeEntity = {
      kind: 'resource',
      id,
      defId,
      x,
      y,
      amount: def.amount,
    };
    this.entities.set(id, e);
    return id;
  }

  getState(): GameState {
    return { tick: this.tick, entities: this.entities, players: this.players };
  }

  // ---------------------------------------------------------------
  // Lệnh
  // ---------------------------------------------------------------

  private applyCommand(cmd: Command): void {
    switch (cmd.type) {
      case 'move':
        this.applyMove(cmd);
        break;
      case 'gather':
        this.applyGather(cmd);
        break;
      case 'build':
        this.applyBuild(cmd);
        break;
      case 'train':
        this.applyTrain(cmd);
        break;
      case 'attack':
        applyAttackCommand(this, cmd);
        break;
      case 'attackmove':
        applyAttackMoveCommand(this, cmd);
        break;
      case 'research':
        applyResearchCommand(this, cmd);
        break;
      case 'stop':
        this.applyStop(cmd);
        break;
      case 'delete':
        this.applyDelete(cmd);
        break;
      default:
        break;
    }
  }

  /** Lệnh stop (phím S): unit đứng yên, hủy gather/build/return/attack đang dang dở. */
  private applyStop(cmd: StopCommand): void {
    for (const id of cmd.unitIds) {
      const e = this.entities.get(id);
      if (!e || e.kind !== 'unit') continue; // id lạ hoặc không phải unit
      if (e.playerId !== cmd.playerId) continue; // không phải unit của người gửi
      if (e.hp <= 0) continue; // đã chết
      e.targetNodeId = null;
      e.buildTargetId = null;
      this.returnTargets.delete(id);
      this.moveTracks.delete(id);
      e.state = 'idle';
    }
  }

  /** Lệnh delete (phím Delete): phá unit/nhà của chính mình. */
  private applyDelete(cmd: DeleteCommand): void {
    for (const id of cmd.unitIds) {
      const e = this.entities.get(id);
      if (!e) continue;
      if (e.kind !== 'unit' && e.kind !== 'building') continue;
      if (e.playerId !== cmd.playerId) continue; // không được xóa đồ của địch
      this.removeEntity(id);
    }
  }

  /**
   * Ra lệnh di chuyển cho 1 unit: đặt state + đích + reset track kẹt.
   * Dùng chung cho move/gather/build/return/attack (transit là moving/returning).
   * Public cho combat system (đuổi mục tiêu).
   */
  orderMove(
    u: UnitEntity,
    x: number,
    y: number,
    state: 'moving' | 'returning' = 'moving',
  ): void {
    u.state = state;
    u.targetX = x;
    u.targetY = y;
    this.moveTracks.set(u.id, {
      probeX: u.x,
      probeY: u.y,
      probeTick: this.tick,
      fallback: false,
      field: null,
      ftx: 0,
      fty: 0,
      fver: -1,
    });
  }

  /** Lệnh move: chỉ unit còn sống và thuộc đúng player gửi mới nhận lệnh. */
  private applyMove(cmd: MoveCommand): void {
    // Pre-warm flow field cho đích này (tính 1 lần, các unit dùng chung qua cache).
    if (this.map) {
      this.flowCache.get(
        Math.floor(cmd.x),
        Math.floor(cmd.y),
        this.map,
      );
    }
    for (const id of cmd.unitIds) {
      const e = this.entities.get(id);
      if (!e || e.kind !== 'unit') continue; // id lạ hoặc không phải unit
      if (e.playerId !== cmd.playerId) continue; // không phải unit của người gửi
      if (e.hp <= 0) continue; // đã chết
      // Move thủ công hủy mọi nhiệm vụ gather/build đang dang dở (giữ lại
      // tài nguyên đang mang — dân sẽ tự trả về drop-off ở updateGather).
      e.targetNodeId = null;
      e.buildTargetId = null;
      this.returnTargets.delete(id);
      this.orderMove(e, cmd.x, cmd.y, 'moving');
    }
  }

  /**
   * Lệnh gather: dân đi tới node, khai thác tới đầy túi rồi tự trả về
   * drop-off gần nhất, lặp lại cho tới khi node cạn.
   */
  private applyGather(cmd: GatherCommand): void {
    for (const id of cmd.unitIds) {
      const e = this.entities.get(id);
      if (!e || e.kind !== 'unit') continue;
      if (e.playerId !== cmd.playerId) continue;
      if (e.hp <= 0) continue;
      if (!isVillagerDef(e.defId)) continue; // chỉ dân mới khai thác
      const node = this.entities.get(cmd.targetId);
      if (!node || node.kind !== 'resource' || node.amount <= 0) continue;
      const def = RESOURCES[node.defId];
      if (!def) continue;
      e.targetNodeId = node.id;
      e.buildTargetId = null; // gather hủy nhiệm vụ xây
      this.returnTargets.delete(id);
      e.carryType = def.resource; // loại tài nguyên lấy theo node, không theo lệnh
      e.carryAmount = 0;
      this.orderMove(e, node.x, node.y, 'moving');
    }
  }

  /**
   * Lệnh build: validate đủ tiền → trừ tiền → dựng công trường
   * (progress=0) → dân tới xây, mỗi dân cộng BUILD_RATE tiến độ/giây.
   */
  private applyBuild(cmd: BuildCommand): void {
    if (cmd.siteId !== undefined) {
      // Xây tiếp công trường có sẵn của mình: không trừ tiền, chỉ điều dân tới.
      const site = this.entities.get(cmd.siteId);
      if (!site || site.kind !== 'building') return;
      if (site.playerId !== cmd.playerId || site.complete) return;
      this.sendBuilders(cmd, site.id, site.x, site.y);
      return;
    }
    const def = BUILDINGS[cmd.buildingId];
    if (!def) return;
    const p = this.players[cmd.playerId];
    if (!p) return;
    if (!this.ageAllows(cmd.playerId, def.age)) return; // chưa đủ thời
    if (!this.canAfford(p, def.cost)) return; // không đủ tiền: bỏ lệnh
    this.payCost(p, def.cost);
    const id = this.nextId++;
    const b: BuildingEntity = {
      kind: 'building',
      id,
      playerId: cmd.playerId,
      defId: cmd.buildingId,
      x: cmd.x,
      y: cmd.y,
      hp: def.hp,
      maxHp: def.hp,
      size: parseBuildingSize(def.size),
      progress: 0,
      complete: false,
      trainQueue: [],
      researchQueue: [],
    };
    this.entities.set(id, b);
    this.sendBuilders(cmd, id, cmd.x, cmd.y);
  }

  /** Điều các dân hợp lệ trong lệnh tới xây công trường `siteId` tại (x, y). */
  private sendBuilders(cmd: BuildCommand, siteId: number, x: number, y: number): void {
    for (const uid of cmd.unitIds) {
      const e = this.entities.get(uid);
      if (!e || e.kind !== 'unit') continue;
      if (e.playerId !== cmd.playerId) continue;
      if (e.hp <= 0) continue;
      if (!isVillagerDef(e.defId)) continue; // chỉ dân mới xây
      e.buildTargetId = siteId;
      e.targetNodeId = null; // build hủy nhiệm vụ gather
      this.returnTargets.delete(uid);
      this.orderMove(e, x, y, 'moving');
    }
  }

  /**
   * Lệnh train: validate nhà xong + thuộc player + train được unit này +
   * đủ tiền + đủ pop → trừ tiền → xếp hàng đợi.
   */
  private applyTrain(cmd: TrainCommand): void {
    const b = this.entities.get(cmd.buildingId);
    if (!b || b.kind !== 'building') return;
    if (b.playerId !== cmd.playerId) return;
    if (!b.complete) return;
    const bdef = BUILDINGS[b.defId];
    if (!bdef || !bdef.trains.includes(cmd.unitDefId)) return;
    const udef = UNITS[cmd.unitDefId];
    if (!udef) return;
    const p = this.players[cmd.playerId];
    if (!p) return;
    if (!this.ageAllows(cmd.playerId, udef.age)) return; // chưa đủ thời
    if (!this.canAfford(p, udef.cost)) return;
    if (p.pop + udef.popCost > p.popCap) return; // hết dân số: bỏ lệnh
    this.payCost(p, udef.cost);
    b.trainQueue.push({ unitDefId: cmd.unitDefId, progress: 0 });
  }

  /** Đủ tiền trả cost? Public cho research system. */
  canAfford(p: PlayerState, cost: Partial<ResourceBag>): boolean {
    const keys: Array<keyof ResourceBag> = ['wood', 'food', 'gold', 'stone'];
    for (const k of keys) {
      if ((cost[k] ?? 0) > p.resources[k]) return false;
    }
    return true;
  }

  /** Trừ cost khỏi túi người chơi (gọi sau canAfford). Public cho research system. */
  payCost(p: PlayerState, cost: Partial<ResourceBag>): void {
    const keys: Array<keyof ResourceBag> = ['wood', 'food', 'gold', 'stone'];
    for (const k of keys) {
      p.resources[k] -= cost[k] ?? 0;
    }
  }

  // ---------------------------------------------------------------
  // Systems
  // ---------------------------------------------------------------

  /** Lấy unit sắp xếp theo id tăng dần (deterministic). */
  private getUnitsSorted(): UnitEntity[] {
    const out: UnitEntity[] = [];
    for (const e of this.entities.values()) {
      if (e.kind === 'unit') out.push(e);
    }
    out.sort((a, b) => a.id - b.id);
    return out;
  }

  /** Lấy building sắp xếp theo id tăng dần (deterministic). */
  private getBuildingsSorted(): BuildingEntity[] {
    const out: BuildingEntity[] = [];
    for (const e of this.entities.values()) {
      if (e.kind === 'building') out.push(e);
    }
    out.sort((a, b) => a.id - b.id);
    return out;
  }

  // ---------------------------------------------------------------
  // Kinh tế Phase 4a: gather / build / train / pop
  // ---------------------------------------------------------------

  /**
   * Khai thác: unit 'gathering' tích lũy tài nguyên từ node vào túi
   * (gatherRate từ RESOURCES, tối đa CARRY_CAP); đầy túi → 'returning'
   * về drop-off; node cạn → xóa node, trả hàng dở rồi idle.
   * Unit 'idle' còn mang hàng/nhiệm vụ (do kẹt đường) được phục hồi.
   */
  private updateGather(): void {
    for (const u of this.getUnitsSorted()) {
      if (u.state === 'gathering') {
        this.tickGathering(u);
      } else if (u.state === 'returning') {
        // Đang trên đường trả hàng nhưng mất đích (nhà bị phá/lệnh mới):
        // tìm drop-off khác, không thì đứng yên giữ hàng.
        if (!this.returnTargets.has(u.id)) {
          if (u.carryAmount > 0 && u.carryType) {
            if (!this.sendToDropOff(u)) u.state = 'idle';
          } else {
            u.state = 'idle';
          }
        }
      } else if (u.state === 'idle') {
        // Phục hồi sau kẹt đường: còn hàng → đi trả; còn node → đi tiếp.
        if (
          u.carryAmount > 0 &&
          u.carryType &&
          !this.returnTargets.has(u.id)
        ) {
          this.sendToDropOff(u);
        } else if (u.targetNodeId !== null && u.carryAmount <= 0) {
          const node = this.entities.get(u.targetNodeId);
          if (node && node.kind === 'resource' && node.amount > 0) {
            this.orderMove(u, node.x, node.y, 'moving');
          } else {
            u.targetNodeId = null;
          }
        }
      }
    }
  }

  /** 1 tick khai thác của unit đang đứng tại node. */
  private tickGathering(u: UnitEntity): void {
    const node =
      u.targetNodeId !== null ? this.entities.get(u.targetNodeId) : undefined;
    if (!node || node.kind !== 'resource' || node.amount <= 0) {
      // Node biến mất/cạn: xóa node cạn, trả nốt hàng đang mang rồi idle.
      if (node && node.kind === 'resource') this.entities.delete(node.id);
      u.targetNodeId = null;
      if (u.carryAmount > 0 && u.carryType) this.sendToDropOff(u);
      else u.state = 'idle';
      return;
    }
    const def = RESOURCES[node.defId];
    // Hệ số tech gatherMul của player (Phase 5a).
    const mul = this.players[u.playerId]?.gatherMul[def?.resource ?? 'wood'] ?? 1;
    const rate = def ? def.gatherRate * mul : 0;
    const take = Math.min(rate * DT, CARRY_CAP - u.carryAmount, node.amount);
    if (take > 0) {
      u.carryAmount += take;
      node.amount -= take;
    }
    if (u.carryAmount >= CARRY_CAP - 1e-9) {
      this.sendToDropOff(u); // đầy túi → về trả hàng
      return;
    }
    if (node.amount <= 1e-9) {
      this.entities.delete(node.id); // node cạn giữa chừng
      u.targetNodeId = null;
      if (u.carryAmount > 0 && u.carryType) this.sendToDropOff(u);
      else u.state = 'idle';
    }
  }

  /**
   * Xây dựng: mỗi dân 'building' cộng BUILD_RATE tiến độ/giây vào công
   * trình; progress >= 1 → complete, toàn bộ thợ về idle.
   * Dân 'idle' còn buildTargetId (kẹt đường) được lệnh đi tiếp.
   */
  private updateBuild(): void {
    const finished = new Set<number>();
    for (const u of this.getUnitsSorted()) {
      if (u.state === 'building') {
        const b =
          u.buildTargetId !== null
            ? this.entities.get(u.buildTargetId)
            : undefined;
        if (!b || b.kind !== 'building' || b.complete) {
          u.buildTargetId = null;
          u.state = 'idle';
          continue;
        }
        b.progress += DT * BUILD_RATE;
        if (b.progress >= 1) {
          b.progress = 1;
          b.complete = true;
          finished.add(b.id);
        }
      } else if (u.state === 'idle' && u.buildTargetId !== null) {
        const b = this.entities.get(u.buildTargetId);
        if (b && b.kind === 'building' && !b.complete) {
          this.orderMove(u, b.x, b.y, 'moving');
        } else {
          u.buildTargetId = null;
        }
      }
    }
    if (finished.size > 0) {
      for (const u of this.getUnitsSorted()) {
        if (
          u.state === 'building' &&
          u.buildTargetId !== null &&
          finished.has(u.buildTargetId)
        ) {
          u.buildTargetId = null;
          u.state = 'idle';
        }
      }
    }
  }

  /**
   * Train: mỗi nhà có hàng đợi thì unit đầu tiên tiến triển
   * progress += dt/trainTime; xong → spawn cạnh nhà (deterministic).
   */
  private updateTrain(): void {
    for (const b of this.getBuildingsSorted()) {
      const q = b.trainQueue[0];
      if (!q) continue;
      const def = UNITS[q.unitDefId];
      if (!def || def.trainTime <= 0) {
        b.trainQueue.shift();
        continue;
      }
      q.progress += DT / def.trainTime;
      if (q.progress >= 1) {
        b.trainQueue.shift();
        this.spawnUnit(
          b.playerId,
          q.unitDefId,
          b.x + b.size / 2 + 1,
          b.y,
        );
      }
    }
  }

  /**
   * Tính lại dân số mỗi tick: pop = số unit của player;
   * popCap = 5 + 5 * (số nhà sàn hoàn thành), trần 100.
   */
  private updatePop(): void {
    const pops: number[] = this.players.map(() => 0);
    const houses: number[] = this.players.map(() => 0);
    for (const e of this.entities.values()) {
      if (e.kind === 'unit') {
        pops[e.playerId] = (pops[e.playerId] ?? 0) + 1;
      } else if (
        e.kind === 'building' &&
        e.defId === 'house' &&
        e.complete
      ) {
        houses[e.playerId] = (houses[e.playerId] ?? 0) + 1;
      }
    }
    this.players.forEach((p, i) => {
      p.pop = pops[i] ?? 0;
      p.popCap = Math.min(
        POP_CAP_MAX,
        POP_CAP_BASE + POP_PER_HOUSE * (houses[i] ?? 0),
      );
    });
  }

  /**
   * Di chuyển theo flow field + steering (Phase 3).
   * Mỗi tick unit đọc hướng tại ô đang đứng từ field của đích (cache chung);
   * vector tách (separation, qua spatial hash) được CỘNG vào hướng di chuyển,
   * chuẩn hóa rồi đi * speed * dt. Tuyệt đối không Math.random/Date.now;
   * duyệt unit theo id tăng dần.
   */
  private updateMovement(): void {
    const map = this.map;
    const units = this.getUnitsSorted();
    // Spatial hash 1 lần/tick (vị trí đầu tick) cho separation steering.
    const grid = new Map<number, UnitEntity[]>();
    for (const u of units) {
      const key = cellKey(Math.floor(u.x), Math.floor(u.y));
      const arr = grid.get(key);
      if (arr) arr.push(u);
      else grid.set(key, [u]);
    }
    for (const u of units) {
      if (u.state !== 'moving' && u.state !== 'returning') continue;
      this.stepUnit(u, map, grid);
    }
    // Giữ unit trong biên map (steering không đẩy vị trí trực tiếp nên
    // không thể văng ra ngoài, nhưng clamp để an toàn).
    if (map) {
      for (const u of units) {
        u.x = clamp(u.x, 0, map.width - 1);
        u.y = clamp(u.y, 0, map.height - 1);
      }
    }
  }

  /**
   * Vector tách (separation) của unit: tổng các vector đẩy ra xa unit kề
   * (cách < 0.4 tile), trọng số tuyến tính 1→0 theo khoảng cách.
   * Duyệt neighbour theo id tăng dần → deterministic.
   */
  private separationVector(
    u: UnitEntity,
    grid: Map<number, UnitEntity[]>,
  ): [number, number] {
    let sx = 0;
    let sy = 0;
    const cx = Math.floor(u.x);
    const cy = Math.floor(u.y);
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const arr = grid.get(cellKey(gx, gy));
        if (!arr) continue;
        for (const v of arr) {
          if (v.id === u.id) continue;
          const dx = u.x - v.x;
          const dy = u.y - v.y;
          const d = Math.hypot(dx, dy);
          if (d >= SEPARATION_DIST) continue;
          let nx: number;
          let ny: number;
          let w: number;
          if (d < 1e-9) {
            // Chồng khít: hướng tách deterministic suy từ id.
            const ang = (u.id * 2.39996323) % (Math.PI * 2);
            nx = Math.cos(ang);
            ny = Math.sin(ang);
            w = 1;
          } else {
            nx = dx / d;
            ny = dy / d;
            w = 1 - d / SEPARATION_DIST;
          }
          sx += nx * w;
          sy += ny * w;
        }
      }
    }
    return [sx, sy];
  }

  /** Lấy (và cache trong track) flow field cho ô đích của unit. */
  private fieldFor(u: UnitEntity, track: MoveTrack): FlowField | null {
    const map = this.map;
    if (!map) return null;
    const gtx = Math.floor(u.targetX);
    const gty = Math.floor(u.targetY);
    if (
      track.field === null ||
      track.ftx !== gtx ||
      track.fty !== gty ||
      track.fver !== map.version
    ) {
      track.field = this.flowCache.get(gtx, gty, map);
      track.ftx = gtx;
      track.fty = gty;
      track.fver = map.version;
    }
    return track.field;
  }

  /** true nếu điểm (x, y) nằm trên ô đi được (map null → coi như đi được). */
  private walkableAt(map: GameMap | null, x: number, y: number): boolean {
    if (!map) return true;
    return map.isWalkable(Math.floor(x), Math.floor(y));
  }

  /**
   * Kiểm tra tới đích: cost tại ô < 0.5 HOẶC cách target < 0.3 tile.
   * Tới nơi → onArrived quyết định state tiếp theo theo nhiệm vụ
   * (gathering / building / trả hàng / idle).
   */
  private checkArrived(
    u: UnitEntity,
    _map: GameMap | null,
    field: FlowField | null,
  ): boolean {
    const tx = Math.floor(u.x);
    const ty = Math.floor(u.y);
    const onGoalTile = field !== null && field.costAt(tx, ty) < ARRIVE_COST;
    const nearTarget =
      Math.hypot(u.targetX - u.x, u.targetY - u.y) < ARRIVE_DIST;
    if (!onGoalTile && !nearTarget) return false;
    this.onArrived(u);
    return true;
  }

  /**
   * Unit vừa tới đích transit: rẽ nhánh theo nhiệm vụ đang mang.
   * - returning (có returnTargets): trả hàng vào nhà → quay lại node/idle.
   * - moving + targetNodeId: node còn hàng → gathering, không thì idle.
   * - moving + buildTargetId: công trường chưa xong → building, không thì idle.
   * - còn lại: idle.
   */
  private onArrived(u: UnitEntity): void {
    this.moveTracks.delete(u.id);
    const retId = this.returnTargets.get(u.id);
    if (retId !== undefined) {
      this.returnTargets.delete(u.id);
      this.depositCarry(u, retId);
      return;
    }
    if (u.targetNodeId !== null) {
      const node = this.entities.get(u.targetNodeId);
      if (node && node.kind === 'resource' && node.amount > 0) {
        u.state = 'gathering';
        return;
      }
      u.targetNodeId = null;
    }
    if (u.buildTargetId !== null) {
      const b = this.entities.get(u.buildTargetId);
      if (b && b.kind === 'building' && !b.complete) {
        u.state = 'building';
        return;
      }
      u.buildTargetId = null;
    }
    u.state = 'idle';
  }

  /**
   * Trả tài nguyên đang mang vào nhà drop-off: cộng vào túi player,
   * rồi quay lại node cũ nếu còn hàng, không thì idle.
   */
  private depositCarry(u: UnitEntity, buildingId: number): void {
    const b = this.entities.get(buildingId);
    const p = this.players[u.playerId];
    if (
      b &&
      b.kind === 'building' &&
      b.playerId === u.playerId &&
      b.complete &&
      u.carryType &&
      p
    ) {
      p.resources[u.carryType] += u.carryAmount;
    }
    u.carryAmount = 0;
    const node =
      u.targetNodeId !== null ? this.entities.get(u.targetNodeId) : undefined;
    if (node && node.kind === 'resource' && node.amount > 0) {
      this.orderMove(u, node.x, node.y, 'moving');
    } else {
      u.targetNodeId = null;
      u.state = 'idle';
    }
  }

  /**
   * Cho unit mang hàng đi trả ở drop-off gần nhất của player.
   * Trả về false nếu không có drop-off hợp lệ (đứng yên giữ hàng).
   */
  private sendToDropOff(u: UnitEntity): boolean {
    const drop = this.findDropOff(u);
    if (!drop) return false;
    this.returnTargets.set(u.id, drop.id);
    this.orderMove(u, drop.x, drop.y, 'returning');
    return true;
  }

  /**
   * Drop-off gần nhất của player chấp nhận loại tài nguyên đang mang:
   * town_center nhận hết; granary chỉ food; storage_pit chỉ wood/gold/stone.
   * Duyệt nhà theo id tăng dần, hòa khoảng cách thì id nhỏ thắng.
   */
  private findDropOff(u: UnitEntity): BuildingEntity | null {
    if (!u.carryType) return null;
    const carry: ResourceType = u.carryType;
    let best: BuildingEntity | null = null;
    let bestD = Infinity;
    for (const b of this.getBuildingsSorted()) {
      if (b.playerId !== u.playerId || !b.complete) continue;
      const accepts =
        b.defId === 'town_center'
          ? true
          : b.defId === 'granary'
            ? carry === 'food'
            : b.defId === 'storage_pit'
              ? carry === 'wood' || carry === 'gold' || carry === 'stone'
              : false;
      if (!accepts) continue;
      const d = (b.x - u.x) * (b.x - u.x) + (b.y - u.y) * (b.y - u.y);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  /**
   * 1 bước di chuyển của unit: field → cộng vector tách (steering) →
   * chuẩn hóa → tường trượt → probe kẹt.
   */
  private stepUnit(
    u: UnitEntity,
    map: GameMap | null,
    grid: Map<number, UnitEntity[]>,
  ): void {
    let track = this.moveTracks.get(u.id);
    if (!track) {
      track = {
        probeX: u.x,
        probeY: u.y,
        probeTick: this.tick,
        fallback: false,
        field: null,
        ftx: 0,
        fty: 0,
        fver: -1,
      };
      this.moveTracks.set(u.id, track);
    }
    const field = this.fieldFor(u, track);
    if (this.checkArrived(u, map, field)) return;

    // Hướng đi: field tại ô đang đứng; fallback/không field → đi thẳng tới đích.
    let dx: number;
    let dy: number;
    let dir: { dx: number; dy: number } | null = null;
    if (!track.fallback && field) {
      dir = field.directionAt(Math.floor(u.x), Math.floor(u.y));
    }
    if (dir && (dir.dx !== 0 || dir.dy !== 0)) {
      dx = dir.dx;
      dy = dir.dy;
    } else {
      dx = u.targetX - u.x;
      dy = u.targetY - u.y;
    }
    // Steering: cộng vector tách vào hướng di chuyển rồi chuẩn hóa.
    const [sx, sy] = this.separationVector(u, grid);
    dx += sx * SEPARATION_WEIGHT;
    dy += sy * SEPARATION_WEIGHT;
    const len = Math.hypot(dx, dy);
    if (len >= 1e-9) {
      this.tryMove(u, map, dx / len, dy / len, u.speed * DT);
      if (u.state !== 'moving') return; // kẹt tường → đã idle trong tryMove
      if (this.checkArrived(u, map, field)) return;
    }

    // Probe kẹt: so vị trí hiện tại với cách đây STUCK_PROBE_TICKS tick.
    if (this.tick - track.probeTick >= STUCK_PROBE_TICKS) {
      const moved = Math.hypot(u.x - track.probeX, u.y - track.probeY);
      if (moved < STUCK_MIN_PROGRESS) {
        if (track.fallback) {
          // Vẫn kẹt sau 40 tick fallback → idle, báo kẹt, không crash.
          u.state = 'idle';
          this.moveTracks.delete(u.id);
          this.stuckReports++;
          return;
        }
        // Kẹt lần đầu → thử đi thẳng tới đích (fallback), reset probe.
        track.fallback = true;
      }
      track.probeX = u.x;
      track.probeY = u.y;
      track.probeTick = this.tick;
    }
  }

  /**
   * Thử di chuyển 1 bước theo hướng (dx, dy) đã chuẩn hóa.
   * Unit KHÔNG đi vào ô !walkable: ô tiếp theo bị chặn → trượt dọc tường
   * (thử 2 hướng chéo gần nhất); vẫn không được → idle (báo kẹt).
   */
  private tryMove(
    u: UnitEntity,
    map: GameMap | null,
    dx: number,
    dy: number,
    step: number,
  ): void {
    const nx = u.x + dx * step;
    const ny = u.y + dy * step;
    if (this.walkableAt(map, nx, ny)) {
      u.x = nx;
      u.y = ny;
      return;
    }
    for (const [cdx, cdy] of nearestDiagonals(dx, dy)) {
      const l = Math.hypot(cdx, cdy);
      const sx = u.x + (cdx / l) * step;
      const sy = u.y + (cdy / l) * step;
      if (this.walkableAt(map, sx, sy)) {
        u.x = sx;
        u.y = sy;
        return;
      }
    }
    u.state = 'idle';
    this.moveTracks.delete(u.id);
    this.stuckReports++;
  }
}

/**
 * Theo dõi tiến triển di chuyển của 1 unit (lưu ngoài entity để giữ nguyên
 * interface UnitEntity).
 */
interface MoveTrack {
  /** Vị trí tại lần probe trước (so displacement mỗi STUCK_PROBE_TICKS tick). */
  probeX: number;
  probeY: number;
  probeTick: number;
  /** true = đang đi thẳng tới đích (fallback sau khi kẹt lần 1). */
  fallback: boolean;
  /** Flow field đang dùng + ô đích + version map lúc lấy (để refresh). */
  field: FlowField | null;
  ftx: number;
  fty: number;
  fver: number;
}

/**
 * 2 hướng chéo gần nhất với vector hướng (dx, dy) đã chuẩn hóa,
 * dùng để trượt dọc tường. Hướng cùng dấu với thành phần phụ được thử trước.
 */
function nearestDiagonals(
  dx: number,
  dy: number,
): Array<[number, number]> {
  if (Math.abs(dx) >= Math.abs(dy)) {
    const sx = dx >= 0 ? 1 : -1;
    const sy = dy >= 0 ? 1 : -1;
    return [
      [sx, sy],
      [sx, -sy],
    ];
  }
  const sx = dx >= 0 ? 1 : -1;
  const sy = dy >= 0 ? 1 : -1;
  return [
    [sx, sy],
    [-sx, sy],
  ];
}

/** Key cho spatial hash cell (offset +512/+4096 để xử lý tọa độ âm). */
function cellKey(cx: number, cy: number): number {
  return (cx + 512) * 4096 + (cy + 512);
}

/** true nếu unit def là dân (khai thác/xây dựng được). */
function isVillagerDef(defId: string): boolean {
  return defId === 'villager_m' || defId === 'villager_f';
}

/** 'WxH' -> W (số tile cạnh nhà). */
function parseBuildingSize(size: string): number {
  const w = parseInt(size.split('x')[0] ?? '', 10);
  return Number.isFinite(w) && w > 0 ? w : 1;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
