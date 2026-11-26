// Aba Vendas: histórico (só vendas pagas) + pendências "A receber" com "Marcar como pago".
import { $, esc, brl, fmtDate, norm } from '../util.js';
import { icon } from '../icons.js';
import { get, subscribe, removeSale, replaceAll } from '../store.js';
import { toast, emptyState, confirmBox } from '../ui.js';
import { saleForm, payModal } from '../forms.js';
import { EXEMPLO } from '../../data/exemplo.js';

export function render(root) {
  root.innerHTML = `
    <header class="view-head"><div><h1>Vendas</h1><p class="sub" id="s-sub"></p></div>
      <div class="actions"><button class="btn primary" id="s-add">${icon('plus', 18)}<span>Venda</span></button></div></header>
    <div id="s-pend"></div><div id="s-hist"></div>`;

  function draw() {
    const s = get();
    const pend = s.clients.filter((c) => c.situacao === 'Fechou - a pagar' || c.aReceber > 0);
    const total = s.sales.reduce((a, v) => a + (+v.total || 0), 0), lucro = s.sales.reduce((a, v) => a + (+v.lucro || 0), 0);
    $('#s-sub').textContent = `${s.sales.length} venda(s) paga(s) · ${brl(total)} · lucro ${brl(lucro)}`;
    $('#s-pend').innerHTML = pend.length ? `<section class="card pend"><div class="card-h"><h2>A receber <span class="count">${pend.length}</span></h2><b class="warn">${brl(pend.reduce((a, c) => a + (+c.aReceber || 0), 0))}</b></div>
      ${pend.map((c) => `<div class="prow"><div><b>${esc(c.loja)}</b><span class="kc-sub">${esc(c.pedidoAberto || 'Pedido não informado')}${c.ultimaAcao ? ' · ' + fmtDate(c.ultimaAcao) : ''}</span></div>
        <b class="money">${brl(c.aReceber)}</b><button class="btn sm primary" data-pay="${esc(c.id)}">${icon('check', 16)} Marcar como pago</button></div>`).join('')}
      <p class="hint">Venda não paga não entra no histórico: fica aqui até você marcar como paga.</p></section>` : '';
    const hist = [...s.sales].sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    $('#s-hist').innerHTML = hist.length ? `<section class="card"><div class="card-h"><h2>Histórico</h2></div><div class="tbl-wrap"><table class="tbl sales">
      <thead><tr><th>Data</th><th>Loja</th><th>Produto</th><th class="r">Qtd</th><th class="r">Total</th><th class="r">Lucro</th><th>Pagamento</th><th></th></tr></thead><tbody>
      ${hist.map((v) => `<tr><td data-l="Data">${fmtDate(v.data)}</td><td data-l="Loja"><b>${esc(v.loja)}</b>${s.clients.some((c) => norm(c.loja) === norm(v.loja)) ? '' : ' <span class="tag warn">loja não cadastrada</span>'}</td><td data-l="Produto">${esc(v.produto)}<span class="only-m"> × ${v.qtd}</span></td><td class="r" data-l="Qtd">${v.qtd}</td><td class="r money" data-l="Total">${brl(v.total)}</td><td class="r" data-l="Lucro">${brl(v.lucro)}</td><td data-l="Pagamento">${esc(v.pagamento)}</td>
      <td class="r"><button class="btn icon ghost sm" data-del="${esc(v.id)}" aria-label="Excluir venda">${icon('trash', 16)}</button></td></tr>`).join('')}</tbody></table></div></section>`
      : (pend.length ? '' : emptyState({ ic: 'cash', title: 'Nenhuma venda registrada', text: 'Quando uma loja pagar, use “Marcar como pago” ou registre a venda aqui.', action: '<div class="btnrow center"><button class="btn primary" id="s-add2">+ Venda</button><button class="btn" id="s-demo">Carregar exemplo</button></div>' }));
  }
  root.addEventListener('click', async (e) => {
    if (e.target.closest('#s-add') || e.target.closest('#s-add2')) return saleForm();
    if (e.target.closest('#s-demo')) { replaceAll(EXEMPLO()); return toast('Dados fictícios carregados.', 'ok'); }
    const p = e.target.closest('[data-pay]'); if (p) return payModal(p.dataset.pay);
    const d = e.target.closest('[data-del]');
    if (d && await confirmBox({ title: 'Excluir venda', message: 'Excluir esta venda do histórico? Isso reduz a receita.', ok: 'Excluir', danger: true })) { removeSale(d.dataset.del); toast('Venda excluída.', 'ok'); }
  });
  draw();
  return { destroy: subscribe(draw) };
}
