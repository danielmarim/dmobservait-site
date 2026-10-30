(() => {
'use strict';
// Regras puras do painel de servidores (testadas em tools/testes/servidores.mjs e usadas pelo serviço e pela tela).
const ACOES = ['reiniciar', 'parar', 'iniciar', 'atualizar', 'deletar'];
const ROTULO_ACAO = { reiniciar: 'Reiniciar', parar: 'Parar', iniciar: 'Iniciar', atualizar: 'Atualizar', deletar: 'Deletar' };
// Parar, Atualizar e Deletar exigem digitar o nome do projeto; Deletar exige também um código novo (e-mail/WhatsApp)
const PEDE_NOME = new Set(['parar', 'atualizar', 'deletar']);
const PEDE_CODIGO = new Set(['deletar']);

// Proteção: 'protegido' = só Reiniciar e Ver logs; 'somente-ver' = só Ver logs (nenhuma ação).
const glob = (padrao, txt) => new RegExp(`^${String(padrao).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i').test(String(txt));
const PESO = { 'somente-ver': 2, protegido: 1 };
// regras: [{ vps: '*'|id, projeto?: glob, imagem?: regex (texto), nivel, motivo }]; vale a regra mais restritiva
function protecaoDe(regras, vpsId, projeto) {
  if (!projeto || !projeto.compose) return { nivel: 'somente-ver', motivo: 'containers fora de um projeto Compose' };
  let melhor = null;
  for (const r of regras || []) {
    if (r.vps && r.vps !== '*' && r.vps !== vpsId) continue;
    const casaProjeto = r.projeto ? glob(r.projeto, projeto.nome) : true;
    const casaImagem = r.imagem ? (projeto.containers || []).some((c) => new RegExp(r.imagem, 'i').test(String(c.imagem || ''))) : true;
    if (!r.projeto && !r.imagem) continue;
    if (casaProjeto && casaImagem && (!melhor || PESO[r.nivel] > PESO[melhor.nivel])) melhor = { nivel: r.nivel, motivo: r.motivo || 'protegido' };
  }
  return melhor;
}
function acaoPermitida(protecao, acao) {
  if (!ACOES.includes(acao)) return false;
  if (!protecao) return true;
  if (protecao.nivel === 'protegido') return acao === 'reiniciar';
  return false;
}
// Confirmações vindas da tela. Devolve null (ok) ou o motivo da recusa.
function conferirConfirmacao({ acao, projeto, confirmado, confirmacao }) {
  if (!ACOES.includes(acao)) return 'Ação desconhecida.';
  if (confirmado !== true) return 'A ação precisa ser confirmada.';
  if (PEDE_NOME.has(acao) && String(confirmacao ?? '') !== projeto) return 'Para esta ação, digite exatamente o nome do projeto.';
  return null;
}

// Provedor pela rede: DNS reverso (PTR) primeiro, depois o nome do sistema autônomo (ASN) ou o dono do bloco (RDAP).
const PROVEDORES = [
  ['Hostinger', /hstgr\.(cloud|io)|hostinger/i, /hostinger/i, [47583]],
  ['KingHost', /kinghost/i, /king ?host/i, []],
  ['HostGator', /hostgator|websitewelcome/i, /hostgator/i, []],
  ['Locaweb', /locaweb|lwsites/i, /locaweb/i, [27715]],
  ['AWS', /amazonaws\.com|awsglobalaccelerator/i, /amazon|\baws\b/i, [16509, 14618]],
  ['Google Cloud', /googleusercontent\.com|\.bc\.googleusercontent/i, /google/i, [15169, 396982]],
  ['Azure', /cloudapp\.(azure|net)|azure/i, /microsoft/i, [8075]],
  ['DigitalOcean', /digitalocean/i, /digitalocean/i, [14061]],
  ['Contabo', /contabo/i, /contabo/i, [51167, 40021]],
  ['Oracle', /oraclecloud|oraclevcn/i, /oracle/i, [31898]],
  ['Hetzner', /hetzner|your-server\.de/i, /hetzner/i, [24940]],
  ['OVHcloud', /ovh\.(net|com|ca)|\.ip-\d/i, /\bovh/i, [16276]],
  ['Vultr', /vultr/i, /vultr|choopa/i, [20473]],
  ['Linode (Akamai)', /linode|members\.linode/i, /linode|akamai/i, [63949]],
  ['Magalu Cloud', /magalu/i, /magalu|magazine luiza/i, []]
];
function identificarProvedor({ ptr = '', asn = null, asnNome = '', dono = '' } = {}) {
  for (const [nome, rePtr] of PROVEDORES) if (ptr && rePtr.test(ptr)) return { nome, fonte: 'DNS reverso' };
  for (const [nome, , reNome, asns] of PROVEDORES) {
    if (asn && asns.includes(Number(asn))) return { nome, fonte: `AS${asn}` };
    if (asnNome && reNome.test(asnNome)) return { nome, fonte: `AS${asn ?? '?'}` };
    if (dono && reNome.test(dono)) return { nome, fonte: 'RDAP' };
  }
  return { nome: 'Desconhecido', fonte: asn ? `AS${asn}${asnNome ? ' ' + asnNome : ''}` : (dono || 'sem dados') };
}

// Mascaramento de segredos em logs (usado no agente, no serviço do painel e na tela: três camadas).
// Troca por *** o VALOR de variáveis com nome de segredo (TOKEN, KEY, SECRET, PASSWORD, SENHA, AUTH, COOKIE...), em
// qualquer formato comum (NOME=valor, NOME: valor, "nome":"valor", --nome valor), as credenciais dentro de URLs
// (esquema://usuario:senha@host), cabeçalhos Bearer/Basic, JWTs, chaves com prefixo conhecido (sk-, ghp_, AKIA...) e
// sequências longas de hex/base64 que parecem chave. Também tira códigos de cor ANSI. Prefere mascarar demais a vazar.
const NOME = String.raw`[A-Za-z0-9_.-]*(?:token|secret|segredo|senha|passw(?:or)?d|passwd|pwd|api[_-]?key|apikey|access[_-]?key|private[_-]?key|chave|key|auth|authorization|credential|credencial|cookie|session|sessao|jwt|bearer|signature|assinatura|dsn|webhook)[A-Za-z0-9_.-]*`;
const REGRAS = [
  [/\x1b\[[0-9;?]*[ -/]*[@-~]/g, ''],
  // esquema://usuario:senha@host  e  esquema://token@host
  [/\b([a-z][a-z0-9+.-]{1,20}:\/\/)[^\s/@:'"]*:[^\s/@'"]*@/gi, '$1***:***@'],
  [/\b((?:https?|wss?|postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqps?):\/\/)[^\s/@:'"]{12,}@/gi, '$1***@'],
  // cabeçalhos
  [/\b(Bearer|Basic|Token|Digest)\s+[A-Za-z0-9._~+/=-]{6,}/gi, '$1 ***'],
  // "nome": "valor"  e  'nome': 'valor'
  [new RegExp(String.raw`(["'])(${NOME})\1(\s*:\s*)(["'])(?:\\.|(?!\4).)*\4`, 'gi'), '$1$2$1$3$4***$4'],
  // "nome": 12345 / true (sem aspas)
  [new RegExp(String.raw`(["'])(${NOME})\1(\s*:\s*)(?!["'\s{[])[^,}\s]+`, 'gi'), '$1$2$1$3***'],
  // NOME=valor, NOME: valor, nome = "valor" (até o fim do valor)
  [new RegExp(String.raw`\b(${NOME})(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&'"}\]]+)`, 'gi'), '$1$2***'],
  // --nome valor / --nome=valor
  [new RegExp(String.raw`(--${NOME})(\s+|=)(?!-)\S+`, 'gi'), '$1$2***'],
  // ?token=... em querystring (cobre nomes curtos como ?k=, &sig=)
  [/([?&](?:k|sig|code|codigo|t|key|token|apikey|access_token|auth)=)[^&\s'"]+/gi, '$1***'],
  // caminho secreto de webhook (n8n e afins: a proteção é o próprio endereço)
  [/(\/webhook(?:-test)?\/)[^\s?'"]+/gi, '$1***'],
  // JWT e chaves com prefixo conhecido
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '***jwt***'],
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/g, '***'],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/g, '***'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, '***'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '***'],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, '***'],
  // sequências longas que parecem chave (hex de 32+ ou base64 de 40+)
  [/\b[0-9a-f]{32,}\b/gi, '***'],
  [/(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{40,}={0,2}(?![A-Za-z0-9+/=])/g, '***']
];

function mascarar(texto) {
  let t = String(texto ?? '');
  for (const [re, troca] of REGRAS) t = t.replace(re, troca);
  return t;
}

// Tela /admin/servidores (e /admin/servidores/auditoria/): lista das VPS, "Gerenciar" com o Gerenciador Docker (projetos,
// containers, logs e ações) e o log de auditoria. Fala só com o serviço do painel em /admin/servidores-api/ (o nginx exige
// a sessão do login por código); todo pedido leva x-dm-admin. O build junta na frente deste arquivo as regras
// (servico-servidores/regras.mjs) e o mascaramento (servico-agente/mascara.mjs), usado como terceira camada nos logs.
const $ = (s, el = document) => el.querySelector(s);
const app = $('#sv-app'), tela = $('main').dataset.tela;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const API = '/admin/servidores-api';
const api = async (metodo, caminho, corpo) => {
  const r = await fetch(API + caminho, { method: metodo, credentials: 'same-origin', headers: { 'x-dm-admin': '1', accept: 'application/json', ...(corpo ? { 'content-type': 'application/json' } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && !corpo) throw new Error('A sessão do painel expirou. Recarregue a página e entre de novo.');
  if (!r.ok) throw Object.assign(new Error(d.erro || `Erro ${r.status}.`), { status: r.status, d });
  return d;
};

// ---------- formatação ----------
const nf = (n, d = 1) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: 0 });
const bytes = (b) => { if (b == null) return '—'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0, v = b; while (v >= 1024 && i < 4) { v /= 1024; i++; } return `${nf(v, v < 10 && i ? 1 : 0)} ${u[i]}`; };
const pct = (a, t) => (a != null && t ? Math.round((a / t) * 100) : null);
const data = (s) => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? esc(s) : d.toLocaleDateString('pt-BR'); };
const dataHora = (s) => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? esc(s) : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }); };
const duracao = (s) => { if (s == null) return '—'; const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600); return d ? `${d} d ${h} h` : `${h} h ${Math.floor((s % 3600) / 60)} min`; };
const barra = (p, rot) => `<span class="sv-uso"><span class="sv-uso-r">${esc(rot)}</span><span class="sv-barra" role="img" aria-label="${esc(rot)} ${p == null ? 'sem dado' : p + '%'}"><i style="width:${p == null ? 0 : Math.min(100, p)}%" class="${p >= 90 ? 'alto' : p >= 75 ? 'medio' : ''}"></i></span><b>${p == null ? '—' : p + '%'}</b></span>`;
const ICO = {
  copiar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  vps: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01"/></svg>',
  mais: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg>',
  seta: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  escudo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z"/></svg>'
};
const STATUS_VPS = { 'em atividade': ['ok', 'Em atividade'], parado: ['parado', 'Parado'], 'inacessível': ['erro', 'Agente inacessível'], 'sem agente': ['neutro', 'Sem agente'] };
const STATUS_PROJ = { executando: ['ok', 'Em execução'], interrompido: ['parado', 'Interrompido'], erro: ['erro', 'Com erro'] };
const ESTADO_C = { running: ['ok', 'Em execução'], exited: ['parado', 'Parado'], restarting: ['erro', 'Reiniciando'], dead: ['erro', 'Morto'], paused: ['parado', 'Pausado'], created: ['neutro', 'Criado'] };
const ponto = ([cls, txt]) => `<span class="sv-st sv-st--${cls}"><i aria-hidden="true"></i>${esc(txt)}</span>`;
const saudeTxt = (s) => { if (!s) return '—'; const p = []; if (s.saudaveis) p.push(`${s.saudaveis} saudáve${s.saudaveis > 1 ? 'is' : 'l'}`); if (s.doentes) p.push(`<b class="sv-ruim">${s.doentes} com falha</b>`); if (s.iniciando) p.push(`${s.iniciando} iniciando`); if (s.semVerificacao) p.push(`${s.semVerificacao} sem verificação`); return p.join(' · ') || '—'; };
const protChip = (p) => (p ? `<span class="sv-prot sv-prot--${p.nivel === 'protegido' ? 'p' : 'v'}" title="${esc(p.motivo)}">${ICO.escudo}${p.nivel === 'protegido' ? 'Protegido' : 'Só consulta'}</span>` : '');
const aviso = (msg, tipo = 'info') => `<p class="adm-status sv-aviso sv-aviso--${tipo}" role="status">${esc(msg)}</p>`;

// ---------- estado ----------
const est = { vps: null, detalhe: {}, projetos: {}, abertos: new Set(), busca: '', ordem: ['nome', 1], pagina: 1, tamanho: 10, carregando: false };
const rota = () => { const h = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent); return h[0] === 'vps' ? { vps: h[1], aba: h[2] || 'projetos', extra: h[3] } : { lista: true }; };
const vai = (h) => { if (location.hash === h) desenhar(); else location.hash = h; };

