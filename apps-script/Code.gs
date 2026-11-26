/**
 * Atlaz Rota — API da planilha "Operação Placas NFC — Custos, Entradas e Saídas".
 * Web app: "Executar como: eu" / "Quem tem acesso: Qualquer pessoa com o link".
 * O token secreto fica em Propriedades do script (ATLAZ_TOKEN) e é validado em TODA chamada.
 *
 * Regras (planilha compartilhada com o sócio):
 *  - NUNCA escreve nas colunas calculadas (Clientes I e J; Vendas F, G e K).
 *  - NUNCA sobrescreve célula que contenha fórmula, NUNCA apaga linhas.
 *  - Clientes: upsert por Loja (col. A), escreve A:H, K e L.
 *  - Vendas: só acrescenta linhas (A:E, H, I, J); ignora linha já existente (idempotente).
 *  - LockService evita duas escritas simultâneas.
 */
var SHEET_CLIENTES = 'Clientes';
var SHEET_VENDAS = 'Vendas';

function doGet(e) {
  try {
    checkToken_(e && e.parameter && e.parameter.token);
    var ss = openSheet_();
    return json_({ ok: true, clientes: readClientes_(ss), vendas: readVendas_(ss) });
  } catch (err) { return json_({ ok: false, error: String(err.message || err) }); }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    checkToken_(body.token);
    if (!lock.tryLock(20000)) throw new Error('Planilha ocupada. Tente de novo em instantes.');
    var ss = openSheet_();
    var out = { ok: true };
    out.clientes = upsertClientes_(ss, body.clientes || []);
    out.vendas = appendVendas_(ss, body.vendas || []);
    SpreadsheetApp.flush();
    return json_(out);
  } catch (err) { return json_({ ok: false, error: String(err.message || err) }); }
  finally { try { lock.releaseLock(); } catch (x) {} }
}

// ---------- planilha ----------
/** Projeto avulso: usa a propriedade SHEET_ID. Projeto aberto de dentro da planilha: usa a planilha ativa. */
function openSheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

// ---------- segurança ----------
function checkToken_(t) {
  var real = PropertiesService.getScriptProperties().getProperty('ATLAZ_TOKEN');
  if (!real || real.length < 16) throw new Error('Token não configurado no script.');
  if (!t || String(t).length !== real.length) throw new Error('Não autorizado.');
  var diff = 0, s = String(t);
  for (var i = 0; i < real.length; i++) diff |= s.charCodeAt(i) ^ real.charCodeAt(i);
  if (diff !== 0) throw new Error('Não autorizado.');
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// ---------- utilidades ----------
function norm_(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function iso_(v) { return v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(v || ''); }
function toDate_(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : ''; }
function sheet_(ss, name) { var sh = ss.getSheetByName(name); if (!sh) throw new Error('Aba não encontrada: ' + name); return sh; }
/** Última linha realmente preenchida na coluna A (ignora colunas de fórmula que se estendem). */
function lastRowA_(sh) {
  var v = sh.getRange(1, 1, Math.max(sh.getMaxRows(), 1), 1).getValues();
  for (var i = v.length - 1; i >= 0; i--) if (String(v[i][0]).trim() !== '') return i + 1;
  return 1;
}
/** Grava valores só nas células sem fórmula. cols: {numeroDaColuna: valor}. */
function safeWrite_(sh, row, cols) {
  Object.keys(cols).forEach(function (c) {
    var cell = sh.getRange(row, +c);
    if (cell.getFormula()) return; // nunca sobrescreve fórmula
    cell.setValue(cols[c]);
  });
}

// ---------- leitura ----------
function readClientes_(ss) {
  var sh = sheet_(ss, SHEET_CLIENTES), n = lastRowA_(sh);
  if (n < 2) return [];
  var v = sh.getRange(2, 1, n - 1, 12).getValues();
  return v.filter(function (r) { return String(r[0]).trim() !== ''; }).map(function (r) {
    return { loja: r[0], pessoa: r[1], endereco: r[2], bairro: r[3], situacao: r[4], telefone: r[5],
      ultimaAcao: iso_(r[6]), obs: r[7], placas: r[8], receita: r[9], aReceber: Number(r[10]) || 0, pedidoAberto: r[11] };
  });
}
function readVendas_(ss) {
  var sh = sheet_(ss, SHEET_VENDAS), n = lastRowA_(sh);
  if (n < 2) return [];
  var v = sh.getRange(2, 1, n - 1, 11).getValues();
  return v.filter(function (r) { return r[0] !== '' || r[4] !== ''; }).map(function (r) {
    return { data: iso_(r[0]), produto: r[1], qtd: Number(r[2]) || 0, preco: Number(r[3]) || 0, total: Number(r[4]) || 0,
      custo: Number(r[5]) || 0, lucro: Number(r[6]) || 0, obs: r[7], pagamento: r[8], loja: r[9] };
  });
}

// ---------- escrita ----------
function upsertClientes_(ss, list) {
  var sh = sheet_(ss, SHEET_CLIENTES), n = lastRowA_(sh);
  var names = n >= 2 ? sh.getRange(2, 1, n - 1, 1).getValues() : [];
  var index = {};
  names.forEach(function (r, i) { var k = norm_(r[0]); if (k && !(k in index)) index[k] = i + 2; });
  var novos = 0, atualizados = 0, next = n + 1;
  list.forEach(function (c) {
    var key = norm_(c.loja);
    if (!key) return;
    var cols = { 1: c.loja, 2: c.pessoa || '', 3: c.endereco || '', 4: c.bairro || '', 5: c.situacao || '', 6: c.telefone || '',
      7: toDate_(c.ultimaAcao), 8: c.obs || '', 11: Number(c.aReceber) || 0, 12: c.pedidoAberto || '' }; // nunca 9 e 10
    if (index[key]) { safeWrite_(sh, index[key], cols); atualizados++; }
    else { safeWrite_(sh, next, cols); index[key] = next; next++; novos++; }
  });
  return { novos: novos, atualizados: atualizados };
}

function appendVendas_(ss, list) {
  var sh = sheet_(ss, SHEET_VENDAS), n = lastRowA_(sh);
  var seen = {};
  if (n >= 2) sh.getRange(2, 1, n - 1, 10).getValues().forEach(function (r) {
    seen[[iso_(r[0]), norm_(r[9]), norm_(r[1]), Number(r[4]) || 0].join('|')] = true;
  });
  var novas = 0, ignoradas = 0, next = n + 1;
  list.forEach(function (v) {
    if (!(Number(v.total) > 0)) { ignoradas++; return; } // venda sem valor pago não entra
    var key = [v.data, norm_(v.loja), norm_(v.produto), Number(v.total) || 0].join('|');
    if (seen[key]) { ignoradas++; return; }
    safeWrite_(sh, next, { 1: toDate_(v.data), 2: v.produto || '', 3: Number(v.qtd) || 1, 4: Number(v.preco) || 0, 5: Number(v.total) || 0,
      8: v.obs || '', 9: v.pagamento || '', 10: v.loja || '' }); // nunca 6, 7 e 11
    seen[key] = true; next++; novas++;
  });
  return { novas: novas, ignoradas: ignoradas };
}
