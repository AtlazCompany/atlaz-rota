// Geocodificação (Nominatim, máx. 1 req/s, cache em localStorage) e Overpass (OSM).
import { norm, sleep, haversine, distToLines, projectOnPath } from './util.js';

// Viewbox: Teresina-PI + entorno (inclui Timon-MA). left,top,right,bottom
const VIEWBOX = '-43.10,-4.80,-42.50,-5.40';
export const TERESINA = [-5.0892, -42.8019];
const CACHE_KEY = 'atlaz.geocache.v1';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

let cache = {};
try { cache = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { cache = {}; }
const saveCache = () => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* cheio: ignora */ } };

// Fila global: no máximo 1 requisição por segundo ao Nominatim.
let chain = Promise.resolve(), lastCall = 0;
function throttled(fn) {
  const run = async () => { const w = Math.max(0, 1100 - (Date.now() - lastCall)); if (w) await sleep(w); lastCall = Date.now(); return fn(); };
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

async function nominatim(q, { limit = 1 } = {}) {
  const url = `${NOMINATIM}?format=jsonv2&limit=${limit}&addressdetails=1&countrycodes=br&accept-language=pt-BR&viewbox=${VIEWBOX}&bounded=0&q=${encodeURIComponent(q)}`;
  const r = await throttled(() => fetch(url, { headers: { Accept: 'application/json' } }));
  if (!r.ok) throw new Error('Nominatim HTTP ' + r.status);
  return r.json();
}

const simplify = (r) => ({
  lat: +r.lat, lng: +r.lon, display: r.display_name, category: r.category, type: r.type,
  bbox: r.boundingbox ? r.boundingbox.map(Number) : null, // [s, n, w, e]
  bairro: r.address?.suburb || r.address?.neighbourhood || r.address?.quarter || '',
  cidade: r.address?.city || r.address?.town || r.address?.municipality || '',
});

/** Geocodifica um endereço livre. Retorna {lat,lng,...} ou null. Resultados ficam em cache. */
export async function geocode(query) {
  const key = norm(query);
  if (!key) return null;
  if (cache[key]) return cache[key];
  const res = await nominatim(query);
  if (!res.length) return null;
  const out = simplify(res[0]);
  cache[key] = out; saveCache();
  return out;
}
export const geocacheSize = () => Object.keys(cache).length;

export function buildQuery(c) {
  return [c.endereco, c.bairro, c.cidade || 'Teresina - PI', 'Brasil'].filter(Boolean).join(', ');
}

/**
 * Geocodifica um cliente com tentativas progressivas (o Nominatim é rígido com número/bairro):
 * endereço completo → sem número → só rua+cidade → bairro+cidade.
 * Retorna {lat,lng,precisao:'endereço'|'rua'|'bairro'} ou null.
 */
/** Cidade citada no próprio endereço (ex.: "..., Timon - MA, 65630-030"); vale mais que o campo Cidade, que na planilha não existe. */
export function cityFromAddress(end) {
  const t = String(end || '');
  const m = /,\s*([^,]+?)\s*-\s*([A-Z]{2})\b\s*(?:,.*)?$/.exec(t);
  if (m && !/\d/.test(m[1])) return `${m[1].trim()} - ${m[2]}`;
  if (/\btimon\b/i.test(t)) return 'Timon - MA';
  return '';
}

export async function geocodeAddress(c) {
  const cidade = cityFromAddress(c.endereco) || c.cidade || 'Teresina - PI';
  // Limpa complementos que o Nominatim não entende: (Shopping X), "- Lj 35", sala, box, CEP etc.
  const end = String(c.endereco || '').replace(/\(.*?\)/g, ' ').replace(/\b\d{5}-?\d{3}\b/g, ' ')
    .replace(/[-–,]?\s*\b(lj|loja|sl|sala|box|quiosque|andar|apto?|bloco|galeria)\b\.?\s*\w*/gi, ' ')
    .replace(/\b(s\/n|sn|n[ºo°.]?)\s*$/i, '').replace(/[\s,-]+$/g, '').replace(/\s{2,}/g, ' ').trim();
  const semNum = end.replace(/[,\s-]*\b(n[ºo°.]?\s*)?\d+[a-z]?\s*$/i, '').trim();
  const tries = [];
  if (end) tries.push([[end, c.bairro, cidade, 'Brasil'], 'endereço']);
  if (semNum && semNum !== end) tries.push([[semNum, c.bairro, cidade, 'Brasil'], 'rua']);
  if (semNum || end) tries.push([[semNum || end, cidade, 'Brasil'], 'rua']);
  if (c.bairro) tries.push([[c.bairro, cidade, 'Brasil'], 'bairro']);
  const seen = new Set();
  for (const [parts, precisao] of tries) {
    const q = parts.filter(Boolean).join(', ');
    if (seen.has(q)) continue; seen.add(q);
    const r = await geocode(q);
    if (r) return { ...r, precisao };
  }
  return null;
}

// ---------- Ruas ----------
const TIPOS = { av: 'Avenida', 'av.': 'Avenida', r: 'Rua', 'r.': 'Rua', tv: 'Travessa', 'tv.': 'Travessa', al: 'Alameda', 'al.': 'Alameda', pca: 'Praça', 'pça': 'Praça', 'pça.': 'Praça', rod: 'Rodovia', 'rod.': 'Rodovia' };
export function expandStreetName(name) {
  const parts = name.trim().split(/\s+/);
  const t = TIPOS[parts[0].toLowerCase()];
  if (t) parts[0] = t;
  return parts.join(' ');
}
const TYPE_WORDS = /^(avenida|rua|travessa|alameda|pra[cç]a|rodovia|estrada|via)\s+/i;
/** Regex do Overpass tolerante a acentos: "Jóquei Clube" → "J[oóòôõ]quei Cl..." */
function accentRegex(s) {
  const map = { a: 'aáàâãä', e: 'eéèêë', i: 'iíìîï', o: 'oóòôõö', u: 'uúùûü', c: 'cç' };
  return s.normalize('NFC').replace(/[.*+?^${}()|[\]\\"]/g, '\\$&').replace(/[aeiouc]/gi, (ch) => `[${map[ch.toLowerCase()].replace(/./g, (x) => x + x.toUpperCase())}]`);
}

async function overpass(query, timeoutMs = 45000) {
  let lastErr;
  for (const ep of OVERPASS) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
      const r = await fetch(ep, { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error('Overpass HTTP ' + r.status);
      return await r.json();
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Overpass indisponível');
}

function chainWays(segs) {
  // Encadeia os trechos (ways) em um único caminho, para ordenar paradas ao longo da rua.
  const rest = segs.map((s) => s.slice());
  if (!rest.length) return [];
  let path = rest.shift();
  while (rest.length) {
    let best = null;
    for (let i = 0; i < rest.length; i++) {
      const s = rest[i];
      for (const [end, rev, atHead] of [[path.at(-1), false, false], [path.at(-1), true, false], [path[0], false, true], [path[0], true, true]]) {
        const p = atHead ? (rev ? s[0] : s.at(-1)) : (rev ? s.at(-1) : s[0]);
        const d = haversine(end, p);
        if (!best || d < best.d) best = { d, i, rev, atHead };
      }
    }
    let s = rest.splice(best.i, 1)[0];
    if (best.atHead) { if (!best.rev) s = s.reverse(); path = s.concat(path); }
    else { if (best.rev) s = s.reverse(); path = path.concat(s); }
  }
  return path;
}

/**
 * Localiza uma rua/avenida: Nominatim para achar o ponto, Overpass para a geometria.
 * Retorna {nome, bairro, cidade, lines, path, center, bbox} ou lança Error com mensagem legível.
 */
export async function findStreet(nome, cidade = 'Teresina - PI') {
  const full = expandStreetName(nome);
  const core = full.replace(TYPE_WORDS, '');
  let res = [];
  try { res = await nominatim(`${full}, ${cidade}, Brasil`, { limit: 5 }); }
  catch (e) { throw new Error('Não consegui consultar o Nominatim (verifique a internet).'); }
  const hit = res.find((r) => r.category === 'highway') || res[0];
  if (!hit) throw new Error(`Não encontrei "${full}" em ${cidade}. Confira a grafia.`);
  const seed = simplify(hit);
  const pad = 0.025;
  const [s, n, w, e] = seed.bbox ? [seed.bbox[0] - pad, seed.bbox[1] + pad, seed.bbox[2] - pad, seed.bbox[3] + pad] : [seed.lat - pad, seed.lat + pad, seed.lng - pad, seed.lng + pad];
  let ways = [];
  try {
    const q = `[out:json][timeout:40];way["highway"]["name"~"${accentRegex(core)}",i](${s},${w},${n},${e});out geom;`;
    const data = await overpass(q);
    ways = (data.elements || []).filter((x) => x.geometry?.length > 1).map((x) => x.geometry.map((g) => [g.lat, g.lon]));
  } catch (err) { /* cai no fallback abaixo */ }
  if (!ways.length) {
    // Fallback: linha reta pelo ponto encontrado (avisa o usuário na tela).
    return { nome: full, bairro: seed.bairro, cidade, lines: [[[seed.lat, seed.lng], [seed.lat + 0.0003, seed.lng + 0.0003]]], path: [[seed.lat, seed.lng], [seed.lat + 0.0003, seed.lng + 0.0003]], center: [seed.lat, seed.lng], approx: true };
  }
  // Mantém só os trechos conectados ao ponto encontrado (evita ruas homônimas em outros bairros).
  const near = (pt, line) => Math.min(...line.map((p) => haversine(pt, p)));
  ways.sort((a, b) => near([seed.lat, seed.lng], a) - near([seed.lat, seed.lng], b));
  const keep = [ways[0]];
  let grew = true; const left = ways.slice(1);
  while (grew) {
    grew = false;
    for (let i = left.length - 1; i >= 0; i--) {
      const w2 = left[i];
      if (keep.some((k) => [k[0], k.at(-1)].some((ep) => [w2[0], w2.at(-1)].some((ep2) => haversine(ep, ep2) < 120)))) { keep.push(left.splice(i, 1)[0]); grew = true; }
    }
  }
  const r5 = (l) => l.map(([a, b]) => [Math.round(a * 1e5) / 1e5, Math.round(b * 1e5) / 1e5]);
  const lines = keep.map(r5), path = chainWays(lines);
  const mid = path[Math.floor(path.length / 2)];
  return { nome: full, bairro: seed.bairro, cidade, lines, path, center: mid, approx: false };
}

const AMENITY_IGNORE = new Set(['parking', 'parking_space', 'parking_entrance', 'bench', 'waste_basket', 'toilets', 'shelter', 'bicycle_parking', 'motorcycle_parking', 'atm', 'post_box', 'telephone', 'drinking_water', 'vending_machine', 'recycling', 'charging_station', 'place_of_worship', 'grave_yard', 'fountain', 'clock', 'taxi', 'bus_station', 'bicycle_rental', 'waste_disposal', 'fire_station', 'police', 'school', 'kindergarten', 'university', 'college', 'townhall', 'courthouse', 'public_building']);
const PT = { hairdresser: 'Cabeleireiro', beauty: 'Beleza/estética', clothes: 'Roupas', shoes: 'Calçados', jewelry: 'Joalheria/semijoias', cosmetics: 'Cosméticos', perfumery: 'Perfumaria', optician: 'Ótica', mobile_phone: 'Celulares', electronics: 'Eletrônicos', computer: 'Informática', bakery: 'Padaria', supermarket: 'Supermercado', convenience: 'Conveniência', pharmacy: 'Farmácia', restaurant: 'Restaurante', cafe: 'Café', fast_food: 'Lanchonete', bar: 'Bar', clinic: 'Clínica', dentist: 'Dentista', doctors: 'Consultório', bank: 'Banco', fuel: 'Posto', gift: 'Presentes', bag: 'Bolsas', boutique: 'Boutique', furniture: 'Móveis', hardware: 'Ferragens', car_repair: 'Oficina', tattoo: 'Tatuagem', variety_store: 'Variedades', department_store: 'Loja de departamentos', mall: 'Shopping', massage: 'Massagem', florist: 'Floricultura', books: 'Livraria', stationery: 'Papelaria', sports: 'Esportes', pet: 'Pet shop', houseware: 'Utilidades domésticas', kiosk: 'Quiosque', copyshop: 'Copiadora', seafood: 'Pescados', butcher: 'Açougue', greengrocer: 'Hortifruti', laundry: 'Lavanderia', travel_agency: 'Agência de viagens', estate_agent: 'Imobiliária', lawyer: 'Advocacia', accountant: 'Contabilidade', insurance: 'Seguros', company: 'Empresa' };

/** Comércios (shop, amenity, office, craft) em até `radius` m da rua. */
export async function findCandidates(street, radius = 30) {
  const path = street.path;
  const step = Math.max(1, Math.ceil(path.length / 70));
  const pts = path.filter((_, i) => i % step === 0 || i === path.length - 1);
  const coords = pts.map((p) => p.join(',')).join(',');
  const q = `[out:json][timeout:40];(nwr["shop"](around:${radius},${coords});nwr["amenity"]["name"](around:${radius},${coords});nwr["office"]["name"](around:${radius},${coords});nwr["craft"]["name"](around:${radius},${coords}););out center tags;`;
  const data = await overpass(q);
  const out = [], seen = new Set();
  for (const el of data.elements || []) {
    const t = el.tags || {};
    if (!t.name) continue;
    if (t.amenity && AMENITY_IGNORE.has(t.amenity) && !t.shop) continue;
    const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
    if (lat == null) continue;
    const dist = distToLines([lat, lng], street.lines);
    if (dist > radius + 8) continue;
    const key = norm(t.name) + '|' + lat.toFixed(4) + lng.toFixed(4);
    if (seen.has(key)) continue; seen.add(key);
    const kind = t.shop || t.amenity || t.office || t.craft;
    const rua = t['addr:street'] || street.nome;
    out.push({
      osmId: `${el.type}/${el.id}`, nome: t.name, tag: kind, categoriaOsm: PT[kind] || kind,
      endereco: [rua, t['addr:housenumber']].filter(Boolean).join(', '), bairro: t['addr:suburb'] || t['addr:neighbourhood'] || street.bairro || '',
      lat, lng, dist: Math.round(dist), along: projectOnPath([lat, lng], street.path).along,
      extra: [t.brand, t['addr:housename'], t.description].filter(Boolean).join(' '),
    });
  }
  return out;
}

export const gmapsPoint = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
