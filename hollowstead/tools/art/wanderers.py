"""Two alternative wanderer designs, drawn on the same 16-frame sheet as the witch
(0-1 idle, 2-5 walk, 6-8 attack, 9-11 gather, 12 dash, 13 down, 14-15 spare).

  hood  The Hooded Wayfarer: a long pointed hood with nothing inside but two glowing,
        angry eyes; wrapped scarf, gloves, a little lantern on the belt.
  mask  The Masked Wanderer: wild hair, a bone mask with the skeleton's angry eye holes
        and cracks, a short cape and a satchel.

Both reuse the witch's pose parameters (feet, ab/af arm angles, lean, by, hem, hat,
eyes, fx), so the animation timing is identical and either can replace the witch.
"""
import math
from lib import *
from actors import WITCHES, STOCK, BOOT, BOOT_D, arm, seg, bar

GLOVE = "#4a3a3a"; GLOVE_D = "#342830"; LEATHER = "#6e4a36"; LEATHER_D = "#4f3426"
MASK = BONE; MASK_D = BONE_D


def legs(P, by, trousers=("#2e2430", STOCK)):
    feet = P.get("feet", [(-26, 0), (26, 0)])
    hip = (256, 610 + by)
    out = ""
    for i, (fx, lift) in enumerate(feet):
        hx = hip[0] + (-22 if i == 0 else 22)
        foot = (256 + fx + (-22 if i == 0 else 22), 722 - lift)
        knee = ((hx + foot[0]) / 2 + 4, (hip[1] + foot[1]) / 2 - 4)
        out += bar((hx, hip[1] - 10), knee, 34, trousers[i]) + bar(knee, foot, 32, trousers[i])
        out += rrect(foot[0] - 26, foot[1] - 12, 58, 34, 13, BOOT if i else BOOT_D, 7)
        out += rrect(foot[0] - 22, foot[1] - 20, 44, 14, 5, LEATHER_D if i else LEATHER, 5)
    return out


def fx_layer(fx, hf, pal):
    b = ""
    if fx == "spark":
        b += sparkle(hf[0] + 20, hf[1] - 10, 3.2, pal["charm"]) + sparkle(hf[0] + 20, hf[1] - 10, 1.6, "#ffffff")
        b += brush((hf[0] - 40, hf[1] - 120), (hf[0] + 90, hf[1] - 60), (hf[0] + 40, hf[1] + 60), 16, pal["charm"], .75)
    elif fx == "glow":
        b += sparkle(hf[0] + 10, hf[1], 2.0, pal["charm"], .8)
    elif fx == "pluck":
        b += leaf(hf[0] + 10, hf[1] - 30, 30, 2.2, LEAF_L) + sparkle(hf[0] + 40, hf[1] - 50, 1.0, "#fff8e6")
    return b


def after(fx, b):
    if fx == "dash":
        for i, y in enumerate((440, 530, 620)):
            b += brush((50 - i * 10, y), (110, y - 2), (170 - i * 20, y), 10, BONE, .6)
    if fx == "dust":
        b += fill_ns(blob(150, 730, 30, 14, 6, .2, 3), "#c9b89a", .6) + fill_ns(blob(110, 716, 18, 10, 6, .2, 4), "#c9b89a", .4)
    return b


def glow_eyes(cx, cy, eyes, col, w=34):
    """The skeleton's angry eye shapes, but lit."""
    out = ""
    for s in (-1, 1):
        x = cx + s * w
        if eyes == "closed":
            out += line(f"M{x - 14} {cy + 4} Q{x} {cy + 12} {x + 14} {cy + 4}", 6, col)
            continue
        if eyes == "x":
            out += line(f"M{x - 10} {cy - 8} L{x + 10} {cy + 10} M{x + 10} {cy - 8} L{x - 10} {cy + 10}", 6, col)
            continue
        slant = 12 if eyes == "focus" else 8
        shape = f"M{x + s * 20} {cy - slant} L{x - s * 18} {cy + 2} Q{x - s * 14} {cy + 22} {x} {cy + 22} Q{x + s * 20} {cy + 20} {x + s * 20} {cy - slant} Z"
        out += f'<path d="{shape}" fill="{col}" stroke="none" opacity=".35" transform="translate({x} {cy + 6}) scale(1.6) translate({-x} {-(cy + 6)})"/>'
        out += f'<path d="{shape}" fill="{col}" stroke="none"/>'
        out += f'<circle cx="{x + s * 3}" cy="{cy + 8}" r="4" fill="#ffffff" stroke="none"/>'
    return out


