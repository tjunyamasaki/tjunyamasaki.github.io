"""The Long Night update: caches, region resources, new residents, weapons,
armour, loot items and projectiles. Same ink style as the rest of the theme."""
import math
from lib import *
import lib
from nodes import crystal, DIRT, DIRT_D, DIRT_L, STRAW
from structures import IRON, IRON_D, IRON_L, anim
import magic
from magic import skeleton, ghostfire, SK_IDLE, SK_WALK, SK_ATTACK, BRONZE, BRONZE_D, BRONZE_L

AM = "#9a6fd0"; AM_D = "#6b45a0"; AM_L = "#dcc8f7"          # moonshard amethyst
GLOW = "#7fe0cf"; GLOW_D = "#3f9c8c"; GLOW_L = "#e2fff8"      # glowcap light
SILVER = "#c9c6da"; SILVER_D = "#8f8ba8"
GOLDEN = "#e8b04a"; GOLDEN_D = "#b07a2a"; GOLDEN_L = "#f9dc8e"
MIRE = "#7a9a5a"; MIRE_D = "#56703f"; MIRE_L = "#b3cf86"


def purple_crystal(x, y, w, h, rot):
    tip = h + w * 1.3
    return (f'<g transform="translate({x} {y}) rotate({rot})">'
            + fill_ns(f"M{-w} 0 L{-w} {-h} L0 {-tip} L0 20 Z", AM) + fill_ns(f"M0 20 L0 {-tip} L{w} {-h} L{w} 0 Z", AM_D)
            + line(f"M{-w} 20 L{-w} {-h} L0 {-tip} L{w} {-h} L{w} 20", 7) + line(f"M0 {-tip} L0 20", 4)
            + brush((-w * 0.5, -h * 0.1), (-w * 0.55, -h * 0.5), (-w * 0.3, -h * 0.95), 6, AM_L) + '</g>')


# ------------------------------------------------------------------ nodes
def shardrock():
    d = []; b = ""
    b += purple_crystal(206, 640, 30, 170, -14) + purple_crystal(300, 630, 26, 130, 18) + purple_crystal(256, 610, 42, 260, 2)
    b += purple_crystal(150, 672, 18, 70, -34) + purple_crystal(356, 668, 16, 60, 36)
    rk = blob(256, 670, 150, 58, 10, 0.12, 8, flat=705)
    b += shaded(d, rk, RK_D, "#57536c", -14, -12, brush((140, 660), (190, 636), (240, 636), 7, RK, .9))
    b += sparkle(190, 380, 1.5, "#fff3ff") + sparkle(330, 450, 1.0, "#fff3ff") + sparkle(110, 560, .8, AM_L)
    return d, b


def bones():
    d = []; b = ""
    mound = "M90 742 Q110 670 256 662 Q402 670 422 742 Z"
    b += shaded(d, mound, DIRT, DIRT_D, -10, -12, brush((150, 700), (220, 676), (290, 676), 7, DIRT_L))
    def bone(x, y, rot, s=1.0):
        body = (limb((-70, 0), (0, -6), (70, 0), 18, 18) )
        g = union([body], BONE, 14)
        for ex in (-70, 70):
            g += f'<circle cx="{ex}" cy="-10" r="14" fill="{BONE}" stroke-width="{sw(6)}"/><circle cx="{ex}" cy="10" r="14" fill="{BONE}" stroke-width="{sw(6)}"/>'
        g += brush((-50, -6), (0, -12), (50, -6), 4, "#ffffff", .7)
        return G(g, x, y, rot, s)
    b += bone(200, 690, 18) + bone(320, 700, -24) + bone(256, 660, 80, .8)
    # skull
    b += rrect(214, 612, 72, 44, 14, BONE, 7)
    b += ell(250, 580, 64, 56, BONE, 8) + rrect(218, 612, 66, 30, 12, BONE, 0, extra=' stroke="none"')
    b += fill("M204 572 L240 584 Q240 610 222 610 Q202 608 204 586 Z", INK_D, 4) + fill("M292 572 L258 584 Q258 610 276 610 Q296 608 292 586 Z", INK_D, 4)
    b += line("M232 628 L232 650 M250 630 L250 654 M268 628 L268 650", 4)
    b += line("M264 532 L270 548 L260 560", 4)
    return d, b


