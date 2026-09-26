"""The ten loot-only weapons of the arsenal update, their allies, projectiles and
spell effects. Same ink style as the rest of the theme: thick outline, flat fill,
one soft shade, a brush highlight, sparkles for magic."""
import math
from lib import *
from structures import anim
from magic import skeleton, SK_WALK, BRONZE, BRONZE_D, BRONZE_L
from longnight import BW_ATTACK, rot, GOLDEN, GOLDEN_D, GOLDEN_L, AM, AM_D, AM_L, GLOW, GLOW_D, GLOW_L

ICE = "#bfe8ff"; ICE_D = "#7fb3d9"; ICE_L = "#eef9ff"
STORM = "#8fc7ff"; STORM_L = "#e6f4ff"
FEATHER = "#3b3346"; FEATHER_L = "#6a5d7a"
PUMP = "#e0833a"; PUMP_D = "#b05a26"; PUMP_L = "#f6b36a"
SOUL = "#b89ae8"; SOUL_L = "#ece2ff"


# ------------------------------------------------------------------ melee
def fangs():
    """Twin curved daggers, crossed, bone grips."""
    d = []; b = ""
    for s, tint, dark in ((-1, MT_L, MT_D), (1, MT, MT_D)):
        blade = f"M0 0 Q{s * -30} -110 {s * 24} -230 Q{s * 44} -120 {s * 22} 0 Z"
        dag = fill(blade, tint, 8) + brush((s * 4, -30), (s * -10, -120), (s * 18, -200), 5, "#ffffff", .85)
        dag += line(f"M{s * 8} -10 Q{s * -8} -110 {s * 22} -214", 4, dark)
        dag += fill(limb((-34, 6), (0, -6), (34, 6), 14, 14), BRONZE, 6)
        dag += rrect(-11, 10, 22, 70, 6, BONE, 6) + wraps(-10, 10, 14, 76, 4, BONE_D)
        dag += f'<circle cx="0" cy="92" r="13" fill="{RD}" stroke-width="{sw(6)}"/>'
        b += G(dag, s * 56, 0, s * 18)
    b += sparkle(0, -250, 1.1, "#ffe8e0")
    return d, G(b, 256, 520)


def soulchain():
    """A spectral chain coiled round a grip, ending in a hooked ghost-iron claw."""
    d = []; b = ""
    b += f'<path d="M0 60 C-120 20 -120 -120 0 -140 C120 -160 110 -270 -10 -300" fill="none" stroke="{SOUL}" stroke-width="{sw(30)}" opacity=".28"/>'
    pts = []
    for i in range(12):
        t = i / 11
        x = 110 * math.sin(t * math.pi * 1.6) * (1 - t * .3); y = 40 - t * 330
        pts.append((x, y))
    for i, (x, y) in enumerate(pts):
        ang = 90 if i % 2 else 0
        b += f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{15 if i % 2 else 22}" ry="{22 if i % 2 else 13}" fill="none" stroke="{O}" stroke-width="{sw(16)}"/>'
        b += f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{15 if i % 2 else 22}" ry="{22 if i % 2 else 13}" fill="none" stroke="{SOUL}" stroke-width="{sw(7)}"/>'
    hx, hy = pts[-1]
    claw = f"M{hx - 20} {hy} Q{hx - 40} {hy - 60} {hx + 10} {hy - 90} Q{hx - 6} {hy - 50} {hx + 30} {hy - 20} Q{hx + 10} {hy - 4} {hx - 20} {hy} Z"
    b += fill(claw, MT, 8) + brush((hx - 20, hy - 20), (hx - 24, hy - 60), (hx + 4, hy - 80), 5, "#ffffff", .8)
    b += rrect(-16, 40, 32, 100, 8, DT, 7) + wraps(-15, 15, 46, 136, 6, DT_D)
    b += f'<circle cx="0" cy="152" r="18" fill="{SOUL}" stroke-width="{sw(7)}"/><circle cx="-5" cy="146" r="6" fill="{SOUL_L}" stroke="none"/>'
    b += sparkle(90, -60, 1.1, SOUL_L) + sparkle(-80, -200, .9, SOUL_L)
    return d, G(b, 256, 520)


