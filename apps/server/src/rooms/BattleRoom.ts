import { Room, Client } from 'colyseus';
import { Game, TICK_RATE, UNITS, BUILDINGS, RESOURCES } from '@aoe-vn/sim';
import type { Command } from '@aoe-vn/sim';
import type {
  ClientMessage,
  InitMsg,
  SnapMsg,
} from '@aoe-vn/protocol';

/**
 * BattleRoom: 1 phòng = 1 trận 1v1. Server authoritative hoàn chỉnh (Phase 6a).
 *
 * Luồng: 2 người join → đếm ngược 3s → setupMatch → sim loop 20Hz,
 * snapshot 15Hz. Out giữa trận → pause; cả 2 out quá 60s → dispose.
 */

// --- Hằng số đã chốt ---
/** Giới hạn lệnh mỗi client: 30 lệnh/giây (sliding window). */
const CMD_RATE_LIMIT = 30;
/** Trần số unitIds trong 1 lệnh. */
const MAX_UNIT_IDS = 200;
/** Đếm ngược lobby trước khi trận bắt đầu (giây). */
const COUNTDOWN_SEC = 3;
/** Snapshot 15Hz. */
const SNAP_INTERVAL_MS = Math.round(1000 / 15); // ~66ms
/** Cả 2 out quá 60s → dispose room. */
const EMPTY_ROOM_TTL_MS = 60_000;
/** Tần số sim 20Hz. */
const SIM_INTERVAL_MS = 1000 / TICK_RATE;

/** Các type lệnh hợp lệ của Command. */
const VALID_CMD_TYPES = new Set([
  'move',
  'attack',
  'attackmove',
  'gather',
  'build',
  'train',
  'research',
  'stop',
  'delete',
]);

interface PlayerSlot {
  sessionId: string;
  name: string;
}

export class BattleRoom extends Room {
  maxClients = 2;

  private game!: Game;
  private simTimer?: NodeJS.Timeout;
  private snapTimer?: NodeJS.Timeout;
  private countdownTimer?: NodeJS.Timeout;
  private emptyRoomTimer?: NodeJS.Timeout;

  /** playerId (0/1) → slot (null = trống). */
  private slots: Array<PlayerSlot | null> = [null, null];
  /** sessionId → playerId. */
  private sessionToPid = new Map<string, number>();
  /** Dict defId gửi 1 lần trong 'init' (SnapEntity.d trỏ vào đây). */
  private defDict: string[] = [];

  private started = false;
  private paused = false;
  private countingDown = false;
  /** Seed ngẫu nhiên của trận (gửi trong init để client có thể replay/dự đoán). */
  private matchSeed = '';
  /** Rate-limit: sessionId → timestamps (ms) các lệnh trong 1s gần nhất. */
  private cmdTimes = new Map<string, number[]>();

  onCreate(): void {
    // Dict defId CHỐT: keys của UNITS + BUILDINGS + RESOURCES (định danh ổn định).
    this.defDict = [
      ...Object.keys(UNITS),
      ...Object.keys(BUILDINGS),
      ...Object.keys(RESOURCES),
    ];
    // Game được dựng thật khi đếm ngược xong (seed ngẫu nhiên mỗi trận).
    this.game = new Game(this.roomId, 2);
    console.log(`[room:${this.roomId}] tạo phòng battle (chờ 2 người chơi)`);

    // Handler message đăng ký 1 lần (Colyseus 0.16).
    this.onMessage('*', (client, _type, message: ClientMessage) => {
      if (!message || typeof message !== 'object') return;
      if (message.kind === 'chat') {
        const slot = this.slotOf(client.sessionId);
        const from = slot ? slot.name : client.sessionId.slice(0, 6);
        const text = typeof message.text === 'string' ? message.text.slice(0, 500) : '';
        this.broadcast('chat', { kind: 'chat', from, text });
      } else if (message.kind === 'command') {
        this.handleCommand(client, message.command as unknown as Record<string, unknown>);
      } else if (message.kind === 'pause') {
        // Người chơi bấm P/F3: pause/resume trận cho cả 2 bên (giống bản gốc).
        const pid = this.sessionToPid.get(client.sessionId);
        if (pid === undefined || !this.started || this.isOver()) return;
        const want = (message as { paused?: unknown }).paused === true;
        if (want === this.paused) return;
        this.paused = want;
        console.log(`[room:${this.roomId}] pid=${pid} ${want ? 'tạm dừng' : 'tiếp tục'} trận`);
        this.broadcast(want ? 'paused' : 'resumed', { kind: want ? 'paused' : 'resumed' });
      }
    });
  }

