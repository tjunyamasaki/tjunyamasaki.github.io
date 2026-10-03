"""Dread Ages art: the dreadhound, Dread thorns over the trails, the bleeding altar and the Dread sigil.

    python3 tools/art/build.py --only dreadhound,thornpatch,dreadaltar,sigil

Same ink style as the rest of the theme: thick outline, flat fill, one soft shade, a brush highlight.
The hound's sheet follows the enemy layout (4 x 2): 0-3 walk, 4-6 attack (wind-up, leap, recover), 7 idle.
It faces right, like every creature sheet; the game flips it.
"""
import math, random
from lib import *
from frontier import halo

ASH = "#3d2f44"; ASH_D = "#271d2d"; ASH_L = "#655170"
THORN = "#e8d9b8"; THORN_D = "#bfae8c"
BLOOD = "#c2283c"; BLOOD_D = "#7e1426"; BLOOD_L = "#ff6a6a"
EYE = "#ff4a4a"; EYE_L = "#ffd0c0"
VINE = "#4f3a3a"; VINE_D = "#35262a"; VINE_L = "#7a5a52"
SLAB = "#77707f"; SLAB_D = "#4f4958"; SLAB_L = "#a49eae"
WAX = "#e8dcc0"; WAX_D = "#bda98a"


def spike(x, y, ang, L, w=12, col=THORN):
    """A thorn: a sharp triangle from (x, y) toward `ang` degrees (0 = right, -90 = up)."""
    a = math.radians(ang)
    tx, ty = x + math.cos(a) * L, y + math.sin(a) * L
    nx, ny = -math.sin(a) * w / 2, math.cos(a) * w / 2
    return fill(f"M{f(x + nx)} {f(y + ny)} L{f(tx)} {f(ty)} L{f(x - nx)} {f(y - ny)} Z", col, 4)


