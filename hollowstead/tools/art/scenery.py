"""Scenery art: non-interactive decoration, border props and ambient critters.

    python3 tools/art/build.py --only scenery [--preview out.png]      (registered in build.py)
    python3 tools/art/scenery.py                                       (same, standalone)

Everything is packed into ONE atlas, themes/harvest/sprites/scenery.svg, and its cell table is written
to src/scenery-atlas.mjs (generated: do not edit by hand). Every drawing shares one design space:
U design units per world unit, upright things stand on (256, 740), flat decals and fliers are centred on
(256, 512). So a prop's size in the world is simply its drawn size, and animation frames line up.

Decoration must stay quieter than the nodes you can harvest: smaller and in softer colours. It keeps the
same outline weight as everything else (lib.LINE_WU), so it reads as part of the same world; small props
therefore carry few, large shapes: no interior mark much thinner than half the outline.
"""
import math, os, random
from lib import *
import lib

U = 230.0              # design units per world unit
GX, GY = 256, 740      # ground contact of upright props and critters
CX, CY = 256, 512      # centre of flat decals and fliers
PPU = 80               # atlas pixels per world unit
LINE = lib.LINE_WU * U / BASE_LINE   # outline weight (x BASE_LINE): the same world-unit line as every other sprite
RIPPLE = .62 / LINE    # water rings are light, not ink: they keep their original thin weight
PAD = 3                # transparent pixels around every cell
ATLAS_W = 1024

# ---------------------------------------------------------------- muted palette (quieter than nodes)
G = "#78834f"; G_D = "#5b653d"; G_L = "#9ca76c"              # meadow greens
GW = "#647b4d"; GW_D = "#4b5d3b"; GW_L = "#88a167"           # woods fern
SEDGE = "#5d6b45"; SEDGE_D = "#465234"; SEDGE_L = "#7e8c5d"
DRY = "#9c8c69"; DRY_D = "#77694d"; DRY_L = "#bcab85"          # dead grass
PEB = "#8b8699"; PEB_D = "#6a667b"; PEB_L = "#aca8ba"
WG = "#86735f"; WG_D = "#655545"; WG_L = "#a69079"             # weathered wood
STUMP = "#72504a"; STUMP_D = "#533833"; STUMP_L = "#94705f"; RING = "#b8936f"; RING_D = "#957256"
WATER = "#3f5566"; WATER_D = "#2e3f4d"; WATER_L = "#7d97a8"
LILY = "#6b8a4c"; LILY_D = "#506a3a"; LILY_L = "#92ad6b"
TH = "#3c4a40"; TH_D = "#29332c"; TH_L = "#58695a"             # thicket bramble
THORN = "#6a4038"; THORN_L = "#8c5a4c"
BARK = "#4c3b45"; BARK_D = "#352834"; BARK_L = "#6c5663"
REED = "#7f8a55"; REED_D = "#5f6a3e"; REED_L = "#a3ad74"; CAT = "#6e4a3a"; CAT_L = "#90654e"
CLOTHR = "#8a5a4a"; CLOTHR_D = "#6a4238"; BURLAP = "#b9a47c"; BURLAP_D = "#96825e"
IRN = "#595463"; IRN_D = "#403b49"; IRN_L = "#7d7889"
CRYS = "#78b3a9"; CRYS_D = "#548a82"; CRYS_L = "#b6ddd5"
BONEP = "#d6ccb2"; BONEP_D = "#aea17f"
WAX = "#e0d5b8"; WAX_D = "#bfb291"
FEATH = "#3b3346"; FEATH_D = "#2a2433"; FEATH_L = "#625673"
BAT = "#4a3f5a"; BAT_D = "#342b40"; BAT_L = "#665a78"
FROG = "#6f8a4e"; FROG_D = "#536b3a"; FROG_L = "#9bb472"; BELLY = "#c9c79a"
MOTH = "#d7ccb2"; MOTH_D = "#ada186"; MOTH_L = "#f1e9d6"


HEAD = 1.45           # flower heads, scaled up so petals stay open at the shared outline weight


def u(v):
    return v * U


def oval(cx, cy, rx, ry, rot=0.0, n=10):
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    return smooth([(cx + rx * math.cos(2 * math.pi * i / n) * c - ry * math.sin(2 * math.pi * i / n) * s,
                    cy + rx * math.cos(2 * math.pi * i / n) * s + ry * math.sin(2 * math.pi * i / n) * c) for i in range(n)])


def stroke(dd, w, col):
    """An inked stroke: outline pass, then colour."""
    return line(dd, w + 6) + line(dd, w, col)


def curve(x0, y0, x1, y1, bend):
    return f"M{f(x0)} {f(y0)} Q{f((x0 + x1) / 2 + bend)} {f((y0 + y1) / 2)} {f(x1)} {f(y1)}"


def blade(x0, y0, x1, y1, bend, w):
    return ribbon((x0, y0), ((x0 + x1) / 2 + bend, (y0 + y1) / 2), (x1, y1), lambda t: w * (1 - t) ** .9 + 1.5)


def tuft_body(blades, col, dark, light, seed=0, w=16):
    """Grass-like blades rooted at the ground point, merged into one silhouette."""
    r = random.Random(seed); ds = []; b = ""
    for (dx, h, lean) in blades:
        ds.append(blade(GX + dx * .35, GY, GX + dx + lean, GY - h, lean * .5 + r.uniform(-8, 8), w))
    b += "".join(f'<path d="{dd}" fill="{col}" stroke-width="{sw(12)}"/>' for dd in ds)
    for i, dd in enumerate(ds):
        b += fill_ns(dd, dark if i % 2 else col)
    for (dx, h, lean) in blades[::3]:
        b += brush((GX + dx * .4 + 3, GY - 12), (GX + dx * .7 + lean * .4, GY - h * .5), (GX + dx + lean * .9, GY - h * .88), 4, light, .8)
    return b


def base_leaves(col, dark, n=4, spread=60, seed=1):
    r = random.Random(seed); b = ""
    for i in range(n):
        x = GX + (i - (n - 1) / 2) * spread / max(1, n - 1) * 2 + r.uniform(-6, 6)
        b += leaf(x, GY - 14, (-60 if x < GX else 60) + r.uniform(-15, 15), 2.0, col if i % 2 else dark, 3)
    return b


# ---------------------------------------------------------------- meadow
def flower_cluster(heads, petal, petal_d, centre, kind, seed):
    d = []; b = ""
    r = random.Random(seed)
    b += base_leaves(G, G_D, 4, 44, seed)
    for dx, h, s in heads:
        b += stroke(curve(GX + dx * .3, GY, GX + dx, GY - h, r.uniform(-14, 14)), 4, G_D)
    for dx, h, s in heads:
        x, y = GX + dx, GY - h
        s *= HEAD   # heads big enough that the shared outline never swallows them
        if kind == "daisy":
            ps = [oval(x + math.cos(a) * 15 * s, y + math.sin(a) * 11 * s, 11 * s, 5.5 * s, math.degrees(a)) for a in [k * math.pi / 4 for k in range(8)]]
            b += union(ps, petal, 9)
            b += ell(x, y, 8 * s, 7 * s, centre, 5)
        elif kind == "cup":
            ps = [oval(x + math.cos(a) * 10 * s, y + math.sin(a) * 8 * s, 10 * s, 8 * s, math.degrees(a)) for a in [k * 2 * math.pi / 5 - math.pi / 2 for k in range(5)]]
            b += union(ps, petal, 9)
            b += fill_ns(oval(x + 4 * s, y + 4 * s, 8 * s, 6 * s), petal_d, .8)
            b += f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(4 * s)}" fill="{centre}" stroke="none"/>'
        elif kind == "bell":
            for k in range(3):
                bx, by = x + (k - 1) * 17 * s, y + 6 + abs(k - 1) * 9 * s
                bell = f"M{f(bx - 8 * s)} {f(by)} Q{f(bx - 9 * s)} {f(by - 16 * s)} {f(bx)} {f(by - 17 * s)} Q{f(bx + 9 * s)} {f(by - 16 * s)} {f(bx + 8 * s)} {f(by)} L{f(bx + 11 * s)} {f(by + 5 * s)} L{f(bx)} {f(by + 2 * s)} L{f(bx - 11 * s)} {f(by + 5 * s)} Z"
                b += fill(bell, petal if k != 1 else petal_d, 7)
        elif kind == "poppy":
            cup = f"M{f(x - 17 * s)} {f(y - 4 * s)} Q{f(x - 20 * s)} {f(y - 22 * s)} {f(x - 6 * s)} {f(y - 18 * s)} Q{f(x)} {f(y - 26 * s)} {f(x + 6 * s)} {f(y - 18 * s)} Q{f(x + 20 * s)} {f(y - 22 * s)} {f(x + 17 * s)} {f(y - 4 * s)} Q{f(x)} {f(y + 12 * s)} {f(x - 17 * s)} {f(y - 4 * s)} Z"
            b += shaded(d, cup, petal, petal_d, 5, -4, "", 7)
            b += ell(x, y - 8 * s, 5 * s, 3.5 * s, centre, 4)
        elif kind == "spike":
            buds = [(x + math.sin(k * 1.7) * 4 * s, y + k * 10 * s, 7 * s - k * .4, 6 * s) for k in range(4)]
            b += union([oval(bx, by, rx, ry) for bx, by, rx, ry in buds], petal, 8)
            b += "".join(fill_ns(oval(bx + 2 * s, by + 2 * s, rx * .55, ry * .5), petal_d, .9) for bx, by, rx, ry in buds[1::2])
    return d, b


