"""Bags and the hushing stone: the forager's satchel, the delver's haversack, and the stone that sings the woods to sleep.

    python3 tools/art/build.py --only satchel,haversack,hushstone

Same ink style as the rest of the theme: thick outline, flat fill, one soft shade, a brush highlight.
"""
import math
from lib import *
from structures import anim
from frontier import halo

LEA = "#9a6a43"; LEA_D = "#6e4a2f"; LEA_L = "#c79362"
CANV = "#b8a27a"; CANV_D = "#8a7756"; CANV_L = "#ddc9a0"
ROPE = "#d8c08c"; ROPE_D = "#9c8458"
BRASS = "#e2b75a"; BRASS_D = "#a87c2c"
BONE = "#efe3c6"; BONE_D = "#c4b48e"
SHARD = "#9fc4ff"; SHARD_L = "#e6f0ff"
MOSS = "#6f8f45"; MOSS_D = "#4d6a2e"
RK = "#8a8494"; RK_D = "#5e5868"; RK_L = "#b4aebd"
HUM = "#9fd6c8"; HUM_L = "#e4fbf4"; HUM_D = "#4f9a8a"


def buckle(x, y, s=1):
    return (rrect(x - 16 * s, y - 14 * s, 32 * s, 28 * s, 5 * s, BRASS, 6)
            + line(f"M{x} {y - 10 * s} L{x} {y + 10 * s}", 5, BRASS_D))


def satchel():
    d = []; b = ""
    # Strap over the top.
    b += line("M150 520 Q256 300 362 520", 30) + line("M150 520 Q256 300 362 520", 18, LEA)
    b += line("M168 500 Q256 330 344 500", 4, LEA_L)
    body = smooth([(130, 520), (382, 520), (396, 600), (388, 712), (256, 728), (124, 712), (116, 600)])
    b += shaded(d, body, LEA, LEA_D, 10, -10, brush((150, 560), (146, 630), (156, 700), 8, LEA_L))
    # Stitching.
    b += line("M140 548 Q256 556 372 548", 3, LEA_L, ' stroke-dasharray="10 9"')
    # The flap.
    flap = smooth([(122, 516), (390, 516), (384, 600), (300, 640), (212, 640), (128, 600)])
    b += shaded(d, flap, LEA_L, LEA, 0, -12, brush((160, 540), (220, 560), (300, 556), 7, "#e0b07c"))
    b += buckle(256, 640, 1.1)
    # A sprig of herbs poking out.
    for (x, a) in ((166, -22), (184, -8)):
        b += line(f"M{x} 520 L{x + 40 * math.sin(math.radians(a))} 452", 6, MOSS_D)
        b += leaf(x + 40 * math.sin(math.radians(a)), 442, a, 3.4, MOSS)
    return d, b


def haversack():
    d = []; b = ""
    # Shoulder straps behind.
    b += line("M190 420 Q170 560 196 700", 26) + line("M190 420 Q170 560 196 700", 14, LEA_D)
    b += line("M322 420 Q342 560 316 700", 26) + line("M322 420 Q342 560 316 700", 14, LEA_D)
    body = smooth([(150, 420), (362, 420), (392, 520), (398, 690), (256, 734), (114, 690), (120, 520)])
    b += shaded(d, body, CANV, CANV_D, 12, -10, brush((146, 470), (138, 580), (150, 690), 9, CANV_L))
    # Side pockets.
    for x, s in ((108, 1), (404, -1)):
        pk = f"M{x} 560 L{x + 52 * s} 556 L{x + 56 * s} 676 L{x + 4 * s} 684 Z"
        b += fill(pk, LEA, 7) + line(f"M{x + 6 * s} 592 L{x + 50 * s} 588", 4, LEA_L)
    # The big flap and straps.
    flap = smooth([(140, 424), (372, 424), (378, 520), (256, 560), (134, 520)])
    b += shaded(d, flap, LEA, LEA_D, 0, -12, brush((170, 444), (240, 470), (320, 456), 7, LEA_L))
    for x in (206, 306):
        b += line(f"M{x} 520 L{x} 640", 16) + line(f"M{x} 520 L{x} 640", 8, LEA_D) + buckle(x, 610, .8)
    # A bedroll lashed on top.
    roll = "M150 360 Q256 340 362 360 L362 420 Q256 402 150 420 Z"
    b += shaded(d, roll, "#7a5a8a", "#563e64", 0, -10, brush((176, 372), (256, 360), (336, 372), 6, "#a787b8"))
    b += ell(150, 390, 22, 32, "#563e64", 7) + ell(150, 390, 9, 14, "#7a5a8a", 4)
    for x in (196, 316):
        b += line(f"M{x} 350 L{x} 428", 9, ROPE_D) + line(f"M{x} 350 L{x} 428", 4, ROPE)
    # Trophies: a bone toggle and a shard charm.
    b += G(fill("M-26 -7 L26 -7 L26 7 L-26 7 Z", BONE, 5) + ell(-28, 0, 9, 11, BONE, 5) + ell(28, 0, 9, 11, BONE, 5), 256, 486)
    b += line("M352 540 L360 600", 4) + G(fill("M0 -22 L13 0 L0 26 L-13 0 Z", SHARD, 5) + fill_ns("M0 -22 L13 0 L0 4 Z", SHARD_L), 360, 624, 8)
    b += sparkle(380, 600, 1.0, SHARD_L)
    return d, b


def hushstone(phase):
    d = []; b = ""
    glow = .55 + .45 * math.sin(phase * 2 * math.pi)
    b += halo(256, 520, 190, HUM, .04 + .04 * glow)
    # Low cairn at the foot.
    for (x, y, rx, ry) in ((176, 716, 56, 28), (338, 718, 60, 26), (256, 728, 70, 22)):
        b += ell(x, y, rx, ry, RK_D, 7)
    stone = smooth([(186, 724), (180, 560), (196, 400), (232, 300), (270, 286), (310, 318), (330, 430), (334, 600), (326, 724)])
    b += shaded(d, stone, RK, RK_D, 14, -6, brush((206, 420), (198, 540), (206, 680), 9, RK_L))
    # Moss on its shoulders.
    b += fill_ns(cloud(232, 318, 40, 18, 8, 3, .5), MOSS) + fill_ns(cloud(318, 380, 22, 34, 7, 5, .5), MOSS_D)
    # The carved spiral, humming.
    pts = []
    for i in range(60):
        t = i / 59; a = t * 3.2 * math.pi; r = 8 + 52 * t
        pts.append((258 + math.cos(a) * r, 500 + math.sin(a) * r * 1.15))
    sp = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts)
    b += line(sp, 13, HUM_D) + f'<path d="{sp}" fill="none" stroke="{HUM}" stroke-width="{sw(7)}" opacity="{.6 + .4 * glow:.2f}"/>'
    b += f'<circle cx="258" cy="500" r="9" fill="{HUM_L}" stroke="none" opacity="{.7 + .3 * glow:.2f}"/>'
    # Small notes drifting up from it.
    for i in range(3):
        t = (phase + i / 3) % 1
        x = 256 + 70 * math.sin((t + i) * 2.4); y = 420 - 200 * t
        b += sparkle(x, y, .9 + .5 * (1 - t), HUM_L, (1 - t) * .9)
    return d, b


SPRITES = {
    "satchel": (satchel, (90, 330, 422, 744)),
    "haversack": (haversack, (80, 300, 432, 744)),
    "hushstone": {"icon": True, "frames": anim(hushstone), "cols": 4, "rows": 1, "target": (90, 200, 422, 744)},
}
ICONS = {"satchel": satchel, "haversack": haversack}
WIDE = {}
