"""Frontier art: frontier gear, the ten trinkets, night-only finds, the hand cart and moon icons.

    python3 tools/art/build.py --only key1,key2      (registered in build.py)

Same ink style as the rest of the theme: thick outline, flat fill, one soft shade, a brush
highlight, sparkles and a soft halo for anything that glows. Night-only nodes bake their glow
into the sprite (the renderers only add glow overlays to enemies).
"""
import math
from lib import *
import lib
from nodes import pumpkin_body, DIRT, DIRT_D, DIRT_L, STRAW, STRAW_D, STRAW_L
from structures import anim, IRON, IRON_D, IRON_L, LOG, LOG_E
from longnight import GLOW, GLOW_D, GLOW_L, MIRE, MIRE_D, MIRE_L, SILVER, SILVER_D, rot
from arsenal import ICE, ICE_D, ICE_L, FEATHER, FEATHER_L, star_shape, wisp_flame
from magic import BRONZE, BRONZE_D, BRONZE_L

WISP = "#aab6f2"; WISP_D = "#7682c8"; WISP_L = "#eef0ff"            # captured wisp essence
COLD_O = "#86aef0"; COLD_M = "#c4d8ff"; COLD_I = "#f5f9ff"          # cold wisp flame
GLASS = "#e6eefb"
LENS = "#e8f5a0"                                                    # sporemask filters
FUR = "#8c7d6e"; FUR_D = "#62554a"; FUR_L = "#b8aa98"
SLATE = "#4d5a66"; SLATE_D = "#36404b"; SLATE_L = "#6f7e8c"          # barrow cloak cloth
FANG = "#6e5890"; FANG_D = "#44335e"; FANG_L = "#b89ae8"
EMBER = "#f07a3a"; EMBER_D = "#b8442a"
WIRE = "#4a4456"; WIRE_L = "#8a8398"
SACK = "#cdb088"; SACK_D = "#a38860"; SACK_L = "#e8d4b0"
DUST = "#7d6f8c"; DUST_D = "#584c68"; DUST_L = "#a898b8"; DUST_P = "#b9abc9"
MOON = "#a8c8ff"; MOON_D = "#6f8fd0"; MOON_L = "#eef4ff"
BRIAR = "#4f6a3a"; BRIAR_D = "#34482a"; BRIAR_L = "#7f9a5a"; THORN_R = "#b8424a"
CREAM = "#fbefc8"; CREAM_D = "#e0c98e"
BLOOD = "#c8453c"; BLOOD_D = "#92282e"; BLOOD_L = "#f08a76"; CRIMSON = "#4e1822"


def cold_flame(cx, base, w, h, phase=0.0, seed=0):
    return flame(cx, base, w, h, phase, seed).replace(FL_O, COLD_O).replace(FL_M, COLD_M).replace(FL_I, COLD_I)


def eyes(cx, cy, s=1.0, gap=16):
    return (f'<ellipse cx="{f(cx - gap * s)}" cy="{f(cy)}" rx="{f(6 * s)}" ry="{f(9 * s)}" fill="{O}" stroke="none"/>'
            f'<ellipse cx="{f(cx + gap * s)}" cy="{f(cy)}" rx="{f(6 * s)}" ry="{f(9 * s)}" fill="{O}" stroke="none"/>')


def halo(cx, cy, r, col, op=.2, ry=None):
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r)}" ry="{f(ry or r)}" fill="{col}" stroke="none" opacity="{op:.2f}"/>'


def petal(x, y, ang, L, w, col, lw=7, hi=None):
    p = f"M0 0 Q{f(w)} {f(-L * .45)} {f(w * .32)} {f(-L * .9)} Q0 {f(-L * 1.04)} {f(-w * .32)} {f(-L * .9)} Q{f(-w)} {f(-L * .45)} 0 0 Z"
    body = fill(p, col, lw)
    if hi:
        body += brush((-w * .28, -L * .2), (-w * .42, -L * .5), (-w * .12, -L * .82), 6, hi)
    return f'<g transform="translate({f(x)} {f(y)}) rotate({f(ang)})">{body}</g>'


def cap(x, base, h, r, tilt, col=GLOW, dark=GLOW_D, light=GLOW_L, d=None, stem="#d9e8d8", spots=True):
    """A glowcap: pale stem and a domed luminous cap (same build as longnight.glowcap)."""
    s = ""
    st = f"M{f(x - r * .2)} {f(base)} Q{f(x - r * .32)} {f(base - h * .5)} {f(x - r * .14 + tilt * .5)} {f(base - h)} L{f(x + r * .14 + tilt * .5)} {f(base - h)} Q{f(x + r * .32)} {f(base - h * .5)} {f(x + r * .2)} {f(base)} Z"
    s += fill(st, stem, 7)
    cy = base - h
    c = f"M{f(x - r + tilt)} {f(cy + 10)} Q{f(x - r * .9 + tilt)} {f(cy - r * .9)} {f(x + tilt)} {f(cy - r)} Q{f(x + r * .9 + tilt)} {f(cy - r * .9)} {f(x + r + tilt)} {f(cy + 10)} Q{f(x + tilt)} {f(cy + r * .32)} {f(x - r + tilt)} {f(cy + 10)} Z"
    hl = brush((x - r * .6 + tilt, cy - r * .3), (x - r * .3 + tilt, cy - r * .8), (x + r * .2 + tilt, cy - r * .85), 7, light)
    s += shaded(d, c, col, dark, -8, -8, hl, 7) if d is not None else fill(c, col, 7) + hl
    if spots:
        for (dx, dy, rr) in [(-.45, -.35, .12), (.12, -.68, .1), (.45, -.25, .11)]:
            s += f'<circle cx="{f(x + tilt + dx * r)}" cy="{f(cy + dy * r)}" r="{f(rr * r)}" fill="{light}" stroke="none"/>'
    return s


def crescent(cx, cy, r, ox, oy, r2, n=36):
    """Closed crescent: the part of circle (cx,cy,r) outside circle (cx+ox, cy+oy, r2)."""
    x2, y2 = cx + ox, cy + oy
    dd = math.hypot(ox, oy)
    a = (r * r - r2 * r2 + dd * dd) / (2 * dd); h = math.sqrt(max(0, r * r - a * a))
    px, py = cx + a * ox / dd, cy + a * oy / dd
    i1 = (px + h * oy / dd, py - h * ox / dd); i2 = (px - h * oy / dd, py + h * ox / dd)
    t1 = math.atan2(i1[1] - cy, i1[0] - cx); t2 = math.atan2(i2[1] - cy, i2[0] - cx)
    away = math.atan2(-oy, -ox)
    def arc(c0, c1, rr, a0, a1, through):
        # sweep from a0 to a1 going the way that passes `through`
        span = (a1 - a0) % (2 * math.pi)
        mid = a0 + span / 2
        if math.cos(mid - through) < 0:
            span -= 2 * math.pi
        return [(c0 + rr * math.cos(a0 + span * i / n), c1 + rr * math.sin(a0 + span * i / n)) for i in range(n + 1)]
    outer = arc(cx, cy, r, t1, t2, away)
    u1 = math.atan2(i2[1] - y2, i2[0] - x2); u2 = math.atan2(i1[1] - y2, i1[0] - x2)
    inner = arc(x2, y2, r2, u1, u2, away)
    pts = outer + inner[1:-1]
    return "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + " Z"


