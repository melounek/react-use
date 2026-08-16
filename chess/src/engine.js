/* =========================================================================
   Airplane Chess — rules engine
   Complete FIDE move generation: castling, en passant, promotion,
   check / checkmate / stalemate, 50-move rule, threefold repetition,
   insufficient material. Board is a flat 64 array, index 0 = a8, 63 = h1.
   ========================================================================= */

const FILES = 'abcdefgh';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const N_DIRS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const K_DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const B_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const R_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

const sqName = (i) => FILES[i & 7] + (8 - (i >> 3));
const sqIndex = (n) => FILES.indexOf(n[0]) + (8 - Number(n[1])) * 8;
const fileOf = (i) => i & 7;
const rankOf = (i) => i >> 3; // 0 = rank 8
const onBoard = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const other = (c) => (c === 'w' ? 'b' : 'w');

function fromFEN(fen) {
  const parts = fen.trim().split(/\s+/);
  const board = new Array(64).fill(null);
  let i = 0;
  for (const ch of parts[0]) {
    if (ch === '/') continue;
    if (ch >= '1' && ch <= '8') { i += Number(ch); continue; }
    board[i++] = { t: ch.toLowerCase(), c: ch === ch.toUpperCase() ? 'w' : 'b' };
  }
  const rights = parts[2] || '-';
  return {
    board,
    turn: parts[1] || 'w',
    castling: {
      K: rights.includes('K'), Q: rights.includes('Q'),
      k: rights.includes('k'), q: rights.includes('q'),
    },
    ep: !parts[3] || parts[3] === '-' ? null : sqIndex(parts[3]),
    half: Number(parts[4] || 0),
    full: Number(parts[5] || 1),
  };
}

function toFEN(pos) {
  let out = '';
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let c = 0; c < 8; c++) {
      const p = pos.board[r * 8 + c];
      if (!p) { empty++; continue; }
      if (empty) { out += empty; empty = 0; }
      out += p.c === 'w' ? p.t.toUpperCase() : p.t;
    }
    if (empty) out += empty;
    if (r < 7) out += '/';
  }
  const cast = (pos.castling.K ? 'K' : '') + (pos.castling.Q ? 'Q' : '') +
    (pos.castling.k ? 'k' : '') + (pos.castling.q ? 'q' : '');
  return `${out} ${pos.turn} ${cast || '-'} ${pos.ep === null ? '-' : sqName(pos.ep)} ${pos.half} ${pos.full}`;
}

/** Position identity for repetition detection (FEN without the move counters). */
function posKey(pos) {
  return toFEN(pos).split(' ').slice(0, 4).join(' ');
}

function startPosition() { return fromFEN(START_FEN); }

function findKing(pos, color) {
  for (let i = 0; i < 64; i++) {
    const p = pos.board[i];
    if (p && p.t === 'k' && p.c === color) return i;
  }
  return -1;
}

/** Is square `sq` attacked by any piece of color `by`? */
function attacked(pos, sq, by) {
  const r = rankOf(sq), c = fileOf(sq);
  const b = pos.board;

  // Pawns. A white pawn on (r+1, c±1) attacks (r, c).
  const pr = by === 'w' ? r + 1 : r - 1;
  for (const dc of [-1, 1]) {
    if (!onBoard(pr, c + dc)) continue;
    const p = b[pr * 8 + c + dc];
    if (p && p.c === by && p.t === 'p') return true;
  }
  for (const [dr, dc] of N_DIRS) {
    if (!onBoard(r + dr, c + dc)) continue;
    const p = b[(r + dr) * 8 + c + dc];
    if (p && p.c === by && p.t === 'n') return true;
  }
  for (const [dr, dc] of K_DIRS) {
    if (!onBoard(r + dr, c + dc)) continue;
    const p = b[(r + dr) * 8 + c + dc];
    if (p && p.c === by && p.t === 'k') return true;
  }
  const slide = (dirs, types) => {
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (onBoard(rr, cc)) {
        const p = b[rr * 8 + cc];
        if (p) {
          if (p.c === by && types.includes(p.t)) return true;
          break;
        }
        rr += dr; cc += dc;
      }
    }
    return false;
  };
  return slide(B_DIRS, 'bq') || slide(R_DIRS, 'rq');
}

function inCheck(pos, color) {
  const k = findKing(pos, color);
  return k >= 0 && attacked(pos, k, other(color));
}

function mk(from, to, extra) {
  return Object.assign({ from, to, promo: null, castle: null, ep: false, cap: null }, extra);
}

