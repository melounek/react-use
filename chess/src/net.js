/* =========================================================================
   Airplane Chess — link layer (no internet, no server)

   Two transports, both offline:
     LobbyLink  BroadcastChannel presence + invites. Discovers other windows
                of this app on the same device automatically.
     DirectLink WebRTC data channel with hand-carried signalling. The SDP is
                squeezed into a short invite code, so two devices on the same
                Wi-Fi (or a Bluetooth PAN / hotspot) connect with nothing in
                between — no STUN, no relay, no internet.
   ========================================================================= */

function emitter() {
  const map = {};
  return {
    on(k, fn) { (map[k] = map[k] || []).push(fn); return this; },
    off(k, fn) { map[k] = (map[k] || []).filter((f) => f !== fn); return this; },
    emit(k, ...args) { (map[k] || []).slice().forEach((f) => f(...args)); return this; },
  };
}

const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

/* ---------------------------------------------------------------- lobby -- */

const LOBBY_CHANNEL = 'airplane-chess-lobby-v1';
const BEACON_MS = 1600;
const STALE_MS = 5200;

class LobbyLink {
  constructor() {
    this.ev = emitter();
    this.id = uid();
    this.peers = new Map();
    this.profile = { name: 'Hráč', tc: null, color: 'random' };
    this.partner = null;
    this.chan = null;
    this.available = typeof BroadcastChannel !== 'undefined';
    this.timer = null;
  }

