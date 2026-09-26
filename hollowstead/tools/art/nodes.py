"""Gatherable world nodes: trees, rocks, ore, plants, graves."""
import math
from lib import *
import lib


def tree_pine():
    d = []; b = ""
    trunk = "M210 736 C236 704 246 664 232 622 C220 582 238 542 252 496 L272 496 C262 544 252 580 264 618 C280 662 282 706 308 736 Q260 746 210 736 Z"
    b += shaded(d, trunk, TRK, TRK_D, 6, 0)
    b += brush((262, 560), (256, 600), (270, 640), 7, TRK_L) + brush((276, 670), (282, 700), (292, 722), 6, TRK_L) + brush((238, 652), (244, 680), (236, 710), 5, TRK_D)
    def tier(x, y, w, h, col, dk, lt, sway):
        p = (f"M{x} {y} C{x + w * .25 + sway} {y + h * .25} {x + w * .7} {y + h * .55} {x + w * 1.12} {y + h * .62} "
             f"Q{x + w * 1.0} {y + h * .92} {x + w * .62} {y + h * .86} Q{x + w * .44} {y + h * 1.06} {x + w * .18} {y + h * .92} "
             f"Q{x - w * .02} {y + h * 1.12} {x - w * .24} {y + h * .92} Q{x - w * .48} {y + h * 1.04} {x - w * .66} {y + h * .84} "
             f"Q{x - w * 1.02} {y + h * .9} {x - w * 1.1} {y + h * .6} C{x - w * .7} {y + h * .55} {x - w * .25 + sway} {y + h * .25} {x} {y} Z")
        s = shaded(d, p, col, dk, 8, -10, brush((x + w * .1, y + h * .25), (x + w * .45, y + h * .45), (x + w * .85, y + h * .62), 9, lt))
        return s + brush((x - w * .55, y + h * .66), (x - w * .35, y + h * .7), (x - w * .15, y + h * .66), 6, dk)
    b += tier(262, 498, 158, 118, MAR, MAR_D, MAR_L, 6)
    b += tier(250, 430, 128, 104, ORG, ORG_D, ORG_L, -8)
    b += tier(262, 370, 98, 90, MAR, MAR_D, MAR_L, 6)
    b += tier(252, 318, 68, 74, ORG, ORG_D, ORG_L, -4)
    b += fill("M252 318 Q248 294 266 286 Q262 302 272 310", ORG, 6)
    return d, b


def tree_dead():
    d = []; b = ""
    limbs = [((256, 740), (262, 640), (250, 510), 64, 30),
             ((250, 600), (180, 580), (146, 496), 26, 6), ((146, 496), (128, 464), (152, 446), 7, 3),
             ((254, 550), (330, 540), (364, 456), 22, 6), ((364, 456), (378, 424), (352, 410), 7, 3),
             ((250, 514), (236, 430), (270, 356), 24, 5), ((270, 356), (284, 330), (262, 318), 6, 3),
             ((168, 540), (118, 546), (96, 512), 10, 3), ((340, 504), (396, 498), (414, 530), 10, 3),
             ((248, 460), (206, 430), (196, 392), 10, 3), ((222, 732), (196, 726), (176, 740), 16, 6), ((290, 732), (318, 726), (338, 742), 16, 6)]
    ds = [limb(*l) for l in limbs]
    b += union(ds, DT)
    b += brush((276, 720), (282, 640), (268, 550), 9, DT_L) + brush((356, 470), (344, 510), (300, 542), 6, DT_L) + brush((264, 380), (254, 430), (258, 490), 5, DT_L)
    b += brush((236, 700), (240, 660), (232, 630), 6, DT_D)
    b += fill("M226 610 Q236 594 248 608 Q238 620 226 610 Z", INK_D, 4)
    b += fill("M286 610 Q276 594 264 608 Q274 620 286 610 Z", INK_D, 4)
    b += fill("M236 646 Q256 632 276 646 Q268 670 256 672 Q244 670 236 646 Z", INK_D, 4)
    b += leaf(160, 456, 20, 1.2, MAR) + leaf(404, 546, -40, 1.2, ORG)
    return d, b


