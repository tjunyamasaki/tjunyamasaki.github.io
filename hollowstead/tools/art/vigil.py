"""Long-haul art: the two great bosses, the areas' nodes, the landmarks, the omens, their finds and the rare moons.

    python3 tools/art/build.py --only briarmother,unblinking,rimecrystal,embervent,briarthrone,delve,fallenstar,soulrift,goldpumpkin,rime,emberglass,moon-gilded,moon-starrain

Same ink style as the rest of the theme: thick outline, flat fill, one soft shade, a brush highlight.
Boss sheets follow the enemy layout (4 x 2): 0-3 walk, 4-6 attack (wind-up, strike, recover), 7 idle.
"""
import math, random
from lib import *
import lib
from frontier import halo, crescent
from structures import anim

BARK = "#5e4434"; BARK_D = "#3f2c22"; BARK_L = "#8a6448"
MOSSY = "#5f7a3c"; MOSSY_D = "#43592a"; MOSSY_L = "#8fae5a"
HEART = "#c23a3a"; HEART_D = "#7e1f2a"; HEART_L = "#f08a7a"
THORN = "#e8d9b8"
AMBER = "#ffb14e"; AMBER_L = "#ffe2a0"
SCLERA = "#efe6f4"; SCLERA_D = "#cdbbd8"; VEIN = "#c46a8a"
IRIS = "#7c3cff"; IRIS_L = "#b45cff"; PUPIL = "#120624"
FLESH = "#4a2c52"; FLESH_D = "#2e1a36"; FLESH_L = "#7a4a86"
ICE = "#a9d6ee"; ICE_D = "#6fa8cc"; ICE_L = "#eefaff"; SNOW = "#e6eef4"; SNOW_D = "#b9c6d2"
OBS = "#3a2a2e"; OBS_D = "#241a1e"; OBS_L = "#5e4850"; LAVA = "#ff7a2a"; LAVA_L = "#ffd27a"
STONE = "#7d7686"; STONE_D = "#57505f"; STONE_L = "#a8a2b2"
VOIDC = "#2a1a44"; RIFT = "#8a3dff"; RIFT_L = "#e6d0ff"
GOLDP = "#f2b33b"; GOLDP_D = "#c07a1e"; GOLDP_L = "#ffe38a"
STAR = "#ffd27a"; STAR_L = "#fff6d0"


def thorn(x, y, ang, L, w=10, col=THORN):
    a = math.radians(ang)
    tx, ty = x + math.cos(a) * L, y + math.sin(a) * L
    nx, ny = -math.sin(a) * w / 2, math.cos(a) * w / 2
    return fill(f"M{f(x + nx)} {f(y + ny)} L{f(tx)} {f(ty)} L{f(x - nx)} {f(y - ny)} Z", col, 4)


def vine(points, w, col, thorns=0, seed=0):
    """A smooth vine through points (open), with thorns every so often."""
    d = smooth(points, closed=False)
    out = line(d, w + 6) + line(d, w, col)
    r = random.Random(seed)
    for i in range(thorns):
        k = r.uniform(.1, .9) * (len(points) - 1)
        i0 = min(len(points) - 2, int(k)); t = k - i0
        x = points[i0][0] + (points[i0 + 1][0] - points[i0][0]) * t
        y = points[i0][1] + (points[i0 + 1][1] - points[i0][1]) * t
        ang = math.degrees(math.atan2(points[i0 + 1][1] - points[i0][1], points[i0 + 1][0] - points[i0][0])) + r.choice((-90, 90)) + r.uniform(-25, 25)
        out += thorn(x, y, ang, 16 + r.uniform(0, 8), 9)
    return out