def scythe():
    """Reaper's scythe: long crooked shaft, huge pale crescent blade."""
    d = []; b = ""
    b += union([limb((0, 330), (-14, 60), (10, -250), 24, 20)], DT)
    b += brush((8, 300), (-4, 60), (14, -220), 7, DT_L)
    blade = "M4 -250 Q-120 -330 -300 -250 Q-190 -270 -120 -226 Q-70 -200 -8 -196 Z"
    b += shaded(d, blade, MT_L, MT, 0, 12)
    b += line("M-8 -210 Q-110 -250 -270 -252", 5, MT_D) + brush((-40, -250), (-150, -290), (-250, -262), 6, "#ffffff", .8)
    b += rrect(-24, -262, 48, 34, 8, BRONZE, 7) + gem(0, -245, 9, GLOW, GLOW_D, GLOW_L)
    b += rrect(-15, 80, 30, 90, 6, TRK, 6) + wraps(-14, 14, 84, 166, 6, TRK_D)
    b += f'<path d="M-6 170 Q-40 220 -20 260" fill="none" stroke="{O}" stroke-width="{sw(14)}"/><path d="M-6 170 Q-40 220 -20 260" fill="none" stroke="{MAR}" stroke-width="{sw(6)}"/>'
    b += sparkle(-300, -300, 1.2, GLOW_L) + sparkle(-160, -190, .8, GLOW_L)
    return d, G(b, 256, 440)


# ------------------------------------------------------------------ magic ranged
def wisp_flame(cx, cy, s=1.0, col=GLOW, light=GLOW_L):
    o = (f"M{cx} {cy - 70 * s} Q{cx + 40 * s} {cy - 30 * s} {cx + 34 * s} {cy + 10 * s} Q{cx + 24 * s} {cy + 44 * s} {cx} {cy + 44 * s} "
         f"Q{cx - 24 * s} {cy + 44 * s} {cx - 34 * s} {cy + 10 * s} Q{cx - 38 * s} {cy - 24 * s} {cx - 10 * s} {cy - 40 * s} Q{cx - 6 * s} {cy - 56 * s} {cx} {cy - 70 * s} Z")
    return (fill(o, col, 7) + f'<ellipse cx="{f(cx)}" cy="{f(cy + 14 * s)}" rx="{f(16 * s)}" ry="{f(20 * s)}" fill="{light}" stroke="none"/>'
            + f'<circle cx="{f(cx - 8 * s)}" cy="{f(cy + 8 * s)}" r="{f(4 * s)}" fill="{O}" stroke="none"/><circle cx="{f(cx + 8 * s)}" cy="{f(cy + 8 * s)}" r="{f(4 * s)}" fill="{O}" stroke="none"/>')


def wisplantern():
    """A glass lantern hung from a crooked pole, three wisps swirling inside."""
    d = []; b = ""
    b += union([limb((0, 300), (14, 60), (0, -170), 20, 16), limb((0, -170), (40, -250), (110, -230), 16, 12)], WD)
    b += brush((6, 270), (14, 60), (4, -150), 6, WD_L)
    b += line("M110 -230 L110 -196", 6)
    lx, ly = 110, -110
    b += f'<circle cx="{lx}" cy="{ly}" r="110" fill="{GLOW}" opacity=".18" stroke="none"/>'
    b += fill(f"M{lx - 50} {ly - 80} Q{lx} {ly - 110} {lx + 50} {ly - 80} Z", BRONZE, 7)
    b += fill(f"M{lx - 56} {ly - 78} L{lx + 56} {ly - 78} L{lx + 48} {ly + 70} L{lx - 48} {ly + 70} Z", "#dff8f1", 7)
    b += wisp_flame(lx - 16, ly + 6, .45) + wisp_flame(lx + 18, ly - 18, .38) + wisp_flame(lx + 6, ly + 40, .3)
    b += line(f"M{lx - 20} {ly - 78} L{lx - 18} {ly + 70} M{lx + 20} {ly - 78} L{lx + 18} {ly + 70}", 8) + line(f"M{lx - 20} {ly - 78} L{lx - 18} {ly + 70} M{lx + 20} {ly - 78} L{lx + 18} {ly + 70}", 3, BRONZE)
    b += rrect(lx - 58, ly + 66, 116, 20, 7, BRONZE_D, 7)
    b += rrect(-14, 110, 28, 80, 6, TRK, 6) + wraps(-13, 13, 114, 186, 5, TRK_D)
    b += sparkle(lx + 90, ly - 60, 1.1, GLOW_L) + sparkle(lx - 90, ly + 40, .8, GLOW_L)
    return d, G(b, 256, 470)


