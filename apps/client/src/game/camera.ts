/**
 * camera.ts — Camera 2D cho RTS.
 * Đơn vị world = pixel. (x, y) là TÂM camera trong world coords.
 */
export class Camera {
  x: number;
  y: number;
  zoom = 1;
  viewW = 0; // kích thước viewport, px màn hình
  viewH = 0;
  mapW: number; // kích thước map, world px
  mapH: number;

  static readonly MIN_ZOOM = 0.4;
  static readonly MAX_ZOOM = 2.5;

  constructor(mapW: number, mapH: number) {
    this.mapW = mapW;
    this.mapH = mapH;
    this.x = mapW / 2;
    this.y = mapH / 2;
  }

  /** Gọi khi canvas đổi kích thước. */
  setViewport(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.clamp();
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: this.x + (sx - this.viewW / 2) / this.zoom,
      y: this.y + (sy - this.viewH / 2) / this.zoom,
    };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.x) * this.zoom + this.viewW / 2,
      y: (wy - this.y) * this.zoom + this.viewH / 2,
    };
  }

  /** Dịch camera theo world px (pan). */
  panBy(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    this.clamp();
  }

  centerOn(wx: number, wy: number): void {
    this.x = wx;
    this.y = wy;
    this.clamp();
  }

  /** Zoom quanh điểm màn hình (sx, sy) — điểm đó giữ nguyên world pos. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.screenToWorld(sx, sy);
    this.zoom = Math.min(Camera.MAX_ZOOM, Math.max(Camera.MIN_ZOOM, this.zoom * factor));
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp();
  }

  /** Kẹp tâm camera trong biên map (nếu map nhỏ hơn viewport thì căn giữa). */
  clamp(): void {
    const hw = this.viewW / (2 * this.zoom);
    const hh = this.viewH / (2 * this.zoom);
    this.x =
      this.mapW <= hw * 2 ? this.mapW / 2 : Math.min(this.mapW - hw, Math.max(hw, this.x));
    this.y =
      this.mapH <= hh * 2 ? this.mapH / 2 : Math.min(this.mapH - hh, Math.max(hh, this.y));
  }

  /** Vùng world đang hiển thị (dùng cho culling). */
  viewBounds(): { left: number; top: number; right: number; bottom: number } {
    const hw = this.viewW / (2 * this.zoom);
    const hh = this.viewH / (2 * this.zoom);
    return { left: this.x - hw, top: this.y - hh, right: this.x + hw, bottom: this.y + hh };
  }
}