def glowcap():
    d = []; b = ""
    def cap(x, base, h, r, tilt):
        s = ""
        stem = f"M{x - r * .2} {base} Q{x - r * .32} {base - h * .5} {x - r * .14 + tilt * .5} {base - h} L{x + r * .14 + tilt * .5} {base - h} Q{x + r * .32} {base - h * .5} {x + r * .2} {base} Z"
        s += fill(stem, "#d9e8d8", 7) + brush((x - r * .06, base - 10), (x - r * .12, base - h * .5), (x + tilt * .4, base - h + 8), 5, "#a9c2ae")
        cy = base - h
        capd = f"M{x - r + tilt} {cy + 10} Q{x - r * .9 + tilt} {cy - r * .9} {x + tilt} {cy - r} Q{x + r * .9 + tilt} {cy - r * .9} {x + r + tilt} {cy + 10} Q{x + tilt} {cy + r * .32} {x - r + tilt} {cy + 10} Z"
        s += f'<ellipse cx="{x + tilt}" cy="{cy - r * .3}" rx="{r * 1.35}" ry="{r * 1.0}" fill="{GLOW}" stroke="none" opacity=".16"/>'
        s += shaded(d, capd, GLOW, GLOW_D, -8, -8, brush((x - r * .6 + tilt, cy - r * .3), (x - r * .3 + tilt, cy - r * .8), (x + r * .2 + tilt, cy - r * .85), 7, GLOW_L), 7)
        for (dx, dy, rr) in [(-.45, -.35, .11), (.1, -.7, .09), (.45, -.25, .1), (-.1, -.3, .07)]:
            s += f'<circle cx="{f(x + tilt + dx * r)}" cy="{f(cy + dy * r)}" r="{f(rr * r)}" fill="{GLOW_L}" stroke="none"/>'
        return s
    b += cap(340, 736, 120, 64, 12) + cap(214, 740, 210, 104, -10) + cap(128, 742, 70, 42, -6)
    b += fill(blob(250, 742, 160, 12, 9, 0.2, 5), MIRE_D, 5)
    for i, (x, y) in enumerate([(300, 420), (170, 400), (380, 560)]):
        b += sparkle(x, y, 1.0, GLOW_L, .9)
    return d, b


# ------------------------------------------------------------------ caches (4 frame sparkle loops)
def aura(cx, cy, r, col, phase, strength=.22):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{r}" ry="{r * .55}" fill="{col}" stroke="none" opacity="{strength * (0.7 + 0.3 * math.sin(phase * 2 * math.pi)):.2f}"/>'

def orbit(cx, cy, r, n, col, phase, size=1.2):
    s = ""
    for i in range(n):
        a = 2 * math.pi * (phase + i / n)
        s += sparkle(cx + r * math.cos(a), cy + r * .45 * math.sin(a) - 60 - 30 * math.sin(a * 2 + i), size * (0.7 + 0.3 * math.sin(a * 3)), col, .95)
    return s

def crate(phase):
    d = []; b = ""
    front = "M120 520 L392 520 L392 736 L120 736 Z"
    b += shaded(d, front, "#a87550", WD_D, 10, 0)
    top = "M120 520 L180 468 L440 468 L392 520 Z"; side = "M392 520 L440 468 L440 690 L392 736 Z"
    b += fill(top, "#c08a5c", 7) + fill(side, "#7a4f36", 7)
    for y in (576, 632, 688):
        b += line(f"M124 {y} L388 {y}", 5, WD_D)
    b += line("M130 530 L382 726 M382 530 L130 726", 10, "#6a4230") + line("M130 530 L382 726 M382 530 L130 726", 4, "#c08a5c")
    for (x, y) in [(136, 536), (376, 536), (136, 720), (376, 720)]:
        b += f'<circle cx="{x}" cy="{y}" r="6" fill="{IRON_L}" stroke-width="{sw(3)}"/>'
    b += line("M200 470 Q256 440 320 470", 7, STRAW) + brush((150, 540), (150, 620), (156, 700), 7, "#d9a577", .8)
    b += orbit(256, 520, 150, 2, "#fff3d8", phase, 1.0)
    return d, b

def ironchest(phase):
    d = []; b = ""
    b += aura(256, 700, 200, "#79b8ff", phase)
    body = "M112 560 L400 560 L400 720 Q400 738 382 738 L130 738 Q112 738 112 720 Z"
    b += shaded(d, body, "#7a4f36", WD_D, 10, 0, brush((132, 600), (130, 660), (136, 720), 7, WD_L))
    lid = "M104 562 Q104 430 256 426 Q408 430 408 562 Z"
    b += shaded(d, lid, "#8a5a3c", WD_D, -10, -10, brush((150, 520), (180, 462), (256, 450), 8, WD_L))
    for x in (160, 352):
        b += rrect(x - 18, 432, 36, 306, 8, IRON, 7) + brush((x - 8, 460), (x - 9, 590), (x - 8, 720), 4, IRON_L)
    b += line("M108 562 L404 562", 9) + rrect(108, 552, 296, 18, 6, IRON, 6)
    b += rrect(222, 548, 68, 76, 12, IRON, 7) + gem(256, 584, 17, "#79b8ff", "#3f6fb0", "#e6f2ff")
    b += orbit(256, 560, 170, 3, "#cfe6ff", phase, 1.2)
    return d, b

def moonchest(phase):
    d = []; b = ""
    b += aura(256, 700, 220, "#c49bff", phase, .3)
    body = "M104 570 L408 570 L398 724 Q396 740 378 740 L134 740 Q116 740 114 724 Z"
    b += shaded(d, body, "#4a3a6a", "#302650", 12, 0, brush((128, 610), (126, 670), (134, 724), 7, "#6d5a98"))
    lid = "M96 572 Q110 420 256 410 Q402 420 416 572 Z"
    b += shaded(d, lid, "#5a4880", "#302650", -10, -10, brush((150, 520), (190, 450), (256, 438), 8, "#8a74c0"))
    b += line("M100 572 Q256 548 412 572", 9) + fill("M100 566 Q256 542 412 566 L412 584 Q256 560 100 584 Z", SILVER, 6)
    b += fill("M256 470 m-48 0 a48 48 0 1 0 96 0 a38 38 0 1 1 -96 0 Z", SILVER, 6)  # crescent
    b += fill("M226 596 L286 596 L280 660 L232 660 Z", SILVER, 6) + gem(256, 624, 14, AM, AM_D, AM_L)
    for x in (130, 382):
        b += fill(f"M{x - 14} 740 L{x + 14} 740 L{x + 10} 764 L{x - 10} 764 Z", SILVER_D, 5)
    b += orbit(256, 560, 190, 4, AM_L, phase, 1.4)
    return d, b

