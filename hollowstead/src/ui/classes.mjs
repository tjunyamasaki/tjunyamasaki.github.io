// Classes mode views. Pure markup from plain world data; main.mjs owns the DOM and sends the commands
// (src/classes/mode.mjs runs them on the host).
import {CLASSES, CLASS_RULES, barView, classOf, learnBlock, learnReason, pointsFree, pointsSpent, talentRank, tierGate, ultimateView} from '../classes/registry.mjs?v=harvest-18';
import {CLASS_MODE} from '../classes/mode.mjs?v=harvest-18';

const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const KIND = {skill: 'ACTIVE SKILL', passive: 'PASSIVE', capstone: 'CAPSTONE'};

/** The first screen: one card per class. */
export function classPickMarkup(icon = () => '', {current = null} = {}){
  return Object.values(CLASSES).map(def => {
    const mine = def.id === current;
    const skills = Object.values(def.skills).map(s => `<li><i>${escape(s.glyph)}</i>${escape(s.name)}</li>`).join('');
    return `<button type="button" class="class-card${mine ? ' current' : ''}" data-class="${escape(def.id)}" ${mine ? 'disabled ' : ''}aria-label="${escape(def.name)}" style="--class-color:${escape(def.resource.color || '#ff8fb3')}">`
      + `<span class="class-card-icon">${icon(def.weapon)}</span><b>${escape(def.name)}</b><small class="class-role">${escape(def.role)}</small>`
      + `<span class="class-blurb">${escape(def.blurb)}</span>`
      + `<span class="class-trees">${def.trees.map(t => `<em>${escape(t.name)} · ${escape(t.sub)}</em>`).join('')}</span>`
      + `<ul class="class-skills">${skills}<li class="ult"><i>${escape(def.ultimate.glyph)}</i>${escape(def.ultimate.name)}</li></ul>`
      + `<span class="class-go">${mine ? 'Your path' : current ? 'Take up this path →' : 'Walk this path →'}</span></button>`;
  }).join('');
}

/** The skill bar: four slots (keys 1-4) and the class resource. Static parts only; main.mjs sets the rings. */
export function classBarMarkup(world, p){
  const def = classOf(p);
  if(!def) return '';
  const slots = barView(world, p).map(v => v.id
    ? `<button type="button" class="class-slot" data-slot="${v.slot}" data-class-skill="${escape(v.id)}" title="${escape(v.skill.name)} (${v.slot+1}) · ${escape(v.skill.text)}" aria-label="${escape(v.skill.name)}, key ${v.slot+1}">`
      + `<span class="class-glyph" aria-hidden="true">${escape(v.skill.glyph)}</span><small>${escape(v.skill.name)}</small><kbd>${v.slot+1}</kbd>`
      + (v.skill.cost ? `<i class="class-cost">${v.skill.spendAll ? `${v.skill.cost}+` : v.skill.cost}</i>` : '') + `<i class="class-rank">${'•'.repeat(v.rank)}</i></button>`
    : `<button type="button" class="class-slot empty" data-slot="${v.slot}" data-class-panel="talents" aria-label="Empty skill slot ${v.slot+1}: open the talents"><span class="class-glyph" aria-hidden="true">+</span><small>Learn</small><kbd>${v.slot+1}</kbd></button>`).join('');
  return `<div class="class-resource" role="progressbar" aria-label="${escape(def.resource.name)}" aria-valuemin="0" aria-valuemax="${def.resource.max}"><span>${escape(def.resource.name.toUpperCase())}</span><i><em id="class-ki-bar"></em></i><b id="class-ki-value">0</b></div>`
    + slots;
}
/** Per-frame state of the bar and the ultimate, for main.mjs to paint without rebuilding markup. */
export function classBarState(world, p){
  const def = classOf(p);
  if(!def) return null;
  const pct = (cd, max) => cd > 0 ? Math.max(0, Math.min(1, cd/Math.max(.01, max))) : 0;
  return {
    ki: Math.round(p.ki || 0), kiMax: def.resource.max,
    slots: barView(world, p).filter(v => v.id).map(v => ({id: v.id, cd: pct(v.cd, v.max), block: v.block})),
    ultimate: (() => {const u = ultimateView(world, p); return u && {name: u.skill.name, text: u.skill.text, cost: u.skill.cost, level: u.skill.level, cd: pct(u.cd, u.max), block: u.block};})(),
  };
}

/** Tools strip under the vitals: the tree (with unspent points), the test switches. */
/** Skill-button layouts round Attack (styles/classes.css): picked on the strip, kept per browser. */
export const CLASS_LAYOUTS = Object.freeze({arc: 'Arc', block: 'Block', tower: 'Tower'});
export function classStripMarkup(p, {open = '', tools = true, layout = 'arc'} = {}){
  const free = classOf(p) ? pointsFree(p) : 0;
  return `<button type="button" data-class-panel="talents" aria-pressed="${open === 'talents'}" class="${free ? 'has-points' : ''}" title="Talents (T)">✧<small>Talents</small>${free ? `<i class="class-points">${free}</i>` : ''}</button>`
    + `<button type="button" data-class-layout="next" title="Skill buttons: ${escape(CLASS_LAYOUTS[layout] || '')} (tap for the next layout)">▦<small>${escape(CLASS_LAYOUTS[layout] || 'Layout')}</small></button>`
    + (tools ? `<button type="button" data-class-panel="tools" aria-pressed="${open === 'tools'}" title="Test tools">⚙<small>Tools</small></button>` : '');
}

