"""Refinement art: Dread ichor, the creature-only currency that rolls weapon modifiers (src/refine.mjs),
and the modifier books that each carry one (src/refine-mods.mjs).

    python3 tools/art/build.py --only ichor,book-arrows,book-blade,book-arcane,book-ward      (registered in build.py)

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


# ------------------------------------------------------------------ modifier books
# One open book per cover: what the modifier fits. Its rune floats up off the pages in the cover's
# glow, so the four read apart at a glance even at icon size (and none looks like the Grimoire, which
# is a closed brown tome you fight with).
COVERS = {
    "arrows": ("#2f8f86", "#1f5f5a", "#6fd0c2", "#9ff5e4"),   # bows and staves: verdigris
    "blade": ("#a8343c", "#6e1f2a", "#e0646a", "#ffb0a0"),    # swung weapons: blood red
    "arcane": ("#6b45a0", "#45296e", "#a47fdc", "#e39cff"),   # any weapon: violet
    "ward": ("#5d6a86", "#3c4459", "#9aa6c4", "#ffd88a"),     # body armour: iron, a warm ward light
}


def rune(kind, col, light):
    """The glyph above the pages, centred on (256, 452)."""
    if kind == "arrows":   # one shot splitting into three
        b = ""
        for ang in (-46, 46, 0):
            b += G(line("M0 0 L0 -84", 13) + line("M0 0 L0 -84", 6, light)
                   + fill("M-32 -78 L0 -142 L32 -78 Q0 -92 -32 -78 Z", light, 5)
                   + fill_ns("M0 -136 L24 -82 Q8 -88 0 -88 Z", "#ffffff", .55), 256, 552, ang)
        return b + f'<circle cx="256" cy="552" r="14" fill="{col}" stroke-width="{sw(6)}"/>'
    if kind == "blade":    # a crescent slash
        d = "M168 500 Q222 380 352 392 Q262 410 214 506 Q190 512 168 500 Z"
        return fill(d, col, 8) + brush((198, 482), (236, 418), (316, 398), 6, light) + sparkle(352, 392, 1.3, "#ffffff")
    if kind == "arcane":   # a bolt of lightning
        d = "M276 372 L214 466 L254 466 L226 546 L306 440 L264 440 L298 372 Z"
        return fill(d, col, 8) + brush((270, 384), (244, 428), (226, 458), 5, light) + sparkle(300, 520, .9, "#ffffff")
    # ward: a heater shield with a boss
    d = "M206 384 Q256 400 306 384 L306 452 Q302 510 256 540 Q210 510 206 452 Z"
    return (fill(d, col, 8) + fill_ns("M256 392 Q300 392 304 388 L304 452 Q300 506 256 534 Z", "#000000", .18)
            + f'<circle cx="256" cy="452" r="18" fill="{light}" stroke-width="{sw(6)}"/>' + brush((222, 404), (218, 450), (234, 500), 5, "#ffffff", .7))


def book(kind):
    cover, cover_d, cover_l, glow = COVERS[kind]

    def draw():
        d = []; b = ""
        b += halo(256, 470, 120, glow, .2) + halo(256, 470, 70, glow, .22)
        # the cover under the pages, its corners showing, and a ribbon hanging from the spine
        cover_path = "M80 600 Q168 566 256 602 Q344 566 432 600 L442 712 Q344 680 256 722 Q168 680 70 712 Z"
        b += shaded(d, cover_path, cover, cover_d, 0, -16, brush((96, 690), (170, 664), (236, 690), 7, cover_l, .8))
        b += fill("M262 704 L262 760 L278 746 L294 762 L294 700 Z", glow, 6)
        # the pages, fanned open, a few lines of writing on each
        for side in (-1, 1):
            page = (f"M256 596 Q{256 + side * 74} 558 {256 + side * 146} 584 L{256 + side * 150} 654 "
                    f"Q{256 + side * 76} 630 256 670 Z")
            b += shaded(d, page, BONE, BONE_D, -side * 10, -6, brush((256 + side * 30, 610), (256 + side * 80, 590), (256 + side * 130, 604), 6, BONE_L))
            for i in range(2):
                y = 612 + i * 20
                b += line(f"M{256 + side * 34} {y + 6} Q{256 + side * 80} {y - 10} {256 + side * 128} {y + 2}", 3, "#b5a684")
        b += line("M256 598 L256 672", 7)
        # the rune lifting off the pages
        b += fill_ns("M226 590 Q256 520 286 590 Z", glow, .35)
        b += rune(kind, cover_l, glow)
        b += sparkle(170, 500, 1.1, glow) + sparkle(352, 540, .9, glow) + sparkle(318, 380, .7, "#ffffff", .9)
        return d, b
    draw.__name__ = f"book_{kind}"
    return draw


BOOK_FNS = {f"book-{kind}": book(kind) for kind in COVERS}
SPRITES = {"ichor": (ichor, (136, 390, 376, 740)), **{key: (fn, (76, 360, 436, 750)) for key, fn in BOOK_FNS.items()}}
ICONS = {"ichor": ichor, **BOOK_FNS}
WIDE = {}
