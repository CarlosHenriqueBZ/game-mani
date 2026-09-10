  // ========================================================================
  // CONFIG — EDITE SÓ CHARACTERS PARA TROCAR, ADICIONAR OU REMOVER LUTADORES.
  // Stats: vida = HP; velocidade = px/s; pulo = impulso; forca = multiplicador.
  // arma: nome exibido + alcance/dano/velocidade dos golpes (1 = base) + som:
  //       'espada' | 'faca' | 'graveto' | 'taco' | 'fogo' | 'cobra' | 'inseto' (efeitos sonoros).
  // voz: tom (1 = grave masculino, ~1.7 = agudo feminino), genero ('f'|'m') e
  //      tipo (1-3 = qual voz de assets/sfx/voice), frequencia (0-1, quanto fala; 0 = muda).
  //      Tom baixo grava a voz via playbackRate.
  // palette e style personalizam a arte procedural usada se faltar sprite.
  // folha(pasta, [larguraQuadro, alturaQuadro], [escala, pes, centro, altura],
  //       { estado: ['Arquivo.png', quadros, fps, loop] }) descreve um pack
  // com um PNG por animação. pes/centro = pixel dos pés e do eixo do corpo no
  // quadro; altura = altura do corpo em pixels (usada nos retratos).
  // Sprites: LuizMelo (CC0) recoloridos por tools/sprite-tool.js com o mapa
  // tools/recolors.json (originais em assets/<pack>/, versões em assets/chars/).
  // ========================================================================
  const folha = (pasta, quadro, corpo, anim) => ({
    pasta, frameWidth: quadro[0], frameHeight: quadro[1], scale: corpo[0], pes: corpo[1], centro: corpo[2], altura: corpo[3],
    animations: Object.fromEntries(Object.entries(anim).map(([estado, [arquivo, frames, fps = 10, loop = false]]) => [estado, { arquivo, frames, fps, loop }]))
  });
  const CHARACTERS = [
    {
      id: 'carol', nome: 'Carol', frase: 'O prazo é agora.', titulo: 'Precisão absoluta',
      arma: { nome: 'Lança rúnica', alcance: 1.4, dano: 0.95, velocidade: 1.0, som: 'espada' },
      voz: { tom: 1.75, genero: 'f', tipo: 3, frequencia: 0.3 },
      retrato: '', stats: { vida: 1000, velocidade: 250, pulo: 690, forca: 1.02 },
      palette: { primary: '#e6c15a', secondary: '#1e1e26', skin: '#eab994', hair: '#e6c15a' }, style: 'striker',
      // Sprites próprios (IA), remontados de assets/carol/folha.png via tools/sprite-tool.js assemble assets/carol/plano.json
      spritesheet: folha('assets/carol/', [260, 180], [0.87, 172, 130, 150], {
        idle: ['Idle.png', 6, 8, true], walk: ['Run.png', 8, 12, true], jump: ['Jump.png', 2, 6], fall: ['Fall.png', 2, 6],
        punch: ['Attack1.png', 5], kick: ['Attack2.png', 8], block: ['Idle.png', 1, 1, true], hit: ['TakeHit.png', 3, 10], ko: ['Death.png', 5, 8]
      })
    },
    {
      id: 'carlos', nome: 'Carlos', frase: 'O Claude Code já resolveu.', titulo: 'Claude Code King',
      arma: { nome: 'Bastão de merge', alcance: 1.1, dano: 1.15, velocidade: 0.9, som: 'graveto' },
      voz: { tom: 0.8, genero: 'm', tipo: 2 },
      retrato: '', stats: { vida: 1080, velocidade: 230, pulo: 655, forca: 1.1 },
      palette: { primary: '#ff9a3c', secondary: '#262b3f', skin: '#8a5a3a', hair: '#111114' }, style: 'boxer',
      spritesheet: folha('assets/carlos/', [250, 180], [0.86, 172, 125, 152], {
        idle: ['Idle.png', 6, 8, true], walk: ['Run.png', 8, 12, true], jump: ['Jump.png', 2, 6], fall: ['Fall.png', 2, 6],
        punch: ['Attack1.png', 5], kick: ['Attack2.png', 9], block: ['Idle.png', 1, 1, true], hit: ['TakeHit.png', 3, 10], ko: ['Death.png', 5, 8]
      })
    },
    {
      id: 'italo', nome: 'Italo', frase: 'Isso não foi bug. Foi magia.', titulo: 'Mago do Deploy',
      arma: { nome: 'Tocha arcana', alcance: 1.3, dano: 1.05, velocidade: 0.9, som: 'fogo' },
      voz: { tom: 1.05, genero: 'm', tipo: 3 },
      retrato: '', stats: { vida: 940, velocidade: 235, pulo: 660, forca: 1.0 },
      palette: { primary: '#2f8cff', secondary: '#2f3fb0', skin: '#f1d2b0', hair: '#151515' }, style: 'shadow',
      spritesheet: folha('assets/italo/', [260, 210], [0.81, 200, 130, 160], {
        idle: ['Idle.png', 6, 8, true], walk: ['Run.png', 8, 12, true], jump: ['Jump.png', 2, 6], fall: ['Fall.png', 2, 6],
        punch: ['Attack1.png', 6], kick: ['Attack2.png', 9], block: ['Idle.png', 1, 1, true], hit: ['TakeHit.png', 3, 10], ko: ['Death.png', 5, 8]
      })
    },
    {
      id: 'raul', nome: 'Raul', frase: 'import vitoria  # Python resolve.', titulo: 'Mestre do Python',
      arma: { nome: 'Python', alcance: 1.35, dano: 0.95, velocidade: 1.0, som: 'cobra' },
      voz: { tom: 1.0, genero: 'm', tipo: 1 },
      retrato: '', stats: { vida: 960, velocidade: 285, pulo: 740, forca: 0.95 },
      palette: { primary: '#d9a441', secondary: '#262a36', skin: '#a86b45', hair: '#08080d' }, style: 'shadow',
      spritesheet: folha('assets/raul/', [260, 180], [0.92, 172, 130, 141], {
        idle: ['Idle.png', 5, 8, true], walk: ['Run.png', 9, 12, true], jump: ['Jump.png', 2, 6], fall: ['Fall.png', 2, 6],
        punch: ['Attack1.png', 5], kick: ['Attack2.png', 10], block: ['Idle.png', 1, 1, true], hit: ['TakeHit.png', 3, 10], ko: ['Death.png', 6, 8]
      })
    },
    {
      id: 'luis', nome: 'Luis', frase: 'Fórmula Certa caiu? Não comigo.', titulo: 'Fórmula Certa King',
      arma: { nome: 'Canivete de rollback', alcance: 0.9, dano: 0.9, velocidade: 1.3, som: 'faca' },
      voz: { tom: 1.15, genero: 'm', tipo: 2 },
      retrato: '', stats: { vida: 980, velocidade: 275, pulo: 720, forca: 0.98 },
      palette: { primary: '#e0202a', secondary: '#1e1e26', skin: '#e2b58f', hair: '#3a2a1e' }, style: 'runner',
      spritesheet: folha('assets/luis/', [240, 176], [0.88, 168, 120, 148], {
        idle: ['Idle.png', 6, 8, true], walk: ['Run.png', 8, 12, true], jump: ['Jump.png', 2, 6], fall: ['Fall.png', 2, 6],
        punch: ['Attack1.png', 6], kick: ['Attack2.png', 9], block: ['Idle.png', 1, 1, true], hit: ['TakeHit.png', 3, 10], ko: ['Death.png', 5, 8]
      })
    },
    {
      id: 'gabriel', nome: 'Gabriel', frase: 'Componentizei sua derrota.', titulo: 'O Componentizador',
      arma: { nome: 'Taco de refactor', alcance: 1.25, dano: 1.1, velocidade: 0.85, som: 'taco' },
      voz: { tom: 0.9, genero: 'm', tipo: 3 },
      retrato: '', stats: { vida: 1040, velocidade: 240, pulo: 680, forca: 1.05 },
      palette: { primary: '#4a5cff', secondary: '#1e1e26', skin: '#e2b58f', hair: '#101014' }, style: 'karate',
      spritesheet: folha('assets/gabriel/', [260, 200], [0.81, 192, 130, 160], {
        idle: ['Idle.png', 5, 8, true], walk: ['Run.png', 8, 12, true], jump: ['Jump.png', 2, 6], fall: ['Fall.png', 2, 6],
        punch: ['Attack1.png', 6], kick: ['Attack2.png', 9], block: ['Idle.png', 1, 1, true], hit: ['TakeHit.png', 3, 10], ko: ['Death.png', 5, 8]
      })
    },
    {
      id: 'tadeus', nome: 'Tadeus', frase: 'Achei o bug. Era você.', titulo: 'Caçador de Bugs',
      arma: { nome: 'Bug crítico', alcance: 1.0, dano: 1.2, velocidade: 0.9, som: 'inseto' },
      voz: { tom: 0.95, genero: 'm', tipo: 1 },
      retrato: '', stats: { vida: 1150, velocidade: 215, pulo: 640, forca: 1.15 },
      palette: { primary: '#e8e2d2', secondary: '#2f333c', skin: '#efb08d', hair: '#3e1712' }, style: 'tank',
      spritesheet: folha('assets/tadeus/', [250, 200], [0.84, 192, 125, 155], {
        idle: ['Idle.png', 6, 8, true], walk: ['Run.png', 8, 12, true], jump: ['Jump.png', 2, 6], fall: ['Fall.png', 2, 6],
        punch: ['Attack1.png', 5], kick: ['Attack2.png', 9], block: ['Idle.png', 1, 1, true], hit: ['TakeHit.png', 3, 10], ko: ['Death.png', 5, 8]
      })
    }
    // Pack extra disponível: assets/huntress/ (lança). Exemplo:
    // , { id: 'nova', nome: 'Nova', frase: '...', titulo: '...', arma: { nome: 'Lança', alcance: 1.4, dano: 0.95, velocidade: 0.95 },
    //   voz: { tom: 1.6, genero: 'f' }, retrato: '', stats: { vida: 1000, velocidade: 240, pulo: 680, forca: 1 },
    //   palette: { primary: '#f479ab', secondary: '#703e54', skin: '#95613f', hair: '#271e21' }, style: 'brawler',
    //   spritesheet: folha('assets/huntress/', [150, 150], [3.0, 96, 77, 42], {
    //     idle: ['Idle.png', 8, 9, true], walk: ['Run.png', 8, 12, true], jump: ['Jump.png', 2, 6], fall: ['Fall.png', 2, 6],
    //     punch: ['Attack1.png', 5], kick: ['Attack2.png', 5], block: ['Idle.png', 1, 1, true], hit: ['Takehit.png', 3, 10], ko: ['Death.png', 8, 9] }) }
  ];
