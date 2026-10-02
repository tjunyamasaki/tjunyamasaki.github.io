"""Homestead: crops in four growth stages and what they yield (src/homestead.mjs CROPS).

Each crop is one sheet of four frames, left to right: sprout, young, maturing, ripe. The sheet
is fitted as a whole, so a sprout stays small beside its ripe plant. Items are drawn like the
other supplies (a world sprite plus an inventory icon).
"""
import math
from lib import *
from nodes import pumpkin_body, PK, PK_D, PK_L, STEM, STRAW, STRAW_D, STRAW_L

SOIL = "#5a3d30"; SOIL_D = "#3f2a22"; SOIL_L = "#7a5442"
MOON = "#cfe3ea"; MOON_D = "#93b3c4"; MOON_L = "#f4fbff"; MOON_G = "#bff3ff"
MLEAF = "#8fb3a0"; MLEAF_D = "#678c7a"; MLEAF_L = "#c3dccd"
WHEAT = "#d9a548"; WHEAT_D = "#a5742e"; WHEAT_L = "#f6d58a"
GREEN = "#87a35a"; GREEN_D = "#5f7a3e"; GREEN_L = "#b4cc7a"
APPLE = "#a3283a"; APPLE_D = "#6e1a2c"; APPLE_L = "#e0606a"
STAKE = "#8a6446"; STAKE_D = "#5f4232"; STAKE_L = "#b88a62"


def mound(w=96, y=742):
    """The little heap of turned earth a plant stands in."""
    return (ell(256, y - 4, w, w * .26, SOIL_D, 7)
            + fill_ns(f"M{256 - w * .8} {y - 8} Q256 {y - w * .34} {256 + w * .8} {y - 8} Q256 {y - w * .12} {256 - w * .8} {y - 8} Z", SOIL_L, .7))


def stalk(p0, c, p1, w, col=GREEN, dark=GREEN_D):
    return bundle([(limb(p0, c, p1, w, max(3, w * .55)), col)])


def bundle(parts, w=12):
    """Thin shapes (blades, stalks) as one inked silhouette: every outline first, then every fill."""
    return ("".join(f'<path d="{d}" fill="{c}" stroke-width="{sw(w)}"/>' for d, c in parts)
            + "".join(f'<path d="{d}" fill="{c}" stroke="none"/>' for d, c in parts))


def blade_d(p0, c, p1, w):
    return ribbon(p0, c, p1, lambda t: w * (1 - t) ** 0.85 + 2)


def blade(p0, c, p1, w, col, lw=6):
    return bundle([(blade_d(p0, c, p1, w), col)])


def broadleaf(x, y, ang, s, col, vein, lw=6):
    """A rounded, lobed leaf (pumpkin, squash) on a short stalk, pointing `ang` degrees from up."""
    p = ("M0 0 C-30 -10 -58 -44 -50 -82 C-46 -104 -24 -112 -12 -100 C-8 -124 14 -126 22 -104 "
         "C40 -112 60 -96 52 -70 C46 -40 26 -12 0 0 Z")
    body = fill(p, col, lw) + line("M0 -4 Q4 -50 6 -96 M2 -46 Q-20 -64 -36 -80 M4 -54 Q26 -70 40 -84", 3.5, vein)
    return f'<g transform="translate({f(x)} {f(y)}) rotate({f(ang)}) scale({s:.3f})">{body}</g>'


def longleaf(x, y, ang, L, w, col, hi=None, lw=6):
    """A strap leaf from (x, y), curving outwards."""
    p = f"M0 0 Q{f(w)} {f(-L * .5)} {f(w * .2)} {f(-L)} Q{f(-w * .6)} {f(-L * .55)} 0 0 Z"
    body = fill(p, col, lw)
    if hi:
        body += brush((w * .1, -L * .15), (w * .3, -L * .5), (w * .15, -L * .85), 5, hi, .8)
    return f'<g transform="translate({f(x)} {f(y)}) rotate({f(ang)})">{body}</g>'


