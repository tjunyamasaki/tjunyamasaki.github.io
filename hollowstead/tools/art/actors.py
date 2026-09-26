"""Animated actors: the four wanderers and the four night enemies.

Wanderer sheet (8 x 2 cells):
  0-1 idle, 2-5 walk, 6-8 attack, 9-11 gather, 12 dash, 13 down, 14-15 spare idle
Enemy sheet (4 x 2 cells):
  0-3 walk, 4-6 attack (wind-up, strike, recover), 7 idle
"""
import math
from lib import *
import lib
from structures import IRON, IRON_D, IRON_L

HAIR_SHADOW = "#2a2030"
STOCK = "#3a2e3a"; BOOT = "#5b4a3f"; BOOT_D = "#3e3129"

WITCHES = {
    "ember": dict(cloak="#d06a3a", cloak_d="#a8492f", cloak_l="#f0a060", hat="#5a3a4a", hat_d="#3e2634", band="#e8b04a", hair="#4a2c26", hair_l="#6e4234", trim="#e8b04a", charm=FL_M),
    "moss": dict(cloak="#5e8f76", cloak_d="#3f6a58", cloak_l="#94c8ae", hat="#3e4a44", hat_d="#2a3430", band="#b8c46a", hair="#8a4a2e", hair_l="#b06a40", trim="#b8c46a", charm=LEAF_L),
    "vesper": dict(cloak="#7a62b0", cloak_d="#5b4a8a", cloak_l="#bea1e0", hat="#3a3150", hat_d="#262036", band="#c9c6da", hair="#c9c3dc", hair_l="#eeeaf8", trim="#dcc8f7", charm=CR),
    "cinder": dict(cloak="#b04a48", cloak_d="#8f3a3f", cloak_l="#e08a7a", hat="#2e2630", hat_d="#1e1824", band="#d0504a", hair="#2a2030", hair_l="#4a3a50", trim="#e3d6b4", charm=RD),
}


def rot_pt(p, c, deg):
    a = math.radians(deg); x, y = p[0] - c[0], p[1] - c[1]
    return (c[0] + x * math.cos(a) - y * math.sin(a), c[1] + x * math.sin(a) + y * math.cos(a))


def seg(start, ang, L):
    """Point at distance L from start along angle `ang` (0 = straight down, + = toward +x)."""
    a = math.radians(ang)
    return (start[0] + math.sin(a) * L, start[1] + math.cos(a) * L)


def bar(p0, p1, w, col, lw=7):
    """Rounded rectangle from p0 to p1 (one arm/leg segment)."""
    L = math.dist(p0, p1); cx, cy = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
    ang = math.degrees(math.atan2(p1[0] - p0[0], p1[1] - p0[1]))
    return rrect(cx - w / 2, cy - L / 2 - w / 2 + w / 2, w, L, w / 2, col, lw, (-ang, cx, cy))


def arm(shoulder, a1, a2, sleeve, sleeve_d, hand_col, L1=62, L2=56, w=30, hand=34):
    e = seg(shoulder, a1, L1)
    h = seg(e, a2, L2)
    hc = seg(e, a2, L2 + hand * 0.55)
    s = bar(shoulder, seg(shoulder, a1, L1 - 4), w, sleeve)
    s += bar(seg(e, a2, 2), seg(e, a2, L2 - 2), w - 4, sleeve_d)
    s += rrect(hc[0] - hand / 2, hc[1] - hand / 2, hand, hand * 0.92, 11, hand_col, 7, (-a2, hc[0], hc[1]))
    return s, hc


