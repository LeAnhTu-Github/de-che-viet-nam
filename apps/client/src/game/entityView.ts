/**
 * entityView.ts — Entity view: sprite PNG thật khi có, fallback placeholder vẽ
 * bằng code khi thiếu (không bao giờ crash).
 * Mỗi entity là 1 PIXI.Container neo tại (x, y) = CHÂN entity (để y-sort).
 */
import * as PIXI from 'pixi.js';
import type { UnitState } from '@aoe-vn/sim';
import {
  type Dir8,
  UNIT_SPRITE,
  BUILDING_SPRITE,
  mapUnitState,
  resolveUnitFrame,
  unitDisplayHeight,
  buildingSpriteState,
  buildingDisplayWidth,
  buildingFootprint,
  unitFootRadius,
  spriteEpoch,
  resolveBuilding,
  resolveResource,
  resourceDisplayHeight,
  dir8FromDelta,
  STATE_FPS,
  type SpriteUnitState,
} from './spriteManager';

export type EntityKind =
  | 'villager'
  | 'soldier'
  | 'building'
  | 'tree'
  | 'gold'
  | 'stone'
  | 'animal';

export interface EntityData {
  id: number;
  kind: EntityKind;
  /** Nhãn tiếng Việt, vd 'Nông dân', 'Đình làng', 'Mỏ vàng'. */
  label: string;
  /** World px; y là chân entity. */
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  selected?: boolean;
  /** Phe sở hữu (0 người chơi, 1 máy, -1 trung lập) — để minimap fog lọc chấm địch. */
  playerId?: number;
  /** defId sim: 'villager_m', 'town_center', 'tree'... — để tra sprite. */
  defId?: string;
  /** State unit từ sim (cho animation). */
  unitState?: UnitState;
  /** Tiến độ xây nhà 0..1 (building). */
  buildProgress?: number;
  /** Lượng tài nguyên còn lại / ban đầu (resource node). */
  resAmount?: number;
  resMaxAmount?: number;
}

type UnitFrame = NonNullable<ReturnType<typeof resolveUnitFrame>>;

const HP_W = 32;

/** Màu placeholder cũ (fallback khi thiếu sprite). */
const BODY_COLOR: Record<EntityKind, number> = {
  villager: 0xf2c14e,
  soldier: 0xd94f3d,
  building: 0x8a5a2b,
  tree: 0x2e7d32,
  gold: 0xffd54a,
  stone: 0x9e9e9e,
  animal: 0xc08a5a,
};

export class EntityView extends PIXI.Container {
  readonly data: EntityData;
  private readonly body = new PIXI.Container();
  private readonly hpFill = new PIXI.Graphics();
  private readonly hpBg = new PIXI.Graphics();
  private readonly ring = new PIXI.Graphics();
  private readonly shadow = new PIXI.Graphics();
  private readonly nameLabel: PIXI.Text;
  private bodyTop: number;
  private bobPhase = Math.random() * Math.PI * 2;
  private bobAmp = 0;
  /** Unit đang ở state 'attacking' → nhấp nháy đỏ nhẹ (combat feedback). */
  private attacking = false;
  private blinkPhase = 0;

  /* ── sprite mode ── */
  private sprite: PIXI.Sprite | null = null;
  private facing: Dir8 = 'down';
  private animTime = Math.random() * 2;
  private curFrame = -1;
  private curSpriteState: SpriteUnitState = 'idle';
  private visualKey = '';
  private hovered = false;
  private seenEpoch = spriteEpoch();