  start(profile) {
    Object.assign(this.profile, profile);
    if (!this.available) return false;
    if (this.chan) { this.beacon(); return true; }
    try {
      this.chan = new BroadcastChannel(LOBBY_CHANNEL);
    } catch (err) {
      this.available = false;
      return false;
    }
    this.chan.onmessage = (e) => this.receive(e.data);
    this.timer = setInterval(() => { this.beacon(); this.prune(); }, BEACON_MS);
    this.beacon();
    window.addEventListener('pagehide', () => this.post({ k: 'bye' }));
    return true;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.chan) { this.post({ k: 'bye' }); this.chan.close(); this.chan = null; }
    this.peers.clear();
  }

  update(profile) {
    Object.assign(this.profile, profile);
    this.beacon();
  }

  post(msg, to) {
    if (!this.chan) return;
    try {
      this.chan.postMessage(Object.assign({ from: this.id, to: to || null }, msg));
    } catch (err) { /* channel closed mid-flight */ }
  }

  beacon() {
    this.post({ k: 'hello', name: this.profile.name, tc: this.profile.tc, busy: !!this.partner });
  }

  prune() {
    const now = Date.now();
    let changed = false;
    for (const [id, p] of this.peers) {
      if (now - p.seen > STALE_MS) { this.peers.delete(id); changed = true; }
    }
    if (changed) this.ev.emit('peers', this.list());
  }

  list() {
    return [...this.peers.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  see(msg) {
    const known = this.peers.get(msg.from);
    const peer = known || { id: msg.from };
    peer.name = msg.name || peer.name || 'Hráč';
    peer.tc = msg.tc !== undefined ? msg.tc : peer.tc;
    peer.busy = !!msg.busy;
    peer.seen = Date.now();
    this.peers.set(msg.from, peer);
    if (!known) this.ev.emit('peers', this.list());
    return peer;
  }

  receive(msg) {
    if (!msg || msg.from === this.id) return;
    if (msg.to && msg.to !== this.id) return;

    switch (msg.k) {
      case 'hello':
        this.see(msg);
        this.post({ k: 'hi', name: this.profile.name, tc: this.profile.tc, busy: !!this.partner }, msg.from);
        break;
      case 'hi':
        this.see(msg);
        break;
      case 'bye':
        if (this.peers.delete(msg.from)) this.ev.emit('peers', this.list());
        if (this.partner === msg.from) this.ev.emit('closed', 'Soupeř odešel.');
        break;
      case 'invite':
        this.ev.emit('invite', { id: msg.from, name: msg.name, tc: msg.tc, yourColor: msg.yourColor });
        break;
      case 'decline':
        this.ev.emit('declined', this.peers.get(msg.from));
        break;
      case 'accept':
        this.partner = msg.from;
        this.ev.emit('paired', { id: msg.from, name: msg.name });
        break;
      default:
        if (this.partner && msg.from === this.partner) this.ev.emit('msg', msg);
    }
  }

  invite(peerId, tc, theirColor) {
    this.post({ k: 'invite', name: this.profile.name, tc, yourColor: theirColor }, peerId);
  }

  accept(peerId) {
    this.partner = peerId;
    this.post({ k: 'accept', name: this.profile.name }, peerId);
  }

  decline(peerId) { this.post({ k: 'decline' }, peerId); }

  send(msg) { if (this.partner) this.post(msg, this.partner); }

  leave() {
    if (this.partner) this.post({ k: 'bye' }, this.partner);
    this.partner = null;
    this.beacon();
  }
}

/* --------------------------------------------------------------- webrtc -- */

/** Squeeze a datachannel SDP down to something a person can carry across. */
function packSdp(sdp) {
  const grab = (re) => { const m = sdp.match(re); return m ? m[1] : ''; };
  const ufrag = grab(/a=ice-ufrag:(\S+)/);
  const pwd = grab(/a=ice-pwd:(\S+)/);
  const fp = grab(/a=fingerprint:sha-256 (\S+)/i).replace(/:/g, '');
  const setup = grab(/a=setup:(\S+)/);
  const seen = new Set();
  const cands = [];
  const re = /a=candidate:\S+ 1 (udp|UDP) \d+ (\S+) (\d+) typ (host|srflx)/g;
  let m;
  while ((m = re.exec(sdp))) {
    const key = `${m[2]}|${m[3]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cands.push(`${m[2]}~${m[3]}`);
  }
  // "_" is the field separator on purpose: it cannot appear in an ICE ufrag or
  // password (base64 charset), in a hex fingerprint, in an IPv4/IPv6 address,
  // or in a Chrome mDNS candidate hostname — unlike "." which splits IPv4.
  return ['AC1', ufrag, pwd, fp, setup, cands.join(',')].join('_');
}

function unpackSdp(code, type) {
  const parts = String(code).trim().replace(/\s+/g, '').split('_');
  if (parts[0] !== 'AC1' || parts.length < 5) throw new Error('bad-code');
  const [, ufrag, pwd, fp, setup] = parts;
  const cands = parts.slice(5).join('_');
  if (!ufrag || !pwd || !/^[0-9a-fA-F]{64}$/.test(fp)) throw new Error('bad-code');
  const lines = [
    'v=0',
    'o=- 1 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    `a=ice-ufrag:${ufrag}`,
    `a=ice-pwd:${pwd}`,
    'a=ice-options:trickle',
    `a=fingerprint:sha-256 ${fp.toUpperCase().match(/.{2}/g).join(':')}`,
    `a=setup:${setup || (type === 'offer' ? 'actpass' : 'active')}`,
    'a=mid:0',
    'a=sctp-port:5000',
    'a=max-message-size:262144',
  ];
  (cands ? cands.split(',') : []).filter(Boolean).forEach((c, i) => {
    const cut = c.lastIndexOf('~');
    if (cut < 0) return;
    const ip = c.slice(0, cut);
    const port = c.slice(cut + 1);
    if (!/^\d+$/.test(port)) return;
    lines.push(`a=candidate:${i + 1} 1 udp ${2130706431 - i} ${ip} ${port} typ host generation 0`);
  });
  return { type, sdp: lines.join('\r\n') + '\r\n' };
}

class DirectLink {
  constructor() {
    this.ev = emitter();
    this.pc = null;
    this.dc = null;
    this.role = null;
    this.open = false;
    this.available = typeof RTCPeerConnection !== 'undefined';
  }

  makePc() {
    // No ICE servers on purpose: host candidates only, so the handshake never
    // leaves the local network.
    const pc = new RTCPeerConnection({ iceServers: [], iceCandidatePoolSize: 0 });
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'failed' || s === 'closed' || s === 'disconnected') {
        if (this.open) { this.open = false; this.ev.emit('closed', 'Spojení se ztratilo.'); }
        else if (s === 'failed') this.ev.emit('failed');
      }
    };
    this.pc = pc;
    return pc;
  }

  bindChannel(dc) {
    this.dc = dc;
    dc.onopen = () => { this.open = true; this.ev.emit('open'); };
    dc.onclose = () => {
      if (!this.open) return;
      this.open = false;
      this.ev.emit('closed', 'Spojení bylo ukončeno.');
    };
    dc.onmessage = (e) => {
      try { this.ev.emit('msg', JSON.parse(e.data)); } catch (err) { /* ignore junk */ }
    };
  }

  /** Wait for ICE gathering, but never hang on it. */
  gathered(pc, ms = 2600) {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      const t = setTimeout(finish, ms);
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') { clearTimeout(t); finish(); }
      };
      pc.onicecandidate = (e) => { if (!e.candidate) { clearTimeout(t); finish(); } };
    });
  }

  async host() {
    this.role = 'host';
    const pc = this.makePc();
    this.bindChannel(pc.createDataChannel('chess', { ordered: true }));
    await pc.setLocalDescription(await pc.createOffer());
    await this.gathered(pc);
    return packSdp(pc.localDescription.sdp);
  }

  async join(code) {
    this.role = 'guest';
    const pc = this.makePc();
    pc.ondatachannel = (e) => this.bindChannel(e.channel);
    await pc.setRemoteDescription(unpackSdp(code, 'offer'));
    await pc.setLocalDescription(await pc.createAnswer());
    await this.gathered(pc);
    return packSdp(pc.localDescription.sdp);
  }

  async confirm(code) {
    await this.pc.setRemoteDescription(unpackSdp(code, 'answer'));
  }

  send(msg) {
    if (this.dc && this.dc.readyState === 'open') this.dc.send(JSON.stringify(msg));
  }

  close() {
    this.open = false;
    try { if (this.dc) this.dc.close(); } catch (err) { /* already gone */ }
    try { if (this.pc) this.pc.close(); } catch (err) { /* already gone */ }
    this.dc = null;
    this.pc = null;
  }
}
