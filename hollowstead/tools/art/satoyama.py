"""Satoyama: the valley farm and the wilds of the Shrine of Yomi (src/satoyama).

Drawn in the house style (lib.py: one ink outline in world units, flat fills, a crescent shade,
tapered brush highlights) and the Yomi palette (yomi.py):

  weeds, twigs, pebbles, stump     the farm's clutter to clear
  ironseam, saltcrust              what only the wilds give (the marsh's iron sand, the terrace's spring salt)
  yomi-grass, yomi-shrub           standing decoration (pampas grass, an azalea); the spider lilies are yomi.py's
  hen, hen-young, cow, cow-young   animals, 4 x 2 like the creatures: 0-3 walk, 4-6 peck/graze, 7 idle
  crop-daikon, crop-soybean        four growth stages (homestead.py's layout)
  coop, barn                       the animal houses
  y-bench, y-chest, y-fire,        the camp pieces as Satoyama draws them (src/satoyama/view.mjs YOMI_SKINS):
  y-pot, y-bed                     a carpenter's bench, a tansu chest, an irori fire, a kama, a futon
  items                            bamboo, iron sand, spring salt, egg, milk, daikon, soybeans, their seeds, dishes

    python3 tools/art/build.py --only weeds,twigs,...   (registered like every other module)
    python3 tools/art/satoyama.py --theme               (writes their theme.json entries)
"""
import json, math, os, random, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from lib import *
import lib
from yomi import (VERM, VERM_D, VERM_L, SAK, SAK_D, SAK_L, STRAW as YSTRAW, STRAW_D as YSTRAW_D, STRAW_L as YSTRAW_L,
                  PAPER, PAPER_D, PAPER_L, LACQ, LACQ_D, LACQ_L, PINE, PINE_D, PINE_L, BAMB, BAMB_D, BAMB_N, rope, shide, higanbana, river_stone)
from homestead import mound, soil_lip, longleaf, stalk, bundle, cotyledons, bowl, GREEN, GREEN_D, GREEN_L, SOIL, SOIL_D, SOIL_L

GRASS = "#9aa86a"; GRASS_D = "#6f7c48"; GRASS_L = "#c6cf8e"
PLUME = "#e8dcc0"; PLUME_D = "#c4b393"
TWIG = "#7a5640"; TWIG_D = "#553a2c"; TWIG_L = "#a77c5c"
IRON = "#3e3b4a"; IRON_D = "#28252f"; IRON_L = "#6c6880"; RUST = "#a8573a"
SALT = "#f2efe6"; SALT_D = "#c9c3b4"; SULF = "#e6cf5a"; SULF_D = "#b79c32"
FEATH = "#f4ece0"; FEATH_D = "#cfc2ae"; COMB = "#d0443a"; BEAK = "#e8a63a"
HIDE = "#f1e9dc"; HIDE_D = "#c9bba6"; SPOT = "#3a3240"; NOSE = "#e8a6a0"; HORN = "#efe2c4"
CHICK = "#f5d567"; CHICK_D = "#c9a63a"
DAIKON = "#f4f1ea"; DAIKON_D = "#cfc8bb"
SOY = "#8fb05a"; SOY_D = "#62803c"; BEAN = "#d8c47a"; BEAN_D = "#a8924a"
TANSU = "#7a4a34"; TANSU_D = "#55301f"; TANSU_L = "#a46a4c"; IRONF = "#3a3540"
TATAMI = "#c9c08a"; TATAMI_D = "#9f9764"; FUTON = "#5a6fa8"; FUTON_D = "#3e5084"; FUTON_L = "#8ea0d0"
ASHBOX = "#6b6170"


# ------------------------------------------------------------------ the farm's clutter
def weeds():
    """A clump of wild weeds and a stalk of pampas grass: what grows over an abandoned field."""
    d = []; b = ""
    r = random.Random(3)
    parts = []
    for k in range(9):
        x = 196 + k * 15 + r.uniform(-6, 6); lean = (k - 4) * 9 + r.uniform(-6, 6); h = 120 + r.uniform(0, 90) - abs(k - 4) * 10
        parts.append((ribbon((x, 744), (x + lean * .3, 744 - h * .55), (x + lean, 744 - h), lambda t: 22 * (1 - t) ** .8 + 2), GRASS if k % 3 else GRASS_D))
    b += bundle(parts, 7)
    for x, lean, h in ((236, -30, 260), (290, 26, 230)):
        b += stalk((x, 744), (x + lean * .3, 744 - h * .6), (x + lean, 744 - h), 8, YSTRAW_D, YSTRAW_D)
        tip = (x + lean, 744 - h)
        b += fill(f"M{tip[0]} {tip[1] + 70} Q{tip[0] + 30} {tip[1] + 20} {tip[0] + lean * .3} {tip[1] - 30} Q{tip[0] - 26} {tip[1] + 20} {tip[0]} {tip[1] + 70} Z", PLUME, 6)
        b += brush((tip[0] - 6, tip[1] + 50), (tip[0] + 4, tip[1] + 10), (tip[0] + lean * .2, tip[1] - 20), 5, PAPER_L)
    b += brush((210, 720), (220, 660), (232, 620), 5, GRASS_L, .8)
    return d, b


def twigs():
    """Fallen branches in a heap, a few dry leaves among them."""
    d = []; b = ""
    for (x0, y0, x1, y1, w) in ((150, 716, 360, 690, 26), (176, 690, 340, 724, 22), (200, 676, 316, 650, 18), (240, 734, 380, 712, 16)):
        b += fill(limb((x0, y0), ((x0 + x1) / 2, min(y0, y1) - 14), (x1, y1), w, w * .65), TWIG, 7)
        b += brush((x0 + 20, y0 - w * .25), ((x0 + x1) / 2, min(y0, y1) - 18), (x1 - 30, y1 - w * .2), 4, TWIG_L, .8)
        b += ell(x0, y0, w * .42, w * .5, TWIG_L, 5)
    b += line("M260 680 L270 640 L290 626 M300 700 L326 666", 7, TWIG_D)
    for (x, y, a, c) in ((214, 664, 30, "#c9884a"), (330, 650, -40, "#a8573a"), (182, 730, 70, "#d6a44a")):
        b += G(fill("M0 -18 Q14 0 0 18 Q-14 0 0 -18 Z", c, 5), x, y, a, 1.1)
    return d, b


def pebbles():
    """A spill of loose stones in the grass."""
    d = []; b = ""
    b += river_stone(d, 300, 740, 58, 40, RK, RK_D, False, 3)
    b += river_stone(d, 210, 742, 46, 32, RK_D, "#58546f", False, 5)
    b += river_stone(d, 372, 742, 30, 20, RK, RK_D, False, 8)
    b += river_stone(d, 150, 742, 24, 16, RK, RK_D, False, 9)
    b += bundle([(ribbon((x, 744), (x + 4, 720), (x + l, 700), lambda t: 12 * (1 - t) + 2), GRASS) for x, l in ((250, -10), (340, 8), (182, 6))], 6)
    return d, b


