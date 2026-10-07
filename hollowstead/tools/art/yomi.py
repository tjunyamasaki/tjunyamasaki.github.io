"""Yomi: the East-Asian folklore art set of Hollowstead (Japanese and Chinese myth, shrines and horror),
drawn in the house style: one ink outline in world units (lib.LINE_WU), flat fills, one crescent shade,
tapered brush highlights, sparkles for magic.

In the game (the Shrine of Yomi, a Vigil land: docs/VIGIL.md "Lands"): `SPRITES` below is registered in
tools/art/build.py like every other module, so `python3 tools/art/build.py --only chochin,jiangshi,...` builds
them into themes/harvest/sprites (theme.json holds their entries); Kagekiri's item art goes to
assets/magic/katana/ (`write_katana`, built with `--only katana`) and its in-hand grip comes from rig.py.

Standalone, every drawing (including the two wanderers and the guandao, not in the game yet):

    python3 tools/art/yomi.py [--only key1,key2] [--preview out.png]

writes themes/yomi/sprites/, themes/yomi/sprites.json and themes/yomi/preview.html (every clip playing).

  miko, daoshi        wanderers, 8 x 2 like ember: 0-1 idle, 2-5 walk, 6-8 attack, 9-11 gather,
                      12 dash, 13 down, 14-15 idle. They take the witch's pose parameters (feet, ab/af,
                      lean, by, hem, hat, eyes, mouth, fx, noarm), so rig.py can adopt them later.
  chochin, jiangshi,  creatures, 4 x 2 like crawler: 0-3 walk, 4-6 attack (wind-up, strike, recover), 7 idle
  kasa, rokurokubi,   (the yokai: src/yokai.mjs; daoshi is the exorcist fallen, ash robes and a bell,
  yukionna, daoshi    drawn by daoshi(fallen=True); the friendly wanderer is `daoshi-wanderer`)
  sakura, matsu       trees, 1 x 1, the tree's world size (the shrine's `yomi-tree` look)
  yomi-rock(-b)       garden stones and a roped sacred boulder (the shrine's `yomi-rock` look)
  toro, torii, jizo   stone lantern (4 x 1 looping flame), shrine gate, jizo statue (the shrine's props)
  katana, guandao     weapons, 1 x 1, plus a diagonal -icon
"""
import argparse, json, math, os, random, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lib
from lib import *
from actors import seg, bar, SKIN, SKIN_D
from wanderers import after, glow_eyes

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "themes", "yomi")

# ---------------------------------------------------------------- palette (kept in the theme's muted, warm range)
VERM = "#c8483a"; VERM_D = "#93303a"; VERM_L = "#ea7a5c"       # shrine vermilion
SAK = "#eba7b8"; SAK_D = "#c57793"; SAK_L = "#f9d8e0"          # cherry blossom
JADE = "#4f9a86"; JADE_D = "#34705f"; JADE_L = "#8fcbb0"
PINE = "#55804e"; PINE_D = "#3a5c3c"; PINE_L = "#8aae6a"
STRAW = "#d8b56e"; STRAW_D = "#a98648"; STRAW_L = "#f1d79a"
PAPER = "#f2e8cf"; PAPER_D = "#cdbc96"; PAPER_L = "#fffaf0"
LACQ = "#352c3c"; LACQ_D = "#221c28"; LACQ_L = "#5c5068"
OFUDA = "#f0cf5a"; OFUDA_D = "#c9a23a"; SCRIPT = "#b8343a"
HAIR = "#2a2030"; HAIR_L = "#5a4870"
BARK = "#5a3a46"; BARK_D = "#3e2632"; BARK_L = "#86606c"     # cherry bark
PBARK = "#7a4b3e"; PBARK_D = "#553128"; PBARK_L = "#a46e56"  # pine bark
GOURD = "#d79a4a"; GOURD_D = "#a8702e"; GOURD_L = "#f2c682"
CORPSE = "#a7bfa6"; CORPSE_D = "#7a9580"; CORPSE_L = "#d2e2cc"
ROBE = "#36426c"; ROBE_D = "#242c4e"; ROBE_L = "#5a6a9e"
TONGUE = "#e0727c"; TONGUE_D = "#b04a5c"; MAW = "#4a1a28"
HITO = "#9fe0e8"; HITO_L = "#e6fbff"                          # hitodama (ghost fire)
ASH = "#5e576e"; ASH_D = "#403a52"; ASH_L = "#857d98"         # a fallen priest's grave-grey robes
GHOUL_EYE = "#c8ff8a"                                          # the lit eyes of the risen (jiangshi, the fallen daoshi)
BRONZE = "#b98a3e"; BRONZE_D = "#87602a"; BRONZE_L = "#e2bd72"
KASA = "#4d6aa0"; KASA_D = "#334a78"; KASA_L = "#7c96c8"      # oiled umbrella paper
PLUM = "#7a4a6a"; PLUM_D = "#553248"; PLUM_L = "#a46e8e"      # the rokurokubi's kimono
PALE = "#f4dcc8"; PALE_D = "#d8b49c"
SNOW = "#eef4f8"; SNOW_D = "#b8cad8"; SNOW_L = "#ffffff"      # the snow woman
ICEB = "#8fb8d8"; ICEB_D = "#5f88ac"; FROSTSK = "#e6eef4"; FROSTSK_D = "#b8c8d6"


def at_scale(s, draw):
    """Draw something that will be placed with G(..., scale=s) so its lines keep the shared weight."""
    k = lib.K
    lib.K = k / s
    try:
        return draw()
    finally:
        lib.K = k


def stroke(dd, w, col):
    """An inked stroke: outline pass, then colour (a cord, a rope, a trim)."""
    return line(dd, w + 7) + line(dd, w, col)


def ofuda(x, y, rot, s=1.0, glow=False):
    """A paper talisman: yellow slip, red brush script."""
    return G(at_scale(s, lambda: _ofuda(glow)), x, y, rot, s)


def _ofuda(glow):
    p = ""
    if glow:
        p += f'<rect x="-30" y="-46" width="60" height="92" rx="14" fill="{OFUDA}" opacity=".3" stroke="none"/>'
    p += rrect(-17, -32, 34, 64, 3, OFUDA, 6)
    p += line("M-7 -20 Q7 -14 -3 -6 Q9 2 -5 10 M0 14 L0 24", 5, SCRIPT)
    return p


def petal(x, y, rot, s=1.0, col=SAK):
    return G(at_scale(s, lambda: fill("M0 -14 Q12 -6 8 8 L0 4 L-8 8 Q-12 -6 0 -14 Z", col, 5)), x, y, rot, s)


def blossom(x, y, r, col=SAK_L, centre=SAK_D):
    """A five-petal flower, no outline (sits on a canopy that already has one)."""
    ps = "".join(f'<ellipse cx="{f(x + math.cos(a) * r * .55)}" cy="{f(y + math.sin(a) * r * .55)}" rx="{f(r * .5)}" ry="{f(r * .38)}" '
                 f'transform="rotate({f(math.degrees(a))} {f(x + math.cos(a) * r * .55)} {f(y + math.sin(a) * r * .55)})" fill="{col}" stroke="none"/>'
                 for a in [k * 2 * math.pi / 5 - math.pi / 2 for k in range(5)])
    return ps + f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * .22)}" fill="{centre}" stroke="none"/>'


def tomoe(x, y, r, col):
    """Three-comma crest (mitsudomoe), a safe stand-in for writing."""
    out = f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{col}" stroke-width="{sw(5)}"/>'
    for k in range(3):
        a = k * 2 * math.pi / 3
        hx, hy = x + math.cos(a) * r * .38, y + math.sin(a) * r * .38
        tx, ty = x + math.cos(a + 1.9) * r * .78, y + math.sin(a + 1.9) * r * .78
        out += f'<circle cx="{f(hx)}" cy="{f(hy)}" r="{f(r * .26)}" fill="{O}" stroke="none"/>'
        out += f'<path d="M{f(hx + math.cos(a + 1.57) * r * .26)} {f(hy + math.sin(a + 1.57) * r * .26)} Q{f(x + math.cos(a + 1.2) * r * .8)} {f(y + math.sin(a + 1.2) * r * .8)} {f(tx)} {f(ty)}" fill="none" stroke="{O}" stroke-width="{sw(5)}"/>'
    return out


def wide_sleeve(d, shoulder, a1, a2, sleeve, sleeve_d, hand_col, L1=62, L2=56, hand=34, cuff=60, drop=30):
    """A kimono / hanfu sleeve: the arm widens to an open cuff and the sleeve bag hangs below the
    forearm whatever the arm does, so it reads at any angle. Returns (svg, hand centre)."""
    e = seg(shoulder, a1, L1)
    w = seg(e, a2, L2 - 4)
    hc = seg(e, a2, L2 + hand * .55)
    arm_d = ribbon(shoulder, e, w, lambda t: 34 + (cuff - 34) * t ** 1.3)
    mid = seg(e, a2, L2 * .35)
    bag = blob((mid[0] + w[0]) / 2, max(mid[1], w[1]) + drop * .55, cuff * .52, drop * .8 + 10, 9, .03, 5)
    s = union([arm_d, bag], sleeve)
    s += clipped(d, bag, fill_ns(blob((mid[0] + w[0]) / 2 + 6, max(mid[1], w[1]) + drop * .9 + 8, cuff * .5, drop * .6 + 6, 8, .03, 6), sleeve_d, .9))
    ang = math.degrees(math.atan2(math.cos(math.radians(a2)), math.sin(math.radians(a2)))) + 90
    s += ell(w[0], w[1], cuff * .36, 7, sleeve_d, 0, ang)
    s += rrect(hc[0] - hand / 2, hc[1] - hand / 2, hand, hand * .92, 11, hand_col, 7, (-a2, hc[0], hc[1]))
    return s, hc


def face(hc, P, blush=True, skin=SKIN, skin_d=SKIN_D):
    """The wanderers' chibi face (same eyes and mouths as actors.witch)."""
    h = ell(hc[0], hc[1], 100, 92, skin)
    h += fill_ns(f"M{hc[0] + 40} {hc[1] + 40} a50 40 0 0 1 -6 44 a100 92 0 0 0 64 -60 Z", skin_d, .5)
    eyes = P.get("eyes", "open")
    ey = hc[1] + 16
    for x in (hc[0] - 34, hc[0] + 38):
        if eyes == "open":
            h += ell(x, ey, 11, 15, O, 0) + f'<circle cx="{x - 3}" cy="{ey - 6}" r="4" fill="#ffffff" stroke="none"/>'
        elif eyes == "focus":
            h += fill(f"M{x - 13} {ey - 4} L{x + 13} {ey + (4 if x < hc[0] else -4) - 6} L{x + 12} {ey + 8} Q{x} {ey + 16} {x - 12} {ey + 8} Z", O, 3)
        elif eyes == "closed":
            h += line(f"M{x - 12} {ey + 2} Q{x} {ey + 12} {x + 12} {ey + 2}", 6)
    if blush:
        h += ell(hc[0] - 58, hc[1] + 44, 16, 9, "#f0a08a", 0, extra=' opacity=".7"') + ell(hc[0] + 64, hc[1] + 44, 16, 9, "#f0a08a", 0, extra=' opacity=".7"')
    mouth = P.get("mouth", "smile")
    if mouth == "smile":
        h += line(f"M{hc[0] - 6} {hc[1] + 56} Q{hc[0] + 4} {hc[1] + 64} {hc[0] + 14} {hc[1] + 56}", 5)
    elif mouth == "shout":
        h += fill(f"M{hc[0] - 8} {hc[1] + 54} Q{hc[0] + 4} {hc[1] + 50} {hc[0] + 16} {hc[1] + 54} Q{hc[0] + 12} {hc[1] + 76} {hc[0] + 4} {hc[1] + 76} Q{hc[0] - 4} {hc[1] + 76} {hc[0] - 8} {hc[1] + 54} Z", "#6a2833", 4)
    elif mouth == "o":
        h += ell(hc[0] + 4, hc[1] + 62, 7, 9, "#6a2833", 4)
    return h


def magic_fx(fx, hf, charm, trail):
    b = ""
    if fx == "glow":
        b += ofuda(hf[0] + 6, hf[1] - 34, -14, 1.0, True) + sparkle(hf[0] + 34, hf[1] - 70, 1.4, charm, .9)
    elif fx == "spark":
        b += brush((hf[0] - 30, hf[1] - 130), (hf[0] + 110, hf[1] - 70), (hf[0] + 60, hf[1] + 50), 18, trail, .7)
        for i, (dx, dy, r) in enumerate(((70, -70, 20), (118, -10, 38), (92, 54, 60))):
            b += ofuda(hf[0] + dx, hf[1] + dy, r, .9 - i * .08)
        b += sparkle(hf[0] + 150, hf[1] - 40, 2.4, charm) + sparkle(hf[0] + 150, hf[1] - 40, 1.1, "#ffffff")
    elif fx == "pluck":
        b += leaf(hf[0] + 10, hf[1] - 30, 30, 2.2, LEAF_L) + sparkle(hf[0] + 40, hf[1] - 50, 1.0, "#fff8e6")
    return b


def dash_petals(b, fx):
    if fx == "dash":
        for (x, y, r) in ((90, 430, 30), (40, 520, -40), (120, 600, 70), (60, 660, 10)):
            b += petal(x, y, r, 2.6, SAK_L)
    return b


def kitsune_mask():
    """Fox festival mask, drawn round (0, 0), about 120 wide."""
    m = fill("M-40 -40 L-50 -104 L-8 -58 Z M40 -40 L50 -104 L8 -58 Z", PAPER_L, 7)
    m += fill_ns("M-38 -50 L-44 -88 L-18 -60 Z M38 -50 L44 -88 L18 -60 Z", VERM)
    fc = "M-60 -14 Q-62 -60 0 -62 Q62 -60 60 -14 Q56 26 22 52 Q8 72 0 74 Q-8 72 -22 52 Q-56 26 -60 -14 Z"
    m += fill(fc, PAPER_L, 7)
    m += brush((-46, -30), (-30, -44), (-10, -40), 9, VERM) + brush((46, -30), (30, -44), (10, -40), 9, VERM)
    m += line("M-40 -8 Q-28 -2 -14 -10 M40 -8 Q28 -2 14 -10", 6)
    m += brush((-52, 18), (-38, 22), (-24, 18), 6, VERM) + brush((52, 18), (38, 22), (24, 18), 6, VERM)
    m += fill("M-7 54 L7 54 L0 64 Z", O, 3)
    m += sparkle(0, -26, .9, GOLD)
    return m