def rock_boulder():
    d = []; b = ""
    rk = blob(256, 640, 158, 96, 11, 0.10, 4)
    b += shaded(d, rk, RK, RK_D, -18, -16, brush((170, 592), (230, 560), (300, 566), 9, RK_L))
    b += line("M300 660 L312 682 L302 696 L312 712 M312 682 L330 686", 5)
    b += line("M180 670 L172 692 L186 712", 4)
    b += line("M236 588 L250 606 L244 620", 4)
    b += brush((140, 660), (146, 690), (170, 712), 7, RK_L, 0.8)
    b += fill(blob(410, 730, 26, 16, 7, 0.15, 9), RK, 6) + fill(blob(98, 734, 16, 10, 6, 0.15, 5), RK_D, 5)
    return d, b


def rock_rune():
    d = []; b = ""
    st = smooth([(190, 730), (176, 620), (184, 510), (212, 420), (262, 388), (312, 416), (334, 510), (338, 630), (326, 732), (256, 742)])
    b += shaded(d, st, RK, RK_D, -16, -10)
    rune = "M258 512 Q258 500 270 500 Q284 502 282 518 Q278 538 256 538 Q232 536 232 512 Q234 480 266 478 Q298 480 302 514 M256 570 L256 630 M256 594 L234 570 M256 594 L278 570"
    b += line(rune, 12) + line(rune, 5, CR)
    b += brush((214, 448), (226, 422), (256, 408), 8, RK_L) + brush((202, 540), (196, 600), (204, 670), 7, RK_L, 0.8)
    b += line("M312 660 L300 680 L310 700 M300 680 L286 684", 5)
    for (x, y, r, sd) in [(300, 452, 16, 1), (314, 476, 9, 2), (212, 690, 18, 3), (236, 710, 10, 4), (324, 580, 11, 5)]:
        b += fill_ns(blob(x, y, r, r * 0.75, 7, 0.25, sd), MOSS_L, 0.9)
    b += fill(blob(360, 726, 30, 18, 8, 0.15, 31), RK, 6) + fill(blob(150, 730, 18, 11, 7, 0.15, 32), RK_D, 5)
    return d, b


def crystal(x, y, w, h, rot):
    tip = h + w * 1.3
    return (f'<g transform="translate({x} {y}) rotate({rot})">'
            + fill_ns(f"M{-w} 0 L{-w} {-h} L0 {-tip} L0 20 Z", CR) + fill_ns(f"M0 20 L0 {-tip} L{w} {-h} L{w} 0 Z", CR_D)
            + line(f"M{-w} 20 L{-w} {-h} L0 {-tip} L{w} {-h} L{w} 20", 7) + line(f"M0 {-tip} L0 20", 4)
            + brush((-w * 0.5, -h * 0.1), (-w * 0.55, -h * 0.5), (-w * 0.3, -h * 0.95), 6, CR_L) + '</g>')


def ore():
    d = []; b = ""
    b += crystal(300, 610, 26, 120, 16) + crystal(210, 618, 20, 86, -24) + crystal(256, 600, 34, 170, 2) + crystal(350, 636, 14, 54, 38)
    rk = blob(256, 652, 150, 62, 10, 0.12, 21, flat=690)
    b += shaded(d, rk, RK, RK_D, -14, -14)
    b += brush((150, 636), (190, 612), (236, 614), 7, RK_L, 0.9) + line("M330 660 L344 676 L338 690", 5)
    b += sparkle(182, 476, 1.4, "#fff8e6") + sparkle(350, 448, 1.0, "#fff8e6") + sparkle(390, 550, 0.8, "#fff8e6")
    return d, b


STRAW = "#c9a86a"; STRAW_D = "#9c7e48"; STRAW_L = "#ecd49a"

