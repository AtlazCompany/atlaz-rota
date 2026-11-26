// Utilidades gerais: formatação pt-BR, datas, geometria.
export const SITUACOES = ['Sugerido para visitar', 'Agendado', 'Visitado - a verificar', 'Fechou - a pagar', 'Adquirido e pago', 'Sem interesse'];
export const SIT = {
  'Sugerido para visitar': { color: '#a78bfa', short: 'Sugerido', icon: 'star' },
  'Agendado': { color: '#60a5fa', short: 'Agendado', icon: 'calendar' },
  'Visitado - a verificar': { color: '#facc15', short: 'Visitado', icon: 'eye' },
  'Fechou - a pagar': { color: '#fb923c', short: 'A pagar', icon: 'cash' },
  'Adquirido e pago': { color: '#34d399', short: 'Pago', icon: 'check' },
  'Sem interesse': { color: '#94a3b8', short: 'Sem interesse', icon: 'x' },
};
export const FORMAS_PGTO = ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Transferência'];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const pct = (n) => (isFinite(n) ? Math.round(n * 100) : 0) + '%';
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
export function parseDate(s) {
  s = String(s ?? '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return '';
}
export function parseMoney(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/[R$\s]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
export function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+m - 1] + '/' + y.slice(2);
}

const ADDR_MAP = { av: 'avenida', r: 'rua', pca: 'praca', tv: 'travessa', al: 'alameda', rod: 'rodovia' };
const ADDR_DROP = new Set(['numero', 'n', 'no', 'sn', 's']);
export function normAddr(s) {
  return norm(s).split(' ').filter((t) => !ADDR_DROP.has(t)).map((t) => ADDR_MAP[t] || t).join(' ');
}

export function download(name, text, mime = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ---------- Geometria (pontos como [lat, lng]) ----------
export function haversine(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function proj(p, o) { return [(p[1] - o[1]) * Math.cos(o[0] * Math.PI / 180) * 111320, (p[0] - o[0]) * 110540]; }
/** Distância (m) de um ponto a uma polilinha e posição acumulada ao longo dela. */
export function projectOnPath(pt, path) {
  let best = { dist: Infinity, along: 0 }, acc = 0;
  if (path.length === 1) return { dist: haversine(pt, path[0]), along: 0 };
  for (let i = 0; i < path.length - 1; i++) {
    const A = proj(path[i], pt), B = proj(path[i + 1], pt); // pt vira a origem
    const dx = B[0] - A[0], dy = B[1] - A[1], len2 = dx * dx + dy * dy;
    let t = len2 ? -(A[0] * dx + A[1] * dy) / len2 : 0;
    t = clamp(t, 0, 1);
    const d = Math.hypot(A[0] + t * dx, A[1] + t * dy), segLen = Math.sqrt(len2);
    if (d < best.dist) best = { dist: d, along: acc + t * segLen };
    acc += segLen;
  }
  return best;
}
export function distToLines(pt, lines) {
  return Math.min(...lines.map((l) => projectOnPath(pt, l).dist));
}
