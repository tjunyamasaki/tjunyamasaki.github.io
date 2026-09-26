"""Buildable structures. Fire, hearth, cauldron, lantern and ward have 4-frame idle loops."""
import math
from lib import *
import lib
from nodes import crystal, pumpkin_body, DIRT, DIRT_D, DIRT_L, STRAW, STRAW_D, STRAW_L

LOG = "#7a4a3a"; LOG_E = "#c98a5a"; IRON = "#3e3a48"; IRON_D = "#2a2632"; IRON_L = "#5d5870"
BREW = "#9fbf6a"; BREW_D = "#6f8f4e"; BREW_L = "#d4e59a"


def stones_ring(cx, cy, rx, ry, n, rr, front, seed=0):
    out = ""
    for i in range(n):
        a = math.pi * 2 * i / n + 0.15
        x = cx + rx * math.cos(a); y = cy + ry * math.sin(a)
        if (math.sin(a) > 0.05) == front:
            out += fill(blob(x, y, rr * (1 + 0.15 * ((i * 7) % 3 - 1)), rr * 0.62, 7, 0.12, seed + i), RK if i % 2 else RK_D, 6)
            out += brush((x - rr * .5, y - rr * .2), (x - rr * .1, y - rr * .5), (x + rr * .4, y - rr * .35), 4, RK_L, .8)
    return out


def campfire(phase):
    d = []; b = ""
    b += fill_ns("M110 700 Q256 660 402 700 Q256 740 110 700 Z", "#2a2030", 0.55)
    b += stones_ring(256, 694, 140, 48, 10, 30, False)
    b += G(flame(256, 690, 135, 240 + 12 * math.sin(phase * 2 * math.pi), phase, 1), 0, 0)
    b += rrect(180, 674, 160, 30, 12, LOG, 7, (14, 260, 689)) + rrect(172, 674, 160, 30, 12, LOG, 7, (-14, 252, 689))
    b += ell(180, 706, 10, 13, LOG_E, 5) + ell(336, 706, 10, 13, LOG_E, 5)
    b += stones_ring(256, 694, 140, 48, 10, 30, True)
    for i, (x, y) in enumerate([(210, 420), (300, 380), (256, 340)]):
        t = (phase + i * 0.33) % 1
        b += f'<circle cx="{f(x + 10 * math.sin(t * 6))}" cy="{f(y - t * 60)}" r="{f(5 * (1 - t) + 1)}" fill="{FL_I}" stroke="none" opacity="{1 - t:.2f}"/>'
    return d, b


def hearth(phase):
    d = []; b = ""
    # standing stones behind
    for x, rot, sd in [(104, -8, 1), (408, 8, 2)]:
        st = smooth([(x - 42, 700), (x - 48, 540), (x - 32, 400), (x, 360), (x + 32, 400), (x + 46, 540), (x + 42, 700)])
        b += f'<g transform="rotate({rot} {x} 700)">' + shaded(d, st, RK_D, "#57536c", -10, -6, brush((x - 20, 420), (x - 28, 500), (x - 26, 600), 7, RK)) + '</g>'
        rune = f"M{x} 430 L{x} 540 M{x - 18} 452 L{x} 474 L{x + 18} 452 M{x - 16} 510 L{x + 16} 510"
        glow = 0.65 + 0.35 * math.sin(2 * math.pi * (phase + (0.5 if x > 256 else 0)))
        b += f'<g transform="rotate({rot} {x} 700)">' + line(rune, 12) + line(rune, 5, CR, f' opacity="{glow:.2f}"') + '</g>'
    # brazier bowl of stacked stones
    base = "M140 736 L150 660 Q256 628 362 660 L372 736 Q256 752 140 736 Z"
    b += shaded(d, base, RK, RK_D, -14, -10)
    for i, x in enumerate([176, 226, 280, 332]):
        b += line(f"M{x} 664 L{x + 6} 736", 5)
    b += line("M146 700 Q256 716 366 700", 5)
    b += G(flame(256, 648, 125, 280 + 14 * math.sin(phase * 2 * math.pi), phase, 3))
    bowl = "M130 656 Q256 610 382 656 L372 680 Q256 650 140 680 Z"
    b += fill(bowl, IRON, 7) + brush((170, 650), (256, 628), (340, 650), 6, IRON_L)
    b += gem(256, 700, 16, CR, CR_D, CR_L)
    for i, (x, y) in enumerate([(200, 330), (310, 300), (250, 250), (330, 380)]):
        t = (phase + i * 0.25) % 1
        b += f'<circle cx="{f(x + 12 * math.sin(t * 6 + i))}" cy="{f(y - t * 80)}" r="{f(6 * (1 - t) + 1)}" fill="{FL_I}" stroke="none" opacity="{1 - t:.2f}"/>'
    return d, b