# ================================================================ wanderer: the shrine maiden (miko)
def miko(P):
    d = []; b = ""
    by = P.get("by", 0); lean = P.get("lean", 0); sway = P.get("hem", 0); hs = P.get("hat", 0)
    hc = (256, 384 + by)
    # long hair hangs behind everything
    b += fill(f"M{hc[0] - 98} {hc[1]} Q{hc[0] - 118} {hc[1] + 170} {hc[0] - 74 + sway * .6} {hc[1] + 262} "
              f"L{hc[0] + 74 + sway * .6} {hc[1] + 262} Q{hc[0] + 118} {hc[1] + 170} {hc[0] + 98} {hc[1]} Z", HAIR, 7)
    # legs: hakama trousers, white tabi, wooden zori
    feet = P.get("feet", [(-26, 0), (26, 0)])
    hip = (256, 640 + by)
    for i, (fx_, lift) in enumerate(feet):
        hx = hip[0] + (-22 if i == 0 else 22)
        foot = (256 + fx_ + (-20 if i == 0 else 20), 722 - lift)
        b += bar((hx, hip[1] - 40), (foot[0], foot[1] - 12), 46, VERM_D if i == 0 else VERM)
        b += rrect(foot[0] - 27, foot[1] + 10, 58, 13, 5, WD, 6)
        b += rrect(foot[0] - 23, foot[1] - 10, 50, 26, 11, PAPER, 7)
        b += line(f"M{foot[0] + 4} {foot[1] - 8} L{foot[0] + 4} {foot[1] + 8}", 6, VERM)
    body = ""
    sh_b = (210, 486 + by); sh_f = (302, 486 + by)
    ab = P.get("ab", (-12, -8))
    a_b, _ = wide_sleeve(d, sh_b, ab[0], ab[1], PAPER_D, "#a89670", SKIN_D, cuff=64, drop=44)
    body += a_b
    # white kosode
    top = f"M212 {468 + by} L300 {468 + by} Q326 {520 + by} 322 {590 + by} L190 {590 + by} Q186 {520 + by} 212 {468 + by} Z"
    body += shaded(d, top, PAPER, PAPER_D, 12, -4, brush((214, 500 + by), (204, 540 + by), (204, 580 + by), 7, PAPER_L))
    body += fill_ns(f"M226 {466 + by} L288 {466 + by} L258 {528 + by} Z", VERM)
    body += fill(limb((290, 466 + by), (276, 492 + by), (258, 532 + by), 16, 14), PAPER_L, 6)
    body += fill(limb((222, 466 + by), (246, 506 + by), (284, 570 + by), 17, 15), PAPER_L, 6)
    # red hakama, pleats and a bow
    hak = (f"M198 {572 + by} L314 {572 + by} Q336 {626 + by} {352 + sway} {694 + by} "
           f"Q{306 + sway * .6} {706 + by} 256 {700 + by} Q{206 + sway * .6} {706 + by} {160 + sway} {694 + by} Q178 {626 + by} 198 {572 + by} Z")
    pleats = "".join(line(f"M{x0} {586 + by} L{x1 + sway * .6} {694 + by}", 5, VERM_D) for x0, x1 in ((226, 214), (256, 256), (286, 300)))
    body += shaded(d, hak, VERM, VERM_D, 12, -4, pleats + brush((204, 600 + by), (192, 640 + by), (186, 680 + by), 7, VERM_L))
    body += rrect(196, 566 + by, 120, 18, 6, VERM_D, 6)
    body += fill(f"M256 {576 + by} Q226 {556 + by} 222 {584 + by} Q236 {596 + by} 256 {578 + by} Q276 {596 + by} 290 {584 + by} Q286 {556 + by} 256 {576 + by} Z", VERM, 6)
    body += line(f"M248 {582 + by} Q240 {610 + by} {230 + sway * .3} {626 + by} M264 {582 + by} Q272 {610 + by} {284 + sway * .3} {628 + by}", 6, VERM_D)
    # head: hime cut, paper-tied side locks, fox mask on the side
    head = face(hc, P)
    y = hc[1]
    hair = (f"M150 {y + 84} L146 {y - 10} Q154 {y - 106} 256 {y - 110} Q358 {y - 106} 366 {y - 10} L362 {y + 84} L328 {y + 84} "
            f"L330 {y - 12} L312 {y - 22} L296 {y - 10} L276 {y - 24} L256 {y - 12} L236 {y - 24} L216 {y - 10} L198 {y - 22} L182 {y - 12} L186 {y + 84} Z")
    head += shaded(d, hair, HAIR, "#1c1522", -10, -6, brush((194, y - 70), (246, y - 92), (306, y - 76), 7, HAIR_L))
    head += rrect(152, y + 44, 32, 18, 5, PAPER_L, 5) + rrect(330, y + 44, 32, 18, 5, PAPER_L, 5)
    head += line(f"M330 {y - 92} Q350 {y - 70} 352 {y - 44}", 6, VERM)
    head += G(at_scale(.62, kitsune_mask), hc[0] + 96, y - 82, 26 + hs * 1.5, .62)
    head += f'<circle cx="{hc[0] - 70}" cy="{y - 76}" r="12" fill="{GOLD}" stroke-width="{sw(5)}"/>' + line(f"M{hc[0] - 70} {y - 64} L{hc[0] - 72} {y - 44}", 5, VERM)
    body += head
    af = P.get("af", (14, 8))
    a_f, hf = wide_sleeve(d, sh_f, af[0], af[1], PAPER, PAPER_D, SKIN, cuff=64, drop=44)
    if not P.get("noarm"):
        body += a_f
    fx = P.get("fx", "")
    body += magic_fx(fx, hf, OFUDA, VERM_L)
    if lean:
        body = f'<g transform="rotate({lean} 256 {640 + by})">{body}</g>'
    b += body
    return d, dash_petals(after(fx, b), fx)


def miko_down():
    d = []; b = ""
    for i, x in enumerate((250, 300)):
        b += bar((x - 30, 700), (x + 66, 712), 40, VERM_D if i == 0 else VERM) + rrect(x + 58, 684, 30, 44, 12, PAPER, 7)
    b += shaded(d, "M176 600 Q256 560 330 610 L350 716 Q256 734 160 716 Z", VERM, VERM_D, 10, -4)
    b += fill("M196 600 Q250 520 312 600 Q256 622 196 600 Z", PAPER, 7)
    hc = (232, 500)
    b += f'<g transform="rotate(-18 {hc[0]} {hc[1]})">'
    b += fill(f"M{hc[0] - 100} {hc[1] + 90} L{hc[0] - 104} {hc[1] - 10} Q{hc[0] - 96} {hc[1] - 106} {hc[0]} {hc[1] - 110} Q{hc[0] + 104} {hc[1] - 106} {hc[0] + 108} {hc[1] - 10} L{hc[0] + 104} {hc[1] + 90} Z", HAIR, 7)
    b += ell(hc[0], hc[1], 100, 92, SKIN)
    b += fill(f"M{hc[0] - 104} {hc[1] + 70} L{hc[0] - 106} {hc[1] - 10} Q{hc[0] - 98} {hc[1] - 106} {hc[0]} {hc[1] - 110} Q{hc[0] + 102} {hc[1] - 106} {hc[0] + 110} {hc[1] - 10} L{hc[0] + 106} {hc[1] + 70} L{hc[0] + 74} {hc[1] + 70} L{hc[0] + 74} {hc[1] - 16} Q{hc[0]} {hc[1] - 30} {hc[0] - 74} {hc[1] - 16} L{hc[0] - 72} {hc[1] + 70} Z", HAIR, 7)
    for x in (hc[0] - 34, hc[0] + 38):
        b += line(f"M{x - 12} {hc[1] + 18} Q{x} {hc[1] + 28} {x + 12} {hc[1] + 18}", 6)
    b += ell(hc[0] + 4, hc[1] + 62, 6, 7, "#6a2833", 4)
    b += '</g>'
    b += wide_sleeve(d, (300, 610), 40, 30, PAPER, PAPER_D, SKIN, 50, 44, 34, 54, 20)[0]
    b += G(at_scale(.7, kitsune_mask), 420, 704, -70, .7)
    for i in range(3):
        a = i * 2.1
        b += sparkle(232 + 80 * math.cos(a), 370 + 20 * math.sin(a), 1.1, OFUDA, .9)
    return d, b


# ================================================================ wanderer: the Taoist exorcist (daoshi)
def douli(cx, cy, hs, d):
    """Conical straw hat with a red tassel; (cx, cy) is the brim centre."""
    apex = (cx + hs * 2, cy - 126)
    cone = (f"M{cx - 166} {cy + 12} Q{cx - 90} {cy - 40} {apex[0]} {apex[1]} Q{cx + 90} {cy - 40} {cx + 166} {cy + 12} "
            f"Q{cx} {cy + 36} {cx - 166} {cy + 12} Z")
    weave = "".join(line(f"M{f(apex[0])} {f(apex[1] + 10)} L{f(cx + k * 150)} {f(cy + 18 - abs(k) * 8)}", 4, STRAW_D) for k in (-.66, -.33, 0, .33, .66))
    weave += line(f"M{cx - 120} {cy - 10} Q{cx} {cy + 8} {cx + 120} {cy - 10}", 4, STRAW_D)
    h = shaded(d, cone, STRAW, STRAW_D, 18, -6, weave + brush((cx - 130, cy), (cx - 70, cy - 40), (apex[0] - 14, apex[1] + 20), 8, STRAW_L))
    h += fill(f"M{f(apex[0] - 8)} {f(apex[1] + 4)} Q{f(apex[0] + 30 - hs)} {f(apex[1] + 26)} {f(apex[0] + 46 - hs * 2)} {f(apex[1] + 70)} "
              f"L{f(apex[0] + 30 - hs * 2)} {f(apex[1] + 74)} Q{f(apex[0] + 16 - hs)} {f(apex[1] + 36)} {f(apex[0] - 4)} {f(apex[1] + 22)} Z", VERM, 6)
    h += f'<circle cx="{f(apex[0])}" cy="{f(apex[1])}" r="13" fill="{VERM}" stroke-width="{sw(6)}"/>'
    return h


def gourd(x, y, rot):
    g = line("M0 -64 L0 -40", 6, VERM)
    g += ell(0, 18, 30, 30, GOURD, 7) + ell(0, -22, 19, 19, GOURD, 7)
    g += rrect(-10, -6, 20, 10, 4, VERM, 5)
    g += brush((-18, 8), (-20, 22), (-12, 38), 6, GOURD_L) + brush((-10, -32), (-12, -24), (-8, -14), 4, GOURD_L)
    g += rrect(-6, -50, 12, 12, 4, WD, 5)
    return G(g, x, y, rot)


def daoshi(P):
    """The Taoist exorcist. `fallen=True` is the Shrine's hostile priest: ash robes, a corpse's skin, lit eyes, a bell."""
    d = []; b = ""
    fallen = P.get("fallen", False)
    R, R_D, R_L, R_DD = (ASH, ASH_D, ASH_L, "#2a2636") if fallen else (JADE, JADE_D, JADE_L, "#285447")
    sk, sk_d = (CORPSE, CORPSE_D) if fallen else (SKIN, SKIN_D)
    by = P.get("by", 0); lean = P.get("lean", 0); sway = P.get("hem", 0); hs = P.get("hat", 0)
    feet = P.get("feet", [(-26, 0), (26, 0)])
    hip = (256, 640 + by)
    for i, (fx_, lift) in enumerate(feet):
        hx = hip[0] + (-20 if i == 0 else 20)
        foot = (256 + fx_ + (-20 if i == 0 else 20), 722 - lift)
        b += bar((hx, hip[1] - 20), foot, 32, LACQ_D if i == 0 else LACQ)
        b += rrect(foot[0] - 26, foot[1] + 8, 58, 14, 6, PAPER, 6)
        b += rrect(foot[0] - 23, foot[1] - 10, 52, 26, 12, LACQ_D if i == 0 else "#2a2230", 7)
    body = ""
    sh_b = (210, 484 + by); sh_f = (302, 484 + by)
    ab = P.get("ab", (-12, -8))
    a_b, _ = wide_sleeve(d, sh_b, ab[0], ab[1], R_D, R_DD, sk_d, cuff=54, drop=20)
    body += a_b
    robe = f"M212 {464 + by} L300 {464 + by} Q328 {540 + by} {340 + sway} {680 + by} Q256 {694 + by} {172 + sway} {680 + by} Q186 {540 + by} 212 {464 + by} Z"
    slit = line(f"M{300 + sway * .7} {600 + by} L{306 + sway} {684 + by}", 6, R_D)
    hem = fill_ns(f"M150 {664 + by} L360 {664 + by} L360 {700 + by} L150 {700 + by} Z", R_D)
    body += shaded(d, robe, R, R_D, 14, -4, hem + slit + brush((214, 500 + by), (200, 580 + by), (196, 650 + by), 8, R_L))
    body += line(f"M{176 + sway} {664 + by} Q256 {678 + by} {336 + sway} {664 + by}", 6, GOLD)
    # diagonal placket with knot buttons, mandarin collar
    body += stroke(f"M250 {470 + by} Q262 {500 + by} 300 {506 + by} Q314 {560 + by} {312 + sway * .6} {664 + by}", 6, GOLD)
    for (x, yy) in ((268, 492), (292, 506), (306, 540)):
        body += rrect(x - 11, yy - 5 + by, 22, 10, 4, GOLD, 5)
    body += rrect(226, 452 + by, 60, 22, 8, R_D, 6) + line(f"M232 {470 + by} L280 {470 + by}", 4, GOLD)
    # sash with hanging ends
    body += rrect(200, 566 + by, 112, 20, 7, VERM, 6)
    body += fill(f"M214 {578 + by} L234 {578 + by} L{230 + sway * .5} {636 + by} L{214 + sway * .5} {640 + by} Z", VERM_D, 6)
    body += tomoe(256, 576 + by, 15, GOLD)
    body += gourd(178 + sway * .4, 640 + by, 10 - sway * .3) if not fallen else ofuda(184 + sway * .4, 640 + by, 8 - sway * .3, .9)
    # head: tidy hair under a wide douli
    hc = (256, 392 + by)
    head = face(hc, {**P, "eyes": "none"} if fallen else P, blush=not fallen, skin=sk, skin_d=sk_d)
    if fallen:
        head += glow_eyes(hc[0] + 2, hc[1] + 14, P.get("eyes", "open"), GHOUL_EYE, 34)
    y = hc[1]
    hair = (f"M158 {y + 30} Q156 {y - 60} 256 {y - 70} Q356 {y - 60} 354 {y + 30} L336 {y + 30} Q332 {y - 10} 306 {y - 26} "
            f"Q290 {y - 4} 262 {y - 20} Q236 {y - 2} 212 {y - 24} Q184 {y - 6} 178 {y + 30} Z")
    head += fill(hair, HAIR, 7)
    head += fill(f"M158 {y + 20} Q150 {y + 70} 164 {y + 100} L182 {y + 96} L178 {y + 26} Z M354 {y + 20} Q362 {y + 70} 348 {y + 100} L330 {y + 96} L334 {y + 26} Z", HAIR, 6)
    head += douli(256, y - 52, hs, d)
    body += head
    af = P.get("af", (14, 8))
    a_f, hf = wide_sleeve(d, sh_f, af[0], af[1], R, R_D, sk, cuff=54, drop=20)
    if not P.get("noarm"):
        body += a_f
    fx = P.get("fx", "")
    if fallen and not P.get("noarm"):
        body += bell(hf[0] + 4, hf[1] + 26, P.get("ring", 0))
    body += magic_fx(fx, hf, R_L, OFUDA if fallen else R_L)
    if lean:
        body = f'<g transform="rotate({lean} 256 {640 + by})">{body}</g>'
    b += body
    return d, after(fx, b)


def daoshi_down():
    d = []; b = ""
    for i, x in enumerate((250, 300)):
        b += bar((x - 30, 702), (x + 66, 712), 32, LACQ_D if i == 0 else LACQ) + rrect(x + 58, 684, 30, 46, 12, "#2a2230", 7)
    b += gourd(150, 690, -60)
    b += shaded(d, "M176 560 Q270 530 326 600 L346 716 Q256 734 160 716 Z", JADE, JADE_D, 10, -4)
    hc = (232, 500)
    b += f'<g transform="rotate(-18 {hc[0]} {hc[1]})">'
    b += ell(hc[0], hc[1], 100, 92, SKIN)
    b += fill(f"M{hc[0] - 98} {hc[1] + 30} Q{hc[0] - 100} {hc[1] - 60} {hc[0]} {hc[1] - 92} Q{hc[0] + 100} {hc[1] - 60} {hc[0] + 98} {hc[1] + 30} L{hc[0] + 80} {hc[1] + 30} Q{hc[0] + 70} {hc[1] - 20} {hc[0]} {hc[1] - 30} Q{hc[0] - 70} {hc[1] - 20} {hc[0] - 80} {hc[1] + 30} Z", HAIR, 7)
    for x in (hc[0] - 34, hc[0] + 38):
        b += line(f"M{x - 12} {hc[1] + 18} Q{x} {hc[1] + 28} {x + 12} {hc[1] + 18}", 6)
    b += ell(hc[0] + 4, hc[1] + 62, 6, 7, "#6a2833", 4)
    b += '</g>'
    b += wide_sleeve(d, (300, 610), 40, 30, JADE, JADE_D, SKIN, 50, 44, 34, 50, 18)[0]
    b += G(at_scale(.55, lambda: douli(0, 0, 0, d)), 420, 700, 16, .55)
    for i in range(3):
        a = i * 2.1
        b += sparkle(232 + 80 * math.cos(a), 370 + 20 * math.sin(a), 1.1, JADE_L, .9)
    return d, b