def witch(name, P):
    pal = WITCHES[name]
    d = []; b = ""
    by = P.get("by", 0); lean = P.get("lean", 0)
    hip = (256, 640 + by)
    pivot = (256, 740)
    back, front = "", ""
    # legs (drawn unrotated so feet stay planted)
    feet = P.get("feet", [(-26, 0), (26, 0)])
    legs = ""
    for i, (fx, lift) in enumerate(feet):
        hx = hip[0] + (-20 if i == 0 else 20)
        foot = (256 + fx + (-20 if i == 0 else 20), 722 - lift)
        leg = bar((hx, hip[1] - 10), foot, 30, STOCK if i else "#2e2430")
        boot = rrect(foot[0] - 22, foot[1] - 8, 50, 30, 12, BOOT if i else BOOT_D, 7)
        legs += leg + boot
    b += legs
    body = ""
    # back arm
    sh_b = (206, 492 + by); sh_f = (306, 492 + by)
    a_b, hb = arm(sh_b, P.get("ab", (-12, -8))[0], P.get("ab", (-12, -8))[1], pal["cloak_d"], pal["cloak_d"], SKIN_D)
    body += a_b
    # robe
    sway = P.get("hem", 0)
    robe = (f"M216 {470 + by} L296 {470 + by} Q330 {540 + by} {344 + sway} {650 + by} "
            f"Q{322 + sway} {640 + by} {306 + sway} {662 + by} Q{284 + sway * .6} {646 + by} {262 + sway * .4} {666 + by} "
            f"Q{240 + sway * .4} {646 + by} {218 + sway * .6} {664 + by} Q{198 + sway} {642 + by} {170 + sway} {654 + by} "
            f"Q182 {540 + by} 216 {470 + by} Z")
    body += shaded(d, robe, pal["cloak"], pal["cloak_d"], 12, -4, brush((210, 520 + by), (196, 580 + by), (192, 640 + by), 8, pal["cloak_l"]))
    body += rrect(206, 566 + by, 100, 20, 8, TRK, 6) + rrect(248, 562 + by, 20, 28, 5, pal["trim"], 5)
    # satchel strap + charm
    body += line(f"M296 {480 + by} L228 {566 + by}", 6, TRK_D)
    body += fill(f"M300 {594 + by} L330 {594 + by} L326 {630 + by} L304 {630 + by} Z", WD, 5)
    # capelet
    cape = (f"M196 {476 + by} Q256 {440 + by} 316 {476 + by} L326 {520 + by} Q306 {512 + by} 292 {530 + by} "
            f"Q274 {512 + by} 256 {532 + by} Q238 {512 + by} 220 {530 + by} Q206 {512 + by} 186 {520 + by} Z")
    body += fill(cape, pal["cloak_d"], 7) + brush((212, 474 + by), (240, 462 + by), (270, 460 + by), 5, pal["cloak"])
    # head
    ht = P.get("tilt", 0); hc = (256, 384 + by)
    head = ""
    head += fill(f"M168 {hc[1] - 10} Q160 {hc[1] + 80} 196 {hc[1] + 98} L210 {hc[1] + 40} Z", pal["hair"], 7)  # back hair L
    head += fill(f"M344 {hc[1] - 10} Q352 {hc[1] + 80} 316 {hc[1] + 98} L302 {hc[1] + 40} Z", pal["hair"], 7)
    head += ell(hc[0], hc[1], 100, 92, SKIN)
    head += fill_ns(f"M{hc[0] + 40} {hc[1] + 40} a50 40 0 0 1 -6 44 a100 92 0 0 0 64 -60 Z", SKIN_D, .5)
    eyes = P.get("eyes", "open")
    ex = [hc[0] - 34, hc[0] + 38]; ey = hc[1] + 16
    for x in ex:
        if eyes == "open":
            head += ell(x, ey, 11, 15, O, 0) + f'<circle cx="{x - 3}" cy="{ey - 6}" r="4" fill="#ffffff" stroke="none"/>'
        elif eyes == "focus":
            head += fill(f"M{x - 13} {ey - 4} L{x + 13} {ey + (4 if x < hc[0] else -4) - 6} L{x + 12} {ey + 8} Q{x} {ey + 16} {x - 12} {ey + 8} Z", O, 3)
        elif eyes == "closed":
            head += line(f"M{x - 12} {ey + 2} Q{x} {ey + 12} {x + 12} {ey + 2}", 6)
        elif eyes == "x":
            head += line(f"M{x - 10} {ey - 10} L{x + 10} {ey + 10} M{x + 10} {ey - 10} L{x - 10} {ey + 10}", 6)
    head += ell(hc[0] - 58, hc[1] + 44, 16, 9, "#f0a08a", 0, extra=' opacity=".7"') + ell(hc[0] + 64, hc[1] + 44, 16, 9, "#f0a08a", 0, extra=' opacity=".7"')
    mouth = P.get("mouth", "smile")
    if mouth == "smile":
        head += line(f"M{hc[0] - 6} {hc[1] + 56} Q{hc[0] + 4} {hc[1] + 64} {hc[0] + 14} {hc[1] + 56}", 5)
    elif mouth == "shout":
        head += fill(f"M{hc[0] - 8} {hc[1] + 54} Q{hc[0] + 4} {hc[1] + 50} {hc[0] + 16} {hc[1] + 54} Q{hc[0] + 12} {hc[1] + 76} {hc[0] + 4} {hc[1] + 76} Q{hc[0] - 4} {hc[1] + 76} {hc[0] - 8} {hc[1] + 54} Z", "#6a2833", 4)
    elif mouth == "o":
        head += ell(hc[0] + 4, hc[1] + 62, 7, 9, "#6a2833", 4)
    # bangs
    bangs = (f"M160 {hc[1] - 6} Q170 {hc[1] - 90} 256 {hc[1] - 96} Q342 {hc[1] - 90} 352 {hc[1] - 6} "
             f"Q330 {hc[1] - 30} 318 {hc[1] - 20} Q300 {hc[1] - 44} 280 {hc[1] - 26} Q258 {hc[1] - 50} 236 {hc[1] - 24} "
             f"Q214 {hc[1] - 46} 196 {hc[1] - 20} Q180 {hc[1] - 34} 160 {hc[1] - 6} Z")
    head += fill(bangs, pal["hair"], 7) + brush((200, hc[1] - 60), (240, hc[1] - 80), (290, hc[1] - 78), 6, pal["hair_l"])
    # hat
    hs = P.get("hat", 0)
    hy = hc[1] - 66
    cone = (f"M168 {hy} Q210 {hy - 60} 226 {hy - 150} Q236 {hy - 210} {290 + hs} {hy - 226} "
            f"Q{330 + hs * 1.5} {hy - 220} {352 + hs * 2} {hy - 180} Q{326 + hs * 1.5} {hy - 190} {310 + hs} {hy - 176} "
            f"Q296 {hy - 120} 344 {hy} Z")
    head += shaded(d, cone, pal["hat"], pal["hat_d"], -12, -6, brush((226, hy - 60), (236, hy - 130), (262, hy - 190), 7, "#ffffff", .18))
    head += fill(f"M180 {hy - 14} Q256 {hy - 40} 332 {hy - 14} L338 {hy + 4} Q256 {hy - 20} 174 {hy + 4} Z", pal["band"], 6)
    head += ell(256, hy + 6, 150, 28, pal["hat"])
    head += brush((136, hy + 6), (200, hy - 14), (270, hy - 16), 6, "#ffffff", .15)
    head += sparkle(292, hy - 70, 1.3, pal["band"])
    body += G(head, 0, 0) if not ht else f'<g transform="rotate({ht} 256 {470 + by})">{head}</g>'
    # front arm
    a_f, hf = arm(sh_f, P.get("af", (14, 8))[0], P.get("af", (14, 8))[1], pal["cloak"], pal["cloak_d"], SKIN)
    body += a_f
    fx = P.get("fx", "")
    if fx == "spark":
        body += sparkle(hf[0] + 20, hf[1] - 10, 3.2, pal["charm"]) + sparkle(hf[0] + 20, hf[1] - 10, 1.6, "#ffffff")
        body += brush((hf[0] - 40, hf[1] - 120), (hf[0] + 90, hf[1] - 60), (hf[0] + 40, hf[1] + 60), 16, pal["charm"], .75)
    elif fx == "glow":
        body += sparkle(hf[0] + 10, hf[1], 2.0, pal["charm"], .8)
    elif fx == "pluck":
        body += leaf(hf[0] + 10, hf[1] - 30, 30, 2.2, LEAF_L) + sparkle(hf[0] + 40, hf[1] - 50, 1.0, "#fff8e6")
    elif fx == "dust":
        pass
    if lean:
        body = f'<g transform="rotate({lean} {pivot[0]} {640 + by})">{body}</g>'
    b += body
    if fx == "dash":
        for i, y in enumerate((460, 540, 620)):
            b += brush((60 - i * 10, y), (120, y - 2), (180 - i * 20, y), 10, BONE, .6)
    if fx == "dust":
        b += fill_ns(blob(150, 730, 30, 14, 6, .2, 3), "#c9b89a", .6) + fill_ns(blob(110, 716, 18, 10, 6, .2, 4), "#c9b89a", .4)
    return d, b


