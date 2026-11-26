// Aba Clientes: tabela pesquisável com edição inline, agrupada por pessoa, aviso de possível duplicidade.
import { SITUACOES, SIT, $, $$, esc, brl, norm, normAddr, fmtDate, parseMoney, debounce } from '../util.js';
import { icon } from '../icons.js';
import { get, subscribe, patchClient, statsByLoja, replaceAll } from '../store.js';
import { toast, emptyState } from '../ui.js';
import { clientForm, payModal } from '../forms.js';
import { EXEMPLO } from '../../data/exemplo.js';

export function render(root) {
  let q = '', skip = false;
  root.innerHTML = `
    <header class="view-head"><div><h1>Clientes</h1><p class="sub" id="c-sub"></p></div>
      <div class="actions"><button class="btn primary" id="c-add">${icon('plus', 18)}<span>Loja</span></button></div></header>
    <div class="searchbar">${icon('search', 18)}<input id="c-q" type="search" placeholder="Buscar loja, pessoa, bairro, endereço…" aria-label="Buscar clientes"></div>
    <div id="c-list" class="clist"></div>`;

  const hay = (c) => norm([c.loja, c.pessoa, c.endereco, c.bairro, c.situacao, c.telefone, c.obs].join(' '));
  const inp = (c, name, label, extra = '') => `<label class="cf ${name}"><span>${label}</span><input data-f="${name}" value="${esc(c[name])}" ${extra}></label>`;

  function row(c, st, dupOf) {
    const s = SIT[c.situacao];
    return `<div class="crow" data-id="${esc(c.id)}" style="--c:${s.color}">
      <div class="cr-top">
        ${inp(c, 'loja', 'Loja')}
        <label class="cf situacao"><span>Situação</span><select data-f="situacao">${SITUACOES.map((x) => `<option ${x === c.situacao ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      </div>
      ${dupOf.length ? `<div class="dup" title="Só um aviso: nada é apagado">${icon('warn', 14)} Possível duplicidade: mesmo endereço de ${dupOf.map(esc).join(', ')}</div>` : ''}
      ${inp(c, 'pessoa', 'Cliente (pessoa)')}
      ${inp(c, 'endereco', 'Endereço')}
      ${inp(c, 'bairro', 'Bairro')}
      ${inp(c, 'telefone', 'Telefone', 'inputmode="tel"')}
      <label class="cf aReceber"><span>A receber (R$)</span><input data-f="aReceber" inputmode="decimal" value="${c.aReceber ? String(c.aReceber).replace('.', ',') : ''}" placeholder="0,00"></label>
      ${inp(c, 'pedidoAberto', 'Pedido em aberto')}
      ${inp(c, 'obs', 'Observações')}
      <div class="cr-foot">
        <span class="tag mute">${st ? `${st.placas} placa(s) · ${brl(st.receita)}` : 'Sem compras'}</span>
        <span class="tag mute">Última ação: ${fmtDate(c.ultimaAcao) || '—'}</span>
        ${c.lat == null ? '<span class="tag warn">sem localização</span>' : ''}
        <span class="grow"></span>
        ${c.situacao === 'Fechou - a pagar' ? `<button class="btn sm primary" data-act="pay">${icon('check', 16)} Marcar como pago</button>` : ''}
        <button class="btn sm ghost" data-act="edit">${icon('edit', 16)} Detalhes</button>
      </div></div>`;
  }

  function draw() {
    const s = get(), stats = statsByLoja(s);
    $('#c-sub').textContent = `${s.clients.length} loja(s) · a receber ${brl(s.clients.reduce((a, c) => a + (+c.aReceber || 0), 0))}`;
    const list = $('#c-list');
    if (!s.clients.length) { list.innerHTML = emptyState({ ic: 'users', title: 'Nenhum cliente ainda', text: 'Adicione a primeira loja ou importe o CSV da aba Clientes em Configurações.', action: '<div class="btnrow center"><button class="btn primary" id="c-add2">+ Loja</button><button class="btn" id="c-demo">Carregar exemplo</button></div>' }); return; }
    // possível duplicidade: mesmo endereço normalizado entre lojas DIFERENTES (só aviso)
    const byAddr = new Map();
    s.clients.forEach((c) => { const k = normAddr(c.endereco); if (k.length > 5) (byAddr.get(k) || byAddr.set(k, []).get(k)).push(c); });
    const dupOf = (c) => { const g = byAddr.get(normAddr(c.endereco)) || []; return g.filter((x) => x.id !== c.id && norm(x.loja) !== norm(c.loja)).map((x) => x.loja); };
    const nq = norm(q);
    const filt = s.clients.filter((c) => !nq || hay(c).includes(nq));
    if (!filt.length) { list.innerHTML = emptyState({ ic: 'search', title: 'Nada encontrado', text: `Nenhuma loja corresponde a “${esc(q)}”.` }); return; }
    // agrupa por pessoa (≥ 2 lojas) e soma o a receber do grupo
    const groups = new Map();
    filt.forEach((c) => { const k = norm(c.pessoa) || '__' + c.id; (groups.get(k) || groups.set(k, []).get(k)).push(c); });
    const ordered = [...groups.values()].sort((a, b) => (b.length > 1) - (a.length > 1) || a[0].loja.localeCompare(b[0].loja, 'pt-BR'));
    list.innerHTML = ordered.map((g) => {
      const rows = g.sort((a, b) => a.loja.localeCompare(b.loja, 'pt-BR')).map((c) => row(c, stats.get(norm(c.loja)), dupOf(c))).join('');
      if (g.length < 2) return rows;
      const todas = s.clients.filter((c) => norm(c.pessoa) === norm(g[0].pessoa));
      const soma = todas.reduce((a, c) => a + (+c.aReceber || 0), 0), rec = todas.reduce((a, c) => a + (stats.get(norm(c.loja))?.receita || 0), 0);
      return `<section class="cgroup"><div class="cg-h">${icon('users', 18)}<b>${esc(g[0].pessoa)}</b><span class="tag">${todas.length} lojas</span><span class="grow"></span>
        <span class="cg-sum">A receber do grupo <b class="${soma > 0 ? 'warn' : ''}">${brl(soma)}</b></span><span class="cg-sum">Receita <b>${brl(rec)}</b></span></div>${rows}</section>`;
    }).join('');
  }

  root.addEventListener('change', (e) => {
    const f = e.target.dataset?.f; if (!f) return;
    const id = e.target.closest('.crow').dataset.id, c = get().clients.find((x) => x.id === id);
    let v = e.target.value.trim();
    if (f === 'aReceber') v = parseMoney(v);
    if (f === 'loja') {
      if (!v) { e.target.value = c.loja; return toast('O nome da loja não pode ficar vazio.', 'error'); }
      if (get().clients.some((x) => x.id !== id && norm(x.loja) === norm(v))) { e.target.value = c.loja; return toast('Já existe uma loja com esse nome.', 'error'); }
      get().sales.forEach((s) => { if (norm(s.loja) === norm(c.loja)) s.loja = v; });
    }
    if (f === 'situacao' && v === 'Adquirido e pago' && c.aReceber > 0) { e.target.value = c.situacao; toast('Há valor a receber: registre o pagamento.', 'info'); return payModal(id); }
    // Campos que não mudam agrupamento/somas/aviso não redesenham a lista (preserva o foco ao teclar Tab).
    skip = !['situacao', 'pessoa', 'endereco', 'aReceber'].includes(f);
    patchClient(id, { [f]: v });
    skip = false;
    toast('Salvo.', 'ok', 1200);
  });
  root.addEventListener('click', (e) => {
    if (e.target.closest('#c-add') || e.target.closest('#c-add2')) return clientForm();
    if (e.target.closest('#c-demo')) { replaceAll(EXEMPLO()); return toast('Dados fictícios carregados.', 'ok'); }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.closest('.crow').dataset.id;
    if (b.dataset.act === 'pay') payModal(id);
    if (b.dataset.act === 'edit') clientForm({ client: get().clients.find((c) => c.id === id) });
  });
  $('#c-add').onclick = () => clientForm();
  $('#c-q').addEventListener('input', debounce((e) => { q = e.target.value; draw(); }, 150));

  draw();
  // Evita redesenhar enquanto o usuário digita num campo inline.
  const un = subscribe(() => { if (!skip) draw(); });
  return { destroy: un };
}
