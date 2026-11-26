// Padrão de aquisição: categorias, tipo de local, pontuação 0–100 explicável.
// Usa SOMENTE os dados do próprio usuário (Clientes/Vendas/Leads).
import { norm, haversine, clamp, pct } from './util.js';
import { statsByLoja, parsePedido } from './store.js';

export const CATS = [
  { id: 'beleza', label: 'Beleza e estética', kw: ['salao', 'beleza', 'barbear', 'barbearia', 'estetica', 'cabelo', 'cabeleir', 'hair', 'nail', 'unha', 'manicure', 'studio', 'spa', 'cilios', 'sobrancelha', 'makeup', 'maquiagem', 'depila', 'massagem'], osm: ['hairdresser', 'beauty', 'massage', 'tattoo'] },
  { id: 'semijoias', label: 'Semijoias e acessórios', kw: ['semijoia', 'joia', 'joias', 'bijuteria', 'acessorio', 'ouro', 'prata', 'relogio', 'bolsa'], osm: ['jewelry', 'bag', 'watches'] },
  { id: 'moda', label: 'Moda e vestuário', kw: ['moda', 'boutique', 'roupa', 'confec', 'vestu', 'lingerie', 'calcado', 'sapato', 'jeans', 'fashion', 'look', 'modas', 'fitness', 'infantil'], osm: ['clothes', 'shoes', 'boutique', 'fashion'] },
  { id: 'cosmeticos', label: 'Cosméticos e perfumaria', kw: ['cosmetico', 'perfum', 'boticario', 'natura', 'make', 'dermo'], osm: ['cosmetics', 'perfumery', 'chemist'] },
  { id: 'otica', label: 'Ótica', kw: ['otica', 'oculos', 'optica', 'lentes'], osm: ['optician'] },
  { id: 'celular', label: 'Celulares e tecnologia', kw: ['celular', 'telefon', 'smartphone', 'assistencia', 'eletronic', 'informatica', 'tech', 'mobile', 'cell', 'games', 'computador'], osm: ['mobile_phone', 'electronics', 'computer'] },
  { id: 'alimentacao', label: 'Alimentação', kw: ['pizza', 'pizzaria', 'lanche', 'hambur', 'restaurante', 'bar ', 'cafe', 'padaria', 'sorvete', 'acai', 'churrasc', 'doceria', 'confeitaria', 'sushi', 'bistro', 'cantina', 'pastel', 'cafeteria'], osm: ['restaurant', 'cafe', 'fast_food', 'bar', 'bakery', 'ice_cream', 'pub', 'confectionery'] },
  { id: 'saude', label: 'Saúde e pet', kw: ['clinica', 'farmacia', 'odonto', 'dentista', 'medic', 'laborator', 'pet', 'veterin', 'fisio', 'nutri', 'psico'], osm: ['pharmacy', 'clinic', 'dentist', 'doctors', 'veterinary', 'pet'] },
  { id: 'servicos', label: 'Serviços e escritórios', kw: ['escritorio', 'advoc', 'contab', 'imobili', 'seguro', 'banco', 'despach', 'auto', 'oficina', 'mecanic', 'consultoria', 'agencia'], osm: ['bank', 'car_repair', 'car'] },
  { id: 'casa', label: 'Casa e decoração', kw: ['moveis', 'decora', 'casa', 'eletro', 'utilidades', 'material', 'construcao', 'colchoes', 'presentes', 'papelaria', 'flor'], osm: ['furniture', 'hardware', 'gift', 'florist', 'stationery', 'variety_store', 'department_store'] },
  { id: 'outros', label: 'Outros', kw: [], osm: [] },
];
export const catLabel = (id) => (CATS.find((c) => c.id === id) || CATS.at(-1)).label;

export function inferCategory(...texts) {
  const t = ' ' + norm(texts.filter(Boolean).join(' ')) + ' ';
  for (const c of CATS) if (c.osm.some((o) => t.includes(' ' + o.replace(/_/g, ' ') + ' '))) return c.id;
  let best = null;
  for (const c of CATS) {
    const hits = c.kw.filter((k) => t.includes(' ' + k)).length;
    if (hits && (!best || hits > best.hits)) best = { id: c.id, hits };
  }
  return best ? best.id : 'outros';
}
export const LOCS = { shopping: 'Shopping / galeria', rua: 'Rua / loja de calçada' };
export function inferLoc(...texts) {
  const t = norm(texts.filter(Boolean).join(' '));
  return /\b(shopping|galeria|centro comercial|mall|mercado|box|edificio comercial)\b/.test(t) ? 'shopping' : 'rua';
}

const FECHOU = new Set(['Adquirido e pago', 'Fechou - a pagar']);
const VISITOU = new Set(['Visitado - a verificar', 'Fechou - a pagar', 'Adquirido e pago', 'Sem interesse']);
const bump = (m, k, init) => { if (!m.has(k)) m.set(k, init()); return m.get(k); };