def stump():
    """An old cedar stump, cut flat, rings showing, moss on its shoulder and a little mushroom at its foot."""
    d = []; b = ""
    body = "M150 744 Q160 680 168 580 L344 580 Q352 680 362 744 Q330 724 300 744 Q256 716 212 744 Q180 726 150 744 Z"
    b += shaded(d, body, TWIG, TWIG_D, 14, 0, brush((182, 720), (186, 660), (192, 600), 8, TWIG_L))
    b += line("M220 600 Q214 660 222 720 M280 600 Q290 650 284 716 M318 610 Q326 660 322 700", 6, TWIG_D)
    b += ell(256, 580, 90, 30, "#d8b07a", 7) + ell(256, 580, 60, 19, "#c09a62", 4) + ell(256, 580, 30, 9, "#a8824e", 4)
    b += fill(blob(196, 590, 40, 16, 8, .2, 4), MOSS, 6) + fill_ns(blob(190, 584, 24, 7, 7, .2, 5), MOSS_L, .9)
    b += fill("M372 744 L370 712 L382 712 L380 744 Z", BONE, 5) + fill("M350 716 Q376 680 402 716 Z", VERM, 6)
    b += f'<circle cx="368" cy="704" r="5" fill="{BONE}" stroke="none"/><circle cx="386" cy="700" r="4" fill="{BONE}" stroke="none"/>'
    return d, b


# ------------------------------------------------------------------ what only the wilds give
def ironseam():
    """A dark rock split by a seam of glittering black iron sand, rust bleeding from it."""
    d = []; b = ""
    st = blob(256, 650, 170, 108, 11, .08, 21, flat=740)
    b += shaded(d, st, IRON_L, IRON, -12, -10, brush((140, 620), (180, 570), (250, 556), 8, "#9a96ad"))
    seam = "M120 690 Q180 640 230 660 Q280 680 320 620 Q350 590 392 600 L398 620 Q352 616 326 646 Q284 704 228 684 Q178 668 128 712 Z"
    b += fill(seam, IRON_D, 6)
    b += fill_ns("M180 670 Q200 700 190 740 Q172 712 166 680 Z M330 640 Q340 690 326 736 Q318 690 318 650 Z", RUST, .8)
    for (x, y, s) in ((200, 662, .9), (262, 666, 1.2), (330, 626, .8), (372, 606, 1.0), (150, 694, .7)):
        b += sparkle(x, y, s, "#e8e4f8")
    b += fill(blob(380, 738, 40, 18, 7, .2, 2), IRON, 6) + fill(blob(126, 740, 30, 12, 7, .2, 3), IRON_L, 6)
    return d, b


def saltcrust():
    """Spring salt crusting a stone by the hot springs: white crystals, a yellow stain of sulphur, a wisp of steam."""
    d = []; b = ""
    b += river_stone(d, 256, 742, 130, 70, RK, RK_D, False, 31)
    crust = "M150 700 Q170 640 220 646 Q250 600 300 630 Q350 610 368 670 Q380 712 340 716 Q256 730 168 718 Z"
    b += fill(crust, SALT, 7)
    b += fill_ns("M200 690 Q230 660 270 680 Q250 700 210 704 Z", SULF, .9) + fill_ns("M300 660 Q330 650 344 676 Q320 690 300 676 Z", SULF_D, .6)
    for (x, y, h) in ((210, 650, 54), (250, 620, 70), (296, 632, 60), (338, 646, 46)):
        b += fill(f"M{x - 16} {y + 20} L{x - 6} {y - h + 20} L{x + 8} {y - h + 30} L{x + 16} {y + 20} Z", SALT, 5)
        b += brush((x - 6, y + 12), (x - 4, y - h * .4 + 20), (x, y - h + 30), 4, "#ffffff", .9)
    for x in (230, 320):
        b += f'<path d="M{x} 600 q-16 -24 0 -48 q16 -24 0 -48" fill="none" stroke="{BONE}" stroke-width="{sw(8)}" opacity=".7"/>'
    return d, b


# ------------------------------------------------------------------ decoration
def yomi_grass():
    """Pampas grass (susuki): a fan of blades and silver plumes bowing in the wind."""
    d = []; b = ""
    r = random.Random(9)
    parts = []
    for k in range(11):
        a = -70 + k * 14 + r.uniform(-5, 5); h = 190 + r.uniform(-40, 40) - abs(k - 5) * 12
        x1, y1 = 256 + math.sin(math.radians(a)) * h, 744 - math.cos(math.radians(a)) * h
        parts.append((ribbon((256 + (k - 5) * 6, 744), (256 + (x1 - 256) * .4, 744 - h * .6), (x1, y1), lambda t: 20 * (1 - t) ** .8 + 2), GRASS if k % 2 else GRASS_D))
    b += bundle(parts, 7)
    for (a, h) in ((-28, 330), (-6, 380), (16, 350), (34, 300)):
        x1, y1 = 256 + math.sin(math.radians(a)) * h, 744 - math.cos(math.radians(a)) * h
        b += stalk((256, 744), (256 + (x1 - 256) * .3, 744 - h * .5), (x1, y1), 7, YSTRAW_D, YSTRAW_D)
        b += G(fill("M0 0 Q26 -40 14 -100 Q40 -60 44 -20 Q30 10 0 0 Z", PLUME, 6) + brush((10, -10), (24, -50), (20, -84), 5, PAPER_L), x1, y1, a + 40)
    return d, b


def yomi_shrub():
    """A clipped azalea (tsutsuji) bush covered in pink flowers."""
    d = []; b = ""
    body = cloud(256, 640, 170, 100, 11, 5)
    b += shaded(d, body, PINE, PINE_D, -10, -12, brush((130, 620), (170, 570), (240, 552), 8, PINE_L))
    r = random.Random(12)
    for k in range(22):
        a = r.uniform(0, math.pi * 2); rr = math.sqrt(r.random())
        x, y = 256 + math.cos(a) * rr * 140, 640 + math.sin(a) * rr * 74 - 10
        rad = 13 + r.uniform(-3, 4)
        ps = "".join(f'<ellipse cx="{f(x + math.cos(t) * rad * .55)}" cy="{f(y + math.sin(t) * rad * .55)}" rx="{f(rad * .5)}" ry="{f(rad * .4)}" fill="{SAK if k % 3 else SAK_D}" stroke="none"/>'
                     for t in [i * 2 * math.pi / 5 for i in range(5)])
        b += ps + f'<circle cx="{f(x)}" cy="{f(y)}" r="3.5" fill="{SAK_L}" stroke="none"/>'
    b += ell(256, 742, 150, 12, PINE_D, 6)
    return d, b


