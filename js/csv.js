// Leitura de CSV (exportado do Google Sheets) e importadores por aba.
import { norm, parseMoney, parseDate, today, SITUACOES, uid } from './util.js';
import { get, mutate, newClient } from './store.js';

export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.includes('\t') ? '\t' : ',');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = ''; if (row.some((c) => c.trim() !== '')) rows.push(row); row = [];
    } else cur += ch;
  }
  row.push(cur); if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

/** Converte linhas em objetos com chaves normalizadas (sem acento/pontuação). */
function toObjects(rows) {
  if (!rows.length) return [];
  const head = rows[0].map(norm);
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}
const col = (o, ...names) => {
  for (const n of names) { if (o[n] !== undefined && o[n] !== '') return o[n]; }
  const keys = Object.keys(o);
  for (const n of names) { const k = keys.find((x) => x.startsWith(n)); if (k && o[k] !== '') return o[k]; }
  return '';
};

export function normSituacao(s) {
  const n = norm(s);
  return SITUACOES.find((x) => norm(x) === n) || (n.includes('pago') ? 'Adquirido e pago' : n.includes('pagar') ? 'Fechou - a pagar' : n.includes('sem interesse') ? 'Sem interesse' : n.includes('agend') ? 'Agendado' : n.includes('visit') && !n.includes('sugerido') ? 'Visitado - a verificar' : 'Sugerido para visitar');
}

export function importClientes(text) {
  const objs = toObjects(parseCSV(text)).filter((o) => col(o, 'loja'));
  let novos = 0, atualizados = 0;
  mutate((s) => {
    for (const o of objs) {
      const loja = col(o, 'loja');
      const dados = {
        loja, pessoa: col(o, 'cliente pessoa', 'cliente', 'pessoa'), endereco: col(o, 'endereco'), bairro: col(o, 'bairro'),
        situacao: normSituacao(col(o, 'situacao')), telefone: col(o, 'telefone'),
        ultimaAcao: parseDate(col(o, 'ultima acao')) || today(), obs: col(o, 'observacoes', 'obs'),
        aReceber: parseMoney(col(o, 'a receber r', 'a receber')), pedidoAberto: col(o, 'pedido em aberto'),
      };
      const cidade = col(o, 'cidade'); if (cidade) dados.cidade = cidade;
      const ex = s.clients.find((c) => norm(c.loja) === norm(loja));
      if (ex) { Object.assign(ex, dados); atualizados++; } else { s.clients.push(newClient(dados)); novos++; }
    }
  });
  return { novos, atualizados, total: objs.length };
}

export function importLeads(text) {
  const objs = toObjects(parseCSV(text)).filter((o) => col(o, 'estabelecimento', 'nome'));
  mutate((s) => {
    for (const o of objs) {
      const nome = col(o, 'estabelecimento', 'nome');
      const lead = {
        id: uid(), categoria: col(o, 'categoria'), nome, bairro: col(o, 'bairro regiao', 'bairro'), prioridade: col(o, 'prioridade'),
        status: col(o, 'status comercial', 'status'), endereco: col(o, 'endereco'), telefone: col(o, 'telefone'),
      };
      const ex = s.leads.find((l) => norm(l.nome) === norm(nome));
      if (ex) Object.assign(ex, { ...lead, id: ex.id }); else s.leads.push(lead);
    }
  });
  return { total: objs.length };
}

export function importVendas(text) {
  const objs = toObjects(parseCSV(text)).filter((o) => col(o, 'data') || col(o, 'total'));
  let n = 0;
  mutate((s) => {
    const seen = new Set(s.sales.map((v) => [v.data, norm(v.loja), norm(v.produto), v.total].join('|')));
    for (const o of objs) {
      const v = {
        id: uid(), data: parseDate(col(o, 'data')), produto: col(o, 'produto'), qtd: parseMoney(col(o, 'qtd', 'quantidade')) || 1,
        preco: parseMoney(col(o, 'preco unit', 'preco')), total: parseMoney(col(o, 'total')), custo: parseMoney(col(o, 'custo')),
        lucro: parseMoney(col(o, 'lucro')), obs: col(o, 'obs'), pagamento: col(o, 'pagamento'), loja: col(o, 'cliente loja', 'loja'),
      };
      if (!v.lucro && v.total) v.lucro = v.total - v.custo;
      const key = [v.data, norm(v.loja), norm(v.produto), v.total].join('|');
      if (seen.has(key)) continue;
      seen.add(key); s.sales.push(v); n++;
    }
  });
  return { total: n };
}

export function importPrecos(text) {
  const objs = toObjects(parseCSV(text)).filter((o) => col(o, 'produto'));
  mutate((s) => {
    for (const o of objs) {
      const p = { produto: col(o, 'produto'), preco: parseMoney(col(o, 'preco', 'preco venda', 'valor')), custo: parseMoney(col(o, 'custo')) };
      const ex = s.prices.find((x) => norm(x.produto) === norm(p.produto));
      if (ex) Object.assign(ex, p); else s.prices.push(p);
    }
  });
  return { total: objs.length };
}

export const IMPORTERS = { clientes: importClientes, leads: importLeads, vendas: importVendas, precos: importPrecos };
export { get };