/** Estatísticas de conversão por categoria e por tipo de local (comprou / visitou). */
export function buildPatterns(state) {
  const stats = statsByLoja(state);
  const leadCat = new Map(state.leads.map((l) => [norm(l.nome), l.categoria]));
  const byCat = new Map(), byLoc = new Map();
  const neighbors = [];
  let bought = 0, visited = 0;
  for (const c of state.clients) {
    const cat = c.categoria || inferCategory(c.loja, leadCat.get(norm(c.loja)), c.obs);
    const loc = inferLoc(c.endereco, c.loja, c.obs);
    const st = stats.get(norm(c.loja));
    const qtd = (st && st.placas) || parsePedido(c.pedidoAberto)?.qtd || 1;
    for (const [m, k] of [[byCat, cat], [byLoc, loc]]) {
      const o = bump(m, k, () => ({ id: k, bought: 0, visited: 0, refused: 0, qtyN: 0, qtySum: 0 }));
      if (VISITOU.has(c.situacao)) o.visited++;
      if (FECHOU.has(c.situacao)) { o.bought++; o.qtyN++; o.qtySum += qtd; }
      if (c.situacao === 'Sem interesse') o.refused++;
    }
    if (VISITOU.has(c.situacao)) visited++;
    if (FECHOU.has(c.situacao)) { bought++; if (c.lat != null) neighbors.push({ loja: c.loja, pt: [c.lat, c.lng], endereco: c.endereco }); }
  }
  const prior = visited ? bought / visited : 0.25;
  const fin = (o) => ({ ...o, rate: o.visited ? o.bought / o.visited : 0, avgQty: o.qtyN ? o.qtySum / o.qtyN : 0 });
  return {
    byCat: new Map([...byCat].map(([k, v]) => [k, fin(v)])),
    byLoc: new Map([...byLoc].map(([k, v]) => [k, fin(v)])),
    neighbors, prior, bought, visited,
  };
}

const smooth = (o, prior, K = 3) => ((o?.bought || 0) + prior * K) / ((o?.visited || 0) + K);

/** Pontuação 0–100 com explicação por componente. */
export function scoreCandidate(cand, P) {
  const cat = cand.categoria || inferCategory(cand.nome, cand.categoriaOsm, cand.tag, cand.extra);
  const loc = cand.loc || inferLoc(cand.endereco, cand.nome, cand.extra);
  const parts = [];

  // 1) Afinidade de categoria (40)
  // "Outros" mistura categorias não identificadas: não carrega sinal, fica neutro.
  const oc = cat === 'outros' ? null : P.byCat.get(cat);
  const p = smooth(oc, P.prior);
  let why;
  if (cat === 'outros') why = 'Categoria não identificada pelo nome: nota neutra (ajuste o tipo do lugar para melhorar).';
  else if (!oc || !oc.visited) why = `Sem histórico em ${catLabel(cat)}: nota neutra.`;
  else why = `${catLabel(cat)}: ${oc.bought} de ${oc.visited} visitas fecharam (${pct(oc.rate)})${oc.refused ? `, ${oc.refused} sem interesse` : ''}.`;
  parts.push({ key: 'afinidade', label: 'Afinidade de categoria', max: 40, pts: 40 * clamp(p / 0.6, 0, 1), why });

  // 2) Proximidade de lojas que já compraram (30)
  let near = null;
  for (const n of P.neighbors) { const d = haversine([cand.lat, cand.lng], n.pt); if (!near || d < near.d) near = { d, loja: n.loja }; }
  let prox = 0, pwhy = 'Nenhuma loja paga com localização por perto.';
  if (near) {
    prox = near.d <= 60 ? 30 : near.d <= 150 ? 24 : near.d <= 400 ? 15 : near.d <= 1000 ? 6 : 0;
    pwhy = `A ${Math.round(near.d)} m de ${near.loja} (já fechou).`;
    if (!prox) pwhy = `Loja que fechou mais próxima está a ${(near.d / 1000).toFixed(1)} km.`;
  }
  parts.push({ key: 'proximidade', label: 'Proximidade de quem já comprou', max: 30, pts: prox, why: pwhy });

  // 3) Ticket: categorias que compraram combo/tripla (15)
  let tpts = 5, twhy = `Sem vendas em ${catLabel(cat)}: nota neutra.`;
  if (oc && oc.qtyN) {
    tpts = 15 * clamp((oc.avgQty - 1) / 1.5, 0, 1);
    twhy = `${catLabel(cat)} leva em média ${oc.avgQty.toFixed(1).replace('.', ',')} placa(s) por loja.`;
  }
  parts.push({ key: 'ticket', label: 'Ticket (combo/tripla)', max: 15, pts: tpts, why: twhy });

  // 4) Tipo de local (15)
  const ol = P.byLoc.get(loc), pl = smooth(ol, P.prior);
  let lwhy;
  if (!ol || !ol.visited) lwhy = `${LOCS[loc]}: sem histórico, nota neutra.`;
  else {
    const other = P.byLoc.get(loc === 'shopping' ? 'rua' : 'shopping');
    lwhy = `${LOCS[loc]}: ${ol.bought} de ${ol.visited} visitas fecharam (${pct(ol.rate)})`;
    if (loc === 'shopping' && other?.visited && ol.rate > other.rate) lwhy += ' — converte mais que a rua (bônus)';
    lwhy += '.';
  }
  parts.push({ key: 'local', label: 'Tipo de local', max: 15, pts: 15 * clamp(pl / 0.6, 0, 1), why: lwhy });

  parts.forEach((x) => { x.pts = Math.round(x.pts * 10) / 10; });
  const score = Math.round(clamp(parts.reduce((a, x) => a + x.pts, 0), 0, 100));
  return { score, parts, cat, loc };
}

/** Potencial de uma rua = soma das pontuações dos 8 melhores candidatos ainda por visitar. */
export function streetPotential(street, P, top = 8) {
  const sc = (street.candidates || []).filter((c) => !c.clientId && c.situacao === 'Sugerido para visitar' && c.lat != null)
    .map((c) => scoreCandidate(c, P).score).sort((a, b) => b - a).slice(0, top);
  return { total: sc.reduce((a, b) => a + b, 0), n: (street.candidates || []).filter((c) => !c.clientId).length };
}
