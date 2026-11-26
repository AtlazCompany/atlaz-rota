// Componentes de UI: toast, modal, confirmação, estados vazios/carregando.
import { esc, SIT } from './util.js';
import { icon } from './icons.js';

export function toast(msg, type = 'info', ms = 3800) {
  let host = document.getElementById('toasts');
  if (!host) { host = Object.assign(document.createElement('div'), { id: 'toasts' }); document.body.appendChild(host); }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.setAttribute('role', 'status');
  t.innerHTML = `${icon(type === 'error' ? 'warn' : type === 'ok' ? 'check' : 'info', 18)}<span>${esc(msg)}</span>`;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 250); }, ms);
}

/** Modal/sheet. actions: [{label, cls, onClick(close, ctx)}]. body: string HTML ou Node. */
export function modal({ title, body, actions = [], wide = false, onMount }) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="sheet${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="sheet-h"><h3>${esc(title)}</h3><button class="btn icon ghost" data-x aria-label="Fechar">${icon('x')}</button></div>
    <div class="sheet-b"></div><div class="sheet-f"></div></div>`;
  const bodyEl = ov.querySelector('.sheet-b'), foot = ov.querySelector('.sheet-f');
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  const prevFocus = document.activeElement;
  const close = () => {
    ov.classList.remove('in');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => ov.remove(), 200);
    prevFocus?.focus?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  ov.querySelector('[data-x]').onclick = close;
  const ctx = { el: ov, body: bodyEl, close };
  if (!actions.length) foot.remove();
  actions.forEach((a) => {
    const b = document.createElement('button');
    b.className = `btn ${a.cls || ''}`; b.textContent = a.label; b.type = 'button';
    b.onclick = () => a.onClick(close, ctx);
    foot.appendChild(b);
  });
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('in'));
  onMount?.(ctx);
  setTimeout(() => bodyEl.querySelector('input:not([type=hidden]),select,textarea')?.focus({ preventScroll: true }), 60);
  return ctx;
}

export function confirmBox({ title = 'Confirmar', message, ok = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    const m = modal({
      title, body: `<p class="msg">${message}</p>`,
      actions: [
        { label: 'Cancelar', cls: 'ghost', onClick: (c) => { fin(false); c(); } },
        { label: ok, cls: danger ? 'danger' : 'primary', onClick: (c) => { fin(true); c(); } },
      ],
    });
    m.el.querySelector('[data-x]').addEventListener('click', () => fin(false));
    m.el.addEventListener('mousedown', (e) => { if (e.target === m.el) fin(false); });
  });
}

export const emptyState = ({ ic = 'pin', title, text = '', action = '' }) =>
  `<div class="empty"><div class="empty-ic">${icon(ic, 30)}</div><h3>${esc(title)}</h3><p>${text}</p>${action}</div>`;

export const skeleton = (n = 3) => Array.from({ length: n }, () => '<div class="skel card-skel"></div>').join('');

/** Chip colorido de situação. */
export const sitChip = (sit) => {
  const s = SIT[sit];
  return s ? `<span class="chip sm" style="--c:${s.color}"><i class="dot"></i>${esc(s.short)}</span>` : '';
};
