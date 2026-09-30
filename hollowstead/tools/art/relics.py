"""Relic art: the ten trinkets that came with the second trinket socket (src/trinkets.mjs).

    python3 tools/art/build.py --only tinderpouch,crookedkey,...     (registered in build.py)

Same ink style as frontier.py's trinkets: thick outline, flat fill, one soft shade, a brush
highlight, sparkles, and a soft halo for anything that glows. Rarer relics glow more.
"""
import math
from lib import *
from frontier import halo, cord_loop, SACK, SACK_D, SACK_L, EMBER, EMBER_D, WIRE, WIRE_L, BLOOD, BLOOD_D, BLOOD_L, MOON, MOON_D, MOON_L
from longnight import SILVER, SILVER_D, GLOW, GLOW_L, rot
from magic import BRONZE, BRONZE_D, BRONZE_L
from arsenal import star_shape

IRON = "#6f6a80"; IRON_D = "#4a4658"; IRON_L = "#a7a2ba"
WAX = "#b8423e"; WAX_D = "#86282e"; WAX_L = "#e8766a"
CHALK = "#f1ede2"; CHALK_D = "#c9c2ae"; SLATE = "#4a4f5c"; SLATE_D = "#33363f"; SLATE_L = "#6b7282"
THREAD = "#d23a44"; THREAD_D = "#8e1f2c"; THREAD_L = "#ff8a8a"
VEIL = "#b9b2cf"; VEIL_D = "#857ea3"; VEIL_L = "#eeeaf8"
SOUL = "#9fc8ff"; SOUL_D = "#5d86c8"; SOUL_L = "#eaf3ff"
GILT = "#e8b04a"; GILT_D = "#b07a2a"; GILT_L = "#f9dc8e"


def soft_flame(cx, base, w, h, phase=0.0, seed=0):
    """lib.flame with a light outline: at relic scale the full ink line swallows a small flame."""
    import re
    return re.sub(r'stroke-width="([0-9.]+)"', lambda m: f'stroke-width="{float(m.group(1)) * .3:.2f}"', flame(cx, base, w, h, phase, seed))


def tinderpouch():
    """Uncommon: a leather tinder pouch, sparks leaping from its mouth, a flint on a cord."""
    d = []; b = ""
    b += halo(256, 520, 110, FL_M, .14)
    for (x, y, s) in [(236, 452, 1.2), (292, 430, .9), (320, 470, .7), (206, 420, .6)]:
        b += sparkle(x, y, s, FL_I)
    b += G(soft_flame(0, 0, 70, 104, .15, 3), 262, 522)
    pouch = "M196 520 Q128 574 136 650 Q148 736 256 740 Q364 736 376 650 Q384 574 316 520 Z"
    b += shaded(d, pouch, SACK_D, "#7d6446", 14, -8, brush((166, 600), (164, 660), (204, 712), 9, SACK_L))
    b += fill("M186 500 Q256 530 326 500 L318 540 Q256 560 194 540 Z", SACK, 7)
    b += line("M190 530 Q256 552 322 530", 16) + line("M190 530 Q256 552 322 530", 7, THREAD_D)
    b += line("M322 532 Q352 566 344 604", 9) + line("M322 532 Q352 566 344 604", 4, THREAD_D)
    b += fill(blob(346, 626, 22, 18, 6, .25, 11), "#3c3a44", 6) + brush((336, 618), (344, 612), (356, 616), 4, "#8a8898")
    b += f'<circle cx="256" cy="646" r="30" fill="{EMBER_D}" stroke-width="{sw(6)}"/>' + fill(star_shape(256, 646, 22, 4, .4), FL_M, 3)
    return d, b


def crookedkey():
    """Uncommon: an old iron key, its shaft bent crooked, a skull for a bow."""
    d = []; b = ""
    b += halo(256, 600, 120, IRON_L, .1)
    shaft = "M246 520 L266 520 L270 600 Q296 626 272 652 L276 700 L254 700 L250 652 Q226 626 250 600 Z"
    b += shaded(d, shaft, IRON, IRON_D, 8, -4, brush((256, 530), (258, 580), (254, 640), 5, IRON_L))
    for (y, w) in [(676, 38), (700, 50)]:
        b += rrect(268, y - 10, w, 18, 5, IRON, 6)
    b += ell(256, 470, 62, 58, BONE, 8) + fill_ns("M256 412 Q320 420 314 480 Q306 520 256 528 Z", BONE_D, .7)
    b += ell(234, 468, 13, 16, O, 0) + ell(278, 468, 13, 16, O, 0)
    b += line("M242 500 L242 512 M256 502 L256 514 M270 500 L270 512", 5)
    b += f'<circle cx="256" cy="410" r="18" fill="none" stroke-width="{sw(14)}"/><circle cx="256" cy="410" r="18" fill="none" stroke="{IRON_L}" stroke-width="{sw(6)}"/>'
    b += brush((210, 440), (206, 470), (218, 498), 6, "#ffffff", .8)
    b += sparkle(338, 560, 1.0, IRON_L) + sparkle(172, 640, .8, "#ffffff")
    return d, b