  // ---------------------------------------------------------------
  // Join / Leave / Reconnect
  // ---------------------------------------------------------------

  onJoin(client: Client, options: Record<string, unknown>): void {
    const name =
      typeof options?.playerName === 'string' && options.playerName.trim()
        ? options.playerName.trim().slice(0, 32)
        : 'Ẩn danh';

    // Gán slot playerId trống đầu tiên (0 rồi 1). maxClients=2 nên luôn còn slot.
    const pid = this.slots.findIndex((s) => s === null);
    if (pid === -1) {
      console.warn(`[room:${this.roomId}] ${client.sessionId} join nhưng hết slot`);
      client.leave();
      return;
    }
    this.slots[pid] = { sessionId: client.sessionId, name };
    this.sessionToPid.set(client.sessionId, pid);
    this.cmdTimes.delete(client.sessionId);
    console.log(`[room:${this.roomId}] ${name} (${client.sessionId}) vào slot ${pid}`);

    // Có người vào → hủy timer dispose phòng trống.
    if (this.emptyRoomTimer) {
      clearTimeout(this.emptyRoomTimer);
      this.emptyRoomTimer = undefined;
    }

    this.broadcastLobby();

    if (this.started) {
      // Rejoin giữa trận: gửi lại init, unpause nếu đủ 2 người.
      this.sendInit(client, pid);
      if (this.bothPresent() && this.paused) {
        this.paused = false;
        console.log(`[room:${this.roomId}] đủ 2 người → tiếp tục trận`);
        this.broadcast('resumed', { kind: 'resumed' });
      }
    } else if (this.bothPresent() && !this.countingDown) {
      this.startCountdown();
    }
  }

  onLeave(client: Client): void {
    const pid = this.sessionToPid.get(client.sessionId);
    console.log(`[room:${this.roomId}] ${client.sessionId} (pid=${pid ?? '?'}) rời trận`);
    if (pid !== undefined) {
      this.slots[pid] = null;
      this.sessionToPid.delete(client.sessionId);
    }
    this.cmdTimes.delete(client.sessionId);
    this.broadcastLobby();

    if (this.started && !this.isOver()) {
      // Pause ngay khi có người out giữa trận (sim không update khi pause).
      this.paused = true;
      this.broadcast('paused', { kind: 'paused' });
      console.log(`[room:${this.roomId}] tạm dừng trận (chờ reconnect)`);
    }

    // Cả 2 out quá 60s → dispose phòng.
    if (this.clients.length === 0 && !this.emptyRoomTimer) {
      this.emptyRoomTimer = setTimeout(() => {
        if (this.clients.length === 0) {
          console.log(`[room:${this.roomId}] trống quá 60s → dispose`);
          this.disconnect();
        }
      }, EMPTY_ROOM_TTL_MS);
    }
  }

  onDispose(): void {
    if (this.simTimer) clearInterval(this.simTimer);
    if (this.snapTimer) clearInterval(this.snapTimer);
    if (this.countdownTimer) clearTimeout(this.countdownTimer);
    if (this.emptyRoomTimer) clearTimeout(this.emptyRoomTimer);
    console.log(`[room:${this.roomId}] đóng trận`);
  }

  // ---------------------------------------------------------------
  // Countdown → start match
  // ---------------------------------------------------------------

  private bothPresent(): boolean {
    return this.slots[0] !== null && this.slots[1] !== null;
  }

  private broadcastLobby(): void {
    const players = this.slots
      .map((s, playerId) => (s ? { name: s.name, playerId } : null))
      .filter((p): p is { name: string; playerId: number } => p !== null);
    this.broadcast('lobby', { kind: 'lobby', players });
  }

