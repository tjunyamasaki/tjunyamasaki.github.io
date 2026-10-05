"""The wanderer's tool rig: what the game needs to draw a held tool in a moving hand.

    python3 tools/art/build.py --only ember-rig,ember-arm,grip-axe      (or no --only: everything)

Writes, per wanderer and per look (witch: no suffix, hood: -hood, mask: -mask, as theme choices.look):
  <name>-rig<suffix>.svg  the body sheet with the front arm left out (8 x 2 cells, same fit as the
                          look's own sheet): 0-1 idle, 2-9 walk (8 steps), 10 ready, 11 strike,
                          12 recover, 13 work-raise, 14 work-impact, 15 dash
  <name>-arm<suffix>.svg  that look's front arm as two bones (2 x 1 cells): 0 upper arm (pivot:
                          shoulder), 1 forearm + hand (pivot: elbow), both hanging straight down
and once:
  grip-<tool>.svg  axe, pick, sword, broadsword, flamberge, katana drawn upright, the grip on the sprite anchor
and src/rig-data.mjs: per look, the shoulder in every body cell and the bone lengths, plus the arm
and grip sprite frames, in world units (src/player-rig.mjs reads it, so art and motion agree).
"""
import json, math, os
import lib
import actors, items, longnight, wanderers, yomi

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
TARGETS = json.load(open(os.path.join(HERE, "footprints.json")))

CELL = (512, 768)
WORLD = (2.25, 3.38)                     # theme.json size of a wanderer cell
ANCHOR = (.5, .04)
LINE = lib.line_for(WORLD[0])            # outline width in a 512 px cell, same as the wanderer sheets
KX = WORLD[0] / CELL[0]                  # world units per cell pixel
ARM_CELL, ARM_JOINT = 128, (64, 24)      # arm cells: square, joint near the top

# Each look's drawing, its own sheet (for the fit) and its front arm, as the look draws it
# (actors.arm(shoulder, .., sleeve, sleeve_d, hand, L1, L2, width, hand size)).
LOOKS = {
    "witch": dict(suffix="", draw=actors.witch, sheet=lambda n: actors.SPRITES[n], shoulder=(306, 492),
                  L1=62, L2=56, w=30, hand=34, sleeve=lambda p: (p["cloak"], p["cloak_d"]), hand_col=actors.SKIN),
    "hood": dict(suffix="-hood", draw=wanderers.hooded, sheet=lambda n: wanderers.SPRITES[f"{n}-hood"], shoulder=(300, 470),
                 L1=70, L2=62, w=32, hand=36, sleeve=lambda p: (p["cloak"], p["cloak_d"]), hand_col=wanderers.GLOVE),
    "mask": dict(suffix="-mask", draw=wanderers.masked, sheet=lambda n: wanderers.SPRITES[f"{n}-mask"], shoulder=(302, 474),
                 L1=68, L2=60, w=30, hand=34, sleeve=lambda p: ("#524463", "#3e3446"), hand_col=actors.SKIN, bracer=True),
}


def fit(name, look):
    """The exact transform build_sheet gives the look's own sheet, so the rig sheet lines up cell for cell."""
    spec = LOOKS[look]["sheet"](name)
    frames = spec["frames"]
    t = spec["target"]
    target = tuple(TARGETS[t]) if isinstance(t, str) else tuple(t)
    lib.K = 1.0
    bbs = [lib.bbox(fn()) for fn in frames]
    s, ox, oy = lib.fit_transform(lib.union_bb(bbs), target, "bottom", bbs[0])
    lib.K = LINE / (lib.BASE_LINE * s)
    bbs = [lib.bbox(fn()) for fn in frames]
    s, ox, oy = lib.fit_transform(lib.union_bb(bbs), target, "bottom", bbs[0])
    lib.K = 1.0
    return s, ox, oy


def walk(i, n=8):
    """Eight walk steps from the four hand-placed ones in actors.witch_frames, as one smooth cycle."""
    a = 2 * math.pi * i / n
    c, s = math.cos(a), math.sin(a)
    return dict(feet=[(-34 * c, 26 * max(0, -s)), (32 * c, 26 * max(0, s))],
                ab=(22 * c, 12 * c), by=-10 * abs(s), hem=-8 * c, hat=-4 * c + 2 * s)


