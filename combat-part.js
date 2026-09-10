// FIGHTER — física e golpes independentes de imagens, animações e interface.
const Combat = (() => {
  'use strict';
  const GROUND = 438, LEFT = 65, RIGHT = 895, GRAVITY = 1850;
  const EMPTY_INPUT = Object.freeze({});
  const MOVES = Object.freeze({
    punch: Object.freeze({ startup: 0.09, active: 0.10, recovery: 0.19, range: 80, damage: 58, stun: 0.23, push: 235 }),
    kick: Object.freeze({ startup: 0.20, active: 0.12, recovery: 0.30, range: 118, damage: 104, stun: 0.36, push: 385 }),
    // Especial: gasta a barra cheia (100). Mais lento, muito mais forte, quebra a guarda parcialmente.
    special: Object.freeze({ startup: 0.28, active: 0.22, recovery: 0.55, range: 135, damage: 210, stun: 0.55, push: 560 })
  });
  const METER_MAX = 100, DASH_TIME = 0.18, DASH_SPEED = 720, BACKDASH_INVULN = 0.12, PARRY_WINDOW = 0.15;
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const approach = (n, target, step) => n < target ? Math.min(target, n + step) : Math.max(target, n - step);
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const stat = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;

  class Fighter {
    constructor(config, index) {
      this.config = config;
      this.index = index;
      const stats = config.stats || {};
      this.maxHp = stat(stats.vida, 1000);
      this.speed = stat(stats.velocidade, 245);
      this.jumpPower = stat(stats.pulo, 685);
      this.power = stat(stats.forca, 1);
      // Cada arma altera alcance, dano e ritmo dos dois golpes. Sem arma = base.
      const arma = config.arma || {};
      const reach = stat(arma.alcance, 1), damage = stat(arma.dano, 1), tempo = stat(arma.velocidade, 1);
      this.moves = {};
      for (const [type, move] of Object.entries(MOVES)) {
        this.moves[type] = Object.freeze({
          ...move, startup: move.startup / tempo, active: move.active / tempo, recovery: move.recovery / tempo,
          range: Math.round(move.range * reach), damage: Math.round(move.damage * damage)
        });
      }
      this.reset();
    }

    reset() {
      this.x = this.index === 0 ? 260 : 700;
      this.y = GROUND;
      this.vx = this.vy = 0;
      this.facing = this.index === 0 ? 1 : -1;
      this.hp = this.maxHp;
      this.state = 'idle';
      this.stateTime = 0;
      this.grounded = true;
      this.crouching = this.blocking = false;
      this.attack = null;
      this.hitstun = this.flash = this.combo = this.comboTime = 0;
      this.attackBuffer = null;
      this.jumpBuffer = 0;
      this.jumps = 0;          // pulos usados desde o último toque no chão (máx. 2)
      this.dash = null;        // { dir, time, back }
      this.invuln = 0;         // invencibilidade curta do backdash
      this.blockTime = 0;      // há quanto tempo a guarda está levantada (janela de parry)
      this.meter = 0;          // barra de especial 0..100 (mantida entre rounds? não: zera por round)
      this.specialBuffer = 0;
    }

    setState(state) {
      if (this.state !== state) {
        this.state = state;
        this.stateTime = 0;
      }
    }

    hurtbox() {
      const height = this.crouching ? 68 : 120;
      return { x: this.x - 24, y: this.y - height, w: 48, h: height };
    }

    hitbox() {
      const attack = this.attack;
      if (!attack || attack.hit || attack.elapsed < attack.move.startup ||
          attack.elapsed >= attack.move.startup + attack.move.active) return null;
      const crouch = attack.stance === 'crouch';
      let top = crouch ? (attack.type === 'kick' ? 39 : 66) : (attack.type === 'kick' ? 96 : 112);
      let height = crouch ? 36 : 56;
      if (attack.type === 'special') { top = crouch ? 70 : 125; height = crouch ? 70 : 118; } // varredura alta
      const reach = attack.move.range;
      return { x: this.facing > 0 ? this.x + 16 : this.x - reach, y: this.y - top, w: reach - 16, h: height };
    }

    beginAttack(type, emit) {
      this.attack = {
        type, move: this.moves[type], elapsed: 0, hit: false,
        stance: !this.grounded ? 'air' : this.crouching ? 'crouch' : 'stand'
      };
      this.blocking = false;
      this.setState(type);
      // Repetir um golpe deve reiniciar a animação mesmo se o estado for igual.
      this.stateTime = 0;
      emit(type);
    }

    step(dt, input, canAct, emit) {
      this.stateTime += dt;
      this.flash = Math.max(0, this.flash - dt);
      this.hitstun = Math.max(0, this.hitstun - dt);
      this.invuln = Math.max(0, this.invuln - dt);
      this.comboTime = Math.max(0, this.comboTime - dt);
      if (!this.comboTime) this.combo = 0;
      this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
      this.specialBuffer = Math.max(0, this.specialBuffer - dt);
      if (this.attackBuffer && (this.attackBuffer.life -= dt) <= 0) this.attackBuffer = null;

      if (this.attack) {
        this.attack.elapsed += dt;
        const move = this.attack.move;
        if (this.attack.elapsed >= move.startup + move.active + move.recovery) this.attack = null;
      }
      if (this.dash && (this.dash.time -= dt) <= 0) this.dash = null;

      if (canAct && this.hp > 0) {
        if (input.jump) this.jumpBuffer = 0.13;
        if (input.punch || input.kick) this.attackBuffer = { type: input.kick ? 'kick' : 'punch', life: 0.13 };
        if (input.special) this.specialBuffer = 0.2;
      } else {
        this.attackBuffer = null;
        this.jumpBuffer = 0;
        this.specialBuffer = 0;
      }

      const free = canAct && this.hp > 0 && this.hitstun <= 0;
      this.crouching = this.grounded && this.hp > 0 && !this.dash &&
        (this.attack ? this.attack.stance === 'crouch' : free && !!input.crouch);
      this.blocking = free && this.grounded && !this.attack && !this.dash && !!input.block;
      this.blockTime = this.blocking ? this.blockTime + dt : 0;

      if (free && !this.attack) {
        // Dash (toque duplo na direção). Backdash = curta invencibilidade.
        if (input.dash && this.grounded && !this.dash && !this.blocking) {
          const dir = input.dash > 0 ? 1 : -1;
          this.dash = { dir, time: DASH_TIME, back: dir !== this.facing };
          if (this.dash.back) this.invuln = BACKDASH_INVULN;
          this.crouching = false;
          emit('dash');
        }
        // Pulo e pulo duplo (o segundo é um pouco mais curto).
        if (this.jumpBuffer && !this.crouching && !this.blocking && !this.dash) {
          if (this.grounded) { this.vy = -this.jumpPower; this.grounded = false; this.jumps = 1; this.jumpBuffer = 0; emit('jump'); }
          else if (this.jumps < 2) { this.vy = -this.jumpPower * 0.88; this.jumps = 2; this.jumpBuffer = 0; emit('doublejump'); }
        }
        if (this.specialBuffer && this.meter >= METER_MAX && !this.blocking && !this.dash) {
          this.meter = 0;
          this.specialBuffer = 0;
          this.beginAttack('special', emit);
        } else if (this.attackBuffer && !this.blocking && !this.dash) {
          this.beginAttack(this.attackBuffer.type, emit);
          this.attackBuffer = null;
        }
      }

      if (this.dash) {
        this.vx = this.dash.dir * DASH_SPEED;
      } else if (free && !this.attack && !this.blocking && !this.crouching) {
        const axis = Number(!!input.right) - Number(!!input.left);
        this.vx = approach(this.vx, axis * this.speed, (this.grounded ? 2600 : 900) * dt);
      } else {
        this.vx = approach(this.vx, 0, (this.grounded ? 1050 : 180) * dt);
      }
      // bounds opcional: o modo Rua rola a câmera e muda os limites da tela.
      this.x = clamp(this.x + this.vx * dt, this.bounds ? this.bounds.left : LEFT, this.bounds ? this.bounds.right : RIGHT);
      if (!this.grounded) {
        this.vy += GRAVITY * dt;
        this.y += this.vy * dt;
        if (this.y >= GROUND) {
          this.y = GROUND;
          this.vy = 0;
          this.grounded = true;
          this.jumps = 0;
        }
      }

      if (this.hp <= 0) this.setState('ko');
      else if (this.hitstun > 0) this.setState('hit');
      else if (this.attack) this.setState(this.attack.type);
      else if (!this.grounded) this.setState('jump');
      else if (this.dash) this.setState('walk');
      else if (this.blocking) this.setState('block');
      else this.setState(Math.abs(this.vx) > 25 && !this.crouching ? 'walk' : 'idle');
    }

    receiveHit(attacker, attack) {
      // Pelas costas: crítico (x1.5) e a guarda não vale. Counter hit: vítima no início do próprio golpe (x1.25).
      const facingAttacker = (attacker.x - this.x) * this.facing >= 0;
      const behind = !facingAttacker;
      const counter = !!this.attack && this.attack.elapsed < this.attack.move.startup;
      // Parry: guarda levantada há menos de PARRY_WINDOW segundos, de frente. Sem dano, atacante atordoado.
      if (this.blocking && this.grounded && facingAttacker && this.blockTime <= PARRY_WINDOW && attack.type !== 'special') {
        attacker.hitstun = Math.max(attacker.hitstun, 0.45);
        attacker.attack = null;
        attacker.attackBuffer = null;
        attacker.vx = -attacker.facing * 180;
        attacker.setState('hit');
        attacker.stateTime = 0;
        this.meter = Math.min(METER_MAX, this.meter + 18);
        this.flash = 0.05;
        return { blocked: true, parry: true, damage: 0, critical: false, counter: false };
      }
      const blocked = this.blocking && this.grounded && facingAttacker;
      let mult = 1;
      if (behind) mult *= 1.5;
      if (counter) mult *= 1.25;
      const chip = attack.type === 'special' ? 0.4 : 0.18;
      const damage = Math.round(attack.move.damage * attacker.power * mult * (blocked ? chip : 1));
      this.hp = Math.max(0, this.hp - damage);
      this.flash = blocked ? 0.07 : 0.12;
      this.vx = attacker.facing * attack.move.push * (blocked ? 0.42 : 1);
      // Barra de especial: quem bate ganha mais; quem apanha também ganha um pouco.
      attacker.meter = Math.min(METER_MAX, attacker.meter + (attack.type === 'special' ? 0 : blocked ? 5 : attack.type === 'kick' ? 14 : 10));
      this.meter = Math.min(METER_MAX, this.meter + (blocked ? 4 : 8));
      if (!blocked) {
        this.attack = null;
        this.attackBuffer = null;
        this.hitstun = attack.move.stun;
        this.blocking = false;
        if (!this.grounded) this.vy = Math.min(this.vy, -155);
        this.setState(this.hp <= 0 ? 'ko' : 'hit');
        this.stateTime = 0;
      } else {
        this.hitstun = 0;
      }
      if (this.hp <= 0) {
        this.attack = null;
        this.blocking = this.crouching = false;
        this.setState('ko');
      }
      return { blocked, parry: false, damage, critical: behind && !blocked, counter: counter && !blocked };
    }
  }

  // AI — decisões com intervalo de reação; nenhuma leitura dos comandos humanos.
  class CPU {
    constructor(fighter, opponent) {
      this.fighter = fighter;
      this.opponent = opponent;
      this.reset();
    }

    reset() {
      this.decisionTime = 0.25;
      this.attackDelay = 0.35;
      this.plan = {};
    }

    update(dt) {
      this.decisionTime -= dt;
      this.attackDelay -= dt;
      // Golpes, pulos, dash e especial são pulsos; andar, abaixar e defender são comandos contínuos.
      this.plan.punch = this.plan.kick = this.plan.jump = this.plan.special = false;
      this.plan.dash = 0;
      if (this.decisionTime > 0) return this.plan;
      this.decisionTime = 0.13 + Math.random() * 0.20;
      const self = this.fighter, enemy = this.opponent;
      const distance = Math.abs(enemy.x - self.x);
      const toward = enemy.x > self.x ? 'right' : 'left';
      const away = toward === 'right' ? 'left' : 'right';
      this.plan = {};
      if (self.hp <= 0 || self.hitstun > 0) return this.plan;

      const reach = self.moves.kick.range, short = self.moves.punch.range;
      const threat = enemy.attack && distance < enemy.moves.kick.range + 50 && Math.abs(enemy.y - self.y) < 105;
      if (threat && self.grounded && Math.random() < 0.63) {
        // Às vezes tenta o parry (levanta a guarda no último instante) em vez de defender cedo.
        this.plan.block = Math.random() < 0.8 || enemy.attack.elapsed > enemy.attack.move.startup * 0.5;
        this.plan.crouch = enemy.crouching && Math.random() < 0.75;
        return this.plan;
      }
      if (self.attack || self.dash) return this.plan;
      // Especial quando a barra está cheia e o alvo está ao alcance.
      if (self.meter >= METER_MAX && distance < reach * 1.25 && Math.abs(enemy.y - self.y) < 100 && Math.random() < 0.55) {
        this.plan.special = true;
        this.attackDelay = 0.6;
        return this.plan;
      }
      if (distance > reach - 15) {
        this.plan[toward] = true;
        if (distance > 260 && self.grounded && Math.random() < 0.09) this.plan.dash = toward === 'right' ? 1 : -1;
        if (distance > 175 && distance < 370 && self.grounded && Math.random() < 0.075) this.plan.jump = true;
      } else if (distance < 59 && Math.random() < 0.18) {
        this.plan[away] = true;
        if (Math.random() < 0.3) this.plan.dash = away === 'right' ? 1 : -1; // backdash
      } else if (Math.random() < 0.10) {
        this.plan.block = true;
      }
      if (!self.grounded && self.jumps < 2 && Math.random() < 0.04) this.plan.jump = true; // pulo duplo ocasional
      if (distance < reach + 20 && Math.abs(enemy.y - self.y) < 94 && this.attackDelay <= 0) {
        if (Math.random() < 0.76) {
          const type = distance > short + 10 || Math.random() < 0.42 ? 'kick' : 'punch';
          this.plan[type] = true;
          this.plan.block = false;
          this.plan.crouch = self.grounded && Math.random() < 0.13;
          this.attackDelay = 0.30 + Math.random() * 0.46;
        }
      }
      return this.plan;
    }
  }

  // ENGINE: COMBAT — relógio, colisões, melhor de três e eventos para áudio.
  class Match {
    constructor(playerConfig, cpuConfig) {
      this.fighters = [new Fighter(playerConfig, 0), new Fighter(cpuConfig, 1)];
      this.cpu = new CPU(this.fighters[1], this.fighters[0]);
      this.time = 60;
      this.round = 1;
      this.wins = [0, 0];
      this.phase = 'intro';
      this.phaseTime = 0;
      this.banner = { title: 'ROUND 1', subtitle: 'MELHOR DE 3' };
      this.winner = null;
      this.roundWinner = null;
      this.effects = [];
      this.shake = 0;
      this.events = ['round'];
      this.previousInput = {};
      this.emit = event => this.events.push(event);
    }

    drainEvents() {
      const events = this.events;
      this.events = [];
      return events;
    }

    nextRound() {
      this.round += 1;
      this.time = 60;
      this.phase = 'intro';
      this.phaseTime = 0;
      this.roundWinner = null;
      this.banner = { title: `ROUND ${this.round}`, subtitle: this.wins.some(n => n === 1) ? 'ROUND DECISIVO' : 'PREPARE-SE' };
      this.fighters.forEach(fighter => fighter.reset());
      this.cpu.reset();
      this.effects = [];
      this.shake = 0;
      this.emit('round');
    }

    separateFighters() {
      const [a, b] = this.fighters;
      if (Math.abs(a.y - b.y) > 95) return;
      const distance = Math.abs(a.x - b.x), minimum = 52;
      if (distance >= minimum) return;
      const direction = a.x <= b.x ? 1 : -1;
      const correction = (minimum - distance) / 2;
      a.x = clamp(a.x - direction * correction, LEFT, RIGHT);
      b.x = clamp(b.x + direction * correction, LEFT, RIGHT);
      const remaining = minimum - Math.abs(a.x - b.x);
      if (remaining > 0) {
        if (a.x === LEFT || a.x === RIGHT) b.x = clamp(b.x + direction * remaining, LEFT, RIGHT);
        else a.x = clamp(a.x - direction * remaining, LEFT, RIGHT);
      }
    }

    resolveHits() {
      // Capturar primeiro permite trocas simultâneas, inclusive KO duplo.
      const contacts = [];
      for (let i = 0; i < 2; i++) {
        const attacker = this.fighters[i], victim = this.fighters[1 - i];
        const box = attacker.hitbox(), hurt = victim.hurtbox();
        if (box && attacker.hp > 0 && victim.hp > 0 && overlap(box, hurt)) {
          contacts.push({ attacker, victim, attack: attacker.attack, box, hurt });
        }
      }
      for (const contact of contacts) {
        const { attacker, victim, attack, box, hurt } = contact;
        if (victim.invuln > 0) continue; // backdash: passou por baixo do golpe
        attack.hit = true;
        const result = victim.receiveHit(attacker, attack);
        const blocked = result.blocked;
        if (!blocked) {
          attacker.combo = attacker.comboTime > 0 ? attacker.combo + 1 : 1;
          attacker.comboTime = 1.1;
        }
        this.effects.push({
          x: (Math.max(box.x, hurt.x) + Math.min(box.x + box.w, hurt.x + hurt.w)) / 2,
          y: (Math.max(box.y, hurt.y) + Math.min(box.y + box.h, hurt.y + hurt.h)) / 2,
          life: blocked ? 0.17 : 0.23, maxLife: blocked ? 0.17 : 0.23, blocked,
          parry: result.parry, critical: result.critical, counter: result.counter,
          type: attack.type, damage: result.damage, attacker: attacker.index, facing: attacker.facing
        });
        let shake = blocked ? 2 : attack.type === 'kick' ? 7 : 4;
        if (attack.type === 'special' && !blocked) shake = 14;
        if (result.critical) shake += 3;
        this.shake = Math.max(this.shake, shake);
        this.emit(result.parry ? 'parry' : blocked ? 'block' : 'hit');
      }
    }

    endRound() {
      const [a, b] = this.fighters;
      const difference = a.hp / a.maxHp - b.hp / b.maxHp;
      const tied = Math.abs(difference) < 0.000001;
      const knockout = a.hp <= 0 || b.hp <= 0;
      this.roundWinner = tied ? null : difference > 0 ? 0 : 1;
      if (tied) {
        // Empate decisivo não encerra a partida sem um vencedor: novo round.
        if (this.wins.every(wins => wins < 1)) this.wins = this.wins.map(wins => wins + 1);
      } else {
        this.wins[this.roundWinner] += 1;
      }
      this.winner = this.wins[0] >= 2 ? 0 : this.wins[1] >= 2 ? 1 : null;
      this.phase = 'roundover';
      this.phaseTime = 0;
      const perfect = !tied && this.fighters[this.roundWinner].hp >= this.fighters[this.roundWinner].maxHp;
      let title = 'TIME OVER';
      if (tied) title = 'DRAW GAME';
      else if (knockout) title = 'K.O.';
      let subtitle = 'A DISPUTA CONTINUA';
      if (!tied) subtitle = perfect ? 'PERFECT!' : `${this.fighters[this.roundWinner].config.nome} VENCE O ROUND`;
      this.banner = { title, subtitle };
      this.fighters.forEach(fighter => {
        fighter.attack = null;
        fighter.attackBuffer = null;
        fighter.blocking = false;
      });
      this.emit('ko');
    }

    update(dt, input = EMPTY_INPUT) {
      if (!Number.isFinite(dt) || dt <= 0 || this.phase === 'finished') return;
      dt = Math.min(dt, 0.05);
      const controls = { ...input };
      for (const key of ['jump', 'punch', 'kick', 'special']) controls[key] = !!input[key] && !this.previousInput[key];
      controls.dash = input.dash && input.dash !== this.previousInput.dash ? input.dash : 0;
      this.previousInput = { ...input };
      this.phaseTime += dt;
      this.shake = Math.max(0, this.shake - dt * 32);
      this.effects = this.effects.filter(effect => (effect.life -= dt) > 0);

      if (this.phase === 'intro') {
        this.fighters.forEach(fighter => fighter.step(dt, EMPTY_INPUT, false, this.emit));
        if (this.phaseTime >= 1.40) this.banner = { title: 'FIGHT!', subtitle: '' };
        if (this.phaseTime >= 2.20) {
          this.phase = 'fight';
          this.phaseTime = 0;
          this.banner = null;
        }
        return;
      }
      if (this.phase === 'roundover') {
        this.fighters.forEach(fighter => fighter.step(dt, EMPTY_INPUT, false, this.emit));
        this.separateFighters();
        if (this.phaseTime >= 2.20) {
          if (this.winner !== null) {
            this.phase = 'finished';
            this.phaseTime = 0;
            this.banner = null;
            this.emit('finish');
          } else this.nextRound();
        }
        return;
      }

      this.time = Math.max(0, this.time - dt);
      const aiInput = this.cpu.update(dt);
      for (let i = 0; i < 2; i++) {
        const fighter = this.fighters[i], enemy = this.fighters[1 - i];
        if (!fighter.attack && fighter.hp > 0 && enemy.x !== fighter.x) fighter.facing = enemy.x > fighter.x ? 1 : -1;
        fighter.step(dt, i === 0 ? controls : aiInput, true, this.emit);
      }
      this.separateFighters();
      this.resolveHits();
      if (this.fighters.some(fighter => fighter.hp <= 0) || this.time <= 0) this.endRound();
    }
  }

  return { Match, Fighter, MOVES, METER_MAX, GROUND, overlap };
})();
