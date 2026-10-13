# W-C Đợt 2 — HOÀN THÀNH 5/5 (worker cc07739c)

Chiến thuật: gen 8 sheet đơn (1 hướng × N frames, layout dọc) → ghép merge_dir_sheets.py → slice_sheet.py

| Cặp | Sheet đơn | Ghép (kích thước, QC cell) | Sprite |
|---|---|---|---|
| daobinh / work / 6f | 8/8 PASS | vn_sheet_daobinh_work.png 7296×2736, 48/48 cell đầy | 48 |
| giaobinh / idle / 4f | 8/8 PASS (left repair 5→4) | vn_sheet_giaobinh_idle.png 6400×2240, 32/32 cell đầy | 32 |
| giaobinh / walk / 6f | 8/8 PASS | vn_sheet_giaobinh_walk.png 7296×2736, 48/48 cell đầy | 48 |
| giaobinh / work / 6f | 8/8 PASS | vn_sheet_giaobinh_work.png 6400×2736, 48/48 cell đầy | 48 |
| trinhsat / work / 6f | 8/8 PASS | vn_sheet_trinhsat_work.png 6400×2736, 48/48 cell đầy | 48 |

**Tổng: 224 sprite.**

## Nhật ký retry

- daobinh/work down-right: gen1 (dao thay búa) → r2 (7f) → r3 PASS (6f)
- daobinh/work left: gen1 (7f) → r2 PASS
- giaobinh/idle right: gen1 (6f) → r2 PASS (4f)
- giaobinh/idle up-right: gen1 (5f) → r2 (5f) → r3 PASS (4f; mũ rồng hơi drift, khiên bị che — chấp nhận)
- giaobinh/idle up-left: gen1 (5f) → r2 PASS (4f)
- giaobinh/idle left: gen1 (5f) → r2 (5f) → r3 (5f) → hết 2 retry → repair script: tách 5 cell lấy 4 đầu → PASS
- giaobinh/walk up-right: gen1 (frame 4 nhân đôi nhân vật) → r2 PASS
- giaobinh/walk up-left: gen1 (7f + sai hướng) → r2 PASS (6f, hướng đúng)
- giaobinh/walk left: gen1 (9f + grid đen + giáo thừa) → r2 PASS
- giaobinh/work left: gen1 (7f) → r2 PASS
- trinhsat/work up-right: gen1 (5f + mặt anime drift) → r2 PASS (6f, mặt trống đúng ref)

## Ghi chú

- giaobinh/work: khiên bay rời + giáo cắm bên là pattern nhất quán cả 8 sheet (chấp nhận)
- KHÔNG sửa MANIFEST.md (theo quy tắc)
