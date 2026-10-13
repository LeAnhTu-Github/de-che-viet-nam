/**
 * netGame.ts — Phase 6b: điều khiển trận MULTIPLAYER qua Colyseus snapshot.
 *
 * Luồng: server chạy sim authoritative 20 tick/s, broadcast SnapMsg 15Hz →
 * client giữ ring buffer 3 snapshot mới nhất, render snapshot có t <= latestT - 2
 * (delay ~133ms) và nội suy vị trí entity giữa 2 snapshot kề (lerp).
 *
 * Lệnh (move/build/train/attackmove/research): gửi thẳng lên server qua
 * room.send('command', ...) — KHÔNG chạy sim local.
 *
 * Interface GIỐNG LocalGameController ở những chỗ GameView dùng
 * (selection, humanPlayerId, entities, syncToRenderer, issue*, humanResources,
 * drainAgeUpEvents, selected*, unitsOfPlayer, entityAt, getVision, getProjectiles).
 */
import type { Room } from 'colyseus.js';
import { UNITS, AGES } from '@aoe-vn/sim';
import type { ResourceBag, ResourceType, UnitState } from '@aoe-vn/sim';
import type {
  InitMsg,
  SnapMsg,
  SnapEntity,
  PausedMsg,
  ResumedMsg,
  GameOverMessage,
  ChatBroadcast,
  CommandMessage,
} from '@aoe-vn/protocol';
import { TILE_SIZE } from './map';
import { SelectionManager } from './selection';
import type { EntityView } from './entityView';
import type { GameRenderer } from './renderer';
import {
  type SimEntity,
  type SimUnitEntity,
  type SimCommand,
  type SimProjectile,
  type VisionMap,
  isSimUnit,
} from './localGame';
import { syncEntitiesToRenderer, maxHpOf, defIdOf } from './entitySync';
import { pickEntity } from './picking';

/** Delay render so với snapshot mới nhất (tick 20Hz → 2 tick ≈ 133ms). */
const RENDER_DELAY_TICKS = 2;
/** Ring buffer: chỉ giữ 3 snapshot mới nhất. */
const SNAP_BUFFER = 3;
/** Resource order trong snap.p[].r: [wood, food, gold, stone]. */
const RES_KEYS: (keyof ResourceBag)[] = ['wood', 'food', 'gold', 'stone'];

export interface NetCallbacks {
  /** Server gửi init: seed + dict + phe của mình + tên các phe. */
  onInit(info: { seed: string; myPid: number; names: string[] }): void;
  onPaused(paused: boolean): void;
  onGameOver(winner: number | null): void;
  onChat(from: string, text: string): void;
  onDisconnect(): void;
}

function snapKind(k: SnapEntity['k']): SimEntity['kind'] {
  return k === 1 ? 'building' : k === 2 ? 'resource' : 'unit';
}

/** Chuyển SnapEntity → SimEntity (defId tra từ dict). */
function toSimEntity(se: SnapEntity, dict: string[]): SimEntity {
  const defId = dict[se.d] ?? 'unknown';
  const kind = snapKind(se.k);
  if (kind === 'unit') {
    const u: SimUnitEntity = {
      kind: 'unit',
      id: se.i,
      playerId: se.p,
      x: se.x,
      y: se.y,
      hp: se.hp,
      maxHp: maxHpOf(kind, defId, se.hp),
      defId,
      state: se.s as UnitState,
    };
    return u;
  }
  return {
    kind,
    id: se.i,
    playerId: se.p,
    x: se.x,
    y: se.y,
    hp: se.hp,
    maxHp: maxHpOf(kind, defId, se.hp),
    defId,
  } as SimEntity;
}

export class NetGameController {
  readonly selection = new SelectionManager();
  /** Phe của mình — server gán trong message 'init'. */
  humanPlayerId = 0;
  /** Seed trận từ server (client dựng map giống hệt). */
  seed = '';

