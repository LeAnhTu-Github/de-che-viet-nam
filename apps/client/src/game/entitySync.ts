/**
 * entitySync.ts — Phase 6b: logic dùng CHUNG giữa LocalGameController và NetGameController.
 *
 * Tách từ localGame.ts để 2 mode local/net tái dùng 100% cách đồng bộ
 * entity → renderer (spawn/update/hp/selected/xóa view + projectile).
 */
import { UNITS, BUILDINGS, RESOURCES } from '@aoe-vn/sim';
import type { ResourceBag, ResourceType } from '@aoe-vn/sim';
import type { EntityKind, EntityView } from './entityView';
import type { GameRenderer } from './renderer';
import type { SelectionManager } from './selection';
import type { SimEntity, SimUnitEntity, SimProjectile, VisionMap } from './localGame';

/** defId trong UNITS/BUILDINGS/RESOURCES của sim (local: e.defId, net: dict[d]). */
export function defIdOf(e: SimEntity): string {
  return (e as { defId?: string }).defId ?? '';
}

/** Map EntityKind của sim → EntityKind của view (entityView.ts). */
export function mapKind(e: SimEntity): EntityKind {
  if (e.kind === 'building') return 'building';
  if (e.kind === 'resource') {
    const defId = defIdOf(e);
    if (defId === 'gold_mine') return 'gold';
    if (defId === 'stone_mine') return 'stone';
    return 'tree';
  }
  // unit
  const defId = defIdOf(e);
  return defId.includes('villager') ? 'villager' : 'soldier';
}

/** Tên tiếng Việt hiển thị: tra UNITS/BUILDINGS/RESOURCES, fallback defId. */
export function vnLabel(e: SimEntity): string {
  const defId = defIdOf(e);
  if (e.kind === 'unit') return UNITS[defId]?.vnName ?? defId;
  if (e.kind === 'building') return BUILDINGS[defId]?.vnName ?? defId;
  return RESOURCES[defId]?.vnName ?? defId;
}

/** maxHp cho entity net (snapshot chỉ có hp): tra def, fallback = hp hiện tại. */
export function maxHpOf(kind: SimEntity['kind'], defId: string, hp: number): number {
  if (kind === 'unit') return UNITS[defId]?.hp ?? hp;
  if (kind === 'building') return BUILDINGS[defId]?.hp ?? hp;
  return RESOURCES[defId]?.amount ?? hp;
}

/**
 * Đồng bộ state entity → renderer mỗi frame: spawn view mới, cập nhật
 * x/y/hp/selected/state, xóa view của entity đã biến mất, vẽ projectile.
 * `views` do controller sở hữu (giữ qua các frame).
 */
export function syncEntitiesToRenderer(
  views: Map<number, EntityView>,
  renderer: GameRenderer,
  entities: Map<number, SimEntity>,
  selection: SelectionManager,
  projectiles: SimProjectile[] = [],
  hoverId: number | null = null,
): void {
  const seen = new Set<number>();
  for (const e of entities.values()) {
    seen.add(e.id);
    let view = views.get(e.id);
    const defId = defIdOf(e);
    const isUnit = (e as SimUnitEntity).kind === 'unit';
    const isBuilding = e.kind === 'building';
    const isResource = e.kind === 'resource';
    // Resource node sim không có hp/maxHp — dùng amount (HP bar = lượng còn lại)
    const resAmt = isResource ? ((e as { amount?: number }).amount ?? 0) : undefined;
    const resMax = isResource ? maxHpOf(e.kind, defId, 0) : undefined;
    const effHp = resAmt ?? e.hp;
    const effMaxHp = resMax ?? e.maxHp;
    if (!view) {
      view = renderer.spawnEntity({
        kind: mapKind(e),
        label: vnLabel(e),
        x: e.x,
        y: e.y,
        hp: effHp,
        maxHp: effMaxHp,
        selected: selection.has(e.id),
        playerId: e.playerId,
        defId,
        unitState: isUnit ? (e as SimUnitEntity).state : undefined,
        buildProgress: isBuilding
          ? ((e as { progress?: number }).progress ?? 1)
          : undefined,
        resAmount: resAmt,
        resMaxAmount: resMax,
      });
      views.set(e.id, view);
    } else {
      // syncPosition tự suy hướng nhìn (facing) từ vector di chuyển của unit
      view.syncPosition(e.x, e.y);
      if (view.data.hp !== effHp || view.data.maxHp !== effMaxHp) {
        view.setHp(effHp, effMaxHp);
      }
      const sel = selection.has(e.id);
      if (view.data.selected !== sel) view.setSelected(sel);
      view.setHovered(e.id === hoverId);
      if (isUnit) {
        const st = (e as SimUnitEntity).state;
        view.setUnitState(st);
        // Đứng đánh / chặt / xây → quay mặt về mục tiêu (sim local có id mục tiêu; net thì không).
        if (st === 'attacking' || st === 'gathering' || st === 'building') {
          const t = e as { targetId?: number | null; targetNodeId?: number | null; buildTargetId?: number | null };
          const tid = st === 'attacking' ? t.targetId : st === 'gathering' ? t.targetNodeId : t.buildTargetId;
          const target = tid != null ? entities.get(tid) : undefined;
          if (target) view.faceToward(target.x, target.y);
        }
      } else if (isBuilding) {
        view.setBuildProgress((e as { progress?: number }).progress ?? 1);
      } else if (isResource) {
        view.setResourceAmount(resAmt ?? 0, resMax ?? 0);
      }
    }
  }
  for (const [id, view] of views) {
    if (!seen.has(id)) {
      renderer.removeEntity(view.data.id);
      views.delete(id);
    }
  }
  try {
    renderer.setProjectiles(projectiles);
  } catch {
    /* defensive: renderer nào không vẽ được projectile thì bỏ qua */
  }
}