  private startCountdown(): void {
    this.countingDown = true;
    console.log(`[room:${this.roomId}] đủ 2 người → đếm ngược ${COUNTDOWN_SEC}s`);
    for (let s = COUNTDOWN_SEC; s >= 1; s--) {
      this.clock.setTimeout(() => {
        if (!this.bothPresent() || this.started) return;
        this.broadcast('countdown', { kind: 'countdown', seconds: s });
      }, (COUNTDOWN_SEC - s) * 1000);
    }
    this.countdownTimer = setTimeout(() => {
      this.countdownTimer = undefined;
      this.countingDown = false;
      if (!this.bothPresent() || this.started) {
        console.log(`[room:${this.roomId}] hủy bắt đầu trận (thiếu người)`);
        return;
      }
      this.beginMatch();
    }, COUNTDOWN_SEC * 1000);
  }

  private beginMatch(): void {
    const seed = Math.random().toString(36).slice(2, 10);
    this.matchSeed = seed;
    const names = [this.slots[0]!.name, this.slots[1]!.name];
    this.game = new Game(seed, 2);
    this.game.setupMatch(seed, names);
    this.started = true;
    this.paused = false;
    console.log(`[room:${this.roomId}] bắt đầu trận (seed=${seed}, ${names.join(' vs ')})`);

    // Gửi init riêng cho từng client (myPid khác nhau).
    for (const client of this.clients) {
      const pid = this.sessionToPid.get(client.sessionId);
      if (pid !== undefined) this.sendInit(client, pid);
    }

    // Sim loop 20Hz — chỉ update khi started && !paused && chưa có winner.
    this.simTimer = setInterval(() => {
      if (!this.started || this.paused) return;
      if (this.isOver()) return;
      try {
        this.game.update();
        if (this.game.winner !== null) this.onGameOver();
      } catch (err) {
        console.error(`[room:${this.roomId}] lỗi sim tick ${this.game.getTick()}:`, err);
      }
    }, SIM_INTERVAL_MS);

    // Snapshot 15Hz — chỉ khi started && !paused.
    this.snapTimer = setInterval(() => {
      if (!this.started || this.paused) return;
      try {
        this.broadcast('snap', this.buildSnap());
      } catch (err) {
        console.error(`[room:${this.roomId}] lỗi build snapshot:`, err);
      }
    }, SNAP_INTERVAL_MS);
  }

  private sendInit(client: Client, pid: number): void {
    const msg: InitMsg = {
      kind: 'init',
      seed: this.matchSeed,
      dict: this.defDict,
      myPid: pid,
      names: [this.slots[0]?.name ?? '', this.slots[1]?.name ?? ''],
    };
    client.send('init', msg);
    console.log(`[room:${this.roomId}] gửi init cho pid=${pid} (${client.sessionId})`);
  }

  // ---------------------------------------------------------------
  // Commands: validate → ép playerId → rate-limit → game.addCommand
  // ---------------------------------------------------------------

  private slotOf(sessionId: string): PlayerSlot | undefined {
    const pid = this.sessionToPid.get(sessionId);
    return pid !== undefined ? (this.slots[pid] ?? undefined) : undefined;
  }

