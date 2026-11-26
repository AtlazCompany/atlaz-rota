// Shell do app: navegação (hash router) e carregamento das telas.
import { icon } from './icons.js';
import { $, $$ } from './util.js';
import { get, subscribe } from './store.js';

const ROUTES = [
  { id: 'mapa', label: 'Mapa', ic: 'map', load: () => import('./views/map.js') },
  { id: 'funil', label: 'Funil', ic: 'funnel', load: () => import('./views/funnel.js') },
  { id: 'clientes', label: 'Clientes', ic: 'users', load: () => import('./views/clients.js') },
  { id: 'vendas', label: 'Vendas', ic: 'cash', load: () => import('./views/sales.js') },
  { id: 'ruas', label: 'Ruas', ic: 'route', load: () => import('./views/streets.js') },
  { id: 'dashboard', label: 'Dashboard', ic: 'chart', load: () => import('./views/dashboard.js') },
  { id: 'config', label: 'Config.', ic: 'settings', load: () => import('./views/settings.js'), side: true },
];
const link = (r, cls) => `<a href="#/${r.id}" data-route="${r.id}" class="${cls}" aria-label="${r.label}">${icon(r.ic, 22)}<span>${r.label}</span></a>`;
$('#nav-side').innerHTML = ROUTES.map((r) => link(r, 'nav-item')).join('');
$('#nav-bottom').innerHTML = ROUTES.filter((r) => !r.side).map((r) => link(r, 'tab')).join('');

const viewEl = $('#view');
let current = null, token = 0;

async function go() {
  const [, id = 'mapa', ...rest] = location.hash.replace(/^#/, '').split('/');
  const route = ROUTES.find((r) => r.id === id) || ROUTES[0];
  $$('[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === route.id));
  const my = ++token;
  try { current?.destroy?.(); } catch (e) { console.warn(e); }
  current = null;
  viewEl.className = `view v-${route.id}`;
  viewEl.innerHTML = '<div class="loading"><div class="skel card-skel"></div><div class="skel card-skel"></div></div>';
  try {
    const mod = await route.load();
    if (my !== token) return;
    viewEl.innerHTML = '';
    current = await mod.render(viewEl, rest);
    viewEl.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    viewEl.innerHTML = `<div class="empty"><h3>Algo deu errado</h3><p>${String(e.message || e).replace(/</g, '&lt;')}</p></div>`;
  }
}
window.addEventListener('hashchange', go);
if (!location.hash) location.hash = '#/mapa'; else go();

// Config local opcional (no .gitignore): window.ATLAZ_CONFIG = { appsScriptUrl, token }
import('../config.local.js').then((m) => { window.ATLAZ_CONFIG = m.default || {}; }).catch(() => {});

export { get, subscribe };
