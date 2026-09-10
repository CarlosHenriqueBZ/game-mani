// Ferramenta de sprites: paleta e recolor de packs PNG (sem dependências).
// node tools/sprite-tool.js palette <pasta> [saida.png]   -> lista cores + folha de amostras
// node tools/sprite-tool.js recolor <origem> <destino> <mapa.json>
//   mapa.json: { "grupos": [ { "de": ["#hex", ...], "para": "#hex" }, ... ] }
//   Cada grupo troca matiz/saturação preservando o sombreado relativo das cores de origem.
const fs = require('fs'), path = require('path'), zlib = require('zlib');

function decode(file) {
  const buf = fs.readFileSync(file);
  let pos = 8, width, height, depth, ctype, interlace, idat = [], palette = null, trns = null;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; interlace = data[12]; }
    else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  if (interlace) throw new Error('interlaced: ' + file);
  if (depth !== 8) throw new Error('depth ' + depth + ': ' + file);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = width * channels, out = Buffer.alloc(height * stride);
  let ip = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[ip++], row = y * stride, prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[row + x - channels] : 0, b = y ? out[prev + x] : 0, c = (x >= channels && y) ? out[prev + x - channels] : 0;
      let v = raw[ip++];
      if (filter === 1) v += a; else if (filter === 2) v += b; else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[row + x] = v & 255;
    }
  }
  // Normaliza para RGBA.
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, p = 0; i < width * height; i++, p += 4) {
    const s = i * channels;
    if (ctype === 6) { rgba[p] = out[s]; rgba[p + 1] = out[s + 1]; rgba[p + 2] = out[s + 2]; rgba[p + 3] = out[s + 3]; }
    else if (ctype === 2) { rgba[p] = out[s]; rgba[p + 1] = out[s + 1]; rgba[p + 2] = out[s + 2]; rgba[p + 3] = 255; }
    else if (ctype === 3) { const idx = out[s]; rgba[p] = palette[idx * 3]; rgba[p + 1] = palette[idx * 3 + 1]; rgba[p + 2] = palette[idx * 3 + 2]; rgba[p + 3] = trns && idx < trns.length ? trns[idx] : 255; }
    else if (ctype === 4) { rgba[p] = rgba[p + 1] = rgba[p + 2] = out[s]; rgba[p + 3] = out[s + 1]; }
    else { rgba[p] = rgba[p + 1] = rgba[p + 2] = out[s]; rgba[p + 3] = 255; }
  }
  return { width, height, data: rgba };
}