  private room: Room | null = null;
  private cb: NetCallbacks | null = null;
  private dict: string[] = [];
  private names: string[] = [];
  private snaps: SnapMsg[] = []; // tăng dần theo t, tối đa SNAP_BUFFER
  private latestTick = 0;
  private evSeenT = -1;
  /** Entities đã nội suy — expose qua getter `entities`. */
  private readonly interp = new Map<number, SimEntity>();
  private readonly views = new Map<number, EntityView>();
  /** Entity đang bị rê chuột lên (GameView gán). */
  hoverId: number | null = null;
  private projectiles: SimProjectile[] = [];
  private lastRes: { resources: ResourceBag; pop: number; popCap: number } = {
    resources: { wood: 0, food: 0, gold: 0, stone: 0 },
    pop: 0,
    popCap: 0,
  };
  // Fog local: explored giữ xuyên suốt trận, visible tính lại mỗi frame.
  private mapW = 0;
  private mapH = 0;
  private explored: Uint8Array | null = null;
  private vision: VisionMap | undefined;

  /** GameView gọi sau khi dựng map để fog biết kích thước (tile). */
  setMapSize(wTiles: number, hTiles: number): void {
    this.mapW = wTiles;
    this.mapH = hTiles;
    this.explored = null;
    this.vision = undefined;
  }

  /** Kết nối room Colyseus: đăng ký nghe init/snap/paused/gameover/chat. */
  connect(room: Room, cb: NetCallbacks): void {
    this.room = room;
    this.cb = cb;

    room.onMessage('init', (msg: InitMsg) => {
      try {
        this.dict = Array.isArray(msg.dict) ? msg.dict : [];
        this.seed = typeof msg.seed === 'string' ? msg.seed : String(Date.now());
        this.humanPlayerId =
          typeof msg.myPid === 'number' && msg.myPid >= 0 ? msg.myPid : 0;
        this.names = Array.isArray(msg.names) ? msg.names : [];
        this.cb?.onInit({ seed: this.seed, myPid: this.humanPlayerId, names: this.names });
      } catch (err) {
        console.error('[net] init lỗi:', err);
      }
    });

    room.onMessage('snap', (msg: SnapMsg) => {
      try {
        if (typeof msg.t !== 'number' || !Array.isArray(msg.e)) return;
        // Chỉ nhận snapshot mới hơn (bỏ qua trùng/lộn xộn thứ tự).
        const last = this.snaps[this.snaps.length - 1];
        if (last && msg.t <= last.t) return;
        this.snaps.push(msg);
        while (this.snaps.length > SNAP_BUFFER) this.snaps.shift();
        this.latestTick = msg.t;
      } catch (err) {
        console.error('[net] snap lỗi:', err);
      }
    });

    room.onMessage('paused', (_msg: PausedMsg) => {
      this.cb?.onPaused(true);
    });

    // Server gửi 'resumed' khi trận chạy lại sau pause.
    room.onMessage('resumed', (_msg: ResumedMsg) => {
      this.cb?.onPaused(false);
    });

    room.onMessage('gameover', (msg: GameOverMessage) => {
      try {
        const w = typeof msg.winner === 'number' ? msg.winner : null;
        this.cb?.onGameOver(w);
      } catch {
        this.cb?.onGameOver(null);
      }
    });

    room.onMessage('chat', (msg: ChatBroadcast) => {
      try {
        this.cb?.onChat(String(msg.from ?? '?'), String(msg.text ?? ''));
      } catch {
        /* bỏ qua chat lỗi */
      }
    });

    room.onLeave(() => {
      this.cb?.onDisconnect();
    });
  }

  /** Entities hiện tại (đã nội suy) — GameView đọc như local. */
  get entities(): Map<number, SimEntity> {
    return this.interp;
  }

  /**
   * Chạy mỗi frame (thay cho stepAccum của local): chọn cặp snapshot để
   * render + nội suy vị trí. Gọi trong beforeRender() của GameView.
   */
  beforeRender(): void {
    this.updateInterpolation();
  }

  /** Net mode không chạy sim local. */
  stepAccum(_dt: number): void {
    /* no-op */
  }