def bench():
    d = []; b = ""
    # legs
    for x0, x1 in [(150, 140), (370, 382)]:
        b += fill(f"M{x0 - 14} 560 L{x0 + 14} 560 L{x1 + 12} 736 L{x1 - 14} 736 Z", WD_D, 7)
    b += fill("M170 640 L346 640 L346 660 L170 660 Z", WD_D, 6)
    top = "M110 520 L402 520 Q414 520 414 532 L414 560 Q414 572 402 572 L110 572 Q98 572 98 560 L98 532 Q98 520 110 520 Z"
    b += shaded(d, top, WD, WD_D, 0, -8, brush((130, 532), (256, 526), (380, 532), 7, WD_L))
    b += line("M200 522 L200 570 M300 522 L300 570", 4, WD_D)
    # saw
    b += fill("M170 520 L176 440 Q240 420 300 440 L300 520 Z", MT, 7) + brush((190, 470), (240, 450), (290, 460), 6, MT_L)
    b += line("M176 510 L182 500 L188 510 L194 500 L200 510 L206 500 L212 510", 3)
    b += rrect(292, 430, 44, 26, 10, TRK, 6)
    # hammer
    b += rrect(338, 440, 16, 82, 6, WD, 6, (20, 346, 480)) + rrect(318, 426, 58, 28, 6, IRON, 6, (20, 346, 440))
    # vise / clamp
    b += rrect(112, 486, 36, 36, 6, IRON, 6) + line("M118 500 L142 500", 4, IRON_L)
    return d, b


def chest():
    d = []; b = ""
    body = "M120 560 L392 560 L392 720 Q392 736 376 736 L136 736 Q120 736 120 720 Z"
    b += shaded(d, body, WD, WD_D, 10, 0, brush((140, 600), (140, 660), (148, 716), 7, WD_L))
    lid = "M112 560 Q112 440 256 436 Q400 440 400 560 Z"
    b += shaded(d, lid, "#9a6446", WD_D, -10, -10, brush((150, 520), (180, 466), (256, 454), 8, WD_L))
    b += line("M114 560 L398 560", 8)
    for x in (170, 342):
        b += fill(f"M{x - 14} {442 if x < 256 else 442} Q{x - 14} 480 {x - 14} 560 L{x - 14} 736 L{x + 14} 736 L{x + 14} 560 Q{x + 14} 480 {x + 14} 444 Z", GOLD, 6)
        b += brush((x - 4, 470), (x - 5, 580), (x - 4, 720), 4, GOLD_L)
    b += rrect(232, 548, 48, 56, 10, GOLD, 7) + fill("M256 566 m-7 0 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0 M252 572 L248 592 L264 592 L260 572 Z", O, 3)
    for y in (620, 680):
        b += line(f"M186 {y} L326 {y}", 4, WD_D)
    return d, b


def palisade():
    d = []; b = ""
    xs = [116, 196, 276, 356]
    for i, x in enumerate(xs):
        h = [300, 250, 280, 240][i]
        log = f"M{x - 36} 736 L{x - 36} {h + 70} L{x} {h} L{x + 36} {h + 70} L{x + 36} 736 Z"
        b += shaded(d, log, WD if i % 2 else "#94613f", WD_D, -8, 0, brush((x - 20, h + 110), (x - 22, 480), (x - 20, 700), 7, WD_L))
        b += line(f"M{x + 8} {h + 150} L{x + 12} {h + 220}", 4, WD_D)
    for y in (470, 620):
        beam = f"M72 {y} L400 {y - 14} L400 {y + 18} L72 {y + 32} Z"
        b += fill(beam, TRK, 7) + brush((96, y + 8), (240, y + 2), (380, y - 6), 5, TRK_L)
        for x in xs:
            b += line(f"M{x - 12} {y - 10} L{x + 12} {y + 40} M{x + 12} {y - 10} L{x - 12} {y + 40}", 5, STRAW)
    return d, b