RIG_FRAMES = [
    dict(), dict(by=5, hat=4),
    *[walk(i) for i in range(8)],
    # ready: weight back, free hand forward for balance
    dict(feet=[(-40, 0), (30, 0)], by=4, ab=(34, 40), hem=-6, hat=-4, eyes="focus", mouth="smile"),
    # strike: lunge, free hand flung back
    dict(feet=[(-48, 0), (42, 0)], by=12, ab=(-44, -56), hem=12, hat=6, eyes="focus", mouth="shout"),
    # recover
    dict(feet=[(-42, 0), (36, 0)], by=6, ab=(-18, -22), hem=6, hat=2, eyes="open", mouth="o"),
    # work-raise: planted, chest up
    dict(feet=[(-38, 0), (36, 0)], by=-3, ab=(18, 30), hem=-4, hat=-6, eyes="focus", mouth="smile"),
    # work-impact: knees bent, the whole body behind the blow
    dict(feet=[(-44, 0), (42, 0)], by=20, ab=(-10, 6), hem=10, hat=8, eyes="closed", mouth="shout"),
    # dash (as the sheets' frame 12)
    dict(ab=(-70, -80), lean=20, by=6, feet=[(-70, 18), (50, 0)], hem=-24, hat=-12, eyes="focus", mouth="smile", fx="dash"),
]


def shoulder(P, look):
    """Front shoulder of a rig cell in the look's drawing coordinates (lean turns the body about the hip)."""
    by = P.get("by", 0)
    sx, sy = LOOKS[look]["shoulder"]
    x, y = sx, sy + by
    lean = P.get("lean", 0)
    if lean:
        x, y = actors.rot_pt((x, y), (256, 640 + by), lean)
    return x, y


def to_world(x, y, s, ox, oy):
    """drawing point -> world offset from the sprite anchor (x right, y up)."""
    cx, cy = ox + s * x, oy + s * y
    ax, ay = CELL[0] * ANCHOR[0], CELL[1] * (1 - ANCHOR[1])
    return round((cx - ax) * KX, 4), round((ay - cy) * KX, 4)


def sheet(cells, cols, rows, cell, scale=.5):
    w, h = cell
    defs, body = [], []
    for i, (d, b) in enumerate(cells):
        defs += d
        body.append(f'<g transform="translate({(i % cols) * w} {(i // cols) * h})">{b}</g>')
    return lib.svg_doc("".join(defs), "".join(body), f"0 0 {w * cols} {h * rows}", int(w * cols * scale), int(h * rows * scale))


def rig_sheet(name, look):
    s, ox, oy = fit(name, look)
    lib.K = LINE / (lib.BASE_LINE * s)
    cells = []
    for P in RIG_FRAMES:
        d, b = LOOKS[look]["draw"](name, {**P, "noarm": True})
        cells.append((d, f'<g transform="translate({lib.f(ox)} {lib.f(oy)}) scale({s:.5f})">{b}</g>'))
    lib.K = 1.0
    return sheet(cells, 8, 2, CELL)


def hand_at(L):
    return L["L2"] + L["hand"] * .55            # elbow -> hand centre (the grip), as actors.arm


def arm_sheet(name, look):
    s, _, _ = fit(name, look)
    L, pal = LOOKS[look], actors.WITCHES[name]
    sleeve, sleeve_d = L["sleeve"](pal)
    lib.K = LINE / (lib.BASE_LINE * s)
    upper = actors.bar((0, 0), (0, L["L1"] - 4), L["w"], sleeve)
    fore = actors.bar((0, 2), (0, L["L2"] - 2), L["w"] - 4, sleeve_d)
    hy, hs = hand_at(L), L["hand"]
    fore += lib.rrect(-hs / 2, hy - hs / 2, hs, hs * .92, 11, L["hand_col"], 7)
    if L.get("bracer"):
        fore += lib.line(f"M-14 {hy - 22} L14 {hy - 26}", 8, wanderers.LEATHER)
    jx, jy = ARM_JOINT
    cells = [([], f'<g transform="translate({jx} {jy}) scale({s:.5f})">{b}</g>') for b in (upper, fore)]
    lib.K = 1.0
    return sheet(cells, 2, 1, (ARM_CELL, ARM_CELL))


