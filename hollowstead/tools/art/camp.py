"""The camp at the centre of the hollow: two Heartfire designs, the magic plaza laid on the
ground around each, and the standing props that ring it.

  a  Moonwell: a clean stone drum with one spiral keystone and a tall flame around a spirit core,
     two floating shards; an even flagstone floor with a single mint rune ring. No standing props:
     the plaza stays flat so buildings and dropped things read on it (the menhir is the arena's).
  b  Arcane brazier: an iron tripod brazier holding an amber flame inside a slowly turning
     golden rune halo; a gilded six-point sigil inlaid with amethyst; sigil lamps.

    python3 tools/art/camp.py      (also built by build.py)
"""
import math, os, random
from lib import *
import lib
from structures import anim, IRON, IRON_D, IRON_L
from longnight import AM, AM_D, AM_L, GOLDEN, GOLDEN_D, GOLDEN_L

SP_O = "#5fc7b4"; SP_M = "#9fe8d8"; SP_I = "#effffb"           # spirit flame
SIGIL = "#f2c14e"; SIGIL_L = "#fff1c8"
STONE = "#8d88a3"; STONE_D = "#67637d"; STONE_L = "#b8b4cb"


def spirit_flame(cx, base, w, h, phase, seed):
    return flame(cx, base, w, h, phase, seed).replace(FL_O, SP_O).replace(FL_M, SP_M).replace(FL_I, SP_I)


# ------------------------------------------------------------------ Heartfire A: the moonwell
# The selected concept (art-concepts/environment-2026-09-29, "A · Moonwell"): one clean stone drum,
# a single spiral keystone, a tall layered flame with a spirit core, two small shards. Few, large shapes.
MW_STONE = "#a29db5"; MW_TOP = "#bdb8cd"; MW_BED = "#5c485a"; MINT = "#a3e4cb"; MINT_L = "#ecf6d6"
EMBER = "#f4ad55"; FLAME_O = "#e78343"; FLAME_M = "#f6b657"