def reliquary(phase):
    d = []; b = ""
    b += aura(256, 690, 240, GOLDEN_L, phase, .38)
    b += f'<ellipse cx="256" cy="430" rx="{160 + 10 * math.sin(phase * 2 * math.pi):.1f}" ry="180" fill="{GOLDEN_L}" stroke="none" opacity=".14"/>'
    base = "M120 740 L140 690 L372 690 L392 740 Z"
    b += fill(base, GOLDEN_D, 7)
    body = "M148 690 L148 520 Q148 490 178 490 L334 490 Q364 490 364 520 L364 690 Z"
    b += shaded(d, body, GOLDEN, GOLDEN_D, 12, 0, brush((168, 520), (166, 600), (170, 676), 8, GOLDEN_L))
    roof = "M132 496 L256 330 L380 496 Z"
    b += shaded(d, roof, GOLDEN, GOLDEN_D, 10, -6, brush((176, 470), (214, 410), (252, 356), 7, GOLDEN_L))
    b += fill("M204 530 L308 530 L308 650 L204 650 Z", "#3a2530", 6)
    b += f'<rect x="210" y="536" width="92" height="108" fill="{GOLDEN_L}" stroke="none" opacity="{0.55 + 0.35 * math.sin(phase * 2 * math.pi):.2f}"/>'
    b += gem(256, 590, 20, RD, RD_D, "#ffd1c8")
    # skull finial
    b += ell(256, 312, 30, 27, BONE, 6) + fill("M240 306 L252 312 Q252 324 244 324 Q236 322 238 312 Z", O, 2) + fill("M272 306 L260 312 Q260 324 268 324 Q276 322 274 312 Z", O, 2)
    for x in (170, 342):
        b += gem(x, 610, 12, CR, CR_D, CR_L)
    b += orbit(256, 520, 200, 5, GOLDEN_L, phase, 1.6)
    return d, b


# ------------------------------------------------------------------ residents
BONEWALKER_KIT = dict(cloth=MAR, glow="#ff5a44", blade=True, helm="#6f6b86")
def bonewalker(P):
    return skeleton({**BONEWALKER_KIT, **P})

BW_WALK = [{**p, "ar": (40, 60)} for p in SK_WALK]
BW_ATTACK = [dict(ar=(160, 200), al=(-30, -30), lean=-6, jaw=4, blade_tilt=10),
             dict(ar=(90, 70), al=(-40, -50), lean=10, jaw=8, fx="slash", front_r=True, feet=[(-12, 0), (16, 0)], blade_tilt=40),
             dict(ar=(40, 30), al=(-30, -30), lean=4, jaw=4, front_r=True, blade_tilt=30)]
BW_IDLE = dict(ar=(30, 50))


def bogling(P):
    d = []; b = ""
    by = P.get("by", 0); sq = P.get("squash", 0); lunge = P.get("lunge", 0); mo = P.get("mouth", 0)
    cx = 256 + lunge; w = 150 * (1 + sq * .12); h = 190 * (1 - sq * .1) + P.get("rise", 0)
    base = 736
    body = (f"M{cx - w} {base} C{cx - w * 1.08} {base - h * .7} {cx - w * .5} {base - h} {cx} {base - h} "
            f"C{cx + w * .5} {base - h} {cx + w * 1.08} {base - h * .7} {cx + w} {base} Q{cx} {base + 14} {cx - w} {base} Z")
    b += shaded(d, body, MIRE, MIRE_D, -12, -14, brush((cx - w * .6, base - h * .6), (cx - w * .4, base - h * .9), (cx, base - h * .95), 10, MIRE_L))
    for (dx, dy, r) in [(-.55, -.3, 14), (.5, -.55, 10), (.2, -.2, 8)]:
        b += f'<circle cx="{f(cx + dx * w)}" cy="{f(base + dy * h)}" r="{r}" fill="{MIRE_L}" stroke-width="{sw(4)}" opacity=".85"/>'
    ey = base - h * .55
    b += fill(f"M{cx - 78} {ey - 18} L{cx - 18} {ey + 2} Q{cx - 20} {ey + 34} {cx - 48} {ey + 34} Q{cx - 80} {ey + 30} {cx - 78} {ey - 18} Z", INK_D, 5)
    b += fill(f"M{cx + 78} {ey - 18} L{cx + 18} {ey + 2} Q{cx + 20} {ey + 34} {cx + 48} {ey + 34} Q{cx + 80} {ey + 30} {cx + 78} {ey - 18} Z", INK_D, 5)
    b += f'<circle cx="{cx - 44}" cy="{ey + 14}" r="7" fill="#e8f5a0" stroke="none"/><circle cx="{cx + 44}" cy="{ey + 14}" r="7" fill="#e8f5a0" stroke="none"/>'
    my = ey + 64
    b += fill(f"M{cx - 50} {my} Q{cx} {my - 8} {cx + 50} {my} Q{cx + 34} {my + 18 + mo} {cx} {my + 22 + mo} Q{cx - 34} {my + 18 + mo} {cx - 50} {my} Z", "#3a2530", 5)
    for x in (cx - 26, cx + 14):
        b += fill(f"M{x} {my - 2} L{x + 7} {my + 12} L{x + 14} {my - 1} Z", BONE, 3)
    # reeds stuck on top + drips
    b += line(f"M{cx - 20} {base - h + 6} Q{cx - 34} {base - h - 50} {cx - 56} {base - h - 70}", 8) + line(f"M{cx - 20} {base - h + 6} Q{cx - 34} {base - h - 50} {cx - 56} {base - h - 70}", 3, STRAW)
    b += leaf(cx + 30, base - h - 4, 30, 1.8, LEAF)
    for i, x in enumerate((cx - w * .7, cx + w * .6)):
        t = (P.get("ph", 0) + i * .5) % 1
        b += f'<ellipse cx="{f(x)}" cy="{f(base - 10 - 20 * t)}" rx="10" ry="{f(14 - 6 * t)}" fill="{MIRE}" stroke-width="{sw(4)}"/>'
    return d, b