# ------------------------------------------------------------------ the dreadhound
def dreadhound(P):
    """A gaunt shadow hound with a thorn spine and ember eyes. P: ph (gait), by (bob), crouch, leap, mouth, tail."""
    d = []; b = ""
    ph = P.get("ph", 0); by = P.get("by", 0); crouch = P.get("crouch", 0); leap = P.get("leap", 0); mouth = P.get("mouth", 0)
    lean = P.get("lean", 0)
    sw_ = lambda k: math.sin(2 * math.pi * (ph + k))
    hip = (176 - leap * .2, 586 + by + crouch * .6 - leap * .55)
    sho = (338 + leap * .5, 560 + by + crouch - leap * .9 + lean)
    # Legs: back pair behind the body, front pair in front. A gallop: pairs swing out of phase.
    def leg(root, phase, front, far):
        # A leap throws the forelegs out ahead and the hind legs out behind.
        reach = sw_(phase) * (44 if not leap else 10) + (leap * 1.5 if front else -leap * 1.2)
        lift = max(0, sw_(phase + .25)) * 24 + (leap * (.9 if front else .45))
        foot = (root[0] + reach + (18 if front else -10), 738 - lift)
        knee = ((root[0] + foot[0]) / 2 + (-30 if front else 34), (root[1] + foot[1]) / 2 + (4 if front else -12))
        col = ASH_D if far else ASH
        out = fill(limb(root, knee, foot, 46 if not front else 38, 16), col, 7)
        out += ell(foot[0] + (10 if front else 4), foot[1] - 4, 21, 11, col, 6)
        for k in (-1, 0, 1):
            out += line(f"M{f(foot[0] + 14 + k * 8)} {f(foot[1] + 2)} l{f(8 + k * 2)} 6", 4, THORN_D)
        return out
    b += leg((hip[0] + 6, hip[1] + 10), .5, False, True) + leg((sho[0] - 8, sho[1] + 16), 0, True, True)
    # Tail: a thorned whip curling up behind.
    tail = P.get("tail", 0)
    tp = [(hip[0] - 30, hip[1] - 20), (hip[0] - 86, hip[1] - 60 - tail), (hip[0] - 104, hip[1] - 130 - tail * 1.4), (hip[0] - 70 + sw_(.3) * 10, hip[1] - 168 - tail)]
    b += line(smooth(tp, closed=False), 26) + line(smooth(tp, closed=False), 16, ASH)
    for k, (x, y) in enumerate(tp[1:]):
        b += spike(x, y, -150 + k * 30, 40, 16)
    # Body: a lean barrel, deep chest, tucked belly.
    body = (f"M{f(hip[0] - 40)} {f(hip[1] - 10)} "
            f"C{f(hip[0] - 40)} {f(hip[1] - 70)} {f(sho[0] - 70)} {f(sho[1] - 86)} {f(sho[0] + 10)} {f(sho[1] - 74)} "
            f"C{f(sho[0] + 60)} {f(sho[1] - 60)} {f(sho[0] + 56)} {f(sho[1] + 40)} {f(sho[0] + 10)} {f(sho[1] + 56)} "
            f"C{f(sho[0] - 40)} {f(sho[1] + 66)} {f(hip[0] + 70)} {f(hip[1] + 20)} {f(hip[0] + 20)} {f(hip[1] + 34)} "
            f"C{f(hip[0] - 20)} {f(hip[1] + 44)} {f(hip[0] - 44)} {f(hip[1] + 26)} {f(hip[0] - 40)} {f(hip[1] - 10)} Z")
    ribs = "".join(line(f"M{f(sho[0] - 30 - i * 26)} {f(sho[1] - 30 + i * 4)} Q{f(sho[0] - 20 - i * 26)} {f(sho[1] + 10)} {f(sho[0] - 44 - i * 26)} {f(sho[1] + 34 - i * 4)}", 6, ASH_D) for i in range(3))
    b += shaded(d, body, ASH, ASH_D, -10, -12, ribs + brush((hip[0] + 10, hip[1] - 50), (sho[0] - 80, sho[1] - 86), (sho[0] - 10, sho[1] - 70), 10, ASH_L))
    # The thorn spine, from the neck down to the tail.
    for i in range(6):
        t = i / 5
        x = sho[0] - 20 + (hip[0] - 10 - (sho[0] - 20)) * t
        y = sho[1] - 76 + (hip[1] - 52 - (sho[1] - 76)) * t - math.sin(t * math.pi) * 18
        b += spike(x, y, -100 - t * 40, 44 - abs(t - .4) * 30, 15)
    # Near legs over the body.
    b += leg((hip[0] + 24, hip[1] + 18), 0, False, False) + leg((sho[0] + 6, sho[1] + 24), .5, True, False)
    # Head: a long skull of a snout, ears laid back; the jaw drops with `mouth`.
    hx, hy = sho[0] + 58, sho[1] - 74 + crouch * .4
    mouth = mouth * 1.4
    jaw = (f"M{f(hx - 10)} {f(hy + 26)} L{f(hx + 110)} {f(hy + 34 + mouth * .5)} Q{f(hx + 112)} {f(hy + 48 + mouth)} {f(hx + 92)} {f(hy + 52 + mouth)} "
           f"L{f(hx - 6)} {f(hy + 50)} Z")
    b += fill(jaw, ASH_D, 7)
    if mouth > 4:
        b += fill(f"M{f(hx + 10)} {f(hy + 30)} L{f(hx + 92)} {f(hy + 34 + mouth * .4)} L{f(hx + 84)} {f(hy + 44 + mouth * .8)} L{f(hx + 8)} {f(hy + 44)} Z", BLOOD_D, 4)
        for i in range(4):
            x = hx + 26 + i * 18
            b += fill(f"M{f(x)} {f(hy + 32 + i * 1.5)} L{f(x + 6)} {f(hy + 44 + i)} L{f(x + 12)} {f(hy + 33 + i * 1.5)} Z", THORN, 3)
    skull = (f"M{f(hx - 50)} {f(hy + 10)} C{f(hx - 50)} {f(hy - 44)} {f(hx + 6)} {f(hy - 52)} {f(hx + 44)} {f(hy - 30)} "
             f"L{f(hx + 120)} {f(hy + 4)} Q{f(hx + 134)} {f(hy + 22)} {f(hx + 112)} {f(hy + 34)} L{f(hx + 4)} {f(hy + 38)} "
             f"C{f(hx - 28)} {f(hy + 44)} {f(hx - 52)} {f(hy + 36)} {f(hx - 50)} {f(hy + 10)} Z")
    b += shaded(d, skull, ASH, ASH_D, -6, -8, brush((hx - 30, hy - 8), (hx + 6, hy - 34), (hx + 60, hy - 16), 8, ASH_L))
    b += ell(hx + 118, hy + 14, 10, 8, INK_D, 4)
    # Ears: two thorns laid back.
    b += spike(hx - 12, hy - 30, -150, 62, 26, ASH) + spike(hx + 4, hy - 34, -135, 50, 22, ASH_D)
    # Ember eye with a glow.
    b += halo(hx + 32, hy - 8, 24, EYE, .3)
    b += fill(f"M{f(hx + 14)} {f(hy - 6)} Q{f(hx + 32)} {f(hy - 20)} {f(hx + 50)} {f(hy - 4)} Q{f(hx + 32)} {f(hy + 4)} {f(hx + 14)} {f(hy - 6)} Z", EYE, 5)
    b += f'<circle cx="{f(hx + 34)}" cy="{f(hy - 8)}" r="4" fill="{EYE_L}" stroke="none"/>'
    return d, b


