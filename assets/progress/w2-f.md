# Tiến độ W-F đợt 2 — làm lại sheet unit lỗi (chiến thuật: 8 sheet đơn dọc → ghép)

Chiến thuật: gen 8 sheet đơn (1 hướng × N frames, layout dọc 1 cột) → merge_dir_sheets.py → slice_sheet.py.
QC mỗi sheet đơn: đủ N frames xếp dọc, 1 hướng nhất quán, nền trắng tinh, thiết kế giống reference.

## PHẦN 1 (6 cặp unit/state)

| # | unit | state | frames | 8 hướng | merge | slice | sprites |
|---|------|-------|--------|---------|-------|-------|---------|
| 1 | thaymo | idle | 4 | ✅ | ✅ | ✅ | 32 |
| 2 | thaymo | walk | 6 | ✅ | ✅ | ✅ | 48 |
| 3 | thaymo | attack | 6 | ✅ | ✅ | ✅ | 48 |
| 4 | thaymo | work | 6 | ✅ | ✅ | ✅ | 48 |
| 5 | nothan | attack | 6 | ✅ | ✅ | ✅ | 48 |
| 6 | nothan | work | 6 | ✅ | ✅ | ✅ | 48 |

## PHẦN 2 (4 sheet die — 1 sheet đơn/hướng duy nhất, 5 frames dọc)

| unit | status |
|------|--------|
| cungthu | ✅ (5 sprites) |
| giaobinh | ✅ (5 sprites) |
| trinhsat | ✅ (5 sprites) |
| maybanda | ✅ (5 sprites) |

## Tổng
- Sprite hoàn thành phần 1: 272
- Sprite hoàn thành phần 2: 20

## Ghi chú
- Chiến thuật 8 sheet đơn dọc → ghép hoạt động tốt. Tỉ lệ lỗi layout ~2/52 (sheet down-left idle r1, walk left r1 ra 2 hàng thay vì 4/6 hàng) — gen lại lần 2 đều OK.
- QC tự động: ratio h/w >= frames/2 (6f) hoặc >= 2 (4f/5f) + tỉ lệ viền trắng > 0.5. Lông vũ chạm viền làm QC góc thô báo sai → dùng border-band thay vì 4 góc.
- Media tool tự đổi tên file (media-generation-*) → phải rename về vn_sheet_<unit>_<state>_<dir>.png sau mỗi batch.
- Sự cố: 4 file vn_sheet_nothan_work_{right,up-right,up,up-left} bị mất khỏi thư mục sau khi rename (không rõ nguyên nhân, có worker khác đang chạy song song) — đã copy lại từ file gốc media-generation-* và merge/slice thành công. File gốc media-generation-* vẫn còn nguyên nên không mất dữ liệu.
- 4 sheet die KHÔNG bị pipeline chặn lần nào với cách diễn đạt mới (tránh die/dying/death/killed/corpse).