function encode(width, height, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
const parse = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > .5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToRgb(h, s, l) {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => { t = (t + 1) % 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < .5) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map(v => Math.round(Math.max(0, Math.min(1, v)) * 255));
}

const pngs = dir => fs.readdirSync(dir).filter(f => /\.png$/i.test(f)).map(f => path.join(dir, f));

function palette(dir, out) {
  const counts = new Map();
  for (const file of pngs(dir)) {
    const img = decode(file);
    for (let p = 0; p < img.data.length; p += 4) {
      if (img.data[p + 3] < 128) continue;
      const key = hex(img.data[p], img.data[p + 1], img.data[p + 2]);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  console.log(path.basename(dir), sorted.length, 'cores');
  sorted.slice(0, 40).forEach(([c, n], i) => console.log(String(i).padStart(2), c, n));
  if (out) {
    const cell = 28, cols = 10, rows = Math.ceil(Math.min(40, sorted.length) / cols);
    const w = cols * cell, h = rows * cell, data = Buffer.alloc(w * h * 4);
    sorted.slice(0, 40).forEach(([c], i) => {
      const [r, g, b] = parse(c), cx = (i % cols) * cell, cy = Math.floor(i / cols) * cell;
      for (let y = cy; y < cy + cell; y++) for (let x = cx; x < cx + cell; x++) {
        const p = (y * w + x) * 4, edge = x === cx || y === cy;
        data[p] = edge ? 255 : r; data[p + 1] = edge ? 255 : g; data[p + 2] = edge ? 255 : b; data[p + 3] = 255;
      }
    });
    fs.writeFileSync(out, encode(w, h, data));
    console.log('amostras em', out);
  }
}

function recolor(src, dst, mapFile) {
  const map = typeof mapFile === 'string' ? JSON.parse(fs.readFileSync(mapFile, 'utf8')) : mapFile;
  const lookup = new Map(), topoLimit = new Map();
  for (const group of map.grupos) {
    if (group.topo !== undefined) group.de.forEach(h => topoLimit.set(h.toLowerCase(), group.topo));
    const targets = group.de.map(parse), tgt = parse(group.para);
    const [th, ts, tl] = rgbToHsl(...tgt);
    const meanL = targets.reduce((sum, c) => sum + rgbToHsl(...c)[2], 0) / targets.length;
    for (const c of targets) {
      const [, , l] = rgbToHsl(...c);
      // Mesmo matiz/saturação do alvo, luminosidade relativa da origem.
      const nl = Math.max(0.04, Math.min(0.96, tl + (l - meanL) * (group.contraste ?? 1)));
      lookup.set(hex(...c), hslToRgb(th, ts, nl));
    }
  }
  fs.mkdirSync(dst, { recursive: true });
  const skinSet = new Set((map.pele || []).map(h => h.toLowerCase()));
  const hairSet = new Set((map.cabelo || []).map(h => h.toLowerCase()));
  const acessorios = map.acessorios || [];
  let changed = 0, heads = 0, frames = 0;
  for (const file of pngs(src)) {
    const img = decode(file);
    const fw = map.quadro > 0 ? map.quadro : img.width, count = Math.max(1, Math.round(img.width / fw));
    // 1) Cabeça por quadro (antes do recolor, com as cores originais).
    const headsByFrame = [];
    if (acessorios.length && skinSet.size) {
      for (let f = 0; f < count; f++) headsByFrame.push(findHead(img, f * fw, fw, skinSet, hairSet, map.cabecaAte ?? .4));
    }
    // 2) Troca de cores (opcionalmente só no topo do corpo: grupo.topo = fração da altura).
    const bodyTops = [];
    for (let f = 0; f < count; f++) bodyTops.push(bodyBox(img, f * fw, fw));
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      const p = (y * img.width + x) * 4;
      if (img.data[p + 3] === 0) continue;
      const key = hex(img.data[p], img.data[p + 1], img.data[p + 2]);
      const rep = lookup.get(key);
      if (!rep) continue;
      const limit = topoLimit.get(key);
      if (limit !== undefined) {
        const box = bodyTops[Math.floor(x / fw)];
        if (!box || (y - box.top) / Math.max(1, box.h) > limit) continue;
      }
      img.data[p] = rep[0]; img.data[p + 1] = rep[1]; img.data[p + 2] = rep[2]; changed++;
    }
    // 3) Acessórios desenhados relativos à cabeça detectada.
    headsByFrame.forEach((head, f) => { if (head) { heads++; drawAccessories(img, head, acessorios, skinSet, lookup, hairSet); } });
    frames += count;
    fs.writeFileSync(path.join(dst, path.basename(file)), encode(img.width, img.height, img.data));
  }
  console.log(path.basename(src), '->', dst, 'pixels trocados:', changed, acessorios.length ? `cabeças ${heads}/${frames} quadros` : '');
}

// Caixa do corpo (pixels opacos) de um quadro.
function bodyBox(img, x0, fw) {
  let top = Infinity, bottom = -1, left = Infinity, right = -1;
  for (let y = 0; y < img.height; y++) for (let x = x0; x < x0 + fw; x++) {
    if (img.data[(y * img.width + x) * 4 + 3] < 128) continue;
    top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x);
  }
  return bottom < 0 ? null : { top, bottom, left, right, h: bottom - top + 1 };
}

// Cabeça = maior mancha de pele cujo topo está na parte alta do corpo. Cabelo amplia a caixa para cima.
function findHead(img, x0, fw, skinSet, hairSet, headLimit) {
  const box = bodyBox(img, x0, fw);
  if (!box) return null;
  const W = img.width, seen = new Uint8Array(W * img.height);
  const isSkin = (x, y) => { const p = (y * W + x) * 4; return img.data[p + 3] >= 128 && skinSet.has(hex(img.data[p], img.data[p + 1], img.data[p + 2])); };
  const blobs = [];
  for (let y = box.top; y <= box.bottom; y++) for (let x = x0; x < x0 + fw; x++) {
    if (seen[y * W + x] || !isSkin(x, y)) continue;
    const stack = [[x, y]], blob = { n: 0, minY: y, maxY: y, minX: x, maxX: x };
    seen[y * W + x] = 1;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      blob.n++; blob.minY = Math.min(blob.minY, cy); blob.maxY = Math.max(blob.maxY, cy); blob.minX = Math.min(blob.minX, cx); blob.maxX = Math.max(blob.maxX, cx);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < x0 || nx >= x0 + fw || ny < 0 || ny >= img.height || seen[ny * W + nx] || !isSkin(nx, ny)) continue;
        seen[ny * W + nx] = 1; stack.push([nx, ny]);
      }
    }
    if (blob.n >= 3 && (blob.minY - box.top) / box.h <= headLimit) blobs.push(blob);
  }
  if (!blobs.length) return null;
  // Rosto = mancha com cabelo logo acima; depois a mais alta; depois a maior (evita mãos e braços).
  const hairAbove = blob => {
    if (!hairSet.size) return 0;
    for (let y = blob.minY - 3; y < blob.minY; y++) for (let x = blob.minX - 1; x <= blob.maxX + 1; x++) {
      if (x < x0 || x >= x0 + fw || y < 0) continue;
      const p = (y * W + x) * 4;
      if (img.data[p + 3] >= 128 && hairSet.has(hex(img.data[p], img.data[p + 1], img.data[p + 2]))) return 1;
    }
    return 0;
  };
  blobs.forEach(b => { b.hair = hairAbove(b); });
  blobs.sort((a, b) => (b.hair - a.hair) || (a.minY - b.minY) || (b.n - a.n));
  const face = blobs[0];
  // Cabelo imediatamente acima/ao redor do rosto define o topo da cabeça.
  let hairTop = face.minY;
  for (let y = face.minY - 1; y >= Math.max(box.top, face.minY - 12); y--) {
    let found = false;
    for (let x = face.minX - 2; x <= face.maxX + 2; x++) {
      if (x < x0 || x >= x0 + fw) continue;
      const p = (y * W + x) * 4;
      if (img.data[p + 3] >= 128 && hairSet.has(hex(img.data[p], img.data[p + 1], img.data[p + 2]))) { found = true; break; }
    }
    if (found) hairTop = y; else if (y < face.minY - 1) break;
  }
  return { x0, fw, faceTop: face.minY, faceBottom: face.maxY, faceLeft: face.minX, faceRight: face.maxX, hairTop, hair: !!face.hair, body: box };
}