# ------------------------------------------------------------------ Mother Briar
def briarmother(P):
    d = []; b = ""
    by = P.get("by", 0); ph = P.get("ph", 0); arms = P.get("arms", 0); lean = P.get("lean", 0); mouth = P.get("mouth", 0)
    sw_ = lambda k: math.sin(2 * math.pi * (ph + k))
    # A skirt of roots clawing the ground.
    for i in range(9):
        x0 = 256 + (i - 4) * 38
        x1 = 256 + (i - 4) * 64 + sw_(i * .11) * 10
        b += union([limb((x0, 560 + by), ((x0 + x1) / 2 + (i - 4) * 6, 680), (x1, 744), 56 - abs(i - 4) * 3, 12)], BARK_D, 14)
    body = ""
    # The trunk-torso.
    trunk = (f"M120 {650 + by} C96 {520 + by} 120 {370 + by} 180 {292 + by} L332 {292 + by} "
             f"C392 {370 + by} 416 {520 + by} 392 {650 + by} Q256 {684 + by} 120 {650 + by} Z")
    body += shaded(d, trunk, BARK, BARK_D, 14, -10, brush((176, 600 + by), (168, 480 + by), (206, 340 + by), 10, BARK_L))
    for (p0, c, p1) in [((180, 620), (206, 520), (190, 420)), ((330, 610), (310, 520), (326, 430)), ((256, 650), (240, 590), (262, 540))]:
        body += line(f"M{p0[0]} {p0[1] + by} Q{c[0]} {c[1] + by} {p1[0]} {p1[1] + by}", 5, BARK_D)
    # The heart in its cage of bark ribs.
    hy = 450 + by
    body += ell(256, hy, 58, 62, HEART_D, 7)
    hp = math.sin(2 * math.pi * ph * 2) * 4
    heart = (f"M256 {hy + 40 + hp} C220 {hy + 14} 206 {hy - 8} 214 {hy - 26} C222 {hy - 44} 248 {hy - 42} 256 {hy - 24} "
             f"C264 {hy - 42} 290 {hy - 44} 298 {hy - 26} C306 {hy - 8} 292 {hy + 14} 256 {hy + 40 + hp} Z")
    body += fill(heart, HEART, 6) + brush((226, hy - 20), (230, hy - 34), (246, hy - 32), 6, HEART_L)
    body += f'<ellipse cx="256" cy="{hy}" rx="70" ry="74" fill="{AMBER}" stroke="none" opacity=".18"/>'
    for i in range(5):
        x = 206 + i * 25
        body += line(f"M{x} {hy - 58} Q{x + (i - 2) * 6} {hy} {x} {hy + 60}", 12) + line(f"M{x} {hy - 58} Q{x + (i - 2) * 6} {hy} {x} {hy + 60}", 6, BARK_L)
    # Branch arms with twig claws: `arms` 0 hanging .. 1 raised over the head.
    for s in (-1, 1):
        sx, sy = 256 + s * 112, 336 + by
        ang = math.radians(s * (28 + 132 * arms))
        ex, ey = sx + math.sin(ang) * 150, sy + math.cos(ang) * 150
        hx, hy2 = ex + math.sin(ang + s * .5) * 120, ey + math.cos(ang + s * .5) * 120
        body += union([limb((sx, sy), ((sx + ex) / 2 + s * 20, (sy + ey) / 2), (ex, ey), 70, 50),
                       limb((ex, ey), ((ex + hx) / 2 - s * 14, (ey + hy2) / 2), (hx, hy2), 50, 28)], BARK)
        body += brush((sx + s * 6, sy + 10), ((sx + ex) / 2, (sy + ey) / 2 + 6), (ex, ey), 6, BARK_L)
        a0 = math.atan2(hy2 - ey, hx - ex)
        for k in range(-2, 3):
            a = a0 + k * .32
            fx, fy = hx + math.cos(a) * 62, hy2 + math.sin(a) * 62
            body += union([limb((hx, hy2), ((hx + fx) / 2 + math.sin(a) * 8, (hy2 + fy) / 2), (fx, fy), 20, 5)], BARK_D, 10)
        body += thorn(ex, ey, math.degrees(ang) + s * 70, 22, 12)
        body += thorn((sx + ex) / 2, (sy + ey) / 2, math.degrees(ang) - s * 80, 18, 10)
    # The head: gnarled bark, hollow glowing eyes, a crown of thorny antlers.
    hy3 = 250 + by
    head = blob(256, hy3, 100, 104, 11, .07, 77)
    body += shaded(d, head, BARK, BARK_D, 10, -8, brush((196, hy3 + 30), (192, hy3 - 20), (226, hy3 - 64), 8, BARK_L))
    for s in (-1, 1):
        body += fill(f"M{256 + s * 18} {hy3 - 8} L{256 + s * 64} {hy3 - 26} Q{256 + s * 64} {hy3 + 22} {256 + s * 34} {hy3 + 22} Q{256 + s * 14} {hy3 + 14} {256 + s * 18} {hy3 - 8} Z", "#1e1216", 5)
        body += f'<circle cx="{256 + s * 40}" cy="{hy3 + 4}" r="11" fill="{AMBER_L}" stroke="none"/>'
        body += f'<circle cx="{256 + s * 40}" cy="{hy3 + 4}" r="22" fill="{AMBER}" stroke="none" opacity=".35"/>'
    my = hy3 + 52
    body += fill(f"M214 {my} Q256 {my - 10} 298 {my} Q284 {my + 24 + mouth} 256 {my + 30 + mouth} Q228 {my + 24 + mouth} 214 {my} Z", "#1e1216", 5)
    for x in (230, 250, 270):
        body += fill(f"M{x} {my - 2} L{x + 6} {my + 12 + mouth * .4} L{x + 12} {my} Z", THORN, 3)
    for s in (-1, 1):
        pts = [(256 + s * 40, hy3 - 70), (256 + s * 76, hy3 - 140), (256 + s * 70, hy3 - 196), (256 + s * 104, hy3 - 236)]
        body += vine(pts, 20, BARK_D, 0)
        body += vine([(256 + s * 74, hy3 - 140), (256 + s * 128, hy3 - 170), (256 + s * 150, hy3 - 220)], 14, BARK_D, 0)
        for (x, y, a) in [(256 + s * 70, hy3 - 190, -90 + s * 20), (256 + s * 120, hy3 - 166, -90 - s * 30), (256 + s * 96, hy3 - 228, -100), (256 + s * 50, hy3 - 110, -90 + s * 60)]:
            body += thorn(x, y, a, 26, 12)
    body += vine([(256, hy3 - 84), (250, hy3 - 140), (262, hy3 - 182)], 16, BARK_D, 0) + thorn(262, hy3 - 180, -90, 28, 12)
    # Moss hanging from the brow and shoulders, and roses in the briar.
    for (x, y, L) in [(196, hy3 - 40, 120), (322, hy3 - 30, 110), (166, 340 + by, 140), (348, 344 + by, 130)]:
        body += vine([(x, y), (x + sw_(x * .01) * 10, y + L * .5), (x + sw_(x * .02) * 18, y + L)], 9, MOSSY, 0)
    body += vine([(170, 560 + by), (240, 520 + by), (300, 580 + by), (356, 530 + by)], 12, MOSSY_D, 5, seed=3)
    body += vine([(160, 400 + by), (220, 380 + by), (300, 410 + by), (352, 380 + by)], 12, MOSSY_D, 4, seed=7)
    for (x, y) in [(232, 520), (326, 404), (178, 398)]:
        body += f'<circle cx="{x}" cy="{y + by}" r="15" fill="{HEART}" stroke-width="{sw(5)}"/><path d="M{x - 7} {y + by} Q{x} {y + by - 9} {x + 7} {y + by}" fill="none" stroke="{HEART_D}" stroke-width="{sw(3)}"/>'
    if P.get("slam"):
        body += fill_ns(blob(256, 730, 210, 24, 9, .2, 5), "#c23a3a", .35)
        for i in range(6):
            a = math.pi * (.08 + .17 * i)
            body += thorn(256 + math.cos(a) * 210, 720, -90 + (i - 2.5) * 12, 40, 14)
    if lean:
        body = f'<g transform="rotate({lean} 256 700)">{body}</g>'
    b += body
    return d, b