def daisy():
    return flower_cluster([(-46, 104, 1.0), (22, 138, 1.1), (64, 80, .85)], "#e6dfca", "#c4bca4", "#d6a445", "daisy", 3)


def buttercup():
    return flower_cluster([(-40, 96, 1.0), (18, 132, 1.1), (60, 104, .9), (-70, 64, .8)], "#dcb34c", "#b38a33", "#8a6a2a", "cup", 5)


def bluebell():
    return flower_cluster([(-40, 120, 1.0), (40, 150, 1.05)], "#8d8fc4", "#6b6ca0", "#6b6ca0", "bell", 7)


def poppy():
    return flower_cluster([(-36, 112, 1.0), (34, 146, 1.1), (72, 84, .8)], "#c65a44", "#9a4034", "#3a2a30", "poppy", 9)


def heather():
    return flower_cluster([(-50, 112, .9), (0, 150, 1.0), (52, 118, .9)], "#b47ba3", "#8e5c83", "#8e5c83", "spike", 11)


def tuft():
    d = []
    return d, tuft_body([(-60, 110, -30), (-30, 150, -12), (0, 170, 6), (30, 140, 22), (58, 104, 34), (-12, 120, -4), (16, 118, 14)], G, G_D, G_L, 1)


def tuft_tall():
    d = []; b = tuft_body([(-70, 150, -40), (-40, 210, -18), (-8, 240, 4), (24, 200, 26), (60, 150, 44), (-20, 170, -6), (10, 180, 12)], G, G_D, G_L, 2)
    for (x0, x1, h) in ((-6, -26, 250), (14, 34, 226)):
        b += stroke(curve(GX + x0, GY - 60, GX + x1, GY - h, 6), 3, G_D)
        b += ell(GX + x1, GY - h - 8, 6, 14, DRY_L, 5, 10)
    return d, b


def clover():
    d = []; b = ""
    r = random.Random(4)
    for (x, y, s) in [(-70, -30, 1.0), (-10, -60, 1.1), (50, -20, .95), (10, 30, 1.05), (-50, 45, .85), (80, 40, .8), (-95, 5, .7)]:
        cx, cy = CX + x, CY + y
        lobes = [oval(cx + math.cos(a) * 15 * s, cy + math.sin(a) * 15 * s, 15 * s, 12 * s, math.degrees(a)) for a in [r.uniform(0, 1) + k * 2 * math.pi / 3 for k in range(3)]]
        b += union(lobes, G if r.random() < .6 else G_D, 8)
        b += f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(3 * s)}" fill="{G_L}" stroke="none"/>'
    for (x, y) in [(30, -58), (-40, 12)]:
        b += ell(CX + x, CY + y, 9, 9, "#ece6d4", 5) + f'<circle cx="{CX + x}" cy="{CY + y}" r="3" fill="#d9a6b8" stroke="none"/>'
    return d, b


def stones():
    d = []; b = ""
    for (x, y, rx, ry, sd, col, dk) in [(-40, -2, 46, 30, 2, PEB, PEB_D), (34, 2, 34, 24, 5, PEB_D, "#58546a"), (74, 4, 20, 13, 7, PEB, PEB_D)]:
        st = blob(GX + x, GY - ry + y, rx, ry, 8, .12, sd, flat=GY + y - 2)
        b += shaded(d, st, col, dk, -6, -6, brush((GX + x - rx * .6, GY - ry * 1.3 + y), (GX + x - rx * .1, GY - ry * 1.7 + y), (GX + x + rx * .4, GY - ry * 1.5 + y), 4, PEB_L, .8))
    return d, b


def scarecrow():
    d = []; b = ""
    b += fill(blob(GX, GY - 4, 90, 14, 8, .2, 3), DRY_D, 6)
    post = f"M{GX - 12} {GY} L{GX - 10} 250 L{GX + 12} 250 L{GX + 13} {GY} Z"
    b += shaded(d, post, WG, WG_D, 5, 0)
    b += fill(f"M96 372 L416 366 L416 392 L96 398 Z", WG, 7)
    shirt = "M170 372 L342 372 L402 380 L404 420 L352 420 L330 560 L182 560 L160 420 L108 420 L110 380 Z"
    b += shaded(d, shirt, CLOTHR, CLOTHR_D, 8, 0, brush((196, 400), (190, 470), (200, 540), 5, "#a8705c", .8))
    b += fill("M270 440 L312 436 L314 476 L272 480 Z", BURLAP_D, 5)
    b += line("M172 470 L332 466", 7) + line("M172 470 L332 466", 4, DRY_D)
    for (x, y, a) in [(104, 400, 180), (408, 400, 0), (200, 562, 100), (256, 566, 90), (312, 562, 80)]:
        for k in (-22, 0, 22):
            ang = math.radians(a + k)
            b += stroke(f"M{x} {y} L{f(x + math.cos(ang) * 34)} {f(y + math.sin(ang) * 34)}", 3, DRY_L)
    head = blob(256, 306, 50, 54, 9, .06, 5)
    b += shaded(d, head, BURLAP, BURLAP_D, 6, 4, brush((222, 280), (226, 300), (236, 322), 4, "#d6c49c", .8))
    b += line("M232 290 L248 306 M248 290 L232 306 M266 290 L282 306 M282 290 L266 306", 5)
    b += line("M234 330 Q256 342 280 330", 4)
    b += line("M218 356 Q256 366 294 356", 7) + line("M218 356 Q256 366 294 356", 3, DRY_D)
    b += ell(256, 258, 92, 18, "#5a4a52", 7)
    b += fill("M212 258 Q214 196 256 190 Q300 196 300 258 Z", "#5a4a52", 7) + line("M214 244 Q256 254 298 244", 6, "#8f3a3f")
    return d, b


