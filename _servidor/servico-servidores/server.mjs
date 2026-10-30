// Serviço da seção "Servidores" do painel (/admin/servidores/). Container dm-observait-servidores, sem porta pública,
// numa rede só com o nginx (que já exigiu a sessão do login por código com auth_request antes de repassar). Só Node 20.
// Fala com o agente de cada VPS (servico-agente/) por HTTPS, com pedido assinado (HMAC + carimbo + nonce) e resposta
// assinada; nunca toca no socket do Docker.
//
// Variáveis de ambiente (environment da Hostinger; nada disto fica no repositório público):
//   DM_ADMIN_CHAVE      chave que decifra o cadastro das VPS e as regras de proteção (_servidor/servidores/cadastro.enc,
//                       gerado pelo build a partir de admin/servidores.mjs)
//   DM_SERV_CHAVES      chaves dos agentes, "id=64hex;id2=64hex" (tools/gerar-env-admin.mjs, a partir de deploy/vps/agentes/)
//   DM_HOSTINGER_TOKEN  opcional: token da API da Hostinger (plano, expiração, backups); sem ele essa parte fica desligada
//   DM_LOGIN_SEGREDO    para saber qual sessão fez a ação (auditoria)
//   DM_LOGIN_WEBHOOK, DM_LOGIN_EMAIL, DM_LOGIN_WHATSAPP   envio do código que o Deletar exige (o mesmo n8n do login)
//   DADOS (/dados)      auditoria.jsonl e cache dos provedores; PORTA (8082)
//   Só para testes: CADASTRO_JSON (cadastro em texto), HOSTINGER_API (outra base), DM_SERV_DNS=desligado
import http from 'node:http';
import https from 'node:https';
import { readFileSync, existsSync, mkdirSync, appendFileSync, statSync, renameSync, writeFileSync } from 'node:fs';
import { createDecipheriv, createHmac, randomBytes, randomInt, timingSafeEqual, X509Certificate } from 'node:crypto';
import { promises as dns } from 'node:dns';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cabecalhos, chaveDe, conferirResposta } from '../servico-agente/assinatura.mjs';
import { mascarar } from '../servico-agente/mascara.mjs';
import { ACOES, PEDE_CODIGO, ROTULO_ACAO, protecaoDe, acaoPermitida, conferirConfirmacao, identificarProvedor } from './regras.mjs';

const env = process.env;
const BASE = '/admin/servidores-api';

// ---------- cadastro (cifrado) e chaves ----------
export function lerCadastro({ json = env.CADASTRO_JSON, arquivo = env.CADASTRO || new URL('../servidores/cadastro.enc', import.meta.url), chave = env.DM_ADMIN_CHAVE } = {}) {
  try {
    if (json) return JSON.parse(readFileSync(json, 'utf8'));
    if (!existsSync(arquivo) || !/^[0-9a-f]{64}$/i.test(chave || '')) return null;
    const b = readFileSync(arquivo), d = createDecipheriv('aes-256-gcm', Buffer.from(chave, 'hex'), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
  } catch { return null; }
}
export const lerChaves = (txt = env.DM_SERV_CHAVES || '') => new Map(String(txt).split(/[;\n,]/).map((s) => s.trim()).filter(Boolean).map((s) => [s.slice(0, s.indexOf('=')).trim(), chaveDe(s.slice(s.indexOf('=') + 1))]).filter(([id, k]) => id && k));

// ---------- cliente do agente ----------
// vps.agente = URL (https://... ou http://... só em teste); vps.impressao = SHA-256 do certificado (VPS com TLS próprio)
export function chamarAgente(vps, chave, metodo, caminho, corpo = '', { timeout = 20_000 } = {}) {
  return new Promise((ok, falha) => {
    if (!vps.agente || !chave) return falha(Object.assign(new Error('agente não configurado'), { status: 503, codigo: 'sem-agente' }));
    const u = new URL(caminho, vps.agente.replace(/\/$/, '') + '/');
    const cam = u.pathname + u.search;
    const h = cabecalhos(chave, metodo, cam, corpo);
    const mod = u.protocol === 'https:' ? https : http;
    const opts = { method: metodo, hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: cam, timeout, headers: { ...h, ...(corpo ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(corpo) } : {}) } };
    if (u.protocol === 'https:' && vps.impressao) {
      // certificado próprio da VPS: confere a impressão digital em vez da cadeia pública
      opts.rejectUnauthorized = false;
      opts.checkServerIdentity = () => undefined;
    }
    const req = mod.request(opts, (res) => {
      if (u.protocol === 'https:' && vps.impressao) {
        const cert = res.socket.getPeerX509Certificate?.();
        const fp = cert ? new X509Certificate(cert.raw).fingerprint256.replace(/:/g, '').toLowerCase() : '';
        if (fp !== String(vps.impressao).replace(/:/g, '').toLowerCase()) { res.destroy(); return falha(Object.assign(new Error('certificado do agente não confere'), { status: 502 })); }
      }
      const partes = []; let n = 0;
      res.on('data', (c) => { n += c.length; if (n < 4 * 1024 * 1024) partes.push(c); });
      res.on('end', () => {
        const txt = Buffer.concat(partes).toString('utf8');
        if (res.statusCode !== 401 && !conferirResposta(chave, { nonce: h['x-dm-nonce'], status: res.statusCode, corpo: txt, assinatura: res.headers['x-dm-resposta'] })) return falha(Object.assign(new Error('resposta do agente sem assinatura válida'), { status: 502 }));
        let j = null; try { j = JSON.parse(txt); } catch {}
        ok({ status: res.statusCode, dados: j });
      });
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('o agente demorou a responder'), { status: 504 })));
    req.on('error', (e) => falha(Object.assign(e, { status: e.status || 502 })));
    req.end(corpo || undefined);
  });
}