BRIAR_WALK = [dict(ph=0, by=0), dict(ph=.25, by=-8), dict(ph=.5, by=0), dict(ph=.75, by=-8)]
BRIAR_ATTACK = [dict(ph=.1, arms=1, lean=-5, by=-10, mouth=10), dict(ph=.4, arms=.1, lean=7, by=8, mouth=26, slam=True), dict(ph=.7, arms=.35, lean=3, mouth=8)]
BRIAR_IDLE = dict(ph=0, arms=.15)


# ------------------------------------------------------------------ The Unblinking
def unblinking(P):
    d = []; b = ""
    by = P.get("by", 0); ph = P.get("ph", 0); lid = P.get("lid", 1); look = P.get("look", (0, 0)); flare = P.get("flare", 0)
    cy = 400 + by
    # Tendrils hanging and writhing below.
    for i in range(7):
        x0 = 256 + (i - 3) * 40
        sway = math.sin(2 * math.pi * (ph + i * .15)) * 26
        pts = [(x0, cy + 120), (x0 + sway * .4, cy + 200), (x0 - sway * .6 + (i - 3) * 12, cy + 270), (x0 + sway + (i - 3) * 22, cy + 330)]
        dd = smooth(pts, closed=False)
        b += line(dd, 30 - abs(i - 3) * 2) + line(dd, 22 - abs(i - 3) * 2, FLESH)
        b += line(dd, 6, FLESH_L, ' opacity=".6"')
    # A collar of dark flesh and horn-spikes round the eye.
    for k in range(12):
        a = k / 12 * math.tau + .13
        r0, r1 = 150, 200 + (k % 3) * 18
        x0, y0 = 256 + math.cos(a) * r0, cy + math.sin(a) * r0 * .92
        x1, y1 = 256 + math.cos(a) * r1, cy + math.sin(a) * r1 * .92
        nx, ny = -math.sin(a) * 26, math.cos(a) * 24
        b += fill(f"M{f(x0 + nx)} {f(y0 + ny)} L{f(x1)} {f(y1)} L{f(x0 - nx)} {f(y0 - ny)} Z", FLESH_D, 6)
    b += shaded(d, blob(256, cy, 172, 160, 12, .05, 11), FLESH, FLESH_D, 12, -10, brush((126, cy - 30), (150, cy - 110), (220, cy - 150), 9, FLESH_L))
    # The eyeball.
    ball = f"M256 {cy - 140} a140 132 0 1 0 0.1 0 Z"
    b += shaded(d, ball, SCLERA, SCLERA_D, -14, -16, brush((160, cy - 40), (170, cy - 100), (220, cy - 128), 9, "#ffffff"))
    r = random.Random(5)
    for k in range(9):
        a = r.uniform(0, math.tau)
        x0, y0 = 256 + math.cos(a) * 134, cy + math.sin(a) * 126
        x1, y1 = 256 + math.cos(a + .2) * 70, cy + math.sin(a + .2) * 64
        b += line(f"M{f(x0)} {f(y0)} Q{f((x0 + x1) / 2 + r.uniform(-14, 14))} {f((y0 + y1) / 2 + r.uniform(-14, 14))} {f(x1)} {f(y1)}", 4, VEIN)
    ix, iy = 256 + look[0] * 40, cy + look[1] * 30
    b += f'<circle cx="{f(ix)}" cy="{f(iy)}" r="{f(78)}" fill="{IRIS}" stroke-width="{sw(7)}"/>'
    b += f'<circle cx="{f(ix)}" cy="{f(iy)}" r="{f(56)}" fill="{IRIS_L}" stroke="none"/>'
    for k in range(14):
        a = k / 14 * math.tau
        b += f'<path d="M{f(ix + math.cos(a) * 24)} {f(iy + math.sin(a) * 24)} L{f(ix + math.cos(a) * 70)} {f(iy + math.sin(a) * 70)}" stroke="{IRIS}" stroke-width="{sw(4)}" fill="none"/>'
    pw = 18 - 10 * flare
    b += fill(f"M{f(ix)} {f(iy - 66)} Q{f(ix + pw)} {f(iy)} {f(ix)} {f(iy + 66)} Q{f(ix - pw)} {f(iy)} {f(ix)} {f(iy - 66)} Z", PUPIL, 5)
    b += f'<circle cx="{f(ix - 30)}" cy="{f(iy - 34)}" r="14" fill="#ffffff" stroke="none" opacity=".9"/>'
    if flare:
        b += f'<circle cx="{f(ix)}" cy="{f(iy)}" r="{f(96 + 30 * flare)}" fill="{IRIS_L}" stroke="none" opacity="{.25 * flare:.2f}"/>'
    # Lids: fleshy, closing from above and below by (1-lid).
    shut = 1 - lid
    if shut > .02:
        top = cy - 140 + 140 * shut
        b += fill(f"M112 {cy} Q112 {cy - 150} 256 {cy - 150} Q400 {cy - 150} 400 {cy} Q330 {f(top + 40)} 256 {f(top + 30)} Q182 {f(top + 40)} 112 {cy} Z", FLESH, 7)
        bot = cy + 132 - 120 * shut
        b += fill(f"M112 {cy} Q112 {cy + 150} 256 {cy + 150} Q400 {cy + 150} 400 {cy} Q330 {f(bot - 30)} 256 {f(bot - 22)} Q182 {f(bot - 30)} 112 {cy} Z", FLESH, 7)
    b += f'<path d="{ball}" fill="none" stroke-width="{sw(8)}"/>'
    return d, b


