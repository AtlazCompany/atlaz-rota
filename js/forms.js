// Formulários compartilhados: cliente/lugar, marcar como pago, venda.
import { esc, SITUACOES, FORMAS_PGTO, today, parseMoney, brl, $, norm, fmtDate } from './util.js';
import { modal, toast, confirmBox } from './ui.js';
import { get, newClient, upsertClient, removeClient, patchClient, registrarPagamento, suggestAReceber, addSale, parsePedido } from './store.js';
import { geocodeAddress } from './geo.js';
import { icon } from './icons.js';

const opt = (list, sel) => list.map((o) => `<option ${o === sel ? 'selected' : ''}>${esc(o)}</option>`).join('');

/**
 * Cria/edita um cliente (loja). `pick(cb)` opcional: permite marcar a posição tocando no mapa.
 * `onSaved(cliente)` é chamado após salvar.
 */
export function clientForm({ client, defaults = {}, pick, onSaved } = {}) {
  const editing = !!client;
  const c = editing ? { ...client } : newClient(defaults);
  const body = `
  <form class="form" autocomplete="off">
    <label class="field"><span>Loja *</span><input name="loja" required value="${esc(c.loja)}" placeholder="Nome da loja"></label>
    <label class="field"><span>Cliente (pessoa)</span><input name="pessoa" value="${esc(c.pessoa)}" placeholder="Dona/dono — agrupa lojas da mesma pessoa"></label>
    <label class="field"><span>Endereço</span><input name="endereco" value="${esc(c.endereco)}" placeholder="Rua/Av., número"></label>
    <div class="row2">
      <label class="field"><span>Bairro</span><input name="bairro" value="${esc(c.bairro)}"></label>
      <label class="field"><span>Cidade - UF</span><input name="cidade" value="${esc(c.cidade || 'Teresina - PI')}" placeholder="Ex.: Timon - MA"></label>
    </div>
    <div class="row2">
      <label class="field"><span>Situação</span><select name="situacao">${opt(SITUACOES, c.situacao)}</select></label>
      <label class="field"><span>Telefone</span><input name="telefone" inputmode="tel" value="${esc(c.telefone)}"></label>
    </div>
    <div class="row2">
      <label class="field"><span>Pedido em aberto</span><input name="pedidoAberto" value="${esc(c.pedidoAberto)}" placeholder="Ex.: 2 × Placa NFC"></label>
      <label class="field"><span>A receber (R$)</span>
        <div class="inline"><input name="aReceber" inputmode="decimal" value="${c.aReceber ? String(c.aReceber).replace('.', ',') : ''}" placeholder="0,00">
        <button type="button" class="btn sm" data-suggest title="Sugerir pelo pedido × preços">Sugerir</button></div></label>
    </div>
    <label class="field"><span>Observações</span><textarea name="obs" rows="2">${esc(c.obs)}</textarea></label>
    <fieldset class="geo">
      <legend>Localização</legend>
      <div class="row2">
        <label class="field"><span>Latitude</span><input name="lat" inputmode="decimal" value="${c.lat ?? ''}" placeholder="-5.0892"></label>
        <label class="field"><span>Longitude</span><input name="lng" inputmode="decimal" value="${c.lng ?? ''}" placeholder="-42.8019"></label>
      </div>
      <div class="btnrow">
        <button type="button" class="btn sm" data-geo>${icon('search', 16)} Buscar pelo endereço</button>
        ${pick ? `<button type="button" class="btn sm" data-pick>${icon('pin', 16)} Marcar no mapa</button>` : ''}
        <span class="hint" data-geo-msg></span>
      </div>
    </fieldset>
  </form>`;
  const m = modal({
    title: editing ? 'Editar loja' : '+ Lugar', body, wide: true,
    actions: [
      ...(editing ? [{ label: 'Excluir', cls: 'danger ghost left', onClick: async (close) => {
        if (await confirmBox({ title: 'Excluir loja', message: `Excluir <b>${esc(c.loja)}</b> do app? As vendas dela continuam no histórico.`, ok: 'Excluir', danger: true })) { removeClient(c.id); toast('Loja excluída.', 'ok'); close(); onSaved?.(null); }
      } }] : []),
      { label: 'Cancelar', cls: 'ghost', onClick: (close) => close() },
      { label: 'Salvar', cls: 'primary', onClick: (close) => save(close) },
    ],
  });
  const f = $('form', m.body);
  const val = (n) => f.elements[n].value.trim();
  const msg = (t, bad) => { const el = $('[data-geo-msg]', m.body); el.textContent = t; el.className = 'hint' + (bad ? ' bad' : ''); };

  $('[data-suggest]', m.body).onclick = () => {
    const v = suggestAReceber(val('pedidoAberto'));
    if (v == null) return toast('Informe o pedido (ex.: 2 × Placa NFC) e tenha preços cadastrados.', 'error');
    f.elements.aReceber.value = String(v).replace('.', ',');
  };
  const doGeo = async () => {
    if (!val('endereco') && !val('bairro')) { msg('Preencha o endereço.', true); return false; }
    msg('Buscando…');
    try {
      const r = await geocodeAddress({ endereco: val('endereco'), bairro: val('bairro'), cidade: val('cidade') });
      if (!r) { msg('Não encontrei. Digite as coordenadas' + (pick ? ' ou marque no mapa.' : '.'), true); return false; }
      f.elements.lat.value = r.lat.toFixed(6); f.elements.lng.value = r.lng.toFixed(6);
      msg(r.precisao === 'endereço' ? 'Localização encontrada.' : `Achei só a ${r.precisao === 'rua' ? 'rua' : 'região do bairro'} (posição aproximada)${pick ? ': ajuste marcando no mapa.' : '.'}`); return true;
    } catch { msg('Falha ao consultar o Nominatim (internet?).', true); return false; }
  };
  $('[data-geo]', m.body).onclick = doGeo;
  if (pick) $('[data-pick]', m.body).onclick = () => {
    m.el.classList.remove('in'); m.el.style.display = 'none';
    pick((ll) => { m.el.style.display = ''; requestAnimationFrame(() => m.el.classList.add('in')); if (ll) { f.elements.lat.value = ll[0].toFixed(6); f.elements.lng.value = ll[1].toFixed(6); msg('Posição marcada no mapa.'); } });
  };

  async function save(close) {
    if (!val('loja')) { f.elements.loja.focus(); return toast('Informe o nome da loja.', 'error'); }
    const dup = get().clients.find((x) => x.id !== c.id && norm(x.loja) === norm(val('loja')));
    if (dup) return toast('Já existe uma loja com esse nome. Use um nome distinto (ex.: com o bairro).', 'error');
    if ((!val('lat') || !val('lng')) && (val('endereco') || val('bairro'))) await doGeo();
    const prev = c.situacao;
    const out = {
      ...c, loja: val('loja'), pessoa: val('pessoa'), endereco: val('endereco'), bairro: val('bairro'), cidade: val('cidade') || 'Teresina - PI',
      situacao: val('situacao'), telefone: val('telefone'), pedidoAberto: val('pedidoAberto'), aReceber: parseMoney(val('aReceber')), obs: val('obs'),
      lat: val('lat') ? parseFloat(val('lat').replace(',', '.')) : null, lng: val('lng') ? parseFloat(val('lng').replace(',', '.')) : null,
    };
    if (isNaN(out.lat) || isNaN(out.lng)) { out.lat = out.lng = null; }
    if (out.situacao !== prev) out.ultimaAcao = today();
    // Renomear loja: mantém o vínculo com as vendas existentes.
    if (editing && norm(c.loja) !== norm(out.loja)) get().sales.forEach((s) => { if (norm(s.loja) === norm(c.loja)) s.loja = out.loja; });
    // Venda não paga nunca entra em Vendas; pago com saldo a receber passa pelo fluxo "Marcar como pago".
    const querPago = out.situacao === 'Adquirido e pago' && out.aReceber > 0 && prev !== 'Adquirido e pago';
    if (querPago) out.situacao = 'Fechou - a pagar';
    upsertClient(out);
    close();
    if (querPago) { toast('Há valor a receber: registre o pagamento para criar a venda.', 'info'); payModal(out.id, { onDone: onSaved }); }
    else { toast(editing ? 'Loja atualizada.' : 'Lugar adicionado.', 'ok'); onSaved?.(out); }
  }
  return m;
}

