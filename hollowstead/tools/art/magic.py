"""Gravecraft magic: the five held weapons, the allied skeleton atlas and the
per-pack source strips. All written as RGBA PNG (the magic tests require it)."""
import math, os
from lib import *
import lib
from structures import IRON, IRON_D, IRON_L

SK_O = "#2b2320"; SK_B = "#efe6cf"; SK_S = "#e2d6b6"; SK_SS = "#d4c6a3"; SK_E = "#3a3330"
SK_CLOTH = "#4a6b6a"; SK_BELT = "#8a5a3c"; SK_BUCK = "#c9a14a"


def sk_bar(p0, p1, w, col, lw=7):
    L = math.dist(p0, p1); cx, cy = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
    ang = math.degrees(math.atan2(p1[0] - p0[0], p1[1] - p0[1]))
    return rrect(cx - w / 2, cy - L / 2, w, L, w / 2, col, lw, (-ang, cx, cy))


def seg(start, ang, L):
    a = math.radians(ang)
    return (start[0] + math.sin(a) * L, start[1] + math.cos(a) * L)


def sk_arm(sh, a1, a2, hand_rot=0):
    e = seg(sh, a1, 38)
    s = sk_bar(seg(sh, a1, 3), seg(sh, a1, 35), 18, SK_B)
    f0 = seg(e, a2, 3); f1 = seg(e, a2, 31)
    s += sk_bar(f0, f1, 18, SK_B)
    hc = seg(e, a2, 47)
    s += rrect(hc[0] - 13, hc[1] - 12, 26, 24, 9, SK_B, 7, (-a2 + hand_rot, hc[0], hc[1]))
    return s, hc


def skeleton(P):
    """The approved chibi skeleton, posable. Coordinates match the original 512px drawing."""
    d = []; b = ""
    by = P.get("by", 0); lean = P.get("lean", 0); tilt = P.get("tilt", 0)
    feet = P.get("feet", [(0, 0), (0, 0)])
    for i, (hx, fx0) in enumerate([(238, 232), (276, 282)]):
        fx, lift = feet[i]
        foot = (fx0 + fx, 452 - lift)
        b += line(f"M{hx} {398 + by} L{f(foot[0])} {f(foot[1])}", 30) + line(f"M{hx} {398 + by} L{f(foot[0])} {f(foot[1])}", 16, SK_B)
        b += rrect(foot[0] - 23 + (-8 if i == 0 else 8), foot[1] - 6, 46, 22, 7, SK_B, 7)
    body = ""
    al, hl = sk_arm((212, 330 + by), *P.get("al", (-20, -15)))
    ar, hr = sk_arm((300, 330 + by), *P.get("ar", (20, 15)))
    body += al + ar if not P.get("front_r") else al
    body += rrect(246, 292 + by, 20, 110, 8, SK_S, 7)
    body += fill(f"M220 {322 + by} Q256 {306 + by} 292 {322 + by} L296 {360 + by} Q256 {382 + by} 216 {360 + by} Z", SK_B, 7)
    body += line(f"M230 {336 + by} Q243 {332 + by} 250 {336 + by} M262 {336 + by} Q269 {332 + by} 282 {336 + by}", 6, SK_E)
    body += line(f"M230 {352 + by} Q243 {348 + by} 250 {352 + by} M262 {352 + by} Q269 {348 + by} 282 {352 + by}", 6, SK_E)
    body += line(f"M256 {318 + by} L256 {368 + by}", 6, SK_SS)
    body += fill(f"M222 {380 + by} L290 {380 + by} L294 {404 + by} L280 {398 + by} L270 {414 + by} L258 {400 + by} L246 {416 + by} L236 {400 + by} L218 {406 + by} Z", SK_CLOTH, 7)
    body += rrect(220, 376 + by, 72, 12, 5, SK_BELT, 6) + rrect(249, 377 + by, 14, 10, 2, SK_BUCK, 4)
    # head
    h = ""
    h += f'<ellipse cx="256" cy="180" rx="118" ry="106" fill="{SK_O}" stroke-width="{sw(16)}"/>'
    h += f'<rect x="198" y="236" width="116" height="64" rx="20" fill="{SK_O}" stroke-width="{sw(16)}"/>'
    h += f'<ellipse cx="256" cy="180" rx="118" ry="106" fill="{SK_B}" stroke="none"/><rect x="198" y="236" width="116" height="64" rx="20" fill="{SK_B}" stroke="none"/>'
    h += fill("M172 170 L244 194 Q248 238 208 240 Q168 238 170 198 Z", SK_E, 7) + fill("M340 170 L268 194 Q264 238 304 240 Q344 238 342 198 Z", SK_E, 7)
    h += fill_ns("M256 234 L246 252 Q256 256 266 252 Z", SK_E)
    jaw = P.get("jaw", 0)
    h += f'<g transform="translate(0 {jaw})">' + line("M226 270 L226 294 M244 272 L244 298 M262 272 L262 298 M280 270 L280 296", 5) + '</g>'
    h += line("M268 76 L276 98 L264 112 L272 128", 5) + line("M356 142 L340 152 L346 166 L332 176", 5) + line("M148 196 L162 202 L156 216", 5) + line("M214 84 L222 100 L212 108", 4)
    body += f'<g transform="translate(0 {by}) rotate({tilt} 256 300)">{h}</g>'
    if P.get("front_r"):
        body += ar
    fx = P.get("fx")
    if fx == "slash":
        body += brush((hr[0] - 30, hr[1] - 110), (hr[0] + 110, hr[1] - 40), (hr[0] + 40, hr[1] + 90), 22, SK_B, .85)
        body += brush((hr[0] - 10, hr[1] - 80), (hr[0] + 80, hr[1] - 30), (hr[0] + 40, hr[1] + 60), 8, "#ffffff", .9)
    if lean:
        body = f'<g transform="rotate({lean} 256 452)">{body}</g>'
    b += body
    return d, f'<g stroke="{SK_O}">{b}</g>'


