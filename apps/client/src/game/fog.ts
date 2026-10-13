/**
 * fog.ts — Fog of war (Phase 5b).
 *
 * FogRenderer đọc VisionMap từ sim (qua LocalGameController.game.getVision)
 * và vẽ 1 lớp phủ lên toàn map qua `renderer.overlay`:
 *   - tile chưa explore      → đen đặc (alpha 255)
 *   - tile explored, không visible → đen 55% (alpha 140)
 *   - tile visible           → trong suốt
 * VisionMap dùng 1 canvas 128×128 → texture duy nhất, scale phủ full map.
 * Sim chưa expose getVision → update(undefined) → không vẽ gì (fog tắt, game vẫn chơi được).
 */
import * as PIXI from 'pixi.js';
import type { GameRenderer } from './renderer';
import type { VisionMap } from './localGame';

/** Kích thước texture fog (1 canvas duy nhất, rẻ khi update 5 lần/giây). */
const FOG_TEX = 128;
/** Alpha cho tile đã explore nhưng đang không nhìn thấy (≈55%). */
const EXPLORED_ALPHA = 140;

export class FogRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: PIXI.Texture;
  private readonly sprite: PIXI.Sprite;
  private destroyed = false;

  constructor(
    renderer: GameRenderer,
    mapWidthPx: number,
    mapHeightPx: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = FOG_TEX;
    this.canvas.height = FOG_TEX;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('[fog] không tạo được 2d context');
    this.ctx = ctx;
    ctx.clearRect(0, 0, FOG_TEX, FOG_TEX);

    this.texture = PIXI.Texture.from(this.canvas);
    this.sprite = new PIXI.Sprite(this.texture);
    this.sprite.position.set(0, 0);
    this.sprite.width = mapWidthPx;
    this.sprite.height = mapHeightPx;
    this.sprite.visible = false; // chờ vision đầu tiên
    // Overlay là lớp trên cùng của world (đã scale theo camera) → fog phủ toàn map.
    renderer.overlay.addChild(this.sprite);
  }

  /**
   * Vẽ lại fog từ VisionMap — gọi mỗi ~200ms từ GameView.
   * @param vision undefined → ẩn fog hoàn toàn (sim chưa có vision).
   */
  update(vision: VisionMap | undefined): void {
    if (this.destroyed) return;
    if (!vision) {
      this.sprite.visible = false;
      return;
    }
    const { explored, visible, w, h } = vision;
    if (w <= 0 || h <= 0 || explored.length < w * h || visible.length < w * h) return;

    const img = this.ctx.createImageData(FOG_TEX, FOG_TEX);
    const d = img.data; // rgb khởi tạo 0 → chỉ cần set alpha
    for (let py = 0; py < FOG_TEX; py++) {
      const ty = Math.min(h - 1, (py * h) / FOG_TEX) | 0;
      for (let px = 0; px < FOG_TEX; px++) {
        const tx = Math.min(w - 1, (px * w) / FOG_TEX) | 0;
        const i = ty * w + tx;
        d[(py * FOG_TEX + px) * 4 + 3] = explored[i] === 0 ? 255 : visible[i] === 0 ? EXPLORED_ALPHA : 0;
      }
    }
    this.ctx.putImageData(img, 0, 0);
    // PixiJS v8: báo texture source đọc lại canvas.
    this.texture.source.update();
    this.sprite.visible = true;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.sprite.removeFromParent();
    this.texture.destroy(true);
  }
}
