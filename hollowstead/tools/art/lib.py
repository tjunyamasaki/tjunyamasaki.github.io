"""Shared helpers for the Hollowstead art generator.

Every asset is drawn in a free "design space" (roughly a 512 x 768 frame with the
ground near y=740). `build_sheet` measures the drawing, fits it into the footprint
the asset should occupy inside its 512 x 768 cell, and rescales outline widths so
every sprite ends up with the same line weight on screen.
"""
import io, json, math, random
import cairosvg
from PIL import Image

# ---------------------------------------------------------------- palette
O = "#2b2233"          # ink outline
INK_D = "#1e1624"      # deep hollows
BONE = "#efe6cf"; BONE_D = "#cbbd98"; BONE_L = "#fbf6e8"
MAR = "#8f3a3f"; MAR_D = "#6a2833"; MAR_L = "#b3564f"
ORG = "#d06a3a"; ORG_D = "#a8492f"; ORG_L = "#f0a060"
GOLD = "#e8b04a"; GOLD_D = "#b07a2a"; GOLD_L = "#f9dc8e"
TRK = "#6e3438"; TRK_D = "#4f2530"; TRK_L = "#9b5a4e"
WD = "#8a5a3c"; WD_D = "#5f3a2a"; WD_L = "#c08a5c"
DT = "#5a3a4a"; DT_D = "#3e2634"; DT_L = "#80566a"
RK = "#9a95b0"; RK_D = "#6f6b86"; RK_L = "#c9c6da"
MOSS = "#8a9a44"; MOSS_D = "#6a7a32"; MOSS_L = "#b8c46a"
LEAF = "#6f8f4e"; LEAF_D = "#4f6c3a"; LEAF_L = "#9fbf6a"
CR = "#7fd6c4"; CR_D = "#45a394"; CR_L = "#d4fff5"
MT = "#b9bccf"; MT_D = "#7d7f96"; MT_L = "#f0f2fa"
PU = "#9a6fd0"; PU_D = "#6b45a0"; PU_L = "#dcc8f7"
RD = "#d0504a"; RD_D = "#962f36"
SKIN = "#f2c9a0"; SKIN_D = "#d9a47c"
FL_O = "#e2703a"; FL_M = "#f4a64a"; FL_I = "#fbe0a0"
CLOTH = "#e8dcc0"; CLOTH_D = "#c4b393"

# ---------------------------------------------------------------- stroke scaling
K = 1.0          # multiplier applied to every stroke / brush width
TARGET_LINE = 13.0  # final outline thickness inside a 512 x 768 cell
BASE_LINE = 8.0

def sw(n):
    return f"{n * K:.2f}"

_id = [0]
def uid(p="c"):
    _id[0] += 1
    return f"{p}{_id[0]}"

def f(v):
    return f"{v:.1f}"

# ---------------------------------------------------------------- geometry
def smooth(pts, closed=True):
    n = len(pts)
    d = f"M{f(pts[0][0])} {f(pts[0][1])}"
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0 = pts[i - 1] if (closed or i > 0) else pts[i]
        p1, p2 = pts[i], pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if (closed or i + 2 < n) else p2
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f" C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}"
    return d + (" Z" if closed else "")

def blob(cx, cy, rx, ry, n, jit, seed, flat=None):
    r = random.Random(seed); pts = []
    for i in range(n):
        a = 2 * math.pi * i / n + r.uniform(-0.15, 0.15); k = 1 + r.uniform(-jit, jit)
        x = cx + rx * k * math.cos(a); y = cy + ry * k * math.sin(a)
        if flat is not None and y > flat:
            y = flat + (y - flat) * 0.25
        pts.append((x, y))
    return smooth(pts)

def cloud(cx, cy, rx, ry, n, seed, bulge=0.62):
    r = random.Random(seed); pts = []
    for i in range(n):
        a = 2 * math.pi * i / n + r.uniform(-0.08, 0.08); k = 1 + r.uniform(-0.06, 0.06)
        pts.append((cx + rx * k * math.cos(a), cy + ry * k * math.sin(a)))
    d = f"M{f(pts[0][0])} {f(pts[0][1])}"
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]; ch = math.dist(a, b) * bulge * r.uniform(0.9, 1.1)
        d += f" A{f(ch)} {f(ch)} 0 0 1 {f(b[0])} {f(b[1])}"
    return d + " Z"

def qpts(p0, c, p1, n=24):
    out = []
    for i in range(n + 1):
        t = i / n
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]
        dx = 2 * (1 - t) * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0])
        dy = 2 * (1 - t) * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1])
        L = math.hypot(dx, dy) or 1
        out.append((x, y, -dy / L, dx / L, t))
    return out

def ribbon(p0, c, p1, wfn):
    P = qpts(p0, c, p1)
    L = [(x + nx * wfn(t) / 2, y + ny * wfn(t) / 2) for x, y, nx, ny, t in P]
    R = [(x - nx * wfn(t) / 2, y - ny * wfn(t) / 2) for x, y, nx, ny, t in P]
    pts = L + R[::-1]
    return "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + " Z"