def fence_bit():
    d = []; b = ""
    for (x, h, rot) in [(-120, 250, -6), (110, 200, 9)]:
        p = f"M{GX + x - 14} {GY} L{GX + x - 12} {GY - h} L{GX + x + 2} {GY - h - 14} L{GX + x + 14} {GY - h} L{GX + x + 15} {GY} Z"
        b += f'<g transform="rotate({rot} {GX + x} {GY})">' + shaded(d, p, WG, WG_D, 5, 0) + '</g>'
    b += f'<g transform="rotate(-3 {GX} {GY})">' + fill(f"M{GX - 150} {GY - 196} L{GX + 40} {GY - 186} L{GX + 30} {GY - 172} L{GX + 52} {GY - 164} L{GX - 150} {GY - 170} Z", WG_L, 7) + '</g>'
    b += fill(f"M{GX - 20} {GY - 10} L{GX + 130} {GY - 30} L{GX + 136} {GY - 14} L{GX - 18} {GY + 4} Z", WG, 7)
    b += fill(blob(GX - 40, GY - 4, 70, 10, 7, .2, 2), DRY_D, 5)
    for (x, h, l) in [(-150, 50, -10), (-100, 40, 8), (130, 44, 14)]:
        b += stroke(curve(GX + x, GY, GX + x + l, GY - h, 4), 3, G_D)
    return d, b


# ---------------------------------------------------------------- woods
def fern(scale=1.0, seed=3, n=5):
    d = []; b = ""
    r = random.Random(seed)
    fronds = []
    for i in range(n):
        a = -150 + i * 120 / max(1, n - 1) + r.uniform(-8, 8)
        L = (150 + r.uniform(-20, 20)) * scale * (1.1 - abs(i - (n - 1) / 2) * .12)
        ang = math.radians(a)
        tip = (GX + math.cos(ang) * L, GY - 30 * scale + math.sin(ang) * L * .9)
        ctrl = (GX + math.cos(ang) * L * .45, GY - 30 * scale + math.sin(ang) * L * .9 - 60 * scale)
        fronds.append((tip, ctrl, i))
    for tip, ctrl, i in sorted(fronds, key=lambda t: abs(t[2] - (n - 1) / 2), reverse=True):
        col = GW if i % 2 else GW_D
        P = qpts((GX, GY - 4), ctrl, tip, 6)
        leaflets = []
        for k, (x, y, nx, ny, t) in enumerate(P[1:-1]):
            w = 36 * scale * (1 - t * .6)
            for side in (-1, 1):
                leaflets.append(oval(x + nx * w * .55 * side, y + ny * w * .55 * side, w * .6, w * .22, math.degrees(math.atan2(ny * side, nx * side))))
        b += union(leaflets + [ribbon((GX, GY - 4), ctrl, tip, lambda t: 7 * scale * (1 - t) + 2)], col, 9)
        b += brush((GX, GY - 10), ctrl, tip, 3.5, GW_L, .75)
    return d, b


def fern_small():
    return fern(.68, 7, 4)


def leaves_decal(cols, seed):
    d = []; b = ""
    r = random.Random(seed)
    for i in range(9):
        a = r.uniform(0, 2 * math.pi); rr = r.uniform(10, 110)
        x, y = CX + math.cos(a) * rr * 1.1, CY + math.sin(a) * rr * .9
        col = cols[i % len(cols)]
        s = r.uniform(1.6, 2.4)
        b += leaf(x, y, r.uniform(0, 360), s, col, 3.5)
        b += f'<path d="M{f(x)} {f(y)} m-{f(4 * s)} 0 l{f(8 * s)} 0" stroke-width="{sw(2)}" transform="rotate({r.uniform(0, 360):.0f} {f(x)} {f(y)})"/>'
    return d, b


def leaves():
    return leaves_decal(["#c0703f", "#c99a45", "#a8543a", "#8f6a3a"], 12)


def leaves_red():
    return leaves_decal(["#8f3a3f", "#a8543a", "#6e3438", "#c0703f"], 13)


def toadstool():
    d = []; b = ""
    for (x, h, r_, tilt) in [(-34, 70, 34, -6), (26, 100, 42, 4), (70, 46, 22, 10)]:
        X = GX + x
        stem = f"M{X - r_ * .25} {GY} Q{X - r_ * .32} {GY - h * .5} {X - r_ * .18 + tilt * .5} {GY - h} L{X + r_ * .18 + tilt * .5} {GY - h} Q{X + r_ * .32} {GY - h * .5} {X + r_ * .25} {GY} Z"
        b += fill(stem, "#ddd2b6", 7)
        cy = GY - h
        cap = f"M{X - r_ + tilt} {cy + 6} Q{X - r_ * .9 + tilt} {cy - r_ * .9} {X + tilt} {cy - r_ * .9} Q{X + r_ * .9 + tilt} {cy - r_ * .9} {X + r_ + tilt} {cy + 6} Q{X + tilt} {cy + r_ * .25} {X - r_ + tilt} {cy + 6} Z"
        b += shaded(d, cap, "#a65b3e", "#80412f", -5, -5, brush((X - r_ * .5 + tilt, cy - r_ * .3), (X - r_ * .2 + tilt, cy - r_ * .72), (X + r_ * .2 + tilt, cy - r_ * .72), 4, "#c47c58"))
        for (dx, dy, rr) in [(-.35, -.35, .12), (.25, -.55, .1), (.5, -.15, .08)]:
            b += f'<circle cx="{f(X + tilt + dx * r_)}" cy="{f(cy + dy * r_)}" r="{f(rr * r_)}" fill="#e9dcc0" stroke="none"/>'
    b += fill(blob(GX, GY - 2, 100, 9, 8, .2, 3), GW_D, 5)
    return d, b


def stump():
    d = []; b = ""
    for (x, rot) in [(-78, -20), (70, 24), (-30, 8)]:
        b += fill(f"M{GX + x - 20} {GY + 2} Q{GX + x} {GY - 40} {GX + x + 30} {GY - 30} L{GX + x + 18} {GY + 4} Z", STUMP_D, 6)
    body = f"M{GX - 84} {GY - 16} L{GX - 80} {GY - 150} L{GX + 80} {GY - 150} L{GX + 86} {GY - 14} Q{GX} {GY + 12} {GX - 84} {GY - 16} Z"
    b += shaded(d, body, STUMP, STUMP_D, 10, 0, brush((GX - 60, GY - 130), (GX - 62, GY - 80), (GX - 56, GY - 30), 5, STUMP_L, .8))
    b += line(f"M{GX + 20} {GY - 120} L{GX + 26} {GY - 60} M{GX - 30} {GY - 100} L{GX - 34} {GY - 40}", 3, STUMP_D)
    b += ell(GX, GY - 150, 80, 30, RING, 7)
    b += f'<ellipse cx="{GX}" cy="{GY - 150}" rx="54" ry="19" fill="none" stroke="{RING_D}" stroke-width="{sw(3)}"/><ellipse cx="{GX}" cy="{GY - 150}" rx="28" ry="10" fill="none" stroke="{RING_D}" stroke-width="{sw(3)}"/>'
    b += fill_ns(blob(GX - 50, GY - 60, 26, 14, 7, .3, 6), MOSS_D, .9)
    return d, b


def cobweb():
    d = []; b = ""
    b += stroke(curve(GX - 70, GY, GX - 96, GY - 190, -12), 4, BARK) + stroke(curve(GX + 60, GY, GX + 92, GY - 170, 14), 4, BARK)
    b += stroke(curve(GX - 88, GY - 120, GX - 130, GY - 150, 4), 3, BARK)
    hub = (GX - 4, GY - 110)
    anchors = [(GX - 94, GY - 180), (GX - 84, GY - 110), (GX - 76, GY - 40), (GX + 70, GY - 30), (GX + 82, GY - 100), (GX + 88, GY - 160), (GX - 10, GY - 190)]
    web = ""
    for (x, y) in anchors:
        web += f"M{f(hub[0])} {f(hub[1])} L{f(x)} {f(y)} "
    for k in (.3, .55, .8):
        pts = [(hub[0] + (x - hub[0]) * k, hub[1] + (y - hub[1]) * k) for x, y in anchors]
        web += "M" + " Q".join(f"{f((pts[i][0] + pts[(i + 1) % len(pts)][0]) / 2 + (hub[0] - (pts[i][0] + pts[(i + 1) % len(pts)][0]) / 2) * .12)} {f((pts[i][1] + pts[(i + 1) % len(pts)][1]) / 2 + (hub[1] - (pts[i][1] + pts[(i + 1) % len(pts)][1]) / 2) * .12)} {f(pts[(i + 1) % len(pts)][0])} {f(pts[(i + 1) % len(pts)][1])}" for i in range(len(pts))) + " "
    b += f'<path d="{web}" fill="none" stroke="#e7e3ef" stroke-width="{sw(3.2)}" opacity=".82"/>'
    return d, b


