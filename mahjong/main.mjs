import {createNetwork} from './network.mjs';
import {mountGuide} from './rules.mjs';
import {tile, tileName, tileLabel, meldTiles, stringTiles, winds, windKanji, yakuNames, escapeHTML as esc} from './tiles.mjs';

const $ = id => document.getElementById(id);
const number = value => Number(value || 0).toLocaleString('en-US');
const botNames = ['Hana', 'Ren', 'Aki'];
let state, worker, network, room = '', mode = 'home', isHost = false, key = 'host';
let members = [], config = {}, selected = -1, riichiMode = false, awaitingToken = null;
let lastEvent = 0, handSignature = '', resultSignature = '', toastTimer, effectTimer, hintBusy = false;
let prefs = {labels: true, sound: false, haptics: true, calm: matchMedia('(prefers-reduced-motion: reduce)').matches};
try { prefs = {...prefs, ...JSON.parse(localStorage.getItem('yoru-preferences') || '{}')}; $('name').value = localStorage.getItem('yoru-name') || 'Traveler'; } catch {}
const patch = (id, html) => { const el = $(id); if (el._markup !== html) { el.innerHTML = html; el._markup = html; } };
function showScreen(next) {
  mode = next;
  for (const id of ['home', 'lobby', 'game']) $(id).hidden = id !== next;
  document.body.classList.toggle('at-table', next === 'game');
  $('leave-game').hidden = next !== 'game';
  $('return-room').hidden = next !== 'game' || !isHost || !network;
}
function toast(message, error = false) {
  $('toast').textContent = message;
  $('toast').className = `toast visible${error ? ' error' : ''}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), error ? 8000 : 3500);
}
function getConfig() {
  const name = $('name').value.trim().replace(/[\x00-\x1f]/g, '').slice(0, 16) || 'Traveler';
  try { localStorage.setItem('yoru-name', name); } catch {}
  return {name, length: $('match-length').value, speed: $('pace').value};
}
function preferences() {
  document.body.classList.toggle('labels-off', !prefs.labels);
  document.body.classList.toggle('calm', prefs.calm);
  $('labels-toggle').checked = prefs.labels; $('sound-toggle').checked = prefs.sound;
  $('haptics-toggle').checked = prefs.haptics; $('motion-toggle').checked = prefs.calm;
  $('sound-button').setAttribute('aria-pressed', prefs.sound);
  $('sound-button').setAttribute('aria-label', prefs.sound ? 'Turn sound off' : 'Turn sound on');
  $('sound-button').innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z${prefs.sound ? 'M15 8c3 2 3 6 0 8M18 5c6 4 6 10 0 14' : 'M16 9l5 6m0-6-5 6'}"/></svg>`;
  try { localStorage.setItem('yoru-preferences', JSON.stringify(prefs)); } catch {}
}

let audio;
function unlockAudio() {
  if (!prefs.sound) return;
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') void audio.resume().catch(() => {}); } catch {}
}
function sound(kind = 'tile') {
  if (!prefs.sound || !audio || audio.state !== 'running') return;
  const frequencies = kind === 'win' ? [392, 523.25, 659.25, 783.99] : kind === 'call' ? [440, 659.25] : kind === 'deal' ? [330, 440, 523.25] : kind === 'select' ? [710] : [370];
  frequencies.forEach((frequency, index) => {
    const oscillator = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime + index * .08;
    oscillator.type = kind === 'tile' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    if (kind === 'tile') oscillator.frequency.exponentialRampToValueAtTime(170, now + .055);
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(kind === 'tile' ? .075 : .055, now + .007);
    gain.gain.exponentialRampToValueAtTime(.001, now + (kind === 'win' ? .6 : .18));
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(now); oscillator.stop(now + .7);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  });
}
function haptic(long = false) { if (prefs.haptics) try { navigator.vibrate?.(long ? [18, 40, 12] : 8); } catch {} }
document.addEventListener('pointerdown', unlockAudio, {passive: true});

