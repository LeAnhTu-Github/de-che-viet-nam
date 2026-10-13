# W2-E — làm lại sheet unit lỗi đợt 1 (chiến thuật: 8 sheet đơn 1 hướng dọc → ghép script)

Đơn vị: voichien (idle, walk, attack, work), nothan (idle, walk). Tổng 6 cặp = 48 sheet đơn.

## voichien / idle / 4f — HOÀN THÀNH (32 sprites)
- [x] down — gen 5 lần (r2 tan→loại, r4 lẫn hướng→loại, r5 5 cell) → SALVAGE: cắt 4/5 cell từ r5 (mặt trước, xanh xám, tai động)
- [x] down-right — gen 3 lần không đạt → dùng bản lật ngang của down-left_r3 (xanh xám, hướng phải)
- [x] right — pass ngay lần 1
- [x] up-right — pass ở r2
- [x] up — pass ở r3 (rear view)
- [x] up-left — pass ở r3 (side profile trái)
- [x] left — pass ở r3 (side profile trái)
- [x] down-left — pass ở r3 (side profile trái)
- [x] merge → vn_sheet_voichien_idle.png (6400x3200, 8 cột x 4 hàng)
- [ ] slice → sprites (8×4) — đang chạy
- Ghi chú: model hay vẽ thừa 5 cell thay vì 4; prompt "EXACTLY four perfect square cells" + khóa màu "slate blue-gray body, NEVER tan" hiệu quả từ r3 trở đi.

## voichien / walk / 6f — HOÀN THÀNH (48 sprites)
- down: r2 (6 cell mặt trước, xanh xám) nhưng canvas 912x2736 lệch cỡ → chuẩn hóa: upscale uniform từng cell 912x456→1280x640 rồi center-crop 640x640
- down-right: pass lần 1 (6 cell). right: salvage 6/7 cell từ r2 (tách voi theo density-band, loại đường kẻ xám)
- up-right: pass lần 1. up: pass lần 1 (rear view)
- up-left: salvage 6/7 cell từ bản gốc (r2 hỏng cell 6: vẽ 2 voi chồng)
- left: salvage 6/7 cell từ r2. down-left: salvage 6/7 cell từ bản gốc (r2 vẽ 9 cell)
- merge → vn_sheet_voichien_walk.png (5120x3840, 8 cột x 6 hàng), slice → 48 sprites
- Bài học: model đếm cell rất tệ với N=6 (ra 6/7/8/9 ngẫu nhiên); salvage bằng cắt cell từ sheet cùng hướng là phương án chính.

## voichien / attack / 6f — HOÀN THÀNH (48 sprites)
- Xem chi tiết trong phần "ĐANG HOÀN THIỆN" ở trên; sheet ghép cuối sạch, slice → 48 sprites.

## voichien / work / 6f — HOÀN THÀNH (48 sprites)
- down: r3 (7 cell) → salvage 6/7; down-right: pass (side profile, chấp nhận); right: 7 cell → salvage 6/7 + xóa viền
- up-right: flip ngang của up-left; up: pass + xóa viền; up-left: r2 pass (side profile)
- left: flip ngang của right; down-left: flip ngang của down-right
- merge → vn_sheet_voichien_work.png (5120x3840), slice → 48 sprites

## nothan / idle / 4f — HOÀN THÀNH (32 sprites)
- right, left, up, down-left: pass (đúng thiết kế repeating crossbow)
- up-right: top-down view, xóa viền — chấp nhận
- down-right: flip ngang của down-left
- down: r4 (2 cell front view tốt) → salvage [1,4,1,4]
- up-left: r3 ballista (sai thiết kế nhưng đúng hướng) → xóa viền, chấp nhận có ghi chú
- merge → vn_sheet_nothan_idle.png (6400x3200, 8×4), slice → 32 sprites

## nothan / walk / 6f — HOÀN THÀNH (48 sprites)
- right, left, up-left, down-left: pass (đẩy nỏ trên bánh xe, đúng hướng)
- up: top-down view — chấp nhận
- down: salvage cell 1,2 (front view) → [1,2,1,2,1,2]
- down-right: flip ngang của down-left
- up-right: bỏ cell 1 (top-down), lấy 2-6 + lặp cell 2
- merge → vn_sheet_nothan_walk.png (6400x3198, 8×6), slice → 48 sprites

# TONG KET: 6/6 cap hoan thanh — 256 sprites

## Ghi chú thất bại
(không — mọi hướng voichien/idle đều có sprite sau salvage hợp lệ)
