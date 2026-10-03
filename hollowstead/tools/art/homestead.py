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


# ------------------------------------------------------------------ night crops: gloomcap, starlily
GLM = "#8f6fc4"; GLM_D = "#634a94"; GLM_L = "#c9b2ef"; GLM_S = "#e8ffd0"
STAR = "#e6eefc"; STAR_D = "#a9bde0"; STAR_G = "#9ff0ff"


def cap(d, x, base, h, r, tilt=0, col=GLM, dark=GLM_D, light=GLM_L, spots=True):
    s = ""
    stem = f"M{x - r * .2} {base} Q{x - r * .26} {base - h * .5} {x - r * .14 + tilt * .5} {base - h} L{x + r * .14 + tilt * .5} {base - h} Q{x + r * .26} {base - h * .5} {x + r * .2} {base} Z"
    s += fill(stem, "#dfe3ea", 7) + brush((x - r * .05, base - 8), (x - r * .08, base - h * .5), (x + tilt * .4, base - h + 6), 5, "#b8bfcc")
    cy = base - h
    c = f"M{x - r + tilt} {cy + 8} Q{x - r + tilt} {cy - r * .95} {x + tilt} {cy - r * .95} Q{x + r + tilt} {cy - r * .95} {x + r + tilt} {cy + 8} Q{x + tilt} {cy + r * .3} {x - r + tilt} {cy + 8} Z"
    s += shaded(d, c, col, dark, -8, -8, brush((x - r * .55 + tilt, cy - r * .3), (x - r * .3 + tilt, cy - r * .75), (x + r * .15 + tilt, cy - r * .8), 8, light), 7)
    if spots:
        for (dx, dy, rr) in [(-.42, -.32, .14), (.18, -.6, .12), (.5, -.22, .1)]:
            s += f'<circle cx="{f(x + tilt + dx * r)}" cy="{f(cy + dy * r)}" r="{f(rr * r)}" fill="{GLM_S}" stroke="none"/>'
    return s


def gloomcap_0():
    d = []; b = mound(56)
    b += cap(d, 256, 738, 26, 30, spots=False)
    return d, b


def gloomcap_1():
    d = []; b = mound(72)
    b += cap(d, 226, 740, 44, 44, -6) + cap(d, 292, 742, 30, 32, 6, spots=False)
    return d, b


def gloomcap_2():
    d = []; b = mound(86)
    b += cap(d, 300, 742, 50, 52, 8) + cap(d, 206, 742, 66, 64, -8) + cap(d, 256, 744, 30, 30, 0, spots=False)
    return d, b


def gloomcap_3():
    d = []; b = mound(100)
    b += cap(d, 320, 742, 76, 70, 10) + cap(d, 196, 742, 96, 88, -10) + cap(d, 262, 746, 50, 48, 0)
    b += sparkle(150, 540, 1.3, GLM_S) + sparkle(360, 560, 1.0, GLM_S) + sparkle(270, 600, .8, GLM_S)
    return d, b


def lily_leaves(n, L, spread, col=LEAF, alt=LEAF_D):
    b = ""
    for i in range(n):
        t = i / max(1, n - 1) - .5
        b += longleaf(256 + t * 30, 738, t * spread, L * (1 - abs(t) * .3), 34, col if i % 2 else alt, LEAF_L if i % 2 else None)
    return b


def star_flower(x, y, s, open_=1.0):
    g = ""
    k_ = 1 / s  # the group is scaled by s: keep the ink the same weight as everywhere else
    for k in range(6):
        a = k * 60 + 30
        L = 70 * open_
        p = f"M0 0 Q{f(30)} {f(-L * .45)} 0 {f(-L)} Q{f(-30)} {f(-L * .45)} 0 0 Z"
        g += f'<g transform="rotate({a})">' + fill(p, STAR if k % 2 else "#f6f9ff", 6 * k_) + line(f"M0 -10 L0 {f(-L * .6)}", 3 * k_, STAR_D) + '</g>'
    g += f'<circle cx="0" cy="0" r="16" fill="{GOLD_L}" stroke-width="{sw(6 * k_)}"/>'
    for a in range(0, 360, 60):
        g += f'<circle cx="{f(math.cos(math.radians(a)) * 9)}" cy="{f(math.sin(math.radians(a)) * 9)}" r="3" fill="{GOLD}" stroke="none"/>'
    return f'<g transform="translate({f(x)} {f(y)}) scale({s:.3f} {s * .8:.3f})">{g}</g>'


def starlily_0():
    d = []; b = mound(56)
    b += lily_leaves(2, 70, 40)
    return d, b