# ---------------------------------------------------------------- graveyard
def old_lantern():
    d = []; b = ""
    b += fill(blob(GX, GY - 4, 60, 10, 7, .2, 4), DRY_D, 5)
    b += stroke(f"M{GX} {GY} L{GX + 2} {GY - 250} Q{GX + 4} {GY - 290} {GX + 40} {GY - 292}", 8, IRN)
    b += stroke(f"M{GX + 40} {GY - 292} L{GX + 40} {GY - 272}", 3, IRN_D)
    x = GX + 40
    b += fill(f"M{x - 26} {GY - 246} Q{x} {GY - 282} {x + 26} {GY - 246} Z", IRN, 6)
    glass = f"M{x - 22} {GY - 246} L{x + 22} {GY - 246} L{x + 18} {GY - 176} L{x - 18} {GY - 176} Z"
    b += fill(glass, "#4a4d5a", 6)
    b += fill_ns(f"M{x - 18} {GY - 240} L{x - 2} {GY - 240} L{x - 6} {GY - 182} L{x - 15} {GY - 182} Z", "#6b7080", .9)
    b += rrect(x - 26, GY - 180, 52, 12, 4, IRN, 6)
    b += fill_ns(blob(x + 12, GY - 184, 10, 5, 6, .3, 2), "#8a5a3c", .9)
    b += brush((GX - 3, GY - 40), (GX - 4, GY - 140), (GX - 1, GY - 230), 3, IRN_L, .8)
    return d, b


def cross_wood():
    d = []; b = ""
    g = rrect(GX - 11, GY - 230, 22, 236, 5, WG, 7) + rrect(GX - 64, GY - 190, 128, 20, 5, WG, 7)
    g += brush((GX - 4, GY - 210), (GX - 5, GY - 120), (GX - 3, GY - 20), 3, WG_L, .8)
    g += stroke(f"M{GX - 14} {GY - 190} L{GX + 14} {GY - 170} M{GX + 14} {GY - 190} L{GX - 14} {GY - 170}", 3, "#b9a47c")
    b += fill(blob(GX, GY - 4, 64, 12, 7, .2, 8), "#5f4a3e", 5)
    b += f'<g transform="rotate(8 {GX} {GY})">{g}</g>'
    return d, b


def cross_stone():
    d = []; b = ""
    b += fill(blob(GX, GY - 6, 70, 14, 7, .2, 9), "#5f4a3e", 5)
    cr = f"M{GX - 16} {GY} L{GX - 16} {GY - 150} L{GX - 58} {GY - 150} L{GX - 58} {GY - 184} L{GX - 16} {GY - 184} L{GX - 16} {GY - 222} L{GX + 16} {GY - 222} L{GX + 16} {GY - 184} L{GX + 58} {GY - 184} L{GX + 58} {GY - 150} L{GX + 16} {GY - 150} L{GX + 16} {GY} Z"
    g = shaded(d, cr, PEB, PEB_D, -6, -4, brush((GX - 8, GY - 200), (GX - 10, GY - 120), (GX - 8, GY - 30), 3, PEB_L, .8))
    g += fill_ns(blob(GX + 10, GY - 20, 14, 10, 6, .3, 2), MOSS_D, .9) + fill_ns(blob(GX - 40, GY - 176, 12, 7, 6, .3, 3), MOSS, .8)
    b += f'<g transform="rotate(-7 {GX} {GY})">{g}</g>'
    return d, b


def candles():
    d = []; b = ""
    b += fill(blob(GX, GY - 4, 64, 11, 8, .15, 3), WAX_D, 5)
    for (x, h, w) in [(-24, 72, 20), (22, 100, 22)]:
        X = GX + x
        c = f"M{X - w} {GY - 4} L{X - w} {GY - h} Q{X} {GY - h - 8} {X + w} {GY - h} L{X + w} {GY - 4} Z"
        b += shaded(d, c, WAX, WAX_D, 7, 0)
        b += line(f"M{X} {GY - h - 4} L{X + 2} {GY - h - 18}", 4)
    return d, b


def tuft_dead():
    d = []
    return d, tuft_body([(-64, 100, -34), (-34, 140, -14), (-4, 160, 4), (26, 130, 20), (58, 96, 36), (-16, 110, -8), (12, 116, 12)], DRY, DRY_D, DRY_L, 3, 14)


# ---------------------------------------------------------------- mire
def puddle_shape(seed):
    return blob(CX, CY, 150, 110, 11, .14, seed)


def puddle(lily=False, seed=3):
    d = []; b = ""
    p = puddle_shape(seed)
    b += f'<path d="{p}" fill="{WATER_D}" stroke="#4a5842" stroke-width="{sw(12)}" opacity=".92"/>'
    b += clipped(d, p, f'<path d="{blob(CX + 20, CY + 14, 150, 110, 11, .14, seed)}" fill="{WATER}" stroke="none"/>')
    b += brush((CX - 90, CY - 40), (CX - 40, CY - 64), (CX + 20, CY - 62), 5, WATER_L, .8) + brush((CX + 30, CY + 30), (CX + 60, CY + 24), (CX + 80, CY + 10), 3, WATER_L, .6)
    if lily:
        for (x, y, r_, a) in [(40, 20, 34, 30), (-60, 40, 26, 200)]:
            b += lilypad(CX + x, CY + y, r_, a)
        b += ell(CX + 46, CY + 12, 8, 7, "#e9dce6", 4)
    return d, b


def lilypad(x, y, r_, a):
    ang = math.radians(a)
    nx, ny = x + math.cos(ang) * r_, y + math.sin(ang) * r_
    pad = f"M{f(x)} {f(y)} L{f(x + math.cos(ang + .35) * r_)} {f(y + math.sin(ang + .35) * r_)} A{f(r_)} {f(r_)} 0 1 1 {f(x + math.cos(ang - .35) * r_)} {f(y + math.sin(ang - .35) * r_)} Z"
    return fill(pad, LILY, 6) + brush((x - r_ * .6, y - r_ * .2), (x - r_ * .2, y - r_ * .65), (x + r_ * .3, y - r_ * .6), 3, LILY_L, .8)


def puddle_plain():
    return puddle(False, 3)


def puddle_lily():
    return puddle(True, 8)


def lilypads():
    d = []; b = ""
    for (x, y, r_, a) in [(-40, -20, 38, 40), (40, 10, 30, 220), (-10, 50, 24, 120)]:
        b += lilypad(CX + x, CY + y, r_, a)
    b += ell(CX - 30, CY - 26, 9, 8, "#e9dce6", 4) + f'<circle cx="{CX - 30}" cy="{CY - 26}" r="3" fill="#e0c060" stroke="none"/>'
    return d, b