function drawAccessories(img, head, acessorios, skinSet, lookup, hairSetGlobal = new Set()) {
  const W = img.width;
  const inFrame = (x, y) => x >= head.x0 && x < head.x0 + head.fw && y >= 0 && y < img.height;
  const put = (x, y, rgb) => { if (!inFrame(x, y)) return; const p = (y * W + x) * 4; img.data[p] = rgb[0]; img.data[p + 1] = rgb[1]; img.data[p + 2] = rgb[2]; img.data[p + 3] = 255; };
  const alpha = (x, y) => inFrame(x, y) ? img.data[(y * W + x) * 4 + 3] : 0;
  // A pele já foi recolorida: reconhecer pela cor final.
  const skinNow = new Set([...skinSet].map(h => { const rep = lookup.get(h); return rep ? hex(...rep) : h; }));
  const isSkinNow = (x, y) => { if (!inFrame(x, y)) return false; const p = (y * W + x) * 4; return img.data[p + 3] >= 128 && skinNow.has(hex(img.data[p], img.data[p + 1], img.data[p + 2])); };
  const hairNow = new Set([...hairSetGlobal].map(h => { const rep = lookup.get(h); return rep ? hex(...rep) : h; }));
  const isHairNow = (x, y) => { if (!inFrame(x, y)) return false; const p = (y * W + x) * 4; return img.data[p + 3] >= 128 && hairNow.has(hex(img.data[p], img.data[p + 1], img.data[p + 2])); };
  const skinMain = (() => { const first = [...skinSet][0]; const rep = first && lookup.get(first); return rep || (first ? parse(first) : [200, 150, 120]); })();
  const faceH = head.faceBottom - head.faceTop + 1, faceW = head.faceRight - head.faceLeft + 1, eyeRow = head.faceTop + Math.max(1, Math.round(faceH * .3));
  for (const a of acessorios) {
    const cor = parse(a.cor || '#000000');
    if (a.exigeCabelo && !head.hair) continue; // sem cabelo acima = provavelmente uma mão, não o rosto
    switch (a.tipo) {
      case 'barbear': // remove barba: cabelo abaixo dos olhos vira pele
        for (let y = eyeRow + 1; y <= head.faceBottom + (a.ate ?? 4); y++) for (let x = head.faceLeft - 1; x <= head.faceRight + 1; x++) if (isHairNow(x, y)) put(x, y, skinMain);
        break;
      case 'olhos': // olhos coloridos (frente = direita)
        put(head.faceRight - 1, eyeRow, cor);
        if (faceW >= 5) put(head.faceRight - 3, eyeRow, cor);
        break;
      case 'dentes': { // sorriso: dois pixels claros na boca
        const row = Math.min(head.faceBottom, eyeRow + 3);
        put(head.faceRight - 1, row, cor); put(head.faceRight - 2, row, cor);
        break;
      }
      case 'oculos': { // aro escuro na linha dos olhos; lentes claras logo abaixo
        const lente = parse(a.lente || '#9fd8ff');
        for (let x = head.faceLeft - 1; x <= head.faceRight + 1; x++) if (alpha(x, eyeRow) || x >= head.faceLeft) put(x, eyeRow, cor);
        put(head.faceRight, eyeRow + 1, lente); put(head.faceRight - 1, eyeRow + 1, lente);
        if (head.faceRight - head.faceLeft >= 4) { put(head.faceLeft + 1, eyeRow + 1, lente); }
        break;
      }
      case 'visor': // faixa luminosa atravessando os olhos
        for (let x = head.faceLeft - 1; x <= head.faceRight + 1; x++) { put(x, eyeRow, cor); if (a.grosso) put(x, eyeRow + 1, cor); }
        break;
      case 'mascara': // cobre o rosto abaixo dos olhos
        for (let y = eyeRow + 1; y <= head.faceBottom; y++) for (let x = head.faceLeft; x <= head.faceRight; x++) if (isSkinNow(x, y)) put(x, y, cor);
        for (let x = head.faceLeft - 1; x <= head.faceRight; x++) if (alpha(x, eyeRow - 1)) put(x, eyeRow - 1, cor); // faixa da testa
        break;
      case 'cabelo': { // calota de cabelo acima do rosto + franja
        const altura = a.altura || 3, top = Math.min(head.faceTop, head.hairTop);
        for (let y = top - altura; y < top; y++) for (let x = head.faceLeft - 1; x <= head.faceRight; x++) put(x, y, cor);
        for (let x = head.faceLeft - 1; x <= head.faceRight - 2; x++) put(x, top, cor);
        put(head.faceLeft - 1, top + 1, cor); put(head.faceLeft - 1, top + 2, cor);
        break;
      }
      case 'rabo': { // cabelo comprido caindo pelas costas (lado esquerdo = costas)
        const comprimento = a.comprimento || 8, largura = a.largura || 2, top = Math.min(head.faceTop, head.hairTop);
        for (let y = top + 1; y <= head.faceBottom + comprimento; y++) {
          const sway = y > head.faceBottom ? Math.round((y - head.faceBottom) / 5) : 0;
          for (let i = 0; i < largura; i++) { const x = head.faceLeft - 1 - i - sway; if (!alpha(x, y)) put(x, y, cor); }
        }
        break;
      }
      case 'chapeu': { // aba larga (2 linhas) no topo da cabeça + copa com faixa clara
        const aba = a.aba || 2, top = Math.min(head.faceTop, head.hairTop), faixa = parse(a.faixa || '#6b5a48');
        for (let x = head.faceLeft - aba; x <= head.faceRight + aba; x++) { put(x, top, cor); put(x, top - 1, cor); }
        for (let y = top - 1 - (a.copa || 3); y < top - 1; y++) for (let x = head.faceLeft; x <= head.faceRight; x++) put(x, y, y === top - 2 ? faixa : cor);
        break;
      }
      default: break;
    }
  }
}