EYE_WALK = [dict(ph=0, by=0, look=(-.2, 0)), dict(ph=.25, by=-10, look=(0, .1)), dict(ph=.5, by=-16, look=(.2, 0)), dict(ph=.75, by=-8, look=(0, -.1))]
EYE_ATTACK = [dict(ph=.1, by=-6, lid=.55, look=(0, .2)), dict(ph=.4, by=4, flare=1, look=(0, .25)), dict(ph=.7, by=-4, lid=.85, flare=.4)]
EYE_IDLE = dict(ph=0, lid=.9)


def frames(fn, walk, attack, idle):
    mk = lambda P: (lambda: fn(P))
    return [mk(p) for p in walk] + [mk(p) for p in attack] + [mk(idle)]


# ------------------------------------------------------------------ area nodes
def ice_crystal(x, y, w, h, rot):
    tip = h + w * 1.2
    return (f'<g transform="translate({x} {y}) rotate({rot})">'
            + fill_ns(f"M{-w} 0 L{-w} {-h} L0 {-tip} L0 20 Z", ICE) + fill_ns(f"M0 20 L0 {-tip} L{w} {-h} L{w} 0 Z", ICE_D)
            + line(f"M{-w} 20 L{-w} {-h} L0 {-tip} L{w} {-h} L{w} 20", 7) + line(f"M0 {-tip} L0 20", 4)
            + brush((-w * .5, -h * .1), (-w * .55, -h * .5), (-w * .3, -h * .95), 6, ICE_L) + '</g>')