SK_IDLE = [dict(), dict(by=2), dict(by=4, tilt=2), dict(by=2, tilt=1)]
SK_WALK = [dict(feet=[(-14, 0), (14, 0)], al=(-6, -2), ar=(34, 30), by=0, tilt=-2),
           dict(feet=[(0, 0), (0, 16)], al=(-18, -12), ar=(20, 16), by=-6),
           dict(feet=[(14, 0), (-14, 0)], al=(-34, -30), ar=(6, 2), by=0, tilt=2),
           dict(feet=[(0, 16), (0, 0)], al=(-20, -16), ar=(18, 12), by=-6)]
SK_ATTACK = [dict(ar=(150, 165), al=(-30, -30), lean=-6, jaw=4),
             dict(ar=(100, 110), al=(-40, -50), lean=10, jaw=8, fx="slash", front_r=True, feet=[(-12, 0), (16, 0)]),
             dict(ar=(60, 50), al=(-30, -30), lean=6, jaw=4, front_r=True),
             dict(ar=(30, 24), al=(-22, -18), lean=2)]


def sk_frames(lst):
    return [(lambda p: (lambda: skeleton(p)))(p) for p in lst]


# ------------------------------------------------------------------ weapons
BRONZE = "#b98d54"; BRONZE_D = "#8a6234"; BRONZE_L = "#e8c48a"

def ghostfire(cx, base, w, h):
    o = f"M{cx} {base - h} Q{cx + w * .7} {base - h * .45} {cx + w * .5} {base - h * .1} Q{cx + w * .3} {base + 6} {cx} {base} Q{cx - w * .3} {base + 6} {cx - w * .5} {base - h * .1} Q{cx - w * .7} {base - h * .45} {cx - w * .2} {base - h * .6} Q{cx - w * .1} {base - h * .4} {cx} {base - h} Z"
    i = f"M{cx} {base - h * .55} Q{cx + w * .3} {base - h * .25} {cx + w * .2} {base - h * .05} Q{cx} {base + 2} {cx - w * .2} {base - h * .05} Q{cx - w * .3} {base - h * .25} {cx} {base - h * .55} Z"
    return fill(o, CR, 7) + fill(i, CR_L, 4)