// Recorta um quadro e amplia (para inspeção visual).
function frame(file, frameWidth, out, scale = 4, index = 0) {
  const img = decode(file), fw = Number(frameWidth), fh = img.height, s = Number(scale);
  const w = fw * s, h = fh * s, data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sp = ((Math.floor(y / s)) * img.width + Number(index) * fw + Math.floor(x / s)) * 4, dp = (y * w + x) * 4;
    const a = img.data[sp + 3];
    data[dp] = a ? img.data[sp] : 40; data[dp + 1] = a ? img.data[sp + 1] : 40; data[dp + 2] = a ? img.data[sp + 2] : 48; data[dp + 3] = 255;
  }
  fs.writeFileSync(out, encode(w, h, data));
}

// Onde cada cor aparece num quadro (posição relativa ao corpo): ajuda a separar cabelo/pele/roupa.
function where(file, frameWidth, index = 0) {
  const img = decode(file), fw = Number(frameWidth), x0 = Number(index) * fw;
  let top = Infinity, bottom = -1, left = Infinity, right = -1;
  const stats = new Map();
  for (let y = 0; y < img.height; y++) for (let x = x0; x < x0 + fw; x++) {
    const p = (y * img.width + x) * 4;
    if (img.data[p + 3] < 128) continue;
    top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x);
    const key = hex(img.data[p], img.data[p + 1], img.data[p + 2]);
    const s = stats.get(key) || { n: 0, sy: 0, sx: 0, minY: Infinity, maxY: -1 };
    s.n++; s.sy += y; s.sx += x; s.minY = Math.min(s.minY, y); s.maxY = Math.max(s.maxY, y);
    stats.set(key, s);
  }
  const h = bottom - top + 1, w = right - left + 1;
  console.log(path.basename(file), 'corpo y', top, '-', bottom, 'x', left, '-', right);
  [...stats.entries()].sort((a, b) => b[1].n - a[1].n).forEach(([c, s]) => {
    const rel = v => ((v - top) / h).toFixed(2);
    console.log(c, String(s.n).padStart(4), 'y', rel(s.minY), '-', rel(s.maxY), 'media', rel(s.sy / s.n), 'x', ((s.sx / s.n - left) / w).toFixed(2));
  });
}