def limb(p0, c, p1, w0, w1):
    return ribbon(p0, c, p1, lambda t: w0 + (w1 - w0) * t)

def brush(p0, c, p1, w, col, op=1):
    """Tapered brush stroke (the signature highlight mark)."""
    ww = w * K
    return f'<path d="{ribbon(p0, c, p1, lambda t: ww * math.sin(math.pi * t) ** 0.8)}" fill="{col}" stroke="none" opacity="{op}"/>'

def union(ds, fill, w=None):
    """Outline pass then fill pass so overlapping shapes merge into one silhouette."""
    w = BASE_LINE * 2 if w is None else w
    return ("".join(f'<path d="{d}" fill="{fill}" stroke-width="{sw(w)}"/>' for d in ds)
            + "".join(f'<path d="{d}" fill="{fill}" stroke="none"/>' for d in ds))

def shaded(defs, d, base, dark, dx, dy, extra="", line=None):
    """Flat fill with a crescent shadow: dark copy, base copy offset, then outline."""
    cid = uid()
    defs.append(f'<clipPath id="{cid}"><path d="{d}"/></clipPath>')
    line = BASE_LINE if line is None else line
    return (f'<path d="{d}" fill="{dark}" stroke="none"/>'
            f'<g clip-path="url(#{cid})"><path d="{d}" fill="{base}" stroke="none" transform="translate({dx} {dy})"/>{extra}</g>'
            f'<path d="{d}" fill="none" stroke-width="{sw(line)}"/>')

def clipped(defs, d, inner):
    cid = uid(); defs.append(f'<clipPath id="{cid}"><path d="{d}"/></clipPath>')
    return f'<g clip-path="url(#{cid})">{inner}</g>'

def leaf(x, y, rot, s, col, line=3):
    return (f'<path d="M0 -10 Q9 0 0 10 Q-9 0 0 -10 Z" transform="translate({f(x)} {f(y)}) rotate({f(rot)}) scale({s})" '
            f'fill="{col}" stroke-width="{line * K / s:.2f}"/>')

def sparkle(x, y, s, col, op=1):
    return (f'<path d="M0 -10 Q1.5 -1.5 10 0 Q1.5 1.5 0 10 Q-1.5 1.5 -10 0 Q-1.5 -1.5 0 -10 Z" '
            f'transform="translate({f(x)} {f(y)}) scale({s})" fill="{col}" stroke="none" opacity="{op}"/>')

def line(d, w=5, col=None, extra=""):
    c = f' stroke="{col}"' if col else ""
    return f'<path d="{d}" fill="none"{c} stroke-width="{sw(w)}"{extra}/>'

def fill(d, col, w=BASE_LINE, extra=""):
    return f'<path d="{d}" fill="{col}" stroke-width="{sw(w)}"{extra}/>'

def fill_ns(d, col, op=1):
    return f'<path d="{d}" fill="{col}" stroke="none" opacity="{op}"/>'

def ell(cx, cy, rx, ry, col, w=BASE_LINE, rot=0, extra=""):
    t = f' transform="rotate({rot} {cx} {cy})"' if rot else ""
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{col}" stroke-width="{sw(w)}"{t}{extra}/>'

def rrect(x, y, w, h, r, col, lw=BASE_LINE, rot=None, extra=""):
    t = f' transform="rotate({rot[0]} {rot[1]} {rot[2]})"' if rot else ""
    return f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" rx="{f(r)}" fill="{col}" stroke-width="{sw(lw)}"{t}{extra}/>'

def G(body, tx=0, ty=0, rot=0, sc=1, sx=None):
    sxv = sc if sx is None else sx
    return f'<g transform="translate({f(tx)} {f(ty)}) rotate({f(rot)}) scale({sxv:.4f} {sc:.4f})">{body}</g>'

def gem(x, y, r, c, cd, cl):
    return (f'<circle cx="{x}" cy="{y}" r="{r}" fill="{cd}" stroke-width="{sw(5)}"/>'
            f'<path d="M{x - r * 0.8} {y} A{r * 0.8} {r * 0.8} 0 0 1 {x + r * 0.8} {y} Z" fill="{c}" stroke="none"/>'
            f'<circle cx="{x}" cy="{y}" r="{r}" fill="none" stroke-width="{sw(5)}"/>'
            f'<circle cx="{x - r * 0.35}" cy="{y - r * 0.35}" r="{r * 0.22}" fill="{cl}" stroke="none"/>')

def wraps(x0, x1, y0, y1, n, col, w=4):
    return "".join(f'<path d="M{f(x0)} {f(y0 + (y1 - y0) * i / n + 6)} L{f(x1)} {f(y0 + (y1 - y0) * i / n)}" fill="none" stroke="{col}" stroke-width="{sw(w)}"/>' for i in range(1, n))