function pseudoMoves(pos) {
  const moves = [];
  const b = pos.board;
  const me = pos.turn, them = other(me);

  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p || p.c !== me) continue;
    const r = rankOf(i), c = fileOf(i);

    if (p.t === 'p') {
      const dr = me === 'w' ? -1 : 1;
      const startRank = me === 'w' ? 6 : 1;
      const lastRank = me === 'w' ? 0 : 7;
      const one = (r + dr) * 8 + c;
      if (onBoard(r + dr, c) && !b[one]) {
        if (r + dr === lastRank) {
          for (const q of 'qrbn') moves.push(mk(i, one, { promo: q }));
        } else {
          moves.push(mk(i, one));
          const two = (r + 2 * dr) * 8 + c;
          if (r === startRank && !b[two]) moves.push(mk(i, two, { dbl: true }));
        }
      }
      for (const dc of [-1, 1]) {
        if (!onBoard(r + dr, c + dc)) continue;
        const t = (r + dr) * 8 + c + dc;
        const victim = b[t];
        if (victim && victim.c === them) {
          if (r + dr === lastRank) {
            for (const q of 'qrbn') moves.push(mk(i, t, { promo: q, cap: { sq: t, piece: victim } }));
          } else moves.push(mk(i, t, { cap: { sq: t, piece: victim } }));
        } else if (!victim && pos.ep === t) {
          const capSq = r * 8 + c + dc;
          moves.push(mk(i, t, { ep: true, cap: { sq: capSq, piece: b[capSq] } }));
        }
      }
      continue;
    }

    const step = (dirs, sliding) => {
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (onBoard(rr, cc)) {
          const t = rr * 8 + cc;
          const victim = b[t];
          if (!victim) moves.push(mk(i, t));
          else {
            if (victim.c === them) moves.push(mk(i, t, { cap: { sq: t, piece: victim } }));
            break;
          }
          if (!sliding) break;
          rr += dr; cc += dc;
        }
      }
    };

    if (p.t === 'n') step(N_DIRS, false);
    else if (p.t === 'b') step(B_DIRS, true);
    else if (p.t === 'r') step(R_DIRS, true);
    else if (p.t === 'q') step(B_DIRS.concat(R_DIRS), true);
    else if (p.t === 'k') {
      step(K_DIRS, false);
      // Castling: king and rook unmoved, path clear, king never crosses attack.
      const homeRank = me === 'w' ? 7 : 0;
      if (r === homeRank && c === 4 && !attacked(pos, i, them)) {
        const kSide = me === 'w' ? pos.castling.K : pos.castling.k;
        const qSide = me === 'w' ? pos.castling.Q : pos.castling.q;
        const row = homeRank * 8;
        if (kSide && !b[row + 5] && !b[row + 6] &&
          !attacked(pos, row + 5, them) && !attacked(pos, row + 6, them)) {
          moves.push(mk(i, row + 6, { castle: 'K' }));
        }
        if (qSide && !b[row + 1] && !b[row + 2] && !b[row + 3] &&
          !attacked(pos, row + 3, them) && !attacked(pos, row + 2, them)) {
          moves.push(mk(i, row + 2, { castle: 'Q' }));
        }
      }
    }
  }
  return moves;
}

function applyMove(pos, m) {
  const board = pos.board.slice();
  const piece = board[m.from];
  const me = piece.c;
  const castling = Object.assign({}, pos.castling);

  board[m.from] = null;
  if (m.cap) board[m.cap.sq] = null;
  board[m.to] = m.promo ? { t: m.promo, c: me } : piece;

  if (m.castle) {
    const row = rankOf(m.from) * 8;
    if (m.castle === 'K') { board[row + 5] = board[row + 7]; board[row + 7] = null; }
    else { board[row + 3] = board[row + 0]; board[row + 0] = null; }
  }

  if (piece.t === 'k') {
    if (me === 'w') { castling.K = false; castling.Q = false; }
    else { castling.k = false; castling.q = false; }
  }
  // Rook leaving or being captured on its home square kills that right.
  for (const [sq, key] of [[63, 'K'], [56, 'Q'], [7, 'k'], [0, 'q']]) {
    if (m.from === sq || m.to === sq) castling[key] = false;
  }

  return {
    board,
    turn: other(me),
    castling,
    ep: m.dbl ? (m.from + m.to) / 2 : null,
    half: piece.t === 'p' || m.cap ? 0 : pos.half + 1,
    full: me === 'b' ? pos.full + 1 : pos.full,
  };
}

function legalMoves(pos) {
  const out = [];
  for (const m of pseudoMoves(pos)) {
    if (!inCheck(applyMove(pos, m), pos.turn)) out.push(m);
  }
  return out;
}

function moveToSan(pos, m, legal) {
  const p = pos.board[m.from];
  let san;
  if (m.castle) san = m.castle === 'K' ? 'O-O' : 'O-O-O';
  else if (p.t === 'p') {
    san = m.cap ? FILES[fileOf(m.from)] + 'x' + sqName(m.to) : sqName(m.to);
    if (m.promo) san += '=' + m.promo.toUpperCase();
  } else {
    const rivals = legal.filter((x) =>
      x.to === m.to && x.from !== m.from && pos.board[x.from] && pos.board[x.from].t === p.t);
    let dis = '';
    if (rivals.length) {
      const sameFile = rivals.some((x) => fileOf(x.from) === fileOf(m.from));
      const sameRank = rivals.some((x) => rankOf(x.from) === rankOf(m.from));
      if (!sameFile) dis = FILES[fileOf(m.from)];
      else if (!sameRank) dis = String(8 - rankOf(m.from));
      else dis = sqName(m.from);
    }
    san = p.t.toUpperCase() + dis + (m.cap ? 'x' : '') + sqName(m.to);
  }
  const next = applyMove(pos, m);
  if (inCheck(next, next.turn)) san += legalMoves(next).length ? '+' : '#';
  return san;
}

