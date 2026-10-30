// Serviço de login do painel /admin (dmobservait.com/admin/login). Substitui a senha do nginx por um código de 6 dígitos
// enviado por e-mail e/ou WhatsApp. Roda num container sem porta pública, numa rede só com o nginx do site, e sem
// dependências: só Node 20. O nginx usa auth_request em /verificar antes de entregar qualquer arquivo do /admin.
//
// O envio fica no n8n (workflow isolado "DM ObservaIT | Painel /admin: código de acesso"): este serviço só faz um POST
// {canal, destino, codigo} para DM_LOGIN_WEBHOOK, assim as credenciais do SMTP e do WhatsApp nunca saem de lá.
//
// Variáveis de ambiente (vêm do environment da Hostinger; nada disto fica no repositório público):
//   DM_LOGIN_SEGREDO      chave (hex, 64) que assina a sessão e protege o hash do código
//   DM_LOGIN_WEBHOOK      endereço do webhook do n8n que envia o código
//   DM_LOGIN_EMAIL        e-mail principal               DM_LOGIN_WHATSAPP   número com DDI (só dígitos)
//   DM_LOGIN_RECUPERACAO  e-mail de recuperação (se perder o acesso ao principal)
//   DM_LOGIN_CODIGO_S (600)  validade do código   DM_LOGIN_SESSAO_S (43200)  validade da sessão
//   DM_LOGIN_INTERVALO_S (30) espera entre dois envios ao mesmo destino   DM_LOGIN_HORA_MAX (6) envios por destino por hora
// Sem segredo, webhook ou contatos, o serviço sobe, mas nada entra (verificar sempre 401) e nada é enviado.
//
// Regras: código de uso único, guardado só como HMAC com sal, comparação em tempo constante, 5 erros invalidam o código,
// limites por IP e por destino, resposta idêntica para destino cadastrado ou não (o envio é feito depois de responder,
// para o tempo também não revelar nada). Estado em memória: reiniciar o serviço apaga códigos pendentes e bloqueios.
import http from 'node:http';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const env = process.env;
const PORTA = Number(env.PORTA || 8081);
const CODIGO_S = Number(env.DM_LOGIN_CODIGO_S || 600);
const SESSAO_S = Number(env.DM_LOGIN_SESSAO_S || 12 * 3600);
const INTERVALO_S = Number(env.DM_LOGIN_INTERVALO_S || 30), HORA_MAX = Number(env.DM_LOGIN_HORA_MAX || 6);
const SEGREDO = /^[0-9a-f]{64}$/i.test(env.DM_LOGIN_SEGREDO || '') ? Buffer.from(env.DM_LOGIN_SEGREDO, 'hex') : null;
const WEBHOOK = /^https?:\/\//.test(env.DM_LOGIN_WEBHOOK || '') ? env.DM_LOGIN_WEBHOOK : '';
const norm = (s) => String(s || '').trim().toLowerCase();
const digitos = (s) => String(s || '').replace(/\D/g, '');
const EMAIL = norm(env.DM_LOGIN_EMAIL), RECUP = norm(env.DM_LOGIN_RECUPERACAO), WHATS = digitos(env.DM_LOGIN_WHATSAPP);
const COOKIE = '__Host-dm_admin';
const MSG_ENVIO = 'Se o destino estiver cadastrado, o código foi enviado. Ele vale por poucos minutos.';
const MSG_CODIGO = 'Código inválido ou expirado. Peça um novo código.';

// ---------- limites (em memória) ----------
const janelas = new Map(); // chave -> { n, ate }
// conta uma ocorrência na janela; devolve true se passou do máximo
const estourou = (chave, max, janelaS) => {
  const agora = Date.now();
  let j = janelas.get(chave);
  if (!j || j.ate <= agora) { j = { n: 0, ate: agora + janelaS * 1000 }; janelas.set(chave, j); }
  j.n++;
  return j.n > max;
};
const bloqueado = (chave, max) => { const j = janelas.get(chave); return !!j && j.ate > Date.now() && j.n >= max; };
setInterval(() => { const agora = Date.now(); for (const [k, j] of janelas) if (j.ate <= agora) janelas.delete(k); for (const [k, e] of revogadas) if (e <= agora) revogadas.delete(k); }, 60_000).unref();

