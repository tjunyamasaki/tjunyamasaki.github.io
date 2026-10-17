// Transports. Both hand the session the same small connection object:
//   { id, send(obj), close(), onmessage(obj), onclose() }
//
// - "online": WebRTC data channels, signalled through the site's Firebase
//   Realtime Database (same rooms/<code>/guests/<id> layout as the other games).
// - "local": BroadcastChannel between tabs of one browser. Used when Firebase
//   is not configured, or with ?local in the URL, so the table can be tried
//   (and tested) without any backend.
import { PROTOCOL } from './model.js';

const FB = 'https://www.gstatic.com/firebasejs/11.6.0/';
const ICE = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[A-HJ-NP-Z2-9]{5}$/;

export function randomId() {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function normalizeCode(code) {
  return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function validCode(code) {
  return CODE_RE.test(code);
}

function makeConn(id, sendRaw, closeRaw) {
  const conn = {
    id,
    closed: false,
    onmessage: null,
    onclose: null,
    send(obj) {
      if (conn.closed) return false;
      try {
        return sendRaw(obj) !== false;
      } catch {
        return false;
      }
    },
    close() {
      if (conn.closed) return;
      conn.closed = true;
      try {
        closeRaw();
      } catch {
        /* already gone */
      }
      conn.onclose?.();
    },
    receive(obj) {
      if (!conn.closed) conn.onmessage?.(obj);
    },
  };
  return conn;
}

// ------------------------------------------------------------------ Firebase

let fbPromise = null;
export function loadFirebase() {
  fbPromise ??= (async () => {
    let cfg;
    try {
      cfg = await import('../../js/config.js');
    } catch {
      return null;
    }
    if (!cfg.isFirebaseConfigured?.()) return null;
    const [appMod, db] = await Promise.all([import(`${FB}firebase-app.js`), import(`${FB}firebase-database.js`)]);
    const app = appMod.initializeApp(cfg.firebaseConfig, 'card-table');
    const database = db.getDatabase(app);
    return { ...db, ref: (path) => db.ref(database, path) };
  })().catch(() => null);
  return fbPromise;
}

function parse(data) {
  if (typeof data !== 'string' || data.length > 400000) return null;
  try {
    const v = JSON.parse(data);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

function channelConn(id, ch, pc, onGone) {
  const conn = makeConn(
    id,
    (obj) => {
      if (ch.readyState !== 'open') return false;
      ch.send(JSON.stringify(obj));
      return true;
    },
    () => {
      ch.onclose = null;
      pc.onconnectionstatechange = null;
      ch.close();
      pc.close();
      onGone?.();
    },
  );
  ch.onmessage = (e) => {
    const msg = parse(e.data);
    if (msg) conn.receive(msg);
  };
  ch.onclose = () => conn.close();
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') conn.close();
  };
  return conn;
}

function iceQueue(pc) {
  const pending = [];
  let ready = false;
  return {
    async ready() {
      ready = true;
      for (const c of pending.splice(0)) await pc.addIceCandidate(c).catch(() => {});
    },
    add(c) {
      if (!c?.candidate) return;
      if (ready) pc.addIceCandidate(c).catch(() => {});
      else pending.push(c);
    },
  };
}

const iceJSON = (c) => ({ candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex });

async function onlineHost({ code, onConnect }) {
  const fb = await loadFirebase();
  if (!fb) throw new Error('Online play is not configured on this site.');
  code = code || randomCode();
  const hostKey = randomId();
  await fb.set(fb.ref(`rooms/${code}`), { hostId: `${PROTOCOL}:${hostKey}`, createdAt: Date.now() });
  const peers = new Map();
  let stopped = false;

  function drop(gid) {
    const peer = peers.get(gid);
    if (!peer) return;
    peers.delete(gid);
    clearTimeout(peer.timer);
    peer.unsubs.forEach((u) => u());
    fb.remove(fb.ref(`rooms/${code}/guests/${gid}`)).catch(() => {});
  }

  async function attach(gid, info) {
    if (stopped || peers.has(gid) || !info.name || info.offer || info.rejected) return;
    const pc = new RTCPeerConnection(ICE);
    const ch = pc.createDataChannel(PROTOCOL, { ordered: true });
    const ice = iceQueue(pc);
    const peer = { unsubs: [], timer: 0 };
    peers.set(gid, peer);
    const base = `rooms/${code}/guests/${gid}`;
    peer.timer = setTimeout(() => {
      if (ch.readyState !== 'open') {
        pc.close();
        drop(gid);
      }
    }, 30000);
    peer.unsubs.push(
      fb.onValue(fb.ref(`${base}/answer`), async (snap) => {
        const answer = snap.val();
        if (!answer || pc.currentRemoteDescription) return;
        try {
          await pc.setRemoteDescription(answer);
          await ice.ready();
        } catch {
          pc.close();
          drop(gid);
        }
      }),
    );
    peer.unsubs.push(fb.onChildAdded(fb.ref(`${base}/iceGuest`), (snap) => ice.add(snap.val())));
    pc.onicecandidate = (e) => {
      if (e.candidate) fb.push(fb.ref(`${base}/iceHost`), iceJSON(e.candidate)).catch(() => {});
    };
    ch.onopen = () => {
      clearTimeout(peer.timer);
      const conn = channelConn(gid, ch, pc, () => drop(gid));
      onConnect(conn, { name: info.name, pid: info.playerId });
    };
    await pc.setLocalDescription(await pc.createOffer());
    if (!stopped && peers.has(gid)) await fb.update(fb.ref(base), { offer: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
  }

  const unsub = fb.onChildAdded(fb.ref(`rooms/${code}/guests`), (snap) => {
    attach(snap.key, snap.val() || {}).catch(() => drop(snap.key));
  });

  return {
    code,
    kind: 'online',
    close() {
      stopped = true;
      unsub();
      for (const gid of [...peers.keys()]) drop(gid);
      fb.remove(fb.ref(`rooms/${code}`)).catch(() => {});
    },
  };
}

async function onlineJoin({ code, name, pid }) {
  const fb = await loadFirebase();
  if (!fb) throw new Error('Online play is not configured on this site.');
  const room = (await fb.get(fb.ref(`rooms/${code}`))).val();
  if (!room) throw new Error('No table with that code. Check it with the host.');
  if (!String(room.hostId || '').startsWith(`${PROTOCOL}:`)) throw new Error('That code belongs to a different game.');
  const gid = randomId();
  const base = `rooms/${code}/guests/${gid}`;
  const pc = new RTCPeerConnection(ICE);
  const ice = iceQueue(pc);
  const unsubs = [];
  const cleanup = () => {
    unsubs.splice(0).forEach((u) => u());
    fb.remove(fb.ref(base)).catch(() => {});
  };
  return new Promise((resolve, reject) => {
    const fail = (msg) => {
      cleanup();
      pc.close();
      reject(new Error(msg));
    };
    const timer = setTimeout(() => fail('Could not reach the host. Mobile networks sometimes block direct connections — try Wi-Fi.'), 25000);
    pc.onicecandidate = (e) => {
      if (e.candidate) fb.push(fb.ref(`${base}/iceGuest`), iceJSON(e.candidate)).catch(() => {});
    };
    pc.ondatachannel = (e) => {
      const ch = e.channel;
      if (ch.label !== PROTOCOL) return fail('That code belongs to a different game.');
      ch.onopen = () => {
        clearTimeout(timer);
        unsubs.splice(0).forEach((u) => u());
        resolve(channelConn(gid, ch, pc, cleanup));
      };
      return undefined;
    };
    fb.set(fb.ref(base), { name, playerId: pid, joinedAt: Date.now() })
      .then(() => {
        unsubs.push(
          fb.onValue(fb.ref(`${base}/offer`), async (snap) => {
            const offer = snap.val();
            if (!offer || pc.currentRemoteDescription) return;
            try {
              await pc.setRemoteDescription(offer);
              await ice.ready();
              await pc.setLocalDescription(await pc.createAnswer());
              await fb.update(fb.ref(base), { answer: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
            } catch {
              fail('The connection could not be set up.');
            }
          }),
        );
        unsubs.push(fb.onChildAdded(fb.ref(`${base}/iceHost`), (snap) => ice.add(snap.val())));
        unsubs.push(
          fb.onValue(fb.ref(`${base}/rejected`), (snap) => {
            if (snap.val()) fail(String(snap.val()));
          }),
        );
      })
      .catch(() => fail('Could not reach the lobby server.'));
  });
}

// ------------------------------------------------------------------ local tabs

async function localHost({ code, onConnect }) {
  code = code || randomCode();
  const bc = new BroadcastChannel(`card-table:${code}`);
  const conns = new Map();
  bc.onmessage = (e) => {
    const m = e.data;
    if (!m || m.to !== 'host') return;
    if (m.kind === 'probe') {
      bc.postMessage({ to: m.from, kind: 'here' });
    } else if (m.kind === 'hello') {
      conns.get(m.from)?.close();
      const conn = makeConn(
        m.from,
        (obj) => bc.postMessage({ to: m.from, kind: 'msg', data: obj }),
        () => {
          conns.delete(m.from);
          bc.postMessage({ to: m.from, kind: 'bye' });
        },
      );
      conns.set(m.from, conn);
      bc.postMessage({ to: m.from, kind: 'open' });
      onConnect(conn, { name: m.name, pid: m.pid });
    } else if (m.kind === 'msg') {
      conns.get(m.from)?.receive(m.data);
    } else if (m.kind === 'bye') {
      const c = conns.get(m.from);
      if (c) {
        conns.delete(m.from);
        c.closed = true;
        c.onclose?.();
      }
    }
  };
  return {
    code,
    kind: 'local',
    close() {
      for (const c of [...conns.values()]) c.close();
      bc.close();
    },
  };
}

async function localJoin({ code, name, pid }) {
  const bc = new BroadcastChannel(`card-table:${code}`);
  const gid = randomId();
  return new Promise((resolve, reject) => {
    let conn = null;
    const timer = setTimeout(() => {
      bc.close();
      reject(new Error('No table with that code is open in this browser.'));
    }, 2500);
    bc.onmessage = (e) => {
      const m = e.data;
      if (!m || m.to !== gid) return;
      if (m.kind === 'here' && !conn) {
        bc.postMessage({ to: 'host', from: gid, kind: 'hello', name, pid });
      } else if (m.kind === 'open' && !conn) {
        clearTimeout(timer);
        conn = makeConn(
          gid,
          (obj) => bc.postMessage({ to: 'host', from: gid, kind: 'msg', data: obj }),
          () => {
            bc.postMessage({ to: 'host', from: gid, kind: 'bye' });
            bc.close();
          },
        );
        resolve(conn);
      } else if (m.kind === 'msg') {
        conn?.receive(m.data);
      } else if (m.kind === 'bye' && conn) {
        conn.closed = true;
        bc.close();
        conn.onclose?.();
      }
    };
    bc.postMessage({ to: 'host', from: gid, kind: 'probe' });
  });
}

// ------------------------------------------------------------------ choose

export async function pickTransport() {
  const forceLocal = new URLSearchParams(location.search).has('local');
  if (!forceLocal && (await loadFirebase())) return 'online';
  return 'local';
}

export function hostTable(kind, opts) {
  return kind === 'online' ? onlineHost(opts) : localHost(opts);
}

export function joinTable(kind, opts) {
  return kind === 'online' ? onlineJoin(opts) : localJoin(opts);
}