def wanderer_frames(fn, down):
    W = lambda **P: (lambda: fn(P))
    walk = [
        W(feet=[(-34, 0), (30, 0)], ab=(22, 12), af=(-18, -10), by=0, hem=-8, hat=-4),
        W(feet=[(-6, 0), (6, 26)], ab=(6, 2), af=(-2, 4), by=-10, hem=0, hat=2),
        W(feet=[(30, 0), (-34, 0)], ab=(-22, -12), af=(24, 16), by=0, hem=8, hat=4),
        W(feet=[(6, 26), (-6, 0)], ab=(-6, -2), af=(6, 10), by=-10, hem=0, hat=-2),
    ]
    return [
        W(), W(by=5, hat=4, eyes="closed", mouth="smile"),
        *walk,
        W(af=(-70, -110), ab=(10, 10), lean=-6, eyes="focus", mouth="smile", fx="glow"),
        W(af=(96, 110), ab=(-30, -40), lean=8, eyes="focus", mouth="shout", fx="spark", feet=[(-40, 0), (34, 0)], hem=10),
        W(af=(60, 70), ab=(-20, -24), lean=4, eyes="open", mouth="o", feet=[(-36, 0), (30, 0)]),
        W(af=(40, 30), ab=(30, 24), lean=12, by=6, eyes="focus", mouth="smile"),
        W(af=(20, 10), ab=(20, 8), lean=16, by=22, eyes="closed", mouth="o", feet=[(-40, 0), (40, 0)]),
        W(af=(120, 150), ab=(10, 4), lean=2, by=-4, eyes="open", mouth="shout", fx="pluck"),
        W(af=(-60, -70), ab=(-70, -80), lean=20, by=6, feet=[(-70, 18), (50, 0)], hem=-24, hat=-12, eyes="focus", mouth="smile", fx="dash"),
        down,
        W(), W(by=5, hat=4),
    ]


# ================================================================ creature: the paper-lantern ghost (chochin-obake)
def superellipse(cx, cy, rx, ry, n=2.6, k=28):
    pts = []
    for i in range(k):
        t = 2 * math.pi * i / k
        c, s = math.cos(t), math.sin(t)
        pts.append((cx + rx * math.copysign(abs(c) ** (2 / n), c), cy + ry * math.copysign(abs(s) ** (2 / n), s)))
    return smooth(pts)


def chochin(P):
    d = []; b = ""
    lift = P.get("lift", 0); sq = P.get("sq", 1.0); lean = P.get("lean", 0); ph = P.get("ph", 0)
    mo = P.get("mouth", .4); lash = P.get("lash", 0); eye = P.get("eye", "open")
    H = 310 * sq; R = 124 / sq ** .5
    base = 716 - lift; top = base - H; cx = 256; cy = (base + top) / 2
    body = superellipse(cx, cy, R, H / 2)
    # paper ribs, red bands and the light inside
    ribs = ""
    for i in range(1, 9):
        yy = top + H * i / 9
        ribs += line(f"M{f(cx - R - 10)} {f(yy - 6)} Q{f(cx)} {f(yy + 14)} {f(cx + R + 10)} {f(yy - 6)}", 5, PAPER_D)
    inner = fill_ns(blob(cx - 18, cy + 10, R * .62, H * .34, 9, .05, 2), FL_I, .55)
    bands = fill_ns(f"M{f(cx - R - 10)} {f(top + 16)} L{f(cx + R + 10)} {f(top + 16)} L{f(cx + R + 10)} {f(top + 42)} L{f(cx - R - 10)} {f(top + 42)} Z", VERM)
    bands += fill_ns(f"M{f(cx - R - 10)} {f(base - 44)} L{f(cx + R + 10)} {f(base - 44)} L{f(cx + R + 10)} {f(base - 18)} L{f(cx - R - 10)} {f(base - 18)} Z", VERM)
    hl = brush((cx - R * .72, cy - H * .28), (cx - R * .86, cy), (cx - R * .7, cy + H * .26), 10, PAPER_L)
    out = hitodama(cx - R - 30, top + 40 + 16 * math.sin(2 * math.pi * ph), 1.0, ph)
    # handle hook and lacquer caps
    out += stroke(f"M{f(cx - 34)} {f(top - 14)} Q{f(cx - 6 + ph * 4)} {f(top - 86)} {f(cx + 30)} {f(top - 14)}", 10, LACQ)
    out += shaded(d, body, PAPER, PAPER_D, 16, -6, inner + ribs + bands + hl)
    out += rrect(cx - 62, top - 22, 124, 32, 10, LACQ) + brush((cx - 48, top - 10), (cx - 10, top - 14), (cx + 26, top - 10), 5, LACQ_L)
    out += rrect(cx - 72, base - 14, 144, 34, 11, LACQ) + brush((cx - 58, base - 2), (cx - 10, base - 6), (cx + 34, base - 2), 5, LACQ_L)
    # the one big eye
    ex, ey = cx - 18, cy - H * .2
    if eye == "squint":
        out += fill(f"M{ex - 46} {f(ey + 6)} Q{ex} {f(ey - 30)} {ex + 46} {f(ey + 6)} Q{ex} {f(ey + 20)} {ex - 46} {f(ey + 6)} Z", "#ffffff", 7)
        out += ell(ex + 12, ey, 15, 12, O, 0)
        out += line(f"M{ex - 52} {f(ey - 4)} Q{ex} {f(ey - 40)} {ex + 52} {f(ey - 4)}", 7)
    else:
        r = 52 if eye == "wide" else 46
        out += ell(ex, ey, r, r * 1.08, "#ffffff", 8)
        pr = 15 if eye == "wide" else 20
        out += ell(ex + 16, ey + 4, pr, pr * 1.2, O, 0) + f'<circle cx="{f(ex + 10)}" cy="{f(ey - 6)}" r="6" fill="#ffffff" stroke="none"/>'
        out += fill_ns(f"M{f(ex - r * .8)} {f(ey + r * .5)} A{r} {r} 0 0 0 {f(ex + r * .8)} {f(ey + r * .5)} Q{f(ex)} {f(ey + r * .7)} {f(ex - r * .8)} {f(ey + r * .5)} Z", PAPER_D, .6)
    # the torn mouth: a ragged rip in the paper, teeth, the tongue
    my = cy + H * .16
    gap = 14 + 70 * mo
    x0, x1 = cx - R + 4, cx + R - 4
    jag = " ".join(f"L{f(x0 + (x1 - x0) * i / 8)} {f(my - (12 if i % 2 else 0) - 8 * math.sin(i))}" for i in range(1, 8))
    mouth = (f"M{f(x0)} {f(my)} {jag} L{f(x1)} {f(my - 6)} Q{f(cx + 40)} {f(my + gap)} {f(cx)} {f(my + gap)} Q{f(cx - 60)} {f(my + gap)} {f(x0)} {f(my)} Z")
    out += fill(mouth, MAW, 8)
    teeth = "".join(fill(f"M{f(x)} {f(my - 4)} L{f(x + 9)} {f(my + 14 + 8 * mo)} L{f(x + 18)} {f(my - 4)} Z", PAPER_L, 4) for x in (cx - 70, cx - 34, cx + 4, cx + 40))
    out += teeth
    # paper flaps where it tore
    out += fill(f"M{f(x0 + 2)} {f(my - 4)} L{f(x0 - 22)} {f(my + 22)} L{f(x0 + 18)} {f(my + 10)} Z", PAPER, 5)
    out += fill(f"M{f(x1 - 2)} {f(my - 8)} L{f(x1 + 24)} {f(my + 12)} L{f(x1 - 16)} {f(my + 8)} Z", PAPER, 5)
    sw_ = 26 * math.sin(2 * math.pi * ph)
    t0 = (cx + 6, my + gap * .6)
    if lash:
        t1 = (cx + 150 + lash, my - 10); c = (cx + 120, my + gap + 60)
    else:
        t1 = (cx + 34 + sw_, my + gap + 110); c = (cx + 60, my + gap + 40)
    out += fill(limb(t0, c, t1, 40, 24), TONGUE, 7)
    out += line(f"M{f(t0[0])} {f(t0[1] + 10)} Q{f(c[0])} {f(c[1] - 6)} {f(t1[0] - 4)} {f(t1[1] - 4)}", 5, TONGUE_D)
    out += f'<circle cx="{f(t1[0])}" cy="{f(t1[1])}" r="13" fill="{TONGUE}" stroke-width="{sw(6)}"/>'
    if lash:
        out += sparkle(t1[0] + 40, t1[1] - 30, 1.6, FL_M) + sparkle(t1[0] + 20, t1[1] + 36, 1.0, FL_I)
        for k in range(3):
            out += brush((t1[0] - 140, my - 70 + k * 46), (t1[0] - 60, my - 66 + k * 46), (t1[0] - 10, my - 60 + k * 46), 8, PAPER_L, .5)
    if lean:
        out = f'<g transform="rotate({lean} {cx} {base + 20})">{out}</g>'
    return d, b + out


def hitodama(x, y, s, ph=0.0):
    """A ghost fire: a round cold flame trailing a long wavy tail up and back, two dot eyes."""
    w = 14 * math.sin(2 * math.pi * ph)
    tail = (f"M{f(x - 30 * s)} {f(y - 4 * s)} Q{f(x - 64 * s)} {f(y - 50 * s)} {f(x - 34 * s + w)} {f(y - 86 * s)} "
            f"Q{f(x - 10 * s + w)} {f(y - 118 * s)} {f(x - 46 * s - w)} {f(y - 160 * s)} "
            f"Q{f(x + 10 * s + w)} {f(y - 130 * s)} {f(x - 2 * s + w)} {f(y - 84 * s)} Q{f(x + 6 * s)} {f(y - 50 * s)} {f(x + 30 * s)} {f(y - 10 * s)} "
            f"Q{f(x + 36 * s)} {f(y + 30 * s)} {f(x)} {f(y + 34 * s)} Q{f(x - 36 * s)} {f(y + 30 * s)} {f(x - 30 * s)} {f(y - 4 * s)} Z")
    g = f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(60 * s)}" fill="{HITO}" opacity=".2" stroke="none"/>'
    g += fill(tail, HITO, 6) + ell(x - 4 * s, y + 8 * s, 18 * s, 16 * s, HITO_L, 0)
    g += f'<circle cx="{f(x - 12 * s)}" cy="{f(y + 6 * s)}" r="{f(5 * s)}" fill="{O}" stroke="none"/><circle cx="{f(x + 8 * s)}" cy="{f(y + 6 * s)}" r="{f(5 * s)}" fill="{O}" stroke="none"/>'
    return g


# ================================================================ creature: the hopping corpse (jiangshi)
def qing_hat(cx, cy, d):
    """Qing court hat: a dark upturned brim, a dome of red fringe, a gilt finial."""
    h = ""
    dome = f"M{cx - 84} {cy} Q{cx - 80} {cy - 92} {cx} {cy - 98} Q{cx + 80} {cy - 92} {cx + 84} {cy} Z"
    fringe = "".join(line(f"M{cx} {cy - 92} Q{f(cx + k * 40)} {cy - 70} {f(cx + k * 76)} {cy - 6}", 5, VERM_D) for k in (-1, -.6, -.2, .2, .6, 1))
    h += shaded(d, dome, VERM, VERM_D, 12, -4, fringe + brush((cx - 60, cy - 30), (cx - 44, cy - 70), (cx - 10, cy - 86), 7, VERM_L))
    h += fill(f"M{cx - 112} {cy + 12} Q{cx - 116} {cy - 28} {cx - 90} {cy - 30} Q{cx} {cy - 20} {cx + 90} {cy - 30} Q{cx + 116} {cy - 28} {cx + 112} {cy + 12} Q{cx} {cy + 30} {cx - 112} {cy + 12} Z", LACQ, 8)
    h += brush((cx - 96, cy - 12), (cx - 40, cy - 16), (cx + 20, cy - 14), 6, LACQ_L)
    h += ell(cx, cy - 104, 16, 12, GOLD, 6) + f'<circle cx="{cx}" cy="{cy - 124}" r="13" fill="{RD}" stroke-width="{sw(6)}"/>'
    h += f'<circle cx="{cx - 4}" cy="{cy - 128}" r="4" fill="#ffd1c8" stroke="none"/>'
    return h


def talisman(x, y, flap, ph):
    """The binding charm pinned to the hat brim; `flap` (0..1) lifts it in the wind."""
    rot = -flap * 150 + 6 * math.sin(2 * math.pi * ph)
    p = ""
    p += fill("M-30 0 L30 0 L32 128 Q16 138 0 130 Q-16 140 -32 128 Z", OFUDA, 7)
    p += line("M0 14 L0 112 M-16 30 Q0 22 16 34 M-14 58 Q2 48 14 62 Q-4 72 -14 66 M-12 90 L12 84", 6, SCRIPT)
    p += brush((-20, 8), (-22, 60), (-18, 116), 6, "#fff0b0", .8)
    return G(p, x, y, rot)