/** Compact wire format: "e2e4", "e7e8q". */
const moveToUci = (m) => sqName(m.from) + sqName(m.to) + (m.promo || '');
function uciToMove(pos, uci) {
  const from = sqIndex(uci.slice(0, 2));
  const to = sqIndex(uci.slice(2, 4));
  const promo = uci[4] || null;
  return legalMoves(pos).find((m) => m.from === from && m.to === to && (m.promo || null) === promo) || null;
}

function insufficientMaterial(pos) {
  const bishops = [];
  let others = 0;
  for (let i = 0; i < 64; i++) {
    const p = pos.board[i];
    if (!p || p.t === 'k') continue;
    if (p.t === 'b') bishops.push({ c: p.c, dark: ((rankOf(i) + fileOf(i)) & 1) === 1 });
    else if (p.t === 'n') others++;
    else return false; // pawn, rook or queen can always mate
  }
  if (bishops.length === 0) return others <= 1;          // K vs K, K+N vs K
  if (others > 0) return false;                           // bishop + knight can mate
  if (bishops.length === 1) return true;                  // K+B vs K
  return bishops.every((b) => b.dark === bishops[0].dark); // all bishops same colour complex
}

class Game {
  constructor(fen) {
    this.positions = [fen ? fromFEN(fen) : startPosition()];
    this.moves = [];
    this.sans = [];
    this.keys = [posKey(this.positions[0])];
    this.ptr = 0;            // index into positions for board navigation
    this.result = null;      // '1-0' | '0-1' | '1/2-1/2'
    this.reason = null;
  }

  get live() { return this.positions[this.positions.length - 1]; }
  get shown() { return this.positions[this.ptr]; }
  get atLive() { return this.ptr === this.positions.length - 1; }
  get lastMove() { return this.ptr > 0 ? this.moves[this.ptr - 1] : null; }

  legal() { return this.result ? [] : legalMoves(this.live); }

  play(move) {
    const pos = this.live;
    const legal = legalMoves(pos);
    const m = legal.find((x) => x.from === move.from && x.to === move.to &&
      (x.promo || null) === (move.promo || null));
    if (!m) return null;
    m.san = moveToSan(pos, m, legal);
    const next = applyMove(pos, m);
    this.positions.push(next);
    this.moves.push(m);
    this.sans.push(m.san);
    this.keys.push(posKey(next));
    this.ptr = this.positions.length - 1;
    this.evaluate();
    return m;
  }

  evaluate() {
    const pos = this.live;
    const moves = legalMoves(pos);
    if (!moves.length) {
      if (inCheck(pos, pos.turn)) {
        this.result = pos.turn === 'w' ? '0-1' : '1-0';
        this.reason = 'checkmate';
      } else {
        this.result = '1/2-1/2';
        this.reason = 'stalemate';
      }
      return;
    }
    if (pos.half >= 100) { this.result = '1/2-1/2'; this.reason = 'fifty'; return; }
    const key = this.keys[this.keys.length - 1];
    if (this.keys.filter((k) => k === key).length >= 3) {
      this.result = '1/2-1/2'; this.reason = 'repetition'; return;
    }
    if (insufficientMaterial(pos)) { this.result = '1/2-1/2'; this.reason = 'material'; }
  }

  finish(result, reason) { this.result = result; this.reason = reason; }

  inCheckNow() { return inCheck(this.shown, this.shown.turn); }

  /** Material balance in centipawn-ish units, for the captured-piece strip. */
  captured() {
    const start = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    const alive = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
    for (const p of this.shown.board) if (p && p.t !== 'k') alive[p.c][p.t]++;
    const out = { w: [], b: [] };
    const val = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    let score = 0;
    for (const t of ['q', 'r', 'b', 'n', 'p']) {
      for (let i = 0; i < start[t] - alive.b[t]; i++) out.w.push(t); // white captured black pieces
      for (let i = 0; i < start[t] - alive.w[t]; i++) out.b.push(t);
      score += (start[t] - alive.b[t]) * val[t] - (start[t] - alive.w[t]) * val[t];
    }
    return { w: out.w, b: out.b, score };
  }

  pgn(meta) {
    const tags = Object.entries(meta || {})
      .map(([k, v]) => `[${k} "${String(v).replace(/"/g, "'")}"]`).join('\n');
    let body = '';
    for (let i = 0; i < this.sans.length; i++) {
      if (i % 2 === 0) body += `${i / 2 + 1}. `;
      body += this.sans[i] + ' ';
    }
    return `${tags}\n\n${body}${this.result || '*'}`.trim();
  }
}
