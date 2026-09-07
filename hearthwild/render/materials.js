// Palette-aware material registry. Later dynamic entities can acquire materials after the first frame.
import { EMBER, MOONLIT, paletteColor } from '../data/palettes.mjs';

export function createMaterialRegistry(T) {
  let palette = 'moonlit';
  const entries = [];
  const lights = [];
  const vertexGeoms = [];
  const shared = new Map();

  function current() {
    return palette === 'ember' ? EMBER : MOONLIT;
  }

  function meshMaterial(color, options = {}) {
    const key = `mesh:${color}/${options.emissive ?? 0}/${options.emissiveIntensity ?? 0}/${options.roughness ?? 0.95}/${options.metalness ?? 0}/${options.vertexColors ?? false}/${options.side ?? 'front'}/${options.transparent ?? false}/${options.opacity ?? 1}/${options.blending ?? 'n'}`;
    if (shared.has(key)) return shared.get(key);
    const material = new T.MeshStandardMaterial({
      color,
      roughness: options.roughness ?? 0.95,
      metalness: options.metalness ?? 0,
      flatShading: options.flatShading ?? true,
      emissive: options.emissive ?? 0,
      emissiveIntensity: options.emissiveIntensity ?? 0,
      vertexColors: options.vertexColors ?? false,
      side: options.side ?? T.FrontSide,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1,
      blending: options.blending ?? T.NormalBlending,
      depthWrite: options.depthWrite ?? true,
    });
    entries.push({ material, color, emissive: options.emissive ?? 0 });
    shared.set(key, material);
    return material;
  }

  function basicMaterial(color, options = {}) {
    const key = `basic:${color}/${options.transparent ?? false}/${options.opacity ?? 1}/${options.side ?? 'front'}/${options.blending ?? 'n'}/${options.depthWrite ?? true}`;
    if (shared.has(key)) return shared.get(key);
    const material = new T.MeshBasicMaterial({
      color,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1,
      side: options.side ?? T.FrontSide,
      blending: options.blending ?? T.NormalBlending,
      depthWrite: options.depthWrite ?? true,
    });
    entries.push({ material, color, emissive: 0 });
    shared.set(key, material);
    return material;
  }

  function lineMaterial(color, options = {}) {
    const material = new T.LineBasicMaterial({
      color,
      transparent: true,
      opacity: options.opacity ?? 0.45,
      depthWrite: false,
    });
    entries.push({ material, color, emissive: 0 });
    return material;
  }

  function spriteMaterial(map, color, options = {}) {
    const material = new T.SpriteMaterial({
      map,
      color,
      transparent: true,
      opacity: options.opacity ?? 0.7,
      blending: options.blending ?? T.AdditiveBlending,
      depthWrite: false,
    });
    entries.push({ material, color, emissive: 0 });
    return material;
  }

  function registerLight(light) {
    lights.push({
      light,
      color: light.color.getHex(),
      ground: light.groundColor ? light.groundColor.getHex() : undefined,
      intensity: light.intensity,
    });
  }

  function registerVertexColors(geometry) {
    vertexGeoms.push({
      geometry,
      colors: Array.from(geometry.attributes.color.array),
    });
  }

  function setPalette(name) {
    palette = name === 'ember' ? 'ember' : 'moonlit';
    for (const entry of entries) {
      entry.material.color.setHex(paletteColor(entry.color, palette));
      if (entry.material.emissive) entry.material.emissive.setHex(paletteColor(entry.emissive, palette));
    }
    for (const item of lights) {
      item.light.color.setHex(paletteColor(item.color, palette));
      if (item.ground !== undefined) item.light.groundColor.setHex(paletteColor(item.ground, palette));
      item.light.intensity = item.intensity * (palette === 'ember' && item.light.isDirectionalLight ? 0.88 : 1);
    }
    const tint = new T.Color();
    for (const item of vertexGeoms) {
      const attribute = item.geometry.attributes.color;
      for (let i = 0; i < item.colors.length; i += 3) {
        tint.setRGB(item.colors[i], item.colors[i + 1], item.colors[i + 2]);
        tint.setHex(paletteColor(tint.getHex(), palette));
        attribute.setXYZ(i / 3, tint.r, tint.g, tint.b);
      }
      attribute.needsUpdate = true;
    }
    return current();
  }

  function dispose() {
    for (const entry of entries) entry.material.dispose();
    entries.length = 0;
    lights.length = 0;
    vertexGeoms.length = 0;
    shared.clear();
  }

  return { meshMaterial, basicMaterial, lineMaterial, spriteMaterial, registerLight, registerVertexColors, setPalette, dispose, current, get palette() { return palette; } };
}
