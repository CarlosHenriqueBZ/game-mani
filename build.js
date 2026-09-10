// Monta index.html a partir das partes. Uso: node build.js
// index.html continua sendo o único arquivo necessário para jogar; as partes
// (*-part.js) existem só para facilitar a edição. Rodar de novo é idempotente.
const fs = require('fs');
const path = require('path');
const root = __dirname;
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const indent = code => code.trim().split('\n').map(line => line ? '  ' + line : line).join('\n');
let html = read('index.html');

// 1) CONFIG: bloco CHARACTERS dentro do primeiro <script>.
const config = (read('config-part.js').replace(/\s+$/, '') + '\n' + read('enemies-part.js')).replace(/\s+$/, '');
const configPattern = /(<script>\r?\n\s*'use strict';\r?\n)[\s\S]*?(\r?\n\s*<\/script>)/;
if (!configPattern.test(html)) throw new Error('bloco CONFIG não encontrado');
html = html.replace(configPattern, (_, open, close) => open + config + close);

// 2) Código do jogo: segundo <script>, na ordem COMBAT → ART → APP.
const parts = ['combat-part.js', 'street-part.js', 'art-part.js', 'app-part.js'].map(read);
parts.forEach((code, i) => { if (code.includes('</script')) throw new Error('"</script" dentro de ' + i); });
const scripts = [...html.matchAll(/<script>[\s\S]*?<\/script>/g)];
if (scripts.length !== 2) throw new Error('esperava exatamente 2 blocos <script>, achei ' + scripts.length);
const game = scripts[1];
const body = "<script>\n  'use strict';\n" + parts.map(indent).join('\n') + '\n  </script>';
html = html.slice(0, game.index) + body + html.slice(game.index + game[0].length);

// 3) Fonte pixel embutida (Chrome bloqueia @font-face por file://; base64 resolve).
const fontFile = path.join(root, 'assets', 'fonts', 'PressStart2P.woff2');
if (fs.existsSync(fontFile)) {
  const data = 'data:font/woff2;base64,' + fs.readFileSync(fontFile).toString('base64');
  const fontPattern = /url\((?:data:font\/woff2;base64,[A-Za-z0-9+/=]+|assets\/fonts\/PressStart2P\.woff2)\)\s*format\('woff2'\)/;
  if (!fontPattern.test(html)) throw new Error('@font-face da Press Start 2P não encontrado');
  html = html.replace(fontPattern, `url(${data}) format('woff2')`);
}

fs.writeFileSync(path.join(root, 'index.html'), html);
const out = process.argv[2];
if (out) fs.writeFileSync(out, [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n'));
console.log('index.html montado:', html.length, 'bytes');