# ------------------------------------------------------------------ animals
def hen(P):
    """A plump white hen with a red comb. P: step (walk phase), peck (0..1), bob."""
    d = []; b = ""
    st = P.get("step", 0); pk = P.get("peck", 0); by = P.get("by", 0)
    # legs
    for i, x in enumerate((230, 280)):
        ph = math.sin(st * math.pi * 2 + i * math.pi)
        fx = x + ph * 16
        b += line(f"M{x} 660 L{f(fx)} 736", 9, BEAK) + line(f"M{f(fx - 20)} 740 L{f(fx + 22)} 740 M{f(fx)} 740 L{f(fx + 8)} 726", 7, BEAK)
    body = f"M150 {600 + by} Q140 520 210 500 Q270 488 312 520 Q350 548 360 600 Q362 660 300 676 Q220 690 172 660 Q146 640 150 {600 + by} Z"
    tail = f"M176 {600 + by} Q110 590 100 520 Q96 470 130 450 Q150 500 170 510 Q168 460 196 440 Q206 490 222 530 Z"
    b += shaded(d, tail, FEATH, FEATH_D, 8, 0) + shaded(d, body, FEATH, FEATH_D, 12, -10, brush((180, 620 + by), (220, 650 + by), (290, 656 + by), 7, "#ffffff"))
    b += fill(f"M200 {580 + by} Q250 560 290 600 Q260 630 214 620 Z", FEATH_D, 5)
    # head: dips down to peck
    hx, hy = 330 + pk * 34, 470 + by + pk * 170
    neck = f"M300 {540 + by} Q{f(hx - 20)} {f(hy + 50)} {f(hx - 10)} {f(hy + 20)} L{f(hx + 30)} {f(hy + 30)} Q{f(hx + 10)} {f(hy + 90)} 350 {580 + by} Z"
    b += fill(neck, FEATH, 6)
    b += ell(hx, hy, 44, 42, FEATH, 7)
    b += fill(f"M{f(hx - 20)} {f(hy - 36)} Q{f(hx - 14)} {f(hy - 74)} {f(hx)} {f(hy - 46)} Q{f(hx + 8)} {f(hy - 78)} {f(hx + 18)} {f(hy - 44)} Q{f(hx + 30)} {f(hy - 66)} {f(hx + 30)} {f(hy - 32)} Z", COMB, 6)
    b += fill(f"M{f(hx + 38)} {f(hy - 6)} L{f(hx + 76)} {f(hy + 6)} L{f(hx + 38)} {f(hy + 16)} Z", BEAK, 5)
    b += fill(f"M{f(hx + 30)} {f(hy + 18)} Q{f(hx + 40)} {f(hy + 46)} {f(hx + 22)} {f(hy + 44)} Q{f(hx + 14)} {f(hy + 30)} {f(hx + 30)} {f(hy + 18)} Z", COMB, 5)
    b += f'<circle cx="{f(hx + 14)}" cy="{f(hy - 6)}" r="7" fill="{O}" stroke="none"/><circle cx="{f(hx + 12)}" cy="{f(hy - 9)}" r="2.5" fill="#ffffff" stroke="none"/>'
    return d, b


def chick(P):
    """A round yellow chick."""
    d = []; b = ""
    st = P.get("step", 0); pk = P.get("peck", 0); by = P.get("by", 0)
    for i, x in enumerate((236, 276)):
        fx = x + math.sin(st * math.pi * 2 + i * math.pi) * 12
        b += line(f"M{x} 680 L{f(fx)} 738", 8, BEAK) + line(f"M{f(fx - 14)} 740 L{f(fx + 16)} 740", 7, BEAK)
    b += shaded(d, f"M256 {560 + by} a90 80 0 1 0 0.1 0 Z", CHICK, CHICK_D, 10, -10, brush((196, 660 + by), (220, 690 + by), (280, 694 + by), 6, "#fff2b0"))
    b += fill(f"M196 {640 + by} Q170 620 180 600 Q206 610 220 630 Z", CHICK_D, 5)
    hx, hy = 300 + pk * 20, 586 + by + pk * 70
    b += fill(f"M{f(hx + 18)} {f(hy)} L{f(hx + 46)} {f(hy + 8)} L{f(hx + 18)} {f(hy + 16)} Z", BEAK, 5)
    b += f'<circle cx="{f(hx)}" cy="{f(hy - 4)}" r="7" fill="{O}" stroke="none"/><circle cx="{f(hx - 2)}" cy="{f(hy - 7)}" r="2.5" fill="#ffffff" stroke="none"/>'
    b += line(f"M{f(hx - 30)} {f(hy - 70)} Q{f(hx - 20)} {f(hy - 100)} {f(hx - 6)} {f(hy - 84)}", 6, CHICK_D)
    return d, b