// Fatia uma folha irregular (gerada por IA) em quadros: bandas horizontais separadas por
// linhas vazias, depois colunas vazias dentro de cada banda. Só analisa e imprime.
function sheetSegments(img, alphaMin = 40, rowGap = 4, colGap = 2, bandsOverride = null) {
  const W = img.width, H = img.height;
  const opaque = (x, y) => img.data[(y * W + x) * 4 + 3] >= alphaMin;
  const rowHas = new Uint8Array(H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (opaque(x, y)) { rowHas[y] = 1; break; }
  const bands = [];
  if (bandsOverride) bandsOverride.forEach(([top, bottom]) => bands.push({ top, bottom }));
  else {
    let y = 0;
    while (y < H) {
      while (y < H && !rowHas[y]) y++;
      if (y >= H) break;
      const top = y;
      let gap = 0, bottom = y;
      while (y < H && gap < rowGap) { if (rowHas[y]) { gap = 0; bottom = y; } else gap++; y++; }
      bands.push({ top, bottom });
    }
  }
  return bands.map(band => {
    const colHas = new Uint8Array(W);
    for (let x = 0; x < W; x++) for (let yy = band.top; yy <= band.bottom; yy++) if (opaque(x, yy)) { colHas[x] = 1; break; }
    const frames = [];
    let x = 0;
    while (x < W) {
      while (x < W && !colHas[x]) x++;
      if (x >= W) break;
      const left = x;
      let gap = 0, right = x;
      while (x < W && gap < colGap) { if (colHas[x]) { gap = 0; right = x; } else gap++; x++; }
      // caixa exata do quadro
      let t = Infinity, b = -1;
      for (let yy = band.top; yy <= band.bottom; yy++) for (let xx = left; xx <= right; xx++) if (opaque(xx, yy)) { t = Math.min(t, yy); b = Math.max(b, yy); break; }
      frames.push({ left, right, top: t, bottom: b, w: right - left + 1, h: b - t + 1 });
    }
    return { ...band, frames };
  });
}
function slice(file, alphaMin, bandas) {
  const img = decode(file);
  // bandas opcional: "14-162,175-337,..." força as linhas
  const override = bandas ? bandas.split(',').map(s => s.split('-').map(Number)) : null;
  const bands = sheetSegments(img, Number(alphaMin) || 40, 4, 2, override);
  console.log(path.basename(file), img.width + 'x' + img.height, bands.length, 'linhas');
  bands.forEach((band, i) => {
    console.log(`linha ${i}: y ${band.top}-${band.bottom} (${band.frames.length} quadros)`);
    band.frames.forEach((f, j) => console.log(`  ${j}: x ${f.left}-${f.right} w${f.w} h${f.h} pes ${f.bottom}`));
  });
}

// Remonta strips uniformes a partir de um plano JSON:
// { "arquivo": "folha.png", "saida": "pasta/", "celula": [w,h], "pes": y, "alphaMin": 40,
//   "animacoes": { "Idle.png": { "linha": 0, "quadros": [0,1,2,3,4,5] },
//                  "Attack2.png": { "linha": 2, "quadros": [5,6,7], "dividir": { "7": 2 } } } }
// "dividir": quadro fundido cortado em N partes iguais. Cada quadro é ancorado pelo centro
// inferior da sua caixa em (celula.w/2, pes).
// Divide um blob fundido em N quadros: corta na coluna mais vazia perto de cada divisão
// nominal e descarta, em cada parte, fragmentos pequenos encostados na borda do corte
// (pé/efeito do vizinho). Devolve caixas com máscara de pixels válidos.
function splitBlob(img, band, f, parts, alphaMin, manualCuts = null) {
  const W = img.width, op = (x, y) => img.data[(y * W + x) * 4 + 3] >= alphaMin;
  // Pixels escuros = corpo/roupa; efeitos claros (rastros) não contam para achar o corte.
  const dark = (x, y) => { const p = (y * W + x) * 4; return img.data[p + 3] >= alphaMin && (img.data[p] + img.data[p + 1] + img.data[p + 2]) / 3 < 110; };
  const darkCol = new Map();
  const darkCount = x => { if (!darkCol.has(x)) { let n = 0; for (let y = band.top; y <= band.bottom; y++) if (dark(x, y)) n++; darkCol.set(x, n); } return darkCol.get(x); };
  const step = f.w / parts, cuts = [f.left];
  if (manualCuts && manualCuts.length === parts - 1) cuts.push(...manualCuts.map(Number));
  else for (let p = 1; p < parts; p++) {
    const nominal = f.left + p * step, win = Math.round(step * .45);
    let best = Math.round(nominal), bestScore = Infinity;
    for (let x = Math.round(nominal) - win; x <= Math.round(nominal) + win; x++) {
      if (x <= cuts[cuts.length - 1] + step * .5 || x >= f.right - 8) continue;
      const score = darkCount(x) * 3 + Math.abs(x - nominal) * .08;
      if (score < bestScore) { bestScore = score; best = x; }
    }
    cuts.push(best);
  }
  cuts.push(f.right + 1);
  const boxes = [];
  for (let p = 0; p < parts; p++) {
    const left = cuts[p], right = cuts[p + 1] - 1, regW = right - left + 1, regH = band.bottom - band.top + 1;
    const seen = new Uint8Array(regW * regH), keep = new Uint8Array(regW * regH);
    const idx = (x, y) => (y - band.top) * regW + (x - left);
    let total = 0;
    for (let y = band.top; y <= band.bottom; y++) for (let x = left; x <= right; x++) if (op(x, y)) total++;
    const comps = [];
    for (let y = band.top; y <= band.bottom; y++) for (let x = left; x <= right; x++) {
      if (seen[idx(x, y)] || !op(x, y)) continue;
      const stack = [[x, y]], pixels = [];
      let minX = x, maxX = x, minY = y, maxY = y;
      seen[idx(x, y)] = 1;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        pixels.push(idx(cx, cy));
        minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if ((dx || dy) && nx >= left && nx <= right && ny >= band.top && ny <= band.bottom && !seen[idx(nx, ny)] && op(nx, ny)) { seen[idx(nx, ny)] = 1; stack.push([nx, ny]); }
        }
      }
      let darkN = 0;
      for (const i of pixels) { const x = left + (i % regW), y = band.top + Math.floor(i / regW); if (dark(x, y)) darkN++; }
      comps.push({ pixels, minX, maxX, minY, maxY, darkN });
    }
    // Corpo = componente com mais pixels escuros. O resto só fica se for grande, ou se
    // estiver sobre o corpo (efeito ligado) e não encostar na borda do corte.
    const body = comps.reduce((a, c) => (!a || c.darkN > a.darkN ? c : a), null);
    let t = Infinity, b = -1, l = Infinity, r = -1;
    for (const c of comps) {
      if (c !== body) {
        const touchesCut = (p > 0 && c.minX <= left + 1) || (p < parts - 1 && c.maxX >= right - 1);
        const overBody = body && c.maxX >= body.minX - 4 && c.minX <= body.maxX + 4;
        const small = c.darkN < (body ? body.darkN : total) * .12;
        if (touchesCut && small) continue; // pé/mão/efeito do vizinho
        if (small && !overBody) continue; // fragmento solto fora do corpo
      }
      c.pixels.forEach(i => { keep[i] = 1; });
      t = Math.min(t, c.minY); b = Math.max(b, c.maxY); l = Math.min(l, c.minX); r = Math.max(r, c.maxX);
    }
    if (b < 0) { t = band.top; b = band.bottom; l = left; r = right; }
    boxes.push({ left: l, right: r, top: t, bottom: b, w: r - l + 1, h: b - t + 1, keep: (x, y) => keep[idx(x, y)] === 1 });
  }
  return boxes;
}

