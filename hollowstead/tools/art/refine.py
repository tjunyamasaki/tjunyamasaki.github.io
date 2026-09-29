"""Refinement art: Dread ichor, the creature-only currency that rolls weapon modifiers (src/refine.mjs).

    python3 tools/art/build.py --only ichor      (registered in build.py)

Same ink style as the rest of the theme: thick outline, flat fill, one soft shade, a brush
highlight, sparkles and a soft halo for anything that glows.
"""
from lib import *
from frontier import halo

DREAD = "#6c3f94"; DREAD_D = "#3d2257"; DREAD_L = "#a97ad6"; DREAD_P = "#e39cff"   # ichor, its shade, sheen and glow


def ichor():
    """A fat, trembling drop of violet-black ichor on its own little splash, two eyes peering out of it."""
    d = []; b = ""
    b += halo(256, 600, 170, DREAD_P, .16) + halo(256, 610, 110, DREAD_L, .18)
    # the splash it stands in, and a stray droplet
    b += fill(blob(256, 712, 118, 30, 11, .18, 7, flat=None), DREAD_D, 7)
    b += fill("M372 690 Q386 664 400 690 Q400 706 386 706 Q372 706 372 690 Z", DREAD, 6)
    b += fill("M130 700 Q140 682 150 700 Q150 712 140 712 Q130 712 130 700 Z", DREAD, 5)
    # the drop: a crooked tip that swells to a round belly
    drop = ("M262 410 Q270 470 318 520 Q374 578 370 636 Q366 712 256 716 "
            "Q146 712 142 636 Q138 580 196 522 Q246 470 250 430 Q252 414 262 410 Z")
    swirl = (fill_ns("M170 640 Q210 606 262 628 Q318 650 352 618 L366 700 L150 700 Z", DREAD_D, .55)
             + brush((196, 600), (232, 560), (256, 470), 10, DREAD_L, .9)
             + brush((316, 668), (342, 640), (348, 600), 7, DREAD_L, .55))
    b += shaded(d, drop, DREAD, DREAD_D, -14, -10, swirl)
    # eyes: dark hollows with a hungry glow, under a scowl
    for (x, y, tilt) in ((224, 632, 14), (292, 628, -14)):
        b += ell(x, y, 19, 16, INK_D, 5, tilt) + ell(x + 3, y + 1, 8, 8, DREAD_P, 0) + f'<circle cx="{f(x + 5)}" cy="{f(y - 2)}" r="3" fill="#ffffff" stroke="none"/>'
    b += line("M204 604 L246 618", 9) + line("M270 614 L312 598", 9)
    # a bead of ichor gathering at the tip, and the glitter of something unholy
    b += f'<circle cx="262" cy="404" r="11" fill="{DREAD_L}" stroke-width="{sw(5)}"/>'
    b += sparkle(142, 520, 1.3, DREAD_P) + sparkle(378, 560, 1.0, DREAD_P) + sparkle(318, 452, .8, "#ffffff", .9)
    return d, b


SPRITES = {"ichor": (ichor, (136, 390, 376, 740))}
ICONS = {"ichor": ichor}
WIDE = {}