def flame(cx, base, w, h, phase=0.0, seed=0):
    """Three-tone flame; `phase` animates the tongues (0..1)."""
    r = random.Random(seed)
    s = lambda k: math.sin(2 * math.pi * (phase + k))
    def shape(ww, hh, wob):
        tip = (cx + wob * s(0.1) * ww * 0.18, base - hh)
        return (f"M{f(tip[0])} {f(tip[1])} "
                f"Q{f(cx + ww * 0.42)} {f(base - hh * 0.62 + wob * s(0.3) * 6)} {f(cx + ww * 0.36 + wob * s(0.5) * 5)} {f(base - hh * 0.42)} "
                f"Q{f(cx + ww * 0.52 + wob * s(0.7) * 6)} {f(base - hh * 0.58)} {f(cx + ww * 0.55)} {f(base - hh * 0.72 + wob * s(0.2) * 8)} "
                f"Q{f(cx + ww * 0.78)} {f(base - hh * 0.3)} {f(cx + ww * 0.62)} {f(base - hh * 0.12)} "
                f"Q{f(cx + ww * 0.4)} {f(base + 4)} {f(cx)} {f(base)} "
                f"Q{f(cx - ww * 0.4)} {f(base + 4)} {f(cx - ww * 0.62)} {f(base - hh * 0.12)} "
                f"Q{f(cx - ww * 0.8)} {f(base - hh * 0.36)} {f(cx - ww * 0.52)} {f(base - hh * 0.6 + wob * s(0.6) * 8)} "
                f"Q{f(cx - ww * 0.46)} {f(base - hh * 0.46)} {f(cx - ww * 0.34 + wob * s(0.9) * 5)} {f(base - hh * 0.4)} "
                f"Q{f(cx - ww * 0.4)} {f(base - hh * 0.66)} {f(tip[0])} {f(tip[1])} Z")
    return (fill(shape(w, h, 1.0), FL_O)
            + fill(shape(w * 0.62, h * 0.66, 0.8), FL_M, 5)
            + fill(shape(w * 0.34, h * 0.36, 0.6), FL_I, 4))

# ---------------------------------------------------------------- measuring / fitting
def svg_doc(defs, body, vb, width, height):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="{vb}">'
            f'<defs>{defs}</defs><g stroke="{O}" stroke-linejoin="round" stroke-linecap="round" stroke-width="{sw(BASE_LINE)}">{body}</g></svg>')

def bbox(frame):
    defs, body = frame
    s = svg_doc("".join(defs), body, "-768 -768 2048 2304", 1024, 1152)
    im = Image.open(io.BytesIO(cairosvg.svg2png(bytestring=s.encode()))).convert("RGBA")
    bb = im.getchannel("A").point(lambda a: 255 if a > 10 else 0).getbbox()
    if not bb:
        return (0, 0, 1, 1)
    return (bb[0] * 2 - 768, bb[1] * 2 - 768, bb[2] * 2 - 768, bb[3] * 2 - 768)

def union_bb(bbs):
    return (min(b[0] for b in bbs), min(b[1] for b in bbs), max(b[2] for b in bbs), max(b[3] for b in bbs))

def fit_transform(ub, target, align="bottom", ref=None):
    tx0, ty0, tx1, ty1 = target
    uw, uh = ub[2] - ub[0], ub[3] - ub[1]
    s = min((tx1 - tx0) / uw, (ty1 - ty0) / uh)
    cx_src = (ref[0] + ref[2]) / 2 if ref else (ub[0] + ub[2]) / 2
    ox = (tx0 + tx1) / 2 - cx_src * s
    oy = (ty1 - ub[3] * s) if align == "bottom" else ((ty0 + ty1) / 2 - (ub[1] + ub[3]) / 2 * s)
    return s, ox, oy

def build_sheet(frame_fns, cols, rows, target, cell=(512, 768), out_scale=0.5, align="bottom", center_on_first=True):
    """frame_fns: list of callables returning (defs:list, body:str). Returns svg string."""
    global K
    K = 1.0
    frames = [fn() for fn in frame_fns]
    bbs = [bbox(fr) for fr in frames]
    s, ox, oy = fit_transform(union_bb(bbs), target, align, bbs[0] if center_on_first else None)
    # redraw with compensated line weight, measure again
    K = TARGET_LINE / (BASE_LINE * s)
    frames = [fn() for fn in frame_fns]
    bbs = [bbox(fr) for fr in frames]
    s, ox, oy = fit_transform(union_bb(bbs), target, align, bbs[0] if center_on_first else None)
    cw, ch = cell
    defs, body = [], []
    for i, (d, b) in enumerate(frames):
        cx, cy = (i % cols) * cw, (i // cols) * ch
        defs += d
        body.append(f'<g transform="translate({f(cx + ox)} {f(cy + oy)}) scale({s:.5f})">{b}</g>')
    K = 1.0
    return svg_doc("".join(defs), "".join(body), f"0 0 {cw * cols} {ch * rows}", int(cw * cols * out_scale), int(ch * rows * out_scale))

def render_png(svg, path=None, scale=1.0):
    png = cairosvg.svg2png(bytestring=svg.encode(), scale=scale)
    if path:
        open(path, "wb").write(png)
    return Image.open(io.BytesIO(png)).convert("RGBA")