def hearth_a(phase):
    d = []; b = ""
    tau = 2 * math.pi * phase
    tip = 14 * math.sin(tau); lift = -9 * math.sin(tau + 1.1); bob = 7 * math.sin(tau + 2.2)
    # warm halo behind the flame (soft, no outline)
    b += f'<ellipse cx="256" cy="430" rx="{f(190 + 8 * math.sin(tau))}" ry="220" fill="{EMBER}" opacity=".16" stroke="none"/>'
    # the drum: one solid body, a masonry seam and a few joints
    b += fill("M49 586 Q61 550 256 548 Q451 550 463 586 L461 665 Q458 729 256 740 Q54 729 51 665 Z", MW_STONE, 8)
    b += line("M53 660 Q256 722 459 660", 6)
    b += line("M121 623 L116 678 M389 623 L396 678 M160 694 L155 730 M352 694 L357 730", 6)
    b += ell(256, 586, 207, 61, MW_TOP, 8)
    b += line("M112 543 L144 562 M219 526 L224 553 M321 529 L308 554 M399 545 L369 564", 6)
    b += ell(256, 590, 150, 35, MW_BED, 7)
    b += f'<ellipse cx="256" cy="594" rx="132" ry="24" fill="{EMBER}" stroke="none"/>'
    # the flame: orange, amber, then the spirit core and its white heart (squashed into the bowl)
    fl = ""
    fl += fill(f"M{f(243 + tip)} {f(220 + lift)} C{f(285 + tip)} 266 270 309 279 338 Q288 321 289 303 C339 345 311 389 329 413 Q347 391 344 365 "
               f"C387 435 383 471 366 488 Q361 531 331 558 Q300 594 257 600 Q198 599 166 557 C129 512 138 464 163 427 Q160 465 187 474 "
               f"Q192 457 182 420 C164 360 191 322 211 297 Q208 334 226 349 C212 298 222 257 {f(243 + tip)} {f(220 + lift)} Z", FLAME_O, 8)
    fl += fill_ns(f"M{f(250 + tip * .4)} {f(339 + lift * .5)} C287 386 273 421 292 449 Q308 436 306 415 C342 464 332 509 307 541 Q288 572 255 584 "
                  f"Q221 579 196 549 C171 522 179 494 191 482 Q194 507 210 510 C205 479 215 451 230 429 Q232 462 246 470 C232 424 239 379 {f(250 + tip * .4)} {f(339 + lift * .5)} Z", FLAME_M)
    fl += fill(f"M{f(253 - tip * .3)} {f(441 + lift * .6)} Q288 474 279 505 Q291 495 294 480 C316 522 306 559 282 577 Q258 595 234 580 "
               f"C210 566 201 538 218 506 Q218 529 234 535 C225 503 240 470 {f(253 - tip * .3)} {f(441 + lift * .6)} Z", MINT, 7)
    fl += fill_ns("M255 511 Q271 536 266 550 Q277 545 277 538 Q286 567 259 582 Q235 578 233 563 Q230 549 240 539 Q239 555 248 557 Q241 534 255 511 Z", MINT_L)
    b += f'<g transform="translate(0 102) scale(1 .83)">{fl}</g>'
    # the keystone in front, carrying the one emblem; it breathes with the fire
    b += fill("M201 639 Q256 646 311 639 L325 731 Q256 744 187 731 Z", MW_STONE, 8)
    spiral = "M257 688 C252 678 241 681 242 690 C243 701 259 704 267 695 C282 679 267 662 251 665 C230 668 222 687 232 704 Q240 718 256 718"
    glow = .7 + .3 * math.sin(tau)
    b += f'<path d="{spiral}" fill="none" stroke="{MINT}" stroke-width="{sw(9)}" opacity="{glow:.2f}"/>'
    # two shards floating either side, a few sparks
    for x, y, s in ((107, 398 + bob, 1), (399, 416 - bob, -1)):
        b += f'<circle cx="{x}" cy="{f(y)}" r="30" fill="{MINT}" opacity=".18" stroke="none"/>'
        b += fill(f"M{x} {f(y - 31)} L{x + 17} {f(y)} L{x} {f(y + 29)} L{x - 15} {f(y)} Z", MINT, 7)
    for i, (x, y) in enumerate([(206, 250), (300, 230), (248, 180)]):
        t = (phase + i / 3) % 1
        b += f'<circle cx="{f(x + 10 * math.sin(t * 6 + i))}" cy="{f(y - t * 110)}" r="{f(7 * (1 - t) + 1.5)}" fill="{MINT_L if i % 2 else EMBER}" stroke="none" opacity="{1 - t:.2f}"/>'
    return d, b


# ------------------------------------------------------------------ Heartfire B: the arcane brazier
def hearth_b(phase):
    d = []; b = ""
    tau = 2 * math.pi * phase
    # halo, back half
    halo_y = 400
    def halo(front):
        out = ""
        rx, ry = 190, 54
        a0, a1 = (0, math.pi) if front else (math.pi, 2 * math.pi)
        pts = [(256 + math.cos(a) * rx, halo_y + math.sin(a) * ry) for a in [a0 + (a1 - a0) * i / 24 for i in range(25)]]
        path = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts)
        out += line(path, 18) + line(path, 9, SIGIL, ' opacity=".95"')
        for k in range(8):
            a = tau / 2 + k * math.pi / 4
            if (math.sin(a) > 0) != front: continue
            x = 256 + math.cos(a) * rx; y = halo_y + math.sin(a) * ry
            out += line(f"M{f(x - 8)} {f(y - 14)} L{f(x + 8)} {f(y + 14)} M{f(x + 8)} {f(y - 14)} L{f(x - 8)} {f(y + 14)}", 7, SIGIL_L)
        return out
    b += halo(False)
    # tripod legs
    for s in (-1, 1):
        b += line(f"M{256 + s * 70} 560 L{256 + s * 150} 738", 22) + line(f"M{256 + s * 70} 560 L{256 + s * 150} 738", 12, IRON)
        b += rrect(256 + s * 150 - 20, 722, 40, 18, 6, IRON_D, 6)
        b += gem(256 + s * 96, 606, 13, AM, AM_D, AM_L)
    b += line("M256 580 L256 738", 22) + line("M256 580 L256 738", 12, IRON_D)
    # bowl
    b += G(flame(256, 548, 170, 330 + 18 * math.sin(tau), phase, 7))
    bowl = "M126 530 Q256 500 386 530 Q370 600 256 612 Q142 600 126 530 Z"
    b += shaded(d, bowl, IRON, IRON_D, 0, 14, brush((160, 544), (256, 560), (350, 544), 7, IRON_L))
    b += rrect(118, 518, 276, 22, 10, GOLDEN_D, 7)
    for x in (168, 216, 256, 296, 344):
        b += f'<circle cx="{x}" cy="529" r="6" fill="{GOLDEN_L}" stroke="none"/>'
    b += halo(True)
    for i, (x, y) in enumerate([(200, 280), (310, 250), (250, 200), (330, 330), (180, 350)]):
        t = (phase + i * .2) % 1
        b += f'<circle cx="{f(x + 14 * math.sin(t * 6 + i))}" cy="{f(y - t * 100)}" r="{f(7 * (1 - t) + 1)}" fill="{FL_I if i % 2 else AM_L}" stroke="none" opacity="{1 - t:.2f}"/>'
    return d, b