def gate():
    d = []; b = ""
    for x in (108, 404):
        post = f"M{x - 34} 736 L{x - 34} 330 L{x} 270 L{x + 34} 330 L{x + 34} 736 Z"
        b += shaded(d, post, "#94613f", WD_D, -8, 0, brush((x - 18, 360), (x - 20, 500), (x - 18, 700), 7, WD_L))
    door = "M150 420 L362 410 L362 700 L150 706 Z"
    b += shaded(d, door, TRK, TRK_D, 0, -10)
    for x in (202, 256, 310):
        b += line(f"M{x} 418 L{x} 704", 5, TRK_D)
    b += fill("M160 440 L186 424 L352 680 L326 696 Z", WD, 6) + fill("M352 432 L326 420 L160 680 L186 694 Z", WD, 6)
    b += brush((180, 446), (260, 560), (340, 674), 5, WD_L)
    for y in (440, 670):
        b += rrect(146, y - 12, 220, 24, 6, IRON, 6)
    b += f'<circle cx="330" cy="560" r="18" fill="none" stroke="{GOLD}" stroke-width="{sw(9)}"/><circle cx="330" cy="560" r="18" fill="none" stroke-width="{sw(3)}" stroke-dasharray="0"/>'
    return d, b


THORN = "#e3d6b4"; VINE = "#4f3a3a"; VINE_L = "#7a5a52"

def trap():
    d = []; b = ""
    b += fill(blob(256, 700, 180, 46, 12, 0.08, 4), DIRT_D, 6)
    ring = []
    for i in range(12):
        a = math.pi * 2 * i / 12
        x = 256 + 150 * math.cos(a); y = 690 + 38 * math.sin(a)
        ring.append((x, y))
    def spikes(front):
        s = ""
        for i, (x, y) in enumerate(ring):
            if (y > 690) != front:
                continue
            h = 110 + 30 * ((i * 5) % 3)
            lean = (x - 256) * 0.35
            s += fill(f"M{f(x - 16)} {f(y)} Q{f(x - 6 + lean * .4)} {f(y - h * .6)} {f(x + lean)} {f(y - h)} Q{f(x + 8 + lean * .4)} {f(y - h * .5)} {f(x + 16)} {f(y)} Z", THORN, 6)
            s += brush((x - 6, y - 10), (x - 2 + lean * .3, y - h * .5), (x + lean * .9, y - h + 10), 3, "#ffffff", .7)
        return s
    b += spikes(False)
    vine = smooth(ring)
    b += f'<path d="{vine}" fill="none" stroke-width="{sw(34)}"/><path d="{vine}" fill="none" stroke="{VINE}" stroke-width="{sw(18)}"/>'
    b += ell(256, 694, 30, 14, RD, 6) + ell(248, 690, 8, 4, "#f08c80", 0)
    b += spikes(True)
    for (x, y) in [(150, 700), (360, 686), (256, 732)]:
        b += leaf(x, y, 60, 1.3, VINE_L)
    return d, b


def farm():
    d = []; b = ""
    plot = "M60 690 Q70 620 256 612 Q442 620 452 690 Q442 750 256 752 Q70 750 60 690 Z"
    b += shaded(d, plot, DIRT, DIRT_D, -8, -12)
    for i, y in enumerate((650, 684, 718)):
        b += line(f"M{110 + i * 6} {y} Q256 {y - 14} {402 - i * 6} {y}", 7, DIRT_D) + brush((120, y + 8), (256, y - 4), (392, y + 8), 5, DIRT_L, .8)
    # sprout
    b += line("M256 690 Q250 640 262 600", 8) + line("M256 690 Q250 640 262 600", 3, LEAF)
    b += fill("M262 604 Q220 560 196 588 Q226 616 262 604 Z", LEAF, 6) + fill("M262 604 Q300 548 332 574 Q304 612 262 604 Z", LEAF_L, 6)
    b += line("M262 604 Q232 590 206 590 M262 604 Q292 584 322 578", 3, LEAF_D)
    b += fill("M120 640 L136 600 L150 640 Z", STRAW, 4) + fill("M380 650 L394 612 L408 650 Z", STRAW, 4)
    return d, b


