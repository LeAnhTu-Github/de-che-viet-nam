// Flow field pathfinding cho game RTS — Phase 3.
// Dijkstra lan từ ô đích trên lưới tile: mỗi ô lưu hướng đi (8 hướng)
// tới ô kề rẻ nhất trên đường về đích, cộng chi phí toàn map.
// Deterministic tuyệt đối: không Math.random/Date.now, heap tie-break
// theo index ô, mọi vòng lặp theo thứ tự cố định.

/** Interface tối thiểu mà FlowField cần từ map (GameMap thỏa mãn). */
export interface FlowFieldMap {
  readonly width: number;
  readonly height: number;
  readonly version: number;
  get(x: number, y: number): { walkable: boolean; cost: number };
}

/** Chi phí Dijkstra: đi thẳng 10, đi chéo 14 (nhân với tile.cost). */
const COST_STRAIGHT = 10;
const COST_DIAGONAL = 14;

/** 8 hướng kề theo thứ tự cố định (đi thẳng trước, chéo sau). */
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** Binary min-heap (cost, index); tie-break theo index → deterministic. */
class MinHeap {
  private costs: number[] = [];
  private idxs: number[] = [];

  get size(): number {
    return this.costs.length;
  }

  push(cost: number, idx: number): void {
    const c = this.costs;
    const ii = this.idxs;
    c.push(cost);
    ii.push(idx);
    let i = c.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (less(c[p], ii[p], cost, idx)) break;
      c[i] = c[p];
      ii[i] = ii[p];
      i = p;
    }
    c[i] = cost;
    ii[i] = idx;
  }

  pop(): [number, number] {
    const c = this.costs;
    const ii = this.idxs;
    const topCost = c[0];
    const topIdx = ii[0];
    const lastCost = c.pop() as number;
    const lastIdx = ii.pop() as number;
    if (c.length > 0) {
      // Đặt phần tử cuối lên gốc rồi sift-down chuẩn (swap với con nhỏ nhất).
      c[0] = lastCost;
      ii[0] = lastIdx;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < c.length && less(c[l], ii[l], c[m], ii[m])) m = l;
        if (r < c.length && less(c[r], ii[r], c[m], ii[m])) m = r;
        if (m === i) break;
        const tc = c[i];
        c[i] = c[m];
        c[m] = tc;
        const ti = ii[i];
        ii[i] = ii[m];
        ii[m] = ti;
        i = m;
      }
    }
    return [topCost, topIdx];
  }
}

function less(
  costA: number,
  idxA: number,
  costB: number,
  idxB: number,
): boolean {
  return costA < costB || (costA === costB && idxA < idxB);
}

function clampInt(v: number, lo: number, hi: number): number {
  const i = Math.floor(v);
  return i < lo ? lo : i > hi ? hi : i;
}

/**
 * Tìm ô walkable gần nhất quanh (gx, gy) theo vòng tròn bán kính tăng dần,
 * quét theo thứ tự cố định (dy ngoài, dx trong). Dùng khi ô đích click vào
 * tường/rừng: field tính từ ô đi được gần nhất thay vì toàn Infinity.
 */
function nearestWalkable(
  gx: number,
  gy: number,
  map: FlowFieldMap,
): [number, number] {
  const w = map.width;
  const h = map.height;
  const maxR = Math.max(w, h);
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = gx + dx;
        const y = gy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        if (map.get(x, y).walkable) return [x, y];
      }
    }
  }
  return [gx, gy]; // map toàn tường: giữ nguyên đích (field suy biến)
}

/**
 * Flow field: tại mỗi ô tile, hướng đi (8 hướng) về phía đích rẻ nhất
 * và chi phí Dijkstra từ ô đó tới đích. Ô không tới được: cost = Infinity,
 * directionAt() trả về null.
 */
export class FlowField {
  /** Ô đích hiệu dụng (đã snap tới ô walkable gần nhất nếu cần). */
  readonly goalX: number;
  readonly goalY: number;
  private readonly width: number;
  private readonly height: number;
  private readonly dirX: Int8Array;
  private readonly dirY: Int8Array;
  private readonly dist: Float64Array;

  private constructor(
    goalX: number,
    goalY: number,
    width: number,
    height: number,
    dirX: Int8Array,
    dirY: Int8Array,
    dist: Float64Array,
  ) {
    this.goalX = goalX;
    this.goalY = goalY;
    this.width = width;
    this.height = height;
    this.dirX = dirX;
    this.dirY = dirY;
    this.dist = dist;
  }