/** "Marcar como pago": pede valor, data e forma; cria a venda e muda a situação. */
export function payModal(clientId, { onDone } = {}) {
  const c = get().clients.find((x) => x.id === clientId);
  if (!c) return;
  const sug = c.aReceber || suggestAReceber(c.pedidoAberto) || 0;
  const body = `<form class="form">
    <div class="note">${icon('info', 18)}<div><b>${esc(c.loja)}</b>${c.pedidoAberto ? ` · pedido: ${esc(c.pedidoAberto)}` : ''}<br>A receber: <b>${brl(c.aReceber)}</b></div></div>
    <label class="field"><span>Valor recebido (R$) *</span><input name="valor" inputmode="decimal" value="${sug ? String(sug).replace('.', ',') : ''}" required></label>
    <div class="row2">
      <label class="field"><span>Data do pagamento</span><input type="date" name="data" value="${today()}"></label>
      <label class="field"><span>Forma de pagamento</span><select name="forma">${opt(FORMAS_PGTO, 'Pix')}</select></label>
    </div>
    <p class="hint">Isso cria a venda em Vendas e muda a situação para “Adquirido e pago”. Se o valor for menor que o a receber, o saldo continua em aberto.</p>
  </form>`;
  return modal({
    title: 'Marcar como pago', body,
    actions: [
      { label: 'Cancelar', cls: 'ghost', onClick: (close) => close() },
      { label: 'Confirmar pagamento', cls: 'primary', onClick: (close, ctx) => {
        const f = $('form', ctx.body);
        const valor = parseMoney(f.elements.valor.value);
        if (!(valor > 0)) return toast('Informe o valor recebido.', 'error');
        const v = registrarPagamento(c.id, { valor, data: f.elements.data.value || today(), forma: f.elements.forma.value });
        close(); toast(`Pagamento de ${brl(valor)} registrado.`, 'ok'); onDone?.(v);
      } },
    ],
  });
}

