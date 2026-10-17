// Host and guest sessions. The host owns the real state and is the only one
// who rolls dice or shuffles. Guests predict their own moves locally so
// dragging feels instant, then snap to whatever the host sends back.
import { createState, addPlayer, apply, viewFor, OpError, NeedsHost, OPTIMISTIC, PROTOCOL, MAX_PLAYERS, DECK_PRESETS } from './model.js';
import { hostTable, joinTable } from './net.js';

const PING_MS = 4000;
const HOST_SILENCE_MS = 14000;
const GUEST_SILENCE_MS = 22000;

function rng() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
}

function cardId() {
  const a = crypto.getRandomValues(new Uint8Array(6));
  return 'c' + [...a].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 9);
}

function replace(target, source) {
  for (const k of Object.keys(target)) delete target[k];
  Object.assign(target, source);
}

export async function startHost({ kind, me, name, saved, events }) {
  const state = saved?.state || createState({ hostPid: me, hostName: name });
  if (!saved) apply(state, { type: 'newDeck', cfg: DECK_PRESETS[0].cfg }, me, { rng, newCardId: cardId, isHost: true });
  if (state.players[me]) state.players[me].name = name || state.players[me].name;
  const history = saved?.history?.slice(-40) || [];
  const conns = new Map();
  let queued = false;
  let closed = false;

  const online = () => [me, ...[...conns.values()].filter((c) => c.pid).map((c) => c.pid)];

  function send(c, msg) {
    c.conn.send(msg);
  }

  function broadcastNow() {
    queued = false;
    if (closed) return;
    const on = online();
    for (const c of conns.values()) {
      if (!c.pid) continue;
      if (!state.players[c.pid]) {
        send(c, { t: 'kicked' });
        c.conn.close();
        continue;
      }
      send(c, { t: 'state', view: { ...viewFor(state, c.pid), online: on }, ack: c.ack });
    }
    events.onView({ ...viewFor(state, me), online: on });
    events.onSave?.({ state, history });
  }

  function broadcast() {
    if (queued) return;
    queued = true;
    queueMicrotask(broadcastNow);
  }

  function fxAll(fx, exceptPid) {
    for (const c of conns.values()) if (c.pid && c.pid !== exceptPid) send(c, { t: 'fx', fx });
    if (exceptPid !== me) events.onFx?.(fx);
  }

  function errorTo(pid, text) {
    if (pid === me) events.onError?.(text);
    else for (const c of conns.values()) if (c.pid === pid) send(c, { t: 'error', text });
  }

  function dispatch(op, actor = me) {
    if (op?.type === 'undo') return undo(actor);
    const snap = JSON.stringify(state);
    let res;
    try {
      res = apply(state, op, actor, { rng, newCardId: cardId, isHost: actor === me });
    } catch (e) {
      replace(state, JSON.parse(snap));
      if (e instanceof OpError) errorTo(actor, e.message);
      else console.error(e);
      broadcast();
      return false;
    }
    if (!res.noUndo) {
      history.push(snap);
      if (history.length > 40) history.shift();
    }
    if (res.private) {
      if (actor === me) events.onPrivate?.(res.private);
      else for (const c of conns.values()) if (c.pid === actor) send(c, { t: 'private', data: res.private });
    }
    if (res.fx) fxAll(res.fx);
    broadcast();
    return true;
  }

  function undo(actor) {
    const snap = history.pop();
    if (!snap) {
      errorTo(actor, 'Nothing to undo.');
      return false;
    }
    const current = state.players;
    const order = state.order;
    replace(state, JSON.parse(snap));
    // Keep anyone who sat down after that snapshot.
    for (const pid of order) {
      if (!state.players[pid] && current[pid]) {
        state.players[pid] = { ...current[pid], hand: [], revealed: false };
        state.order.push(pid);
      }
    }
    const who = state.players[actor]?.name || 'Someone';
    state.log.push({ n: ++state.seq, at: Date.now(), who: actor, text: 'undid the last action' });
    state.rev++;
    fxAll({ type: 'toast', text: `${who} pressed undo` }, actor);
    broadcast();
    return true;
  }

  function onConnect(conn) {
    const c = { conn, pid: null, ack: 0, seen: Date.now() };
    conns.set(conn.id, c);
    conn.onmessage = (msg) => {
      c.seen = Date.now();
      if (msg.t === 'hello') {
        const pid = typeof msg.pid === 'string' ? msg.pid.slice(0, 64) : '';
        if (msg.proto !== PROTOCOL || !pid || pid === me) {
          send(c, { t: 'reject', reason: 'This table runs a different version. Reload the page.' });
          conn.close();
          return;
        }
        if (!state.players[pid] && state.order.length >= MAX_PLAYERS) {
          send(c, { t: 'reject', reason: `The table is full (${MAX_PLAYERS} players).` });
          conn.close();
          return;
        }
        for (const other of conns.values()) {
          if (other !== c && other.pid === pid) {
            other.pid = null;
            other.conn.close();
          }
        }
        const isNew = !state.players[pid];
        addPlayer(state, pid, msg.name);
        state.rev++;
        c.pid = pid;
        c.ack = 0;
        send(c, { t: 'welcome', pid });
        if (!isNew) fxAll({ type: 'toast', text: `${state.players[pid].name} is back` }, pid);
        broadcast();
        return;
      }
      if (!c.pid) return;
      if (msg.t === 'op') {
        c.ack = Number(msg.seq) || c.ack;
        dispatch(msg.op, c.pid);
        broadcast();
      } else if (msg.t === 'drag') {
        const fx = { type: 'drag', pid: c.pid, ids: Array.isArray(msg.ids) ? msg.ids.slice(0, 60) : null, x: Number(msg.x) || 0, z: Number(msg.z) || 0 };
        fxAll(fx, c.pid);
      } else if (msg.t === 'emote') {
        fxAll({ type: 'emote', pid: c.pid, text: String(msg.text || '').slice(0, 24) });
      }
    };
    conn.onclose = () => {
      conns.delete(conn.id);
      if (c.pid) {
        fxAll({ type: 'drag', pid: c.pid, ids: null });
        broadcast();
      }
    };
  }

  const table = await hostTable(kind, { code: saved?.code, onConnect });
  const pinger = setInterval(() => {
    const now = Date.now();
    for (const c of conns.values()) {
      if (now - c.seen > GUEST_SILENCE_MS) c.conn.close();
      else send(c, { t: 'ping' });
    }
  }, PING_MS);

  broadcast();

  return {
    code: table.code,
    kind: table.kind,
    me,
    isHost: true,
    dispatch: (op) => dispatch(op, me),
    drag(ids, x, z) {
      fxAll({ type: 'drag', pid: me, ids, x, z }, me);
    },
    emote(text) {
      fxAll({ type: 'emote', pid: me, text });
    },
    get canUndo() {
      return history.length > 0;
    },
    close() {
      closed = true;
      clearInterval(pinger);
      for (const c of conns.values()) send(c, { t: 'closed' });
      table.close();
    },
  };
}