def soulstitch():
    """Uncommon: a bone needle threaded with a wisp of soul, stitched in a zigzag."""
    d = []; b = ""
    b += halo(256, 580, 140, SOUL, .16)
    stitch = "M150 700 L206 612 L240 690 L286 560 L318 650 L366 470"
    b += line(stitch, 22, SOUL_D) + line(stitch, 11, SOUL) + line(stitch, 4, SOUL_L)
    needle = "M352 440 L378 452 L230 742 L222 738 Z"
    b += fill(needle, BONE, 6) + fill_ns("M366 446 L378 452 L230 742 Z", BONE_D)
    b += ell(364, 460, 5, 12, O, 0, rot=26)
    for (x, y) in [(206, 612), (286, 560)]:
        b += f'<circle cx="{x}" cy="{y}" r="9" fill="{SOUL_L}" stroke-width="{sw(4)}"/>'
    b += G(soft_flame(0, 0, 56, 80, .6, 5).replace(FL_O, SOUL_D).replace(FL_M, SOUL).replace(FL_I, SOUL_L), 160, 700)
    b += sparkle(390, 420, 1.2, SOUL_L) + sparkle(120, 560, .9, SOUL_L) + sparkle(300, 720, .7, SOUL_L)
    return d, b


def gutteringcandle():
    """Rare: a stub of red wax in an iron dish, its flame leaning, nearly out."""
    d = []; b = ""
    b += halo(256, 520, 120, FL_M, .18)
    dish = "M136 690 Q256 740 376 690 Q380 720 256 746 Q132 720 136 690 Z"
    b += fill(dish, IRON, 7) + ell(256, 690, 120, 26, IRON_D, 7)
    b += line("M376 694 Q420 684 412 650 Q404 626 380 640", 16) + line("M376 694 Q420 684 412 650 Q404 626 380 640", 7, IRON_L)
    wax = "M200 690 L200 590 Q210 570 236 578 Q256 560 276 578 Q302 570 312 590 L312 690 Q256 704 200 690 Z"
    b += shaded(d, wax, WAX, WAX_D, 12, -6, brush((214, 600), (212, 640), (220, 680), 8, WAX_L))
    for (x, y, h) in [(222, 596, 44), (292, 590, 70), (262, 580, 30)]:
        b += fill(f"M{x - 9} {y} Q{x - 10} {y + h} {x} {y + h + 10} Q{x + 10} {y + h} {x + 9} {y} Z", WAX, 5)
    b += line("M256 572 L260 548", 6)
    b += G(soft_flame(0, 0, 58, 92, .8, 7), 270, 554, 18)
    b += sparkle(330, 470, .9, FL_I) + sparkle(200, 500, .6, FL_I)
    return d, b


def gravechalk():
    """Rare: a stick of grave chalk and the slate it marks, a cross already drawn."""
    d = []; b = ""
    slate = "M150 520 L362 500 L376 710 L164 730 Z"
    b += shaded(d, slate, SLATE, SLATE_D, 10, -8, brush((172, 540), (170, 620), (180, 700), 7, SLATE_L))
    b += f'<path d="{slate}" fill="none" stroke="{WD}" stroke-width="{sw(14)}"/><path d="{slate}" fill="none" stroke-width="{sw(4)}"/>'
    mark = "M200 560 L300 680 M300 556 L204 684"
    b += line(mark, 14, CHALK_D, ' opacity=".9"') + line(mark, 8, CHALK)
    b += f'<circle cx="252" cy="620" r="44" fill="none" stroke="{CHALK}" stroke-width="{sw(6)}" stroke-dasharray="18 12"/>'
    chalk = "M298 470 L398 406 L414 430 L314 494 Z"
    b += fill(chalk, CHALK, 7) + fill_ns("M306 482 L406 418 L414 430 L314 494 Z", CHALK_D)
    b += fill_ns(blob(392, 440, 14, 8, 6, .3, 4), "#ffffff", .8)
    b += sparkle(142, 470, 1.0, CHALK) + sparkle(390, 720, .8, CHALK)
    return d, b


