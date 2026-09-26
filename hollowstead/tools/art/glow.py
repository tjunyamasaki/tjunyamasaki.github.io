"""Glow layers: the parts of each creature that shine in the dark (eyes, lanterns, crystals).

    python3 tools/art/glow.py

Renders every creature sheet, keeps only pixels close to that creature's glow colours, and
writes a same-sized PNG (a bright core plus a soft halo) to themes/harvest/sprites/glow/.
The renderers draw it on top of the creature with additive blending, unaffected by darkness,
and blink it now and then.
"""
import io, os, sys
import cairosvg
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SPRITES = os.path.join(ROOT, "themes", "harvest", "sprites")
OUT = os.path.join(SPRITES, "glow")

GLOWS = {
    "crawler": ["#f6c35a"],
    "wraith": ["#7fd6c4"],
    "brute": ["#f6c35a"],
    "king": (["#f4a64a"], (0, .52)),   # face only: his tunic shares the flame gold
    "bonewalker": ["#ff5a44"],
    "bogling": ["#e8f5a0"],
    "golem": ["#dcc8f7"],
}


def hex_rgb(h):
    h = h.lstrip("#"); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=float)


def glow_layer(key, colours, tol=34, scale=2.0, region=None, rows=2):
    png = cairosvg.svg2png(url=os.path.join(SPRITES, f"{key}.svg"), scale=scale)
    im = np.asarray(Image.open(io.BytesIO(png)).convert("RGBA")).astype(float)
    rgb, alpha = im[..., :3], im[..., 3]
    mask = np.zeros(alpha.shape)
    colour = np.zeros(rgb.shape)
    for c in colours:
        target = hex_rgb(c)
        d = np.sqrt(((rgb - target) ** 2).sum(-1))
        hit = np.clip(1 - d / tol, 0, 1) * (alpha / 255)
        colour = np.where((hit > mask)[..., None], target, colour)
        mask = np.maximum(mask, hit)
    if region:
        y = (np.arange(mask.shape[0]) % (mask.shape[0] / rows)) / (mask.shape[0] / rows)
        mask *= ((y >= region[0]) & (y <= region[1]))[:, None]
    core = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
    mask = np.maximum(mask, np.asarray(core).astype(float) / 255)
    halo = np.asarray(core.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(26 * scale / 2))).astype(float) / 255
    base = hex_rgb(colours[0])
    tint = np.where((mask > .05)[..., None], colour, base)
    a = np.maximum(mask, np.clip(halo * 2.2, 0, .85))
    light = np.clip(tint * (1 - .45 * mask[..., None]) + 255 * .45 * mask[..., None], 0, 255)
    out = np.dstack([light, np.clip(a * 255, 0, 255)]).astype(np.uint8)
    img = Image.fromarray(out, "RGBA")
    img = img.resize((img.width // 2, img.height // 2), Image.LANCZOS)
    img.save(os.path.join(OUT, f"{key}.png"), optimize=True)
    return img, float(mask.sum())


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for key, spec in GLOWS.items():
        cols, region = spec if isinstance(spec, tuple) else (spec, None)
        img, px = glow_layer(key, cols, region=region)
        print("glow", key, img.size, "lit pixels", int(px))