BOG_WALK = [dict(ph=0, squash=1), dict(ph=.25, squash=-1, rise=20, by=-6), dict(ph=.5, squash=1), dict(ph=.75, squash=-1, rise=20)]
BOG_ATTACK = [dict(squash=1.8, mouth=6), dict(squash=-1.6, rise=60, lunge=40, mouth=28), dict(squash=.5, lunge=16, mouth=10)]


def golem(P):
    d = []; b = ""
    by = P.get("by", 0); ph = P.get("ph", 0); arms = P.get("arms", 0); lean = P.get("lean", 0)
    step = math.sin(2 * math.pi * ph) * 20
    for i, s in enumerate((-1, 1)):
        fx = 256 + s * 70 + (step if i else -step)
        b += fill(blob(fx, 706 - max(0, (step if i else -step)) * .5, 58, 36, 8, .1, 20 + i), RK_D, 8)
    body = ""
    torso = blob(256, 520 + by, 170, 150, 11, .08, 31)
    body += shaded(d, torso, RK, RK_D, 14, -10, brush((140, 470 + by), (170, 410 + by), (230, 390 + by), 10, RK_L))
    body += purple_crystal(170, 420 + by, 26, 90, -30) + purple_crystal(236, 390 + by, 22, 110, -6) + purple_crystal(330, 410 + by, 30, 120, 22)
    body += line(f"M200 {560 + by} L230 {590 + by} L214 {620 + by} M320 {540 + by} L300 {580 + by}", 6)
    # head
    hy = 470 + by
    body += fill(f"M204 {hy} L308 {hy} L300 {hy + 64} L212 {hy + 64} Z", RK_D, 7)
    body += fill(f"M218 {hy + 20} L248 {hy + 28} L236 {hy + 44} Z", AM_L, 4) + fill(f"M294 {hy + 20} L264 {hy + 28} L276 {hy + 44} Z", AM_L, 4)
    body += f'<circle cx="238" cy="{hy + 32}" r="14" fill="{AM}" stroke="none" opacity=".35"/><circle cx="274" cy="{hy + 32}" r="14" fill="{AM}" stroke="none" opacity=".35"/>'
    # arms: raised by `arms` (0 down .. 1 overhead)
    for s in (-1, 1):
        sx = 256 + s * 150
        ang = s * (20 + 150 * arms)
        hand = (sx + math.sin(math.radians(ang)) * 150, 520 + by + math.cos(math.radians(ang)) * 150)
        body += union([limb((sx, 470 + by), ((sx + hand[0]) / 2 + s * 20, (470 + by + hand[1]) / 2), hand, 70, 56)], RK)
        body += fill(blob(hand[0], hand[1], 62, 56, 8, .12, 40 + s), RK_D, 8) + brush((hand[0] - 30, hand[1] - 20), (hand[0] - 10, hand[1] - 40), (hand[0] + 20, hand[1] - 40), 7, RK)
    if P.get("slam"):
        body += fill_ns(blob(256, 720, 190, 22, 9, .2, 3), AM_L, .5)
        for i in range(5):
            a = math.pi * (0.1 + 0.2 * i)
            body += sparkle(256 + math.cos(a) * 200, 700 - math.sin(a) * 60, 1.4, AM_L)
    if lean:
        body = f'<g transform="rotate({lean} 256 720)">{body}</g>'
    b += body
    return d, b

GOLEM_WALK = [dict(ph=0), dict(ph=.25, by=-8), dict(ph=.5), dict(ph=.75, by=-8)]
GOLEM_ATTACK = [dict(arms=1, lean=-6, by=-10), dict(arms=.15, lean=8, by=10, slam=True), dict(arms=.4, lean=3)]


# ------------------------------------------------------------------ weapons (vertical, grip low)
def recurve():
    d = []; b = ""
    up = limb((30, 0), (80, -130), (-10, -220), 24, 10); dn = limb((30, 0), (80, 130), (-10, 220), 24, 10)
    tu = limb((-10, -220), (-30, -240), (-8, -256), 10, 6); td = limb((-10, 220), (-30, 240), (-8, 256), 10, 6)
    b += line("M-14 -226 L-14 226", 4, BONE)
    b += union([up, dn, tu, td], WD)
    b += brush((48, -30), (74, -120), (4, -208), 6, WD_L) + brush((48, 30), (74, 120), (4, 208), 6, WD_L)
    b += rrect(20, -34, 32, 68, 8, TRK, 6) + wraps(21, 51, -34, 34, 5, TRK_D)
    b += rrect(22, -44, 28, 12, 4, GOLD, 5) + rrect(22, 32, 28, 12, 4, GOLD, 5)
    return d, G(b, 256, 420)