function assemble(planFile) {
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  const dir = path.dirname(planFile);
  const img = decode(path.resolve(dir, plan.arquivo));
  // plan.bandas = [[yTopo, yBase], ...] força as linhas quando a detecção automática as funde.
  const bands = sheetSegments(img, plan.alphaMin || 40, 4, 2, plan.bandas || null);
  const [cw, ch] = plan.celula, pes = plan.pes ?? ch - 10;
  fs.mkdirSync(path.resolve(dir, plan.saida), { recursive: true });
  for (const [name, spec] of Object.entries(plan.animacoes)) {
    const band = bands[spec.linha];
    if (!band) throw new Error(`linha ${spec.linha} não existe para ${name}`);
    const boxes = [];
    for (const q of spec.quadros) {
      const f = band.frames[q];
      if (!f) throw new Error(`quadro ${q} não existe na linha ${spec.linha} (${name})`);
      const parts = spec.dividir?.[String(q)] || 1;
      if (parts === 1) { boxes.push(f); continue; }
      boxes.push(...splitBlob(img, band, f, parts, plan.alphaMin || 40, spec.cortes?.[String(q)]));
    }
    // "descartar": índices (após a divisão) a remover, ex. quadros que se sobrepõem ao vizinho.
    const kept = boxes.filter((_, i) => !(spec.descartar || []).includes(i));
    boxes.length = 0; boxes.push(...kept);
    const out = Buffer.alloc(cw * ch * boxes.length * 4);
    const outW = cw * boxes.length;
    boxes.forEach((f, i) => {
      // âncora: centro-x da caixa em cw/2; base (pés) em pes. "ancoraPes" força outra base por quadro.
      const baseline = spec.base?.[String(i)] ?? pes;
      const dx = i * cw + Math.round(cw / 2 - f.w / 2) - f.left, dy = baseline - f.bottom;
      for (let y = f.top; y <= f.bottom; y++) for (let x = f.left; x <= f.right; x++) {
        const tx = x + dx, ty = y + dy;
        if (tx < i * cw || tx >= (i + 1) * cw || ty < 0 || ty >= ch) continue;
        if (f.keep && !f.keep(x, y)) continue; // pixel pertence a um vizinho cortado
        const sp = (y * img.width + x) * 4, dp = (ty * outW + tx) * 4;
        if (img.data[sp + 3] < (plan.alphaMin || 40)) continue;
        out[dp] = img.data[sp]; out[dp + 1] = img.data[sp + 1]; out[dp + 2] = img.data[sp + 2]; out[dp + 3] = 255;
      }
    });
    fs.writeFileSync(path.resolve(dir, plan.saida, name), encode(outW, ch, out));
    console.log(name, boxes.length, 'quadros', `${cw}x${ch}`, 'larguras', boxes.map(b => b.w).join(','));
  }
}

