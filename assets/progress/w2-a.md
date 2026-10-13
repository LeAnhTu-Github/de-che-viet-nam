# W2-A — Art worker đợt 2 (sheet đơn → ghép script) ✅ HOÀN THÀNH

6 cặp (unit,state): 48 sheet đơn total, 256 sprite total.
(hoàn thành 13/10/2026)

## 1. nongdan / work / 6 frames
- [x] down  - [x] down-right  - [x] right (retry1 ok)  - [x] up-right
- [x] up  - [x] up-left  - [x] left  - [x] down-left
- merge: OK 6912x2640  slice: OK  sprites: **48**

## 2. thonnu / idle / 4 frames
- [x] down  - [x] down-right (retry1 ok)  - [x] right (retry1 ok)  - [x] up-right
- [x] up (retry1 ok)  - [x] up-left  - [x] left  - [x] down-left (retry2 ok)
- merge: OK 6400x2240  slice: OK  sprites: **32**

## 3. thonnu / walk / 6 frames
- [x] down (retry1 ok)  - [x] down-right  - [x] right  - [x] up-right (retry2 ok)
- [x] up  - [x] up-left  - [x] left  - [x] down-left (retry1 ok, cắt bỏ số thứ tự frame)
- merge: OK 5856x2736  slice: OK  sprites: **48**

## 4. thonnu / work / 6 frames
- [x] down  - [x] down-right  - [x] right  - [x] up-right
- [x] up  - [x] up-left  - [x] left (retry2 ok)  - [x] down-left
- merge: OK 5120x2736  slice: OK  sprites: **48**

## 5. cungthu / idle / 4 frames
- [x] down  - [x] down-right  - [x] right (retry1 ok)  - [x] up-right
- [x] up  - [x] up-left  - [x] left  - [x] down-left (retry1 ok)
- merge: OK 6400x2240  slice: OK  sprites: **32**

## 6. cungthu / walk / 6 frames
- [x] down  - [x] down-right  - [x] right  - [x] up-right
- [x] up (retry1 ok)  - [x] up-left  - [x] left (retry1 ok)  - [x] down-left
- merge: OK 7296x2352  slice: OK  sprites: **48**

## Retry log
- nongdan/work/right: gen lần 1 — mũ cói tròn thay vì nón lá chóp nón → retry 1 (OK)
- thonnu/idle/right: gen lần 1 — vẽ top-down nhìn thẳng từ trên, méo tròn, không 3/4 như các sheet khác → retry 1 (chưa dùng)
- thonnu/idle/down-right: gen lần 1 — giỏ có thêm lúa (các sheet khác giỏ trống) → retry 1 (chưa dùng)

- thonnu/walk/down: gen lần 1 — frame 4-5 có 2 cái giỏ → retry 1 (chưa dùng)
- thonnu/walk/up-right: gen lần 1 — frame 3 có 2 giỏ → retry 1: frame 4 vẫn 2 giỏ → retry 2: OK (giỏ thấp bên hông)
- thonnu/work/left: gen lần 1 — vẽ 5 cells thay vì 6 → retry 1: vẫn 5 cells → retry 2: OK
- cungthu/idle/right: gen lần 1 — vẽ 5 cells thay vì 4 → retry 1: OK
- cungthu/idle/down-left: gen lần 1 — frame 2 có 2 cây cung → retry 1: OK
- cungthu/walk/up: gen lần 1 — vẽ 5 cells thay vì 6 → retry 1: OK
- cungthu/walk/left: gen lần 1 — chỉ frame 1+6 hướng left, frame 2-5 quay mặt về viewer → retry 1 (chưa dùng)
