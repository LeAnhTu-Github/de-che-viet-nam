/**
 * Lobby.tsx — Phase 6b: sảnh chờ multiplayer (2 người).
 *
 * Nhập tên → [Tạo phòng] → hiện mã phòng (6 ký tự cuối roomId) + mã đầy đủ
 * để chia sẻ → [Vào phòng] nhập mã đầy đủ → hiện 2 ghế → đủ 2 người →
 * tự vào GameView (net mode) sau 3s. Giữ nút "Chơi thử (local)".
 */
import { useEffect, useRef, useState } from 'react';
import type { Room } from 'colyseus.js';
import type { LobbyMsg } from '@aoe-vn/protocol';
import { useUiStore } from '../store';
import { createBattle, joinBattleById, disconnectFromBattle } from '../net/client';

interface LobbyProps {
  /** Đủ 2 người → App chuyển sang GameView net mode với room này. */
  onStart: (room: Room) => void;
  /** Chơi đơn local như cũ. */
  onLocal: () => void;
}

interface Seat {
  name: string;
  playerId: number;
}

/** Mã ngắn để đọc/nhớ: 6 ký tự cuối roomId, in hoa. */
export function shortRoomCode(roomId: string): string {
  return roomId.slice(-6).toUpperCase();
}

export function Lobby({ onStart, onLocal }: LobbyProps) {
  const { playerName, setPlayerName, setScreen } = useUiStore();
  const [room, setRoom] = useState<Room | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [codeInput, setCodeInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const startedRef = useRef(false);
  const roomRef = useRef<Room | null>(null);
  roomRef.current = room;

  // Rời phòng khi unmount lobby (trừ khi đã onStart → GameView sở hữu room).
  useEffect(() => {
    return () => {
      if (!startedRef.current) {
        disconnectFromBattle();
      }
    };
  }, []);

  /** Lắng nghe ghế lobby từ server (defensive: server chưa gửi thì hiện ghế mình). */
  const watchRoom = (r: Room): void => {
    r.onMessage('lobby', (msg: LobbyMsg) => {
      try {
        if (Array.isArray(msg.players)) setSeats(msg.players);
      } catch {
        /* bỏ qua message lỗi */
      }
    });
    r.onLeave(() => {
      if (startedRef.current) return;
      setRoom(null);
      setSeats([]);
      setCountdown(null);
      setError('Đã rời phòng (mất kết nối hoặc phòng đóng).');
    });
  };

  const handleCreate = async (): Promise<void> => {
    const name = playerName.trim() || 'Tướng quân';
    setPlayerName(name);
    setBusy(true);
    setError('');
    try {
      const r = await createBattle(name);
      watchRoom(r);
      setRoom(r);
      // Fallback nếu server chưa implement message 'lobby': hiện ghế mình.
      setSeats([{ name, playerId: 0 }]);
    } catch (err) {
      setError(`Không tạo được phòng: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (): Promise<void> => {
    const code = codeInput.trim();
    if (!code) {
      setError('Nhập mã phòng đầy đủ (mã 6 ký tự chỉ để đọc cho nhanh).');
      return;
    }
    const name = playerName.trim() || 'Tướng quân';
    setPlayerName(name);
    setBusy(true);
    setError('');
    try {
      const r = await joinBattleById(code, name);
      watchRoom(r);
      setRoom(r);
      setSeats([{ name, playerId: -1 }]);
    } catch (err) {
      setError(`Không vào được phòng: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(false);
    }
  };

  // Đủ 2 ghế → đếm ngược 3s → vào trận.
  useEffect(() => {
    if (!room || seats.length < 2 || startedRef.current) return;
    setCountdown(3);
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c === null) return null;
        if (c <= 1) {
          clearInterval(t);
          startedRef.current = true;
          onStart(room);
          return null;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, seats.length]);

  const copyFull = async (): Promise<void> => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Không copy được — bôi đen mã đầy đủ để copy tay.');
    }
  };

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-[#1a1410] px-4">
      <div className="text-center">
        <h1 className="text-5xl font-black tracking-wide text-rom drop-shadow-lg">
          SẢNH CHỜ
        </h1>
        <p className="mt-2 text-amber-100/70">Đánh online 1v1 — chia sẻ mã phòng cho đối thủ</p>
      </div>

      {!room ? (
        <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-black/40 p-6">
          <input
            className="rounded border border-dat bg-black/40 px-4 py-2 text-center text-amber-50 outline-none focus:border-rom"
            value={playerName}
            maxLength={20}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Tên tướng quân..."
          />
          <button
            className="rounded-lg bg-rom px-6 py-3 text-lg font-bold text-[#1a1410] hover:brightness-110 disabled:opacity-50"
            disabled={busy}
            onClick={handleCreate}
          >
            {busy ? 'Đang tạo...' : '🏰 Tạo phòng'}
          </button>
          <div className="flex gap-2">
            <input
              className="min-w-0 flex-1 rounded border border-dat bg-black/40 px-3 py-2 font-mono text-sm text-amber-50 outline-none focus:border-rom"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="Nhập mã phòng đầy đủ..."
              spellCheck={false}
            />
            <button
              className="rounded bg-dat px-4 py-2 font-semibold text-white hover:brightness-110 disabled:opacity-50"
              disabled={busy}
              onClick={handleJoin}
            >
              Vào phòng
            </button>
          </div>
          {error && <div className="text-center text-sm text-red-400">{error}</div>}
          <div className="mt-2 border-t border-white/10 pt-4 text-center">
            <button
              className="rounded-lg bg-tre px-6 py-2 font-semibold text-white hover:brightness-110"
              onClick={onLocal}
            >
              ⚔ Chơi thử (local)
            </button>
          </div>
        </div>
      ) : (
        <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-xl bg-black/40 p-6">
          <div className="text-center">
            <div className="text-sm text-amber-100/60">Mã phòng</div>
            <div className="font-mono text-4xl font-black tracking-widest text-amber-300">
              {shortRoomCode(room.roomId)}
            </div>
            <div className="mt-1 flex items-center justify-center gap-2 text-xs text-amber-100/50">
              <span className="max-w-[240px] truncate font-mono">{room.roomId}</span>
              <button
                className="rounded bg-white/10 px-2 py-0.5 hover:bg-white/20"
                onClick={copyFull}
              >
                {copied ? '✓ Đã copy' : 'Copy mã đầy đủ'}
              </button>
            </div>
            <div className="mt-1 text-xs text-amber-100/40">
              Đọc mã 6 ký tự cho đối thủ, họ nhập mã đầy đủ vào ô "Vào phòng"
            </div>
          </div>

          <div className="grid w-full grid-cols-2 gap-2">
            {[0, 1].map((i) => (
              <div
                key={i}
                className={`rounded px-3 py-2 text-center text-sm ${
                  seats[i] ? 'bg-tre font-semibold text-white' : 'bg-white/5 text-amber-100/40'
                }`}
              >
                {seats[i] ? `🛡 ${seats[i].name}` : '⏳ Đang chờ...'}
              </div>
            ))}
          </div>

          {countdown !== null ? (
            <div className="text-2xl font-black text-green-400">
              Đủ 2 người! Vào trận sau {countdown}s...
            </div>
          ) : (
            <div className="text-sm text-amber-100/60">Chờ đối thủ vào phòng...</div>
          )}

          <button
            className="text-sm text-amber-100/50 underline hover:text-amber-100"
            onClick={() => {
              disconnectFromBattle();
              setRoom(null);
              setSeats([]);
            }}
          >
            Hủy phòng
          </button>
          {error && <div className="text-center text-sm text-red-400">{error}</div>}
        </div>
      )}

      <button
        className="text-sm text-amber-100/50 underline hover:text-amber-100"
        onClick={() => setScreen('menu')}
      >
        ← Về menu chính
      </button>
    </div>
  );
}