// ---------- provedor (DNS reverso + ASN, com cache) ----------
const doh = async (nome, tipo) => { const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(nome)}&type=${tipo}`, { signal: AbortSignal.timeout(5000) }); const j = await r.json(); return (j.Answer || []).map((a) => String(a.data).replace(/^"|"$/g, '').replace(/\.$/, '')); };
export const resolverPadrao = {
  async ptr(ip) { try { return (await dns.reverse(ip))[0] || ''; } catch { try { return (await doh(ip.split('.').reverse().join('.') + '.in-addr.arpa', 'PTR'))[0] || ''; } catch { return ''; } } },
  async txt(nome) { try { return (await dns.resolveTxt(nome)).map((p) => p.join('')); } catch { try { return await doh(nome, 'TXT'); } catch { return []; } } }
};
export async function detectarProvedor(ip, resolver = resolverPadrao) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip || '')) return { nome: 'Desconhecido', fonte: 'sem IP' };
  const ptr = await resolver.ptr(ip);
  let asn = null, asnNome = '';
  const origem = (await resolver.txt(`${ip.split('.').reverse().join('.')}.origin.asn.cymru.com`))[0] || '';
  if (/^\d+/.test(origem)) {
    asn = Number(origem.split('|')[0]);
    asnNome = ((await resolver.txt(`AS${asn}.asn.cymru.com`))[0] || '').split('|').at(-1)?.trim().replace(/^AS\d+\s*-\s*/, '') || '';
  }
  return { ...identificarProvedor({ ptr, asn, asnNome }), ptr: ptr || null, asn, asnNome: asnNome || null };
}

// ---------- API da Hostinger (plano, expiração, backups) ----------
async function hostinger(token, caminho) {
  const r = await fetch(`${env.HOSTINGER_API || 'https://developers.hostinger.com'}${caminho}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`Hostinger HTTP ${r.status}`);
  return r.json();
}
export async function dadosHostinger(token, vmId) {
  const vm = await hostinger(token, `/api/vps/v1/virtual-machines/${vmId}`);
  const r = { plano: vm.plan || null, estado: vm.state || null, ipv4: vm.ipv4?.[0]?.address || null, ipv6: vm.ipv6?.[0]?.address || null, ptr: vm.ipv4?.[0]?.ptr || null, cpus: vm.cpus || null, memoriaMb: vm.memory || null, discoMb: vm.disk || null, criadaEm: vm.created_at || null, expiracao: null, renovacaoAutomatica: null, backups: null };
  try {
    const subs = await hostinger(token, '/api/billing/v1/subscriptions');
    const s = (Array.isArray(subs) ? subs : subs.data || []).find((x) => x.id === vm.subscription_id);
    if (s) { r.expiracao = s.expires_at || s.next_billing_at || null; r.renovacaoAutomatica = s.is_auto_renewed ?? null; }
  } catch {}
  try {
    const b = await hostinger(token, `/api/vps/v1/virtual-machines/${vmId}/backups`);
    const l = Array.isArray(b) ? b : b.data || [];
    r.backups = { total: l.length, ultimo: l.map((x) => x.created_at).filter(Boolean).sort().at(-1) || null };
  } catch {}
  return r;
}

