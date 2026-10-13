/**
 * renderer.ts — GameRenderer: dựng scene PixiJS v8 cho RTS.
 *
 * Layers: ground (chunk RenderTexture) → entityLayer (y-sort mỗi frame)
 *         → overlay (vòng chọn/debug; FOG OF WAR Phase 5 sẽ vẽ ở đây).
 * Ground 128×128 tile được pre-render thành chunk 32×32 tile
 * (2048×2048px/RenderTexture) — mỗi frame chỉ vẽ ~vài sprite → 60fps.
 */
import * as PIXI from 'pixi.js';
import { Camera } from './camera';
import { TILE_SIZE, type GameMap } from './map';
import { getTileTextures, destroyTileTextures } from './textures';
import { EntityView, type EntityData } from './entityView';
import { ensureSpriteManifest } from './spriteManager';
import { InputManager, type InputCallbacks } from './input';
import { Minimap, type MinimapDot } from './minimap';
import type { SimProjectile, VisionMap } from './localGame';

const CHUNK_TILES = 32;
const CULL_MARGIN = 200; // px màn hình — entity ngoài viewport+margin thì ẩn

export class GameRenderer {
  readonly camera: Camera;
  /** Lớp phủ trên cùng: vòng chọn, debug. Fog of war (Phase 5) hook vào đây. */
  readonly overlay = new PIXI.Container();

  private readonly app = new PIXI.Application();
  private readonly world = new PIXI.Container();
  private readonly groundLayer = new PIXI.Container();
  private readonly entityLayer = new PIXI.Container();
  /** Lớp đạn bay (projectile Phase 5b): vẽ trên entity, dưới overlay. */
  private readonly projectileLayer = new PIXI.Graphics();
  private readonly chunks: PIXI.Sprite[] = [];
  private readonly entities = new Map<number, EntityView>();
  private nextId = 1;
  private input: InputManager | null = null;
  private minimap: Minimap | null = null;
  private inited = false;
  private destroyed = false;

  constructor(private readonly container: HTMLElement) {
    this.camera = new Camera(0, 0);
  }

  async init(map: GameMap, seed: number): Promise<void> {
    // seed đã dùng khi sinh map (DemoMap); giữ param cho API ổn định
    // để khi cắm mapgen thật của sim vào không phải đổi chữ ký.
    void seed;

    await this.app.init({
      resizeTo: this.container,
      background: 0x14100b,
      antialias: false,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
    const canvas = this.app.canvas;
    canvas.style.display = 'block';
    this.container.appendChild(canvas);

    this.camera.mapW = map.width * TILE_SIZE;
    this.camera.mapH = map.height * TILE_SIZE;
    this.camera.setViewport(this.container.clientWidth, this.container.clientHeight);

    // Load manifest sprite (không chặn quá 3s; thiếu → dùng placeholder)
    await Promise.race([
      ensureSpriteManifest(),
      new Promise((r) => setTimeout(r, 3000)),
    ]);

    this.buildGround(map);

    this.world.addChild(this.groundLayer, this.entityLayer, this.projectileLayer, this.overlay);
    this.app.stage.addChild(this.world);

    this.input = new InputManager(canvas, this.camera, {});
    // Callbacks chọn unit / ra lệnh do GameView gắn sau qua setInputCallbacks().

    this.minimap = new Minimap(this.container, map, this.camera);

    this.app.ticker.add(this.tick);
    this.inited = true;
  }

  /** Pre-render ground thành các chunk RenderTexture 32×32 tile. */
  private buildGround(map: GameMap): void {
    const textures = getTileTextures(this.app.renderer);
    const cols = Math.ceil(map.width / CHUNK_TILES);
    const rows = Math.ceil(map.height / CHUNK_TILES);

    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const tw = Math.min(CHUNK_TILES, map.width - cx * CHUNK_TILES);
        const th = Math.min(CHUNK_TILES, map.height - cy * CHUNK_TILES);
        const rt = PIXI.RenderTexture.create({
          width: tw * TILE_SIZE,
          height: th * TILE_SIZE,
        });

        const holder = new PIXI.Container();
        for (let ty = 0; ty < th; ty++) {
          for (let tx = 0; tx < tw; tx++) {
            const gx = cx * CHUNK_TILES + tx;
            const gy = cy * CHUNK_TILES + ty;
            const spr = new PIXI.Sprite(textures[map.tiles[gy][gx]]);
            spr.position.set(tx * TILE_SIZE, ty * TILE_SIZE);
            holder.addChild(spr);
          }
        }
        this.app.renderer.render({ container: holder, target: rt, clear: true });
        holder.destroy({ children: true });

        const chunk = new PIXI.Sprite(rt);
        chunk.position.set(cx * CHUNK_TILES * TILE_SIZE, cy * CHUNK_TILES * TILE_SIZE);
        this.groundLayer.addChild(chunk);
        this.chunks.push(chunk);
      }
    }
  }

