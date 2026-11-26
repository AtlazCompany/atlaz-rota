// Aba Funil (Kanban): arrastar e soltar (mouse e toque) atualiza Situação e Última ação.
import { SITUACOES, SIT, $, $$, esc, brl, fmtDate } from '../util.js';
import { icon } from '../icons.js';
import { get, subscribe, patchClient, replaceAll } from '../store.js';
import { toast, emptyState } from '../ui.js';
import { clientForm, payModal } from '../forms.js';
import { EXEMPLO } from '../../data/exemplo.js';

export function render(root) {
  root.innerHTML = `
    <header class="view-head"><div><h1>Funil</h1><p class="sub">Arraste a loja para a próxima etapa. No celular, segure o ícone ⠿.</p></div>
      <div class="actions"><button class="btn primary" id="f-add">${icon('plus', 18)}<span>Lugar</span></button></div></header>
    <div id="board" class="board"></div>`;
  const board = $('#board');

  function draw() {
    const clients = get().clients;
    if (!clients.length) { board.innerHTML = emptyState({ ic: 'funnel', title: 'Funil vazio', text: 'Cadastre lojas no Mapa ou em Clientes para acompanhá-las por etapa.', action: '<div class="btnrow center"><button class="btn primary" id="f-add2">+ Lugar</button><button class="btn" id="f-demo">Carregar exemplo</button></div>' }); board.classList.add('is-empty'); return; }
    board.classList.remove('is-empty');
    board.innerHTML = SITUACOES.map((sit) => {
      const list = clients.filter((c) => c.situacao === sit).sort((a, b) => (b.ultimaAcao || '').localeCompare(a.ultimaAcao || ''));
      const falta = list.reduce((a, c) => a + (+c.aReceber || 0), 0);
      return `<section class="kcol" data-sit="${esc(sit)}" style="--c:${SIT[sit].color}" aria-label="${esc(sit)}">
        <div class="kcol-h"><i class="dot"></i><b>${esc(sit)}</b><span class="count">${list.length}</span></div>
        ${falta ? `<div class="kcol-sub">A receber ${brl(falta)}</div>` : ''}
        <div class="kcol-b">${list.map(card).join('') || '<div class="kcol-empty">Arraste lojas para cá</div>'}</div></section>`;
    }).join('');
  }
  const card = (c) => `<article class="kcard" data-id="${esc(c.id)}">
    <button class="grip" aria-label="Arrastar ${esc(c.loja)}" title="Arrastar">${icon('grip', 18)}</button>
    <div class="kc-main"><b>${esc(c.loja)}</b>${c.pessoa ? `<span class="kc-sub">${esc(c.pessoa)}</span>` : ''}
      <div class="kc-meta">${c.aReceber > 0 ? `<span class="tag warn">${brl(c.aReceber)}</span>` : ''}${c.bairro ? `<span class="tag">${esc(c.bairro)}</span>` : ''}${c.ultimaAcao ? `<span class="tag mute">${fmtDate(c.ultimaAcao)}</span>` : ''}</div></div></article>`;

  // ---- arrastar e soltar por Pointer Events ----
  let drag = null, justDragged = false;
  board.addEventListener('pointerdown', (e) => {
    const cardEl = e.target.closest('.kcard');
    if (!cardEl || (e.pointerType !== 'mouse' && !e.target.closest('.grip')) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag = { cardEl, id: cardEl.dataset.id, x: e.clientX, y: e.clientY, on: false, ghost: null };
  });
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', cancel);
  function onMove(e) {
    if (!drag) return;
    if (!drag.on) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 7) return;
      drag.on = true;
      const r = drag.cardEl.getBoundingClientRect();
      drag.ox = e.clientX - r.left; drag.oy = e.clientY - r.top;
      const g = drag.cardEl.cloneNode(true); g.classList.add('ghost'); g.style.width = r.width + 'px';
      document.body.appendChild(g); drag.ghost = g;
      drag.cardEl.classList.add('src'); board.classList.add('dragging'); document.body.classList.add('no-select');
    }
    e.preventDefault();
    drag.ghost.style.transform = `translate(${e.clientX - drag.ox}px, ${e.clientY - drag.oy}px) rotate(2deg)`;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const col = el?.closest('.kcol');
    $$('.kcol', board).forEach((c) => c.classList.toggle('over', c === col));
    const br = board.getBoundingClientRect();
    if (e.clientX < br.left + 48) board.scrollLeft -= 14; else if (e.clientX > br.right - 48) board.scrollLeft += 14;
  }
  function cleanup() {
    drag?.ghost?.remove(); drag?.cardEl?.classList.remove('src');
    board.classList.remove('dragging'); document.body.classList.remove('no-select');
    $$('.kcol', board).forEach((c) => c.classList.remove('over'));
  }
  function cancel() { cleanup(); drag = null; }
  function onUp(e) {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.on) return;
    const col = document.elementFromPoint(e.clientX, e.clientY)?.closest('.kcol');
    drag = d; cleanup(); drag = null;
    justDragged = true; setTimeout(() => (justDragged = false), 50);
    if (!col) return;
    move(d.id, col.dataset.sit);
  }
  function move(id, sit) {
    const c = get().clients.find((x) => x.id === id);
    if (!c || c.situacao === sit) return;
    if (sit === 'Adquirido e pago' && c.aReceber > 0) { toast('Há valor a receber: registre o pagamento.', 'info'); return payModal(id); }
    patchClient(id, { situacao: sit });
    if (sit === 'Fechou - a pagar' && !(c.aReceber > 0)) {
      toast('Informe o pedido em aberto e o valor a receber.', 'info');
      clientForm({ client: get().clients.find((x) => x.id === id) });
    } else toast(`${c.loja} → ${sit}`, 'ok', 2200);
  }

  board.addEventListener('click', (e) => {
    if (justDragged) return;
    if (e.target.closest('#f-add2') ) return clientForm();
    if (e.target.closest('#f-demo')) { replaceAll(EXEMPLO()); return toast('Dados fictícios carregados.', 'ok'); }
    const cardEl = e.target.closest('.kcard');
    if (cardEl && !e.target.closest('.grip')) clientForm({ client: get().clients.find((c) => c.id === cardEl.dataset.id) });
  });
  $('#f-add').onclick = () => clientForm();

  draw();
  const un = subscribe(draw);
  return { destroy() { un(); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', cancel); cleanup(); } };
}