def cinder_staff():
    d = []; b = ""
    shaft = limb((256, 1000), (270, 760), (256, 430), 30, 24)
    hook = limb((256, 430), (286, 280), (170, 300), 24, 16)
    curl = limb((170, 300), (132, 340), (172, 356), 16, 10)
    b += union([shaft, hook, curl], DT)
    b += brush((264, 960), (276, 760), (262, 460), 7, DT_L) + brush((266, 400), (280, 320), (210, 300), 6, DT_L)
    b += rrect(238, 760, 36, 110, 8, MAR, 6) + wraps(239, 273, 760, 870, 6, MAR_D)
    for y in (440, 740, 880):
        b += rrect(236, y, 40, 18, 6, BRONZE, 6)
    b += ghostfire(206, 424, 118, 170)
    b += sparkle(150, 260, 1.4, CR_L) + sparkle(300, 250, 1.0, CR_L)
    b += line("M256 470 L230 520", 4) + f'<circle cx="228" cy="530" r="11" fill="{BONE}" stroke-width="{sw(5)}"/>'
    return d, b


def barrow_rattle():
    d = []; b = ""
    handle = limb((256, 1000), (262, 820), (256, 640), 34, 28)
    b += union([handle], DT) + brush((264, 980), (270, 820), (262, 660), 7, DT_L)
    b += rrect(234, 800, 44, 120, 8, MAR, 6) + wraps(235, 277, 800, 920, 6, MAR_D)
    b += rrect(226, 626, 60, 30, 8, BRONZE, 7)
    # ribbons
    b += fill("M232 660 Q190 720 204 790 Q214 766 226 772 Q214 720 244 676 Z", MAR, 5) + fill("M280 660 Q322 710 316 780 Q304 760 294 766 Q302 716 270 676 Z", MAR_D, 5)
    # skull
    b += rrect(210, 540, 92, 70, 20, BONE, 8)
    b += ell(256, 470, 108, 100, BONE, 9) + rrect(214, 548, 84, 50, 18, BONE, 0, extra=' stroke="none"')
    b += fill("M176 450 L240 470 Q242 512 206 514 Q170 512 172 476 Z", CR_D, 6) + fill("M336 450 L272 470 Q270 512 306 514 Q342 512 340 476 Z", CR_D, 6)
    b += f'<circle cx="208" cy="488" r="9" fill="{CR_L}" stroke="none"/><circle cx="304" cy="488" r="9" fill="{CR_L}" stroke="none"/>'
    b += fill_ns("M256 520 L246 538 Q256 542 266 538 Z", O)
    b += line("M230 566 L230 594 M248 568 L248 598 M266 568 L266 598 M284 566 L284 594", 5)
    b += line("M270 380 L278 400 L266 414 L274 430", 5)
    b += brush((180, 420), (200, 390), (236, 376), 8, "#ffffff", .7)
    # bone beads
    for (x, y) in [(150, 560), (362, 560)]:
        b += line(f"M{x} {y - 60} L{x} {y}", 4) + f'<circle cx="{x}" cy="{y + 12}" r="16" fill="{BONE}" stroke-width="{sw(6)}"/>'
    return d, b


SILK = "#d2bbdf"

def widows_needle():
    d = []; b = ""
    needle = "M256 60 L276 300 L272 860 Q256 1000 240 860 L236 300 Z"
    b += shaded(d, needle, BONE, BONE_D, 6, 0, brush((250, 120), (248, 500), (250, 840), 5, "#ffffff", .8))
    b += fill("M256 250 m-14 0 a14 34 0 1 0 28 0 a14 34 0 1 0 -28 0", O, 3)
    b += rrect(230, 560, 52, 150, 8, MAR, 6) + wraps(231, 281, 560, 710, 7, MAR_D)
    b += rrect(226, 540, 60, 24, 6, BRONZE, 6) + rrect(226, 708, 60, 24, 6, BRONZE, 6)
    b += gem(256, 470, 18, CR, CR_D, CR_L)
    b += f'<path d="M256 236 Q340 260 320 360 Q300 460 360 520 Q400 560 380 640" fill="none" stroke="{SILK}" stroke-width="{sw(6)}"/>'
    b += sparkle(360, 520, 1.2, SILK) + sparkle(330, 330, .8, "#ffffff")
    return d, b