def starlily_1():
    d = []; b = mound(70)
    b += lily_leaves(4, 140, 90)
    b += stalk((256, 738), (252, 660), (258, 600), 12)
    b += ell(258, 588, 16, 26, STAR_D, 6)
    return d, b


def starlily_2():
    d = []; b = mound(80)
    b += lily_leaves(5, 170, 110)
    b += stalk((256, 738), (246, 600), (262, 500), 14)
    b += fill("M262 500 Q232 470 248 420 Q262 400 276 420 Q292 470 262 500 Z", STAR, 7) + line("M262 496 L262 430", 3, STAR_D)
    return d, b


def starlily_3():
    d = []; b = mound(90)
    b += lily_leaves(6, 190, 130)
    b += stalk((256, 738), (240, 590), (260, 470), 15)
    b += star_flower(260, 452, 1.15)
    b += sparkle(150, 420, 1.2, "#ffffff") + sparkle(372, 470, .9, "#ffffff")
    return d, b


# ------------------------------------------------------------------ rare crops: moonpetal, ghostgourd
SILV = "#dfe4ee"; SILV_D = "#9aa3b8"; SILV_L = "#ffffff"; PALE = "#cfe9ef"; PALE_D = "#86aeb9"; PALE_L = "#f1fcff"; GHOST_G = "#9ff0ff"


def crescent_petal(x, y, ang, L, s=1.0):
    p = f"M0 0 Q{f(38 * s)} {f(-L * .35)} {f(14 * s)} {f(-L)} Q{f(-2 * s)} {f(-L * .55)} {f(-26 * s)} {f(-L * .62)} Q{f(-6 * s)} {f(-L * .3)} 0 0 Z"
    return f'<g transform="translate({f(x)} {f(y)}) rotate({f(ang)})">' + fill(p, SILV, 6) + brush((6 * s, -L * .2), (16 * s, -L * .5), (12 * s, -L * .85), 5, SILV_L) + '</g>'


def moonpetal_0():
    d = []; b = mound(56)
    b += longleaf(248, 736, -20, 64, 24, "#a8b6c4") + longleaf(264, 736, 24, 56, 22, "#c3cfda")
    return d, b


def moonpetal_1():
    d = []; b = mound(70)
    for i, a in enumerate((-70, -35, 0, 35, 70)):
        b += longleaf(256, 736, a, 120 - abs(a) * .5, 34, "#a8b6c4" if i % 2 else "#c3cfda", SILV_L if i % 2 else None)
    return d, b


def moonpetal_2():
    d = []; b = mound(80)
    for i, a in enumerate((-75, -40, 0, 40, 75)):
        b += longleaf(256, 736, a, 140 - abs(a) * .5, 36, "#a8b6c4" if i % 2 else "#c3cfda", SILV_L if i % 2 else None)
    b += stalk((256, 738), (250, 620), (256, 520), 12, "#9aa3b8", "#6f7a90")
    b += fill("M256 520 Q226 488 244 440 Q256 424 270 440 Q288 488 256 520 Z", SILV, 7)
    return d, b


def moonpetal_3():
    d = []; b = mound(92)
    for i, a in enumerate((-80, -45, 0, 45, 80)):
        b += longleaf(256, 736, a, 150 - abs(a) * .5, 38, "#a8b6c4" if i % 2 else "#c3cfda", SILV_L if i % 2 else None)
    b += stalk((256, 738), (246, 600), (258, 480), 13, "#9aa3b8", "#6f7a90")
    for k in range(5):
        b += crescent_petal(258, 452, k * 72 - 10, 100, 1.1)
    b += f'<circle cx="258" cy="452" r="22" fill="{GOLD_L}" stroke-width="{sw(6)}"/>' + f'<circle cx="252" cy="446" r="7" fill="#ffffff" stroke="none"/>'
    b += sparkle(140, 400, 1.4, "#fff4c6") + sparkle(380, 430, 1.1, "#fff4c6") + sparkle(300, 330, .9, "#ffffff")
    return d, b


