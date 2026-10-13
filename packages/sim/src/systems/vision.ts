// System tầm nhìn Phase 5a: fog of war (explored giữ, visible reset mỗi lần).
// Mỗi player 2 mảng Uint8Array w×h; unit/building cộng los hình tròn.
// Gọi mỗi 5 tick từ Game.update. Deterministic (không random).

import { UNITS } from '../data/units';
import type { Game } from '../Game';

/** Tầm nhìn mặc định của nhà (tile) — nhà không có los riêng trong def. */
const BUILDING_LOS = 3;

/**
 * Cập nhật fog of war cho mọi player: visible reset rồi cộng lại,
 * explored giữ nguyên (đã thấy thì nhớ mãi).
 */
export function updateVision(game: Game): void {
  const map = game.map;
  if (!map) return;
  const w = map.width;
  const h = map.height;
  const n = game.players.length;
  for (let i = 0; i < n; i++) {
    let vis = game.visionVisible[i];
    let exp = game.visionExplored[i];
    if (!vis || vis.length !== w * h) {
      vis = new Uint8Array(w * h);
      game.visionVisible[i] = vis;
    }
    if (!exp || exp.length !== w * h) {
      exp = new Uint8Array(w * h);
      game.visionExplored[i] = exp;
    }
    vis.fill(0);
  }
  for (const e of game.entities.values()) {
    if (e.kind !== 'unit' && e.kind !== 'building') continue;
    const pid = e.playerId;
    if (pid < 0 || pid >= n) continue;
    const los =
      e.kind === 'unit' ? (UNITS[e.defId]?.los ?? 0) : BUILDING_LOS;
    if (los <= 0) continue;
    const vis = game.visionVisible[pid];
    const exp = game.visionExplored[pid];
    if (!vis || !exp) continue;
    addCircle(vis, exp, w, h, e.x, e.y, los);
  }
}

/** Cộng hình tròn bán kính los (tile) vào visible + explored. */
function addCircle(
  vis: Uint8Array,
  exp: Uint8Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  los: number,
): void {
  const x0 = Math.max(0, Math.floor(cx - los));
  const x1 = Math.min(w - 1, Math.ceil(cx + los));
  const y0 = Math.max(0, Math.floor(cy - los));
  const y1 = Math.min(h - 1, Math.ceil(cy + los));
  const r2 = los * los;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) {
        const idx = y * w + x;
        vis[idx] = 1;
        exp[idx] = 1;
      }
    }
  }
}
