/**
 * nettest.ts — test E2E thủ công cho BattleRoom (Phase 6a, server authoritative).
 *
 * CHẠY:
 *   Terminal 1:  cd apps/server && node dist/index.js        (server build mới nhất)
 *   Terminal 2:  cd apps/server && npx tsx src/nettest.ts
 *
 * KỊCH BẢN (soak 2 phút, test 20 phút thật không khả thi ở đây):
 *   1. 2 client colyseus.js joinOrCreate('battle') cùng room.
 *   2. Chờ cả 2 nhận 'init' (kèm myPid, dict, seed).
 *   3. Client0 gửi lệnh move cho 1 unit của mình → assert unit di chuyển.
 *   4. Client0 gửi lệnh move cho unit của CLIENT1 (kèm playerId giả) →
 *      assert unit địch KHÔNG di chuyển (server ép playerId).
 *   5. Chạy soak 120s → assert:
 *        - cả 2 client nhận snap đều (mỗi client ≥ 100 snap ≈ 15Hz × ~7s trở lên;
 *          thực tế 120s ≈ 1800 snap)
 *        - tick tăng đơn điệu
 *        - không exception ở client lẫn server (server log tay ở terminal 1)
 *
 * In PASS/FAIL + chi tiết.
 */
import { Client, Room } from 'colyseus.js';

const WS_URL = process.env.AOE_SERVER_URL ?? 'ws://localhost:2567';
const SOAK_MS = Number(process.env.AOE_SOAK_MS ?? 120_000);
const MIN_SNAPS = 100;

// --- Kiểu message server → client (khớp packages/protocol/src/index.ts) ---
interface SnapEntity {
  i: number;
  k: 0 | 1 | 2;
  p: number;
  d: number;
  x: number;
  y: number;
  hp: number;
  s: string;
}
interface SnapMsg {
  kind: 'snap';
  t: number;
  e: SnapEntity[];
  p: { r: [number, number, number, number]; pop: number; cap: number; age: string }[];
  pr: { i: number; x: number; y: number }[];
  ev: { type: string; playerId: number; newAge?: string }[];
  w: number | null;
}
interface InitMsg {
  kind: 'init';
  seed: string;
  dict: string[];
  myPid: number;
  names: string[];
}
interface LobbyMsg {
  kind: 'lobby';
  players: { name: string; playerId: number }[];
}

interface ClientStats {
  name: string;
  myPid: number;
  inits: number;
  snaps: number;
  maxTick: number;
  lastTick: number;
  tickWentBackwards: boolean;
  dictLen: number;
  seed: string;
}