def rimecrystal():
    d = []; b = ""
    b += halo(256, 560, 160, ICE_L, .18)
    b += ice_crystal(200, 650, 28, 150, -18) + ice_crystal(312, 640, 24, 120, 20) + ice_crystal(256, 620, 40, 230, 0) + ice_crystal(150, 676, 16, 60, -36) + ice_crystal(362, 672, 16, 56, 34)
    mound = blob(256, 680, 160, 52, 10, .1, 12, flat=712)
    b += shaded(d, mound, SNOW, SNOW_D, -12, -12, brush((140, 668), (196, 646), (250, 644), 7, "#ffffff"))
    b += sparkle(176, 420, 1.6, "#ffffff") + sparkle(336, 480, 1.0, "#ffffff") + sparkle(120, 600, .8, ICE_L)
    return d, b


def embervent():
    d = []; b = ""
    b += halo(256, 600, 150, LAVA, .18)
    rock = (f"M110 730 L140 610 L190 560 L240 470 L300 520 L350 500 L400 610 L410 730 Q256 750 110 730 Z")
    b += shaded(d, rock, OBS, OBS_D, 14, -10, brush((150, 690), (170, 600), (220, 540), 8, OBS_L))
    for (pts, w) in [([(160, 700), (200, 640), (190, 590)], 9), ([(256, 720), (260, 640), (250, 540)], 11), ([(330, 700), (340, 640), (370, 600)], 8)]:
        dd = smooth(pts, closed=False)
        b += line(dd, w + 6) + line(dd, w, LAVA) + line(dd, max(2, w - 6), LAVA_L)
    for (x, y, w, h, r) in [(206, 560, 18, 70, -16), (300, 540, 22, 90, 14), (252, 500, 14, 50, 0)]:
        tip = h + w
        b += (f'<g transform="translate({x} {y}) rotate({r})">'
              + fill_ns(f"M{-w} 0 L{-w} {-h} L0 {-tip} L0 14 Z", "#e8763a") + fill_ns(f"M0 14 L0 {-tip} L{w} {-h} L{w} 0 Z", "#a8441e")
              + line(f"M{-w} 14 L{-w} {-h} L0 {-tip} L{w} {-h} L{w} 14", 6) + brush((-w * .5, -h * .2), (-w * .55, -h * .6), (-w * .3, -h * .95), 5, LAVA_L) + "</g>")
    b += flame(256, 470, 70, 90, .3, 4)
    return d, b


