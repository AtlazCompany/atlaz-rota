# Atlaz Rota — Design System

Tema escuro premium, foco mobile (uso na rua, com uma mão). Destaque verde-água.

## Paleta
| Token | Valor | Uso |
|---|---|---|
| `--bg` | #0b1215 | fundo do app |
| `--surface` | #121c20 | cards |
| `--surface-2` | #182429 | inputs, hover |
| `--line` | #243238 | bordas |
| `--text` | #e8f1f2 | texto principal |
| `--muted` | #8aa0a6 | texto secundário |
| `--accent` | #2dd4bf | destaque (verde-água) |
| `--accent-ink` | #04201c | texto sobre destaque |

Situações (pinos, chips, colunas):
Sugerido `#a78bfa` · Agendado `#60a5fa` · Visitado/a verificar `#facc15` · Fechou/a pagar `#fb923c` · Adquirido e pago `#34d399` · Sem interesse `#94a3b8`.
Semânticos: perigo `#f87171`.

## Tipografia
Plus Jakarta Sans (Google Fonts). Escala: 12 / 14 / 16 / 20 / 28 px. Pesos 400/500/600/700/800. Números tabulares em valores.

## Espaçamento e forma
Escala 4 · 8 · 12 · 16 · 24 · 32. Raios: 10 (inputs) · 16 (cards) · 22 (sheets/modais) · 999 (chips). Sombra: `0 8px 24px rgba(0,0,0,.35)`. Transições 160–220 ms ease.

## Layout
- Celular: barra inferior fixa com 6 abas, conteúdo com padding inferior para ela.
- Desktop (≥ 900px): barra lateral de 232px com logo e navegação.
- Toque mínimo 44px.

## Componentes
- **Card** (`.card`): superfície + borda + raio 16.
- **Stat** (`.stat`): rótulo pequeno, valor grande, sub-rótulo.
- **Chip** (`.chip`): pílula com ponto colorido; clicável como filtro.
- **Botões**: `.btn` (neutro), `.btn.primary` (verde-água), `.btn.ghost`, `.btn.danger`, `.btn.sm`, `.btn.icon`.
- **Campos**: `.field` (label + input/select/textarea).
- **Modal/Sheet**: sobe de baixo no celular, centralizado no desktop.
- **Toast**: canto inferior, auto-fecha.
- **Estado vazio** (`.empty`): ícone, título, texto, ação.
- **Skeleton** (`.skel`): shimmer para carregamento.
- **Pino do mapa**: círculo colorido com ícone SVG e borda branca; cluster em verde-água com contagem.
- **Popup**: cartão escuro arredondado, com chip de situação.
- **Gráficos**: SVG próprio, cores das situações / destaque, sem grades pesadas.

## Princípios
Pouco ruído, hierarquia clara, cor só com significado, ações principais ao alcance do polegar.
