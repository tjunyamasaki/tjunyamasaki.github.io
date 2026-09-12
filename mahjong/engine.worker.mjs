import {Majiang, AI} from './vendor/majiang.mjs';

// The table and every bot live off the UI thread. Only explicit, seat-specific
// snapshots leave this worker; the wall and other concealed hands never do.
let game, players = [], seats = [], pending = new Map(), result = null;
let seq = 0, token = 0, event = {id: 0, kind: 'deal'}, publishTimer, paused = false;
let online = false, pace = 450, hints = new Map();
const optionsFor = (values, kind, key) => (values || []).map(value => ({kind, tile: key === 'dapai' ? value.slice(0, 2) : null, discard: key === 'dapai' ? value : null, meld: key === 'fulou' || key === 'gang' ? value : null, reply: {[key]: value}}));
function tiles(hand) {
  return (hand.toString().split(',')[0].match(/[mpsz]\d+/g) || []).flatMap(group => [...group.slice(1)].map(n => group[0] + n));
}
function emit(kind, data = {}) { event = {id: event.id + 1, kind, ...data}; publish(); }
function publish() {
  clearTimeout(publishTimer);
  publishTimer = setTimeout(() => {
    if (!game?.model.shan) return;
    const model = game.model;
    const publicSeats = model.player_id.map((id, wind) => ({
      id, wind, name: seats[id].name, bot: seats[id].bot,
      score: model.defen[id], riichi: model.shoupai[wind].lizhi,
      count: tiles(model.shoupai[wind]).length, melds: [...model.shoupai[wind]._fulou],
      discards: [...model.he[wind]._pai]
    }));
    const frames = {};
    seq++;
    for (const seat of seats) {
      if (seat.bot) continue;
      const wind = model.player_id.indexOf(seat.id), hand = model.shoupai[wind];
      const request = pending.get(seat.id);
      const shanten = Majiang.Util.xiangting(hand);
      frames[seat.key] = {
        type: 'state', seq, phase: result?.kind === 'match' ? 'finished' : 'playing',
        wind, seats: publicSeats, round: model.zhuangfeng, handNumber: model.jushu + 1,
        honba: model.changbang, sticks: model.lizhibang, remaining: model.shan.paishu,
        dora: [...model.shan.baopai], turn: model.lunban, hand: tiles(hand),
        drawn: hand._zimo?.length === 2 ? hand._zimo : null,
        closed: hand.menqian, shanten, waits: shanten === 0 && !hand._zimo ? Majiang.Util.tingpai(hand) : [],
        furiten: shanten === 0 && !players[seat.id]._neng_rong && !request?.options.some(o => o.kind === 'ron'),
        action: request ? {token: request.token, options: request.options.map(({reply, ...option}, index) => ({...option, index})), deadline: request.deadline} : null,
        hint: hints.get(seat.id) || null, event, result, paused
      };
    }
    postMessage({type: 'frames', frames});
  }, 0);
}

function ask(player, options) {
  if (!options.length) return player._callback();
  const id = player._id, callback = player._callback;
  const request = {token: ++token, options, callback, deadline: online ? Date.now() + 60000 : null};
  pending.set(id, request);
  hints.delete(id);
  // Offline play has no clock. Online rooms cannot be held indefinitely by an
  // abandoned tab. A timeout passes calls or discards a legal tile; never wins.
  if (online) request.timer = setTimeout(() => {
    if (pending.get(id) !== request) return;
    const fallback = options.findIndex(o => o.kind === 'pass' || o.kind === 'continue');
    choose(id, request.token, fallback >= 0 ? fallback : options.findIndex(o => o.kind === 'discard'));
  }, 60000);
  publish();
}
function choose(id, choiceToken, index) {
  const request = pending.get(id);
  if (!request || request.token !== choiceToken || !Number.isInteger(index) || !request.options[index]) return;
  pending.delete(id); clearTimeout(request.timer); hints.delete(id);
  request.callback(request.options[index].reply);
  publish();
}

