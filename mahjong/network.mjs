// Reliable, ordered WebRTC messages over the repository's Firebase signaling.
// The caller chooses a private frame for each connection, never a shared hand.
const PROTOCOL = 'yoru-riichi-v1';
export function createNetwork({isLobby, onJoin, onPeerLeave, onMessage, onReady, onStatus, onLeave}) {
  const id = crypto.randomUUID(), peers = new Map();
  let signal, code = '', host = false, stopped = false, guest, unwatch = () => {}, heartbeat;
  const send = (channel, data) => {
    if (channel?.readyState !== 'open') return;
    try { channel.send(JSON.stringify(data)); } catch {}
  };
  async function init() { signal = await import('../js/signaling.js'); signal.initFirebase(); }
  function closePeer(key) {
    const peer = peers.get(key);
    if (!peer) return;
    peers.delete(key); clearTimeout(peer.timer); peer.unsubs.forEach(fn => fn());
    peer.pc.onconnectionstatechange = null; peer.channel.onclose = null; peer.pc.close();
    signal.deleteGuest(code, key).catch(() => {});
    if (peer.ready && !stopped) onPeerLeave(key);
  }
  function fail(message) {
    if (stopped) return;
    onStatus(message, true); onLeave(); void stop();
  }
  function watch() {
    clearInterval(heartbeat);
    heartbeat = setInterval(() => {
      if (host) {
        for (const [key, peer] of peers) if (peer.ready && Date.now() - peer.seen > 30000) closePeer(key);
      } else if (guest?.ready) {
        if (Date.now() - guest.seen > 30000) return fail('The host disconnected. Return home to start another table.');
        send(guest.channel, {type: 'ping'});
      }
    }, 3000);
  }
  async function create() {
    await init(); host = true;
    code = await signal.createRoom(`${PROTOCOL}:${id}`);
    if (stopped) { await signal.deleteRoom(code); return ''; }
    unwatch = signal.listenNewGuests(code, (key, info) => void attach(key, info).catch(() => closePeer(key)));
    watch(); return code;
  }
  async function attach(key, info) {
    if (stopped || peers.has(key) || info.offer || info.rejected) return;
    if (!isLobby() || peers.size >= 3) {
      await signal.rejectGuest(code, key, isLobby() ? 'The table is full.' : 'The match has started. Join the next table.'); return;
    }
    const pc = new RTCPeerConnection(signal.ICE_CONFIG), ice = signal.createIceBuffer(pc);
    const channel = pc.createDataChannel(PROTOCOL);
    const peer = {pc, channel, ready: false, seen: Date.now(), unsubs: [], window: 0, count: 0};
    peers.set(key, peer); peer.timer = setTimeout(() => closePeer(key), 25000);
    peer.unsubs.push(signal.listenAnswer(code, key, async answer => {
      try { if (!pc.currentRemoteDescription) { await pc.setRemoteDescription(answer); await ice.markRemoteSet(); } } catch { closePeer(key); }
    }), signal.listenIce(code, key, false, candidate => ice.add(candidate).catch(() => {})));
    pc.onicecandidate = e => { if (e.candidate) signal.pushIce(code, key, true, e.candidate).catch(() => {}); };
    pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) closePeer(key); };
    channel.onclose = () => closePeer(key);
    channel.onmessage = e => {
      if (typeof e.data !== 'string' || e.data.length > 1024) return;
      let data; try { data = JSON.parse(e.data); } catch { return; }
      if (!data || typeof data !== 'object') return;
      const now = Date.now();
      if (now - peer.window > 1000) { peer.window = now; peer.count = 0; }
      if (++peer.count > 20) return;
      peer.seen = now;
      if (data.type === 'hello' && data.protocol === PROTOCOL && !peer.ready) {
        if (!isLobby()) { send(channel, {type: 'error', message: 'This match has started.'}); closePeer(key); return; }
        peer.ready = true; clearTimeout(peer.timer);
        send(channel, {type: 'welcome', id: key});
        onJoin(key, String(info.name || 'Guest').replace(/[\x00-\x1f]/g, '').slice(0, 16));
      }
      if (!peer.ready) return;
      if (data.type === 'ping') send(channel, {type: 'pong'});
      // Connection identity is authoritative; ignore any supplied player key.
      if (['choose', 'hint'].includes(data.type)) onMessage(key, {type: data.type, token: data.token, index: data.index});
    };
    await pc.setLocalDescription(await pc.createOffer());
    if (!stopped && peers.has(key)) await signal.writeOffer(code, key, pc.localDescription);
  }
  async function join(room, name) {
    await init(); code = room.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{5}$/.test(code)) throw new Error('Enter the five-character room code.');
    if (!await signal.roomExists(code)) throw new Error('Room not found. Check the code with the host.');
    if (stopped) return;
    const pc = new RTCPeerConnection(signal.ICE_CONFIG), ice = signal.createIceBuffer(pc);
    guest = {pc, ready: false, seen: Date.now(), unsubs: []};
    guest.timer = setTimeout(() => fail('Could not connect. Check the code or try another network.'), 25000);
    pc.onicecandidate = e => { if (e.candidate) signal.pushIce(code, id, false, e.candidate).catch(() => {}); };
    pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) fail('The connection closed. Return home to reconnect.'); };
    pc.ondatachannel = e => {
      if (e.channel.label !== PROTOCOL) return fail('This room belongs to a different game.');
      const channel = guest.channel = e.channel;
      channel.onopen = () => send(channel, {type: 'hello', protocol: PROTOCOL});
      channel.onclose = () => fail('The host left the table.');
      channel.onmessage = e => {
        if (typeof e.data !== 'string' || e.data.length > 60000) return;
        let data; try { data = JSON.parse(e.data); } catch { return; }
        if (!data || typeof data !== 'object') return;
        guest.seen = Date.now();
        if (data.type === 'welcome') { guest.ready = true; clearTimeout(guest.timer); onReady(data.id); watch(); }
        if (!guest.ready) return;
        if (data.type === 'error') return fail(String(data.message));
        if (['state', 'lobby'].includes(data.type)) onMessage(null, data);
      };
    };
    let handled = false;
    guest.unsubs.push(signal.listenOffer(code, id, async offer => {
      if (handled || stopped) return; handled = true;
      try {
        await pc.setRemoteDescription(offer); await ice.markRemoteSet();
        await pc.setLocalDescription(await pc.createAnswer());
        if (!stopped) await signal.writeAnswer(code, id, pc.localDescription);
      } catch { fail('Unable to establish the connection.'); }
    }), signal.listenIce(code, id, true, c => ice.add(c).catch(() => {})), signal.listenRejected(code, id, message => fail(String(message))));
    await signal.registerGuest(code, id, String(name).slice(0, 16), id);
  }
  async function stop() {
    if (stopped) return; stopped = true; unwatch(); clearInterval(heartbeat);
    for (const key of [...peers.keys()]) closePeer(key);
    if (guest) {
      clearTimeout(guest.timer); guest.unsubs.forEach(fn => fn()); guest.pc.onconnectionstatechange = null;
      if (guest.channel) guest.channel.onclose = null; guest.pc.close();
    }
    if (code) try { if (host) await signal.deleteRoom(code); else await signal.deleteGuest(code, id); } catch {}
  }
  return {create, join, stop,
    send: data => send(guest?.channel, data),
    sendTo: (key, data) => send(peers.get(key)?.channel, data),
    broadcast: data => { for (const peer of peers.values()) if (peer.ready) send(peer.channel, data); }
  };
}
