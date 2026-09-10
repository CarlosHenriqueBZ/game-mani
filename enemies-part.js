  // ========================================================================
  // MODO RUA SP — inimigos (packs originais de LuizMelo com variação de matiz)
  // e fases. matiz = rotação de cor em graus (0 = original). pontos = score.
  // Chefes (chefe: true) usam o especial quando a barra enche.
  // ========================================================================
  const inimigo = (id, nome, titulo, pasta, quadro, corpo, anim, extra) => ({
    id, nome, titulo, frase: '', retrato: '', style: 'brawler',
    palette: { primary: '#ff5560', secondary: '#333333', skin: '#c9a179', hair: '#111111' },
    spritesheet: folha(pasta, quadro, corpo, anim), ...extra
  });
  const ENEMIES = [
    inimigo('trombadinha', 'Trombadinha', 'Rápido e fraco', 'assets/thief/', [150, 150], [3.0, 94, 75, 41], {
      idle: ['Thief_Idle.png', 8, 9, true], walk: ['Thief_Run.png', 8, 14, true], jump: ['Thief_Jump.png', 2, 6], fall: ['Thief_Fall.png', 2, 6],
      punch: ['Attack1.png', 4], kick: ['Attack3.png', 4], block: ['Thief_Idle.png', 1, 1, true], hit: ['TakeHit.png', 4, 12], ko: ['Thief_Death.png', 6, 8]
    }, { stats: { vida: 260, velocidade: 300, pulo: 700, forca: 0.7 }, arma: { nome: 'Canivete', alcance: 0.9, dano: 0.8, velocidade: 1.3, som: 'faca' }, pontos: 100, matiz: 0, voz: { tom: 1.1, genero: 'm', frequencia: 0.3 } }),
    inimigo('motoboy', 'Motoboy', 'Sem tempo, irmão', 'assets/warrior/', [184, 137], [1.6, 124, 93, 81], {
      idle: ['Warrior_Idle.png', 6, 8, true], walk: ['Warrior_Run.png', 8, 12, true], jump: ['Warrior_Jump.png', 2, 6], fall: ['Fall.png', 2, 6],
      punch: ['Warrior_Attack.png', 4], kick: ['Attack2.png', 4], block: ['Warrior_Idle.png', 1, 1, true], hit: ['Hit.png', 3, 10], ko: ['Death.png', 9, 10]
    }, { stats: { vida: 420, velocidade: 215, pulo: 640, forca: 0.9 }, arma: { nome: 'Cadeado de moto', alcance: 1.0, dano: 1.0, velocidade: 0.9, som: 'graveto' }, pontos: 200, matiz: 200, voz: { tom: 0.85, genero: 'm', frequencia: 0.3 } }),
    inimigo('motogirl', 'Motogirl', 'Entrega em 10 min', 'assets/huntress/', [150, 150], [3.0, 96, 77, 42], {
      idle: ['Idle.png', 8, 9, true], walk: ['Run.png', 8, 12, true], jump: ['Jump.png', 2, 6], fall: ['Fall.png', 2, 6],
      punch: ['Attack1.png', 5], kick: ['Attack2.png', 5], block: ['Idle.png', 1, 1, true], hit: ['Takehit.png', 3, 10], ko: ['Death.png', 8, 9]
    }, { stats: { vida: 340, velocidade: 265, pulo: 690, forca: 0.85 }, arma: { nome: 'Guidão', alcance: 1.3, dano: 0.9, velocidade: 1.0, som: 'graveto' }, pontos: 180, matiz: 40, voz: { tom: 1.7, genero: 'f', frequencia: 0.25 } }),
    inimigo('ninja-do-farol', 'Ninja do Farol', 'Aparece no vermelho', 'assets/kenji/', [200, 200], [2.4, 127, 102, 54], {
      idle: ['Idle.png', 4, 6, true], walk: ['Run.png', 8, 12, true], jump: ['Jump.png', 2, 6], fall: ['Fall.png', 2, 6],
      punch: ['Attack1.png', 4], kick: ['Attack2.png', 4], block: ['Idle.png', 1, 1, true], hit: ['Takehit.png', 3, 10], ko: ['Death.png', 7, 8]
    }, { stats: { vida: 380, velocidade: 285, pulo: 720, forca: 1.0 }, arma: { nome: 'Rodo afiado', alcance: 1.2, dano: 1.0, velocidade: 1.05, som: 'espada' }, pontos: 250, matiz: 120, voz: { tom: 1.0, genero: 'm', frequencia: 0.3 } }),
    inimigo('seguranca', 'Segurança do Shopping', 'Documento, por favor', 'assets/fantasy-warrior/', [162, 162], [2.8, 100, 85, 45], {
      idle: ['Idle.png', 10, 10, true], walk: ['Run.png', 8, 12, true], jump: ['Jump.png', 3, 8], fall: ['Fall.png', 3, 8],
      punch: ['Attack1.png', 7], kick: ['Attack3.png', 8], block: ['Idle.png', 1, 1, true], hit: ['Takehit.png', 3, 10], ko: ['Death.png', 7, 9]
    }, { stats: { vida: 520, velocidade: 205, pulo: 640, forca: 1.05 }, arma: { nome: 'Cassetete', alcance: 1.1, dano: 1.1, velocidade: 0.9, som: 'taco' }, pontos: 300, matiz: 300, voz: { tom: 0.8, genero: 'm', frequencia: 0.3 } }),
    inimigo('sindico', 'Síndico do Copan', 'Barulho depois das 22h', 'assets/medieval-king/', [160, 111], [2.35, 104, 79, 54], {
      idle: ['Idle.png', 8, 9, true], walk: ['Run.png', 8, 12, true], jump: ['Jump.png', 2, 6], fall: ['Fall.png', 2, 6],
      punch: ['Attack1.png', 4], kick: ['Attack3.png', 4], block: ['Idle.png', 1, 1, true], hit: ['TakeHit.png', 4, 12], ko: ['Death.png', 6, 8]
    }, { stats: { vida: 700, velocidade: 185, pulo: 620, forca: 1.2 }, arma: { nome: 'Regimento interno', alcance: 1.05, dano: 1.2, velocidade: 0.8, som: 'taco' }, pontos: 400, matiz: 30, voz: { tom: 0.75, genero: 'm', frequencia: 0.3 } }),
    inimigo('mestre-da-se', 'Mestre da Praça da Sé', 'Xeque-mate na calçada', 'assets/martial-hero/', [200, 200], [2.5, 121, 94, 52], {
      idle: ['Idle.png', 8, 9, true], walk: ['Run.png', 8, 12, true], jump: ['Jump.png', 2, 6], fall: ['Fall.png', 2, 6],
      punch: ['Attack1.png', 6], kick: ['Attack2.png', 6], block: ['Idle.png', 1, 1, true], hit: ['TakeHit.png', 4, 12], ko: ['Death.png', 6, 8]
    }, { stats: { vida: 600, velocidade: 245, pulo: 680, forca: 1.1 }, arma: { nome: 'Guarda-chuva', alcance: 1.15, dano: 1.05, velocidade: 1.0, som: 'espada' }, pontos: 450, matiz: 260, voz: { tom: 0.9, genero: 'm', frequencia: 0.3 } }),
    inimigo('fiscal-arcano', 'Fiscal Arcano', 'CHEFE · Multa em chamas', 'assets/evil-wizard/', [150, 150], [2.3, 100, 73, 55], {
      idle: ['Wizard_Idle.png', 8, 9, true], walk: ['Wizard_Run.png', 8, 12, true], jump: ['Wizard_Idle.png', 1, 1], fall: ['Wizard_Idle.png', 1, 1],
      punch: ['Wizard_Attack.png', 8], kick: ['Wizard_Attack.png', 8], block: ['Wizard_Idle.png', 1, 1, true], hit: ['TakeHit.png', 4, 12], ko: ['Death.png', 5, 8]
    }, { stats: { vida: 1400, velocidade: 195, pulo: 600, forca: 1.3 }, arma: { nome: 'Fogo da fiscalização', alcance: 1.35, dano: 1.15, velocidade: 0.9, som: 'fogo' }, pontos: 1500, matiz: 0, chefe: true, voz: { tom: 0.7, genero: 'm', frequencia: 0.4 } })
  ];
  // Fases: nome exibido, comprimento em px (tela = 960) e ondas (ids de ENEMIES).
  const STAGES = [
    { nome: 'AV. PAULISTA', comprimento: 3300, ondas: [['trombadinha', 'trombadinha'], ['motoboy', 'trombadinha'], ['motogirl', 'motoboy', 'trombadinha']] },
    { nome: 'PRAÇA DA SÉ', comprimento: 3500, ondas: [['trombadinha', 'trombadinha', 'motogirl'], ['ninja-do-farol', 'motoboy'], ['mestre-da-se', 'trombadinha']] },
    { nome: 'MINHOCÃO', comprimento: 3700, ondas: [['motoboy', 'motoboy', 'trombadinha'], ['seguranca', 'motogirl'], ['ninja-do-farol', 'ninja-do-farol'], ['sindico', 'trombadinha', 'trombadinha']] },
    { nome: 'ESTAÇÃO DA LUZ', comprimento: 3300, ondas: [['seguranca', 'ninja-do-farol'], ['sindico', 'motogirl', 'motoboy'], ['fiscal-arcano']], chefe: true }
  ];