def reeds(n_blades, cattails, scale, seed, base=True):
    d = []; b = ""
    r = random.Random(seed)
    if base:
        b += fill(blob(GX, GY - 4, 110 * scale, 12, 8, .2, seed), SEDGE_D, 5)
    blades = []
    for i in range(n_blades):
        dx = (i - (n_blades - 1) / 2) * 22 * scale + r.uniform(-8, 8)
        h = r.uniform(230, 400) * scale
        lean = dx * .5 + r.uniform(-20, 20)
        blades.append(blade(GX + dx * .5, GY, GX + dx + lean, GY - h, lean * .4, 13 * scale))
    b += "".join(f'<path d="{dd}" fill="{REED}" stroke-width="{sw(11)}"/>' for dd in blades)
    for i, dd in enumerate(blades):
        b += fill_ns(dd, REED_D if i % 3 == 0 else REED)
    for i in range(0, n_blades, 3):
        b += brush((GX + (i - n_blades / 2) * 10 * scale, GY - 30), (GX + (i - n_blades / 2) * 16 * scale, GY - 160 * scale), (GX + (i - n_blades / 2) * 22 * scale, GY - 260 * scale), 3, REED_L, .7)
    for (dx, h) in cattails:
        x, y = GX + dx * scale, GY - h * scale
        b += stroke(curve(GX + dx * .4 * scale, GY, x, y + 40, dx * .1), 3, REED_D)
        b += rrect(x - 11, y - 30, 22, 74, 11, CAT, 6) + brush((x - 4, y - 20), (x - 6, y + 4), (x - 4, y + 30), 3, CAT_L, .8)
        b += line(f"M{f(x)} {f(y - 30)} L{f(x + 1)} {f(y - 56)}", 3)
    return d, b


def reeds_small():
    return reeds(6, [(20, 250)], .8, 4)


def sedge():
    d = []
    return d, tuft_body([(-60, 120, -36), (-30, 160, -16), (0, 180, 2), (30, 150, 20), (60, 110, 40), (-14, 130, -6), (16, 140, 12)], SEDGE, SEDGE_D, SEDGE_L, 6, 13)


# ---------------------------------------------------------------- crags
def pebbles(seed=1):
    d = []; b = ""
    r = random.Random(seed)
    for i in range(5):
        x = GX + r.uniform(-90, 90); rx = r.uniform(14, 30); ry = rx * r.uniform(.55, .75)
        col, dk = (PEB, PEB_D) if i % 2 else (PEB_D, "#57536a")
        st = blob(x, GY - ry, rx, ry, 7, .15, seed * 10 + i, flat=GY - 2)
        b += shaded(d, st, col, dk, -4, -4)
    return d, b


def pebbles_a():
    return pebbles(3)


def pebbles_b():
    return pebbles(8)


def crystals():
    d = []; b = ""
    b += fill(blob(GX, GY - 10, 70, 16, 7, .2, 4), PEB_D, 5)
    for (x, h, w, rot) in [(-26, 90, 13, -18), (6, 130, 16, 4), (34, 70, 11, 24)]:
        tip = h + w * 1.2
        b += (f'<g transform="translate({GX + x} {GY - 8}) rotate({rot})">'
              + fill_ns(f"M{-w} 0 L{-w} {-h} L0 {-tip} L0 12 Z", CRYS) + fill_ns(f"M0 12 L0 {-tip} L{w} {-h} L{w} 0 Z", CRYS_D)
              + line(f"M{-w} 12 L{-w} {-h} L0 {-tip} L{w} {-h} L{w} 12", 6) + brush((-w * .5, -h * .1), (-w * .55, -h * .5), (-w * .3, -h * .9), 3, CRYS_L, .9) + '</g>')
    return d, b


# ---------------------------------------------------------------- barrow
def bone_bits():
    d = []; b = ""
    def bone(x, y, L, rot):
        g = rrect(-L / 2, -6, L, 12, 6, BONEP, 5)
        for sx in (-1, 1):
            g += f'<circle cx="{sx * L / 2}" cy="-6" r="8" fill="{BONEP}" stroke-width="{sw(5)}"/><circle cx="{sx * L / 2}" cy="6" r="8" fill="{BONEP}" stroke-width="{sw(5)}"/>'
        g += rrect(-L / 2 + 4, -5, L - 8, 10, 5, BONEP, 0) + line(f"M{-L / 2 + 8} 2 L{L / 2 - 8} 2", 2.5, BONEP_D)
        return f'<g transform="translate({x} {y}) rotate({rot})">{g}</g>'
    b += bone(GX - 40, GY - 14, 70, 12) + bone(GX + 36, GY - 10, 56, -20) + bone(GX + 4, GY - 26, 44, 70)
    b += ell(GX + 70, GY - 12, 12, 9, BONEP, 5)
    return d, b


def standing_stone():
    d = []; b = ""
    st = smooth([(GX - 52, GY), (GX - 58, GY - 150), (GX - 36, GY - 260), (GX + 4, GY - 290), (GX + 40, GY - 250), (GX + 54, GY - 140), (GX + 50, GY)])
    b += fill(blob(GX, GY - 2, 90, 12, 7, .2, 5), DRY_D, 5)
    b += shaded(d, st, "#7d7890", "#5c5870", -10, -6, brush((GX - 34, GY - 240), (GX - 42, GY - 160), (GX - 38, GY - 60), 4, "#9f9ab0", .8))
    b += line(f"M{GX - 6} {GY - 210} L{GX - 6} {GY - 150} M{GX - 22} {GY - 190} L{GX - 6} {GY - 176} L{GX + 10} {GY - 190}", 5, "#5c5870")
    b += fill_ns(blob(GX + 20, GY - 30, 22, 14, 7, .3, 4), MOSS_D, .9)
    return d, b


# ---------------------------------------------------------------- border: fence, thicket, reeds
def post(kind):
    d = []; b = ""
    h = 430 if kind == "a" else 400
    if kind == "a":
        p = f"M{GX - 46} {GY} L{GX - 44} {GY - h + 40} L{GX} {GY - h} L{GX + 44} {GY - h + 40} L{GX + 47} {GY} Z"
    else:
        p = f"M{GX - 44} {GY} L{GX - 42} {GY - h + 12} Q{GX} {GY - h - 8} {GX + 42} {GY - h + 12} L{GX + 45} {GY} Z"
    b += shaded(d, p, WG, WG_D, 12, 0, brush((GX - 26, GY - h + 60), (GX - 30, GY - h * .5), (GX - 26, GY - 40), 6, WG_L, .8))
    b += line(f"M{GX + 10} {GY - h + 70} L{GX + 14} {GY - h + 160} M{GX - 10} {GY - 150} L{GX - 12} {GY - 80}", 4, WG_D)
    for y in ((GY - 140, GY - 300) if kind == "a" else (GY - 250,)):
        b += rrect(GX - 50, y, 100, 22, 5, IRN, 6) + f'<circle cx="{GX + 26}" cy="{y + 11}" r="4" fill="{IRN_L}" stroke="none"/>'
    b += fill(blob(GX, GY - 4, 64, 10, 7, .2, 2), DRY_D, 5)
    return d, b


def post_a():
    return post("a")


def post_b():
    return post("b")


def stake():
    d = []; b = ""
    p = f"M{GX - 28} {GY} L{GX - 27} {GY - 290} L{GX + 2} {GY - 336} L{GX + 29} {GY - 290} L{GX + 30} {GY} Z"
    b += shaded(d, p, WG, WG_D, 8, 0, brush((GX - 14, GY - 280), (GX - 17, GY - 160), (GX - 14, GY - 30), 4, WG_L, .8))
    b += rrect(GX - 32, GY - 180, 64, 16, 4, "#6a5a48", 5)
    return d, b


def rail():
    d = []; b = ""
    p = f"M{GX - 160} {GY - 58} L{GX + 160} {GY - 54} L{GX + 160} {GY} L{GX - 160} {GY - 2} Z"
    b += shaded(d, p, WG, WG_D, 0, 8, brush((GX - 140, GY - 44), (GX, GY - 48), (GX + 140, GY - 42), 5, WG_L, .8))
    b += line(f"M{GX - 110} {GY - 26} L{GX - 40} {GY - 28} M{GX + 30} {GY - 20} L{GX + 110} {GY - 24}", 3, WG_D)
    return d, b


def spiky(cx, cy, rx, ry, n, seed, depth=.2, flat=None):
    """A thorny mass: an ellipse whose rim alternates spikes and notches."""
    r = random.Random(seed); pts = []
    for i in range(n * 2):
        a = 2 * math.pi * i / (n * 2) + r.uniform(-.04, .04)
        k = (1 + r.uniform(-.05, .08)) if i % 2 == 0 else 1 - depth * r.uniform(.7, 1.2)
        x, y = cx + rx * k * math.cos(a), cy + ry * k * math.sin(a)
        if flat is not None and y > flat:
            y = flat + (y - flat) * .2
        pts.append((x, y))
    return "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + " Z"