def cotyledons(x, y, s, col=GREEN, light=GREEN_L, h=60):
    b = stalk((x, y), (x - 2, y - h * .5), (x, y - h), 9 * s)
    for side in (-1, 1):
        p = f"M{x} {y - h} Q{x + side * 46 * s} {y - h - 40 * s} {x + side * 66 * s} {y - h - 10 * s} Q{x + side * 40 * s} {y - h + 14 * s} {x} {y - h} Z"
        b += fill(p, col, 6) + brush((x + side * 12 * s, y - h - 6 * s), (x + side * 34 * s, y - h - 24 * s), (x + side * 54 * s, y - h - 12 * s), 4, light, .9)
    return b


# ------------------------------------------------------------------ pumpkin
def pumpkin_0():
    d = []; b = mound(70)
    b += cotyledons(256, 734, 1.0, LEAF, LEAF_L, 52)
    return d, b


def pumpkin_1():
    d = []; b = mound(84)
    b += line("M256 730 Q300 712 330 724 Q352 736 344 714", 5, LEAF_D)
    b += stalk((256, 734), (250, 690), (240, 650), 10, LEAF, LEAF_D)
    b += broadleaf(238, 656, -30, .95, LEAF, LEAF_D) + broadleaf(262, 690, 40, .8, LEAF_L, LEAF_D) + broadleaf(226, 700, -70, .7, LEAF_D, O)
    return d, b


def pumpkin_young_body(d, x, y, s):
    """A small green pumpkin, ridged like its ripe self."""
    mid = f"M{x} {y - 70 * s} C{x + 54 * s} {y - 70 * s} {x + 74 * s} {y - 30 * s} {x + 74 * s} {y} C{x + 74 * s} {y + 34 * s} {x + 46 * s} {y + 52 * s} {x} {y + 52 * s} C{x - 46 * s} {y + 52 * s} {x - 74 * s} {y + 34 * s} {x - 74 * s} {y} C{x - 74 * s} {y - 30 * s} {x - 54 * s} {y - 70 * s} {x} {y - 70 * s} Z"
    b = shaded(d, mid, GREEN, GREEN_D, -8, -6, line(f"M{x} {y - 66 * s} Q{x - 6 * s} {y} {x} {y + 48 * s} M{x - 34 * s} {y - 56 * s} Q{x - 46 * s} {y} {x - 32 * s} {y + 44 * s} M{x + 34 * s} {y - 56 * s} Q{x + 46 * s} {y} {x + 32 * s} {y + 44 * s}", 4, GREEN_D))
    b += brush((x + 20 * s, y - 50 * s), (x + 44 * s, y - 30 * s), (x + 50 * s, y), 6, GREEN_L)
    b += fill(f"M{x - 6 * s} {y - 66 * s} Q{x - 8 * s} {y - 92 * s} {x + 4 * s} {y - 108 * s} L{x + 16 * s} {y - 102 * s} Q{x + 8 * s} {y - 88 * s} {x + 10 * s} {y - 66 * s} Z", STEM, 5)
    return b


def pumpkin_2b():
    d = []; b = mound(110)
    b += line("M200 728 Q150 720 132 700 Q122 684 138 676", 5, LEAF_D)
    b += broadleaf(176, 720, -70, 1.1, LEAF_D, O) + broadleaf(334, 718, 66, 1.15, LEAF, LEAF_D)
    b += broadleaf(226, 668, -22, 1.25, LEAF, LEAF_D) + broadleaf(296, 660, 26, 1.05, LEAF_L, LEAF_D)
    b += pumpkin_young_body(d, 282, 706, .62)
    b += G(fill("M0 0 L-26 -46 Q0 -60 26 -46 Z", GOLD, 6) + fill_ns("M-14 -40 Q0 -50 14 -40 L0 -8 Z", GOLD_L, .9), 192, 646, -26)
    return d, b


