// Aba Configurações: Apps Script/token (só localStorage), backup, importação CSV, dados.
import { $, esc } from '../util.js';
import { icon } from '../icons.js';
import { get, getSettings, saveSettings, replaceAll, subscribe } from '../store.js';
import { toast, confirmBox } from '../ui.js';
import { exportBackup, pickBackupFile, exportKML } from '../exporters.js';
import { IMPORTERS } from '../csv.js';
import { EXEMPLO } from '../../data/exemplo.js';
import { geocodePending, pendingGeocodeCount } from '../mapkit.js';
import { geocacheSize } from '../geo.js';
import { pull, pushWithWarning } from '../sync.js';

const IMPORTS = [
  { k: 'clientes', t: 'Clientes', d: 'Aba Clientes: Loja, Cliente, Endereço, Bairro, Situação, Telefone, Última ação, Observações, A receber, Pedido em aberto. Atualiza por nome da loja, nunca apaga.' },
  { k: 'leads', t: 'LEADS', d: 'Aba LEADS: Categoria, Estabelecimento, Bairro / Região, Prioridade, Status comercial. Usados para sugerir lugares nas Ruas.' },
  { k: 'vendas', t: 'Vendas', d: 'Aba Vendas: Data, Produto, Qtd, Preço unit., Total, Custo, Lucro, Obs, Pagamento, Cliente (loja). Ignora linhas repetidas.' },
  { k: 'precos', t: 'Preços', d: 'Aba Preços: Produto, Preço, Custo. Usada para sugerir o “A receber” (combo de 2 = preço da tabela de combo).' },
];