def spirit_fan():
    d = []; b = ""
    piv = (256, 900)
    n = 7
    ribs = []
    for i in range(n):
        a = math.radians(-60 + 120 * i / (n - 1))
        ribs.append((piv[0] + math.sin(a) * 620, piv[1] - math.cos(a) * 620))
    leaf_pts = []
    for i in range(n):
        a = math.radians(-60 + 120 * i / (n - 1))
        leaf_pts.append((piv[0] + math.sin(a) * 600, piv[1] - math.cos(a) * 600))
    arcpath = f"M{f(piv[0] + math.sin(math.radians(-60)) * 200)} {f(piv[1] - math.cos(math.radians(-60)) * 200)} "
    for i in range(n - 1):
        a0 = math.radians(-60 + 120 * i / (n - 1)); a1 = math.radians(-60 + 120 * (i + 1) / (n - 1)); am = (a0 + a1) / 2
        p1 = (piv[0] + math.sin(a1) * 600, piv[1] - math.cos(a1) * 600)
        pm = (piv[0] + math.sin(am) * 560, piv[1] - math.cos(am) * 560)
        seg_d = (f"M{f(piv[0] + math.sin(a0) * 200)} {f(piv[1] - math.cos(a0) * 200)} L{f(piv[0] + math.sin(a0) * 600)} {f(piv[1] - math.cos(a0) * 600)} "
                 f"Q{f(pm[0])} {f(pm[1])} {f(p1[0])} {f(p1[1])} L{f(piv[0] + math.sin(a1) * 200)} {f(piv[1] - math.cos(a1) * 200)} Z")
        b += fill(seg_d, MAR if i % 2 else "#a8454a", 6)
        gx, gy = piv[0] + math.sin(am) * 430, piv[1] - math.cos(am) * 430
        b += f'<g transform="translate({f(gx)} {f(gy)}) rotate({f(math.degrees(am))})">' + fill("M0 -34 Q22 -30 22 0 L22 30 L12 22 L4 32 L-6 22 L-14 32 L-22 22 L-22 0 Q-22 -30 0 -34 Z", "#e7a3a8", 0) + ell(-8, -8, 4, 6, MAR_D, 0) + ell(8, -8, 4, 6, MAR_D, 0) + '</g>'
    for i in range(n):
        a = math.radians(-60 + 120 * i / (n - 1))
        tip = (piv[0] + math.sin(a) * 610, piv[1] - math.cos(a) * 610)
        b += line(f"M{piv[0]} {piv[1]} L{f(tip[0])} {f(tip[1])}", 18) + line(f"M{piv[0]} {piv[1]} L{f(tip[0])} {f(tip[1])}", 8, BONE)
        b += ghostfire(tip[0], tip[1] + 10, 44, 64)
    b += f'<circle cx="{piv[0]}" cy="{piv[1]}" r="34" fill="{BRONZE}" stroke-width="{sw(8)}"/>' + fill_ns(f"M{piv[0]} {piv[1] - 12} l-10 18 l20 0 Z", O)
    b += limb_handle(piv)
    return d, b


def limb_handle(piv):
    h = limb((piv[0], piv[1] + 20), (piv[0] + 6, piv[1] + 100), (piv[0], piv[1] + 170), 30, 26)
    return union([h], DT) + fill(f"M{piv[0] - 10} {piv[1] + 60} Q{piv[0] - 60} {piv[1] + 120} {piv[0] - 40} {piv[1] + 200} Q{piv[0] - 30} {piv[1] + 170} {piv[0] - 20} {piv[1] + 176} Q{piv[0] - 34} {piv[1] + 120} {piv[0] + 4} {piv[1] + 70} Z", MAR, 5)


