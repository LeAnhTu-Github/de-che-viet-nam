#!/usr/bin/env python3
"""Cat sprite sheet AI thanh sprite PNG nen trong suot.

Su dung: slice_sheet.py <sheet.png> <unit_id> <state> <cols> <rows> <out_dir>
Vi du:  slice_sheet.py sheet.png nongdan idle 8 4 assets/sprites

- Moi cot = 1 huong: down, down-right, right, up-right, up, up-left, left, down-left
- Moi hang = 1 frame
- Tach nen trang bang flood-fill tu vien (giu lai mau trang BEN TRONG nhan vat)
"""
import sys
import numpy as np
from PIL import Image

DIRS = ["down", "down-right", "right", "up-right", "up", "up-left", "left", "down-left"]

def remove_white_bg(cell: Image.Image) -> Image.Image:
    """Flood-fill vung trang noi voi vien -> trong suot. Giua lai trang ben trong."""
    img = cell.convert("RGBA")
    a = np.array(img)
    h, w = a.shape[:2]
    rgb = a[:, :, :3].astype(np.int16)
    # pixel gan trang: tat ca kenh > 235
    white = (rgb[:, :, 0] > 235) & (rgb[:, :, 1] > 235) & (rgb[:, :, 2] > 235)
    # flood fill tu 4 vien
    seen = np.zeros((h, w), dtype=bool)
    stack = []
    for x in range(w):
        if white[0, x]: stack.append((0, x))
        if white[h - 1, x]: stack.append((h - 1, x))
    for y in range(h):
        if white[y, 0]: stack.append((y, 0))
        if white[y, w - 1]: stack.append((y, w - 1))
    while stack:
        y, x = stack.pop()
        if y < 0 or y >= h or x < 0 or x >= w or seen[y, x] or not white[y, x]:
            continue
        seen[y, x] = True
        stack.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
    # seen = nen -> alpha 0; vien mo: pixel trang sat bien -> alpha giam dan
    alpha = a[:, :, 3].copy()
    alpha[seen] = 0
    # feather 1px quanh bien de tranh rang cua trang
    from scipy.ndimage import binary_dilation
    edge = binary_dilation(seen) & ~seen & white
    alpha[edge] = (alpha[edge].astype(np.int16) // 2)
    a[:, :, 3] = alpha
    out = Image.fromarray(a)
    # trim vien trong suot
    bbox = out.split()[3].getbbox()
    return out.crop(bbox) if bbox else out

def main():
    sheet_path, unit_id, state, cols, rows, out_dir = sys.argv[1:7]
    cols, rows = int(cols), int(rows)
    sheet = Image.open(sheet_path).convert("RGB")
    W, H = sheet.size
    cw, ch = W / cols, H / rows
    inset = 4  # tranh duong ke grid
    n = 0
    import os
    for r in range(rows):
        for c in range(cols):
            d = DIRS[c] if c < len(DIRS) else f"dir{c}"
            x0 = int(c * cw + inset); y0 = int(r * ch + inset)
            x1 = int((c + 1) * cw - inset); y1 = int((r + 1) * ch - inset)
            cell = sheet.crop((x0, y0, x1, y1))
            spr = remove_white_bg(cell)
            name = f"vn_unit_{unit_id}_{state}_{d}_{r}.png"
            spr.save(os.path.join(out_dir, name))
            n += 1
    print(f"OK: {n} sprites -> {out_dir}")

if __name__ == "__main__":
    main()
