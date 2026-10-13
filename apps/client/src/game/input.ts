/**
 * input.ts — Điều khiển camera + chọn unit cho RTS (Phase 1b → 2b).
 *
 * CHỐT theo spec:
 * - Pan: GIỮ CHUỘT GIỮA kéo, HOẶC phím mũi tên, HOẶC dí chuột sát viền (edge-scroll).
 *   (Bỏ WASD từ bản phím tắt AoE: A = attack-move, S = stop — giống bản gốc AoE1.)
 * - Zoom: lăn chuột, 0.4x–2.5x, zoom vào đúng vị trí con trỏ.
 * - Chuột trái: click = chọn 1 unit; nhấn+kéo = khung chọn nhiều unit (Phase 2b).
 * - Chuột phải: ra lệnh di chuyển tới vị trí click (Phase 2b).
 */
import type { Camera } from './camera';

export interface WorldPoint {
  x: number;
  y: number;
}

export interface InputCallbacks {
  onLeftClick?: (world: WorldPoint, screen: WorldPoint) => void;
  onLeftDrag?: (startWorld: WorldPoint, endWorld: WorldPoint) => void;
  /** Bắn liên tục trong lúc kéo chuột trái — để vẽ khung chọn trực tiếp. */
  onLeftDragMove?: (startWorld: WorldPoint, curWorld: WorldPoint) => void;
  /** Click chuột phải (contextmenu đã bị chặn). */
  onRightClick?: (world: WorldPoint, screen: WorldPoint) => void;
  /** Di chuột trên canvas (kể cả không nhấn nút) — dùng cho bóng ma đặt nhà. */
  onMouseMove?: (world: WorldPoint, screen: WorldPoint) => void;
}

const EDGE_MARGIN = 14; // px sát viền thì edge-scroll
const PAN_SPEED = 750; // px màn hình / giây
const CLICK_TOLERANCE = 5; // px — dưới ngưỡng này tính là click, trên là drag

export class InputManager {
  private readonly keys = new Set<string>();
  private panning = false;
  private lastMX = 0;
  private lastMY = 0;
  private mouseX = 0;
  private mouseY = 0;
  private mouseIn = false;
  private leftDown = false;
  private leftSX = 0;
  private leftSY = 0;
  private readonly disposers: Array<() => void> = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
    private readonly cbs: InputCallbacks = {},
  ) {
    this.on(this.canvas, 'mousedown', this.handleMouseDown);
    this.on(window, 'mouseup', this.handleMouseUp);
    this.on(window, 'mousemove', this.handleMouseMove);
    this.on(this.canvas, 'mouseenter', () => {
      this.mouseIn = true;
    });
    this.on(this.canvas, 'mouseleave', () => {
      this.mouseIn = false;
    });
    this.on(this.canvas, 'contextmenu', (e) => e.preventDefault());
    this.on(this.canvas, 'wheel', this.handleWheel, { passive: false });
    this.on(window, 'keydown', this.handleKeyDown);
    this.on(window, 'keyup', this.handleKeyUp);
    this.on(window, 'blur', () => this.keys.clear());
  }

  private on<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ): void;
  private on<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    fn: (e: WindowEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ): void;
  private on(
    target: HTMLElement | Window,
    type: string,
    fn: (e: never) => void,
    opts?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, fn as EventListener, opts);
    this.disposers.push(() => target.removeEventListener(type, fn as EventListener, opts));
  }

  private canvasPos(e: MouseEvent): WorldPoint {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private readonly handleMouseDown = (e: MouseEvent): void => {
    if (e.button === 1) {
      // Chuột giữa: chống autoscroll của trình duyệt, bắt đầu pan
      e.preventDefault();
      this.panning = true;
      this.lastMX = e.clientX;
      this.lastMY = e.clientY;
    } else if (e.button === 0) {
      const p = this.canvasPos(e);
      this.leftDown = true;
      this.leftSX = p.x;
      this.leftSY = p.y;
    } else if (e.button === 2) {
      const p = this.canvasPos(e);
      this.cbs.onRightClick?.(this.camera.screenToWorld(p.x, p.y), p);
    }
  };

  private readonly handleMouseUp = (e: MouseEvent): void => {
    if (e.button === 1) {
      this.panning = false;
    } else if (e.button === 0 && this.leftDown) {
      this.leftDown = false;
      const p = this.canvasPos(e);
      const dist = Math.hypot(p.x - this.leftSX, p.y - this.leftSY);
      if (dist < CLICK_TOLERANCE) {
        this.cbs.onLeftClick?.(this.camera.screenToWorld(p.x, p.y), p);
      } else {
        this.cbs.onLeftDrag?.(
          this.camera.screenToWorld(this.leftSX, this.leftSY),
          this.camera.screenToWorld(p.x, p.y),
        );
      }
    }
  };

  private readonly handleMouseMove = (e: MouseEvent): void => {
    const p = this.canvasPos(e);
    this.mouseX = p.x;
    this.mouseY = p.y;
    if (this.panning) {
      const dx = e.clientX - this.lastMX;
      const dy = e.clientY - this.lastMY;
      this.lastMX = e.clientX;
      this.lastMY = e.clientY;
      // Kéo chuột → map đi theo chuột (chia zoom để đổi px màn hình → world)
      this.camera.panBy(-dx / this.camera.zoom, -dy / this.camera.zoom);
    } else if (this.leftDown) {
      // Đang kéo chuột trái: báo vị trí hiện tại để vẽ khung chọn trực tiếp
      this.cbs.onLeftDragMove?.(
        this.camera.screenToWorld(this.leftSX, this.leftSY),
        this.camera.screenToWorld(p.x, p.y),
      );
    }
    // Luôn báo vị trí chuột (kể cả không nhấn) — bóng ma đặt nhà dùng kênh này.
    this.cbs.onMouseMove?.(this.camera.screenToWorld(p.x, p.y), p);
  };

  private readonly handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const p = this.canvasPos(e);
    const factor = Math.exp(-e.deltaY * 0.0015);
    this.camera.zoomAt(p.x, p.y, factor);
  };

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if (k.startsWith('arrow')) e.preventDefault();
    this.keys.add(k);
  };

  private readonly handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  /** Gọi mỗi frame từ ticker: phím + edge-scroll. */
  update(dt: number): void {
    let dx = 0;
    let dy = 0;
    const k = this.keys;
    // Chỉ phím mũi tên (WASD đã nhường cho phím tắt AoE: A = attack-move, S = stop).
    if (k.has('arrowleft')) dx -= 1;
    if (k.has('arrowright')) dx += 1;
    if (k.has('arrowup')) dy -= 1;
    if (k.has('arrowdown')) dy += 1;

    if (this.mouseIn && !this.panning) {
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      if (this.mouseX < EDGE_MARGIN) dx -= 1;
      if (this.mouseX > w - EDGE_MARGIN) dx += 1;
      if (this.mouseY < EDGE_MARGIN) dy -= 1;
      if (this.mouseY > h - EDGE_MARGIN) dy += 1;
    }

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      const step = (PAN_SPEED / this.camera.zoom) * dt;
      this.camera.panBy((dx / len) * step, (dy / len) * step);
    }
  }

  /** Gộp thêm/sửa callbacks sau khi khởi tạo (GameView dùng để gắn logic chọn unit). */
  updateCallbacks(cbs: Partial<InputCallbacks>): void {
    Object.assign(this.cbs, cbs);
  }

  destroy(): void {
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    this.keys.clear();
  }
}