def briarthrone():
    d = []; b = ""
    b += halo(256, 520, 230, HEART, .14)
    # The seat: a great tangle of bramble shaped into a throne.
    back = "M120 700 C100 520 120 330 180 230 Q256 150 332 230 C392 330 412 520 392 700 Z"
    b += shaded(d, back, BARK_D, "#2a1c16", 14, -10, brush((150, 640), (140, 460), (190, 280), 9, BARK))
    seat = "M90 740 L96 600 Q256 560 416 600 L422 740 Q256 760 90 740 Z"
    b += shaded(d, seat, BARK, BARK_D, 12, -10, brush((120, 700), (180, 600), (300, 596), 8, BARK_L))
    for s in (-1, 1):
        b += vine([(256 + s * 150, 740), (256 + s * 170, 600), (256 + s * 150, 460), (256 + s * 170, 300), (256 + s * 120, 200)], 20, BARK, 7, seed=10 + s)
        b += vine([(256 + s * 60, 720), (256 + s * 110, 560), (256 + s * 70, 380), (256 + s * 30, 240)], 14, MOSSY_D, 5, seed=20 + s)
    for k in range(9):
        a = math.pi * (1.1 + .8 * k / 8)
        b += thorn(256 + math.cos(a) * 130, 300 + math.sin(a) * 110, math.degrees(a), 46, 16)
    # A heart-red rose at the crown, and old blood-red petals on the seat.
    b += f'<circle cx="256" cy="196" r="34" fill="{HEART}" stroke-width="{sw(7)}"/>'
    b += line("M234 196 Q256 170 278 196 M240 210 Q256 190 272 210", 4, HEART_D)
    for (x, y) in [(200, 640), (320, 630), (256, 620)]:
        b += leaf(x, y, 30 + x, 2.2, HEART_L)
    return d, b


def delve():
    d = []; b = ""
    b += halo(256, 600, 200, RIFT, .16)
    # A stone ring round a stair falling into the dark.
    pit = "M96 720 Q96 580 256 570 Q416 580 416 720 Q256 760 96 720 Z"
    b += fill(pit, "#140c20", 8)
    for i in range(5):
        y = 610 + i * 22; w = 130 - i * 18
        b += fill(f"M{256 - w} {y} L{256 + w} {y} L{256 + w - 8} {y + 16} L{256 - w + 8} {y + 16} Z", STONE_D if i % 2 else STONE, 5)
    b += f'<ellipse cx="256" cy="700" rx="70" ry="18" fill="{RIFT}" stroke="none" opacity=".45"/>'
    # The arch: two leaning stones and a lintel, cracked, with a carved eye.
    for s in (-1, 1):
        post = f"M{256 + s * 150} 720 L{256 + s * 170} 380 L{256 + s * 110} 360 L{256 + s * 100} 720 Z"
        b += shaded(d, post, STONE, STONE_D, -s * 10, -8, brush((256 + s * 140, 680), (256 + s * 150, 520), (256 + s * 150, 400), 7, STONE_L))
        b += line(f"M{256 + s * 140} 560 L{256 + s * 124} 600 L{256 + s * 134} 640", 4, STONE_D)
    lintel = "M80 390 Q256 300 432 390 L420 440 Q256 360 92 440 Z"
    b += shaded(d, lintel, STONE, STONE_D, 0, -10, brush((130, 400), (256, 340), (380, 400), 7, STONE_L))
    b += ell(256, 374, 30, 16, "#1a1028", 5) + f'<circle cx="256" cy="374" r="8" fill="{RIFT_L}" stroke="none"/>'
    b += vine([(110, 720), (100, 560), (130, 420)], 9, MOSSY, 0) + vine([(400, 720), (414, 600), (390, 460)], 9, MOSSY, 0)
    b += sparkle(256, 640, 1.2, RIFT_L, .8) + sparkle(220, 600, .8, RIFT_L, .7)
    return d, b