def jiangshi(P):
    d = []; b = ""
    lift = P.get("lift", 0); crouch = P.get("crouch", 0); lean = P.get("lean", 0); ph = P.get("ph", 0)
    reach = P.get("reach", 0); raise_ = P.get("raise", 0); flap = P.get("flap", 0); hem = P.get("hem", 0)
    lunge = P.get("lunge", 0)
    oy = -lift + crouch
    cx = 244 + lunge
    out = ""
    # feet together in black court boots
    fy = 722 - lift
    for i, x in enumerate((cx - 26, cx + 30)):
        out += rrect(x - 28, fy - 34, 60, 46, 14, LACQ_D if i == 0 else LACQ, 8)
        out += rrect(x - 30, fy + 6, 64, 14, 6, PAPER, 6)
    # back arm (stiff, held out)
    def arm_out(sx, sy, ang, sleeve, sleeve_d, skin, back):
        a = math.radians(ang)
        ex, ey = sx + 150 * math.cos(a) + reach, sy + 150 * math.sin(a)
        s = union([limb((sx, sy), ((sx + ex) / 2, (sy + ey) / 2 + 6), (ex, ey), 44, 62)], sleeve)
        s += ell(ex, ey, 14, 32, sleeve_d, 7)
        hx, hy = ex + 24, ey + 6
        hand = ""
        for k in range(3):
            nx = hx + 4 + k * 13
            hand += fill(f"M{nx - 2} {hy + 30 + k * 2} Q{nx + 2} {hy + 62 + k * 4} {nx + 14} {hy + 74 + k * 5} Q{nx + 12} {hy + 50 + k * 4} {nx + 12} {hy + 30 + k * 2} Z", LACQ_L if back else LACQ, 5)
        hand = hand + fill(f"M{hx - 18} {hy - 24} Q{hx + 30} {hy - 28} {hx + 36} {hy + 6} L{hx + 30} {hy + 40} Q{hx + 4} {hy + 48} {hx - 18} {hy + 24} Z", skin, 7)
        return hand + s
    sh_y = 440 + oy
    out += arm_out(cx - 10, sh_y - 6, -6 - raise_, ROBE_D, LACQ_D, CORPSE_D, True)
    # Qing robe with a rank badge and the striped sea-wave hem
    robe = (f"M{cx - 60} {414 + oy} L{cx + 64} {414 + oy} Q{cx + 104} {520 + oy} {cx + 118 + hem} {690 - lift + crouch * .3} "
            f"Q{cx} {706 - lift + crouch * .3} {cx - 112 + hem} {690 - lift + crouch * .3} Q{cx - 100} {520 + oy} {cx - 60} {414 + oy} Z")
    waves = ""
    for k in range(4):
        yy = 640 - lift + crouch * .3 + k * 14
        waves += line(f"M{cx - 130 + hem} {f(yy)} " + " ".join(f"Q{f(cx - 115 + j * 30 + hem)} {f(yy - 12)} {f(cx - 100 + j * 30 + hem)} {f(yy)}" for j in range(8)), 6, (GOLD, JADE_L, VERM, PAPER)[k])
    out += shaded(d, robe, ROBE, ROBE_D, 14, -4, waves + brush((cx - 70, 460 + oy), (cx - 84, 540 + oy), (cx - 90, 620 + oy), 9, ROBE_L))
    out += line(f"M{cx + 2} {420 + oy} L{cx + 4 + hem * .5} {630 + oy}", 5, ROBE_D)
    out += rrect(cx - 42, 470 + oy, 84, 80, 6, GOLD, 7)
    out += rrect(cx - 30, 482 + oy, 60, 56, 4, ROBE_D, 5)
    out += f'<circle cx="{cx + 10}" cy="{496 + oy}" r="9" fill="{RD}" stroke="none"/>'
    out += fill(f"M{cx - 22} {528 + oy} Q{cx - 8} {500 + oy} {cx + 4} {518 + oy} Q{cx + 14} {508 + oy} {cx + 22} {526 + oy} Z", PAPER, 4)
    # court beads
    for k in range(9):
        a = math.radians(200 - k * 22)
        out += f'<circle cx="{f(cx + 66 * math.cos(a))}" cy="{f(430 + oy - 60 * math.sin(a) + 50)}" r="8" fill="{ORG}" stroke-width="{sw(4)}"/>'
    # head: grey-green, sunken eyes, little fangs
    hc = (cx + 6, 350 + oy)
    head = ell(hc[0], hc[1], 88, 82, CORPSE, 8)
    head += fill_ns(f"M{hc[0] + 30} {hc[1] + 40} a50 40 0 0 1 -6 40 a88 82 0 0 0 60 -56 Z", CORPSE_D, .6)
    head += ell(hc[0] - 52, hc[1] + 38, 16, 10, "#8f7aa0", 0, extra=' opacity=".55"') + ell(hc[0] + 58, hc[1] + 38, 16, 10, "#8f7aa0", 0, extra=' opacity=".55"')
    angry = flap > .5
    for s in (-1, 1):
        x = hc[0] + s * 36; y = hc[1] + 14
        head += ell(x, y, 22, 18, "#5d6f62", 0, extra=' opacity=".8"')
        if angry:
            head += fill(f"M{x + s * 22} {y - 14} L{x - s * 18} {y} Q{x - s * 14} {y + 16} {x} {y + 16} Q{x + s * 20} {y + 14} {x + s * 22} {y - 14} Z", "#c8ff8a", 4)
            head += f'<circle cx="{x + s * 2}" cy="{y + 6}" r="4" fill="{O}" stroke="none"/>'
        else:
            head += line(f"M{x - 14} {y + 2} Q{x} {y + 10} {x + 14} {y + 2}", 6)
    mo = P.get("mouth", 0)
    head += fill(f"M{hc[0] - 22} {hc[1] + 54} Q{hc[0]} {hc[1] + 48} {hc[0] + 22} {hc[1] + 54} Q{hc[0] + 18} {hc[1] + 62 + mo} {hc[0]} {hc[1] + 64 + mo} Q{hc[0] - 18} {hc[1] + 62 + mo} {hc[0] - 22} {hc[1] + 54} Z", MAW, 5)
    head += fill(f"M{hc[0] - 16} {hc[1] + 52} L{hc[0] - 10} {hc[1] + 70} L{hc[0] - 4} {hc[1] + 53} Z M{hc[0] + 16} {hc[1] + 52} L{hc[0] + 10} {hc[1] + 70} L{hc[0] + 4} {hc[1] + 53} Z", PAPER_L, 3)
    head += fill(f"M{hc[0] - 90} {hc[1] - 10} Q{hc[0] - 96} {hc[1] + 60} {hc[0] - 70} {hc[1] + 80} L{hc[0] - 62} {hc[1] - 20} Z", HAIR, 6)
    head += qing_hat(hc[0], hc[1] - 46, d)
    head += talisman(hc[0] + 4, hc[1] - 40, flap, ph)
    out += head
    out += arm_out(cx + 30, sh_y + 10, 4 - raise_, ROBE, ROBE_D, CORPSE, False)
    if P.get("fx") == "claw":
        for k in range(3):
            out += brush((cx + 210, 420 + oy + k * 34), (cx + 290, 450 + oy + k * 34), (cx + 320, 520 + oy + k * 34), 12, "#c8ff8a", .8)
    if lean:
        out = f'<g transform="rotate({lean} {cx} {fy + 10})">{out}</g>'
    return d, b + out


def creature_frames(fn, walk, attack, idle):
    mk = lambda P: (lambda: fn(P))
    return [mk(p) for p in walk] + [mk(p) for p in attack] + [mk(idle)]


CHOCHIN = creature_frames(chochin,
    [dict(ph=0, sq=.9, lift=0, mouth=.35), dict(ph=.25, sq=1.07, lift=44, mouth=.5), dict(ph=.5, sq=1.0, lift=76, mouth=.6), dict(ph=.75, sq=1.04, lift=26, mouth=.45)],
    [dict(ph=0, sq=.88, lean=-12, mouth=.15, eye="squint"), dict(ph=.3, sq=1.04, lean=10, lift=20, mouth=1.0, lash=40, eye="wide"), dict(ph=.6, sq=.96, lean=4, mouth=.55)],
    dict(ph=.1, mouth=.45))
JIANGSHI = creature_frames(jiangshi,
    [dict(ph=0, crouch=18, hem=4), dict(ph=.25, lift=46, hem=-10, flap=.15), dict(ph=.5, lift=84, hem=-4, flap=.3), dict(ph=.75, lift=30, hem=10, flap=.2)],
    [dict(ph=0, crouch=14, lean=-8, **{"raise": 26}, flap=.35, mouth=6), dict(ph=.3, lunge=40, lean=10, reach=30, flap=.95, mouth=16, fx="claw"), dict(ph=.6, lunge=14, lean=4, flap=.6, mouth=8)],
    dict(ph=0))


# ================================================================ the fallen daoshi's bell
def bell(x, y, ring=0.0):
    """A bronze hand bell on a short cord; `ring` (0..1) swings it and draws the sound."""
    rot = 26 * ring
    g = stroke("M0 -40 L0 -14", 7, VERM)
    g += fill("M-26 30 Q-30 -10 0 -16 Q30 -10 26 30 Q0 38 -26 30 Z", BRONZE, 7)
    g += fill_ns("M6 -12 Q28 -6 24 28 Q16 32 10 30 Q16 4 6 -12 Z", BRONZE_D, .8)
    g += brush((-16, 22), (-20, 4), (-8, -8), 6, BRONZE_L)
    g += ell(0, 32, 9, 7, BRONZE_D, 5)
    out = G(g, x, y, rot)
    if ring:
        for k in range(3):
            r = 46 + k * 22
            out += line(f"M{f(x + r * .5)} {f(y - r * .6)} Q{f(x + r * .9)} {f(y)} {f(x + r * .5)} {f(y + r * .6)}", 6, OFUDA, ' opacity=".8"')
    return out


# ================================================================ creature: the one-legged umbrella (kasa-obake)
def kasa(P):
    """A closed paper umbrella on one hairy leg and a geta, one big eye, a long tongue. `open` (0..1) spreads
    the canopy for the leap; `lift` raises it off the ground; `crouch` bends the leg."""
    d = []; b = ""
    lift = P.get("lift", 0); op = P.get("open", 0); lean = P.get("lean", 0); ph = P.get("ph", 0)
    crouch = P.get("crouch", 0); tongue = P.get("tongue", 0); eye = P.get("eye", "open")
    cx = 256
    fy = 728 - lift
    knee = (cx + 10 + crouch * .6, fy - 92 + crouch)
    hip = (cx, fy - 170 + crouch * 1.6)
    out = ""
    # the geta and the leg (the umbrella's handle grown a foot)
    out += rrect(cx - 54, fy - 6, 112, 18, 6, WD, 7) + rrect(cx - 40, fy + 10, 18, 16, 3, WD_D, 5) + rrect(cx + 22, fy + 10, 18, 16, 3, WD_D, 5)
    out += stroke(f"M{f(cx - 20)} {f(fy - 4)} Q{cx} {f(fy - 20)} {f(cx + 22)} {f(fy - 4)}", 6, VERM)
    leg = limb(hip, knee, (cx + 4, fy - 14), 30, 40)
    out += fill(leg, SKIN_D, 8)
    for k in range(5):
        t = .2 + k * .14; px = hip[0] + (cx + 4 - hip[0]) * t + 18; py = hip[1] + (fy - 14 - hip[1]) * t
        out += line(f"M{f(px)} {f(py)} l12 6", 4, LACQ)
    out += fill(f"M{cx - 30} {f(fy - 22)} Q{cx + 4} {f(fy - 40)} {cx + 40} {f(fy - 22)} Q{cx + 46} {f(fy - 4)} {cx + 4} {f(fy - 2)} Q{cx - 34} {f(fy - 4)} {cx - 30} {f(fy - 22)} Z", SKIN_D, 7)
    # canopy: a folded cone that spreads into a dome
    top = hip[1] - 380 + op * 110
    brim_y = hip[1] + 10 - op * 30
    half = 92 + op * 150
    tip = (cx + 6 + 10 * math.sin(2 * math.pi * ph), top)
    canopy = (f"M{f(tip[0])} {f(tip[1])} Q{f(cx + half * .5)} {f(top + 90 - op * 40)} {f(cx + half)} {f(brim_y)} "
              f"Q{f(cx + half * .5)} {f(brim_y + 22 + op * 10)} {cx} {f(brim_y + 16)} Q{f(cx - half * .5)} {f(brim_y + 22 + op * 10)} {f(cx - half)} {f(brim_y)} "
              f"Q{f(cx - half * .5)} {f(top + 90 - op * 40)} {f(tip[0])} {f(tip[1])} Z")
    folds = "".join(line(f"M{f(tip[0])} {f(tip[1] + 14)} Q{f(cx + k * half * .45)} {f((top + brim_y) / 2)} {f(cx + k * half * .9)} {f(brim_y + 6)}", 5, KASA_D) for k in (-.66, -.22, .22, .66))
    band = line(f"M{f(cx - half * .78)} {f(brim_y - 30)} Q{cx} {f(brim_y - 10)} {f(cx + half * .78)} {f(brim_y - 30)}", 14, VERM)
    patch = fill(f"M{f(cx + half * .3)} {f(top + (brim_y - top) * .3)} l40 10 l-6 44 l-40 -8 Z", PAPER_D, 4)
    hl = brush((cx - half * .6, brim_y - 20), (cx - half * .42, (top + brim_y) / 2), (tip[0] - 16, tip[1] + 40), 10, KASA_L)
    out += shaded(d, canopy, KASA, KASA_D, 16, -6, folds + band + patch + hl)
    out += f'<circle cx="{f(tip[0])}" cy="{f(tip[1] - 8)}" r="14" fill="{LACQ}" stroke-width="{sw(6)}"/>'
    # the one eye and the mouth with its tongue
    ex, ey = cx - 4, top + (brim_y - top) * .48
    if eye == "squint":
        out += fill(f"M{ex - 40} {f(ey + 4)} Q{ex} {f(ey - 24)} {ex + 40} {f(ey + 4)} Q{ex} {f(ey + 18)} {ex - 40} {f(ey + 4)} Z", "#ffffff", 7)
        out += ell(ex + 10, ey, 13, 10, O, 0)
    else:
        r = 44 if eye == "wide" else 38
        out += ell(ex, ey, r, r * 1.1, "#ffffff", 8)
        pr = 13 if eye == "wide" else 17
        out += ell(ex + 12, ey + 4, pr, pr * 1.2, O, 0) + f'<circle cx="{f(ex + 6)}" cy="{f(ey - 6)}" r="5" fill="#ffffff" stroke="none"/>'
    my = ey + 74
    out += fill(f"M{ex - 34} {f(my)} Q{ex} {f(my + 30 + tongue * 20)} {ex + 34} {f(my)} Q{ex} {f(my + 10)} {ex - 34} {f(my)} Z", MAW, 6)
    t0 = (ex + 4, my + 14); t1 = (ex + 60 + tongue * 110, my + 100 - tongue * 60 + 10 * math.sin(2 * math.pi * ph)); c = (ex + 40, my + 70)
    out += fill(limb(t0, c, t1, 28, 18), TONGUE, 6)
    out += f'<circle cx="{f(t1[0])}" cy="{f(t1[1])}" r="10" fill="{TONGUE}" stroke-width="{sw(5)}"/>'
    if op > .5:
        for k in range(5):
            a = math.radians(-160 + k * 35)
            out += brush((cx + math.cos(a) * half * .9, brim_y + 40 + math.sin(a) * 30), (cx + math.cos(a) * half * 1.05, brim_y + 70), (cx + math.cos(a) * half * 1.1, brim_y + 110), 8, HITO_L, .7)
    if lean:
        out = f'<g transform="rotate({lean} {cx} {fy})">{out}</g>'
    return d, b + out