def bone_piece(x, y, rot, s=1.0, col=BONE):
    g = union([limb((-50, 0), (0, -4), (50, 0), 16, 16)], col, 12)
    for ex in (-50, 50):
        g += f'<circle cx="{ex}" cy="-9" r="12" fill="{col}" stroke-width="{sw(6)}"/><circle cx="{ex}" cy="9" r="12" fill="{col}" stroke-width="{sw(6)}"/>'
    g += f'<rect x="-50" y="-8" width="100" height="16" fill="{col}" stroke="none"/>'
    g += brush((-36, -4), (0, -8), (36, -4), 4, "#ffffff", .7)
    return G(g, x, y, rot, s)


def cord_loop(x, y, w, h, col=TRK_L):
    p = f"M{f(x - w)} {f(y)} Q{f(x - w)} {f(y - h)} {f(x)} {f(y - h)} Q{f(x + w)} {f(y - h)} {f(x + w)} {f(y)}"
    return line(p, 16) + line(p, 7, col)


# ------------------------------------------------------------------ night finds (items)
def glowbloom():
    d = []; b = ""
    b += halo(256, 540, 175, GLOW, .16) + halo(256, 520, 104, GLOW_L, .2)
    b += union([limb((256, 742), (242, 672), (256, 588), 30, 22)], "#d9e8d8") + brush((250, 722), (240, 672), (252, 612), 6, "#a9c2ae")
    b += leaf(200, 690, -58, 4.4, LEAF) + leaf(310, 664, 56, 3.8, LEAF_L)
    for ang, L in ((-36, 150), (0, 168), (36, 150)):
        b += petal(256, 592, ang, L, 60, GLOW_D, 7)
    b += f'<circle cx="256" cy="512" r="46" fill="{GLOW_L}" stroke-width="{sw(6)}"/>'
    b += f'<circle cx="244" cy="500" r="12" fill="#ffffff" stroke="none"/>'
    for ang, L in ((-68, 150), (68, 150)):
        b += petal(256, 592, ang, L, 64, GLOW, 7, GLOW_L)
    for ang, L in ((-24, 104), (24, 104)):
        b += petal(256, 594, ang, L, 58, GLOW, 7, GLOW_L)
    for (x, y, r) in [(160, 520, 9), (352, 520, 9), (222, 540, 7), (292, 544, 7)]:
        b += f'<circle cx="{x}" cy="{y}" r="{r}" fill="{GLOW_L}" stroke="none"/>'
    b += sparkle(256, 408, 1.3, GLOW_L) + sparkle(356, 440, 1.0, GLOW_L) + sparkle(150, 450, .8, GLOW_L)
    return d, b


def wispdust():
    d = []; b = ""
    b += halo(256, 620, 150, WISP, .16)
    body = "M184 500 L184 656 Q184 742 256 742 Q328 742 328 656 L328 500 Z"
    inner = fill_ns("M184 596 Q220 572 256 594 Q292 616 328 590 L328 742 L184 742 Z", WISP, .55)
    inner += fill_ns("M184 660 Q230 636 270 662 Q300 680 328 664 L328 742 L184 742 Z", WISP_D, .35)
    b += fill(body, GLASS, 8) + clipped(d, body, inner)
    b += wisp_flame(256, 640, .95, WISP, WISP_L)
    b += fill(body, "none", 8) + brush((204, 530), (198, 620), (210, 700), 9, "#ffffff", .85)
    b += rrect(196, 470, 120, 38, 14, GLASS, 7)
    b += rrect(212, 404, 88, 72, 14, WD, 7) + brush((226, 420), (224, 440), (228, 462), 6, WD_L) + line("M218 440 L294 440", 4, WD_D)
    b += line("M316 488 Q350 500 356 540", 5) + G(rrect(-24, 0, 48, 58, 8, CLOTH, 6) + f'<circle cx="0" cy="12" r="6" fill="{CLOTH_D}" stroke-width="{sw(3)}"/>', 358, 534, -14)
    b += sparkle(150, 470, 1.2, WISP_L) + sparkle(370, 640, 1.0, WISP_L) + sparkle(320, 420, .8, WISP_L)
    return d, f'<g transform="rotate(-8 256 620)">{b}</g>'


# ------------------------------------------------------------------ frontier gear
def sporemask():
    """Three-quarter view, facing right: a dome woven from glowcap caps, two glowing
    lens-filters and a long leather plague-doctor beak."""
    d = []; b = ""
    dome = "M150 580 Q134 452 240 428 Q338 408 372 480 L382 548 Q384 612 334 636 L206 650 Q156 636 150 580 Z"
    scales = ""
    for row, (y, xs) in enumerate([(462, (190, 250, 310)), (516, (160, 220, 280, 340)), (572, (176, 236, 296, 356)), (628, (200, 262, 324))]):
        for i, x in enumerate(xs):
            r = 36
            c = f"M{x - r} {y + 8} Q{x - r * .9} {y - r * .9} {x} {y - r} Q{x + r * .9} {y - r * .9} {x + r} {y + 8} Q{x} {y + r * .3} {x - r} {y + 8} Z"
            scales += fill(c, GLOW if (i + row) % 2 else "#9aead9", 5) + f'<circle cx="{f(x - 10)}" cy="{f(y - 16)}" r="6" fill="{GLOW_L}" stroke="none"/>'
    b += shaded(d, dome, GLOW, GLOW_D, 12, -8, scales)
    strap = "M204 440 Q168 540 204 646"
    b += line(strap, 24) + line(strap, 11, WD_D) + rrect(172, 528, 30, 30, 6, BRONZE, 6)
    b += cap(214, 444, 26, 38, -14, d=d) + cap(318, 428, 22, 34, 12, d=d) + cap(266, 424, 42, 50, 0, d=d)
    beak = "M318 520 Q440 516 504 728 Q424 652 326 630 Z"
    b += shaded(d, beak, WD, WD_D, 0, -16, brush((352, 540), (436, 556), (484, 670), 7, WD_L))
    for t in (.26, .52):
        x0, y0 = 318 + 186 * t * .92, 520 + 208 * t * .7
        band = f"M{f(x0 - 6)} {f(y0 - 8)} Q{f(x0 + 24)} {f(y0 + 46)} {f(x0 - 18)} {f(y0 + 100 - t * 80)}"
        b += line(band, 18) + line(band, 9, BRONZE)
    b += f'<circle cx="470" cy="672" r="6" fill="{O}" stroke="none"/><circle cx="452" cy="648" r="6" fill="{O}" stroke="none"/>'
    for (x, y, r) in ((352, 482, 26), (280, 490, 40)):
        b += f'<circle cx="{x}" cy="{y}" r="{r}" fill="{BRONZE}" stroke-width="{sw(8)}"/>'
        b += f'<circle cx="{x}" cy="{y}" r="{r * .66:.1f}" fill="{LENS}" stroke-width="{sw(6)}"/>'
        b += brush((x - r * .4, y + r * .2), (x - r * .4, y - r * .3), (x - r * .05, y - r * .5), 6, "#ffffff", .95)
    b += sparkle(120, 450, 1.1, GLOW_L) + sparkle(402, 430, 1.1, LENS)
    return d, b