def thicket(seed, trunks, wide=1.0, tall=1.0):
    d = []; b = ""
    r = random.Random(seed)
    W = 470 * wide; H = 500 * tall
    # the dark heart of the tangle
    b += fill(spiky(GX, GY - H * .4, W * 1.0, H * .44, 26, seed, .22, flat=GY - 6), TH_D, 12)
    # crooked trunks growing up through it, bare forks above the thorns
    for (x, lean, h, w) in trunks:
        mid = (GX + x + lean * .15 + r.uniform(-30, 30), GY - h * .5)
        t = limb((GX + x, GY), mid, (GX + x + lean, GY - h), w, w * .3)
        forks = []
        for k in range(3):
            y0 = GY - h * r.uniform(.6, .92); x0 = GX + x + lean * (GY - y0) / h
            s = -1 if k % 2 else 1
            forks.append(limb((x0, y0), (x0 + s * 40, y0 - 50), (x0 + s * r.uniform(70, 120), y0 - r.uniform(80, 140)), w * .3, 3))
        b += union([t] + forks, BARK, 14)
        b += brush((GX + x - w * .2, GY - 30), (mid[0] - w * .2, mid[1]), (GX + x + lean * .9, GY - h * .9), 5, BARK_L, .8)
        b += brush((GX + x + w * .25, GY - 60), (mid[0] + w * .2, mid[1] + 30), (GX + x + lean * .7 + w * .1, GY - h * .7), 4, BARK_D, .9)
    # bramble masses in front, spiky rims, a single shade and a pale catch-light
    for (dx, dy, rx, ry, sd) in [(-W * .52, -H * .2, W * .5, H * .3, 1), (W * .5, -H * .18, W * .5, H * .32, 2), (-W * .05, -H * .3, W * .55, H * .3, 3), (W * .1, -H * .08, W * .7, H * .16, 4)]:
        m = spiky(GX + dx, GY + dy, rx, ry, 18, seed + sd, .24, flat=GY - 4)
        hl = fill_ns(spiky(GX + dx - rx * .25, GY + dy - ry * .45, rx * .5, ry * .25, 10, seed + sd + 7, .3), TH_L, .55)
        b += shaded(d, m, TH, TH_D, -12, 16, hl)
    # thorn vines looping over the front
    for k in range(7):
        x0 = GX + r.uniform(-W * .95, W * .7); y0 = GY - r.uniform(10, H * .5)
        x1 = x0 + r.uniform(70, 180); y1 = y0 - r.uniform(-50, 70)
        cx_, cy_ = (x0 + x1) / 2, min(y0, y1) - r.uniform(50, 120)
        vine = f"M{f(x0)} {f(y0)} Q{f(cx_)} {f(cy_)} {f(x1)} {f(y1)}"
        b += line(vine, 13) + line(vine, 6, THORN)
        for x, y, nx, ny, _ in qpts((x0, y0), (cx_, cy_), (x1, y1), 6)[1:-1]:
            s = 1 if r.random() < .5 else -1
            b += fill(f"M{f(x + nx * 3 * s)} {f(y + ny * 3 * s)} L{f(x + nx * 20 * s)} {f(y + ny * 20 * s)} L{f(x - ny * 7)} {f(y + nx * 7)} Z", THORN_L, 3)
    b += fill(blob(GX, GY - 6, W * 1.04, 16, 12, .2, seed), "#232b25", 5)
    for k in range(10):
        x = GX + r.uniform(-W, W)
        b += stroke(curve(x, GY - 4, x + r.uniform(-24, 24), GY - r.uniform(40, 90), 6), 3, SEDGE_D)
    return d, b


def thicket_a():
    return thicket(11, [(-160, -60, 560, 44), (120, 70, 600, 50)], 1.0, 1.0)


def thicket_b():
    return thicket(23, [(-20, 60, 700, 60), (-230, -40, 420, 30), (210, 40, 440, 30)], .95, 1.1)


def thicket_c():
    return thicket(37, [(-100, 90, 520, 40), (180, -50, 560, 42)], 1.05, .95)


def reeds_a():
    return reeds(13, [(-60, 300), (30, 360), (90, 280)], 1.0, 21)


def reeds_b():
    return reeds(11, [(-20, 330), (70, 300)], .92, 33)


# ---------------------------------------------------------------- critters
def crow_sit(peck):
    """Perched crow, side-on, facing right. peck: 0 alert, 1 head down."""
    d = []; b = ""
    cx, cy = GX - 6, GY - 92
    tail = f"M{cx - 50} {cy + 6} L{cx - 104} {cy + 40} L{cx - 96} {cy + 52} L{cx - 40} {cy + 26} Z"
    body = f"M{cx - 60} {cy + 14} Q{cx - 50} {cy - 40} {cx + 16} {cy - 44} Q{cx + 60} {cy - 40} {cx + 60} {cy} Q{cx + 40} {cy + 50} {cx - 20} {cy + 44} Z"
    b += fill(tail, FEATH, 7)
    b += line(f"M{cx - 4} {cy + 40} L{cx - 8} {GY} M{cx + 18} {cy + 38} L{cx + 16} {GY}", 7) + line(f"M{cx - 4} {cy + 40} L{cx - 8} {GY} M{cx + 18} {cy + 38} L{cx + 16} {GY}", 3, "#8a7a5a")
    b += fill(body, FEATH, 7)
    b += fill(f"M{cx - 40} {cy - 10} Q{cx} {cy - 30} {cx + 30} {cy - 6} Q{cx} {cy + 26} {cx - 40} {cy + 16} Z", FEATH_D, 5)
    b += brush((cx - 30, cy - 26), (cx + 4, cy - 40), (cx + 36, cy - 34), 4, FEATH_L, .9)
    hx, hy = (cx + 56, cy - 44) if not peck else (cx + 70, cy - 4)
    b += ell(hx, hy, 26, 22, FEATH, 7)
    beak = f"M{hx + 18} {hy - 6} L{hx + 58} {hy + (8 if peck else 2)} L{hx + 18} {hy + 10} Z"
    b += fill(beak, "#8a8290", 5)
    b += f'<circle cx="{hx + 8}" cy="{hy - 6}" r="5" fill="#d8d0c0" stroke="none"/><circle cx="{hx + 9}" cy="{hy - 6}" r="2.5" fill="{INK_D}" stroke="none"/>'
    return d, b


def crow_fly(wing):
    """Crow in flight, side-on facing right, wings -1 (down) .. 1 (up). Centred on (256, 512)."""
    d = []; b = ""
    cx, cy = CX, CY
    wy = -100 * wing
    far = f"M{cx - 10} {cy - 14} Q{cx - 36} {cy - 20 + wy * .8} {cx - 100} {cy - 6 + wy} Q{cx - 50} {cy + 8 + wy * .3} {cx + 16} {cy - 4} Z"
    near = f"M{cx + 4} {cy - 16} Q{cx - 20} {cy - 16 + wy} {cx - 86} {cy + wy * 1.1} L{cx - 64} {cy + 8 + wy * .6} L{cx - 80} {cy + 20 + wy * .4} Q{cx - 30} {cy + 22 + wy * .2} {cx + 30} {cy} Z"
    body = f"M{cx - 70} {cy + 6} Q{cx - 36} {cy - 34} {cx + 30} {cy - 30} Q{cx + 74} {cy - 22} {cx + 80} {cy + 6} Q{cx + 40} {cy + 36} {cx - 26} {cy + 30} Z"
    tail = f"M{cx - 64} {cy + 4} L{cx - 124} {cy - 10} L{cx - 110} {cy + 14} L{cx - 128} {cy + 30} L{cx - 58} {cy + 22} Z"
    b += fill(far, FEATH_D, 6) + fill(tail, FEATH, 6) + fill(body, FEATH, 7)
    b += brush((cx - 26, cy - 18), (cx + 14, cy - 30), (cx + 54, cy - 20), 4, FEATH_L, .9)
    b += fill(f"M{cx + 72} {cy - 12} L{cx + 118} {cy + 2} L{cx + 72} {cy + 10} Z", "#8a8290", 5)
    b += f'<circle cx="{cx + 52}" cy="{cy - 10}" r="4.5" fill="#d8d0c0" stroke="none"/><circle cx="{cx + 53}" cy="{cy - 10}" r="2.2" fill="{INK_D}" stroke="none"/>'
    b += fill(near, FEATH, 6) + line(f"M{cx - 10} {cy - 4 + wy * .3} L{cx - 60} {cy + wy * .7}", 2.5, FEATH_L)
    return d, b