  private readonly tick = (ticker: PIXI.Ticker): void => {
    if (this.destroyed || !this.inited) return;
    const dt = Math.min(ticker.deltaMS / 1000, 0.1);

    // Đồng bộ viewport nếu container resize (resizeTo chỉ resize canvas)
    const cw = this.container.clientWidth;
    const ch = this.container.clientHeight;
    if (cw !== this.camera.viewW || ch !== this.camera.viewH) {
      this.camera.setViewport(cw, ch);
    }

    this.input?.update(dt);

    // Áp camera vào world container
    const z = this.camera.zoom;
    this.world.scale.set(z);
    this.world.position.set(
      this.camera.viewW / 2 - this.camera.x * z,
      this.camera.viewH / 2 - this.camera.y * z,
    );

    this.cullChunks();
    this.updateEntities(dt);
    this.minimap?.render();
  };

  /** Ẩn chunk ground ngoài viewport. */
  private cullChunks(): void {
    const b = this.camera.viewBounds();
    for (const c of this.chunks) {
      const x0 = c.position.x;
      const y0 = c.position.y;
      c.visible =
        x0 < b.right &&
        x0 + c.texture.width > b.left &&
        y0 < b.bottom &&
        y0 + c.texture.height > b.top;
    }
  }

  /** Culling entity (viewport + 200px), y-sort, chấm minimap. */
  private updateEntities(dt: number): void {
    const b = this.camera.viewBounds();
    const m = CULL_MARGIN / this.camera.zoom;
    const dots: MinimapDot[] = [];

    for (const child of this.entityLayer.children) {
      const v = child as EntityView;
      const vis = v.x > b.left - m && v.x < b.right + m && v.y > b.top - m && v.y < b.bottom + m;
      v.visible = vis;
      if (vis) v.tick(dt);
      dots.push({ x: v.x, y: v.y, kind: v.data.kind, playerId: v.data.playerId });
    }

    // Y-sort: entity thấp hơn (y lớn) vẽ đè lên
    this.entityLayer.children.sort((a, b2) => a.y - b2.y);

    this.minimap?.setDots(dots);
  }

  /** Gắn/sửa input callbacks sau init (GameView dùng để nối LocalGameController). */
  setInputCallbacks(cbs: Partial<InputCallbacks>): void {
    this.input?.updateCallbacks(cbs);
  }

  /** Spawn 1 entity placeholder, trả về view. */
  spawnEntity(data: Omit<EntityData, 'id'>): EntityView {
    const view = new EntityView({ ...data, id: this.nextId++ });
    this.entities.set(view.data.id, view);
    this.entityLayer.addChild(view);
    return view;
  }

  removeEntity(id: number): void {
    const v = this.entities.get(id);
    if (v) {
      this.entities.delete(id);
      this.entityLayer.removeChild(v);
      v.destroy({ children: true });
    }
  }

  setSelected(id: number, selected: boolean): void {
    this.entities.get(id)?.setSelected(selected);
  }

  centerCamera(x: number, y: number): void {
    this.camera.centerOn(x, y);
  }

  /**
   * Vẽ lại đạn bay (chấm tròn vàng) — gọi mỗi frame từ syncToRenderer.
   * Mảng rỗng → xóa hết.
   */
  setProjectiles(dots: SimProjectile[]): void {
    const g = this.projectileLayer;
    g.clear();
    for (const d of dots) {
      g.circle(d.x, d.y - 10, 4).fill(0xffd54a);
      g.circle(d.x, d.y - 10, 4).stroke({ color: 0x8a6d1a, width: 1.5 });
    }
  }

  /** Truyền vision sang minimap để ẩn chấm địch trong fog (chưa có vision → hiện hết). */
  setFogVision(vision: VisionMap | null, humanPlayerId: number): void {
    this.minimap?.setFog(vision, humanPlayerId);
  }

  get entityCount(): number {
    return this.entities.size;
  }

  get ready(): boolean {
    return this.inited;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.app.ticker.remove(this.tick);
    this.input?.destroy();
    this.input = null;
    this.minimap?.destroy();
    this.minimap = null;
    for (const c of this.chunks) c.texture.destroy(true);
    this.chunks.length = 0;
    destroyTileTextures();
    this.app.canvas.remove();
    this.app.destroy(true, { children: true, texture: true });
  }
}
