#!/usr/bin/env python3
"""Xoa nen duc (trang/xam) con sot o mot so sprite: flood-fill tu vien anh vao,
dung lai o vien den cua hinh ve. Chi dong vao file co goc anh duc; idempotent.
Dung: python3 assets/tools/fix_opaque_bg.py [thu_muc_sprites]
"""
import os, sys
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_DIR = os.path.join(ROOT, "apps", "client", "public", "sprites")
THRESH = 40  # do lech mau toi da so voi diem bat dau (tong tuyet doi RGBA)

def ring_points(w, h, inset, step=4):
    x0, y0, x1, y1 = inset, inset, w - 1 - inset, h - 1 - inset
    if x1 <= x0 or y1 <= y0:
        return []
    pts = []
    for x in range(x0, x1 + 1, step):
        pts += [(x, y0), (x, y1)]
    for y in range(y0, y1 + 1, step):
        pts += [(x0, y), (x1, y)]
    return pts

def near(c, bg):
    return c[3] > 250 and sum(abs(c[i] - bg[i]) for i in range(3)) <= THRESH

def fix(path):
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    changed = False
    framed = False
    # Vong 0 = vien anh; vong 4px = ben trong duong ke khung o (sot lai khi cat sheet).
    for inset in (0, 4):
        pts = ring_points(w, h, inset)
        cols = [im.getpixel(p) for p in pts]
        solid = [c for c in cols if c[3] > 250]
        if not pts or len(solid) < 0.6 * len(pts):
            continue  # vong nay da trong suot phan lon -> sprite binh thuong
        bg = max(set(solid), key=solid.count)
        if sum(1 for c in solid if near(c, bg)) < 0.6 * len(pts):
            continue  # khong co mau nen thong nhat -> hinh ve cham vien, khong dung vao
        for p in pts:
            if near(im.getpixel(p), bg):
                ImageDraw.floodfill(im, p, (0, 0, 0, 0), thresh=THRESH)
                changed = True
                framed = framed or inset > 0
    if framed:
        # Nen nam ben trong duong ke khung -> xoa luon dai 3px ngoai cung (duong ke).
        px = im.load()
        for y in range(h):
            for x in range(w):
                if x < 3 or y < 3 or x >= w - 3 or y >= h - 3:
                    px[x, y] = (0, 0, 0, 0)
    if changed:
        im.save(path)
    return changed

def main():
    d = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DIR
    n = 0
    for dp, _, fs in os.walk(d):
        for f in sorted(fs):
            if f.endswith(".png") and not f.startswith("vn_tile_") and fix(os.path.join(dp, f)):
                n += 1
                print("fixed", f)
    print(n, "file da xoa nen")

if __name__ == "__main__":
    main()
