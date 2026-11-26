// Aba Ruas: cadastro de rua, descoberta (OSM/Overpass), pontuação explicável, roteiro e ranking.
import { SIT, $, $$, esc, norm, uid, today, fmtDate, pct, projectOnPath, haversine } from '../util.js';
import { icon } from '../icons.js';
import { get, mutate, subscribe, newClient, upsertClient, patchClient, replaceAll } from '../store.js';
import { toast, modal, confirmBox, emptyState, sitChip } from '../ui.js';
import { findStreet, findCandidates, geocode, gmapsPoint } from '../geo.js';
import { buildPatterns, scoreCandidate, streetPotential, catLabel, LOCS } from '../scoring.js';
import { createMap, pinIcon, makeCluster, spread, popupHTML, pickOnMap } from '../mapkit.js';
import { clientForm, payModal } from '../forms.js';
import { EXEMPLO } from '../../data/exemplo.js';

const STATUS = ['A visitar', 'Em andamento', 'Concluída'];
const STATUS_COLOR = { 'A visitar': '#a78bfa', 'Em andamento': '#facc15', 'Concluída': '#34d399' };
const ACTIONS = [['Visitado - a verificar', 'Visitado'], ['Agendado', 'Agendado'], ['Fechou - a pagar', 'Fechou'], ['Sem interesse', 'Sem interesse']];
const scoreColor = (n) => (n >= 65 ? '#34d399' : n >= 40 ? '#facc15' : '#94a3b8');
const stChip = (s) => `<span class="chip sm" style="--c:${STATUS_COLOR[s]}"><i class="dot"></i>${s}</span>`;

export function render(root, params) {
  return params[0] ? renderDetail(root, params[0]) : renderList(root);
}

// ======================= LISTA / CADASTRO / RANKING =======================
function renderList(root) {
  root.innerHTML = `
    <header class="view-head"><div><h1>Ruas</h1><p class="sub">Planeje as ruas e avenidas que você vai percorrer.</p></div></header>
    <section class="card street-add"><form id="sf" class="form" autocomplete="off">
      <div class="sf-row">
        <label class="field grow"><span>Nova rua ou avenida</span><input name="nome" required placeholder="Ex.: Av. Jóquei Clube"></label>
        <label class="field"><span>Cidade - UF</span><input name="cidade" value="Teresina - PI"></label>
        <label class="field"><span>Status</span><select name="status">${STATUS.map((s) => `<option>${s}</option>`).join('')}</select></label>
        <label class="field"><span>Data</span><input type="date" name="data" value="${today()}"></label>
        <button class="btn primary" type="submit" id="sf-btn">${icon('search', 18)} Cadastrar rua</button>
      </div><p class="hint" id="sf-msg">Vou localizar a rua no mapa e desenhar o traçado. Funciona para Teresina e Timon.</p></form></section>
    <div id="rank"></div>`;

  const msg = (t, bad) => { const el = $('#sf-msg'); el.textContent = t; el.className = 'hint' + (bad ? ' bad' : ''); };
  $('#sf').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, btn = $('#sf-btn');
    const nome = f.nome.value.trim(), cidade = f.cidade.value.trim() || 'Teresina - PI';
    btn.disabled = true; btn.classList.add('loading'); msg('Procurando a rua no OpenStreetMap…');
    try {
      const r = await findStreet(nome, cidade);
      const dup = get().streets.find((s) => norm(s.nome) === norm(r.nome) && norm(s.cidade) === norm(cidade));
      if (dup) { toast('Essa rua já está cadastrada.', 'info'); location.hash = '#/ruas/' + dup.id; return; }
      const st = { id: uid(), nome: r.nome, cidade, status: f.status.value, data: f.data.value || today(), bairro: r.bairro, lines: r.lines, path: r.path, center: r.center, approx: r.approx, candidates: [], route: null };
      mutate((s) => s.streets.push(st));
      toast(r.approx ? 'Rua localizada, mas sem traçado detalhado (OSM indisponível).' : 'Rua cadastrada.', r.approx ? 'info' : 'ok');
      location.hash = '#/ruas/' + st.id;
    } catch (err) { msg(err.message, true); toast(err.message, 'error', 6000); }
    finally { btn.disabled = false; btn.classList.remove('loading'); }
  };

  function draw() {
    const s = get(), P = buildPatterns(s);
    const list = s.streets.map((st) => ({ st, pot: streetPotential(st, P) })).sort((a, b) => b.pot.total - a.pot.total);
    $('#rank').innerHTML = !list.length ? emptyState({ ic: 'route', title: 'Nenhuma rua planejada', text: 'Digite o nome de uma rua ou avenida acima. Eu desenho o traçado, procuro comércios ao longo dela e ranqueio os melhores para visitar.', action: '<button class="btn" id="r-demo">Carregar dados fictícios</button>' })
      : `<div class="card-h plain"><h2>Ranking por potencial</h2><small class="hint">soma das notas dos 8 melhores lugares ainda por visitar</small></div>
      <div class="rank">${list.map(({ st, pot }, i) => `<a class="rcard" href="#/ruas/${st.id}"><span class="pos">${i + 1}</span>
        <div class="rc-main"><b>${esc(st.nome)}</b><span class="kc-sub">${esc(st.bairro || st.cidade)} · ${fmtDate(st.data)}</span>
        <div class="kc-meta">${stChip(st.status)}<span class="tag">${pot.n} lugar(es)</span></div></div>
        <div class="pot"><b>${pot.total}</b><small>potencial</small></div>${icon('chevron', 18)}</a>`).join('')}</div>`;
  }
  root.addEventListener('click', (e) => { if (e.target.closest('#r-demo')) { replaceAll(EXEMPLO()); toast('Dados fictícios carregados. Cadastre uma rua para ver o ranking.', 'ok'); } });
  draw();
  return { destroy: subscribe(draw) };
}

