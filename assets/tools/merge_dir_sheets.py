#!/usr/bin/env python3
"""Ghep 8 sheet don (moi sheet 1 huong x N frames) thanh 1 sheet 8 cot x N hang.

Su dung: merge_dir_sheets.py <unit_id> <state> <frames> <in_dir> <out_png>
  - Tim file <in_dir>/vn_sheet_<unit>_<state>_<dir>.png voi <dir> trong
    down, down-right, right, up-right, up, up-left, left, down-left
  - Moi sheet don phai la 1 cot x <frames> hang (doc)
  - Ghep ngang theo thu tu 8 huong -> sheet 8 cot x N hang, phu hop slice_sheet.py

Vi du: merge_dir_sheets.py kybinb walk 6 assets/sheets assets/sheets/vn_sheet_kybinb_walk.png
"""
import sys
import os
from PIL import Image

DIRS = ["down", "down-right", "right", "up-right", "up", "up-left", "left", "down-left"]

def main():
    unit_id, state, frames, in_dir, out_png = sys.argv[1:6]
    frames = int(frames)
    cols = []
    for d in DIRS:
        p = os.path.join(in_dir, f"vn_sheet_{unit_id}_{state}_{d}.png")
        if not os.path.exists(p):
            # thu ten do media tool tu dat (chua rename)
            cands = [f for f in os.listdir(in_dir)
                     if f.startswith(f"vn_sheet_{unit_id}_{state}") and d.replace("-", "") in f.replace("-", "").replace("_", "")]
            if not cands:
                print(f"THIEU sheet huong {d} cho {unit_id} {state}", file=sys.stderr)
                sys.exit(1)
            p = os.path.join(in_dir, sorted(cands)[0])
        im = Image.open(p).convert("RGB")
        cols.append(im)
    # chuan hoa kich thuoc: lay min width, chia deu chieu cao theo frames
    w = min(im.width for im in cols)
    rh = min(im.height // frames for im in cols)
    norm = []
    for im in cols:
        ch = im.height // frames
        cells = [im.crop((0, r * ch, im.width, (r + 1) * ch)).resize((w, rh), Image.LANCZOS)
                 for r in range(frames)]
        strip = Image.new("RGB", (w, rh * frames), "white")
        for r, cell in enumerate(cells):
            strip.paste(cell, (0, r * rh))
        norm.append(strip)
    sheet = Image.new("RGB", (w * 8, rh * frames), "white")
    for c, strip in enumerate(norm):
        sheet.paste(strip, (c * w, 0))
    sheet.save(out_png)
    print(f"OK: ghep 8 huong -> {out_png} ({sheet.width}x{sheet.height})")

if __name__ == "__main__":
    main()
