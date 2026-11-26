// Exportar KML, backup JSON e restauração. Tudo local (download/upload no navegador).
import { download, esc, SIT, today, fmtDate } from './util.js';
import { get, replaceAll } from './store.js';
import { toast, confirmBox } from './ui.js';

const kmlColor = (hex) => { const h = hex.replace('#', ''); return 'ff' + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2); };

export function exportKML() {
  const s = get();
  const pts = s.clients.filter((c) => c.lat != null);
  const cands = s.streets.flatMap((st) => (st.candidates || []).filter((c) => !c.clientId && c.lat != null).map((c) => ({ loja: c.nome, endereco: c.endereco, bairro: c.bairro, situacao: c.situacao, lat: c.lat, lng: c.lng, obs: `Sugerido na rua ${st.nome}` })));
  const all = [...pts, ...cands];
  if (!all.length) return toast('Não há lugares com localização para exportar.', 'error');
  const styles = Object.entries(SIT).map(([, v], i) => `<Style id="s${i}"><IconStyle><color>${kmlColor(v.color)}</color><scale>1.1</scale><Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon></IconStyle></Style>`).join('');
  const idx = Object.keys(SIT);
  const marks = all.map((c) => `<Placemark><name>${esc(c.loja)}</name><styleUrl>#s${Math.max(0, idx.indexOf(c.situacao))}</styleUrl><description>${esc([c.situacao, c.pessoa, c.endereco, c.bairro, c.obs].filter(Boolean).join(' | '))}</description><Point><coordinates>${c.lng},${c.lat},0</coordinates></Point></Placemark>`).join('');
  const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Atlaz Rota ${fmtDate(today())}</name>${styles}${marks}</Document></kml>`;
  download(`atlaz-rota-${today()}.kml`, kml, 'application/vnd.google-earth.kml+xml');
  toast(`KML exportado (${all.length} lugares).`, 'ok');
}

export function exportBackup() {
  const payload = { app: 'atlaz-rota', version: 1, exportedAt: new Date().toISOString(), data: get() };
  download(`atlaz-rota-backup-${today()}.json`, JSON.stringify(payload, null, 1), 'application/json');
  toast('Backup baixado. Guarde-o fora do repositório do GitHub.', 'ok');
}

export function pickBackupFile() {
  const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
  inp.onchange = async () => {
    const file = inp.files[0]; if (!file) return;
    try {
      const obj = JSON.parse(await file.text());
      const data = obj.data || obj;
      if (obj.app && obj.app !== 'atlaz-rota') throw new Error('Arquivo de outro app.');
      if (!Array.isArray(data.clients)) throw new Error('Backup inválido: sem lista de clientes.');
      const ok = await confirmBox({ title: 'Restaurar backup', message: `Isto <b>substitui</b> todos os dados atuais por ${data.clients.length} loja(s), ${(data.sales || []).length} venda(s) e ${(data.streets || []).length} rua(s) do backup. Continuar?`, ok: 'Restaurar', danger: true });
      if (!ok) return;
      replaceAll({ clients: data.clients, sales: data.sales || [], streets: data.streets || [], prices: data.prices || [], leads: data.leads || [] });
      toast('Backup restaurado.', 'ok');
    } catch (e) { toast('Não foi possível restaurar: ' + e.message, 'error', 6000); }
  };
  inp.click();
}
