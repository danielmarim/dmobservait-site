// Serviço de login e de acessos do painel /admin (dmobservait.com/admin). Entrada por código de 6 dígitos enviado por
// e-mail e/ou WhatsApp, lista de pessoas com papéis e seções (Dono, Administrador, Somente leitura), sessões e auditoria.
// Roda num container sem porta pública, numa rede só com o nginx do site, e sem dependências: só Node 20. O nginx usa
// auth_request em /verificar?secao=... antes de entregar qualquer arquivo ou API do /admin (as permissões são aplicadas lá).
//
// O envio fica no n8n (workflow isolado "DM ObservaIT | Painel /admin: código de acesso"): este serviço só faz um POST para
// DM_LOGIN_WEBHOOK, assim as credenciais do SMTP e do WhatsApp nunca saem de lá. O pedido vai assinado (HMAC com
// chave derivada do caminho secreto do webhook + carimbo de tempo) e o n8n aceita qualquer destino cadastrado aqui, só com os
// modelos de código, confirmação e convite. O formato antigo {canal, destino, codigo} (usado também pela seção Servidores)
// segue valendo, mas o n8n só o entrega aos contatos fixos do Daniel.
//
// Variáveis de ambiente (vêm do environment da Hostinger; nada disto fica no repositório público):
//   DM_LOGIN_SEGREDO      chave (hex, 64) que assina a sessão e protege o hash do código
//   DM_LOGIN_WEBHOOK      endereço do webhook do n8n que envia as mensagens
//   DM_LOGIN_EMAIL, DM_LOGIN_WHATSAPP, DM_LOGIN_RECUPERACAO   contatos do Dono (semeiam a conta e a recuperação)
//   DM_LOGIN_NOME, DM_LOGIN_EMPRESA   nome e empresa do Dono (só na primeira vez; depois valem os dados do painel)
//   DADOS (/dados)        pasta persistente: usuarios.json, sessoes.json, auditoria.jsonl
//   DM_LOGIN_CODIGO_S (600)  validade do código   DM_LOGIN_SESSAO_S (43200)  validade da sessão
//   DM_LOGIN_INTERVALO_S (30) espera entre dois envios ao mesmo destino   DM_LOGIN_HORA_MAX (6) envios por destino por hora
//   DM_LOGIN_GEOIP        país pelo IP: "desligado" ou um endereço com {ip} (padrão https://ipwho.is/{ip})
// Sem segredo, webhook ou contatos, o serviço sobe, mas nada entra (verificar sempre 401) e nada é enviado.
//
// Regras: código de uso único, guardado só como HMAC com sal, comparação em tempo constante, 5 erros invalidam o código,
// limites por IP e por destino, resposta idêntica para destino cadastrado ou não (o envio é feito depois de responder,
// para o tempo também não revelar nada). Os códigos ficam em memória (reiniciar apaga os pendentes); as pessoas, as
// sessões e a auditoria ficam em disco.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
  SECOES, IDS_SECAO, PAPEIS, MAX_USUARIOS, ID_DONO, normEmail, emailValido, normWhats, whatsValido, mesmoWhats, nomeValido,
  mascaraEmail, mascaraWhats, dataValida, fimDoDia, secoesDe, estadoDe, podeEntrar, primeiraPagina, decidir, criarArmazem
} from './usuarios.mjs';

const env = process.env;
const PORTA = Number(env.PORTA || 8081);
const CODIGO_S = Number(env.DM_LOGIN_CODIGO_S || 600);
const SESSAO_S = Number(env.DM_LOGIN_SESSAO_S || 12 * 3600);
const INTERVALO_S = Number(env.DM_LOGIN_INTERVALO_S || 30), HORA_MAX = Number(env.DM_LOGIN_HORA_MAX || 6), CONFIRMAR_S = Number(env.DM_LOGIN_CONFIRMAR_S || 30);
const hex64 = (s) => (/^[0-9a-f]{64}$/i.test(s || '') ? Buffer.from(s, 'hex') : null);
const SEGREDO = hex64(env.DM_LOGIN_SEGREDO);
const WEBHOOK = /^https?:\/\//.test(env.DM_LOGIN_WEBHOOK || '') ? env.DM_LOGIN_WEBHOOK : '';
// chave que assina os pedidos ao n8n: derivada do caminho secreto do webhook (o workflow tem o mesmo caminho e faz a mesma conta);
// DM_LOGIN_ASSINATURA (hex, 64) a substitui se um dia o workflow passar a usar uma chave própria
const ASSINATURA = hex64(env.DM_LOGIN_ASSINATURA) || (WEBHOOK ? createHmac('sha256', 'dm-login-envio-v1').update(new URL(WEBHOOK).pathname.split('/').filter(Boolean).pop() || '').digest() : null);
const norm = (s) => String(s || '').trim().toLowerCase();
const digitos = (s) => String(s || '').replace(/\D/g, '');
const EMAIL = norm(env.DM_LOGIN_EMAIL), RECUP = norm(env.DM_LOGIN_RECUPERACAO), WHATS = digitos(env.DM_LOGIN_WHATSAPP);
const GEOIP = env.DM_LOGIN_GEOIP === 'desligado' ? '' : env.DM_LOGIN_GEOIP || 'https://ipwho.is/{ip}';
const SENHA_INC = env.SENHA_INC || '/app/nginx/dm-admin-senha.inc';
const DADOS_JSON = env.DADOS_JSON || '/app/admin/dados.json';
const COOKIE = '__Host-dm_admin';
const MSG_ENVIO = 'Se o destino estiver cadastrado, o código foi enviado. Ele vale por poucos minutos.';
const MSG_CODIGO = 'Código inválido ou expirado. Peça um novo código.';
const agora = () => Date.now();

