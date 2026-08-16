/* =========================================================================
   Airplane Chess — application
   ========================================================================= */

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];

const TIME_CONTROLS = [
  { id: '10+0', label: '10 min', base: 600, inc: 0 },
  { id: '3+2', label: '3|2 Blitz', base: 180, inc: 2 },
  { id: '1+0', label: '1 min', base: 60, inc: 0 },
  { id: 'inf', label: 'Bez hodin', base: null, inc: 0 },
  { id: '5+3', label: '5|3', base: 300, inc: 3 },
  { id: '15+10', label: '15|10', base: 900, inc: 10 },
];
const tcById = (id) => TIME_CONTROLS.find((t) => t.id === id) || TIME_CONTROLS[0];

const S = {
  mode: 'local',
  name: '',
  sidePref: 'random',
  tcId: '10+0',
  game: null,
  online: false,
  myColor: null,          // null = both sides played on this device
  names: { w: 'Bílý', b: 'Černý' },
  flipped: false,
  autoFlip: true,
  sound: true,
  clock: { w: 0, b: 0 },
  ticking: false,
  lastTick: 0,
  sel: null,
  targets: [],
  pendingPromo: null,
  drawOfferBy: null,
  rematchOfferBy: null,
  net: null,
  peerName: 'Soupeř',
};

const lobby = new LobbyLink();
const direct = new DirectLink();

/* --------------------------------------------------------------- helpers */

function toast(text, ms) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('on'), ms || 2200);
}

function openVeil(id) { $(id).classList.add('on'); }
function confirmAction(title, text, yesLabel, onYes) {
  $('#confirm-title').textContent = title;
  $('#confirm-text').textContent = text;
  $('#confirm-yes').textContent = yesLabel;
  $('#confirm-yes').onclick = () => { closeVeil('#veil-confirm'); onYes(); };
  openVeil('#veil-confirm');
}
function closeVeil(id) { $(id).classList.remove('on'); }
function closeAllVeils() { $$('.veil').forEach((v) => v.classList.remove('on')); }