// ---------- lista das VPS ----------
async function telaLista(forcar) {
  if (!est.vps || forcar) { app.innerHTML = `<h1>Servidores</h1>${aviso('Consultando os agentes das VPS…')}`; try { est.vps = (await api('GET', '/vps')).vps; } catch (e) { app.innerHTML = `<h1>Servidores</h1>${aviso(e.message, 'erro')}`; return; } }
  const linhas = est.vps.map((v) => {
    const m = v.maquina || {}, h = v.hostinger || {};
    const plano = h.plano || (v.hostingerDisponivel && !v.tokenHostinger ? '<small>token da Hostinger não configurado</small>' : '—');
    return `<li class="sv-vps" data-vps="${esc(v.id)}">
<div class="sv-vps-det"><span class="sv-vps-ic">${ICO.vps}</span><div><strong>${esc(v.host || v.nome)}</strong><small>${esc(v.nome)}${v.papel ? ' · ' + esc(v.papel) : ''}</small></div></div>
<div class="sv-c"><span class="sv-rot">Provedor</span><strong data-provedor>${esc(v.provedor?.nome || 'Desconhecido')}</strong><small title="${esc(v.provedor?.ptr || '')}">${esc(v.provedor?.fonte || '')}</small></div>
<div class="sv-c"><span class="sv-rot">Endereço IP</span><span class="sv-ip"><code>${esc(v.ip || '—')}</code>${v.ip ? `<button type="button" class="sv-copiar" data-copiar="${esc(v.ip)}" aria-label="Copiar o IP ${esc(v.ip)}">${ICO.copiar}</button>` : ''}</span></div>
<div class="sv-c"><span class="sv-rot">Status</span>${ponto(STATUS_VPS[v.status] || ['neutro', v.status])}${v.erroAgente ? `<small>${esc(v.erroAgente)}</small>` : ''}</div>
<div class="sv-c"><span class="sv-rot">Plano · expiração</span><span>${typeof plano === 'string' && plano.startsWith('<') ? plano : esc(plano)}</span>${h.expiracao ? `<small class="sv-exp">expira em ${data(h.expiracao)}</small>` : ''}</div>
<div class="sv-c sv-c--uso"><span class="sv-rot">Uso</span>${v.maquina ? `${barra(m.cpuPct == null ? null : Math.round(m.cpuPct), 'CPU')}${barra(pct(m.memUsada, m.memTotal), 'RAM')}${barra(pct(m.discoUsado, m.discoTotal), 'Disco')}` : '<small>sem dados do agente</small>'}</div>
<div class="sv-c sv-c--acao"><a class="btn btn--primary sv-gerenciar" href="#/vps/${esc(v.id)}/projetos">Gerenciar</a></div>
</li>`;
  }).join('');
  app.innerHTML = `<div class="sv-topo"><div><h1>Servidores</h1><p class="adm-intro">VPS da DM ObservaIT e do Dyno. O provedor é identificado pelo DNS reverso e pelo ASN do IP; uso de CPU, memória e disco vem do agente instalado em cada VPS. Ações em containers ficam em "Gerenciar" e entram no <a href="/admin/servidores/auditoria/">log de auditoria</a>.</p></div><button type="button" class="btn btn--ghost" id="sv-recarregar">Atualizar</button></div>
<ul class="sv-lista-vps" aria-label="VPS cadastradas">${linhas}</ul>`;
  $('#sv-recarregar').onclick = () => telaLista(true);
}