def witch_down(name):
    pal = WITCHES[name]
    d = []; b = ""
    # sitting slumped: legs out, hat fallen beside
    for i, x in enumerate((250, 300)):
        b += bar((x - 30, 700), (x + 70, 716), 30, STOCK if i else "#2e2430") + rrect(x + 60, 690, 30, 46, 12, BOOT if i else BOOT_D, 7)
    robe = "M190 560 Q280 540 320 600 L340 716 Q256 730 170 716 Z"
    b += shaded(d, robe, pal["cloak"], pal["cloak_d"], 10, -4)
    b += arm((200, 600), 30, 20, pal["cloak_d"], pal["cloak_d"], SKIN_D, 50, 44)[0]
    hc = (236, 500)
    b += f'<g transform="rotate(-18 {hc[0]} {hc[1]})">'
    b += ell(hc[0], hc[1], 100, 92, SKIN)
    b += fill(f"M136 {hc[1] - 6} Q146 {hc[1] - 90} 236 {hc[1] - 96} Q326 {hc[1] - 90} 336 {hc[1] - 6} Q300 {hc[1] - 40} 236 {hc[1] - 30} Q170 {hc[1] - 40} 136 {hc[1] - 6} Z", pal["hair"], 7)
    for x in (hc[0] - 34, hc[0] + 38):
        b += line(f"M{x - 12} {hc[1] + 18} Q{x} {hc[1] + 28} {x + 12} {hc[1] + 18}", 6)
    b += ell(hc[0] + 4, hc[1] + 62, 6, 7, "#6a2833", 4)
    b += '</g>'
    b += arm((300, 600), 40, 30, pal["cloak"], pal["cloak_d"], SKIN, 50, 44)[0]
    # hat on the ground
    hat = "M340 720 Q380 650 400 600 Q430 560 470 590 Q440 592 430 610 Q450 670 470 720 Z"
    b += fill(hat, pal["hat"], 7) + ell(405, 722, 80, 16, pal["hat"])
    for i in range(3):
        a = i * 2.1
        b += sparkle(236 + 70 * math.cos(a), 380 + 20 * math.sin(a), 1.0, pal["charm"], .8)
    return d, b


