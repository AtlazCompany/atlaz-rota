// Estado do app em localStorage. NENHUM dado sai do navegador (Fase 1).
import { uid, norm, today, parseMoney } from './util.js';
import { toast } from './ui.js';

const KEY = 'atlaz.rota.v1';
const SETTINGS_KEY = 'atlaz.settings.v1';
const empty = () => ({ v: 1, clients: [], sales: [], streets: [], prices: [], leads: [] });

let state = load();
const subs = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...empty(), ...JSON.parse(raw) };
  } catch (e) { console.warn('Falha ao ler dados locais', e); }
  return empty();
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast('Não foi possível salvar (armazenamento cheio?). Faça um backup.', 'error'); }
}

export const get = () => state;
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
export function mutate(fn, { silent = false } = {}) {
  fn(state);
  persist();
  if (!silent) subs.forEach((f) => f(state));
}
export function replaceAll(obj) {
  state = { ...empty(), ...obj };
  persist();
  subs.forEach((f) => f(state));
}
export const isEmpty = () => !state.clients.length && !state.sales.length && !state.streets.length;

// ---------- Configurações (URL do Apps Script e token: só aqui ou em config.local.js) ----------
export function getSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; }
}
export function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

// ---------- Cálculos derivados ----------
export function statsByLoja(s = state) {
  const m = new Map();
  for (const v of s.sales) {
    const k = norm(v.loja);
    const o = m.get(k) || { placas: 0, receita: 0, lucro: 0 };
    o.placas += Number(v.qtd) || 0; o.receita += Number(v.total) || 0; o.lucro += Number(v.lucro) || 0;
    m.set(k, o);
  }
  return m;
}
export const clientById = (id) => state.clients.find((c) => c.id === id);

export function newClient(p = {}) {
  return {
    id: uid(), loja: '', pessoa: '', endereco: '', bairro: '', cidade: 'Teresina - PI', situacao: 'Sugerido para visitar',
    telefone: '', ultimaAcao: today(), obs: '', aReceber: 0, pedidoAberto: '', lat: null, lng: null, categoria: '', ...p,
  };
}
export function upsertClient(c) {
  mutate((s) => {
    const i = s.clients.findIndex((x) => x.id === c.id);
    if (i >= 0) s.clients[i] = c; else s.clients.push(c);
  });
}
export function patchClient(id, patch) {
  mutate((s) => {
    const c = s.clients.find((x) => x.id === id);
    if (!c) return;
    if (patch.situacao && patch.situacao !== c.situacao) c.ultimaAcao = today();
    Object.assign(c, patch);
  });
}
export function removeClient(id) { mutate((s) => { s.clients = s.clients.filter((c) => c.id !== id); }); }

// ---------- Preços / pedido em aberto ----------
export function parsePedido(txt) {
  const m = /(\d+)\s*[×x*]\s*(.+)/i.exec(String(txt || ''));
  if (m) return { qtd: parseInt(m[1], 10), produto: m[2].trim() };
  return null;
}
const isCombo = (p) => /combo|tripla|kit/.test(norm(p.produto));
/** Sugere o "A receber" = pedido em aberto × tabela de preços (combo de N usa o preço de combo). */
export function suggestAReceber(pedido, prices = state.prices) {
  const p = parsePedido(pedido);
  if (!p || !prices.length) return null;
  if (p.qtd >= 2) {
    const combo = prices.find((x) => isCombo(x) && new RegExp(`\\b${p.qtd}\\b`).test(norm(x.produto)))
      || (p.qtd === 3 ? prices.find((x) => /tripla/.test(norm(x.produto))) : null);
    if (combo) return combo.preco;
  }
  const alvo = norm(p.produto);
  const unit = prices.find((x) => !isCombo(x) && (alvo.includes(norm(x.produto)) || norm(x.produto).includes(alvo))) || prices.find((x) => !isCombo(x));
  return unit ? unit.preco * p.qtd : null;
}

/**
 * Marcar como pago: cria a venda (somente aqui uma venda entra em Vendas),
 * ajusta o cliente. Pagamento parcial mantém "Fechou - a pagar" com o saldo.
 */
export function registrarPagamento(clientId, { valor, data, forma }) {
  let venda = null;
  mutate((s) => {
    const c = s.clients.find((x) => x.id === clientId);
    if (!c) return;
    const ped = parsePedido(c.pedidoAberto) || { qtd: 1, produto: (s.prices.find((p) => !isCombo(p)) || { produto: 'Placa NFC' }).produto };
    const unit = s.prices.find((p) => !isCombo(p) && (norm(ped.produto).includes(norm(p.produto)) || norm(p.produto).includes(norm(ped.produto))));
    let custo = unit ? unit.custo * ped.qtd : 0, produto = ped.produto;
    // Valor igual ao preço do combo da tabela: registra como o produto combo.
    const combo = ped.qtd >= 2 ? s.prices.find((p) => isCombo(p) && new RegExp(`\\b${ped.qtd}\\b`).test(norm(p.produto)) && Math.abs(p.preco - valor) < 0.01) : null;
    if (combo) { produto = combo.produto; custo = combo.custo || custo; }
    venda = {
      id: uid(), data, produto, qtd: ped.qtd, preco: ped.qtd ? valor / ped.qtd : valor, total: valor,
      custo, lucro: valor - custo, obs: '', pagamento: forma, loja: c.loja,
    };
    s.sales.push(venda);
    const restante = Math.max(0, Math.round(((Number(c.aReceber) || 0) - valor) * 100) / 100);
    c.aReceber = restante;
    c.ultimaAcao = data;
    if (restante > 0) { c.situacao = 'Fechou - a pagar'; } else { c.situacao = 'Adquirido e pago'; c.pedidoAberto = ''; }
  });
  return venda;
}

export function addSale(v) {
  mutate((s) => { s.sales.push({ id: uid(), ...v }); });
}
export function removeSale(id) { mutate((s) => { s.sales = s.sales.filter((v) => v.id !== id); }); }

export { parseMoney };
