// Frontier HUD: one module per feature, each drawing into its own element under #feature-hud.
// main.mjs calls bind() once, paint() about five times a second and frame() every frame while playing.
// ctx: {world, me, localId, mode, send, toast, icon, theme, renderer, sheet, openSheet, closeSheet, refresh}.
// Each module builds its own DOM (index.html only holds the #feature-hud container) and its own
// stylesheet in styles/<feature>.css. Keep paint() cheap: compare a signature before touching the DOM.

import * as moon from './moon.mjs?v=harvest-18';
import * as frontier from './frontier.mjs?v=harvest-18';
import * as cart from './cart.mjs?v=harvest-18';
import * as rhythm from './rhythm.mjs?v=harvest-18';
import * as trinkets from './trinkets.mjs?v=harvest-18';
import * as dungeon from './dungeon.mjs?v=harvest-18';

const MODULES = [moon, frontier, cart, rhythm, trinkets, dungeon];

export function bindFeatureHud(ctx){for(const m of MODULES)m.bind?.(ctx);}
export function paintFeatureHud(ctx){for(const m of MODULES)m.paint?.(ctx);}
export function frameFeatureHud(ctx, dt){for(const m of MODULES)m.frame?.(ctx, dt);}
