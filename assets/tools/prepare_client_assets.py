#!/usr/bin/env python3
"""Chuan bi assets cho client (chay lai duoc nhieu lan, luon bat dau tu ban goc):
1. Copy assets/sprites (ban goc) -> apps/client/public/sprites
2. Downscale PNG > 512px (tile/resource 1600px) ve max 256px (ban public)
3. Xoa nen duc con sot (fix_opaque_bg) + chuan hoa frame unit (normalize_units)
4. Sinh manifest.json: frame hien co + unitMeta (diem dat chan, ti le tung frame)
Can: Pillow, numpy, scipy.
"""
import json, os, shutil, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "assets", "sprites")
DST = os.path.join(ROOT, "apps", "client", "public", "sprites")
MAX_DIM = 256   # downscale file goc > 512px
DOWNSCALE_IF_OVER = 512

def main():
    if not os.path.exists(SRC):
        sys.exit("Khong tim thay ban goc: " + SRC)
    from PIL import Image
    import fix_opaque_bg, normalize_units
    if os.path.exists(DST):
        shutil.rmtree(DST)
    shutil.copytree(SRC, DST)
    # downscale file qua to (ban public)
    for dirpath, _, files in os.walk(DST):
        for fn in files:
            if not fn.endswith(".png") or fn == "manifest.json":
                continue
            p = os.path.join(dirpath, fn)
            im = Image.open(p)
            if max(im.size) > DOWNSCALE_IF_OVER:
                im.thumbnail((MAX_DIM, MAX_DIM), Image.LANCZOS)
                im.save(p)
                print("downscale", os.path.relpath(p, DST), im.size)
    n_bg = sum(
        fix_opaque_bg.fix(os.path.join(dp, f))
        for dp, _, fs in os.walk(DST) for f in fs
        if f.endswith(".png") and not f.startswith("vn_tile_")
    )
    print("xoa nen duc:", n_bg, "file")
    unit_meta = normalize_units.normalize(DST)
    # manifest
    units = {}
    buildings = {}
    resources = []
    tiles = []
    for dirpath, _, files in os.walk(DST):
        for fn in sorted(files):
            if fn == "manifest.json":
                continue
            rel = os.path.relpath(os.path.join(dirpath, fn), DST)
            if fn.startswith("vn_unit_"):
                # vn_unit_<id>_<state>_<dir...>_<frame>.png
                base = fn[len("vn_unit_"):-4]
                parts = base.split("_")
                frame = int(parts[-1])
                rest = parts[:-1]
                # state la 1 trong cac state biet truoc
                for st in ("idle", "walk", "attack", "work", "die"):
                    if st in rest:
                        si = rest.index(st)
                        uid = "_".join(rest[:si])
                        d = "_".join(rest[si + 1:]) or "down"
                        break
                else:
                    continue
                units.setdefault(uid, {}).setdefault(st, {}).setdefault(d, 0)
                units[uid][st][d] = max(units[uid][st][d], frame + 1)
            elif fn.startswith("vn_bld_"):
                base = fn[len("vn_bld_"):-4]
                # vn_bld_<id>_<state>
                for st in ("build_1", "build_2", "build_3", "idle", "rubble", "straight", "corner"):
                    if base.endswith("_" + st):
                        bid = base[: -(len(st) + 1)]
                        buildings.setdefault(bid, []).append(st)
                        break
            if fn.startswith("vn_res_"):
                resources.append(rel.replace(os.sep, "/"))
            elif fn.startswith("vn_tile_"):
                tiles.append(rel.replace(os.sep, "/"))
    man = {"units": units, "unitMeta": unit_meta, "buildings": buildings,
           "resources": resources, "tiles": tiles}
    with open(os.path.join(DST, "manifest.json"), "w") as f:
        json.dump(man, f)
    n_unit_files = sum(
        c for u in units.values() for s in u.values() for c in s.values()
    )
    print(f"manifest: {len(units)} units ({n_unit_files} frames), "
          f"{len(buildings)} buildings, {len(resources)} resources, {len(tiles)} tiles")

if __name__ == "__main__":
    main()
