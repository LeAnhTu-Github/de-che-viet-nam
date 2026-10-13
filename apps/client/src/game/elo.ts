/**
 * elo.ts — ELO local (stub).
 *
 * LƯU Ý: Supabase Auth + leaderboard thật cần API key ngoài (chưa có) →
 * stub localStorage này thay thế tạm. Khi có key, thay recordResult/getElo
 * bằng gọi Supabase, giữ nguyên interface.
 */

export interface EloRecord {
  elo: number;
  wins: number;
  losses: number;
}

const START_ELO = 1000;
const K = 16;

function key(name: string): string {
  return `aoevn_elo_${name.trim().toLowerCase() || 'vok danh'}`;
}

/** Đọc ELO của 1 tên (mặc định 1000). */
export function getElo(name: string): EloRecord {
  try {
    const raw = localStorage.getItem(key(name));
    if (raw) {
      const r = JSON.parse(raw) as Partial<EloRecord>;
      return { elo: r.elo ?? START_ELO, wins: r.wins ?? 0, losses: r.losses ?? 0 };
    }
  } catch { /* bỏ qua */ }
  return { elo: START_ELO, wins: 0, losses: 0 };
}

/** Ghi kết quả trận: thắng +16, thua -16 (K=16 đơn giản). */
export function recordResult(name: string, won: boolean): EloRecord {
  const r = getElo(name);
  const next: EloRecord = {
    elo: Math.max(100, r.elo + (won ? K : -K)),
    wins: r.wins + (won ? 1 : 0),
    losses: r.losses + (won ? 0 : 1),
  };
  try { localStorage.setItem(key(name), JSON.stringify(next)); } catch { /* bỏ qua */ }
  return next;
}