def bonebow():
    d = []; b = ""
    up = limb((30, 0), (90, -120), (0, -224), 26, 12); dn = limb((30, 0), (90, 120), (0, 224), 26, 12)
    hu = limb((0, -224), (-10, -252), (24, -262), 12, 4); hd = limb((0, 224), (-10, 252), (24, 262), 12, 4)
    b += line("M-4 -230 L-4 230", 4, BONE)
    b += union([up, dn, hu, hd], BONE)
    for s_ in (-1, 1):
        for t in (0.25, 0.45, 0.65, 0.82):
            P = qpts((30, 0), (90, 120 * s_), (0, 224 * s_), 20); x, y, nx, ny, _t = P[int(t * 20)]
            w = (26 + (12 - 26) * t) / 2
            b += line(f"M{f(x + nx * w)} {f(y + ny * w)} L{f(x + nx * w * 0.3)} {f(y + ny * w * 0.3)} M{f(x - nx * w)} {f(y - ny * w)} L{f(x - nx * w * 0.3)} {f(y - ny * w * 0.3)}", 4)
    b += brush((52, -40), (80, -120), (12, -206), 5, "#ffffff", 0.7) + brush((52, 40), (80, 120), (12, 206), 5, BONE_D)
    b += rrect(18, -38, 36, 76, 8, MAR, 6) + wraps(19, 53, -38, 38, 5, MAR_D)
    b += fill("M50 20 Q80 50 70 90 Q62 74 54 78 Q64 50 44 30 Z", MAR, 5)
    b += gem(36, 0, 10, PU, PU_D, PU_L)
    return d, G(b, 256, 420)

def broadsword():
    d = []; b = ""
    b += fill_ns("M-26 0 L-26 -236 L0 -292 L0 0 Z", MT_L) + fill_ns("M0 0 L0 -292 L26 -236 L26 0 Z", MT) + fill("M-26 0 L-26 -236 L0 -292 L26 -236 L26 0 Z", "none", 8)
    b += line("M0 -20 L0 -250", 5, MT_D) + brush((-16, -40), (-18, -140), (-12, -220), 5, "#ffffff", 0.9)
    b += fill(limb((-78, 24), (0, -14), (78, 24), 20, 20), GOLD, 7) + brush((-60, 12), (0, -8), (60, 12), 5, GOLD_L)
    b += f'<circle cx="-82" cy="30" r="12" fill="{GOLD}" stroke-width="{sw(6)}"/><circle cx="82" cy="30" r="12" fill="{GOLD}" stroke-width="{sw(6)}"/>'
    b += rrect(-13, 20, 26, 92, 6, TRK, 6) + wraps(-12, 12, 20, 112, 6, TRK_D)
    b += gem(0, 4, 14, RD, RD_D, "#ffd1c8")
    b += f'<circle cx="0" cy="126" r="20" fill="{GOLD}" stroke-width="{sw(7)}"/>' + gem(0, 126, 9, RD, RD_D, "#ffd1c8")
    return d, G(b, 256, 560)

def flamberge():
    d = []; b = ""
    N = 14; L = []; R = []
    for i in range(N + 1):
        t = i / N; y = -t * 270; w = 22 * (1 - t * 0.35) + 6 * math.sin(t * math.pi * 5)
        L.append((-w, y)); R.append((w, y))
    tip = (0, -318)
    path_all = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in L) + f" L{tip[0]} {tip[1]} " + " L".join(f"{f(x)} {f(y)}" for x, y in R[::-1]) + " Z"
    left = "M0 0 " + " L".join(f"{f(x)} {f(y)}" for x, y in L) + f" L0 {tip[1]} Z"
    right = "M0 0 " + " L".join(f"{f(x)} {f(y)}" for x, y in R) + f" L0 {tip[1]} Z"
    b += fill_ns(left, "#f7c9a0") + fill_ns(right, "#e08a5a") + fill(path_all, "none", 8)
    b += line("M0 -10 L0 -280", 5, "#b8592b") + brush((-10, -40), (-12, -150), (-6, -240), 4, "#ffffff", 0.9)
    b += union([limb((0, 10), (-50, 6), (-72, -44), 20, 5), limb((0, 10), (50, 6), (72, -44), 20, 5)], DT, 14)
    b += rrect(-12, 16, 24, 86, 6, MAR, 6) + wraps(-11, 11, 16, 102, 6, MAR_D)
    b += rrect(-20, 4, 40, 18, 6, DT, 6)
    b += fill("M0 104 L18 126 L0 150 L-18 126 Z", FL_M, 6)
    b += sparkle(-30, -200, 1.2, FL_I) + sparkle(24, -120, .9, FL_M)
    return d, G(b, 256, 560)