// ---------- gerenciar ----------
const ABAS = [
  ['visao', 'Visão geral'],
  ['grupo', 'Gerenciador Docker', [['projetos', 'Projetos'], ['credenciais', 'Credenciais'], ['catalogo', 'Catálogo']]],
  ['grupo', 'Configurações', [['ip', 'Endereço IP']]],
  ['backups', 'Backups e monitoramento'],
  ['seguranca', 'Segurança']
];
const nomeAba = (a) => (a === 'logs' ? 'Logs' : ABAS.flatMap((x) => (x[0] === 'grupo' ? x[2] : [x])).find((x) => x[0] === a)?.[1] || 'Projetos');
async function telaGerenciar(r) {
  const vid = r.vps;
  if (!est.detalhe[vid]) {
    app.innerHTML = aviso('Carregando a VPS…');
    try { est.detalhe[vid] = await api('GET', `/vps/${encodeURIComponent(vid)}`); } catch (e) { app.innerHTML = `<p><a href="#/">← Servidores</a></p>${aviso(e.message, 'erro')}`; return; }
  }
  const d = est.detalhe[vid], v = d.vps;
  const link = (a, t) => `<a class="sv-sub-item${r.aba === a || (a === 'projetos' && r.aba === 'logs') ? ' is-ativo' : ''}" href="#/vps/${esc(vid)}/${a}"${r.aba === a ? ' aria-current="page"' : ''}>${esc(t)}</a>`;
  const sub = ABAS.map((x) => (x[0] === 'grupo' ? `<li class="sv-sub-grupo"><span>${esc(x[1])}</span><ul>${x[2].map(([a, t]) => `<li>${link(a, t)}</li>`).join('')}</ul></li>` : `<li>${link(x[0], x[1])}</li>`)).join('');
  app.innerHTML = `<nav class="sv-trilha" aria-label="Trilha"><a href="#/">Servidores</a>${ICO.seta}<span>${esc(v.host || v.nome)}</span>${ICO.seta}<span aria-current="page">${esc(nomeAba(r.aba))}</span></nav>
<div class="sv-gerenciar-grade"><nav class="sv-sub" aria-label="Gerenciar ${esc(v.nome)}"><p class="sv-sub-t">${esc(v.nome)} ${ponto(STATUS_VPS[v.status] || ['neutro', v.status])}</p><ul>${sub}</ul></nav><section class="sv-painel" id="sv-painel" aria-live="polite"></section></div>`;
  const painel = $('#sv-painel');
  const abas = { visao: abaVisao, projetos: abaProjetos, credenciais: abaPlanejada, catalogo: abaPlanejada, ip: abaIp, backups: abaBackups, seguranca: abaSeguranca, logs: abaLogs };
  await (abas[r.aba] || abaProjetos)(painel, d, r);
}

