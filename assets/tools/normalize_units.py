#!/usr/bin/env python3
"""Chuan hoa frame unit de engine ve dung co va dung cho dat chan.

Van de cua anh goc: nhieu frame van la NGUYEN O LUOI cua sheet (con ca duong ke o),
nhan vat chi chiem 1 phan o, moi sheet 1 ti le; so khac thi da cat sat. Ve theo kich
thuoc frame => nhan vat to nho that thuong, khung chon lech, chan khong cham dat.

Voi moi nhom (unit, state, huong):
  1. xoa duong ke o + vun, cat sat hinh ve;
  2. tinh diem dat chan (ax, ay) trong anh da cat va he so k = 1 / chieu-cao-chuan
     (client ve voi scale = chieu cao hien thi cua unit * k).
Nhom con nguyen o (moi frame cung kich thuoc) giu vi tri tuong doi trong o => het giat.

Can: Pillow, numpy, scipy. Goi tu prepare_client_assets.py (chay tren ban copy sach).
"""
import os, re
import numpy as np
from PIL import Image
from scipy import ndimage

NAME = re.compile(r"vn_unit_([a-z]+)_(idle|walk|attack|work|die)_([a-z-]+)_(\d+)\.png$")
BAND = 6  # dai sat mep anh, noi duong ke o nam

def clean(rgba):
    """Xoa duong ke o / vun con sot. Tra ve mask hinh ve (bool HxW)."""
    a = rgba[:, :, 3]
    mask = a > 40
    H, W = mask.shape
    # 1) hang/cot sat mep ma phan lon la net => duong ke (ke ca khi dinh vao nhan vat)
    for y in list(range(min(BAND, H))) + list(range(max(0, H - BAND), H)):
        if mask[y].mean() > 0.5:
            mask[y] = False
    for x in list(range(min(BAND, W))) + list(range(max(0, W - BAND), W)):
        if mask[:, x].mean() > 0.5:
            mask[:, x] = False
    # 2) thanh phan lien thong manh/dai (khung, doan ke) hoac vun nho
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        if sl is None:
            continue
        h = sl[0].stop - sl[0].start
        w = sl[1].stop - sl[1].start
        area = int((lab[sl] == i).sum())
        near_edge = (sl[0].start < 8 or sl[1].start < 8 or sl[0].stop > H - 8 or sl[1].stop > W - 8)
        outline = (w >= 0.6 * W or h >= 0.6 * H) and area < 0.2 * w * h and area < 0.08 * W * H
        segment = min(w, h) <= 4 and max(w, h) >= 15 and near_edge
        hairline = min(w, h) <= 3 and max(w, h) >= 20  # vach ke manh nam xa mep
        if outline or segment or hairline or area < 20:
            mask[lab == i] = False
    return mask

def bbox(mask):
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1

def normalize(sprite_dir):
    """Ghi de frame unit trong sprite_dir bang ban da cat; tra ve meta cho manifest:
    meta[unit][state][dir] = [[ax, ay, k], ...] theo thu tu frame."""
    groups = {}
    for fn in os.listdir(sprite_dir):
        m = NAME.match(fn)
        if m:
            groups.setdefault((m[1], m[2], m[3]), []).append((int(m[4]), fn))
    meta = {}
    for (unit, state, d), files in sorted(groups.items()):
        files.sort()
        frames = []
        for _, fn in files:
            path = os.path.join(sprite_dir, fn)
            rgba = np.array(Image.open(path).convert("RGBA"))
            mask = clean(rgba)
            bb = bbox(mask) or (0, 0, rgba.shape[1], rgba.shape[0])
            rgba[:, :, 3] = np.where(mask, rgba[:, :, 3], 0)
            frames.append((path, rgba, bb))
        sizes = {f[1].shape[:2] for f in frames}
        cells = len(frames) > 1 and len(sizes) == 1  # con nguyen o luoi => chung he toa do
        hs = [bb[3] - bb[1] for _, _, bb in frames]
        ws = [bb[2] - bb[0] for _, _, bb in frames]
        ref_h = float(np.median(hs))
        if state == "die":
            ref_h = float(hs[0]) if cells else 0.0  # nga xuong: lay frame dau (con dung)
        ground = float(max(bb[3] for _, _, bb in frames)) if state == "die" else float(np.median([bb[3] for _, _, bb in frames]))
        cx = float(np.median([(bb[0] + bb[2]) / 2 for _, _, bb in frames]))
        out = []
        for (path, rgba, bb), w, h in zip(frames, ws, hs):
            if cells:
                ax, ay, rh = cx - bb[0], ground - bb[1], ref_h
            else:
                ax, ay = w / 2, float(h)
                rh = ref_h if ref_h > 0 else float(max(w, h))
            Image.fromarray(rgba[bb[1]:bb[3], bb[0]:bb[2]]).save(path)
            out.append([round(ax, 1), round(ay, 1), round(1 / max(rh, 1), 5)])
        meta.setdefault(unit, {}).setdefault(state, {})[d] = out
    return meta