def witch_frames(name):
    W = lambda **P: (lambda: witch(name, P))
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
        lambda: witch_down(name),
        W(), W(by=5, hat=4),
    ]


# ------------------------------------------------------------------ enemies
VINE = "#4f3a3a"; VINE_D = "#35262a"; VINE_L = "#7a5a52"; THORN = "#e3d6b4"; EYE = "#f6c35a"

def briarling(P):
    d = []; b = ""
    by = P.get("by", 0); ph = P.get("ph", 0); rear = P.get("rear", 0)
    cx, cy = 256, 610 + by - rear
    # legs: six rooty legs
    legs = []
    for i, side in enumerate([-1, -1, -1, 1, 1, 1]):
        k = i % 3
        base = (cx + side * (40 + k * 26), cy + 30)
        step = math.sin(2 * math.pi * (ph + (k + (0 if side < 0 else 1)) * 0.5)) * 18
        foot = (cx + side * (120 + k * 34) + step, 738 - max(0, -step) * .8)
        legs.append(limb(base, ((base[0] + foot[0]) / 2 + side * 30, cy - 30 - k * 10), foot, 22, 8))
    b += union(legs, VINE_D)
    for i in range(6):
        pass
    body = blob(cx, cy, 130, 96 + rear * .3, 12, 0.08, 7)
    b += shaded(d, body, VINE, VINE_D, -10, -12, brush((cx - 90, cy - 30), (cx - 50, cy - 80), (cx + 10, cy - 90), 9, VINE_L))
    # twisted vine texture
    b += line(f"M{cx - 100} {cy + 10} Q{cx - 40} {cy - 40} {cx + 30} {cy - 10} Q{cx + 80} {cy + 20} {cx + 110} {cy - 20}", 6, VINE_D)
    b += line(f"M{cx - 80} {cy + 50} Q{cx} {cy + 20} {cx + 90} {cy + 50}", 5, VINE_D)
    # thorns
    for i in range(9):
        a = math.pi * (1.05 + i * 0.11)
        x = cx + 126 * math.cos(a); y = cy + 92 * math.sin(a)
        nx, ny = math.cos(a), math.sin(a)
        tip = (x + nx * 46, y + ny * 46)
        b += fill(f"M{f(x - ny * 12)} {f(y + nx * 12)} L{f(tip[0])} {f(tip[1])} L{f(x + ny * 12)} {f(y - nx * 12)} Z", THORN, 5)
    # face
    mo = P.get("mouth", 0)
    b += fill(f"M{cx - 70} {cy - 8} L{cx - 14} {cy + 8} Q{cx - 16} {cy + 36} {cx - 44} {cy + 36} Q{cx - 72} {cy + 30} {cx - 70} {cy - 8} Z", INK_D, 5)
    b += fill(f"M{cx + 76} {cy - 8} L{cx + 20} {cy + 8} Q{cx + 22} {cy + 36} {cx + 50} {cy + 36} Q{cx + 78} {cy + 30} {cx + 76} {cy - 8} Z", INK_D, 5)
    b += f'<circle cx="{cx - 40}" cy="{cy + 18}" r="9" fill="{EYE}" stroke="none"/><circle cx="{cx + 46}" cy="{cy + 18}" r="9" fill="{EYE}" stroke="none"/>'
    b += fill(f"M{cx - 40} {cy + 52} Q{cx} {cy + 44 - mo * .3} {cx + 44} {cy + 52} Q{cx + 30} {cy + 60 + mo} {cx} {cy + 62 + mo} Q{cx - 30} {cy + 60 + mo} {cx - 40} {cy + 52} Z", "#6a2833", 5)
    for i in range(4):
        x = cx - 26 + i * 18
        b += fill(f"M{x} {cy + 50} L{x + 6} {cy + 62} L{x + 12} {cy + 50} Z", THORN, 3)
    b += leaf(cx + 20, cy - 96, 20, 1.6, MAR) + leaf(cx - 50, cy - 90, -30, 1.3, ORG)
    return d, b