  private handleCommand(client: Client, raw: Record<string, unknown>): void {
    const pid = this.sessionToPid.get(client.sessionId);
    if (pid === undefined) {
      console.warn(`[room:${this.roomId}] lệnh từ client chưa có slot → bỏ`);
      return;
    }
    if (!this.started || this.paused || this.isOver()) {
      console.warn(
        `[room:${this.roomId}] lệnh từ pid=${pid} khi trận chưa chạy/đang pause → bỏ`,
      );
      return;
    }

    // Rate-limit 30 lệnh/giây/client (sliding window).
    const now = Date.now();
    let times = this.cmdTimes.get(client.sessionId);
    if (!times) {
      times = [];
      this.cmdTimes.set(client.sessionId, times);
    }
    while (times.length > 0 && now - times[0]! > 1000) times.shift();
    if (times.length >= CMD_RATE_LIMIT) {
      console.warn(
        `[room:${this.roomId}] pid=${pid} vượt rate-limit (${CMD_RATE_LIMIT}/s) → bỏ lệnh`,
      );
      return;
    }

    // Validate shape cơ bản.
    if (!raw || typeof raw !== 'object' || !VALID_CMD_TYPES.has(raw.type as string)) {
      console.warn(`[room:${this.roomId}] pid=${pid} gửi lệnh sai type → bỏ`);
      return;
    }
    const cmd = raw as Record<string, unknown>;
    if ('unitIds' in cmd) {
      const ids = cmd.unitIds;
      if (
        !Array.isArray(ids) ||
        ids.length === 0 ||
        ids.length > MAX_UNIT_IDS ||
        !ids.every((v) => typeof v === 'number' && Number.isFinite(v))
      ) {
        console.warn(`[room:${this.roomId}] pid=${pid} gửi unitIds không hợp lệ → bỏ`);
        return;
      }
    }
    for (const key of ['x', 'y'] as const) {
      if (key in cmd && (typeof cmd[key] !== 'number' || !Number.isFinite(cmd[key]))) {
        console.warn(`[room:${this.roomId}] pid=${pid} gửi tọa độ không hợp lệ → bỏ`);
        return;
      }
    }

    // ÉP playerId = playerId của client gửi (không tin client).
    cmd.playerId = pid;

    times.push(now);
    this.game.addCommand(cmd as unknown as Command);
  }

  // ---------------------------------------------------------------
  // Snapshot 15Hz (format CHỐT trong @aoe-vn/protocol)
  // ---------------------------------------------------------------

  private buildSnap(): SnapMsg {
    const entities: SnapMsg['e'] = [];
    for (const e of this.game.entities.values()) {
      const d = this.defDict.indexOf(e.defId);
      if (d === -1) continue; // def lạ: bỏ khỏi snapshot cho an toàn
      // resource node không có hp → dùng amount (trữ lượng còn lại).
      const hp = e.kind === 'resource' ? e.amount : e.hp;
      const base = {
        i: e.id,
        d,
        x: round2(e.x),
        y: round2(e.y),
        hp: Math.ceil(hp),
      };
      if (e.kind === 'unit') {
        entities.push({ ...base, k: 0, p: e.playerId, s: e.state });
      } else if (e.kind === 'building') {
        entities.push({ ...base, k: 1, p: e.playerId, s: '' });
      } else {
        entities.push({ ...base, k: 2, p: -1, s: '' });
      }
    }
    // Duyệt entities theo id tăng dần cho deterministic (không bắt buộc
    // nhưng giúp client diff ổn định).
    entities.sort((a, b) => a.i - b.i);

    const p: SnapMsg['p'] = this.game.players.map((pl) => ({
      r: [
        Math.floor(pl.resources.wood),
        Math.floor(pl.resources.food),
        Math.floor(pl.resources.gold),
        Math.floor(pl.resources.stone),
      ],
      pop: pl.pop,
      cap: pl.popCap,
      age: pl.age,
    }));

    const pr: SnapMsg['pr'] = this.game.projectiles.map((prj) => ({
      i: prj.id,
      x: round2(prj.x),
      y: round2(prj.y),
    }));

    const ev: SnapMsg['ev'] = this.game.events.map((ev) => ({
      type: ev.type,
      playerId: ev.playerId,
      newAge: 'newAge' in ev ? (ev as { newAge?: string }).newAge : undefined,
    }));
    this.game.events.length = 0; // đã gửi → clear

    return {
      kind: 'snap',
      t: this.game.getTick(),
      e: entities,
      p,
      pr,
      ev,
      w: this.game.winner,
    };
  }

  // ---------------------------------------------------------------
  // Victory
  // ---------------------------------------------------------------

  private isOver(): boolean {
    return this.game.winner !== null;
  }

  private onGameOver(): void {
    console.log(`[room:${this.roomId}] KẾT THÚC — người thắng: pid=${this.game.winner}`);
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = undefined;
    }
    if (this.snapTimer) {
      clearInterval(this.snapTimer);
      this.snapTimer = undefined;
    }
    this.broadcast('gameover', { kind: 'gameover', winner: this.game.winner });
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