function createRoomNetwork() {
  return createNetwork({
    isLobby: () => mode === 'lobby',
    onJoin: (peerKey, name) => { members.push({key: peerKey, name, bot: false}); renderLobby(); toast(`${name} took a seat.`); },
    onPeerLeave: peerKey => {
      const member = members.find(p => p.key === peerKey);
      if (mode === 'lobby') { members = members.filter(p => p.key !== peerKey); renderLobby(); }
      else { worker?.postMessage({type: 'replace', key: peerKey}); if (member) member.bot = true; }
      if (member) toast(mode === 'lobby' ? `${member.name} left the table.` : `${member.name} disconnected. A bot has taken over.`);
    },
    onMessage: (peerKey, data) => {
      if (isHost && peerKey) worker?.postMessage({...data, key: peerKey});
      else if (data.type === 'state') acceptState(data);
      else if (data.type === 'lobby') {
        worker?.terminate(); worker = null; state = null;
        if ($('result-dialog').open) $('result-dialog').close();
        members = data.members; config = data.config; room = data.room;
        $('fill-bots').checked = data.fillBots; showScreen('lobby'); renderLobby(false);
        if (data.starting) $('lobby-caption').textContent = 'The host is dealing the first hand…';
      }
    },
    onReady: id => { key = id; $('connect-button').disabled = false; $('join-dialog').close(); },
    onStatus: (message, error) => toast(message, error),
    onLeave: () => { cleanup(); showScreen('home'); $('connect-button').disabled = false; }
  });
}
function renderLobby(broadcast = true) {
  $('room-code').textContent = room || '·····';
  $('fill-bots').disabled = !isHost;
  $('copy-code').disabled = !room; $('share-button').disabled = !room;
  const fill = $('fill-bots').checked;
  patch('lobby-seats', Array.from({length: 4}, (_, index) => {
    const member = members[index], name = member?.name || (fill ? botNames[Math.max(0, index - 1)] : 'Open seat');
    return `<div class="lobby-seat ${!member && !fill ? 'empty' : ''}"><span class="lobby-avatar">${member ? windKanji[index] : fill ? ['花', '蓮', '秋'][Math.max(0, index - 1)] : '＋'}</span><strong>${esc(name)}</strong><small>${member ? member.key === key ? 'YOU · READY' : index === 0 ? 'HOST · READY' : 'FRIEND · READY' : fill ? 'BOT · READY' : 'WAITING FOR A FRIEND'}</small></div>`;
  }).join(''));
  const description = config.length === 'south' ? 'East + South' : config.length === 'single' ? 'One hand' : 'East round';
  $('lobby-rules').textContent = `${description} · Red fives · Open tanyao`;
  $('lobby-caption').textContent = !room ? 'Opening your private room…' : isHost ? 'Share the code. Settle in. Deal when you are ready.' : 'You are connected. The host will deal when everyone is ready.';
  $('start-button').disabled = !isHost || !room || (!fill && members.length < 4);
  $('start-button').innerHTML = isHost ? `Deal the first hand <span>→</span>` : 'Waiting for the host';
  if (isHost && broadcast) network?.broadcast({type: 'lobby', members, config: {length: config.length, speed: config.speed}, room, fillBots: fill});
}
function beginMatch() {
  worker?.terminate();
  state = null; selected = -1; handSignature = ''; resultSignature = ''; lastEvent = 0;
  awaitingToken = null; riichiMode = false; hintBusy = false;
  if ($('result-dialog').open) $('result-dialog').close();
  const seats = members.filter(member => !member.bot).map(member => ({...member}));
  while (seats.length < 4) seats.push({key: `bot-${seats.length}`, name: botNames[Math.max(0, seats.length - 1)], bot: true});
  network?.broadcast({type: 'lobby', members, config: {length: config.length, speed: config.speed}, room, fillBots: true, starting: true});
  showScreen('game');
  patch('actions', '<div class="waiting"><span class="waiting-dot"></span>Shuffling the tiles…</div>');
  $('action-message').textContent = 'A new evening. A fresh hand.';
  worker = new Worker(new URL('./engine.worker.mjs', import.meta.url), {type: 'module'});
  worker.onmessage = ({data}) => {
    if (data.type === 'error') {
      console.error(data.detail);
      toast(data.message, true);
      awaitingToken = null;
      if (state) { renderActions(); renderResult(); }
      return;
    }
    if (data.type !== 'frames') return;
    for (const [peerKey, frame] of Object.entries(data.frames)) {
      if (peerKey === key) acceptState(frame);
      else network?.sendTo(peerKey, frame);
    }
  };
  worker.onerror = error => { console.error(error.message); toast('The game could not load. Return home and try again.', true); };
  worker.postMessage({type: 'start', ...config, online: !!network, seats});
  window.scrollTo({top: 0, behavior: 'instant'});
}
function sendAction(type, extra = {}) {
  const data = {type, key, ...extra};
  if (worker) worker.postMessage(data); else network?.send(data);
}
function choose(index) {
  if (!state?.action || awaitingToken === state.action.token) return;
  awaitingToken = state.action.token;
  sendAction('choose', {token: state.action.token, index}); haptic();
  renderActions();
}
function discardOption(index = selected) {
  const p = state?.hand[index]; if (!p) return null;
  const drawn = !!state.drawn && index === state.hand.length - 1;
  const options = state.action?.options.filter(o => o.kind === (riichiMode ? 'riichi' : 'discard') && o.tile === p) || [];
  return options.find(o => o.discard?.endsWith('_') === drawn) || options[0];
}
function selectTile(index) {
  if (!state?.hand[index]) return;
  const option = discardOption(index);
  if (selected === index && option) return choose(option.index);
  selected = index; sound('select'); haptic(); renderHand(); renderActions();
}
function acceptState(next) {
  if (state && next.seq <= state.seq) return;
  const previous = state;
  state = next;
  if (mode !== 'game') { showScreen('game'); window.scrollTo({top: 0, behavior: 'instant'}); }
  if (previous?.action?.token !== state.action?.token) {
    selected = -1; riichiMode = false; awaitingToken = null; hintBusy = false;
    if (!state.drawn && state.action?.options?.some(o => o.kind === 'discard')) {
      selected = state.hand.findIndex((_, index) => discardOption(index));
    }
  }
  if (state.hint) hintBusy = false;
  renderTable(); renderHand(); renderActions(); renderResult();
  if (state.event.id !== lastEvent) { lastEvent = state.event.id; effects(state.event); }
}
function renderTable() {
  $('round-name').textContent = `${winds[state.round]} ${state.handNumber}`;
  $('table-mode').textContent = network ? `ROOM ${room} · ${isHost ? 'HOST' : 'CONNECTED'}` : 'A TABLE OF YOUR OWN';
  $('center-round').textContent = `${windKanji[state.round]}${['一', '二', '三', '四'][state.handNumber - 1]}局`;
  $('remaining').textContent = state.remaining; $('honba').textContent = state.honba; $('sticks').textContent = state.sticks;
  patch('dora', state.dora.map(p => tile(p)).join(''));
  patch('opponents', state.seats.map(seat => {
    const relative = (seat.wind - state.wind + 4) % 4;
    const badge = `<button class="opponent pos-${relative}${state.turn === seat.wind ? ' active' : ''}${seat.riichi ? ' riichi' : ''}" data-inspect="${seat.wind}" aria-label="Inspect ${esc(seat.name)}'s discards"><span class="seat-symbol">${windKanji[seat.wind]}</span><strong>${esc(seat.name)}${seat.bot ? '<span class="bot-tag">AI</span>' : ''}</strong><span class="seat-score">${number(seat.score)}</span>${seat.riichi ? '<i class="riichi-stick" title="Riichi"></i>' : ''}</button>`;
    if (!relative) return badge;
    return badge + `<div class="concealed pos-${relative}" aria-label="${seat.count} concealed tiles">${Array.from({length: seat.count}, () => tile('_')).join('')}</div><div class="opponent-melds pos-${relative}">${seat.melds.map(meldTiles).join('')}</div>`;
  }).join(''));
  patch('rivers', state.seats.map(seat => {
    const relative = (seat.wind - state.wind + 4) % 4;
    return `<button class="river pos-${relative}" data-inspect="${seat.wind}" aria-label="Enlarge ${esc(seat.name)}'s ${seat.discards.length} discards">${seat.discards.map((p, index) => {
      const latest = state.event.kind === 'dapai' && state.event.wind === seat.wind && index === seat.discards.length - 1;
      return tile(p.slice(0, 2), `${/[+=-]$/.test(p) ? 'claimed' : ''} ${p.includes('*') ? 'declared' : ''} ${latest ? 'latest' : ''} ${latest && state.event.id !== lastEvent ? 'arriving' : ''}`);
    }).join('')}</button>`;
  }).join(''));
  const own = state.seats[state.wind];
  $('your-wind').textContent = windKanji[state.wind]; $('your-name').textContent = own.name; $('your-score').textContent = number(own.score);
  $('hand-quality').className = `hand-quality${state.furiten ? ' danger' : state.shanten === 0 || own.riichi ? ' ready' : ''}`;
  $('hand-quality').textContent = state.furiten ? 'Furiten · tsumo only' : own.riichi ? '立直 · Riichi' : state.shanten === 0 ? 'Tenpai · one tile away' : state.shanten < 0 ? 'Complete shape' : `${state.shanten} from tenpai${state.closed ? ' · Closed' : ' · Open'}`;
  patch('your-melds', own.melds.map(meldTiles).join(''));
}
function renderHand() {
  if (!state) return;
  const signature = state.hand.join('') + ':' + state.drawn;
  if (signature !== handSignature) {
    $('hand').innerHTML = state.hand.map((p, index) => tile(p, state.drawn && index === state.hand.length - 1 ? 'drawn new-tile' : '', `data-tile-index="${index}"`, true)).join('');
    handSignature = signature;
  }
  for (const button of $('hand').children) {
    const index = +button.dataset.tileIndex, option = discardOption(index);
    button.classList.toggle('selected', selected === index);
    button.classList.toggle('illegal', !!state.action?.options?.some(o => o.kind === (riichiMode ? 'riichi' : 'discard')) && !option);
    button.classList.toggle('riichi-choice', riichiMode && !!option);
    button.classList.toggle('hinted', !!state.hint && state.hint.token === state.action?.token && state.hint.tile === state.hand[index]);
    button.setAttribute('aria-pressed', selected === index);
    button.setAttribute('aria-label', `${tileName(state.hand[index])}${state.drawn && index === state.hand.length - 1 ? ', drawn tile' : ''}${riichiMode && option ? ', riichi discard' : ''}`);
  }
}
function renderActions() {
  if (!state) return;
  const action = state.action, options = action?.options || [], hasDiscards = options.some(o => o.kind === 'discard');
  const waiting = awaitingToken === action?.token;
  $('hint-button').disabled = !hasDiscards || waiting || hintBusy || state.hint?.token === state.action?.token;
  $('hint-button').textContent = hintBusy ? 'Considering your hand…' : '✧ Suggest a discard';
  let message;
  if (riichiMode) message = 'Riichi · choose a highlighted discard. Stake: 1,000 points.';
  else if (hasDiscards && !state.drawn) message = selected >= 0 && discardOption() ? `${tileName(state.hand[selected])} · ready to discard` : 'After that call, discard a highlighted tile. Dimmed tiles are not allowed.';
  else if (selected >= 0) message = tileName(state.hand[selected]) + (discardOption() ? ' · ready to discard' : ' · inspect your tile');
  else if (hasDiscards) message = 'Your turn. What will you let go?';
  else if (options.some(o => o.kind !== 'continue')) message = 'An opportunity. Call a tile, or let it pass.';
  else message = state.result ? 'A hand to remember.' : `${state.seats[state.turn]?.name || 'The table'} is playing…`;
  $('action-message').textContent = message;
  $('hand-tip').textContent = state.hint ? `Suggestion: ${tileName(state.hint.tile)}${state.hint.riichi ? ' · consider riichi' : ''}.` : state.waits.length ? `Waiting for ${state.waits.map(tileLabel).join(' · ')}${state.furiten ? '. Ron is blocked.' : ''}` : hasDiscards && !state.drawn ? 'Dimmed tiles cannot be discarded after that call.' : 'Select a tile. Tap it again or press Discard.';
  if (waiting || !options.length) {
    patch('actions', '<div class="waiting"><span class="waiting-dot"></span>' + (state.result ? 'Waiting for the next hand' : waiting ? 'At the table…' : 'Watch the discards. Your moment is coming.') + '</div>'); return;
  }
  const buttons = [];
  if (hasDiscards) {
    const option = discardOption();
    buttons.push(`<button class="button primary discard" id="discard-button" ${!option ? 'disabled' : ''}>${riichiMode ? 'Declare riichi' : selected < 0 ? 'Select a tile to discard' : `Discard ${tileLabel(state.hand[selected])}`} <span>→</span></button>`);
    if (options.some(o => o.kind === 'riichi')) buttons.push(`<button class="button call-button" id="riichi-button" aria-pressed="${riichiMode}">${riichiMode ? 'Cancel riichi' : '立直 Riichi'}</button>`);
  }
  for (const option of options) {
    if (['discard', 'riichi', 'continue'].includes(option.kind)) continue;
    const name = {tsumo: '自摸 Tsumo', ron: '栄和 Ron', chi: 'Chi', pon: 'Pon', kan: 'Kan', abort: 'Nine terminals · Draw', pass: 'Pass'}[option.kind];
    buttons.push(`<button class="button ${['tsumo', 'ron'].includes(option.kind) ? 'win-button' : option.kind === 'pass' ? 'secondary' : 'call-button'}" data-choice="${option.index}">${name}${option.meld ? meldTiles(option.meld) : ''}</button>`);
  }
  if (options.some(o => o.kind === 'continue')) buttons.push('<div class="waiting">Review the hand, then continue.</div>');
  patch('actions', buttons.join(''));
}
function renderResult() {
  const r = state.result;
  if (!r) { if ($('result-dialog').open) $('result-dialog').close(); resultSignature = ''; return; }
  const signature = JSON.stringify(r);
  if (signature !== resultSignature) {
    resultSignature = signature;
    if (r.kind === 'match') {
      const sorted = [...state.seats].sort((a, b) => r.ranks[a.id] - r.ranks[b.id]);
      const won = r.ranks[state.seats[state.wind].id] === 1;
      patch('result-content', `<p class="eyebrow">THE LAST TILE HAS FALLEN</p><div class="result-kanji">終局</div><h2 id="result-title">${won ? 'The night is yours.' : 'Until the next hand.'}</h2><p class="result-subtitle">${esc(sorted[0].name)} takes the table.</p><div class="score-list">${sorted.map(seat => `<div class="score-row"><span><span class="rank-number">${r.ranks[seat.id]}</span>${esc(seat.name)}</span><b>${number(r.scores[seat.id])} <small>pts</small></b></div>`).join('')}</div>`);
      if (won) particles(); sound('win');
    } else {
      const win = r.kind === 'win', winner = win ? state.seats[r.l] : null;
      const drawName = {'荒牌平局': 'The wall is empty.', '九種九牌': 'Nine terminals.', '四風連打': 'Four winds in a row.', '四家立直': 'Four riichi declarations.', '四開槓': 'Four kans.', '三家和': 'Three ron declarations.', '流し満貫': 'Nagashi mangan.'}[r.name] || 'A drawn hand.';
      const kanji = win ? r.baojia == null ? '自摸' : '栄和' : '流局';
      const hand = win ? `<div class="winning-hand">${stringTiles(r.shoupai).map(p => tile(p)).join('')}${r.shoupai.split(',').slice(1).filter(Boolean).map(meldTiles).join('')}</div>` : '';
      const limit = r.damanguan ? `${r.damanguan > 1 ? r.damanguan + ' × ' : ''}YAKUMAN` : r.fanshu >= 13 ? 'KAZOE YAKUMAN' : r.fanshu >= 11 ? 'SANBAIMAN' : r.fanshu >= 8 ? 'BAIMAN' : r.fanshu >= 6 ? 'HANEMAN' : r.defen >= (r.l === 0 ? 12000 : 8000) ? 'MANGAN' : '';
      patch('result-content', `<p class="eyebrow">${win ? 'A MOMENT WORTH WAITING FOR' : 'THE TABLE TAKES A BREATH'}</p><div class="result-kanji">${kanji}</div><h2 id="result-title">${win ? `${esc(winner.name)} ${r.baojia == null ? 'draws the winner.' : 'calls ron.'}` : drawName}</h2>${win ? `<p class="result-subtitle">${r.baojia == null ? 'A winning tile from the wall.' : `On ${esc(state.seats[r.baojia].name)}'s discard.`}</p>${hand}<div class="result-points">${number(r.defen)} <span style="font-size:16px">points</span></div><div class="result-limit">${limit ? limit + ' · ' : ''}${r.damanguan ? 'LIMIT HAND' : `${r.fanshu} HAN · ${r.fu || 0} FU`}</div><div class="yaku-list">${(r.hupai || []).map(y => `<div class="yaku-row"><span>${esc(yakuNames[y.name] || y.name)}</span><span>${typeof y.fanshu === 'number' ? `${y.fanshu} han` : 'Yakuman'}</span></div>`).join('')}</div>` : '<p class="result-subtitle">Points settle according to the table rules.</p>'}<div class="score-list">${state.seats.map(seat => `<div class="score-row"><span>${esc(seat.name)}${!win && r.shoupai[seat.wind] ? ' <small>· Tenpai / revealed</small>' : ''}</span><b class="${r.fenpei[seat.wind] >= 0 ? 'positive' : 'negative'}">${r.fenpei[seat.wind] > 0 ? '+' : ''}${number(r.fenpei[seat.wind])} <small>→ ${number(seat.score + r.fenpei[seat.wind])}</small></b></div>`).join('')}</div>${r.fubaopai?.length ? `<div class="ura-row">URA INDICATORS ${r.fubaopai.map(p => tile(p)).join('')}</div>` : ''}`);
      if (win) { sound('win'); haptic(true); if (r.l === state.wind) particles(); }
    }
  }
  const canContinue = state.action?.options.some(o => o.kind === 'continue') && awaitingToken !== state.action.token;
  $('continue-button').disabled = r.kind === 'match' ? !!network && !isHost : !canContinue;
  $('continue-button').textContent = r.kind === 'match' ? network ? isHost ? 'Back to the lobby →' : 'Waiting for the host' : 'Another evening · Play again →' : canContinue ? 'Continue →' : 'Waiting for the other players…';
  if (!$('result-dialog').open) $('result-dialog').showModal();
}
function effects(event) {
  if (event.kind === 'dapai') sound('tile');
  if (event.kind === 'deal') { sound('deal'); showCall('配牌', 'A NEW HAND', `${winds[state.round]} ${state.handNumber} · ${state.seats[0].name} deals`); }
  if (event.kind === 'call') {
    const call = {lizhi: ['立直', 'RIICHI'], chi: ['吃', 'CHI'], peng: ['碰', 'PON'], gang: ['槓', 'KAN'], zimo: ['自摸', 'TSUMO'], rong: ['栄和', 'RON']}[event.call];
    if (call) { showCall(call[0], call[1], state.seats[event.wind].name); sound('call'); }
  }
}
function showCall(kanji, english, name) {
  const el = $('call-effect');
  el.classList.remove('show'); el.innerHTML = `<strong>${kanji}</strong><span>${english}</span><small>${esc(name)}</small>`;
  requestAnimationFrame(() => { el.classList.add('show'); });
  clearTimeout(effectTimer); effectTimer = setTimeout(() => el.classList.remove('show'), 1300);
}
function particles() {
  if (prefs.calm || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (let index = 0; index < 18; index++) {
    const particle = document.createElement('i'); particle.className = 'spark-particle'; particle.setAttribute('aria-hidden', 'true');
    particle.style.cssText = `--x:${20 + Math.random() * 60}%;--dx:${Math.random() * 180 - 90}px;--delay:${Math.random() * .4}s`;
    document.body.append(particle); setTimeout(() => particle.remove(), 2700);
  }
}
function inspect(wind) {
  if (!state?.seats[wind]) return;
  const seat = state.seats[wind];
  $('inspect-title').textContent = `${seat.name} · ${winds[wind]}`;
  patch('inspected-tiles', (seat.melds.length ? `<div class="inspect-melds">${seat.melds.map(meldTiles).join('')}</div>` : '') + (seat.discards.map(p => tile(p.slice(0, 2), `${/[+=-]$/.test(p) ? 'claimed' : ''} ${p.includes('*') ? 'declared' : ''}`)).join('') || '<p class="muted">No discards yet.</p>'));
  $('inspect-dialog').showModal();
}
function pauseIfNeeded() { if (worker && !network) worker.postMessage({type: 'pause', value: document.hidden || $('settings-dialog').open || $('guide-dialog').open}); }
function cleanup() {
  worker?.terminate(); worker = null;
  const oldNetwork = network; network = null; void oldNetwork?.stop();
  state = null; room = ''; members = []; key = 'host'; isHost = false;
  handSignature = ''; resultSignature = ''; lastEvent = 0;
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
}
function backToLobby() {
  worker?.terminate(); worker = null; state = null;
  members = members.filter(member => !member.bot);
  $('result-dialog').close(); $('settings-dialog').close();
  showScreen('lobby'); renderLobby();
}

$('solo-button').onclick = () => { cleanup(); config = getConfig(); isHost = true; members = [{key, name: config.name, bot: false}]; beginMatch(); };
$('host-button').onclick = async () => {
  cleanup(); config = getConfig(); isHost = true; members = [{key, name: config.name, bot: false}];
  network = createRoomNetwork(); const current = network;
  showScreen('lobby'); renderLobby(false);
  try { room = await current.create(); if (current === network) renderLobby(); }
  catch (error) { if (current === network) { cleanup(); showScreen('home'); toast('The room could not open. Check your connection and try again.', true); console.error(error); } }
};
$('join-button').onclick = () => { $('join-dialog').showModal(); };
$('join-code').oninput = () => { $('join-code').value = $('join-code').value.toUpperCase().replace(/[^A-Z2-9]/g, ''); };
$('join-form').onsubmit = async e => {
  e.preventDefault(); if ($('connect-button').disabled) return;
  config = getConfig(); isHost = false; room = $('join-code').value.trim().toUpperCase();
  $('connect-button').disabled = true; $('connect-button').textContent = 'Finding your seat…';
  const old = network; network = null; void old?.stop();
  network = createRoomNetwork(); const current = network;
  try { await current.join(room, config.name); }
  catch (error) { if (current === network) { void current.stop(); network = null; toast(error.message || 'Unable to join.', true); $('connect-button').disabled = false; $('connect-button').textContent = 'Find my seat →'; } }
};
$('join-dialog').addEventListener('close', () => {
  $('connect-button').textContent = 'Find my seat →';
  if ($('connect-button').disabled && mode === 'home') { void network?.stop(); network = null; $('connect-button').disabled = false; }
});
$('start-button').onclick = () => { if (isHost && room && ($('fill-bots').checked || members.length === 4)) beginMatch(); };
$('fill-bots').onchange = () => renderLobby();
$('leave-lobby').onclick = () => { cleanup(); showScreen('home'); };
$('copy-code').onclick = async () => { try { await navigator.clipboard.writeText(room); $('copy-label').textContent = 'Copied ✓'; setTimeout(() => $('copy-label').textContent = 'Tap to copy ↗', 2000); } catch { toast(`Room code: ${room}`); } };
$('share-button').onclick = async () => {
  const url = new URL('./', location.href); url.searchParams.set('room', room);
  try { if (navigator.share) await navigator.share({title: 'A seat at Yoru', text: `Join my riichi table. Room ${room}.`, url: url.href}); else { await navigator.clipboard.writeText(url.href); toast('Invite link copied.'); } }
  catch (error) { if (error.name !== 'AbortError') toast(`Invite your friends with room code ${room}.`); }
};
$('hand').onclick = e => { const el = e.target.closest('[data-tile-index]'); if (el) selectTile(+el.dataset.tileIndex); };
$('hand').onkeydown = e => {
  const el = e.target.closest('[data-tile-index]'); if (!el || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault(); const index = (+el.dataset.tileIndex + (e.key === 'ArrowRight' ? 1 : -1) + state.hand.length) % state.hand.length;
  selected = index; renderHand(); renderActions(); $('hand').children[index].focus();
};
$('actions').onclick = e => {
  const choice = e.target.closest('[data-choice]'); if (choice) choose(+choice.dataset.choice);
  if (e.target.closest('#discard-button')) { const option = discardOption(); if (option) choose(option.index); }
  if (e.target.closest('#riichi-button')) { riichiMode = !riichiMode; selected = -1; renderHand(); renderActions(); }
};
$('hint-button').onclick = () => { if (!state?.action || hintBusy) return; hintBusy = true; sendAction('hint', {token: state.action.token}); renderActions(); };
$('table').onclick = e => { const el = e.target.closest('[data-inspect]'); if (el) inspect(+el.dataset.inspect); };
$('continue-button').onclick = () => {
  if (state?.result?.kind === 'match') { if (network && isHost) backToLobby(); else if (!network) beginMatch(); }
  else { const option = state?.action?.options.find(o => o.kind === 'continue'); if (option) { choose(option.index); renderResult(); } }
};
$('result-dialog').addEventListener('cancel', e => e.preventDefault());
for (const button of document.querySelectorAll('[data-close]')) button.onclick = () => button.closest('dialog').close();
$('help-button').onclick = () => { $('guide-dialog').showModal(); pauseIfNeeded(); };
$('settings-button').onclick = $('table-menu').onclick = () => {
  $('pause-note').textContent = mode === 'game' && !network ? 'Your solo table is paused while this menu is open.' : mode === 'game' ? 'Online play continues while this menu is open.' : 'Preferences are saved on this device.';
  $('settings-dialog').showModal(); pauseIfNeeded();
};
for (const id of ['settings-dialog', 'guide-dialog']) $(id).addEventListener('close', pauseIfNeeded);
$('sound-button').onclick = () => { prefs.sound = !prefs.sound; preferences(); unlockAudio(); sound('select'); };
for (const [id, prop] of [['labels-toggle', 'labels'], ['sound-toggle', 'sound'], ['haptics-toggle', 'haptics'], ['motion-toggle', 'calm']]) $(id).onchange = () => { prefs[prop] = $(id).checked; preferences(); unlockAudio(); };
$('leave-game').onclick = () => { cleanup(); showScreen('home'); };
$('return-room').onclick = () => { if (isHost && network) backToLobby(); };
document.addEventListener('visibilitychange', pauseIfNeeded);
window.addEventListener('pagehide', () => { worker?.terminate(); void network?.stop(); });
setInterval(() => {
  const deadline = state?.action?.deadline;
  $('turn-clock').textContent = deadline ? `${Math.max(0, Math.ceil((deadline - Date.now()) / 1000))}s` : '';
}, 1000);

patch('hero-tiles', ['s1', 'm1', 'z7', 'p5', 's8'].map((p, i) => tile(p, '', `style="--i:${i};--angle:${[-14, -6, 0, 7, 16][i]}deg;--lift:${[12, -10, -20, -10, 12][i]}px"`)).join(''));
mountGuide();
preferences();
const invite = new URLSearchParams(location.search).get('room');
if (invite && /^[A-HJ-NP-Z2-9]{5}$/i.test(invite)) { $('join-code').value = invite.toUpperCase(); $('join-dialog').showModal(); }