SHROUD = "#c9c6da"; SHROUD_D = "#8f8ba8"; SHROUD_L = "#efedf7"

def wraith(P):
    d = []; b = ""
    by = P.get("by", 0); ph = P.get("ph", 0); lunge = P.get("lunge", 0)
    cx = 250 + lunge; top = 300 + by
    w = lambda k: 14 * math.sin(2 * math.pi * (ph + k))
    body = (f"M{cx - 100} {top + 130} Q{cx - 110} {top} {cx} {top - 10} Q{cx + 110} {top} {cx + 104} {top + 130} "
            f"Q{cx + 110} {top + 260} {cx + 130 + w(0)} {top + 380} Q{cx + 90} {top + 350} {cx + 66 + w(.25)} {top + 400} "
            f"Q{cx + 40} {top + 350} {cx + 10 + w(.5)} {top + 420} Q{cx - 20} {top + 350} {cx - 50 + w(.75)} {top + 400} "
            f"Q{cx - 80} {top + 346} {cx - 120 + w(.1)} {top + 380} Q{cx - 100} {top + 260} {cx - 100} {top + 130} Z")
    b += shaded(d, body, SHROUD, SHROUD_D, -14, -10, brush((cx - 70, top + 40), (cx - 50, top + 10), (cx, top + 4), 10, SHROUD_L))
    b += line(f"M{cx - 60} {top + 200} Q{cx - 40} {top + 290} {cx - 60} {top + 360} M{cx + 30} {top + 220} Q{cx + 50} {top + 300} {cx + 40} {top + 380}", 5, SHROUD_D)
    # hood opening
    b += fill(f"M{cx - 70} {top + 150} Q{cx - 76} {top + 40} {cx} {top + 36} Q{cx + 76} {top + 40} {cx + 72} {top + 150} Q{cx} {top + 190} {cx - 70} {top + 150} Z", "#3a3150", 7)
    b += fill(f"M{cx - 50} {top + 90} L{cx - 8} {top + 106} Q{cx - 10} {top + 130} {cx - 30} {top + 130} Q{cx - 52} {top + 124} {cx - 50} {top + 90} Z", CR, 4)
    b += fill(f"M{cx + 52} {top + 90} L{cx + 10} {top + 106} Q{cx + 12} {top + 130} {cx + 32} {top + 130} Q{cx + 54} {top + 124} {cx + 52} {top + 90} Z", CR, 4)
    if P.get("mouth"):
        b += ell(cx, top + 160, 18, 12 + P["mouth"], INK_D, 4)
    # arm + lantern
    ly = top + 230 + P.get("lift", 0)
    lx = cx + 150 + lunge * .4
    b += limb_arm(cx + 80, top + 170, lx, ly - 50)
    b += line(f"M{lx} {ly - 50} L{lx} {ly - 20}", 5)
    b += fill(f"M{lx - 30} {ly - 16} Q{lx} {ly - 46} {lx + 30} {ly - 16} Z", DT, 6)
    b += fill(f"M{lx - 26} {ly - 16} L{lx + 26} {ly - 16} L{lx + 22} {ly + 56} L{lx - 22} {ly + 56} Z", "#c9f2e8", 6)
    fl = 1 + .12 * math.sin(ph * 2 * math.pi)
    b += fill(f"M{lx} {f(ly + 48 - 52 * fl)} Q{lx + 18} {ly + 28} {lx + 10} {ly + 42} Q{lx} {ly + 54} {lx - 10} {ly + 42} Q{lx - 18} {ly + 28} {lx} {f(ly + 48 - 52 * fl)} Z", CR, 4)
    b += rrect(lx - 30, ly + 52, 60, 14, 5, DT, 6)
    b += fill_ns(f"M{lx} {ly + 20} m-80 0 a80 80 0 1 0 160 0 a80 80 0 1 0 -160 0", CR, .14)
    return d, b