# ------------------------------------------------------------------ A: the hooded wayfarer
def hooded(name, P):
    pal = WITCHES[name]
    d = []; b = ""
    by = P.get("by", 0); lean = P.get("lean", 0); sway = P.get("hem", 0); hs = P.get("hat", 0)
    b += legs(P, by)
    body = ""
    sh_b = (212, 470 + by); sh_f = (300, 470 + by)
    a_b, hb = arm(sh_b, *P.get("ab", (-12, -8)), pal["cloak_d"], pal["cloak_d"], GLOVE_D, 70, 62, 32, 36)
    body += a_b
    # long cloak, ragged hem
    cloak = (f"M214 {440 + by} L298 {440 + by} Q338 {520 + by} {352 + sway} {640 + by} "
             f"L{334 + sway} {628 + by} L{322 + sway} {656 + by} L{300 + sway * .7} {636 + by} L{282 + sway * .5} {660 + by} "
             f"L{262 + sway * .4} {638 + by} L{240 + sway * .5} {662 + by} L{222 + sway * .6} {636 + by} L{202 + sway * .8} {656 + by} "
             f"L{186 + sway} {630 + by} L{164 + sway} {642 + by} Q176 {520 + by} 214 {440 + by} Z")
    body += shaded(d, cloak, pal["cloak"], pal["cloak_d"], 14, -4, brush((212, 480 + by), (196, 560 + by), (190, 620 + by), 9, pal["cloak_l"]))
    body += line(f"M256 {470 + by} L{256 + sway * .4} {640 + by}", 5, pal["cloak_d"])
    # belt, lantern charm
    body += rrect(204, 548 + by, 104, 20, 8, LEATHER, 6) + rrect(246, 544 + by, 22, 28, 6, pal["trim"], 5)
    lx, ly = 210 + sway * .3, 572 + by
    body += line(f"M{lx} {ly - 4} L{lx} {ly + 10}", 5)
    body += fill(f"M{lx - 14} {ly + 10} L{lx + 14} {ly + 10} L{lx + 12} {ly + 44} L{lx - 12} {ly + 44} Z", pal["charm"], 6)
    body += f'<circle cx="{lx}" cy="{ly + 27}" r="18" fill="{pal["charm"]}" opacity=".25" stroke="none"/>'
    # scarf
    scarf = f"M206 {448 + by} Q256 {476 + by} 306 {448 + by} L308 {474 + by} Q256 {500 + by} 204 {474 + by} Z"
    body += fill(scarf, pal["trim"], 7)
    tail = f"M290 {470 + by} Q{330 - sway} {500 + by} {350 - sway * 1.5} {540 + by} L{326 - sway} {546 + by} Q{314 - sway * .5} {508 + by} 276 {484 + by} Z"
    body += fill(tail, pal["trim"], 6) + line(f"M{336 - sway} {536 + by} L{344 - sway * 1.3} {548 + by}", 4)
    # hood
    hc = (256, 350 + by); tilt = P.get("tilt", 0)
    head = ""
    tip = (340 + hs * 3, 200 + by + abs(hs))
    hood = (f"M150 {hc[1] + 96} Q138 {hc[1] - 10} 186 {hc[1] - 82} Q226 {hc[1] - 128} 282 {hc[1] - 120} "
            f"Q{tip[0] - 20} {tip[1] + 30} {tip[0]} {tip[1]} Q{tip[0] - 4} {tip[1] + 60} 342 {hc[1] - 40} "
            f"Q376 {hc[1] + 20} 362 {hc[1] + 96} Q256 {hc[1] + 120} 150 {hc[1] + 96} Z")
    head += shaded(d, hood, pal["cloak"], pal["cloak_d"], -14, -6, brush((178, hc[1] - 20), (196, hc[1] - 80), (250, hc[1] - 106), 8, pal["cloak_l"]))
    opening = (f"M180 {hc[1] + 84} Q170 {hc[1] - 10} 216 {hc[1] - 54} Q256 {hc[1] - 78} 298 {hc[1] - 54} "
               f"Q344 {hc[1] - 10} 332 {hc[1] + 84} Q256 {hc[1] + 104} 180 {hc[1] + 84} Z")
    head += fill(opening, INK_D, 7)
    head += fill_ns(f"M196 {hc[1] - 10} Q256 {hc[1] - 60} 316 {hc[1] - 10} Q256 {hc[1] - 30} 196 {hc[1] - 10} Z", "#000000", .35)
    head += glow_eyes(256, hc[1] + 14, P.get("eyes", "open"), pal["charm"], 36)
    head += line(f"M176 {hc[1] + 82} Q256 {hc[1] + 108} 336 {hc[1] + 82}", 6, pal["trim"])
    body += head if not tilt else f'<g transform="rotate({tilt} 256 {450 + by})">{head}</g>'
    a_f, hf = arm(sh_f, *P.get("af", (14, 8)), pal["cloak"], pal["cloak_d"], GLOVE, 70, 62, 32, 36)
    body += a_f + fx_layer(P.get("fx", ""), hf, pal)
    if lean:
        body = f'<g transform="rotate({lean} 256 {640 + by})">{body}</g>'
    b += body
    return d, after(P.get("fx", ""), b)