// ---------- pessoas, sessões e auditoria (disco) ----------
const armazem = criarArmazem(env.DADOS || '/dados');
{ // semeia o Dono pelo environment: ele nunca fica de fora (a recuperação por e-mail também vale sempre)
  if (!armazem.dono() && (EMAIL || WHATS)) {
    armazem.estado.usuarios.unshift({ id: ID_DONO, nome: env.DM_LOGIN_NOME || 'Daniel Marim', empresa: env.DM_LOGIN_EMPRESA || 'DM ObservaIT', email: EMAIL, whatsapp: WHATS, recuperacao: RECUP, papel: 'dono', secoes: [...IDS_SECAO], status: 'ativo', canais: ['email', 'whatsapp'], criadoEm: new Date().toISOString() });
    armazem.salvarUsuarios();
  }
}
const usuarios = () => armazem.estado.usuarios;
const quemFez = (u) => `${u.nome} (${PAPEIS[u.papel]?.rotulo || u.papel})`;

// ---------- limites (em memória) ----------
const janelas = new Map(); // chave -> { n, ate }
const estourou = (chave, max, janelaS) => {
  let j = janelas.get(chave);
  if (!j || j.ate <= agora()) { j = { n: 0, ate: agora() + janelaS * 1000 }; janelas.set(chave, j); }
  j.n++;
  return j.n > max;
};
const bloqueado = (chave, max) => { const j = janelas.get(chave); return !!j && j.ate > agora() && j.n >= max; };

// ---------- código (login e confirmação de ações) ----------
const tickets = new Map(); // ticket -> { uid|null, sal, hash, ate, tentativas }: um por pedido de código (também para destino que não existe)
const ticketDoUsuario = new Map(); // uid -> ticket mais recente (um código válido por pessoa)
const confirmacoes = new Map(); // `${sid}|${escopo}` -> { sal, hash, ate, tentativas }
const hashCodigo = (sal, codigo) => createHmac('sha256', SEGREDO).update(sal).update('|').update(codigo).digest();
const igual = (a, b) => a.length === b.length && timingSafeEqual(a, b);
const novoCodigo = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
const registroCodigo = (codigo) => { const sal = randomBytes(16); return { sal, hash: hashCodigo(sal, codigo), ate: agora() + CODIGO_S * 1000, tentativas: 0 }; };
// confere um registro de código; consome o registro quando acerta, expira ou esgota as 5 tentativas
const conferir = (mapa, chave, codigo) => {
  const r = mapa.get(chave);
  if (!r || !SEGREDO || !/^\d{6}$/.test(codigo)) return false;
  if (r.ate <= agora() || r.tentativas >= 5) { mapa.delete(chave); return false; }
  r.tentativas++;
  if (igual(hashCodigo(r.sal, codigo), r.hash)) { mapa.delete(chave); return true; }
  if (r.tentativas >= 5) mapa.delete(chave);
  return false;
};
setInterval(() => {
  const t = agora();
  for (const [k, j] of janelas) if (j.ate <= t) janelas.delete(k);
  for (const m of [tickets, confirmacoes]) for (const [k, r] of m) if (r.ate <= t) m.delete(k);
  armazem.descarregar();
}, 60_000).unref();