export async function startGuest({ kind, code, me, name, events }) {
  let conn = null;
  let base = null;
  let display = null;
  let pending = [];
  let seq = 0;
  let closed = false;
  let lastHeard = Date.now();
  let retry = null;

  function recompute() {
    if (!base) return;
    display = structuredClone(base);
    for (const p of pending) {
      try {
        apply(display, p.op, me, {});
      } catch {
        /* the host will decide */
      }
    }
    events.onView(display);
  }

  function handle(msg) {
    lastHeard = Date.now();
    if (msg.t === 'ping') conn?.send({ t: 'pong' });
    else if (msg.t === 'welcome') events.onStatus?.('online');
    else if (msg.t === 'state') {
      base = msg.view;
      pending = pending.filter((p) => p.seq > (msg.ack || 0));
      if (!base.players[me]) {
        end('You were removed from the table.');
        return;
      }
      recompute();
    } else if (msg.t === 'private') events.onPrivate?.(msg.data);
    else if (msg.t === 'fx') events.onFx?.(msg.fx);
    else if (msg.t === 'error') events.onError?.(msg.text);
    else if (msg.t === 'reject') end(msg.reason || 'The host turned the connection down.');
    else if (msg.t === 'kicked') end('The host asked you to leave the table.');
    else if (msg.t === 'closed') end('The host closed the table.');
  }

  async function connect() {
    const c = await joinTable(kind, { code, name, pid: me });
    if (closed) {
      c.close();
      return;
    }
    conn = c;
    lastHeard = Date.now();
    conn.onmessage = handle;
    conn.onclose = () => {
      if (conn !== c) return;
      conn = null;
      if (!closed) reconnect();
    };
    pending = [];
    conn.send({ t: 'hello', proto: PROTOCOL, pid: me, name });
  }

  let attempts = 0;
  function reconnect() {
    if (closed || retry) return;
    events.onStatus?.('reconnecting');
    const wait = Math.min(8000, 800 * 2 ** attempts++);
    retry = setTimeout(async () => {
      retry = null;
      try {
        await connect();
        attempts = 0;
      } catch {
        if (attempts > 12) end('Lost the connection to the host.');
        else reconnect();
      }
    }, wait);
  }

  function end(reason) {
    if (closed) return;
    closed = true;
    clearInterval(watchdog);
    clearTimeout(retry);
    const c = conn;
    conn = null;
    c?.close();
    events.onEnd?.(reason);
  }

  const watchdog = setInterval(() => {
    if (conn && Date.now() - lastHeard > HOST_SILENCE_MS) {
      const c = conn;
      conn = null;
      c.close();
      reconnect();
    }
  }, 2000);

  const onVisible = () => {
    if (document.visibilityState === 'visible' && !conn && !closed) {
      clearTimeout(retry);
      retry = null;
      attempts = 0;
      reconnect();
    }
  };
  document.addEventListener('visibilitychange', onVisible);

  try {
    await connect();
  } catch (e) {
    closed = true;
    clearInterval(watchdog);
    document.removeEventListener('visibilitychange', onVisible);
    throw e;
  }

  return {
    code,
    kind,
    me,
    isHost: false,
    dispatch(op) {
      if (!conn) {
        events.onError?.('Reconnecting… try again in a moment.');
        return false;
      }
      if (OPTIMISTIC.has(op.type) && display) {
        const trial = structuredClone(display);
        try {
          apply(trial, op, me, {});
          display = trial;
        } catch (e) {
          if (e instanceof OpError) {
            events.onError?.(e.message);
            return false;
          }
          if (!(e instanceof NeedsHost)) throw e;
        }
      }
      pending.push({ seq: ++seq, op });
      conn.send({ t: 'op', op, seq });
      if (display) events.onView(display);
      return true;
    },
    drag(ids, x, z) {
      conn?.send({ t: 'drag', ids, x, z });
    },
    emote(text) {
      conn?.send({ t: 'emote', text });
    },
    get canUndo() {
      return true;
    },
    close() {
      document.removeEventListener('visibilitychange', onVisible);
      closed = true;
      clearInterval(watchdog);
      clearTimeout(retry);
      conn?.close();
    },
    leave() {
      conn?.send({ t: 'op', op: { type: 'leave' }, seq: ++seq });
      setTimeout(() => this.close(), 150);
    },
  };
}