def mourning_bell():
    d = []; b = ""
    b += union([limb((256, 520), (262, 380), (256, 230), 34, 28)], DT) + brush((264, 500), (270, 380), (262, 250), 6, DT_L)
    b += rrect(234, 300, 44, 110, 8, MAR, 6) + wraps(235, 277, 300, 410, 6, MAR_D)
    b += fill("M232 420 Q170 470 190 540 Q200 510 214 514 Q208 470 246 430 Z", MAR, 5)
    # skull knob
    b += ell(256, 190, 50, 46, BONE, 8) + fill("M226 186 L250 194 Q250 214 234 214 Q220 212 222 196 Z", O, 3) + fill("M286 186 L262 194 Q262 214 278 214 Q292 212 290 196 Z", O, 3)
    bell = "M256 520 Q150 524 150 680 Q150 820 96 900 L416 900 Q362 820 362 680 Q362 524 256 520 Z"
    b += shaded(d, bell, BRONZE, BRONZE_D, 16, -8, brush((180, 600), (170, 720), (140, 860), 12, BRONZE_L))
    b += fill("M80 890 L432 890 Q440 930 424 940 L88 940 Q72 930 80 890 Z", BRONZE_D, 8)
    b += rrect(222, 510, 68, 26, 8, BRONZE_D, 7)
    for (x, y, s) in [(210, 740, 1), (300, 700, -1)]:
        b += fill(f"M{x} {y - 40} A40 40 0 1 {0 if s > 0 else 1} {x} {y + 40} A30 30 0 1 {1 if s > 0 else 0} {x} {y - 40} Z", CR, 5)
    b += fill(f"M246 940 L266 940 L262 990 L250 990 Z", DT, 5) + f'<circle cx="256" cy="1000" r="20" fill="{BONE}" stroke-width="{sw(6)}"/>'
    b += line("M130 820 L380 820", 5, BRONZE_D)
    return d, b


WEAPONS = {
    "cinder-staff": (cinder_staff, (187, 4, 326, 508)),
    "barrow-rattle": (barrow_rattle, (147, 9, 367, 502)),
    "widows-needle": (widows_needle, (215, 4, 333, 508)),
    "spirit-fan": (spirit_fan, (10, 8, 503, 493)),
    "mourning-bell": (mourning_bell, (127, 11, 387, 495)),
}


# ------------------------------------------------------------------ pack strips (source history)
def fx_frame(kind, t):
    def fn():
        d = []; b = ""
        if kind == "orb":   # cinder projectile
            b += ghostfire(256, 300, 160 * (1 + .1 * math.sin(t * 6.28)), 200)
            for i in range(3):
                b += f'<circle cx="{f(120 - i * 40)}" cy="{f(240 + 20 * math.sin(t * 6.28 + i))}" r="{f(14 - i * 3)}" fill="{CR}" stroke="none" opacity="{.8 - i * .2:.2f}"/>'
        elif kind == "burst":
            r = 60 + 150 * t
            for i in range(8):
                a = i * math.pi / 4 + t
                b += sparkle(256 + math.cos(a) * r, 256 + math.sin(a) * r * .6, 2.4 * (1 - t) + .4, CR_L if i % 2 else CR, 1 - t * .7)
            b += f'<ellipse cx="256" cy="256" rx="{f(r)}" ry="{f(r * .6)}" fill="none" stroke="{CR}" stroke-width="{sw(12 * (1 - t) + 2)}" opacity="{1 - t * .6:.2f}"/>'
        elif kind == "glow":  # cast pose glow
            b += sparkle(256, 300, 4 + 2 * math.sin(t * 6.28), CR) + sparkle(256, 300, 2, "#ffffff")
            for i in range(4):
                a = t * 6.28 + i * 1.57
                b += sparkle(256 + 120 * math.cos(a), 300 + 60 * math.sin(a), 1.2, CR_L)
        elif kind == "dart":
            b += G(widows_needle()[1], 256, 380, 90 + 8 * math.sin(t * 6.28), .5)
            b += f'<path d="M60 380 Q160 {f(340 + 40 * math.sin(t * 6.28))} 240 380" fill="none" stroke="{SILK}" stroke-width="{sw(6)}"/>'
        elif kind == "pin":
            b += G(widows_needle()[1], 256, 660, 0, .55)
            for i in range(3):
                y = 700 - (t + i / 3) % 1 * 300
                b += f'<ellipse cx="256" cy="{f(y)}" rx="120" ry="24" fill="none" stroke="{SILK}" stroke-width="{sw(6)}" opacity=".8"/>'
        elif kind == "shake":
            b += G(barrow_rattle()[1], 256, 740, math.sin(t * 6.28) * 18, .7)
        elif kind == "gust":
            k = t
            for i in range(3):
                y = 700 - i * 180 - k * 60
                b += brush((60, y + 60), (256, y - 60 - k * 40), (452, y + 60), 26 - i * 6, CR, .75 - i * .15)
                b += sparkle(120 + i * 120, y - 20, 1.4, CR_L)
            b += leaf(300, 400 - k * 100, k * 90, 2.4, ORG)
        return d, b
    return fn