const failures: string[] = [];
function fail(msg: string): void {
  failures.push(msg);
  console.error(`  ✗ FAIL: ${msg}`);
}
function ok(msg: string): void {
  console.log(`  ✓ ${msg}`);
}
function waitFor(cond: () => boolean, timeoutMs: number, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const iv = setInterval(() => {
      if (cond()) {
        clearInterval(iv);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(iv);
        reject(new Error(`timeout chờ ${label} (${timeoutMs}ms)`));
      }
    }, 100);
  });
}
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  console.log(`[nettest] kết nối ${WS_URL} ...`);

  const mkClient = async (name: string): Promise<{ room: Room; stats: ClientStats }> => {
    const client = new Client(WS_URL);
    const room = await client.joinOrCreate('battle', { playerName: name });
    const stats: ClientStats = {
      name,
      myPid: -1,
      inits: 0,
      snaps: 0,
      maxTick: -1,
      lastTick: -1,
      tickWentBackwards: false,
      dictLen: 0,
      seed: '',
    };
    // Lưu snap mới nhất để test logic đọc vị trí unit.
    room.onMessage('init', (m: InitMsg) => {
      stats.inits++;
      stats.myPid = m.myPid;
      stats.dictLen = m.dict.length;
      stats.seed = m.seed;
      latestSnap.set(room.sessionId, undefined as unknown as SnapMsg);
      console.log(`[nettest] ${name} nhận init: myPid=${m.myPid}, seed=${m.seed}, dict=${m.dict.length}, names=${m.names.join(' vs ')}`);
    });
    room.onMessage('snap', (m: SnapMsg) => {
      stats.snaps++;
      if (m.t < stats.lastTick) stats.tickWentBackwards = true;
      stats.lastTick = m.t;
      if (m.t > stats.maxTick) stats.maxTick = m.t;
      latestSnap.set(room.sessionId, m);
    });
    room.onMessage('lobby', (m: LobbyMsg) => {
      console.log(`[nettest] ${name} lobby: ${m.players.map((p) => `${p.name}#${p.playerId}`).join(', ')}`);
    });
    room.onMessage('countdown', (m: { seconds: number }) => {
      console.log(`[nettest] đếm ngược: ${m.seconds}s`);
    });
    room.onMessage('gameover', (m: { winner: number }) => {
      console.log(`[nettest] gameover! winner=${m.winner}`);
    });
    return { room, stats };
  };

  const c0 = await mkClient('TestBot0');
  const c1 = await mkClient('TestBot1');
  console.log(`[nettest] cả 2 đã join room ${c0.room.roomId}`);

  // --- Chờ init (countdown 3s + setup) ---
  await waitFor(
    () => c0.stats.inits > 0 && c1.stats.inits > 0,
    30_000,
    'init cho cả 2 client',
  );
  ok('cả 2 client nhận được init');
  if (c0.stats.myPid === c1.stats.myPid) fail('myPid trùng nhau giữa 2 client');
  else ok(`myPid phân biệt: ${c0.stats.myPid} vs ${c1.stats.myPid}`);
  if (!c0.stats.seed || c0.stats.seed !== c1.stats.seed) fail('seed init không khớp');
  else ok(`seed khớp: ${c0.stats.seed}`);
  if (c0.stats.dictLen === 0) fail('dict rỗng');
  else ok(`dict defId có ${c0.stats.dictLen} mục`);

  // --- Chờ vài snap để lấy vị trí unit ---
  await waitFor(() => c0.stats.snaps >= 3 && c1.stats.snaps >= 3, 15_000, 'snap đầu tiên');
  ok('bắt đầu nhận snap 15Hz');

  const myUnits = (snap: SnapMsg | undefined, pid: number): SnapEntity[] =>
    (snap?.e ?? []).filter((e) => e.k === 0 && e.p === pid);

  const snap0 = latestSnap.get(c0.room.sessionId);
  const units0 = myUnits(snap0, c0.stats.myPid);
  const units1 = myUnits(snap0, c1.stats.myPid);
  if (units0.length === 0) fail('không thấy unit của client0 trong snap');
  if (units1.length === 0) fail('không thấy unit của client1 trong snap');
  if (units0.length === 0 || units1.length === 0) throw new Error('thiếu unit, dừng test');

  // --- Test 1: move unit của mình → phải di chuyển ---
  const mover = units0[0]!;
  const startX = mover.x;
  const startY = mover.y;
  const tx = startX + 25;
  const ty = startY + 25;
  c0.room.send('command', {
    kind: 'command',
    clientTick: 0,
    command: {
      type: 'move',
      playerId: c0.stats.myPid,
      unitIds: [mover.i],
      x: tx,
      y: ty,
    },
  });
  console.log(`[nettest] gửi lệnh move unit ${mover.i} của pid=${c0.stats.myPid} → (${tx}, ${ty})`);

  // --- Test 2: client0 ra lệnh cho unit của client1 (playerId giả mạo) → phải bị chặn ---
  const victim = units1[0]!;
  const victimStartX = victim.x;
  const victimStartY = victim.y;
  c0.room.send('command', {
    kind: 'command',
    clientTick: 0,
    command: {
      type: 'move',
      playerId: c1.stats.myPid, // giả mạo: khai là pid của client1
      unitIds: [victim.i],
      x: victim.x + 40,
      y: victim.y + 40,
    },
  });
  console.log(`[nettest] gửi lệnh move GIẢ MẠO cho unit ${victim.i} của địch (server phải ép playerId → bỏ)`);

  // Đợi 8s rồi kiểm tra di chuyển.
  await sleep(8000);
  const snapAfter = latestSnap.get(c0.room.sessionId);
  const movedUnit = (snapAfter?.e ?? []).find((e) => e.i === mover.i);
  const victimUnit = (snapAfter?.e ?? []).find((e) => e.i === victim.i);
  if (movedUnit) {
    const dist = Math.hypot(movedUnit.x - startX, movedUnit.y - startY);
    console.log(`[nettest] unit ${mover.i}: (${startX},${startY}) → (${movedUnit.x},${movedUnit.y}) s=${movedUnit.s}, đi được ${dist.toFixed(1)} tile`);
    if (dist > 2) ok(`unit của mình di chuyển theo lệnh (${dist.toFixed(1)} tile)`);
    else fail(`unit của mình KHÔNG di chuyển (chỉ ${dist.toFixed(2)} tile)`);
  } else {
    fail(`không còn thấy unit ${mover.i} trong snap`);
  }
  if (victimUnit) {
    const dist = Math.hypot(victimUnit.x - victimStartX, victimUnit.y - victimStartY);
    console.log(`[nettest] unit địch ${victim.i}: đi được ${dist.toFixed(2)} tile sau lệnh giả mạo`);
    if (dist < 0.5) ok('lệnh giả mạo playerId bị chặn (unit địch đứng yên)');
    else fail(`lệnh giả mạo KHÔNG bị chặn! unit địch di chuyển ${dist.toFixed(1)} tile`);
  }

  // --- Soak: chạy tiếp tới đủ SOAK_MS ---
  const elapsed = 8000;
  const remain = Math.max(0, SOAK_MS - elapsed - 30_000);
  console.log(`[nettest] soak thêm ${(remain / 1000).toFixed(0)}s ...`);
  await sleep(remain);

  // --- Assert cuối ---
  console.log('[nettest] ---- KẾT QUẢ ----');
  for (const c of [c0, c1]) {
    console.log(`  ${c.stats.name}: snaps=${c.stats.snaps}, maxTick=${c.stats.maxTick}`);
  }
  if (c0.stats.snaps < MIN_SNAPS) fail(`client0 chỉ nhận ${c0.stats.snaps} snap (< ${MIN_SNAPS})`);
  else ok(`client0 nhận ${c0.stats.snaps} snap đều`);
  if (c1.stats.snaps < MIN_SNAPS) fail(`client1 chỉ nhận ${c1.stats.snaps} snap (< ${MIN_SNAPS})`);
  else ok(`client1 nhận ${c1.stats.snaps} snap đều`);
  if (c0.stats.tickWentBackwards || c1.stats.tickWentBackwards) {
    fail('tick snapshot bị đi lùi');
  } else {
    ok('tick snapshot tăng đơn điệu');
  }
  if (c0.stats.maxTick < 100) fail(`tick quá thấp (${c0.stats.maxTick}) — sim có chạy 20Hz?`);
  else ok(`sim chạy ổn định tới tick ${c0.stats.maxTick}`);

  console.log('[nettest] =======================');
  if (failures.length === 0) {
    console.log('PASS — mọi assert đều đạt, không exception.');
  } else {
    console.log(`FAIL — ${failures.length} assert rớt:`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }

  await c0.room.leave();
  await c1.room.leave();
  process.exit(process.exitCode ?? 0);
}

// sessionId → snap mới nhất (dùng cho assert vị trí).
const latestSnap = new Map<string, SnapMsg>();

main().catch((err) => {
  console.error('[nettest] EXCEPTION:', err);
  console.log('FAIL — exception trong quá trình test.');
  process.exit(1);
});