// Perfil de densidade escura por coluna de um blob (para escolher cortes manuais).
function profile(file, linha, quadro, alphaMin = 40) {
  const img = decode(file), bands = sheetSegments(img, Number(alphaMin)), band = bands[Number(linha)], f = band.frames[Number(quadro)];
  const W = img.width;
  const out = [];
  for (let x = f.left; x <= f.right; x++) {
    let n = 0;
    for (let y = band.top; y <= band.bottom; y++) { const p = (y * W + x) * 4; if (img.data[p + 3] >= alphaMin && (img.data[p] + img.data[p + 1] + img.data[p + 2]) / 3 < 110) n++; }
    out.push(n);
  }
  console.log(`blob x ${f.left}-${f.right}; densidade escura por coluna (x:n), só colunas com n<=6:`);
  const low = [];
  out.forEach((n, i) => { if (n <= 6) low.push(`${f.left + i}:${n}`); });
  console.log(low.join(' '));
  const [a, b] = (process.argv[7] || '').split('-').map(Number);
  if (a && b) { const seg = []; for (let x = a; x <= b; x++) seg.push(`${x}:${out[x - f.left]}`); console.log('faixa', a, '-', b, ':', seg.join(' ')); }
}

// Exporta um projeto do editor.html a partir de um plano (mesmos cortes do assemble).
function project(planFile, outFile) {
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  const dir = path.dirname(planFile), img = decode(path.resolve(dir, plan.arquivo));
  const bands = sheetSegments(img, plan.alphaMin || 40, 4, 2, plan.bandas || null);
  const byFile = { 'Idle.png': 'idle', 'Run.png': 'walk', 'Jump.png': 'jump', 'Fall.png': 'fall', 'Attack1.png': 'punch', 'Attack2.png': 'kick', 'Block.png': 'block', 'TakeHit.png': 'hit', 'Death.png': 'ko' };
  const frames = Object.fromEntries(Object.values(byFile).map(k => [k, []]));
  for (const [name, spec] of Object.entries(plan.animacoes)) {
    const band = bands[spec.linha], boxes = [];
    for (const q of spec.quadros) {
      const f = band.frames[q], parts = spec.dividir?.[String(q)] || 1;
      if (parts === 1) boxes.push(f); else boxes.push(...splitBlob(img, band, f, parts, plan.alphaMin || 40, spec.cortes?.[String(q)]));
    }
    const kept = boxes.filter((_, i) => !(spec.descartar || []).includes(i));
    frames[byFile[name] || name] = kept.map(b => ({ x: b.left, y: b.top, w: b.w, h: b.h, px: null, py: null, excl: [] }));
  }
  const [w, h] = plan.celula;
  fs.writeFileSync(outFile, JSON.stringify({ imagem: plan.arquivo, id: path.basename(dir), celula: { w, h, pes: plan.pes ?? h - 8 }, alturaJogo: 130, frames }, null, 1));
  console.log('projeto salvo em', outFile, Object.entries(frames).map(([k, v]) => `${k}:${v.length}`).join(' '));
}