def hooded_down(name):
    pal = WITCHES[name]
    d = []; b = ""
    for i, x in enumerate((250, 300)):
        b += bar((x - 30, 700), (x + 70, 716), 32, STOCK if i else "#2e2430") + rrect(x + 60, 688, 34, 48, 12, BOOT if i else BOOT_D, 7)
    b += shaded(d, "M180 560 Q280 530 330 600 L346 716 Q256 734 160 716 Z", pal["cloak"], pal["cloak_d"], 10, -4)
    b += arm((196, 600), 30, 20, pal["cloak_d"], pal["cloak_d"], GLOVE_D, 54, 48, 30, 34)[0]
    hc = (232, 500)
    b += f'<g transform="rotate(-22 {hc[0]} {hc[1]})">'
    b += fill(f"M140 {hc[1] + 80} Q130 {hc[1] - 20} 190 {hc[1] - 80} Q256 {hc[1] - 110} 320 {hc[1] - 70} Q360 {hc[1]} 330 {hc[1] + 80} Z", pal["cloak"], 8)
    b += fill(f"M172 {hc[1] + 70} Q168 {hc[1] - 10} 232 {hc[1] - 40} Q300 {hc[1] - 10} 300 {hc[1] + 70} Z", INK_D, 7)
    b += glow_eyes(236, hc[1] + 16, "closed", pal["charm"], 30)
    b += '</g>'
    b += arm((300, 600), 40, 30, pal["cloak"], pal["cloak_d"], GLOVE, 54, 48, 30, 34)[0]
    for i in range(3):
        a = i * 2.1
        b += sparkle(232 + 70 * math.cos(a), 380 + 20 * math.sin(a), 1.0, pal["charm"], .8)
    return d, b