  /**
   * Chọn renderSnap = snapshot mới nhất có t <= latestT - RENDER_DELAY_TICKS,
   * nội suy x/y giữa nó và snapshot kế tiếp (alpha theo t).
   */
  private updateInterpolation(): void {
    const n = this.snaps.length;
    if (n === 0) return;
    const targetT = this.snaps[n - 1].t - RENDER_DELAY_TICKS;

    let ai = 0;
    for (let i = 0; i < n; i++) {
      if (this.snaps[i].t <= targetT) ai = i;
    }
    const snapA = this.snaps[ai];
    const snapB = ai + 1 < n ? this.snaps[ai + 1] : null;

    const dt = snapB ? snapB.t - snapA.t : 1;
    const alpha = snapB ? Math.min(1, Math.max(0, (targetT - snapA.t) / Math.max(1, dt))) : 0;

    const bById = new Map<number, SnapEntity>();
    if (snapB) for (const se of snapB.e) bById.set(se.i, se);

    const out = this.interp;
    const seen = new Set<number>();
    for (const se of snapA.e) {
      seen.add(se.i);
      const nb = bById.get(se.i);
      const x = nb ? se.x + (nb.x - se.x) * alpha : se.x;
      const y = nb ? se.y + (nb.y - se.y) * alpha : se.y;
      const hp = nb ? nb.hp : se.hp;
      const ent = toSimEntity({ ...se, x, y, hp }, this.dict);
      out.set(se.i, ent);
    }
    // Entity mới xuất hiện ở snapB: vẽ luôn tại vị trí B (tránh pop-in trễ).
    if (snapB) {
      for (const se of snapB.e) {
        if (!seen.has(se.i) && !out.has(se.i)) {
          out.set(se.i, toSimEntity(se, this.dict));
        }
      }
    }
    // Xóa entity đã biến mất khỏi cả 2 snapshot.
    for (const id of [...out.keys()]) {
      if (!seen.has(id) && !(snapB && bById.has(id))) out.delete(id);
    }

    // Projectile: lấy từ snapshot neo (A).
    this.projectiles = (Array.isArray(snapA.pr) ? snapA.pr : []).map((p) => ({
      id: p.i,
      x: p.x,
      y: p.y,
    }));

    // Tài nguyên phe mình từ snapshot neo.
    const ps = Array.isArray(snapA.p) ? snapA.p[this.humanPlayerId] : undefined;
    if (ps && Array.isArray(ps.r) && ps.r.length >= 4) {
      const resources = { wood: 0, food: 0, gold: 0, stone: 0 } as ResourceBag;
      for (let i = 0; i < 4; i++) resources[RES_KEYS[i]] = Number(ps.r[i]) || 0;
      this.lastRes = {
        resources,
        pop: Number(ps.pop) || 0,
        popCap: Number(ps.cap) || 0,
      };
    }

    this.updateVision();
  }