# ================================================================ the long-haired ladies: rokurokubi and yuki-onna
def lady(P, pal):
    """A woman in a kimono with long black hair. `neck` (dx, dy) puts the head that far from the neck's
    root, drawn as a long pale neck when it is far; `mist` trails the hem off into nothing (no feet);
    `breath` (0..1) blows frost from the mouth."""
    d = []; b = ""
    by = P.get("by", 0); lean = P.get("lean", 0); sway = P.get("hem", 0)
    root = (256, 452 + by)
    nx, ny = P.get("neck", (0, -60))
    hc = (root[0] + nx, root[1] + ny)
    out = ""
    # hair down her back, behind everything
    # (a stretched neck carries the head away: its hair then hangs shorter, in a loose tail)
    hl_ = 150 if math.hypot(nx, ny) > 170 else 250
    hair_back = (f"M{hc[0] - 96} {hc[1] - 10} Q{hc[0] - 120} {hc[1] + hl_ * .56} {hc[0] - 70 - sway} {hc[1] + hl_} "
                 f"Q{hc[0]} {hc[1] + hl_ + 20} {hc[0] + 70 - sway} {hc[1] + hl_ - 10} Q{hc[0] + 110} {hc[1] + hl_ * .48} {hc[0] + 96} {hc[1] - 10} Z")
    out += fill(hair_back, HAIR, 8)
    if not pal.get("mist"):
        for i, x in enumerate((236, 276)):
            fy = 724 - (P.get("step", 0) if i else 0)
            out += rrect(x - 26, fy - 4, 52, 16, 5, WD, 6) + rrect(x - 18, fy - 22, 36, 22, 10, PAPER, 6)
    # the back sleeve
    ab = P.get("ab", (-12, -8))
    a_b, _ = wide_sleeve(d, (214, 484 + by), ab[0], ab[1], pal["robe_d"], pal["robe_dd"], pal["skin_d"], cuff=56, drop=26)
    out += a_b
    # kimono: straight, with a crossed collar and an obi
    if pal.get("mist"):
        hem = 700 + by
        robe = (f"M212 {464 + by} L300 {464 + by} Q326 {560 + by} {334 + sway} {hem} "
                + " ".join(f"Q{f(320 - k * 22 + sway)} {f(hem + 26 + (k % 2) * 18)} {f(312 - (k + 1) * 22 + sway)} {f(hem + (k % 2) * 10)}" for k in range(6))
                + f" Q188 {560 + by} 212 {464 + by} Z")
    else:
        robe = f"M212 {464 + by} L300 {464 + by} Q324 {560 + by} {324 + sway} {712 + by} Q256 {722 + by} {188 + sway} {712 + by} Q190 {560 + by} 212 {464 + by} Z"
    pattern = "".join(blossom(x, y + by, 12, pal["robe_l"], pal["robe_d"]) for x, y in ((236, 640), (290, 600), (270, 680), (222, 560)))
    out += shaded(d, robe, pal["robe"], pal["robe_d"], 14, -4, pattern + brush((216, 500 + by), (204, 590 + by), (204, 670 + by), 8, pal["robe_l"]))
    out += stroke(f"M226 {468 + by} L262 {520 + by} L296 {468 + by}", 8, pal["collar"])
    out += rrect(204, 540 + by, 104, 34, 8, pal["obi"], 7) + line(f"M210 {556 + by} L302 {556 + by}", 4, pal["obi_d"])
    if pal.get("mist"):
        for k in range(4):
            out += fill_ns(blob(196 + k * 40 + sway, 726 + by + (k % 2) * 12, 34, 14, 7, .2, 11 + k), SNOW_L, .55)
    # the neck: short and hidden by the collar, or a long pale rope
    far = math.hypot(nx, ny) > 90
    if far:
        c = P.get("bend", (root[0] - 60, (root[1] + hc[1]) / 2))
        out += fill(limb(root, c, (hc[0], hc[1] + 70), 34, 30), pal["skin"], 8)
        out += line(f"M{root[0] + 8} {root[1] - 10} Q{f(c[0] + 10)} {f(c[1])} {f(hc[0] + 8)} {f(hc[1] + 60)}", 5, pal["skin_d"])
    else:
        out += rrect(root[0] - 18, hc[1] + 60, 36, root[1] - hc[1] - 50, 14, pal["skin"], 7)
    # head: face, a straight fringe, side locks
    head = face(hc, P, blush=pal.get("blush", False), skin=pal["skin"], skin_d=pal["skin_d"])
    y = hc[1]
    head += fill(f"M{hc[0] - 100} {y + 6} Q{hc[0] - 104} {y - 96} {hc[0]} {y - 98} Q{hc[0] + 104} {y - 96} {hc[0] + 100} {y + 6} "
                 f"L{hc[0] + 84} {y + 6} L{hc[0] + 80} {y - 18} L{hc[0] - 80} {y - 18} L{hc[0] - 84} {y + 6} Z", HAIR, 7)
    head += fill(f"M{hc[0] - 100} {y} Q{hc[0] - 108} {y + 70} {hc[0] - 96} {y + 110} L{hc[0] - 76} {y + 104} L{hc[0] - 80} {y + 4} Z "
                 f"M{hc[0] + 100} {y} Q{hc[0] + 108} {y + 70} {hc[0] + 96} {y + 110} L{hc[0] + 76} {y + 104} L{hc[0] + 80} {y + 4} Z", HAIR, 6)
    head += brush((hc[0] - 70, y - 60), (hc[0] - 30, y - 84), (hc[0] + 20, y - 86), 8, HAIR_L)
    if pal.get("comb"):
        head += rrect(hc[0] + 30, y - 100, 60, 18, 8, pal["comb"], 6, (-12, hc[0] + 60, y - 92))
    if P.get("breath"):
        k = P["breath"]
        for i in range(4):
            yy = y + 60 + i * 14 - 20
            head += brush((hc[0] + 20, y + 62), (hc[0] + 120 + i * 30, yy), (hc[0] + 180 + i * 50 * k, yy + (i - 1.5) * 30), 16 - i * 2, SNOW_L, .75)
        head += sparkle(hc[0] + 210, y + 40, 1.8, "#ffffff") + sparkle(hc[0] + 170, y + 110, 1.2, pal["robe_l"])
    out += head
    # the front sleeve
    af = P.get("af", (14, 8))
    a_f, hf = wide_sleeve(d, (298, 484 + by), af[0], af[1], pal["robe"], pal["robe_d"], pal["skin"], cuff=56, drop=26)
    out += a_f
    if lean:
        out = f'<g transform="rotate({lean} 256 {700 + by})">{out}</g>'
    return d, b + out


ROKURO = dict(robe=PLUM, robe_d=PLUM_D, robe_l=PLUM_L, robe_dd="#3e2234", collar=PAPER, obi=GOLD, obi_d=GOLD_D, skin=PALE, skin_d=PALE_D, comb=VERM)
YUKI = dict(robe=SNOW, robe_d=SNOW_D, robe_l=SNOW_L, robe_dd="#9cb0c0", collar=ICEB, obi=ICEB, obi_d=ICEB_D, skin=FROSTSK, skin_d=FROSTSK_D, mist=True)


def rokurokubi(P):
    return lady(P, ROKURO)


def yukionna(P):
    return lady(P, YUKI)


KASA_FRAMES = creature_frames(kasa,
    [dict(ph=0, crouch=30, lift=0), dict(ph=.25, lift=46, crouch=0), dict(ph=.5, lift=76, crouch=-6, tongue=.2), dict(ph=.75, lift=24, crouch=10)],
    [dict(ph=0, crouch=58, lean=-8, eye="squint"), dict(ph=.3, lift=70, open=1, lean=14, eye="wide", tongue=1), dict(ph=.6, crouch=36, open=.4, lean=4, tongue=.4)],
    dict(ph=.1, crouch=8))
ROKURO_FRAMES = creature_frames(rokurokubi,
    [dict(neck=(-10, -150), hem=-6, step=0, eyes="closed", mouth="smile"), dict(neck=(6, -168), by=-6, hem=0, step=10, eyes="closed", mouth="smile"),
     dict(neck=(20, -152), hem=6, step=0, eyes="closed", mouth="smile"), dict(neck=(4, -166), by=-6, hem=0, step=10, eyes="closed", mouth="smile")],
    [dict(neck=(-60, -250), bend=(320, 300), eyes="focus", mouth="o", af=(40, 30), lean=-4),
     dict(neck=(210, -120), bend=(200, 300), eyes="focus", mouth="shout", af=(70, 80), lean=6),
     dict(neck=(80, -190), bend=(180, 330), eyes="open", mouth="o", lean=2)],
    dict(neck=(0, -60), eyes="closed", mouth="smile"))
YUKI_FRAMES = creature_frames(yukionna,
    [dict(by=0, hem=-8, eyes="closed", mouth="smile"), dict(by=-14, hem=0, eyes="closed", mouth="smile"),
     dict(by=-20, hem=8, eyes="closed", mouth="smile"), dict(by=-8, hem=0, eyes="closed", mouth="smile")],
    [dict(by=-10, af=(-70, -110), ab=(-40, -70), eyes="closed", mouth="o", lean=-6),
     dict(by=-16, af=(96, 110), eyes="focus", mouth="o", breath=1, lean=8),
     dict(by=-12, af=(60, 70), eyes="open", mouth="o", breath=.4, lean=3)],
    dict(by=-6, eyes="closed", mouth="smile"))
DAOSHI_FRAMES = creature_frames(daoshi,
    [dict(fallen=True, feet=[(-34, 0), (30, 0)], ab=(22, 12), af=(-18, -10), hem=-8, hat=-4, eyes="focus"),
     dict(fallen=True, feet=[(-6, 0), (6, 26)], ab=(6, 2), af=(-2, 4), by=-10, hat=2, eyes="focus"),
     dict(fallen=True, feet=[(30, 0), (-34, 0)], ab=(-22, -12), af=(24, 16), hem=8, hat=4, eyes="focus"),
     dict(fallen=True, feet=[(6, 26), (-6, 0)], ab=(-6, -2), af=(6, 10), by=-10, hat=-2, eyes="focus")],
    [dict(fallen=True, af=(-70, -110), ab=(10, 10), lean=-6, eyes="focus", mouth="shout", fx="glow", ring=.6),
     dict(fallen=True, af=(96, 110), ab=(-30, -40), lean=8, eyes="focus", mouth="shout", fx="spark", feet=[(-40, 0), (34, 0)], hem=10, ring=1),
     dict(fallen=True, af=(60, 70), ab=(-20, -24), lean=4, eyes="focus", mouth="o", feet=[(-36, 0), (30, 0)], ring=.3)],
    dict(fallen=True, eyes="focus"))


# ================================================================ trees
def sakura():
    """An old cherry: a gnarled dark trunk under clouds of blossom, petals drifting down."""
    d = []; b = ""
    limbs = [((256, 744), (276, 660), (246, 560), 92, 46), ((250, 610), (176, 574), (110, 506), 36, 12),
             ((254, 588), (336, 556), (404, 492), 34, 12), ((248, 570), (232, 480), (270, 392), 32, 10),
             ((206, 744), (176, 728), (146, 744), 30, 10), ((306, 742), (338, 728), (364, 744), 28, 10)]
    b += union([limb(*l) for l in limbs], BARK)
    b += brush((282, 720), (290, 660), (270, 590), 10, BARK_L) + brush((232, 700), (236, 660), (228, 630), 7, BARK_D)
    b += fill("M262 660 Q274 648 284 662 Q274 676 262 660 Z", BARK_D, 5)
    # back layer of blossom, a few bare twigs, then the front layer
    for i, (x, y, rx, ry) in enumerate([(130, 420, 96, 70), (382, 410, 100, 72), (256, 318, 120, 82), (176, 340, 80, 60), (340, 334, 84, 60)]):
        b += shaded(d, cloud(x, y, rx, ry, 9, 30 + i), SAK_D, "#a35a78", 8, -10)
    for (p0, c, p1) in [((110, 506), (80, 480), (60, 446)), ((404, 492), (440, 470), (458, 438)), ((270, 392), (290, 350), (300, 300))]:
        b += fill(limb(p0, c, p1, 12, 4), BARK, 6)
    front = [(116, 492, 62, 46), (406, 482, 66, 48), (186, 458, 104, 72), (330, 452, 108, 72), (256, 392, 124, 86)]
    for i, (x, y, rx, ry) in enumerate(front):
        hl = brush((x - rx * .7, y - ry * .2), (x - rx * .4, y - ry * .7), (x + rx * .1, y - ry * .8), 9, SAK_L)
        b += shaded(d, cloud(x, y, rx, ry, 10, 50 + i), SAK, SAK_D, 10, -14, hl)
    for (x, y, r_) in [(70, 470, 17), (150, 430, 20), (120, 520, 15), (214, 410, 18), (178, 500, 16), (262, 470, 17), (300, 420, 19),
                       (360, 480, 18), (440, 470, 16), (392, 420, 17), (226, 340, 20), (300, 330, 17), (256, 400, 15), (330, 370, 16), (190, 370, 15)]:
        b += blossom(x, y, r_)
    for (x, y, rot) in [(66, 590, 20), (440, 610, -30), (130, 660, 60), (400, 690, 10), (470, 540, 80)]:
        b += petal(x, y, rot, 1.7)
    for (x, rot) in [(170, 90), (330, 70), (380, 100)]:
        b += G(at_scale(1.3, lambda: fill("M0 -10 Q12 -4 8 8 L0 4 L-8 8 Q-12 -4 0 -10 Z", SAK, 5)), x, 738, rot, 1.6, .7)
    return d, b


def pine_pad(d, cx, cy, rw, rh, n=4):
    """A flat cloud of pine needles: domed top, scalloped underside."""
    p = f"M{f(cx - rw)} {f(cy)} C{f(cx - rw * .9)} {f(cy - rh * 1.5)} {f(cx + rw * .9)} {f(cy - rh * 1.5)} {f(cx + rw)} {f(cy)}"
    step = 2 * rw / n
    for i in range(n):
        x1 = cx + rw - step * (i + 1)
        p += f" A{f(step * .55)} {f(step * .42)} 0 0 1 {f(x1)} {f(cy)}"
    p += " Z"
    tufts = "".join(brush((cx - rw * .6 + k * rw * .4, cy - rh * .1), (cx - rw * .52 + k * rw * .4, cy - rh * .5), (cx - rw * .4 + k * rw * .4, cy - rh * .8), 6, PINE_D) for k in range(4))
    hl = brush((cx - rw * .8, cy - rh * .4), (cx - rw * .2, cy - rh * 1.1), (cx + rw * .5, cy - rh * 1.0), 9, PINE_L)
    return shaded(d, p, PINE, PINE_D, 6, -16, tufts + hl)


def shide(x, y, s=1.0, rot=0):
    """Zigzag paper streamer of a sacred rope."""
    z = "M-10 0 L10 0 L10 22 L22 22 L22 50 L4 50 L4 76 L16 76 L16 104 L-4 104 L-4 78 L-14 78 L-14 52 L2 52 L2 24 L-10 24 Z"
    return G(at_scale(s, lambda: fill(z, PAPER_L, 6) + fill_ns("M10 22 L22 22 L22 30 L10 30 Z M4 76 L16 76 L16 84 L4 84 Z", PAPER_D)), x, y, rot, s)


def rope(p0, c, p1, w=26):
    """Twisted straw rope (shimenawa)."""
    r = fill(ribbon(p0, c, p1, lambda t: w * (1 - .35 * abs(t - .5))), STRAW, 7)
    for i in range(1, 10):
        x, y, nx, ny, t = qpts(p0, c, p1, 10)[i]
        ww = w * (1 - .35 * abs(t - .5)) * .45
        r += line(f"M{f(x - nx * ww - 6)} {f(y - ny * ww)} L{f(x + nx * ww + 6)} {f(y + ny * ww)}", 5, STRAW_D)
    return r


def matsu():
    """A sacred pine: a leaning red trunk, flat clouds of needles, a straw rope with paper streamers."""
    d = []; b = ""
    trunk = [limb((236, 744), (330, 640), (244, 520), 76, 44), limb((244, 530), (176, 450), (240, 340), 44, 22),
             limb((262, 560), (180, 560), (110, 520), 26, 10), limb((246, 470), (320, 470), (380, 420), 24, 9),
             limb((238, 400), (200, 380), (170, 340), 16, 7), limb((192, 744), (168, 732), (144, 744), 28, 10),
             limb((288, 742), (318, 730), (344, 744), 26, 10)]
    b += union(trunk, PBARK)
    for (x, y) in [(270, 700), (296, 646), (262, 600), (226, 488), (214, 430)]:
        b += line(f"M{x - 12} {y} Q{x} {y - 8} {x + 14} {y + 2}", 5, PBARK_D)
    b += brush((296, 720), (318, 650), (286, 580), 9, PBARK_L) + brush((236, 520), (214, 470), (226, 410), 6, PBARK_L)
    b += pine_pad(d, 110, 512, 92, 46, 4) + pine_pad(d, 384, 414, 100, 48, 4) + pine_pad(d, 168, 340, 70, 36, 3)
    b += pine_pad(d, 250, 300, 110, 56, 5)
    # shimenawa round the trunk
    b += rope((214, 612), (276, 650), (338, 604), 30)
    b += shide(246, 640, .9, 4) + shide(306, 634, .9, -6)
    for x in (224, 276, 330):
        b += fill(f"M{x - 6} {628 if x != 276 else 642} L{x + 6} {628 if x != 276 else 642} L{x + 4} {662 if x != 276 else 676} L{x - 4} {662 if x != 276 else 676} Z", STRAW_D, 5)
    b += fill(blob(380, 734, 30, 18, 7, .15, 3), RK, 6) + fill(blob(112, 736, 22, 14, 7, .15, 4), RK_D, 6)
    return d, b


# ================================================================ the Bamboo Thicket and the Spider-lily Marsh (yomi.mjs)
BAMB = "#7f9e56"; BAMB_D = "#5b7a3e"; BAMB_L = "#b2c97e"; BAMB_N = "#4b6634"
WILLOW = "#7f9a5a"; WILLOW_D = "#5e7745"; WILLOW_L = "#a9c27c"
LILY_R = "#c8363c"; LILY_RD = "#8e2430"; LILY_RL = "#f06a5c"


def stalk(x0, y0, x1, y1, w, seed):
    """One bamboo culm: a tapered green pole with ringed nodes and a highlight."""
    out = fill(limb((x0, y0), ((x0 + x1) / 2 + 4, (y0 + y1) / 2), (x1, y1), w, w * .72), BAMB, 7)
    n = int(abs(y0 - y1) / 70)
    for i in range(1, n + 1):
        t = i / (n + 1); x = x0 + (x1 - x0) * t; y = y0 + (y1 - y0) * t; ww = w * (1 - .28 * t) / 2 + 3
        out += line(f"M{f(x - ww)} {f(y)} Q{f(x)} {f(y + 6)} {f(x + ww)} {f(y)}", 6, BAMB_N)
    out += brush((x0 - w * .22, y0 - 20), ((x0 + x1) / 2 - w * .2, (y0 + y1) / 2), (x1 - w * .15, y1 + 30), 6, BAMB_L, .9)
    return out


