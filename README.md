# Atlaz Rota

Site estático (HTML + CSS + JS puro) para gerenciar mapa de lojas, funil de vendas, dashboard e planejamento de ruas das placas NFC em Teresina-PI.

> **Segurança:** este repositório é público. **Nenhum dado real** (clientes, endereços, telefones, valores, vendas) vai para o código ou para o git. Os dados ficam só no `localStorage` do seu navegador e na sua planilha. `*.json`, `*.csv`, `*.kml`, `.env` e `config.local.js` estão no `.gitignore`. Os dados de `data/exemplo.js` são fictícios.

## Rodar localmente
```
python -m http.server 8000
```
Abra `http://localhost:8000`. Em Configurações você pode importar os CSVs da planilha (Clientes, LEADS, Vendas, Preços) ou carregar dados fictícios.

## Telas
Mapa · Funil · Clientes · Vendas · Ruas · Dashboard · Configurações (ver `design.md` e `TESTES.md`).

## Dados e serviços externos
- Mapa: Leaflet + markercluster (CDN). Tiles padrão: **OpenStreetMap** (a CARTO Voyager gratuita agora devolve marca d'água “API KEY REQUIRED”; se tiver uma chave, cole a URL em Configurações → Mapa).
- Geocodificação: Nominatim (máx. 1 consulta/s, cache em localStorage).
- Comércios de uma rua: Overpass API do OpenStreetMap (sem conta).

## Configuração local (opcional)
Copie `config.example.js` para `config.local.js` (ignorado pelo git) e preencha a URL do Apps Script e o token. Também dá para colocá-los em Configurações (ficam só no navegador). **Nunca** no código.

## Sincronização com a planilha (Apps Script)
1. Abra a planilha **Operação Placas NFC — Custos, Entradas e Saídas** → **Extensões → Apps Script**.
2. Apague o conteúdo e cole [apps-script/Code.gs](apps-script/Code.gs). Confira os nomes das abas no topo (`Clientes`, `Vendas`).
3. **Gerar o token:** no navegador, F12 → Console, rode `crypto.randomUUID()+crypto.randomUUID()` e copie o resultado (guarde num gerenciador de senhas; não publique).
4. No Apps Script: ⚙ **Configurações do projeto → Propriedades do script → Adicionar**: nome `ATLAZ_TOKEN`, valor = o token.
5. **Implantar → Nova implantação → Tipo: App da Web.** *Executar como:* **Eu**. *Quem tem acesso:* **Qualquer pessoa com o link**. Autorize e copie a URL terminada em `/exec`.
6. No app: **Configurações** → cole a URL e o token → Salvar. (Ou use `config.local.js`, copiando `config.example.js`.)
7. **Baixar da planilha** traz Clientes e Vendas; **Enviar para a planilha** mostra um aviso (planilha compartilhada com o sócio) antes de enviar.
8. Depois de alterar o código do script, faça **Implantar → Gerenciar implantações → editar → Nova versão**.

Regras do script: valida o token em toda chamada; usa `LockService`; faz upsert em Clientes por Loja (colunas A:H, K, L); só acrescenta em Vendas (A:E, H, I, J) e ignora linhas repetidas; **nunca** escreve nas colunas calculadas (Clientes I e J; Vendas F, G e K), nunca sobrescreve células com fórmula e nunca apaga linhas. Não envia fórmulas, então não há problema de separador `;` em pt-BR. Linhas novas de Clientes não recebem as fórmulas de I e J: se elas não forem `ARRAYFORMULA`, arraste-as para baixo na planilha.