# ------------------------------------------------------------------ omens
def fallenstar():
    d = []; b = ""
    b += halo(256, 600, 190, STAR, .22)
    crater = "M80 730 Q100 640 256 630 Q412 640 432 730 Q256 760 80 730 Z"
    b += shaded(d, crater, "#3a3044", "#251e2e", -10, -10, brush((130, 700), (200, 660), (280, 656), 7, "#5a4e66"))
    b += ell(256, 700, 120, 26, "#1a1422", 0, extra=' stroke="none"')
    star = []
    for k in range(10):
        a = -math.pi / 2 + k * math.pi / 5
        r = 120 if k % 2 == 0 else 52
        star.append((256 + math.cos(a) * r, 560 + math.sin(a) * r * .9))
    sd = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in star) + " Z"
    b += shaded(d, sd, STAR, "#e0a63a", -12, -10, brush((210, 520), (230, 470), (256, 450), 8, STAR_L))
    b += f'<circle cx="256" cy="560" r="30" fill="{STAR_L}" stroke="none" opacity=".8"/>'
    b += sparkle(140, 450, 1.8, STAR_L) + sparkle(380, 480, 1.4, STAR_L) + sparkle(330, 380, 1.0, STAR_L)
    for (x0, y0) in [(150, 680), (370, 690), (300, 700)]:
        b += line(f"M{x0} {y0} L{x0 + 18} {y0 - 24}", 6, "#e0a63a")
    return d, b


def soulrift(phase):
    d = []; b = ""
    b += halo(256, 440, 200, RIFT, .2 + .06 * math.sin(phase * math.tau))
    t = phase * math.tau
    tear = (f"M256 {170 + 6 * math.sin(t)} C{316 + 10 * math.sin(t + 1)} 300 {300 + 8 * math.sin(t + 2)} 560 256 {720} "
            f"C{212 - 8 * math.sin(t + 2)} 560 {196 - 10 * math.sin(t + 1)} 300 256 {170 + 6 * math.sin(t)} Z")
    b += fill(tear, VOIDC, 9)
    inner = (f"M256 220 C296 320 284 540 256 670 C228 540 216 320 256 220 Z")
    b += fill_ns(inner, RIFT, .9)
    for k in range(3):
        a = t + k * 2.1
        pts = [(256 + math.cos(a + i * .7) * (10 + i * 12), 440 + math.sin(a + i * .7) * (16 + i * 22)) for i in range(8)]
        b += line(smooth(pts, closed=False), 6, RIFT_L, ' opacity=".85"')
    b += f'<ellipse cx="256" cy="740" rx="90" ry="14" fill="{RIFT}" stroke="none" opacity=".3"/>'
    for i in range(4):
        a = t * .5 + i * 1.6
        b += sparkle(256 + math.cos(a) * 110, 440 + math.sin(a) * 180, 1.1, RIFT_L, .8)
    return d, b


def goldpumpkin():
    d = []; b = ""
    b += halo(256, 600, 170, GOLDP_L, .3)
    cx, cy = 256, 640
    for s in (-1, 1):
        b += ell(cx + s * 70, cy, 88, 96, GOLDP_D)
    mid = f"M{cx} {cy - 108} C{cx + 60} {cy - 108} {cx + 84} {cy - 48} {cx + 84} {cy} C{cx + 84} {cy + 52} {cx + 56} {cy + 108} {cx} {cy + 108} C{cx - 56} {cy + 108} {cx - 84} {cy + 52} {cx - 84} {cy} C{cx - 84} {cy - 48} {cx - 60} {cy - 108} {cx} {cy - 108} Z"
    b += shaded(d, mid, GOLDP, GOLDP_D, -10, -8, brush((cx + 30, cy - 80), (cx + 54, cy - 56), (cx + 58, cy - 20), 8, GOLDP_L))
    b += brush((cx - 128, cy - 40), (cx - 134, cy), (cx - 122, cy + 34), 7, GOLDP_L)
    b += fill(f"M{cx - 10} {cy - 102} Q{cx - 16} {cy - 140} {cx} {cy - 168} L{cx + 24} {cy - 160} Q{cx + 12} {cy - 132} {cx + 16} {cy - 102} Z", "#6b5a2a", 7)
    b += sparkle(cx - 100, cy - 130, 2.0, "#ffffff") + sparkle(cx + 120, cy - 40, 1.4, "#fff6d0") + sparkle(cx + 40, cy - 10, 1.0, "#ffffff")
    return d, b


# ------------------------------------------------------------------ finds
def rime():
    d = []; b = ""
    b += ice_crystal(220, 700, 34, 150, -16) + ice_crystal(300, 700, 30, 110, 18) + ice_crystal(260, 700, 44, 200, 0)
    b += sparkle(190, 460, 1.4, "#ffffff")
    return d, b