# Tools drawn upright, the hand on (0, 0). `undo` reverses the G() placement the item sprite uses,
# `grip` is the middle of the handle wrap, `length` the world length of the whole tool.
GRIP_CELL, GRIP_AT = 512, (256, 400)
TOOLS = {
    "axe": dict(fn=items.axe, undo=(200, 740, 28), grip=-75, length=1.35, span=384),
    "pick": dict(fn=items.pick, undo=(210, 740, 24), grip=-75, length=1.35, span=414),
    "sword": dict(fn=items.sword, undo=(256, 560, 38), grip=66, length=1.6, span=446),
    "broadsword": dict(fn=longnight.broadsword, undo=(256, 560, 0), grip=66, length=1.7, span=446),
    "flamberge": dict(fn=longnight.flamberge, undo=(256, 560, 0), grip=59, length=1.75, span=476),
    # Kagekiri (src/magic/katana.mjs): the Yomi katana, drawn in tools/art/yomi.py.
    "katana": dict(fn=lambda: yomi.katana(False), undo=(256, 470, 0), grip=117, length=1.75, span=524),
}


def tool_scale(tool):
    t = TOOLS[tool]
    return t["length"] / (t["span"] * KX)        # tool units -> cell pixels


def grip_sprite(tool):
    t = TOOLS[tool]
    k = tool_scale(tool)
    lib.K = LINE / (lib.BASE_LINE * k)
    d, b = t["fn"]()
    tx, ty, rot = t["undo"]
    local = f'<g transform="rotate({-rot}) translate({-tx} {-ty})">{b}</g>'
    gx, gy = GRIP_AT
    svg = sheet([(d, f'<g transform="translate({gx} {gy}) scale({k:.5f}) translate(0 {-t["grip"]})">{local}</g>')], 1, 1, (GRIP_CELL, GRIP_CELL))
    lib.K = 1.0
    return svg


def rig_data():
    """src/rig-data.mjs: everything the game needs to pin bones and tools on a wanderer."""
    looks = {}
    for look, L in LOOKS.items():
        s, ox, oy = fit("ember", look)    # the four wanderers share each look's silhouette and fit
        for name in actors.WITCHES:
            assert fit(name, look) == (s, ox, oy), (name, look)
        unit = s * KX                     # drawing unit -> world
        looks[look] = {"shoulders": [to_world(*shoulder(P, look), s, ox, oy) for P in RIG_FRAMES],
                       "upper": round(L["L1"] * unit, 4), "fore": round(hand_at(L) * unit, 4)}
    data = {
        "looks": looks,
        "arm": {"size": [round(ARM_CELL * KX, 4)] * 2,
                "anchor": [ARM_JOINT[0] / ARM_CELL, round(1 - ARM_JOINT[1] / ARM_CELL, 4)]},
        "grip": {"size": [round(GRIP_CELL * KX, 4)] * 2,
                 "anchor": [GRIP_AT[0] / GRIP_CELL, round(1 - GRIP_AT[1] / GRIP_CELL, 5)]},
        "frames": {"idle": [0, 1], "walk": list(range(2, 10)), "ready": 10, "strike": 11, "recover": 12,
                   "raise": 13, "impact": 14, "dash": 15},
    }
    js = ("// Generated by tools/art/rig.py — do not edit by hand. World units, x right / y up from the\n"
          "// wanderer sprite's anchor: per look, the front shoulder in each rig cell and the bone lengths.\n"
          f"export const RIG_DATA = Object.freeze({json.dumps(data)});\n")
    open(os.path.join(ROOT, "src", "rig-data.mjs"), "w").write(js)
    return data


SPRITES = {}
for _name in actors.WITCHES:
    for _look, _L in LOOKS.items():
        SPRITES[f"{_name}-rig{_L['suffix']}"] = {"builder": (lambda n, l: lambda: rig_sheet(n, l))(_name, _look)}
        SPRITES[f"{_name}-arm{_L['suffix']}"] = {"builder": (lambda n, l: lambda: arm_sheet(n, l))(_name, _look)}
for _tool in TOOLS:
    SPRITES[f"grip-{_tool}"] = {"builder": (lambda t: lambda: grip_sprite(t))(_tool)}


if __name__ == "__main__":
    print(json.dumps(rig_data(), indent=1))