/** Nova venda (já paga) pelo histórico de Vendas. */
export function saleForm({ onSaved } = {}) {
  const s = get();
  const body = `<form class="form">
    <label class="field"><span>Loja *</span><select name="loja">${s.clients.length ? s.clients.map((c) => `<option>${esc(c.loja)}</option>`).join('') : '<option value="">Cadastre uma loja primeiro</option>'}</select></label>
    <div class="row2">
      <label class="field"><span>Data</span><input type="date" name="data" value="${today()}"></label>
      <label class="field"><span>Pagamento</span><select name="pagamento">${opt(FORMAS_PGTO, 'Pix')}</select></label>
    </div>
    <div class="row2">
      <label class="field"><span>Produto</span><input name="produto" list="prods" value="${esc(s.prices.find((p) => !/combo|tripla/.test(norm(p.produto)))?.produto || 'Placa NFC')}"><datalist id="prods">${s.prices.map((p) => `<option>${esc(p.produto)}`).join('')}</datalist></label>
      <label class="field"><span>Qtd</span><input name="qtd" inputmode="numeric" value="1"></label>
    </div>
    <div class="row2">
      <label class="field"><span>Total (R$) *</span><input name="total" inputmode="decimal"></label>
      <label class="field"><span>Custo (R$)</span><input name="custo" inputmode="decimal" placeholder="0,00"></label>
    </div>
    <label class="field"><span>Observações</span><input name="obs"></label>
    <p class="hint">Só vendas pagas entram aqui. Venda não paga fica como “A receber” no cliente.</p>
  </form>`;
  const m = modal({
    title: 'Nova venda', body,
    actions: [
      { label: 'Cancelar', cls: 'ghost', onClick: (close) => close() },
      { label: 'Salvar', cls: 'primary', onClick: (close, ctx) => {
        const f = $('form', ctx.body); const total = parseMoney(f.elements.total.value); const qtd = parseInt(f.elements.qtd.value, 10) || 1;
        if (!f.elements.loja.value) return toast('Escolha a loja.', 'error');
        if (!(total > 0)) return toast('Informe o total.', 'error');
        const custo = parseMoney(f.elements.custo.value);
        addSale({ data: f.elements.data.value || today(), produto: f.elements.produto.value, qtd, preco: total / qtd, total, custo, lucro: total - custo, obs: f.elements.obs.value, pagamento: f.elements.pagamento.value, loja: f.elements.loja.value });
        const c = get().clients.find((x) => x.loja === f.elements.loja.value);
        if (c && c.situacao !== 'Adquirido e pago' && c.aReceber <= 0) patchClient(c.id, { situacao: 'Adquirido e pago' });
        close(); toast('Venda registrada.', 'ok'); onSaved?.();
      } },
    ],
  });
  return m;
}

export { fmtDate, parsePedido };