def zigzag(x0, y0, x1, y1, n, amp, seed=1):
    pts = [(x0, y0)]
    for i in range(1, n):
        t = i / n
        k = amp if i % 2 else -amp
        pts.append((x0 + (x1 - x0) * t + k * (1 if (i + seed) % 3 else .5), y0 + (y1 - y0) * t))
    pts.append((x1, y1))
    return "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts)


def stormrod():
    """Iron rod with a forked crown holding a crackling storm orb."""
    d = []; b = ""
    b += union([limb((0, 300), (6, 60), (0, -150), 22, 18)], MT_D)
    b += brush((6, 270), (8, 60), (4, -140), 6, MT)
    b += union([limb((0, -150), (-60, -190), (-54, -280), 16, 8), limb((0, -150), (60, -190), (54, -280), 16, 8)], MT_D)
    b += f'<circle cx="0" cy="-236" r="96" fill="{STORM}" opacity=".22" stroke="none"/>'
    b += f'<circle cx="0" cy="-236" r="44" fill="{STORM}" stroke-width="{sw(8)}"/><circle cx="-12" cy="-250" r="16" fill="{STORM_L}" stroke="none"/>'
    for (x0, y0, x1, y1, s) in [(30, -250, 120, -320, 1), (-30, -230, -120, -300, 2), (10, -200, 70, -120, 3)]:
        z = zigzag(x0, y0, x1, y1, 4, 12, s)
        b += line(z, 12) + line(z, 5, STORM_L)
    b += rrect(-20, -164, 40, 20, 6, GOLD, 6)
    b += rrect(-15, 80, 30, 90, 6, "#3f4a66", 6) + wraps(-14, 14, 84, 166, 6, "#2b3348")
    b += sparkle(-100, -180, 1.0, STORM_L) + sparkle(90, -330, .9, STORM_L)
    return d, G(b, 256, 480)


def star_shape(cx, cy, r, points=5, inner=.45, rot0=-90):
    pts = []
    for i in range(points * 2):
        rr = r if i % 2 == 0 else r * inner
        a = math.radians(rot0 + i * 180 / points)
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    return "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + " Z"


def starfall():
    """A gold scepter crowned with a star caught in a crescent."""
    d = []; b = ""
    b += union([limb((0, 300), (-8, 60), (0, -140), 22, 18)], GOLDEN_D)
    b += brush((6, 270), (-2, 60), (4, -130), 7, GOLDEN)
    crescent = "M-70 -190 Q-100 -300 0 -330 Q-60 -290 -40 -220 Q-20 -170 50 -170 Q-20 -130 -70 -190 Z"
    b += fill(crescent, GOLDEN, 8) + brush((-70, -210), (-78, -270), (-30, -310), 5, GOLDEN_L)
    b += f'<circle cx="16" cy="-250" r="100" fill="{GOLDEN_L}" opacity=".22" stroke="none"/>'
    b += fill(star_shape(16, -250, 66), "#fff1c8", 8) + fill_ns(star_shape(16, -250, 34), GOLDEN_L)
    b += rrect(-22, -150, 44, 22, 6, AM, 6)
    b += rrect(-15, 80, 30, 90, 6, "#3b2f5a", 6) + wraps(-14, 14, 84, 166, 6, "#2a2144")
    b += fill("M0 172 L16 196 L0 222 L-16 196 Z", AM, 6)
    for (x, y, s) in [(-110, -330, 1.2), (110, -190, .9), (-120, -130, .8), (90, -350, .7)]:
        b += sparkle(x, y, s, "#fff1c8")
    return d, G(b, 256, 480)