/* ───────── Interface chung cho GameView (local & net) ───────── */

/** Tài nguyên phe người mà HUD đọc mỗi 250ms. */
export interface HumanResState {
  resources: ResourceBag;
  pop: number;
  popCap: number;
}

/**
 * Mọi controller mà GameView dùng phải implement đủ interface này.
 * LocalGameController (sim local) và NetGameController (snapshot server)
 * đều thỏa mãn về mặt cấu trúc (structural typing).
 */
export interface GameController {
  readonly selection: SelectionManager;
  readonly humanPlayerId: number;
  /** Entities hiện tại (local: từ sim; net: đã nội suy giữa 2 snapshot). */
  readonly entities: Map<number, SimEntity>;
  /** Entity đang bị rê chuột lên (GameView gán) — view hiện tên + thanh máu. */
  hoverId: number | null;

  /** Chạy mỗi frame: local = fixed-step sim; net = cập nhật nội suy. */
  stepAccum(dt: number): void;
  /** Hook trước syncToRenderer (local: không làm gì; net: tính interpolation). */
  beforeRender?(): void;
  syncToRenderer(renderer: GameRenderer): void;

  issueMove(x: number, y: number): void;
  issueBuild(buildingDefId: string, x: number, y: number): void;
  trainUnit(buildingId: number, unitDefId: string): void;
  issueAttackMove(x: number, y: number): void;
  /** Click phải vào địch: mọi unit đang chọn (có sức đánh) tấn công mục tiêu. */
  issueAttack(targetId: number): void;
  /** Click phải vào nhà đang xây của mình: dân đang chọn tới xây tiếp. */
  issueBuildSite(siteId: number): void;
  issueResearch(buildingId: number, techId: string): void;
  /** Ra lệnh khai thác node tài nguyên (Phase 7: client trước đây chưa từng gửi gather!). */
  issueGather(targetId: number, resource: ResourceType): void;
  /** Ra lệnh dừng (phím S): unit đứng yên, hủy nhiệm vụ. */
  issueStop(): void;
  /** Ra lệnh xóa (phím Delete): phá unit/nhà đang chọn của phe mình. */
  issueDelete(): void;

  humanResources(): HumanResState;
  drainAgeUpEvents(): { playerId: number; ageName: string; flavor: string }[];
  playerTechs(pid: number): string[];
  selectedBuilding(): SimEntity | undefined;
  selectedVillagers(): SimUnitEntity[];
  selectedMilitary(): SimUnitEntity[];
  unitsOfPlayer(pid: number): SimEntity[];
  /** Entity (unit/nhà/tài nguyên) dưới con trỏ — bắt theo hình sprite. */
  entityAt(x: number, y: number): SimEntity | undefined;
  getVision(pid: number): VisionMap | undefined;
  getProjectiles(): SimProjectile[];
}

// Re-export để GameView chỉ cần import 1 chỗ.
export type { SimEntity, SimUnitEntity, SimProjectile, VisionMap };