function fmtClock(sec) {
  if (sec === null || sec === undefined) return '∞';
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  if (s < 20) return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s * 10) % 10)}`;
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => toast('Zkopírováno'), () => fallbackCopy(text));
  } else fallbackCopy(text);
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); toast('Zkopírováno'); }
  catch (err) { toast('Zkopírování se nepovedlo — označ kód ručně'); }
  ta.remove();
}

/* ----------------------------------------------------------------- sound */

let audio = null;
function tone(freq, dur, type, gain) {
  if (!S.sound) return;
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = type || 'triangle';
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(0.0001, audio.currentTime);
    amp.gain.exponentialRampToValueAtTime(gain || 0.14, audio.currentTime + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
    osc.connect(amp).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + dur + 0.02);
  } catch (err) { /* audio unavailable */ }
}
function sfx(kind) {
  if (kind === 'move') tone(320, 0.07, 'triangle', 0.1);
  else if (kind === 'capture') { tone(180, 0.1, 'square', 0.09); tone(120, 0.13, 'triangle', 0.08); }
  else if (kind === 'check') { tone(640, 0.09, 'sine', 0.13); setTimeout(() => tone(880, 0.11, 'sine', 0.12), 90); }
  else if (kind === 'end') { tone(520, 0.16, 'sine', 0.12); setTimeout(() => tone(330, 0.28, 'sine', 0.12), 150); }
  else if (kind === 'alert') { tone(760, 0.09, 'sine', 0.12); setTimeout(() => tone(1020, 0.12, 'sine', 0.11), 110); }
}

/* ------------------------------------------------------------------ home */

function buildTimeControls() {
  const wrap = $('#tc');
  wrap.innerHTML = '';
  TIME_CONTROLS.forEach((t) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = t.label;
    b.dataset.tc = t.id;
    b.setAttribute('aria-pressed', String(t.id === S.tcId));
    b.onclick = () => {
      S.tcId = t.id;
      $$('#tc .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.tc === t.id)));
      if (S.mode === 'link') lobby.update({ tc: t.id });
      save();
    };
    wrap.appendChild(b);
  });
}

function setMode(mode) {
  S.mode = mode;
  $('#mode-local').setAttribute('aria-pressed', String(mode === 'local'));
  $('#mode-link').setAttribute('aria-pressed', String(mode === 'link'));
  $('#field-name').hidden = mode !== 'link';
  $('#field-peers').hidden = mode !== 'link';
  $('#start-local').hidden = mode !== 'local';
  $('#label-side').textContent = mode === 'link' ? 'Hraješ za' : 'Dole začíná';
  if (mode === 'link') startLobby();
  else lobby.stop();
  save();
}

function startLobby() {
  const ok = lobby.start({ name: S.name || 'Hráč', tc: S.tcId });
  renderPeers();
  const hint = $('#peers-hint');
  if (!ok) {
    hint.innerHTML = 'Automatické hledání není v tomto prohlížeči dostupné. Použij <b>pozvánku s kódem</b> — funguje mezi dvěma zařízeními na stejné Wi-Fi i bez internetu.';
  } else {
    hint.innerHTML = 'Vyhledávání najde další okna této hry na stejném zařízení. Pro spojení <b>dvou telefonů</b> použij pozvánku s kódem přes společnou Wi-Fi, hotspot nebo Bluetooth PAN.';
  }
}

function renderPeers() {
  const box = $('#peers');
  const peers = lobby.available ? lobby.list() : [];
  if (!peers.length) {
    box.innerHTML = lobby.available
      ? '<div class="searching"><span class="spinner"></span><span>Hledám hráče v okolí…</span></div>'
      : '<div class="searching"><span>Hledání není dostupné — použij pozvánku s kódem.</span></div>';
    return;
  }
  box.innerHTML = '';
  peers.forEach((p) => {
    const b = document.createElement('button');
    b.className = 'peer';
    if (p.busy) b.disabled = true;
    b.innerHTML =
      `<span class="av">${(p.name || '?').trim().charAt(0).toUpperCase() || '?'}</span>` +
      '<span class="who"><span class="n"></span>' +
      `<span class="m">${p.busy ? 'Právě hraje' : tcById(p.tc).label}</span></span>` +
      `<span class="go">${p.busy ? 'Obsazeno' : 'Pozvat'}</span>`;
    $('.n', b).textContent = p.name || 'Hráč';
    b.onclick = () => sendInvite(p);
    box.appendChild(b);
  });
}

function resolveColor(pref) {
  if (pref === 'w' || pref === 'b') return pref;
  return Math.random() < 0.5 ? 'w' : 'b';
}

function sendInvite(peer) {
  const mine = resolveColor(S.sidePref);
  S.pendingInvite = { peer, myColor: mine, tc: S.tcId };
  lobby.invite(peer.id, S.tcId, mine === 'w' ? 'b' : 'w');
  $('#wait-text').textContent = `Pozvánka pro hráče ${peer.name} odeslána.`;
  $('#wait-sub').textContent = 'Čekám na přijetí…';
  openVeil('#veil-wait');
}

/* ------------------------------------------------------------ game setup */

function newGame(opts) {
  const tc = tcById(opts.tcId || S.tcId);
  S.game = new Game();
  S.online = !!opts.online;
  S.myColor = opts.myColor || null;
  S.names = opts.names;
  S.tcId = opts.tcId || S.tcId;
  S.clock = { w: tc.base, b: tc.base };
  S.ticking = tc.base !== null;
  S.lastTick = performance.now();
  S.sel = null;
  S.targets = [];
  S.drawOfferBy = null;
  S.rematchOfferBy = null;
  S.flipped = S.online ? S.myColor === 'b' : opts.bottom === 'b';
  closeAllVeils();
  $('#screen-home').classList.remove('on');
  $('#screen-game').classList.add('on');
  $('#nav-rematch').hidden = false;
  setBanner(null);
  render();
}

function startLocalGame() {
  const bottom = resolveColor(S.sidePref);
  newGame({
    online: false,
    bottom,
    names: { w: 'Bílý', b: 'Černý' },
    tcId: S.tcId,
  });
}

function startOnlineGame(myColor, tcId, peerName) {
  S.peerName = peerName || 'Soupeř';
  const me = S.name || 'Ty';
  newGame({
    online: true,
    myColor,
    tcId,
    names: myColor === 'w' ? { w: me, b: S.peerName } : { w: S.peerName, b: me },
  });
}

function goHome() {
  if (S.net) { S.net.leave(); S.net = null; }
  S.online = false;
  S.ticking = false;
  closeAllVeils();
  $('#screen-game').classList.remove('on');
  $('#screen-home').classList.add('on');
  if (S.mode === 'link') startLobby();
}

/* -------------------------------------------------------------- rendering */

const boardEl = $('#board');
let pieceEls = new Array(64).fill(null);

function visualOf(idx) { return S.flipped ? 63 - idx : idx; }

function buildSquares() {
  const sq = $('#squares');
  const hi = $('#hints');
  sq.innerHTML = '';
  hi.innerHTML = '';
  for (let v = 0; v < 64; v++) {
    const d = document.createElement('div');
    d.className = 'sq';
    sq.appendChild(d);
    const h = document.createElement('div');
    h.className = 'hint-cell';
    hi.appendChild(h);
  }
}

function renderSquares() {
  const cells = $('#squares').children;
  const game = S.game;
  const pos = game.shown;
  const last = game.lastMove;
  const checkSq = inCheck(pos, pos.turn) ? findKing(pos, pos.turn) : -1;

  for (let v = 0; v < 64; v++) {
    const idx = S.flipped ? 63 - v : v;
    const r = idx >> 3, c = idx & 7;
    const cell = cells[v];
    let cls = 'sq ' + ((r + c) % 2 === 0 ? 'l' : 'd');
    if (last && (last.from === idx || last.to === idx)) cls += ' last';
    if (S.sel === idx) cls += ' sel';
    if (checkSq === idx) cls += ' check';
    cell.className = cls;

    let co = '';
    if (v >= 56) co += `<span class="co f">${'abcdefgh'[c]}</span>`;
    if (v % 8 === 0) co += `<span class="co r">${8 - r}</span>`;
    cell.innerHTML = co;
  }

  const hints = $('#hints').children;
  for (let v = 0; v < 64; v++) hints[v].className = 'hint-cell';
  S.targets.forEach((m) => {
    const cell = hints[visualOf(m.to)];
    cell.className = 'hint-cell ' + (m.cap ? 'take' : 'move');
  });
}

function renderPieces(anim) {
  const layer = $('#pieces');
  layer.innerHTML = '';
  pieceEls = new Array(64).fill(null);
  const pos = S.game.shown;

  for (let idx = 0; idx < 64; idx++) {
    const p = pos.board[idx];
    if (!p) continue;
    const el = document.createElement('div');
    el.className = 'pc';
    el.innerHTML = pieceSvg(p.c, p.t);
    let from = idx;
    if (anim) {
      if (idx === anim.to) from = anim.from;
      else if (anim.castle) {
        const row = (anim.from >> 3) * 8;
        if (anim.castle === 'K' && idx === row + 5) from = row + 7;
        if (anim.castle === 'Q' && idx === row + 3) from = row + 0;
      }
    }
    const vf = visualOf(from);
    el.style.transform = `translate(${(vf % 8) * 100}%, ${((vf / 8) | 0) * 100}%)`;
    layer.appendChild(el);
    pieceEls[idx] = el;
  }

  if (anim) {
    void layer.offsetWidth; // flush layout so the transition has a start value
    for (let idx = 0; idx < 64; idx++) {
      const el = pieceEls[idx];
      if (!el) continue;
      const v = visualOf(idx);
      const want = `translate(${(v % 8) * 100}%, ${((v / 8) | 0) * 100}%)`;
      if (el.style.transform !== want) { el.classList.add('anim'); el.style.transform = want; }
    }
  }
}

function renderBars() {
  const topColor = S.flipped ? 'w' : 'b';
  const bottomColor = S.flipped ? 'b' : 'w';
  const caps = S.game.captured();
  const pos = S.game.shown;
  const over = !!S.game.result;

  [['#bar-top', topColor], ['#bar-bottom', bottomColor]].forEach(([sel, color]) => {
    const bar = $(sel);
    $('.nm', bar).textContent = S.names[color];
    const taken = $('.taken', bar);
    const adv = color === 'w' ? caps.score : -caps.score;
    taken.innerHTML = caps[color].map((t) => pieceSvg(color === 'w' ? 'b' : 'w', t)).join('') +
      (adv > 0 ? `<span class="adv">+${adv}</span>` : '');

    const clockEl = $('.clock', bar);
    const tc = tcById(S.tcId);
    clockEl.classList.toggle('hidden', tc.base === null);
    clockEl.textContent = fmtClock(S.clock[color]);
    const active = !over && pos.turn === color && S.game.atLive;
    clockEl.classList.toggle('run', active);
    clockEl.classList.toggle('low', active && S.clock[color] !== null && S.clock[color] <= 20);
    $('[data-dot]', bar).classList.toggle('on', active);
  });
}

function renderMoves() {
  const html = [];
  const sans = S.game.sans;
  if (!sans.length) html.push('<span class="empty">Zatím žádné tahy.</span>');
  for (let i = 0; i < sans.length; i += 2) {
    html.push(`<span class="no">${i / 2 + 1}.</span>`);
    html.push(`<button data-ply="${i + 1}" class="${S.game.ptr === i + 1 ? 'cur' : ''}">${sans[i]}</button>`);
    html.push(sans[i + 1]
      ? `<button data-ply="${i + 2}" class="${S.game.ptr === i + 2 ? 'cur' : ''}">${sans[i + 1]}</button>`
      : '<span></span>');
  }
  const markup = html.join('');
  ['#moves-side', '#moves-sheet'].forEach((sel) => {
    const box = $(sel);
    box.innerHTML = markup;
    $$('button', box).forEach((b) => {
      b.onclick = () => { S.game.ptr = Number(b.dataset.ply); render(); };
    });
    box.scrollTop = box.scrollHeight;
  });
}

function renderNav() {
  $('#nav-prev').disabled = S.game.ptr === 0;
  $('#nav-next').disabled = S.game.atLive;
}

function render(anim) {
  renderSquares();
  renderPieces(anim);
  renderBars();
  renderMoves();
  renderNav();
}

function setBanner(text, actionLabel, action) {
  const b = $('#banner');
  if (!text) { b.classList.add('hide'); return; }
  b.classList.remove('hide');
  b.innerHTML = '<span class="txt"></span>';
  $('.txt', b).innerHTML = text;
  if (actionLabel) {
    const a = document.createElement('button');
    a.className = 'act';
    a.textContent = actionLabel;
    a.onclick = action;
    b.appendChild(a);
  }
}

/* ------------------------------------------------------------ interaction */

let drag = null;

function myTurn() {
  const g = S.game;
  if (!g || g.result || !g.atLive) return false;
  if (!S.online) return true;
  return g.live.turn === S.myColor;
}

function squareAt(clientX, clientY) {
  const r = boardEl.getBoundingClientRect();
  const x = Math.floor((clientX - r.left) / (r.width / 8));
  const y = Math.floor((clientY - r.top) / (r.height / 8));
  if (x < 0 || x > 7 || y < 0 || y > 7) return -1;
  const v = y * 8 + x;
  return S.flipped ? 63 - v : v;
}

function select(idx) {
  const g = S.game;
  S.sel = idx;
  S.targets = idx === null ? [] : g.legal().filter((m) => m.from === idx);
  renderSquares();
}

function onPointerDown(e) {
  if (!S.game) return;
  const idx = squareAt(e.clientX, e.clientY);
  if (idx < 0) return;

  if (!S.game.atLive) { S.game.ptr = S.game.positions.length - 1; render(); }

  const target = S.targets.find((m) => m.to === idx);
  if (target) { attemptMove(S.sel, idx); return; }

  const pos = S.game.live;
  const piece = pos.board[idx];
  const mover = S.online ? S.myColor : pos.turn;
  if (!piece || piece.c !== pos.turn || piece.c !== mover || !myTurn()) {
    if (S.sel !== null) select(null);
    return;
  }

  select(idx);
  const el = pieceEls[idx];
  if (!el) return;
  const r = boardEl.getBoundingClientRect();
  drag = { idx, el, cell: r.width / 8, rect: r, moved: false };
  el.classList.add('drag');
  moveDragTo(e.clientX, e.clientY);
  boardEl.setPointerCapture && boardEl.setPointerCapture(e.pointerId);
  e.preventDefault();
}

function moveDragTo(cx, cy) {
  const { rect, cell, el } = drag;
  const x = cx - rect.left - cell / 2;
  const y = cy - rect.top - cell / 2;
  el.style.transform = `translate(${x}px, ${y}px)`;
}

function onPointerMove(e) {
  if (!drag) return;
  drag.moved = true;
  moveDragTo(e.clientX, e.clientY);
}

function onPointerUp(e) {
  if (!drag) return;
  const d = drag;
  drag = null;
  d.el.classList.remove('drag');
  const idx = squareAt(e.clientX, e.clientY);
  if (d.moved && idx >= 0 && idx !== d.idx && S.targets.some((m) => m.to === idx)) {
    attemptMove(d.idx, idx);
  } else if (d.moved && idx !== d.idx) {
    select(null);
    renderPieces();
  } else {
    renderPieces();
  }
}

function attemptMove(from, to) {
  const candidates = S.game.legal().filter((m) => m.from === from && m.to === to);
  if (!candidates.length) { select(null); renderPieces(); return; }
  if (candidates[0].promo) {
    S.pendingPromo = { from, to };
    openPromo(S.game.live.turn);
    return;
  }
  commitMove({ from, to, promo: null }, true);
}

function openPromo(color) {
  const row = $('#promo-row');
  row.innerHTML = '';
  ['q', 'r', 'b', 'n'].forEach((t) => {
    const b = document.createElement('button');
    b.innerHTML = pieceSvg(color, t);
    b.setAttribute('aria-label', PIECE_NAME[t]);
    b.onclick = () => {
      closeVeil('#veil-promo');
      const p = S.pendingPromo;
      S.pendingPromo = null;
      if (p) commitMove({ from: p.from, to: p.to, promo: t }, true);
    };
    row.appendChild(b);
  });
  openVeil('#veil-promo');
}

function commitMove(move, local) {
  const tc = tcById(S.tcId);
  const mover = S.game.live.turn;
  const played = S.game.play(move);
  if (!played) return;

  if (tc.base !== null && local) S.clock[mover] = Math.max(0, S.clock[mover]) + tc.inc;

  S.sel = null;
  S.targets = [];
  S.lastTick = performance.now();

  if (played.cap) sfx('capture'); else sfx('move');
  if (played.san.includes('+') || played.san.includes('#')) setTimeout(() => sfx('check'), 70);

  if (local && S.online && S.net) {
    S.net.send({ k: 'move', uci: moveToUci(played), wt: S.clock.w, bt: S.clock.b });
  }

  if (!S.online && S.autoFlip && !S.game.result) {
    S.flipped = S.game.live.turn === 'b';
  }

  render(played);
  if (S.game.result) endGame();
}

/* ---------------------------------------------------------------- clocks */

function canMate(pos, color) {
  let minor = 0;
  for (const p of pos.board) {
    if (!p || p.c !== color || p.t === 'k') continue;
    if (p.t === 'p' || p.t === 'r' || p.t === 'q') return true;
    minor++;
    if (minor >= 2) return true;
  }
  return false;
}

function tick() {
  requestAnimationFrame(tick);
  if (!S.game || !S.ticking || S.game.result || !S.game.atLive) { S.lastTick = performance.now(); return; }
  const now = performance.now();
  const dt = (now - S.lastTick) / 1000;
  if (dt < 0.05) return;
  S.lastTick = now;
  const turn = S.game.live.turn;
  if (S.clock[turn] === null) return;
  S.clock[turn] = Math.max(0, S.clock[turn] - dt);
  if (S.clock[turn] <= 0) {
    const winner = turn === 'w' ? 'b' : 'w';
    if (canMate(S.game.live, winner)) S.game.finish(winner === 'w' ? '1-0' : '0-1', 'timeout');
    else S.game.finish('1/2-1/2', 'timeout-material');
    endGame();
  }
  renderBars();
}

/* -------------------------------------------------------------- game end */

const RESULT_TEXT = {
  checkmate: (w) => `${w} dává mat.`,
  stalemate: () => 'Pat — hráč na tahu nemá legální tah, ale není v šachu.',
  fifty: () => 'Remíza podle pravidla 50 tahů.',
  repetition: () => 'Remíza trojím opakováním pozice.',
  material: () => 'Remíza — na šachovnici nezbývá materiál na mat.',
  timeout: (w) => `${w} vyhrává na čas.`,
  'timeout-material': () => 'Čas vypršel, ale soupeř nemá materiál na mat — remíza.',
  resign: (w) => `${w} vyhrává, soupeř partii vzdal.`,
  agreement: () => 'Remíza dohodou.',
  abandoned: (w) => `${w} vyhrává — soupeř opustil hru.`,
};

function endGame() {
  S.ticking = false;
  sfx('end');
  const g = S.game;
  const winner = g.result === '1-0' ? 'w' : g.result === '0-1' ? 'b' : null;
  const winnerName = winner ? S.names[winner] : '';
  $('#result-score').textContent = g.result.replace(/-/g, '–').replace('1/2', '½');
  $('#result-title').textContent =
    g.reason === 'checkmate' ? 'Mat!' :
      winner ? 'Vítězství' : 'Remíza';
  $('#result-text').textContent = (RESULT_TEXT[g.reason] || (() => ''))(winnerName);
  render();
  setTimeout(() => openVeil('#veil-result'), 380);
}

/* ------------------------------------------------------------------- net */

function bindNet(link, kind) {
  S.net = {
    kind,
    send: (m) => link.send(m),
    leave: () => (kind === 'lobby' ? link.leave() : link.close()),
  };
}

function handleNetMessage(msg) {
  switch (msg.k) {
    case 'setup':
      startOnlineGame(msg.yourColor, msg.tc, msg.name);
      S.net.send({ k: 'ready', name: S.name || 'Hráč' });
      break;
    case 'ready':
      S.peerName = msg.name || S.peerName;
      S.names[S.myColor === 'w' ? 'b' : 'w'] = S.peerName;
      renderBars();
      break;
    case 'move': {
      const m = uciToMove(S.game.live, msg.uci);
      if (!m) return;
      if (typeof msg.wt === 'number') S.clock.w = msg.wt;
      if (typeof msg.bt === 'number') S.clock.b = msg.bt;
      commitMove({ from: m.from, to: m.to, promo: m.promo }, false);
      break;
    }
    case 'resign':
      S.game.finish(S.myColor === 'w' ? '1-0' : '0-1', 'resign');
      endGame();
      break;
    case 'draw':
      if (msg.v === 'offer') {
        S.drawOfferBy = 'them';
        sfx('alert');
        setBanner(`<b>${S.peerName}</b> nabízí remízu.`, 'Přijmout', () => {
          S.net.send({ k: 'draw', v: 'accept' });
          S.game.finish('1/2-1/2', 'agreement');
          setBanner(null);
          endGame();
        });
      } else if (msg.v === 'accept') {
        S.game.finish('1/2-1/2', 'agreement');
        setBanner(null);
        endGame();
      } else {
        S.drawOfferBy = null;
        setBanner(null);
        toast('Remíza odmítnuta');
      }
      break;
    case 'rematch':
      if (msg.v === 'offer') {
        S.rematchOfferBy = 'them';
        sfx('alert');
        setBanner(`<b>${S.peerName}</b> chce odvetu.`, 'Hrát', () => {
          S.net.send({ k: 'rematch', v: 'accept' });
          startRematch(true);
        });
      } else startRematch(true);
      break;
    case 'bye':
      if (S.game && !S.game.result) {
        S.game.finish(S.myColor === 'w' ? '1-0' : '0-1', 'abandoned');
        endGame();
      }
      break;
    default:
      break;
  }
}

function startRematch(swap) {
  const myColor = swap ? (S.myColor === 'w' ? 'b' : 'w') : S.myColor;
  const me = S.name || 'Ty';
  setBanner(null);
  newGame({
    online: true,
    myColor,
    tcId: S.tcId,
    names: myColor === 'w' ? { w: me, b: S.peerName } : { w: S.peerName, b: me },
  });
}

lobby.ev.on('peers', () => { if (S.mode === 'link' && $('#screen-home').classList.contains('on')) renderPeers(); });

lobby.ev.on('invite', (inv) => {
  if (S.game && !S.game.result && S.online) { lobby.decline(inv.id); return; }
  S.incoming = inv;
  sfx('alert');
  $('#invite-title').textContent = `${inv.name} tě zve na partii`;
  $('#invite-text').textContent =
    `Tempo ${tcById(inv.tc).label} · hrál bys za ${inv.yourColor === 'w' ? 'bílé' : 'černé'}.`;
  openVeil('#veil-invite');
});

lobby.ev.on('paired', (peer) => {
  closeVeil('#veil-wait');
  const inv = S.pendingInvite;
  if (!inv) return;
  bindNet(lobby, 'lobby');
  S.peerName = peer.name || inv.peer.name;
  startOnlineGame(inv.myColor, inv.tc, S.peerName);
  S.net.send({ k: 'ready', name: S.name || 'Hráč' });
});

lobby.ev.on('declined', (peer) => {
  closeVeil('#veil-wait');
  toast(`${(peer && peer.name) || 'Soupeř'} pozvánku odmítl`);
});

lobby.ev.on('msg', (msg) => handleNetMessage(msg));
lobby.ev.on('closed', (why) => {
  if (S.game && !S.game.result && S.online) {
    S.game.finish(S.myColor === 'w' ? '1-0' : '0-1', 'abandoned');
    endGame();
  } else toast(why);
});

direct.ev.on('msg', (msg) => handleNetMessage(msg));
direct.ev.on('closed', (why) => {
  if (S.game && !S.game.result && S.online) {
    setBanner(`<b>Spojení přerušeno.</b> ${why}`);
    S.ticking = false;
  } else toast(why);
});

/* ------------------------------------------------- direct-connect wizard */

const connect = { role: null, offer: null, answer: null, step: 0 };

function openConnect(role) {
  connect.role = role;
  connect.step = 0;
  connect.offer = null;
  connect.answer = null;
  if (!direct.available) {
    toast('Tento prohlížeč neumí přímé spojení.');
    return;
  }
  renderConnect();
  openVeil('#veil-connect');
  if (role === 'host') buildOffer();
}

async function buildOffer() {
  try {
    const mine = resolveColor(S.sidePref);
    connect.myColor = mine;
    connect.offer = await direct.host();
    connect.step = 1;
    renderConnect();
  } catch (err) {
    $('#connect-lead').textContent = 'Pozvánku se nepodařilo vytvořit: ' + err.message;
  }
}

function codeBlock(code) {
  return `<div class="code-box" id="code-out">${code}</div>`;
}

function renderConnect() {
  const title = $('#connect-title');
  const lead = $('#connect-lead');
  const steps = $('#connect-steps');
  const body = $('#connect-body');
  const action = $('#connect-action');
  action.hidden = false;
  steps.innerHTML = '';
  body.innerHTML = '';

  if (connect.role === 'host') {
    title.textContent = 'Vytvořit pozvánku';
    if (connect.step === 0) {
      lead.textContent = 'Připravuji pozvánku…';
      body.innerHTML = '<div class="searching"><span class="spinner"></span><span>Zjišťuji adresu v místní síti…</span></div>';
      action.hidden = true;
      return;
    }
    if (connect.step === 1) {
      lead.textContent = 'Obě zařízení musí být na stejné Wi-Fi, hotspotu nebo Bluetooth PAN. Internet potřeba není.';
      steps.innerHTML =
        '<li>Pošli <b>kód pozvánky</b> soupeři (AirDrop, zpráva, nebo mu ho nadiktuj).</li>' +
        '<li>Soupeř ho vloží do <b>Mám kód</b> a vrátí ti <b>kód odpovědi</b>.</li>' +
        '<li>Ten vlož níže a hra začne.</li>';
      body.innerHTML = codeBlock(connect.offer) +
        '<div style="display:flex;gap:10px;margin:10px 0"><button class="btn ghost" id="copy-offer" style="flex:1">Kopírovat kód</button></div>' +
        '<textarea class="code-box" id="answer-in" rows="3" placeholder="Sem vlož kód odpovědi od soupeře"></textarea>';
      action.textContent = 'Připojit';
      $('#copy-offer').onclick = () => copyText(connect.offer);
      action.onclick = async () => {
        const val = $('#answer-in').value.trim();
        if (!val) { toast('Vlož kód odpovědi'); return; }
        try {
          await direct.confirm(val);
          connect.step = 2;
          renderConnect();
        } catch (err) { toast('Neplatný kód odpovědi'); }
      };
      return;
    }
    lead.textContent = 'Navazuji spojení…';
    body.innerHTML = '<div class="searching"><span class="spinner"></span><span>Čekám na soupeře…</span></div>';
    action.hidden = true;
    return;
  }

  title.textContent = 'Připojit se ke hře';
  if (connect.step === 0) {
    lead.textContent = 'Vlož kód pozvánky, který ti poslal soupeř.';
    body.innerHTML = '<textarea class="code-box" id="offer-in" rows="4" placeholder="Sem vlož kód pozvánky"></textarea>';
    action.textContent = 'Vytvořit odpověď';
    action.onclick = async () => {
      const val = $('#offer-in').value.trim();
      if (!val) { toast('Vlož kód pozvánky'); return; }
      try {
        connect.answer = await direct.join(val);
        connect.step = 1;
        renderConnect();
      } catch (err) { toast('Neplatný kód pozvánky'); }
    };
    return;
  }
  lead.textContent = 'Pošli tenhle kód odpovědi zpátky soupeři. Jakmile ho vloží, hra začne.';
  body.innerHTML = codeBlock(connect.answer) +
    '<div style="display:flex;gap:10px;margin:10px 0"><button class="btn ghost" id="copy-answer" style="flex:1">Kopírovat odpověď</button></div>' +
    '<div class="searching"><span class="spinner"></span><span>Čekám na spojení…</span></div>';
  $('#copy-answer').onclick = () => copyText(connect.answer);
  action.hidden = true;
}

direct.ev.on('open', () => {
  closeVeil('#veil-connect');
  bindNet(direct, 'direct');
  if (connect.role === 'host') {
    const mine = connect.myColor || 'w';
    S.net.send({ k: 'setup', yourColor: mine === 'w' ? 'b' : 'w', tc: S.tcId, name: S.name || 'Hráč' });
    startOnlineGame(mine, S.tcId, 'Soupeř');
  }
  toast('Spojeno!');
});

direct.ev.on('failed', () => {
  $('#connect-lead').textContent =
    'Spojení se nepodařilo. Zkontroluj, že jsou obě zařízení na stejné síti, a zkus to znovu.';
});

/* --------------------------------------------------------------- wiring */

function save() {
  try {
    localStorage.setItem('airplane-chess', JSON.stringify({
      name: S.name, mode: S.mode, tcId: S.tcId, side: S.sidePref,
      sound: S.sound, autoFlip: S.autoFlip,
    }));
  } catch (err) { /* private mode */ }
}
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem('airplane-chess') || '{}');
    if (raw.name) S.name = raw.name;
    if (raw.tcId && tcById(raw.tcId).id === raw.tcId) S.tcId = raw.tcId;
    if (raw.side) S.sidePref = raw.side;
    if (typeof raw.sound === 'boolean') S.sound = raw.sound;
    if (typeof raw.autoFlip === 'boolean') S.autoFlip = raw.autoFlip;
  } catch (err) { /* private mode */ }
}

function wire() {
  $('#mode-local').onclick = () => setMode('local');
  $('#mode-link').onclick = () => setMode('link');
  $('#start-local').onclick = startLocalGame;

  $('#name').value = S.name;
  $('#name').oninput = (e) => {
    S.name = e.target.value.trim();
    lobby.update({ name: S.name || 'Hráč' });
    save();
  };

  $$('#side button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.side === S.sidePref));
    b.onclick = () => {
      S.sidePref = b.dataset.side;
      $$('#side button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.side === S.sidePref)));
      save();
    };
  });

  $('#host-code').onclick = () => openConnect('host');
  $('#join-code').onclick = () => openConnect('join');
  $('#connect-cancel').onclick = () => { direct.close(); closeVeil('#veil-connect'); };

  $('#invite-accept').onclick = () => {
    const inv = S.incoming;
    closeVeil('#veil-invite');
    if (!inv) return;
    lobby.accept(inv.id);
    bindNet(lobby, 'lobby');
    S.peerName = inv.name;
    startOnlineGame(inv.yourColor, inv.tc, inv.name);
    S.net.send({ k: 'ready', name: S.name || 'Hráč' });
  };
  $('#invite-decline').onclick = () => {
    closeVeil('#veil-invite');
    if (S.incoming) lobby.decline(S.incoming.id);
    S.incoming = null;
  };
  $('#wait-cancel').onclick = () => { closeVeil('#veil-wait'); S.pendingInvite = null; };

  $('#nav-prev').onclick = () => { if (S.game.ptr > 0) { S.game.ptr--; render(); } };
  $('#nav-next').onclick = () => { if (!S.game.atLive) { S.game.ptr++; render(); } };
  $('#nav-menu').onclick = openMenu;
  $('#side-menu').onclick = openMenu;
  $('#nav-rematch').onclick = requestRematch;

  $('#result-rematch').onclick = () => { closeVeil('#veil-result'); requestRematch(); };
  $('#result-review').onclick = () => closeVeil('#veil-result');
  $('#result-home').onclick = goHome;

  $('#mi-flip').onclick = () => { S.flipped = !S.flipped; closeVeil('#veil-menu'); render(); };
  $('#mi-auto').onclick = () => {
    S.autoFlip = !S.autoFlip;
    $('#auto-state').textContent = S.autoFlip ? 'zap' : 'vyp';
    save();
  };
  $('#mi-sound').onclick = () => {
    S.sound = !S.sound;
    $('#sound-state').textContent = S.sound ? 'zap' : 'vyp';
    save();
  };
  $('#mi-pgn').onclick = () => {
    copyText(S.game.pgn({
      Event: 'Airplane Chess', Site: 'offline', Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
      White: S.names.w, Black: S.names.b, Result: S.game.result || '*',
    }));
    closeVeil('#veil-menu');
  };
  $('#mi-draw').onclick = () => {
    closeVeil('#veil-menu');
    if (!S.online) {
      S.game.finish('1/2-1/2', 'agreement');
      endGame();
      return;
    }
    S.net.send({ k: 'draw', v: 'offer' });
    S.drawOfferBy = 'me';
    toast('Nabídka remízy odeslána');
  };
  $('#mi-resign').onclick = () => {
    closeVeil('#veil-menu');
    if (!S.game || S.game.result) return;
    const loser = S.online ? S.myColor : S.game.live.turn;
    confirmAction('Vzdát partii?', `Partii vyhraje ${S.names[loser === 'w' ? 'b' : 'w']}.`, 'Vzdávám', () => {
      if (S.online && S.net) S.net.send({ k: 'resign' });
      S.game.finish(loser === 'w' ? '0-1' : '1-0', 'resign');
      endGame();
    });
  };
  $('#confirm-no').onclick = () => closeVeil('#veil-confirm');
  $('#mi-exit').onclick = goHome;

  boardEl.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  $$('.veil').forEach((v) => {
    v.addEventListener('pointerdown', (e) => {
      if (e.target === v && v.id !== 'veil-promo') v.classList.remove('on');
    });
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { $$('.veil.on').forEach((v) => { if (v.id !== 'veil-promo') v.classList.remove('on'); }); }
    if (!S.game || !$('#screen-game').classList.contains('on')) return;
    if (e.key === 'ArrowLeft' && S.game.ptr > 0) { S.game.ptr--; render(); }
    if (e.key === 'ArrowRight' && !S.game.atLive) { S.game.ptr++; render(); }
    if (e.key === 'f') { S.flipped = !S.flipped; render(); }
  });
}

function requestRematch() {
  const running = S.game && !S.game.result && S.game.sans.length > 0;
  if (running) {
    confirmAction('Začít novou partii?', 'Rozehraná partie se zahodí.', 'Nová partie', () => {
      S.rematchOfferBy = null;
      doRematch();
    });
    return;
  }
  doRematch();
}

function doRematch() {
  if (!S.online) {
    // Pass & play: swap who sits at the bottom so both players get both colours.
    newGame({ online: false, bottom: S.flipped ? 'w' : 'b', names: { w: 'Bílý', b: 'Černý' }, tcId: S.tcId });
    return;
  }
  if (S.rematchOfferBy === 'them') {
    S.net.send({ k: 'rematch', v: 'accept' });
    startRematch(true);
    return;
  }
  S.net.send({ k: 'rematch', v: 'offer' });
  toast('Nabídka odvety odeslána');
}

function openMenu() {
  $('#auto-state').textContent = S.autoFlip ? 'zap' : 'vyp';
  $('#sound-state').textContent = S.sound ? 'zap' : 'vyp';
  $('#mi-auto').hidden = S.online;
  $('#draw-label').textContent = S.online ? 'Nabídnout remízu' : 'Ukončit remízou';
  $('#mi-draw').hidden = !!(S.game && S.game.result);
  $('#mi-resign').hidden = !!(S.game && S.game.result);
  renderMoves();
  openVeil('#veil-menu');
}

/* ------------------------------------------------------------------ boot */

load();
buildSquares();
buildTimeControls();
wire();
setMode(S.mode);
$('#name').value = S.name;
requestAnimationFrame(tick);
