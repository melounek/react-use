/* Perft — move-generation validation against published node counts.
   Run: node chess/test/perft.js */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'engine.js'), 'utf8'), ctx);
vm.runInContext(`
  function perft(pos, depth) {
    if (depth === 0) return 1;
    const moves = legalMoves(pos);
    if (depth === 1) return moves.length;
    let n = 0;
    for (const m of moves) n += perft(applyMove(pos, m), depth - 1);
    return n;
  }
  globalThis.perft = perft;
  globalThis.fromFEN = fromFEN;
  globalThis.legalMoves = legalMoves;
  globalThis.applyMove = applyMove;
  globalThis.moveToSan = moveToSan;
  globalThis.Game = Game;
`, ctx);

const CASES = [
  ['startpos', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281, 4865609]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862, 4085603]],
  ['endgame', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238, 674624]],
  ['promo/pin', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467, 422333]],
  ['position5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379, 2103487]],
  ['position6', 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890, 3894594]],
];

let failed = 0;
for (const [name, fen, expected] of CASES) {
  expected.forEach((want, i) => {
    const depth = i + 1;
    const t0 = Date.now();
    const got = ctx.perft(ctx.fromFEN(fen), depth);
    const ok = got === want;
    if (!ok) failed++;
    console.log(`${ok ? '  ok  ' : ' FAIL '} ${name} depth ${depth}: ${got}` +
      (ok ? ` (${Date.now() - t0}ms)` : ` — expected ${want}`));
  });
}

/* A short scripted game exercising SAN, castling, en passant and promotion. */
const g = new ctx.Game();
const line = ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'f1b5', 'c8d7', 'b5d7', 'd8d7', 'e1g1'];
for (const uci of line) {
  const from = 'abcdefgh'.indexOf(uci[0]) + (8 - +uci[1]) * 8;
  const to = 'abcdefgh'.indexOf(uci[2]) + (8 - +uci[3]) * 8;
  if (!g.play({ from, to, promo: uci[4] || null })) { console.log(` FAIL  illegal move ${uci}`); failed++; }
}
const sanLine = g.sans.join(' ');
const wantSan = 'e4 c5 Nf3 d6 Bb5+ Bd7 Bxd7+ Qxd7 O-O';
if (sanLine !== wantSan) { console.log(` FAIL  SAN: ${sanLine} — expected ${wantSan}`); failed++; }
else console.log(`  ok   SAN line: ${sanLine}`);

/* Fool's mate — checkmate detection. */
const m = new ctx.Game();
[['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']].forEach(([a, b]) => {
  const i = (s) => 'abcdefgh'.indexOf(s[0]) + (8 - +s[1]) * 8;
  m.play({ from: i(a), to: i(b) });
});
if (m.result !== '0-1' || m.reason !== 'checkmate') { console.log(' FAIL  fool\'s mate not detected'); failed++; }
else console.log('  ok   fool\'s mate: 0-1 by checkmate, SAN ' + m.sans.join(' '));

/* Stalemate. */
const st = new ctx.Game();
const stPos = ctx.fromFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
if (ctx.legalMoves(stPos).length !== 0) { console.log(' FAIL  stalemate position has moves'); failed++; }
else console.log('  ok   stalemate position has no legal moves');

console.log(failed ? `\n${failed} failing check(s)` : '\nall checks passed');
process.exit(failed ? 1 : 0);
