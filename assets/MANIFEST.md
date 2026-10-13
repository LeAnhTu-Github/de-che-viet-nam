# MANIFEST — Art assets Đế Chế Việt Nam

Sản xuất hàng loạt ngày 13/10/2026 (6 worker song song). Sheet gốc: `assets/sheets/`. Sprite đã cắt: `assets/sprites/`.

## UNIT (12 unit MVP)

| Unit | idle | walk | attack | work | die | Ghi chú |
|---|---|---|---|---|---|---|
| nongdan | [x] pilot (32) | [x] pilot (48) | [x] (48) | [x] (48) | [x] (5) | work làm lại đợt 2 (8 sheet đơn ghép) |
| thonnu | [x] (32) | [x] (48) | [x] (48) | [x] (48) | [x] (5) | idle/walk/work làm lại đợt 2 |
| danbinh | [x] (32) | [x] (48) | [x] (48) | [x] (48) | [x] (5) | 4 state làm lại đợt 2; attack up-left = copy cột up (fallback, model fail 3/3) |
| daobinh | [x] (32) | [x] (48) | [x] (48) | [x] (48) | [x] (5) | walk/attack/work làm lại đợt 2 |
| cungthu | [x] (32) | [x] (48) | [x] (48) | [x] (48) | [x] (5) | idle/walk làm lại đợt 2; die gen lại đợt 2 với prompt "fallen warrior... fading", không bị chặn |
| giaobinh | [x] (32) | [x] (48) | [x] (48) | [x] (48) | [x] (5) | idle/walk/work làm lại đợt 2; die gen lại đợt 2; work: khiên bay rời + giáo cắm bên (nhất quán cả sheet, chấp nhận được) |
| trinhsat | [x] (32) | [x] (48) | [x] (48) | [x] (48) | [x] (5) | work làm lại đợt 2; die gen lại đợt 2 |
| kybinb | [x] (32) | [x] (48) | [x] (48) | [x] (48) | [x] (5) | 4 state làm lại đợt 2; work/up = flip dọc work/down (gen lỗi upstream) |
| voichien | [x] (32) | [x] (48) | [x] (48) | [x] (48) | [x] (5) | 4 state làm lại đợt 2 |
| thaymo | [x] (32) | [x] (48) | [x] (48) | [x] (48) | [x] (5) | 4 state làm lại đợt 2 |
| maybanda | [x] (32) | [x] (48) | [x] (48) | [x] (48) | [x] (5) | attack/work làm lại đợt 2; die gen lại đợt 2 ("destroyed catapult collapsing... fading") |
| nothan | [x] (32) | [x] (48) | [x] (48) | [x] (48) | [x] (5) | 4 state làm lại đợt 2; idle/up-left vẽ ballista thay vì repeating crossbow (lệch nhẹ 1 hướng); vài hướng dùng flip ngang/salvage cell |

**Unit: 60/60 sheet đạt** (2124 sprite trên đĩa). **Đợt 2 (13/10 tối): 39/39 sheet làm lại thành công, +1572 sprite mới** (chiến thuật 8 sheet đơn 1 hướng ghép lại, tỉ lệ pass ~96%).

## NHÀ (10/10 đạt, 47 sprites)

- [x] dinhlang, nhasan, khothoc, nhakho, ruonglua, trailinh, truongban, chuongngua, choicanh — mỗi nhà 5 sprites: `vn_bld_<id>_{build_1,build_2,build_3,idle,rubble}.png`
- [x] tuongdat — 2 sprites: `vn_bld_tuongdat_straight.png`, `vn_bld_tuongdat_corner.png`

## TÀI NGUYÊN (22/22 đạt) — `assets/sprites/resources/`

- [x] tre/cayto/caynho: full + cut (6)
- [x] buiqua: full + picked (2)
- [x] vang_1/2/3, da_1/2/3 (6)
- [x] nai, voinuoi, ho, ca (4)
- [x] tile_co, tile_dat, tile_cat, tile_nuoc (4)