def gravelight():
    d = []; b = ""
    b += halo(256, 520, 170, "#b8ceff", .16) + halo(256, 520, 110, COLD_M, .2)
    b += f'<circle cx="256" cy="294" r="40" fill="none" stroke-width="{sw(26)}"/><circle cx="256" cy="294" r="40" fill="none" stroke="{IRON_L}" stroke-width="{sw(11)}"/>'
    b += rrect(240, 324, 32, 30, 6, IRON, 6)
    roof = "M156 408 L256 340 L356 408 Z"
    b += shaded(d, roof, IRON, IRON_D, 0, 10, brush((196, 392), (230, 366), (256, 352), 6, IRON_L))
    b += rrect(146, 400, 220, 28, 10, IRON_D, 8)
    glass = "M172 428 L340 428 L332 606 L180 606 Z"
    b += fill(glass, GLASS, 8)
    b += halo(256, 540, 70, COLD_M, .5)
    b += cold_flame(256, 592, 118, 158, .3, 4)
    b += eyes(256, 560, 1.7, 14)
    for x0, x1 in ((214, 216), (298, 296)):
        bar = f"M{x0} 430 L{x1} 604"
        b += line(bar, 16) + line(bar, 7, IRON_L)
    b += line("M176 516 L336 516", 14) + line("M176 516 L336 516", 6, IRON_L)
    b += fill(glass, "none", 8) + brush((188, 446), (186, 500), (192, 590), 7, "#ffffff", .7)
    for x in (172, 340):
        b += line(f"M{x} 426 L{x - 2 if x > 256 else x + 2} 606", 26) + line(f"M{x} 426 L{x - 2 if x > 256 else x + 2} 606", 12, IRON)
    b += rrect(150, 602, 212, 30, 10, IRON_D, 8)
    foot = "M170 630 L342 630 L366 690 L146 690 Z"
    b += shaded(d, foot, IRON, IRON_D, 0, -8, brush((180, 648), (256, 642), (330, 648), 6, IRON_L))
    for x in (176, 222, 290, 336):
        b += f'<circle cx="{x}" cy="662" r="7" fill="{IRON_L}" stroke-width="{sw(3)}"/>'
    b += ell(256, 660, 20, 17, BONE, 5) + f'<circle cx="249" cy="660" r="4" fill="{O}" stroke="none"/><circle cx="263" cy="660" r="4" fill="{O}" stroke="none"/>'
    b += sparkle(120, 440, 1.3, COLD_I) + sparkle(394, 380, 1.0, COLD_I) + sparkle(390, 560, .8, COLD_M)
    return d, b


def barrowcloak():
    d = []; b = ""
    left = "M250 486 L190 480 Q140 596 108 716 L140 700 L162 732 L194 708 L222 740 L250 716 Z"
    right = "M262 486 L322 480 Q372 596 404 716 L372 700 L350 732 L318 708 L290 740 L262 716 Z"
    b += fill("M232 500 L280 500 L276 716 L236 716 Z", SLATE_D, 6)
    b += shaded(d, left, SLATE, SLATE_D, 14, 0, brush((176, 560), (150, 630), (132, 690), 8, SLATE_L))
    b += shaded(d, right, SLATE, SLATE_D, 14, 0)
    b += line("M216 560 L196 700 M300 560 L318 700", 5, SLATE_D)
    fur = cloud(256, 482, 166, 60, 20, 7, .55)
    b += shaded(d, fur, FUR, FUR_D, 0, -12)
    for (x, y, a) in [(136, 480, -30), (176, 456, -16), (220, 446, -6), (292, 446, 6), (336, 456, 16), (376, 480, 30), (196, 500, -10), (316, 500, 10), (256, 460, 0)]:
        k = math.sin(math.radians(a))
        b += brush((x - 8 * k - 5, y + 16), (x, y), (x + 10 * k, y - 20), 7, FUR_L)
        b += brush((x + 20 - 6 * k, y + 22), (x + 22, y + 8), (x + 26 + 8 * k, y - 8), 5, FUR_D)
    for (x, r) in ((150, 12), (362, -12), (192, 6), (320, -6)):
        b += G(fill("M-10 0 L0 40 L10 0 Z", BONE, 5), x, 512 + abs(r), r)
    b += line("M222 532 L290 532", 12) + line("M222 532 L290 532", 5, TRK_L)
    b += bone_piece(214, 532, 8, .5) + bone_piece(298, 532, -8, .5)
    return d, b


# ------------------------------------------------------------------ trinkets
def frostanklet():
    d = []; b = ""
    b += halo(256, 600, 140, ICE, .12)
    ring = "M256 560 m-132 0 a132 60 0 1 0 264 0 a132 60 0 1 0 -264 0"
    b += f'<path d="{ring}" fill="none" stroke-width="{sw(46)}"/><path d="{ring}" fill="none" stroke="{ICE}" stroke-width="{sw(30)}"/>'
    b += f'<path d="M150 540 Q256 488 362 540" fill="none" stroke="{ICE_L}" stroke-width="{sw(8)}"/>'
    b += f'<path d="M160 596 Q256 636 352 596" fill="none" stroke="{ICE_D}" stroke-width="{sw(6)}"/>'
    for (x, y, h, r) in [(170, 604, 70, 16), (212, 618, 100, 6), (300, 618, 96, -6), (342, 604, 66, -16)]:
        ice = f"M-18 0 L18 0 L0 {h} Z"
        b += G(fill(ice, ICE_L, 6) + fill_ns(f"M0 0 L18 0 L0 {h} Z", ICE) + fill(ice, "none", 6), x, y, r)
    for (x, y, h, r) in [(150, 520, 46, -40), (362, 520, 46, 40)]:
        c = f"M0 6 L-14 -{h * .4} L0 -{h} L14 -{h * .4} Z"
        b += G(fill(c, ICE_L, 5) + fill_ns(f"M0 6 L0 -{h} L14 -{h * .4} Z", ICE) + fill(c, "none", 5), x, y, r)
    b += line("M256 624 L256 660", 8)
    b += fill(star_shape(256, 690, 40, 6, .45), ICE_L, 6) + f'<circle cx="256" cy="690" r="11" fill="{ICE_D}" stroke="none"/>'
    b += sparkle(398, 470, 1.2, "#ffffff") + sparkle(118, 600, .9, "#ffffff")
    return d, b


