// Aba Dashboard: cards de resumo e gráficos limpos (barras HTML + SVG).
import { SITUACOES, SIT, $, esc, brl, pct, norm, monthLabel, today } from '../util.js';
import { icon } from '../icons.js';
import { get, subscribe, statsByLoja, replaceAll as replace } from '../store.js';
import { buildPatterns, catLabel } from '../scoring.js';
import { emptyState, toast } from '../ui.js';
import { EXEMPLO } from '../../data/exemplo.js';

const hbars = (items, { fmt = (v) => v, empty = 'Sem dados ainda.' } = {}) => {
  if (!items.length) return `<p class="hint pad">${empty}</p>`;
  const max = Math.max(...items.map((i) => i.value), 0.0001);
  return `<div class="hbars">${items.map((i) => `<div class="hb"><div class="hb-l"><span>${esc(i.label)}</span><b>${i.display ?? fmt(i.value)}</b></div>
    <div class="hb-t"><div class="hb-f" style="width:${Math.max(2, (i.value / max) * 100)}%;--c:${i.color || 'var(--accent)'}"></div></div>${i.sub ? `<small>${esc(i.sub)}</small>` : ''}</div>`).join('')}</div>`;
};

function monthChart(sales) {
  const by = new Map();
  sales.forEach((v) => { if (v.data) { const k = v.data.slice(0, 7); by.set(k, (by.get(k) || 0) + (+v.total || 0)); } });
  if (!by.size) return '<p class="hint pad">Sem vendas pagas ainda.</p>';
  const keys = [...by.keys()].sort(), first = keys[0], last = today().slice(0, 7) > keys.at(-1) ? today().slice(0, 7) : keys.at(-1);
  const months = []; let [y, m] = first.split('-').map(Number);
  while (`${y}-${String(m).padStart(2, '0')}` <= last && months.length < 24) { months.push(`${y}-${String(m).padStart(2, '0')}`); if (++m > 12) { m = 1; y++; } }
  const shown = months.slice(-8), max = Math.max(...shown.map((k) => by.get(k) || 0), 1);
  const W = 420, H = 190, pad = 26, bw = (W - 2 * pad) / shown.length;
  return `<svg class="mchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Receita por mês">
    <defs><linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2dd4bf"/><stop offset="1" stop-color="#14877a"/></linearGradient></defs>
    <line x1="${pad / 2}" x2="${W - pad / 2}" y1="${H - 26}" y2="${H - 26}" stroke="var(--line)"/>
    ${shown.map((k, i) => {
      const v = by.get(k) || 0, h = Math.max(v ? 4 : 0, (v / max) * (H - 70)), x = pad + i * bw + bw * 0.18, w = bw * 0.64, yy = H - 26 - h;
      return `<g><rect x="${x}" y="${yy}" width="${w}" height="${h}" rx="6" fill="url(#gb)"><title>${monthLabel(k)}: ${brl(v)}</title></rect>
        <text x="${x + w / 2}" y="${yy - 7}" text-anchor="middle" class="cv">${v ? brl(v).replace('R$', '').trim().replace(',00', '') : ''}</text>
        <text x="${x + w / 2}" y="${H - 8}" text-anchor="middle" class="cl">${monthLabel(k)}</text></g>`;
    }).join('')}</svg>`;
}