# ------------------------------------------------------------------ standing props around the plaza
def menhir(phase):
    d = []; b = ""
    st = smooth([(206, 740), (196, 600), (212, 470), (256, 430), (300, 470), (316, 600), (306, 740)])
    b += shaded(d, st, STONE, STONE_D, -12, -8, brush((222, 500), (214, 580), (218, 680), 8, STONE_L))
    glow = .6 + .4 * math.sin(2 * math.pi * phase)
    r = "M256 500 L256 640 M226 530 L256 560 L286 530 M232 600 L280 600"
    b += line(r, 14) + line(r, 6, CR_L, f' opacity="{glow:.2f}"')
    b += f'<ellipse cx="256" cy="570" rx="70" ry="110" fill="{CR}" opacity="{.08 + .1 * glow:.2f}" stroke="none"/>'
    b += crystal_tuft(170, 742) + crystal_tuft(340, 744, .8)
    b += leaf(200, 736, -60, 1.4, LEAF) + leaf(318, 738, 50, 1.2, LEAF_L)
    return d, b


def crystal_tuft(x, y, s=1.0):
    out = ""
    for dx, h, rot in ((-16, 60, -18), (6, 86, 4), (24, 52, 22)):
        out += (f'<g transform="translate({x + dx * s} {y}) rotate({rot}) scale({s})">'
                + fill("M0 0 L-12 -30 L0 -%d L12 -30 Z" % h, CR, 5) + fill_ns("M0 0 L0 -%d L12 -30 Z" % h, CR_D) + fill("M0 0 L-12 -30 L0 -%d L12 -30 Z" % h, "none", 5) + '</g>')
    return out


def sigil_lamp(phase):
    d = []; b = ""
    b += rrect(206, 700, 100, 40, 10, STONE_D, 7) + rrect(216, 680, 80, 26, 8, STONE, 7)
    b += line("M256 680 L256 470", 20) + line("M256 680 L256 470", 10, IRON)
    b += line("M256 470 Q300 440 320 470", 12) + line("M256 470 Q300 440 320 470", 5, IRON)
    b += line("M320 470 L320 500", 6)
    b += fill("M290 500 L350 500 L344 590 L296 590 Z", "#3a3150", 7)
    fl = 1 + .1 * math.sin(2 * math.pi * phase)
    b += f'<circle cx="320" cy="545" r="{f(56 * fl)}" fill="{AM}" opacity=".22" stroke="none"/>'
    b += fill(f"M320 {f(590 - 76 * fl)} Q342 550 334 572 Q320 590 306 572 Q298 550 320 {f(590 - 76 * fl)} Z", AM_L, 4)
    b += rrect(286, 584, 68, 14, 5, GOLDEN_D, 6) + rrect(286, 490, 68, 14, 5, GOLDEN_D, 6)
    b += gem(256, 620, 12, SIGIL, GOLDEN_D, SIGIL_L)
    return d, b