def hound_frames(fn, walk, attack, idle):
    mk = lambda P: (lambda: fn(P))
    return [mk(p) for p in walk] + [mk(p) for p in attack] + [mk(idle)]


HOUND = hound_frames(dreadhound,
    [dict(ph=0, by=0, tail=0), dict(ph=.25, by=-14, tail=10), dict(ph=.5, by=0, tail=0), dict(ph=.75, by=-14, tail=-8)],
    [dict(ph=.1, crouch=30, lean=8, tail=-20, mouth=6), dict(ph=.1, leap=70, by=-10, mouth=26, tail=24, lean=-10), dict(ph=.6, crouch=10, mouth=10, tail=6)],
    dict(ph=.1, tail=4))


# ------------------------------------------------------------------ Dread thorns
def thornpatch():
    """A low mound of black briar arching over a trail, pale thorns along every arch, a few red buds in it."""
    d = []; b = ""
    r = random.Random(41)
    b += f'<ellipse cx="256" cy="720" rx="232" ry="30" fill="{INK_D}" stroke="none" opacity=".35"/>'
    arches = []
    for i in range(10):
        x0 = r.uniform(16, 300); w = r.uniform(120, 200)
        mid = abs((x0 + w / 2) - 256) / 256
        h = r.uniform(70, 130) * (1 - mid * .55)
        arches.append(((x0, 730), (x0 + w / 2, 730 - h * 2), (min(494, x0 + w), 728)))
    arches.sort(key=lambda a: -(730 - a[1][1]))
    # Back arches darker, front ones lighter, so the tangle has depth.
    for k, (p0, c, p1) in enumerate(arches):
        dd = f"M{f(p0[0])} {f(p0[1])} Q{f(c[0])} {f(c[1])} {f(p1[0])} {f(p1[1])}"
        b += line(dd, 28) + line(dd, 17, VINE_D if k % 3 == 0 else VINE)
        b += line(dd, 4, VINE_L, ' opacity=".6"')
        for t in (.22, .42, .62, .82):
            x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0]
            y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]
            dx = 2 * (1 - t) * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0]); dy = 2 * (1 - t) * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1])
            ang = math.degrees(math.atan2(dy, dx)) + r.choice((-90, 90)) + r.uniform(-25, 25)
            b += spike(x, y, ang, 36 + r.uniform(0, 12), 15)
    for (x, y) in [(140, 668), (262, 648), (370, 676), (82, 700), (440, 702)]:
        b += ell(x, y, 14, 12, BLOOD, 6) + f'<circle cx="{x - 4}" cy="{y - 4}" r="4" fill="{BLOOD_L}" stroke="none"/>'
    return d, b