// ---------- sessão (cookie assinado + registro em disco) ----------
const b64 = (b) => Buffer.from(b).toString('base64url');
const assinar = (txt) => createHmac('sha256', SEGREDO).update('sessao|').update(txt).digest();
const cookieDe = (req) => { for (const p of String(req.headers.cookie || '').split(';')) { const i = p.indexOf('='); if (i > 0 && p.slice(0, i).trim() === COOKIE) return p.slice(i + 1).trim(); } return ''; };
const setCookie = (valor, maxAge) => `${COOKIE}=${valor}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
const lerCookie = (valor) => {
  if (!SEGREDO || typeof valor !== 'string') return null;
  const [corpo, sig] = valor.split('.');
  if (!corpo || !sig) return null;
  let s; try { s = Buffer.from(sig, 'base64url'); } catch { return null; }
  if (!igual(s, assinar(corpo))) return null;
  let d; try { d = JSON.parse(Buffer.from(corpo, 'base64url').toString()); } catch { return null; }
  return d && typeof d.sid === 'string' && d.exp > agora() / 1000 ? d : null;
};
// IP do visitante: o Traefik acrescenta o IP que ele viu ao fim de X-Forwarded-For; o que vem antes pode ser inventado.
const ipDe = (req) => { const x = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean); return (x.at(-1) || req.socket.remoteAddress || '?').replace(/^::ffff:/i, '').slice(0, 64); };
const dispositivoDe = (ua) => (/iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop');
const navegadorDe = (ua) => (/Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '');

const paisCache = new Map();
const privado = (ip) => !/^\d+\.\d+\.\d+\.\d+$/.test(ip) && !ip.includes(':') ? true : /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fe80|fc|fd)/i.test(ip);
async function descobrirPais(ip) {
  if (!GEOIP || privado(ip)) return privado(ip) ? 'Rede local' : '';
  if (paisCache.has(ip)) return paisCache.get(ip);
  let pais = '';
  try { const r = await fetch(GEOIP.replace('{ip}', encodeURIComponent(ip)), { signal: AbortSignal.timeout(3000) }); const j = await r.json(); pais = String(j.country || '').slice(0, 60); } catch { /* sem país: a tela mostra "não identificado" */ }
  if (paisCache.size > 500) paisCache.clear();
  paisCache.set(ip, pais);
  return pais;
}

function criarSessao(u, req, tipo) {
  const sid = randomBytes(12).toString('hex'), exp = Math.floor(agora() / 1000) + SESSAO_S, ua = String(req.headers['user-agent'] || '');
  const ip = ipDe(req);
  armazem.sessoes.set(sid, { ref: randomBytes(6).toString('hex'), uid: u.id, tipo, criadoEm: agora(), ultimoEm: agora(), exp, ip, dispositivo: dispositivoDe(ua), navegador: navegadorDe(ua), pais: '', encerrada: false });
  armazem.salvarSessoes();
  descobrirPais(ip).then((p) => { const s = armazem.sessao(sid); if (s && p) { s.pais = p; armazem.marcarSuja(); } });
  const corpo = b64(JSON.stringify({ sid, exp }));
  return `${corpo}.${b64(assinar(corpo))}`;
}
// sessão válida: cookie assinado, registro ativo, pessoa existente, ativa e dentro da validade do acesso
function autenticar(req) {
  const d = lerCookie(cookieDe(req));
  const s = d && armazem.sessao(d.sid);
  if (!s || s.encerrada || !(s.exp > agora() / 1000)) return null;
  const u = armazem.usuario(s.uid);
  if (!u || !podeEntrar(u)) return null;
  if (agora() - s.ultimoEm > 60_000) { s.ultimoEm = agora(); armazem.marcarSuja(); }
  return { d, s, u };
}
const encerrarSessoesDe = (uid, exceto) => { let n = 0; for (const [sid, s] of armazem.sessoes) if (s.uid === uid && !s.encerrada && sid !== exceto) { s.encerrada = true; n++; } if (n) armazem.salvarSessoes(); return n; };

// ---------- envio (n8n) ----------
// tipo: codigo (login), confirmar (confirmação de ação do Dono) ou convite. Assinado quando há DM_LOGIN_ASSINATURA.
const enviar = async (tipo, canal, destino, { codigo = '', nome = '' } = {}) => {
  if (!WEBHOOK) return console.error(`login: sem DM_LOGIN_WEBHOOK, ${canal} não enviado`);
  let corpo;
  if (ASSINATURA) {
    const ts = String(Math.floor(agora() / 1000));
    const assinatura = createHmac('sha256', ASSINATURA).update([tipo, canal, destino, nome, codigo, ts].join('|')).digest('hex');
    corpo = { tipo, canal, destino, nome, codigo, ts, assinatura };
  } else if (tipo === 'convite') return console.error('login: sem DM_LOGIN_ASSINATURA, convite não enviado');
  else corpo = { canal, destino, codigo };
  try {
    const r = await fetch(WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(20_000) });
    if (!r.ok) console.error(`login: envio (${tipo}) por ${canal} falhou (HTTP ${r.status})`);
  } catch (e) { console.error(`login: envio (${tipo}) por ${canal} falhou (${e.name})`); }
};
const contatosDe = (u) => [['email', u.email], ['whatsapp', u.whatsapp]].filter(([c, d]) => d && (u.canais?.length ? u.canais : ['email', 'whatsapp']).includes(c));

// ---------- http ----------
const json = (res, status, obj, extra = {}) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra }); res.end(JSON.stringify(obj)); };
const corpo = async (req) => {
  let n = 0; const partes = [];
  for await (const c of req) { n += c.length; if (n > 8192) throw Object.assign(new Error('grande'), { status: 413 }); partes.push(c); }
  const t = Buffer.concat(partes).toString('utf8');
  const ct = String(req.headers['content-type'] || '');
  if (ct.startsWith('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(t));
  try { const v = JSON.parse(t || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { throw Object.assign(new Error('json'), { status: 400 }); }
};
// só a tela do painel pode chamar: cabeçalho próprio + mesma origem (o cookie SameSite=Strict já barra outros sites)
const mesmaOrigem = (req) => req.headers['x-dm-admin'] === '1' && (!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] === 'same-origin');

// ---------- visão pública de uma pessoa ----------
const visao = (u, { completo = false } = {}) => ({
  id: u.id, nome: u.nome, papel: u.papel, papelRotulo: PAPEIS[u.papel]?.rotulo, secoes: secoesDe(u), estado: estadoDe(u), ehDono: u.papel === 'dono',
  email: completo ? u.email || '' : mascaraEmail(u.email), whatsapp: completo ? u.whatsapp || '' : mascaraWhats(u.whatsapp),
  temEmail: !!u.email, temWhatsapp: !!u.whatsapp, canais: u.canais?.length ? u.canais : ['email', 'whatsapp'],
  criadoEm: u.criadoEm, ultimoAcesso: u.ultimoAcesso || null, expiraEm: u.expiraEm || '', empresa: u.empresa || '',
  ...(completo && u.papel === 'dono' ? { recuperacao: u.recuperacao || '' } : {})
});
const emergencia = () => {
  let arquivo = false;
  try { arquivo = /^\s*auth_basic\s+/m.test(readFileSync(SENHA_INC, 'utf8')); } catch { /* sem o arquivo: o nginx do site é quem manda */ }
  const desligada = !!armazem.estado.config.emergenciaDesligada;
  return { ativa: arquivo && !desligada, arquivoLigado: arquivo, desligadaNoPainel: desligada };
};
const filtrarDados = (u) => {
  let d; try { d = JSON.parse(readFileSync(DADOS_JSON, 'utf8')); } catch { return null; }
  const mapa = { infra: 'infra', dynoAi: 'dyno' }; // o resto (MVPs, metas) é da Visão geral
  const ok = secoesDe(u);
  return Object.fromEntries(Object.entries(d).filter(([k]) => ok.includes(mapa[k] || 'visao')));
};

// ---------- sessões e logins (tela "Atividades da conta") ----------
const listaSessoes = (u, todas, atualSid) => {
  const todasSessoes = [...armazem.sessoes.entries()];
  const primeiro = new Map();
  for (const [, s] of todasSessoes) { const k = `${s.uid}|${s.ip}|${s.dispositivo}`; primeiro.set(k, Math.min(primeiro.get(k) || Infinity, s.criadoEm)); }
  return todasSessoes.filter(([, s]) => (todas && u.papel === 'dono') || s.uid === u.id).sort((a, b) => b[1].criadoEm - a[1].criadoEm).map(([sid, s]) => ({
    ref: s.ref, pessoa: armazem.usuario(s.uid)?.nome || '(removida)', atual: sid === atualSid, tipo: s.tipo, dispositivo: s.dispositivo, navegador: s.navegador, ip: s.ip, pais: s.pais || '',
    loginAtual: s.criadoEm, primeiroLogin: primeiro.get(`${s.uid}|${s.ip}|${s.dispositivo}`), ultimoEm: s.ultimoEm, ativa: !s.encerrada && s.exp > agora() / 1000
  }));
};

// ---------- validação de pessoas ----------
function lerPessoa(b, { atual = null } = {}) {
  const nome = String(b.nome ?? atual?.nome ?? '').trim().replace(/\s+/g, ' ');
  const email = normEmail(b.email ?? atual?.email ?? ''), whatsapp = normWhats(b.whatsapp ?? atual?.whatsapp ?? '');
  const erros = [];
  if (!nomeValido(nome)) erros.push('Informe o nome (2 a 60 letras).');
  if (email && !emailValido(email)) erros.push('E-mail inválido.');
  if (whatsapp && !whatsValido(whatsapp)) erros.push('WhatsApp inválido: use DDD e número (ex.: 11 99999-9999).');
  if (!email && !whatsapp) erros.push('Informe um e-mail e/ou um WhatsApp.');
  const papel = String(b.papel ?? atual?.papel ?? '');
  if (!['admin', 'leitura'].includes(papel)) erros.push('Escolha o papel: Administrador ou Somente leitura.');
  const secoesIn = Array.isArray(b.secoes) ? b.secoes.map(String) : atual?.secoes ?? [...IDS_SECAO];
  if (secoesIn.some((s) => !IDS_SECAO.includes(s))) erros.push('Seção desconhecida.');
  const secoes = IDS_SECAO.filter((s) => secoesIn.includes(s));
  if (!secoes.length) erros.push('Libere ao menos uma seção.');
  let expiraEm = b.expiraEm === undefined ? atual?.expiraEm || '' : String(b.expiraEm || '').trim();
  if (expiraEm && !dataValida(expiraEm)) erros.push('Data de validade inválida.');
  else if (expiraEm && fimDoDia(expiraEm) < agora()) erros.push('A validade precisa ser uma data futura.');
  // contato já usado por outra pessoa (o Dono é quem cadastra, então pode saber)
  for (const o of usuarios()) {
    if (atual && o.id === atual.id) continue;
    if (email && (o.email === email || (o.id === ID_DONO && (email === RECUP || email === o.recuperacao)))) erros.push('Este e-mail já está em uso por outra pessoa.');
    if (whatsapp && mesmoWhats(o.whatsapp, whatsapp)) erros.push('Este WhatsApp já está em uso por outra pessoa.');
  }
  return { erros: [...new Set(erros)], valor: { nome, email, whatsapp, papel, secoes, expiraEm } };
}
const textoConvite = 'convite'; // o n8n monta a mensagem (curta, sem link de login com token); ver README

// ---------- rotas ----------
const rotas = async (req, res) => {
  const url = new URL(req.url, 'http://login');
  const p = url.pathname.replace(/\/+$/, '');
  if (req.method === 'GET' && p === '/saude') return json(res, 200, { ok: true });

  // auth_request do nginx: 204 liberado, 401 sem sessão, 403 sem permissão (seção) ou somente leitura tentando agir
  if (p === '/verificar') {
    const a = autenticar(req);
    const secao = url.searchParams.get('secao') || 'qualquer';
    const valida = secao === 'dono' || secao === 'qualquer' || IDS_SECAO.includes(secao);
    const status = !a ? 401 : valida ? decidir(a.u, secao, req.headers['x-dm-metodo']) : 403;
    res.writeHead(status, { 'cache-control': 'no-store' });
    return res.end();
  }
  // dados do painel filtrados pelas seções da pessoa (o nginx repassa /admin/dados.json para cá depois do auth_request)
  if (req.method === 'GET' && p === '/dados') {
    const a = autenticar(req);
    if (!a) return json(res, 401, { erro: 'Sessão necessária.' });
    const d = filtrarDados(a.u);
    return d ? json(res, 200, d) : json(res, 404, { erro: 'Dados do painel indisponíveis.' });
  }
  const ip = ipDe(req);

  // entrada de emergência: o nginx confere a senha antiga (basic auth) e só então repassa para cá com X-DM-Basic; vira uma
  // sessão do Dono, igual às demais (aparece em Atividades da conta). Não alcançável pelo prefixo público /admin/auth/.
  if (req.method === 'GET' && p === '/interno/emergencia') {
    const dono = armazem.dono();
    const pagina = (status, txt) => { res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }); res.end(txt); };
    if (!req.headers['x-dm-basic'] || !SEGREDO || !dono) return pagina(403, 'Acesso negado.');
    if (estourou(`ip-emerg:${ip}`, 10, 900)) return pagina(429, 'Muitas tentativas. Aguarde alguns minutos.');
    if (armazem.estado.config.emergenciaDesligada) return pagina(403, 'A senha de emergência foi desligada no painel. Entre com o código em /admin/login.');
    const cookie = criarSessao(dono, req, 'senha de emergência');
    armazem.auditar({ quem: 'senha de emergência', acao: 'entrou com a senha de emergência', alvo: dono.nome });
    res.writeHead(303, { location: '/admin/', 'set-cookie': setCookie(cookie, SESSAO_S), 'cache-control': 'no-store' });
    return res.end();
  }

  if (req.method === 'POST' && p === '/auth/enviar') {
    if (!mesmaOrigem(req)) return json(res, 403, { erro: 'Pedido recusado.' });
    if (estourou(`ip-envio:${ip}`, 5, 900)) return json(res, 429, { erro: 'Muitas tentativas. Aguarde alguns minutos.' }, { 'retry-after': '900' });
    const b = await corpo(req);
    const quem = norm(b.destino);
    const canais = new Set(Array.isArray(b.canais) ? b.canais.map(String) : String(b.canais || '').split(',').map((s) => s.trim()));
    // identifica a pessoa pelo que foi digitado; o código vai só para os contatos cadastrados, nunca para o que foi digitado
    let alvo = null, envios = [];
    const dig = digitos(quem);
    if (b.recuperacao === true || b.recuperacao === 'true') {
      const dono = armazem.dono();
      if (quem && dono && (quem === normEmail(dono.recuperacao) || (RECUP && quem === RECUP)) && emailValido(quem)) { alvo = dono; envios = [['email', quem]]; }
    } else if (quem) {
      alvo = usuarios().find((u) => (u.email && u.email === quem) || (u.whatsapp && dig.length >= 10 && mesmoWhats(u.whatsapp, dig))) || null;
      if (alvo && podeEntrar(alvo)) envios = contatosDe(alvo).filter(([c]) => canais.has(c));
      else { alvo = null; }
    }
    // limites por destino em silêncio (a resposta continua igual): 1 envio a cada 30 s e 6 por hora
    envios = envios.filter(([c, d]) => !bloqueado(`dest-min:${c}:${d}`, 1) && !estourou(`dest-hora:${c}:${d}`, HORA_MAX, 3600));
    for (const [c, d] of envios) estourou(`dest-min:${c}:${d}`, 1, INTERVALO_S);
    // sempre devolve um ticket (para destino inexistente ele só não aceita nenhum código): nada revela quem tem acesso
    const ticket = randomBytes(18).toString('base64url');
    const codigo = novoCodigo();
    const reg = { ...registroCodigo(envios.length && SEGREDO ? codigo : novoCodigo()), uid: envios.length && SEGREDO ? alvo.id : null };
    if (tickets.size > 4000) tickets.delete(tickets.keys().next().value);
    tickets.set(ticket, reg);
    if (reg.uid) { const antigo = ticketDoUsuario.get(reg.uid); if (antigo) tickets.delete(antigo); ticketDoUsuario.set(reg.uid, ticket); }
    if (reg.uid) for (const [c, d] of envios) enviar('codigo', c, d, { codigo }); // depois de responder: o tempo não revela se o destino existe
    return json(res, 200, { ok: true, mensagem: MSG_ENVIO, ticket });
  }

  if (req.method === 'POST' && p === '/auth/entrar') {
    if (!mesmaOrigem(req)) return json(res, 403, { erro: 'Pedido recusado.' });
    if (bloqueado(`ip-erro:${ip}`, 8)) return json(res, 429, { erro: 'Muitas tentativas. Aguarde alguns minutos.' }, { 'retry-after': '900' });
    const b = await corpo(req);
    const codigo = String(b.codigo || '').replace(/\s/g, ''), ticket = String(b.ticket || '').slice(0, 64);
    const reg = tickets.get(ticket);
    const uid = reg?.uid;
    const ok = conferir(tickets, ticket, codigo) && !!uid;
    const u = ok ? armazem.usuario(uid) : null;
    if (!u || !podeEntrar(u)) { estourou(`ip-erro:${ip}`, 8, 900); return json(res, 401, { erro: MSG_CODIGO }); }
    janelas.delete(`ip-erro:${ip}`);
    if (ticketDoUsuario.get(uid) === ticket) ticketDoUsuario.delete(uid);
    if (u.status === 'convite') { u.status = 'ativo'; u.primeiroAcesso = new Date().toISOString(); }
    u.ultimoAcesso = new Date().toISOString();
    armazem.salvarUsuarios();
    return json(res, 200, { ok: true, destino: primeiraPagina(u) }, { 'set-cookie': setCookie(criarSessao(u, req, 'código'), SESSAO_S) });
  }

  if (req.method === 'POST' && p === '/auth/sair') {
    const d = lerCookie(cookieDe(req));
    const s = d && armazem.sessao(d.sid);
    if (s && !s.encerrada) { s.encerrada = true; armazem.salvarSessoes(); }
    res.writeHead(303, { location: '/admin/login', 'set-cookie': setCookie('', 0), 'cache-control': 'no-store' });
    return res.end();
  }

  if (req.method === 'GET' && p === '/auth/inicio') { // para onde ir depois do login ou de um "sem acesso"
    const a = autenticar(req);
    res.writeHead(302, { location: a ? primeiraPagina(a.u) : '/admin/login', 'cache-control': 'no-store' });
    return res.end();
  }

  if (p.startsWith('/auth/conta')) return conta(req, res, url, p.slice('/auth/conta'.length), ip);
  return json(res, 404, { erro: 'Não encontrado.' });
};

// ---------- API da conta (sessão própria; o Dono gere acessos e segurança) ----------
async function conta(req, res, url, r, ip) {
  if (!mesmaOrigem(req)) return json(res, 403, { erro: 'Pedido recusado.' });
  const a = autenticar(req);
  if (!a) return json(res, 401, { erro: 'Sessão necessária.' });
  const { u, d } = a, ehDono = u.papel === 'dono';
  if (estourou(`conta:${d.sid}`, 300, 60)) return json(res, 429, { erro: 'Muitos pedidos. Aguarde um minuto.' });
  const soDono = () => { if (!ehDono) { json(res, 403, { erro: 'Só o Dono gere acessos e a segurança.' }); return false; } return true; };
  let m;

  if (req.method === 'GET' && r === '/eu') return json(res, 200, { ...visao(u, { completo: ehDono }), emailProprio: u.email || '', sidAtual: a.s.ref, secoesLista: SECOES.map(({ id, rotulo, href }) => ({ id, rotulo, href })), papeis: PAPEIS });
  if (req.method === 'GET' && r === '/perfil') return json(res, 200, { pessoa: visao(u, { completo: ehDono }), emergencia: ehDono ? emergencia() : undefined });
  if (req.method === 'GET' && r === '/sessoes') return json(res, 200, { sessoes: listaSessoes(u, url.searchParams.get('todas') === '1', d.sid), dono: ehDono });
  if (req.method === 'POST' && r === '/sessoes/encerrar') { // encerra uma sessão (por ref) ou todas as outras da própria pessoa
    const b = await corpo(req);
    if (b.outras === true) { const n = encerrarSessoesDe(u.id, d.sid); armazem.auditar({ quem: quemFez(u), acao: 'encerrou as outras sessões', alvo: u.nome, detalhe: `${n} sessão(ões)` }); return json(res, 200, { ok: true, encerradas: n }); }
    const alvo = [...armazem.sessoes.entries()].find(([, s]) => s.ref === String(b.ref || ''));
    if (!alvo || (alvo[1].uid !== u.id && !ehDono)) return json(res, 404, { erro: 'Sessão não encontrada.' });
    alvo[1].encerrada = true; armazem.salvarSessoes();
    armazem.auditar({ quem: quemFez(u), acao: 'encerrou uma sessão', alvo: armazem.usuario(alvo[1].uid)?.nome || '' });
    return json(res, 200, { ok: true, saiu: alvo[0] === d.sid });
  }

  // ----- daqui para baixo: só o Dono -----
  if (!soDono()) return;
  if (req.method === 'POST' && r === '/codigo') { // código novo para confirmar uma ação sensível, enviado ao contato ATUAL do Dono
    const b = await corpo(req), escopo = String(b.escopo || '');
    if (!/^(excluir:[0-9a-f]{12}|contato|emergencia)$/.test(escopo)) return json(res, 400, { erro: 'Ação inválida.' });
    if (estourou(`cod-conta:${d.sid}`, 6, 3600) || estourou(`cod-esc:${d.sid}|${escopo}`, 1, CONFIRMAR_S)) return json(res, 429, { erro: 'Aguarde um pouco para pedir outro código.' });
    const destinos = contatosDe(u);
    if (!destinos.length || !SEGREDO) return json(res, 503, { erro: 'Sem contato cadastrado para enviar o código.' });
    const codigo = novoCodigo();
    confirmacoes.set(`${d.sid}|${escopo}`, registroCodigo(codigo));
    for (const [c, dest] of destinos) enviar('confirmar', c, dest, { codigo });
    return json(res, 200, { ok: true, mensagem: 'Código enviado ao seu e-mail e WhatsApp cadastrados. Vale por 10 minutos e só para esta ação.' });
  }
  const confirma = (escopo, codigo) => conferir(confirmacoes, `${d.sid}|${escopo}`, String(codigo || '').replace(/\s/g, ''));

  if (req.method === 'POST' && r === '/perfil') { // dados do Dono; mudar contato exige código novo
    const b = await corpo(req);
    const nome = String(b.nome ?? u.nome).trim().replace(/\s+/g, ' '), empresa = String(b.empresa ?? u.empresa ?? '').trim().slice(0, 60);
    const email = normEmail(b.email ?? u.email), whatsapp = normWhats(b.whatsapp ?? u.whatsapp), recuperacao = normEmail(b.recuperacao ?? u.recuperacao);
    const erros = [];
    if (!nomeValido(nome)) erros.push('Informe o nome (2 a 60 letras).');
    if (email && !emailValido(email)) erros.push('E-mail principal inválido.');
    if (recuperacao && !emailValido(recuperacao)) erros.push('E-mail de recuperação inválido.');
    if (whatsapp && !whatsValido(whatsapp)) erros.push('WhatsApp inválido.');
    if (!email && !whatsapp) erros.push('Mantenha ao menos um contato (e-mail ou WhatsApp).');
    for (const o of usuarios()) if (o.id !== u.id && ((email && o.email === email) || (whatsapp && mesmoWhats(o.whatsapp, whatsapp)))) erros.push('Este contato já é de outra pessoa.');
    if (erros.length) return json(res, 400, { erro: erros.join(' '), erros });
    const mudouContato = email !== (u.email || '') || whatsapp !== (u.whatsapp || '') || recuperacao !== (u.recuperacao || '');
    if (mudouContato && !confirma('contato', b.codigo)) return json(res, 401, { erro: 'Código inválido ou expirado. Peça um código novo para confirmar a mudança de contato.', precisaCodigo: true });
    Object.assign(u, { nome, empresa, email, whatsapp, recuperacao });
    if (!contatosDe(u).length) u.canais = ['email', 'whatsapp'];
    armazem.salvarUsuarios();
    armazem.auditar({ quem: quemFez(u), acao: mudouContato ? 'alterou os contatos do Dono' : 'alterou os dados do Dono', alvo: nome });
    return json(res, 200, { ok: true, pessoa: visao(u, { completo: true }) });
  }

  if (req.method === 'GET' && r === '/acessos') return json(res, 200, { usuarios: usuarios().map((x) => visao(x)), max: MAX_USUARIOS, papeis: PAPEIS, secoes: SECOES.map(({ id, rotulo }) => ({ id, rotulo })) });
  if (req.method === 'POST' && r === '/acessos') { // convidar
    if (estourou(`convite:${d.sid}`, 20, 3600)) return json(res, 429, { erro: 'Muitos convites seguidos. Aguarde.' });
    const b = await corpo(req);
    if (usuarios().length >= MAX_USUARIOS) return json(res, 400, { erro: `Limite de ${MAX_USUARIOS} acessos atingido. Exclua alguém antes de convidar.` });
    const { erros, valor } = lerPessoa(b);
    if (erros.length) return json(res, 400, { erro: erros.join(' '), erros });
    const novo = { id: armazem.novoId(), ...valor, status: 'convite', canais: ['email', 'whatsapp'], criadoEm: new Date().toISOString(), convidadoPor: u.id };
    usuarios().push(novo); armazem.salvarUsuarios();
    armazem.auditar({ quem: quemFez(u), acao: 'concedeu acesso', alvo: novo.nome, detalhe: `${PAPEIS[novo.papel].rotulo}; seções: ${novo.secoes.join(', ')}${novo.expiraEm ? `; até ${novo.expiraEm}` : ''}` });
    const dests = contatosDe(novo);
    json(res, 200, { ok: true, usuario: visao(novo), convite: dests.map(([c]) => c) });
    for (const [c, dest] of dests) enviar(textoConvite, c, dest, { nome: novo.nome }); // depois de responder
    return;
  }
  if ((m = /^\/acessos\/([0-9a-f]{12}|dono)(?:\/(editar|suspender|reativar|reenviar|excluir))?$/.exec(r))) {
    const alvo = armazem.usuario(m[1]);
    if (!alvo) return json(res, 404, { erro: 'Pessoa não encontrada.' });
    if (req.method === 'GET' && !m[2]) return json(res, 200, { usuario: visao(alvo, { completo: true }) });
    if (req.method !== 'POST' || !m[2]) return json(res, 404, { erro: 'Não encontrado.' });
    if (alvo.id === ID_DONO) return json(res, 403, { erro: 'O Dono não pode ser alterado, suspenso nem excluído por aqui. Os dados dele ficam em Informações da conta.' });
    const b = await corpo(req);
    if (m[2] === 'editar') {
      const { erros, valor } = lerPessoa(b, { atual: alvo });
      if (erros.length) return json(res, 400, { erro: erros.join(' '), erros });
      const antes = `${alvo.papel}/${alvo.secoes.join(',')}/${alvo.expiraEm || '-'}`;
      Object.assign(alvo, valor);
      if (!contatosDe(alvo).length) alvo.canais = ['email', 'whatsapp'];
      armazem.salvarUsuarios();
      armazem.auditar({ quem: quemFez(u), acao: 'editou o acesso', alvo: alvo.nome, detalhe: `antes ${antes}; agora ${alvo.papel}/${alvo.secoes.join(',')}/${alvo.expiraEm || '-'}` });
      return json(res, 200, { ok: true, usuario: visao(alvo) });
    }
    if (m[2] === 'suspender') { alvo.status = 'suspenso'; encerrarSessoesDe(alvo.id); armazem.salvarUsuarios(); armazem.auditar({ quem: quemFez(u), acao: 'suspendeu o acesso', alvo: alvo.nome }); return json(res, 200, { ok: true, usuario: visao(alvo) }); }
    if (m[2] === 'reativar') { alvo.status = alvo.primeiroAcesso ? 'ativo' : 'convite'; armazem.salvarUsuarios(); armazem.auditar({ quem: quemFez(u), acao: 'reativou o acesso', alvo: alvo.nome }); return json(res, 200, { ok: true, usuario: visao(alvo) }); }
    if (m[2] === 'reenviar') {
      if (estourou(`reenviar:${alvo.id}`, 1, 60)) return json(res, 429, { erro: 'Aguarde um minuto para reenviar.' });
      if (!podeEntrar(alvo)) return json(res, 400, { erro: 'Só dá para reenviar o convite de um acesso ativo ou pendente.' });
      const dests = contatosDe(alvo);
      armazem.auditar({ quem: quemFez(u), acao: 'reenviou o convite', alvo: alvo.nome });
      json(res, 200, { ok: true, convite: dests.map(([c]) => c) });
      for (const [c, dest] of dests) enviar(textoConvite, c, dest, { nome: alvo.nome });
      return;
    }
    if (m[2] === 'excluir') { // digitar o nome da pessoa + código novo do Dono
      if (norm(b.confirmaNome) !== norm(alvo.nome)) return json(res, 400, { erro: 'Digite o nome da pessoa exatamente como aparece para confirmar.' });
      if (!confirma(`excluir:${alvo.id}`, b.codigo)) return json(res, 401, { erro: 'Código inválido ou expirado. Peça um código novo.', precisaCodigo: true });
      encerrarSessoesDe(alvo.id);
      armazem.estado.usuarios = usuarios().filter((x) => x.id !== alvo.id);
      armazem.salvarUsuarios();
      armazem.auditar({ quem: quemFez(u), acao: 'excluiu o acesso', alvo: alvo.nome, detalhe: PAPEIS[alvo.papel]?.rotulo });
      return json(res, 200, { ok: true });
    }
  }

  if (req.method === 'GET' && r === '/seguranca') return json(res, 200, {
    codigo: { digitos: 6, validadeMin: Math.round(CODIGO_S / 60), tentativas: 5, reenvioS: INTERVALO_S, porHora: HORA_MAX },
    limites: { errosPorIp: 8, pedidosPorIp: 5, bloqueioMin: 15 }, sessaoHoras: Math.round(SESSAO_S / 3600),
    cookie: 'HttpOnly, Secure, SameSite=Strict', envio: { assinado: !!ASSINATURA },
    pessoas: usuarios().map((x) => ({ id: x.id, nome: x.nome, papel: x.papel, canais: x.canais?.length ? x.canais : ['email', 'whatsapp'], temEmail: !!x.email, temWhatsapp: !!x.whatsapp })),
    emergencia: emergencia()
  });
  if (req.method === 'POST' && r === '/seguranca/canais') { // quais canais cada pessoa usa para receber o código
    const b = await corpo(req), alvo = armazem.usuario(String(b.id || ''));
    const canais = (Array.isArray(b.canais) ? b.canais : []).map(String).filter((c) => ['email', 'whatsapp'].includes(c));
    if (!alvo) return json(res, 404, { erro: 'Pessoa não encontrada.' });
    if (!canais.length || (canais.includes('email') && !alvo.email) || (canais.includes('whatsapp') && !alvo.whatsapp)) return json(res, 400, { erro: 'Escolha ao menos um canal que a pessoa tenha cadastrado.' });
    alvo.canais = [...new Set(canais)]; armazem.salvarUsuarios();
    armazem.auditar({ quem: quemFez(u), acao: 'alterou os canais do código', alvo: alvo.nome, detalhe: alvo.canais.join(' e ') });
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && r === '/seguranca/emergencia') { // desligar (ou religar) a senha de emergência: confirmação reforçada
    const b = await corpo(req), ligar = b.ligar === true;
    if (String(b.confirmacao || '').trim() !== (ligar ? 'LIGAR' : 'DESLIGAR')) return json(res, 400, { erro: `Digite ${ligar ? 'LIGAR' : 'DESLIGAR'} para confirmar.` });
    if (!confirma('emergencia', b.codigo)) return json(res, 401, { erro: 'Código inválido ou expirado. Peça um código novo.', precisaCodigo: true });
    armazem.estado.config.emergenciaDesligada = !ligar; armazem.salvarUsuarios();
    armazem.auditar({ quem: quemFez(u), acao: ligar ? 'religou a senha de emergência' : 'desligou a senha de emergência', alvo: 'senha de emergência' });
    return json(res, 200, { ok: true, emergencia: emergencia() });
  }
  if (req.method === 'GET' && r === '/auditoria') return json(res, 200, { eventos: armazem.lerAuditoria(Math.min(500, Number(url.searchParams.get('limite')) || 200)) });
  return json(res, 404, { erro: 'Não encontrado.' });
}

if (!SEGREDO) console.error('login: DM_LOGIN_SEGREDO ausente ou inválido: ninguém entra.');
http.createServer(async (req, res) => {
  try { await rotas(req, res); }
  catch (e) { if (!res.headersSent) json(res, e.status || 500, { erro: e.status ? 'Pedido inválido.' : 'Erro interno.' }); if (!e.status) console.error('login: erro interno'); req.resume(); }
}).listen(PORTA, () => console.log(`login: porta ${PORTA}, ${usuarios().length} pessoa(s)`));
for (const sinal of ['SIGTERM', 'SIGINT']) process.on(sinal, () => { try { armazem.descarregar(); } catch {} process.exit(0); });