def redthread():
    """Rare: a length of red thread tied in a lovers' knot, two bone beads on its ends."""
    d = []; b = ""
    b += halo(256, 600, 130, THREAD_L, .12)
    heart = "M256 720 Q140 640 150 560 Q160 490 222 496 Q248 500 256 540 Q264 500 290 496 Q352 490 362 560 Q372 640 256 720 Z"
    b += line(heart, 30) + line(heart, 18, THREAD) + line(heart, 5, THREAD_L, ' stroke-dasharray="26 34"')
    loop = "M256 540 Q214 590 256 620 Q298 590 256 540"
    b += line(loop, 22) + line(loop, 11, THREAD)
    for (p0, c, p1) in [((256, 620), (200, 660), (170, 740)), ((256, 620), (320, 670), (350, 742))]:
        path = f"M{p0[0]} {p0[1]} Q{c[0]} {c[1]} {p1[0]} {p1[1]}"
        b += line(path, 18) + line(path, 9, THREAD_D)
    b += ell(170, 744, 18, 16, BONE, 6) + ell(350, 746, 18, 16, BONE, 6)
    b += brush((170, 560), (176, 520), (210, 506), 6, "#ffd2cc")
    b += sparkle(388, 470, 1.1, THREAD_L) + sparkle(124, 640, .8, THREAD_L)
    return d, b


def hellspur():
    """Epic: an iron spur whose rowel is a burning star."""
    d = []; b = ""
    b += halo(330, 560, 120, FL_M, .22)
    band = "M110 640 Q110 520 220 510 L234 540 Q146 552 146 640 Q146 700 220 712 L214 742 Q110 736 110 640 Z"
    b += shaded(d, band, IRON, IRON_D, 10, -6, brush((126, 600), (124, 650), (150, 700), 7, IRON_L))
    b += fill("M222 520 L300 570 L300 596 L222 590 Z", IRON, 7) + fill("M214 704 L300 610 L300 596 L220 676 Z", IRON_D, 6)
    b += rrect(196, 500, 34, 40, 8, BRONZE, 6) + rrect(192, 700, 34, 40, 8, BRONZE, 6)
    b += G(soft_flame(0, 0, 150, 190, .4, 9), 340, 666)
    b += fill(star_shape(334, 590, 62, 8, .42, -90), GILT, 7) + fill(star_shape(334, 590, 36, 8, .5, -68), FL_I, 4)
    b += f'<circle cx="334" cy="590" r="13" fill="{IRON_D}" stroke-width="{sw(5)}"/>'
    b += sparkle(420, 470, 1.3, FL_I) + sparkle(260, 440, .9, FL_I) + sparkle(420, 700, .7, FL_I)
    return d, b


def mournersveil():
    """Epic: a mourner's veil, sheer and drifting, caught by a teardrop pin."""
    d = []; b = ""
    b += halo(256, 590, 150, VEIL_L, .14)
    cloth = "M170 470 Q256 430 342 470 Q370 560 384 650 Q360 700 332 668 Q312 720 282 690 Q256 740 230 690 Q200 720 180 668 Q152 700 128 650 Q142 560 170 470 Z"
    b += f'<path d="{cloth}" fill="{VEIL}" stroke-width="{sw(8)}" opacity=".92"/>'
    b += fill_ns("M256 450 Q330 470 342 520 Q360 600 366 650 Q350 676 332 668 Q300 560 256 450 Z", VEIL_D, .55)
    for x in (206, 256, 306):
        b += line(f"M{x} 480 Q{x + 10} 580 {x - 4} 680", 4, VEIL_L, ' opacity=".8"')
    b += line("M136 650 Q180 668 180 668 Q204 700 230 690 Q256 730 282 690 Q312 712 332 668 Q360 690 380 650", 5, VEIL_L, ' stroke-dasharray="8 10"')
    tear = "M256 470 Q290 520 256 548 Q222 520 256 470 Z"
    b += fill(tear, MOON, 6) + fill_ns("M256 482 Q276 520 256 540 Z", MOON_D) + f'<circle cx="248" cy="518" r="5" fill="{MOON_L}" stroke="none"/>'
    b += rrect(234, 452, 44, 20, 8, SILVER, 6)
    b += ell(210, 590, 8, 12, O, 0) + ell(302, 590, 8, 12, O, 0)
    b += sparkle(392, 470, 1.2, VEIL_L) + sparkle(116, 560, 1.0, VEIL_L) + sparkle(250, 740, .8, VEIL_L)
    return d, b


