"""Inventory items, food and gear. Drawn at icon scale, fitted to the old footprints."""
import math
from lib import *
import lib
from nodes import pumpkin_body, STRAW, STRAW_D, STRAW_L, BERRY, BERRY_L, BUSH, BUSH_L
from structures import LOG, LOG_E, IRON, IRON_D, IRON_L


def wood():
    d = []; b = ""
    for (x, y, rot, col) in [(256, 640, -18, "#94613f"), (240, 690, 12, WD)]:
        lg = f"M-150 -34 L150 -34 Q166 -34 166 0 Q166 34 150 34 L-150 34 Z"
        body = shaded(d, lg, col, WD_D, 0, -8, brush((-130, -18), (0, -26), (130, -18), 6, WD_L))
        body += ell(-150, 0, 26, 34, LOG_E, 7) + f'<path d="M-150 0 m-12 0 a12 16 0 1 0 24 0 a8 11 0 1 0 -16 0" fill="none" stroke-width="{sw(4)}"/>'
        body += line("M-40 10 L40 6 M60 -12 L110 -14", 4, WD_D)
        b += G(body, x, y, rot)
    b += leaf(340, 590, 30, 1.6, ORG)
    return d, b


FLINT = "#6d6a86"; FLINT_D = "#4a475e"; FLINT_L = "#a6a3c2"

def stone():
    d = []; b = ""
    a = "M150 700 L180 590 L260 560 L300 610 L280 700 Z"
    b += shaded(d, a, FLINT, FLINT_D, -10, -8, line("M180 590 L230 640 L280 700 M230 640 L300 610", 4, FLINT_D))
    b += brush((184, 610), (206, 596), (240, 584), 6, FLINT_L)
    c = "M260 710 L290 630 L360 616 L380 690 Z"
    b += shaded(d, c, RK, RK_D, -10, -8, line("M290 630 L320 670 L380 690 M320 670 L360 616", 4, RK_D))
    b += brush((294, 646), (310, 632), (340, 626), 5, RK_L)
    return d, b


def soul():
    d = []; b = ""
    outer = "M256 740 Q170 736 168 660 Q170 600 212 580 Q206 620 228 632 Q220 560 272 500 Q274 560 306 580 Q314 556 306 530 Q350 580 344 650 Q340 736 256 740 Z"
    b += fill(outer, CR, 8) + fill("M256 724 Q208 720 206 672 Q210 640 232 628 Q236 660 252 664 Q250 620 276 590 Q282 630 300 646 Q310 700 256 724 Z", CR_L, 5)
    b += ell(238, 684, 6, 9, O, 0) + ell(274, 684, 6, 9, O, 0)
    b += sparkle(340, 540, 1.2, CR_L) + sparkle(170, 600, 0.9, CR_L)
    return d, b


SEED = "#efe0b6"; SEED_D = "#c8b07c"

def seed():
    d = []; b = ""
    for (x, y, rot) in [(230, 660, -20), (292, 680, 25)]:
        s = "M0 -60 Q34 -40 30 10 Q24 46 0 50 Q-24 46 -30 10 Q-34 -40 0 -60 Z"
        b += G(shaded(d, s, SEED, SEED_D, 6, -4, brush((-14, -30), (-18, 0), (-10, 30), 5, "#ffffff", .7)) + line("M0 -52 L0 40", 3, SEED_D), x, y, rot)
    return d, b


def berry():
    d = []; b = ""
    b += fill("M256 560 Q300 520 340 540 Q310 580 256 560 Z", BUSH, 6) + fill("M256 560 Q220 510 180 530 Q210 572 256 560 Z", BUSH_L, 6)
    b += line("M256 560 L256 610 M256 590 L220 620 M256 590 L296 616", 5)
    for (x, y, r) in [(220, 650, 32), (292, 646, 34), (256, 700, 36), (190, 706, 26), (322, 708, 28)]:
        b += f'<circle cx="{x}" cy="{y}" r="{r}" fill="{BERRY}" stroke-width="{sw(7)}"/>'
        b += f'<circle cx="{x - r * .35}" cy="{y - r * .35}" r="{r * .25}" fill="{BERRY_L}" stroke="none"/>'
    return d, b


MEAT = "#d9867e"; MEAT_D = "#b0585a"; MEAT_L = "#f2b0a4"
ROAST = "#a8592f"; ROAST_D = "#7a3a24"; ROAST_L = "#d88a4f"

