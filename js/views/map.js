// Aba Mapa: pinos por situação, filtros nos contadores, + Lugar, KML, backup.
import { SITUACOES, SIT, $, $$, esc, brl } from '../util.js';
import { icon } from '../icons.js';
import { get, subscribe, isEmpty, replaceAll } from '../store.js';
import { toast, emptyState } from '../ui.js';
import { createMap, pinIcon, makeCluster, spread, popupHTML, pickOnMap, geocodePending, pendingGeocodeCount } from '../mapkit.js';
import { clientForm, payModal } from '../forms.js';
import { exportKML, exportBackup, pickBackupFile } from '../exporters.js';
import { EXEMPLO } from '../../data/exemplo.js';

export function render(root) {
  const filters = new Set();
  let showSug = true, fitted = false, busy = false;
  root.innerHTML = `
    <header class="view-head">
      <div><h1>Mapa</h1><p class="sub" id="map-sub"></p></div>
      <div class="actions">
        <button class="btn icon" id="b-locate" title="Minha localização" aria-label="Minha localização">${icon('locate')}</button>
        <button class="btn icon" id="b-kml" title="Exportar KML" aria-label="Exportar KML">${icon('download')}</button>
        <button class="btn icon" id="b-bkp" title="Backup JSON" aria-label="Backup JSON">${icon('upload')}</button>
        <button class="btn primary" id="b-add">${icon('plus', 18)}<span>Lugar</span></button>
      </div>
    </header>
    <div class="chips" id="chips" role="group" aria-label="Filtrar por situação"></div>
    <div id="map-notes"></div>
    <div class="map-wrap"><div id="map"></div><div id="map-empty"></div></div>`;

  const map = createMap($('#map'));
  const cluster = makeCluster(); map.addLayer(cluster);
  let meLayer = null;

  const pins = () => {
    const s = get();
    const list = s.clients.filter((c) => c.lat != null).map((c) => ({ ...c }));
    if (showSug) for (const st of s.streets) for (const k of st.candidates || []) {
      if (k.clientId || k.lat == null || k.situacao !== 'Sugerido para visitar') continue;
      list.push({ id: k.id, loja: k.nome, endereco: k.endereco, bairro: k.bairro, situacao: k.situacao, lat: k.lat, lng: k.lng, obs: `Sugerido na rua ${st.nome}`, _cand: st.id, ultimaAcao: '' });
    }
    return list;
  };

  function draw() {
    const s = get();
    const all = pins();
    // contadores (sempre sobre todos, filtro só afeta os pinos)
    const counts = Object.fromEntries(SITUACOES.map((x) => [x, 0]));
    all.forEach((p) => counts[p.situacao]++);
    $('#chips').innerHTML = SITUACOES.map((x) => `<button class="chip${filters.has(x) ? ' on' : ''}${filters.size && !filters.has(x) ? ' off' : ''}" style="--c:${SIT[x].color}" data-sit="${esc(x)}" aria-pressed="${filters.has(x)}"><i class="dot"></i>${SIT[x].short}<b>${counts[x]}</b></button>`).join('')
      + `<button class="chip toggle${showSug ? ' on' : ''}" id="t-sug" aria-pressed="${showSug}" title="Mostrar sugestões vindas das ruas">${icon('route', 14)}Sugestões de ruas</button>`;
    const sem = s.clients.filter((c) => c.lat == null).length;
    const pend = pendingGeocodeCount();
    const aReceber = s.clients.reduce((a, c) => a + (+c.aReceber || 0), 0);
    $('#map-sub').textContent = `${s.clients.length} loja(s)${aReceber ? ' · a receber ' + brl(aReceber) : ''}`;
    const aprox = s.clients.filter((c) => c.lat != null && c.geoPrec);
    const semList = s.clients.filter((c) => c.lat == null);
    const row = (c, txt) => `<div class="banner warn">${icon('warn', 18)}<span><b>${esc(c.loja)}</b> ${txt}</span><button class="btn sm" data-fix="${esc(c.id)}">Editar</button></div>`;
    $('#map-notes').innerHTML = (sem ? `<div class="banner warn">${icon('warn', 18)}<span>${sem} loja(s) sem localização no mapa.</span>${pend ? `<button class="btn sm" id="b-geo">${busy ? 'Localizando…' : 'Localizar pelo endereço'}</button>` : ''}</div>` + semList.map((c) => row(c, 'sem localização')).join('') : '')
      + aprox.map((c) => row(c, `posição aproximada (${c.geoPrec === 'bairro' ? 'só o bairro' : 'só a rua'}): confira no mapa`)).join('');
    // pinos
    cluster.clearLayers();
    const vis = spread(all.filter((p) => !filters.size || filters.has(p.situacao)));
    for (const p of vis) {
      const m = L.marker([p._lat, p._lng], { icon: pinIcon(p.situacao), title: p.loja, riseOnHover: true });
      m.bindPopup(() => popupHTML(p), { maxWidth: 300, minWidth: 230, className: 'atlaz-pop', autoPanPadding: [20, 70] });
      cluster.addLayer(m);
    }
    if (!fitted && vis.length) { fitted = true; const b = cluster.getBounds(); if (b.isValid()) map.fitBounds(b, { padding: [50, 50], maxZoom: 15 }); }
    $('#map-empty').innerHTML = isEmpty() ? `<div class="map-empty">${emptyState({ ic: 'pin', title: 'Seu mapa está vazio', text: 'Adicione um lugar, importe seus clientes por CSV (Configurações) ou veja o app com dados fictícios.', action: '<div class="btnrow center"><button class="btn primary" id="e-add">+ Lugar</button><button class="btn" id="e-demo">Carregar exemplo</button></div>' })}</div>` : '';
  }

  const startPick = (cb) => pickOnMap(map, cb);
  const add = () => clientForm({ pick: startPick });

  root.addEventListener('click', async (e) => {
    const chip = e.target.closest('[data-sit]');
    if (chip) { const k = chip.dataset.sit; filters.has(k) ? filters.delete(k) : filters.add(k); draw(); return; }
    const fix = e.target.closest('[data-fix]');
    if (fix) return clientForm({ client: get().clients.find((c) => c.id === fix.dataset.fix), pick: startPick });
    if (e.target.closest('#t-sug')) { showSug = !showSug; draw(); return; }
    if (e.target.closest('#b-add') || e.target.closest('#e-add')) return add();
    if (e.target.closest('#e-demo')) { replaceAll(EXEMPLO()); fitted = false; toast('Dados fictícios carregados.', 'ok'); return; }
    if (e.target.closest('#b-kml')) return exportKML();
    if (e.target.closest('#b-bkp')) return exportBackup();
    if (e.target.closest('#b-locate')) {
      if (!navigator.geolocation) return toast('Geolocalização indisponível.', 'error');
      navigator.geolocation.getCurrentPosition((p) => {
        const ll = [p.coords.latitude, p.coords.longitude];
        meLayer?.remove(); meLayer = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#3b82f6', fillOpacity: 1 }).addTo(map);
        map.setView(ll, 16);
      }, () => toast('Não consegui sua localização (permissão negada?).', 'error'), { enableHighAccuracy: true, timeout: 10000 });
      return;
    }
    if (e.target.closest('#b-geo') && !busy) {
      busy = true; draw();
      const r = await geocodePending((i, n, nome) => toast(`Localizando ${i}/${n}: ${nome}`, 'info', 1200));
      busy = false; fitted = false; draw();
      toast(`Localizadas: ${r.ok}. Sem resultado: ${r.fail}.`, r.fail ? 'error' : 'ok', 5000);
    }
  });
  // ações dentro do popup
  map.on('popupopen', (ev) => {
    ev.popup.getElement().addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const id = b.dataset.id; map.closePopup();
      if (b.dataset.act === 'edit') clientForm({ client: get().clients.find((c) => c.id === id), pick: startPick });
      if (b.dataset.act === 'pay') payModal(id);
      if (b.dataset.act === 'cand') location.hash = '#/ruas/' + (pins().find((p) => p.id === id)?._cand || '');
    });
  });

  draw();
  const un = subscribe(draw);
  // O contêiner só tem altura final após o layout: recalcula o tamanho e reenquadra os pinos.
  setTimeout(() => { map.invalidateSize(); const b = cluster.getBounds(); if (b.isValid()) map.fitBounds(b, { padding: [50, 50], maxZoom: 15 }); }, 160);
  return { destroy() { un(); map.remove(); } };
}