class SeatPlayer extends AI {
  get isBot() { return seats[this._id]?.bot; }
  action_zimo(data, kan) {
    if (this.isBot) return super.action_zimo(data, kan);
    if (data.l !== this._menfeng) return this._callback();
    const options = optionsFor(this.get_dapai(this.shoupai), 'discard', 'dapai');
    if (this.select_hule(null, kan) || (this._diyizimo && Majiang.Util.xiangting(this.shoupai) === -1)) options.push({kind: 'tsumo', reply: {hule: '-'}});
    options.push(...optionsFor(this.get_gang_mianzi(this.shoupai), 'kan', 'gang'));
    options.push(...optionsFor(this.allow_lizhi(this.shoupai), 'riichi', 'dapai').map(o => ({...o, reply: {dapai: o.reply.dapai + '*'}})));
    if (this.allow_pingju(this.shoupai)) options.push({kind: 'abort', reply: {daopai: '-'}});
    // After riichi, drawing and discarding is automatic until a real decision.
    if (this.shoupai.lizhi && options.length === 1) return this._callback(options[0].reply);
    ask(this, options);
  }
  action_dapai(data) {
    if (this.isBot) return super.action_dapai(data);
    if (data.l === this._menfeng) return this._callback();
    const tile = data.p.slice(0, 2) + ['', '+', '=', '-'][(4 + data.l - this._menfeng) % 4];
    const options = [];
    if (this.select_hule(data)) options.push({kind: 'ron', tile: data.p.slice(0, 2), reply: {hule: '-'}});
    options.push(...optionsFor(this.get_peng_mianzi(this.shoupai, tile), 'pon', 'fulou'));
    options.push(...optionsFor(this.get_gang_mianzi(this.shoupai, tile), 'kan', 'fulou'));
    options.push(...optionsFor(this.get_chi_mianzi(this.shoupai, tile), 'chi', 'fulou'));
    if (!options.length) return this._callback();
    options.push({kind: 'pass', reply: {}});
    ask(this, options);
  }
  action_fulou(data) {
    if (this.isBot) {
      try { return super.action_fulou(data); }
      catch {
        const tile = this.get_dapai(this.shoupai)?.[0];
        return this._callback(tile ? {dapai: tile} : {});
      }
    }
    if (data.l !== this._menfeng || /^[mpsz]\d{4}/.test(data.m)) return this._callback();
    const tilesToDiscard = this.get_dapai(this.shoupai) || this.shoupai.get_dapai(false) || [];
    ask(this, optionsFor(tilesToDiscard, 'discard', 'dapai'));
  }
  action_gang(data) {
    if (this.isBot) return super.action_gang(data);
    if (data.l !== this._menfeng && this.select_hule(data, true)) {
      ask(this, [{kind: 'ron', reply: {hule: '-'}}, {kind: 'pass', reply: {}}]);
    } else this._callback();
  }
  action_hule() { this.isBot ? this._callback() : ask(this, [{kind: 'continue', reply: {}}]); }
  action_pingju() { this.isBot ? this._callback() : ask(this, [{kind: 'continue', reply: {}}]); }
  action_jieju() { this._callback(); }
}

class Table extends Majiang.Game {
  next() {
    if (paused) { clearTimeout(this._timeout_id); this._timeout_id = null; return; }
    try { super.next(); }
    catch (error) {
      postMessage({type: 'error', message: 'The table could not continue. Return to the room and deal again.', detail: String(error?.stack || error)});
    }
  }
  // Include the first-draw yakuman in the core's legal-win check.
  allow_hule(wind) {
    if (wind == null && this._diyizimo && Majiang.Util.xiangting(this.model.shoupai[this.model.lunban]) === -1) return true;
    return super.allow_hule(wind);
  }
}