def sasa_spray(x, y, rot, s=1.0, seed=1):
    """A spray of bamboo leaves: a few broad lance-shaped blades fanning from one twig."""
    r = random.Random(seed)
    g = ""
    for k in range(4):
        a = -50 + k * 33 + r.uniform(-8, 8); L = 96 + r.uniform(-10, 20)
        ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
        tip = (ca * L, sa * L)
        g += fill(f"M0 0 Q{f(tip[0] * .45 - sa * 26)} {f(tip[1] * .45 + ca * 26)} {f(tip[0])} {f(tip[1])} Q{f(tip[0] * .45 + sa * 20)} {f(tip[1] * .45 - ca * 20)} 0 0 Z", BAMB_D if k % 2 else BAMB, 4)
        g += line(f"M{f(tip[0] * .1)} {f(tip[1] * .1)} L{f(tip[0] * .8)} {f(tip[1] * .8)}", 3, BAMB_L)
    return G(at_scale(s, lambda: g), x, y, rot, s)


def bamboo(seed=1):
    """A clump of bamboo: four to six culms of different heights, leaf sprays near the tops."""
    def draw():
        d = []; b = ""
        r = random.Random(seed)
        culms = sorted([(r.uniform(150, 360), r.uniform(70, 200), r.uniform(30, 44)) for _ in range(5 if seed == 1 else 4)], key=lambda c: c[2])
        for x, top, w in culms:
            lean = r.uniform(-30, 30)
            b += stalk(x, 744, x + lean, top, w, seed)
            for k in range(3):
                yy = top + 40 + k * 90 + r.uniform(-10, 10)
                b += sasa_spray(x + lean * (1 - (yy - top) / (744 - top)), yy, r.uniform(-30, 30) + (180 if k % 2 else 0), .9 + r.uniform(-.1, .2), seed * 10 + k)
        b += fill(blob(256, 740, 130, 16, 9, .2, seed), BAMB_N, 6)
        b += sasa_spray(180, 730, 160, .8, seed + 50) + sasa_spray(330, 730, 20, .8, seed + 60)
        return d, b
    return draw


def yanagi():
    """A weeping willow by the black river: a stooped dark trunk, long green strands hanging to the ground."""
    d = []; b = ""
    r = random.Random(5)

    def strand(x, y0, y1, sway, col):
        tip = (x + sway * 1.5, y1)
        return fill(f"M{f(x - 13)} {f(y0)} Q{f(x + sway - 10)} {f((y0 + y1) / 2)} {f(tip[0])} {f(tip[1])} Q{f(x + sway + 12)} {f((y0 + y1) / 2)} {f(x + 13)} {f(y0)} Z", col, 5)
    back = "".join(strand(100 + k * 40 + r.uniform(-8, 8), 400, 600 + r.uniform(0, 80), r.uniform(-14, 14), WILLOW_D) for k in range(9))
    b += back
    trunk = [limb((246, 744), (200, 620), (258, 470), 70, 40), limb((256, 480), (310, 420), (370, 380), 34, 14),
             limb((250, 490), (190, 430), (140, 400), 30, 12), limb((252, 470), (256, 400), (250, 330), 30, 12)]
    b += union(trunk, BARK)
    b += brush((222, 720), (210, 640), (240, 520), 9, BARK_L)
    for k in range(8):
        x = 96 + k * 46 + r.uniform(-8, 8)
        if 200 < x < 300:
            continue
        b += strand(x, 380 + r.uniform(-20, 20), 560 + r.uniform(0, 120), r.uniform(-16, 16), WILLOW)
    # the crown last, so every strand seems to fall from under it
    canopy = cloud(256, 370, 190, 90, 10, 17)
    b += shaded(d, canopy, WILLOW, WILLOW_D, 16, -10, brush((120, 350), (200, 300), (300, 292), 10, WILLOW_L))
    return d, b


# ---------------------------------------------------------------- scenery decoration (packed by tools/art/scenery.py)
# These share the scenery design space: U = 230 design units per world unit, upright props stand on (256, 740),
# flat decals are centred on (256, 512). Quieter than nodes, few large shapes.
def higanbana():
    """Red spider lilies on bare stems: a ball of curled petals and long upswept stamens, no leaves."""
    d = []; b = ""
    r = random.Random(7)
    for (x, h) in ((196, 160), (258, 200), (318, 150)):
        b += stroke(f"M{x} 740 Q{x + r.uniform(-8, 8)} {740 - h * .5} {x + r.uniform(-6, 6)} {740 - h}", 9, "#5e7a3e")
        cx, cy = x, 740 - h - 24
        for k in range(5):
            a = math.radians(-180 + k * 45 + r.uniform(-6, 6))
            px, py = cx + math.cos(a) * 40, cy + math.sin(a) * 26
            b += line(f"M{cx} {cy} Q{f(cx + math.cos(a) * 34)} {f(cy - 40)} {f(cx + math.cos(a) * 54)} {f(cy - 56)}", 4, LILY_RL)
        petals = ""
        for k in range(6):
            a = math.radians(k * 60 + 15)
            px, py = cx + math.cos(a) * 34, cy + math.sin(a) * 22
            petals += fill(f"M{cx} {cy} Q{f(cx + math.cos(a) * 30 - 12)} {f(cy + math.sin(a) * 18 - 18)} {f(px)} {f(py)} Q{f(px + 12)} {f(py + 10)} {f(cx + math.cos(a) * 14)} {f(cy + math.sin(a) * 10 + 6)} Z", LILY_R if k % 2 else LILY_RL, 6)
        b += petals + f'<circle cx="{cx}" cy="{cy}" r="12" fill="{LILY_RD}" stroke-width="{sw(5)}"/>'
    return d, b


def takenoko():
    """A bamboo shoot pushing out of the leaf litter: brown husks to a pointed tip."""
    d = []; b = ""
    b += fill("M196 740 Q200 650 256 560 Q312 650 316 740 Z", "#8a6a4a", 7)
    for k, y in enumerate((700, 650, 604)):
        b += fill(f"M{208 + k * 14} 742 Q{230 + k * 10} {y} 256 {y - 40} Q{f(240 + k * 6)} {y + 20} {f(232 + k * 8)} 742 Z", "#6e5238" if k % 2 else "#a07e58", 5)
    b += brush((230, 720), (236, 660), (250, 600), 6, "#c09a72", .8)
    b += fill(blob(256, 742, 80, 10, 7, .2, 3), "#5a4632", 5)
    return d, b


def sasa_litter():
    """Fallen bamboo leaves on the ground (flat decal)."""
    d = []; b = ""
    r = random.Random(4)
    for k in range(7):
        x = 256 + r.uniform(-90, 90); y = 512 + r.uniform(-40, 40); a = r.uniform(0, 180)
        b += G(fill("M-56 0 Q0 -22 56 0 Q0 22 -56 0 Z", "#b3a066" if k % 3 else "#8f9e5a", 5), x, y, a)
    return d, b


def sotoba():
    """Wooden grave tablets (sotoba) leaning behind a little stone: carved notches, faded script."""
    d = []; b = ""
    for k, (x, h, rot) in enumerate(((196, 300, -8), (250, 340, 2), (304, 280, 9))):
        top = 740 - h
        slat = (f"M{x - 18} 740 L{x - 18} {top + 40} L{x - 10} {top + 30} L{x - 18} {top + 20} L{x} {top} "
                f"L{x + 18} {top + 20} L{x + 10} {top + 30} L{x + 18} {top + 40} L{x + 18} 740 Z")
        g = fill(slat, "#b9a382" if k != 1 else "#cdb994", 6)
        g += line(f"M{x} {top + 60} L{x} {top + 60 + h * .45}", 6, "#6a5642")
        b += f'<g transform="rotate({rot} {x} 740)">{g}</g>'
    b += fill(blob(256, 726, 70, 26, 8, .18, 5), RK, 6) + brush((210, 716), (240, 706), (280, 708), 6, RK_L, .8)
    return d, b


YOMI_SCENERY = [("higanbana", higanbana, "up"), ("takenoko", takenoko, "up"), ("sasa", sasa_litter, "mid"), ("sotoba", sotoba, "up", .85)]


# ================================================================ omens (src/omens.mjs): an Obon lantern, a fox wedding
FOX = "#e8a35a"; FOX_D = "#bf7a3a"; FOX_L = "#f8d29a"; FOX_W = "#fff6ea"


def obon_lantern(k=0.0):
    """A floating Obon lantern (toro nagashi): a paper box on a wooden float, a candle glowing through it."""
    d = []; b = ""
    flick = math.sin(2 * math.pi * k)
    b += f'<ellipse cx="256" cy="560" rx="{f(150 + 10 * flick)}" ry="{f(160 + 10 * flick)}" fill="{FL_M}" opacity=".18" stroke="none"/>'
    b += fill(blob(256, 730, 150, 22, 9, .12, 3), "#5f7d8a", 7)           # a still puddle of water
    b += brush((150, 726), (230, 718), (330, 724), 6, "#9fc0cc", .8)
    b += rrect(150, 676, 212, 44, 10, WD, 7) + brush((168, 690), (240, 684), (330, 690), 6, WD_L)
    box = "M170 676 L170 480 L342 480 L342 676 Z"
    glow = fill_ns(blob(256, 590, 70, 80, 8, .05, 2), FL_I, .85 + .1 * flick)
    frame = line("M256 480 L256 676 M170 580 L342 580", 6, WD_D)
    b += shaded(d, box, PAPER, PAPER_D, 14, -6, glow + frame)
    b += rrect(160, 462, 192, 26, 8, WD, 7)
    b += fill(f"M218 596 L232 {f(560 - 10 * flick)} L246 596 Z", FL_M, 0)
    b += line("M200 520 Q216 512 230 522 M282 640 Q300 632 314 644", 5, SCRIPT)
    return d, b


def fox(x, y, s=1.0, face=1, bride=False):
    """A fox spirit sitting up: white mask, red markings, a full tail (a bride wears a white hood)."""
    def draw():
        g = ""
        g += fill(f"M{-30 * face} 40 Q{-110 * face} 20 {-96 * face} -40 Q{-70 * face} -10 {-20 * face} 10 Z", FOX, 6)
        g += fill(f"M{-96 * face} -40 Q{-104 * face} -60 {-84 * face} -66 Q{-80 * face} -40 {-70 * face} -24 Z", FOX_W, 5)
        g += fill("M-40 60 Q-48 -20 0 -30 Q48 -20 40 60 Q0 70 -40 60 Z", FOX if not bride else FOX_W, 7)
        g += ell(0, -64, 42, 38, FOX_W, 7)
        for sgn in (-1, 1):
            g += fill(f"M{sgn * 14} -92 L{sgn * 34} -134 L{sgn * 40} -84 Z", FOX_W, 6) + fill_ns(f"M{sgn * 22} -98 L{sgn * 33} -122 L{sgn * 35} -92 Z", RD, .9)
            g += line(f"M{sgn * 30} -66 Q{sgn * 18} -74 {sgn * 8} -66", 5, RD)
        g += line("M-26 -50 Q-10 -40 0 -46 Q10 -40 26 -50", 4, RD) + f'<circle cx="0" cy="-40" r="5" fill="{O}" stroke="none"/>'
        if bride:
            g += fill("M-52 -60 Q-56 -116 0 -120 Q56 -116 52 -60 Q30 -86 0 -88 Q-30 -86 -52 -60 Z", FOX_W, 6)
        return g
    return G(at_scale(s, draw), x, y, 0, s)


def fox_wedding(k=0.0):
    """A fox bride under a red wedding umbrella with her groom, foxfires floating round them."""
    d = []; b = ""
    b += fill(blob(256, 736, 170, 18, 9, .12, 6), "#6f8a5a", 6)
    # the umbrella, held over the bride (behind her: drawn first)
    b += stroke("M300 420 L352 668", 8, LACQ)
    top = 300
    canopy = f"M300 {top} Q190 {top + 40} 160 {top + 130} Q300 {top + 150} 440 {top + 130} Q410 {top + 40} 300 {top} Z"
    ribs = "".join(line(f"M300 {top + 6} L{x} {top + 132}", 4, VERM_D) for x in (190, 245, 300, 355, 410))
    b += shaded(d, canopy, VERM, VERM_D, 12, -6, ribs + brush((190, top + 112), (230, top + 50), (290, top + 20), 8, VERM_L))
    b += f'<circle cx="300" cy="{top - 4}" r="12" fill="{LACQ}" stroke-width="{sw(5)}"/>'
    b += fox(170, 676, .9, 1) + fox(320, 672, 1.0, -1, bride=True)
    for i, (x, y) in enumerate(((110, 520), (420, 470), (80, 380), (460, 600))):
        b += hitodama(x, y + 10 * math.sin(2 * math.pi * (k + i * .25)), .6, k + i * .25).replace(HITO, "#ffb46a").replace(HITO_L, "#fff0c8")
    return d, b


# ================================================================ decorations
def toro(k):
    """Stone lantern (ishidoro): mossy granite, a flame flickering in the firebox."""
    d = []; b = ""
    b += f'<circle cx="256" cy="476" r="120" fill="{FL_M}" opacity="{.16 + .05 * math.sin(2 * math.pi * k):.2f}" stroke="none"/>'
    b += shaded(d, "M168 744 L176 704 L336 704 L344 744 Z", RK, RK_D, -8, -6)
    b += shaded(d, "M226 704 L230 560 L282 560 L286 704 Z", RK, RK_D, -10, 0, brush((240, 690), (238, 630), (242, 576), 6, RK_L))
    b += rrect(220, 616, 72, 18, 6, RK_D, 6)
    b += shaded(d, "M186 562 L326 562 L306 532 L206 532 Z", RK, RK_D, -8, -4)
    box = "M204 534 L308 534 L308 434 L204 434 Z"
    b += shaded(d, box, RK, RK_D, -10, 0)
    b += rrect(222, 448, 68, 70, 6, FL_O, 7)
    fh = 52 + 8 * math.sin(2 * math.pi * k); fw = 18 + 3 * math.cos(2 * math.pi * k)
    b += fill_ns(f"M256 {f(510 - fh)} Q{f(256 + fw * 1.8)} {f(510 - fh * .4)} {f(256 + fw)} 506 Q256 516 {f(256 - fw)} 506 Q{f(256 - fw * 1.8)} {f(510 - fh * .4)} 256 {f(510 - fh)} Z", FL_M)
    b += fill_ns(f"M{f(256 + 2 * math.sin(6.28 * k))} {f(512 - fh * .6)} Q{f(256 + fw)} {f(508 - fh * .2)} 256 508 Q{f(256 - fw)} {f(508 - fh * .2)} {f(256 + 2 * math.sin(6.28 * k))} {f(512 - fh * .6)} Z", FL_I)
    roof = ("M126 440 Q170 438 200 414 L226 384 L286 384 L312 414 Q342 438 386 440 Q392 426 400 410 "
            "Q366 418 334 394 L300 360 L212 360 L178 394 Q146 418 112 410 Q120 426 126 440 Z")
    b += shaded(d, roof, RK, RK_D, -10, -10, brush((150, 420), (190, 400), (222, 370), 7, RK_L))
    b += fill(blob(268, 366, 40, 12, 7, .2, 5), MOSS, 5) + fill(blob(330, 410, 22, 9, 6, .2, 6), MOSS, 5)
    b += rrect(230, 336, 52, 26, 8, RK_D)
    b += shaded(d, "M256 266 Q292 300 282 336 L230 336 Q220 300 256 266 Z", RK, RK_D, -8, -2, brush((242, 320), (240, 300), (250, 284), 5, RK_L))
    b += fill(blob(196, 742, 30, 10, 6, .2, 8), MOSS, 5) + fill(blob(316, 740, 20, 8, 6, .2, 9), MOSS_D, 5)
    return d, b


