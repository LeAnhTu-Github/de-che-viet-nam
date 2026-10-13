/**
 * entityView.ts — Entity placeholder cho Phase 1b (sẽ thay bằng sprite 8 hướng ở Phase 3).
 * Mỗi entity là 1 PIXI.Container neo tại (x, y) = CHÂN entity (để y-sort).
 */
import * as PIXI from 'pixi.js';
import type { UnitState } from '@aoe-vn/sim';

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
}

const BODY_COLOR: Record<EntityKind, number> = {
  villager: 0xf2c14e, // vàng
  soldier: 0xd94f3d, // đỏ
  building: 0x8a5a2b, // nâu
  tree: 0x2e7d32, // xanh lá
  gold: 0xffd54a, // vàng kim
  stone: 0x9e9e9e, // xám
  animal: 0xc08a5a, // nâu nhạt
};

const HP_W = 32;

export class EntityView extends PIXI.Container {
  readonly data: EntityData;
  private readonly body = new PIXI.Container();
  private readonly hpFill = new PIXI.Graphics();
  private readonly ring = new PIXI.Graphics();
  private readonly bodyTop: number; // đỉnh body (âm, tính từ chân)
  private bobPhase = Math.random() * Math.PI * 2;
  private readonly bobAmp: number;
  /** Unit đang ở state 'attacking' → nhấp nháy đỏ nhẹ (combat feedback Phase 5b). */
  private attacking = false;
  private blinkPhase = 0;

  constructor(data: EntityData) {
    super();
    this.data = { ...data };
    this.position.set(data.x, data.y);

    const color = BODY_COLOR[data.kind];
    const g = new PIXI.Graphics();
    let top = -28;
    let bob = 0;

    switch (data.kind) {
      case 'villager':
      case 'soldier':
      case 'animal': {
        // Unit: hình tròn đặc trưng + viền tối; lính có đai đầu đậm hơn
        g.circle(0, -14, 13).fill(color);
        g.circle(0, -14, 13).stroke({ color: 0x1a1a1a, width: 2, alpha: 0.7 });
        if (data.kind === 'soldier') {
          g.rect(-9, -24, 18, 5).fill(0x7a1f14);
        } else if (data.kind === 'animal') {
          g.circle(8, -18, 5).fill(color);
        } else {
          g.circle(0, -17, 5).fill(0x8a5a2b); // nón lá
        }
        top = -30;
        bob = 1.6;
        break;
      }
      case 'building': {
        // Nhà: chữ nhật nâu + mái tam giác (góc 3/4 cố định, không xoay)
        g.rect(-36, -58, 72, 58).fill(color);
        g.rect(-36, -58, 72, 58).stroke({ color: 0x3d2712, width: 2 });
        g.moveTo(-41, -58);
        g.lineTo(0, -80);
        g.lineTo(41, -58);
        g.closePath();
        g.fill(0x6b4420);
        g.rect(-8, -30, 16, 30).fill(0x3d2712); // cửa
        top = -84;
        break;
      }
      case 'tree': {
        g.rect(-3, -18, 6, 18).fill(0x6b4420); // thân tre
        g.circle(0, -30, 12).fill(color);
        g.circle(-9, -24, 9).fill(color);
        g.circle(9, -24, 9).fill(color);
        g.circle(-3, -33, 6).fill(0x43a047); // ngọn sáng
        top = -46;
        break;
      }
      case 'gold': {
        // Mỏ vàng: hình thoi
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
    this.addChild(this.body);
    this.bodyTop = top;
    this.bobAmp = bob;

    // Vòng chọn xanh (ẩn mặc định)
    this.ring.visible = false;
    if (data.kind === 'building') {
      this.ring.rect(-42, -62, 84, 66).stroke({ color: 0x35e05a, width: 2 });
    } else {
      this.ring.circle(0, -6, 19).stroke({ color: 0x35e05a, width: 2 });
    }
    this.addChild(this.ring);

    // Thanh HP (xanh → vàng → đỏ)
    const hpBg = new PIXI.Graphics();
    hpBg.rect(-HP_W / 2, top - 8, HP_W, 4).fill(0x141414);
    this.addChild(hpBg);
    this.addChild(this.hpFill);
    this.setHp(data.hp, data.maxHp);

    // Nhãn tiếng Việt
    const label = new PIXI.Text({
      text: data.label,
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: 11,
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 3 },
        align: 'center',
      },
    });
    label.anchor.set(0.5, 1);
    label.position.set(0, top - 10);
    this.addChild(label);

    this.setSelected(data.selected ?? false);
  }

  setHp(hp: number, maxHp: number): void {
    this.data.hp = hp;
    this.data.maxHp = maxHp;
    const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    const color = ratio > 0.5 ? 0x4caf50 : ratio > 0.25 ? 0xffc107 : 0xf44336;
    this.hpFill.clear();
    this.hpFill.rect(-HP_W / 2, this.bodyTop - 8, HP_W * ratio, 4).fill(color);
  }

  setSelected(selected: boolean): void {
    this.data.selected = selected;
    this.ring.visible = selected;
  }

  /** Cập nhật state từ sim — dùng để nhấp nháy đỏ khi 'attacking'. */
  setState(state: UnitState): void {
    const atk = state === 'attacking';
    if (atk !== this.attacking) {
      this.attacking = atk;
      if (!atk) this.body.tint = 0xffffff;
    }
  }

  /** Gọi mỗi frame khi entity nằm trong viewport (đã cull). */
  tick(dt: number): void {
    if (this.bobAmp > 0) {
      this.bobPhase += dt * 4;
      this.body.y = Math.sin(this.bobPhase) * this.bobAmp;
    }
    if (this.attacking) {
      this.blinkPhase += dt * 7;
      this.body.tint = Math.sin(this.blinkPhase) > 0 ? 0xff8080 : 0xffffff;
    }
  }
}