def grass():
    d = []; b = ""
    blades = [((256, 740), (250, 620), (226, 520), 26), ((256, 740), (286, 630), (318, 548), 24), ((250, 740), (208, 660), (160, 610), 20),
              ((262, 740), (318, 680), (366, 640), 20), ((256, 740), (262, 600), (268, 480), 22), ((244, 740), (220, 680), (196, 580), 18),
              ((268, 740), (300, 690), (336, 600), 18)]
    ds = [ribbon(p0, c, p1, (lambda ww: (lambda t: ww * (1 - t) ** 0.9 + 1))(w)) for p0, c, p1, w in blades]
    cols = [STRAW, STRAW_D, STRAW, STRAW_D, STRAW, STRAW_D, STRAW]
    for dd in ds:
        b += f'<path d="{dd}" fill="{STRAW}" stroke-width="{sw(14)}"/>'
    for dd, c in zip(ds, cols):
        b += fill_ns(dd, c)
    b += brush((258, 700), (262, 600), (266, 500), 6, STRAW_L) + brush((282, 690), (296, 620), (312, 560), 5, STRAW_L) + brush((238, 700), (222, 640), (200, 596), 4, STRAW_L)
    # seed heads
    for (x, y, r) in [(226, 516, 0), (268, 476, 10), (318, 544, 30)]:
        b += ell(x, y - 10, 9, 22, STRAW_L, 5, r)
    return d, b


BUSH = "#5d7a5c"; BUSH_D = "#3f5747"; BUSH_L = "#86a67a"; BERRY = "#5b4a8a"; BERRY_L = "#a795db"

def bush():
    d = []; b = ""
    c = cloud(256, 630, 170, 110, 13, 12)
    b += shaded(d, c, BUSH, BUSH_D, -12, -18, fill_ns(cloud(216, 590, 70, 40, 8, 5), BUSH_L, 0.35))
    for p0, cc, p1 in [((170, 640), (190, 622), (214, 634)), ((276, 666), (300, 650), (324, 664)), ((300, 580), (320, 564), (344, 580)), ((200, 560), (220, 544), (242, 556))]:
        b += brush(p0, cc, p1, 6, BUSH_D)
    for (x, y) in [(190, 600), (212, 618), (200, 632), (318, 610), (338, 628), (320, 640), (262, 668), (282, 684), (246, 690), (360, 560), (150, 660)]:
        b += f'<circle cx="{x}" cy="{y}" r="15" fill="{BERRY}" stroke-width="{sw(5)}"/><circle cx="{x - 5}" cy="{y - 5}" r="4.5" fill="{BERRY_L}" stroke="none"/>'
    b += leaf(372, 690, 40, 1.6, BUSH_L) + leaf(140, 700, -30, 1.4, BUSH)
    return d, b


PK = "#e0813b"; PK_D = "#b8592b"; PK_L = "#f5a86a"; STEM = "#6b6a3a"

def pumpkin_body(d, cx=256, cy=620, s=1.0, face=False):
    b = ""
    L = lambda x: cx + (x - 256) * s
    Y = lambda y: cy + (y - 330) * s
    b += ell(L(180), Y(330), 92 * s, 104 * s, PK_D)
    b += ell(L(332), Y(330), 92 * s, 104 * s, PK_D)
    mid = f"M{f(L(256))} {f(Y(216))} C{f(L(318))} {f(Y(216))} {f(L(344))} {f(Y(280))} {f(L(344))} {f(Y(330))} C{f(L(344))} {f(Y(386))} {f(L(314))} {f(Y(444))} {f(L(256))} {f(Y(444))} C{f(L(198))} {f(Y(444))} {f(L(168))} {f(Y(386))} {f(L(168))} {f(Y(330))} C{f(L(168))} {f(Y(280))} {f(L(194))} {f(Y(216))} {f(L(256))} {f(Y(216))} Z"
    b += shaded(d, mid, PK, "#c96a2e", -10, -8)
    b += brush((L(290), Y(248)), (L(314), Y(270)), (L(318), Y(304)), 8, PK_L)
    b += brush((L(128), Y(290)), (L(122), Y(330)), (L(134), Y(364)), 7, "#e0813b")
    b += brush((L(384), Y(290)), (L(392), Y(330)), (L(380), Y(364)), 6, "#92452a")
    b += fill(f"M{f(L(246))} {f(Y(222))} Q{f(L(240))} {f(Y(186))} {f(L(256))} {f(Y(156))} L{f(L(280))} {f(Y(164))} Q{f(L(268))} {f(Y(192))} {f(L(272))} {f(Y(222))} Z", STEM, 7)
    return b