# ------------------------------------------------------------------ the bleeding altar
def dreadaltar():
    """A grave-slab altar on a plinth, its basin brimming red and running over, briar knotted round it."""
    d = []; b = ""
    b += halo(256, 600, 210, BLOOD, .18)
    # Plinth and slab.
    plinth = "M126 740 L140 600 L372 600 L386 740 Z"
    b += shaded(d, plinth, SLAB, SLAB_D, 12, -10, brush((150, 720), (152, 660), (166, 612), 8, SLAB_L))
    slab = "M86 604 L104 540 L408 540 L426 604 Z"
    b += shaded(d, slab, SLAB, SLAB_D, -10, -8, brush((120, 590), (200, 556), (360, 552), 8, SLAB_L))
    for x in (176, 256, 336):
        b += line(f"M{x} 616 L{x + 6} 730", 5, SLAB_D)
    # The basin, brimming.
    b += ell(256, 540, 112, 30, SLAB_D, 8)
    b += ell(256, 536, 96, 22, BLOOD, 5)
    b += f'<ellipse cx="236" cy="530" rx="40" ry="7" fill="{BLOOD_L}" stroke="none" opacity=".8"/>'
    # Runs down the front.
    for (x, l) in [(196, 90), (258, 150), (318, 70), (356, 110)]:
        b += fill(f"M{x - 9} 560 Q{x - 10} {560 + l * .6} {x - 4} {560 + l} Q{x} {566 + l} {x + 4} {560 + l} Q{x + 10} {560 + l * .6} {x + 9} 560 Z", BLOOD, 5)
    # Briar knotted round the plinth.
    vine = [(112, 730), (160, 690), (230, 716), (300, 680), (392, 728)]
    dd = smooth(vine, closed=False)
    b += line(dd, 22) + line(dd, 12, VINE)
    for (x, y) in vine[1:-1]:
        b += spike(x, y, -110, 28, 11) + spike(x + 10, y + 6, 50, 24, 10)
    # Two guttering candles.
    for (x, h) in [(116, 88), (396, 70)]:
        b += rrect(x - 16, 540 - h, 32, h, 8, WAX, 7) + f'<path d="M{x - 16} {556 - h} q8 14 16 0 q8 10 16 0" fill="{WAX_D}" stroke="none"/>'
        b += halo(x, 518 - h, 22, BLOOD_L, .35)
        b += fill(f"M{x} {500 - h} Q{x + 12} {520 - h} {x} {534 - h} Q{x - 12} {520 - h} {x} {500 - h} Z", BLOOD_L, 4)
    b += sparkle(256, 470, 1.4, BLOOD_L, .9)
    return d, b


# ------------------------------------------------------------------ the Dread sigil
def sigil():
    """A heavy seal torn from a great foe: a black iron ring round a disc of red wax, an eye of thorns pressed in it."""
    d = []; b = ""
    cx, cy = 256, 600
    b += halo(cx, cy, 150, BLOOD, .25)
    ring = f"M{cx} {cy - 118} a118 118 0 1 0 0.1 0 Z"
    b += shaded(d, ring, "#4a3e52", "#2c2433", 10, 10, brush((cx - 90, cy - 30), (cx - 80, cy - 90), (cx - 20, cy - 110), 9, "#7a6a86"))
    disc = f"M{cx} {cy - 86} a86 86 0 1 0 0.1 0 Z"
    b += shaded(d, disc, BLOOD, BLOOD_D, -8, -8, brush((cx - 56, cy - 10), (cx - 50, cy - 56), (cx - 10, cy - 70), 8, BLOOD_L))
    # Six notches round the ring.
    for k in range(6):
        a = k * math.pi / 3 + math.pi / 6
        b += spike(cx + math.cos(a) * 112, cy + math.sin(a) * 112, math.degrees(a), 30, 18, THORN)
    # The pressed eye of thorns.
    b += fill(f"M{cx - 58} {cy} Q{cx} {cy - 46} {cx + 58} {cy} Q{cx} {cy + 46} {cx - 58} {cy} Z", BLOOD_D, 6)
    b += ell(cx, cy, 20, 20, INK_D, 5) + f'<circle cx="{cx - 6}" cy="{cy - 6}" r="6" fill="{EYE_L}" stroke="none"/>'
    for k in range(5):
        a = -math.pi * (.2 + k * .15)
        b += line(f"M{f(cx + math.cos(a) * 40)} {f(cy + math.sin(a) * 30)} L{f(cx + math.cos(a) * 64)} {f(cy + math.sin(a) * 52)}", 6, BLOOD_D)
    b += sparkle(cx + 70, cy - 70, 1.3, "#fff0e8")
    return d, b


SPRITES = {
    "dreadhound": {"frames": HOUND, "cols": 4, "rows": 2, "target": (30, 200, 482, 744)},
    "thornpatch": (thornpatch, (16, 540, 496, 744)),
    "dreadaltar": (dreadaltar, (60, 300, 452, 744)),
    "sigil": (sigil, (130, 420, 382, 740)),
}
ICONS = {"sigil": sigil}
WIDE = {}