// ---------- código e sessão ----------
let pendente = null; // { sal, hash, ate, tentativas } — a conta é uma só, então só há um código válido por vez
const hashCodigo = (sal, codigo) => createHmac('sha256', SEGREDO).update(sal).update('|').update(codigo).digest();
const igual = (a, b) => a.length === b.length && timingSafeEqual(a, b);
const revogadas = new Map(); // sid -> expira (sessões encerradas em "Sair")
const b64 = (b) => Buffer.from(b).toString('base64url');
const assinar = (txt) => createHmac('sha256', SEGREDO).update('sessao|').update(txt).digest();
const criarSessao = () => { const corpo = b64(JSON.stringify({ sid: randomBytes(12).toString('hex'), exp: Math.floor(Date.now() / 1000) + SESSAO_S })); return `${corpo}.${b64(assinar(corpo))}`; };
const lerSessao = (valor) => {
  if (!SEGREDO || typeof valor !== 'string') return null;
  const [corpo, sig] = valor.split('.');
  if (!corpo || !sig) return null;
  let s; try { s = Buffer.from(sig, 'base64url'); } catch { return null; }
  if (!igual(s, assinar(corpo))) return null;
  let dados; try { dados = JSON.parse(Buffer.from(corpo, 'base64url').toString()); } catch { return null; }
  if (!dados || typeof dados.sid !== 'string' || !(dados.exp > Date.now() / 1000) || revogadas.has(dados.sid)) return null;
  return dados;
};
const cookieDe = (req) => { for (const p of String(req.headers.cookie || '').split(';')) { const i = p.indexOf('='); if (i > 0 && p.slice(0, i).trim() === COOKIE) return p.slice(i + 1).trim(); } return ''; };
const setCookie = (valor, maxAge) => `${COOKIE}=${valor}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

// IP do visitante: o Traefik acrescenta o IP que ele viu ao fim de X-Forwarded-For; o que vem antes pode ser inventado.
const ipDe = (req) => { const x = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean); return (x.at(-1) || req.socket.remoteAddress || '?').slice(0, 64); };

// ---------- envio (n8n) ----------
const enviar = async (canal, destino, codigo) => {
  if (!WEBHOOK) return console.error(`login: sem DM_LOGIN_WEBHOOK, ${canal} não enviado`);
  try {
    const r = await fetch(WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ canal, destino, codigo }), signal: AbortSignal.timeout(20_000) });
    if (!r.ok) console.error(`login: envio por ${canal} falhou (HTTP ${r.status})`);
  } catch (e) { console.error(`login: envio por ${canal} falhou (${e.name})`); }
};

// ---------- http ----------
const json = (res, status, obj, extra = {}) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra }); res.end(JSON.stringify(obj)); };
const corpo = async (req) => {
  let n = 0; const partes = [];
  for await (const c of req) { n += c.length; if (n > 4096) throw Object.assign(new Error('grande'), { status: 413 }); partes.push(c); }
  const t = Buffer.concat(partes).toString('utf8');
  const ct = String(req.headers['content-type'] || '');
  if (ct.startsWith('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(t));
  try { const v = JSON.parse(t || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { throw Object.assign(new Error('json'), { status: 400 }); }
};
// só a tela do painel pode chamar: cabeçalho próprio + mesma origem (o cookie SameSite=Strict já barra outros sites)
const mesmaOrigem = (req) => req.headers['x-dm-admin'] === '1' && (!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] === 'same-origin');

const rotas = async (req, res) => {
  const p = new URL(req.url, 'http://login').pathname.replace(/\/+$/, '');
  if (req.method === 'GET' && p === '/saude') return json(res, 200, { ok: true });
  // auth_request do nginx: 204 com sessão válida, 401 sem
  if (p === '/verificar') { res.writeHead(lerSessao(cookieDe(req)) ? 204 : 401, { 'cache-control': 'no-store' }); return res.end(); }
  const ip = ipDe(req);

  if (req.method === 'POST' && p === '/auth/enviar') {
    if (!mesmaOrigem(req)) return json(res, 403, { erro: 'Pedido recusado.' });
    if (estourou(`ip-envio:${ip}`, 5, 900)) return json(res, 429, { erro: 'Muitas tentativas. Aguarde alguns minutos.' }, { 'retry-after': '900' });
    const b = await corpo(req);
    const quem = norm(b.destino);
    const canais = new Set(Array.isArray(b.canais) ? b.canais.map(String) : String(b.canais || '').split(',').map((s) => s.trim()));
    // identifica a conta pelo que foi digitado; o código vai só para os destinos cadastrados, nunca para o que foi digitado
    let envios = [];
    const principal = quem && (quem === EMAIL || (WHATS && digitos(quem).replace(/^55/, '') === WHATS.replace(/^55/, '') && digitos(quem).length >= 10));
    if (b.recuperacao === true || b.recuperacao === 'true') { if (quem && RECUP && quem === RECUP) envios = [['email', RECUP]]; }
    else if (principal) {
      if (canais.has('email') && EMAIL) envios.push(['email', EMAIL]);
      if (canais.has('whatsapp') && WHATS) envios.push(['whatsapp', WHATS]);
    }
    // limites por destino em silêncio (a resposta continua igual): 1 envio a cada 30 s e 6 por hora
    envios = envios.filter(([c, d]) => !bloqueado(`dest-min:${c}:${d}`, 1) && !estourou(`dest-hora:${c}:${d}`, HORA_MAX, 3600));
    for (const [c, d] of envios) estourou(`dest-min:${c}:${d}`, 1, INTERVALO_S);
    if (envios.length && SEGREDO) {
      const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const sal = randomBytes(16);
      pendente = { sal, hash: hashCodigo(sal, codigo), ate: Date.now() + CODIGO_S * 1000, tentativas: 0 };
      for (const [c, d] of envios) enviar(c, d, codigo); // depois de responder: o tempo não revela se o destino existe
    }
    return json(res, 200, { ok: true, mensagem: MSG_ENVIO });
  }

  if (req.method === 'POST' && p === '/auth/entrar') {
    if (!mesmaOrigem(req)) return json(res, 403, { erro: 'Pedido recusado.' });
    if (bloqueado(`ip-erro:${ip}`, 8)) return json(res, 429, { erro: 'Muitas tentativas. Aguarde alguns minutos.' }, { 'retry-after': '900' });
    const b = await corpo(req);
    const codigo = String(b.codigo || '').replace(/\s/g, '');
    let ok = false;
    if (pendente && SEGREDO && /^\d{6}$/.test(codigo)) {
      if (pendente.ate <= Date.now() || pendente.tentativas >= 5) pendente = null;
      else {
        pendente.tentativas++;
        if (igual(hashCodigo(pendente.sal, codigo), pendente.hash)) { ok = true; pendente = null; } // uso único
        else if (pendente.tentativas >= 5) pendente = null;
      }
    }
    if (!ok) { estourou(`ip-erro:${ip}`, 8, 900); return json(res, 401, { erro: MSG_CODIGO }); }
    janelas.delete(`ip-erro:${ip}`);
    return json(res, 200, { ok: true, destino: '/admin/' }, { 'set-cookie': setCookie(criarSessao(), SESSAO_S) });
  }

  if (req.method === 'POST' && p === '/auth/sair') {
    const s = lerSessao(cookieDe(req));
    if (s) revogadas.set(s.sid, s.exp * 1000);
    res.writeHead(303, { location: '/admin/login', 'set-cookie': setCookie('', 0), 'cache-control': 'no-store' });
    return res.end();
  }
  return json(res, 404, { erro: 'Não encontrado.' });
};

if (!SEGREDO) console.error('login: DM_LOGIN_SEGREDO ausente ou inválido: ninguém entra.');
http.createServer(async (req, res) => {
  try { await rotas(req, res); }
  catch (e) { if (!res.headersSent) json(res, e.status || 500, { erro: e.status ? 'Pedido inválido.' : 'Erro interno.' }); if (!e.status) console.error('login: erro interno'); req.resume(); }
}).listen(PORTA, () => console.log(`login: porta ${PORTA}`));