def bat(wing):
    """Bat seen from the front, wings -1 (down) .. 1 (up). Centred on (256, 512)."""
    d = []; b = ""
    cx, cy = CX, CY
    for s in (-1, 1):
        wy = -70 * wing
        tip = (cx + s * 150, cy - 20 + wy)
        w = (f"M{cx + s * 14} {cy - 18} Q{cx + s * 70} {cy - 50 + wy * .7} {f(tip[0])} {f(tip[1])} "
             f"Q{cx + s * 128} {cy + 10 + wy * .5} {cx + s * 110} {cy + 16 + wy * .4} Q{cx + s * 90} {cy + 4 + wy * .35} {cx + s * 76} {cy + 20 + wy * .3} "
             f"Q{cx + s * 56} {cy + 6 + wy * .2} {cx + s * 40} {cy + 22 + wy * .1} Q{cx + s * 24} {cy + 10} {cx + s * 12} {cy + 14} Z")
        b += fill(w, BAT_D, 6)
        b += line(f"M{cx + s * 16} {cy - 14} Q{cx + s * 70} {cy - 40 + wy * .7} {f(tip[0])} {f(tip[1])}", 3, BAT_L)
    b += ell(cx, cy, 22, 30, BAT, 6)
    for s in (-1, 1):
        b += fill(f"M{cx + s * 6} {cy - 26} L{cx + s * 16} {cy - 50} L{cx + s * 20} {cy - 22} Z", BAT, 5)
    b += f'<circle cx="{cx - 8}" cy="{cy - 10}" r="4" fill="#e8b0a8" stroke="none"/><circle cx="{cx + 8}" cy="{cy - 10}" r="4" fill="#e8b0a8" stroke="none"/>'
    return d, b


def frog(pose):
    """Frog side-on facing right. pose: 'sit', 'puff', 'crouch', 'leap'."""
    d = []; b = ""
    cx = GX
    if pose == "leap":
        body = f"M{cx - 60} {GY - 70} Q{cx - 20} {GY - 118} {cx + 50} {GY - 104} Q{cx + 74} {GY - 96} {cx + 70} {GY - 78} Q{cx + 20} {GY - 58} {cx - 60} {GY - 70} Z"
        b += stroke(f"M{cx - 50} {GY - 74} L{cx - 110} {GY - 44} L{cx - 150} {GY - 30}", 12, FROG_D)
        b += stroke(f"M{cx + 30} {GY - 70} L{cx + 70} {GY - 40}", 9, FROG_D)
        b += shaded(d, body, FROG, FROG_D, 0, 8, brush((cx - 30, GY - 100), (cx, GY - 110), (cx + 34, GY - 106), 4, FROG_L, .9))
        b += ell(cx + 40, GY - 112, 13, 12, FROG, 6) + f'<circle cx="{cx + 43}" cy="{GY - 114}" r="5" fill="{INK_D}" stroke="none"/>'
        return d, b
    lift = 10 if pose == "crouch" else 0
    b += fill(f"M{cx - 64} {GY - 4} Q{cx - 80} {GY - 50 + lift} {cx - 36} {GY - 46 + lift} Q{cx - 10} {GY - 30} {cx - 20} {GY - 4} Z", FROG_D, 7)
    body = f"M{cx - 60} {GY - 20} Q{cx - 60} {GY - 86 + lift} {cx + 10} {GY - 96 + lift} Q{cx + 64} {GY - 96 + lift} {cx + 70} {GY - 56 + lift} Q{cx + 64} {GY - 16} {cx + 10} {GY - 10} Q{cx - 40} {GY - 6} {cx - 60} {GY - 20} Z"
    b += shaded(d, body, FROG, FROG_D, -6, 6, brush((cx - 36, GY - 70 + lift), (cx - 4, GY - 88 + lift), (cx + 30, GY - 86 + lift), 4, FROG_L, .9))
    if pose == "puff":
        b += ell(cx + 46, GY - 34, 24, 18, BELLY, 5)
    else:
        b += fill_ns(f"M{cx + 20} {GY - 16} Q{cx + 56} {GY - 22} {cx + 64} {GY - 44} Q{cx + 40} {GY - 30} {cx + 20} {GY - 16} Z", BELLY, .9)
    b += stroke(f"M{cx + 36} {GY - 30} L{cx + 44} {GY - 2} L{cx + 58} {GY}", 7, FROG_D)
    b += ell(cx + 30, GY - 98 + lift, 15, 14, FROG, 6) + f'<circle cx="{cx + 34}" cy="{GY - 100 + lift}" r="6" fill="{INK_D}" stroke="none"/><circle cx="{cx + 31}" cy="{GY - 103 + lift}" r="2" fill="#ffffff" stroke="none"/>'
    b += line(f"M{cx + 40} {GY - 68 + lift} Q{cx + 56} {GY - 62 + lift} {cx + 66} {GY - 64 + lift}", 3)
    b += f'<circle cx="{cx - 20}" cy="{GY - 70 + lift}" r="6" fill="{FROG_D}" stroke="none"/><circle cx="{cx}" cy="{GY - 50}" r="5" fill="{FROG_D}" stroke="none"/>'
    return d, b


def moth(open_):
    """Moth from above, wings open 1 .. closed 0. Centred on (256, 512)."""
    d = []; b = ""
    cx, cy = CX, CY
    for s in (-1, 1):
        w = 18 + 52 * open_
        up = f"M{cx + s * 6} {cy - 8} Q{cx + s * (w * .6)} {cy - 50} {cx + s * w} {cy - 30} Q{cx + s * (w * 1.05)} {cy - 4} {cx + s * 8} {cy + 4} Z"
        lo = f"M{cx + s * 6} {cy + 2} Q{cx + s * w * .8} {cy + 8} {cx + s * w * .7} {cy + 34} Q{cx + s * w * .3} {cy + 40} {cx + s * 6} {cy + 12} Z"
        b += fill(lo, MOTH_D, 5) + fill(up, MOTH, 5)
        b += f'<circle cx="{f(cx + s * w * .55)}" cy="{cy - 24}" r="{f(3 + 4 * open_)}" fill="{MOTH_D}" stroke="none"/>'
    b += ell(cx, cy, 7, 22, "#8a7d68", 5)
    b += line(f"M{cx - 3} {cy - 20} Q{cx - 12} {cy - 40} {cx - 20} {cy - 44} M{cx + 3} {cy - 20} Q{cx + 12} {cy - 40} {cx + 20} {cy - 44}", 3)
    return d, b


def ripple(k):
    """Water rings spreading from a plop (top-down, centred)."""
    d = []; b = ""
    r1 = 34 + k * 44; ry = r1 * .9
    b += f'<ellipse cx="{CX}" cy="{CY}" rx="{f(r1)}" ry="{f(ry)}" fill="none" stroke="#b9ccd6" stroke-width="{sw((11 - k * 3) * RIPPLE)}" opacity=".9"/>'
    if k:
        b += f'<ellipse cx="{CX}" cy="{CY}" rx="{f(r1 * .55)}" ry="{f(ry * .55)}" fill="none" stroke="#9fb6c4" stroke-width="{sw((9 - k * 2) * RIPPLE)}" opacity=".85"/>'
    else:
        for a in range(0, 360, 60):
            x = CX + math.cos(math.radians(a)) * 20; y = CY + math.sin(math.radians(a)) * 18
            b += f'<circle cx="{f(x)}" cy="{f(y)}" r="6" fill="#d8e6ee" stroke="none"/>'
    return d, b