  /** Fog local: los từ UNITS[defId].los (fallback 4), explored giữ xuyên trận. */
  private updateVision(): void {
    const { mapW: w, mapH: h } = this;
    if (w <= 0 || h <= 0) {
      this.vision = undefined;
      return;
    }
    const visible = new Uint8Array(w * h);
    for (const e of this.interp.values()) {
      if (e.kind !== 'unit' || e.playerId !== this.humanPlayerId) continue;
      const defId = isSimUnit(e) ? e.defId : '';
      const los = UNITS[defId]?.los ?? 4;
      const tx = Math.floor(e.x / TILE_SIZE);
      const ty = Math.floor(e.y / TILE_SIZE);
      const r = Math.ceil(los);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > los * los) continue;
          const x = tx + dx;
          const y = ty + dy;
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          visible[y * w + x] = 1;
        }
      }
    }
    if (!this.explored || this.explored.length !== w * h) {
      this.explored = new Uint8Array(w * h);
    }
    for (let i = 0; i < visible.length; i++) {
      if (visible[i]) this.explored[i] = 1;
    }
    this.vision = { explored: this.explored, visible, w, h };
  }

  /** Đồng bộ entities đã nội suy → renderer (helper dùng chung với local). */
  syncToRenderer(renderer: GameRenderer): void {
    syncEntitiesToRenderer(this.views, renderer, this.interp, this.selection, this.projectiles, this.hoverId);
  }

  /* ─────────── Gửi lệnh lên server (không chạy sim local) ─────────── */

  private sendCommand(cmd: SimCommand): void {
    if (!this.room) return;
    const msg: CommandMessage = {
      kind: 'command',
      // Ép kiểu như localGame (worker sim đang chốt Command theo SimCommand).
      command: cmd as unknown as CommandMessage['command'],
      clientTick: this.latestTick,
    };
    this.room.send('command', msg);
  }

  /** Gửi chat lên server. */
  sendChat(text: string): void {
    const t = text.trim().slice(0, 200);
    if (!t || !this.room) return;
    this.room.send('chat', { kind: 'chat', text: t });
  }

  /** Ra lệnh move cho các unit đang chọn của phe mình tới world (x, y). */
  issueMove(x: number, y: number): void {
    const owned = new Set(this.unitsOfPlayer(this.humanPlayerId).map((u) => u.id));
    const ids = [...this.selection.selected].filter((id) => owned.has(id));
    if (ids.length === 0) return;
    this.sendCommand({ type: 'move', playerId: this.humanPlayerId, unitIds: ids, x, y });
  }

  /** Ra lệnh xây nhà cho các dân đang chọn tại world (x, y) px. */
  issueBuild(buildingDefId: string, x: number, y: number): void {
    const ids = this.selectedVillagers().map((v) => v.id);
    if (ids.length === 0) return;
    this.sendCommand({
      type: 'build',
      playerId: this.humanPlayerId,
      unitIds: ids,
      buildingId: buildingDefId,
      x,
      y,
    });
  }

  /** Ra lệnh train 1 unit tại nhà (entity id). */
  trainUnit(buildingId: number, unitDefId: string): void {
    this.sendCommand({
      type: 'train',
      playerId: this.humanPlayerId,
      buildingId,
      unitDefId,
    });
  }

  /** Ra lệnh attack-move cho các unit quân sự đang chọn tới world (x, y). */
  issueAttackMove(x: number, y: number): void {
    const ids = this.selectedMilitary().map((u) => u.id);
    if (ids.length === 0) return;
    this.sendCommand({ type: 'attackmove', playerId: this.humanPlayerId, unitIds: ids, x, y });
  }

  /** Ra lệnh khai thác node tài nguyên (Phase 7). */
  issueGather(targetId: number, resource: ResourceType): void {
    const ids = this.selectedVillagers().map((u) => u.id);
    if (ids.length === 0) return;
    this.sendCommand({ type: 'gather', playerId: this.humanPlayerId, unitIds: ids, targetId, resource });
  }

  /** Click phải vào địch: mọi unit đang chọn của phe mình tấn công mục tiêu. */
  issueAttack(targetId: number): void {
    const owned = new Set(this.unitsOfPlayer(this.humanPlayerId).map((u) => u.id));
    const ids = [...this.selection.selected].filter((id) => owned.has(id));
    if (ids.length === 0) return;
    this.sendCommand({ type: 'attack', playerId: this.humanPlayerId, unitIds: ids, targetId });
  }

  /** Click phải vào nhà đang xây của mình: dân đang chọn tới xây tiếp. */
  issueBuildSite(siteId: number): void {
    const site = this.entities.get(siteId);
    const ids = this.selectedVillagers().map((v) => v.id);
    if (!site || ids.length === 0) return;
    this.sendCommand({
      type: 'build',
      playerId: this.humanPlayerId,
      unitIds: ids,
      buildingId: defIdOf(site),
      x: site.x,
      y: site.y,
      siteId,
    });
  }

  /** Ra lệnh dừng (phím S): các unit đang chọn của phe mình đứng yên, hủy nhiệm vụ. */
  issueStop(): void {
    const owned = new Set(this.unitsOfPlayer(this.humanPlayerId).map((u) => u.id));
    const ids = [...this.selection.selected].filter((id) => owned.has(id));
    if (ids.length === 0) return;
    this.sendCommand({ type: 'stop', playerId: this.humanPlayerId, unitIds: ids });
  }

  /** Ra lệnh xóa (phím Delete): phá unit/nhà đang chọn của phe mình. */
  issueDelete(): void {
    const ids = [...this.selection.selected].filter((id) => {
      const e = this.interp.get(id);
      return !!e && e.playerId === this.humanPlayerId && (e.kind === 'unit' || e.kind === 'building');
    });
    if (ids.length === 0) return;
    this.sendCommand({ type: 'delete', playerId: this.humanPlayerId, unitIds: ids });
    this.selection.clear();
  }

  /** Xin pause/resume trận (phím P/F3) — server broadcast 'paused'/'resumed'. */
  sendPause(paused: boolean): void {
    if (!this.room) return;
    this.room.send('pause', { kind: 'pause', paused });
  }

  /** Ra lệnh research tech tại nhà (entity id). */
  issueResearch(buildingId: number, techId: string): void {
    this.sendCommand({
      type: 'research',
      playerId: this.humanPlayerId,
      buildingId,
      techId,
    });
  }

  /* ─────────── Đọc state hiển thị ─────────── */

  /** Tất cả dân (villager) đang được chọn của phe mình. */
  selectedVillagers(): SimUnitEntity[] {
    const out: SimUnitEntity[] = [];
    for (const id of this.selection.selected) {
      const e = this.interp.get(id);
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

  /** Tất cả unit quân sự (không phải dân) đang được chọn của phe mình. */
  selectedMilitary(): SimUnitEntity[] {
    const out: SimUnitEntity[] = [];
    for (const id of this.selection.selected) {
      const e = this.interp.get(id);
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

  /** Nhà duy nhất của phe mình đang được chọn (count === 1). */
  selectedBuilding(): SimEntity | undefined {
    if (this.selection.count !== 1) return undefined;
    const id = [...this.selection.selected][0];
    const e = this.interp.get(id);
    if (e && e.kind === 'building' && e.playerId === this.humanPlayerId) return e;
    return undefined;
  }

  /** defId của entity (net: từ dict; local: e.defId). */
  defIdOf(e: SimEntity): string {
    return isSimUnit(e) ? e.defId : ((e as { defId?: string }).defId ?? '');
  }

  /** Tài nguyên + pop của phe mình (từ snapshot mới nhất đã render). */
  humanResources(): { resources: ResourceBag; pop: number; popCap: number } {
    return this.lastRes;
  }

  /** Danh sách tech đã nghiên cứu — snapshot chưa có → [] (UI hiện tất cả). */
  playerTechs(_pid: number): string[] {
    return [];
  }

  /** Banner lên đời: đọc event ageUp từ snapshot đang render (mỗi event 1 lần). */
  drainAgeUpEvents(): { playerId: number; ageName: string; flavor: string }[] {
    const out: { playerId: number; ageName: string; flavor: string }[] = [];
    const n = this.snaps.length;
    if (n === 0) return out;
    const targetT = this.snaps[n - 1].t - RENDER_DELAY_TICKS;
    let ai = 0;
    for (let i = 0; i < n; i++) {
      if (this.snaps[i].t <= targetT) ai = i;
    }
    const snapA = this.snaps[ai];
    if (snapA.t <= this.evSeenT) return out;
    this.evSeenT = snapA.t;
    for (const ev of snapA.ev ?? []) {
      if (ev.type !== 'ageUp') continue;
      const age = AGES.find((a) => a.id === ev.newAge);
      out.push({
        playerId: ev.playerId,
        ageName: age?.vnName ?? ev.newAge ?? '?',
        flavor: age?.flavor ?? '',
      });
    }
    return out;
  }

  /** Tất cả unit của 1 phe. */
  unitsOfPlayer(pid: number): SimEntity[] {
    const out: SimEntity[] = [];
    for (const e of this.interp.values()) {
      if (e.kind === 'unit' && e.playerId === pid) out.push(e);
    }
    return out;
  }

  /** Entity (unit/nhà/tài nguyên) dưới con trỏ — bắt theo hình sprite. */
  entityAt(x: number, y: number): SimEntity | undefined {
    return pickEntity(this.interp.values(), x, y);
  }

  /** Fog local của phe mình (tính từ entities đã nội suy). */
  getVision(pid: number): VisionMap | undefined {
    return pid === this.humanPlayerId ? this.vision : undefined;
  }

  /** Projectile từ snapshot (x/y world px). */
  getProjectiles(): SimProjectile[] {
    return this.projectiles;
  }
}
