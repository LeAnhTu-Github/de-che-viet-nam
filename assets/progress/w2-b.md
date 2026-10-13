# W2-B — danbinh / daobinh (6 cặp unit/state, chiến thuật 8 sheet đơn → ghép)

Worker: W-B. Bắt đầu: 13/10/2026 ~18:35.

## Quy ước
- Style lock mọi prompt: "Top-down 2D RTS game sprite, clean vector-cartoon style, Vietnamese Hung Vuong era, skin tone #E8B88A, plain pure white background, no shadow, no ground, character centered, high contrast silhouette."
- 8 hướng (thứ tự merge): down, down-right, right, up-right, up, up-left, left, down-left
- Mỗi sheet đơn: 1 cột x N hàng dọc, 1 hướng nhất quán.
- Ghi chú design: ref danbinh (nón lá, áo nâu, gậy gỗ) và ref daobinh (tóc búi topknot, giáp da, kiếm đồng + khiên tròn) KHÔNG có "red headband" như UNIT_DESC gốc → prompt dùng mô tả khớp ref (ưu tiên ref theo chỉ đạo "chỉ dùng để giữ đúng thiết kế nhân vật").

## Tiến độ

### 1. danbinh / idle / 4 frames
- [x] HOÀN THÀNH → 32 sprites (sheet vn_sheet_danbinh_idle.png)

### 2. danbinh / walk / 6 frames
- [x] HOÀN THÀNH → 48 sprites (sheet vn_sheet_danbinh_walk.png)
- Ghi chú QC: right cần 3 lần (2 lần đầu 7 rows + quay nhầm sang trái), up cần 2 lần (lần 1 mặt chính diện), left cần 2 lần (lần 1 ô 1 không nhất quán).

### 3. danbinh / attack / 6 frames
- [x] HOÀN THÀNH → 48 sprites (sheet vn_sheet_danbinh_attack.png)
- Ghi chú QC: up cần 2 lần. up-left FAIL cả 3 lần (không giữ được hướng lưng nhất quán) → fallback: copy sheet up làm cột up-left.

### 4. danbinh / work / 6 frames → mục tiêu 48 sprites
- 21:10: gen batch 2 (up, up-left, left, down-left). Batch 1 QC: down PASS, down-right PASS, right PASS.
- 21:25: QC batch 2: up PASS, up-left PASS, left PASS, down-left PASS. up-right đã gen bổ sung → QC PASS.
- 21:30: daobinh walk batch 1 (down, down-right, right) — QC: cả 3 PASS ngay lần 1, khớp ref rất tốt (topknot, giáp viền họa tiết, kiếm cong + khiên tròn).

### 5. daobinh / walk / 6 frames
- [x] HOÀN THÀNH → 48 sprites (sheet vn_sheet_daobinh_walk.png). Tất cả 8 sheet PASS, up-right gen bổ sung.

### 6. daobinh / attack / 6 frames
- [x] HOÀN THÀNH → 48 sprites (sheet vn_sheet_daobinh_attack.png). Tất cả 8 sheet PASS (down có artifact kiếm bay nhẹ, chấp nhận được).

---
## KẾT QUẢ CUỐI (13/10/2026 ~23:00)
| # | unit | state | frames | sprites | ghi chú |
|---|------|-------|--------|---------|---------|
| 1 | danbinh | idle | 4 | 32 | OK |
| 2 | danbinh | walk | 6 | 48 | OK |
| 3 | danbinh | attack | 6 | 48 | up-left = fallback copy của up (model fail 3/3 giữ hướng lưng) |
| 4 | danbinh | work | 6 | 48 | OK (tool = búa gỗ) |
| 5 | daobinh | walk | 6 | 48 | OK |
| 6 | daobinh | attack | 6 | 48 | OK |
| **TỔNG** | | | | **272** | |

- Sprite naming: vn_unit_<unit>_<state>_<dir>_<row>.png trong workspace/aoe-web/assets/sprites/
- 6/6 cặp hoàn thành, 0 cặp thất bại hoàn toàn.
- MANIFEST.md không bị sửa.

### 6. daobinh / attack / 6 frames → mục tiêu 48 sprites
- [ ] ...

## Log
- 18:35: bắt đầu. Gen batch 1: danbinh idle (down, down-right, right, up-right).
- 18:45: QC batch 1 — FAIL 3/4: down, down-right, right đều vẽ 5 rows thay vì 4 (design + nền OK). up-right PASS (4 rows, khớp ref). → gen lại 3 sheet với nhấn mạnh "EXACTLY 4 cells", đồng thời gen nốt 4 hướng còn lại (up, up-left, left, down-left).
- 18:55: QC batch 2 — down r2 FAIL (4 ô nhưng 1 ô trống, chỉ 3 nhân vật) → còn 1 lần thử lại. down-right r2 PASS. up PASS (quay lưng đúng hướng up). right r2: 4 ô đầy, design OK nhưng mặt chính diện thay vì profile → thử lại 1 lần với prompt profile mạnh hơn. up-right đã PASS từ batch 1.
- 19:05: QC batch 3 — down r3 PASS. right r3 PASS (profile phải đúng). up-left FAIL (layout vỡ: 4 ô dọc + 4 ô nhỏ 2x2 = 8 ô). left FAIL (5 rows). → mỗi cái còn 1 lần thử lại. down-left chưa gen.