def gourd_body(d, x, y, s, glow=False):
    body = (f"M{x} {y - 120 * s} C{x + 40 * s} {y - 120 * s} {x + 44 * s} {y - 70 * s} {x + 52 * s} {y - 40 * s} "
            f"C{x + 96 * s} {y - 20 * s} {x + 104 * s} {y + 60 * s} {x + 60 * s} {y + 80 * s} C{x + 30 * s} {y + 94 * s} {x - 30 * s} {y + 94 * s} {x - 60 * s} {y + 80 * s} "
            f"C{x - 104 * s} {y + 60 * s} {x - 96 * s} {y - 20 * s} {x - 52 * s} {y - 40 * s} C{x - 44 * s} {y - 70 * s} {x - 40 * s} {y - 120 * s} {x} {y - 120 * s} Z")
    b = ""
    b += shaded(d, body, PALE, PALE_D, -10 * s, -8 * s, line(f"M{x} {y - 110 * s} Q{x - 8 * s} {y} {x} {y + 86 * s} M{x - 46 * s} {y - 20 * s} Q{x - 62 * s} {y + 30 * s} {x - 38 * s} {y + 80 * s} M{x + 46 * s} {y - 20 * s} Q{x + 62 * s} {y + 30 * s} {x + 38 * s} {y + 80 * s}", 4, PALE_D))
    b += brush((x - 64 * s, y - 10 * s), (x - 76 * s, y + 30 * s), (x - 58 * s, y + 66 * s), 9, PALE_L)
    b += fill(f"M{x - 6 * s} {y - 116 * s} Q{x - 8 * s} {y - 146 * s} {x + 6 * s} {y - 164 * s} L{x + 20 * s} {y - 156 * s} Q{x + 8 * s} {y - 140 * s} {x + 10 * s} {y - 116 * s} Z", "#7c8a86", 5)
    return b


def ghostgourd_0():
    d = []; b = mound(56)
    b += cotyledons(256, 734, 1.0, "#9fb6b0", "#d2e6e0", 48)
    return d, b


def ghostgourd_1():
    d = []; b = mound(76)
    b += stalk((256, 734), (250, 690), (240, 650), 10, "#9fb6b0", "#6f8a84")
    b += broadleaf(238, 656, -30, .9, "#9fb6b0", "#6f8a84") + broadleaf(262, 690, 40, .8, "#c3d8d2", "#6f8a84")
    return d, b


def ghostgourd_2():
    d = []; b = mound(96)
    b += broadleaf(176, 720, -70, 1.05, "#7f9a94", O) + broadleaf(334, 718, 66, 1.05, "#9fb6b0", "#6f8a84")
    b += gourd_body(d, 270, 690, .45)
    b += broadleaf(226, 668, -22, 1.1, "#9fb6b0", "#6f8a84")
    return d, b


def ghostgourd_3():
    d = []; b = mound(120)
    b += broadleaf(150, 716, -78, 1.1, "#7f9a94", O) + broadleaf(372, 716, 76, 1.05, "#9fb6b0", "#6f8a84")
    b += gourd_body(d, 256, 660, .92, glow=True)
    b += sparkle(352, 520, 1.2, "#e9fdff") + sparkle(160, 560, .9, "#e9fdff")
    return d, b


# ------------------------------------------------------------------ produce and seeds
def gloomcap_item():
    d = []; b = ""
    b += cap(d, 300, 740, 90, 84, 10) + cap(d, 206, 742, 120, 104, -10)
    return d, b


def gloomspore():
    d = []; b = ""
    for (x, y, r) in [(220, 660, 30), (290, 650, 26), (256, 712, 30), (190, 716, 20), (322, 708, 22)]:
        b += f'<circle cx="{x}" cy="{y}" r="{r}" fill="{GLM}" stroke-width="{sw(6)}"/><circle cx="{x - r * .3}" cy="{y - r * .3}" r="{r * .28}" fill="{GLM_S}" stroke="none"/>'
    return d, b


def starlily_item():
    d = []; b = ""
    b += longleaf(300, 700, 50, 120, 44, LEAF, LEAF_L) + longleaf(210, 700, -50, 110, 40, LEAF_D)
    b += star_flower(256, 620, 2.6)
    return d, b


def lilybulb():
    d = []; b = ""
    bulb = "M256 520 Q300 560 316 620 Q330 700 256 716 Q182 700 196 620 Q212 560 256 520 Z"
    b += shaded(d, bulb, "#efe4cf", "#cdbd9d", 8, -6, brush((222, 600), (214, 640), (226, 690), 7, "#ffffff", .8))
    b += line("M256 520 Q252 490 262 460 M250 716 L240 744 M262 716 L274 742 M232 712 L216 736", 6, "#8c7a5c")
    return d, b


def moonpetal_item():
    d = []; b = ""
    for k in range(5):
        b += crescent_petal(256, 610, k * 72 - 10, 130, 1.4)
    b += f'<circle cx="256" cy="610" r="30" fill="{GOLD_L}" stroke-width="{sw(7)}"/>' + f'<circle cx="248" cy="602" r="9" fill="#ffffff" stroke="none"/>'
    b += sparkle(360, 500, 1.2, "#fff4c6")
    return d, b