# ------------------------------------------------------------------ B: the masked wanderer
def masked(name, P):
    pal = WITCHES[name]
    d = []; b = ""
    by = P.get("by", 0); lean = P.get("lean", 0); sway = P.get("hem", 0); hs = P.get("hat", 0)
    b += legs(P, by, (LEATHER_D, LEATHER))
    body = ""
    sh_b = (210, 474 + by); sh_f = (302, 474 + by)
    # cape behind
    cape = (f"M200 {448 + by} Q256 {430 + by} 312 {448 + by} Q{350 + sway} {560 + by} {362 + sway * 1.4} {620 + by} "
            f"L{320 + sway} {606 + by} L{290 + sway} {628 + by} L{256 + sway * .8} {608 + by} L{222 + sway * .6} {628 + by} L{190 + sway * .5} {606 + by} "
            f"L{150 + sway * .4} {620 + by} Q164 {560 + by} 200 {448 + by} Z")
    body += shaded(d, cape, pal["cloak_d"], "#2a2030", 12, 0)
    a_b, hb = arm(sh_b, *P.get("ab", (-12, -8)), "#3e3446", "#3e3446", SKIN_D, 68, 60, 30, 34)
    body += a_b
    # tunic
    tunic = (f"M214 {460 + by} L298 {460 + by} Q322 {540 + by} {326 + sway * .5} {620 + by} "
             f"Q256 {640 + by} {186 + sway * .5} {620 + by} Q190 {540 + by} 214 {460 + by} Z")
    body += shaded(d, tunic, "#524463", "#3e3446", 12, -4, brush((220, 490 + by), (210, 550 + by), (208, 600 + by), 7, "#7a6a8a"))
    body += rrect(200, 560 + by, 112, 20, 8, LEATHER, 6) + rrect(246, 556 + by, 22, 28, 5, pal["trim"], 5)
    body += line(f"M300 {466 + by} L220 {560 + by}", 7, LEATHER_D)
    body += fill(f"M296 {582 + by} L334 {582 + by} L330 {622 + by} L300 {622 + by} Z", LEATHER, 6)
    # cape collar / clasp
    body += fill(f"M198 {452 + by} Q256 {480 + by} 314 {452 + by} L318 {476 + by} Q256 {506 + by} 194 {476 + by} Z", pal["cloak"], 7)
    body += gem(256, 486 + by, 11, pal["charm"], pal["cloak_d"], "#ffffff")
    # head: wild hair + bone mask
    hc = (256, 356 + by); tilt = P.get("tilt", 0)
    head = ""
    spikes = []
    for i in range(11):
        a = math.radians(-180 + i * 18)
        r = 112 + (22 if i % 2 else 0) + (hs * 2 if i in (7, 9) else 0)
        spikes.append((hc[0] + math.cos(a) * r, hc[1] - 10 + math.sin(a) * r * .95))
    hair = f"M{hc[0] - 104} {hc[1] + 40} L" + " L".join(f"{f(x)} {f(y)}" for x, y in spikes) + f" L{hc[0] + 104} {hc[1] + 40} Z"
    head += shaded(d, hair, pal["hair"], HAIR_D(pal), -12, -6, brush((180, hc[1] - 60), (220, hc[1] - 96), (280, hc[1] - 100), 8, pal["hair_l"]))
    mask = (f"M{hc[0] - 86} {hc[1] - 36} Q{hc[0]} {hc[1] - 80} {hc[0] + 86} {hc[1] - 36} Q{hc[0] + 96} {hc[1] + 40} {hc[0] + 50} {hc[1] + 86} "
            f"Q{hc[0]} {hc[1] + 106} {hc[0] - 50} {hc[1] + 86} Q{hc[0] - 96} {hc[1] + 40} {hc[0] - 86} {hc[1] - 36} Z")
    head += shaded(d, mask, MASK, MASK_D, 12, 6)
    eyes = P.get("eyes", "open")
    for s in (-1, 1):
        x = hc[0] + s * 38; y = hc[1] + 10
        if eyes == "closed":
            head += line(f"M{x - 16} {y + 4} Q{x} {y + 12} {x + 16} {y + 4}", 7)
        elif eyes == "x":
            head += line(f"M{x - 12} {y - 8} L{x + 12} {y + 12} M{x + 12} {y - 8} L{x - 12} {y + 12}", 7)
        else:
            slant = 14 if eyes == "focus" else 8
            hole = f"M{x + s * 26} {y - slant} L{x - s * 22} {y + 4} Q{x - s * 18} {y + 30} {x} {y + 30} Q{x + s * 26} {y + 28} {x + s * 26} {y - slant} Z"
            head += fill(hole, INK_D, 7) + f'<circle cx="{x}" cy="{y + 14}" r="7" fill="{pal["charm"]}" stroke="none"/>'
    head += fill_ns(f"M{hc[0] - 5} {hc[1] + 48} L{hc[0] + 5} {hc[1] + 48} L{hc[0]} {hc[1] + 60} Z", INK_D)
    head += line(f"M{hc[0] - 22} {hc[1] + 76} L{hc[0] - 22} {hc[1] + 88} M{hc[0]} {hc[1] + 78} L{hc[0]} {hc[1] + 92} M{hc[0] + 22} {hc[1] + 76} L{hc[0] + 22} {hc[1] + 88}", 4)
    head += line(f"M{hc[0] + 30} {hc[1] - 58} L{hc[0] + 38} {hc[1] - 40} L{hc[0] + 28} {hc[1] - 28}", 4) + line(f"M{hc[0] - 70} {hc[1] + 30} L{hc[0] - 58} {hc[1] + 36}", 4)
    head += line(f"M{hc[0] - 70} {hc[1] - 12} L{hc[0] - 40} {hc[1] - 20}", 8, pal["cloak"]) + line(f"M{hc[0] + 70} {hc[1] - 12} L{hc[0] + 40} {hc[1] - 20}", 8, pal["cloak"])
    # fringe over the mask
    fringe = f"M{hc[0] - 92} {hc[1] - 30} Q{hc[0] - 60} {hc[1] - 70} {hc[0] - 20} {hc[1] - 46} L{hc[0] - 34} {hc[1] - 20} L{hc[0] - 4} {hc[1] - 50} Q{hc[0] + 40} {hc[1] - 74} {hc[0] + 90} {hc[1] - 36} Q{hc[0] + 30} {hc[1] - 90} {hc[0] - 92} {hc[1] - 30} Z"
    head += fill(fringe, pal["hair"], 6)
    body += head if not tilt else f'<g transform="rotate({tilt} 256 {450 + by})">{head}</g>'
    a_f, hf = arm(sh_f, *P.get("af", (14, 8)), "#524463", "#3e3446", SKIN, 68, 60, 30, 34)
    body += a_f + line(f"M{hf[0] - 14} {hf[1] - 22} L{hf[0] + 14} {hf[1] - 26}", 8, LEATHER)
    body += fx_layer(P.get("fx", ""), hf, pal)
    if lean:
        body = f'<g transform="rotate({lean} 256 {640 + by})">{body}</g>'
    b += body
    return d, after(P.get("fx", ""), b)