function cartao(t, v, s = '') { return `<li><span class="adm-card-t">${esc(t)}</span><strong>${v}</strong>${s ? `<span class="adm-card-s">${s}</span>` : ''}</li>`; }
function abaVisao(p, d) {
  const v = d.vps, m = v.maquina || {}, h = v.hostinger || {};
  p.innerHTML = `<h1>Visão geral</h1>${v.observacao ? aviso(v.observacao) : ''}${v.erroAgente ? aviso(`Agente: ${v.erroAgente}`, 'erro') : ''}
<ul class="adm-cartoes sv-cartoes">
${cartao('Status', esc(STATUS_VPS[v.status]?.[1] || v.status), v.maquina ? `ligada há ${duracao(m.uptimeS)}` : '')}
${cartao('Provedor', esc(v.provedor?.nome || 'Desconhecido'), esc(v.provedor?.fonte || ''))}
${cartao('Plano', esc(h.plano || '—'), h.expiracao ? `expira em ${data(h.expiracao)}${h.renovacaoAutomatica === true ? ' · renovação automática' : ''}` : v.hostingerDisponivel ? (v.tokenHostinger ? 'expiração não informada' : 'ligue o token da Hostinger para ver') : 'o provedor não informa pela API')}
${cartao('CPU', m.cpuPct == null ? '—' : `${nf(m.cpuPct)}%`, m.cpus ? `${m.cpus} vCPU · carga ${(m.carga || []).map((x) => nf(x, 2)).join(' / ')}` : '')}
${cartao('Memória', m.memTotal ? `${pct(m.memUsada, m.memTotal)}%` : '—', m.memTotal ? `${bytes(m.memUsada)} de ${bytes(m.memTotal)}` : '')}
${cartao('Disco', m.discoTotal ? `${pct(m.discoUsado, m.discoTotal)}%` : '—', m.discoTotal ? `${bytes(m.discoUsado)} de ${bytes(m.discoTotal)}` : '')}
${cartao('Containers', m.containers ? `${m.containers.rodando ?? '—'} / ${m.containers.total ?? '—'}` : '—', 'em execução / total')}
${cartao('Sistema', esc(m.so || '—'), m.docker ? `Docker ${esc(m.docker)}` : '')}
${cartao('Agente', v.agenteConfigurado ? esc(m.agente?.versao ? 'v' + m.agente.versao : 'configurado') : 'não instalado', m.agente?.somenteLeitura ? 'modo somente leitura' : v.agenteConfigurado ? 'ações liberadas conforme a proteção' : 'veja o README, "Servidores"')}
</ul><p><a class="btn btn--primary" href="#/vps/${esc(v.id)}/projetos">Abrir Projetos Docker</a></p>`;
}
function abaPlanejada(p, d, r) {
  const txt = r.aba === 'credenciais'
    ? ['Credenciais de registro', 'Na Hostinger, esta tela guarda login de registros de imagens privadas. Aqui ela ainda não existe: o agente não guarda credenciais de propósito (menos segredo espalhado). Hoje todas as imagens das VPS são públicas. Para uma imagem privada, faça o login no registro direto na VPS (docker login) e use Atualizar aqui.']
    : ['Catálogo', 'Na Hostinger, o catálogo instala aplicativos prontos com um clique. Aqui está planejado junto com o botão Compose (compose manual): criar projetos novos pela web dá controle total da VPS, então só entra com revisão de segurança própria (lista fechada de imagens, sem privilégios, sem montar o socket ou pastas do sistema).'];
  p.innerHTML = `<h1>${txt[0]}</h1><p class="sv-planejado"><span class="sv-chip-plan">Planejado</span>${esc(txt[1])}</p>`;
}
function abaIp(p, d) {
  const v = d.vps, h = v.hostinger || {}, pr = v.provedor || {};
  const linha = (t, val) => `<tr><th scope="row">${t}</th><td>${val ? `<span class="sv-ip"><code>${esc(val)}</code><button type="button" class="sv-copiar" data-copiar="${esc(val)}" aria-label="Copiar ${esc(val)}">${ICO.copiar}</button></span>` : '—'}</td></tr>`;
  p.innerHTML = `<h1>Endereço IP</h1><div class="adm-tabela-wrap"><table class="adm-tabela sv-tab-ip"><tbody>
${linha('IPv4', v.ip)}${linha('IPv6', h.ipv6)}${linha('DNS reverso (PTR)', h.ptr || pr.ptr)}${linha('Nome do host', v.host)}
<tr><th scope="row">Rede (ASN)</th><td>${pr.asn ? `AS${esc(pr.asn)} ${esc(pr.asnNome || '')}` : '—'}</td></tr>
<tr><th scope="row">Provedor</th><td>${esc(pr.nome || 'Desconhecido')} <small>(${esc(pr.fonte || '')})</small></td></tr></tbody></table></div>
<p class="sv-nota">Mudar o registro PTR, como no painel da Hostinger, fica com o provedor: o agente não mexe na rede da VPS.</p>`;
}
function abaBackups(p, d) {
  const v = d.vps, m = v.maquina || {}, b = v.hostinger?.backups;
  p.innerHTML = `<h1>Backups e monitoramento</h1><h2 class="sv-h2">Monitoramento agora</h2>
<div class="sv-monit">${v.maquina ? `${barra(m.cpuPct == null ? null : Math.round(m.cpuPct), 'CPU')}${barra(pct(m.memUsada, m.memTotal), 'RAM')}${barra(pct(m.discoUsado, m.discoTotal), 'Disco')}<p>Carga (1, 5, 15 min): ${(m.carga || []).map((x) => nf(x, 2)).join(' · ') || '—'} · ligada há ${duracao(m.uptimeS)}</p>` : '<p>Sem dados do agente.</p>'}</div>
<h2 class="sv-h2">Backups</h2><p>${b ? `${b.total} backup(s) do provedor${b.ultimo ? `, o último em ${dataHora(b.ultimo)}` : ''}.` : v.hostingerDisponivel ? (v.tokenHostinger ? 'O provedor não informou backups.' : 'Ligue o token da Hostinger (README, "Servidores") para ver os backups da VPS.') : 'Este provedor não informa backups pela API. Os backups entre as VPS estão descritos no Mapa Infraestrutura.'}</p>`;
}
function abaSeguranca(p, d) {
  const v = d.vps, m = v.maquina || {};
  const nivel = { protegido: 'Protegido: só Reiniciar e Ver logs', 'somente-ver': 'Só consulta: só Ver logs' };
  p.innerHTML = `<h1>Segurança</h1>
<ul class="sv-seg"><li><strong>Agente</strong> ${v.agenteConfigurado ? `fala só HTTPS, com pedido assinado (chave própria desta VPS, carimbo de tempo e uso único) e resposta assinada. ${m.agente?.somenteLeitura ? 'Está em modo somente leitura.' : ''}` : 'ainda não instalado nesta VPS.'}</li>
<li><strong>Docker</strong>: o agente não tem o socket; fala com um proxy que libera só containers, imagens, redes e informações (sem exec, build, volumes ou segredos).</li>
<li><strong>Confirmações</strong>: toda ação pede confirmação; Parar, Atualizar e Deletar exigem digitar o nome do projeto; Deletar exige também um código novo enviado por e-mail e WhatsApp, válido só para aquela ação.</li></ul>
<h2 class="sv-h2">Regras de proteção desta VPS</h2><div class="adm-tabela-wrap"><table class="adm-tabela"><thead><tr><th scope="col"><span class="sv-th">Projeto ou imagem</span></th><th scope="col"><span class="sv-th">Nível</span></th><th scope="col"><span class="sv-th">Motivo</span></th></tr></thead><tbody>
${(d.protegidos || []).map((x) => `<tr><td>${x.projeto ? `<code>${esc(x.projeto)}</code>` : `imagem <code>${esc(x.imagem)}</code>`}</td><td>${esc(nivel[x.nivel] || x.nivel)}</td><td>${esc(x.motivo || '')}</td></tr>`).join('')}</tbody></table></div>
<p class="sv-nota">A lista fica em admin/servidores.mjs (cifrada no build). O agente tem uma segunda trava para o próprio projeto.</p>
<h2 class="sv-h2">Últimas ações nesta VPS</h2>${tabelaAuditoria(d.auditoria || [])}<p><a href="/admin/servidores/auditoria/">Ver o log de auditoria completo</a></p>`;
}