def pumpkin_3():
    d = []; b = mound(130)
    b += line("M150 722 Q110 712 98 688 Q92 670 110 664", 5, LEAF_D) + line("M362 724 Q404 716 414 694", 5, LEAF_D)
    b += broadleaf(150, 716, -78, 1.15, LEAF_D, O) + broadleaf(372, 716, 76, 1.1, LEAF, LEAF_D)
    b += broadleaf(206, 636, -30, 1.15, LEAF, LEAF_D) + broadleaf(318, 628, 30, 1.0, LEAF_L, LEAF_D)
    b += pumpkin_body(d, 256, 664, .78)
    b += sparkle(352, 560, 1.1, "#fff3c6") + sparkle(168, 596, .8, "#fff3c6")
    return d, b


# ------------------------------------------------------------------ moonroot
def moonroot_leaves(x, y, n, L, spread, cols=(MLEAF, MLEAF_D, MLEAF_L)):
    b = ""
    for i in range(n):
        t = i / max(1, n - 1) - .5
        ang = t * spread
        col = cols[i % 2]
        b += longleaf(x, y, ang, L * (1 - abs(t) * .35), 46, col, MLEAF_L if col == MLEAF else None)
    return b


def moonroot_0():
    d = []; b = mound(60)
    b += longleaf(250, 736, -18, 76, 26, MLEAF) + longleaf(262, 736, 22, 66, 24, MLEAF_L)
    return d, b


def moonroot_1():
    d = []; b = mound(78)
    b += moonroot_leaves(256, 734, 4, 150, 110)
    return d, b


def moonroot_bulb(d, x, y, s, glow=False):
    body = (f"M{x} {y - 92 * s} C{x + 70 * s} {y - 88 * s} {x + 84 * s} {y - 20 * s} {x + 60 * s} {y + 16 * s} "
            f"C{x + 40 * s} {y + 42 * s} {x + 14 * s} {y + 52 * s} {x} {y + 82 * s} C{x - 14 * s} {y + 52 * s} {x - 40 * s} {y + 42 * s} {x - 60 * s} {y + 16 * s} "
            f"C{x - 84 * s} {y - 20 * s} {x - 70 * s} {y - 88 * s} {x} {y - 92 * s} Z")
    b = ""
    b += shaded(d, body, MOON, MOON_D, -10 * s, -8 * s,
                line(f"M{x - 44 * s} {y - 30 * s} Q{x - 10 * s} {y - 20 * s} {x + 30 * s} {y - 34 * s} M{x - 30 * s} {y + 10 * s} Q{x} {y + 18 * s} {x + 34 * s} {y + 4 * s}", 3.5, MOON_D, ' opacity=".7"'))
    b += brush((x - 40 * s, y - 50 * s), (x - 52 * s, y - 14 * s), (x - 34 * s, y + 18 * s), 7, MOON_L)
    return b


def soil_lip(w, y=742):
    """Earth in front of a root, so the bulb sits in the ground."""
    return fill(f"M{256 - w} {y - 4} Q{256 - w * .5} {y - w * .34} 256 {y - w * .3} Q{256 + w * .5} {y - w * .34} {256 + w} {y - 4} Q256 {y + w * .16} {256 - w} {y - 4} Z", SOIL, 7) \
        + fill_ns(f"M{256 - w * .6} {y - w * .2} Q256 {y - w * .36} {256 + w * .6} {y - w * .2}", SOIL_L, .8)


def moonroot_2():
    d = []; b = mound(92)
    b += moonroot_leaves(256, 700, 5, 176, 120)
    b += moonroot_bulb(d, 256, 728, .5)
    b += soil_lip(78)
    return d, b


def moonroot_3():
    d = []; b = mound(104)
    b += moonroot_leaves(256, 624, 6, 196, 130, (MLEAF, MLEAF_D, MLEAF_L))
    b += moonroot_bulb(d, 256, 690, .95, glow=True)
    b += soil_lip(96)
    b += sparkle(158, 640, 1.2, MOON_L) + sparkle(356, 600, 1.0, MOON_L) + sparkle(318, 700, .7, MOON_G)
    return d, b


