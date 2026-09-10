// STREET — modo "Rua SP" (beat 'em up): o jogador avança pela cidade, a câmera rola e
// ondas de inimigos aparecem. Reaproveita o Fighter do Combat (física, golpes, defesa,
// parry, especial). Sem imagens nem interface aqui: só simulação e eventos.
const Street = (() => {
  'use strict';
  const { Fighter, GROUND, overlap } = Combat;
  const W = 960, VIEW_PAD = 30, LIVES = 3, ITEM_CHANCE = 0.24, ITEM_HEAL = 220, BUFF_TIME = 12, BUFF_POWER = 1.5;
  // Itens RD: vida (cura), dano (buff x1.5) e especial (barra cheia).
  const ITEM_TYPES = ['vida', 'vida', 'dano', 'dano', 'especial'];
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  class Game {
    constructor(playerConfig, enemyDefs, stages) {
      this.player = new Fighter(playerConfig, 0);
      this.enemyDefs = Object.fromEntries(enemyDefs.map(e => [e.id, e]));
      this.stages = stages;
      this.events = [];
      this.emit = event => this.events.push(event);
      this.lives = LIVES;
      this.score = 0;
      this.kills = 0;
      this.time = 0;
      this.shake = 0;
      this.effects = [];
      this.items = [];
      this.enemies = [];
      this.basePower = this.player.power;
      this.buff = 0;           // segundos restantes do buff de dano
      this.lastItem = null;
      this.zoom = 1;           // câmera 2.5D: zoom dinâmico e ponto de foco
      this.focusX = W / 2;
      this.startStage(0);
    }

    startStage(index) {
      this.stageIndex = index;
      this.stage = this.stages[index];
      this.camX = 0;
      this.waveIndex = -1;
      this.locked = false;
      this.phase = 'intro';
      this.phaseTime = 0;
      this.banner = { title: this.stage.nome, subtitle: `FASE ${index + 1} · SÃO PAULO` };
      this.enemies = [];
      this.items = [];
      const p = this.player, hp = p.hp, meter = p.meter;
      p.reset();
      p.x = 200;
      p.facing = 1;
      p.hp = index === 0 ? p.maxHp : Math.min(p.maxHp, hp + Math.round(p.maxHp * 0.3)); // recupera 30% entre fases
      p.meter = meter;
      // Ondas distribuídas ao longo da fase; a última fica antes do fim.
      const n = this.stage.ondas.length, span = this.stage.comprimento - 900;
      this.checkpoints = this.stage.ondas.map((_, k) => 480 + Math.round(span * (k + 1) / (n + 1)));
      this.emit('stage');
    }

    spawnWave(k) {
      const ids = this.stage.ondas[k];
      ids.forEach((id, i) => {
        const def = this.enemyDefs[id];
        if (!def) return;
        const e = new Fighter(def, 1);
        e.reset();
        const fromRight = i % 2 === 0;
        e.x = this.camX + (fromRight ? W + 70 + i * 35 : -70 - i * 35);
        e.y = GROUND;
        e.facing = fromRight ? -1 : 1;
        e.def = def;
        e.hue = def.matiz || 0;
        e.ai = { delay: 0.7 + Math.random() * 0.9, plan: {}, retreat: 0 };
        e.dead = false;
        this.enemies.push(e);
      });
      this.locked = true;
      this.banner = null;
      this.emit('wave');
    }

    alive() { return this.enemies.filter(e => !e.dead); }
    nearest() {
      let best = null, bestDist = Infinity;
      for (const e of this.alive()) { const d = Math.abs(e.x - this.player.x); if (d < bestDist) { bestDist = d; best = e; } }
      return best;
    }

    update(dt, input) {
      this.time += dt;
      this.phaseTime += dt;
      this.shake = Math.max(0, this.shake - dt * 40);
      for (const fx of this.effects) fx.life -= dt;
      this.effects = this.effects.filter(fx => fx.life > 0);
      const p = this.player;

      if (this.phase === 'intro') {
        p.step(dt, {}, false, this.emit);
        if (this.phaseTime > 2.2) { this.phase = 'play'; this.banner = null; this.emit('go'); }
        return;
      }
      if (this.phase === 'dead') {
        p.step(dt, {}, false, this.emit);
        this.enemies.forEach(e => e.step(dt, {}, false, this.emit));
        if (this.phaseTime > 2.6) {
          if (this.lives > 0) {
            this.lives--;
            const meter = p.meter;
            p.reset();
            p.x = this.camX + 200; p.y = GROUND; p.facing = 1; p.meter = meter; p.invuln = 1.2;
            this.phase = 'play';
            this.phaseTime = 0;
            this.emit('respawn');
          } else {
            this.phase = 'gameover';
            this.phaseTime = 0;
            this.emit('gameover');
          }
        }
        return;
      }
      if (this.phase === 'clear') {
        p.step(dt, {}, false, this.emit);
        if (this.phaseTime > 2.8) {
          if (this.stageIndex + 1 < this.stages.length) this.startStage(this.stageIndex + 1);
          else { this.phase = 'won'; this.phaseTime = 0; this.emit('won'); }
        }
        return;
      }
      if (this.phase !== 'play') return;

      // Limites: travado na tela durante a onda; livre até o fim da fase fora dela.
      p.bounds = { left: this.camX + VIEW_PAD, right: this.locked ? this.camX + W - VIEW_PAD : this.stage.comprimento - VIEW_PAD };
      if (!p.attack && p.hp > 0) {
        if (input.left && !input.right) p.facing = -1;
        else if (input.right && !input.left) p.facing = 1;
        else { const near = this.nearest(); if (near && Math.abs(near.x - p.x) < 280) p.facing = near.x >= p.x ? 1 : -1; }
      }
      p.step(dt, input, true, this.emit);

      // Buff de dano.
      if (this.buff > 0) { this.buff = Math.max(0, this.buff - dt); p.power = this.basePower * BUFF_POWER; if (this.buff === 0) this.emit('buffend'); }
      else p.power = this.basePower;
      // Câmera 2.5D: zoom dinâmico e foco no centro da ação (jogador + inimigos vivos).
      const alive = this.alive();
      let targetZoom = 1, focus = p.x;
      if (alive.length) {
        let minX = p.x, maxX = p.x;
        for (const e of alive) { minX = Math.min(minX, e.x); maxX = Math.max(maxX, e.x); }
        const spread = maxX - minX;
        targetZoom = clamp(1.32 - spread / 700, 1, 1.22);
        focus = (minX + maxX) / 2;
      }
      this.zoom += (targetZoom - this.zoom) * Math.min(1, dt * 2.5);
      this.focusX += (focus - this.focusX) * Math.min(1, dt * 3);
      if (!this.locked) {
        const look = p.facing * 60; // look-ahead na direção do movimento
        const target = clamp(p.x - W * 0.42 + look, 0, this.stage.comprimento - W);
        if (target > this.camX) this.camX += (target - this.camX) * Math.min(1, dt * 6); // câmera só avança
        if (this.waveIndex + 1 < this.stage.ondas.length && p.x >= this.checkpoints[this.waveIndex + 1]) {
          this.waveIndex++;
          this.spawnWave(this.waveIndex);
        } else if (this.waveIndex + 1 >= this.stage.ondas.length && p.x >= this.stage.comprimento - 140) {
          this.phase = 'clear';
          this.phaseTime = 0;
          this.banner = { title: 'LIMPO!', subtitle: `${this.stage.nome} · +${this.stageBonus()} PTS` };
          this.score += this.stageBonus();
          this.emit('clear');
        }
      }

      for (const e of this.enemies) {
        e.bounds = { left: this.camX - 60, right: this.camX + W + 60 };
        if (e.dead) { e.deadTime += dt; e.step(dt, {}, false, this.emit); continue; }
        if (!e.attack && e.hp > 0) e.facing = p.x >= e.x ? 1 : -1;
        e.step(dt, this.enemyInput(e, dt), true, this.emit);
      }
      this.resolveHits();

      for (const e of this.enemies) {
        if (e.hp <= 0 && !e.dead) {
          e.dead = true; e.deadTime = 0;
          this.kills++;
          this.score += e.def.pontos || 100;
          this.emit(e.def.chefe ? 'bossdown' : 'enemydown');
          if (Math.random() < ITEM_CHANCE || e.def.chefe) {
            const type = e.def.chefe ? 'especial' : ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
            this.items.push({ type, x: clamp(e.x, this.camX + 40, this.camX + W - 40), y: GROUND, life: 16 });
          }
        }
      }
      this.enemies = this.enemies.filter(e => !e.dead || e.deadTime < 1.8);
      if (this.locked && this.alive().length === 0) { this.locked = false; this.emit('go'); }

      for (const it of this.items) {
        it.life -= dt;
        if (!it.taken && p.grounded && p.hp > 0 && Math.abs(it.x - p.x) < 42) {
          it.taken = true;
          if (it.type === 'vida') p.hp = Math.min(p.maxHp, p.hp + ITEM_HEAL);
          else if (it.type === 'dano') this.buff = BUFF_TIME;
          else p.meter = 100;
          this.score += 50;
          this.lastItem = it.type;
          this.emit('item');
        }
      }
      this.items = this.items.filter(it => !it.taken && it.life > 0);

      if (p.hp <= 0) { this.phase = 'dead'; this.phaseTime = 0; this.emit('ko'); }
    }

    stageBonus() { return 500 * (this.stageIndex + 1) + this.lives * 300; }

    // IA simples: aproxima, bate com intervalo, recua às vezes, defende raramente.
    enemyInput(e, dt) {
      const ai = e.ai, p = this.player, plan = ai.plan;
      for (const k of Object.keys(plan)) plan[k] = false;
      plan.dash = 0;
      if (e.hp <= 0 || p.hp <= 0) return plan;
      ai.delay -= dt;
      ai.retreat = Math.max(0, ai.retreat - dt);
      const dist = p.x - e.x, adist = Math.abs(dist), reach = e.moves.punch.range + 8;
      const toward = dist > 0 ? 'right' : 'left', away = dist > 0 ? 'left' : 'right';
      if (ai.retreat > 0) { plan[away] = true; return plan; }
      if (adist > reach) {
        plan[toward] = true;
        if (adist > 330 && e.grounded && Math.random() < (e.def.chefe ? 0.03 : 0.012)) plan.dash = dist > 0 ? 1 : -1;
      } else if (ai.delay <= 0 && e.grounded) {
        plan[Math.random() < (e.def.chefe ? 0.45 : 0.7) ? 'punch' : 'kick'] = true;
        ai.delay = (e.def.chefe ? 0.55 : 0.95) + Math.random() * 1.2;
        if (Math.random() < 0.25) ai.retreat = 0.35 + Math.random() * 0.4;
      }
      if (e.def.chefe && e.meter >= 100 && adist < e.moves.special.range * 0.9 && Math.random() < 0.3) plan.special = true;
      if (p.attack && adist < 170 && Math.random() < (e.def.chefe ? 0.06 : 0.015)) plan.block = true;
      return plan;
    }

    resolveHits() {
      const p = this.player;
      const tryHit = (attacker, victim) => {
        const attack = attacker.attack;
        if (!attack || victim.hp <= 0 || attacker.hp <= 0 || victim.dead) return;
        const move = attack.move;
        if (attack.elapsed < move.startup || attack.elapsed >= move.startup + move.active) return;
        attack.victims = attack.victims || new Set();
        if (attack.victims.has(victim) || victim.invuln > 0) return;
        // attack.hit fica false de propósito: um golpe pode acertar vários inimigos (victims).
        const box = attacker.hitbox(), hurt = victim.hurtbox();
        if (!box || !hurt || !overlap(box, hurt)) return;
        attack.victims.add(victim);
        const result = victim.receiveHit(attacker, attack);
        if (!result.blocked && attacker === p) {
          p.combo = p.comboTime > 0 ? p.combo + 1 : 1;
          p.comboTime = 1.1;
          this.score += Math.round(result.damage * (1 + Math.min(10, p.combo) * 0.1));
        }
        this.effects.push({
          x: (Math.max(box.x, hurt.x) + Math.min(box.x + box.w, hurt.x + hurt.w)) / 2,
          y: (Math.max(box.y, hurt.y) + Math.min(box.y + box.h, hurt.y + hurt.h)) / 2,
          life: 0.22, maxLife: 0.22, blocked: result.blocked, parry: result.parry, critical: result.critical, counter: result.counter,
          type: attack.type, damage: result.damage, facing: attacker.facing, attackerRef: attacker, victimRef: victim
        });
        let shake = result.blocked ? 2 : attack.type === 'kick' ? 6 : 3;
        if (attack.type === 'special' && !result.blocked) shake = 13;
        this.shake = Math.max(this.shake, shake);
        this.emit(result.parry ? 'parry' : result.blocked ? 'block' : 'hit');
      };
      for (const e of this.enemies) { if (e.dead) continue; tryHit(p, e); tryHit(e, p); }
    }

    drainEvents() { const out = this.events; this.events = []; return out; }
  }

  return { Game, W, BUFF_TIME };
})();
