// SCENES + UI — telas, entrada, HUD, sprites, partículas, renderização e áudio.
// Depende de Combat (simulação) e Art (arte procedural de reserva).
const App = (() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, GROUND = 438, STEP = 1 / 120;
  const roster = Array.isArray(CHARACTERS) && CHARACTERS.length ? CHARACTERS : [{ id: 'lutador', nome: 'Lutador', frase: 'Sem palavras.', titulo: 'Reserva', stats: {}, palette: {} }];
  const pad = n => String(n).padStart(2, '0');
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const setText = (id, text) => { const el = $(id); if (el && el.textContent !== text) el.textContent = text; };
  const on = (id, type, handler) => { const el = $(id); if (el) el.addEventListener(type, handler); };
  const screens = { home: $('home-screen'), controls: $('controls-screen'), select: $('select-screen'), stage: $('stage-screen'), vs: $('vs-screen'), fight: $('fight-screen'), result: $('result-screen') };
  const pauseLayer = $('pause-screen'), touchControls = $('touch-controls'), flashLayer = $('flash-layer');
  const announce = text => { const el = $('announcer'); el.textContent = ''; requestAnimationFrame(() => { el.textContent = text; }); };
  const STAT_KEYS = [['vida', 'VIDA', 1000], ['velocidade', 'VELOCIDADE', 245], ['pulo', 'PULO', 685], ['forca', 'FORÇA', 1]];
  const statValue = (conf, key, fallback) => { const v = Number(conf.stats?.[key]); return Number.isFinite(v) && v > 0 ? v : fallback; };
  const weaponName = conf => conf.arma?.nome || 'MÃOS LIVRES';

  // ---------------------------------------------------------------- ASSETS
  // Retratos e folhas são opcionais. Falha ou URL vazia => arte procedural.
  // Formatos aceitos: um PNG por animação (pasta + arquivo) ou uma folha única
  // (url + row). Tudo carregado com <img>; funciona direto do disco.
  let portraitsDirty = false;
  const assets = new Map();
  const loadImage = url => new Promise(resolve => {
    if (!url || typeof url !== 'string') return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
  const enemyList = typeof ENEMIES === 'undefined' ? [] : ENEMIES;
  [...roster, ...enemyList].forEach(conf => {
    const entry = { portrait: null, sheet: null, files: new Map() };
    assets.set(conf.id, entry);
    loadImage(conf.retrato).then(img => { entry.portrait = img; portraitsDirty = true; });
    const sprite = conf.spritesheet || {};
    loadImage(sprite.url).then(img => { entry.sheet = img; portraitsDirty = true; });
    const pasta = typeof sprite.pasta === 'string' ? sprite.pasta : '';
    const files = new Set(Object.values(sprite.animations || {}).map(anim => anim && anim.arquivo).filter(Boolean));
    files.forEach(file => loadImage(pasta + file).then(img => { entry.files.set(file, img); portraitsDirty = true; }));
  });

  // Resolve qual imagem/quadro representa o estado atual do lutador.
  function spriteFrame(f) {
    const conf = f.config, sprite = conf.spritesheet;
    if (!sprite) return null;
    const entry = assets.get(conf.id), anims = sprite.animations || {};
    if (!entry) return null;
    let key = f.state;
    if (key === 'jump' && f.vy > 0 && anims.fall) key = 'fall';
    if (key === 'special' && !anims.special) key = 'kick'; // especial reaproveita o golpe forte
    if (!(key in anims)) key = 'idle';
    const anim = anims[key];
    if (!anim) return null;
    const img = anim.arquivo ? entry.files.get(anim.arquivo) : entry.sheet;
    if (!img) return null;
    const frames = Math.max(1, anim.frames | 0);
    let frame;
    if ((key === 'punch' || key === 'kick' || key === 'special') && f.attack) {
      // Golpes seguem o tempo real do movimento: o impacto cai nos quadros certos.
      const move = f.attack.move, total = move.startup + move.active + move.recovery;
      frame = Math.min(frames - 1, Math.floor(f.attack.elapsed / total * frames));
    } else {
      const fps = anim.fps > 0 ? anim.fps : 8, raw = Math.floor((f.stateTime || 0) * fps);
      frame = anim.loop === false ? Math.min(raw, frames - 1) : raw % frames;
    }
    const fh = sprite.frameHeight > 0 ? sprite.frameHeight : img.naturalHeight;
    const fw = sprite.frameWidth > 0 ? sprite.frameWidth : fh;
    return {
      img, sx: frame * fw, sy: (anim.row | 0) * fh, fw, fh,
      scale: sprite.scale > 0 ? sprite.scale : 1,
      pes: Number.isFinite(sprite.pes) ? sprite.pes : fh,
      centro: Number.isFinite(sprite.centro) ? sprite.centro : fw / 2,
      altura: sprite.altura > 0 ? sprite.altura : fh * .45
    };
  }

  // Silhueta branca para o flash de impacto (composição em canvas auxiliar).
  const flashCanvas = document.createElement('canvas'), flashCtx = flashCanvas.getContext('2d');
  function whiteFrame(fr) {
    if (flashCanvas.width !== fr.fw || flashCanvas.height !== fr.fh) { flashCanvas.width = fr.fw; flashCanvas.height = fr.fh; }
    flashCtx.globalCompositeOperation = 'source-over';
    flashCtx.clearRect(0, 0, fr.fw, fr.fh);
    flashCtx.drawImage(fr.img, fr.sx, fr.sy, fr.fw, fr.fh, 0, 0, fr.fw, fr.fh);
    flashCtx.globalCompositeOperation = 'source-atop';
    flashCtx.fillStyle = '#ffffff';
    flashCtx.fillRect(0, 0, fr.fw, fr.fh);
    return flashCanvas;
  }

  // Sombra fica no chão: quando o lutador pula, ela encolhe e clareia em vez de acompanhar.
  function drawShadow(c, f, extraScale) {
    if (f.noShadow) return;
    const groundY = f.y < GROUND ? GROUND : f.y, height = Math.max(0, groundY - f.y);
    const k = Math.max(.4, 1 - height / 600);
    c.save();
    c.translate(f.x, groundY); c.scale(1, .24);
    c.fillStyle = `rgba(3,9,16,${(.42 * k).toFixed(3)})`;
    c.beginPath(); c.ellipse(0, 9, 46 * extraScale * k, 19 * k, 0, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  function drawFighter(c, f, time, extraScale = 1) {
    const fr = spriteFrame(f);
    const alpha = f.alpha ?? 1;
    drawShadow(c, f, extraScale);
    if (!fr) { Art.fighter(c, f, time, { scale: extraScale, alpha: f.flash > 0 ? alpha * .6 : alpha, noShadow: true }); return; }
    const s = fr.scale * extraScale;
    c.save();
    c.imageSmoothingEnabled = false;
    // filtros: matiz (inimigos do modo Rua) e brilho (silhueta no breu -> revelado pelo holofote)
    const filters = [];
    if (f.hue) filters.push(`hue-rotate(${f.hue}deg)`);
    if (f.brightness !== undefined && f.brightness < 1) filters.push(`brightness(${Math.max(0, f.brightness).toFixed(3)})`);
    if (filters.length) c.filter = filters.join(' ');
    c.globalAlpha = alpha;
    c.translate(f.x, f.y);
    c.scale(f.facing < 0 ? -1 : 1, 1);
    if (f.crouching) c.scale(1, .82);
    if (f.state === 'ko' && f.stateTime > 0) c.translate(0, Math.min(6, f.stateTime * 12));
    const dx = -fr.centro * s, dy = -fr.pes * s, dw = fr.fw * s, dh = fr.fh * s;
    c.drawImage(fr.img, fr.sx, fr.sy, fr.fw, fr.fh, dx, dy, dw, dh);
    if (f.flash > 0) {
      c.globalAlpha = alpha * Math.min(1, f.flash * 9);
      c.drawImage(whiteFrame(fr), 0, 0, fr.fw, fr.fh, dx, dy, dw, dh);
    }
    c.restore();
  }

  // Lutador "fantasma" para menus: só pose, sem simulação.
  const ghost = (conf, x, facing, state = 'idle', extra = {}) => ({ config: conf, x, y: GROUND, facing, state, stateTime: 0, grounded: true, crouching: false, flash: 0, vy: 0, ...extra });

  function drawPortrait(target, conf, mirror = false) {
    const c = target.getContext('2d'), w = target.width, h = target.height;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, w, h);
    if (mirror) { c.translate(w, 0); c.scale(-1, 1); }
    const entry = assets.get(conf.id), primary = conf.palette?.primary || '#d7ff3f';
    if (entry?.portrait) {
      const img = entry.portrait;
      c.save();
      c.imageSmoothingEnabled = false;
      const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
      c.fillStyle = '#1a2832'; c.fillRect(0, 0, w, h);
      c.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      c.restore();
      return;
    }
    const fr = spriteFrame(ghost(conf, 0, 1));
    if (!fr) { Art.portrait(c, conf, w, h, 0); return; }
    c.save();
    c.imageSmoothingEnabled = false;
    const bg = c.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#16222c'); bg.addColorStop(1, shadeHex(primary, -110));
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,.07)';
    c.beginPath(); c.moveTo(w * .55, 0); c.lineTo(w, 0); c.lineTo(w, h); c.lineTo(w * .2, h); c.closePath(); c.fill();
    for (let y = 0; y < h; y += 6) c.fillRect(0, y, w, 1);
    const sc = h / fr.altura * 1.25;
    const dx = w * .5 - fr.centro * sc, dy = h * .58 - (fr.pes - fr.altura / 2) * sc;
    c.drawImage(fr.img, fr.sx, fr.sy, fr.fw, fr.fh, dx, dy, fr.fw * sc, fr.fh * sc);
    c.fillStyle = primary; c.fillRect(0, h - 3, w, 3);
    c.restore();
  }
  function shadeHex(hex, amount) {
    if (!/^#[\da-f]{6}$/i.test(hex || '')) return '#223';
    const n = parseInt(hex.slice(1), 16);
    return '#' + [n >> 16, n >> 8 & 255, n & 255].map(v => Math.max(0, Math.min(255, v + amount)).toString(16).padStart(2, '0')).join('');
  }

  // ----------------------------------------------------------------- AUDIO
  // Amostras reais (assets/sfx: Kenney CC0, OpenGameArt CC0/CC-BY) tocadas via
  // <audio> — funciona direto do disco. Síntese WebAudio só como reserva.
  const Sound = (() => {
    let audio = null, enabled = true;
    try { enabled = localStorage.getItem('manifight-sound') !== 'off'; } catch (e) { /* armazenamento indisponível */ }
    const files = (prefix, count, ext = '.ogg') => Array.from({ length: count }, (_, i) => `${prefix}${i}${ext}`);
    const SAMPLES = {
      hit: files('impact/impactPunch_medium_00', 5), heavy: files('impact/impactPunch_heavy_00', 5),
      block: files('impact/impactMetal_light_00', 3), step: files('impact/footstep_concrete_00', 5),
      land: files('impact/impactSoft_medium_00', 3), swing: files('impact/impactGeneric_light_00', 3),
      move: ['ui/select_001.ogg', 'ui/select_002.ogg', 'ui/select_003.ogg'], confirm: ['ui/confirmation_001.ogg'],
      back: ['ui/back_001.ogg'], pause: ['ui/bong_001.ogg'], tick: ['ui/tick_001.ogg'],
      gong: ['impact/impactBell_heavy_000.ogg', 'impact/impactBell_heavy_001.ogg'],
      jingle: ['jingle/jingles_NES00.ogg'],
      // Armas (assets/sfx/weapon): swing = corte de ar, hit = impacto, block = defesa.
      'espada:swing': Array.from({ length: 10 }, (_, i) => `weapon/sword_${i + 1}.ogg`),
      'espada:hit': ['weapon/blade_01.ogg', 'weapon/blade_02.ogg', 'weapon/blade_03.ogg', 'weapon/swordhit.wav'],
      'espada:block': ['weapon/metal_01.ogg', 'weapon/metal_02.ogg', 'weapon/metal_03.ogg'],
      'faca:swing': ['weapon/knifeSlice.ogg', 'weapon/knifeSlice2.ogg', 'weapon/drawKnife1.ogg'],
      'faca:hit': ['weapon/blade_01.ogg', 'weapon/melee.wav'],
      'faca:block': ['weapon/metalClick.ogg', 'weapon/metal_01.ogg'],
      'graveto:swing': ['weapon/cloth1.ogg', 'weapon/cloth2.ogg'],
      'graveto:hit': ['weapon/item_wood_01.ogg', 'weapon/item_wood_02.ogg', 'weapon/item_wood_03.ogg', 'impact/impactWood_medium_000.ogg', 'impact/impactWood_medium_001.ogg'],
      'graveto:block': ['impact/impactPlank_medium_000.ogg', 'impact/impactPlank_medium_001.ogg'],
      'taco:swing': ['weapon/cloth1.ogg', 'weapon/cloth2.ogg'],
      'taco:hit': [...files('impact/impactWood_heavy_00', 5), 'weapon/chop.ogg'],
      'taco:block': ['impact/impactPlank_medium_000.ogg', 'impact/impactPlank_medium_002.ogg'],
      'fogo:swing': ['weapon/fireball.wav', 'weapon/cloth2.ogg'],
      'fogo:hit': ['weapon/fireball.wav', 'impact/impactSoft_heavy_000.ogg', 'impact/impactSoft_heavy_001.ogg'],
      'fogo:block': ['impact/impactMetal_light_000.ogg', 'impact/impactMetal_light_001.ogg'],
      'cobra:hit': ['weapon/animal.wav', 'weapon/melee.wav', 'impact/impactSoft_medium_001.ogg'],
      'cobra:block': ['weapon/cloth1.ogg', 'weapon/cloth2.ogg'],
      'inseto:swing': ['weapon/bee.ogg', 'weapon/cloth1.ogg'],
      'inseto:hit': ['weapon/melee.wav', 'impact/impactGeneric_light_000.ogg', 'impact/impactGeneric_light_002.ogg'],
      'inseto:block': ['impact/impactGeneric_light_001.ogg', 'impact/impactPlank_medium_001.ogg']
    };
    // Locutor extra (game-voice, CC0): frases de luta clássicas.
    ['knockout', 'finish_it', 'victory', 'get_ready', 'game_over', 'this_could_be_the_end', 'thats_gotta_hurt', 'hell_feel_that', 'shell_feel_that', 'nothing_can_stop_him', 'nothing_can_stop_her']
      .forEach(name => { SAMPLES['ann2:' + name] = [`announcer2/${name}.wav`]; });
    ['round_1', 'round_2', 'round_3', 'final_round', 'fight', 'ready', 'you_win', 'you_lose', 'flawless_victory', 'time', 'tie', 'combo', 'choose_your_character', 'game_over', 'winner', 'prepare_yourself']
      .forEach(name => { SAMPLES['ann:' + name] = [`announcer/${name}.ogg`]; });
    for (let t = 1; t <= 3; t++) {
      SAMPLES[`voice${t}:attack`] = [1, 2, 3].map(n => `voice/type${t}/attack${n}.wav`);
      SAMPLES[`voice${t}:hurt`] = [1, 2, 3].map(n => `voice/type${t}/damaged${n}.wav`);
      SAMPLES[`voice${t}:jump`] = [1, 2, 3].map(n => `voice/type${t}/jump${n}.wav`);
    }
    const cache = new Map();
    const base = file => {
      if (!cache.has(file)) {
        try {
          const a = new Audio('assets/sfx/' + file);
          a.preload = 'auto';
          a.addEventListener('error', () => cache.set(file, null));
          cache.set(file, a);
        } catch (e) { cache.set(file, null); }
      }
      return cache.get(file);
    };
    Object.values(SAMPLES).flat().forEach(base);
    // Ganho global dos efeitos (a trilha fica em ~0.3). Cada disparo varia o pitch em ±6%
    // e nunca repete a mesma amostra duas vezes seguidas — evita o "tec-tec" repetitivo.
    const SFX_GAIN = .55;
    const lastPick = new Map();
    const sample = (name, { volume = .8, rate = 1, vary = .12 } = {}) => {
      if (!enabled) return true;
      const list = SAMPLES[name];
      if (!list) return false;
      let idx = Math.floor(Math.random() * list.length);
      if (list.length > 1 && idx === lastPick.get(name)) idx = (idx + 1) % list.length;
      lastPick.set(name, idx);
      const src = base(list[idx]);
      if (!src) return false;
      try {
        const a = src.cloneNode();
        a.volume = Math.max(0, Math.min(1, volume * SFX_GAIN * sfxMaster));
        const r = rate * (1 + (Math.random() - .5) * vary);
        if (Math.abs(r - 1) > .005) { a.preservesPitch = false; a.mozPreservesPitch = false; a.playbackRate = r; }
        a.play().catch(() => {});
        return true;
      } catch (e) { return false; }
    };
    // Volume mestre dos efeitos (0..1), salvo no navegador. Sintetizados passam por um GainNode.
    let sfxMaster = 1, masterNode = null;
    try { const v = Number(localStorage.getItem('manifight-vol-sfx')); if (Number.isFinite(v) && v >= 0 && localStorage.getItem('manifight-vol-sfx') !== null) sfxMaster = Math.min(1, v); } catch (e) { /* sem armazenamento */ }
    const ensure = () => {
      if (!enabled) return null;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        if (!audio) { audio = new Ctx(); masterNode = audio.createGain(); masterNode.gain.value = sfxMaster; masterNode.connect(audio.destination); }
        if (audio.state === 'suspended') audio.resume();
        return audio;
      } catch (e) { return null; }
    };
    const out = a => masterNode || a.destination;
    const tone = (a, { type = 'square', from = 440, to = from, time = .1, gain = .1, delay = 0 }) => {
      const osc = a.createOscillator(), amp = a.createGain(), t = a.currentTime + delay;
      osc.type = type;
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + time);
      amp.gain.setValueAtTime(gain, t);
      amp.gain.exponentialRampToValueAtTime(.0001, t + time);
      osc.connect(amp).connect(out(a));
      osc.start(t); osc.stop(t + time + .02);
    };
    const noise = (a, { time = .08, gain = .1, delay = 0, filter = 1200 }) => {
      const length = Math.ceil(a.sampleRate * time), buffer = a.createBuffer(1, length, a.sampleRate), data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const src = a.createBufferSource(), amp = a.createGain(), flt = a.createBiquadFilter();
      src.buffer = buffer; flt.type = 'lowpass'; flt.frequency.value = filter; amp.gain.value = gain;
      src.connect(flt).connect(amp).connect(out(a));
      src.start(a.currentTime + delay);
    };
    // Reserva sintetizada quando a amostra não existe (arquivo removido, por exemplo).
    const synth = event => {
      const a = ensure();
      if (!a) return;
      switch (event) {
        case 'punch': noise(a, { time: .07, gain: .07, filter: 3200 }); tone(a, { type: 'sine', from: 900, to: 300, time: .08, gain: .04 }); break;
        case 'kick': noise(a, { time: .11, gain: .09, filter: 1600 }); tone(a, { type: 'sine', from: 500, to: 90, time: .14, gain: .07 }); break;
        case 'hit': noise(a, { time: .12, gain: .16, filter: 1400 }); tone(a, { type: 'square', from: 220, to: 70, time: .16, gain: .09 }); break;
        case 'block': tone(a, { type: 'triangle', from: 1200, to: 600, time: .07, gain: .07 }); noise(a, { time: .05, gain: .05, filter: 5000 }); break;
        case 'jump': tone(a, { type: 'sine', from: 300, to: 620, time: .14, gain: .05 }); break;
        case 'ko': tone(a, { type: 'sawtooth', from: 300, to: 40, time: .7, gain: .12 }); noise(a, { time: .3, gain: .11, filter: 600 }); break;
        case 'move': tone(a, { from: 700, time: .04, gain: .035 }); break;
        case 'confirm': tone(a, { from: 520, to: 780, time: .1, gain: .05 }); break;
        case 'back': tone(a, { from: 520, to: 300, time: .1, gain: .045 }); break;
        default: break;
      }
    };
    const play = event => {
      if (!enabled) return;
      switch (event) {
        case 'punch': synth('punch'); break; // corte de ar curto
        case 'kick': if (!sample('swing', { volume: .35, rate: 1.3 })) synth('kick'); break;
        case 'hit': if (!sample('hit', { volume: .6 })) synth('hit'); break;
        case 'heavy': if (!sample('heavy', { volume: .75 })) synth('hit'); break;
        case 'block': if (!sample('block', { volume: .5, rate: 1.1 })) synth('block'); break;
        case 'jump': synth('jump'); break;
        case 'step': sample('step', { volume: .22, rate: .9 + Math.random() * .2 }); break;
        case 'land': sample('land', { volume: .5, rate: .9 }); break;
        case 'ko': koBoom(); break;
        case 'move': if (!sample('move', { volume: .5 })) synth('move'); break;
        case 'confirm': if (!sample('confirm', { volume: .6 })) synth('confirm'); break;
        case 'back': if (!sample('back', { volume: .5 })) synth('back'); break;
        case 'pause': sample('pause', { volume: .6 }); break;
        case 'tick': sample('tick', { volume: .6 }); break;
        case 'jingle': sample('jingle', { volume: .8 }); break;
        case 'dash': sample('swing', { volume: .45, rate: 1.4 }); synth('jump'); break;
        case 'enemydown': sample('heavy', { volume: .55, rate: .75 }); { const a = ensure(); if (a) tone(a, { type: 'square', from: 260, to: 60, time: .3, gain: .06 }); } break;
        case 'pastel': sample('confirm', { volume: .7 }); { const a = ensure(); if (a) [660, 880, 1320].forEach((f, i) => tone(a, { type: 'square', from: f, time: .09, gain: .05, delay: i * .07 })); } break;
        case 'buff': sample('gong', { volume: .4, rate: 1.4 }); { const a = ensure(); if (a) { tone(a, { type: 'sawtooth', from: 200, to: 900, time: .35, gain: .06 }); tone(a, { type: 'square', from: 1200, time: .12, gain: .04, delay: .3 }); } } break;
        case 'go': { const a = ensure(); if (a) { tone(a, { type: 'square', from: 520, to: 1040, time: .18, gain: .06 }); tone(a, { type: 'square', from: 780, time: .14, gain: .05, delay: .16 }); } break; }
        case 'wave': sample('gong', { volume: .45, rate: 1.1 }); break;
        case 'doublejump': { const a = ensure(); if (a) { tone(a, { type: 'sine', from: 420, to: 900, time: .16, gain: .05 }); } break; }
        case 'special': sample('gong', { volume: .8, rate: .9 }); sample('heavy', { volume: .7, rate: .7 }); { const a = ensure(); if (a) tone(a, { type: 'sawtooth', from: 90, to: 400, time: .5, gain: .08 }); } break;
        case 'parry': sample('espada:block', { volume: .8, rate: 1.25 }); { const a = ensure(); if (a) tone(a, { type: 'triangle', from: 1400, to: 2200, time: .18, gain: .07 }); } break;
        case 'critical': { const a = ensure(); if (a) { tone(a, { type: 'square', from: 300, to: 80, time: .22, gain: .08 }); noise(a, { time: .15, gain: .1, filter: 900 }); } break; }
        default: break;
      }
    };
    // K.O. cinematográfico: soco pesado + gongo no talo (ignora o ganho reduzido), bass drop
    // com dois osciladores, crash de ruído com cauda longa e um "sub" final.
    const koBoom = () => {
      sample('heavy', { volume: 1.9, rate: .55, vary: 0 });
      sample('gong', { volume: 1.6, rate: .5, vary: 0 });
      const a = ensure(); if (!a) return;
      const t0 = a.currentTime;
      // bass drop
      [['sine', 150, 28, .9, .5], ['triangle', 300, 40, .7, .25]].forEach(([type, from, to, time, gain]) => {
        const osc = a.createOscillator(), amp = a.createGain();
        osc.type = type; osc.frequency.setValueAtTime(from, t0); osc.frequency.exponentialRampToValueAtTime(to, t0 + time);
        amp.gain.setValueAtTime(gain, t0); amp.gain.exponentialRampToValueAtTime(.0001, t0 + time + .3);
        osc.connect(amp).connect(out(a)); osc.start(t0); osc.stop(t0 + time + .35);
      });
      // crash de ruído com cauda
      const len = Math.ceil(a.sampleRate * 1.2), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) { const k = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, 2.2); }
      const src = a.createBufferSource(), flt = a.createBiquadFilter(), amp = a.createGain();
      src.buffer = buf; flt.type = 'lowpass'; flt.frequency.setValueAtTime(3200, t0); flt.frequency.exponentialRampToValueAtTime(300, t0 + 1.1);
      amp.gain.value = .5; src.connect(flt).connect(amp).connect(out(a)); src.start(t0);
      // segundo impacto surdo (eco) meio segundo depois
      const echo = a.createOscillator(), eamp = a.createGain();
      echo.type = 'sine'; echo.frequency.setValueAtTime(70, t0 + .45); echo.frequency.exponentialRampToValueAtTime(30, t0 + 1.1);
      eamp.gain.setValueAtTime(.0001, t0); eamp.gain.setValueAtTime(.35, t0 + .45); eamp.gain.exponentialRampToValueAtTime(.0001, t0 + 1.2);
      echo.connect(eamp).connect(out(a)); echo.start(t0 + .45); echo.stop(t0 + 1.25);
    };
    // Locutor (Kenney, "Voiceover Pack: Fighter") e locutor extra (game-voice).
    const announce = name => { sample('ann:' + name, { volume: .95 }); };
    const announce2 = name => { sample('ann2:' + name, { volume: .9 }); };
    // Som da arma: 'swing' ao iniciar o golpe, 'hit' no impacto, 'block' na defesa.
    // Cobra sem amostra de silvo: sintetizado (ruído filtrado).
    const hiss = (heavy = false) => {
      const a = ensure(); if (!a) return;
      const dur = heavy ? .38 : .22 + Math.random() * .1;
      const length = Math.ceil(a.sampleRate * dur), buffer = a.createBuffer(1, length, a.sampleRate), data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) { const t = i / length; data[i] = (Math.random() * 2 - 1) * Math.sin(t * Math.PI) * (t < .15 ? t / .15 : 1); }
      const src = a.createBufferSource(), flt = a.createBiquadFilter(), amp = a.createGain();
      src.buffer = buffer; flt.type = 'bandpass'; flt.frequency.value = 3600 + Math.random() * 1400; flt.Q.value = 1.1; amp.gain.value = .12 * SFX_GAIN / .55;
      src.connect(flt).connect(amp).connect(out(a)); src.start();
    };
    const weapon = (kind, som, heavy = false) => {
      if (!enabled) return;
      const rate = heavy ? .88 : 1.02, volume = heavy ? .75 : .55;
      if (som === 'cobra' && kind === 'swing') { hiss(heavy); return; }
      if (!sample(`${som}:${kind}`, { volume, rate })) {
        if (kind === 'swing') synth(heavy ? 'kick' : 'punch');
        else if (kind === 'block') synth('block');
      }
    };
    // Vozes dos lutadores: amostras femininas (CC0/CC-BY); tom baixo vira voz masculina via playbackRate.
    const voice = (kind, voz = {}) => {
      const tom = voz.tom > 0 ? voz.tom : 1, tipo = [1, 2, 3].includes(voz.tipo) ? voz.tipo : 1;
      const rate = Math.max(.55, Math.min(1.15, .5 + tom * .3));
      const ok = kind === 'ko' ? sample(`voice${tipo}:hurt`, { volume: .7, rate: rate * .8 }) : sample(`voice${tipo}:${kind}`, { volume: .6, rate });
      if (!ok) { const a = ensure(); if (a) tone(a, { type: 'sawtooth', from: 140 * tom, to: 90 * tom, time: .2, gain: .08 }); }
    };
    const setEnabled = value => {
      enabled = !!value;
      try { localStorage.setItem('manifight-sound', enabled ? 'on' : 'off'); } catch (e) { /* ignorar */ }
      if (enabled) ensure();
    };
    const setVolume = v => {
      sfxMaster = Math.max(0, Math.min(1, Number(v) || 0));
      if (masterNode) masterNode.gain.value = sfxMaster;
      try { localStorage.setItem('manifight-vol-sfx', String(sfxMaster)); } catch (e) { /* ignorar */ }
    };
    return { play, announce, announce2, voice, weapon, setEnabled, setVolume, get volume() { return sfxMaster; }, get enabled() { return enabled; } };
  })();

  // ----------------------------------------------------------------- MÚSICA
  // Trilha em loop por cena (assets/music). Autoplay só após gesto do usuário:
  // se o navegador recusar, tenta de novo no primeiro clique/tecla.
  const Music = (() => {
    const TRACKS = { title: ['music/title.mp3'], select: ['music/select.mp3'], versus: ['music/versus.ogg'], fight: ['music/fight1.ogg', 'music/fight2.ogg'], final: ['music/final.ogg'], win: ['music/win.mp3'] };
    const VOLUME = { title: .32, select: .3, versus: .34, fight: .28, final: .3, win: .34 };
    let current = null, currentName = '', pending = null, ducked = false, fightPick = 0, master = 1;
    try { const v = localStorage.getItem('manifight-vol-music'); if (v !== null && Number.isFinite(Number(v))) master = Math.max(0, Math.min(1, Number(v))); } catch (e) { /* sem armazenamento */ }
    const level = () => (VOLUME[currentName] ?? .4) * master * (ducked ? .35 : 1);
    const stop = () => { if (current) { current.pause(); current.currentTime = 0; current = null; currentName = ''; } };
    const start = name => {
      const list = TRACKS[name];
      if (!list) return;
      const file = name === 'fight' ? list[fightPick++ % list.length] : list[0];
      stop();
      try {
        const a = new Audio('assets/' + file);
        a.loop = true;
        current = a; currentName = name;
        a.volume = level();
        a.play().then(() => { pending = null; }).catch(() => { pending = name; });
      } catch (e) { /* sem áudio */ }
    };
    const play = name => {
      if (!Sound.enabled) { pending = name; stop(); return; }
      if (name === currentName && current && !current.paused) return;
      start(name);
    };
    const duck = on => { ducked = on; if (current) current.volume = level(); };
    const setVolume = v => { master = Math.max(0, Math.min(1, Number(v) || 0)); if (current) current.volume = level(); try { localStorage.setItem('manifight-vol-music', String(master)); } catch (e) { /* ignorar */ } };
    const resume = () => { if (pending && Sound.enabled) start(pending); };
    ['keydown', 'pointerdown'].forEach(type => window.addEventListener(type, resume, { passive: true }));
    return { play, stop, duck, resume, setVolume, get volume() { return master; }, get current() { return currentName; } };
  })();

  // ------------------------------------------------------------- PARTÍCULAS
  // Faíscas, poeira, brasas, anéis de choque, rastros e números de dano.
  const particles = [];
  let spawnWorld = false; // no modo Rua as partículas de combate vivem em coordenadas do mundo (rolam com a câmera)
  const spawn = p => { if (particles.length < 900) particles.push({ life: p.maxLife, vx: 0, vy: 0, gravity: 0, drag: 1, size: 3, alpha: 1, layer: 'front', world: spawnWorld, ...p }); };
  // Ambiência do palco: névoa rasteira (atrás dos lutadores) e poeira flutuando.
  function fog(anywhere = false) {
    const fromLeft = Math.random() < .5, size = rand(160, 300);
    const x = anywhere ? rand(-size / 2, W + size / 2) : (fromLeft ? -size : W + size);
    spawn({ type: 'fog', layer: 'back', x, y: rand(GROUND - 25, GROUND + 35), vx: (fromLeft ? 1 : -1) * rand(8, 18), vy: rand(-1.5, 1.5), maxLife: rand(16, 26), size, alpha: rand(.16, .26) });
  }
  function mote() {
    spawn({ type: 'mote', layer: Math.random() < .6 ? 'back' : 'front', x: rand(0, W), y: rand(60, GROUND + 20), vx: rand(-9, 9), vy: rand(-6, 3), maxLife: rand(6, 11), size: rand(1, 2.2), alpha: rand(.25, .5), color: pick(['#ffffff', '#ffe9c4', '#cfe3ff']) });
  }
  // Vagalumes com o símbolo RD: pequenos, flutuando devagar, piscando.
  function firefly() {
    spawn({ type: 'rd', layer: Math.random() < .7 ? 'back' : 'front', x: rand(0, W), y: rand(40, GROUND), vx: rand(-14, 14), vy: rand(-10, 6), maxLife: rand(7, 13), size: rand(4, 8), phase: rand(0, 6.3), drag: 1 });
  }
  function ambient() {
    let fogs = 0, motes = 0, flies = 0;
    for (const p of particles) { if (p.type === 'fog') fogs++; else if (p.type === 'mote') motes++; else if (p.type === 'rd') flies++; }
    if (fogs < 8) fog(fogs < 5); // as primeiras já nascem dentro da tela
    if (motes < 30) mote();
    if ((state.scene === 'home' || state.scene === 'controls') && flies < 9) firefly();
  }
  // Símbolo RD miniatura: 4 triângulos apontando ao centro com a cruz vazia.
  function drawRdSymbol(c, x, y, s, color, alpha) {
    const g = Math.max(.8, s * .16);
    c.save(); c.translate(x, y); c.globalAlpha = alpha; c.fillStyle = color;
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([sx, sy]) => { c.beginPath(); c.moveTo(sx * g, sy * g); c.lineTo(sx * g, sy * s); c.lineTo(sx * s, sy * g); c.closePath(); c.fill(); });
    c.restore();
  }
  function sparks(x, y, colors, count, speed, big = false) {
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2), v = rand(speed * .35, speed);
      spawn({ type: 'spark', x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v - speed * .25, maxLife: rand(.2, big ? .6 : .4), gravity: 900, drag: .93, size: rand(2, big ? 6 : 4), color: pick(colors) });
    }
  }
  function dust(x, y, count, spread = 40) {
    for (let i = 0; i < count; i++) spawn({ type: 'dust', x: x + rand(-14, 14), y: y + rand(-4, 2), vx: rand(-spread, spread), vy: rand(-55, -15), maxLife: rand(.3, .6), gravity: -30, drag: .95, size: rand(4, 9), color: 'rgba(196,205,190,' });
  }
  function ring(x, y, color, radius, life = .3) { spawn({ type: 'ring', x, y, maxLife: life, radius, color }); }
  function damageNumber(x, y, value, color) { spawn({ type: 'text', x: x + rand(-10, 10), y, vy: -110, vx: rand(-25, 25), gravity: 160, maxLife: .8, text: String(value), color, size: value >= 100 ? 34 : 26 }); }
  function floatText(x, y, text, color, size = 28) { spawn({ type: 'text', x, y, vy: -70, vx: 0, gravity: 40, maxLife: 1.1, text, color, size }); }
  function slash(x, y, facing, color, radius) { spawn({ type: 'slash', x, y, facing, color, radius, maxLife: .18 }); }
  function ember() {
    spawn({ type: 'ember', x: rand(330, 640), y: rand(120, 230), vx: rand(-12, 12), vy: rand(-30, -10), maxLife: rand(1.5, 3), size: rand(1, 2.5), color: pick(['#ffb347', '#ff674b', '#d7ff3f', '#fff2c8']) });
  }
  function confetti() {
    spawn({ type: 'confetti', x: rand(0, W), y: -10, vx: rand(-30, 30), vy: rand(60, 140), gravity: 40, maxLife: rand(3, 5), size: rand(4, 8), rot: rand(0, 6.3), spin: rand(-6, 6), color: pick(['#d7ff3f', '#ff674b', '#77dce8', '#f9b945', '#f479ab', '#ffffff']) });
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += p.gravity * dt;
      p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.spin) p.rot += p.spin * dt;
    }
  }
  const FONT = '900 %spx Impact, "Arial Narrow", Haettenschweiler, sans-serif';
  function drawParticles(c, layer = 'front', world = false) {
    for (const p of particles) {
      if (p.layer !== layer || !!p.world !== world) continue;
      const t = p.life / p.maxLife;
      c.save();
      switch (p.type) {
        case 'fog': {
          const age = (1 - t) * p.maxLife, left = t * p.maxLife;
          const fade = Math.min(1, age / 2.5, left / 3); // entra em 2,5 s, sai em 3 s
          const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          g.addColorStop(0, `rgba(190,205,225,${(p.alpha * fade).toFixed(3)})`); g.addColorStop(1, 'rgba(190,205,225,0)');
          c.fillStyle = g;
          c.save(); c.translate(p.x, p.y); c.scale(1, .32); c.translate(-p.x, -p.y);
          c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2); c.fill();
          c.restore();
          break;
        }
        case 'rd': {
          const fade = Math.min(1, (1 - t) * p.maxLife / 2, t * p.maxLife / 2);
          const wobX = Math.sin(state.time * 1.1 + p.phase) * 9, wobY = Math.cos(state.time * .8 + p.phase) * 6;
          const blink = .35 + .45 * (Math.sin(state.time * 2.6 + p.phase) * .5 + .5);
          drawRdSymbol(c, p.x + wobX, p.y + wobY, p.size * 2.2, '#ff3b4a', fade * blink * .18); // halo
          drawRdSymbol(c, p.x + wobX, p.y + wobY, p.size, '#ff5a6a', fade * blink);
          break;
        }
        case 'mote':
          c.globalAlpha = p.alpha * Math.min(1, (1 - t) * p.maxLife / 1.5, t * p.maxLife / 1.5);
          c.fillStyle = p.color;
          c.fillRect(p.x, p.y, p.size, p.size);
          break;
        case 'spark':
          c.globalAlpha = Math.min(1, t * 1.6);
          c.fillStyle = p.color;
          c.fillRect(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2), Math.round(p.size), Math.round(p.size));
          break;
        case 'dust':
          c.globalAlpha = t * .55;
          c.fillStyle = p.color + '1)';
          c.beginPath(); c.arc(p.x, p.y, p.size * (1.6 - t), 0, Math.PI * 2); c.fill();
          break;
        case 'ember':
          c.globalAlpha = Math.sin(t * Math.PI) * .9;
          c.fillStyle = p.color;
          c.fillRect(p.x, p.y, p.size, p.size);
          break;
        case 'ring': {
          const k = 1 - t;
          c.globalAlpha = t;
          c.strokeStyle = p.color; c.lineWidth = 4 * t + 1;
          c.beginPath(); c.arc(p.x, p.y, p.radius * (0.3 + k * 0.7), 0, Math.PI * 2); c.stroke();
          break;
        }
        case 'slash': {
          const k = 1 - t;
          c.globalAlpha = t * .9;
          c.translate(p.x, p.y); c.scale(p.facing, 1);
          c.strokeStyle = p.color; c.lineWidth = 7 * t + 2; c.lineCap = 'round';
          c.beginPath(); c.arc(0, 0, p.radius, -1.3 + k * .4, .9 + k * .6); c.stroke();
          c.strokeStyle = '#ffffff'; c.lineWidth = 2;
          c.beginPath(); c.arc(0, 0, p.radius * .92, -1.1 + k * .4, .7 + k * .6); c.stroke();
          break;
        }
        case 'text':
          c.globalAlpha = Math.min(1, t * 2.5);
          c.font = FONT.replace('%s', p.size); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
          c.fillStyle = '#000'; c.fillText(p.text, p.x + 3, p.y + 3);
          c.fillStyle = p.color; c.fillText(p.text, p.x, p.y);
          break;
        case 'confetti':
          c.globalAlpha = Math.min(1, t * 3);
          c.translate(p.x, p.y); c.rotate(p.rot);
          c.fillStyle = p.color; c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          break;
        default: break;
      }
      c.restore();
    }
  }

  // ----------------------------------------------------------------- ESTADO
  const state = {
    scene: 'home', time: 0, accumulator: 0,
    featured: 0, featuredTimer: 0,
    selectPhase: 'player', cursor: 0, playerIndex: 0, cpuIndex: null,
    match: null, paused: false, held: {}, result: null, lastBanner: '', continueTimer: 0,
    mode: 'versus', menuIndex: 0, street: null, target: null, panelTimer: 0, streetBanner: '', resultAt: 0,
    stageId: 'rooftop', stageIndex: 0,
    hitstop: 0, slowmo: 0, flash: 0, emberTimer: 0, vsAnim: 0, vsTimer: 0,
    watch: null, ghost: [1, 1], ghostHold: [0, 0]
  };
  const KEYMAP = {
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    KeyW: 'jump', ArrowUp: 'jump', KeyS: 'crouch', ArrowDown: 'crouch',
    KeyJ: 'punch', KeyK: 'kick', KeyL: 'block', KeyI: 'special'
  };
  // Dash por toque duplo na direção (A A / D D). Gera um pulso curto em held.dash.
  const DASH_DIR = { KeyA: -1, ArrowLeft: -1, KeyD: 1, ArrowRight: 1 };
  let lastTap = null, dashClear = 0;
  function tapDash(code) {
    const dir = DASH_DIR[code];
    if (!dir) return;
    const now = performance.now();
    if (lastTap && lastTap.dir === dir && now - lastTap.t < 240) {
      state.held.dash = dir;
      clearTimeout(dashClear);
      dashClear = setTimeout(() => { state.held.dash = 0; }, 70);
      lastTap = null;
    } else lastTap = { dir, t: now };
  }

  function show(scene) {
    state.scene = scene;
    Object.entries(screens).forEach(([name, el]) => { el.hidden = name !== scene; });
    pauseLayer.hidden = true;
    state.paused = false;
    touchControls.hidden = scene !== 'fight' && scene !== 'street';
    particles.length = 0;
    state.flash = 0; state.hitstop = 0; state.slowmo = 0;
  }

  // ------------------------------------------------------------------- HOME
  const FEATURE_PERIOD = 6; // s por personagem no holofote da home
  function updateFeatured() {
    const conf = roster[state.featured];
    setText('featured-name', String(conf.nome).toUpperCase());
    setText('featured-title', `${conf.titulo || ''} · ${weaponName(conf)}`.toUpperCase());
  }
  // Reveal do holofote: 0 = breu (silhueta), 1 = iluminado. Sobe em 0.9–1.8 s, apaga no fim.
  function featureReveal() {
    const lt = state.featuredTimer;
    if (lt < .9) return 0;
    if (lt < 1.8) return (lt - .9) / .9;
    if (lt > FEATURE_PERIOD - .5) return Math.max(0, (FEATURE_PERIOD - lt) / .5);
    return 1;
  }
  function goHome() {
    state.match = null;
    state.street = null;
    state.held = {};
    show('home');
    updateFeatured();
    updateMenu();
    Music.play('title');
    announce('Menu principal. Setas escolhem o modo, Enter começa.');
  }
  // Menu de modos do título: VERSUS (1P vs CPU) e RUA SP (beat 'em up).
  const MODES = ['versus', 'street', 'controls'];
  function updateMenu() {
    document.querySelectorAll('.mode').forEach(btn => btn.classList.toggle('selected', btn.dataset.mode === MODES[state.menuIndex]));
  }
  // Abas da tela de controles.
  const ctlTabs = [...document.querySelectorAll('.ctl-tab')], ctlBoxes = [...document.querySelectorAll('#ctl-panels .ctl-box')];
  let ctlTab = 0;
  function setCtlTab(i) {
    ctlTab = (i + ctlTabs.length) % ctlTabs.length;
    ctlTabs.forEach((t, k) => t.classList.toggle('selected', k === ctlTab));
    ctlBoxes.forEach((b, k) => b.classList.toggle('active', k === ctlTab));
  }
  ctlTabs.forEach((t, i) => t.addEventListener('click', () => { Sound.play('move'); setCtlTab(i); }));
  function startMode(mode) {
    Sound.play('confirm');
    if (mode === 'controls') { setCtlTab(0); show('controls'); announce('Tela de controles. W e S trocam a aba, Esc volta.'); return; }
    state.mode = mode;
    openSelect('player');
  }
  on('controls-back', 'click', () => { Sound.play('back'); goHome(); });
  // Símbolo RD em pixel art: losango de 4 triângulos apontando ao centro, cruz vazia no
  // meio e cantos internos "arredondados" (células cortadas perto do centro). Grade 15×15.
  (function buildAsciiLogo() {
    const el = $('ascii-logo');
    if (!el) return;
    const filled = (r, c) => {
      if (r === 7 || c === 7) return false; // cruz vazia
      const rr = r < 7 ? r : 14 - r, cc = c < 7 ? c : 14 - c; // dobra para o quadrante superior esquerdo
      if (cc < 6 - rr) return false; // acima da hipotenusa (fora do losango)
      if ((rr === 6 && cc >= 5) || (cc === 6 && rr >= 5)) return false; // canto interno arredondado
      return true;
    };
    el.textContent = '';
    for (let r = 0; r < 15; r++) for (let c = 0; c < 15; c++) { const cell = document.createElement('i'); if (!filled(r, c)) cell.className = 'o'; el.appendChild(cell); }
  })();
  document.querySelectorAll('.mode').forEach(btn => {
    btn.addEventListener('mouseenter', () => { state.menuIndex = Math.max(0, MODES.indexOf(btn.dataset.mode)); updateMenu(); });
    btn.addEventListener('click', () => startMode(btn.dataset.mode));
  });

  // ----------------------------------------------------------------- SELECT
  const rosterEl = $('roster');
  const RANDOM = roster.length; // índice do card "?" (escolha aleatória)
  const makeCard = (label, i) => {
    const card = document.createElement('button');
    card.className = 'portrait-card';
    card.type = 'button';
    card.setAttribute('aria-label', label);
    card.addEventListener('click', () => {
      if (state.cursor === i) confirmSelect();
      else { state.cursor = i; Sound.play('move'); updatePreview(); }
    });
    rosterEl.appendChild(card);
    return card;
  };
  const cards = roster.map((conf, i) => {
    const card = makeCard(`${conf.nome}, ${conf.titulo || 'lutador'}, arma ${weaponName(conf)}`, i);
    const art = document.createElement('canvas'); art.width = 156; art.height = 100;
    const name = document.createElement('span'); name.className = 'card-name'; name.textContent = conf.nome;
    card.append(art, name);
    return card;
  });
  {
    const random = makeCard('Escolha aleatória', RANDOM);
    random.classList.add('random-card');
    random.innerHTML = '<b>?</b><span>RANDOM</span>';
    cards.push(random);
  }
  const redrawPortraits = () => {
    roster.forEach((conf, i) => drawPortrait(cards[i].querySelector('canvas'), conf));
    if (state.match) {
      drawPortrait($('hud-player-portrait'), state.match.fighters[0].config);
      drawPortrait($('hud-cpu-portrait'), state.match.fighters[1].config, true);
    }
  };
  redrawPortraits();
  setText('roster-count', pad(roster.length));

  function openSelect(phase) {
    state.selectPhase = phase;
    const player = phase === 'player';
    state.cursor = player ? state.playerIndex : (state.cpuIndex ?? (state.playerIndex + 1) % roster.length);
    setText('select-step', 'CHARACTER SELECT');
    setText('select-sub', state.mode === 'street' ? 'RUA SP · ESCOLHA SEU LUTADOR' : player ? '1P · ESCOLHA SEU LUTADOR' : 'CPU · ESCOLHA O OPONENTE');
    rosterEl.classList.toggle('cpu', !player);
    show('select');
    updatePreview();
    Music.play('select');
    if (player) Sound.announce('choose_your_character');
    announce(player ? 'Escolha seu lutador. Use as setas e Enter.' : 'Escolha o oponente. Use as setas e Enter.');
  }

  // Etiquetas estilo ficha de lutador (ESTILO / ARMA / VIDA...).
  function fillTags(id, conf) {
    const el = $(id);
    if (!el) return;
    el.textContent = '';
    const rows = conf
      ? [['ESTILO', conf.titulo || 'Lutador'], ['ARMA', weaponName(conf)], ['VIDA', String(Math.round(statValue(conf, 'vida', 1000)))], ['VELOCIDADE', String(Math.round(statValue(conf, 'velocidade', 245)))], ['FORÇA', `x${statValue(conf, 'forca', 1).toFixed(2)}`]]
      : [['ESTILO', '???'], ['ARMA', '???']];
    rows.forEach(([label, value]) => {
      const row = document.createElement('div'); row.className = 'tag-row';
      const a = document.createElement('span'); a.className = 'tag-label'; a.textContent = label;
      const b = document.createElement('span'); b.className = 'tag-value'; b.textContent = value;
      row.append(a, b);
      el.appendChild(row);
    });
  }

  function updatePreview() {
    const hovered = roster[state.cursor] || null;
    const left = state.selectPhase === 'player' ? hovered : roster[state.playerIndex];
    setText('preview-name', left ? left.nome : 'RANDOM');
    fillTags('preview-tags', left);
    const cpu = state.selectPhase === 'cpu' ? hovered : null;
    if (state.mode === 'street') {
      setText('cpu-preview-name', 'SÃO PAULO');
      const el = $('cpu-preview-tags');
      if (el) { el.textContent = ''; [['MODO', 'Rua SP · beat \'em up'], ['FASES', `${STAGES.length} · ${STAGES.map(s => s.nome).join(' > ')}`], ['VIDAS', '3 + itens RD (vida, dano, especial)']].forEach(([k, v]) => { const row = document.createElement('div'); row.className = 'tag-row'; const a = document.createElement('span'); a.className = 'tag-label'; a.textContent = k; const b = document.createElement('span'); b.className = 'tag-value'; b.textContent = v; row.append(a, b); el.appendChild(row); }); }
    } else {
      setText('cpu-preview-name', cpu ? cpu.nome : (state.selectPhase === 'cpu' ? 'RANDOM' : '???'));
      fillTags('cpu-preview-tags', cpu);
    }
    let quote = 'ESCOLHA ALEATÓRIA';
    if (hovered) quote = hovered.frase ? `“${hovered.frase}”` : '';
    setText('preview-quote', quote);
    cards.forEach((card, i) => {
      card.classList.toggle('selected', i === state.cursor);
      card.classList.toggle('chosen', state.selectPhase === 'cpu' && i === state.playerIndex);
      card.setAttribute('aria-pressed', String(i === state.cursor));
    });
  }

  const columns = () => Math.max(1, cards.filter(card => card.offsetTop === cards[0].offsetTop).length);
  function moveCursor(delta) {
    const next = state.cursor + delta;
    if (next < 0 || next >= cards.length) return;
    state.cursor = next;
    Sound.play('move');
    updatePreview();
  }

  function confirmSelect() {
    Sound.play('confirm');
    const choice = state.cursor === RANDOM ? Math.floor(Math.random() * roster.length) : state.cursor;
    if (state.selectPhase === 'player') {
      state.playerIndex = choice;
      if (state.mode === 'street') startStreet(); else openSelect('cpu');
    } else {
      state.cpuIndex = choice;
      openStageSelect();
    }
  }

  // ------------------------------------------------------------ ARENA (STAGE)
  const STAGE_IDS = Object.keys(Art.stages);
  const stageCards = STAGE_IDS.map((id, i) => {
    const card = document.createElement('button');
    card.className = 'stage-card'; card.type = 'button'; card.dataset.stage = id;
    const thumb = document.createElement('canvas'); thumb.width = 320; thumb.height = 180;
    const b = document.createElement('b'); b.textContent = Art.stages[id].nome;
    const s = document.createElement('small'); s.textContent = Art.stages[id].sub;
    card.append(thumb, b, s);
    card.addEventListener('click', () => { if (state.stageIndex === i) confirmStage(); else { state.stageIndex = i; Sound.play('move'); updateStageCards(); } });
    const wrap = $('stage-cards'); if (wrap) wrap.appendChild(card);
    return card;
  });
  let stageThumbsDone = false;
  function drawStageThumbs() {
    if (stageThumbsDone) return;
    const off = document.createElement('canvas'); off.width = W; off.height = H; const oc = off.getContext('2d');
    STAGE_IDS.forEach((id, i) => {
      oc.setTransform(1, 0, 0, 1, 0, 0); oc.clearRect(0, 0, W, H); Art.stages[id].draw(oc, 1, 'fight');
      const tc = stageCards[i].querySelector('canvas').getContext('2d'); tc.imageSmoothingEnabled = false; tc.drawImage(off, 0, 0, 320, 180);
    });
    stageThumbsDone = true;
  }
  function updateStageCards() {
    state.stageId = STAGE_IDS[state.stageIndex] || 'rooftop';
    stageCards.forEach((card, i) => card.classList.toggle('selected', i === state.stageIndex));
  }
  function openStageSelect() {
    drawStageThumbs();
    updateStageCards();
    show('stage');
    announce('Escolha a arena. A e D alternam, Enter confirma.');
  }
  function confirmStage() { Sound.play('confirm'); updateStageCards(); openVersus(); }
  on('stage-confirm', 'click', confirmStage);
  on('stage-back', 'click', () => { Sound.play('back'); openSelect('cpu'); });

  function backFromSelect() {
    Sound.play('back');
    if (state.selectPhase === 'cpu') openSelect('player');
    else goHome();
  }

  // ----------------------------------------------------------------- VERSUS
  function openVersus() {
    const p = roster[state.playerIndex], c = roster[state.cpuIndex];
    setText('vs-player-name', p.nome); setText('vs-player-quote', p.frase || '');
    setText('vs-cpu-name', c.nome); setText('vs-cpu-quote', c.frase || '');
    setText('vs-player-weapon', `1P · ${weaponName(p).toUpperCase()}`);
    setText('vs-cpu-weapon', `${weaponName(c).toUpperCase()} · CPU`);
    const stageInfo = Art.stages[state.stageId] || Art.stages.rooftop;
    document.querySelectorAll('.vs-stage-name').forEach(el => { el.textContent = `${stageInfo.nome} · ${stageInfo.sub}`; });
    document.querySelectorAll('#fight-screen .arena-caption').forEach(el => { el.textContent = `${stageInfo.nome} · ${stageInfo.sub}`; });
    show('vs');
    Music.play('versus');
    state.vsAnim = 0;
    state.vsBoom = false;
    state.vsTimer = 4.6; // início automático, como nos clássicos; Enter pula, Esc volta
    const mark = $('vs-mark');
    if (mark) { mark.style.animation = 'none'; void mark.offsetWidth; mark.style.animation = ''; }
    Sound.announce('prepare_yourself');
    announce(`${p.nome} contra ${c.nome}. Enter para lutar.`);
  }

  // ------------------------------------------------------------------ FIGHT
  function startFight() {
    const p = roster[state.playerIndex], c = roster[state.cpuIndex ?? 0];
    state.match = new Combat.Match(p, c);
    state.held = {};
    state.accumulator = 0;
    state.lastBanner = '';
    state.ghost = [1, 1]; state.ghostHold = [0, 0];
    state.watch = { hp: state.match.fighters.map(f => f.hp), grounded: [true, true], dustTimer: [0, 0], seen: new WeakSet(), lastAttack: [null, null], lastPhase: 'intro', comboCalled: [false, false] };
    setText('hud-player-name', p.nome);
    setText('hud-cpu-name', c.nome);
    drawPortrait($('hud-player-portrait'), p);
    drawPortrait($('hud-cpu-portrait'), c, true);
    Sound.play('confirm');
    show('fight');
    Music.play('fight');
    setTimeout(() => { if (state.match && state.match.phase === 'intro') Sound.announce2('get_ready'); }, 150);
    updateHud();
    announce(`Round 1. ${p.nome} contra ${c.nome}.`);
  }

  function setHealth(side, index, fighter, dt) {
    const ratio = fighter.maxHp ? fighter.hp / fighter.maxHp : 0;
    const fill = $(`${side}-health-fill`);
    fill.style.transform = `scaleX(${ratio.toFixed(4)})`;
    fill.classList.toggle('low', ratio <= .25);
    // Barra fantasma: segura um instante e depois desliza até a vida atual.
    if (state.ghost[index] > ratio) {
      if (state.ghostHold[index] > 0) state.ghostHold[index] -= dt;
      else state.ghost[index] = Math.max(ratio, state.ghost[index] - dt * 1.4);
    } else state.ghost[index] = ratio;
    $(`${side}-health-ghost`).style.transform = `scaleX(${state.ghost[index].toFixed(4)})`;
    $(`${side}-health`).setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    setText(`${side}-hp`, `${Math.ceil(fighter.hp)} / ${fighter.maxHp} HP`);
    const meter = $(`${side}-meter`);
    if (meter) {
      const m = Math.max(0, Math.min(1, fighter.meter / Combat.METER_MAX));
      meter.style.transform = `scaleX(${m.toFixed(3)})`;
      meter.parentElement.classList.toggle('full', m >= 1);
    }
  }

  function setPips(id, wins) {
    [...$(id).children].forEach((pip, i) => pip.classList.toggle('won', i < wins));
  }

  function updateHud(dt = 0) {
    const m = state.match;
    if (!m) return;
    setHealth('player', 0, m.fighters[0], dt);
    setHealth('cpu', 1, m.fighters[1], dt);
    const seconds = Math.ceil(m.time);
    setText('timer', pad(seconds));
    $('timer').classList.toggle('urgent', seconds <= 10 && m.phase === 'fight');
    setText('hud-round', `ROUND ${m.round}`);
    setPips('player-pips', m.wins[0]);
    setPips('cpu-pips', m.wins[1]);
    const banner = $('fight-banner');
    if (m.banner) {
      banner.hidden = false;
      const spoken = `${m.banner.title} ${m.banner.subtitle || ''}`.trim();
      if (spoken !== state.lastBanner) {
        state.lastBanner = spoken;
        setText('banner-title', m.banner.title);
        setText('banner-subtitle', m.banner.subtitle || '');
        banner.classList.remove('pop');
        void banner.offsetWidth;
        banner.classList.add('pop');
        announce(spoken);
        // Locutor de fliperama (amostras Kenney).
        const title = m.banner.title;
        if (/^ROUND \d/.test(title)) {
          const n = Number(title.slice(6)), final = n > 3 || (m.wins[0] === 1 && m.wins[1] === 1);
          Sound.announce(final ? 'final_round' : `round_${n}`);
          if (final) { Music.play('final'); setTimeout(() => Sound.announce2('this_could_be_the_end'), 1300); }
        } else if (title === 'FIGHT!') Sound.announce('fight');
        else if (title === 'K.O.' && m.banner.subtitle !== 'PERFECT!' && m.winner !== null) setTimeout(() => Sound.announce2('finish_it'), 1200);
        else if (title === 'TIME OVER') Sound.announce('time');
        else if (title === 'DRAW GAME') Sound.announce('tie');
        if (m.banner.subtitle === 'PERFECT!') setTimeout(() => Sound.announce('flawless_victory'), 700);
      }
    } else banner.hidden = true;
    flashLayer.style.opacity = state.flash.toFixed(3);
  }

  // Observa a simulação e dispara partículas, hit-stop e câmera lenta.
  function reactToMatch(events) {
    const m = state.match, w = state.watch, [a, b] = m.fighters;
    for (const effect of m.effects) {
      if (w.seen.has(effect)) continue;
      w.seen.add(effect);
      const attacker = m.fighters[effect.attacker], victim = m.fighters[1 - effect.attacker];
      const primary = attacker.config.palette?.primary || '#d7ff3f';
      if (effect.parry) {
        // Parry: clarão azul, anel grande, texto e barra do defensor sobe.
        sparks(effect.x, effect.y, ['#ffffff', '#9fd8ff', '#3fa0ff'], 22, 380, true);
        ring(effect.x, effect.y, '#9fd8ff', 110, .35);
        floatText(victim.x, victim.y - 165, 'PARRY!', '#7fd3ff', 30);
        state.hitstop = Math.max(state.hitstop, .1);
        state.flash = Math.max(state.flash, .25);
        Sound.play('parry');
      } else if (effect.blocked) {
        sparks(effect.x, effect.y, ['#ffffff', '#9fd8ff', '#77dce8'], 8, 260);
        ring(effect.x, effect.y, '#9fd8ff', 34, .22);
        state.hitstop = Math.max(state.hitstop, .03);
        Sound.weapon('block', attacker.config.arma?.som);
        Sound.play('block');
      } else {
        const heavy = effect.type !== 'punch', special = effect.type === 'special';
        sparks(effect.x, effect.y, ['#ffffff', '#fff5b0', primary, '#ff9d3f'], special ? 40 : heavy ? 18 : 12, special ? 620 : heavy ? 420 : 300, heavy);
        ring(effect.x, effect.y, special ? '#ffd21e' : heavy ? '#ff674b' : '#ffffff', special ? 150 : heavy ? 70 : 44, special ? .5 : heavy ? .32 : .24);
        slash(attacker.x + effect.facing * 30, attacker.y - 95, effect.facing, primary, attacker.moves[effect.type].range * .85);
        const dealt = Math.max(0, w.hp[victim.index] - victim.hp);
        damageNumber(victim.x, victim.y - 150, dealt || effect.damage, effect.critical ? '#ff2d55' : heavy ? '#ff674b' : '#d7ff3f');
        if (effect.critical) { floatText(victim.x, victim.y - 190, 'CRITICAL!', '#ff2d55', 34); Sound.play('critical'); state.hitstop = Math.max(state.hitstop, .12); state.flash = Math.max(state.flash, .2); }
        else if (effect.counter) floatText(victim.x, victim.y - 190, 'COUNTER!', '#ffd21e', 28);
        if (special) { state.hitstop = Math.max(state.hitstop, .16); state.flash = Math.max(state.flash, .45); }
        if (victim.hp > 0 && Math.random() < (victim.config.voz?.frequencia ?? .6)) Sound.voice('hurt', victim.config.voz);
        Sound.play(heavy ? 'heavy' : 'hit');
        Sound.weapon('hit', attacker.config.arma?.som, heavy);
        if (heavy && victim.hp > 0 && Math.random() < .12) Sound.announce2(Math.random() < .5 ? 'thats_gotta_hurt' : (victim.config.voz?.genero === 'f' ? 'shell_feel_that' : 'hell_feel_that'));
        state.hitstop = Math.max(state.hitstop, heavy ? .085 : .055);
        if (heavy) state.flash = Math.max(state.flash, .12);
      }
    }
    [a, b].forEach((f, i) => {
      // Grito ao iniciar cada golpe (leve curto, forte mais longo).
      if (f.attack && f.attack !== w.lastAttack[i]) {
        const freq = f.config.voz?.frequencia ?? .6, heavy = f.attack.type === 'kick';
        Sound.weapon('swing', f.config.arma?.som, heavy);
        if (Math.random() < (heavy ? freq : freq * .5)) Sound.voice('attack', f.config.voz);
      }
      w.lastAttack[i] = f.attack;
      if (!w.grounded[i] && f.grounded) { dust(f.x, f.y, 7, 70); Sound.play('land'); }
      if (f.combo >= 3 && f.comboTime > 0 && !w.comboCalled[i]) { w.comboCalled[i] = true; Sound.announce('combo'); }
      if (f.combo < 2) w.comboCalled[i] = false;
      w.grounded[i] = f.grounded;
      if (f.state === 'walk' && f.grounded) {
        w.dustTimer[i] -= 1 / 60;
        if (w.dustTimer[i] <= 0) { w.dustTimer[i] = .14; dust(f.x - f.facing * 14, f.y, 1, 20); Sound.play('step'); }
      }
      w.hp[i] = f.hp;
    });
    for (const event of events) {
      if (!['hit', 'block', 'parry', 'round', 'finish', 'punch', 'kick', 'special'].includes(event)) Sound.play(event);
      if (event === 'dash') [a, b].forEach(f => { if (f.dash) dust(f.x - f.dash.dir * 20, f.y, 8, 90); });
      if (event === 'doublejump') [a, b].forEach(f => { if (!f.grounded && f.jumps === 2) { ring(f.x, f.y - 20, '#cfe3ff', 40, .25); dust(f.x, f.y - 10, 5, 50); } });
      if (event === 'special') {
        const user = [a, b].find(f => f.attack && f.attack.type === 'special');
        Sound.play('special');
        state.slowmo = Math.max(state.slowmo, .45);
        state.flash = Math.max(state.flash, .35);
        if (user) { floatText(user.x, user.y - 200, 'SPECIAL!', '#ffd21e', 40); ring(user.x, user.y - 80, '#ffd21e', 120, .5); sparks(user.x, user.y - 80, ['#ffd21e', '#ffffff', user.config.palette?.primary || '#fff'], 30, 420, true); }
      }
      if (event === 'jump') [a, b].forEach(f => { if (!f.grounded && f.vy < -100 && f.y > GROUND - 6 && Math.random() < (f.config.voz?.frequencia ?? .6) * .5) Sound.voice('jump', f.config.voz); });
      if (event === 'jump') [a, b].forEach(f => { if (!f.grounded && f.vy < -100 && f.y > GROUND - 6) dust(f.x, GROUND, 4, 40); });
      if (event === 'ko') {
        const victim = m.fighters.find(f => f.hp <= 0);
        state.flash = Math.max(state.flash, .75);
        state.slowmo = 1.1;
        state.hitstop = Math.max(state.hitstop, .12);
        if (victim) {
          sparks(victim.x, victim.y - 90, ['#ffffff', '#ff674b', '#d7ff3f', '#ffb347'], 36, 520, true); ring(victim.x, victim.y - 90, '#ffffff', 160, .5);
          Sound.voice('ko', victim.config.voz);
          setTimeout(() => { if (state.match === m) Sound.announce2('knockout'); }, 380);
        } else state.slowmo = .5;
      }
    }
    if (m.phase !== w.lastPhase) {
      if (m.phase === 'roundover' && m.roundWinner !== null) {
        const winner = m.fighters[m.roundWinner];
        setTimeout(() => { if (state.match === m) Sound.voice('attack', winner.config.voz); }, 650);
      }
      w.lastPhase = m.phase;
    }
  }

  function setPaused(on) {
    const inFight = state.scene === 'fight' && state.match && state.match.phase !== 'finished';
    const inStreet = state.scene === 'street' && state.street && !['gameover', 'won'].includes(state.street.phase);
    if (!inFight && !inStreet) return;
    state.paused = on;
    pauseLayer.hidden = !on;
    state.held = {};
    Music.duck(on);
    if (on) { Sound.play('pause'); $('resume-button').focus(); announce('Jogo pausado.'); }
    else { Sound.play('confirm'); announce('Jogo retomado.'); }
  }

  function popResultHeading() {
    const h = $('result-heading');
    if (!h) return;
    h.classList.remove('pop'); void h.offsetWidth; h.classList.add('pop');
  }
  // Holofote do MVP: brilho radial, raios girando e anel no chão.
  function drawSpotlight(c, x, y, t, k) {
    c.save();
    c.globalAlpha = k;
    const glow = c.createRadialGradient(x, y, 20, x, y, 300);
    glow.addColorStop(0, 'rgba(255,225,140,.45)'); glow.addColorStop(.5, 'rgba(255,190,60,.12)'); glow.addColorStop(1, 'rgba(255,190,60,0)');
    c.fillStyle = glow; c.fillRect(0, 0, W, H);
    c.translate(x, y); c.rotate(t * .25);
    for (let i = 0; i < 14; i++) {
      c.rotate(Math.PI * 2 / 14);
      c.fillStyle = i % 2 ? 'rgba(255,220,120,.07)' : 'rgba(255,255,255,.05)';
      c.beginPath(); c.moveTo(0, 0); c.lineTo(700, -46); c.lineTo(700, 46); c.closePath(); c.fill();
    }
    c.restore();
    c.save(); c.globalAlpha = k * .9;
    c.strokeStyle = '#ffd21e'; c.lineWidth = 3; c.beginPath(); c.ellipse(x, GROUND + 22, 150, 26, 0, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(255,210,30,.18)'; c.beginPath(); c.ellipse(x, GROUND + 22, 150, 26, 0, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  function finishMatch() {
    const m = state.match;
    const winner = m.fighters[m.winner], loser = m.fighters[1 - m.winner];
    const playerWon = m.winner === 0;
    state.result = { winner, loser, playerWon };
    // Tela estilo MVP: vencedor no centro, "{NOME} WINS" gigante.
    setText('result-kicker', playerWon ? 'VITÓRIA · YOU WIN' : 'DERROTA · YOU LOSE');
    setText('result-heading', `${winner.config.nome.toUpperCase()} WINS`);
    $('result-heading').classList.toggle('lose', !playerWon);
    popResultHeading();
    state.resultAt = state.time;
    const quoteBox = $('win-quote'), continueBox = $('continue-box');
    if (quoteBox) quoteBox.hidden = !playerWon;
    if (continueBox) continueBox.hidden = playerWon;
    state.continueTimer = 9.99;
    setText('continue-count', '9');
    setText('rematch-button', playerWon ? 'REMATCH' : 'CONTINUE');
    setText('winner-name', `${winner.config.nome} · ${winner.config.titulo || ''} · ${weaponName(winner.config)}`);
    setText('winner-quote', winner.config.frase ? `“${winner.config.frase}”` : '');
    const score = $('result-score');
    score.textContent = '';
    const sep = document.createElement('span'); sep.textContent = ' × ';
    score.append(String(m.wins[0]), sep, String(m.wins[1]));
    show('result');
    announce(`${playerWon ? 'Vitória' : 'Derrota'}. ${winner.config.nome} vence por ${m.wins[0]} a ${m.wins[1]}.`);
    setTimeout(() => { if (state.scene === 'result') Sound.announce(playerWon ? 'you_win' : 'you_lose'); }, 350);
    if (playerWon) { Music.play('win'); Sound.play('jingle'); setTimeout(() => { if (state.scene === 'result') Sound.announce2('victory'); }, 1600); }
    else Music.stop();
  }

  // ------------------------------------------------------------------ INPUT
  window.addEventListener('keydown', event => {
    const code = event.code;
    const onButton = event.target instanceof Element && event.target.closest('button');
    if (state.scene === 'fight' || state.scene === 'street') {
      if (code === 'Escape') { event.preventDefault(); setPaused(!state.paused); return; }
      if (state.paused) { if (code === 'Enter' && !onButton) { event.preventDefault(); setPaused(false); } return; }
      if (!event.repeat) tapDash(code);
      const action = KEYMAP[code];
      if (action) { state.held[action] = true; event.preventDefault(); }
      return;
    }
    if (event.repeat) return;
    const isEnter = code === 'Enter' || code === 'Space' || code === 'NumpadEnter';
    if (isEnter && onButton) return; // o clique nativo do botão cuida disso
    if (state.scene === 'controls') {
      if (event.target instanceof Element && event.target.closest('input')) { if (code === 'Escape') { event.target.blur(); Sound.play('back'); goHome(); } return; } // sliders/checkboxes usam as setas
      if (['KeyW', 'ArrowUp'].includes(code)) { Sound.play('move'); setCtlTab(ctlTab - 1); event.preventDefault(); }
      else if (['KeyS', 'ArrowDown'].includes(code)) { Sound.play('move'); setCtlTab(ctlTab + 1); event.preventDefault(); }
      else if (isEnter || code === 'Escape') { event.preventDefault(); Sound.play('back'); goHome(); }
    } else if (state.scene === 'home') {
      if (isEnter) { event.preventDefault(); startMode(MODES[state.menuIndex]); }
      else if (['ArrowLeft', 'ArrowUp', 'KeyA', 'KeyW'].includes(code)) { state.menuIndex = (state.menuIndex + MODES.length - 1) % MODES.length; Sound.play('move'); updateMenu(); }
      else if (['ArrowRight', 'ArrowDown', 'KeyD', 'KeyS'].includes(code)) { state.menuIndex = (state.menuIndex + 1) % MODES.length; Sound.play('move'); updateMenu(); }
    } else if (state.scene === 'select') {
      if (code === 'ArrowLeft' || code === 'KeyA') moveCursor(-1);
      else if (code === 'ArrowRight' || code === 'KeyD') moveCursor(1);
      else if (code === 'ArrowUp' || code === 'KeyW') moveCursor(-columns());
      else if (code === 'ArrowDown' || code === 'KeyS') moveCursor(columns());
      else if (isEnter) confirmSelect();
      else if (code === 'Escape') backFromSelect();
      else return;
      event.preventDefault();
    } else if (state.scene === 'stage') {
      if (['ArrowLeft', 'KeyA', 'ArrowUp', 'KeyW'].includes(code)) { state.stageIndex = (state.stageIndex + STAGE_IDS.length - 1) % STAGE_IDS.length; Sound.play('move'); updateStageCards(); }
      else if (['ArrowRight', 'KeyD', 'ArrowDown', 'KeyS'].includes(code)) { state.stageIndex = (state.stageIndex + 1) % STAGE_IDS.length; Sound.play('move'); updateStageCards(); }
      else if (isEnter) confirmStage();
      else if (code === 'Escape') { Sound.play('back'); openSelect('cpu'); }
      else return;
      event.preventDefault();
    } else if (state.scene === 'vs') {
      if (isEnter) { event.preventDefault(); startFight(); }
      else if (code === 'Escape') { event.preventDefault(); Sound.play('back'); openStageSelect(); }
    } else if (state.scene === 'result') {
      if (isEnter) { event.preventDefault(); restart(); }
      else if (code === 'Escape') { event.preventDefault(); Sound.play('back'); goHome(); }
    }
  });
  window.addEventListener('keyup', event => {
    const action = KEYMAP[event.code];
    if (action) state.held[action] = false;
  });
  window.addEventListener('blur', () => { state.held = {}; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (state.scene === 'fight' || state.scene === 'street') && !state.paused) setPaused(true);
  });

  touchControls.querySelectorAll('[data-key]').forEach(button => {
    const action = KEYMAP[button.dataset.key];
    const press = event => { event.preventDefault(); if (action) state.held[action] = true; };
    const release = () => { if (action) state.held[action] = false; };
    button.addEventListener('pointerdown', press);
    ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture'].forEach(type => button.addEventListener(type, release));
    button.addEventListener('contextmenu', event => event.preventDefault());
  });
  on('touch-pause', 'click', () => setPaused(!state.paused));

  on('start-button', 'click', () => { Sound.play('confirm'); openSelect('player'); });
  on('select-back', 'click', backFromSelect);
  on('select-confirm', 'click', confirmSelect);
  on('vs-back', 'click', () => { Sound.play('back'); openStageSelect(); });
  on('vs-back-top', 'click', () => { Sound.play('back'); openStageSelect(); });
  const restart = () => { if (state.mode === 'street') startStreet(); else startFight(); };
  on('fight-button', 'click', startFight);
  on('rematch-button', 'click', restart);
  on('select-button', 'click', () => { Sound.play('confirm'); openSelect('player'); });
  on('menu-button', 'click', () => { Sound.play('back'); goHome(); });
  on('resume-button', 'click', () => setPaused(false));
  on('pause-menu', 'click', () => { Sound.play('back'); goHome(); });
  on('brand', 'click', goHome);

  const soundToggle = $('sound-toggle');
  const syncSound = () => {
    const on = Sound.enabled;
    soundToggle.setAttribute('aria-pressed', String(on));
    soundToggle.setAttribute('aria-label', on ? 'Desativar som' : 'Ativar som');
    setText('sound-label', on ? 'SOM ON' : 'SOM OFF');
    const waves = $('sound-waves');
    if (waves) waves.style.opacity = on ? '1' : '.25';
  };
  // Opções da tela CONTROLES: volumes, som e tela cheia automática (salvos no navegador).
  const opt = (id, fn) => { const el = $(id); if (el) el.addEventListener('input', () => fn(el)); return el; };
  const sfxSlider = opt('opt-sfx', el => { Sound.setVolume(Number(el.value) / 100); Sound.play('move'); });
  const musicSlider = opt('opt-music', el => Music.setVolume(Number(el.value) / 100));
  const soundCheck = opt('opt-sound', el => { Sound.setEnabled(el.checked); syncSound(); if (el.checked) { Music.play('title'); Sound.play('confirm'); } else Music.stop(); });
  let autoFullscreen = true;
  try { autoFullscreen = localStorage.getItem('manifight-fullscreen') !== 'off'; } catch (e) { /* ignorar */ }
  const fsCheck = opt('opt-fullscreen', el => { autoFullscreen = el.checked; try { localStorage.setItem('manifight-fullscreen', el.checked ? 'on' : 'off'); } catch (e) { /* ignorar */ } if (el.checked) requestFs(); });
  function requestFs() {
    const machine = $('machine');
    if (!document.fullscreenElement && machine && machine.requestFullscreen) machine.requestFullscreen().catch(() => {});
  }
  function syncOptions() {
    if (sfxSlider) sfxSlider.value = String(Math.round(Sound.volume * 100));
    if (musicSlider) musicSlider.value = String(Math.round(Music.volume * 100));
    if (soundCheck) soundCheck.checked = Sound.enabled;
    if (fsCheck) fsCheck.checked = autoFullscreen;
  }
  syncOptions();
  // Tela cheia automática: o navegador só permite após um gesto do usuário → primeiro Enter/clique.
  const firstGesture = () => { if (autoFullscreen) requestFs(); window.removeEventListener('keydown', firstGesture); window.removeEventListener('pointerdown', firstGesture); };
  window.addEventListener('keydown', firstGesture); window.addEventListener('pointerdown', firstGesture);

  soundToggle.addEventListener('click', () => {
    Sound.setEnabled(!Sound.enabled); syncSound();
    if (Sound.enabled) { Sound.play('confirm'); Music.play({ home: 'title', select: 'select', vs: 'versus', fight: 'fight', street: 'fight', result: 'win' }[state.scene] || 'title'); }
    else Music.stop();
  });
  syncSound();

  $('fullscreen').addEventListener('click', () => {
    const machine = $('machine');
    if (document.fullscreenElement) document.exitFullscreen?.();
    else if (machine.requestFullscreen) machine.requestFullscreen().catch(() => {});
  });

  // ---------------------------------------------------------------- RUA SP
  // Beat 'em up: câmera rola, ondas de inimigos, pastel de feira cura, vidas e score.
  function startStreet() {
    const conf = roster[state.playerIndex];
    state.street = new Street.Game(conf, typeof ENEMIES === 'undefined' ? [] : ENEMIES, typeof STAGES === 'undefined' ? [] : STAGES);
    state.match = null;
    state.held = {};
    state.accumulator = 0;
    state.target = null;
    state.streetBanner = '';
    state.ghost = [1, 1]; state.ghostHold = [0, 0];
    state.watch = { hp: [conf.stats?.vida || 1000], grounded: [true], dustTimer: [0], seen: new WeakSet(), lastAttack: [null], lastPhase: 'intro', enemyAttacks: new WeakMap() };
    setText('street-name', conf.nome);
    const portrait = $('street-portrait');
    if (portrait) drawPortrait(portrait, conf);
    show('street');
    Music.play('fight');
    updateStreetHud(0);
    announce(`Modo Rua. ${conf.nome} em São Paulo. Avance para a direita (D).`);
  }

  function updateStreetHud(dt) {
    const g = state.street;
    if (!g) return;
    const p = g.player, ratio = p.maxHp ? Math.max(0, p.hp / p.maxHp) : 0;
    const fill = $('street-health-fill'), ghostEl = $('street-health-ghost');
    if (fill) { fill.style.transform = `scaleX(${ratio.toFixed(4)})`; fill.classList.toggle('low', ratio <= .25); }
    if (state.ghost[0] > ratio) { if (state.ghostHold[0] > 0) state.ghostHold[0] -= dt; else state.ghost[0] = Math.max(ratio, state.ghost[0] - dt * 1.4); } else state.ghost[0] = ratio;
    if (ghostEl) ghostEl.style.transform = `scaleX(${state.ghost[0].toFixed(4)})`;
    setText('street-hp', `VIDA ${Math.ceil(p.hp)} / ${p.maxHp}`);
    const buffEl = $('street-buff');
    if (buffEl) { buffEl.hidden = !(g.buff > 0); if (g.buff > 0) buffEl.textContent = `DANO x1.5 · ${Math.ceil(g.buff)}s`; }
    setText('street-lives', '♥'.repeat(Math.max(0, g.lives)) + (g.lives ? '' : '—'));
    const meter = $('street-meter');
    if (meter) { const m = Math.max(0, Math.min(1, p.meter / Combat.METER_MAX)); meter.style.transform = `scaleX(${m.toFixed(3)})`; meter.parentElement.classList.toggle('full', m >= 1); }
    setText('street-score', String(g.score).padStart(6, '0'));
    setText('street-stage', `${g.stage.nome} · FASE ${g.stageIndex + 1}/${g.stages.length}`);
    const alive = g.alive();
    setText('street-left', alive.length ? `RESTAM ${alive.length}` : (g.locked ? '' : 'SIGA >>'));
    // alvo: último inimigo atingido (ou o mais próximo)
    let target = state.target && !state.target.dead && g.enemies.includes(state.target) ? state.target : g.nearest();
    const efill = $('street-enemy-fill');
    if (target) {
      setText('street-enemy-name', target.def.nome); setText('street-enemy-title', target.def.chefe ? 'CHEFE' : target.def.titulo || '');
      if (efill) efill.style.transform = `scaleX(${Math.max(0, target.hp / target.maxHp).toFixed(3)})`;
    } else { setText('street-enemy-name', '—'); setText('street-enemy-title', ''); if (efill) efill.style.transform = 'scaleX(0)'; }
    const go = $('street-go');
    if (go) go.hidden = !(g.phase === 'play' && !g.locked);
    const banner = $('street-banner');
    if (banner) {
      if (g.banner) {
        banner.hidden = false;
        const spoken = `${g.banner.title} ${g.banner.subtitle || ''}`.trim();
        if (spoken !== state.streetBanner) {
          state.streetBanner = spoken;
          setText('street-banner-title', g.banner.title); setText('street-banner-subtitle', g.banner.subtitle || '');
          banner.classList.remove('pop'); void banner.offsetWidth; banner.classList.add('pop');
          announce(spoken);
        }
      } else { banner.hidden = true; state.streetBanner = ''; }
    }
    flashLayer.style.opacity = state.flash.toFixed(3);
  }

  function reactToStreet(events) {
    const g = state.street, w = state.watch, p = g.player;
    spawnWorld = true;
    for (const effect of g.effects) {
      if (w.seen.has(effect)) continue;
      w.seen.add(effect);
      const attacker = effect.attackerRef, victim = effect.victimRef;
      const primary = attacker.config.palette?.primary || '#ff5560';
      if (attacker === p) state.target = victim;
      if (effect.parry) {
        sparks(effect.x, effect.y, ['#ffffff', '#9fd8ff', '#3fa0ff'], 22, 380, true); ring(effect.x, effect.y, '#9fd8ff', 110, .35);
        floatText(victim.x, victim.y - 165, 'PARRY!', '#7fd3ff', 30);
        state.hitstop = Math.max(state.hitstop, .1); state.flash = Math.max(state.flash, .25); Sound.play('parry');
      } else if (effect.blocked) {
        sparks(effect.x, effect.y, ['#ffffff', '#9fd8ff'], 8, 260); ring(effect.x, effect.y, '#9fd8ff', 34, .22);
        Sound.weapon('block', attacker.config.arma?.som); Sound.play('block');
      } else {
        const heavy = effect.type !== 'punch', special = effect.type === 'special';
        sparks(effect.x, effect.y, ['#ffffff', '#fff5b0', primary, '#ff9d3f'], special ? 36 : heavy ? 16 : 10, special ? 600 : heavy ? 400 : 290, heavy);
        ring(effect.x, effect.y, special ? '#ffd21e' : heavy ? '#ff674b' : '#ffffff', special ? 140 : heavy ? 64 : 40, special ? .5 : .28);
        slash(attacker.x + effect.facing * 30, attacker.y - 95, effect.facing, primary, attacker.moves[effect.type].range * .85);
        damageNumber(victim.x, victim.y - 150, effect.damage, effect.critical ? '#ff2d55' : victim === p ? '#ff674b' : '#d7ff3f');
        if (effect.critical) { floatText(victim.x, victim.y - 190, 'CRITICAL!', '#ff2d55', 32); Sound.play('critical'); state.hitstop = Math.max(state.hitstop, .1); }
        else if (effect.counter) floatText(victim.x, victim.y - 190, 'COUNTER!', '#ffd21e', 26);
        if (victim === p && Math.random() < (p.config.voz?.frequencia ?? .6)) Sound.voice('hurt', p.config.voz);
        else if (victim !== p && Math.random() < (victim.config.voz?.frequencia ?? .3)) Sound.voice('hurt', victim.config.voz);
        Sound.play(heavy ? 'heavy' : 'hit');
        Sound.weapon('hit', attacker.config.arma?.som, heavy);
        state.hitstop = Math.max(state.hitstop, special ? .14 : heavy ? .06 : .04);
      }
    }
    // gritos e sons de ataque (jogador e inimigos)
    for (const f of [p, ...g.enemies]) {
      const last = f === p ? w.lastAttack[0] : w.enemyAttacks.get(f);
      if (f.attack && f.attack !== last) {
        const heavy = f.attack.type !== 'punch';
        Sound.weapon('swing', f.config.arma?.som, heavy);
        if (Math.random() < (f.config.voz?.frequencia ?? .5) * (heavy ? 1 : .5)) Sound.voice('attack', f.config.voz);
      }
      if (f === p) w.lastAttack[0] = f.attack; else w.enemyAttacks.set(f, f.attack);
    }
    if (!w.grounded[0] && p.grounded) dust(p.x, p.y, 7, 70);
    w.grounded[0] = p.grounded;
    if (p.state === 'walk' && p.grounded) { w.dustTimer[0] -= 1 / 60; if (w.dustTimer[0] <= 0) { w.dustTimer[0] = .14; dust(p.x - p.facing * 14, p.y, 1, 20); } }
    for (const event of events) {
      switch (event) {
        case 'dash': Sound.play('dash'); dust(p.x - (p.dash ? p.dash.dir : p.facing) * 20, p.y, 8, 90); break;
        case 'doublejump': Sound.play('doublejump'); ring(p.x, p.y - 20, '#cfe3ff', 40, .25); break;
        case 'jump': Sound.play('jump'); break;
        case 'special': Sound.play('special'); state.slowmo = Math.max(state.slowmo, .4); state.flash = Math.max(state.flash, .35); { const u = [p, ...g.enemies].find(f => f.attack && f.attack.type === 'special'); if (u) { floatText(u.x, u.y - 200, 'SPECIAL!', '#ffd21e', 38); ring(u.x, u.y - 80, '#ffd21e', 120, .5); } } break;
        case 'enemydown': Sound.play('enemydown'); { const e = g.enemies.find(x => x.dead && x.deadTime === 0); if (e) { sparks(e.x, e.y - 80, ['#ffffff', '#ff674b', '#ffd21e'], 20, 400, true); floatText(e.x, e.y - 170, `+${e.def.pontos}`, '#ffd21e', 24); } } break;
        case 'bossdown': Sound.play('ko'); state.slowmo = 1; state.flash = .7; setTimeout(() => Sound.announce2('knockout'), 300); break;
        case 'item': {
          const kind = g.lastItem, label2 = kind === 'vida' ? '+VIDA' : kind === 'dano' ? 'DANO x1.5!' : 'ESPECIAL!';
          const color = kind === 'vida' ? '#ff5a6a' : kind === 'dano' ? '#ff9d1e' : '#c47bff';
          Sound.play(kind === 'dano' ? 'buff' : 'pastel');
          floatText(p.x, p.y - 175, label2, color, 26); ring(p.x, p.y - 80, color, 70, .35); sparks(p.x, p.y - 90, [color, '#ffffff'], 14, 260);
          break;
        }
        case 'buffend': floatText(p.x, p.y - 175, 'BUFF ACABOU', '#c9c9d6', 20); break;
        case 'go': Sound.play('go'); break;
        case 'wave': Sound.play('wave'); break;
        case 'stage': Music.play(g.stage.chefe ? 'final' : 'fight'); setTimeout(() => { if (state.street === g) Sound.announce('ready'); }, 400); break;
        case 'clear': Sound.play('jingle'); Sound.announce('winner'); break;
        case 'ko': Sound.play('ko'); Sound.voice('ko', p.config.voz); state.slowmo = 1; state.flash = .6; break;
        case 'respawn': Sound.announce('ready'); break;
        case 'gameover': finishStreet(false); break;
        case 'won': finishStreet(true); break;
        default: break;
      }
    }
    spawnWorld = false;
  }

  function finishStreet(won) {
    const g = state.street;
    state.result = { winner: g.player, loser: g.player, playerWon: won, mode: 'street', score: g.score };
    setText('result-kicker', won ? `SÃO PAULO LIMPA · ${g.kills} DERROTADOS` : `${g.stage.nome} · FASE ${g.stageIndex + 1}`);
    setText('result-heading', won ? 'SP LIMPA!' : 'GAME OVER');
    $('result-heading').classList.toggle('lose', !won);
    popResultHeading();
    state.resultAt = state.time;
    const quoteBox = $('win-quote'), continueBox = $('continue-box');
    if (quoteBox) { quoteBox.hidden = !won; setText('winner-name', `${g.player.config.nome} · ${String(g.score).padStart(6, '0')} PTS`); setText('winner-quote', won ? (g.player.config.frase || '') : ''); }
    if (continueBox) continueBox.hidden = won;
    state.continueTimer = 9.99; setText('continue-count', '9');
    setText('rematch-button', won ? 'JOGAR DE NOVO' : 'CONTINUE');
    const score = $('result-score'); score.textContent = ''; const sep = document.createElement('span'); sep.textContent = 'SCORE '; score.append(sep, String(g.score).padStart(6, '0'));
    show('result');
    if (won) { Music.play('win'); setTimeout(() => Sound.announce2('victory'), 900); } else { Music.stop(); setTimeout(() => Sound.announce('you_lose'), 350); }
    announce(won ? `Você limpou São Paulo. ${g.score} pontos.` : `Game over. ${g.score} pontos.`);
  }

  // Cenário de rua paulistana em rolagem: calçada, faixa, postes, placas, cones, pombos.
  const STAGE_TINT = ['rgba(255,190,90,.06)', 'rgba(255,120,80,.09)', 'rgba(60,90,200,.14)', 'rgba(255,220,120,.10)'];
  function drawStreetLayer(c, cam, stageIndex, t) {
    const g = state.street;
    c.fillStyle = STAGE_TINT[stageIndex % STAGE_TINT.length]; c.fillRect(0, 0, W, H);
    // calçada e guia
    c.fillStyle = '#5a5f66'; c.fillRect(0, 430, W, 14); c.fillStyle = '#8b9096'; c.fillRect(0, 430, W, 3);
    for (let x = -((cam) % 64); x < W; x += 64) { c.fillStyle = '#4a4f55'; c.fillRect(x, 433, 2, 11); }
    // asfalto com faixa tracejada
    c.fillStyle = 'rgba(20,24,30,.55)'; c.fillRect(0, 444, W, 96);
    for (let x = -((cam * 1) % 90); x < W; x += 90) { c.fillStyle = '#e8e2c4'; c.fillRect(x, 496, 46, 4); }
    c.fillStyle = '#c9b43a'; c.fillRect(0, 447, W, 3);
    // props do mundo (determinísticos por posição)
    const names = ['AV. PAULISTA', 'PRAÇA DA SÉ', 'MINHOCÃO', 'EST. DA LUZ'];
    for (let wx = Math.floor(cam / 320) * 320; wx < cam + W + 320; wx += 320) {
      const sx = wx - cam, kind = Math.abs(Math.round(wx / 320)) % 4;
      if (kind === 0) { // poste com placa da rua
        c.fillStyle = '#1b2028'; c.fillRect(sx, 230, 8, 212); c.fillStyle = '#2f3742'; c.fillRect(sx - 6, 226, 20, 8);
        c.fillStyle = '#0d5fb5'; c.fillRect(sx + 8, 262, 118, 22); c.fillStyle = '#fff'; c.fillRect(sx + 8, 262, 118, 2);
        label(c, names[stageIndex % names.length], sx + 14, 279, 12, '#ffffff');
        const glow = c.createRadialGradient(sx + 4, 236, 4, sx + 4, 236, 70); glow.addColorStop(0, 'rgba(255,230,160,.35)'); glow.addColorStop(1, 'rgba(255,230,160,0)'); c.fillStyle = glow; c.fillRect(sx - 70, 170, 148, 140);
      } else if (kind === 1) { // ponto de ônibus
        c.fillStyle = '#26303a'; c.fillRect(sx, 300, 6, 142); c.fillRect(sx + 120, 300, 6, 142); c.fillStyle = '#c9101a'; c.fillRect(sx - 8, 292, 142, 10);
        c.fillStyle = 'rgba(120,180,220,.25)'; c.fillRect(sx + 6, 302, 114, 100); label(c, 'SPTRANS', sx + 20, 330, 11, '#ffffff');
      } else if (kind === 2) { // cones e lixeira
        [0, 34].forEach(o => { c.fillStyle = '#ff7a1a'; c.beginPath(); c.moveTo(sx + o + 10, 410); c.lineTo(sx + o + 20, 442); c.lineTo(sx + o, 442); c.closePath(); c.fill(); c.fillStyle = '#fff'; c.fillRect(sx + o + 5, 428, 10, 4); });
        c.fillStyle = '#2f7d3a'; c.fillRect(sx + 90, 404, 26, 38); c.fillStyle = '#1f5a28'; c.fillRect(sx + 88, 400, 30, 6);
      } else { // grafite e pombos
        c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(sx, 340, 160, 90);
        label(c, 'SP', sx + 20, 410, 54, '#ff2d3a'); label(c, 'MANI BATTLE', sx + 22, 366, 14, '#39ff88');
        for (let i = 0; i < 3; i++) { const bx = sx + 30 + i * 40 + Math.sin(t * 3 + i) * 3, by = 424 + (Math.sin(t * 7 + i * 2) > .8 ? -3 : 0); c.fillStyle = '#7d8590'; c.fillRect(bx, by, 10, 7); c.fillStyle = '#a5adb8'; c.fillRect(bx + 8, by - 4, 6, 5); c.fillStyle = '#ffb347'; c.fillRect(bx + 14, by - 2, 3, 2); }
      }
    }
    // placa de saída no fim da fase
    const endX = (g ? g.stage.comprimento : 0) - 60 - cam;
    if (endX > -80 && endX < W + 80) { c.fillStyle = '#0d5fb5'; c.fillRect(endX - 22, 300, 44, 44); c.fillStyle = '#fff'; c.fillRect(endX - 18, 304, 36, 36); label(c, 'M', endX, 334, 30, '#0d5fb5', 'center'); c.fillStyle = '#1b2028'; c.fillRect(endX - 3, 344, 6, 98); }
  }
  // Item RD: símbolo girando e flutuando; cor por tipo (vida / dano / especial).
  const ITEM_COLOR = { vida: '#ff3b4a', dano: '#ff9d1e', especial: '#c47bff' }, ITEM_LABEL = { vida: 'HP', dano: 'DMG', especial: 'SP' };
  function drawItem(c, it, t) {
    const bob = Math.sin(t * 4 + it.x) * 5, color = ITEM_COLOR[it.type] || '#ff3b4a', spin = Math.abs(Math.cos(t * 2.2 + it.x * .01));
    c.save(); c.translate(it.x, it.y - 34 + bob);
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(0, 34 - bob, 16, 5, 0, 0, Math.PI * 2); c.fill();
    const glow = c.createRadialGradient(0, 0, 4, 0, 0, 34); glow.addColorStop(0, color + 'aa'); glow.addColorStop(1, color + '00'); c.fillStyle = glow; c.fillRect(-34, -34, 68, 68);
    c.scale(.35 + spin * .65, 1); // "gira" no eixo vertical
    drawRdSymbol(c, 0, 0, 16, color, 1);
    c.restore();
    label(c, ITEM_LABEL[it.type] || '', it.x, it.y - 56 + bob, 11, '#ffffff', 'center');
  }
  // Primeiro plano (parallax rápido, silhuetas escuras) e piso em perspectiva.
  function drawStreetForeground(c, cam, t) {
    const speed = 1.45;
    for (let wx = Math.floor(cam * speed / 520) * 520; wx < cam * speed + W + 520; wx += 520) {
      const sx = wx - cam * speed, kind = Math.abs(Math.round(wx / 520)) % 3;
      c.fillStyle = 'rgba(6,8,14,.82)';
      if (kind === 0) { c.fillRect(sx, 200, 14, 340); c.fillRect(sx - 14, 196, 42, 12); }              // poste próximo
      else if (kind === 1) { for (let i = 0; i < 6; i++) c.fillRect(sx + i * 22, 470, 8, 70); c.fillRect(sx - 6, 466, 140, 8); } // grade
      else { c.fillRect(sx, 480, 26, 60); c.fillRect(sx - 6, 474, 38, 10); }                          // hidrante/caixa
    }
  }
  function drawFloorGrid(c, cam) {
    c.save(); c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 1.5;
    const vpX = W / 2, vpY = 300;
    for (let wx = -((cam * 1.15) % 160) - 160; wx < W + 320; wx += 160) {
      c.beginPath(); c.moveTo(wx, H); c.lineTo(vpX + (wx - vpX) * .28, GROUND + 6); c.stroke();
    }
    c.restore();
  }
  // Vida do jogador flutuando sobre a cabeça (verde), com número.
  function drawPlayerBar(c, p) {
    const fr = spriteFrame(p), h = fr ? fr.altura * fr.scale : 130;
    const x = p.x - 36, y = p.y - h - 22, ratio = Math.max(0, p.hp / p.maxHp);
    c.fillStyle = '#000'; c.fillRect(x - 1, y - 1, 74, 9);
    c.fillStyle = '#3a0d0d'; c.fillRect(x, y, 72, 7);
    c.fillStyle = ratio > .3 ? '#39d27a' : '#ff5560'; c.fillRect(x, y, Math.round(72 * ratio), 7);
    label(c, `${Math.ceil(p.hp)}`, p.x, y - 4, 11, '#ffffff', 'center');
  }
  function drawEnemyBar(c, e) {
    if (e.dead || e.hp >= e.maxHp) return;
    const fr = spriteFrame(e), h = fr ? fr.altura * fr.scale : 130;
    const x = e.x - 32, y = e.y - h - 16;
    c.fillStyle = '#000'; c.fillRect(x - 1, y - 1, 66, 8);
    c.fillStyle = '#5a0d0d'; c.fillRect(x, y, 64, 6);
    c.fillStyle = e.def.chefe ? '#ffd21e' : '#ff5560'; c.fillRect(x, y, Math.round(64 * Math.max(0, e.hp / e.maxHp)), 6);
  }
  function renderStreet(c) {
    const g = state.street, t = state.time, cam = g.camX;
    c.save();
    if (g.shake > 0 && !state.paused) c.translate((Math.random() - .5) * g.shake * 2, (Math.random() - .5) * g.shake);
    // Câmera 2.5D: zoom ancorado no chão, centrado no foco da ação.
    const fx = Math.max(W * .3, Math.min(W * .7, g.focusX - cam)), fy = GROUND + 40;
    c.translate(fx, fy); c.scale(g.zoom, g.zoom); c.translate(-fx, -fy);
    const ox = -((cam * .35) % W);
    c.save(); c.translate(ox, 0); Art.stage(c, t, 'fight'); c.translate(W, 0); Art.stage(c, t, 'fight'); c.restore();
    drawStreetLayer(c, cam, g.stageIndex, t);
    drawFloorGrid(c, cam);
    drawParticles(c, 'back');
    c.save(); c.translate(-cam, 0);
    drawParticles(c, 'back', true);
    g.items.forEach(it => drawItem(c, it, t));
    const order = [...g.enemies].sort((a, b) => Number(!!b.dead) - Number(!!a.dead) || a.x - b.x);
    for (const e of order) { if (e.dead) { e.alpha = Math.max(0, 1 - Math.max(0, e.deadTime - .8) / 1); } drawFighter(c, e, t); drawEnemyBar(c, e); }
    if (g.player.invuln > .2 && Math.floor(t * 16) % 2) c.globalAlpha = .45;
    if (g.buff > 0) { const aura = c.createRadialGradient(g.player.x, g.player.y - 70, 10, g.player.x, g.player.y - 70, 110); aura.addColorStop(0, 'rgba(255,157,30,.28)'); aura.addColorStop(1, 'rgba(255,157,30,0)'); c.fillStyle = aura; c.fillRect(g.player.x - 110, g.player.y - 180, 220, 200); }
    drawFighter(c, g.player, t);
    c.globalAlpha = 1;
    drawPlayerBar(c, g.player);
    [g.player, ...g.enemies].forEach(f => drawFighterFx(c, f));
    drawParticles(c, 'front', true);
    c.restore();
    drawStreetForeground(c, cam, t);
    drawParticles(c, 'front');
    if (g.player.combo >= 2 && g.player.comboTime > 0) comboLabel(c, g.player.combo, g.player.comboTime, 34, 196, 'left', '#2ee6c8');
    c.restore();
  }

  // ----------------------------------------------------------------- RENDER
  const label = (c, text, x, y, size, color, align = 'left') => {
    c.font = FONT.replace('%s', size); c.textAlign = align; c.textBaseline = 'alphabetic';
    c.fillStyle = '#000'; c.fillText(text, x + 3, y + 3);
    c.fillStyle = color; c.fillText(text, x, y);
  };
  // Contador de combo estilo kit: número grande inclinado + "hits" pequeno.
  function comboLabel(c, combo, comboTime, x, y, align, color) {
    const bump = 1 + Math.max(0, comboTime - .9) * 2.5, size = Math.round(46 * bump);
    c.save(); c.translate(x, y); c.transform(1, 0, -.18, 1, 0, 0);
    label(c, String(combo), 0, 0, size, color, align);
    c.font = FONT.replace('%s', size);
    const w = c.measureText(String(combo)).width;
    label(c, 'hits', align === 'left' ? w + 10 : -w - 10, 0, 18, '#ffffff', align);
    c.restore();
  }

  // Rastro da arma durante os quadros ativos e escudo de guarda.
  function drawFighterFx(c, f) {
    const primary = f.config.palette?.primary || '#d7ff3f';
    const attack = f.attack;
    if (attack && !attack.hit && attack.elapsed >= attack.move.startup && attack.elapsed < attack.move.startup + attack.move.active) {
      const k = (attack.elapsed - attack.move.startup) / attack.move.active;
      c.save();
      c.translate(f.x + f.facing * 18, f.y - (attack.stance === 'crouch' ? 55 : 98));
      c.scale(f.facing, 1);
      c.globalAlpha = .75 - k * .4;
      c.strokeStyle = attack.type === 'special' ? '#ffd21e' : primary; c.lineWidth = attack.type === 'special' ? 14 : attack.type === 'kick' ? 9 : 6; c.lineCap = 'round';
      c.beginPath(); c.arc(0, 0, attack.move.range * .82, -1.2 + k * 1.1, -.2 + k * 1.3); c.stroke();
      c.globalAlpha = .9 - k * .5; c.strokeStyle = '#ffffff'; c.lineWidth = 2;
      c.beginPath(); c.arc(0, 0, attack.move.range * .78, -1.1 + k * 1.1, -.3 + k * 1.3); c.stroke();
      c.restore();
    }
    if (f.blocking) {
      c.save();
      c.translate(f.x + f.facing * 26, f.y - 68);
      c.scale(f.facing, 1);
      const glow = c.createRadialGradient(0, 0, 10, 0, 0, 62);
      glow.addColorStop(0, 'rgba(159,216,255,.35)'); glow.addColorStop(1, 'rgba(159,216,255,0)');
      c.fillStyle = glow; c.beginPath(); c.arc(0, 0, 62, -1.4, 1.4); c.lineTo(0, 0); c.closePath(); c.fill();
      c.strokeStyle = '#bfe6ff'; c.lineWidth = 3; c.globalAlpha = .8 + Math.sin(state.time * 30) * .15;
      c.beginPath(); c.arc(0, 0, 56, -1.25, 1.25); c.stroke();
      c.restore();
    }
  }

  function renderFight(c) {
    const m = state.match, t = state.time;
    const shake = state.paused ? 0 : m.shake;
    c.save();
    // Zoom curto no nocaute, centrado em quem caiu.
    if (m.phase === 'roundover' && m.phaseTime < 1.4) {
      const k = Math.min(1, m.phaseTime / .25) * (1 - Math.max(0, (m.phaseTime - .9) / .5));
      const target = m.fighters.find(f => f.hp <= 0) || m.fighters[0];
      const fx = Math.max(200, Math.min(W - 200, target.x)), fy = target.y - 80, zoom = 1 + .22 * k;
      c.translate(fx, fy); c.scale(zoom, zoom); c.translate(-fx, -fy);
    }
    if (shake > 0) c.translate((Math.random() - .5) * shake * 2, (Math.random() - .5) * shake);
    (Art.stages[state.stageId] || Art.stages.rooftop).draw(c, t, 'fight');
    drawParticles(c, 'back');
    // Quem sofre o golpe fica atrás; o atacante lê melhor por cima.
    const order = m.fighters[0].hitstun > 0 && m.fighters[1].hitstun <= 0 ? [0, 1] : [1, 0];
    order.forEach(i => drawFighter(c, m.fighters[i], t));
    m.fighters.forEach(f => drawFighterFx(c, f));
    drawParticles(c);
    m.fighters.forEach((fighter, i) => {
      if (fighter.combo >= 2 && fighter.comboTime > 0) comboLabel(c, fighter.combo, fighter.comboTime, i === 0 ? 34 : W - 34, 178, i === 0 ? 'left' : 'right', i === 0 ? '#2ee6c8' : '#ff674b');
    });
    c.restore();
  }

  // Fundo carmim da seleção, no canvas, para os lutadores ficarem na frente dele.
  // Fundo da seleção: fogo vermelho/laranja, alambrado (chain-link), brilho central e escurecimento.
  function drawSelectBackdrop(c, t = state.time) {
    const g = c.createRadialGradient(W / 2, H * .45, 30, W / 2, H * .45, W * .8);
    g.addColorStop(0, '#c22a12'); g.addColorStop(.35, '#7a1010'); g.addColorStop(1, '#1a0404');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // labaredas suaves se movendo
    c.save(); c.globalAlpha = .18;
    for (let i = 0; i < 6; i++) {
      const fx = ((i * 173 + t * 40 * (i % 2 ? 1 : -1)) % (W + 200) + W + 200) % (W + 200) - 100, fy = 420 - Math.sin(t * 1.3 + i) * 40;
      const fl = c.createRadialGradient(fx, fy, 10, fx, fy, 160); fl.addColorStop(0, '#ffb347'); fl.addColorStop(1, 'rgba(255,120,40,0)');
      c.fillStyle = fl; c.fillRect(fx - 160, fy - 160, 320, 320);
    }
    c.restore();
    // alambrado: losangos diagonais com brilho e sombra
    c.save(); c.lineWidth = 1.5;
    for (let k = -H; k < W + H; k += 46) {
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.moveTo(k + 1, 40); c.lineTo(k + 1 - 400, 440); c.stroke();
      c.strokeStyle = 'rgba(255,220,180,.16)'; c.beginPath(); c.moveTo(k, 40); c.lineTo(k - 400, 440); c.stroke();
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.moveTo(k + 1, 40); c.lineTo(k + 1 + 400, 440); c.stroke();
      c.strokeStyle = 'rgba(255,220,180,.16)'; c.beginPath(); c.moveTo(k, 40); c.lineTo(k + 400, 440); c.stroke();
    }
    c.fillStyle = 'rgba(40,10,5,.85)'; c.fillRect(0, 36, W, 6); c.fillRect(0, 438, W, 6);
    c.restore();
    const core = c.createRadialGradient(W / 2, 260, 20, W / 2, 260, 380); core.addColorStop(0, 'rgba(255,170,60,.28)'); core.addColorStop(1, 'rgba(255,170,60,0)');
    c.fillStyle = core; c.fillRect(0, 0, W, H);
    const floor = c.createLinearGradient(0, 300, 0, H); floor.addColorStop(0, 'rgba(0,0,0,0)'); floor.addColorStop(1, 'rgba(0,0,0,.7)');
    c.fillStyle = floor; c.fillRect(0, 300, W, H - 300);
  }

  // Fundo da tela VS: painéis azul (1P) e vermelho (CPU) com corte diagonal e listras.
  function drawVersusBackdrop(c, t) {
    const cut = W * .12, mid = W / 2;
    c.fillStyle = '#0b2a66';
    c.beginPath(); c.moveTo(0, 0); c.lineTo(mid + cut, 0); c.lineTo(mid - cut, H); c.lineTo(0, H); c.closePath(); c.fill();
    c.fillStyle = '#7a0c14';
    c.beginPath(); c.moveTo(mid + cut, 0); c.lineTo(W, 0); c.lineTo(W, H); c.lineTo(mid - cut, H); c.closePath(); c.fill();
    const glowL = c.createRadialGradient(250, 300, 20, 250, 300, 330), glowR = c.createRadialGradient(W - 250, 300, 20, W - 250, 300, 330);
    glowL.addColorStop(0, 'rgba(80,150,255,.45)'); glowL.addColorStop(1, 'rgba(80,150,255,0)');
    glowR.addColorStop(0, 'rgba(255,90,80,.45)'); glowR.addColorStop(1, 'rgba(255,90,80,0)');
    c.fillStyle = glowL; c.fillRect(0, 0, W, H); c.fillStyle = glowR; c.fillRect(0, 0, W, H);
    // Listras de velocidade diagonais correndo para o centro.
    c.save();
    c.globalAlpha = .12; c.strokeStyle = '#fff'; c.lineWidth = 3;
    const shift = (t * 260) % 44;
    for (let i = -12; i < 34; i++) {
      const x = i * 44 + shift;
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x - cut * 2, H); c.stroke();
    }
    c.restore();
    // Faixa branca do corte.
    c.fillStyle = '#fff';
    c.beginPath(); c.moveTo(mid + cut - 6, 0); c.lineTo(mid + cut + 8, 0); c.lineTo(mid - cut + 8, H); c.lineTo(mid - cut - 6, H); c.closePath(); c.fill();
    c.fillStyle = '#000';
    c.beginPath(); c.moveTo(mid + cut + 8, 0); c.lineTo(mid + cut + 12, 0); c.lineTo(mid - cut + 12, H); c.lineTo(mid - cut + 8, H); c.closePath(); c.fill();
    // Pinceladas de "tinta" atrás de cada lutador (diagonais largas, tom do painel).
    const brush = (x, y, color, dir) => {
      c.save(); c.translate(x, y); c.rotate(-.35 * dir); c.fillStyle = color;
      c.beginPath(); c.moveTo(-260, -40); c.quadraticCurveTo(-120, -110, 60, -70); c.quadraticCurveTo(230, -40, 280, 30); c.quadraticCurveTo(120, 90, -80, 60); c.quadraticCurveTo(-220, 40, -260, -40); c.closePath(); c.fill();
      for (let i = 0; i < 9; i++) { const a = i * .7 + dir, r = 150 + (i % 3) * 60; c.beginPath(); c.arc(Math.cos(a) * r, Math.sin(a) * r * .5, 6 + (i % 4) * 4, 0, Math.PI * 2); c.fill(); }
      c.restore();
    };
    brush(250, 330, 'rgba(60,130,255,.28)', 1); brush(W - 250, 330, 'rgba(255,80,70,.28)', -1);
    brush(230, 380, 'rgba(10,25,70,.45)', -1); brush(W - 230, 380, 'rgba(70,5,10,.45)', 1);
    // Raios girando atrás do VS.
    c.save(); c.translate(W / 2, H * .46); c.rotate(t * .35); c.globalAlpha = .09;
    for (let i = 0; i < 16; i++) { c.rotate(Math.PI * 2 / 16); c.fillStyle = i % 2 ? '#ffd21e' : '#ffffff'; c.beginPath(); c.moveTo(0, 0); c.lineTo(760, -34); c.lineTo(760, 34); c.closePath(); c.fill(); }
    c.restore();
    const core = c.createRadialGradient(W / 2, H * .46, 10, W / 2, H * .46, 220);
    core.addColorStop(0, 'rgba(255,230,150,.35)'); core.addColorStop(1, 'rgba(255,230,150,0)');
    c.fillStyle = core; c.fillRect(0, 0, W, H);
    // Chão escuro.
    const floor = c.createLinearGradient(0, GROUND - 40, 0, H);
    floor.addColorStop(0, 'rgba(0,0,0,0)'); floor.addColorStop(1, 'rgba(0,0,0,.75)');
    c.fillStyle = floor; c.fillRect(0, GROUND - 40, W, H - GROUND + 40);
  }

  function render() {
    const c = ctx, t = state.time;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, H);
    switch (state.scene) {
      case 'controls':
      case 'home': {
        Art.stage(c, t, 'home');
        drawParticles(c, 'back');
        // Home limpa: escurece o palco e revela um personagem por vez sob um holofote.
        if (state.scene === 'home') {
          c.fillStyle = 'rgba(2,4,10,.74)'; c.fillRect(0, 0, W, H);
          const reveal = featureReveal(), x = 700, conf = roster[state.featured];
          if (reveal > 0) {
            // cone de luz vindo do alto + poça de luz no chão
            c.save(); c.globalAlpha = reveal;
            const cone = c.createLinearGradient(x, 0, x, GROUND + 20);
            cone.addColorStop(0, 'rgba(255,240,200,.55)'); cone.addColorStop(1, 'rgba(255,240,200,.06)');
            c.fillStyle = cone; c.beginPath(); c.moveTo(x - 22, -10); c.lineTo(x + 22, -10); c.lineTo(x + 150, GROUND + 24); c.lineTo(x - 150, GROUND + 24); c.closePath(); c.fill();
            const pool = c.createRadialGradient(x, GROUND + 18, 10, x, GROUND + 18, 170);
            pool.addColorStop(0, 'rgba(255,235,190,.5)'); pool.addColorStop(1, 'rgba(255,235,190,0)');
            c.fillStyle = pool; c.save(); c.translate(x, GROUND + 18); c.scale(1, .28); c.translate(-x, -(GROUND + 18)); c.beginPath(); c.arc(x, GROUND + 18, 170, 0, Math.PI * 2); c.fill(); c.restore();
            c.restore();
          }
          drawFighter(c, ghost(conf, x, -1, 'idle', { stateTime: t, brightness: reveal }), t, 1.9);
        }
        drawParticles(c);
        break;
      }
      case 'select': {
        drawSelectBackdrop(c);
        drawParticles(c, 'back');
        {
          // Bustos gigantes (pés abaixo da tela), como na referência de seleção.
          const left = state.selectPhase === 'player' ? roster[state.cursor] : roster[state.playerIndex];
          // Bem grandes e altos: cabeça encostando no topo, corpo cortado pelos cards.
          if (left) drawFighter(c, ghost(left, 255, 1, 'idle', { stateTime: t, y: 660 + Math.sin(t * 1.4) * 4, noShadow: true }), t, 4.8);
          const right = state.selectPhase === 'cpu' ? roster[state.cursor] : null;
          if (right) drawFighter(c, ghost(right, W - 255, -1, 'idle', { stateTime: t + .7, y: 660 - Math.sin(t * 1.4) * 4, noShadow: true }), t + .7, 4.8);
          else { c.save(); c.globalAlpha = .18; c.fillStyle = '#000'; c.beginPath(); c.ellipse(W - 250, 330, 140, 250, 0, 0, Math.PI * 2); c.fill(); c.restore(); label(c, '?', W - 250, 380, 150, 'rgba(255,255,255,.18)', 'center'); }
        }
        drawParticles(c);
        break;
      }
      case 'vs': {
        drawVersusBackdrop(c, t);
        drawParticles(c, 'back');
        // Bustos gigantes entrando das laterais (pés abaixo da tela), com "overshoot" de fliperama.
        const k = Math.min(1, state.vsAnim / .55), ease = 1 - Math.pow(1 - k, 3), over = Math.sin(k * Math.PI) * 18;
        const px = -320 + (255 + 320) * ease + over, cx = W + 320 - (255 + 320) * ease - over;
        const breathe = Math.sin(t * 1.6) * 4;
        drawFighter(c, ghost(roster[state.playerIndex], px, 1, 'idle', { stateTime: t, noShadow: true, y: 610 + breathe }), t, 3.4);
        drawFighter(c, ghost(roster[state.cpuIndex ?? 0], cx, -1, 'idle', { stateTime: t + 1.3, noShadow: true, y: 610 - breathe }), t + 1.3, 3.4);
        if (k >= 1 && !state.vsBoom) { state.vsBoom = true; ring(W / 2, H * .46, '#ffd21e', 260, .6); sparks(W / 2, H * .46, ['#ffd21e', '#ffffff', '#ff9d3f'], 40, 700, true); state.flash = Math.max(state.flash, .3); Sound.play('special'); }
        if (state.vsAnim < .7) { c.fillStyle = `rgba(255,255,255,${(1 - state.vsAnim / .7) * .35})`; c.fillRect(0, 0, W, H); }
        drawParticles(c);
        break;
      }
      case 'fight': renderFight(c); break;
      case 'street': renderStreet(c); break;
      case 'stage': {
        // prévia da arena selecionada ao fundo, escurecida
        (Art.stages[state.stageId] || Art.stages.rooftop).draw(c, t, 'fight');
        c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, 0, W, H);
        drawParticles(c, 'back'); drawParticles(c);
        break;
      }
      case 'result': {
        if (state.result && state.result.mode !== 'street') (Art.stages[state.stageId] || Art.stages.rooftop).draw(c, t, 'home'); else Art.stage(c, t, 'home');
        c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, 0, W, H);
        drawParticles(c, 'back');
        const r = state.result;
        if (r) {
          const k = Math.min(1, (t - (state.resultAt || 0)) / .9), ease = 1 - Math.pow(1 - k, 3);
          drawSpotlight(c, W / 2, 300, t, ease);
          if (r.mode !== 'street' && r.loser !== r.winner) drawFighter(c, ghost(r.loser.config, 800, -1, 'ko', { stateTime: 3, alpha: .55 }), t, 1.1);
          drawFighter(c, ghost(r.winner.config, W / 2, 1, 'idle', { stateTime: t, y: GROUND + 20, noShadow: true }), t, 1.6 + .85 * ease);
          if (k < 1) { c.fillStyle = `rgba(255,255,255,${((1 - k) * .35).toFixed(3)})`; c.fillRect(0, 0, W, H); }
        }
        drawParticles(c);
        break;
      }
      default: break;
    }
  }

  // ------------------------------------------------------------------- LOOP
  let last = performance.now();
  function frame(now) {
    const delta = Math.min(.1, Math.max(0, (now - last) / 1000));
    last = now;
    state.time += delta;
    if (portraitsDirty) { portraitsDirty = false; redrawPortraits(); }
    state.flash = Math.max(0, state.flash - delta * 2.2);
    state.emberTimer -= delta;
    if (state.emberTimer <= 0) { state.emberTimer = state.scene === 'fight' ? .07 : .16; ember(); }
    if (state.scene !== 'vs') ambient(); // no VS a ambiência é tratada no ramo da cena
    let particleDelta = delta;

    if (state.scene === 'fight' && state.match && !state.paused) {
      // Hit-stop congela a simulação; câmera lenta a desacelera. Menus não sofrem.
      let simDelta = delta;
      if (state.hitstop > 0) { state.hitstop -= delta; simDelta = 0; particleDelta = delta * .35; }
      else if (state.slowmo > 0) { state.slowmo -= delta; simDelta = delta * .3; particleDelta = delta * .5; }
      state.accumulator += simDelta;
      while (state.accumulator >= STEP) {
        state.match.update(STEP, state.held);
        state.accumulator -= STEP;
      }
      reactToMatch(state.match.drainEvents());
      updateHud(delta);
      if (state.match.phase === 'finished') finishMatch();
    } else if (state.scene === 'street' && state.street && !state.paused) {
      let simDelta = delta;
      if (state.hitstop > 0) { state.hitstop -= delta; simDelta = 0; particleDelta = delta * .35; }
      else if (state.slowmo > 0) { state.slowmo -= delta; simDelta = delta * .3; particleDelta = delta * .5; }
      state.accumulator += simDelta;
      while (state.accumulator >= STEP) { state.street.update(STEP, state.held); state.accumulator -= STEP; }
      reactToStreet(state.street.drainEvents());
      if (state.scene === 'street') updateStreetHud(delta);
    } else if (state.scene === 'vs') {
      state.vsAnim += delta;
      state.vsTimer -= delta;
      const bar = $('vs-progress');
      if (bar) bar.style.transform = `scaleX(${Math.max(0, Math.min(1, state.vsTimer / 4.6)).toFixed(3)})`;
      // partículas por lado: azuis à esquerda, vermelhas à direita, subindo; névoa embaixo.
      if (Math.random() < .7) { const left = Math.random() < .5; spawn({ type: 'ember', x: left ? rand(20, 440) : rand(520, W - 20), y: rand(300, 520), vx: rand(-10, 10), vy: rand(-90, -30), maxLife: rand(1, 2.2), size: rand(2, 4), color: left ? pick(['#7fb3ff', '#3fa0ff', '#cfe3ff']) : pick(['#ff7a70', '#ff3b3b', '#ffd0c8']) }); }
      ambient();
      if (state.vsTimer <= 0) startFight();
    } else if (state.scene === 'home') {
      // painel do título reveza logo e cruz ASCII
      state.panelTimer += delta;
      if (state.panelTimer >= 3.6) { state.panelTimer = 0; const panel = $('logo-panel'); if (panel) panel.classList.toggle('ascii'); }
      state.featuredTimer += delta;
      if (state.featuredTimer >= FEATURE_PERIOD) {
        state.featuredTimer = 0;
        state.featured = (state.featured + 1) % roster.length;
        updateFeatured();
      }
      // nome só depois da revelação completa (sem spoiler); some junto com o apagão
      const lbl = $('featured-name') && $('featured-name').parentElement, lt = state.featuredTimer;
      if (lbl) lbl.style.opacity = (lt < 1.85 || lt > FEATURE_PERIOD - .5) ? '0' : Math.min(1, (lt - 1.85) / .3).toFixed(2);
    } else if (state.scene === 'result' && state.result) {
      // brilho dourado em volta do vencedor (MVP)
      if (Math.random() < .6) spawn({ type: 'spark', x: W / 2 + rand(-110, 110), y: rand(120, GROUND + 10), vx: rand(-15, 15), vy: rand(-70, -25), maxLife: rand(.6, 1.1), gravity: -15, drag: .99, size: rand(2, 4), color: pick(['#ffd21e', '#ffffff', '#ffe9a0']) });
      if (state.time - (state.resultAt || 0) < .12 && Math.random() < .9) sparks(W / 2, 300, ['#ffd21e', '#ffffff', '#ff9d3f'], 6, 520, true);
      if (state.result.playerWon) { if (Math.random() < .35) confetti(); }
      else {
        // Contagem clássica de CONTINUE. Zero devolve ao título.
        state.continueTimer -= delta;
        setText('continue-count', String(Math.max(0, Math.ceil(state.continueTimer))));
        if (state.continueTimer <= 0) { Sound.announce2('game_over'); goHome(); }
      }
    }
    if (state.scene === 'fight' || state.scene === 'street') flashLayer.style.opacity = state.flash.toFixed(3);
    else if (flashLayer.style.opacity !== '0') flashLayer.style.opacity = '0';
    updateParticles(particleDelta);
    render();
    requestAnimationFrame(frame);
  }

  goHome();
  requestAnimationFrame(frame);
  return { state, roster };
})();