// ---------- serviço ----------
export function criarServico({ cadastro = lerCadastro(), chaves = lerChaves(), dados = env.DADOS || '/dados', tokenHostinger = env.DM_HOSTINGER_TOKEN || '', segredoLogin = env.DM_LOGIN_SEGREDO || '', webhook = env.DM_LOGIN_WEBHOOK || '', email = env.DM_LOGIN_EMAIL || '', whatsapp = String(env.DM_LOGIN_WHATSAPP || '').replace(/\D/g, ''), resolver = env.DM_SERV_DNS === 'desligado' ? { ptr: async () => '', txt: async () => [] } : resolverPadrao, agora = () => Date.now(), log = console.log } = {}) {
  const vpsLista = cadastro?.vps || [];
  const regras = cadastro?.protegidos || [];
  try { mkdirSync(dados, { recursive: true }); } catch {}
  const arqAud = join(dados, 'auditoria.jsonl'), arqProv = join(dados, 'provedores.json');
  const SEGREDO = /^[0-9a-f]{64}$/i.test(segredoLogin) ? Buffer.from(segredoLogin, 'hex') : null;
  const cache = new Map(); // chave -> { ate, valor }
  const emCache = async (k, ms, fn) => { const c = cache.get(k); if (c && c.ate > agora()) return c.valor; const valor = await fn(); cache.set(k, { ate: agora() + ms, valor }); return valor; };
  let provedores = {}; try { provedores = JSON.parse(readFileSync(arqProv, 'utf8')); } catch {}

  // limites em memória
  const janelas = new Map();
  const estourou = (k, max, s) => { const t = agora(); let j = janelas.get(k); if (!j || j.ate <= t) { j = { n: 0, ate: t + s * 1000 }; janelas.set(k, j); } j.n++; return j.n > max; };
  const ipDe = (req) => { const x = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean); return (x.at(-1) || req.socket.remoteAddress || '?').slice(0, 64); };

  // quem fez: sessão do login por código (o cookie é conferido com a mesma chave do login) ou a senha de emergência
  const quemDe = (req) => {
    const c = String(req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith('__Host-dm_admin='));
    if (c && SEGREDO) {
      const [corpo, sig] = c.slice(16).split('.');
      try {
        const esperado = createHmac('sha256', SEGREDO).update('sessao|').update(corpo).digest(), s = Buffer.from(sig, 'base64url');
        const d = JSON.parse(Buffer.from(corpo, 'base64url').toString());
        if (s.length === esperado.length && timingSafeEqual(s, esperado) && d.exp > agora() / 1000) return `login por código (sessão ${d.sid.slice(0, 8)})`;
      } catch {}
    }
    const u = String(req.headers['x-dm-usuario'] || '').replace(/[^\w.@-]/g, '').slice(0, 40);
    return u ? `senha de emergência (${u})` : 'sessão do painel';
  };

  // auditoria: uma linha JSON por evento, no volume do servidor (gira em 5 MB)
  const auditar = (e) => {
    const linha = { em: new Date(agora()).toISOString(), ...e, detalhe: e.detalhe ? mascarar(String(e.detalhe)).slice(0, 2000) : undefined };
    try { if (existsSync(arqAud) && statSync(arqAud).size > 5 * 1024 * 1024) renameSync(arqAud, arqAud + '.1'); appendFileSync(arqAud, JSON.stringify(linha) + '\n'); } catch (err) { log(`servidores: auditoria não gravou (${err.code || 'erro'})`); }
    log(`servidores: auditoria ${linha.acao} ${linha.vps}/${linha.projeto}: ${linha.resultado}`);
    return linha;
  };
  const lerAuditoria = (limite = 200) => {
    try { return readFileSync(arqAud, 'utf8').trim().split('\n').filter(Boolean).slice(-limite).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).reverse(); } catch { return []; }
  };

  // códigos para Deletar: novos, de uso único, presos à VPS + projeto + ação, 10 minutos, 5 tentativas
  const codigos = new Map(); // escopo -> { sal, hash, ate, tentativas }
  const chaveCodigo = SEGREDO || randomBytes(32);
  const hashCodigo = (sal, cod) => createHmac('sha256', chaveCodigo).update('acao|').update(sal).update('|').update(cod).digest();
  const enviarCodigo = async (canal, destino, codigo) => {
    if (!webhook) return log(`servidores: sem DM_LOGIN_WEBHOOK, código por ${canal} não enviado`);
    try { const r = await fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ canal, destino, codigo }), signal: AbortSignal.timeout(20_000) }); if (!r.ok) log(`servidores: envio do código por ${canal} falhou (HTTP ${r.status})`); }
    catch (e) { log(`servidores: envio do código por ${canal} falhou (${e.name})`); }
  };

  const achar = (id) => vpsLista.find((v) => v.id === id);
  const agente = (v, metodo, caminho, corpo, opts) => chamarAgente(v, chaves.get(v.id), metodo, caminho, corpo, opts);

  async function provedorDe(v) {
    const p = provedores[v.ip];
    if (p && p.em > agora() - 7 * 86_400_000) return p;
    const novo = { ...(await detectarProvedor(v.ip, resolver)), em: agora() };
    if (novo.nome !== 'Desconhecido' || novo.asn) { provedores[v.ip] = novo; try { writeFileSync(arqProv, JSON.stringify(provedores)); } catch {} }
    return novo;
  }
  async function resumoVps(v) {
    const base = { id: v.id, nome: v.nome, host: v.host || null, ip: v.ip || null, papel: v.papel || null, observacao: v.observacao || null, agenteConfigurado: !!(v.agente && chaves.get(v.id)) };
    const [prov, maq, host] = await Promise.all([
      provedorDe(v).catch(() => ({ nome: 'Desconhecido', fonte: 'erro' })),
      base.agenteConfigurado ? emCache(`resumo:${v.id}`, 15_000, () => agente(v, 'GET', '/v1/resumo')).catch((e) => ({ erro: e.message })) : null,
      tokenHostinger && v.hostingerId ? emCache(`hostinger:${v.id}`, 3600_000, () => dadosHostinger(tokenHostinger, v.hostingerId)).catch(() => null) : null
    ]);
    const okAgente = maq && maq.status === 200;
    let status = 'sem agente';
    if (okAgente) status = 'em atividade';
    else if (host?.estado && host.estado !== 'running') status = 'parado';
    else if (base.agenteConfigurado) status = 'inacessível';
    return { ...base, provedor: prov, status, maquina: okAgente ? maq.dados : null, erroAgente: base.agenteConfigurado && !okAgente ? (maq?.erro || `HTTP ${maq?.status}`) : null, hostinger: host, hostingerDisponivel: !!v.hostingerId, tokenHostinger: !!tokenHostinger };
  }
  async function projetosDe(v, stats = true) {
    const r = await agente(v, 'GET', `/v1/projetos${stats ? '' : '?stats=0'}`);
    if (r.status !== 200) throw Object.assign(new Error(r.dados?.erro || `agente HTTP ${r.status}`), { status: 502 });
    const d = r.dados;
    for (const p of d.projetos) { p.protecao = protecaoDe(regras, v.id, p); p.acoes = ACOES.filter((a) => acaoPermitida(p.protecao, a) && !(d.somenteLeitura)); }
    return d;
  }

  const json = (res, status, obj) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(obj)); };
  const corpo = async (req) => { let n = 0; const partes = []; for await (const c of req) { n += c.length; if (n > 8192) throw Object.assign(new Error('grande'), { status: 413 }); partes.push(c); } try { const v = JSON.parse(Buffer.concat(partes).toString('utf8') || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { throw Object.assign(new Error('json'), { status: 400 }); } };
  // CSRF: cabeçalho próprio + mesma origem (como a API da loja); o nginx já exigiu a sessão
  const mesmaOrigem = (req) => req.headers['x-dm-admin'] === '1' && (!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] === 'same-origin');

  async function rotas(req, res) {
    const url = new URL(req.url, 'http://servidores');
    const p = url.pathname.replace(/\/+$/, '');
    if (req.method === 'GET' && p === '/saude') return json(res, 200, { ok: true });
    if (!p.startsWith(BASE)) return json(res, 404, { erro: 'Não encontrado.' });
    if (!mesmaOrigem(req)) return json(res, 403, { erro: 'Pedido recusado.' });
    const ip = ipDe(req);
    if (estourou(`ip:${ip}`, 240, 60)) return json(res, 429, { erro: 'Muitos pedidos. Aguarde um minuto.' });
    if (!cadastro) return json(res, 503, { erro: 'Cadastro das VPS indisponível (falta DM_ADMIN_CHAVE ou o arquivo cifrado).' });
    const r = p.slice(BASE.length);
    let m;

    if (req.method === 'GET' && r === '/vps') return json(res, 200, { vps: await Promise.all(vpsLista.map(resumoVps)), em: new Date(agora()).toISOString() });
    if (req.method === 'GET' && r === '/auditoria') return json(res, 200, { eventos: lerAuditoria(Math.min(1000, Number(url.searchParams.get('limite')) || 200)) });
    if (!(m = /^\/vps\/([a-z0-9-]{1,40})(\/.*)?$/.exec(r))) return json(res, 404, { erro: 'Não encontrado.' });
    const v = achar(m[1]);
    if (!v) return json(res, 404, { erro: 'VPS não cadastrada.' });
    const sub = m[2] || '';

    if (req.method === 'GET' && sub === '') return json(res, 200, { vps: await resumoVps(v), protegidos: regras.filter((x) => !x.vps || x.vps === '*' || x.vps === v.id), auditoria: lerAuditoria(500).filter((e) => e.vps === v.id).slice(0, 20) });
    if (req.method === 'GET' && sub === '/projetos') return json(res, 200, await projetosDe(v, url.searchParams.get('stats') !== '0'));
    if (req.method === 'GET' && (m = /^\/containers\/([a-zA-Z0-9][a-zA-Z0-9_.-]{0,127})$/.exec(sub))) { const a = await agente(v, 'GET', `/v1/containers/${m[1]}`); return json(res, a.status, a.dados); }
    if (req.method === 'GET' && sub === '/logs') {
      const c = url.searchParams.get('container') || '';
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(c)) return json(res, 400, { erro: 'Container inválido.' });
      const linhas = Math.min(1000, Math.max(10, Number(url.searchParams.get('linhas')) || 200));
      const a = await agente(v, 'GET', `/v1/logs?container=${encodeURIComponent(c)}&linhas=${linhas}`);
      if (a.dados?.texto) a.dados.texto = mascarar(a.dados.texto); // segunda camada (o agente já mascarou)
      return json(res, a.status, a.dados);
    }

    if (req.method === 'POST' && (sub === '/codigo' || sub === '/acao')) {
      const b = await corpo(req);
      const acao = String(b.acao || ''), projeto = String(b.projeto || '');
      const quem = quemDe(req);
      const evento = { quem, ip, vps: v.id, projeto, acao };
      if (!ACOES.includes(acao) || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(projeto)) return json(res, 400, { erro: 'Pedido inválido.' });
      if (sub === '/codigo' ? estourou(`codigo:${ip}`, 6, 3600) : estourou(`acao:${ip}`, 12, 60)) return json(res, 429, { erro: 'Muitas ações seguidas. Aguarde.' });
      // a proteção é conferida com os dados atuais do agente (inclusive pelas imagens dos containers)
      let d;
      try { d = await projetosDe(v, false); } catch (e) { return json(res, 502, { erro: `Agente indisponível: ${e.message}` }); }
      const pr = d.projetos.find((x) => x.nome === projeto);
      if (!pr) return json(res, 404, { erro: 'Projeto não encontrado nesta VPS.' });
      if (!acaoPermitida(pr.protecao, acao) || d.somenteLeitura) {
        const motivo = d.somenteLeitura ? 'agente em modo somente leitura' : pr.protecao ? `${pr.protecao.nivel === 'protegido' ? 'projeto protegido' : 'projeto só para consulta'}: ${pr.protecao.motivo}` : 'ação não permitida';
        if (sub === '/acao') auditar({ ...evento, resultado: 'recusado', detalhe: motivo });
        return json(res, 403, { erro: `Ação não permitida (${motivo}).` });
      }
      const escopo = `${v.id}|${projeto}|${acao}`;
      if (sub === '/codigo') {
        if (!PEDE_CODIGO.has(acao)) return json(res, 400, { erro: 'Esta ação não usa código.' });
        if (estourou(`cod:${escopo}`, 1, 60)) return json(res, 429, { erro: 'Aguarde um minuto para pedir outro código.' });
        const destinos = [['email', email], ['whatsapp', whatsapp]].filter(([, d2]) => d2);
        if (!destinos.length || !webhook) return json(res, 503, { erro: 'Envio de código não configurado.' });
        const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0'), sal = randomBytes(16);
        codigos.set(escopo, { sal, hash: hashCodigo(sal, codigo), ate: agora() + 600_000, tentativas: 0 });
        for (const [c, d2] of destinos) enviarCodigo(c, d2, codigo);
        auditar({ ...evento, acao: `código para ${acao}`, resultado: 'enviado', detalhe: 'código enviado por e-mail e WhatsApp' });
        return json(res, 200, { ok: true, mensagem: 'Código enviado para o e-mail e o WhatsApp cadastrados. Vale por 10 minutos e só para esta ação.' });
      }
      const recusa = conferirConfirmacao({ acao, projeto, confirmado: b.confirmado, confirmacao: b.confirmacao });
      if (recusa) { auditar({ ...evento, resultado: 'recusado', detalhe: recusa }); return json(res, 400, { erro: recusa }); }
      if (PEDE_CODIGO.has(acao)) {
        const cod = String(b.codigo || '').replace(/\s/g, ''), pend = codigos.get(escopo);
        let ok = false;
        if (pend && /^\d{6}$/.test(cod) && pend.ate > agora() && pend.tentativas < 5) {
          pend.tentativas++;
          const h = hashCodigo(pend.sal, cod);
          ok = h.length === pend.hash.length && timingSafeEqual(h, pend.hash);
        }
        if (ok || (pend && (pend.ate <= agora() || pend.tentativas >= 5))) codigos.delete(escopo); // uso único
        if (!ok) { auditar({ ...evento, resultado: 'recusado', detalhe: 'código inválido ou expirado' }); return json(res, 401, { erro: 'Código inválido ou expirado. Peça um novo código.' }); }
      }
      try {
        const a = await agente(v, 'POST', '/v1/acao', JSON.stringify({ projeto, acao }), { timeout: 330_000 });
        cache.delete(`resumo:${v.id}`);
        if (a.status !== 200) { auditar({ ...evento, resultado: 'falhou', detalhe: a.dados?.erro || `agente HTTP ${a.status}` }); return json(res, a.status === 409 ? 409 : 502, { erro: `${ROTULO_ACAO[acao]} não concluído: ${a.dados?.erro || `agente HTTP ${a.status}`}` }); }
        const linha = auditar({ ...evento, resultado: 'ok', detalhe: (a.dados.detalhes || []).join('; ') });
        return json(res, 200, { ok: true, ...a.dados, auditoria: linha });
      } catch (e) {
        auditar({ ...evento, resultado: 'falhou', detalhe: e.message });
        return json(res, 502, { erro: `${ROTULO_ACAO[acao]} não concluído: ${e.message}` });
      }
    }
    return json(res, 404, { erro: 'Não encontrado.' });
  }

  return async (req, res) => {
    try { await rotas(req, res); }
    catch (e) {
      if (!res.headersSent) json(res, e.status && e.status < 500 ? e.status : 502, { erro: e.status && e.status < 500 ? 'Pedido inválido.' : e.codigo === 'sem-agente' ? 'Agente não configurado nesta VPS.' : `Falha ao falar com o agente: ${mascarar(e.message)}` });
      req.resume();
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const porta = Number(env.PORTA || 8082);
  const srv = http.createServer(criarServico());
  srv.requestTimeout = 340_000;
  srv.listen(porta, () => console.log(`servidores: porta ${porta}${lerCadastro() ? '' : ' (SEM cadastro: falta DM_ADMIN_CHAVE ou cadastro.enc)'}${lerChaves().size ? `, ${lerChaves().size} chave(s) de agente` : ', nenhuma chave de agente'}${env.DM_HOSTINGER_TOKEN ? ', API da Hostinger ligada' : ''}`));
}