def cauldron(phase):
    d = []; b = ""
    for x0, x1 in [(170, 150), (342, 362)]:
        b += line(f"M{x0} 660 L{x1} 736", 26) + line(f"M{x0} 660 L{x1} 736", 12, IRON)
    body = "M130 520 Q110 720 256 724 Q402 720 382 520 Z"
    b += shaded(d, body, IRON, IRON_D, 12, -8, brush((150, 560), (150, 640), (200, 700), 8, IRON_L))
    b += ell(256, 520, 138, 36, IRON_L)
    b += ell(256, 522, 112, 24, BREW, 5)
    for i in range(4):
        t = (phase + i * 0.25) % 1
        x = 196 + i * 40
        r = 6 + 12 * math.sin(t * math.pi)
        b += f'<circle cx="{x}" cy="{f(520 - 4 * math.sin(t * math.pi))}" r="{f(r)}" fill="{BREW_L}" stroke-width="{sw(4)}" opacity="{0.4 + 0.6 * math.sin(t * math.pi):.2f}"/>'
    b += brush((180, 514), (240, 506), (300, 510), 5, BREW_L)
    for x in (116, 396):
        b += f'<path d="M{x} 540 Q{x + (-30 if x < 256 else 30)} 560 {x} 590" fill="none" stroke-width="{sw(16)}"/><path d="M{x} 540 Q{x + (-30 if x < 256 else 30)} 560 {x} 590" fill="none" stroke="{IRON_L}" stroke-width="{sw(6)}"/>'
    for i, x in enumerate((220, 292)):
        t = (phase + i * .5) % 1
        y = 470 - t * 90
        b += f'<path d="M{x} {f(y)} q-16 -24 0 -48 q16 -24 0 -48" fill="none" stroke="{BONE}" stroke-width="{sw(7)}" opacity="{(1 - t) * .8:.2f}"/>'
    return d, b


def soul_lantern(phase):
    d = []; b = ""
    post = limb((250, 740), (238, 560), (262, 330), 30, 22)
    arm = limb((262, 340), (300, 290), (346, 318), 16, 10)
    b += union([post, arm], WD)
    b += brush((258, 700), (246, 560), (266, 360), 7, WD_L)
    b += line("M346 318 L346 350", 6)
    # lantern
    x = 346
    b += fill(f"M{x - 36} 380 Q{x} 344 {x + 36} 380 Z", IRON, 7)
    glass = f"M{x - 32} 380 L{x + 32} 380 L{x + 28} 470 L{x - 28} 470 Z"
    b += fill(glass, "#c9f2e8", 7)
    fl = 1 + 0.08 * math.sin(phase * 2 * math.pi)
    b += fill(f"M{x} {f(460 - 62 * fl)} Q{x + 22} {f(440 - 20 * fl)} {x + 14} 452 Q{x} 468 {x - 14} 452 Q{x - 22} {f(440 - 20 * fl)} {x} {f(460 - 62 * fl)} Z", CR, 5)
    b += fill(f"M{x} {f(460 - 34 * fl)} Q{x + 10} 446 {x + 6} 454 Q{x} 462 {x - 6} 454 Q{x - 10} 446 {x} {f(460 - 34 * fl)} Z", CR_L, 3)
    b += line(f"M{x - 12} 382 L{x - 10} 468 M{x + 12} 382 L{x + 10} 468", 4)
    b += rrect(x - 38, 468, 76, 16, 6, IRON, 6)
    b += brush((x - 22, 392), (x - 24, 420), (x - 20, 456), 5, "#ffffff", .7)
    b += fill_ns(f"M{x} 320 m-90 100 a90 90 0 1 0 180 0 a90 90 0 1 0 -180 0", CR, 0.10 + 0.05 * math.sin(phase * 2 * math.pi))
    b += fill(blob(250, 740, 50, 12, 7, .2, 3), MOSS_D, 5)
    return d, b


BED = MAR; BED_D = MAR_D; BED_L = MAR_L

