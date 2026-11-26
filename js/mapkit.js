// Utilitários de mapa (Leaflet): criação, pinos, afastamento de pontos sobrepostos, popup.
import { SIT, esc, fmtDate, brl, sleep } from './util.js';
import { icon } from './icons.js';
import { TERESINA, geocodeAddress, gmapsPoint } from './geo.js';
import { get, mutate, getSettings } from './store.js';
import { toast, sitChip } from './ui.js';

// Os tiles raster gratuitos da CARTO (Voyager) passaram a devolver marca d'água "API KEY REQUIRED".
// Padrão: OpenStreetMap (sem chave). Quem tiver chave CARTO/MapTiler/Stadia cola o modelo de URL em Configurações.
export const DEFAULT_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export function createMap(el, { center = TERESINA, zoom = 13 } = {}) {
  const map = L.map(el, { zoomControl: false, preferCanvas: false }).setView(center, zoom);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  const url = getSettings().tileUrl || DEFAULT_TILES;
  const layer = L.tileLayer(url, { subdomains: 'abcd', maxZoom: 19, attribution: ATTR }).addTo(map);
  // Detecta falha de tiles (sem internet / bloqueio) e avisa claramente.
  let ok = 0, err = 0, shown = false;
  const banner = document.createElement('div');
  banner.className = 'tile-banner'; banner.hidden = true;
  banner.innerHTML = `${icon('warn', 18)}<div><b>Não consegui carregar o mapa.</b><br>Verifique sua conexão com a internet. Os pinos e dados continuam salvos.</div>`;
  map.getContainer().appendChild(banner);
  const show = () => { if (!shown && ok === 0) { shown = true; banner.hidden = false; } };
  layer.on('tileload', () => { ok++; if (shown) { banner.hidden = true; shown = false; } });
  layer.on('tileerror', () => { err++; if (err >= 3) show(); });
  setTimeout(show, 9000);
  return map;
}

export function pinIcon(sit, { dim = false } = {}) {
  const s = SIT[sit] || SIT['Sugerido para visitar'];
  return L.divIcon({
    className: 'pin-wrap', iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -20],
    html: `<div class="pin${dim ? ' dim' : ''}" style="--c:${s.color}">${icon(s.icon, 17)}</div>`,
  });
}
export const clusterIcon = (cluster) => L.divIcon({
  className: 'pin-wrap', iconSize: [42, 42], iconAnchor: [21, 21],
  html: `<div class="cluster">${cluster.getChildCount()}</div>`,
});
export function makeCluster() {
  return L.markerClusterGroup({ maxClusterRadius: 36, spiderfyOnMaxZoom: true, showCoverageOnHover: false, zoomToBoundsOnClick: true, iconCreateFunction: clusterIcon, spiderLegPolylineOptions: { weight: 1.5, color: '#3b82f6', opacity: 0.7 } });
}

/** Afasta levemente pinos no mesmo ponto (ex.: lojas do mesmo shopping), em anel de ~9 m. */
export function spread(items) {
  const groups = new Map();
  for (const it of items) { const k = it.lat.toFixed(5) + ',' + it.lng.toFixed(5); (groups.get(k) || groups.set(k, []).get(k)).push(it); }
  for (const g of groups.values()) {
    g.forEach((it, i) => {
      if (g.length === 1) { it._lat = it.lat; it._lng = it.lng; return; }
      const a = (2 * Math.PI * i) / g.length, r = 0.00008 + g.length * 0.000004;
      it._lat = it.lat + r * Math.sin(a); it._lng = it.lng + (r * Math.cos(a)) / Math.cos((it.lat * Math.PI) / 180);
    });
  }
  return items;
}

export function popupHTML(c) {
  const s = SIT[c.situacao];
  const rows = [
    c.pessoa && `<div class="pr"><span>Cliente</span>${esc(c.pessoa)}</div>`,
    c.endereco && `<div class="pr"><span>Endereço</span>${esc(c.endereco)}${c.bairro ? ' · ' + esc(c.bairro) : ''}${c.cidade && !/teresina/i.test(c.cidade) ? ' · ' + esc(c.cidade) : ''}</div>`,
    c.aReceber > 0 && `<div class="pr"><span>A receber</span><b>${brl(c.aReceber)}</b>${c.pedidoAberto ? ' · ' + esc(c.pedidoAberto) : ''}</div>`,
    c.ultimaAcao && `<div class="pr"><span>Última ação</span>${fmtDate(c.ultimaAcao)}</div>`,
    c.obs && `<div class="pr obs">${esc(c.obs)}</div>`,
  ].filter(Boolean).join('');
  const cand = c._cand;
  return `<div class="pop" style="--c:${s?.color || '#a78bfa'}">
    <div class="pop-h"><b>${esc(c.loja || c.nome)}</b>${sitChip(c.situacao)}</div>${rows}
    <div class="pop-a">
      <a class="btn sm primary" target="_blank" rel="noopener" href="${gmapsPoint(c.lat, c.lng)}">${icon('nav', 16)} Abrir no Google Maps</a>
      ${cand ? `<button class="btn sm" data-act="cand" data-id="${esc(c.id)}">Ver na rua</button>`
        : `<button class="btn sm" data-act="edit" data-id="${esc(c.id)}">${icon('edit', 16)} Editar</button>${c.situacao === 'Fechou - a pagar' ? `<button class="btn sm" data-act="pay" data-id="${esc(c.id)}">${icon('check', 16)} Pago</button>` : ''}`}
    </div></div>`;
}

/** Banner "toque no mapa" para posicionar um lugar. cb(latlng|null). */
export function pickOnMap(map, cb) {
  const host = map.getContainer();
  const bar = document.createElement('div');
  bar.className = 'pick-bar';
  bar.innerHTML = `${icon('pin', 18)}<span>Toque no mapa para posicionar o lugar</span><button class="btn sm ghost">Cancelar</button>`;
  host.appendChild(bar); host.classList.add('picking');
  const end = (v) => { host.classList.remove('picking'); bar.remove(); map.off('click', onClick); cb(v); };
  const onClick = (e) => end([e.latlng.lat, e.latlng.lng]);
  bar.querySelector('button').onclick = () => end(null);
  map.on('click', onClick);
}

/** Geocodifica, em fila (1 req/s), todas as lojas que ainda não têm coordenadas. */
export async function geocodePending(onProgress) {
  const todo = get().clients.filter((c) => c.lat == null && (c.endereco || c.bairro));
  let ok = 0, fail = 0;
  for (let i = 0; i < todo.length; i++) {
    const c = todo[i];
    onProgress?.(i + 1, todo.length, c.loja);
    try {
      const r = await geocodeAddress(c);
      if (r) { mutate((s) => { const x = s.clients.find((y) => y.id === c.id); if (x) { x.lat = r.lat; x.lng = r.lng; } }, { silent: i < todo.length - 1 }); ok++; } else fail++;
    } catch { fail++; await sleep(500); }
  }
  return { ok, fail, total: todo.length };
}
export const pendingGeocodeCount = () => get().clients.filter((c) => c.lat == null && (c.endereco || c.bairro)).length;
export const missingCoords = () => get().clients.filter((c) => c.lat == null).length;
export { toast };