# ------------------------------------------------------------------ plaza decals (top-down, 1024 x 1024)
def ring_stones(r0, r1, n, seed, tones):
    rnd = random.Random(seed); out = ""
    for i in range(n):
        a0 = 2 * math.pi * i / n + .015; a1 = 2 * math.pi * (i + 1) / n - .015
        j = rnd.uniform(-8, 8)
        pts = [(512 + math.cos(a) * (r1 + j), 512 + math.sin(a) * (r1 + j)) for a in (a0, (a0 + a1) / 2, a1)]
        pts += [(512 + math.cos(a) * r0, 512 + math.sin(a) * r0) for a in (a1, (a0 + a1) / 2, a0)]
        out += fill("M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + " Z", tones[i % len(tones)], 6)
    return out


def glyph(x, y, a, s, kind):
    shapes = ["M0 -18 L0 18 M-12 -6 L0 6 L12 -6", "M-12 -16 L12 16 M12 -16 L-12 16", "M0 -18 L0 18 M-12 -18 L12 -18",
              "M-10 18 L0 -18 L10 18 M-6 4 L6 4", "M-12 0 Q0 -22 12 0 Q0 22 -12 0", "M0 -18 L12 0 L0 18 L-12 0 Z"]
    return f'<path d="{shapes[kind % len(shapes)]}" transform="translate({f(x)} {f(y)}) rotate({f(math.degrees(a) + 90)}) scale({s})" fill="none"/>'


def plaza_a(glow_only=False):
    """A calm, even flagstone floor so buildings and dropped things read on it: one curb, two courses
    of paving with quiet joints, and a single mint rune ring close around the Moonwell (the glow layer).
    Drawn in the PLAZA_WU decal (80 px per world unit); centred OFFSET units behind the Heartfire's
    ground point, under the middle of the well rather than its front lip. Ink matches lib.LINE_WU."""
    U = 1024 / PLAZA_WU; C = 512; Y = 512 - OFFSET * U; ink = 5
    R = 4.6 * U; CURB0 = 4.2 * U; RUNE = 2.45 * U
    rings = ((RUNE, 3.35 * U, 16, .0), (3.35 * U, CURB0, 22, .5))
    body = ""
    if not glow_only:
        body += f'<circle cx="{C}" cy="{f(Y)}" r="{f(R)}" fill="{PLAZA}" stroke="none"/>'
        body += f'<circle cx="{C}" cy="{f(Y)}" r="{f(RUNE)}" fill="{PLAZA_IN}" stroke="none"/>'
        for r0, r1, n, off in rings:
            body += f'<circle cx="{C}" cy="{f(Y)}" r="{f(r1)}" fill="none" stroke="{JOINT}" stroke-width="4"/>'
            for i in range(n):
                a = 2 * math.pi * (i + off) / n
                body += (f'<path d="M{f(C + math.cos(a) * r0)} {f(Y + math.sin(a) * r0)} L{f(C + math.cos(a) * r1)} {f(Y + math.sin(a) * r1)}" '
                         f'stroke="{JOINT}" stroke-width="4" fill="none"/>')
        for i in range(40):
            a0 = 2 * math.pi * i / 40 + .012; a1 = 2 * math.pi * (i + 1) / 40 - .012
            pts = [(C + math.cos(a) * R, Y + math.sin(a) * R) for a in (a0, (a0 + a1) / 2, a1)]
            pts += [(C + math.cos(a) * CURB0, Y + math.sin(a) * CURB0) for a in (a1, (a0 + a1) / 2, a0)]
            body += f'<path d="M{" L".join(f"{f(x)} {f(y)}" for x, y in pts)} Z" fill="{(CURB, CURB_L)[i % 2]}" stroke-width="{ink}"/>'
        body += f'<circle cx="{C}" cy="{f(Y)}" r="{f(RUNE)}" fill="none" stroke="{O}" stroke-width="13"/>'
    # the rune ring: one line with small evenly spaced studs
    body += f'<circle cx="{C}" cy="{f(Y)}" r="{f(RUNE)}" fill="none" stroke="{MINT}" stroke-width="6"/>'
    for i in range(12):
        a = 2 * math.pi * i / 12 + math.pi / 12
        x, y = C + math.cos(a) * RUNE, Y + math.sin(a) * RUNE
        body += f'<circle cx="{f(x)}" cy="{f(y)}" r="9" fill="{MINT_L if glow_only else MINT}" stroke="{"none" if glow_only else O}" stroke-width="{ink}"/>'
    return body


PLAZA_WU = 12.8     # world units across the plaza decal (theme.json plaza size)
OFFSET = 1.1        # the well's footprint centre sits this far behind the Heartfire's ground point
PLAZA = "#8a8497"; PLAZA_IN = "#817b8f"; JOINT = "#716b83"; CURB = "#77718a"; CURB_L = "#8e88a0"


def plaza_b(glow_only=False):
    body = ""
    if not glow_only:
        body += f'<circle cx="512" cy="512" r="470" fill="#5a4a52" opacity=".5" stroke="none"/>'
        body += ring_stones(400, 470, 36, 5, [DT, DT_D, "#6a4a5a"])
        body += f'<circle cx="512" cy="512" r="360" fill="#4a3a48" opacity=".45" stroke="none"/>'
        body += f'<circle cx="512" cy="512" r="360" fill="none" stroke="{INK_D}" stroke-width="24"/>'
    col = SIGIL_L if glow_only else SIGIL
    tri = lambda rot: "M" + " L".join(f"{f(512 + math.cos(rot + k * 2 * math.pi / 3) * 330)} {f(512 + math.sin(rot + k * 2 * math.pi / 3) * 330)}" for k in range(3)) + " Z"
    body += f'<g stroke="{col}" stroke-width="10" fill="none"><circle cx="512" cy="512" r="360"/><circle cx="512" cy="512" r="200"/>'
    body += f'<path d="{tri(-math.pi / 2)}"/><path d="{tri(math.pi / 2)}"/></g>'
    for k in range(6):
        a = -math.pi / 2 + k * math.pi / 3
        x, y = 512 + math.cos(a) * 330, 512 + math.sin(a) * 330
        if glow_only:
            body += f'<circle cx="{f(x)}" cy="{f(y)}" r="30" fill="{AM_L}" stroke="none"/>'
        else:
            body += f'<circle cx="{f(x)}" cy="{f(y)}" r="30" fill="{AM}" stroke="{INK_D}" stroke-width="10"/><circle cx="{f(x - 8)}" cy="{f(y - 8)}" r="9" fill="{AM_L}" stroke="none"/>'
    runes = "".join(glyph(512 + math.cos(2 * math.pi * i / 12 + .26) * 380, 512 + math.sin(2 * math.pi * i / 12 + .26) * 380, 2 * math.pi * i / 12 + .26, 1.0, i + 2) for i in range(12))
    body += f'<g stroke="{col}" stroke-width="7">{runes}</g>'
    return body


def write_decals(out_dir):
    for key, fn in (("plaza-a", plaza_a), ("plaza-b", plaza_b)):
        for suffix, glow in (("", False), ("-glow", True)):
            body = fn(glow)
            if key == "plaza-b":   # drawn for the old 9.6-unit decal: same size inside the PLAZA_WU one
                k = 9.6 / PLAZA_WU
                body = f'<g transform="translate({f(512 * (1 - k))} {f(512 * (1 - k))}) scale({k:.4f})">{body}</g>'
            svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><g stroke="{O}" stroke-linejoin="round" stroke-linecap="round">{body}</g></svg>'
            open(os.path.join(out_dir, f"{key}{suffix}.svg"), "w").write(svg)


SPRITES = {
    "hearth-a": {"icon": False, "frames": anim(hearth_a), "cols": 4, "rows": 1, "target": (20, 140, 492, 744)},
    "hearth-b": {"icon": False, "frames": anim(hearth_b), "cols": 4, "rows": 1, "target": (20, 110, 492, 744)},
    "plaza-a-prop": {"frames": anim(menhir), "cols": 4, "rows": 1, "target": (120, 380, 392, 744)},
    "plaza-b-prop": {"frames": anim(sigil_lamp), "cols": 4, "rows": 1, "target": (150, 380, 362, 744)},
}