def petalseed():
    d = []; b = ""
    for (x, y, rot) in [(222, 662, -30), (292, 666, 24), (256, 716, 4)]:
        c = "M-30 10 Q-22 -40 26 -34 Q-6 -20 -2 22 Q-16 26 -30 10 Z"
        b += G(fill(c, SILV, 6) + brush((-14, 4), (-10, -20), (12, -28), 4, SILV_L), x, y, rot)
    b += sparkle(320, 600, 1.0, "#fff4c6")
    return d, b


def ghostgourd_item():
    d = []; b = ""
    b += gourd_body(d, 256, 650, 1.0, glow=True)
    return d, b


def gourdseed():
    d = []; b = ""
    for (x, y, rot) in [(222, 664, -20), (290, 668, 26), (256, 716, 0)]:
        s = "M0 -36 Q22 -20 20 10 Q16 34 0 36 Q-16 34 -20 10 Q-22 -20 0 -36 Z"
        b += G(shaded(d, s, PALE, PALE_D, 5, -4, brush((-8, -16), (-10, 0), (-6, 18), 4, PALE_L, .9)), x, y, rot)
    return d, b


# ------------------------------------------------------------------ dishes and draughts
def bowl(soup, soup_l, bits, steam=True):
    d = []; b = ""
    body = "M110 620 Q120 740 256 742 Q392 740 402 620 Z"
    b += shaded(d, body, WD, WD_D, 10, -6, brush((140, 650), (170, 710), (230, 730), 7, WD_L))
    b += ell(256, 620, 148, 34, WD_D) + ell(256, 622, 126, 22, soup, 5)
    for (x, y, c, rx, ry) in bits:
        b += ell(x, y, rx, ry, c, 4)
    b += brush((190, 612), (240, 606), (290, 608), 4, soup_l)
    if steam:
        for x in (210, 290):
            b += f'<path d="M{x} 560 q-16 -24 0 -48 q16 -24 0 -48" fill="none" stroke="{BONE}" stroke-width="{sw(8)}" opacity=".85"/>'
    return d, b


def moonbroth():
    return bowl("#cfe3ea", "#f4fbff", [(214, 618, MOON, 18, 9), (280, 612, MOON_D, 16, 8), (312, 628, MLEAF, 12, 6), (244, 630, "#e8c26a", 9, 5)])


def gloomstew():
    return bowl("#6b4e8f", "#a98bd0", [(206, 616, GLM, 20, 10), (272, 610, GLM_L, 16, 8), (316, 626, MEAT_D, 14, 7), (240, 630, GLM_S, 8, 4)])


def gourdsoup():
    return bowl("#bfe4ea", "#ecfcff", [(210, 616, PALE_D, 16, 8), (276, 612, "#9fb6b0", 14, 7), (316, 628, MOON, 12, 6), (244, 630, "#e0813b", 9, 5)])


MEAT_D = "#b0585a"


def loaf():
    d = []; b = ""
    body = "M120 690 Q110 590 200 560 Q256 544 312 560 Q402 590 392 690 Q392 734 256 736 Q120 734 120 690 Z"
    b += shaded(d, body, "#c98a48", "#9c6432", 10, -10, brush((150, 640), (180, 590), (240, 572), 9, "#f0c27e"))
    for x in (190, 256, 322):
        b += line(f"M{x - 22} {618} Q{x} {596} {x + 22} {606}", 7, "#7a4a24")
    b += wheat_head(370, 600, 30, .7)
    return d, b