def crookstaff():
    d = []; b = ""
    shaft = limb((0, 250), (10, 40), (0, -150), 24, 20)
    hook = limb((0, -150), (26, -290), (-86, -250), 20, 15)
    curl = limb((-86, -250), (-118, -212), (-80, -196), 15, 10)
    b += union([shaft, hook, curl], WD)
    b += brush((6, 220), (12, 40), (6, -140), 7, WD_L) + brush((10, -180), (20, -250), (-40, -262), 6, WD_L)
    b += rrect(-15, 60, 30, 80, 6, TRK, 6) + wraps(-14, 14, 60, 140, 5, TRK_D)
    b += rrect(-17, -160, 34, 16, 5, GOLD, 6)
    b += fill("M-40 -238 L-22 -206 L-40 -170 L-58 -206 Z", AM, 6) + fill_ns("M-40 -238 L-22 -206 L-40 -170 Z", AM_D) + fill("M-40 -238 L-22 -206 L-40 -170 L-58 -206 Z", "none", 6)
    b += sparkle(-86, -160, 1.0, AM_L) + sparkle(-4, -226, 0.8, "#fff3ff")
    return d, G(b, 256, 480)

def skullstaff():
    d = []; b = ""
    b += union([limb((0, 250), (-14, 60), (4, -150), 22, 18), limb((-2, 40), (-30, 20), (-40, -4), 10, 4)], DT)
    b += brush((6, 230), (-4, 60), (10, -130), 7, DT_L)
    b += fill("M-10 -150 Q-40 -110 -30 -60 Q-18 -80 -12 -70 Q-20 -110 0 -140 Z", MAR, 5) + fill("M10 -150 Q40 -120 44 -80 Q30 -92 24 -84 Q24 -120 4 -140 Z", MAR_D, 5)
    b += rrect(-22, -170, 44, 22, 6, GOLD, 6)
    b += rrect(-30, -212, 60, 42, 12, BONE, 7) + ell(0, -248, 58, 52, BONE, 7) + rrect(-27, -212, 54, 30, 10, BONE, 0, extra=' stroke="none"')
    b += fill("M-40 -262 L-6 -250 Q-4 -228 -22 -226 Q-42 -228 -40 -250 Z", PU_D, 5) + fill("M40 -262 L6 -250 Q4 -228 22 -226 Q42 -228 40 -250 Z", PU_D, 5)
    b += f'<circle cx="-22" cy="-242" r="5" fill="{PU_L}" stroke="none"/><circle cx="22" cy="-242" r="5" fill="{PU_L}" stroke="none"/>'
    b += fill("M0 -222 L-6 -212 L6 -212 Z", O, 3) + line("M-14 -196 L-14 -178 M0 -196 L0 -176 M14 -196 L14 -178", 4)
    b += sparkle(-66, -300, 1.0, PU_L) + sparkle(64, -220, 0.8, PU_L)
    return d, G(b, 256, 480)

def tome():
    d = []; b = ""
    b += fill("M170 132 L360 118 Q376 118 378 134 L392 392 Q392 406 378 408 L190 420 Z", "#f3e6c4", 7)
    b += line("M372 150 L386 392 M362 146 L376 398", 3, BONE_D)
    cover = "M140 120 Q140 104 156 104 L344 96 Q360 96 362 112 L372 384 Q372 400 356 402 L170 414 Q152 416 152 400 Z"
    b += shaded(d, cover, "#5a2b2b", "#3e1c22", 10, 0)
    b += line("M158 110 L170 408", 16, "#3e1c22") + line("M178 108 L190 406", 5)
    for (x, y, r) in [(344, 112, 0), (354, 386, 90), (168, 398, 180)]:
        b += f'<path d="M0 0 L34 0 Q34 12 26 16 L12 12 Q4 20 0 34 Z" transform="translate({x} {y}) rotate({r + 90})" fill="{GOLD}" stroke-width="{sw(5)}"/>'
    b += fill(blob(266, 254, 62, 70, 9, 0.05, 2), GOLD, 6) + fill(blob(266, 254, 46, 54, 9, 0.05, 2), "#3e1c22", 4)
    b += G(flame(0, 30, 50, 90, .3, 2), 266, 262)
    b += brush((200, 140), (260, 128), (320, 128), 7, "#8a4a42")
    b += fill("M290 404 L292 460 L304 448 L316 460 L312 402 Z", FL_O, 5)
    b += sparkle(120, 150, 1.3, FL_I) + sparkle(410, 230, 1.0, FL_M)
    return d, b

def everlantern():
    d = []; b = ""
    b += '<circle cx="256" cy="300" r="130" fill="#fbd98a" opacity=".22" stroke="none"/>'
    b += line("M218 160 Q256 60 294 160", 18) + line("M218 160 Q256 60 294 160", 8, GOLDEN)
    b += f'<circle cx="256" cy="96" r="14" fill="{GOLDEN}" stroke-width="{sw(6)}"/>'
    b += fill("M180 190 Q256 110 332 190 Z", GOLDEN, 7) + brush((210, 172), (250, 140), (290, 156), 6, GOLDEN_L)
    b += rrect(176, 186, 160, 22, 8, GOLDEN_D, 7)
    b += fill("M190 208 L322 208 L314 390 L198 390 Z", "#fff1c8", 7)
    b += flame_small()
    b += line("M226 208 L220 390 M286 208 L292 390", 10) + line("M226 208 L220 390 M286 208 L292 390", 4, GOLDEN)
    b += brush((204, 230), (202, 300), (208, 370), 8, "#ffffff", 0.7)
    b += rrect(180, 388, 152, 24, 8, GOLDEN_D, 7) + fill("M196 412 L206 440 L306 440 L316 412 Z", GOLDEN, 7)
    b += sparkle(150, 240, 1.2, GOLDEN_L) + sparkle(370, 330, 1.0, GOLDEN_L)
    return d, b

