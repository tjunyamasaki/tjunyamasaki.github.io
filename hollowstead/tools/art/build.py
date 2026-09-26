"""Build every Hollowstead sprite.

    python3 tools/art/build.py [--only key1,key2] [--preview out.png]

Requires: pip install cairosvg pillow
Writes SVG sprite sheets to themes/harvest/sprites/ and PNGs to assets/magic/.
"""
import json, os, sys, argparse
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lib
from PIL import Image

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SPRITES = os.path.join(ROOT, "themes", "harvest", "sprites")
TARGETS = json.load(open(os.path.join(HERE, "footprints.json")))


def target(t):
    return tuple(TARGETS[t]) if isinstance(t, str) else tuple(t)


def registry():
    import nodes, structures, items, actors, longnight
    reg = {}
    for mod in (nodes, structures, items, actors, longnight):
        for key, spec in getattr(mod, "SPRITES", getattr(mod, "NODES", {})).items():
            reg[key] = spec
    return reg


# Inventory / recipe icons: tight square framing so small slots stay readable.
ICON_KEYS = ["wood", "stone", "grass", "soul", "seed", "berry", "pumpkin", "mushroom", "meat", "roast", "stew",
             "bandage", "axe", "pick", "spear", "sword", "armor", "lantern"]


def build_icon(key, spec):
    fn = spec[0] if isinstance(spec, tuple) else spec["frames"][0]
    svg = lib.build_sheet([fn], 1, 1, (36, 36, 476, 476), cell=(512, 512), out_scale=.375, align="center", center_on_first=False)
    open(os.path.join(SPRITES, f"{key}-icon.svg"), "w").write(svg)


def build(key, spec):
    """spec: (fn, target) for one frame, or dict(frames=[fn..], cols, rows, target)."""
    if isinstance(spec, tuple):
        fn, t = spec
        svg = lib.build_sheet([fn], 1, 1, target(t))
    else:
        svg = lib.build_sheet(spec["frames"], spec["cols"], spec["rows"], target(spec["target"]))
        if spec.get("icon"):
            icon = lib.build_sheet(spec["frames"][:1], 1, 1, target(spec["target"]))
            open(os.path.join(SPRITES, f"{key}-icon.svg"), "w").write(icon)
    if key in ICON_KEYS:
        build_icon(key, spec)
    path = os.path.join(SPRITES, f"{key}.svg")
    open(path, "w").write(svg)
    return svg


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    ap.add_argument("--preview")
    a = ap.parse_args()
    reg = registry()
    keys = a.only.split(",") if a.only else list(reg)
    todo = [k for k in keys if k in reg]
    thumbs = []
    for k in todo:
        svg = build(k, reg[k])
        im = lib.render_png(svg)
        thumbs.append((k, im))
        print("built", k, im.size)
    import longnight
    for k, fn in longnight.ICONS.items():
        if a.only and k not in keys:
            continue
        svg = lib.build_sheet([fn], 1, 1, (36, 36, 476, 476), cell=(512, 512), out_scale=.375, align="center", center_on_first=False)
        open(os.path.join(SPRITES, f"{k}-icon.svg"), "w").write(svg)
    for k, fn in longnight.WIDE.items():
        if a.only and k not in keys:
            continue
        svg = lib.build_sheet([fn], 1, 1, (20, 20, 492, 236), cell=(512, 256), out_scale=.5, align="center", center_on_first=False)
        open(os.path.join(SPRITES, f"{k}.svg"), "w").write(svg)
        thumbs.append((k, lib.render_png(svg)))
    if not a.only or "magic" in keys:
        import magic
        for k, im in magic.build_magic(ROOT).items():
            print("built magic", k, im.size)
    if a.preview:
        preview(thumbs, a.preview)


def preview(thumbs, out, cols=10):
    cw, ch = 256, 384
    cells = []
    for k, im in thumbs:
        for r in range(max(1, im.height // ch)):
            for c in range(max(1, im.width // cw)):
                cell = im.crop((c * cw, r * ch, c * cw + cw, r * ch + ch))
                if cell.getbbox():
                    cells.append(cell)
    cols = min(cols, len(cells)); rows = (len(cells) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cw, rows * ch), (118, 104, 84, 255))
    for i, cell in enumerate(cells):
        sheet.alpha_composite(cell, ((i % cols) * cw, (i // cols) * ch))
    sheet.save(out)


if __name__ == "__main__":
    main()
