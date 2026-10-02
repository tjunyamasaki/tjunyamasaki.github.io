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
THEME = json.load(open(os.path.join(ROOT, "themes", "harvest", "theme.json")))


def world_widths():
    """Sprite file name -> the widest world size the game draws it at (theme.json). A weapon sheet
    is also drawn in the hand (`held-*`, larger), camp options and looks reuse their key's size."""
    out = {}
    def note(src, width):
        if isinstance(src, str):
            name = src.split("?")[0].split("/")[-1]
            out[name] = max(out.get(name, 0), width)
    for key, d in THEME["sprites"].items():
        note(d.get("src"), d["size"][0])
    for choice in THEME.get("choices", {}).values():
        for opt in choice.get("options", {}).values():
            for key, src in opt.get("srcs", {}).items():
                note(src, THEME["sprites"][key]["size"][0])
            if "suffix" in opt:
                for key in choice.get("keys", []):
                    note(f"{key}{opt['suffix']}.svg", THEME["sprites"][key]["size"][0])
    return out


WORLD = world_widths()


def line(key):
    """Outline width for sprite `key`'s 512 px cell, from the world size the game draws it at."""
    width = WORLD.get(f"{key}.svg")
    if not width:
        print(f"  ! {key}: no world size in theme.json, keeping the legacy line")
        return None
    return lib.line_for(width)


def icon_line():
    return lib.line_for(lib.ICON_WU, big=False)


def target(t):
    return tuple(TARGETS[t]) if isinstance(t, str) else tuple(t)


def registry():
    import nodes, structures, items, actors, longnight, arsenal, wanderers, camp, frontier, scenery, refine, relics, vigil
    reg = {}
    for mod in (nodes, structures, items, actors, longnight, arsenal, wanderers, camp, frontier, scenery, refine, relics, vigil):
        for key, spec in getattr(mod, "SPRITES", getattr(mod, "NODES", {})).items():
            reg[key] = spec
    return reg


# Inventory / recipe icons: tight square framing so small slots stay readable.
ICON_KEYS = ["wood", "stone", "grass", "soul", "seed", "berry", "pumpkin", "mushroom", "meat", "roast", "stew",
             "bandage", "axe", "pick", "spear", "sword", "armor", "lantern"]


def build_icon(key, spec):
    fn = spec[0] if isinstance(spec, tuple) else spec["frames"][0]
    svg = lib.build_sheet([fn], 1, 1, (36, 36, 476, 476), cell=(512, 512), out_scale=.375, align="center", center_on_first=False, line=icon_line())
    open(os.path.join(SPRITES, f"{key}-icon.svg"), "w").write(svg)


def build(key, spec):
    """spec: (fn, target) for one frame, dict(frames=[fn..], cols, rows, target), or dict(builder=fn) for a packed atlas."""
    if isinstance(spec, dict) and "builder" in spec:
        svg = spec["builder"]()
        open(os.path.join(SPRITES, f"{key}.svg"), "w").write(svg)
        return svg
    lw = line(key)
    if isinstance(spec, tuple):
        fn, t = spec
        svg = lib.build_sheet([fn], 1, 1, target(t), line=lw)
    else:
        cell = spec.get("cell", (512, 768))
        svg = lib.build_sheet(spec["frames"], spec["cols"], spec["rows"], target(spec["target"]), cell=cell,
                              line=None if lw is None else lw * cell[0] / 512)
        if spec.get("icon"):
            icon = lib.build_sheet(spec["frames"][:1], 1, 1, target(spec["target"]), line=lw)
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
        thumbs.append((k, im, tuple(c // 2 for c in reg[k].get("cell", (512, 768))) if isinstance(reg[k], dict) else (256, 384)))
        print("built", k, im.size)
    import longnight, arsenal, frontier, scenery, refine, relics, vigil
    icons = {**longnight.ICONS, **arsenal.ICONS, **getattr(frontier, "ICONS", {}), **getattr(scenery, "ICONS", {}), **refine.ICONS, **relics.ICONS, **vigil.ICONS}
    wide = {**longnight.WIDE, **arsenal.WIDE, **getattr(frontier, "WIDE", {}), **getattr(scenery, "WIDE", {})}
    for k, fn in icons.items():
        if a.only and k not in keys:
            continue
        svg = lib.build_sheet([fn], 1, 1, (36, 36, 476, 476), cell=(512, 512), out_scale=.375, align="center", center_on_first=False, line=icon_line())
        open(os.path.join(SPRITES, f"{k}-icon.svg"), "w").write(svg)
    for k, fn in wide.items():
        if a.only and k not in keys:
            continue
        svg = lib.build_sheet([fn], 1, 1, (20, 20, 492, 236), cell=(512, 256), out_scale=.5, align="center", center_on_first=False, line=line(k))
        open(os.path.join(SPRITES, f"{k}.svg"), "w").write(svg)
        thumbs.append((k, lib.render_png(svg)))
    if not a.only or "plaza" in keys:
        import camp
        camp.write_decals(SPRITES)
    if not a.only or "magic" in keys:
        import magic
        for k, im in magic.build_magic(ROOT).items():
            print("built magic", k, im.size)
    if a.preview:
        preview(thumbs, a.preview)


def preview(thumbs, out, cols=10):
    cw, ch = 256, 384
    cells = []
    for k, im, *size in thumbs:
        cw0, ch0 = size[0] if size else (cw, ch)
        for r in range(max(1, im.height // ch0)):
            for c in range(max(1, im.width // cw0)):
                cell = im.crop((c * cw0, r * ch0 - (ch - ch0), c * cw0 + cw, r * ch0 + ch0))
                if cell.getbbox():
                    cells.append(cell)
    cols = min(cols, len(cells)); rows = (len(cells) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cw, rows * ch), (118, 104, 84, 255))
    for i, cell in enumerate(cells):
        sheet.alpha_composite(cell, ((i % cols) * cw, (i // cols) * ch))
    sheet.save(out)


if __name__ == "__main__":
    main()