def flame_small():
    return (fill("M256 240 Q290 290 282 332 Q276 360 256 362 Q236 360 230 332 Q222 290 256 240 Z", FL_O, 5)
            + fill("M256 284 Q272 310 268 334 Q264 348 256 348 Q248 348 244 334 Q242 310 256 284 Z", FL_I, 4))


# ------------------------------------------------------------------ armour and loot items
def bonemail():
    d = []; b = ""
    body = "M170 460 L220 440 Q256 470 292 440 L342 460 L380 520 L350 560 L336 540 L340 720 Q256 744 172 720 L176 540 L162 560 L132 520 Z"
    b += shaded(d, body, "#5a4a52", "#3e3238", 10, -6)
    for i, y in enumerate((560, 600, 640, 680)):
        rib = f"M186 {y} Q256 {y + 22} 326 {y}"
        b += line(rib, 18) + line(rib, 10, BONE) + brush((200, y + 2), (256, y + 16), (312, y + 2), 3, "#ffffff", .7)
    b += line("M256 520 L256 712", 16) + line("M256 520 L256 712", 8, BONE_D)
    for x, s in ((150, -1), (362, 1)):
        b += ell(x, 486, 42, 30, BONE, 7, s * 20) + line(f"M{x - 20} 480 L{x + 20} 492", 4)
    b += ell(256, 480, 30, 16, MAR, 6)
    return d, b

def shardplate():
    d = []; b = ""
    body = "M170 460 L220 440 Q256 470 292 440 L342 460 L380 520 L350 560 L336 540 L340 720 Q256 744 172 720 L176 540 L162 560 L132 520 Z"
    b += shaded(d, body, SILVER, SILVER_D, 10, -6, brush((190, 500), (186, 600), (192, 700), 8, "#ffffff", .6))
    b += fill("M256 500 L300 560 L256 680 L212 560 Z", AM, 7) + fill_ns("M256 500 L300 560 L256 680 Z", AM_D) + fill("M256 500 L300 560 L256 680 L212 560 Z", "none", 7)
    b += purple_crystal(160, 470, 16, 40, -30) + purple_crystal(352, 470, 16, 40, 30)
    b += line("M190 600 Q256 620 322 600 M188 650 Q256 670 324 650", 5, SILVER_D)
    return d, b

def shard_item():
    d = []; b = ""
    b += purple_crystal(236, 700, 40, 200, -12) + purple_crystal(300, 710, 26, 110, 22)
    b += sparkle(330, 480, 1.4, "#fff3ff")
    return d, b

def bone_item():
    d = []; b = ""
    g = union([limb((-150, 0), (0, -10), (150, 0), 34, 34)], BONE)
    for ex in (-150, 150):
        g += f'<circle cx="{ex}" cy="-20" r="28" fill="{BONE}" stroke-width="{sw(8)}"/><circle cx="{ex}" cy="20" r="28" fill="{BONE}" stroke-width="{sw(8)}"/>'
    g += f'<rect x="-150" y="-16" width="300" height="32" fill="{BONE}" stroke="none"/>'
    g += brush((-110, -8), (0, -16), (110, -8), 6, "#ffffff", .8) + brush((-100, 10), (0, 16), (100, 10), 5, BONE_D)
    b += G(g, 256, 640, -30)
    return d, b

def spore_item():
    d = []; b = ""
    b += f'<circle cx="256" cy="600" r="150" fill="{GLOW}" stroke="none" opacity=".18"/>'
    pod = "M256 460 Q350 480 352 590 Q350 700 256 720 Q162 700 160 590 Q162 480 256 460 Z"
    b += shaded(d, pod, GLOW, GLOW_D, -12, -10, brush((196, 540), (210, 500), (250, 486), 8, GLOW_L))
    for (x, y, r) in [(220, 600, 14), (290, 560, 10), (270, 650, 12), (210, 670, 8)]:
        b += f'<circle cx="{x}" cy="{y}" r="{r}" fill="{GLOW_L}" stroke="none"/>'
    b += line("M256 460 Q260 420 290 400", 8) + line("M256 460 Q260 420 290 400", 3, "#d9e8d8")
    b += sparkle(370, 460, 1.2, GLOW_L) + sparkle(150, 520, .9, GLOW_L)
    return d, b

def elixir():
    d = []; b = ""
    bottle = "M226 440 L286 440 L286 500 Q380 540 380 630 Q380 740 256 740 Q132 740 132 630 Q132 540 226 500 Z"
    b += fill(bottle, "#f3eef8", 8)
    liquid = "M142 610 Q256 590 370 610 Q376 730 256 732 Q136 730 142 610 Z"
    b += fill(liquid, RD, 0, ' stroke="none"') + fill_ns("M142 610 Q256 590 370 610 Q372 640 360 660 Q256 630 150 660 Q140 640 142 610 Z", "#e8706a")
    b += fill(bottle, "none", 8) + brush((170, 560), (160, 620), (176, 690), 9, "#ffffff", .8)
    b += rrect(214, 400, 84, 48, 10, WD, 7) + line("M226 470 L286 470", 6, GOLD)
    for (x, y, r) in [(230, 660, 10), (290, 690, 7), (260, 640, 5)]:
        b += f'<circle cx="{x}" cy="{y}" r="{r}" fill="#ffc2b8" stroke="none" opacity=".9"/>'
    return d, b

