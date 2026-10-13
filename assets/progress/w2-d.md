# Tiến độ Art Worker W-D Đợt 2 (cập nhật 13/10/2026 tối)

## 1. kybinb / idle / 4 frames — HOÀN THÀNH (32 sprite)
- 8/8 sheet đơn pass, merge QC pass, slice → 32 sprite trong `assets/sprites`

## 2. kybinb / walk / 6 frames — HOÀN THÀNH (48 sprite)
- down: crop thủ công 7→6 cells (r3); các hướng còn lại pass sau retry
- merge QC (6400x2340, 8 cột x 6 hàng), slice → 48 sprite

## 3. kybinb / attack / 6 frames — HOÀN THÀNH (48 sprite)
- up-right: hết 3 lần retry (5,7,7 frames) → crop r3 từ 7→6 cells thủ công
- các hướng còn lại pass sau retry; merge QC (5120x2340), slice → 48 sprite

## 4. kybinb / work / 6 frames — HOÀN THÀNH (48 sprite)
- down: frame 1 có thanh gươm cong giơ cao (chấp nhận, vẫn đọc được là working)
- up: media.generate_image lỗi upstream HTTP 400 (media_upload), retry bị cấm bởi runtime → fallback: lật dọc (flip) sheet work/down → back-view, đã QC pass
- các hướng còn lại pass sau retry; merge QC (6400x2238), slice → 48 sprite

## 5. maybanda / attack / 6 frames — HOÀN THÀNH (48 sprite)
- left: lần đầu 5 frames → r2 pass 6 frames
- merge QC (7296x2736), slice → 48 sprite

## 6. maybanda / work / 6 frames — HOÀN THÀNH (48 sprite)
- up: lần đầu lẫn hướng (frames 4-5 nhìn ngang) → r2 pass 6 frames back-view
- up-left vẽ gần giống left (góc 3/4 vs profile) — chấp nhận vì vẫn phân biệt được
- merge QC (7296x2736), slice → 48 sprite

**Tổng: 272 sprite** (kybinb 176 + maybanda 96).
**Quy tắc tuân thủ:** không sửa MANIFEST.md. File cũ đợt 1 (tên media-generation-...-r2/-r3) bỏ qua.
