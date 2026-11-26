// Sincronização com o Apps Script (Fase 2). URL e token: config.local.js ou Configurações (localStorage).
import { get, mutate, getSettings, newClient } from './store.js';
import { norm, parseDate, uid } from './util.js';
import { normSituacao } from './csv.js';
import { modal, toast } from './ui.js';

export function syncConfig() {
  const l = window.ATLAZ_CONFIG || {}, s = getSettings();
  return { url: l.appsScriptUrl || s.appsScriptUrl || '', token: l.token || s.token || '' };
}

async function call(method, payload) {
  const { url, token } = syncConfig();
  if (!url || !token) throw new Error('Informe a URL do Apps Script e o token em Configurações.');
  const r = method === 'GET'
    ? await fetch(`${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`, { redirect: 'follow' })
    // text/plain evita o preflight CORS, que o Apps Script não atende.
    : await fetch(url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token, ...payload }) });
  let data;
  try { data = await r.json(); } catch { throw new Error('Resposta inválida do Apps Script (URL correta e publicada para “Qualquer pessoa com o link”?).'); }
  if (!data.ok) throw new Error(data.error || 'Erro no Apps Script.');
  return data;
}

/** Baixa Clientes e Vendas da planilha para o navegador (não apaga nada local). */
export async function pull() {
  const d = await call('GET');
  let novos = 0, atual = 0, vendas = 0;
  mutate((s) => {
    for (const c of d.clientes) {
      const ex = s.clients.find((x) => norm(x.loja) === norm(c.loja));
      const dados = { loja: String(c.loja), pessoa: c.pessoa, endereco: c.endereco, bairro: c.bairro, situacao: normSituacao(c.situacao), telefone: String(c.telefone || ''), ultimaAcao: parseDate(c.ultimaAcao), obs: c.obs, aReceber: c.aReceber, pedidoAberto: c.pedidoAberto };
      if (ex) { Object.assign(ex, dados); atual++; } else { s.clients.push(newClient(dados)); novos++; }
    }
    const seen = new Set(s.sales.map((v) => [v.data, norm(v.loja), norm(v.produto), +v.total].join('|')));
    for (const v of d.vendas) {
      const k = [v.data, norm(v.loja), norm(v.produto), +v.total].join('|');
      if (seen.has(k)) continue;
      seen.add(k); s.sales.push({ id: uid(), ...v }); vendas++;
    }
  });
  return { novos, atual, vendas };
}

/** Mostra o aviso (planilha compartilhada) e, se confirmado, envia. Só vendas pagas vão para Vendas. */
export function pushWithWarning() {
  const s = get();
  const clientes = s.clients.map((c) => ({ loja: c.loja, pessoa: c.pessoa, endereco: c.endereco, bairro: c.bairro, situacao: c.situacao, telefone: c.telefone, ultimaAcao: c.ultimaAcao, obs: c.obs, aReceber: c.aReceber || 0, pedidoAberto: c.pedidoAberto }));
  const vendas = s.sales.map(({ data, produto, qtd, preco, total, obs, pagamento, loja }) => ({ data, produto, qtd, preco, total, obs, pagamento, loja }));
  return new Promise((resolve) => {
    modal({
      title: 'Enviar para a planilha',
      body: `<div class="note"><div><b>Atenção: a planilha é compartilhada com seu sócio.</b><br>Serão enviadas <b>${clientes.length}</b> loja(s) (atualiza pela coluna Loja ou cria nova) e <b>${vendas.length}</b> venda(s) paga(s) (só acrescenta o que ainda não existe).</div></div>
        <p class="hint" style="margin-top:12px">Nunca escrevo nas colunas calculadas (Clientes I e J; Vendas F, G e K), não sobrescrevo fórmulas e não apago linhas. Dados de Clientes que você alterou na planilha serão substituídos pelos daqui. Faça um backup antes se tiver dúvida.</p>`,
      actions: [
        { label: 'Cancelar', cls: 'ghost', onClick: (c) => { c(); resolve(null); } },
        { label: 'Enviar agora', cls: 'primary', onClick: async (close) => {
          close();
          try { const r = await call('POST', { clientes, vendas }); toast(`Enviado: ${r.clientes.novos} nova(s) e ${r.clientes.atualizados} atualizada(s) loja(s); ${r.vendas.novas} venda(s) nova(s), ${r.vendas.ignoradas} já existiam.`, 'ok', 7000); resolve(r); }
          catch (e) { toast('Falha ao enviar: ' + e.message, 'error', 7000); resolve(null); }
        } },
      ],
    });
  });
}