export function render(root) {
  const cfg = getSettings(), local = window.ATLAZ_CONFIG || {};
  root.innerHTML = `
    <header class="view-head"><div><h1>Configurações</h1><p class="sub">Seus dados ficam só neste navegador (localStorage).</p></div></header>
    <div class="grid2">
      <section class="card"><div class="card-h"><h2>${icon('sync', 18)} Sincronização com a planilha</h2></div>
        <p class="hint">URL e token ficam apenas neste navegador (ou em config.local.js), nunca no código nem no GitHub. Passo a passo no README.${local.appsScriptUrl ? ' <b>config.local.js detectado.</b>' : ''}</p>
        <form class="form" id="cfg-form" autocomplete="off">
          <label class="field"><span>URL do Apps Script (Web app)</span><input name="url" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(cfg.appsScriptUrl || '')}"></label>
          <label class="field"><span>Token secreto</span><input name="token" type="password" autocomplete="off" value="${esc(cfg.token || '')}"></label>
          <div class="btnrow"><button class="btn primary" type="submit">Salvar</button><button class="btn ghost" type="button" id="cfg-clear">Limpar</button></div>
          <div class="btnrow"><button class="btn" type="button" id="sy-pull">${icon('download', 16)} Baixar da planilha</button><button class="btn" type="button" id="sy-push">${icon('upload', 16)} Enviar para a planilha</button></div>
        </form></section>
      <section class="card"><div class="card-h"><h2>${icon('map', 18)} Mapa (tiles)</h2></div>
        <p class="hint">Padrão: OpenStreetMap, sem chave. Os tiles gratuitos da CARTO Voyager agora exigem chave (vêm com marca d'água). Se tiver uma chave CARTO, MapTiler ou Stadia, cole o modelo de URL abaixo (use {z}/{x}/{y}).</p>
        <form class="form" id="tile-form"><label class="field"><span>URL dos tiles (opcional)</span><input name="tile" placeholder="https://…/{z}/{x}/{y}.png?api_key=…" value="${esc(cfg.tileUrl || '')}"></label>
        <div class="btnrow"><button class="btn primary" type="submit">Salvar</button><button class="btn ghost" type="button" id="tile-clear">Usar padrão</button></div></form></section>
      <section class="card"><div class="card-h"><h2>${icon('download', 18)} Backup e restauração</h2></div>
        <p class="hint">Baixe um arquivo JSON com tudo (lojas, vendas, ruas, preços, leads). Não coloque esse arquivo no GitHub.</p>
        <div class="btnrow"><button class="btn primary" id="bk">${icon('download', 16)} Baixar backup</button><button class="btn" id="rs">${icon('upload', 16)} Restaurar backup</button><button class="btn" id="kml">Exportar KML</button></div></section>
      <section class="card span2"><div class="card-h"><h2>${icon('upload', 18)} Importar CSV</h2></div>
        <p class="hint">No Google Sheets: Arquivo → Fazer download → Valores separados por vírgula (.csv), da aba desejada. Aceita vírgula ou ponto e vírgula.</p>
        <div class="imports">${IMPORTS.map((i) => `<div class="imp"><div><b>${i.t}</b><p class="hint">${i.d}</p></div><label class="btn" tabindex="0">${icon('upload', 16)} Escolher CSV<input type="file" accept=".csv,text/csv" data-imp="${i.k}" hidden></label></div>`).join('')}</div></section>
      <section class="card"><div class="card-h"><h2>${icon('pin', 18)} Localização</h2></div>
        <p class="hint">Lojas importadas precisam de coordenadas para aparecer no mapa. A busca usa o Nominatim (1 consulta por segundo) e guarda o resultado em cache.</p>
        <div class="btnrow"><button class="btn primary" id="geo">Localizar lojas pendentes <span class="tag" id="geo-n"></span></button><button class="btn ghost" id="geo-clear">Limpar cache (${geocacheSize()})</button></div></section>
      <section class="card"><div class="card-h"><h2>${icon('store', 18)} Dados</h2></div>
        <p class="hint" id="counts"></p>
        <div class="btnrow"><button class="btn" id="demo">Carregar dados fictícios</button><button class="btn danger" id="wipe">Apagar tudo</button></div></section>
    </div>`;

  const counts = () => { const s = get(); $('#counts').textContent = `${s.clients.length} loja(s) · ${s.sales.length} venda(s) · ${s.streets.length} rua(s) · ${s.leads.length} lead(s) · ${s.prices.length} preço(s).`; $('#geo-n').textContent = pendingGeocodeCount() || ''; };
  counts();

  $('#cfg-form').onsubmit = (e) => { e.preventDefault(); const f = e.target; saveSettings({ ...getSettings(), appsScriptUrl: f.url.value.trim(), token: f.token.value.trim() }); toast('Configurações salvas neste navegador.', 'ok'); };
  $('#tile-form').onsubmit = (e) => { e.preventDefault(); saveSettings({ ...getSettings(), tileUrl: e.target.tile.value.trim() }); toast('Salvo. Abra o Mapa para ver.', 'ok'); };
  $('#tile-clear').onclick = () => { saveSettings({ ...getSettings(), tileUrl: '' }); $('#tile-form').reset(); toast('Voltou ao padrão (OpenStreetMap).', 'ok'); };
  $('#sy-pull').onclick = async (e) => { e.target.disabled = true; try { const r = await pull(); toast(`Baixado: ${r.novos} nova(s) e ${r.atual} atualizada(s) loja(s), ${r.vendas} venda(s) nova(s).`, 'ok', 6000); } catch (err) { toast(err.message, 'error', 7000); } e.target.disabled = false; counts(); };
  $('#sy-push').onclick = () => pushWithWarning();
  $('#cfg-clear').onclick = () => { saveSettings({ ...getSettings(), appsScriptUrl: '', token: '' }); $('#cfg-form').reset(); toast('Configurações removidas.', 'ok'); };
  $('#bk').onclick = exportBackup; $('#rs').onclick = pickBackupFile; $('#kml').onclick = exportKML;
  root.addEventListener('change', async (e) => {
    const k = e.target.dataset?.imp; if (!k) return;
    const file = e.target.files[0]; if (!file) return;
    try {
      const r = IMPORTERS[k](await file.text());
      toast(k === 'clientes' ? `Clientes: ${r.novos} novos, ${r.atualizados} atualizados.` : `${r.total} registro(s) importado(s).`, 'ok', 5000);
      if (k === 'clientes' && pendingGeocodeCount()) toast('Use “Localizar lojas pendentes” para colocá-las no mapa.', 'info', 6000);
    } catch (err) { toast('Falha ao importar: ' + err.message, 'error', 6000); }
    e.target.value = ''; counts();
  });
  let busy = false;
  $('#geo').onclick = async () => {
    if (busy) return; busy = true;
    if (!pendingGeocodeCount()) { busy = false; return toast('Nenhuma loja pendente.', 'info'); }
    const r = await geocodePending((i, n, nome) => toast(`Localizando ${i}/${n}: ${nome}`, 'info', 1200));
    busy = false; toast(`Localizadas: ${r.ok}. Sem resultado: ${r.fail}.`, r.fail ? 'error' : 'ok', 5000); counts();
  };
  $('#geo-clear').onclick = () => { localStorage.removeItem('atlaz.geocache.v1'); toast('Cache removido (recarregue a página).', 'ok'); };
  $('#demo').onclick = async () => {
    if (get().clients.length && !(await confirmBox({ title: 'Carregar exemplo', message: 'Isto <b>substitui</b> os dados atuais por dados fictícios. Faça backup antes. Continuar?', ok: 'Substituir', danger: true }))) return;
    replaceAll(EXEMPLO()); toast('Dados fictícios carregados.', 'ok');
  };
  $('#wipe').onclick = async () => {
    if (await confirmBox({ title: 'Apagar tudo', message: 'Apagar <b>todos</b> os dados deste navegador (lojas, vendas, ruas)? Não dá para desfazer sem um backup.', ok: 'Apagar tudo', danger: true })) { replaceAll({}); toast('Dados apagados.', 'ok'); }
  };
  return { destroy: subscribe(counts) };
}