def drumstick(d, col, dk, lt, cooked=False):
    b = ""
    bone = limb((310, 600), (350, 560), (380, 540), 26, 22)
    b += union([bone], BONE)
    b += fill(f'M372 520 m-16 0 a16 16 0 1 0 32 0 a16 16 0 1 0 -32 0', BONE, 6) + fill(f'M392 544 m-16 0 a16 16 0 1 0 32 0 a16 16 0 1 0 -32 0', BONE, 6)
    meat = "M150 700 Q120 620 190 580 Q260 540 320 590 Q340 640 290 690 Q230 740 150 700 Z"
    b += shaded(d, meat, col, dk, -10, -10, brush((176, 612), (214, 584), (262, 580), 8, lt))
    if cooked:
        b += line("M190 640 L230 620 M210 670 L260 646 M240 700 L290 668", 5, dk)
    else:
        b += fill_ns(blob(230, 650, 40, 22, 7, .2, 3), "#f7d0c4", .7)
    return b

def meat():
    d = []; return d, drumstick(d, MEAT, MEAT_D, MEAT_L)

def roast():
    d = []; b = ""
    plate = "M90 700 Q90 660 256 654 Q422 660 422 700 Q422 738 256 742 Q90 738 90 700 Z"
    b += shaded(d, plate, WD, WD_D, 0, -8) + line("M130 700 Q256 684 382 700", 4, WD_D)
    b += G(drumstick(d, ROAST, ROAST_D, ROAST_L, True), -10, 10, 0, 0.9)
    b += fill("M320 690 Q330 640 380 650 Q386 690 320 690 Z", "#e0813b", 6)
    return d, b


STEW = "#d07a3a"; STEW_L = "#f0a060"

def stew():
    d = []; b = ""
    bowl = "M110 620 Q120 740 256 742 Q392 740 402 620 Z"
    b += shaded(d, bowl, WD, WD_D, 10, -6, brush((140, 650), (170, 710), (230, 730), 7, WD_L))
    b += ell(256, 620, 148, 34, WD_D) + ell(256, 622, 126, 22, STEW, 5)
    for (x, y, c) in [(210, 618, "#e0813b"), (270, 612, BONE), (310, 626, "#9fbf6a"), (236, 630, MEAT_D)]:
        b += ell(x, y, 14, 7, c, 4)
    b += brush((190, 612), (240, 606), (290, 608), 4, STEW_L)
    for i, x in enumerate((210, 290)):
        b += f'<path d="M{x} 560 q-16 -24 0 -48 q16 -24 0 -48" fill="none" stroke="{BONE}" stroke-width="{sw(8)}" opacity=".85"/>'
    b += rrect(330, 520, 20, 110, 8, WD_L, 6, (30, 340, 575))
    return d, b


def bandage():
    d = []; b = ""
    b += fill("M270 690 Q360 700 420 660 L430 700 Q360 744 262 730 Z", CLOTH, 7) + line("M300 700 L304 728 M350 700 L356 724", 3, CLOTH_D)
    roll = "M130 700 L130 600 Q130 560 210 560 Q290 560 290 600 L290 700 Q290 740 210 740 Q130 740 130 700 Z"
    b += shaded(d, roll, CLOTH, CLOTH_D, 10, 0, brush((150, 610), (148, 660), (152, 710), 7, "#ffffff", .8))
    b += ell(210, 600, 80, 40, BONE, 7) + ell(210, 600, 30, 15, CLOTH_D, 5)
    b += rrect(186, 640, 48, 16, 4, RD, 5) + rrect(202, 624, 16, 48, 4, RD, 5)
    return d, b


def tool_handle(d, length=360, w0=28, w1=22):
    h = limb((0, 0), (8, -length / 2), (0, -length), w0, w1)
    return union([h], WD) + brush((6, -20), (12, -length / 2), (6, -length + 20), 6, WD_L) + rrect(-16, -110, 32, 70, 6, TRK, 6) + wraps(-15, 15, -110, -40, 4, TRK_D)


def axe():
    d = []; b = tool_handle(d)
    head = "M-6 -350 Q70 -380 100 -330 Q120 -280 100 -226 Q70 -270 -6 -262 Z"
    b += shaded(d, head, MT, MT_D, 0, 8, brush((20, -340), (70, -350), (96, -300), 7, MT_L))
    b += line("M100 -330 Q116 -280 100 -226", 6, MT_L)
    b += rrect(-20, -370, 40, 120, 10, IRON, 7)
    return d, G(b, 200, 740, 28)