/** The talent tree: three branches side by side, tiers top to bottom, and the selected talent's card. */
export function talentTreeMarkup(p, {selected = ''} = {}){
  const def = classOf(p);
  if(!def) return '';
  const free = pointsFree(p), spent = pointsSpent(p);
  const columns = def.trees.map(tree => {
    const inTree = pointsSpent(p, tree.id);
    const tiers = Array.from({length: CLASS_RULES.tiers}, (_, tier) => {
      const open = inTree >= tierGate(tier);
      const cells = [0, 1, 2].map(col => {
        const entry = Object.entries(def.nodes).find(([, n]) => n.tree === tree.id && n.tier === tier && n.col === col);
        if(!entry) return '<span class="talent-gap"></span>';
        const [id, node] = entry, rank = talentRank(p, id), why = learnBlock(p, id);
        const state = rank >= node.max ? 'maxed' : rank > 0 ? 'learned' : !why ? 'ready' : why === 'points' && open && (!node.req || talentRank(p, node.req)) ? 'open' : 'locked';
        return `<button type="button" class="talent talent-${node.kind} talent-${state}${id === selected ? ' selected' : ''}" data-talent="${escape(id)}" aria-pressed="${id === selected}" aria-label="${escape(node.name)}, ${rank} of ${node.max}">`
          + `<span class="talent-glyph" aria-hidden="true">${escape(node.glyph || '•')}</span><small>${escape(node.name)}</small><i>${rank}/${node.max}</i>`
          + (node.req ? `<span class="talent-req" aria-hidden="true"></span>` : '') + '</button>';
      }).join('');
      return `<div class="talent-tier${open ? '' : ' shut'}"><span class="tier-gate">${tier ? tierGate(tier) : ''}</span>${cells}</div>`;
    }).join('');
    return `<section class="talent-tree tree-${escape(tree.id)}"><header><b>${escape(tree.name)}</b> <span>${escape(tree.sub)}</span><em>${inTree}</em></header><p>${escape(tree.blurb)}</p>${tiers}</section>`;
  }).join('');
  const node = def.nodes[selected];
  let card = `<p class="talent-hint">Tap a talent to read it. Each level gives a point; a branch's next row opens every ${CLASS_RULES.tierPoints} points spent in it. Active skills go on the bar (keys 1-4); ${escape(def.ultimate.name)} is on ✦ (Q) from level ${def.ultimate.level}.</p>`;
  if(node){
    const rank = talentRank(p, selected), why = learnReason(p, selected), skill = def.skills[selected];
    const next = rank < node.max ? node.text(rank+1) : '';
    card = `<div class="talent-card"><p class="eyebrow">${KIND[node.kind] || ''} · ${rank}/${node.max}</p><h3>${escape(node.glyph || '')} ${escape(node.name)}</h3>`
      + (skill ? `<p class="talent-meta">${skill.cost ? `${skill.spendAll ? `${skill.cost}+ (all)` : skill.cost} ${escape(def.resource.name)} · ` : ''}${skill.cooldown(p)}s recharge</p>` : '')
      + (rank ? `<p><b>Now:</b> ${escape(node.text(rank))}</p>` : '')
      + (next ? `<p><b>${rank ? 'Next rank' : 'Rank 1'}:</b> ${escape(next)}</p>` : '')
      + (node.req ? `<p class="muted small">Requires ${escape(def.nodes[node.req].name)}.</p>` : '')
      + `<button type="button" class="primary" data-talent-learn="${escape(selected)}" ${why ? 'disabled' : ''}>${rank >= node.max ? 'Fully learned' : `Learn${rank ? ' next rank' : ''} · 1 point`}</button>`
      + (why && rank < node.max ? `<p class="talent-why">${escape(why)}</p>` : '') + '</div>';
  }
  const traits = def.traits.map(t => `<li><b>${escape(t.name)}.</b> ${escape(t.text)}</li>`).join('');
  return `<div class="talents-head"><div><b>${escape(def.name)}</b> · level ${p.level || 1}<br><span>${free} point${free === 1 ? '' : 's'} to spend · ${spent} spent</span></div>`
    + `<button type="button" data-class-op="respec" ${spent ? '' : 'disabled'}>Reset points</button></div>`
    + `<div class="talent-trees">${columns}</div>${card}<ul class="class-traits">${traits}</ul>`;
}

/** Test tools: levels, foes, waves, and the switches. */
export function classToolsMarkup(world, p){
  const a = world?.arena || {};
  const toggle = (key, text) => `<button type="button" class="lab-toggle" data-class-op="toggle:${key}" aria-pressed="${!!a[key]}"><span>${escape(text)}</span><b>${a[key] ? 'On' : 'Off'}</b></button>`;
  return `<div class="lab-row"><span>Level</span><div class="lab-stepper"><button type="button" data-class-op="level:-5">−5</button><button type="button" data-class-op="level:-1">−1</button><b>${p?.level || 1}</b><button type="button" data-class-op="level:1">+1</button><button type="button" data-class-op="level:5">+5</button></div></div>`
    + `<p class="muted small">Levelling down refunds every point.</p>`
    + `<div class="lab-row"><span>Foes</span><div class="lab-chips">${CLASS_MODE.spawnCounts.map(n => `<button type="button" class="chip" data-class-op="spawn:${n}">+${n}</button>`).join('')}<button type="button" class="chip" data-class-op="clear">Clear</button></div></div>`
    + `<div class="lab-row"><span>Waves</span><div class="lab-chips"><button type="button" class="chip" data-class-op="wave">Next wave</button><button type="button" class="chip" data-class-op="ki">Fill Ki</button></div></div>`
    + `<div class="lab-toggles">${toggle('god', 'Invulnerable')}${toggle('hold', 'Hold the waves (after this one)')}${toggle('freeSkills', 'Free skills (no recharge or Ki)')}</div>`
    + `<p class="muted small">Wave ${a.wave || 0}${a.best ? ` · best ${a.best}` : ''}. Kills give experience; every level is a talent point.</p>`;
}