def limb_arm(x0, y0, x1, y1):
    mid = ((x0 + x1) / 2 + 10, (y0 + y1) / 2 + 30)
    a = limb((x0, y0), mid, (x1, y1), 34, 18)
    return union([a], SHROUD, 16) + fill(f"M{x1 - 14} {y1 - 6} Q{x1} {y1 - 20} {x1 + 14} {y1 - 6} Q{x1 + 10} {y1 + 12} {x1} {y1 + 10} Q{x1 - 10} {y1 + 12} {x1 - 14} {y1 - 6} Z", SHROUD_L, 5)


COAT = "#4a3e52"; COAT_D = "#332a3a"; COAT_L = "#6d5d78"; SACK = "#c2a57a"; SACK_D = "#94774e"

def gravekeeper(P):
    d = []; b = ""
    by = P.get("by", 0); ph = P.get("ph", 0); sh = P.get("shovel", 0); lean = P.get("lean", 0)
    step = math.sin(2 * math.pi * ph) * 22
    for i, s in enumerate((-1, 1)):
        fx = 256 + s * 60 + (step if i else -step)
        b += bar((256 + s * 50, 600 + by), (fx, 716 - max(0, (step if i else -step)) * .6), 52, COAT_D) + rrect(fx - 40, 700 - max(0, (step if i else -step)) * .6, 84, 40, 14, BOOT_D, 7)
    body = ""
    torso = f"M126 {646 + by} Q84 {430 + by} 190 {352 + by} Q256 {326 + by} 336 {348 + by} Q436 {420 + by} 392 {646 + by} Q256 {680 + by} 126 {646 + by} Z"
    body += shaded(d, torso, COAT, COAT_D, 14, -8, brush((180, 420 + by), (170, 500 + by), (178, 600 + by), 10, COAT_L))
    body += line(f"M256 {380 + by} L256 {650 + by}", 6, COAT_D)
    for y in (430, 500, 570):
        body += f'<circle cx="270" cy="{y + by}" r="8" fill="{GOLD}" stroke-width="{sw(4)}"/>'
    body += rrect(160, 560 + by, 206, 28, 8, TRK, 7) + rrect(240, 556 + by, 36, 36, 6, IRON, 6)
    # head: stitched sack
    hy = 300 + by
    head = blob(256, hy, 96, 88, 10, 0.06, 3)
    body += shaded(d, head, SACK, SACK_D, -10, -8, brush((200, hy - 40), (230, hy - 66), (270, hy - 70), 7, "#e6cf9e"))
    body += line(f"M190 {hy - 60} L204 {hy - 40} M300 {hy - 70} L312 {hy - 48}", 5, SACK_D)
    body += fill(f"M196 {hy - 6} L240 {hy + 6} Q236 {hy + 34} 214 {hy + 32} Q194 {hy + 26} 196 {hy - 6} Z", INK_D, 5)
    body += fill(f"M318 {hy - 6} L274 {hy + 6} Q278 {hy + 34} 300 {hy + 32} Q320 {hy + 26} 318 {hy - 6} Z", INK_D, 5)
    body += f'<circle cx="220" cy="{hy + 18}" r="8" fill="{EYE}" stroke="none"/><circle cx="296" cy="{hy + 18}" r="8" fill="{EYE}" stroke="none"/>'
    body += line(f"M206 {hy + 52} L306 {hy + 52} M220 {hy + 44} L220 {hy + 60} M240 {hy + 44} L240 {hy + 60} M260 {hy + 44} L260 {hy + 60} M280 {hy + 44} L280 {hy + 60} M298 {hy + 44} L298 {hy + 60}", 5)
    # hat
    body += fill(f"M180 {hy - 50} L196 {hy - 150} L316 {hy - 150} L332 {hy - 50} Z", COAT_D, 7) + ell(256, hy - 50, 120, 24, COAT_D) + rrect(194, hy - 96, 124, 18, 5, MAR, 5)
    # arms + shovel
    sx = 392; shy = 470 + by
    ang = -20 + sh
    tool = G(rrect(-10, -280, 20, 400, 8, WD, 7) + brush((-2, -260), (2, -80), (-2, 100), 5, WD_L)
             + fill("M-50 120 L50 120 Q54 200 0 240 Q-54 200 -50 120 Z", MT, 8) + brush((-30, 140), (-30, 180), (-10, 214), 6, MT_L)
             + rrect(-36, -300, 72, 20, 8, WD_D, 6), sx, shy, ang, 0.8)
    body += tool
    body += bar((340, 400 + by), (sx - 10, shy + 20), 52, COAT) + rrect(sx - 30, shy - 4, 60, 56, 18, "#b8a08a", 7)
    body += bar((170, 400 + by), (150, 560 + by), 52, COAT_D) + rrect(124, 548 + by, 56, 52, 18, "#9a8470", 7)
    if lean:
        body = f'<g transform="rotate({lean} 256 700)">{body}</g>'
    b += body
    return d, b