  /**
   * Tính flow field bằng Dijkstra lan từ ô đích.
   * - Không đi qua ô !walkable; chi phí bước = (10 thẳng / 14 chéo) * tile.cost.
   * - Đi chéo chỉ khi 2 ô kề trực giao đều walkable (chống cắt góc tường).
   */
  static compute(
    goalTx: number,
    goalTy: number,
    map: FlowFieldMap,
  ): FlowField {
    const w = map.width;
    const h = map.height;
    const n = w * h;
    let gx = clampInt(goalTx, 0, w - 1);
    let gy = clampInt(goalTy, 0, h - 1);
    if (!map.get(gx, gy).walkable) {
      [gx, gy] = nearestWalkable(gx, gy, map);
    }

    const dist = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
    const parent = new Int32Array(n).fill(-1);
    const goalIdx = gy * w + gx;
    dist[goalIdx] = 0;

    const heap = new MinHeap();
    heap.push(0, goalIdx);
    const settled = new Uint8Array(n);

    while (heap.size > 0) {
      const [c, idx] = heap.pop();
      if (settled[idx] !== 0 || c > dist[idx]) continue; // đã chốt / stale
      settled[idx] = 1;
      const x = idx % w;
      const y = (idx / w) | 0;
      for (const [ddx, ddy] of DIRS) {
        const nx = x + ddx;
        const ny = y + ddy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const t = map.get(nx, ny);
        if (!t.walkable) continue;
        const diag = ddx !== 0 && ddy !== 0;
        if (
          diag &&
          (!map.get(x + ddx, y).walkable || !map.get(x, y + ddy).walkable)
        ) {
          continue; // cấm cắt góc tường
        }
        if (!Number.isFinite(t.cost) || t.cost <= 0) continue;
        const nc = c + (diag ? COST_DIAGONAL : COST_STRAIGHT) * t.cost;
        const nidx = ny * w + nx;
        if (nc < dist[nidx]) {
          dist[nidx] = nc;
          parent[nidx] = idx;
          heap.push(nc, nidx);
        }
      }
    }

    const dirX = new Int8Array(n);
    const dirY = new Int8Array(n);
    for (let i = 0; i < n; i++) {
      const p = parent[i];
      if (p >= 0) {
        dirX[i] = (p % w) - (i % w);
        dirY[i] = ((p / w) | 0) - ((i / w) | 0);
      }
    }
    return new FlowField(gx, gy, w, h, dirX, dirY, dist);
  }

  /** Hướng đi tại ô (tx, ty): null nếu ngoài biên hoặc không tới được đích. */
  directionAt(tx: number, ty: number): { dx: number; dy: number } | null {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return null;
    const i = ty * this.width + tx;
    if (!Number.isFinite(this.dist[i])) return null;
    return { dx: this.dirX[i], dy: this.dirY[i] };
  }

  /** Chi phí Dijkstra từ ô (tx, ty) tới đích; Infinity = không tới được. */
  costAt(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) {
      return Number.POSITIVE_INFINITY;
    }
    return this.dist[ty * this.width + tx];
  }
}

/**
 * Cache flow field theo key `${goalTx},${goalTy},${map.version}` (+ id nội bộ
 * của map object để 2 map khác nhau không đụng key). Tối đa 32 field,
 * LRU đơn giản: hit thì đánh dấu mới nhất, đầy thì xóa cũ nhất.
 */
export class FlowFieldCache {
  static readonly MAX_FIELDS = 32;
  private readonly fields = new Map<string, FlowField>();
  private readonly mapIds = new WeakMap<object, number>();
  private nextMapId = 1;

  get size(): number {
    return this.fields.size;
  }

  get(goalTx: number, goalTy: number, map: FlowFieldMap): FlowField {
    let id = this.mapIds.get(map);
    if (id === undefined) {
      id = this.nextMapId++;
      this.mapIds.set(map, id);
    }
    const key = `${goalTx},${goalTy},${map.version}#${id}`;
    const hit = this.fields.get(key);
    if (hit !== undefined) {
      // Đánh dấu mới dùng nhất (xóa rồi thêm lại vào cuối Map).
      this.fields.delete(key);
      this.fields.set(key, hit);
      return hit;
    }
    const f = FlowField.compute(goalTx, goalTy, map);
    this.fields.set(key, f);
    if (this.fields.size > FlowFieldCache.MAX_FIELDS) {
      const oldest = this.fields.keys().next();
      if (!oldest.done) this.fields.delete(oldest.value);
    }
    return f;
  }

  clear(): void {
    this.fields.clear();
  }
}