// Remove fundo opaco (xadrez/branco desenhado pela IA): flood fill a partir das bordas por
// pixels claros e quase neutros. O que está cercado por contorno (lâminas cinza) sobrevive.
function unbg(inFile, outFile, bright = 190, sat = 22, seeds = '') {
  const img = decode(inFile), W = img.width, H = img.height, d = img.data;
  const bgTest = (br, st) => i => { const r = d[i], g = d[i + 1], b = d[i + 2]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return (r + g + b) / 3 >= br && mx - mn <= st; };
  const seen = new Uint8Array(W * H);
  const flood = (starts, isBg) => {
    const stack = [];
    const push = (x, y) => { const k = y * W + x; if (!seen[k] && isBg(k * 4)) { seen[k] = 1; stack.push(k); } };
    starts.forEach(([x, y]) => push(x, y));
    while (stack.length) {
      const k = stack.pop(), x = k % W, y = (k - x) / W;
      if (x > 0) push(x - 1, y);
      if (x < W - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < H - 1) push(x, y + 1);
    }
  };
  const border = [];
  for (let x = 0; x < W; x++) { border.push([x, 0], [x, H - 1]); }
  for (let y = 0; y < H; y++) { border.push([0, y], [W - 1, y]); }
  flood(border, bgTest(bright, sat));
  // Sementes "x,y;x,y": bolsões de fundo cercados por efeitos (limiar mais tolerante).
  if (seeds) flood(seeds.split(';').map(s => s.split(',').map(Number)), bgTest(bright - 25, sat + 10));
  // borda suave: vizinhos do fundo que ainda são claros/neutros (anti-alias) também saem.
  const edge = [];
  for (let k = 0; k < W * H; k++) {
    if (seen[k]) continue;
    const x = k % W, y = (k - x) / W, i = k * 4, r = d[i], g = d[i + 1], b = d[i + 2];
    const nb = (x > 0 && seen[k - 1]) || (x < W - 1 && seen[k + 1]) || (y > 0 && seen[k - W]) || (y < H - 1 && seen[k + W]);
    if (nb && (r + g + b) / 3 >= bright - 30 && Math.max(r, g, b) - Math.min(r, g, b) <= sat + 8) edge.push(k);
  }
  edge.forEach(k => { seen[k] = 1; });
  let removed = 0;
  for (let k = 0; k < W * H; k++) if (seen[k]) { d[k * 4 + 3] = 0; removed++; }
  fs.writeFileSync(outFile, encode(W, H, d));
  console.log('fundo removido:', removed, 'px de', W * H, `(${(removed / (W * H) * 100).toFixed(1)}%)`);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'unbg') unbg(args[0], args[1], Number(args[2]) || 190, Number(args[3]) || 22, args[4] || '');
else if (cmd === 'project') project(args[0], args[1]);
else if (cmd === 'profile') profile(args[0], args[1], args[2], args[3]);
else if (cmd === 'slice') slice(args[0], args[1], args[2]);
else if (cmd === 'assemble') assemble(args[0]);
else if (cmd === 'where') where(args[0], args[1], args[2]);
else if (cmd === 'palette') palette(args[0], args[1]);
else if (cmd === 'recolor') recolor(args[0], args[1], args[2]);
else if (cmd === 'frame') frame(args[0], args[1], args[2], args[3], args[4]);
else if (cmd === 'recolor-all') {
  // recolor-all tools/recolors.json [id]: gera todos os personagens (ou só um).
  const all = JSON.parse(fs.readFileSync(args[0], 'utf8'));
  for (const [id, spec] of Object.entries(all)) if (!args[1] || args[1] === id) recolor(spec.origem, spec.destino, spec);
}
else console.log('uso: palette <pasta> [saida.png] | recolor <origem> <destino> <mapa.json> | frame <png> <larguraQuadro> <saida.png> [escala] [indice]');