KROBE = "#5b4a8a"; KROBE_D = "#3e2f66"; KROBE_L = "#8a74c0"

def hollow_king(P):
    d = []; b = ""
    by = P.get("by", 0); ph = P.get("ph", 0); raise_ = P.get("raise", 0); lean = P.get("lean", 0)
    w = lambda k: 12 * math.sin(2 * math.pi * (ph + k))
    cape = (f"M130 {330 + by} Q60 {520 + by} {40 + w(0)} {730} Q110 {700} {150 + w(.3)} {740} Q200 {700} {256} {740} "
            f"Q312 {700} {362 + w(.6)} {740} Q402 {700} {472 + w(.9)} {730} Q452 {520 + by} 382 {330 + by} Z")
    b += shaded(d, cape, MAR, MAR_D, 12, -8, brush((120, 420 + by), (90, 540 + by), (80, 680), 10, MAR_L))
    robe = f"M170 {360 + by} Q256 {330 + by} 342 {360 + by} L372 {720} Q256 {742} 140 {720} Z"
    b += shaded(d, robe, KROBE, KROBE_D, 12, -6, brush((180, 420 + by), (170, 560 + by), (168, 690), 8, KROBE_L))
    b += fill(f"M226 {380 + by} L286 {380 + by} L300 {720} L212 {720} Z", GOLD, 7) + brush((236, 400 + by), (232, 560 + by), (230, 700), 6, GOLD_L)
    for y in (450, 540, 630):
        b += gem(256, y + by * (1 - (y - 360) / 380), 12, RD, RD_D, "#ffd1c8")
    # bony arms
    b += bar((170, 400 + by), (130, 560 + by), 40, KROBE_D) + fill(blob(126, 590 + by, 26, 30, 7, .1, 3), BONE, 7)
    for i in range(3):
        b += line(f"M{112 + i * 12} {606 + by} L{108 + i * 14} {636 + by}", 8) + line(f"M{112 + i * 12} {606 + by} L{108 + i * 14} {636 + by}", 3, BONE)
    # scepter-scythe
    sx, sy = 400, 520 + by - raise_ * 1.4
    ang = -10 - raise_ * .6 + P.get("swing", 0)
    staff = (rrect(-11, -300, 22, 520, 8, DT, 7) + brush((-3, -280), (0, -40), (-3, 200), 5, DT_L)
             + fill("M0 -300 Q40 -380 160 -370 Q60 -350 20 -270 Z", MT, 8) + brush((30, -340), (80, -360), (140, -364), 6, MT_L)
             + crystal_small(0, -320))
    b += G(staff, sx, sy, ang)
    b += bar((342, 400 + by), (sx - 6, sy + 10), 40, KROBE) + fill(blob(sx, sy + 20, 28, 30, 7, .1, 5), BONE, 7)
    # head: jack-o-lantern
    hy = 250 + by
    from nodes import pumpkin_body
    b += pumpkin_body(d, 256, hy, 0.66)
    glow = FL_M
    b += fill(f"M196 {hy - 16} L240 {hy} L216 {hy + 22} Z", glow, 5) + fill(f"M316 {hy - 16} L272 {hy} L296 {hy + 22} Z", glow, 5)
    m = P.get("mouth", 0)
    b += fill(f"M192 {hy + 36} L214 {hy + 48} L230 {hy + 34} L256 {hy + 50} L282 {hy + 34} L298 {hy + 48} L320 {hy + 36} Q300 {hy + 84 + m} 256 {hy + 88 + m} Q212 {hy + 84 + m} 192 {hy + 36} Z", glow, 5)
    # crown
    cy = hy - 70
    crown = f"M186 {cy + 10} L176 {cy - 60} L214 {cy - 20} L236 {cy - 84} L256 {cy - 30} L276 {cy - 84} L298 {cy - 20} L336 {cy - 60} L326 {cy + 10} Q256 {cy + 24} 186 {cy + 10} Z"
    b += shaded(d, crown, GOLD, GOLD_D, 8, -4, brush((196, cy - 10), (230, cy - 20), (270, cy - 22), 6, GOLD_L))
    b += gem(256, cy - 6, 11, CR, CR_D, CR_L)
    if lean:
        b = f'<g transform="rotate({lean} 256 730)">{b}</g>'
    return d, b