def torii():
    """A weathered vermilion shrine gate with a sagging sacred rope."""
    d = []; b = ""
    for x in (150, 362):
        post = f"M{x - 24} 744 L{x - 19} 268 L{x + 19} 268 L{x + 24} 744 Z"
        b += shaded(d, post, VERM, VERM_D, 12, 0, brush((x - 10, 700), (x - 12, 500), (x - 10, 300), 7, VERM_L))
        b += shaded(d, f"M{x - 34} 744 L{x - 30} 690 L{x + 30} 690 L{x + 34} 744 Z", LACQ, LACQ_D, 8, 0)
        b += fill(blob(x - 22, 742, 22, 8, 6, .2, x), MOSS, 5)
    b += shaded(d, "M88 362 L424 362 L424 392 L88 392 Z", VERM, VERM_D, 0, -8)
    b += rrect(234, 290, 44, 74, 4, VERM_D)
    b += rrect(214, 300, 84, 64, 6, LACQ) + rrect(224, 310, 64, 44, 3, LACQ_D, 5)
    b += tomoe(256, 332, 16, GOLD)
    b += shaded(d, "M84 298 Q256 314 428 298 L428 266 Q256 284 84 266 Z", VERM, VERM_D, 0, -8)
    kasagi = "M40 262 Q120 248 256 254 Q392 248 472 262 L484 222 Q440 240 256 236 Q72 240 28 222 Z"
    b += shaded(d, kasagi, LACQ, LACQ_D, 0, -10, brush((70, 236), (150, 236), (230, 240), 6, LACQ_L))
    # sacred rope between the posts
    b += rope((168, 410), (256, 470), (344, 410), 24)
    b += shide(210, 438, .7, 6) + shide(256, 452, .7, 0) + shide(302, 438, .7, -6)
    return d, b


# ================================================================ weapons
def katana(tassel=True):
    """Katana: a curved blade with a wavy temper line, a dark tsuba, red-wrapped grip and a tassel."""
    d = []; b = ""
    blade = "M-28 0 Q6 -160 -30 -284 L-42 -320 Q-4 -300 16 -270 Q60 -160 30 0 Z"
    edge = "M4 0 Q42 -160 2 -274 L16 -270 Q60 -160 30 0 Z"
    hamon = "M6 -12 " + " ".join(f"Q{f(26 + 8 * (i % 2))} {-22 - i * 26} {f(8 + 6 * math.sin(i * 1.3))} {-34 - i * 26}" for i in range(9))
    b += shaded(d, blade, MT_L, MT, 10, 0, fill_ns(edge, "#f7f8fc") + line(hamon, 6, MT) + line("M-12 -24 Q12 -160 -24 -262", 6, MT_D)
                + brush((-14, -40), (2, -160), (-28, -256), 7, "#ffffff", .9))
    b += rrect(-32, -8, 64, 32, 7, GOLD, 7) + brush((-20, -2), (-20, 8), (-20, 18), 5, GOLD_L)
    b += ell(0, 38, 76, 24, GOLD, 8) + ell(0, 36, 64, 17, LACQ, 0)
    b += f'<circle cx="-38" cy="36" r="8" fill="{GOLD}" stroke="none"/><circle cx="38" cy="36" r="8" fill="{GOLD}" stroke="none"/>'
    grip = "M-28 58 L28 58 L25 176 L-25 176 Z"
    wrap = "".join(line(f"M-32 {60 + i * 30} L32 {90 + i * 30} M32 {60 + i * 30} L-32 {90 + i * 30}", 16, VERM) for i in range(4))
    b += shaded(d, grip, PAPER, PAPER_D, 8, 0, wrap)
    b += fill("M-13 118 Q0 102 13 118 Q0 134 -13 118 Z", GOLD, 5)
    b += rrect(-30, 172, 60, 32, 10, LACQ) + rrect(-30, 172, 60, 11, 4, GOLD, 5)
    if tassel:   # the cord and tassel hang off the pommel (left off the in-hand grip sprite, whose cell ends there)
        b += stroke("M12 200 Q54 226 46 262", 9, VERM)
        b += fill("M32 258 L60 258 L70 326 L22 326 Z", VERM, 7) + line("M36 280 L34 314 M52 280 L54 314", 5, VERM_D) + rrect(28, 252, 38, 15, 5, GOLD, 5)
    b += sparkle(-58, -318, 1.6, "#ffffff") + sparkle(46, -210, 1.0, "#ffffff")
    return d, G(b, 256, 470)


def guandao():
    """Guandao: a crescent blade gripped in a gilt dragon's jaws, a red horsehair plume, a lacquered pole."""
    d = []; b = ""
    b += fill("M-24 196 L24 196 L0 262 Z", MT, 7)
    b += shaded(d, "M-25 -176 L25 -176 L25 200 L-25 200 Z", VERM_D, "#6e2430", 10, 0, brush((-11, 180), (-12, 20), (-11, -150), 8, VERM))
    for y in (-176, 40, 180):
        b += rrect(-30, y, 60, 30, 8, GOLD, 7)
    # red horsehair plume swept back
    plume = "M-6 -166 Q-90 -170 -160 -96 Q-110 -116 -80 -106 Q-130 -68 -142 -10 Q-80 -80 -34 -114 Q-56 -74 -44 -30 Q-14 -108 8 -148 Z"
    b += fill(plume, VERM, 8) + line("M-24 -148 Q-86 -138 -128 -88 M-30 -128 Q-76 -104 -106 -54", 6, VERM_D)
    # blade
    blade = "M-20 -236 Q-56 -430 0 -610 Q76 -526 116 -430 Q150 -330 76 -248 Q30 -222 -20 -236 Z"
    edge = "M74 -556 Q138 -446 128 -360 Q116 -290 76 -248 Q112 -330 94 -430 Z"
    swirl = line("M14 -310 Q-10 -372 30 -394 Q70 -406 66 -362 Q60 -336 36 -344", 7, MT_D)
    b += shaded(d, blade, MT_L, MT, -10, 0, fill_ns(edge, "#f7f8fc") + swirl + brush((-18, -290), (-28, -440), (-4, -560), 8, "#ffffff", .8))
    b += fill("M-40 -412 L-92 -440 L-44 -466 Z", MT, 7)
    # dragon-head socket, drawn round its own centre and enlarged so it survives the outline
    def dragon():
        dh = fill("M-14 -26 Q-60 -40 -84 -90 Q-40 -62 0 -52 Z", GOLD, 7)
        dh += shaded(d, "M-34 44 L-36 -4 Q-40 -50 0 -62 Q44 -70 80 -40 L64 -24 Q36 -32 18 -18 L56 -8 Q74 14 48 26 L18 18 Q26 34 30 44 Z", GOLD, GOLD_D, 8, 4,
                     brush((-24, 20), (-26, -10), (-8, -40), 7, GOLD_L))
        dh += gem(4, -22, 12, RD, RD_D, "#ffd1c8")
        dh += line("M56 -8 Q86 0 96 26", 7, GOLD)
        return dh
    b += G(at_scale(1.25, dragon), 0, -214, 0, 1.25)
    b += sparkle(126, -590, 1.5, "#ffffff") + sparkle(-70, -500, 1.0, "#ffffff")
    return d, G(b, 256, 440)


def ofuda_sheaf():
    """The Hundred Seals: a fan of yellow talismans bound at the foot with red cord and a jade bead."""
    d = []; b = ""
    for k, rot in enumerate((-30, -15, 0, 15, 30)):
        slipb = rrect(-46, -330, 92, 330, 6, OFUDA if k % 2 == 0 else "#f6e3a0", 8)
        slipb += line("M0 -290 Q22 -262 -6 -232 Q24 -200 -10 -168 M-20 -130 L20 -138 M0 -110 L0 -60", 9, SCRIPT)
        slipb += brush((-30, -300), (-34, -170), (-30, -40), 7, "#fff6c8", .8)
        b += G(slipb, 256, 700, rot)
    b += stroke("M206 690 Q256 716 306 690", 12, VERM) + stroke("M256 700 Q240 740 224 760 M256 700 Q270 742 290 758", 9, VERM)
    b += gem(256, 702, 18, JADE, JADE_D, JADE_L)
    b += sparkle(380, 420, 1.6, "#fff6c8") + sparkle(140, 470, 1.1, "#fff6c8")
    return d, b


def odokuro_hand():
    """The Gashadokuro's Hand: a huge bone hand, fingers half curled, green ghost-fire in the knuckles."""
    d = []; b = ""
    BN = "#e8dcc0"; BN_D = "#b9a986"; FIRE = "#c8ff8a"
    # wrist and the stub of the radius
    b += fill(limb((256, 744), (250, 690), (250, 620), 48, 56), BN, 8) + line("M236 700 L264 690", 5, BN_D)
    palm = "M170 620 Q160 520 190 460 L330 452 Q356 520 344 620 Q260 650 170 620 Z"
    b += shaded(d, palm, BN, BN_D, 12, -6, line("M210 480 L216 600 M256 470 L258 610 M300 470 L298 600", 6, BN_D))
    # the fingers as one silhouette (outline pass, then fill), so neighbours do not ink over each other
    segs, knuckles = [], []
    for i, (x, a0, L) in enumerate(((190, -100, 96), (236, -92, 110), (282, -84, 106), (326, -72, 90))):
        px, py, a = x, 462, a0
        for j, l in enumerate((L, L * .8, L * .62)):
            a += 24 + i * 2
            nx, ny = px + math.cos(math.radians(a)) * l, py + math.sin(math.radians(a)) * l
            segs.append(limb((px, py), ((px + nx) / 2, (py + ny) / 2), (nx, ny), 50 - j * 8, 44 - j * 8))
            knuckles.append((nx, ny, 9 - j * 2))
            px, py = nx, ny
    b += union(segs, BN)
    b += "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{BN_D}" stroke="none"/>' for x, y, r in knuckles)
    for x in (190, 236, 282, 326):
        b += f'<circle cx="{x}" cy="462" r="13" fill="{FIRE}" stroke="none" opacity=".95"/>'
    b += fill(limb((176, 600), (104, 560), (112, 474), 50, 40), BN, 7) + f'<circle cx="112" cy="474" r="22" fill="{BN}" stroke-width="{sw(6)}"/>'
    b += f'<circle cx="256" cy="540" r="70" fill="{FIRE}" opacity=".18" stroke="none"/>'
    b += sparkle(370, 430, 1.4, FIRE) + sparkle(150, 410, 1.0, FIRE)
    return d, b


def write_magic_item(root, key):
    """A magic weapon's item and inventory icon (src/magic/<key>.mjs): assets/magic/<key>/item.svg and icon.svg."""
    out = os.path.join(root, "assets", "magic", key)
    os.makedirs(out, exist_ok=True)
    spec = ALL[key]
    item = lib.build_sheet(spec["frames"], 1, 1, spec["target"], line=lib.line_for(spec.get("line_world", spec["size"][0])))
    icon = lib.build_sheet([spec["diag"]], 1, 1, (36, 36, 476, 476), cell=(512, 512), out_scale=.375, align="center",
                           center_on_first=False, line=lib.line_for(lib.ICON_WU, big=False))
    open(os.path.join(out, "item.svg"), "w", newline="\n").write(item)
    open(os.path.join(out, "icon.svg"), "w", newline="\n").write(icon)


# The Shrine of Yomi's magic weapons whose item art is drawn here (tools/art/build.py --only <key>).
MAGIC_ITEMS = ("katana", "guandao", "ofuda", "odokuro")


# ================================================================ shrine stones and a jizo (the Yomi area's rocks and props)
def river_stone(d, x, base, rx, ry, col, dark, moss=True, seed=1):
    st = blob(x, base - ry, rx, ry, 9, .07, seed, flat=base - 2)
    hl = brush((x - rx * .6, base - ry * 1.25), (x - rx * .15, base - ry * 1.75), (x + rx * .35, base - ry * 1.6), 7, RK_L, .9)
    out = shaded(d, st, col, dark, -8, -8, hl)
    if moss:
        cap = blob(x - rx * .12, base - ry * 1.86, rx * .5, ry * .2, 8, .12, seed + 9)
        out += clipped(d, st, fill(cap, MOSS, 6) + fill_ns(blob(x - rx * .2, base - ry * 1.94, rx * .3, ry * .09, 7, .1, seed + 3), MOSS_L, .9))
    return out


def yomi_rock():
    """Garden stones: two smooth river stones and a small one, moss on their crowns."""
    d = []; b = ""
    b += river_stone(d, 330, 736, 88, 66, RK_D, "#58546f", True, 4)
    b += river_stone(d, 210, 740, 120, 92, RK, RK_D, True, 2)
    b += river_stone(d, 392, 742, 40, 28, RK, RK_D, False, 7)
    for (x, r) in [(118, 20), (300, 90), (430, 150)]:
        b += G(fill("M0 -10 Q12 -4 8 8 L0 4 L-8 8 Q-12 -4 0 -10 Z", SAK, 5), x, 742, r, 1.4, .7)
    return d, b


def yomi_rock_b():
    """An iwakura: one great sacred boulder, girded with a straw rope and paper streamers."""
    d = []; b = ""
    b += river_stone(d, 256, 742, 150, 128, RK, RK_D, True, 11)
    b += rope((118, 590), (256, 660), (394, 590), 30)
    b += shide(206, 626, .85, 6) + shide(306, 626, .85, -6)
    b += fill(blob(400, 738, 34, 18, 7, .15, 3), RK_D, 6)
    return d, b


def jizo():
    """A little stone jizo: a round bald head, eyes shut in prayer, a red bib and cap, on a block of stone."""
    d = []; b = ""
    b += shaded(d, "M176 744 L184 690 L328 690 L336 744 Z", RK_D, "#58546f", -8, -4)
    body = "M196 692 Q190 560 256 548 Q322 560 316 692 Z"
    b += shaded(d, body, RK, RK_D, -12, -6, brush((214, 670), (208, 620), (222, 580), 7, RK_L))
    b += fill("M210 580 Q256 640 302 580 Q300 556 256 552 Q212 556 210 580 Z", VERM, 7)
    b += line("M222 590 Q256 616 290 590", 5, VERM_D)
    b += fill("M244 640 L268 640 L262 676 L250 676 Z", RK_L, 5)
    hc = (256, 480)
    b += shaded(d, f"M{hc[0] - 70} {hc[1]} a70 66 0 1 0 140 0 a70 66 0 1 0 -140 0 Z", RK, RK_D, -10, -8, brush((206, 460), (220, 430), (250, 420), 6, RK_L))
    b += clipped(d, f"M{hc[0] - 70} {hc[1]} a70 66 0 1 0 140 0 a70 66 0 1 0 -140 0 Z", fill_ns(f"M{hc[0] - 90} {hc[1] - 14} Q{hc[0]} {hc[1] - 40} {hc[0] + 90} {hc[1] - 14} L{hc[0] + 90} {hc[1] - 90} L{hc[0] - 90} {hc[1] - 90} Z", VERM))
    b += line(f"M{hc[0] - 68} {hc[1] - 14} Q{hc[0]} {hc[1] - 40} {hc[0] + 68} {hc[1] - 14}", 7)
    b += f'<path d="M{hc[0] - 70} {hc[1]} a70 66 0 1 0 140 0 a70 66 0 1 0 -140 0 Z" fill="none" stroke-width="{sw(8)}"/>'
    b += f'<circle cx="{hc[0] + 4}" cy="{hc[1] - 72}" r="12" fill="{VERM}" stroke-width="{sw(6)}"/>'
    for x in (hc[0] - 24, hc[0] + 24):
        b += line(f"M{x - 12} {hc[1] + 8} Q{x} {hc[1] + 16} {x + 12} {hc[1] + 8}", 6)
    b += line(f"M{hc[0] - 8} {hc[1] + 36} Q{hc[0]} {hc[1] + 40} {hc[0] + 8} {hc[1] + 36}", 5)
    b += fill(blob(214, 694, 24, 8, 6, .2, 5), MOSS, 5)
    return d, b