# ------------------------------------------------------------------ duskwheat
def wheat_head(x, y, ang, s, col=WHEAT, dark=WHEAT_D, light=WHEAT_L, awns=True):
    g = ""
    for i in range(6):
        yy = -i * 16
        for side in (-1, 1):
            g += ell(side * 9, yy, 9, 15, col if side < 0 else dark, 4, side * 24)
    g += ell(0, -100, 8, 14, col, 4)
    if awns:
        for i in range(5):
            yy = -i * 18 - 6
            g += line(f"M-10 {yy} L-34 {yy - 34} M10 {yy} L34 {yy - 34}", 2.5, dark)
    g += brush((-6, -10), (-9, -50), (-5, -90), 3.5, light, .9)
    return f'<g transform="translate({f(x)} {f(y)}) rotate({f(ang)}) scale({s:.3f})">{g}</g>'


def wheat_tuft(n, h, col, dark, lean=0, seed=1, w=24):
    import random
    r = random.Random(seed); parts = []
    for i in range(n):
        t = (i / max(1, n - 1)) - .5
        x0 = 256 + t * 50
        tip = (256 + t * 170 + lean + r.uniform(-14, 14), 738 - h * (1 - abs(t) * .4) + r.uniform(-10, 10))
        parts.append((blade_d((x0, 740), ((x0 + tip[0]) / 2 - t * 20, (740 + tip[1]) / 2), tip, w), col if i % 2 else dark))
    return bundle(parts)


def duskwheat_0():
    d = []; b = mound(52)
    b += wheat_tuft(3, 80, GREEN, GREEN_L, 0, 3)
    return d, b


def duskwheat_1():
    d = []; b = mound(70)
    b += wheat_tuft(6, 190, GREEN, GREEN_D, -6, 5)
    return d, b


def duskwheat_2():
    d = []; b = mound(80)
    b += wheat_tuft(5, 200, GREEN, GREEN_D, 4, 7)
    for (x0, x1, top, ang) in [(238, 214, 420, -10), (256, 262, 384, 2), (276, 304, 424, 12)]:
        b += stalk((x0, 740), ((x0 + x1) / 2, 600), (x1, top + 6), 14, GREEN_L, GREEN_D)
        b += wheat_head(x1, top, ang, .82, GREEN_L, GREEN, "#e4efb8", awns=False)
    return d, b


def duskwheat_3():
    d = []; b = mound(88)
    b += wheat_tuft(5, 190, WHEAT_D, STRAW_D, 2, 9)
    for (x0, x1, top, ang) in [(226, 172, 424, -26), (244, 226, 368, -10), (262, 282, 360, 8), (280, 336, 412, 24), (252, 252, 404, 0)]:
        b += stalk((x0, 740), ((x0 + x1) / 2 - (x1 - x0) * .1, 590), (x1, top + 8), 15, STRAW, STRAW_D)
        b += wheat_head(x1, top, ang + (14 if ang >= 0 else -14), .92)
    b += sparkle(190, 360, .9, "#fff3c6") + sparkle(350, 396, .7, "#fff3c6")
    return d, b


# ------------------------------------------------------------------ bloodapple
def apple_stake(top=470):
    return (rrect(244, top, 24, 742 - top, 6, STAKE, 6) + brush((250, top + 20), (252, (top + 742) / 2), (250, 724), 5, STAKE_L)
            + fill(f"M244 {top + 4} L256 {top - 22} L268 {top + 4} Z", STAKE_D, 6))


def vine(points, w=7):
    return line(smooth(points, closed=False), w + 7) + line(smooth(points, closed=False), w, GREEN)