def crystal_small(x, y):
    return fill(f"M{x} {y - 40} L{x + 18} {y} L{x} {y + 34} L{x - 18} {y} Z", CR, 6) + fill_ns(f"M{x} {y - 40} L{x + 18} {y} L{x} {y + 34} Z", CR_D) + fill(f"M{x} {y - 40} L{x + 18} {y} L{x} {y + 34} L{x - 18} {y} Z", "none", 6)


def enemy_frames(fn, walk, attack, idle):
    mk = lambda P: (lambda: fn(P))
    return [mk(p) for p in walk] + [mk(p) for p in attack] + [mk(idle)]


BRIAR = enemy_frames(briarling,
    [dict(ph=0, by=0), dict(ph=.25, by=-8), dict(ph=.5, by=0), dict(ph=.75, by=-8)],
    [dict(ph=0, rear=30, by=-6, mouth=6), dict(ph=.1, rear=60, by=-20, mouth=20), dict(ph=.2, rear=10, by=6, mouth=4)],
    dict(ph=0))
WRAITH = enemy_frames(wraith,
    [dict(ph=0, by=0), dict(ph=.25, by=-12), dict(ph=.5, by=-18), dict(ph=.75, by=-8)],
    [dict(ph=0, by=-20, lift=-60, mouth=4), dict(ph=.3, by=-4, lunge=40, lift=20, mouth=14), dict(ph=.6, by=-10, lunge=12, mouth=6)],
    dict(ph=0))
BRUTE = enemy_frames(gravekeeper,
    [dict(ph=0, by=0), dict(ph=.25, by=-10), dict(ph=.5, by=0), dict(ph=.75, by=-10)],
    [dict(ph=0, shovel=-60, lean=-8, by=-6), dict(ph=0, shovel=45, lean=10, by=8), dict(ph=0, shovel=15, lean=4)],
    dict(ph=0))
KING = enemy_frames(hollow_king,
    [dict(ph=0, by=0), dict(ph=.25, by=-8), dict(ph=.5, by=0), dict(ph=.75, by=-8)],
    [dict(ph=.1, by=-6, **{"raise": 40}, mouth=6, lean=-4), dict(ph=.4, swing=38, by=6, mouth=18, lean=6), dict(ph=.7, swing=16, mouth=6, lean=2)],
    dict(ph=0))

SPRITES = {name: {"frames": witch_frames(name), "cols": 8, "rows": 2, "target": name} for name in WITCHES}
SPRITES.update({
    "crawler": {"frames": BRIAR, "cols": 4, "rows": 2, "target": "crawler"},
    "wraith": {"frames": WRAITH, "cols": 4, "rows": 2, "target": (60, 180, 470, 740)},
    "brute": {"frames": BRUTE, "cols": 4, "rows": 2, "target": "brute"},
    "king": {"frames": KING, "cols": 4, "rows": 2, "target": "king"},
})