# ------------------------------------------------------------------ summons
def crowtotem():
    """A carved totem pole topped with a crow skull, feathers and beads."""
    d = []; b = ""
    b += union([limb((0, 280), (8, 60), (0, -120), 30, 26)], WD)
    for y in (40, -40):
        b += fill(f"M-30 {y} L30 {y} L24 {y + 30} L-24 {y + 30} Z", WD_D, 6) + line(f"M-18 {y + 12} L-6 {y + 18} M6 {y + 18} L18 {y + 12}", 5)
    b += brush((10, 250), (16, 120), (12, -80), 6, WD_L)
    # crow skull
    b += fill("M-60 -150 Q-64 -230 0 -236 Q60 -232 62 -170 Q60 -130 20 -122 L-30 -122 Q-58 -128 -60 -150 Z", BONE, 8)
    b += fill("M40 -190 L150 -164 L60 -150 Z", BONE_D, 7) + line("M60 -166 L140 -164", 4)
    b += f'<circle cx="8" cy="-186" r="18" fill="{INK_D}" stroke="none"/><circle cx="12" cy="-190" r="6" fill="#ff8a5a" stroke="none"/>'
    for i, (a, l) in enumerate([(-150, 120), (-125, 140), (-100, 110)]):
        r = math.radians(a)
        tip = (-40 + math.cos(r) * l, -170 + math.sin(r) * l)
        b += fill(limb((-40, -170), ((-40 + tip[0]) / 2 - 10, (-170 + tip[1]) / 2), tip, 22, 4), FEATHER, 6)
        b += line(f"M-40 -170 L{f(tip[0])} {f(tip[1])}", 3, FEATHER_L)
    b += line("M40 -120 L50 -60 M24 -120 L20 -70", 5)
    for (x, y, c) in [(50, -56, RD), (20, -66, GOLD), (50, -84, CR)]:
        b += f'<circle cx="{x}" cy="{y}" r="9" fill="{c}" stroke-width="{sw(5)}"/>'
    b += sparkle(-140, -80, 1.0, "#ffe8e0")
    return d, G(b, 256, 480)


def jack_head(cx, cy, s=1.0, mouth=0.0, glow=1.0):
    b = ""
    for i, (dx, rx) in enumerate([(-58, 52), (58, 52), (-24, 58), (24, 58), (0, 60)]):
        b += f'<ellipse cx="{f(cx + dx * s)}" cy="{f(cy)}" rx="{f(rx * s)}" ry="{f(88 * s)}" fill="{PUMP if i < 4 else PUMP_L}" stroke-width="{sw(8)}"/>'
    b += brush((cx - 70 * s, cy - 20 * s), (cx - 66 * s, cy - 60 * s), (cx - 40 * s, cy - 76 * s), 7, PUMP_L)
    b += fill(f"M{cx - 6 * s} {cy - 86 * s} Q{cx - 10 * s} {cy - 130 * s} {cx + 26 * s} {cy - 140 * s} L{cx + 30 * s} {cy - 124 * s} Q{cx + 8 * s} {cy - 120 * s} {cx + 10 * s} {cy - 86 * s} Z", LEAF_D, 6)
    fire = "#fbe0a0" if glow > .5 else FL_M
    b += fill(f"M{cx - 60 * s} {cy - 26 * s} L{cx - 16 * s} {cy - 14 * s} L{cx - 40 * s} {cy + 12 * s} Z", fire, 6)
    b += fill(f"M{cx + 60 * s} {cy - 26 * s} L{cx + 16 * s} {cy - 14 * s} L{cx + 40 * s} {cy + 12 * s} Z", fire, 6)
    m = mouth * 26 * s
    b += fill(f"M{cx - 64 * s} {cy + 30 * s} L{cx - 30 * s} {cy + 40 * s} L{cx - 16 * s} {cy + 28 * s} L{cx} {cy + 42 * s} L{cx + 16 * s} {cy + 28 * s} L{cx + 30 * s} {cy + 40 * s} "
              f"L{cx + 64 * s} {cy + 30 * s} Q{cx + 30 * s} {cy + 70 * s + m} {cx} {cy + 72 * s + m} Q{cx - 30 * s} {cy + 70 * s + m} {cx - 64 * s} {cy + 30 * s} Z", fire, 6)
    return b


def jacklantern():
    """Hollow Jack: a carved pumpkin lantern swinging from a hooked handle."""
    d = []; b = ""
    b += f'<circle cx="256" cy="430" r="150" fill="{FL_M}" opacity=".16" stroke="none"/>'
    b += line("M256 330 L256 200 Q256 150 300 150 Q340 150 340 190", 18) + line("M256 330 L256 200 Q256 150 300 150 Q340 150 340 190", 8, IRON_MID)
    b += rrect(236, 180, 40, 150, 8, TRK, 6) + wraps(237, 275, 190, 320, 6, TRK_D)
    b += jack_head(256, 440, 1.05)
    b += sparkle(390, 360, 1.1, FL_I) + sparkle(130, 480, .9, FL_I)
    return d, b


IRON_MID = "#5c566e"