def apple(x, y, r, col=APPLE, dark=APPLE_D, light=APPLE_L):
    return (line(f"M{x} {y - r} Q{x + 2} {y - r - 14} {x - 4} {y - r - 22}", 4, STEM)
            + f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{dark}" stroke-width="{sw(6)}"/>'
            + f'<path d="M{f(x - r * .92)} {f(y + r * .1)} A{f(r * .92)} {f(r * .92)} 0 0 1 {f(x + r * .7)} {f(y - r * .6)} Q{f(x)} {f(y - r * .1)} {f(x - r * .92)} {f(y + r * .1)} Z" fill="{col}" stroke="none"/>'
            + f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="none" stroke-width="{sw(6)}"/>'
            + f'<circle cx="{f(x - r * .38)}" cy="{f(y - r * .38)}" r="{f(r * .22)}" fill="{light}" stroke="none"/>')


def vine_leaves(spots):
    return "".join(broadleaf(x, y, a, s, LEAF if i % 2 else LEAF_L, LEAF_D) for i, (x, y, a, s) in enumerate(spots))


def bloodapple_0():
    d = []; b = mound(60)
    b += apple_stake(560)
    b += cotyledons(222, 736, .8, LEAF, LEAF_L, 44)
    return d, b


def bloodapple_1():
    d = []; b = mound(76)
    b += apple_stake(470)
    b += vine([(236, 738), (226, 690), (272, 650), (240, 600), (262, 560)])
    b += vine_leaves([(230, 700, -60, .55), (272, 648, 60, .6), (238, 600, -50, .55), (262, 560, 20, .5)])
    return d, b


def bloodapple_2():
    d = []; b = mound(88)
    b += apple_stake(430)
    b += vine([(232, 738), (210, 680), (290, 630), (220, 560), (286, 500), (254, 452)])
    b += vine([(282, 738), (300, 690), (226, 620), (280, 580)], 6)
    b += vine_leaves([(206, 690, -70, .7), (300, 640, 64, .72), (214, 572, -60, .66), (292, 514, 50, .64), (250, 460, -10, .58), (296, 700, 80, .6)])
    for (x, y) in [(232, 640), (286, 588), (240, 520)]:
        b += apple(x, y, 13, GREEN_L, GREEN, "#e4efb8")
    for (x, y, a) in [(272, 676, 30), (210, 540, -20)]:
        b += G(fill("M0 0 L-10 -18 L0 -24 L10 -18 Z", BONE, 4), x, y, a)
    return d, b


def bloodapple_3():
    d = []; b = mound(96)
    b += apple_stake(420)
    b += vine([(232, 738), (204, 680), (296, 628), (212, 556), (294, 494), (252, 440)], 8)
    b += vine([(284, 738), (306, 686), (222, 618), (288, 572)], 7)
    b += vine_leaves([(200, 690, -74, .78), (306, 640, 66, .8), (206, 568, -62, .74), (300, 506, 52, .72), (250, 448, -12, .66), (302, 704, 80, .66), (180, 620, -90, .6)])
    for (x, y, r) in [(232, 650, 26), (300, 596, 24), (238, 530, 24), (290, 466, 21), (196, 604, 20), (272, 696, 22)]:
        b += apple(x, y, r)
    b += sparkle(332, 450, .9, "#ffd9d6") + sparkle(178, 520, .7, "#ffd9d6")
    return d, b


# ------------------------------------------------------------------ items
def moonroot_item():
    d = []; b = ""
    b += longleaf(250, 566, -26, 130, 40, MLEAF, MLEAF_L) + longleaf(262, 566, 24, 120, 38, MLEAF_D) + longleaf(256, 566, 0, 146, 36, MLEAF_L)
    b += moonroot_bulb(d, 256, 640, .95, glow=True)
    b += line("M256 712 Q262 732 252 748", 4, MOON_D)
    b += sparkle(352, 560, 1.0, MOON_L)
    return d, b