def nightfang():
    d = []; b = ""
    b += halo(256, 610, 110, FANG_L, .12, 160)
    b += cord_loop(256, 470, 56, 72)
    fang = "M200 496 Q312 478 314 506 Q314 616 270 696 Q244 740 218 752 Q234 690 226 620 Q220 560 200 496 Z"
    b += shaded(d, fang, FANG, FANG_D, 18, 0, brush((230, 520), (248, 612), (238, 704), 10, FANG_L))
    b += brush((292, 520), (294, 584), (276, 648), 6, "#8a70b8", .9)
    b += rrect(192, 468, 128, 40, 12, SILVER, 7) + line("M200 488 L312 488", 3, SILVER_D)
    b += sparkle(248, 574, 1.9, "#f4ecff") + sparkle(344, 430, 1.1, FANG_L) + sparkle(168, 660, .9, FANG_L)
    return d, b


def emberheart():
    d = []; b = ""
    b += halo(256, 600, 160, FL_M, .2)
    ember = blob(256, 616, 84, 76, 9, .12, 4)
    b += fill(ember, EMBER, 7) + fill_ns(blob(250, 606, 56, 48, 8, .15, 5), FL_M) + fill_ns(blob(246, 598, 28, 22, 7, .2, 6), FL_I)
    b += G(flame(0, 0, 76, 110, .3, 2), 256, 566)
    heart = "M256 736 Q128 650 138 544 Q148 470 218 474 Q246 478 256 512 Q266 478 294 474 Q364 470 374 544 Q384 650 256 736 Z"
    b += f'<path d="{heart}" fill="none" stroke-width="{sw(24)}"/><path d="{heart}" fill="none" stroke="{WIRE_L}" stroke-width="{sw(10)}"/>'
    for wire in ("M256 512 Q244 620 256 736", "M146 590 Q256 630 366 590"):
        b += f'<path d="{wire}" fill="none" stroke-width="{sw(14)}"/><path d="{wire}" fill="none" stroke="{WIRE}" stroke-width="{sw(5)}"/>'
    b += brush((160, 560), (164, 510), (204, 488), 5, "#e0dae8")
    b += f'<circle cx="256" cy="480" r="20" fill="none" stroke-width="{sw(18)}"/><circle cx="256" cy="480" r="20" fill="none" stroke="{WIRE_L}" stroke-width="{sw(7)}"/>'
    b += sparkle(384, 470, 1.2, FL_I) + sparkle(126, 680, .9, FL_I)
    return d, b


def crowseye():
    d = []; b = ""
    def feather(x, y, rot, s, col=FEATHER, dark="#2a2334"):
        g = (fill("M0 20 Q-70 -60 -40 -190 Q-16 -262 10 -300 Q70 -210 62 -110 Q54 -20 0 20 Z", col, 8)
             + fill_ns("M0 20 Q40 -60 30 -170 Q22 -250 10 -300 Q70 -210 62 -110 Q54 -20 0 20 Z", dark)
             + line("M0 10 Q4 -140 8 -290", 5, "#8a7cb0")
             + line("M-40 -90 L2 -60 M-46 -150 L4 -120 M-30 -214 L6 -186 M50 -120 L8 -94 M50 -184 L10 -160", 4, FEATHER_L)
             + brush((-38, -40), (-50, -140), (-18, -236), 8, "#7d70a0"))
        return G(g, x, y, rot, s)
    b += feather(214, 660, -8, .78, "#4a4058", "#322a40") + feather(222, 664, 38, 1.0)
    b += cord_loop(196, 610, 30, 46)
    b += halo(196, 646, 92, GOLD_L, .2)
    b += f'<circle cx="196" cy="646" r="70" fill="{GOLD}" stroke-width="{sw(9)}"/>'
    b += brush((144, 656), (146, 606), (192, 588), 7, GOLD_L)
    b += f'<circle cx="196" cy="646" r="46" fill="{GOLD_D}" stroke-width="{sw(6)}"/>'
    b += f'<circle cx="196" cy="646" r="33" fill="#f6c35a" stroke="none"/>'
    b += fill("M196 608 Q212 646 196 684 Q180 646 196 608 Z", INK_D, 0, ' stroke="none"')
    b += f'<circle cx="181" cy="628" r="9" fill="#ffffff" stroke="none"/>'
    b += sparkle(118, 570, 1.4, "#fff6d8") + sparkle(280, 720, 1.0, GOLD_L)
    return d, b


def harvestcharm():
    d = []; b = ""
    b += leaf(170, 610, -60, 4.0, LEAF) + leaf(344, 606, 60, 3.6, LEAF_L)
    for ang in (-28, 0, 28):
        a = math.radians(ang)
        tip = (256 + math.sin(a) * 190, 680 - math.cos(a) * 190)
        stalk = f"M256 680 Q{f(256 + math.sin(a) * 80)} {f(680 - math.cos(a) * 100)} {f(tip[0])} {f(tip[1])}"
        b += line(stalk, 20) + line(stalk, 9, STRAW_D)
        g = ""
        for k in range(4):
            y = -k * 28
            g += ell(-15, y, 16, 24, GOLD, 5, -24) + ell(15, y - 12, 16, 24, GOLD, 5, 24)
        g += ell(0, -116, 13, 22, GOLD_L, 5) + brush((-20, 0), (-24, -50), (-16, -96), 5, GOLD_L)
        b += G(g, tip[0], tip[1] + 36, ang)
    b += line("M222 636 Q256 652 290 636", 34) + line("M222 636 Q256 652 290 636", 20, MAR)
    b += pumpkin_body(d, 256, 700, .58)
    b += sparkle(380, 470, 1.2, GOLD_L) + sparkle(130, 500, .9, GOLD_L)
    return d, b


def boneward():
    d = []; b = ""
    shield = "M256 736 Q164 690 150 590 L150 500 Q200 478 256 466 Q312 478 362 500 L362 590 Q348 690 256 736 Z"
    b += cord_loop(256, 470, 40, 56)
    b += shaded(d, shield, BONE, BONE_D, 14, -6, brush((170, 520), (168, 600), (190, 670), 8, "#ffffff", .9))
    inner = "M256 706 Q186 668 176 590 L176 520 Q214 504 256 494 Q298 504 336 520 L336 590 Q326 668 256 706 Z"
    b += f'<path d="{inner}" fill="none" stroke="{BONE_D}" stroke-width="{sw(6)}"/>'
    rune = "M256 530 L256 670 M214 566 L256 600 L298 566 M226 636 L286 636"
    b += line(rune, 12, BONE_D) + line(rune, 4, "#a8966c")
    b += f'<circle cx="256" cy="482" r="12" fill="{BONE_D}" stroke-width="{sw(5)}"/>'
    b += line("M322 640 L306 660 L316 676", 4)
    b += sparkle(380, 520, 1.1, "#ffffff") + sparkle(136, 680, .8, "#ffffff")
    return d, b