export function render(root) {
  root.innerHTML = `<header class="view-head"><div><h1>Dashboard</h1><p class="sub">Visão geral da operação</p></div></header><div id="d-body"></div>`;
  const body = $('#d-body');

  function draw() {
    const s = get();
    if (!s.clients.length && !s.sales.length) { body.innerHTML = emptyState({ ic: 'chart', title: 'Sem dados para mostrar', text: 'Cadastre lojas e vendas, importe seus CSVs ou veja o painel com dados fictícios.', action: '<div class="btnrow center"><button class="btn primary" id="d-demo">Carregar exemplo</button></div>' }); return; }
    const receita = s.sales.reduce((a, v) => a + (+v.total || 0), 0), lucro = s.sales.reduce((a, v) => a + (+v.lucro || 0), 0);
    const aReceber = s.clients.reduce((a, c) => a + (+c.aReceber || 0), 0);
    const n = (sit) => s.clients.filter((c) => c.situacao === sit).length;
    const pagas = n('Adquirido e pago'), den = n('Visitado - a verificar') + n('Fechou - a pagar') + pagas + n('Sem interesse');
    const conv = den ? pagas / den : 0;
    const stats = statsByLoja(s);
    const rank = [...stats].map(([k, v]) => ({ label: s.clients.find((c) => norm(c.loja) === k)?.loja || s.sales.find((x) => norm(x.loja) === k)?.loja || k, value: v.receita, sub: `${v.placas} placa(s)` }))
      .sort((a, b) => b.value - a.value).slice(0, 8);
    const bairros = new Map();
    s.sales.forEach((v) => { const c = s.clients.find((x) => norm(x.loja) === norm(v.loja)); const b = c?.bairro || 'Sem bairro'; bairros.set(b, (bairros.get(b) || 0) + (+v.total || 0)); });
    const P = buildPatterns(s);
    const cats = [...P.byCat.values()].filter((o) => o.visited).sort((a, b) => b.rate - a.rate || b.visited - a.visited)
      .map((o) => ({ label: catLabel(o.id), value: o.rate, display: pct(o.rate), sub: `${o.bought} de ${o.visited} visitas fecharam`, color: '#a78bfa' }));
    const funil = SITUACOES.map((x) => ({ label: SIT[x].short === 'Pago' ? 'Adquirido e pago' : x, value: n(x), color: SIT[x].color }));

    body.innerHTML = `
    <div class="stats">
      <div class="stat"><span class="stat-ic">${icon('cash')}</span><small>Receita</small><b>${brl(receita)}</b><em>Lucro ${brl(lucro)}</em></div>
      <div class="stat warn"><span class="stat-ic">${icon('flag')}</span><small>A receber</small><b>${brl(aReceber)}</b><em>${n('Fechou - a pagar')} loja(s) a pagar</em></div>
      <div class="stat ok"><span class="stat-ic">${icon('check')}</span><small>Lojas pagas</small><b>${pagas}</b><em>de ${s.clients.length} cadastradas</em></div>
      <div class="stat"><span class="stat-ic">${icon('funnel')}</span><small>Taxa de conversão</small><b>${pct(conv)}</b><em>${pagas} / ${den} (visitadas + fechadas + pagas + sem interesse)</em></div>
    </div>
    <div class="grid2">
      <section class="card"><div class="card-h"><h2>Funil</h2></div>${hbars(funil, { fmt: (v) => v })}</section>
      <section class="card"><div class="card-h"><h2>Receita por mês</h2></div>${monthChart(s.sales)}</section>
      <section class="card"><div class="card-h"><h2>Ranking de lojas</h2></div>${hbars(rank, { fmt: brl, empty: 'Sem vendas pagas ainda.' })}</section>
      <section class="card"><div class="card-h"><h2>Receita por bairro</h2></div>${hbars([...bairros].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value })), { fmt: brl, empty: 'Sem vendas pagas ainda.' })}</section>
      <section class="card span2"><div class="card-h"><h2>Conversão por categoria</h2><small class="hint">fecharam (pago ou a pagar) ÷ visitaram</small></div>${hbars(cats, { empty: 'Registre visitas para ver a conversão.' })}
        <p class="hint pad">${icon('info', 14)} Amostra pequena: os percentuais melhoram conforme você registra mais vendas e recusas.</p></section>
    </div>`;
  }
  root.addEventListener('click', (e) => { if (e.target.closest('#d-demo')) { replace(EXEMPLO()); toast('Dados fictícios carregados.', 'ok'); } });
  draw();
  return { destroy: subscribe(draw) };
}