// ---------- projetos docker ----------
async function carregarProjetos(vid, forcar) {
  if (!est.projetos[vid] || forcar) est.projetos[vid] = await api('GET', `/vps/${encodeURIComponent(vid)}/projetos`);
  return est.projetos[vid];
}
const CHAVE = { nome: (p) => p.nome.toLowerCase(), containers: (p) => p.total, status: (p) => ({ erro: 0, interrompido: 1, executando: 2 }[p.status] ?? 3), saude: (p) => -(p.saude?.doentes || 0), cpu: (p) => p.uso?.cpuPct ?? -1, mem: (p) => p.uso?.memUsada ?? -1 };
async function abaProjetos(p, d) {
  const v = d.vps;
  if (!v.agenteConfigurado) { p.innerHTML = `<h1>Projetos Docker</h1>${aviso(v.observacao || 'Agente não instalado nesta VPS.')}`; return; }
  p.innerHTML = `<h1>Projetos Docker</h1>${aviso('Consultando o agente…')}`;
  let dados;
  try { dados = await carregarProjetos(v.id); } catch (e) { p.innerHTML = `<h1>Projetos Docker</h1>${aviso(e.message, 'erro')}<button type="button" class="btn btn--ghost" id="sv-tentar">Tentar de novo</button>`; $('#sv-tentar').onclick = () => { delete est.projetos[v.id]; abaProjetos(p, d); }; return; }
  p.innerHTML = `<div class="sv-proj-topo"><h1>Projetos Docker</h1><div class="sv-proj-botoes"><button type="button" class="btn btn--ghost" id="sv-atualizar-lista">Atualizar lista</button><button type="button" class="btn btn--ghost" disabled title="Planejado: criar projeto por compose manual exige revisão de segurança própria" aria-describedby="sv-compose-nota">Compose ▾</button></div></div>
<p class="sv-nota" id="sv-compose-nota">${dados.somenteLeitura ? 'Agente em modo somente leitura: só consulta e logs. ' : ''}Compose (criar projeto pela web) está planejado. Uso de recursos ${dados.statsEm ? `medido às ${new Date(dados.statsEm).toLocaleTimeString('pt-BR')}` : 'ainda sendo medido: atualize em alguns segundos'}.</p>
<div class="sv-filtros"><label>Buscar<input type="search" id="sv-busca" placeholder="Projeto, container ou imagem" value="${esc(est.busca)}"></label><label>Tamanho da página<select id="sv-tamanho">${[10, 20, 50].map((n) => `<option${n === est.tamanho ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>
<div id="sv-tabela"></div>`;
  $('#sv-atualizar-lista').onclick = async () => { delete est.projetos[v.id]; await abaProjetos(p, d); };
  $('#sv-busca').oninput = (e) => { est.busca = e.target.value; est.pagina = 1; tabela(); };
  $('#sv-tamanho').onchange = (e) => { est.tamanho = Number(e.target.value); est.pagina = 1; tabela(); };
  const tabela = () => desenharTabela($('#sv-tabela'), v, dados);
  tabela();
}
function desenharTabela(alvo, v, dados) {
  const q = est.busca.trim().toLowerCase();
  let lista = dados.projetos.filter((pr) => !q || pr.nome.toLowerCase().includes(q) || pr.containers.some((c) => c.nome.toLowerCase().includes(q) || String(c.imagem).toLowerCase().includes(q)));
  const [col, dir] = est.ordem;
  lista = [...lista].sort((a, b) => { const x = CHAVE[col](a), y = CHAVE[col](b); return (x < y ? -1 : x > y ? 1 : a.nome.localeCompare(b.nome)) * dir; });
  const total = lista.length, paginas = Math.max(1, Math.ceil(total / est.tamanho));
  est.pagina = Math.min(est.pagina, paginas);
  const ini = (est.pagina - 1) * est.tamanho, pag = lista.slice(ini, ini + est.tamanho);
  const th = (c, t) => `<th scope="col" aria-sort="${col === c ? (dir === 1 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-ordem="${c}">${t}</button></th>`;
  const linha = (pr) => {
    const aberto = est.abertos.has(pr.nome), parado = pr.status === 'interrompido';
    const ops = [['reiniciar', 'Reiniciar'], ['atualizar', 'Atualizar'], [parado ? 'iniciar' : 'parar', parado ? 'Iniciar' : 'Parar'], ['logs', 'Ver logs'], ['deletar', 'Deletar']];
    const motivo = dados.somenteLeitura ? 'agente em modo somente leitura' : pr.protecao ? pr.protecao.motivo : '';
    const menu = ops.map(([a, t]) => { const ok = a === 'logs' || pr.acoes.includes(a); return `<button type="button" role="menuitem" data-op="${a}"${ok ? '' : ` aria-disabled="true" title="${esc(`Bloqueado: ${motivo || 'não permitido'}`)}"`} class="${a === 'deletar' ? 'sv-perigo' : ''}">${t}</button>`; }).join('');
    const id = `sv-p-${pr.nome.replace(/[^a-z0-9_-]/gi, '_')}`;
    return `<tr class="sv-linha${aberto ? ' is-aberta' : ''}" data-proj="${esc(pr.nome)}">
<td class="sv-td-nome"><div class="sv-nome-in"><button type="button" class="sv-expandir" aria-expanded="${aberto}" aria-controls="${id}" aria-label="${aberto ? 'Recolher' : 'Expandir'} ${esc(pr.nome)}">${ICO.seta}</button><div><strong>${esc(pr.nome)}</strong> ${protChip(pr.protecao)}<small>${pr.total} contêiner${pr.total > 1 ? 'es' : ''}${pr.compose ? '' : ' fora de projeto'}</small></div></td>
<td data-rot="Contêineres">${pr.rodando}/${pr.total}</td>
<td data-rot="Status">${ponto(STATUS_PROJ[pr.status] || ['neutro', pr.status])}</td>
<td data-rot="Saúde">${saudeTxt(pr.saude)}</td>
<td data-rot="CPU">${pr.uso ? `${nf(pr.uso.cpuPct)}%` : '—'}</td>
<td data-rot="Memória">${pr.uso ? bytes(pr.uso.memUsada) : '—'}</td>
<td class="sv-td-acoes"><div class="sv-menu-wrap"><button type="button" class="sv-mais" aria-haspopup="menu" aria-expanded="false" aria-label="Ações de ${esc(pr.nome)}">${ICO.mais}</button><div class="sv-menu" role="menu" hidden>${menu}</div></div></td></tr>
<tr class="sv-sublinha" id="${id}"${aberto ? '' : ' hidden'}><td colspan="7"><ul class="sv-containers">${pr.containers.map((c) => `<li data-cont="${esc(c.id)}">
<div><span class="sv-rot">Contêiner</span><strong>${esc(c.nome)}</strong>${c.servico ? `<small>serviço ${esc(c.servico)}</small>` : ''}</div>
<div><span class="sv-rot">Imagem</span><code class="sv-img">${esc(c.imagem)}</code></div>
<div><span class="sv-rot">Status</span>${ponto(ESTADO_C[c.estado] || ['neutro', c.estado])}<small>${esc(c.status)}</small></div>
<div><span class="sv-rot">Portas</span>${c.portas.length ? c.portas.map((x) => `<code>${esc(x)}</code>`).join(' ') : '—'}</div>
<div><span class="sv-rot">Healthcheck</span>${c.saude ? esc({ saudavel: 'saudável', doente: 'com falha', iniciando: 'iniciando' }[c.saude]) : 'sem verificação'}</div>
<div><span class="sv-rot">Uso</span>${c.uso ? `${nf(c.uso.cpuPct ?? 0)}% · ${bytes(c.uso.memUsada)}` : '—'}</div>
<div class="sv-cont-botoes"><button type="button" class="btn btn--ghost" data-detalhe="${esc(c.id)}">Detalhes</button><a class="btn btn--ghost" href="#/vps/${esc(v.id)}/logs/${esc(c.id)}">Logs</a></div>
<div class="sv-cont-det" hidden></div></li>`).join('')}</ul></td></tr>`;
  };
  alvo.innerHTML = `<div class="adm-tabela-wrap sv-tabela-wrap"><table class="adm-tabela sv-tabela"><caption class="sv-oculto">Projetos Docker de ${esc(v.nome)}</caption><thead><tr>${th('nome', 'Nome do projeto')}${th('containers', 'Contêineres')}${th('status', 'Status')}${th('saude', 'Saúde')}${th('cpu', 'CPU')}${th('mem', 'Memória')}<th scope="col"><span class="sv-oculto">Ações</span></th></tr></thead>
<tbody>${pag.map(linha).join('') || `<tr><td colspan="7">Nenhum projeto encontrado${q ? ` para "${esc(est.busca)}"` : ''}.</td></tr>`}</tbody></table></div>
<div class="sv-paginacao"><span>${total ? `${ini + 1} para ${Math.min(ini + est.tamanho, total)} de ${total}` : '0 de 0'}</span><div><button type="button" class="sv-pag" data-pag="1" aria-label="Primeira página"${est.pagina === 1 ? ' disabled' : ''}>«</button><button type="button" class="sv-pag" data-pag="${est.pagina - 1}" aria-label="Página anterior"${est.pagina === 1 ? ' disabled' : ''}>‹</button><span>Página ${est.pagina} de ${paginas}</span><button type="button" class="sv-pag" data-pag="${est.pagina + 1}" aria-label="Próxima página"${est.pagina === paginas ? ' disabled' : ''}>›</button><button type="button" class="sv-pag" data-pag="${paginas}" aria-label="Última página"${est.pagina === paginas ? ' disabled' : ''}>»</button></div></div>`;
  const redesenhar = () => desenharTabela(alvo, v, dados);
  alvo.onclick = async (e) => {
    const b = e.target.closest('button,a'); if (!b) return;
    if (b.dataset.ordem) { const c = b.dataset.ordem; est.ordem = [c, est.ordem[0] === c ? -est.ordem[1] : 1]; return redesenhar(); }
    if (b.dataset.pag) { est.pagina = Number(b.dataset.pag); return redesenhar(); }
    const tr = b.closest('[data-proj]'), pr = tr && dados.projetos.find((x) => x.nome === tr.dataset.proj);
    if (b.classList.contains('sv-expandir')) { est.abertos.has(pr.nome) ? est.abertos.delete(pr.nome) : est.abertos.add(pr.nome); return redesenhar(); }
    if (b.classList.contains('sv-mais')) { const m = b.nextElementSibling, abrir = m.hidden; fecharMenus(); if (abrir) { m.hidden = false; b.setAttribute('aria-expanded', 'true'); m.querySelector('[role="menuitem"]:not([aria-disabled])')?.focus(); } return; }
    if (b.dataset.op) {
      if (b.getAttribute('aria-disabled') === 'true') return;
      fecharMenus();
      if (b.dataset.op === 'logs') return vai(`#/vps/${encodeURIComponent(v.id)}/logs/${encodeURIComponent(pr.containers[0]?.id || '')}`);
      return confirmarAcao(v, pr, b.dataset.op);
    }
    if (b.dataset.detalhe) {
      const caixa = b.closest('li').querySelector('.sv-cont-det');
      if (!caixa.hidden) { caixa.hidden = true; return; }
      caixa.hidden = false; caixa.textContent = 'Carregando…';
      try { caixa.innerHTML = detalheContainer(await api('GET', `/vps/${encodeURIComponent(v.id)}/containers/${encodeURIComponent(b.dataset.detalhe)}`)); } catch (er) { caixa.textContent = er.message; }
    }
  };
}
function detalheContainer(c) {
  const l = (t, val) => `<div><dt>${t}</dt><dd>${val}</dd></div>`;
  return `<dl class="sv-dl">${l('Imagem', `<code>${esc(c.imagem)}</code> <small>${esc(c.imagemId)}</small>`)}${l('Iniciado', dataHora(c.iniciado))}${l('Reinícios', esc(c.reinicios))}${l('Política de reinício', esc(c.politica))}${l('Limite de memória', c.limiteMem ? bytes(c.limiteMem) : 'sem limite')}
${l('Healthcheck', c.healthcheck ? `<code>${esc(c.healthcheck.teste)}</code>${c.healthcheck.intervaloS ? ` a cada ${nf(c.healthcheck.intervaloS, 0)} s` : ''}` : 'não definido')}${l('Últimas verificações', (c.verificacoes || []).map((x) => `${dataHora(x.fim)}: ${x.codigo === 0 ? 'ok' : 'falhou'}${x.saida ? ` <small>${esc(mascarar(x.saida))}</small>` : ''}`).join('<br>') || '—')}
${l('Redes', (c.redes || []).map((x) => `<code>${esc(x)}</code>`).join(' ') || '—')}${l('Montagens', (c.montagens || []).map((x) => `<code>${esc(x.destino)}</code> <small>${esc(x.tipo)}${x.somenteLeitura ? ', só leitura' : ''}</small>`).join('<br>') || '—')}</dl>`;
}
const fecharMenus = () => document.querySelectorAll('.sv-menu').forEach((m) => { if (!m.hidden) { m.hidden = true; m.previousElementSibling.setAttribute('aria-expanded', 'false'); } });
document.addEventListener('click', (e) => { if (!e.target.closest('.sv-menu-wrap')) fecharMenus(); const c = e.target.closest('[data-copiar]'); if (c) copiar(c); });
document.addEventListener('keydown', (e) => {
  const m = e.target.closest?.('.sv-menu');
  if (e.key === 'Escape' && m) { fecharMenus(); m.previousElementSibling.focus(); }
  if (m && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); const it = [...m.querySelectorAll('[role="menuitem"]')]; it[(it.indexOf(e.target) + (e.key === 'ArrowDown' ? 1 : -1) + it.length) % it.length].focus(); }
});
async function copiar(b) {
  try { await navigator.clipboard.writeText(b.dataset.copiar); } catch { const t = document.createElement('textarea'); t.value = b.dataset.copiar; document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); }
  b.classList.add('is-copiado'); b.setAttribute('aria-label', 'Copiado'); setTimeout(() => b.classList.remove('is-copiado'), 1500);
}