def diagonal(fn, angle=40):
    def wrapped():
        d, b = fn()
        return d, f'<g transform="rotate({angle} 256 384)">{b}</g>'
    return wrapped


# ================================================================ registry, build, preview
WANDERER_CLIPS = {"idle": {"frames": [0, 0, 0, 1, 0, 0], "fps": 2}, "walk": {"frames": [2, 3, 4, 5], "fps": 9},
                  "attack": {"frames": [6, 7, 8], "fps": 10}, "gather": {"frames": [9, 10, 11, 10], "fps": 7},
                  "dash": {"frames": [12], "fps": 1}, "down": {"frames": [13], "fps": 1}}
CREATURE_CLIPS = {"idle": {"frames": [7], "fps": 1}, "walk": {"frames": [0, 1, 2, 3], "fps": 9}, "attack": {"frames": [4, 5, 6, 5], "fps": 6}}
STILL = {"idle": {"frames": [0], "fps": 1}}

ALL = {
    "miko": dict(frames=wanderer_frames(miko, miko_down), cols=8, rows=2, target=(40, 40, 472, 736), size=[2.25, 3.38], clips=WANDERER_CLIPS),
    "daoshi-wanderer": dict(frames=wanderer_frames(daoshi, daoshi_down), cols=8, rows=2, target=(40, 40, 472, 736), size=[2.25, 3.38], clips=WANDERER_CLIPS),
    "chochin": dict(frames=CHOCHIN, cols=4, rows=2, target=(70, 150, 460, 740), size=[2.0, 3.0], clips=CREATURE_CLIPS),
    "jiangshi": dict(frames=JIANGSHI, cols=4, rows=2, target=(40, 90, 490, 740), size=[2.5, 3.75], clips=CREATURE_CLIPS),
    "kasa": dict(frames=KASA_FRAMES, cols=4, rows=2, target=(60, 110, 452, 740), size=[2.0, 3.0], clips=CREATURE_CLIPS),
    "rokurokubi": dict(frames=ROKURO_FRAMES, cols=4, rows=2, target=(20, 40, 500, 740), size=[2.7, 4.05], clips=CREATURE_CLIPS),
    "yukionna": dict(frames=YUKI_FRAMES, cols=4, rows=2, target=(40, 70, 480, 740), size=[2.4, 3.6], clips=CREATURE_CLIPS),
    "daoshi": dict(frames=DAOSHI_FRAMES, cols=4, rows=2, target=(40, 60, 480, 740), size=[2.4, 3.6], clips=CREATURE_CLIPS),
    "sakura": dict(frames=[sakura], cols=1, rows=1, target=(12, 24, 500, 736), size=[4.92, 7.38], clips=STILL),
    "matsu": dict(frames=[matsu], cols=1, rows=1, target=(40, 40, 480, 736), size=[4.92, 7.38], clips=STILL),
    "toro": dict(frames=[(lambda k: (lambda: toro(k / 4)))(k) for k in range(4)], cols=4, rows=1, target=(130, 150, 382, 744), size=[1.9, 2.85],
                 clips={"idle": {"frames": [0, 1, 2, 3], "fps": 5}}),
    "torii": dict(frames=[torii], cols=1, rows=1, target=(24, 160, 488, 744), size=[3.4, 5.1], clips=STILL),
    "katana": dict(frames=[katana], cols=1, rows=1, target=(130, 30, 382, 740), size=[1.1, 1.65], line_world=1.334, clips=STILL, diag=diagonal(katana)),
    "guandao": dict(frames=[guandao], cols=1, rows=1, target=(60, 20, 452, 744), size=[1.1, 1.65], line_world=1.334, clips=STILL, diag=diagonal(guandao)),
    "ofuda": dict(frames=[ofuda_sheaf], cols=1, rows=1, target=(60, 120, 452, 744), size=[1.1, 1.65], line_world=1.334, clips=STILL, diag=diagonal(ofuda_sheaf, 20)),
    "odokuro": dict(frames=[odokuro_hand], cols=1, rows=1, target=(40, 120, 472, 744), size=[1.3, 1.95], line_world=1.4, clips=STILL, diag=diagonal(odokuro_hand, 15)),
    "yomi-rock": dict(frames=[yomi_rock], cols=1, rows=1, target=(40, 420, 476, 746), size=[2.8, 4.2], clips=STILL),
    "yomi-rock-b": dict(frames=[yomi_rock_b], cols=1, rows=1, target=(56, 360, 456, 746), size=[2.8, 4.2], clips=STILL),
    "jizo": dict(frames=[jizo], cols=1, rows=1, target=(150, 300, 362, 744), size=[1.5, 2.25], clips=STILL),
    "bamboo": dict(frames=[bamboo(1)], cols=1, rows=1, target=(40, 24, 472, 744), size=[3.6, 5.4], clips=STILL),
    "bamboo-b": dict(frames=[bamboo(2)], cols=1, rows=1, target=(60, 60, 452, 744), size=[3.2, 4.8], clips=STILL),
    "yanagi": dict(frames=[yanagi], cols=1, rows=1, target=(12, 40, 500, 736), size=[4.92, 7.38], clips=STILL),
    "obonlantern": dict(frames=[(lambda k: (lambda: obon_lantern(k / 4)))(k) for k in range(4)], cols=4, rows=1, target=(110, 300, 402, 744), size=[1.7, 2.55],
                        clips={"idle": {"frames": [0, 1, 2, 3], "fps": 5}}),
    "foxwedding": dict(frames=[(lambda k: (lambda: fox_wedding(k / 4)))(k) for k in range(4)], cols=4, rows=1, target=(40, 160, 472, 744), size=[3.2, 4.8],
                       clips={"idle": {"frames": [0, 1, 2, 3], "fps": 4}}),
}
# What the game uses (tools/art/build.py builds these into themes/harvest/sprites like every other sprite;
# theme.json holds their entries). The wanderers and the guandao stay preview-only for now.
GAME = ("chochin", "jiangshi", "kasa", "rokurokubi", "yukionna", "daoshi", "sakura", "matsu", "toro", "torii", "yomi-rock", "yomi-rock-b", "jizo", "bamboo", "bamboo-b", "yanagi", "obonlantern", "foxwedding")
SPRITES = {k: {kk: v for kk, v in ALL[k].items() if kk in ("frames", "cols", "rows", "target")} for k in GAME}


def write_katana(root):
    """Kagekiri's item and inventory icon for the magic pack (src/magic/katana.mjs): assets/magic/katana/."""
    write_magic_item(root, "katana")


def build(key, spec, out_dir):
    svg = lib.build_sheet(spec["frames"], spec["cols"], spec["rows"], spec["target"], line=lib.line_for(spec.get("line_world", spec["size"][0])))
    open(os.path.join(out_dir, f"{key}.svg"), "w", newline="\n").write(svg)
    entry = {"src": f"./sprites/{key}.svg?v=yomi1", "size": spec["size"], "anchor": [0.5, 0.04],
             "columns": spec["cols"], "rows": spec["rows"], "clips": spec["clips"]}
    if spec.get("diag"):
        icon = lib.build_sheet([spec["diag"]], 1, 1, (36, 36, 476, 476), cell=(512, 512), out_scale=.375, align="center",
                               center_on_first=False, line=lib.line_for(lib.ICON_WU, big=False))
        open(os.path.join(out_dir, f"{key}-icon.svg"), "w", newline="\n").write(icon)
        entry["icon"] = f"./sprites/{key}-icon.svg?v=yomi1"
    return svg, entry


PREVIEW_PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hollowstead - Yomi art set</title>
<style>
:root{--bg:#302d3c;--ground:#7d735d;--card:#3a3647;--ink:#efe6cf;--dim:#b9b0c8;--accent:#eaaa6a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.4 system-ui,sans-serif;padding:16px}
h1{font-size:20px;margin:0 0 4px}p{margin:0 0 14px;color:var(--dim)}
#stage{width:100%;max-width:1200px;display:block;border-radius:12px;background:var(--ground);margin-bottom:18px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;max-width:1200px}
.card{background:var(--card);border-radius:12px;padding:10px}.card canvas{width:100%;background:var(--ground);border-radius:8px;display:block}
.card b{display:block;margin:8px 0 6px}.chips{display:flex;flex-wrap:wrap;gap:6px}
button{background:#4a4559;color:var(--ink);border:0;border-radius:99px;padding:4px 10px;font:inherit;font-size:13px;cursor:pointer}
button.on{background:var(--accent);color:#2b2233}
</style></head><body>
<h1>Yomi art set</h1><p>Art only, generated by tools/art/yomi.py. Sprites are drawn at their world size from sprites.json.</p>
<canvas id="stage" width="1200" height="430"></canvas>
<div class="grid" id="grid"></div>
<script>
const MANIFEST = __MANIFEST__;
const NAMES = __NAMES__;
const img = {};
for (const [k, s] of Object.entries(MANIFEST)) { img[k] = new Image(); img[k].src = s.src; }
function draw(ctx, k, frame, x, y, ppu, flip) {
  const s = MANIFEST[k], im = img[k]; if (!im.complete || !im.naturalWidth) return;
  const cw = im.naturalWidth / s.columns, ch = im.naturalHeight / s.rows;
  const w = s.size[0] * ppu, h = w * ch / cw;
  ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
  ctx.drawImage(im, (frame % s.columns) * cw, Math.floor(frame / s.columns) * ch, cw, ch, -w * s.anchor[0], -h * (1 - s.anchor[1]), w, h);
  ctx.restore();
}
function frameOf(k, clip, t) { const c = MANIFEST[k].clips[clip] || MANIFEST[k].clips.idle; return c.frames[Math.floor(t * c.fps) % c.frames.length]; }
// cards: every sprite with its clips
const cards = [];
for (const k of Object.keys(MANIFEST)) {
  const s = MANIFEST[k], card = document.createElement('div'); card.className = 'card';
  const cv = document.createElement('canvas'); cv.width = 460; cv.height = 360;
  const chips = document.createElement('div'); chips.className = 'chips';
  const st = { k, cv, clip: s.clips.walk ? 'walk' : 'idle' };
  for (const c of Object.keys(s.clips)) {
    const b = document.createElement('button'); b.textContent = c; if (c === st.clip) b.className = 'on';
    b.onclick = () => { st.clip = c; chips.querySelectorAll('button').forEach(x => x.className = x === b ? 'on' : ''); };
    chips.append(b);
  }
  card.append(cv); const t = document.createElement('b'); t.textContent = NAMES[k] || k; card.append(t, chips);
  document.getElementById('grid').append(card); cards.push(st);
}
// stage: a little shrine path at night's edge
const stage = document.getElementById('stage'), sx = stage.getContext('2d');
const walkers = [
  { k: 'miko', x: 380, v: 70, min: 300, max: 760 }, { k: 'daoshi-wanderer', x: 640, v: -60, min: 420, max: 900 },
  { k: 'chochin', x: 980, v: -55, min: 820, max: 1130 }, { k: 'jiangshi', x: 90, v: 40, min: 40, max: 300 },
];
function loop(ms) {
  const t = ms / 1000;
  sx.clearRect(0, 0, stage.width, stage.height);
  sx.fillStyle = '#9c8968'; sx.fillRect(0, 380, stage.width, 18);
  const ppu = 52, y0 = 392;
  const props = [['matsu', 1110, 0], ['sakura', 150, 0], ['torii', 600, 0], ['toro', 470, frameOf('toro', 'idle', t)], ['toro', 730, frameOf('toro', 'idle', t + .3)]];
  for (const [k, x, fr] of props) draw(sx, k, fr, x, y0 - 30, ppu);
  for (const w of walkers) {
    w.x += w.v / 60; if (w.x > w.max || w.x < w.min) w.v *= -1;
    draw(sx, w.k, frameOf(w.k, 'walk', t + w.min), w.x, y0, ppu, w.v < 0);
  }
  for (const st of cards) {
    const c = st.cv.getContext('2d'); c.clearRect(0, 0, st.cv.width, st.cv.height);
    const s = MANIFEST[st.k], ppu2 = Math.min(110, 300 / s.size[1], 400 / s.size[0]);
    draw(c, st.k, frameOf(st.k, st.clip, t), 230, 340, ppu2);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
</script></body></html>
"""

NAMES = {"miko": "Shrine maiden (wanderer)", "daoshi-wanderer": "Taoist exorcist (wanderer)", "daoshi": "Fallen daoshi (mob)",
         "kasa": "Kasa-obake, umbrella ghost (mob)", "rokurokubi": "Rokurokubi, long neck (mob)", "yukionna": "Yuki-onna, snow woman (mob)", "chochin": "Chochin-obake, lantern ghost (mob)",
         "jiangshi": "Jiangshi, hopping corpse (mob)", "sakura": "Old cherry (tree)", "matsu": "Sacred pine (tree)",
         "toro": "Stone lantern (decoration)", "torii": "Torii gate (decoration)", "katana": "Kagekiri, katana (weapon)", "guandao": "Dragon guandao (weapon)", "ofuda": "The Hundred Seals (weapon)", "odokuro": "Gashadokuro\u2019s Hand (weapon)",
         "yomi-rock": "Garden stones (rock node)", "yomi-rock-b": "Sacred boulder (rock node)", "jizo": "Jizo statue (decoration)",
         "bamboo": "Bamboo clump (tree, the Bamboo Thicket)", "bamboo-b": "Bamboo clump, lesser (tree)", "yanagi": "Weeping willow (tree, the Spider-lily Marsh)",
         "obonlantern": "Obon lantern (omen)", "foxwedding": "Fox wedding (omen)"}


def write_preview(out_dir, manifest):
    page = PREVIEW_PAGE.replace("__MANIFEST__", json.dumps(manifest)).replace("__NAMES__", json.dumps(NAMES))
    open(os.path.join(out_dir, "preview.html"), "w", newline="\n").write(page)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only"); ap.add_argument("--preview"); ap.add_argument("--out", default=OUT)
    a = ap.parse_args()
    sprites_dir = os.path.join(a.out, "sprites")
    os.makedirs(sprites_dir, exist_ok=True)
    keys = a.only.split(",") if a.only else list(ALL)
    man_path = os.path.join(a.out, "sprites.json")
    manifest = json.load(open(man_path)) if os.path.exists(man_path) else {}
    sheets = {}
    for k in keys:
        svg, entry = build(k, ALL[k], sprites_dir)
        manifest[k] = entry
        sheets[k] = svg
        print("built", k)
    manifest = {k: manifest[k] for k in ALL if k in manifest}
    open(man_path, "w", newline="\n").write(json.dumps(manifest, indent=1) + "\n")
    write_preview(a.out, manifest)
    if a.preview:
        preview(sheets, a.preview)


def preview(sheets, out, ppu=96):
    """Every frame of every sheet at its true world scale on the meadow colour."""
    from PIL import Image
    rows = []
    for k, svg in sheets.items():
        s = ALL[k]
        im = lib.render_png(svg)
        cw, ch = im.width // s["cols"], im.height // s["rows"]
        scale = s["size"][0] * ppu / cw
        cells = [im.crop(((i % s["cols"]) * cw, (i // s["cols"]) * ch, (i % s["cols"] + 1) * cw, (i // s["cols"] + 1) * ch)) for i in range(s["cols"] * s["rows"])]
        cells = [c.resize((max(1, int(cw * scale)), max(1, int(ch * scale))), Image.LANCZOS) for c in cells if c.getbbox()]
        rows.append(cells)
    W = max(sum(c.width for c in r) for r in rows) + 20
    H = sum(max(c.height for c in r) for r in rows) + 20
    sheet = Image.new("RGBA", (W, H), (125, 115, 93, 255))
    y = 10
    for r in rows:
        x = 10; h = max(c.height for c in r)
        for c in r:
            sheet.alpha_composite(c, (x, y + h - c.height)); x += c.width
        y += h
    sheet.save(out)


if __name__ == "__main__":
    main()