def bedroll():
    d = []; b = ""
    mat = "M60 700 Q60 640 130 632 L420 612 Q460 614 458 660 L452 700 Q448 736 400 738 L110 744 Q62 742 60 700 Z"
    b += shaded(d, mat, STRAW, STRAW_D, 0, -10)
    for x in (120, 180, 240, 300, 360, 420):
        b += line(f"M{x} {640 - (x - 120) * .07} L{x - 6} {738 - (x - 120) * .01}", 3, STRAW_D)
    blanket = "M170 628 L438 612 Q456 640 446 700 L180 716 Q160 670 170 628 Z"
    b += shaded(d, blanket, BED, BED_D, 0, -10, brush((190, 640), (300, 628), (420, 624), 7, BED_L))
    b += line("M260 624 L266 712 M350 618 L352 706", 4, BED_D)
    b += fill("M300 640 L330 638 L332 668 L302 670 Z", ORG, 5)
    # rolled end
    b += ell(166, 670, 48, 44, BED, 7) + f'<path d="M166 670 m-24 0 a24 22 0 1 0 48 0 a18 16 0 1 0 -36 0" fill="none" stroke-width="{sw(5)}"/>'
    # pillow
    b += fill(blob(110, 640, 62, 30, 8, .08, 2), CLOTH, 7) + brush((80, 628), (110, 618), (140, 626), 5, "#ffffff", .7)
    return d, b


def ward(phase):
    d = []; b = ""
    pole = "M226 740 L232 380 L282 380 L288 740 Z"
    b += shaded(d, pole, WD, WD_D, -8, 0, brush((240, 420), (238, 560), (242, 720), 6, WD_L))
    for y in (470, 610):
        b += rrect(220, y, 74, 20, 6, TRK, 6)
    head = smooth([(176, 400), (180, 300), (210, 240), (256, 220), (302, 240), (332, 300), (336, 400), (300, 430), (212, 430)])
    b += shaded(d, head, RK, RK_D, -12, -8, brush((200, 300), (212, 262), (246, 242), 7, RK_L))
    glow = 0.6 + 0.4 * math.sin(phase * 2 * math.pi)
    b += fill("M200 300 L246 318 Q248 350 222 350 Q198 346 200 318 Z", CR_D, 5) + fill("M312 300 L266 318 Q264 350 290 350 Q314 346 312 318 Z", CR_D, 5)
    b += f'<circle cx="224" cy="330" r="7" fill="{CR_L}" stroke="none" opacity="{glow:.2f}"/><circle cx="288" cy="330" r="7" fill="{CR_L}" stroke="none" opacity="{glow:.2f}"/>'
    b += line("M226 390 L240 380 L256 392 L272 380 L286 390", 5)
    b += crystal(256, 240, 16, 40, 0)
    # hanging charms
    for x, col in [(206, MAR), (306, ORG)]:
        b += line(f"M{x} 430 L{x} 500", 4) + fill(f"M{x - 12} 500 L{x + 12} 500 L{x + 6} 560 L{x - 6} 560 Z", col, 5)
    for i in range(3):
        a = 2 * math.pi * (phase + i / 3)
        b += sparkle(256 + 110 * math.cos(a), 300 + 40 * math.sin(a), 1.1, CR_L, 0.9)
    return d, b


def anim(fn, n=4):
    return [(lambda k: (lambda: fn(k / n)))(k) for k in range(n)]


SPRITES = {
    "fire": {"icon": True, "frames": anim(campfire), "cols": 4, "rows": 1, "target": "fire"},
    "hearth": {"icon": True, "frames": anim(hearth), "cols": 4, "rows": 1, "target": "hearth"},
    "bench": (bench, "bench"),
    "chest": (chest, "chest"),
    "wall": (palisade, "wall"),
    "gate": (gate, "gate"),
    "trap": (trap, "trap"),
    "farm": (farm, "farm"),
    "pot": {"icon": True, "frames": anim(cauldron), "cols": 4, "rows": 1, "target": "pot"},
    "lantern": {"icon": True, "frames": anim(soul_lantern), "cols": 4, "rows": 1, "target": (150, 204, 440, 744)},
    "bed": (bedroll, "bed"),
    "ward": {"icon": True, "frames": anim(ward), "cols": 4, "rows": 1, "target": "ward"},
}