def wighthorn():
    """A curling bone war-horn bound in bronze, a teal ghost-breath at the bell."""
    d = []; b = ""
    horn = "M120 470 Q150 300 300 250 Q400 220 420 140 Q460 230 380 300 Q300 360 220 470 Z"
    b += shaded(d, horn, BONE, BONE_D, 12, 10, brush((150, 440), (190, 320), (300, 270), 8, BONE_L))
    for t in (.25, .5, .72):
        x = 120 + (420 - 120) * t; y = 470 + (140 - 470) * t
        b += f'<path d="M{f(x - 44)} {f(y + 30)} Q{f(x)} {f(y - 10)} {f(x + 40)} {f(y + 40)}" fill="none" stroke="{O}" stroke-width="{sw(22)}"/>'
        b += f'<path d="M{f(x - 44)} {f(y + 30)} Q{f(x)} {f(y - 10)} {f(x + 40)} {f(y + 40)}" fill="none" stroke="{BRONZE}" stroke-width="{sw(12)}"/>'
    b += f'<ellipse cx="160" cy="484" rx="62" ry="30" fill="{INK_D}" stroke-width="{sw(8)}"/>'
    b += brush((150, 520), (110, 600), (170, 650), 30, GLOW, .45) + brush((170, 520), (140, 590), (200, 630), 12, GLOW_L, .8)
    b += f'<path d="M300 280 Q260 380 200 460" fill="none" stroke="{MAR}" stroke-width="{sw(8)}"/>'
    b += sparkle(90, 620, 1.2, GLOW_L) + sparkle(440, 110, 1.0, BONE_L)
    return d, b


# ------------------------------------------------------------------ crowd control
def censer():
    """A frosted silver censer on a chain, cold mist spilling through its vents."""
    d = []; b = ""
    b += line("M256 60 L256 250", 10) + line("M256 60 L256 250", 4, MT)
    for y in range(80, 250, 34):
        b += f'<ellipse cx="256" cy="{y}" rx="9" ry="14" fill="none" stroke="{O}" stroke-width="{sw(9)}"/><ellipse cx="256" cy="{y}" rx="9" ry="14" fill="none" stroke="{MT}" stroke-width="{sw(4)}"/>'
    b += f'<circle cx="256" cy="50" r="22" fill="{MT}" stroke-width="{sw(7)}"/>'
    b += fill("M196 300 Q256 230 316 300 Z", MT_L, 7) + fill(star_shape(256, 250, 18, 6, .5), ICE_L, 5)
    body = "M180 300 L332 300 Q352 420 256 470 Q160 420 180 300 Z"
    b += shaded(d, body, MT, MT_D, 14, 0, brush((196, 320), (190, 380), (214, 430), 8, "#ffffff", .7))
    for (x, y) in [(220, 350), (256, 364), (292, 350), (238, 404), (274, 404)]:
        b += fill(star_shape(x, y, 14, 4, .45, -90), ICE, 4)
    b += rrect(176, 292, 160, 20, 7, BRONZE, 7)
    b += fill("M226 468 L286 468 L276 500 L236 500 Z", MT_D, 6)
    for (x, y, r) in [(210, 540, 34), (262, 566, 42), (318, 536, 30), (240, 610, 24)]:
        b += fill_ns(blob(x, y, r * 1.4, r, 8, .2, int(x)), ICE, .6)
    b += sparkle(110, 300, 1.2, ICE_L) + sparkle(410, 280, 1.0, ICE_L) + sparkle(420, 540, .8, ICE_L)
    return d, b