  constructor(data: EntityData) {
    super();
    this.data = { ...data };
    this.position.set(data.x, data.y);

    // Bóng ellipse mờ dưới chân (art plan bắt buộc)
    this.addChild(this.shadow);

    this.bodyTop = -30;
    this.addChild(this.body);

    this.ring.visible = false;
    this.addChild(this.ring);

    this.addChild(this.hpBg);
    this.addChild(this.hpFill);

    this.nameLabel = new PIXI.Text({
      text: data.label,
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: 11,
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 3 },
        align: 'center',
      },
    });
    this.nameLabel.anchor.set(0.5, 1);
    this.addChild(this.nameLabel);

    this.refreshVisual();
    this.setHp(data.hp, data.maxHp);
    this.setSelected(data.selected ?? false);
    this.setState(data.unitState ?? 'idle');
  }

  /* ── Visual resolution ─────────────────────────────── */

  /** Dựng lại sprite/placeholder khi state/hướng/tiến độ đổi. */
  refreshVisual(): void {
    const d = this.data;
    let key = '';
    let built = false;

    if (d.kind === 'building' && d.defId) {
      const sid = BUILDING_SPRITE[d.defId];
      if (sid) {
        const st = buildingSpriteState(d.buildProgress ?? 1, d.hp);
        key = `bld:${sid}:${st}`;
        if (key !== this.visualKey) {
          const t = resolveBuilding(sid, st);
          if (t) {
            this.showBuilding(t, d.defId);
            built = true;
          }
        } else built = true;
      }
    } else if ((d.kind === 'villager' || d.kind === 'soldier') && d.defId) {
      const sid = UNIT_SPRITE[d.defId];
      if (sid) {
        const st = mapUnitState(d.unitState ?? 'idle');
        key = `unit:${sid}:${st}:${this.facing}`;
        if (key !== this.visualKey || this.curSpriteState !== st) {
          this.curSpriteState = st;
          this.animTime = 0;
          this.curFrame = -1;
          const r = resolveUnitFrame(sid, st, this.facing, 0);
          if (r) {
            this.showUnit(r, sid);
            built = true;
          }
        } else built = true;
      }
    } else if ((d.kind === 'tree' || d.kind === 'gold' || d.kind === 'stone' || d.kind === 'animal') && d.defId) {
      const r = resolveResource(d.defId, d.resAmount ?? d.maxHp, d.resMaxAmount ?? d.maxHp, d.id);
      if (r) {
        key = `res:${r.file}`;
        if (key !== this.visualKey) {
          this.showSprite(r.texture, resourceDisplayHeight(d.defId));
          built = true;
        } else built = true;
      }
    }

    if (!built) {
      key = `ph:${d.kind}`;
      if (key !== this.visualKey) this.showPlaceholder();
    }
    this.visualKey = key;
    this.layoutChrome();
  }

  /** Tài nguyên: 1 ảnh tĩnh, anchor đáy giữa, scale theo chiều cao mục tiêu. */
  private showSprite(t: PIXI.Texture, targetH: number): void {
    this.clearBody();
    const spr = new PIXI.Sprite(t);
    const s = targetH / Math.max(1, t.height);
    spr.scale.set(s);
    spr.anchor.set(0.5, 1);
    this.sprite = spr;
    this.body.addChild(spr);
    this.bodyTop = -targetH;
    this.bobAmp = 0;
    const w = t.width * s;
    this.drawShadow(w * 0.72, 9);
    this.ring.clear();
    this.ring.ellipse(0, -3, w * 0.42, w * 0.2).stroke({ color: 0xffffff, width: 2 });
  }

  /**
   * Unit: mỗi frame có điểm đặt chân + scale riêng (manifest.unitMeta) nên nhân vật giữ
   * nguyên cỡ và chân luôn chạm đất. Vòng chọn / thanh máu theo CỠ CHUẨN của loại unit,
   * không theo kích thước frame (frame vung vũ khí rộng gấp đôi người).
   */
  private showUnit(r: UnitFrame, spriteId: string): void {
    this.clearBody();
    const spr = new PIXI.Sprite(r.texture);
    spr.anchor.set(r.anchorX, r.anchorY);
    spr.scale.set(r.scale);
    this.sprite = spr;
    this.body.addChild(spr);
    this.bodyTop = -unitDisplayHeight(spriteId);
    this.bobAmp = 0;
    const rx = unitFootRadius(spriteId);
    this.drawShadow(rx * 1.7, rx * 0.7);
    this.ring.clear();
    this.ring.ellipse(0, -2, rx, rx * 0.5).stroke({ color: 0xffffff, width: 2 });
  }

  /** Nhà: sprite phủ vừa nền nhà (footprint), đáy sprite trùng mép dưới nền. */
  private showBuilding(t: PIXI.Texture, defId: string): void {
    this.clearBody();
    const fp = buildingFootprint(defId);
    const spr = new PIXI.Sprite(t);
    const s = buildingDisplayWidth(defId) / Math.max(1, t.width);
    spr.scale.set(s);
    spr.anchor.set(0.5, 1);
    spr.y = fp.h / 2;
    this.sprite = spr;
    this.body.addChild(spr);
    this.bodyTop = fp.h / 2 - t.height * s;
    this.bobAmp = 0;
    this.shadow.clear();
    // Vòng chọn = viền nền nhà (kiểu AoE).
    this.ring.clear();
    this.ring.rect(-fp.w / 2, -fp.h / 2, fp.w, fp.h).stroke({ color: 0xffffff, width: 2 });
  }

  /** Placeholder cũ (fallback) — giữ nguyên hình vẽ trước đây. */
  private showPlaceholder(): void {
    this.clearBody();
    this.sprite = null;
    const color = BODY_COLOR[this.data.kind];
    const g = new PIXI.Graphics();
    let top = -28;
    let bob = 0;

    switch (this.data.kind) {
      case 'villager':
      case 'soldier':
      case 'animal': {
        g.circle(0, -14, 13).fill(color);
        g.circle(0, -14, 13).stroke({ color: 0x1a1a1a, width: 2, alpha: 0.7 });
        if (this.data.kind === 'soldier') {
          g.rect(-9, -24, 18, 5).fill(0x7a1f14);
        } else if (this.data.kind === 'animal') {
          g.circle(8, -18, 5).fill(color);
        } else {
          g.circle(0, -17, 5).fill(0x8a5a2b);
        }
        top = -30;
        bob = 1.6;
        break;
      }
      case 'building': {
        g.rect(-36, -58, 72, 58).fill(color);
        g.rect(-36, -58, 72, 58).stroke({ color: 0x3d2712, width: 2 });
        g.moveTo(-41, -58);
        g.lineTo(0, -80);
        g.lineTo(41, -58);
        g.closePath();
        g.fill(0x6b4420);
        g.rect(-8, -30, 16, 30).fill(0x3d2712);
        top = -84;
        break;
      }
      case 'tree': {
        g.rect(-3, -18, 6, 18).fill(0x6b4420);
        g.circle(0, -30, 12).fill(color);
        g.circle(-9, -24, 9).fill(color);
        g.circle(9, -24, 9).fill(color);
        g.circle(-3, -33, 6).fill(0x43a047);
        top = -46;
        break;
      }
      case 'gold': {
        g.moveTo(0, -32);
        g.lineTo(15, -16);
        g.lineTo(0, 0);
        g.lineTo(-15, -16);
        g.closePath();
        g.fill(color);
        g.stroke({ color: 0x8a6d1a, width: 2 });
        top = -36;
        break;
      }
      case 'stone': {
        g.circle(0, -12, 11).fill(color);
        g.circle(0, -12, 11).stroke({ color: 0x616161, width: 2 });
        g.circle(-3, -14, 4).fill(0xbdbdbd);
        top = -26;
        break;
      }
    }

    this.body.addChild(g);
    this.bodyTop = top;
    this.bobAmp = bob;
    this.drawShadow(this.data.kind === 'building' ? 64 : 22, 8);
    this.ring.clear();
    if (this.data.kind === 'building') {
      this.ring.rect(-42, -62, 84, 66).stroke({ color: 0x35e05a, width: 2 });
    } else {
      this.ring.circle(0, -6, 19).stroke({ color: 0x35e05a, width: 2 });
    }
  }

  private clearBody(): void {
    this.body.removeChildren();
    this.sprite = null;
    this.body.tint = 0xffffff;
  }

  private drawShadow(w: number, h: number): void {
    this.shadow.clear();
    this.shadow.ellipse(0, -2, w / 2, h / 2).fill({ color: 0x000000, alpha: 0.3 });
  }

  /** Đặt lại HP bar + label theo đỉnh body hiện tại. */
  private layoutChrome(): void {
    const top = this.bodyTop;
    this.hpBg.clear();
    this.hpBg.rect(-HP_W / 2, top - 8, HP_W, 4).fill(0x141414);
    this.nameLabel.position.set(0, top - 10);
    this.setHp(this.data.hp, this.data.maxHp);
  }

  /* ── API cho entitySync ────────────────────────────── */

  /** Cập nhật vị trí + tự suy hướng nhìn từ vector di chuyển (unit). */
  syncPosition(x: number, y: number): void {
    const dx = x - this.position.x;
    const dy = y - this.position.y;
    if ((this.data.kind === 'villager' || this.data.kind === 'soldier') &&
        dx * dx + dy * dy > 2.25) {
      const dir = dir8FromDelta(dx, dy);
      if (dir !== this.facing) {
        this.facing = dir;
        this.refreshVisual();
      }
    }
    this.position.set(x, y);
  }

  setUnitState(s: UnitState): void {
    const changed = this.data.unitState !== s;
    this.data.unitState = s;
    const atk = s === 'attacking';
    if (atk !== this.attacking) {
      this.attacking = atk;
      if (!atk) this.body.tint = 0xffffff;
    }
    if (changed && this.sprite) this.refreshVisual();
  }

  /** Giữ API cũ (entitySync gọi cho unit). */
  setState(state: UnitState): void {
    this.setUnitState(state);
  }

  setBuildProgress(p: number): void {
    if (this.data.buildProgress === p) return;
    this.data.buildProgress = p;
    if (this.data.kind === 'building') this.refreshVisual();
  }

  setResourceAmount(amount: number, maxAmount: number): void {
    const changed = this.data.resAmount !== amount;
    this.data.resAmount = amount;
    this.data.resMaxAmount = maxAmount;
    if (changed) this.refreshVisual();
  }

  setHp(hp: number, maxHp: number): void {
    const wasAlive = this.data.hp > 0;
    this.data.hp = hp;
    this.data.maxHp = maxHp;
    const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    const color = ratio > 0.5 ? 0x4caf50 : ratio > 0.25 ? 0xffc107 : 0xf44336;
    this.hpFill.clear();
    this.hpFill.rect(-HP_W / 2, this.bodyTop - 8, HP_W * ratio, 4).fill(color);
    this.updateChrome();
    // Nhà vừa bị phá → chuyển sang rubble (wasAlive chặn đệ quy qua layoutChrome)
    if (this.data.kind === 'building' && this.sprite && wasAlive && hp <= 0) {
      this.refreshVisual();
    }
  }

  setSelected(selected: boolean): void {
    this.data.selected = selected;
    this.ring.visible = selected;
    this.updateChrome();
  }

  /** Con trỏ đang rê lên entity này (hiện tên + thanh máu). */
  setHovered(hovered: boolean): void {
    if (this.hovered === hovered) return;
    this.hovered = hovered;
    this.updateChrome();
  }

  /**
   * Kiểu AoE: tên chỉ hiện khi chọn / rê chuột; thanh máu hiện thêm khi unit, nhà đang mất máu.
   */
  private updateChrome(): void {
    const focus = !!this.data.selected || this.hovered;
    const d = this.data;
    const ownable = d.kind === 'villager' || d.kind === 'soldier' || d.kind === 'building';
    const hurt = ownable && d.hp > 0 && d.hp < d.maxHp;
    this.nameLabel.visible = focus;
    this.hpBg.visible = this.hpFill.visible = focus || hurt;
  }

  /** Quay mặt về điểm (x, y) — dùng khi đứng đánh / chặt / xây (không di chuyển). */
  faceToward(x: number, y: number): void {
    const dx = x - this.position.x;
    const dy = y - this.position.y;
    if (dx * dx + dy * dy < 4) return;
    const dir = dir8FromDelta(dx, dy);
    if (dir !== this.facing) {
      this.facing = dir;
      this.refreshVisual();
    }
  }

  /** Gọi mỗi frame khi entity nằm trong viewport (đã cull). */
  tick(dt: number): void {
    // Sprite vừa load xong (lazy) → dựng lại thay placeholder.
    if (this.seenEpoch !== spriteEpoch()) {
      this.seenEpoch = spriteEpoch();
      if (!this.sprite) this.refreshVisual();
    }
    if (this.sprite && (this.data.kind === 'villager' || this.data.kind === 'soldier')) {
      // Animation theo frame
      const sid = this.data.defId ? UNIT_SPRITE[this.data.defId] : undefined;
      if (sid) {
        this.animTime += dt;
        const st = this.curSpriteState;
        const r = resolveUnitFrame(sid, st, this.facing, 0);
        if (r) {
          // Thiếu bộ ảnh đi bộ (rơi về ảnh đứng yên) → nhún nhẹ để không "trượt" trên đất.
          this.body.y = st === 'walk' && r.state !== 'walk' ? -Math.abs(Math.sin(this.animTime * 9)) * 2.5 : 0;
          const fps = STATE_FPS[st];
          let f: number;
          if (st === 'die') {
            f = Math.min(Math.floor(this.animTime * fps), r.count - 1);
          } else {
            f = Math.floor(this.animTime * fps) % r.count;
          }
          if (f !== this.curFrame) {
            this.curFrame = f;
            const rr = resolveUnitFrame(sid, st, this.facing, f);
            if (rr) {
              this.sprite.texture = rr.texture;
              this.sprite.anchor.set(rr.anchorX, rr.anchorY);
              this.sprite.scale.set(rr.scale);
            }
          }
        }
      }
    } else if (this.bobAmp > 0) {
      this.bobPhase += dt * 4;
      this.body.y = Math.sin(this.bobPhase) * this.bobAmp;
    }
    if (this.attacking) {
      this.blinkPhase += dt * 7;
      this.body.tint = Math.sin(this.blinkPhase) > 0 ? 0xff8080 : 0xffffff;
    }
  }
}
