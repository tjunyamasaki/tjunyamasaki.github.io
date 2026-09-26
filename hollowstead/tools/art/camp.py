"""The camp at the centre of the hollow: two Heartfire designs, the magic plaza laid on the
ground around each, and the standing props that ring it.

  a  Moonwell: a well of stacked stones burning with a pale spirit-flame, crystal shards
     circling above; a flagstone ring carved with glowing teal runes; rune menhirs.
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
def hearth_a(phase):
    d = []; b = ""
    tau = 2 * math.pi * phase
    # back half of the well
    b += fill("M112 640 Q256 588 400 640 L400 660 Q256 612 112 660 Z", STONE_D, 7)
    # flame: orange outside, spirit core
    b += G(flame(256, 646, 150, 300 + 16 * math.sin(tau), phase, 5))
    b += spirit_flame(256, 646, 92, 200 + 12 * math.sin(tau + 1), phase, 9)
    # front of the well: two courses of stones
    for row, (y0, y1, n, off) in enumerate([(640, 690, 6, 0), (686, 738, 7, .5)]):
        for i in range(n):
            t0 = (i + off) / n; t1 = (i + off + .92) / n
            x0 = 104 + 304 * t0; x1 = 104 + 304 * t1
            sag = lambda x: 22 * math.sin(math.pi * (x - 104) / 304)
            stone = f"M{f(x0)} {f(y0 + sag(x0))} L{f(x1)} {f(y0 + sag(x1))} L{f(x1 + 2)} {f(y1 + sag(x1))} L{f(x0 - 2)} {f(y1 + sag(x0))} Z"
            b += fill(stone, STONE if (i + row) % 2 else STONE_L, 7)
    b += brush((130, 652), (256, 690), (380, 652), 6, "#ffffff", .25)
    # runes on the well stones
    for i, x in enumerate((168, 256, 344)):
        glow = .55 + .45 * math.sin(tau + i * 2.1)
        y = 700 + 22 * math.sin(math.pi * (x - 104) / 304)
        r = f"M{x} {y - 18} L{x} {y + 18} M{x - 12} {y - 6} L{x} {y + 4} L{x + 12} {y - 6}"
        b += line(r, 10) + line(r, 4, CR_L, f' opacity="{glow:.2f}"')
    # crystal shards orbiting above
    for i in range(3):
        a = tau + i * 2 * math.pi / 3
        x = 256 + math.cos(a) * 150; y = 330 + math.sin(a) * 36 - 10 * math.sin(tau * 2 + i)
        s = .75 + .25 * (math.sin(a) + 1) / 2
        shard = f"M{f(x)} {f(y - 42 * s)} L{f(x + 16 * s)} {f(y)} L{f(x)} {f(y + 30 * s)} L{f(x - 16 * s)} {f(y)} Z"
        b += f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(34 * s)}" fill="{CR}" opacity=".22" stroke="none"/>'
        b += fill(shard, CR, 6) + fill_ns(f"M{f(x)} {f(y - 42 * s)} L{f(x + 16 * s)} {f(y)} L{f(x)} {f(y + 30 * s)} Z", CR_D)
        b += fill(shard, "none", 6)
    for i, (x, y) in enumerate([(210, 300), (300, 270), (250, 220), (320, 360)]):
        t = (phase + i * .25) % 1
        b += f'<circle cx="{f(x + 12 * math.sin(t * 6 + i))}" cy="{f(y - t * 90)}" r="{f(6 * (1 - t) + 1)}" fill="{SP_I if i % 2 else FL_I}" stroke="none" opacity="{1 - t:.2f}"/>'
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
    body = ""
    if not glow_only:
        body += f'<circle cx="512" cy="512" r="470" fill="#6f5e4c" opacity=".55" stroke="none"/>'
        body += ring_stones(390, 470, 28, 3, [STONE, STONE_L, STONE_D])
        rnd = random.Random(8)
        for i in range(34):
            a = rnd.uniform(0, 2 * math.pi); r = rnd.uniform(130, 370)
            x, y = 512 + math.cos(a) * r, 512 + math.sin(a) * r
            body += fill(blob(x, y, rnd.uniform(18, 34), rnd.uniform(14, 24), 7, .2, i), [STONE_D, STONE, "#7a7590"][i % 3], 5)
        body += f'<circle cx="512" cy="512" r="340" fill="none" stroke="{INK_D}" stroke-width="22"/>'
        body += f'<circle cx="512" cy="512" r="286" fill="none" stroke="{INK_D}" stroke-width="16"/>'
    col = CR if glow_only else CR
    w = 1.0
    body += f'<g stroke="{col}" stroke-width="{10 * w}" fill="none"><circle cx="512" cy="512" r="340"/><circle cx="512" cy="512" r="286"/></g>'
    runes = "".join(glyph(512 + math.cos(2 * math.pi * i / 16) * 313, 512 + math.sin(2 * math.pi * i / 16) * 313, 2 * math.pi * i / 16, 1.1, i) for i in range(16))
    body += f'<g stroke="{col}" stroke-width="7">{runes}</g>'
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        body += f'<path d="M{f(512 + math.cos(a) * 120)} {f(512 + math.sin(a) * 120)} L{f(512 + math.cos(a) * 270)} {f(512 + math.sin(a) * 270)}" stroke="{col}" stroke-width="8" fill="none"/>'
    return body


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
            svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 1024 1024"><g stroke="{O}" stroke-linejoin="round" stroke-linecap="round">{body}</g></svg>'
            open(os.path.join(out_dir, f"{key}{suffix}.svg"), "w").write(svg)


SPRITES = {
    "hearth-a": {"icon": False, "frames": anim(hearth_a), "cols": 4, "rows": 1, "target": (20, 140, 492, 744)},
    "hearth-b": {"icon": False, "frames": anim(hearth_b), "cols": 4, "rows": 1, "target": (20, 110, 492, 744)},
    "plaza-a-prop": {"frames": anim(menhir), "cols": 4, "rows": 1, "target": (120, 380, 392, 744)},
    "plaza-b-prop": {"frames": anim(sigil_lamp), "cols": 4, "rows": 1, "target": (150, 380, 362, 744)},
}
