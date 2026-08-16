#!/usr/bin/env node
/* Bundles chess/src/* into two self-contained outputs:
     chess/app.html    page content only (Artifact publishing format)
     chess/index.html  full standalone document (open from disk or any host)
   Everything is inlined — no network requests at runtime. */

const fs = require('fs');
const path = require('path');

const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');

const TITLE = 'Airplane Chess';
const DESC = 'Šachy pro dva hráče na jednom telefonu nebo na dvou zařízeních propojených bez internetu.';

const content = [
  `<title>${TITLE}</title>`,
  '<style>',
  src('style.css').trim(),
  '</style>',
  '',
  src('markup.html').trim(),
  '',
  '<script>',
  src('pieces.js').trim(),
  '</script>',
  '<script>',
  src('engine.js').trim(),
  '</script>',
  '<script>',
  src('net.js').trim(),
  '</script>',
  '<script>',
  src('ui.js').trim(),
  '</script>',
  '',
].join('\n');

fs.writeFileSync(path.join(__dirname, 'app.html'), content);

const standalone = [
  '<!doctype html>',
  '<html lang="cs">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="theme-color" content="#0e100f">',
  `<meta name="description" content="${DESC}">`,
  content.replace(/^<style>/m, '<style>\nhtml,body{margin:0;padding:0}'),
  '</head>',
  '<body>',
  '</body>',
  '</html>',
].join('\n');

// The bundle already carries markup and scripts in document order; for the
// standalone file everything after </style> belongs in <body>.
const cut = standalone.indexOf('</style>') + '</style>'.length;
const head = standalone.slice(0, cut);
const rest = standalone.slice(cut).replace('</head>\n<body>\n', '').replace('\n</body>\n</html>', '');
fs.writeFileSync(
  path.join(__dirname, 'index.html'),
  `${head}\n</head>\n<body>${rest}</body>\n</html>\n`
);

console.log('built chess/app.html and chess/index.html');