// ======================= DETALHE DA RUA =======================
function renderDetail(root, id) {
  const getSt = () => get().streets.find((s) => s.id === id);
  if (!getSt()) { root.innerHTML = emptyState({ ic: 'route', title: 'Rua não encontrada', action: '<a class="btn primary" href="#/ruas">Voltar às ruas</a>' }); return; }
  root.innerHTML = `
    <header class="view-head"><div class="hd-left"><a class="btn icon ghost" href="#/ruas" aria-label="Voltar">${icon('back')}</a><div><h1 id="st-name"></h1><p class="sub" id="st-sub"></p></div></div>
      <div class="actions"><select id="st-status" aria-label="Status da rua"></select><input type="date" id="st-date" aria-label="Data"><button class="btn icon ghost danger" id="st-del" aria-label="Excluir rua">${icon('trash')}</button></div></header>
    <div class="map-wrap short"><div id="smap"></div></div>
    <div class="btnrow bar">
      <button class="btn primary" id="a-disc">${icon('search', 18)} Descobrir comércios</button>
      <button class="btn" id="a-leads">${icon('download', 18)} Importar dos LEADS</button>
      <button class="btn" id="a-add">${icon('plus', 18)} Lugar manual</button>
      <button class="btn" id="a-route">${icon('walk', 18)} Montar roteiro</button>
    </div>
    <div id="st-notes"></div><div id="st-route"></div>
    <div class="grid2 st-grid"><section class="card" id="st-cands"></section><section class="card" id="st-pat"></section></div>`;

  const map = createMap($('#smap'), { center: getSt().center, zoom: 16 });
  const cluster = makeCluster(); map.addLayer(cluster);
  const lineLayer = L.layerGroup().addTo(map), routeLayer = L.layerGroup().addTo(map);
  let fitted = false, busy = false;
  const open = new Set(); // candidatos com "por quê" aberto

  $('#st-status').innerHTML = STATUS.map((s) => `<option>${s}</option>`).join('');
  $('#st-status').onchange = (e) => mutate((s) => { getSt0(s).status = e.target.value; });
  $('#st-date').onchange = (e) => mutate((s) => { getSt0(s).data = e.target.value; });
  const getSt0 = (s) => s.streets.find((x) => x.id === id);

  const ctx = () => { const st = getSt(), P = buildPatterns(get()); return { st, P }; };
  const scored = (st, P) => st.candidates.map((c) => ({ c, sc: scoreCandidate(c, P) }));

  function drawMap(st, P) {
    lineLayer.clearLayers();
    st.lines.forEach((l) => { L.polyline(l, { color: '#fff', weight: 9, opacity: 0.85 }).addTo(lineLayer); L.polyline(l, { color: '#3b82f6', weight: 5, opacity: 1 }).addTo(lineLayer); });
    const routeIds = new Set(st.route?.ids || []);
    const routeClient = new Set(st.candidates.filter((c) => routeIds.has(c.id) && c.clientId).map((c) => c.clientId));
    const pts = [];
    for (const c of get().clients) {
      if (c.lat == null || routeClient.has(c.id)) continue;
      if (projectOnPath([c.lat, c.lng], st.path).dist <= 250) pts.push({ ...c });
    }
    for (const { c, sc } of scored(st, P)) {
      if (c.clientId || c.lat == null || routeIds.has(c.id)) continue;
      pts.push({ id: c.id, loja: c.nome, endereco: c.endereco, bairro: c.bairro, situacao: c.situacao, lat: c.lat, lng: c.lng, obs: `Nota ${sc.score}/100`, _cand: true, ultimaAcao: '' });
    }
    cluster.clearLayers();
    spread(pts).forEach((p) => {
      const m = L.marker([p._lat, p._lng], { icon: pinIcon(p.situacao), title: p.loja });
      m.bindPopup(() => popupHTML(p), { className: 'atlaz-pop', maxWidth: 300, minWidth: 230 });
      m.cid = p.id; cluster.addLayer(m);
    });
    routeLayer.clearLayers();
    if (st.route?.ids?.length) {
      const stops = routeStops(st);
      if (stops.length > 1) L.polyline(stops.map((x) => [x.c.lat, x.c.lng]), { color: '#a78bfa', weight: 3, dashArray: '6 8', opacity: 0.9 }).addTo(routeLayer);
      stops.forEach((x, i) => {
        const col = SIT[x.c.situacao]?.color || '#a78bfa';
        const m = L.marker([x.c.lat, x.c.lng], { icon: L.divIcon({ className: 'pin-wrap', iconSize: [30, 30], iconAnchor: [15, 15], html: `<div class="stopnum${x.c.clientId ? ' done' : ''}" style="--c:${col}">${i + 1}</div>` }), zIndexOffset: 800 }).addTo(routeLayer);
        m.bindPopup(() => popupHTML({ id: x.c.id, loja: x.c.nome, endereco: x.c.endereco, bairro: x.c.bairro, situacao: x.c.situacao, lat: x.c.lat, lng: x.c.lng, obs: `Parada ${i + 1} · nota ${x.sc.score}`, _cand: true }), { className: 'atlaz-pop', maxWidth: 300, minWidth: 230 });
      });
    }
    if (!fitted) { fitted = true; const b = L.latLngBounds(st.path); st.candidates.forEach((c) => c.lat != null && b.extend([c.lat, c.lng])); map.fitBounds(b, { padding: [30, 30], maxZoom: 17 }); }
  }

  function routeStops(st) {
    const P = buildPatterns(get());
    let ids = st.route?.ids || [];
    if (st.route?.rev) ids = [...ids].reverse();
    return ids.map((i) => st.candidates.find((c) => c.id === i)).filter((c) => c && c.lat != null).map((c) => ({ c, sc: scoreCandidate(c, P) }));
  }

  function draw() {
    const { st, P } = ctx(); if (!st) return;
    $('#st-name').textContent = st.nome;
    $('#st-sub').textContent = `${st.bairro ? st.bairro + ' · ' : ''}${st.cidade}`;
    $('#st-status').value = st.status; $('#st-date').value = st.data || '';
    const sc = scored(st, P).sort((a, b) => b.sc.score - a.sc.score || a.c.along - b.c.along);
    const pend = sc.filter((x) => !x.c.clientId);
    // avisos
    const notes = [];
    if (st.approx) notes.push(`<div class="banner warn">${icon('warn', 18)}<span>Não consegui o traçado detalhado desta rua (Overpass indisponível). A busca de comércios pode ficar imprecisa — tente descobrir de novo mais tarde.</span></div>`);
    if (st.discovered && st.osmCount < 5) notes.push(`<div class="banner info">${icon('info', 18)}<span><b>O OpenStreetMap tem pouco dado nesta rua</b> (${st.osmCount} comércio(s)). Adicione lugares manualmente ou importe dos seus LEADS do mesmo bairro.</span></div>`);
    $('#st-notes').innerHTML = notes.join('');

    // candidatos
    $('#st-cands').innerHTML = `<div class="card-h"><h2>Candidatos <span class="count">${pend.length}</span></h2><small class="hint">por nota de afinidade</small></div>` +
      (!sc.length ? emptyState({ ic: 'store', title: 'Nenhum candidato ainda', text: st.discovered ? 'Nada encontrado perto desta rua.' : 'Toque em “Descobrir comércios” para listar os comércios em até 30 m da rua.' })
        : `<div class="clist2">${sc.map(({ c, sc: s }, i) => cand(c, s, i, pend.indexOf(sc[i]))).join('')}</div>`);
    // padrão
    $('#st-pat').innerHTML = patternPanel(P);
    // roteiro
    drawRoute(st);
    drawMap(st, P);
  }

  function cand(c, s, i, rank) {
    const col = scoreColor(s.score), isOpen = open.has(c.id) || (rank === 0 && !c.clientId && !open.has('x' + c.id));
    const top = [...s.parts].sort((a, b) => b.pts / b.max - a.pts / a.max)[0];
    const done = !!c.clientId;
    return `<article class="cand${done ? ' done' : ''}" data-id="${esc(c.id)}">
      <div class="cand-h"><div class="score" style="--v:${s.score};--c:${col}"><b>${s.score}</b></div>
        <div class="cand-main"><b>${esc(c.nome)}</b><span class="kc-sub">${esc(c.categoriaOsm || catLabel(s.cat))}${c.endereco ? ' · ' + esc(c.endereco) : ''}${c.dist != null ? ' · ' + c.dist + ' m da rua' : ''}</span>
          <div class="kc-meta">${sitChip(c.situacao)}<span class="tag">${esc(catLabel(s.cat))}</span><span class="tag mute">${LOCS[s.loc]}</span>${c.approx ? '<span class="tag warn">posição aproximada</span>' : ''}${c.source === 'manual' ? '<span class="tag mute">manual</span>' : c.source === 'lead' ? '<span class="tag mute">LEAD</span>' : ''}</div></div>
        <button class="btn icon ghost sm" data-focus="${esc(c.id)}" aria-label="Ver no mapa">${icon('pin', 18)}</button></div>
      <button class="why-t" data-why="${esc(c.id)}" aria-expanded="${isOpen}">${rank === 0 && !done ? 'Por que este está no topo' : 'Por quê esta nota?'} <span>${icon('chevron', 14)}</span></button>
      <div class="why" ${isOpen ? '' : 'hidden'}><p class="why-sum">${esc(top.why)}</p>${s.parts.map((p) => `<div class="part"><div><span>${p.label}</span><b>${p.pts.toFixed(0)}/${p.max}</b></div><div class="hb-t"><div class="hb-f" style="width:${(p.pts / p.max) * 100}%;--c:${col}"></div></div><small>${esc(p.why)}</small></div>`).join('')}</div>
      <div class="cand-a">${ACTIONS.map(([sit, lab]) => `<button class="btn sm${c.situacao === sit ? ' primary' : ''}" data-set="${esc(sit)}" data-cid="${esc(c.id)}" style="--c:${SIT[sit].color}">${lab}</button>`).join('')}</div></article>`;
  }

  function patternPanel(P) {
    const rows = (m, lab) => [...m.values()].filter((o) => o.visited).sort((a, b) => b.rate - a.rate).map((o) => `<div class="hb"><div class="hb-l"><span>${esc(lab(o.id))}</span><b>${pct(o.rate)} <small>(${o.bought}/${o.visited})</small></b></div><div class="hb-t"><div class="hb-f" style="width:${Math.max(2, o.rate * 100)}%;--c:#a78bfa"></div></div></div>`).join('');
    const c = rows(P.byCat, catLabel), l = rows(P.byLoc, (k) => LOCS[k]);
    return `<div class="card-h"><h2>Padrão de aquisição</h2></div>
      ${c || l ? `<h4 class="mini">Conversão por categoria <small>comprou / visitou</small></h4><div class="hbars">${c}</div><h4 class="mini">Conversão por tipo de local</h4><div class="hbars">${l}</div>` : '<p class="hint">Ainda não há visitas registradas: todas as notas partem de um valor neutro.</p>'}
      <p class="hint warnbox">${icon('info', 14)} Amostra pequena: o ranking melhora conforme eu registro mais vendas e recusas.</p>`;
  }

  function drawRoute(st) {
    const r = st.route;
    if (!r?.ids?.length) { $('#st-route').innerHTML = ''; return; }
    const stops = routeStops(st);
    const links = gLinks(stops.map((x) => x.c));
    $('#st-route').innerHTML = `<section class="card route"><div class="card-h"><h2>${icon('walk', 18)} Roteiro a pé <span class="count">${stops.length}</span></h2>
      <div class="btnrow"><button class="btn sm" id="r-rev">Inverter sentido</button><button class="btn sm" id="r-copy">Copiar lista</button><button class="btn sm ghost danger" id="r-clear">Limpar</button></div></div>
      <ol class="stops">${stops.map((x, i) => `<li class="stop${x.c.clientId ? ' done' : ''}" data-id="${esc(x.c.id)}"><span class="stopnum" style="--c:${SIT[x.c.situacao].color}">${i + 1}</span>
        <div class="stop-main"><b>${esc(x.c.nome)}</b><span class="kc-sub">${esc(x.c.endereco || '')} · nota ${x.sc.score}</span></div>
        <div class="cand-a">${ACTIONS.map(([sit, lab]) => `<button class="btn sm icon-only${x.c.situacao === sit ? ' primary' : ''}" data-set="${esc(sit)}" data-cid="${esc(x.c.id)}" style="--c:${SIT[sit].color}" title="${esc(sit)}">${lab}</button>`).join('')}</div></li>`).join('')}</ol>
      <div class="btnrow">${links.map((u, i) => `<a class="btn primary" target="_blank" rel="noopener" href="${u}">${icon('nav', 16)} Abrir no Google Maps${links.length > 1 ? ' (parte ' + (i + 1) + ')' : ''}</a>`).join('')}</div>
      ${links.length > 1 ? '<p class="hint">O Google Maps aceita poucas paradas por link; o roteiro foi dividido em partes.</p>' : ''}</section>`;
  }
  function gLinks(cs) {
    if (!cs.length) return [];
    const pt = (c) => `${c.lat},${c.lng}`, out = [];
    for (let i = 0; i < cs.length; i += 9) {
      const chunk = cs.slice(i, i + 10);
      const u = new URL('https://www.google.com/maps/dir/');
      u.searchParams.set('api', '1'); u.searchParams.set('travelmode', 'walking');
      if (chunk.length === 1) { u.searchParams.set('destination', pt(chunk[0])); }
      else { u.searchParams.set('origin', pt(chunk[0])); u.searchParams.set('destination', pt(chunk.at(-1))); if (chunk.length > 2) u.searchParams.set('waypoints', chunk.slice(1, -1).map(pt).join('|')); }
      out.push(u.toString());
      if (i + 10 >= cs.length) break;
    }
    return out;
  }

  // ---- ações ----
  async function discover() {
    if (busy) return; busy = true;
    const b = $('#a-disc'); b.disabled = true; b.classList.add('loading'); b.lastChild.textContent = ' Consultando OSM…';
    try {
      const st = getSt(), found = await findCandidates(st, 30);
      const clients = get().clients;
      let novos = 0, jaCli = 0;
      mutate((s) => {
        const t = getSt0(s);
        for (const f of found) {
          if (clients.some((c) => norm(c.loja) === norm(f.nome))) { jaCli++; continue; }
          if (t.candidates.some((c) => c.osmId === f.osmId || (norm(c.nome) === norm(f.nome) && haversine([c.lat, c.lng], [f.lat, f.lng]) < 60))) continue;
          t.candidates.push({ id: uid(), source: 'osm', situacao: 'Sugerido para visitar', clientId: null, ...f }); novos++;
        }
        t.discovered = true; t.osmCount = found.length;
      });
      toast(`${novos} novo(s) candidato(s) encontrados${jaCli ? ` · ${jaCli} já são clientes` : ''}.`, novos ? 'ok' : 'info', 5000);
    } catch (e) { toast('Não consegui consultar o Overpass: ' + (e.message || e) + '. Tente de novo em instantes.', 'error', 7000); }
    finally { busy = false; b.disabled = false; b.classList.remove('loading'); b.lastChild.textContent = ' Descobrir comércios'; }
  }

  function leadsModal() {
    const st = getSt(), s = get(), core = norm(st.nome).replace(/^(avenida|rua|travessa|alameda|praca|rodovia)\s+/, '');
    const taken = new Set([...s.clients.map((c) => norm(c.loja)), ...st.candidates.map((c) => norm(c.nome))]);
    const free = s.leads.filter((l) => !taken.has(norm(l.nome)));
    if (!s.leads.length) return toast('Você ainda não importou LEADS. Vá em Configurações → Importar CSV.', 'info', 5000);
    if (!free.length) return toast('Todos os LEADS já foram importados ou já são clientes.', 'info', 5000);
    const isMatch = (l) => (st.bairro && norm(l.bairro) === norm(st.bairro)) || (core && norm(l.endereco).includes(core));
    const match = [...free.filter(isMatch), ...free.filter((l) => !isMatch(l))]; // mesmo bairro/rua primeiro
    const nMatch = free.filter(isMatch).length;
    const item = (l, i) => `<label class="check"><input type="checkbox" ${i < nMatch ? 'checked' : ''} data-i="${i}"><span><b>${esc(l.nome)}</b><small>${esc(l.categoria)}${l.bairro ? ' · ' + esc(l.bairro) : ''}${l.prioridade ? ' · prioridade ' + esc(l.prioridade) : ''}</small></span></label>`;
    const m = modal({
      title: 'Importar dos LEADS', wide: true,
      body: `<p class="hint">${nMatch ? `${nMatch} LEAD(s) no mesmo bairro (${esc(st.bairro || '—')}) ou citando esta rua, já marcados.` : `Nenhum LEAD no bairro “${esc(st.bairro || '—')}” (o OSM pode chamar o bairro de outro jeito). Marque os que ficam nesta rua.`} Vou localizar cada um (1 por segundo); se não achar, fica perto da rua como “aproximado”.</p>
        <div class="checks">${match.map(item).join('')}</div>`,
      actions: [{ label: 'Cancelar', cls: 'ghost', onClick: (c) => c() }, { label: 'Importar selecionados', cls: 'primary', onClick: async (close, ctxm) => {
        const sel = $$('input:checked', ctxm.body).map((x) => match[+x.dataset.i]); close();
        if (!sel.length) return;
        let n = 0;
        for (const [i, l] of sel.entries()) {
          toast(`Localizando ${i + 1}/${sel.length}: ${l.nome}`, 'info', 1400);
          let r = null;
          try { r = await geocode([l.nome, l.endereco || st.nome, st.bairro, st.cidade].filter(Boolean).join(', ')); } catch { /* segue p/ aproximado */ }
          const near = r && projectOnPath([r.lat, r.lng], st.path).dist < 600 ? r : null;
          const pos = near ? [near.lat, near.lng] : st.path[Math.min(st.path.length - 1, Math.floor(((i + 1) / (sel.length + 1)) * st.path.length))];
          mutate((s2) => getSt0(s2).candidates.push({ id: uid(), source: 'lead', situacao: 'Sugerido para visitar', clientId: null, nome: l.nome, categoria: '', categoriaOsm: l.categoria, endereco: l.endereco || '', bairro: l.bairro, lat: pos[0], lng: pos[1], approx: !near, extra: l.categoria }));
          n++;
        }
        toast(`${n} lead(s) importado(s).`, 'ok');
      } }],
    });
    return m;
  }

  function manualForm() {
    const st = getSt();
    const m = modal({
      title: 'Adicionar lugar manualmente',
      body: `<form class="form"><label class="field"><span>Nome *</span><input name="nome" required></label>
        <label class="field"><span>Tipo (opcional)</span><input name="cat" placeholder="Ex.: salão, pizzaria, semijoias"></label>
        <label class="field"><span>Endereço</span><input name="end" value="${esc(st.nome)}"></label>
        <p class="hint">Vou localizar pelo endereço. Se não achar, você toca no mapa para marcar.</p></form>`,
      actions: [{ label: 'Cancelar', cls: 'ghost', onClick: (c) => c() }, { label: 'Marcar no mapa', onClick: (close, c) => go(close, c, true) }, { label: 'Salvar', cls: 'primary', onClick: (close, c) => go(close, c, false) }],
    });
    async function go(close, c, forcePick) {
      const f = $('form', c.body), nome = f.nome.value.trim(); if (!nome) return toast('Informe o nome.', 'error');
      const base = { id: uid(), source: 'manual', situacao: 'Sugerido para visitar', clientId: null, nome, categoria: '', categoriaOsm: f.cat.value.trim() || 'Manual', endereco: f.end.value.trim(), bairro: st.bairro, extra: f.cat.value.trim() };
      const save = (ll) => { mutate((s) => getSt0(s).candidates.push({ ...base, lat: ll[0], lng: ll[1], dist: Math.round(projectOnPath(ll, st.path).dist) })); toast('Lugar adicionado.', 'ok'); map.setView(ll, 18); };
      close();
      if (!forcePick) { try { const r = await geocode([base.endereco, st.bairro, st.cidade].filter(Boolean).join(', ')); if (r && projectOnPath([r.lat, r.lng], st.path).dist < 400) return save([r.lat, r.lng]); } catch { /* cai no clique */ } toast('Não localizei o endereço: toque no mapa.', 'info'); }
      $('#smap').scrollIntoView({ behavior: 'smooth', block: 'center' });
      pickOnMap(map, (ll) => ll && save(ll));
    }
  }

  function buildRoute() {
    const { st, P } = ctx();
    const pool = scored(st, P).filter((x) => !x.c.clientId && x.c.situacao === 'Sugerido para visitar' && x.c.lat != null).sort((a, b) => b.sc.score - a.sc.score);
    if (!pool.length) return toast('Não há candidatos por visitar. Descubra comércios ou adicione lugares.', 'info');
    const n = Math.min(pool.length, 10);
    const ids = pool.slice(0, n).map((x) => ({ id: x.c.id, along: projectOnPath([x.c.lat, x.c.lng], st.path).along })).sort((a, b) => a.along - b.along).map((x) => x.id);
    mutate((s) => { getSt0(s).route = { ids, rev: false }; });
    toast(`Roteiro com os ${n} melhores, em ordem ao longo da rua.`, 'ok');
    $('#st-route').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setStatus(cid, sit) {
    const st = getSt(), c = st.candidates.find((x) => x.id === cid); if (!c) return;
    let clientId = c.clientId;
    if (!clientId) {
      const ex = get().clients.find((x) => norm(x.loja) === norm(c.nome));
      const cl = ex || newClient({ loja: c.nome, endereco: c.endereco, bairro: c.bairro, cidade: st.cidade, situacao: sit, lat: c.lat, lng: c.lng, obs: `Rua: ${st.nome}`, categoria: c.categoria || '' });
      if (!ex) upsertClient(cl); else patchClient(ex.id, { situacao: sit });
      clientId = cl.id;
    } else patchClient(clientId, { situacao: sit });
    mutate((s) => { const x = getSt0(s).candidates.find((y) => y.id === cid); x.clientId = clientId; x.situacao = sit; });
    toast(`${c.nome} → ${sit}`, 'ok', 2200);
    if (sit === 'Fechou - a pagar') { toast('Informe o pedido e o valor a receber.', 'info'); clientForm({ client: get().clients.find((x) => x.id === clientId) }); }
  }

  root.addEventListener('click', (e) => {
    const t = (sel) => e.target.closest(sel);
    if (t('#a-disc')) return discover();
    if (t('#a-leads')) return leadsModal();
    if (t('#a-add')) return manualForm();
    if (t('#a-route')) return buildRoute();
    if (t('#r-rev')) return mutate((s) => { const r = getSt0(s).route; r.rev = !r.rev; });
    if (t('#r-clear')) return mutate((s) => { getSt0(s).route = null; });
    if (t('#r-copy')) {
      const txt = routeStops(getSt()).map((x, i) => `${i + 1}. ${x.c.nome}${x.c.endereco ? ' — ' + x.c.endereco : ''} (${gmapsPoint(x.c.lat, x.c.lng)})`).join('\n');
      return navigator.clipboard?.writeText(txt).then(() => toast('Lista copiada.', 'ok'), () => toast('Não consegui copiar.', 'error'));
    }
    if (t('#st-del')) return confirmBox({ title: 'Excluir rua', message: `Excluir <b>${esc(getSt().nome)}</b> e seus candidatos? Lojas já marcadas (visitadas, agendadas…) continuam em Clientes.`, ok: 'Excluir', danger: true }).then((ok) => { if (ok) { mutate((s) => { s.streets = s.streets.filter((x) => x.id !== id); }); location.hash = '#/ruas'; } });
    const w = t('[data-why]');
    if (w) { const k = w.dataset.why, el = w.nextElementSibling; const showNow = el.hidden; el.hidden = !showNow; w.setAttribute('aria-expanded', showNow); if (showNow) { open.add(k); open.delete('x' + k); } else { open.delete(k); open.add('x' + k); } return; }
    const f = t('[data-focus]');
    if (f) { const c = getSt().candidates.find((x) => x.id === f.dataset.focus); if (c?.lat != null) { $('#smap').scrollIntoView({ behavior: 'smooth', block: 'center' }); map.setView([c.lat, c.lng], 19); const mk = cluster.getLayers().find((m) => m.cid === c.id); if (mk) cluster.zoomToShowLayer(mk, () => mk.openPopup()); } return; }
    const sb = t('[data-set]'); if (sb) return setStatus(sb.dataset.cid, sb.dataset.set);
  });
  map.on('popupopen', (ev) => ev.popup.getElement().addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return; map.closePopup();
    const cl = get().clients.find((c) => c.id === b.dataset.id);
    if (b.dataset.act === 'edit' && cl) clientForm({ client: cl });
    if (b.dataset.act === 'pay') payModal(b.dataset.id);
  }));

  draw();
  setTimeout(() => map.invalidateSize(), 150);
  const un = subscribe(() => { if (getSt()) draw(); });
  return { destroy() { un(); map.remove(); } };
}
