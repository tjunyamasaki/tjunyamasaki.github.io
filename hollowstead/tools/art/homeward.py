"""Home on the Vigil: the Glimmerstone that stands where the Heartfire used to burn, the Homeward scroll
that carries you back to your fire, and the siege moon's HUD icon.

    python3 tools/art/build.py --only glimmer,warpscroll,moon-siege

Same ink style as the rest of the theme: thick outline, flat fill, one soft shade, a brush highlight.
The Glimmerstone's runes breathe over four frames; its light at night is the game's own glow (STRUCTURES light).
"""
import math
from lib import *
from frontier import halo

SL = "#7a7f9a"; SL_D = "#545873"; SL_L = "#a9adc6"      # blue slate
RUNE = "#a8e6ff"; RUNE_L = "#ecfbff"; RUNE_D = "#4f8fb4"
MOSSG = "#6f8f45"; MOSSG_D = "#4d6a2e"
PARCH = "#efdcae"; PARCH_D = "#c9ad74"; PARCH_L = "#fff3d2"
CORD = "#b8423e"; CORD_D = "#7e2a2e"
EMBERS = "#ffb14e"; EMBERS_L = "#ffe2a0"
SIEGE = "#e8823e"; SIEGE_D = "#a8492a"; SIEGE_L = "#ffc58a"


def glimmer(phase):
    d = []; b = ""
    glow = .5 + .5 * math.sin(phase * 2 * math.pi)
    b += halo(256, 500, 170, RUNE, .05 + .05 * glow)
    # A ring of small stones at the foot.
    for (x, y, rx, ry) in ((168, 722, 44, 22), (348, 724, 46, 20), (256, 734, 60, 18)):
        b += ell(x, y, rx, ry, SL_D, 7)
    # The standing stone: a tapered obelisk, two faces showing, a moon crystal set in its crown.
    stone = "M182 728 L196 360 L230 300 L292 300 L322 360 L334 728 Z"
    b += shaded(d, stone, SL, SL_D, 14, -6, brush((206, 400), (200, 540), (206, 690), 9, SL_L))
    b += line("M262 304 L268 728", 5, SL_D)
    # The crystal: pale and bright, breathing with the runes.
    gemp = "M228 302 L240 236 L262 196 L286 238 L296 302 Z"
    b += fill(gemp, RUNE, 8) + fill_ns("M262 196 L286 238 L296 302 L262 302 Z", RUNE_D, .45)
    b += f'<path d="{gemp}" fill="{RUNE_L}" stroke="none" opacity="{.25 + .45 * glow:.2f}"/>'
    b += brush((244, 290), (246, 250), (258, 214), 6, RUNE_L)
    # Moss over one shoulder and a crack down the side.
    b += fill_ns(cloud(208, 372, 22, 12, 7, 4, .5), MOSSG) + fill_ns(cloud(326, 500, 12, 26, 6, 2, .5), MOSSG_D)
    b += line("M306 380 L294 420 L308 452 L298 488", 4, SL_D)
    # The runes: a crescent over a ring over a line of three marks, glowing and breathing.
    marks = [
        "M232 380 Q256 352 284 378 Q256 368 232 380 Z",
        "M256 420 m-26 0 a26 26 0 1 0 52 0 a26 26 0 1 0 -52 0",
        "M226 488 L246 488 M248 488 L264 488 M266 488 L286 488",
        "M256 520 L256 600 M236 548 L256 528 L276 548",
    ]
    for m in marks:
        b += line(m, 13, RUNE_D)
    op = .55 + .45 * glow
    for m in marks:
        b += f'<path d="{m}" fill="none" stroke="{RUNE}" stroke-width="{sw(7)}" stroke-linecap="round" opacity="{op:.2f}"/>'
    b += f'<circle cx="256" cy="420" r="8" fill="{RUNE_L}" stroke="none" opacity="{.6 + .4 * glow:.2f}"/>'
    # Motes rising from it.
    for i in range(3):
        t = (phase + i / 3) % 1
        x = 256 + 60 * math.sin((t + i) * 2.6); y = 360 - 190 * t
        b += sparkle(x, y, .8 + .5 * (1 - t), RUNE_L, (1 - t) * .9)
    return d, b


def warpscroll():
    d = []; b = ""
    b += halo(256, 600, 150, EMBERS, .14)
    # The unrolled sheet, curling at both ends.
    sheet = "M150 470 Q256 448 362 470 L362 690 Q256 668 150 690 Z"
    b += shaded(d, sheet, PARCH, PARCH_D, 0, -10, brush((176, 500), (172, 580), (178, 660), 7, PARCH_L))
    # Rolled ends.
    for x in (150, 362):
        b += rrect(x - 26, 448, 52, 262, 24, PARCH_D, 8) + line(f"M{x - 8} 470 L{x - 8} 690", 4, PARCH_L)
        b += ell(x, 456, 26, 14, PARCH, 6) + ell(x, 456, 9, 5, PARCH_D, 4)
    # The home rune: a little flame inside a hearth arch.
    b += line("M212 640 L212 580 Q256 528 300 580 L300 640", 9, CORD_D)
    b += G(flame(0, 0, 46, 74, .25, 3), 256, 636)
    b += line("M200 646 L312 646", 7, CORD_D)
    # A red cord with a tassel.
    b += line("M232 700 Q256 728 290 700", 12) + line("M232 700 Q256 728 290 700", 6, CORD)
    b += fill("M286 704 L300 744 L276 744 Z", CORD, 5)
    b += sparkle(380, 450, 1.3, EMBERS_L) + sparkle(130, 520, 1.0, EMBERS_L)
    return d, b


def moon_siege():
    d = []; b = ""
    b += halo(256, 256, 186, SIEGE_L, .26)
    disc = "M256 106 a150 150 0 1 0 0.1 0 Z"
    spots = "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{SIEGE_D}" stroke="none" opacity=".45"/>' for (x, y, r) in [(206, 196, 22), (312, 180, 14), (300, 286, 18)])
    b += shaded(d, disc, SIEGE, SIEGE_D, -16, -12, spots + brush((150, 250), (160, 170), (230, 128), 10, SIEGE_L))
    # A palisade marching across the face of the moon.
    stakes = ""
    for k in range(7):
        x = 120 + k * 46; h = 96 + (k % 3) * 22
        stakes += f"M{x - 16} 420 L{x - 16} {420 - h} L{x} {420 - h - 28} L{x + 16} {420 - h} L{x + 16} 420 Z "
    b += clipped(d, disc, fill(stakes, "#3a2430", 8) + line("M96 352 L416 352", 12, "#2b2233") + line("M96 352 L416 352", 5, "#5a3a3a"))
    b += f'<path d="{disc}" fill="none" stroke-width="{sw(8)}"/>'
    for (x, y, s) in [(420, 120, 1.8), (96, 150, 1.3), (410, 410, 1.2)]:
        b += sparkle(x, y, s, EMBERS_L)
    return d, b


SPRITES = {
    "glimmer": {"icon": True, "frames": [(lambda k: (lambda: glimmer(k / 4)))(k) for k in range(4)], "cols": 4, "rows": 1, "target": (100, 200, 412, 744)},
    "warpscroll": (warpscroll, (110, 420, 402, 744)),
}
ICONS = {"warpscroll": warpscroll, "moon-siege": moon_siege}
WIDE = {}