// ---------- confirmação das ações ----------
const TEXTO_ACAO = {
  reiniciar: (n) => `Os contêineres em execução de ${n} serão reiniciados. O serviço fica fora do ar por alguns segundos.`,
  parar: (n) => `Todos os contêineres de ${n} serão parados. Quem depende dele para de funcionar até você clicar em Iniciar.`,
  iniciar: (n) => `Os contêineres parados de ${n} serão iniciados (tarefas de execução única que já terminaram bem não rodam de novo).`,
  atualizar: (n) => `Baixa a versão mais recente da imagem de cada contêiner de ${n} e recria só os que mudaram, com a mesma configuração e os mesmos volumes. Se a recriação falhar, o contêiner antigo volta. Pode levar alguns minutos.`,
  deletar: (n) => `Apaga todos os contêineres e as redes de ${n}. Os volumes de dados são preservados, mas o serviço some da VPS. Não dá para desfazer pelo painel.`
};
let dialogo;
function confirmarAcao(v, pr, acao) {
  dialogo?.remove();
  dialogo = document.createElement('dialog');
  dialogo.className = 'sv-dialogo';
  dialogo.setAttribute('aria-labelledby', 'sv-dlg-t');
  const nome = PEDE_NOME.has(acao), codigo = PEDE_CODIGO.has(acao);
  dialogo.innerHTML = `<form method="dialog" class="sv-dlg-form"><h2 id="sv-dlg-t">${ROTULO_ACAO[acao]} o projeto ${esc(pr.nome)}?</h2>
<p>${esc(TEXTO_ACAO[acao](pr.nome))}</p><p class="sv-dlg-vps">VPS: <strong>${esc(v.nome)}</strong> (${esc(v.host || v.ip || '')})</p>
${nome ? `<label>Para confirmar, digite o nome do projeto: <code>${esc(pr.nome)}</code><input name="confirmacao" autocomplete="off" spellcheck="false" autocapitalize="off"></label>` : ''}
${codigo ? `<div class="sv-dlg-codigo"><p>Deletar exige um código novo, enviado para o e-mail e o WhatsApp cadastrados e válido só para esta ação.</p><button type="button" class="btn btn--ghost" data-enviar>Enviar código</button><label>Código de 6 números<input name="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="\\d{6}"></label></div>` : ''}
<p class="sv-dlg-msg" role="status" aria-live="polite"></p><ul class="sv-dlg-det" hidden></ul>
<div class="sv-dlg-botoes"><button type="button" class="btn btn--ghost" data-cancelar>Cancelar</button><button type="submit" class="btn ${acao === 'parar' || acao === 'deletar' ? 'sv-btn-perigo' : 'btn--primary'}" data-confirmar disabled>${ROTULO_ACAO[acao]}</button></div></form>`;
  document.body.append(dialogo);
  const f = $('form', dialogo), btn = $('[data-confirmar]', dialogo), msg = $('.sv-dlg-msg', dialogo), det = $('.sv-dlg-det', dialogo);
  let executando = false, feito = false;
  const valido = () => (!nome || f.confirmacao.value === pr.nome) && (!codigo || /^\d{6}$/.test(f.codigo.value.trim()));
  const atualizar = () => { btn.disabled = executando || feito || !valido(); };
  f.addEventListener('input', atualizar); atualizar();
  $('[data-cancelar]', dialogo).onclick = () => { if (!executando) dialogo.close(); };
  dialogo.addEventListener('cancel', (e) => { if (executando) e.preventDefault(); });
  dialogo.addEventListener('close', () => { dialogo.remove(); if (feito) { delete est.projetos[v.id]; desenhar(); } });
  $('[data-enviar]', dialogo)?.addEventListener('click', async (e) => {
    e.target.disabled = true; msg.textContent = 'Enviando o código…';
    try { msg.textContent = (await api('POST', `/vps/${encodeURIComponent(v.id)}/codigo`, { projeto: pr.nome, acao })).mensagem; f.codigo.focus(); }
    catch (er) { msg.textContent = er.message; }
    setTimeout(() => { e.target.disabled = false; }, 60_000);
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!valido() || executando || feito) return;
    executando = true; atualizar(); msg.textContent = acao === 'atualizar' ? 'Executando: baixando imagens e recriando, pode levar alguns minutos…' : 'Executando…';
    try {
      const r = await api('POST', `/vps/${encodeURIComponent(v.id)}/acao`, { projeto: pr.nome, acao, confirmado: true, confirmacao: nome ? f.confirmacao.value : undefined, codigo: codigo ? f.codigo.value.trim() : undefined });
      feito = true; msg.textContent = `${ROTULO_ACAO[acao]} concluído em ${nf(r.duracaoMs / 1000)} s. Registrado na auditoria.`; msg.dataset.tipo = 'ok';
      det.innerHTML = (r.detalhes || []).map((x) => `<li>${esc(x)}</li>`).join(''); det.hidden = false;
      $('[data-cancelar]', dialogo).textContent = 'Fechar';
    } catch (er) { msg.textContent = er.message; msg.dataset.tipo = 'erro'; }
    executando = false; atualizar();
  });
  dialogo.showModal();
  (nome ? f.confirmacao : btn.disabled ? $('[data-cancelar]', dialogo) : btn).focus();
}

// ---------- logs ----------
async function abaLogs(p, d, r) {
  const v = d.vps;
  let dados; try { dados = await carregarProjetos(v.id); } catch (e) { p.innerHTML = `<h1>Logs</h1>${aviso(e.message, 'erro')}`; return; }
  const todos = dados.projetos.flatMap((pr) => pr.containers.map((c) => ({ ...c, projeto: pr.nome })));
  const atual = todos.find((c) => c.id === r.extra || c.nome === r.extra) || todos[0];
  p.innerHTML = `<div class="sv-proj-topo"><h1>Logs</h1><a class="btn btn--ghost" href="#/vps/${esc(v.id)}/projetos">← Projetos</a></div>
<p class="sv-nota">Últimas linhas de cada contêiner, com segredos mascarados (variáveis tipo TOKEN, KEY, SECRET, PASSWORD, SENHA e endereços com credenciais viram ***) no agente, no serviço e aqui.</p>
<div class="sv-filtros"><label>Contêiner<select id="sv-log-c">${dados.projetos.map((pr) => `<optgroup label="${esc(pr.nome)}">${pr.containers.map((c) => `<option value="${esc(c.id)}"${c.id === atual?.id ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</optgroup>`).join('')}</select></label>
<label>Linhas<select id="sv-log-n">${[100, 200, 500, 1000].map((n) => `<option${n === 200 ? ' selected' : ''}>${n}</option>`).join('')}</select></label><button type="button" class="btn btn--primary" id="sv-log-atualizar">Atualizar</button></div>
<p class="sv-log-info" id="sv-log-info" role="status"></p><pre class="sv-log" id="sv-log" tabindex="0" aria-label="Logs do contêiner"></pre>`;
  const carregar = async () => {
    const c = $('#sv-log-c').value, n = $('#sv-log-n').value, info = $('#sv-log-info'), pre = $('#sv-log');
    info.textContent = 'Carregando…';
    try {
      const l = await api('GET', `/vps/${encodeURIComponent(v.id)}/logs?container=${encodeURIComponent(c)}&linhas=${n}`);
      const txt = mascarar(l.texto || '');
      pre.textContent = txt || '(sem linhas de log)';
      info.textContent = `${txt ? txt.split('\n').length : 0} linha(s) de ${todos.find((x) => x.id === c)?.nome || c}, lidas às ${new Date(l.em).toLocaleTimeString('pt-BR')}.`;
      pre.scrollTop = pre.scrollHeight;
      history.replaceState(null, '', `#/vps/${encodeURIComponent(v.id)}/logs/${encodeURIComponent(c)}`);
    } catch (e) { info.textContent = e.message; pre.textContent = ''; }
  };
  $('#sv-log-atualizar').onclick = carregar; $('#sv-log-c').onchange = carregar; $('#sv-log-n').onchange = carregar;
  if (atual) carregar(); else $('#sv-log-info').textContent = 'Nenhum contêiner nesta VPS.';
}

// ---------- auditoria ----------
const RES = { ok: ['ok', 'Concluída'], recusado: ['parado', 'Recusada'], falhou: ['erro', 'Falhou'], enviado: ['neutro', 'Código enviado'] };
function tabelaAuditoria(evs) {
  if (!evs.length) return '<p>Nenhuma ação registrada ainda.</p>';
  return `<div class="adm-tabela-wrap"><table class="adm-tabela sv-aud"><thead><tr>${['Quando', 'Quem', 'VPS', 'Projeto', 'Ação', 'Resultado', 'Detalhe'].map((t) => `<th scope="col"><span class="sv-th">${t}</span></th>`).join('')}</tr></thead><tbody>
${evs.map((e) => `<tr><td data-rot="Quando">${dataHora(e.em)}</td><td data-rot="Quem">${esc(e.quem)}<small>${esc(e.ip || '')}</small></td><td data-rot="VPS">${esc(e.vps)}</td><td data-rot="Projeto"><code>${esc(e.projeto)}</code></td><td data-rot="Ação">${esc(ROTULO_ACAO[e.acao] || e.acao)}</td><td data-rot="Resultado">${ponto(RES[e.resultado] || ['neutro', e.resultado])}</td><td data-rot="Detalhe" class="sv-aud-det">${esc(e.detalhe || '')}</td></tr>`).join('')}</tbody></table></div>`;
}
async function telaAuditoria() {
  app.innerHTML = `<h1>Log de auditoria</h1>${aviso('Carregando…')}`;
  try {
    const { eventos } = await api('GET', '/auditoria?limite=500');
    app.innerHTML = `<div class="sv-topo"><div><h1>Log de auditoria</h1><p class="adm-intro">Toda ação da seção Servidores (e toda recusa) fica registrada no servidor: quem, quando, VPS, projeto, ação e resultado. Os segredos são mascarados também aqui.</p></div><button type="button" class="btn btn--ghost" id="sv-aud-recarregar">Atualizar</button></div>
<div class="sv-filtros"><label>Resultado<select id="sv-aud-f"><option value="">Todos</option>${Object.entries(RES).map(([k, [, t]]) => `<option value="${k}">${t}</option>`).join('')}</select></label></div><div id="sv-aud-tab">${tabelaAuditoria(eventos)}</div>`;
    $('#sv-aud-f').onchange = (e) => { $('#sv-aud-tab').innerHTML = tabelaAuditoria(eventos.filter((x) => !e.target.value || x.resultado === e.target.value)); };
    $('#sv-aud-recarregar').onclick = telaAuditoria;
  } catch (e) { app.innerHTML = `<h1>Log de auditoria</h1>${aviso(e.message, 'erro')}`; }
}

// ---------- roteamento ----------
async function desenhar() {
  if (tela === 'auditoria') return telaAuditoria();
  const r = rota();
  if (r.lista) { document.title = 'Servidores | Painel DM ObservaIT'; return telaLista(); }
  if (r.aba !== 'projetos' && r.aba !== 'logs') est.abertos.clear();
  document.title = `${nomeAba(r.aba)} · ${r.vps} | Servidores | Painel DM ObservaIT`;
  await telaGerenciar(r);
  $('h1', app)?.setAttribute('tabindex', '-1');
}
window.addEventListener('hashchange', () => { desenhar().then(() => $('#sv-painel h1, h1', app)?.focus({ preventScroll: false })); });
desenhar();

})();