def pick():
    d = []; b = tool_handle(d)
    head = "M-150 -300 Q-60 -392 0 -380 Q60 -392 150 -300 Q70 -350 0 -346 Q-70 -350 -150 -300 Z"
    b += shaded(d, head, MT, MT_D, 0, 10, brush((-110, -318), (-60, -366), (-10, -372), 7, MT_L))
    b += rrect(-22, -400, 44, 70, 10, IRON, 7)
    return d, G(b, 210, 740, 24)


def spear():
    d = []; b = ""
    h = limb((0, 0), (10, -250), (0, -500), 22, 18)
    b += union([h], WD) + brush((6, -20), (12, -250), (6, -480), 5, WD_L)
    b += rrect(-14, -150, 28, 60, 6, TRK, 6) + wraps(-13, 13, -150, -90, 4, TRK_D)
    tip = "M0 -640 L36 -540 L14 -490 L-14 -490 L-36 -540 Z"
    b += fill_ns(tip, MT_L) + fill_ns("M0 -640 L36 -540 L14 -490 L0 -490 Z", MT) + fill(tip, "none", 8) + line("M0 -630 L0 -500", 4, MT_D)
    b += fill("M-20 -500 L20 -500 L14 -470 L-14 -470 Z", GOLD, 6)
    b += fill("M-12 -470 Q-40 -430 -30 -390 Q-18 -410 -8 -404 Q-18 -440 4 -466 Z", MAR, 5)
    return d, G(b, 180, 740, 26)


def sword():
    d = []; b = ""
    bl_l = "M-26 0 L-26 -236 L0 -292 L0 0 Z"; bl_r = "M0 0 L0 -292 L26 -236 L26 0 Z"
    b += fill_ns(bl_l, MT_L) + fill_ns(bl_r, MT) + fill("M-26 0 L-26 -236 L0 -292 L26 -236 L26 0 Z", "none", 8)
    b += line("M0 -20 L0 -250", 5, MT_D) + brush((-16, -40), (-18, -140), (-12, -220), 5, "#ffffff", 0.9)
    guard = limb((-78, 24), (0, -14), (78, 24), 20, 20)
    b += fill(guard, "#8ab3c9", 7) + brush((-60, 12), (0, -8), (60, 12), 5, "#d9f0f7")
    b += fill("M-96 40 Q-90 10 -70 22 Q-84 26 -80 44 Z", "#8ab3c9", 5) + fill("M96 40 Q90 10 70 22 Q84 26 80 44 Z", "#8ab3c9", 5)
    b += rrect(-13, 20, 26, 92, 6, TRK, 6) + wraps(-12, 12, 20, 112, 6, TRK_D)
    b += gem(0, 4, 14, CR, CR_D, CR_L)
    b += f'<circle cx="0" cy="126" r="20" fill="#8ab3c9" stroke-width="{sw(7)}"/>' + fill("M-8 116 A12 12 0 1 0 8 136 A9 9 0 1 1 -8 116 Z", BONE, 3)
    b += sparkle(-40, -250, 1.1, "#ffffff")
    return d, G(b, 256, 560, 38)


BARK = "#8a5a3c"; BARK_D = "#5f3a2a"; BARK_L = "#b8805a"

def armor():
    d = []; b = ""
    body = "M170 460 L220 440 Q256 470 292 440 L342 460 L380 520 L350 560 L336 540 L340 720 Q256 744 172 720 L176 540 L162 560 L132 520 Z"
    b += shaded(d, body, BARK, BARK_D, 10, -6)
    for (y0, y1) in [(560, 600), (610, 650), (660, 700)]:
        b += line(f"M186 {y0} Q256 {y0 + 14} 326 {y0}", 5, BARK_D)
        b += brush((196, y0 + 14), (256, y0 + 26), (316, y0 + 14), 5, BARK_L)
    b += line("M204 470 L220 720 M308 470 L292 720", 10, TRK) + line("M204 470 L220 720 M308 470 L292 720", 4, TRK_D)
    b += rrect(236, 600, 40, 30, 6, GOLD, 5)
    b += leaf(150, 500, -30, 1.4, ORG) + leaf(362, 500, 30, 1.4, MAR)
    return d, b


SPRITES = {
    "wood": (wood, "wood"), "stone": (stone, "stone"), "soul": (soul, "soul"), "seed": (seed, "seed"),
    "berry": (berry, "berry"), "meat": (meat, "meat"), "roast": (roast, "roast"), "stew": (stew, "stew"),
    "bandage": (bandage, "bandage"), "axe": (axe, "axe"), "pick": (pick, "pick"), "spear": (spear, "spear"),
    "sword": (sword, "sword"), "armor": (armor, "armor"),
}
