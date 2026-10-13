#!/usr/bin/env python3
"""Toi uu sprite: downscale ve kich thuoc hop ly + PNG optimize.
Giu nguyen ti le, alpha, ten file. An toan chay lai nhieu lan (idempotent).
"""
import os, sys
from PIL import Image

CAPS = [
    ("vn_unit_", 160),   # unit hien thi ~40px
    ("vn_bld_", 384),    # nha lon nhat ~160px
    ("vn_tile_", 256),   # tile 64px x4
    ("vn_res_", 256),
]

def cap_for(name):
    for prefix, cap in CAPS:
        if os.path.basename(name).startswith(prefix):
            return cap
    return 256

def process_file(path):
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    cap = cap_for(path)
    if max(w, h) > cap:
        scale = cap / max(w, h)
        im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    # quantize nhe: RGB 256 mau, giu alpha rieng (style cartoon chiu tot)
    alpha = im.split()[3]
    rgb = im.convert("RGB").quantize(colors=256, method=Image.FASTOCTREE).convert("RGBA")
    rgb.putalpha(alpha)
    rgb.save(path, optimize=True)

def main():
    root = sys.argv[1]
    files = []
    for dp, _, fns in os.walk(root):
        for fn in fns:
            if fn.endswith(".png"):
                files.append(os.path.join(dp, fn))
    print(f"{len(files)} files", flush=True)
    for i, f in enumerate(files):
        try:
            process_file(f)
        except Exception as e:
            print(f"  SKIP {f}: {e}", flush=True)
        if (i + 1) % 400 == 0:
            print(f"  {i+1}/{len(files)}", flush=True)
    print("done", flush=True)

if __name__ == "__main__":
    main()