def rootseed():
    d = []; b = ""
    for (x, y, r) in [(222, 668, 30), (292, 660, 26), (256, 712, 28), (190, 718, 20), (318, 712, 22)]:
        b += f'<circle cx="{x}" cy="{y}" r="{r}" fill="{MOON_D}" stroke-width="{sw(6)}"/>'
        b += f'<path d="M{x - r * .8} {y - r * .1} A{r * .8} {r * .8} 0 0 1 {x + r * .5} {y - r * .6}" fill="none" stroke="{MOON_L}" stroke-width="{sw(5)}"/>'
    b += sparkle(256, 600, 1.0, MOON_G)
    return d, b


def wheat_item():
    d = []; b = ""
    sheaf = [(244, 182, 470, -30), (252, 226, 440, -12), (260, 290, 438, 10), (268, 336, 474, 28)]
    b += bundle([(limb((x0, 744), ((x0 + x1) / 2, 600), (x1, top + 8), 34, 20), STRAW if i % 2 else STRAW_L) for i, (x0, x1, top, ang) in enumerate(sheaf)], 4)
    for (x0, x1, top, ang) in sheaf:
        b += wheat_head(x1, top, ang, .9)
    b += rrect(214, 620, 84, 34, 10, MAR, 6) + brush((224, 632), (256, 628), (288, 632), 4, MAR_L)
    return d, b


def wheatseed():
    d = []; b = ""
    for (x, y, rot) in [(220, 670, -30), (288, 664, 24), (254, 716, 6), (190, 720, -60), (322, 718, 50)]:
        s = "M0 -34 Q20 -24 18 6 Q14 30 0 34 Q-14 30 -18 6 Q-20 -24 0 -34 Z"
        b += G(shaded(d, s, WHEAT, WHEAT_D, 5, -4, brush((-8, -18), (-10, 0), (-6, 18), 4, WHEAT_L, .9)) + line("M0 -28 L0 28", 3, WHEAT_D), x, y, rot)
    return d, b


def bloodapple_item():
    d = []; b = ""
    b += apple(256, 650, 92)
    b += broadleaf(270, 568, 52, .9, LEAF, LEAF_D)
    b += sparkle(338, 600, 1.0, "#ffd9d6")
    return d, b


def appleseed():
    d = []; b = ""
    for (x, y, rot) in [(224, 664, -24), (290, 670, 30), (256, 718, 0)]:
        s = "M0 -40 Q24 -6 20 16 Q14 38 0 38 Q-14 38 -20 16 Q-24 -6 0 -40 Z"
        b += G(shaded(d, s, "#5e2a22", "#3d1a16", 5, -4, brush((-8, -10), (-10, 8), (-5, 26), 4, "#a8574a", .9)), x, y, rot)
    return d, b


CROP = (40, 300, 472, 744)
ITEM = (120, 400, 392, 740)
SPRITES = {
    "crop-pumpkin": dict(frames=[pumpkin_0, pumpkin_1, pumpkin_2b, pumpkin_3], cols=4, rows=1, target=(40, 380, 472, 744)),
    "crop-moonroot": dict(frames=[moonroot_0, moonroot_1, moonroot_2, moonroot_3], cols=4, rows=1, target=(60, 340, 452, 744)),
    "crop-duskwheat": dict(frames=[duskwheat_0, duskwheat_1, duskwheat_2, duskwheat_3], cols=4, rows=1, target=(60, 150, 452, 744)),
    "crop-bloodapple": dict(frames=[bloodapple_0, bloodapple_1, bloodapple_2, bloodapple_3], cols=4, rows=1, target=(70, 170, 442, 744)),
    "moonroot": (moonroot_item, ITEM), "rootseed": (rootseed, (150, 520, 362, 740)),
    "wheat": (wheat_item, ITEM), "wheatseed": (wheatseed, (150, 520, 362, 740)),
    "bloodapple": (bloodapple_item, ITEM), "appleseed": (appleseed, (150, 520, 362, 740)),
}
ICONS = {k: SPRITES[k][0] for k in ("moonroot", "rootseed", "wheat", "wheatseed", "bloodapple", "appleseed")}
WIDE = {}
