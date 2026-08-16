/* =========================================================================
   Airplane Chess — piece artwork
   Hand-authored Staunton silhouettes on a 45x45 grid. Same geometry for both
   colours; fill and stroke come from CSS so the set stays consistent on light
   and dark squares alike.
   ========================================================================= */

const BASE = '<rect class="b" x="8.4" y="38.2" width="28.2" height="5.9" rx="2.2"/>';
const COLLAR = '<rect class="b" x="10.9" y="34.2" width="23.2" height="4.6" rx="1.7"/>';

/* Paths are kept on one line each: breaking a `d` string across concatenated
   lines silently glues two numbers together and the whole path stops parsing. */
const PIECE_PATHS = {
  p: [
    '<circle class="b" cx="22.5" cy="13.6" r="5.1"/>',
    '<path class="b" d="M17.7 17.9 C15.2 19.3 13.5 22 13.5 25 C13.5 27.6 14.8 29.9 16.8 31.4 C13.1 33.5 10.4 36.2 9.3 39.4 L35.7 39.4 C34.6 36.2 31.9 33.5 28.2 31.4 C30.2 29.9 31.5 27.6 31.5 25 C31.5 22 29.8 19.3 27.3 17.9 Z"/>',
    BASE,
  ].join(''),

  r: [
    '<path class="b" d="M12.2 11.4 h4.6 v4 h3.4 v-4 h4.6 v4 h3.4 v-4 h4.6 v8 l-3.1 2.8 v10.6 l3.7 3.6 H11.6 l3.7-3.6 V22.2 l-3.1-2.8 Z"/>',
    '<path class="d" d="M15.3 22.4 H29.7 M15.3 32.8 H29.7"/>',
    COLLAR, BASE,
  ].join(''),

  n: [
    '<path class="b" d="M31.8 39 C32.6 28.6 31.8 21.8 28.5 17.6 C26.9 15.5 24.8 14.2 22.8 13.4 L23.6 9 L20 12.6 C17.3 12.7 14.4 14.1 12.2 16.5 C10.2 18.7 9.3 21.2 10.2 22.8 C10.9 24.1 12.5 24.2 13.7 23.3 L15.6 20.9 L18 21.8 C17.2 25.2 14.3 26.7 12.7 29.1 C11.1 31.5 11.3 35.8 12.1 39 Z"/>',
    '<circle class="dot" cx="15.9" cy="18.4" r="1.15"/>',
    '<path class="d" d="M25.4 17.6 C27.6 21.2 28.4 27.4 28 34.8"/>',
    BASE,
  ].join(''),

  b: [
    '<circle class="b" cx="22.5" cy="7.8" r="2.3"/>',
    '<path class="b" d="M22.5 9.8 C19 14.3 15 20.4 15 25.4 C15 28.8 18.4 31.1 22.5 31.1 C26.6 31.1 30 28.8 30 25.4 C30 20.4 26 14.3 22.5 9.8 Z"/>',
    '<path class="d" d="M25.8 15.8 L19.4 23.6"/>',
    '<rect class="b" x="12.3" y="30.4" width="20.4" height="4.3" rx="1.7"/>',
    COLLAR, BASE,
  ].join(''),

  q: [
    '<path class="b" d="M8.4 26.4 L6.2 14.4 L13 24.6 L13 11 L18.4 23.8 L22.5 9.2 L26.6 23.8 L32 11 L32 24.6 L38.8 14.4 L36.6 26.4 C30.6 25.1 14.4 25.1 8.4 26.4 Z"/>',
    '<circle class="b" cx="6.3" cy="12.6" r="2.4"/><circle class="b" cx="13" cy="9.4" r="2.4"/>',
    '<circle class="b" cx="22.5" cy="7.5" r="2.6"/><circle class="b" cx="32" cy="9.4" r="2.4"/>',
    '<circle class="b" cx="38.7" cy="12.6" r="2.4"/>',
    '<path class="b" d="M8.8 28.4 C15 27.1 30 27.1 36.2 28.4 C35.6 31.8 34.6 33.6 34.6 35.8 L10.4 35.8 C10.4 33.6 9.4 31.8 8.8 28.4 Z"/>',
    '<path class="d" d="M10.4 31.6 C16 30.6 29 30.6 34.6 31.6"/>',
    COLLAR, BASE,
  ].join(''),

  k: [
    '<path class="b" d="M22.5 15.4 C17.1 15.4 13 19.3 13 24.4 C13 27 13.9 29.2 15.3 30.9 L29.7 30.9 C31.1 29.2 32 27 32 24.4 C32 19.3 27.9 15.4 22.5 15.4 Z"/>',
    '<path class="d cross" d="M22.5 3.4 V15 M17.3 8 H27.7"/>',
    '<path class="d" d="M14.1 27.4 H30.9"/>',
    '<rect class="b" x="12.3" y="30.6" width="20.4" height="4.1" rx="1.6"/>',
    COLLAR, BASE,
  ].join(''),
};

const PIECE_NAME = { p: 'pěšec', n: 'jezdec', b: 'střelec', r: 'věž', q: 'dáma', k: 'král' };

function pieceSvg(color, type, cls) {
  return `<svg class="piece ${color} ${cls || ''}" viewBox="0 0 45 45" aria-hidden="true">` +
    PIECE_PATHS[type] + '</svg>';
}