def HAIR_D(pal):
    return "#2a2030" if pal["hair"] in ("#2a2030",) else "#3a2a30"


def masked_down(name):
    pal = WITCHES[name]
    d = []; b = ""
    for i, x in enumerate((250, 300)):
        b += bar((x - 30, 700), (x + 70, 716), 32, LEATHER_D if i else LEATHER) + rrect(x + 60, 688, 34, 48, 12, BOOT if i else BOOT_D, 7)
    b += shaded(d, "M180 570 Q280 540 330 610 L346 716 Q256 734 160 716 Z", "#524463", "#3e3446", 10, -4)
    b += arm((196, 610), 30, 20, "#3e3446", "#3e3446", SKIN_D, 54, 48, 30, 34)[0]
    hc = (232, 506)
    b += f'<g transform="rotate(-24 {hc[0]} {hc[1]})">'
    b += fill(f"M{hc[0] - 100} {hc[1] + 30} Q{hc[0] - 110} {hc[1] - 90} {hc[0]} {hc[1] - 110} Q{hc[0] + 110} {hc[1] - 90} {hc[0] + 100} {hc[1] + 30} Z", pal["hair"], 8)
    b += fill(f"M{hc[0] - 80} {hc[1] - 30} Q{hc[0]} {hc[1] - 70} {hc[0] + 80} {hc[1] - 30} Q{hc[0] + 88} {hc[1] + 40} {hc[0]} {hc[1] + 90} Q{hc[0] - 88} {hc[1] + 40} {hc[0] - 80} {hc[1] - 30} Z", MASK, 8)
    for x in (hc[0] - 34, hc[0] + 34):
        b += line(f"M{x - 14} {hc[1] + 10} Q{x} {hc[1] + 20} {x + 14} {hc[1] + 10}", 7)
    b += '</g>'
    b += arm((300, 610), 40, 30, "#524463", "#3e3446", SKIN, 54, 48, 30, 34)[0]
    for i in range(3):
        a = i * 2.1
        b += sparkle(232 + 70 * math.cos(a), 380 + 20 * math.sin(a), 1.0, pal["charm"], .8)
    return d, b


def frames(fn, down, name):
    W = lambda **P: (lambda: fn(name, P))
    walk = [
        W(feet=[(-34, 0), (30, 0)], ab=(22, 12), af=(-18, -10), by=0, hem=-8, hat=-4),
        W(feet=[(-6, 0), (6, 26)], ab=(6, 2), af=(-2, 4), by=-10, hem=0, hat=2),
        W(feet=[(30, 0), (-34, 0)], ab=(-22, -12), af=(24, 16), by=0, hem=8, hat=4),
        W(feet=[(6, 26), (-6, 0)], ab=(-6, -2), af=(6, 10), by=-10, hem=0, hat=-2),
    ]
    return [
        W(), W(by=5, hat=4, eyes="closed"),
        *walk,
        W(af=(-70, -110), ab=(10, 10), lean=-6, eyes="focus", fx="glow"),
        W(af=(96, 110), ab=(-30, -40), lean=8, eyes="focus", fx="spark", feet=[(-40, 0), (34, 0)], hem=10),
        W(af=(60, 70), ab=(-20, -24), lean=4, feet=[(-36, 0), (30, 0)]),
        W(af=(40, 30), ab=(30, 24), lean=12, by=6, eyes="focus"),
        W(af=(20, 10), ab=(20, 8), lean=16, by=22, eyes="closed", feet=[(-40, 0), (40, 0)]),
        W(af=(120, 150), ab=(10, 4), lean=2, by=-4, fx="pluck"),
        W(af=(-60, -70), ab=(-70, -80), lean=20, by=6, feet=[(-70, 18), (50, 0)], hem=-24, hat=-12, eyes="focus", fx="dash"),
        lambda: down(name),
        W(), W(by=5, hat=4),
    ]


TARGET = (40, 40, 472, 736)
SPRITES = {}
for _name in WITCHES:
    SPRITES[f"{_name}-hood"] = {"frames": frames(hooded, hooded_down, _name), "cols": 8, "rows": 2, "target": TARGET}
    SPRITES[f"{_name}-mask"] = {"frames": frames(masked, masked_down, _name), "cols": 8, "rows": 2, "target": TARGET}