def wispfeather():
    d = []; b = ""
    b += halo(256, 590, 150, GLOW, .1)
    for (p0, c, p1, w) in [((236, 720), (120, 660), (150, 520), 18), ((300, 420), (390, 440), (390, 560), 16), ((170, 520), (140, 440), (200, 410), 10)]:
        b += brush(p0, c, p1, w, GLOW, .7) + brush(p0, c, p1, w * .4, GLOW_L, .95)
    for (x, y, r) in [(150, 516, 13), (392, 562, 11), (202, 410, 8)]:
        b += f'<circle cx="{x}" cy="{y}" r="{r}" fill="{GLOW_L}" stroke-width="{sw(4)}"/>'
    vane = G(fill("M0 30 Q-66 -40 -40 -170 Q-20 -250 20 -300 Q60 -200 52 -100 Q44 0 0 30 Z", "#e8fbf6", 8)
             + fill_ns("M0 30 Q30 -40 30 -150 Q26 -240 20 -300 Q60 -200 52 -100 Q44 0 0 30 Z", "#a9dcd2")
             + line("M0 60 Q6 -120 18 -290", 5, "#7fbfb2")
             + line("M-44 -60 L2 -20 M-50 -130 L6 -90 M-34 -200 L10 -170 M44 -80 L8 -50 M46 -160 L12 -130", 4, "#a9dcd2")
             + brush((-34, -30), (-46, -120), (-18, -220), 7, "#ffffff"), 262, 690, -14)
    b += vane
    b += line("M250 752 L262 700", 10) + line("M250 752 L262 700", 5, "#7fbfb2")
    b += sparkle(390, 440, 1.3, GLOW_L) + sparkle(120, 600, 1.0, GLOW_L) + sparkle(340, 700, .8, "#ffffff")
    return d, b


def gravedust():
    d = []; b = ""
    b += fill_ns(blob(360, 716, 70, 26, 9, .2, 3), DUST_P, .75)
    for (x, y, r) in [(330, 690, 10), (360, 668, 7), (392, 700, 8), (410, 676, 5), (300, 724, 6)]:
        b += f'<circle cx="{x}" cy="{y}" r="{r}" fill="{DUST_L}" stroke-width="{sw(3)}"/>'
    pouch = "M206 540 Q140 590 146 660 Q156 742 256 744 Q356 742 366 660 Q372 590 306 540 Z"
    b += shaded(d, pouch, DUST, DUST_D, 14, -8, brush((172, 610), (170, 670), (206, 716), 8, DUST_L))
    ruff = "M194 470 Q220 500 214 540 L298 540 Q292 500 318 470 Q290 490 274 474 Q262 494 256 470 Q248 494 236 474 Q222 490 194 470 Z"
    b += fill(ruff, DUST, 7) + fill_ns("M256 474 Q262 494 274 478 Q286 494 300 486 Q296 510 298 536 L262 536 Z", DUST_D, .6)
    b += line("M196 540 Q256 560 316 540", 22) + line("M196 540 Q256 560 316 540", 10, TRK_L)
    b += line("M300 548 Q330 580 316 610 M300 548 Q340 560 350 590", 10) + line("M300 548 Q330 580 316 610 M300 548 Q340 560 350 590", 4, TRK_L)
    b += ell(252, 640, 30, 26, BONE, 6) + rrect(236, 654, 32, 20, 6, BONE, 5)
    b += f'<circle cx="241" cy="638" r="7" fill="{O}" stroke="none"/><circle cx="263" cy="638" r="7" fill="{O}" stroke="none"/>'
    b += fill_ns(blob(280, 430, 56, 30, 8, .25, 8), DUST_P, .7) + fill_ns(blob(236, 400, 34, 20, 7, .3, 9), DUST_P, .5)
    b += sparkle(330, 400, 1.0, DUST_P) + sparkle(160, 470, .8, DUST_L)
    return d, b


def moonlocket():
    d = []; b = ""
    b += halo(256, 610, 150, MOON, .14)
    for i in range(9):
        t = i / 8; x = 256 + math.cos(math.pi * t) * 54; y = 470 - math.sin(math.pi * t) * 58
        b += f'<circle cx="{f(x)}" cy="{f(y)}" r="9" fill="{SILVER}" stroke-width="{sw(4)}"/>'
    b += rrect(240, 468, 32, 40, 10, SILVER, 6)
    cres = crescent(256, 620, 126, -52, -34, 104)
    b += shaded(d, cres, SILVER, SILVER_D, 12, -10, brush((330, 540), (380, 610), (340, 690), 8, "#ffffff"))
    b += gem(300, 680, 22, MOON, MOON_D, MOON_L)
    b += line("M160 700 Q196 726 248 734", 4, SILVER_D)
    b += sparkle(180, 560, 1.5, MOON_L) + sparkle(400, 470, 1.0, MOON_L) + sparkle(136, 640, .8, MOON_L)
    return d, b