## PHÁT HIỆN KỸ THUẬT ĐỢT 2 (13/10 tối — 6 worker, 39/39 sheet xong)

7. **Chiến thuật 8 sheet đơn + merge hiệu quả vượt trội**: tỉ lệ pass layout đơn ~96% (so với ~20-35% của layout 8 cột-hướng). Prompt sheet đơn cần câu đếm "1, 2, 3, 4, 5, 6" + "FACE is NEVER visible" để giữ đúng số ô và hướng lưng.
8. **Ảnh reference chống design drift hiệu quả**: đính kèm 1 sheet đã đạt của cùng unit vào mỗi prompt. Unit không có sheet đạt (danbinh, kybinb, voichien, thaymo, nothan) dùng sheet lỗi đợt 1 làm design ref — vẫn giữ được thiết kế nhất quán.
9. **Prompt die mới không bị chặn**: "Fallen warrior lying on the ground, 5 frames of fading into stillness" (tránh die/dying/death/killed/corpse) — 4/4 sheet die thành công, không lần nào bị pipeline chặn.
10. **Media tool luôn mangle tên file output** (bỏ qua param `name`, cắt `_r2`, `down-left`→`down-lef`) → luôn kiểm tra và rename tay về `vn_sheet_<unit>_<state>_<dir>.png` trước khi merge.
11. **Hiện tượng file biến mất bí ẩn**: 4 file `vn_sheet_nothan_work_*.png` biến mất sau khi rename khi nhiều worker cùng thao tác trong `sheets/` (đã khôi phục từ file gốc). Đợt sau nên cho mỗi worker thư mục staging riêng rồi mới copy vào.
12. Model rất kém vẽ repeating-crossbow ở góc front/up-left (bias về ballista) — nothan nên dùng sheet `vn_sheet_nothan_idle_right.png` (thiết kế chuẩn nhất) làm reference cho mọi lần gen sau.

## PHÁT HIỆN KỸ THUẬT (cho đợt gen tiếp theo) — đợt 1

1. **Model không giữ layout 8 cột = 8 hướng**: cột đổi hướng giữa các hàng, 7-8 cột cùng 1 hướng, nhân vật lộn ngược. Tỉ lệ pass sheet 8×6 chỉ ~20-35%.
2. **Model không đếm đúng số hàng**: xin 6 rows thường ra 5 (đôi khi 4), xin 4 rows thường ra 3.
3. **Sheet die 1 cột × 5 hàng đạt gần 100%** — layout đơn giản model làm tốt.
4. **"Dying animation" đôi khi bị media pipeline chặn** (integrity check, không nhất quán: W1/W3 gen được, W2 và maybanda bị chặn).
5. **Cross-state design drift**: nhân vật khác nhau giữa các state (gen độc lập từng sheet) — cần quyết định có thống nhất art direction toàn unit không.
6. Một số sheet lỗi vẫn salvage được (VD: giaobinh work 8×5 đẹp, chỉ thiếu 1 frame; thaymo work-r2 animation múa đẹp).

## PHƯƠNG ÁN ĐỀ XUẤT cho 39 sheet lỗi

Gen **8 sheet đơn** (mỗi sheet 1 hướng × N frames — layout model làm tốt) rồi ghép bằng script có sẵn:
`python3 assets/tools/merge_dir_sheets.py <unit_id> <state> <frames> assets/sheets assets/sheets/vn_sheet_<unit>_<state>.png`
rồi cắt như bình thường bằng `slice_sheet.py`. Prompt sheet đơn: STYLE LOCK + "<mô tả>. <STATE> animation: <N> frames, viewed from <direction>. Layout: strict vertical strip of 1 COLUMN x <N> ROWS = <N> cells, top to bottom."

Tiến độ chi tiết từng worker: `assets/progress/w1.md` … `w6.md`.