function start(config) {
  seats = config.seats.slice(0, 4).map((seat, id) => ({...seat, id}));
  if (seats.length !== 4) throw new Error('Four seats are required.');
  online = !!config.online;
  pace = config.speed === 'quick' ? 230 : 460;
  players = seats.map(() => new SeatPlayer());
  for (const player of players) {
    const action = player.action.bind(player);
    player.action = (message, callback) => {
      try { action(message, callback); }
      catch (error) {
        postMessage({type: 'error', message: 'The table could not continue. Return to the room and deal again.', detail: String(error?.stack || error)});
        callback?.({});
      }
    };
  }
  const rule = Majiang.rule({'場数': config.length === 'south' ? 2 : config.length === 'single' ? 0 : 1, '延長戦方式': 0});
  game = new Table(players, () => {}, rule, 'Yoru · Riichi Mahjong');
  game.model.player = seats.map(seat => seat.name);
  game.dwell = pace; game.wait = 500;
  const delay = game.delay.bind(game);
  game.delay = (fn, t) => delay(() => {
    try { fn(); }
    catch (error) {
      postMessage({type: 'error', message: 'The table could not continue. Return to the room and deal again.', detail: String(error?.stack || error)});
    }
  }, t);
  game.view = {
    kaiju() {},
    redraw() { result = null; emit('deal'); },
    update(message) {
      // Majiang calls update() with no payload after scores settle, just
      // before the next deal. Object.entries(undefined) would throw and
      // abort last() before qipai/jieju, leaving Continue stuck.
      if (!message) return;
      const entry = Object.entries(message)[0];
      if (!entry) return;
      const [kind, data = {}] = entry;
      if (kind === 'hule') result = {kind: 'win', ...data};
      if (kind === 'pingju') result = {kind: 'draw', ...data};
      // Draw messages contain a secret tile; send only the drawing seat.
      emit(kind, kind === 'zimo' || kind === 'gangzimo' ? {wind: data.l} : {wind: data.l, tile: data.p?.slice(0, 2)});
    },
    say(call, wind) { emit('call', {call, wind}); },
    summary(record) {
      result = {kind: 'match', scores: record.defen, ranks: record.rank, points: record.point};
      emit('match');
    }
  };
  game.kaiju();
}

self.onunhandledrejection = event => {
  postMessage({type: 'error', message: 'The table could not continue. Return to the room and deal again.', detail: String(event?.reason?.stack || event?.reason || event)});
};
self.onerror = event => {
  postMessage({type: 'error', message: 'The table could not continue. Return to the room and deal again.', detail: String(event?.message || event)});
};
self.onmessage = ({data}) => {
  try {
    if (data.type === 'start') { start(data); return; }
    const seat = seats.find(seat => seat.key === data.key);
    if (data.type === 'pause' && !online) {
      paused = !!data.value;
      if (!paused) game.start();
      publish(); return;
    }
    if (!seat) return;
    if (data.type === 'choose') choose(seat.id, data.token, data.index);
    if (data.type === 'hint') {
      const request = pending.get(seat.id);
      if (!request || request.token !== data.token || hints.get(seat.id)?.token === request.token || !request.options.some(o => o.kind === 'discard')) return;
      const value = players[seat.id].select_dapai();
      if (!value) return;
      hints.set(seat.id, {token: request.token, tile: value.slice(0, 2), riichi: value.endsWith('*')});
      publish();
    }
    if (data.type === 'replace') {
      seat.bot = true;
      const request = pending.get(seat.id);
      if (request) {
        let index = request.options.findIndex(o => ['ron', 'tsumo', 'continue'].includes(o.kind));
        if (index < 0 && request.options.some(o => o.kind === 'discard')) {
          const discard = players[seat.id].select_dapai();
          index = request.options.findIndex(o => o.reply.dapai === discard);
        }
        if (index < 0) index = request.options.findIndex(o => o.kind === 'pass');
        choose(seat.id, request.token, Math.max(0, index));
      }
      emit('replacement', {name: seat.name});
    }
  } catch (error) {
    postMessage({type: 'error', message: 'The table could not continue. Return to the room and deal again.', detail: String(error)});
  }
};