def thornknot():
    d = []; b = ""
    pts = []
    for i in range(121):
        t = 2 * math.pi * i / 120
        x = math.sin(t) + 2 * math.sin(2 * t); y = math.cos(t) - 2 * math.cos(2 * t)
        pts.append((256 + x * 62, 600 + y * 62))
    path = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + " Z"
    b += f'<path d="{path}" fill="none" stroke-width="{sw(46)}"/><path d="{path}" fill="none" stroke="{BRIAR}" stroke-width="{sw(30)}"/>'
    b += f'<path d="{path}" fill="none" stroke="{BRIAR_L}" stroke-width="{sw(6)}" stroke-dasharray="30 90" opacity=".9"/>'
    for i in range(0, 120, 8):
        x0, y0 = pts[i]; x1, y1 = pts[i + 1]
        tx, ty = x1 - x0, y1 - y0; L = math.hypot(tx, ty) or 1
        nx, ny = -ty / L, tx / L
        s = 1 if (i // 8) % 2 else -1
        bx, by = x0 + nx * s * 12, y0 + ny * s * 12
        tip = (x0 + nx * s * 40 + tx / L * 8, y0 + ny * s * 40 + ty / L * 8)
        b += fill(f"M{f(bx - tx / L * 10)} {f(by - ty / L * 10)} L{f(tip[0])} {f(tip[1])} L{f(bx + tx / L * 10)} {f(by + ty / L * 10)} Z", THORN_R, 5)
    b += leaf(180, 700, 40, 3.2, BRIAR_L) + leaf(330, 470, -30, 2.8, BRIAR)
    b += f'<circle cx="256" cy="602" r="24" fill="{RD}" stroke-width="{sw(6)}"/><circle cx="248" cy="594" r="7" fill="#f6a39a" stroke="none"/>'
    b += sparkle(380, 700, .9, "#ffd1c8")
    return d, b


# ------------------------------------------------------------------ night-only nodes (4-frame loops)
def glowsprout(phase):
    d = []; b = ""
    tau = 2 * math.pi * phase; pulse = .5 + .5 * math.sin(tau)
    b += halo(256, 620, 200 + 14 * pulse, GLOW, .18 + .12 * pulse, 130 + 10 * pulse)
    b += halo(256, 640, 124, GLOW_L, .16 + .12 * pulse, 82)
    b += fill(blob(256, 734, 150, 20, 9, .2, 5), MIRE_D, 5)
    bob = lambda k: 4 * math.sin(tau + k)
    b += cap(330, 732, 70, 50, 10, "#b0f6e8", GLOW_D, "#ffffff", d)
    b += cap(186, 736, 112, 62, -8, "#b0f6e8", GLOW_D, "#ffffff", d)
    for (x, base, h, rx, ry, k) in [(262, 736, 52, 30, 40, 0), (378, 736, 26, 20, 26, 1.5), (128, 738, 30, 22, 28, 3)]:
        st = f"M{x - 8} {base} Q{x - 10} {base - h * .5} {x - 5} {base - h} L{x + 5} {base - h} Q{x + 10} {base - h * .5} {x + 8} {base} Z"
        b += fill(st, "#d9e8d8", 6)
        cy = base - h - ry * .6 + bob(k)
        bud = f"M{x} {f(cy - ry)} Q{x + rx * 1.1} {f(cy - ry * .4)} {x + rx * .9} {f(cy + ry * .5)} Q{x} {f(cy + ry * .8)} {x - rx * .9} {f(cy + ry * .5)} Q{x - rx * 1.1} {f(cy - ry * .4)} {x} {f(cy - ry)} Z"
        b += shaded(d, bud, "#d2fbf2", GLOW_D, -6, -6, brush((x - rx * .5, cy + ry * .2), (x - rx * .5, cy - ry * .4), (x, cy - ry * .8), 5, "#ffffff"), 6)
    b += halo(186, 620, 50, "#ffffff", .08 + .12 * pulse, 30) + halo(330, 660, 36, "#ffffff", .08 + .12 * (1 - pulse), 22)
    for i in range(4):
        t = (phase + i * .25) % 1
        x = 150 + i * 70 + 14 * math.sin(t * 6 + i)
        b += f'<circle cx="{f(x)}" cy="{f(600 - t * 200)}" r="{f(7 * (1 - t) + 2)}" fill="{GLOW_L}" stroke="none" opacity="{1 - t:.2f}"/>'
    b += sparkle(300, 470 - 20 * pulse, .9 + .3 * pulse, GLOW_L) + sparkle(160, 520, .6 + .4 * (1 - pulse), GLOW_L)
    for (x, y) in [(110, 736), (400, 734)]:
        b += G(fill("M0 0 L-6 -26 L2 -8 L6 -34 L10 -8 L18 -24 L12 2 Z", MIRE, 4), x, y)
    return d, b


def wisp_body(cx, cy, s, phase):
    """A cold wisp: a teardrop flame with a swaying tip, a bright core and two dark eyes."""
    sway = math.sin(2 * math.pi * phase) * 16 * s; sq = 1 + .05 * math.sin(4 * math.pi * phase)
    def shape(k):
        return (f"M{f(cx + sway * k)} {f(cy - 96 * s * k * sq)} Q{f(cx + 50 * s * k)} {f(cy - 40 * s * k)} {f(cx + 46 * s * k)} {f(cy + 12 * s * k)} "
                f"Q{f(cx + 36 * s * k)} {f(cy + 56 * s * k)} {f(cx)} {f(cy + 58 * s * k)} Q{f(cx - 36 * s * k)} {f(cy + 56 * s * k)} {f(cx - 46 * s * k)} {f(cy + 12 * s * k)} "
                f"Q{f(cx - 50 * s * k)} {f(cy - 30 * s * k)} {f(cx - 14 * s * k + sway * .4)} {f(cy - 52 * s * k)} Q{f(cx - 6 * s * k + sway * .6)} {f(cy - 74 * s * k)} {f(cx + sway * k)} {f(cy - 96 * s * k * sq)} Z")
    return (fill(shape(1), COLD_O, 8) + fill(shape(.72), COLD_M, 5) + f'<ellipse cx="{f(cx)}" cy="{f(cy + 18 * s)}" rx="{f(26 * s)}" ry="{f(30 * s)}" fill="{COLD_I}" stroke="none"/>'
            + eyes(cx, cy + 12 * s, 1.5 * s, 13 * s))


def gravewisp(phase):
    d = []; b = ""
    tau = 2 * math.pi * phase; bob = -22 * math.sin(tau); pulse = .5 + .5 * math.sin(tau)
    b += halo(256, 704, 160, COLD_M, .16 + .08 * pulse, 36)
    b += G(line("M0 0 L6 -130 M-34 -90 L42 -98", 20) + line("M0 0 L6 -130 M-34 -90 L42 -98", 10, WD), 160, 700, -12)
    mound = "M96 744 Q116 668 256 660 Q396 668 416 744 Z"
    b += shaded(d, mound, DIRT, DIRT_D, -10, -12, brush((150, 700), (214, 676), (282, 676), 7, DIRT_L))
    for (x, y, r) in [(136, 706, -20), (384, 710, 20)]:
        b += G(fill("M0 0 L-6 -26 L2 -8 L6 -34 L10 -8 L18 -24 L12 2 Z", MOSS, 4), x, y, r)
    wax = "M242 684 L244 626 Q262 616 286 624 L288 684 Q266 692 242 684 Z"
    b += shaded(d, wax, BONE, BONE_D, 8, 0)
    b += fill("M244 626 Q262 616 286 624 Q288 646 280 650 Q274 638 266 644 Q258 632 250 644 Q242 638 244 626 Z", "#fbf6e8", 5)
    b += line("M265 622 L265 604", 5)
    b += fill(f"M265 {f(566 - 6 * pulse)} Q280 588 272 600 Q265 608 258 600 Q250 588 265 {f(566 - 6 * pulse)} Z", COLD_M, 4)
    wy = 470 + bob
    b += halo(262, wy, 130 + 12 * pulse, "#b8ceff", .18 + .1 * pulse) + halo(262, wy, 80, COLD_M, .22)
    b += f'<path d="M{f(262 + 20 * math.sin(tau))} {f(wy + 70)} Q{f(250 - 16 * math.sin(tau))} {f(wy + 110)} 266 {f(544 + bob * .3)}" fill="none" stroke="{COLD_M}" stroke-width="{sw(10)}" opacity=".6"/>'
    b += wisp_body(262, wy, 1.25, phase)
    for i in range(3):
        t = (phase + i / 3) % 1
        x = 220 + i * 40 + 16 * math.sin(t * 6 + i)
        b += f'<circle cx="{f(x)}" cy="{f(wy - 110 - t * 110)}" r="{f(7 * (1 - t) + 2)}" fill="{COLD_I}" stroke="none" opacity="{1 - t:.2f}"/>'
    b += sparkle(396, 440 + bob * .5, .8 + .5 * pulse, COLD_I) + sparkle(128, 500 - bob * .5, .6 + .5 * (1 - pulse), COLD_I)
    return d, b


# ------------------------------------------------------------------ hand cart (3 x 2 sheet)
CART_WD = ("#9a6446", WD_D, WD_L); CART_WD2 = ("#6e4632", "#4a2e22", "#9a6848")


def sack(x, y, w, h, rot, col=SACK):
    body = f"M{-w * .5} 0 Q{-w * .62} {-h * .7} {-w * .22} {-h * .92} L{w * .22} {-h * .92} Q{w * .62} {-h * .7} {w * .5} 0 Q0 {h * .12} {-w * .5} 0 Z"
    s = fill(body, col, 7) + brush((-w * .3, -h * .15), (-w * .38, -h * .5), (-w * .18, -h * .78), 6, SACK_L)
    s += fill(f"M{-w * .2} {-h * .9} Q{-w * .3} {-h * 1.16} {-w * .1} {-h * 1.12} L0 {-h * .98} L{w * .1} {-h * 1.12} Q{w * .3} {-h * 1.16} {w * .2} {-h * .9} Z", col, 6)
    s += line(f"M{-w * .24} {-h * .9} Q0 {-h * .84} {w * .24} {-h * .9}", 5, TRK)
    return G(s, x, y, rot)


def log_piece(x, y, L, r, rot):
    s = rrect(-L / 2, -r, L, r * 2, r * .9, LOG, 7) + brush((-L * .4, -r * .4), (0, -r * .55), (L * .4, -r * .4), 5, "#a0685a")
    s += ell(L / 2, 0, r * .7, r, LOG_E, 6) + f'<ellipse cx="{f(L / 2)}" cy="0" rx="{f(r * .3)}" ry="{f(r * .45)}" fill="none" stroke-width="{sw(3)}"/>'
    return G(s, x, y, rot)


def small_crate(x, y, w, h):
    s = rrect(x - w / 2, y - h, w, h, 6, "#a87550", 7) + line(f"M{x - w / 2 + 6} {y - h + 6} L{x + w / 2 - 6} {y - 6} M{x + w / 2 - 6} {y - h + 6} L{x - w / 2 + 6} {y - 6}", 5, WD_D)
    s += rrect(x - w / 2 - 4, y - h - 4, w + 8, 16, 5, "#c08a5c", 6)
    return s


def wheel(cx, cy, r, wood, banded, far=False):
    base, dark, light = wood
    s = ""
    rim = IRON if banded else dark
    s += f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke-width="{sw(34 if banded else 30)}"/>'
    s += f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{rim if not far else INK_D}" stroke-width="{sw(20 if banded else 16)}"/>'
    if not far:
        s += f'<circle cx="{cx}" cy="{cy}" r="{r - 12}" fill="none" stroke="{base}" stroke-width="{sw(7)}"/>'
        for k in range(6):
            a = math.pi * k / 3 + .26
            p = f"M{f(cx + math.cos(a) * 16)} {f(cy + math.sin(a) * 16)} L{f(cx + math.cos(a) * (r - 12))} {f(cy + math.sin(a) * (r - 12))}"
            s += line(p, 18) + line(p, 8, base)
        s += f'<circle cx="{cx}" cy="{cy}" r="22" fill="{IRON if banded else base}" stroke-width="{sw(7)}"/><circle cx="{cx}" cy="{cy}" r="7" fill="{IRON_L if banded else light}" stroke="none"/>'
        s += brush((cx - r * .8, cy - r * .1), (cx - r * .7, cy - r * .7), (cx - r * .1, cy - r * .85), 5, IRON_L if banded else light)
        if banded:
            for k in range(8):
                a = math.pi * k / 4
                s += f'<circle cx="{f(cx + math.cos(a) * r)}" cy="{f(cy + math.sin(a) * r)}" r="5" fill="{IRON_L}" stroke="none"/>'
    return s


def cart_frame(level, load):
    d = []; b = ""
    strong = level > 1
    base, dark, light = CART_WD2 if strong else CART_WD
    body = ""
    # far wheel and far handle, behind the bed
    body += wheel(372, 668, 70, (base, dark, light), strong, far=True)
    body += line("M150 570 L44 676", 24) + line("M150 570 L44 676", 12, dark)
    if strong:
        body += line("M420 540 L426 404 Q428 378 454 380 L476 382", 16) + line("M420 540 L426 404 Q428 378 454 380 L476 382", 7, IRON)
        body += line("M470 384 L470 402", 5)
        body += fill("M452 402 Q470 390 488 402 Z", IRON, 5) + rrect(454, 402, 32, 40, 6, "#fff1c8", 5)
        body += fill("M470 432 Q480 420 474 410 Q466 420 470 432 Z", FL_M, 3) + rrect(450, 440, 40, 10, 4, IRON, 5)
        body += halo(470, 422, 40, FL_M, .22)
    # inside of the bed and the load
    top = "M116 560 L158 520 L440 520 L404 560 Z"
    body += fill(top, INK_D if load == 0 else dark, 7)
    if load == 0:
        body += fill_ns("M150 548 L178 528 L420 528 L396 548 Z", "#3a2a30") + line("M200 544 Q230 532 260 540", 4, STRAW)
    if load >= 1:
        body += log_piece(330, 530, 170, 20, -4) + log_piece(300, 510, 150, 18, 3)
        body += sack(200, 552, 110, 120, -8) + sack(290, 560, 100, 96, 10)
    if load >= 2:
        body += small_crate(372, 540, 100, 96)
        body += sack(230, 486, 120, 120, 6) + sack(160, 548, 90, 90, -18) + sack(320, 470, 100, 100, -10)
        body += G(pumpkin_body(d, 256, 330, .42), 0, 36)
        body += leaf(300, 360, 30, 2.4, LEAF)
    # bed: near side and back end
    side = "M112 560 L406 560 L398 650 L120 650 Z"
    body += shaded(d, side, base, dark, 0, -10, brush((136, 578), (256, 572), (380, 578), 6, light))
    body += line("M116 592 L402 592 M118 622 L400 622", 4, dark)
    body += fill("M406 560 L442 520 L436 604 L398 650 Z", dark, 7)
    for x in (150, 360):
        body += line(f"M{x} 562 L{x + 2} 648", 5, dark)
    if strong:
        for (x0, x1) in ((112, 152), (366, 406)):
            body += fill(f"M{x0} 556 L{x1} 556 L{x1 - 2} 574 L{x0 + 2} 574 Z", IRON, 5) + fill(f"M{x0 + 6} 636 L{x1 - 6} 636 L{x1 - 6} 652 L{x0 + 6} 652 Z", IRON, 5)
        for x in (124, 140, 378, 394):
            body += f'<circle cx="{x}" cy="565" r="4" fill="{IRON_L}" stroke="none"/>'
    # near handle with a cross grip, and the prop leg
    body += line("M122 610 L24 716", 26) + line("M122 610 L24 716", 13, base) + brush((110, 612), (70, 660), (34, 700), 4, light)
    body += line("M20 722 L56 682", 22) + line("M20 722 L56 682", 10, dark)
    body += line("M150 650 L144 742", 20) + line("M150 650 L144 742", 9, dark)
    body += wheel(278, 672, 84, (base, dark, light), strong)
    b += f'<g transform="translate(256 744) scale(1.08) translate(-256 -744)">{body}</g>' if strong else body
    return d, b


def cart_icon():
    return cart_frame(1, 2)


CART_FRAMES = [(lambda lv, ld: (lambda: cart_frame(lv, ld)))(lv, ld) for lv in (1, 2) for ld in (0, 1, 2)]


# ------------------------------------------------------------------ moon icons (HUD)
def moon_waxing():
    d = []; b = ""
    b += halo(256, 256, 178, CREAM, .26)
    c = crescent(256, 256, 150, -82, -26, 132)
    b += shaded(d, c, CREAM, CREAM_D, -14, 0, brush((330, 160), (396, 240), (360, 340), 10, "#ffffff"))
    for (x, y, r) in [(352, 330, 14), (378, 214, 10)]:
        b += f'<circle cx="{x}" cy="{y}" r="{r}" fill="{CREAM_D}" stroke="none"/>'
    b += sparkle(150, 170, 2.0, CREAM) + sparkle(170, 350, 1.3, CREAM)
    return d, b


def moon_new():
    d = []; b = ""
    b += halo(256, 256, 172, MT, .14)
    b += f'<circle cx="256" cy="256" r="150" fill="#2c2a44" stroke-width="{sw(12)}"/>'
    b += clipped(d, "M256 106 a150 150 0 1 0 0.1 0 Z", fill_ns("M256 256 m-150 0 a150 150 0 1 0 300 0 a150 150 0 1 0 -300 0 M280 256 m-150 0 a150 150 0 1 1 300 0 a150 150 0 1 1 -300 0", "#3e3b60"))
    for (x, y, r) in [(206, 214, 22), (300, 300, 16), (232, 320, 11)]:
        b += f'<circle cx="{x}" cy="{y}" r="{r}" fill="#25233a" stroke="none"/>'
    b += f'<circle cx="256" cy="256" r="146" fill="none" stroke="{MT_L}" stroke-width="{sw(8)}"/>'
    b += brush((140, 300), (130, 200), (200, 132), 8, "#ffffff", .9)
    b += sparkle(404, 116, 1.9, MT_L) + sparkle(106, 404, 1.4, MT_L) + sparkle(410, 396, 1.0, MT_L) + sparkle(96, 124, .9, MT_L)
    return d, b


def moon_blood():
    d = []; b = ""
    b += halo(256, 256, 180, RD, .3)
    disc = "M256 106 a150 150 0 1 0 0.1 0 Z"
    spots = ""
    for (x, y, r) in [(206, 196, 26), (312, 170, 16), (300, 290, 20), (190, 300, 12)]:
        spots += f'<circle cx="{x}" cy="{y}" r="{r}" fill="{BLOOD_D}" stroke="none" opacity=".55"/>'
    b += shaded(d, disc, BLOOD, BLOOD_D, -16, -12, spots + brush((150, 250), (160, 170), (230, 128), 10, BLOOD_L))
    for (p0, c, p1, w) in [((196, 226), (300, 206), (440, 236), 22), ((70, 318), (170, 300), (300, 326), 26), ((236, 372), (310, 354), (380, 372), 16)]:
        rib = ribbon(p0, c, p1, lambda t, w=w: w * math.sin(math.pi * t) ** .6 + 2)
        b += fill(rib, CRIMSON, 5) + brush((p0[0] + 30, p0[1] - 3), c, (p1[0] - 40, p1[1] - 4), 4, "#7e2c38")
    b += sparkle(420, 128, 1.6, "#ffd1c8") + sparkle(96, 150, 1.1, "#ffd1c8")
    return d, b


ITEM = (120, 400, 392, 740)
TRINKET = (120, 410, 392, 740)
SPRITES = {
    "glowbloom": (glowbloom, ITEM), "wispdust": (wispdust, (130, 390, 382, 740)),
    "sporemask": (sporemask, (100, 400, 412, 740)), "gravelight": (gravelight, (140, 330, 372, 740)),
    "barrowcloak": (barrowcloak, (100, 410, 412, 740)),
    "frostanklet": (frostanklet, TRINKET), "nightfang": (nightfang, (150, 380, 362, 740)), "emberheart": (emberheart, TRINKET),
    "crowseye": (crowseye, TRINKET), "harvestcharm": (harvestcharm, TRINKET), "boneward": (boneward, TRINKET),
    "wispfeather": (wispfeather, (130, 380, 382, 740)), "gravedust": (gravedust, TRINKET), "moonlocket": (moonlocket, TRINKET),
    "thornknot": (thornknot, TRINKET),
    "glowsprout": {"frames": anim(glowsprout), "cols": 4, "rows": 1, "target": (50, 300, 462, 744)},
    "gravewisp": {"frames": anim(gravewisp), "cols": 4, "rows": 1, "target": (50, 150, 462, 744)},
    "cart": {"frames": CART_FRAMES, "cols": 3, "rows": 2, "target": (10, 40, 502, 492), "cell": (512, 512)},
}
# Square inventory / build icons (build.py writes <key>-icon.svg); the moons only exist as icons.
ICONS = {k: SPRITES[k][0] for k in ("glowbloom", "wispdust", "sporemask", "gravelight", "barrowcloak", "frostanklet", "nightfang",
                                     "emberheart", "crowseye", "harvestcharm", "boneward", "wispfeather", "gravedust", "moonlocket", "thornknot")}
ICONS.update({"nightfang": rot(nightfang, 28), "wispfeather": rot(wispfeather, 14)})
ICONS.update({"cart": cart_icon, "moon-waxing": moon_waxing, "moon-new": moon_new, "moon-blood": moon_blood})
WIDE = {}