# ------------------------------------------------------------------ allies
def crow(P):
    """Carrion crow, side-on, wings driven by `wing` (-1 down .. 1 up); `dive` tilts for a peck."""
    d = []; b = ""
    wing = P.get("wing", 0); dive = P.get("dive", 0); by = P.get("by", 0)
    cx, cy = 256, 560 + by
    body = f"M{cx - 110} {cy + 10} Q{cx - 60} {cy - 60} {cx + 40} {cy - 50} Q{cx + 110} {cy - 40} {cx + 120} {cy + 10} Q{cx + 60} {cy + 60} {cx - 40} {cy + 50} Z"
    tail = f"M{cx - 100} {cy + 6} L{cx - 190} {cy - 20} L{cx - 170} {cy + 20} L{cx - 196} {cy + 44} L{cx - 90} {cy + 36} Z"
    wy = -130 * wing
    wing_far = f"M{cx - 20} {cy - 30} Q{cx - 60} {cy - 30 + wy * .8} {cx - 150} {cy - 10 + wy} Q{cx - 70} {cy + 10 + wy * .3} {cx + 20} {cy - 10} Z"
    wing_near = f"M{cx} {cy - 30} Q{cx - 30} {cy - 30 + wy} {cx - 120} {cy + wy * 1.1} L{cx - 90} {cy + 10 + wy * .6} L{cx - 110} {cy + 30 + wy * .4} Q{cx - 40} {cy + 30 + wy * .2} {cx + 40} {cy} Z"
    g = fill(wing_far, INK_D, 7) + fill(tail, FEATHER, 7) + fill(body, FEATHER, 8)
    g += brush((cx - 40, cy - 30), (cx + 20, cy - 50), (cx + 80, cy - 36), 7, FEATHER_L)
    g += fill(f"M{cx + 110} {cy - 20} L{cx + 190} {cy + 4} L{cx + 112} {cy + 20} Z", BONE_D, 7)
    g += f'<circle cx="{cx + 70}" cy="{cy - 18}" r="15" fill="#ff8a5a" stroke-width="{sw(5)}"/><circle cx="{cx + 73}" cy="{cy - 20}" r="6" fill="{INK_D}" stroke="none"/>'
    g += fill(wing_near, FEATHER, 7) + line(f"M{cx - 20} {cy - 10 + wy * .3} L{cx - 90} {cy + wy * .7}", 3, FEATHER_L)
    g += line(f"M{cx - 10} {cy + 46} L{cx - 20} {cy + 90} M{cx + 20} {cy + 44} L{cx + 16} {cy + 88}", 7) + line(f"M{cx - 10} {cy + 46} L{cx - 20} {cy + 90} M{cx + 20} {cy + 44} L{cx + 16} {cy + 88}", 3, GOLD_D)
    if dive:
        g = f'<g transform="rotate({dive} {cx} {cy})">{g}</g>'
        g += brush((cx + 150, cy + 30), (cx + 200, cy + 70), (cx + 170, cy + 120), 12, "#ffffff", .6)
    b += g
    return d, b

CROW_FLY = [dict(wing=1), dict(wing=.3, by=-10), dict(wing=-.8), dict(wing=.1, by=6)]
CROW_ATTACK = [dict(wing=1, dive=10), dict(wing=-.4, dive=34), dict(wing=.2, dive=18)]
CROW_IDLE = dict(wing=.4)


def jack(P):
    """Pumpkin sentry: a carved pumpkin on a nest of vines. `flick` flame, `spit` mouth."""
    d = []; b = ""
    fl = P.get("flick", 0); sp = P.get("spit", 0); by = P.get("by", 0)
    b += fill(blob(256, 720, 150, 30, 9, .15, 4), LEAF_D, 7)
    for s in (-1, 1):
        b += line(f"M{256 + s * 30} 700 Q{256 + s * 140} 690 {256 + s * 160} 640", 16) + line(f"M{256 + s * 30} 700 Q{256 + s * 140} 690 {256 + s * 160} 640", 7, LEAF)
        b += leaf(256 + s * 150, 650, -40 * s, 1.6, LEAF)
    b += f'<circle cx="256" cy="{560 + by}" r="{140 + fl * 20}" fill="{FL_M}" opacity="{.12 + fl * .08}" stroke="none"/>'
    b += jack_head(256, 580 + by - sp * 10, 1.15 * (1 + sp * .06), mouth=sp, glow=.4 + fl)
    if sp > .5:
        for i in range(3):
            b += f'<ellipse cx="{f(256 + 80 + i * 40)}" cy="{f(620 - i * 6)}" rx="10" ry="6" fill="{FL_I}" stroke-width="{sw(4)}"/>'
    return d, b

JACK_IDLE = [dict(flick=0), dict(flick=.5, by=-2), dict(flick=1, by=-4), dict(flick=.4, by=-2)]
JACK_ATTACK = [dict(spit=.2, flick=.6, by=4), dict(spit=1, flick=1, by=-8), dict(spit=.5, flick=.7)]


WIGHT_KIT = dict(cloth="#3f8f86", glow=GLOW, blade=True, helm=BRONZE_D)
def wight(P):
    return skeleton({**WIGHT_KIT, **P})

WIGHT_WALK = [{**p, "ar": (40, 60)} for p in SK_WALK]
WIGHT_ATTACK = BW_ATTACK
WIGHT_IDLE = dict(ar=(30, 50))


