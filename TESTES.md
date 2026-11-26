# TESTES.md — Fase 1 (manual)

Como rodar: na pasta do projeto, `python -m http.server 8000` (ou `npx serve`) e abra `http://localhost:8000`.
Os testes usam o botão **Carregar exemplo** (dados 100% fictícios) quando precisam de dados.

Legenda da coluna **Estado**: ✅ verificado por mim (automação no navegador do app) · 👤 precisa ser conferido por você no celular/dispositivo real.

| # | Teste | Passos | Resultado esperado | Estado |
|---|---|---|---|---|
| 1 | Estado vazio | Abra o app sem dados | Mapa vazio com cartão “Seu mapa está vazio” e botões `+ Lugar` / `Carregar exemplo` | ✅ |
| 2 | Criar cliente | Mapa → `+ Lugar` → Loja “Teste”, Endereço, Bairro → Salvar | Loja criada; se o endereço for achado, pino aparece no mapa; senão aparece o aviso “sem localização” | ✅ (cadastro + geocodificação) · 👤 clique em “Marcar no mapa” com o dedo |
| 3 | Arrastar no funil | Funil → arraste um cartão (mouse: o cartão todo; celular: segure o ícone ⠿) para outra coluna | Situação e “Última ação” (hoje) mudam; toast confirma | ✅ (eventos de ponteiro simulados, tipo toque) · 👤 gesto real com o dedo |
| 4 | Marcar como pago | Vendas → “A receber” → `Marcar como pago` → confirme valor/data/forma | Cria 1 venda em Vendas, situação vira “Adquirido e pago”, A receber = 0, Pedido em aberto limpo. Valor menor que o devido mantém o saldo em “Fechou - a pagar” | ✅ |
| 5 | Venda não paga não entra | Funil: mover loja com A receber para “Adquirido e pago” | Abre “Marcar como pago” em vez de mudar direto | ✅ (lógica) |
| 6 | Sugerir A receber | Editar loja → Pedido “2 × Placa NFC” → `Sugerir` | Usa o preço do combo da aba Preços (2 → combo 2; 3 → combo 3; 1 → unitário) | ✅ (99 / 139 / 59,90 nos exemplos) |
| 7 | Cadastrar rua | Ruas → “Av. Jóquei Clube” → Cadastrar rua | Traçado desenhado no mapa, rua salva com status e data | ✅ (rua real de Teresina, 20 trechos) |
| 8 | Ver candidatos | Na rua → `Descobrir comércios` | Lista de comércios a ≤ 30 m com nota 0–100 e “por que este está no topo” | ✅ (16 encontrados) |
| 9 | Pouco dado no OSM | Rua com < 5 comércios | Aviso “OSM tem pouco dado” + `Lugar manual` e `Importar dos LEADS` | ✅ (aviso por regra) · 👤 testar numa rua com pouco dado |
| 10 | Pinos sobrepostos | Exemplo: 6 lojas em “Av. Exemplo, 1201” | Cluster com contagem; ao dar zoom, o spiderfy abre os pinos em anel | ✅ |
| 11 | Loja em Timon-MA | Loja com Cidade “Timon - MA” e endereço | Geocodifica com cidade/UF e cai em Timon (lado oeste do rio) | ✅ (exemplo + endereço real) |
| 12 | Backup/restauração | Configurações → Baixar backup → Apagar tudo → Restaurar | Mesmas contagens de lojas/vendas/ruas/leads/preços | ✅ |
| 13 | Importar CSV | Configurações → Clientes/LEADS (vírgula ou ponto e vírgula, aspas, “R$ 1.234,56”, dd/mm/aaaa) | Atualiza por nome da loja, sem apagar; datas e valores corretos | ✅ |
| 14 | Possível duplicidade | Clientes: duas lojas com o mesmo endereço | Aviso amarelo; nada é apagado | ✅ |
| 15 | Agrupar por pessoa | Clientes: lojas da mesma pessoa | Cabeçalho com nº de lojas e soma do A receber/Receita do grupo | ✅ |
| 16 | Roteiro | Na rua → `Montar roteiro` | Até 10 melhores em ordem ao longo da rua; botões de status por parada; link(s) do Google Maps a pé | ✅ · 👤 abrir o link no celular |
| 17 | Ranking de ruas | Cadastre 2+ ruas | Ordenadas por potencial (soma das 8 melhores notas por visitar) | ✅ (1 rua) · 👤 com 2+ ruas |
| 18 | Falha de tiles | Bloquear internet no mapa | Faixa laranja “Não consegui carregar o mapa” | 👤 (lógica implementada, não simulei queda) |
| 19 | Exportar KML | Mapa → ícone de download | Arquivo `.kml` abre no Google Earth/My Maps com cores por situação | ✅ gera · 👤 abrir no Google Earth |
| 20 | Layout | 390 px e 1360 px | Sem rolagem horizontal; barra inferior no celular, lateral no desktop | ✅ (medido nas 7 telas) |

## Não consegui verificar
- Arrastar no funil com o dedo em aparelho real (testei com eventos de ponteiro do tipo toque).
- Falha real de tiles/Overpass (offline) e roteiro aberto no app do Google Maps.
- Lighthouse e leitores de tela.
- Geocodificação dos seus endereços reais (os testes usaram endereços públicos e dados fictícios).