def write_png(svg, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im = render_png(svg)
    im.save(path)
    return im


def build_magic(root, only=None):
    out = {}
    mdir = os.path.join(root, "assets", "magic")
    for key, (fn, tgt) in WEAPONS.items():
        svg = build_sheet([fn], 1, 1, tgt, cell=(512, 512), out_scale=1.0)
        out[key] = write_png(svg, os.path.join(mdir, "gravecraft", f"{key}.png"))
        # small 128x192 item cards in the pack folders
        if key != "mourning-bell":
            svg = build_sheet([fn], 1, 1, (16, 24, 496, 740), out_scale=.25)
            write_png(svg, os.path.join(mdir, key, "item.png"))
    # allied skeleton atlas: 4 x 3, cells 360 x 430 (the 1.8 x 2.15 world size)
    frames = sk_frames(SK_IDLE + SK_WALK + SK_ATTACK)
    svg = build_sheet(frames, 4, 3, (46, 30, 466, 597), cell=(512, 612), out_scale=360 / 512)
    out["skeleton"] = write_png(svg, os.path.join(mdir, "gravecraft", "skeleton.png"))
    # barrow-rattle source strips + cells (128 x 192)
    for anim, lst in (("idle", SK_IDLE), ("walk", SK_WALK), ("attack", SK_ATTACK)):
        svg = build_sheet(sk_frames(lst), 4, 1, (70, 110, 442, 740), out_scale=.25)
        im = write_png(svg, os.path.join(mdir, "barrow-rattle", f"skeleton-{anim}.png"))
        for i in range(4):
            im.crop((i * 128, 0, i * 128 + 128, 192)).save(os.path.join(mdir, "barrow-rattle", f"skeleton-{anim}-{i}.png"))
    svg = build_sheet([fx_frame("shake", i / 4) for i in range(4)], 4, 1, (60, 60, 452, 740), out_scale=.25)
    im = write_png(svg, os.path.join(mdir, "barrow-rattle", "use.png"))
    for i in range(4):
        im.crop((i * 128, 0, i * 128 + 128, 192)).save(os.path.join(mdir, "barrow-rattle", f"use-{i}.png"))
    # cinder staff
    write_png(build_sheet([fx_frame("glow", i / 4) for i in range(4)], 4, 1, (60, 120, 452, 700), out_scale=.25), os.path.join(mdir, "cinder-staff", "cast.png"))
    write_png(build_sheet([fx_frame("orb", i / 4) for i in range(4)], 4, 1, (40, 40, 472, 472), cell=(512, 512), out_scale=.25, align="center"), os.path.join(mdir, "cinder-staff", "projectile.png"))
    write_png(build_sheet([fx_frame("burst", i / 4) for i in range(4)], 4, 1, (20, 20, 492, 492), cell=(512, 512), out_scale=.25, align="center"), os.path.join(mdir, "cinder-staff", "impact.png"))
    # widow's needle
    write_png(build_sheet([fx_frame("glow", i / 4) for i in range(4)], 4, 1, (60, 120, 452, 700), out_scale=.25), os.path.join(mdir, "widows-needle", "cast.png"))
    write_png(build_sheet([fx_frame("dart", i / 4) for i in range(4)], 4, 1, (20, 200, 492, 560), out_scale=.25, align="center"), os.path.join(mdir, "widows-needle", "dart.png"))
    write_png(build_sheet([fx_frame("pin", i / 4) for i in range(4)], 4, 1, (60, 60, 452, 740), out_scale=.25), os.path.join(mdir, "widows-needle", "pin.png"))
    # spirit fan sweeps: 240 x 548 singles
    for i in range(4):
        svg = build_sheet([fx_frame("gust", i / 4)], 1, 1, (20, 40, 460, 1060), cell=(480, 1096), out_scale=.5, align="center")
        write_png(svg, os.path.join(mdir, "spirit-fan", f"sweep-{i + 1}.png"))
    return out
