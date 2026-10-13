/**
 * minimap.ts — Minimap 2D canvas ở góc dưới-phải.
 * Vẽ nền từ tile (mỗi tile 1px, scale lên 160px), chấm màu entity,
 * khung trắng vị trí camera. Click → camera nhảy tới.
 */
import type { Camera } from './camera';
import { TILE_SIZE, type GameMap, type TerrainKind } from './map';
import type { EntityKind } from './entityView';
import type { VisionMap } from './localGame';

export const MINIMAP_SIZE = 160;

const TERRAIN_COLOR: Record<TerrainKind, string> = {
  grass: '#5a8f3c',
  grass2: '#4e8233',
  dirt: '#9a7848',
  forest: '#2c5222',
  water: '#2f6fb8',
};

const DOT_COLOR: Record<EntityKind, string> = {
  villager: '#ffe082',
  soldier: '#ff6f60',
  building: '#c98f4e',
  tree: '#66bb6a',
  gold: '#ffd54a',
  stone: '#cfcfcf',
  animal: '#d7a06a',
};

export interface MinimapDot {
  x: number; // world px
  y: number;
  kind: EntityKind;
  /** Phe sở hữu — để ẩn chấm địch trong fog (undefined → hiện). */
  playerId?: number;
}

export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly base: HTMLCanvasElement; // nền prerender map.width × map.height px
  private dots: MinimapDot[] = [];
  /** Fog of war (Phase 5b): null = sim chưa có vision → hiện mọi chấm như cũ. */
  private vision: VisionMap | null = null;
  private humanPid = 0;
  private readonly onPointerDown: (e: PointerEvent) => void;

  constructor(
    parent: HTMLElement,
    private readonly map: GameMap,
    private readonly camera: Camera,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = MINIMAP_SIZE;
    this.canvas.height = MINIMAP_SIZE;
    const st = this.canvas.style;
    st.position = 'absolute';
    st.right = '12px';
    st.bottom = '12px';
    st.width = `${MINIMAP_SIZE}px`;
    st.height = `${MINIMAP_SIZE}px`;
    st.border = '2px solid rgba(217,184,74,.7)';
    st.borderRadius = '6px';
    st.cursor = 'pointer';
    st.zIndex = '20';
    st.background = '#000';

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('[minimap] không tạo được 2d context');
    this.ctx = ctx;

    // Prerender nền 1 lần: mỗi tile 1px
    this.base = document.createElement('canvas');
    this.base.width = map.width;
    this.base.height = map.height;
    const bctx = this.base.getContext('2d');
    if (!bctx) throw new Error('[minimap] không tạo được 2d context (base)');
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        bctx.fillStyle = TERRAIN_COLOR[map.tiles[y][x]];
        bctx.fillRect(x, y, 1, 1);
      }
    }

    this.onPointerDown = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      this.camera.centerOn(
        px * map.width * TILE_SIZE,
        py * map.height * TILE_SIZE,
      );
    };
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    parent.appendChild(this.canvas);
  }

  setDots(dots: MinimapDot[]): void {
    this.dots = dots;
  }

  /** Cập nhật vision mỗi ~200ms từ GameView (fog tắt → null, hiện hết chấm). */
  setFog(vision: VisionMap | null, humanPlayerId: number): void {
    this.vision = vision;
    this.humanPid = humanPlayerId;
  }

  /** Chấm địch nằm ngoài vùng visible → ẩn khỏi minimap. */
  private dotHidden(d: MinimapDot): boolean {
    const v = this.vision;
    if (!v) return false; // chưa có vision: giữ nguyên hành vi cũ
    if (d.playerId === undefined || d.playerId < 0 || d.playerId === this.humanPid) return false;
    const tx = Math.floor(d.x / TILE_SIZE);
    const ty = Math.floor(d.y / TILE_SIZE);
    if (tx < 0 || ty < 0 || tx >= v.w || ty >= v.h) return true;
    return v.visible[ty * v.w + tx] === 0;
  }

  /** Vẽ lại mỗi frame: nền + chấm entity + khung camera. */
  render(): void {
    const { ctx, map, camera } = this;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.base, 0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    const sx = MINIMAP_SIZE / (map.width * TILE_SIZE);
    const sy = MINIMAP_SIZE / (map.height * TILE_SIZE);
    for (const d of this.dots) {
      if (this.dotHidden(d)) continue;
      ctx.fillStyle = DOT_COLOR[d.kind];
      ctx.fillRect(d.x * sx - 1, d.y * sy - 1, 3, 3);
    }

    const b = camera.viewBounds();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(b.left * sx, b.top * sy, (b.right - b.left) * sx, (b.bottom - b.top) * sy);
  }

  destroy(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.remove();
  }
}