# ---------------------------------------------------------------- atlas
# name -> (drawing, anchor[, size]) where anchor 'up' = ground contact, 'mid' = centre (flat decals, fliers),
# and size scales the drawing in the world (outlines keep their weight).
ATLAS = [
    ("daisy", daisy, "up"), ("buttercup", buttercup, "up"), ("bluebell", bluebell, "up"), ("poppy", poppy, "up"), ("heather", heather, "up"),
    ("tuft", tuft, "up"), ("tuft-tall", tuft_tall, "up"), ("clover", clover, "mid"), ("stones", stones, "up"),
    ("scarecrow", scarecrow, "up", 0.85), ("fence-bit", fence_bit, "up"),
    ("fern", fern, "up"), ("fern-small", fern_small, "up"), ("leaves", leaves, "mid"), ("leaves-red", leaves_red, "mid"),
    ("toadstool", toadstool, "up"), ("stump", stump, "up"), ("cobweb", cobweb, "up"),
    ("old-lantern", old_lantern, "up", 0.9), ("cross-wood", cross_wood, "up"), ("cross-stone", cross_stone, "up"), ("candles", candles, "up"),
    ("tuft-dead", tuft_dead, "up"),
    ("puddle", puddle_plain, "mid"), ("puddle-lily", puddle_lily, "mid"), ("lilypads", lilypads, "mid"), ("reeds-small", reeds_small, "up"), ("sedge", sedge, "up"),
    ("pebbles", pebbles_a, "up"), ("pebbles-b", pebbles_b, "up"), ("crystals", crystals, "up"),
    ("bone-bits", bone_bits, "up"), ("standing-stone", standing_stone, "up", 0.9),
    ("post-a", post_a, "up", 0.8), ("post-b", post_b, "up", 0.8), ("stake", stake, "up", 0.8), ("rail", rail, "up"),
    ("thicket-a", thicket_a, "up", 0.74), ("thicket-b", thicket_b, "up", 0.74), ("thicket-c", thicket_c, "up", 0.74),
    ("reeds-a", reeds_a, "up", 0.85), ("reeds-b", reeds_b, "up", 0.85),
    ("crow-sit-0", lambda: crow_sit(0), "up", .85), ("crow-sit-1", lambda: crow_sit(1), "up", .85),
    ("crow-fly-0", lambda: crow_fly(1), "mid", .85), ("crow-fly-1", lambda: crow_fly(.25), "mid", .85), ("crow-fly-2", lambda: crow_fly(-.85), "mid", .85), ("crow-fly-3", lambda: crow_fly(.05), "mid", .85),
    ("bat-0", lambda: bat(1), "mid", .7), ("bat-1", lambda: bat(.3), "mid", .7), ("bat-2", lambda: bat(-.7), "mid", .7), ("bat-3", lambda: bat(.1), "mid", .7),
    ("frog-0", lambda: frog("sit"), "up", .85), ("frog-1", lambda: frog("puff"), "up", .85), ("frog-2", lambda: frog("crouch"), "up", .85), ("frog-3", lambda: frog("leap"), "up", .85),
    ("moth-0", lambda: moth(1), "mid", .9), ("moth-1", lambda: moth(.5), "mid", .9), ("moth-2", lambda: moth(.1), "mid", .9),
    ("ripple-0", lambda: ripple(0), "mid"), ("ripple-1", lambda: ripple(1), "mid"), ("ripple-2", lambda: ripple(2), "mid"),
]

# The Shrine of Yomi's own decoration is drawn in yomi.py (its art set) in this same design space.
from yomi import YOMI_SCENERY
ATLAS += YOMI_SCENERY

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
ATLAS_JS = os.path.join(ROOT, "src", "scenery-atlas.mjs")


# Where a crow may stand on a set piece: design point (x, y) of the perch.
PERCHES = {"scarecrow": (GX + 118, 368), "fence-bit": (GX - 60, GY - 194), "stump": (GX + 10, GY - 158), "old-lantern": (GX + 40, GY - 282),
           "cross-wood": (GX + 34, GY - 196), "cross-stone": (GX - 36, GY - 186), "standing-stone": (GX + 4, GY - 288)}


def build_atlas():
    """Draw every cell, shelf-pack them, write src/scenery-atlas.mjs, return the atlas SVG."""
    items = []; perches = []
    for entry in ATLAS:
        name, fn, anchor = entry[:3]
        size = entry[3] if len(entry) > 3 else 1.0
        s = PPU / U * size
        lib.K = LINE / size
        defs, body = fn()
        doc_defs = "".join(defs)
        bb = bbox((defs, body))
        x0, y0 = math.floor(bb[0] * s) - PAD, math.floor(bb[1] * s) - PAD
        x1, y1 = math.ceil(bb[2] * s) + PAD, math.ceil(bb[3] * s) + PAD
        ax, ay = (GX, GY) if anchor == "up" else (CX, CY)
        items.append(dict(name=name, defs=doc_defs, body=body, w=x1 - x0, h=y1 - y0, ox=x0, oy=y0, ax=ax * s - x0, ay=ay * s - y0, s=s))
        if name in PERCHES:
            px, py = PERCHES[name]
            perches.append(f"  '{name}':[{(px - GX) / U * size:.3f},{(GY - py) / U * size:.3f}]")
    lib.K = 1.0
    x = y = row = 0
    for it in sorted(items, key=lambda i: -i["h"]):
        if x + it["w"] > ATLAS_W:
            x = 0; y += row; row = 0
        it["x"], it["y"] = x, y
        x += it["w"]; row = max(row, it["h"])
    height = int(math.ceil((y + row) / 64.0) * 64)
    parts = []; defs = []
    for it in items:
        defs.append(it["defs"])
        parts.append(f'<g transform="translate({f(it["x"] - it["ox"])} {f(it["y"] - it["oy"])}) scale({it["s"]:.5f})" stroke-width="{BASE_LINE * LINE * PPU / U / it["s"]:.2f}">{it["body"]}</g>')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{ATLAS_W}" height="{height}" viewBox="0 0 {ATLAS_W} {height}">'
           f'<defs>{"".join(defs)}</defs><g stroke="{O}" stroke-linejoin="round" stroke-linecap="round" stroke-width="{BASE_LINE * LINE:.2f}">{"".join(parts)}</g></svg>')
    cells = ",\n".join(f"  '{it['name']}':[{it['x']},{it['y']},{it['w']},{it['h']},{it['ax']:.1f},{it['ay']:.1f}]" for it in items)
    js = ("// Generated by tools/art/scenery.py: do not edit by hand.\n"
          "// Scenery atlas cells in pixels: [x, y, width, height, anchorX, anchorY]. The anchor is the ground contact\n"
          "// of upright props and critters, or the centre of flat decals and fliers. `ppu` is atlas pixels per world unit.\n"
          "// `perches`: where a crow may stand on a set piece, [dx, height] in world units from its ground contact.\n"
          f"export const SCENERY_ATLAS = Object.freeze({{width:{ATLAS_W}, height:{height}, ppu:{PPU}, cells:Object.freeze({{\n{cells},\n}}), perches:Object.freeze({{\n" + ",\n".join(perches) + ",\n})});\n")
    open(ATLAS_JS, "w").write(js)
    return svg


SPRITES = {"scenery": {"builder": build_atlas}}


if __name__ == "__main__":
    out = os.path.join(ROOT, "themes", "harvest", "sprites", "scenery.svg")
    svg = build_atlas()
    open(out, "w").write(svg)
    render_png(svg, "/tmp/claude-0/shots/scenery-atlas.png")
    print("wrote", out)
