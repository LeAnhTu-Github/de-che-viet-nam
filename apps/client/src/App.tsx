import { useState } from 'react';
import type { Room } from 'colyseus.js';
import { useUiStore } from './store';
import { GameView } from './game/GameView';
import { Lobby } from './ui/Lobby';
import { getElo } from './game/elo';

type GameMode = 'local' | 'net';

/** Menu chính: tiêu đề + nhập tên + chơi local / chơi mạng / hướng dẫn. */
function Menu({ onLocal, onNet, onTutorial }: { onLocal: () => void; onNet: () => void; onTutorial: () => void }) {
  const { playerName, setPlayerName } = useUiStore();
  const elo = getElo(playerName);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-8 bg-[#1a1410]">
      <div className="text-center">
        <h1 className="text-6xl font-black tracking-wide text-rom drop-shadow-lg">
          ĐẾ CHẾ VIỆT NAM
        </h1>
        <p className="mt-3 text-lg text-amber-100/70">
          Game chiến thuật thời gian thực — Văn Lang thời Hùng Vương
        </p>
      </div>

      <input
        className="rounded border border-dat bg-black/40 px-4 py-2 text-center text-amber-50 outline-none focus:border-rom"
        value={playerName}
        maxLength={20}
        onChange={(e) => setPlayerName(e.target.value)}
        placeholder="Tên tướng quân..."
      />

      <div className="flex items-center gap-2 text-sm text-amber-100/70">
        <span>🏅 ELO: <span className="font-bold text-amber-300">{elo.elo}</span></span>
        <span className="opacity-60">(Thắng {elo.wins} • Thua {elo.losses} — lưu local, Supabase cần key ngoài)</span>
      </div>

      <div className="flex gap-4">
        <button
          className="rounded-lg bg-rom px-10 py-3 text-xl font-bold text-[#1a1410] shadow-lg transition hover:brightness-110 active:scale-95"
          onClick={onLocal}
        >
          ⚔ Chơi thử
        </button>
        <button
          className="rounded-lg bg-dat px-10 py-3 text-xl font-bold text-white shadow-lg transition hover:brightness-110 active:scale-95"
          onClick={onNet}
        >
          🌐 Chơi mạng
        </button>
        <button
          className="rounded-lg bg-tre px-10 py-3 text-xl font-bold text-white shadow-lg transition hover:brightness-110 active:scale-95"
          onClick={onTutorial}
        >
          📖 Hướng dẫn
        </button>
      </div>

      <p className="text-xs text-amber-100/40">
        Phase 6b — chơi mạng 1v1 qua lobby. Nhớ bật server: <code>pnpm dev</code>
      </p>
    </div>
  );
}

export default function App() {
  const { screen, setScreen } = useUiStore();
  const [mode, setMode] = useState<GameMode>('local');
  const [room, setRoom] = useState<Room | null>(null);
  const [tutorial, setTutorial] = useState(false);

  if (screen === 'menu') {
    return (
      <Menu
        onLocal={() => {
          setMode('local');
          setRoom(null);
          setTutorial(false);
          setScreen('game');
        }}
        onNet={() => setScreen('lobby')}
        onTutorial={() => {
          setMode('local');
          setRoom(null);
          setTutorial(true);
          setScreen('game');
        }}
      />
    );
  }

  if (screen === 'lobby') {
    return (
      <Lobby
        onStart={(r) => {
          setMode('net');
          setRoom(r);
          setScreen('game');
        }}
        onLocal={() => {
          setMode('local');
          setRoom(null);
          setScreen('game');
        }}
      />
    );
  }

  return <GameView key={mode + (tutorial ? '-tut' : '')} mode={mode} room={mode === 'net' ? (room ?? undefined) : undefined} tutorial={tutorial} />;
}
