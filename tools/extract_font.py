"""Extract Okimate 10 text glyphs from a 600-dpi scan of a real printout.

Each character is cut from its 10-cpi cell, all instances of the same character
are aligned and averaged, then the average is sampled on a 120 x 72 dpi dot grid.
Usage: python3 -I extract_font.py scan.png out.json atlas.png
"""
import json, sys
import numpy as np
from PIL import Image

LINES = open(sys.argv[4], encoding='utf-8').read().strip('\n').split('\n') if len(sys.argv) > 4 else None

CELL = 60.0                  # 10 cpi at 600 dpi
HP, VP = 600 / 120, 600 / 72 # dot pitch in scan pixels
ABOVE, BELOW = 80, 32        # crop around baseline (px)
PAD = 12

src, out_json, out_png = sys.argv[1:4]
ink = (np.asarray(Image.open(src).convert('L')) < 128).astype(np.float32)
H, W = ink.shape

rows = ink.sum(1)
on = rows > 3
lines, y = [], 0
while y < H:
    if on[y]:
        y0 = y
        while y < H and (on[y] or on[min(H - 1, y + 1)] or on[min(H - 1, y + 2)]):
            y += 1
        if y - y0 > 25 and (ink[y0:y].sum(0) > 0).sum() > 300:
            lines.append((y0, y))
    y += 1
assert len(lines) == len(LINES), (len(lines), len(LINES))

inst = {}
for (y0, y1), text in zip(lines, LINES):
    band = ink[y0:y1]
    cols = band.sum(0)
    phase = min(range(60), key=lambda p: sum(cols[int(p + k * CELL)] for k in range(int((W - p) / CELL))))
    n = int((W - phase) / CELL)
    cells = [k for k in range(n) if band[:, int(phase + k * CELL) + 6:int(phase + (k + 1) * CELL) - 6].sum() > 30]
    # map cells to text columns: text is monospaced, so cell index differences equal column differences
    chars = [(i, c) for i, c in enumerate(text) if c != ' ']
    if len(cells) != len(chars):
        # try to find a constant offset between text columns and cell indices
        print('skip', repr(text[:28]), len(cells), len(chars))
        continue
    # baseline: bottom of cells for chars without descenders
    bottoms = []
    for k, (_, c) in zip(cells, chars):
        if c in 'gjpqy,;': continue
        sub = band[:, int(phase + k * CELL):int(phase + (k + 1) * CELL)]
        r = np.nonzero(sub.sum(1))[0]
        if len(r): bottoms.append(r[-1])
    base = y0 + int(np.median(bottoms)) + 1
    for k, (_, c) in zip(cells, chars):
        xa = int(phase + k * CELL) - PAD
        crop = np.zeros((ABOVE + BELOW, int(CELL) + 2 * PAD), np.float32)
        ya = base - ABOVE
        part = ink[max(0, ya):base + BELOW, max(0, xa):xa + crop.shape[1]]
        crop[:part.shape[0], :part.shape[1]] = part
        crop[:, :PAD - 2] = 0; crop[:, PAD + int(CELL) + 2:] = 0
        inst.setdefault(c, []).append(crop)

def shift(a, dy, dx):
    return np.roll(np.roll(a, dy, 0), dx, 1)

def align(stack):
    ref = stack[0].copy()
    for it in range(3):
        out = []
        for a in stack:
            best = max(((dy, dx) for dy in range(-4, 5) for dx in range(-6, 7)), key=lambda d: (shift(a, *d) * ref).sum())
            out.append(shift(a, *best))
        ref = np.mean(out, 0)
    return ref

means = {c: align(v) for c, v in inst.items()}

# global sub-dot phase that makes the dot grid sharpest
def sample(m, py, px):
    nr, nc = int((m.shape[0] - py) // VP), int((m.shape[1] - px) // HP)
    g = np.zeros((nr, nc))
    for r in range(nr):
        for c in range(nc):
            g[r, c] = m[int(py + r * VP):int(py + (r + 1) * VP), int(px + c * HP):int(px + (c + 1) * HP)].mean()
    return g

best = max(((py, px) for py in range(0, 8) for px in range(0, 5)),
           key=lambda p: sum(np.abs(sample(m, *p) - 0.5).sum() for m in means.values()))
print('phase', best)
glyphs = {}
for c, m in sorted(means.items()):
    g = sample(m, *best)
    glyphs[c] = {'n': len(inst[c]), 'grid': [''.join('#' if v > 0.45 else '.' for v in row) for row in g]}
json.dump({'hp': HP, 'vp': VP, 'baselineRow': int((ABOVE - best[0]) // VP), 'glyphs': glyphs}, open(out_json, 'w'), ensure_ascii=False, indent=0)
print(len(glyphs), ''.join(sorted(glyphs)))

S = 4
keys = sorted(glyphs)
gh, gw = len(glyphs[keys[0]]['grid']), len(glyphs[keys[0]]['grid'][0])
per = 14
img = Image.new('L', (per * (gw + 1) * S, ((len(keys) + per - 1) // per) * (gh + 1) * S * 2), 255)
pxl = img.load()
for i, c in enumerate(keys):
    ox, oy = (i % per) * (gw + 1) * S, (i // per) * (gh + 1) * S * 2
    for r, row in enumerate(glyphs[c]['grid']):
        for q, v in enumerate(row):
            col = 0 if v == '#' else (225 if (r * 0) == 0 and r == int((ABOVE - best[0]) // VP) else 245)
            for a in range(S):
                for b in range(2 * S - 1):
                    pxl[ox + q * S + a, oy + r * 2 * S + b] = col
img.save(out_png)
