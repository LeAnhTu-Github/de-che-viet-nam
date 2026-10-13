// System thắng/thua Phase 5a: player hết unit VÀ hết building → defeated;
// còn đúng 1 player sống → over + winner.

import type { Game } from '../Game';

export interface VictoryResult {
  over: boolean;
  winner: number | null;
}

/** Kiểm tra điều kiện thắng/thua toàn trận. */
export function checkVictory(game: Game): VictoryResult {
  const alive: number[] = [];
  for (const p of game.players) {
    let has = false;
    for (const e of game.entities.values()) {
      if (
        (e.kind === 'unit' || e.kind === 'building') &&
        e.playerId === p.id &&
        e.hp > 0
      ) {
        has = true;
        break;
      }
    }
    if (has) alive.push(p.id);
  }
  if (alive.length === 1) return { over: true, winner: alive[0] ?? null };
  if (alive.length === 0) return { over: true, winner: null };
  return { over: false, winner: null };
}