def pumpkin():
    d = []; b = ""
    b += line("M276 470 Q320 430 350 456 Q366 472 350 484", 6)
    b += pumpkin_body(d, 256, 632, 0.95)
    lf = "M150 520 Q170 470 214 482 Q206 520 150 520 Z"
    b += fill(lf, LEAF, 6) + line("M156 516 Q180 498 206 486", 3)
    return d, b


CAP = "#b99ad6"; CAP_D = "#8a6aad"; CAP_L = "#e2d4f4"

def mushroom():
    d = []; b = ""
    def shroom(x, base, h, r, tilt, big=True):
        s = ""
        stem = f"M{x - r * .22} {base} Q{x - r * .3} {base - h * .5} {x - r * .16 + tilt * .5} {base - h} L{x + r * .16 + tilt * .5} {base - h} Q{x + r * .3} {base - h * .5} {x + r * .22} {base} Z"
        s += fill(stem, BONE, 7) + brush((x - r * .05, base - 8), (x - r * .1, base - h * .5), (x + tilt * .4, base - h + 6), 5, BONE_D)
        cy = base - h
        cap = f"M{x - r + tilt} {cy + 8} Q{x - r + tilt} {cy - r * .95} {x + tilt} {cy - r * .95} Q{x + r + tilt} {cy - r * .95} {x + r + tilt} {cy + 8} Q{x + tilt} {cy + r * .28} {x - r + tilt} {cy + 8} Z"
        s += shaded(d, cap, CAP, CAP_D, -8, -8, brush((x - r * .55 + tilt, cy - r * .3), (x - r * .3 + tilt, cy - r * .75), (x + r * .15 + tilt, cy - r * .8), 7, CAP_L), 7)
        for (dx, dy, rr) in [(-.4, -.35, .12), (.15, -.6, .1), (.45, -.25, .09)]:
            s += f'<circle cx="{f(x + tilt + dx * r)}" cy="{f(cy + dy * r)}" r="{f(rr * r)}" fill="{CAP_L}" stroke="none"/>'
        return s
    b += shroom(330, 730, 70, 58, 10)
    b += shroom(220, 736, 120, 92, -8)
    b += shroom(150, 740, 44, 36, -6)
    b += fill(blob(260, 742, 150, 12, 9, 0.2, 3), MOSS_D, 5)
    return d, b


DIRT = "#6e4a3a"; DIRT_D = "#4f3428"; DIRT_L = "#946650"

def grave():
    d = []; b = ""
    stone = "M168 690 L176 430 Q182 330 262 322 Q342 330 350 430 L356 690 Z"
    b += '<g transform="rotate(-4 262 690)">' + shaded(d, stone, RK, RK_D, -16, -10, brush((196, 430), (206, 380), (246, 354), 9, RK_L) + brush((196, 480), (192, 560), (198, 640), 7, RK_L, .8)) + '</g>'
    b += '<g transform="rotate(-4 262 690)">' + line("M262 400 L262 520 M226 438 L298 438", 14) + line("M262 400 L262 520 M226 438 L298 438", 6, RK_D) + line("M318 560 L304 582 L314 600 M304 582 L290 588", 5) + '</g>'
    mound = "M110 742 Q130 660 260 652 Q390 660 408 742 Z"
    b += shaded(d, mound, DIRT, DIRT_D, -10, -12, brush((160, 700), (220, 668), (290, 668), 8, DIRT_L))
    for (x, y, r) in [(150, 700, -20), (372, 706, 20), (300, 668, 5)]:
        b += G(fill("M0 0 L-6 -26 L2 -8 L6 -34 L10 -8 L18 -24 L12 2 Z", MOSS, 4), x, y, r)
    b += fill_ns(blob(236, 700, 14, 8, 7, 0.3, 4), "#3a2a24", 0.8)
    return d, b


NODES = {
    "tree": (tree_pine, "tree"),
    "tree-dead": (tree_dead, "tree"),
    "rock": (rock_boulder, "rock"),
    "rock-rune": (rock_rune, (80, 300, 440, 744)),
    "ore": (ore, "ore"),
    "grass": (grass, "grass"),
    "bush": (bush, "bush"),
    "pumpkin": (pumpkin, "pumpkin"),
    "mushroom": (mushroom, "mushroom"),
    "grave": (grave, "grave"),
}
