/**
 * selection.ts — Phase 2b: quản lý tập entity đang được chọn.
 *
 * Dùng chung cho click đơn, drag-box, và (sau này) phím tắt / control group.
 * Mọi thay đổi báo qua onChange để HUD React cập nhật.
 */
export class SelectionManager {
  /** ID sim entity đang được chọn. */
  readonly selected = new Set<number>();

  private onChange: (() => void) | null = null;

  /** Đăng ký callback khi tập chọn thay đổi (HUD). Gọi với null để hủy. */
  setOnChange(fn: (() => void) | null): void {
    this.onChange = fn;
  }

  get count(): number {
    return this.selected.size;
  }

  has(id: number): boolean {
    return this.selected.has(id);
  }

  /** Bỏ chọn tất cả. */
  clear(): void {
    if (this.selected.size === 0) return;
    this.selected.clear();
    this.onChange?.();
  }

  /**
   * Chọn 1 entity. additive=false (mặc định): thay thế toàn bộ tập chọn;
   * additive=true: cộng thêm vào tập hiện tại (giữ chỗ cho Shift+click sau này).
   */
  select(id: number, additive = false): void {
    if (!additive) {
      if (this.selected.size === 1 && this.selected.has(id)) return;
      this.selected.clear();
      this.selected.add(id);
      this.onChange?.();
      return;
    }
    if (this.selected.has(id)) return;
    this.selected.add(id);
    this.onChange?.();
  }

  /** Chọn theo khung kéo: thay toàn bộ tập chọn bằng danh sách id (bỏ trùng). */
  selectBox(ids: number[]): void {
    const next = new Set(ids);
    if (next.size === this.selected.size && [...next].every((id) => this.selected.has(id))) {
      return;
    }
    this.selected.clear();
    for (const id of next) this.selected.add(id);
    this.onChange?.();
  }

  /**
   * Shift+click (giống AoE): có rồi → bỏ ra, chưa có → thêm vào.
   * Trả về true nếu sau toggle entity đang được chọn.
   */
  toggle(id: number): boolean {
    if (this.selected.has(id)) {
      this.selected.delete(id);
      this.onChange?.();
      return false;
    }
    this.selected.add(id);
    this.onChange?.();
    return true;
  }
}