def bottle(liquid, liquid_l, cork=WD, big=False, star=False):
    d = []; b = ""
    s = 1.12 if big else 1.0
    bot = f"M{256 - 30 * s} {440 - (40 if big else 0)} L{256 + 30 * s} {440 - (40 if big else 0)} L{256 + 30 * s} 500 Q{256 + 124 * s} 540 {256 + 124 * s} 630 Q{256 + 124 * s} 740 256 740 Q{256 - 124 * s} 740 {256 - 124 * s} 630 Q{256 - 124 * s} 540 {256 - 30 * s} 500 Z"
    b += fill(bot, "#f3eef8", 8)
    liq = f"M{256 - 114 * s} 610 Q256 590 {256 + 114 * s} 610 Q{256 + 120 * s} 730 256 732 Q{256 - 120 * s} 730 {256 - 114 * s} 610 Z"
    b += fill(liq, liquid, 0, ' stroke="none"') + fill_ns(f"M{256 - 114 * s} 610 Q256 590 {256 + 114 * s} 610 Q{256 + 116 * s} 640 {256 + 104 * s} 660 Q256 630 {256 - 106 * s} 660 Q{256 - 116 * s} 640 {256 - 114 * s} 610 Z", liquid_l)
    b += fill(bot, "none", 8) + brush((170, 560), (160, 620), (176, 690), 9, "#ffffff", .8)
    top = 400 - (40 if big else 0)
    b += rrect(256 - 42 * s, top, 84 * s, 48, 10, cork, 7)
    if big:
        b += line(f"M{256 - 30 * s} {top + 70} L{256 + 30 * s} {top + 70}", 6, GOLD) + line(f"M{256 - 30 * s} {top + 86} L{256 + 30 * s} {top + 86}", 6, GOLD)
    if star:
        b += sparkle(256, 668, 2.4, "#fff4c6") + sparkle(350, 520, 1.3, "#fff4c6") + sparkle(160, 500, 1.0, "#fff4c6")
    for (x, y, r) in [(230, 660, 10), (290, 690, 7)]:
        b += f'<circle cx="{x}" cy="{y}" r="{r}" fill="{liquid_l}" stroke="none" opacity=".9"/>'
    return d, b


def tonic():
    d, b = bottle("#7a1830", "#b8344e", cork=STAKE_D)
    return d, b + apple(330, 690, 38) + broadleaf(250, 404, 30, .55, LEAF, LEAF_D)


def tea():
    d = []; b = ""
    cup = "M140 600 L372 600 Q366 720 256 728 Q146 720 140 600 Z"
    b += shaded(d, cup, "#e6eefc", "#a9bde0", 8, -6, brush((168, 630), (180, 680), (220, 708), 7, "#ffffff"))
    b += ell(256, 600, 116, 22, "#a9bde0") + ell(256, 602, 100, 15, "#d8c37a", 5)
    b += fill("M372 624 Q430 620 424 664 Q418 700 362 690", "none", 12) + line("M372 624 Q430 620 424 664 Q418 700 362 690", 6, "#e6eefc")
    b += star_flower(232, 598, .45)
    for x in (220, 290):
        b += f'<path d="M{x} 552 q-16 -24 0 -48 q16 -24 0 -48" fill="none" stroke="{BONE}" stroke-width="{sw(8)}" opacity=".85"/>'
    return d, b


def greaterelixir():
    return bottle("#d23b4a", "#ff8a7e", cork=GOLD_D, big=True, star=True)


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
    # Night crops and the rare night blooms.
    "crop-gloomcap": dict(frames=[gloomcap_0, gloomcap_1, gloomcap_2, gloomcap_3], cols=4, rows=1, target=(60, 360, 452, 744)),
    "crop-starlily": dict(frames=[starlily_0, starlily_1, starlily_2, starlily_3], cols=4, rows=1, target=(70, 200, 442, 744)),
    "crop-moonpetal": dict(frames=[moonpetal_0, moonpetal_1, moonpetal_2, moonpetal_3], cols=4, rows=1, target=(60, 200, 452, 744)),
    "crop-ghostgourd": dict(frames=[ghostgourd_0, ghostgourd_1, ghostgourd_2, ghostgourd_3], cols=4, rows=1, target=(40, 360, 472, 744)),
    "gloomcap": (gloomcap_item, ITEM), "gloomspore": (gloomspore, (150, 520, 362, 740)),
    "starlily": (starlily_item, ITEM), "lilybulb": (lilybulb, (150, 480, 362, 740)),
    "moonpetal": (moonpetal_item, ITEM), "petalseed": (petalseed, (150, 520, 362, 740)),
    "ghostgourd": (ghostgourd_item, ITEM), "gourdseed": (gourdseed, (150, 520, 362, 740)),
    # Cauldron and fire dishes, and the greater draught.
    "moonbroth": (moonbroth, ITEM), "gloomstew": (gloomstew, ITEM), "gourdsoup": (gourdsoup, ITEM),
    "loaf": (loaf, ITEM), "tonic": (tonic, ITEM), "tea": (tea, ITEM), "greaterelixir": (greaterelixir, ITEM),
}
ICONS = {k: SPRITES[k][0] for k in ("moonroot", "rootseed", "wheat", "wheatseed", "bloodapple", "appleseed",
                                    "gloomcap", "gloomspore", "starlily", "lilybulb", "moonpetal", "petalseed", "ghostgourd", "gourdseed",
                                    "moonbroth", "gloomstew", "gourdsoup", "loaf", "tonic", "tea", "greaterelixir")}
WIDE = {}