def cow(P):
    """A black-and-white dairy cow, side on. P: step (walk phase), graze (0..1: head down)."""
    d = []; b = ""
    st = P.get("step", 0); gz = P.get("peck", 0); by = P.get("by", 0)
    for i, x in enumerate((140, 186, 326, 372)):
        ph = math.sin(st * math.pi * 2 + (i % 2) * math.pi + (i // 2) * math.pi * .5)
        fx = x + ph * 14
        b += fill(f"M{x - 16} 600 L{f(fx - 14)} 728 L{f(fx + 14)} 728 L{x + 16} 600 Z", HIDE if i % 2 else HIDE_D, 7)
        b += rrect(fx - 17, 722, 34, 20, 5, SPOT, 6)
    tail = f"M110 {500 + by} Q90 560 96 640 Q100 660 112 656 Q110 580 124 {520 + by} Z"
    b += fill(tail, HIDE, 6) + fill("M90 640 Q100 680 116 650 Q110 630 96 630 Z", SPOT, 5)
    body = f"M112 {520 + by} Q110 450 180 446 L340 446 Q404 450 410 520 Q414 600 360 616 L160 616 Q112 600 112 {520 + by} Z"
    spots = f"M170 {470 + by} Q220 450 240 500 Q230 540 186 530 Q150 516 170 {470 + by} Z M290 470 Q340 456 352 500 Q330 520 300 510 Z M240 560 Q280 540 300 580 Q270 600 240 590 Z"
    b += shaded(d, body, HIDE, HIDE_D, 10, -12, clipped(d, body, fill_ns(spots, SPOT)) + brush((140, 560), (180, 600), (260, 606), 8, "#ffffff"))
    b += fill(f"M240 616 Q256 650 280 616 Z", NOSE, 5)
    hx, hy = 420 + gz * 20, 440 + by + gz * 210
    b += fill(f"M380 {470 + by} Q{f(hx - 20)} {f(hy)} {f(hx)} {f(hy + 10)} L{f(hx + 20)} {f(hy + 60)} Q{f(hx - 20)} {f(hy + 70)} 400 {540 + by} Z", HIDE, 6)
    head = f"M{f(hx - 40)} {f(hy - 30)} Q{f(hx)} {f(hy - 50)} {f(hx + 40)} {f(hy - 24)} L{f(hx + 54)} {f(hy + 50)} Q{f(hx + 40)} {f(hy + 84)} {f(hx + 6)} {f(hy + 80)} Q{f(hx - 30)} {f(hy + 70)} {f(hx - 40)} {f(hy - 30)} Z"
    b += shaded(d, head, HIDE, HIDE_D, 6, -6, clipped(d, head, fill_ns(f"M{f(hx - 50)} {f(hy - 40)} Q{f(hx)} {f(hy - 10)} {f(hx - 10)} {f(hy + 30)} L{f(hx - 50)} {f(hy + 40)} Z", SPOT)))
    b += rrect(hx - 16, hy + 46, 74, 40, 18, NOSE, 6) + f'<circle cx="{f(hx + 4)}" cy="{f(hy + 64)}" r="5" fill="{O}" stroke="none"/><circle cx="{f(hx + 34)}" cy="{f(hy + 64)}" r="5" fill="{O}" stroke="none"/>'
    b += fill(f"M{f(hx - 36)} {f(hy - 26)} Q{f(hx - 64)} {f(hy - 30)} {f(hx - 74)} {f(hy - 6)} Q{f(hx - 50)} {f(hy)} {f(hx - 32)} {f(hy - 10)} Z", HIDE_D, 5)
    if not P.get("young"):
        b += fill(f"M{f(hx - 14)} {f(hy - 40)} Q{f(hx - 22)} {f(hy - 70)} {f(hx - 6)} {f(hy - 80)} Q{f(hx - 2)} {f(hy - 60)} {f(hx + 4)} {f(hy - 42)} Z", HORN, 5)
        b += fill(f"M{f(hx + 22)} {f(hy - 36)} Q{f(hx + 26)} {f(hy - 66)} {f(hx + 42)} {f(hy - 72)} Q{f(hx + 40)} {f(hy - 52)} {f(hx + 36)} {f(hy - 32)} Z", HORN, 5)
    b += f'<circle cx="{f(hx + 22)}" cy="{f(hy + 8)}" r="8" fill="{O}" stroke="none"/><circle cx="{f(hx + 20)}" cy="{f(hy + 4)}" r="3" fill="#ffffff" stroke="none"/>'
    if not P.get("young"):
        b += rrect(270, 470 + by, 26, 16, 6, VERM, 5) + f'<circle cx="283" cy="{500 + by}" r="10" fill="{GOLD}" stroke-width="{sw(5)}"/>'
    return d, b


def calf(P):
    """A calf: the cow's coat on a short body, no horns, no bell, and a head drawn half again as big."""
    d, b = cow({**P, "young": True})
    gz = P.get("peck", 0); hx, hy = 420 + gz * 20, 440 + P.get("by", 0) + gz * 210
    return d, f'<g transform="translate({f(hx)} {f(hy + 30)}) scale(1 .78) translate({f(-hx)} {f(-hy - 30)})">{b}</g>'



def animal_frames(fn, peck_key="peck"):
    walk = [(lambda k: (lambda: fn({"step": k / 4, "by": -6 * abs(math.sin(k * math.pi / 2))})))(k) for k in range(4)]
    peck = [(lambda v: (lambda: fn({peck_key: v})))(v) for v in (.45, 1.0, .6)]
    idle = [lambda: fn({})]
    return walk + peck + idle


# ------------------------------------------------------------------ crops: daikon, soybean
def daikon_leaves(x, y, n, L, spread, col=GREEN, alt=GREEN_D):
    b = ""
    for i in range(n):
        t = (i / (n - 1) - .5) if n > 1 else 0
        b += longleaf(x + t * 20, y, t * spread, L * (1 - abs(t) * .3), 40, col if i % 2 else alt, GREEN_L if i % 2 else None)
    return b


def daikon_root(d, x, y, s):
    body = f"M{x - 46 * s} {y - 70 * s} Q{x} {y - 86 * s} {x + 46 * s} {y - 70 * s} Q{x + 50 * s} {y + 40 * s} {x + 6 * s} {y + 130 * s} Q{x - 2 * s} {y + 140 * s} {x - 8 * s} {y + 124 * s} Q{x - 50 * s} {y + 40 * s} {x - 46 * s} {y - 70 * s} Z"
    out = shaded(d, body, DAIKON, DAIKON_D, -8 * s, -6 * s, line(f"M{x - 30 * s} {y - 20 * s} Q{x - 10 * s} {y - 14 * s} {x + 6 * s} {y - 22 * s} M{x - 20 * s} {y + 40 * s} Q{x} {y + 46 * s} {x + 18 * s} {y + 36 * s}", 3.5, DAIKON_D, ' opacity=".8"'))
    out += fill_ns(f"M{x - 44 * s} {y - 70 * s} Q{x} {y - 86 * s} {x + 44 * s} {y - 70 * s} L{x + 44 * s} {y - 40 * s} Q{x} {y - 50 * s} {x - 44 * s} {y - 40 * s} Z", "#c9e0a0", .9)
    out += brush((x - 30 * s, y - 50 * s), (x - 34 * s, y + 10 * s), (x - 16 * s, y + 80 * s), 6, "#ffffff")
    return out


def daikon_0():
    d = []; b = mound(56)
    b += cotyledons(256, 736, .8, h=40)
    return d, b


def daikon_1():
    d = []; b = mound(76)
    b += daikon_leaves(256, 736, 4, 130, 100)
    return d, b


def daikon_2():
    d = []; b = mound(92)
    b += daikon_leaves(256, 690, 5, 180, 110)
    b += daikon_root(d, 256, 720, .45) + soil_lip(74)
    return d, b


def daikon_3():
    d = []; b = mound(104)
    b += daikon_leaves(256, 610, 6, 220, 120)
    b += daikon_root(d, 256, 666, .8) + soil_lip(92)
    return d, b


def bean_pod(x, y, a, s=1.0):
    p = "M0 0 Q20 -10 46 -6 Q70 0 78 20 Q50 22 24 18 Q4 14 0 0 Z"
    return G(fill(p, BEAN if s > .9 else SOY, 5) + "".join(f'<circle cx="{18 + k * 18}" cy="8" r="6" fill="{BEAN_D if s > .9 else SOY_D}" stroke="none" opacity=".6"/>' for k in range(3)), x, y, a, s)


def soy_leaf(x, y, a, s, col=SOY):
    p = "M0 0 Q-24 -30 0 -70 Q24 -30 0 0 Z"
    return G(fill(p, col, 5) + line("M0 -4 L0 -62", 3, SOY_D), x, y, a, s)


def soy_bush(n, h, pods=0, ripe=False):
    b = ""
    r = random.Random(n)
    for k in range(n):
        a = -40 + k * 80 / max(1, n - 1)
        x1, y1 = 256 + math.sin(math.radians(a)) * h, 740 - math.cos(math.radians(a)) * h
        b += stalk((256, 740), (256 + (x1 - 256) * .4, 740 - h * .6), (x1, y1), 8, SOY_D, SOY_D)
        for j in range(3):
            b += soy_leaf(x1 + (j - 1) * 6, y1 + 8, (j - 1) * 50 + a * .3, .9 + r.random() * .3, (BEAN if ripe and j == 1 else SOY) if not ripe else ("#c9b46a" if j % 2 else SOY))
    for k in range(pods):
        a = -30 + k * 60 / max(1, pods - 1)
        x, y = 256 + math.sin(math.radians(a)) * h * .55 - 30, 740 - h * .5 + (k % 2) * 20
        b += bean_pod(x, y, a * .6 + 20, 1.0 if ripe else .85)
    return b


def soybean_0():
    d = []; b = mound(56)
    b += cotyledons(256, 736, .7, col=SOY, light=GREEN_L, h=46)
    return d, b


def soybean_1():
    d = []; b = mound(70)
    b += soy_bush(3, 120)
    return d, b


def soybean_2():
    d = []; b = mound(84)
    b += soy_bush(5, 190, pods=3)
    return d, b


def soybean_3():
    d = []; b = mound(96)
    b += soy_bush(6, 230, pods=6, ripe=True)
    return d, b


# ------------------------------------------------------------------ the animal houses
def coop():
    """A little chicken coop on stilts: plank walls, a thatched roof, a ramp, straw in the doorway."""
    d = []; b = ""
    for x in (120, 392):
        b += rrect(x - 10, 600, 20, 144, 4, TWIG_D, 6)
    house = "M100 620 L100 430 L412 430 L412 620 Z"
    b += shaded(d, house, TWIG_L, TWIG, -14, 0, "".join(line(f"M100 {y} L412 {y}", 4, TWIG) for y in (476, 524, 572)))
    b += rrect(150, 486, 90, 134, 6, LACQ_D, 7) + fill("M154 620 Q196 596 236 620 Z", YSTRAW, 5)
    b += f'<circle cx="320" cy="500" r="30" fill="{LACQ_D}" stroke-width="{sw(7)}"/>'
    b += fill("M240 620 L360 744 L392 744 L270 620 Z", TWIG, 6) + line("M262 640 L292 640 M290 668 L320 668 M318 698 L348 698", 5, TWIG_D)
    roof = "M60 444 Q130 400 180 340 L256 270 L332 340 Q382 400 452 444 Q440 460 420 456 Q360 420 330 380 L256 312 L182 380 Q152 420 92 456 Q72 460 60 444 Z"
    b += shaded(d, "M60 444 L256 262 L452 444 Q256 470 60 444 Z", YSTRAW, YSTRAW_D, 0, -12, "".join(line(f"M{x} 450 L{256 + (x - 256) * .2} 290", 4, YSTRAW_D) for x in range(90, 430, 36)))
    b += brush((110, 430), (180, 370), (240, 300), 7, YSTRAW_L)
    b += rope((100, 430), (256, 452), (412, 430), 14)
    b += ell(150, 742, 70, 8, YSTRAW_D, 5) + ell(380, 742, 40, 6, YSTRAW_D, 5)
    return d, b


def barn():
    """A long barn: dark timber walls, a white plaster band, a tiled gable roof and a wide sliding door."""
    d = []; b = ""
    wall = "M40 744 L40 470 L472 470 L472 744 Z"
    b += shaded(d, wall, TANSU, TANSU_D, -14, 0, "".join(line(f"M{x} 470 L{x} 744", 4, TANSU_D) for x in range(70, 472, 40)))
    b += rrect(40, 470, 432, 60, 2, PAPER, 6) + line("M40 530 L472 530", 6)
    b += shaded(d, "M180 744 L180 560 L332 560 L332 744 Z", LACQ, LACQ_D, -10, 0)
    b += line("M180 560 L332 744 M332 560 L180 744", 7, LACQ_L) + rrect(170, 548, 172, 16, 4, LACQ_L, 6)
    b += rrect(70, 570, 70, 50, 4, LACQ_D, 6) + rrect(372, 570, 70, 50, 4, LACQ_D, 6) + line("M105 570 L105 620 M407 570 L407 620", 5, TANSU)
    roof = "M8 480 L120 330 L392 330 L504 480 Q256 500 8 480 Z"
    b += shaded(d, roof, IRON_L, IRON, 0, -14, "".join(line(f"M{x} 486 L{256 + (x - 256) * .55} 336", 4, IRON) for x in range(30, 490, 30)))
    b += rrect(110, 316, 292, 24, 8, IRON, 7) + brush((40, 470), (100, 400), (150, 340), 7, "#9a96ad")
    b += rrect(222, 380, 68, 50, 6, PAPER, 6) + tomoe(256, 405, 18, VERM)
    b += ell(110, 742, 60, 8, YSTRAW_D, 5) + fill("M400 744 L420 690 L460 690 L470 744 Z", YSTRAW, 6)
    return d, b


def tomoe(x, y, r, col):
    from yomi import tomoe as t
    return t(x, y, r, col)


# ------------------------------------------------------------------ the camp, Satoyama's way
def y_bench():
    """A carpenter's bench: a heavy plank on trestles, a saw, a plane and a chisel, shavings below."""
    d = []; b = ""
    for x in (150, 362):
        b += fill(f"M{x - 34} 744 L{x - 10} 600 L{x + 10} 600 L{x + 34} 744 Z", TWIG, 7) + line(f"M{x - 26} 700 L{x + 26} 700", 6, TWIG_D)
    top = "M90 610 L90 570 L422 570 L422 610 Z"
    b += shaded(d, top, TWIG_L, TWIG, 0, -8, brush((110, 580), (250, 576), (400, 580), 6, "#d6a67a"))
    b += fill("M140 570 L170 520 L300 520 L320 570 Z", "#b9b4c6", 6) + line("M150 556 L310 556", 4, "#7d7f96")
    b += rrect(300, 470, 26, 64, 6, TWIG_D, 6) + fill("M180 520 L176 470 Q186 452 200 470 L196 520 Z", TWIG_D, 5)
    b += rrect(340, 540, 70, 30, 6, TANSU_L, 6) + fill("M352 540 L370 520 L392 540 Z", "#b9b4c6", 5)
    for (x, y) in ((200, 740), (240, 734), (330, 742), (290, 744)):
        b += line(f"M{x} {y} q14 -14 28 0", 6, "#d6a67a")
    return d, b


def y_chest():
    """A tansu chest: dark wood, two drawers and a door, black iron fittings."""
    d = []; b = ""
    body = "M120 744 L120 520 L392 520 L392 744 Z"
    b += shaded(d, body, TANSU, TANSU_D, -12, 0, brush((136, 720), (134, 620), (140, 536), 7, TANSU_L))
    b += rrect(110, 506, 292, 24, 4, TANSU_L, 7)
    for y in (540, 600):
        b += rrect(136, y, 240, 50, 4, TANSU_L, 6) + rrect(232, y + 16, 48, 18, 8, IRONF, 5)
    b += rrect(136, 660, 116, 76, 4, TANSU_L, 6) + rrect(260, 660, 116, 76, 4, TANSU_L, 6)
    b += rrect(234, 682, 16, 30, 4, IRONF, 4) + rrect(262, 682, 16, 30, 4, IRONF, 4)
    for (x, y) in ((126, 512), (386, 512), (126, 736), (386, 736)):
        b += rrect(x - 14, y - 14, 28, 28, 4, IRONF, 5)
    return d, b


def y_fire(k):
    """An irori fire: a sunken hearth framed in wood, embers in grey ash, a kettle on its hook."""
    d = []; b = ""
    b += f'<circle cx="256" cy="640" r="150" fill="{FL_M}" opacity="{.14 + .05 * math.sin(2 * math.pi * k):.2f}" stroke="none"/>'
    frame = "M70 744 L110 664 L402 664 L442 744 Z"
    b += shaded(d, frame, TWIG_L, TWIG, 0, -6)
    b += fill("M120 734 L144 680 L368 680 L392 734 Z", ASHBOX, 6)
    for (x, r) in ((210, 22), (256, 28), (302, 22)):
        b += ell(x, 712, r, 10, "#a8573a", 5)
    b += flame(256, 712, 120 + 10 * math.sin(2 * math.pi * k), 120 + 16 * math.cos(2 * math.pi * k), k, 4)
    b += line("M256 260 L256 520", 7, TWIG_D) + rrect(236, 470, 40, 24, 6, TWIG, 5)
    kettle = "M200 600 Q190 530 256 520 Q322 530 312 600 Q300 626 256 628 Q212 626 200 600 Z"
    b += shaded(d, kettle, IRON_L, IRON, 10, -6, brush((214, 580), (220, 548), (246, 534), 6, "#9a96ad"))
    b += line("M216 528 Q256 480 296 528", 7) + line("M312 560 Q348 548 352 520", 9, IRON)
    for x in (230, 284):
        b += f'<path d="M{x} 500 q-14 -22 0 -44 q14 -22 0 -44" fill="none" stroke="{BONE}" stroke-width="{sw(7)}" opacity="{.6 + .3 * math.sin(2 * math.pi * k + x):.2f}"/>'
    return d, b


def y_pot(k):
    """A kama: an iron rice pot with a wooden lid on a little clay stove (kamado), fire glowing in its mouth."""
    d = []; b = ""
    stove = "M120 744 L130 600 Q256 570 382 600 L392 744 Z"
    b += shaded(d, stove, "#c08a62", "#93603e", -12, 0, brush((140, 720), (140, 660), (150, 610), 7, "#e0b08a"))
    b += fill("M210 744 L210 690 Q256 650 302 690 L302 744 Z", LACQ_D, 6)
    b += flame(256, 736, 70 + 8 * math.sin(2 * math.pi * k), 54 + 10 * math.cos(2 * math.pi * k), k, 2)
    pot = "M150 600 Q140 520 256 512 Q372 520 362 600 Q340 616 256 616 Q172 616 150 600 Z"
    b += shaded(d, pot, IRON_L, IRON, 10, -8, brush((170, 590), (176, 548), (220, 526), 6, "#9a96ad"))
    b += ell(256, 560, 128, 12, IRON, 6)
    b += ell(256, 512, 104, 24, TWIG_L, 7) + rrect(232, 478, 48, 26, 8, TWIG, 6)
    for x in (210, 300):
        b += f'<path d="M{x} 470 q-14 -22 0 -44 q14 -22 0 -44" fill="none" stroke="{BONE}" stroke-width="{sw(7)}" opacity="{.55 + .3 * math.sin(2 * math.pi * k + x):.2f}"/>'
    return d, b


def y_bed():
    """A futon on a tatami mat: a blue quilt, a white pillow."""
    d = []; b = ""
    b += shaded(d, "M40 744 L80 640 L472 640 L496 744 Z", TATAMI, TATAMI_D, 0, -8, line("M70 700 L480 700", 4, TATAMI_D))
    b += fill("M40 744 L496 744 L492 756 L44 756 Z", "#2e4a3a", 6)
    b += shaded(d, "M150 724 Q140 666 190 652 L452 652 Q478 690 470 724 Z", FUTON, FUTON_D, 0, -10, brush((200, 670), (320, 662), (440, 668), 7, FUTON_L))
    b += line("M230 652 Q240 690 228 724 M320 652 Q330 690 320 724 M410 652 Q420 690 410 724", 5, FUTON_D)
    b += shaded(d, "M80 712 Q76 670 120 664 Q170 660 176 690 Q178 716 130 720 Q90 722 80 712 Z", PAPER_L, PAPER_D, 4, -6)
    return d, b


# ------------------------------------------------------------------ items
def bamboo_item():
    d = []; b = ""
    for i, (x, rot) in enumerate(((220, -14), (262, 4), (300, 18))):
        culm = "M-22 120 L-18 -170 L18 -170 L22 120 Z"
        g = fill(culm, BAMB if i != 1 else "#9cc07a", 7) + "".join(line(f"M-20 {y} Q0 {y + 8} 20 {y}", 6, BAMB_N) for y in (-90, 10)) + ell(0, -170, 18, 7, BAMB_D, 6)
        b += G(g, x, 600, rot)
    b += rope((180, 610), (256, 640), (334, 610), 14)
    return d, b


def ironsand():
    d = []; b = ""
    b += fill("M120 720 Q140 650 256 640 Q372 650 392 720 Q256 750 120 720 Z", IRON_D, 7)
    b += fill_ns("M150 708 Q200 670 256 668 Q320 670 360 708 Q256 724 150 708 Z", IRON, .9)
    for (x, y, s) in ((200, 690, 1.1), (262, 670, 1.4), (318, 696, 1.0), (240, 708, .7)):
        b += sparkle(x, y, s, "#e8e4f8")
    return d, b


def springsalt():
    d = []; b = ""
    b += fill("M150 730 Q160 690 210 680 L302 680 Q352 690 362 730 Q256 750 150 730 Z", PAPER_D, 7)
    for (x, y, h) in ((210, 690, 90), (256, 680, 120), (300, 690, 96), (234, 700, 60), (284, 702, 66)):
        b += fill(f"M{x - 20} {y + 20} L{x - 8} {y - h + 20} L{x + 10} {y - h + 36} L{x + 20} {y + 20} Z", SALT, 6)
        b += brush((x - 8, y + 10), (x - 4, y - h * .4 + 20), (x, y - h + 34), 4, "#ffffff", .9)
    b += fill_ns("M200 716 Q230 700 262 712 Q240 724 210 726 Z", SULF, .9)
    return d, b


def egg_item():
    d = []; b = ""
    for (x, y, s) in ((206, 690, .8), (296, 670, 1.0)):
        e = f"M{x} {y - 90 * s} Q{x + 66 * s} {y - 70 * s} {x + 62 * s} {y + 10 * s} Q{x + 54 * s} {y + 60 * s} {x} {y + 62 * s} Q{x - 54 * s} {y + 60 * s} {x - 62 * s} {y + 10 * s} Q{x - 66 * s} {y - 70 * s} {x} {y - 90 * s} Z"
        b += shaded(d, e, "#f6eedd", "#d6c6a8", 8, -6, brush((x - 34 * s, y - 40 * s), (x - 40 * s, y), (x - 26 * s, y + 34 * s), 6, "#ffffff"))
    b += ell(256, 742, 120, 8, YSTRAW_D, 5)
    return d, b


def milk_item():
    d = []; b = ""
    jug = "M190 744 Q160 680 180 600 L200 540 L190 500 L322 500 L312 540 L332 600 Q352 680 322 744 Z"
    b += shaded(d, jug, "#efe6d8", "#c9bba6", 10, -6, brush((200, 720), (190, 640), (210, 560), 7, "#ffffff"))
    b += rrect(184, 480, 144, 30, 10, TWIG, 6) + rope((190, 560), (256, 580), (322, 560), 12)
    b += fill("M220 616 L292 616 L292 684 L220 684 Z", PAPER_L, 6) + tomoe(256, 650, 18, VERM)
    return d, b


def daikon_item():
    d = []; b = ""
    b += longleaf(250, 530, -26, 150, 44, GREEN) + longleaf(262, 530, 24, 140, 42, GREEN_D) + longleaf(256, 530, 0, 170, 40, GREEN_L)
    b += daikon_root(d, 256, 600, 1.0)
    return d, b


def seeds_item(col, dark, light, shape="round"):
    def draw():
        d = []; b = ""
        for (x, y, r) in [(222, 668, 30), (292, 660, 26), (256, 712, 28), (190, 718, 20), (318, 712, 22)]:
            if shape == "round":
                b += f'<circle cx="{x}" cy="{y}" r="{r}" fill="{col}" stroke-width="{sw(6)}"/>'
            else:
                b += ell(x, y, r * 1.1, r * .8, col, 6, rot=-20)
            b += f'<path d="M{x - r * .7} {y - r * .1} A{r * .7} {r * .7} 0 0 1 {x + r * .4} {y - r * .6}" fill="none" stroke="{light}" stroke-width="{sw(5)}"/>'
            b += f'<circle cx="{x + r * .25}" cy="{y + r * .3}" r="{r * .18}" fill="{dark}" stroke="none"/>'
        return d, b
    return draw


def soybean_item():
    d = []; b = ""
    for (x, y, a) in ((180, 640, 10), (240, 600, -20), (230, 680, 30)):
        b += bean_pod(x, y, a, 1.6)
    for (x, y, r) in [(330, 690, 26), (372, 708, 22), (300, 722, 20)]:
        b += f'<circle cx="{x}" cy="{y}" r="{r}" fill="{BEAN}" stroke-width="{sw(6)}"/>' + f'<circle cx="{x - r * .3}" cy="{y - r * .3}" r="{r * .25}" fill="#f2e2a6" stroke="none"/>'
    return d, b


def plate(d, b):
    return b + ell(256, 712, 170, 34, PAPER_L, 7) + ell(256, 708, 130, 22, PAPER, 4)


def tamagoyaki():
    d = []; b = ""
    b = plate(d, b)
    roll = "M130 690 L130 610 Q130 590 150 590 L362 590 Q382 590 382 610 L382 690 Q382 706 362 706 L150 706 Q130 706 130 690 Z"
    b += shaded(d, roll, "#f2cf5a", "#c9a03a", 0, -10, "".join(line(f"M{x} 596 L{x} 700", 4, "#d9b440") for x in (200, 256, 312)))
    b += brush((150, 610), (256, 600), (360, 610), 6, "#ffe9a0")
    b += fill("M300 600 L340 580 L320 630 Z", GREEN, 5)
    return d, b


def misosoup():
    d, b = bowl("#c9944e", "#e8b874", [(210, 616, PAPER_L, 16, 8), (280, 612, "#f4f1ea", 14, 7), (314, 628, GREEN, 12, 5), (244, 630, GREEN_D, 9, 4)])
    return d, b


def oden():
    d = []; b = ""
    b += fill("M90 640 L130 744 L382 744 L422 640 Z", LACQ, 7) + rrect(80, 628, 352, 22, 8, LACQ_L, 6)
    for (x, y, kind) in ((170, 610, "egg"), (256, 590, "daikon"), (340, 612, "egg")):
        b += line(f"M{x} {y + 40} L{x} {y - 120}", 6, TWIG_L)
        if kind == "egg":
            b += ell(x, y, 36, 46, "#e8c27a", 6) + ell(x, y + 6, 18, 20, "#f2cf5a", 4)
        else:
            b += ell(x, y, 48, 30, "#e0c48e", 6) + ell(x, y - 6, 40, 20, "#efd8a8", 4)
    b += brush((110, 700), (180, 720), (250, 730), 6, LACQ_L)
    return d, b


def purin():
    d = []; b = ""
    b = plate(d, b)
    body = "M170 700 L196 560 Q256 540 316 560 L342 700 Z"
    b += shaded(d, body, "#f2cf7a", "#d0a04a", 10, -6, brush((200, 680), (208, 620), (220, 576), 6, "#fff0b8"))
    b += fill("M196 560 Q256 536 316 560 Q312 600 256 600 Q200 600 196 560 Z", "#8a4a26", 6)
    b += fill_ns("M210 568 Q256 552 300 568 Q256 580 210 568 Z", "#b06a3a", .9)
    b += f'<circle cx="256" cy="540" r="14" fill="{VERM}" stroke-width="{sw(5)}"/>'
    return d, b


# ------------------------------------------------------------------ the showcase's display stand (src/showcase.mjs)
def showstand():
    """A low lacquered display stand with a red cloth: the showcase sets weapons and gear on it."""
    d = []; b = ""
    for x in (150, 362):
        b += fill(f"M{x - 16} 744 L{x - 12} 650 L{x + 12} 650 L{x + 16} 744 Z", LACQ, 6)
    top = "M100 664 L120 620 L392 620 L412 664 Z"
    b += shaded(d, top, LACQ_L, LACQ, 0, -8, brush((130, 630), (256, 626), (380, 630), 6, "#8a7a98"))
    b += fill("M150 622 L362 622 L354 680 Q256 692 158 680 Z", VERM, 6) + line("M170 650 L342 650", 4, VERM_D)
    b += rrect(90, 664, 332, 16, 4, LACQ_D, 6)
    return d, b


# ------------------------------------------------------------------ registry (tools/art/build.py), theme entries
CREATURE = {"walk": {"frames": [0, 1, 2, 3], "fps": 6}, "peck": {"frames": [4, 5, 6, 5], "fps": 4}, "idle": {"frames": [7], "fps": 1}}
STILL = {"idle": {"frames": [0], "fps": 1}}
ANIM4 = lambda fps: {"idle": {"frames": [0, 1, 2, 3], "fps": fps}}
ITEM = (120, 400, 392, 740)
SEED = (150, 520, 362, 740)
# key -> (spec for build.py, theme entry extras: size, clips, icon)
ART = {
    "weeds": ((weeds, (60, 400, 452, 744)), [1.5, 2.25], STILL, False),
    "twigs": ((twigs, (70, 560, 442, 746)), [1.5, 2.25], STILL, False),
    "pebbles": ((pebbles, (80, 600, 432, 746)), [1.5, 2.25], STILL, False),
    "stump": ((stump, (110, 480, 410, 746)), [1.8, 2.7], STILL, False),
    "ironseam": ((ironseam, (40, 420, 472, 746)), [2.4, 3.6], STILL, False),
    "saltcrust": ((saltcrust, (60, 440, 452, 746)), [2.0, 3.0], STILL, False),
    "yomi-grass": ((yomi_grass, (40, 260, 472, 744)), [1.9, 2.85], STILL, False),
    "yomi-shrub": ((yomi_shrub, (60, 420, 452, 746)), [2.2, 3.3], STILL, False),
    "yomi-lilies": ((higanbana, (100, 360, 412, 744)), [1.4, 2.1], STILL, False),
    "hen": (dict(frames=animal_frames(hen), cols=4, rows=2, target=(70, 330, 452, 744)), [1.4, 2.1], CREATURE, False),
    "hen-young": (dict(frames=animal_frames(chick), cols=4, rows=2, target=(130, 440, 382, 744)), [.9, 1.35], CREATURE, False),
    "cow": (dict(frames=animal_frames(cow), cols=4, rows=2, target=(20, 200, 492, 744)), [3.0, 4.5], CREATURE, False),
    "cow-young": (dict(frames=animal_frames(calf), cols=4, rows=2, target=(60, 320, 452, 744)), [2.0, 3.0], CREATURE, False),
    "crop-daikon": (dict(frames=[daikon_0, daikon_1, daikon_2, daikon_3], cols=4, rows=1, target=(60, 260, 452, 744)), [2.2, 3.3], STILL, False),
    "crop-soybean": (dict(frames=[soybean_0, soybean_1, soybean_2, soybean_3], cols=4, rows=1, target=(60, 240, 452, 744)), [2.2, 3.3], STILL, False),
    "coop": (dict(frames=[coop], cols=1, rows=1, target=(30, 230, 482, 746), icon=True), [3.0, 4.5], STILL, True),
    "barn": (dict(frames=[barn], cols=1, rows=1, target=(14, 300, 498, 746), icon=True), [4.6, 6.9], STILL, True),
    "y-bench": (dict(frames=[y_bench], cols=1, rows=1, target=(70, 420, 442, 746), icon=True), [2.028, 3.042], STILL, True),
    "y-chest": (dict(frames=[y_chest], cols=1, rows=1, target=(100, 470, 412, 746), icon=True), [1.794, 2.691], STILL, True),
    "y-fire": (dict(frames=[(lambda k: (lambda: y_fire(k / 4)))(k) for k in range(4)], cols=4, rows=1, target=(50, 260, 462, 746), icon=True), [2.6, 3.9], ANIM4(7), True),
    "y-pot": (dict(frames=[(lambda k: (lambda: y_pot(k / 4)))(k) for k in range(4)], cols=4, rows=1, target=(90, 360, 422, 746), icon=True), [2.5, 3.75], ANIM4(4), True),
    "y-bed": (dict(frames=[y_bed], cols=1, rows=1, target=(20, 560, 492, 746), icon=True), [2.5, 3.75], STILL, True),
    "bamboo-item": ((bamboo_item, ITEM), [1.1, 1.65], STILL, True),
    "ironsand": ((ironsand, SEED), [1.1, 1.65], STILL, True),
    "springsalt": ((springsalt, SEED), [1.1, 1.65], STILL, True),
    "egg": ((egg_item, SEED), [1.1, 1.65], STILL, True),
    "milk": ((milk_item, ITEM), [1.1, 1.65], STILL, True),
    "daikon": ((daikon_item, ITEM), [1.1, 1.65], STILL, True),
    "soybean": ((soybean_item, ITEM), [1.1, 1.65], STILL, True),
    "daikonseed": ((seeds_item("#e8dcc0", "#a89878", "#fffaf0"), SEED), [1.1, 1.65], STILL, True),
    "soyseed": ((seeds_item(BEAN, BEAN_D, "#f2e2a6", "oval"), SEED), [1.1, 1.65], STILL, True),
    "tamagoyaki": ((tamagoyaki, ITEM), [1.1, 1.65], STILL, True),
    "misosoup": ((misosoup, ITEM), [1.1, 1.65], STILL, True),
    "oden": ((oden, ITEM), [1.1, 1.65], STILL, True),
    "purin": ((purin, ITEM), [1.1, 1.65], STILL, True),
    "showstand": ((showstand, (80, 580, 432, 746)), [1.6, 2.4], STILL, False),
}
# Item sprites are drawn in the world and as an inventory icon; the houses and the camp have an icon for the build list.
ITEM_ICONS = ("bamboo-item", "ironsand", "springsalt", "egg", "milk", "daikon", "soybean", "daikonseed", "soyseed", "tamagoyaki", "misosoup", "oden", "purin")
SPRITES = {k: v[0] for k, v in ART.items()}
ICONS = {k: (SPRITES[k][0] if isinstance(SPRITES[k], tuple) else SPRITES[k]["frames"][0]) for k in ITEM_ICONS}
WIDE = {}
VERSION = "sato1"


def theme_entries():
    out = {}
    for key, (spec, size, clips, icon) in ART.items():
        cols = spec.get("cols", 1) if isinstance(spec, dict) else 1
        rows = spec.get("rows", 1) if isinstance(spec, dict) else 1
        e = {"src": f"./sprites/{key}.svg?v={VERSION}", "size": size, "anchor": [0.5, 0.04], "columns": cols, "rows": rows, "clips": clips}
        if icon:
            e["icon"] = f"./sprites/{key}-icon.svg?v={VERSION}"
        out[key] = e
    return out


def write_theme(root):
    """Merge Satoyama's sprites (and the Yomi wanderers) into themes/harvest/theme.json, keeping its order and indent."""
    path = os.path.join(root, "themes", "harvest", "theme.json")
    theme = json.load(open(path))
    theme["sprites"].update(theme_entries())
    for key in ("miko", "daoshi-wanderer"):
        theme["sprites"][key] = {"src": f"./sprites/{key}.svg?v={VERSION}", "size": [2.25, 3.38], "anchor": [0.5, 0.04], "columns": 8, "rows": 2,
                                 "clips": {"idle": {"frames": [0, 0, 0, 1, 0, 0], "fps": 2}, "walk": {"frames": [2, 3, 4, 5], "fps": 9},
                                           "attack": {"frames": [6, 7, 8], "fps": 10}, "gather": {"frames": [9, 10, 11, 10], "fps": 7},
                                           "dash": {"frames": [12], "fps": 1}, "down": {"frames": [13], "fps": 1}}}
    with open(path, "w") as out:
        json.dump(theme, out, indent=2, ensure_ascii=False)
        out.write("\n")
    print("theme.json: +", len(ART) + 2, "entries")


if __name__ == "__main__":
    if "--theme" in sys.argv:
        write_theme(os.path.abspath(os.path.join(HERE, "..", "..")))