# ------------------------------------------------------------------ projectiles and zones
def wisp():
    d = []; b = ""
    b += brush((60, 256), (170, 236), (270, 256), 30, GLOW, .45) + brush((100, 256), (190, 270), (270, 256), 14, GLOW_L, .8)
    b += G(wisp_flame(0, 0, 1.2), 330, 262, 90)
    b += sparkle(410, 200, 1.1, GLOW_L)
    return d, b


def seed():
    d = []; b = ""
    b += brush((80, 256), (200, 240), (300, 256), 28, FL_O, .5) + brush((120, 256), (220, 266), (300, 256), 12, FL_I, .8)
    b += fill("M300 220 Q400 230 420 256 Q400 282 300 292 Q270 256 300 220 Z", "#f6e3b8", 8)
    b += fill_ns("M320 240 Q380 246 396 256 Q380 266 320 272 Z", FL_M)
    return d, b


def frostcloud(ph):
    d = []; b = ""
    for i in range(7):
        a = ph * math.pi * 2 + i * math.pi * 2 / 7
        x = 256 + math.cos(a) * 150; y = 620 + math.sin(a) * 60
        b += fill_ns(blob(x, y, 90, 48, 9, .2, 10 + i), ICE, .55)
    b += fill_ns(blob(256, 620, 200, 90, 11, .12, 3), ICE_L, .45)
    for i in range(6):
        a = -ph * math.pi * 2 + i * math.pi / 3
        b += sparkle(256 + math.cos(a) * 170, 600 + math.sin(a) * 70, 1.3, "#ffffff")
    b += fill(star_shape(256, 600 - 20 * math.sin(ph * math.pi * 2), 26, 6, .45), ICE_L, 4)
    return d, b


def star():
    d = []; b = ""
    b += brush((80, 120), (180, 300), (256, 560), 70, GOLDEN_L, .35) + brush((120, 180), (200, 340), (256, 560), 26, "#fff1c8", .8)
    b += f'<circle cx="256" cy="580" r="110" fill="{GOLDEN_L}" opacity=".3" stroke="none"/>'
    b += fill(star_shape(256, 580, 86), "#fff1c8", 9) + fill_ns(star_shape(256, 580, 44), GOLDEN_L)
    b += sparkle(150, 480, 1.3, "#ffffff") + sparkle(360, 660, 1.0, "#ffffff")
    return d, b


WEAPON_TARGET = (130, 30, 382, 740)
frames = lambda fn, poses: [(lambda P: (lambda: fn(P)))(P) for P in poses]
SPRITES = {
    "fangs": (fangs, (110, 250, 402, 740)), "soulchain": (soulchain, (120, 60, 392, 740)), "scythe": (scythe, (70, 30, 442, 740)),
    "wisplantern": (wisplantern, (120, 60, 392, 740)), "stormrod": (stormrod, WEAPON_TARGET), "starfall": (starfall, WEAPON_TARGET),
    "crowtotem": (crowtotem, (120, 90, 392, 740)), "jacklantern": (jacklantern, (130, 250, 382, 740)),
    "wighthorn": (wighthorn, (100, 300, 412, 740)), "censer": (censer, (130, 150, 382, 740)),
    "crow": {"frames": frames(crow, CROW_FLY + CROW_ATTACK + [CROW_IDLE]), "cols": 4, "rows": 2, "target": (40, 470, 472, 740)},
    "jack": {"frames": frames(jack, JACK_IDLE + JACK_ATTACK + [JACK_IDLE[0]]), "cols": 4, "rows": 2, "target": (60, 330, 452, 744)},
    "wight": {"frames": frames(wight, WIGHT_WALK + WIGHT_ATTACK + [WIGHT_IDLE]), "cols": 4, "rows": 2, "target": (30, 100, 482, 740)},
    "frostcloud": {"frames": anim(frostcloud), "cols": 4, "rows": 1, "target": (10, 470, 502, 744)},
    "star": (star, (120, 140, 392, 744)),
}
LONG = ("fangs", "soulchain", "scythe", "stormrod", "starfall", "crowtotem")
ICONS = {k: rot(SPRITES[k][0], 40) for k in LONG}
ICONS.update({k: SPRITES[k][0] for k in ("wisplantern", "jacklantern", "wighthorn", "censer")})
WIDE = {"wisp": wisp, "pumpseed": seed}