def thirteenthbell():
    """Legendary: a small cracked bronze bell, XIII cut into its waist, gilded and humming."""
    d = []; b = ""
    b += halo(256, 590, 170, GILT_L, .2)
    b += cord_loop(256, 460, 34, 50, GILT_L)
    bell = "M256 470 Q196 474 190 560 Q186 640 142 680 L370 680 Q326 640 322 560 Q316 474 256 470 Z"
    b += shaded(d, bell, BRONZE, BRONZE_D, 16, -8, brush((210, 510), (204, 580), (184, 650), 10, BRONZE_L))
    b += rrect(134, 670, 244, 26, 12, GILT, 7) + brush((150, 678), (256, 674), (360, 678), 4, GILT_L)
    b += line("M212 600 L220 624 L228 600 M238 600 L238 624 M250 600 L250 624 M262 600 L262 624 M274 600 L274 624 M286 600 L286 624", 4, GILT_D)
    b += line("M300 520 L290 552 L306 574 L294 610", 6) + line("M300 520 L290 552 L306 574 L294 610", 2, GILT_L)
    b += ell(256, 712, 22, 20, GILT_D, 7)
    for (x, y, r) in [(120, 600, 60), (392, 600, 60)]:
        b += f'<path d="M{x} {y - r * .6} Q{x + (-30 if x < 256 else 30)} {y} {x} {y + r * .6}" fill="none" stroke="{GILT_L}" stroke-width="{sw(6)}" opacity=".8"/>'
    b += sparkle(400, 460, 1.5, GILT_L) + sparkle(112, 500, 1.1, GILT_L) + sparkle(380, 740, .8, GILT_L)
    return d, b


def hollowmirror():
    """Legendary: an oval hand mirror in a silver frame; the glass shows two eyes that are not yours."""
    d = []; b = ""
    b += halo(256, 560, 170, MOON_L, .18)
    b += rrect(236, 630, 40, 116, 14, SILVER, 7) + brush((246, 650), (244, 690), (248, 730), 5, "#ffffff")
    b += gem(256, 738, 14, MOON, MOON_D, MOON_L)
    frame = "M256 400 m-104 0 a104 132 0 1 0 208 0 a104 132 0 1 0 -208 0"
    b += f'<path d="{frame}" fill="{SILVER}" stroke-width="{sw(8)}" transform="translate(0 150)"/>'
    glass = "M256 404 m-80 0 a80 106 0 1 0 160 0 a80 106 0 1 0 -160 0"
    b += G(shaded(d, glass, "#2e2c46", "#1c1a2c", -10, -10, brush((196, 380), (196, 330), (230, 300), 8, "#8f8bb8", .8)), 0, 150)
    for (x, y) in [(226, 550), (286, 550)]:
        b += ell(x, y, 12, 16, MOON_L, 0) + f'<circle cx="{x}" cy="{y + 2}" r="5" fill="#1c1a2c" stroke="none"/>'
    b += ell(256, 610, 22, 8, MOON_D, 0, extra=' opacity=".7"')
    for a in range(0, 360, 45):
        x = 256 + math.cos(math.radians(a)) * 104; y = 550 + math.sin(math.radians(a)) * 132
        b += f'<circle cx="{f(x)}" cy="{f(y)}" r="9" fill="{SILVER_D}" stroke-width="{sw(4)}"/>'
    b += sparkle(398, 440, 1.4, MOON_L) + sparkle(110, 500, 1.1, MOON_L) + sparkle(380, 700, .8, "#ffffff")
    return d, b


RELIC = (120, 410, 392, 740)
SPRITES = {k: (fn, RELIC) for k, fn in {
    "tinderpouch": tinderpouch, "crookedkey": crookedkey, "soulstitch": soulstitch, "gutteringcandle": gutteringcandle,
    "gravechalk": gravechalk, "redthread": redthread, "hellspur": hellspur, "mournersveil": mournersveil,
    "thirteenthbell": thirteenthbell, "hollowmirror": hollowmirror}.items()}
ICONS = {k: v[0] for k, v in SPRITES.items()}
ICONS.update({"crookedkey": rot(crookedkey, -24), "soulstitch": rot(soulstitch, 8)})
