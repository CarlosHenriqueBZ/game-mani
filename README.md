# game-mani

**MANI BATTLE** — jogo de luta arcade estilo anos 90 (Street Fighter / KOF), 100% em um `index.html`. Abra o arquivo no navegador: sem instalação, sem servidor, sem internet.

## Modos
- **VERSUS** — 1P vs CPU, melhor de 3, 60 s por round. Seleção de personagem, arena (**Rooftop RD** ou **Laboratório de Manipulação**) e tela VS.
- **RUA SP** — beat 'em up: avance pela Av. Paulista, Praça da Sé, Minhocão e Estação da Luz enfrentando ondas de inimigos paulistanos e o chefe Fiscal Arcano. Itens RD (vida, dano, especial), 3 vidas, score.
- **CONTROLES** — teclas, mecânicas e opções (volume de efeitos/música, som, tela cheia automática).

## Controles
| Tecla | Ação |
|---|---|
| A / D | andar · toque duplo = dash (backdash fica invencível) |
| W | pular · W W = pulo duplo |
| S | abaixar |
| J / K | golpe leve / golpe forte |
| I | especial (barra cheia) |
| L | defesa · no tempo certo = parry |
| Enter / Esc | confirmar · voltar / pausar |

Mecânicas: crítico pelas costas (×1,5, ignora defesa), counter hit (×1,25), parry, barra de especial, combos.

## Estrutura
- `index.html` — jogo completo montado (o único arquivo necessário para jogar).
- `config-part.js` — elenco (`CHARACTERS`): nomes, apelidos, armas, vozes, sprites.
- `enemies-part.js` — inimigos e fases do modo Rua.
- `combat-part.js` — motor de luta 1v1 (física, golpes, defesa, parry, especial, IA).
- `street-part.js` — motor do beat 'em up.
- `art-part.js` — arenas procedurais, letreiro, arte de reserva.
- `app-part.js` — telas, HUD, partículas, áudio, música.
- `build.js` — monta o `index.html` a partir das partes: `node build.js`.
- `editor.html` — editor de personagem: recorta folhas de sprites geradas por IA em strips por animação.
- `tools/sprite-tool.js` — utilitários de sprites (paleta, recolor, remoção de fundo, fatiamento, remontagem).
- `assets/` — sprites, sons, música e fonte (créditos e licenças em `assets/CREDITS.txt`).

## Personalizar
Edite `config-part.js` (ou o array `CHARACTERS` direto no `index.html`) e rode `node build.js`. Sprites: um PNG por animação, quadros lado a lado, personagem olhando para a direita — o `editor.html` gera os strips e o trecho de configuração.

## Créditos
Sprites base LuizMelo (CC0), fonte Press Start 2P (OFL), efeitos sonoros e músicas CC0/CC-BY listados em `assets/CREDITS.txt`.