def heartstone():
    d = []; b = ""
    b += '<circle cx="256" cy="600" r="160" fill="#f08c80" stroke="none" opacity=".2"/>'
    heart = "M256 720 Q140 640 150 540 Q160 470 226 474 Q250 478 256 510 Q262 478 286 474 Q352 470 362 540 Q372 640 256 720 Z"
    b += shaded(d, heart, RD, RD_D, 12, -10, brush((196, 520), (220, 496), (246, 506), 9, "#ffd1c8"))
    b += line("M256 510 L256 700 M190 560 L256 610 L322 560", 4, RD_D)
    b += fill("M226 470 L286 470 L296 440 L216 440 Z", GOLD, 6) + gem(256, 452, 10, CR, CR_D, CR_L)
    b += sparkle(360, 470, 1.4, "#ffe8e0") + sparkle(150, 640, 1.0, "#ffe8e0")
    return d, b

def arrow():
    d = []; b = ""
    b += line("M60 256 L420 256", 16) + line("M60 256 L420 256", 7, WD_L)
    b += fill("M420 232 L480 256 L420 280 Z", MT, 7)
    b += fill("M60 256 L100 222 L130 222 L96 256 L130 290 L100 290 Z", ORG, 6)
    return d, b

def mbolt():
    d = []; b = ""
    b += f'<ellipse cx="300" cy="256" rx="120" ry="80" fill="{AM}" stroke="none" opacity=".22"/>'
    b += brush((60, 256), (180, 236), (300, 256), 34, AM, .55) + brush((90, 256), (200, 270), (300, 256), 18, AM_L, .8)
    b += f'<circle cx="320" cy="256" r="52" fill="{AM}" stroke-width="{sw(8)}"/><circle cx="310" cy="244" r="22" fill="{AM_L}" stroke="none"/>'
    b += sparkle(400, 210, 1.2, "#ffffff") + sparkle(380, 300, .9, AM_L)
    return d, b


def rot(fn, angle):
    """Diagonal presentation for square inventory icons."""
    def wrapped():
        d, b = fn()
        return d, f'<g transform="rotate({angle} 256 384)">{b}</g>'
    return wrapped


WEAPON_TARGET = (130, 30, 382, 740)
SPRITES = {
    "shardrock": (shardrock, (40, 250, 472, 744)),
    "bones": (bones, (60, 470, 452, 744)),
    "glowcap": (glowcap, (60, 330, 460, 744)),
    "crate": {"frames": anim(crate), "cols": 4, "rows": 1, "target": (70, 380, 442, 744)},
    "ironchest": {"frames": anim(ironchest), "cols": 4, "rows": 1, "target": (50, 330, 462, 744)},
    "moonchest": {"frames": anim(moonchest), "cols": 4, "rows": 1, "target": (40, 300, 472, 744)},
    "reliquary": {"frames": anim(reliquary), "cols": 4, "rows": 1, "target": (40, 150, 472, 744)},
    "bonewalker": {"frames": [(lambda P: (lambda: bonewalker(P)))(P) for P in BW_WALK + BW_ATTACK + [BW_IDLE]], "cols": 4, "rows": 2, "target": (40, 150, 472, 740)},
    "bogling": {"frames": [(lambda P: (lambda: bogling(P)))(P) for P in BOG_WALK + BOG_ATTACK + [dict()]], "cols": 4, "rows": 2, "target": (40, 330, 472, 740)},
    "golem": {"frames": [(lambda P: (lambda: golem(P)))(P) for P in GOLEM_WALK + GOLEM_ATTACK + [dict()]], "cols": 4, "rows": 2, "target": (10, 60, 502, 744)},
    "recurve": (recurve, WEAPON_TARGET), "bonebow": (bonebow, WEAPON_TARGET),
    "broadsword": (broadsword, WEAPON_TARGET), "flamberge": (flamberge, WEAPON_TARGET),
    "crookstaff": (crookstaff, WEAPON_TARGET), "skullstaff": (skullstaff, WEAPON_TARGET),
    "tome": (tome, (70, 330, 442, 744)), "everlantern": (everlantern, (150, 250, 362, 744)),
    "bonemail": (bonemail, (100, 400, 432, 740)), "shardplate": (shardplate, (100, 400, 432, 740)),
    "shard": (shard_item, (130, 380, 382, 740)), "bone": (bone_item, (70, 470, 442, 740)), "spore": (spore_item, (120, 400, 392, 740)),
    "elixir": (elixir, (140, 390, 372, 740)), "heartstone": (heartstone, (110, 400, 402, 740)),
}
# Square inventory icons, with long weapons turned diagonal.
ICONS = {k: rot(SPRITES[k][0], 40) for k in ("recurve", "bonebow", "broadsword", "flamberge", "crookstaff", "skullstaff")}
ICONS.update({k: SPRITES[k][0] for k in ("tome", "everlantern", "bonemail", "shardplate", "shard", "bone", "spore", "elixir", "heartstone", "shardrock", "bones", "glowcap")})
# Projectiles use a wide cell.
WIDE = {"arrow": arrow, "mbolt": mbolt}