def emberglass():
    d = []; b = ""
    for (x, y, w, h, r, c, cd) in [(220, 700, 34, 120, -18, "#e8763a", "#a8441e"), (300, 700, 30, 100, 20, "#ff9a4a", "#b85020"), (258, 700, 44, 170, 0, "#ffb05a", "#c4561e")]:
        tip = h + w
        b += (f'<g transform="translate({x} {y}) rotate({r})">'
              + fill_ns(f"M{-w} 0 L{-w} {-h} L0 {-tip} L0 14 Z", c) + fill_ns(f"M0 14 L0 {-tip} L{w} {-h} L{w} 0 Z", cd)
              + line(f"M{-w} 14 L{-w} {-h} L0 {-tip} L{w} {-h} L{w} 14", 7) + brush((-w * .5, -h * .2), (-w * .55, -h * .6), (-w * .3, -h * .95), 6, LAVA_L) + "</g>")
    b += f'<ellipse cx="256" cy="640" rx="90" ry="60" fill="{LAVA}" stroke="none" opacity=".18"/>'
    return d, b


# ------------------------------------------------------------------ moons (HUD icons)
def moon_gilded():
    d = []; b = ""
    b += halo(256, 256, 186, GOLDP_L, .32)
    disc = "M256 106 a150 150 0 1 0 0.1 0 Z"
    spots = "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{GOLDP_D}" stroke="none" opacity=".45"/>' for (x, y, r) in [(206, 200, 24), (310, 176, 14), (300, 296, 20), (196, 304, 12)])
    b += shaded(d, disc, GOLDP, GOLDP_D, -16, -12, spots + brush((150, 250), (160, 170), (230, 128), 10, GOLDP_L))
    for (x, y, s) in [(420, 120, 2.0), (90, 150, 1.4), (410, 390, 1.6), (110, 400, 1.1), (256, 60, 1.2)]:
        b += sparkle(x, y, s, "#fff6d0")
    return d, b


def moon_starrain():
    d = []; b = ""
    b += halo(256, 256, 176, "#8fa0ff", .2)
    b += f'<circle cx="256" cy="256" r="140" fill="#2a2e5a" stroke-width="{sw(12)}"/>'
    b += f'<circle cx="256" cy="256" r="136" fill="none" stroke="#c8d0ff" stroke-width="{sw(6)}"/>'
    for (x0, y0, L) in [(120, 120, 150), (220, 70, 120), (330, 150, 170), (150, 260, 110)]:
        x1, y1 = x0 + L * .7, y0 + L * .7
        b += line(f"M{x0} {y0} L{x1} {y1}", 18, None, ' stroke="#2b2233"') + line(f"M{x0} {y0} L{x1} {y1}", 9, STAR)
        b += sparkle(x1, y1, 1.6, STAR_L)
    return d, b


BOSS_TARGET = (8, 30, 504, 744)
SPRITES = {
    "briarmother": {"frames": frames(briarmother, BRIAR_WALK, BRIAR_ATTACK, BRIAR_IDLE), "cols": 4, "rows": 2, "target": BOSS_TARGET},
    "unblinking": {"frames": frames(unblinking, EYE_WALK, EYE_ATTACK, EYE_IDLE), "cols": 4, "rows": 2, "target": (20, 40, 492, 744)},
    "rimecrystal": (rimecrystal, (60, 240, 452, 744)),
    "embervent": (embervent, (70, 330, 442, 744)),
    "briarthrone": (briarthrone, (30, 120, 482, 744)),
    "delve": (delve, (30, 280, 482, 744)),
    "fallenstar": (fallenstar, (50, 360, 462, 744)),
    "soulrift": {"frames": anim(soulrift), "cols": 4, "rows": 1, "target": (90, 120, 422, 744)},
    "goldpumpkin": (goldpumpkin, (100, 420, 412, 744)),
    "rime": (rime, (130, 400, 382, 740)),
    "emberglass": (emberglass, (130, 400, 382, 740)),
}
ICONS = {"rime": rime, "emberglass": emberglass, "goldpumpkin": goldpumpkin, "moon-gilded": moon_gilded, "moon-starrain": moon_starrain}
WIDE = {}
