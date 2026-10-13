// RNG có seed — bắt buộc cho simulation deterministic.
// TUYỆT ĐỐI không dùng Math.random() trong sim.

/** mulberry32: PRNG nhỏ, nhanh, deterministic theo seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Biến chuỗi (VD: room code, tên map) thành seed số. */
export function hashStringToSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Lớp tiện ích bọc PRNG cho sim. */
export class Rng {
  private next: () => number;

  constructor(seed: number | string) {
    const s = typeof seed === 'string' ? hashStringToSeed(seed) : seed;
    this.next = mulberry32(s);
  }

  /** Số thực trong [0, 1). */
  float(): number {
    return this.next();
  }

  /** Số nguyên trong [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Chọn ngẫu nhiên 1 phần tử. */
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}
