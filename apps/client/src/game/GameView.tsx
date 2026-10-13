/**
 * GameView — Màn hình game Phase 6b: local (như cũ) + net (multiplayer qua Colyseus).
 *
 * 2 mode dùng chung 100% HUD/panel/input/renderer, khác nhau ở controller:
 *   - local: LocalGameController (sim chạy local 20 tick/s)
 *   - net:   NetGameController (snapshot server 15Hz, nội suy ~133ms delay)
 *
 * Vòng lặp requestAnimationFrame: stepAccum + beforeRender (nội suy net) + syncToRenderer.
 */
import { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import type { Room } from 'colyseus.js';
import { BUILDINGS, TECHS, UNITS, RESOURCES } from '@aoe-vn/sim';
import type { ResourceBag, ResourceType, TechDef } from '@aoe-vn/sim';
import { type AIDifficulty } from './localGame';
import { useUiStore } from '../store';
import { connectToBattle, disconnectFromBattle } from '../net/client';
import { shortRoomCode } from '../ui/Lobby';
import { GameRenderer } from './renderer';
import { TILE_SIZE } from './map';
import { createRealMap } from './simMapAdapter';
import { LocalGameController, type VisionMap } from './localGame';
import { NetGameController } from './netGame';
import type { GameController, HumanResState } from './entitySync';
import { defIdOf } from './entitySync';
import { FogRenderer } from './fog';
import {
  playAgeUpDrum, playSelect, playMoveOrder, playAttackOrder, playBuildOrder,
  playGatherOrder, playAlarm, playVictory, playDefeat, playBuildDone,
  isMuted, setMuted,
} from './sound';
import { recordResult } from './elo';
import type { WorldPoint } from './input';

const MAP_NAME = 'Đồng bằng sông Hồng (map thật từ sim)';

/** Các bước tutorial tân thủ (Phase 7). */
const TUTORIAL_STEPS = [
  { id: 'select', label: 'Kéo chuột (trái) chọn 1 nông dân của bạn' },
  { id: 'gather', label: 'Click PHẢI vào cây/tre để chặt gỗ' },
  { id: 'house', label: 'Xây 1 Nhà sàn: chọn dân → nút 🏠 ở panel dưới' },
  { id: 'train', label: 'Train thêm 1 nông dân tại Đình làng' },
  { id: 'age', label: 'Nghiên cứu "Lên Thời dựng nước" tại Đình làng' },
] as const;

/** true nếu entity là dân làng (theo defId). */
function isVillagerDef(defId: string): boolean {
  return defId === 'villager_m' || defId === 'villager_f';
}

/**
 * Kiểm tra bước tutorial hiện tại có xong chưa → trả về bước tiếp theo.
 * Trả về TUTORIAL_STEPS.length khi hoàn thành toàn bộ.
 */
function checkTutorialStep(c: GameController, step: number): number {
  const me = c.humanPlayerId;
  const cur = TUTORIAL_STEPS[step]?.id;
  if (!cur) return step;
  const own = [...c.entities.values()].filter((e) => e.playerId === me);
  let done = false;
  switch (cur) {
    case 'select':
      done = c.selectedVillagers().length > 0;
      break;
    case 'gather':
      done = own.some(
        (e) => e.kind === 'unit' && (e as { state?: string }).state === 'gathering',
      );
      break;
    case 'house':
      done = own.some((e) => e.kind === 'building' && defIdOf(e) === 'house');
      break;
    case 'train':
      done = own.filter((e) => e.kind === 'unit' && isVillagerDef(defIdOf(e))).length > 3;
      break;
    case 'age':
      done = c.playerTechs(me).includes('age_tool');
      break;
  }
  return done ? step + 1 : step;
}

/** 10 nhà trong menu xây của dân (Phase 4b MVP). */
const BUILD_MENU = [
  'town_center', // Đình làng
  'house', // Nhà sàn
  'granary', // Kho thóc
  'storage_pit', // Nhà kho
  'farm', // Ruộng lúa
  'barracks', // Trại lính
  'archery_range', // Trường bắn
  'stable', // Chuồng ngựa
  'watch_tower', // Chòi canh
  'small_wall', // Lũy đất
];

const RES_ICON: Record<ResourceType, string> = {
  wood: '🌲',
  food: '🍖',
  gold: '🪙',
  stone: '🪨',
};
const RES_ORDER: ResourceType[] = ['wood', 'food', 'gold', 'stone'];

function formatCost(cost: Partial<ResourceBag>): string {
  const parts: string[] = [];
  for (const k of RES_ORDER) {
    const v = cost[k];
    if (v) parts.push(`${RES_ICON[k]}${v}`);
  }
  return parts.join(' ') || 'Miễn phí';
}

function affordable(cost: Partial<ResourceBag>, res: HumanResState | null): boolean {
  if (!res) return true;
  return RES_ORDER.every((k) => (cost[k] ?? 0) <= res.resources[k]);
}

/**
 * Tech khả dụng tại 1 nhà: chưa nghiên cứu + nhà này nghiên cứu được.
 * NOTE defensive: TECHS hiện chưa có trường age riêng; BuildingDef.researches
 * đang rỗng toàn bộ → fallback hiện mọi tech chưa research ở mọi nhà.
 * Khi worker sim điền researches/age, filter tự siết lại không cần sửa client.
 */
function researchableTechs(c: GameController | null, buildingDefId: string): TechDef[] {
  if (!c) return [];
  const done = new Set(c.playerTechs(c.humanPlayerId));
  const bdef = BUILDINGS[buildingDefId];
  return Object.values(TECHS).filter((t) => {
    if (done.has(t.id)) return false;
    if (bdef && bdef.researches.length > 0 && !bdef.researches.includes(t.id)) return false;
    return true;
  });
}

/** Thông tin chọn hiện tại để vẽ panel dưới. */
type SelInfo =
  | { kind: 'none' }
  | { kind: 'units' }
  | { kind: 'villager' }
  | { kind: 'building'; id: number; defId: string; hp: number; maxHp: number };

function inBox(x: number, y: number, a: WorldPoint, b: WorldPoint): boolean {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

/** Hash string → number cho renderer.init (net mode nhận seed string từ server). */
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface GameViewProps {
  /** 'local' = sim local (mặc định, giữ nguyên behavior cũ); 'net' = snapshot server. */
  mode?: 'local' | 'net';
  /** Room Colyseus từ Lobby (bắt buộc khi mode='net'). */
  room?: Room;
  /** true = chế độ hướng dẫn tân thủ (tắt AI, hiện checklist). */
  tutorial?: boolean;
}

type AiChoice = AIDifficulty | 'off';

export function GameView({ mode = 'local', room, tutorial = false }: GameViewProps) {
  const { setScreen, playerName } = useUiStore();
  const isNet = mode === 'net';
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<GameController | null>(null);
  const netRef = useRef<NetGameController | null>(null);
  const roomRef = useRef<Room | undefined>(room);
  roomRef.current = room;
  const ghostRef = useRef<PIXI.Graphics | null>(null);
  /** defId nhà đang ở chế độ đặt (mirror ref để input callbacks đọc, tránh stale closure). */
  const placingRef = useRef<string | null>(null);
  /** Chế độ attack-move đang chờ click (mirror ref cho input callbacks). */
  const attackMoveRef = useRef(false);
  // local: seed random ngay; net: '' = đang chờ message 'init' từ server.
  const [seed, setSeed] = useState<string | number>(() =>
    isNet ? '' : Math.floor(Math.random() * 1_000_000_000),
  );
  const [entityCount, setEntityCount] = useState(0);
  const [selCount, setSelCount] = useState(0);
  const [netStatus, setNetStatus] = useState(isNet ? 'Đang chờ server (init)...' : 'Đang kết nối server...');
  const [res, setRes] = useState<HumanResState | null>(null);
  const [selInfo, setSelInfo] = useState<SelInfo>({ kind: 'none' });
  const [placing, setPlacing] = useState<string | null>(null);
  const [attackMove, setAttackMove] = useState(false);
  /** Có unit quân sự đang chọn → cho phép bật attack-move (phím A / nút HUD). */
  const [canAttackMove, setCanAttackMove] = useState(false);
  /** Banner lên đời: {ageName, flavor, mine} — tự ẩn sau 6s. */
  const [ageBanner, setAgeBanner] = useState<{ ageName: string; flavor: string; mine: boolean } | null>(null);
  // ── State riêng net mode ──
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState<number | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<{ from: string; text: string }[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const bannerTimer = useRef<number | null>(null);
  // ── State riêng Phase 7 ──
  /** Độ khó AI máy (local mode): 'trungbinh' mặc định, 'off' = sandbox, tutorial → off. */
  const [aiDiff, setAiDiff] = useState<AiChoice>(tutorial ? 'off' : 'trungbinh');
  const [mutedUi, setMutedUi] = useState(isMuted());
  /** ELO sau trận (hiện trong màn hình thắng/thua). */
  const [eloAfter, setEloAfter] = useState<{ elo: number; wins: number; losses: number } | null>(null);
  /** Bước hiện tại của tutorial (null = xong hoặc không phải tutorial). */
  const [tutStep, setTutStep] = useState<number | null>(tutorial ? 0 : null);
  const tutStepRef = useRef<number | null>(tutorial ? 0 : null);
  const prevSelRef = useRef(0);
  const prevOwnHpRef = useRef(0);
  const prevBldCountRef = useRef(0);
  const alarmCoolRef = useRef(0);
  const aiDiffRef = useRef<AiChoice>(tutorial ? 'off' : 'trungbinh');
  /** Tránh setGameOver 2 lần khi winner đã xử lý trong loop. */
  const gameOverRef = useRef<number | null>(null);
  const showAgeBanner = (ageName: string, flavor: string, mine: boolean): void => {
    setAgeBanner({ ageName, flavor, mine });
    if (bannerTimer.current) window.clearTimeout(bannerTimer.current);
    bannerTimer.current = window.setTimeout(() => setAgeBanner(null), 6000);
  };

  const startPlacement = (defId: string): void => {
    placingRef.current = defId;
    setPlacing(defId);
  };
  const cancelPlacement = (): void => {
    placingRef.current = null;
    setPlacing(null);
    ghostRef.current?.clear();
  };

  /** Bật chế độ attack-move: cần có unit quân sự (không phải dân) đang chọn. */
  const enterAttackMove = (): void => {
    const c = controllerRef.current;
    if (!c || c.selectedMilitary().length === 0) return;
    cancelPlacement(); // tránh kẹt 2 chế độ chờ click cùng lúc
    attackMoveRef.current = true;
    setAttackMove(true);
  };
  const cancelAttackMove = (): void => {
    attackMoveRef.current = false;
    setAttackMove(false);
  };

  /** Thoát trận: net → rời phòng; local → như cũ. */
  const handleExit = (): void => {
    setScreen('menu');
  };

  const sendChat = (): void => {
    const nc = netRef.current;
    if (!nc || !chatInput.trim()) return;
    nc.sendChat(chatInput);
    setChatInput('');
  };

  // Phím tắt: A = attack-move, ESC = hủy chế độ đặt nhà / attack-move.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // Đang gõ trong input (chat, lobby...) → bỏ qua phím tắt game.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') {
        cancelPlacement();
        cancelAttackMove();
      } else if ((e.key === 'a' || e.key === 'A') && !e.repeat) {
        enterAttackMove();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Con trỏ crosshair khi ở chế độ attack-move.
  useEffect(() => {
    const host = hostRef.current;
    if (host) host.style.cursor = attackMove ? 'crosshair' : '';
  }, [attackMove]);

  // Poll tài nguyên phe người + số entity mỗi 250ms (không re-render mỗi frame).
  useEffect(() => {
    const t = setInterval(() => {
      const c = controllerRef.current;
      if (c) {
        setRes(c.humanResources());
        setEntityCount(c.entities.size);
      }
    }, 250);
    return () => clearInterval(t);
  }, []);

  // Kết nối Colyseus (chỉ local mode giữ behavior Phase 1a — net mode đã có room từ Lobby).
  useEffect(() => {
    if (isNet) return;
    let cancelled = false;
    connectToBattle(playerName)
      .then((r) => {
        if (!cancelled) setNetStatus(`Đã vào trận ${r.roomId}`);
      })
      .catch(() => {
        if (!cancelled) setNetStatus('Không kết nối được server');
      });
    return () => {
      cancelled = true;
      disconnectFromBattle();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNet, playerName]);

  // Net mode: tạo NetGameController + đăng ký nghe init/snap/paused/gameover/chat.
  useEffect(() => {
    if (!isNet || !room) return;
    const nc = new NetGameController();
    netRef.current = nc;
    nc.connect(room, {
      onInit: (info) => {
        setSeed(info.seed);
        setNetStatus(`Trận net • mã ${shortRoomCode(room.roomId)} • phe ${info.myPid}`);
      },
      onPaused: (p) => setPaused(p),
      onGameOver: (winner) => {
        gameOverRef.current = winner;
        const won = winner === (netRef.current?.humanPlayerId ?? -1);
        if (won) playVictory(); else playDefeat();
        setEloAfter(recordResult(playerName, won));
        setGameOver(winner);
      },
      onChat: (from, text) =>
        setChatMsgs((ms) => [...ms.slice(-49), { from, text }]),
      onDisconnect: () => setDisconnected(true),
    });
    return () => {
      netRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNet, room]);

  // Dựng renderer + controller + vòng lặp game. Net mode chờ seed từ init.
  useEffect(() => {
    if (isNet && (seed === '' || !netRef.current)) return;
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let raf = 0;
    let fog: FogRenderer | null = null;
    const renderer = new GameRenderer(host);
    const controller: GameController = isNet
      ? (netRef.current as NetGameController)
      : new LocalGameController(String(seed));
    controllerRef.current = controller;
    const { map } = createRealMap(String(seed));
    if (isNet) {
      (controller as NetGameController).setMapSize(map.width, map.height);
    }
    const dragGfx = new PIXI.Graphics();
    const ghostGfx = new PIXI.Graphics();
    ghostRef.current = ghostGfx;

    /** Cập nhật panel React theo tập chọn hiện tại. */
    const refreshSelection = (): void => {
      if (cancelled) return;
      const n = controller.selection.count;
      if (n > prevSelRef.current && n > 0) playSelect(); // Phase 7: tiếng chọn
      prevSelRef.current = n;
      setSelCount(n);
      setCanAttackMove(controller.selectedMilitary().length > 0);
      const b = controller.selectedBuilding();
      if (b) {
        const defId = (b as { defId?: string }).defId ?? '';
        setSelInfo({ kind: 'building', id: b.id, defId, hp: b.hp, maxHp: b.maxHp });
      } else if (controller.selectedVillagers().length > 0) {
        setSelInfo({ kind: 'villager' });
      } else if (controller.selection.count > 0) {
        setSelInfo({ kind: 'units' });
      } else {
        setSelInfo({ kind: 'none' });
      }
    };
    controller.selection.setOnChange(refreshSelection);

    const drawDragRect = (a: WorldPoint, b: WorldPoint): void => {
      dragGfx.clear();
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(a.x - b.x);
      const h = Math.abs(a.y - b.y);
      dragGfx.rect(x, y, w, h).fill({ color: 0x35a5ff, alpha: 0.12 });
      dragGfx.rect(x, y, w, h).stroke({ color: 0x35a5ff, width: 2 / renderer.camera.zoom });
    };

    /** Vẽ bóng ma nhà tại chuột (world px), căn giữa theo kích thước def. */
    const drawGhost = (defId: string, w: WorldPoint): void => {
      const def = BUILDINGS[defId];
      ghostGfx.clear();
      if (!def) return;
      const [sw, sh] = def.size.split('x').map(Number);
      const pw = sw * TILE_SIZE;
      const ph = sh * TILE_SIZE;
      const x = w.x - pw / 2;
      const y = w.y - ph / 2;
      ghostGfx.rect(x, y, pw, ph).fill({ color: 0xf5b301, alpha: 0.3 });
      ghostGfx.rect(x, y, pw, ph).stroke({ color: 0xf5b301, width: 2 / renderer.camera.zoom });
    };

    void renderer
      .init(map, typeof seed === 'number' ? seed : hashSeed(seed))
      .then(() => {
        if (cancelled) {
          renderer.destroy();
          return;
        }
        if (!isNet) {
          (controller as LocalGameController).setup();
        }
        renderer.overlay.addChild(dragGfx);
        renderer.overlay.addChild(ghostGfx);
        fog = new FogRenderer(renderer, map.width * TILE_SIZE, map.height * TILE_SIZE);
        refreshSelection();

        renderer.setInputCallbacks({
          // Bóng ma đặt nhà theo chuột
          onMouseMove: (w) => {
            const p = placingRef.current;
            if (p) drawGhost(p, w);
            else ghostGfx.clear();
          },
          // Vẽ khung chọn trực tiếp trong lúc kéo (không vẽ khi đang đặt nhà / attack-move)
          onLeftDragMove: (a, b) => {
            if (!placingRef.current && !attackMoveRef.current) drawDragRect(a, b);
          },
          // Thả chuột: chọn TẤT CẢ unit của phe người trong khung
          onLeftDrag: (a, b) => {
            dragGfx.clear();
            if (placingRef.current || attackMoveRef.current) return;
            const ids = controller
              .unitsOfPlayer(controller.humanPlayerId)
              .filter((u) => inBox(u.x, u.y, a, b))
              .map((u) => u.id);
            controller.selection.selectBox(ids);
          },
          // Click trái: attack-move đang chờ → ra lệnh; đặt nhà → issueBuild; ngược lại chọn 1 unit/nhà
          onLeftClick: (w) => {
            if (attackMoveRef.current) {
              controller.issueAttackMove(w.x, w.y);
              playAttackOrder();
              cancelAttackMove();
              return;
            }
            const p = placingRef.current;
            if (p) {
              controller.issueBuild(p, w.x, w.y);
              playBuildOrder();
              return; // giữ chế độ đặt để đặt tiếp nhiều nhà
            }
            const e = controller.entityAt(w.x, w.y, 40);
            if (
              e &&
              e.playerId === controller.humanPlayerId &&
              (e.kind === 'unit' || e.kind === 'building')
            ) {
              controller.selection.select(e.id);
            } else {
              controller.selection.clear();
            }
          },
          // Chuột phải: attack-move đang chờ → hủy; đặt nhà → hủy;
          // click vào node tài nguyên → dân khai thác; ngược lại ra lệnh di chuyển
          onRightClick: (w) => {
            if (attackMoveRef.current) {
              cancelAttackMove();
              return;
            }
            if (placingRef.current) {
              placingRef.current = null;
              setPlacing(null);
              ghostGfx.clear();
              return;
            }
            // Phase 7: click phải vào tài nguyên → dân đi khai thác (trước đây client chưa từng gửi gather!).
            const target = controller.entityAt(w.x, w.y, 40);
            if (
              target &&
              target.kind === 'resource' &&
              controller.selectedVillagers().length > 0
            ) {
              const rdef = RESOURCES[defIdOf(target)];
              if (rdef) {
                controller.issueGather(target.id, rdef.resource);
                playGatherOrder();
                return;
              }
            }
            controller.issueMove(w.x, w.y);
            playMoveOrder();
          },
        });

        const sp = map.spawnPoints[0];
        renderer.centerCamera((sp.tx + 0.5) * TILE_SIZE, (sp.ty + 0.5) * TILE_SIZE);
        setEntityCount(controller.entities.size);

        let last = performance.now();
        let fogAcc = 0; // poll vision mỗi 200ms (đủ mượt, rẻ)
        let sndAcc = 0; // poll âm thanh sự kiện mỗi 1s
        const loop = (now: number): void => {
          if (cancelled) return;
          const dt = Math.min((now - last) / 1000, 0.1);
          last = now;
          controller.stepAccum(dt);
          controller.beforeRender?.(); // net: nội suy snapshot; local: no-op
          controller.syncToRenderer(renderer);
          // Banner + trống đồng khi có ageUp (phe mình to, phe địch nhỏ)
          for (const au of controller.drainAgeUpEvents()) {
            const mine = au.playerId === controller.humanPlayerId;
            showAgeBanner(au.ageName, au.flavor, mine);
            if (mine) playAgeUpDrum();
          }
          fogAcc += dt;
          if (fogAcc >= 0.2) {
            fogAcc = 0;
            const vision: VisionMap | undefined = controller.getVision(
              controller.humanPlayerId,
            );
            fog?.update(vision);
            renderer.setFogVision(vision ?? null, controller.humanPlayerId);
          }
          // ── Phase 7: âm thanh sự kiện + thắng local + tutorial (poll 1s, rẻ) ──
          sndAcc += dt;
          if (sndAcc >= 1) {
            sndAcc = 0;
            const me = controller.humanPlayerId;
            // Báo động khi HP tổng của phe mình giảm (cooldown 8s).
            let ownHp = 0;
            let bldDone = 0;
            for (const e of controller.entities.values()) {
              if (e.playerId !== me) continue;
              if (e.kind === 'unit' || e.kind === 'building') {
                ownHp += e.hp;
                if (e.kind === 'building' && (e as { complete?: boolean }).complete) bldDone++;
              }
            }
            if (prevOwnHpRef.current > 0 && ownHp < prevOwnHpRef.current - 1) {
              const t = performance.now() / 1000;
              if (t - alarmCoolRef.current > 8) {
                alarmCoolRef.current = t;
                playAlarm();
              }
            }
            prevOwnHpRef.current = ownHp;
            // Xây xong nhà mới → tiếng gõ gỗ vui.
            if (prevBldCountRef.current > 0 && bldDone > prevBldCountRef.current) playBuildDone();
            prevBldCountRef.current = bldDone;
            // Thắng/thua local mode.
            if (!isNet && gameOverRef.current === null) {
              const w = (controller as LocalGameController).getWinner();
              if (w !== null) {
                gameOverRef.current = w;
                const won = w === me;
                if (won) playVictory(); else playDefeat();
                setEloAfter(recordResult(playerName, won));
                setGameOver(w);
              }
            }
            // Tutorial: kiểm tra bước hiện tại.
            if (tutStepRef.current !== null && !isNet) {
              const next = checkTutorialStep(controller, tutStepRef.current);
              if (next !== tutStepRef.current) {
                const done = next >= TUTORIAL_STEPS.length;
                tutStepRef.current = done ? null : next;
                setTutStep(done ? null : next);
              }
            }
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      })
      .catch((err) => {
        console.error('[game] khởi tạo renderer thất bại:', err);
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      fog?.destroy();
      fog = null;
      controller.selection.setOnChange(null);
      controllerRef.current = null;
      ghostRef.current = null;
      placingRef.current = null;
      setPlacing(null);
      attackMoveRef.current = false;
      setAttackMove(false);
      // Reset trạng thái kết thúc trận khi đổi seed / rời trận.
      gameOverRef.current = null;
      setGameOver(null);
      setEloAfter(null);
      renderer.destroy();
      // Net mode: rời phòng khi unmount (Về menu / thắng thua / mất kết nối).
      if (isNet) {
        const r = roomRef.current;
        roomRef.current = undefined;
        if (r) {
          try {
            void r.leave();
          } catch {
            /* bỏ qua */
          }
        }
        disconnectFromBattle();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, isNet]);

  // Phase 7: bật/tắt AI máy (local mode). Chạy sau effect dựng game để controllerRef đã có.
  useEffect(() => {
    if (isNet) return;
    const c = controllerRef.current;
    if (c instanceof LocalGameController) {
      c.setAI(aiDiff === 'off' ? null : aiDiff);
      aiDiffRef.current = aiDiff;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiDiff, isNet]);

  const bdef = selInfo.kind === 'building' && selInfo.defId ? BUILDINGS[selInfo.defId] : undefined;
  const hpPct = bdef && selInfo.kind === 'building' ? Math.max(0, (selInfo.hp / selInfo.maxHp) * 100) : 0;
  const myPid = netRef.current?.humanPlayerId ?? 0;
  const iWon = gameOver !== null && gameOver === myPid;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#14100b]">
      {/* PixiJS canvas mount ở đây (host là positioned ancestor của minimap) */}
      <div ref={hostRef} className="absolute inset-0" />

      {/* Loading khi net mode chờ init từ server */}
      {isNet && seed === '' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#14100b]">
          <div className="text-2xl font-bold text-amber-200">Đang chờ server gửi dữ liệu trận...</div>
          <div className="text-sm text-amber-100/60">
            Nếu quá 15s vẫn chưa vào, server chưa implement message 'init' — quay lại lobby thử lại.
          </div>
          <button
            className="rounded bg-dat px-6 py-2 font-semibold text-white hover:brightness-110"
            onClick={() => setScreen('lobby')}
          >
            ← Về sảnh chờ
          </button>
        </div>
      )}

      {/* HUD: thông tin map + chọn unit */}
      <div className="pointer-events-none absolute left-3 top-3 z-30 rounded bg-black/60 px-3 py-2 text-xs text-amber-100">
        <div className="text-sm font-bold text-rom">{MAP_NAME}</div>
        <div>
          {isNet ? (
            <>Mã phòng: <span className="font-mono font-bold text-amber-300">{room ? shortRoomCode(room.roomId) : '…'}</span></>
          ) : (
            <>Seed: <span className="font-mono">{seed}</span></>
          )}{' '}
          • Entity: {entityCount}
        </div>
        <div>
          Đã chọn: <span className="font-bold text-green-400">{selCount}</span> unit
        </div>
        <div className="text-amber-100/60">
          {netStatus} — {playerName}
        </div>
      </div>

      {/* Thanh tài nguyên trên cùng (poll 250ms) */}
      <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded bg-black/60 px-4 py-2 text-sm text-amber-100">
        {res ? (
          <div className="flex items-center gap-4 font-mono">
            <span title="Gỗ">🌲 {Math.floor(res.resources.wood)}</span>
            <span title="Thịt">🍖 {Math.floor(res.resources.food)}</span>
            <span title="Vàng">🪙 {Math.floor(res.resources.gold)}</span>
            <span title="Đá">🪨 {Math.floor(res.resources.stone)}</span>
            <span title="Dân số / giới hạn">
              👥 {res.pop}/{res.popCap}
            </span>
          </div>
        ) : (
          <span className="text-amber-100/50">…</span>
        )}
      </div>

      {/* Banner khi đang ở chế độ attack-move */}
      {attackMove && !placing && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded bg-red-600/95 px-4 py-1.5 text-sm font-bold text-white">
          ⚔️ Tấn công-di chuyển: click trái lên map để ra lệnh • ESC / chuột phải để hủy
        </div>
      )}

      {/* Banner lên đời: trống đồng + tên thời + flavor */}
      {ageBanner && (
        <div className="pointer-events-none absolute left-1/2 top-1/3 z-40 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className={`rounded-xl border-2 px-8 py-5 shadow-2xl ${ageBanner.mine ? 'border-amber-400 bg-black/85' : 'border-gray-500 bg-black/70'}`}>
            <div className="text-3xl">{ageBanner.mine ? '🔔' : '⚠️'}</div>
            <div className={`mt-1 text-2xl font-extrabold ${ageBanner.mine ? 'text-amber-300' : 'text-gray-300'}`}>
              {ageBanner.mine ? `LÊN ĐỜI: ${ageBanner.ageName}` : `Địch đã lên ${ageBanner.ageName}`}
            </div>
            {ageBanner.mine && ageBanner.flavor && (
              <div className="mt-2 max-w-md text-sm italic text-amber-100/90">“{ageBanner.flavor}”</div>
            )}
          </div>
        </div>
      )}

      {/* Banner khi đang ở chế độ đặt nhà */}
      {placing && BUILDINGS[placing] && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded bg-amber-500/95 px-4 py-1.5 text-sm font-bold text-black">
          Đang đặt: {BUILDINGS[placing].vnName} — click trái để đặt • chuột phải / ESC để hủy
        </div>
      )}

      {/* Banner tạm dừng (net mode) */}
      {paused && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-black/85 px-10 py-6 text-center">
          <div className="text-3xl">⏸</div>
          <div className="mt-2 text-xl font-bold text-amber-200">Trận đấu tạm dừng</div>
          <div className="mt-1 text-sm text-amber-100/60">Đang chờ server tiếp tục...</div>
        </div>
      )}

      {/* Panel tutorial tân thủ (Phase 7) */}
      {tutStep !== null && (
        <div className="absolute left-3 top-32 z-30 w-72 rounded-lg bg-black/75 p-4 text-sm text-amber-100">
          <div className="mb-2 text-base font-bold text-rom">📖 Hướng dẫn tân thủ</div>
          <div className="space-y-2">
            {TUTORIAL_STEPS.map((s, i) => (
              <div
                key={s.id}
                className={`flex items-start gap-2 rounded px-2 py-1 ${
                  i < tutStep
                    ? 'text-green-400 line-through opacity-70'
                    : i === tutStep
                      ? 'bg-rom/20 font-semibold text-amber-200'
                      : 'opacity-50'
                }`}
              >
                <span>{i < tutStep ? '✅' : i === tutStep ? '👉' : '⬜'}</span>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
          <button
            className="mt-3 w-full rounded bg-dat px-3 py-1 text-xs font-semibold text-white hover:brightness-110"
            onClick={() => {
              tutStepRef.current = null;
              setTutStep(null);
            }}
          >
            Bỏ qua hướng dẫn
          </button>
        </div>
      )}
      {tutStep === null && tutorial && (
        <div className="absolute left-3 top-32 z-30 w-72 rounded-lg bg-black/75 p-4 text-center text-sm text-amber-100">
          <div className="text-2xl">🎉</div>
          <div className="mt-1 font-bold text-green-400">Hoàn thành hướng dẫn!</div>
          <div className="mt-1 text-amber-100/70">
            Giờ hãy thử sức với máy ở độ khó Trung bình nhé.
          </div>
        </div>
      )}

      {/* Màn hình thắng/thua (cả local + net) */}
      {gameOver !== null && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/80">
          <div className="text-6xl">{iWon ? '🏆' : '💀'}</div>
          <div className={`text-5xl font-black ${iWon ? 'text-amber-300' : 'text-gray-400'}`}>
            {iWon ? 'CHIẾN THẮNG!' : 'THẤT BẠI'}
          </div>
          <div className="text-amber-100/70">
            {iWon ? 'Vạn tuế! Non sông thu về một mối.' : 'Thua keo này, ta bày keo khác!'}
          </div>
          {eloAfter && (
            <div className="rounded bg-black/60 px-4 py-2 text-sm text-amber-200">
              ELO của {playerName}: <span className="font-bold">{eloAfter.elo}</span>{' '}
              <span className={iWon ? 'text-green-400' : 'text-red-400'}>
                ({iWon ? '+' : '−'}16)
              </span>{' '}
              • Thắng {eloAfter.wins} / Thua {eloAfter.losses}
            </div>
          )}
          <button
            className="rounded-lg bg-rom px-8 py-3 text-lg font-bold text-[#1a1410] hover:brightness-110"
            onClick={handleExit}
          >
            ← Về menu
          </button>
        </div>
      )}

      {/* Banner mất kết nối (net mode) */}
      {disconnected && gameOver === null && (
        <div className="absolute inset-x-0 top-0 z-50 flex items-center justify-center gap-4 bg-red-700/95 px-4 py-3">
          <span className="font-bold text-white">⚠ Mất kết nối — đang thử vào lại...</span>
          <button
            className="rounded bg-white px-4 py-1 text-sm font-bold text-red-700 hover:brightness-110"
            onClick={() => setScreen('lobby')}
          >
            Vào lại phòng
          </button>
        </div>
      )}

      {/* Nút điều hướng */}
      <div className="absolute right-3 top-3 z-30 flex gap-2">
        {!isNet && tutStep === null && (
          <select
            className="rounded bg-tre px-2 py-2 text-sm font-semibold text-white outline-none hover:brightness-110"
            value={aiDiff}
            title="Đối thủ máy (AI rule-based 3 cấp)"
            onChange={(e) => setAiDiff(e.target.value as AiChoice)}
          >
            <option value="off">🤖 Máy: Tắt</option>
            <option value="de">🤖 Máy: Dễ</option>
            <option value="trungbinh">🤖 Máy: Trung bình</option>
            <option value="kho">🤖 Máy: Khó (+10%)</option>
          </select>
        )}
        <button
          className="rounded bg-tre px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          title={mutedUi ? 'Bật tiếng' : 'Tắt tiếng'}
          onClick={() => {
            const m = !mutedUi;
            setMuted(m);
            setMutedUi(m);
          }}
        >
          {mutedUi ? '🔇' : '🔊'}
        </button>
        {canAttackMove && (
          <button
            className={`rounded px-4 py-2 text-sm font-semibold hover:brightness-110 ${
              attackMove ? 'bg-amber-500 text-black' : 'bg-dat text-white'
            }`}
            title="Phím tắt: A"
            onClick={() => (attackMove ? cancelAttackMove() : enterAttackMove())}
          >
            ⚔️ Tấn công-di chuyển
          </button>
        )}
        {isNet && (
          <button
            className="rounded bg-tre px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
            onClick={() => setChatOpen((o) => !o)}
          >
            💬 Chat
          </button>
        )}
        {!isNet && (
          <button
            className="rounded bg-tre px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
            onClick={() => setSeed(Math.floor(Math.random() * 1_000_000_000))}
          >
            Map mới
          </button>
        )}
        <button
          className="rounded bg-dat px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          onClick={handleExit}
        >
          ← Về menu
        </button>
      </div>

      {/* Khung chat (net mode) */}
      {isNet && chatOpen && (
        <div className="absolute bottom-3 right-3 z-30 flex h-64 w-72 flex-col rounded bg-black/80 p-2 text-sm text-amber-100">
          <div className="mb-1 flex-1 space-y-1 overflow-y-auto px-1">
            {chatMsgs.length === 0 && (
              <div className="text-amber-100/40">Chưa có tin nhắn. Chào đối thủ đi! 👋</div>
            )}
            {chatMsgs.map((m, i) => (
              <div key={i} className="break-words">
                <span className="font-bold text-rom">{m.from}: </span>
                <span>{m.text}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              className="min-w-0 flex-1 rounded bg-white/10 px-2 py-1 outline-none focus:bg-white/15"
              value={chatInput}
              maxLength={200}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') sendChat();
              }}
              placeholder="Nhắn gì đó..."
            />
            <button
              className="rounded bg-tre px-3 py-1 font-semibold text-white hover:brightness-110"
              onClick={sendChat}
            >
              Gửi
            </button>
          </div>
        </div>
      )}

      {/* Panel khi chọn 1 nhà: tên + HP + nút train + nút nâng cấp (Phase 5) */}
      {selInfo.kind === 'building' && bdef && (
        <div className="absolute bottom-3 left-1/2 z-30 w-[540px] max-w-[92vw] -translate-x-1/2 rounded bg-black/70 px-4 py-3 text-amber-100">
          <div className="flex items-center justify-between">
            <div className="text-base font-bold text-rom">{bdef.vnName}</div>
            <div className="text-xs text-amber-100/70">
              HP {Math.ceil(selInfo.hp)}/{selInfo.maxHp}
            </div>
          </div>
          <div className="my-1.5 h-1.5 w-full rounded bg-white/10">
            <div className="h-full rounded bg-green-500" style={{ width: `${hpPct}%` }} />
          </div>
          {bdef.trains.length > 0 ? (
            <div className="mt-1 grid grid-cols-4 gap-1.5">
              {bdef.trains.map((uid) => {
                const udef = UNITS[uid];
                if (!udef) return null;
                const ok = affordable(udef.cost, res);
                return (
                  <button
                    key={uid}
                    onClick={() => controllerRef.current?.trainUnit(selInfo.id, uid)}
                    disabled={!ok}
                    title={formatCost(udef.cost)}
                    className="rounded bg-tre px-2 py-1.5 text-left text-xs text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <div className="font-semibold leading-4">{udef.vnName}</div>
                    <div className="mt-0.5 text-[10px] leading-3 text-amber-100/70">
                      {formatCost(udef.cost)} • {udef.trainTime}s
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-1 text-xs text-amber-100/50">Nhà này không huấn luyện quân.</div>
          )}
          {/* Nâng cấp công nghệ (Phase 5b): gửi research command xuống sim. */}
          <div className="mt-2">
            <div className="mb-1 text-xs font-bold text-rom">Nâng cấp</div>
            {selInfo.kind === 'building' &&
              (() => {
                const techs = researchableTechs(controllerRef.current, selInfo.defId);
                if (techs.length === 0) {
                  return (
                    <div className="text-xs text-amber-100/50">
                      Không có công nghệ nào khả dụng (đã nghiên cứu hết hoặc nhà này không
                      nghiên cứu).
                    </div>
                  );
                }
                return (
                  <div className="grid grid-cols-2 gap-1.5">
                    {techs.map((t) => {
                      const ok = affordable(t.cost, res);
                      return (
                        <button
                          key={t.id}
                          onClick={() =>
                            controllerRef.current?.issueResearch(selInfo.id, t.id)
                          }
                          disabled={!ok}
                          title={`${t.effect} — ${formatCost(t.cost)}`}
                          className="rounded bg-dat px-2 py-1.5 text-left text-xs text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <div className="font-semibold leading-4">{t.vnName}</div>
                          <div className="mt-0.5 text-[10px] leading-3 text-amber-100/70">
                            {formatCost(t.cost)} • {t.researchTime}s
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
          </div>
          <div className="mt-1 text-[10px] text-amber-100/40">
            Tiến độ research đang chạy: sim chưa expose — sẽ hiện khi worker sim xong.
          </div>
        </div>
      )}

      {/* Panel khi chọn dân: lưới 10 nút xây nhà */}
      {selInfo.kind === 'villager' && (
        <div className="absolute bottom-3 left-1/2 z-30 w-[560px] max-w-[94vw] -translate-x-1/2 rounded bg-black/70 px-4 py-3 text-amber-100">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-bold text-rom">
              Xây dựng {placing && BUILDINGS[placing] ? `— đang đặt: ${BUILDINGS[placing].vnName}` : ''}
            </div>
            {placing && (
              <button
                onClick={cancelPlacement}
                className="rounded bg-white/10 px-2 py-0.5 text-xs text-amber-100/70 hover:bg-white/20"
              >
                Hủy đặt (ESC)
              </button>
            )}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {BUILD_MENU.map((id) => {
              const def = BUILDINGS[id];
              if (!def) return null;
              const ok = affordable(def.cost, res);
              const active = placing === id;
              return (
                <button
                  key={id}
                  onClick={() => startPlacement(id)}
                  disabled={!ok}
                  title={formatCost(def.cost)}
                  className={`rounded px-2 py-1.5 text-left text-xs text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 ${
                    active ? 'bg-amber-500 text-black' : 'bg-tre'
                  }`}
                >
                  <div className="font-semibold leading-4">{def.vnName}</div>
                  <div className="mt-0.5 text-[10px] leading-3 text-amber-100/70">
                    {formatCost(def.cost)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Hướng dẫn điều khiển */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-30 rounded bg-black/60 px-3 py-2 text-[11px] leading-5 text-amber-100/80">
        <div className="font-bold text-rom">Điều khiển</div>
        <div>Kéo chuột trái: chọn nhiều unit • Click trái: chọn 1 • Click phải: ra lệnh di chuyển</div>
        <div>Phím A (hoặc nút ⚔️): tấn công-di chuyển — quân đang chọn sẽ đánh mọi địch trên đường</div>
        <div>Chọn dân → panel dưới → click nhà → click trái trên map để đặt (ESC/chuột phải hủy)</div>
        <div>Giữ chuột giữa kéo • WASD / mũi tên • dí chuột sát viền → di chuyển camera</div>
        <div>Lăn chuột → zoom 0.4x–2.5x • Click minimap góc dưới-phải → nhảy camera</div>
      </div>
    </div>
  );
}
