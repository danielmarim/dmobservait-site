#!/usr/bin/env node
// Preview LOCAL do WorkAI. Não é o login de produção e não entra no nginx.
// Escuta só em 127.0.0.1. Não envia código, não lê segredo e não grava sessão em disco.
// Sem cookie: / redireciona para /admin/login (a tela real do painel).
// Com cookie dm_workai_local: mostra o escritório. Qualquer código de 6 dígitos serve,
// desde que o ticket tenha saído deste processo.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, normalize } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const HOST = '127.0.0.1';
const PORT = Number(process.env.WORKAI_DEV_PORT || 8765);
const COOKIE = 'dm_workai_local';
const sessoes = new Map();
const tickets = new Map();

const PUBLICOS = new Map([
  ['/admin/login', 'admin/login/index.html'],
  ['/admin/login/', 'admin/login/index.html'],
  ['/admin/login/index.html', 'admin/login/index.html'],
  ['/admin/login/login.css', 'admin/login/login.css'],
  ['/admin/login/login.js', 'admin/login/login.js'],
  ['/styles.css', 'styles.css'],
  ['/favicon.svg', 'favicon.svg']
]);
const PROTEGIDOS = new Map([
  ['/', 'workai/index.html'],
  ['/workai/index.html', 'workai/index.html'],
  ['/workai/workai.js', 'workai/workai.js'],
  ['/workai/workai.css', 'workai/workai.css']
]);
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

const arquivo = (rel) => {
  const p = normalize(join(ROOT, rel));
  if (p !== ROOT && !p.startsWith(ROOT + '/')) return null;
  return p;
};
const cookieDe = (req) => {
  for (const p of String(req.headers.cookie || '').split(';')) {
    const i = p.indexOf('=');
    if (i > 0 && p.slice(0, i).trim() === COOKIE) return p.slice(i + 1).trim();
  }
  return '';
};
const sessaoOk = (req) => { const t = cookieDe(req); const s = t && sessoes.get(t); return !!(s && s.exp > Date.now()); };
const querHtml = (req) => /text\/html/i.test(req.headers.accept || '');
const cabecalhos = (extra = {}) => ({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex, nofollow', ...extra });
const enviarArquivo = (res, rel) => {
  const p = arquivo(rel);
  if (!p) { res.writeHead(404, cabecalhos()); return res.end('Não encontrado.'); }
  try {
    const corpo = readFileSync(p);
    const ext = p.slice(p.lastIndexOf('.'));
    res.writeHead(200, cabecalhos({ 'content-type': TIPOS[ext] || 'application/octet-stream' }));
    res.end(corpo);
  } catch { res.writeHead(404, cabecalhos()); res.end('Não encontrado.'); }
};
const corpoJson = async (req) => {
  const partes = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > 8192) throw new Error('grande'); partes.push(c); }
  try { const v = JSON.parse(Buffer.concat(partes).toString('utf8') || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const path = url.pathname;
  try {
    if (req.method === 'POST' && path === '/admin/auth/enviar') {
      const ticket = randomBytes(18).toString('base64url');
      tickets.set(ticket, Date.now() + 10 * 60 * 1000);
      res.writeHead(200, cabecalhos({ 'content-type': 'application/json; charset=utf-8' }));
      return res.end(JSON.stringify({ ok: true, mensagem: 'Preview local: nenhum código foi enviado. Use 6 dígitos.', ticket }));
    }
    if (req.method === 'POST' && path === '/admin/auth/entrar') {
      const b = await corpoJson(req);
      const codigo = String(b.codigo || '').replace(/\D/g, '');
      const expira = tickets.get(String(b.ticket || ''));
      if (!expira || expira < Date.now() || codigo.length !== 6) {
        res.writeHead(401, cabecalhos({ 'content-type': 'application/json; charset=utf-8' }));
        return res.end(JSON.stringify({ erro: 'Código inválido ou expirado. Peça um novo código.' }));
      }
      tickets.delete(String(b.ticket || ''));
      const token = randomBytes(24).toString('base64url');
      sessoes.set(token, { exp: Date.now() + 12 * 3600 * 1000 });
      res.writeHead(200, cabecalhos({
        'content-type': 'application/json; charset=utf-8',
        'set-cookie': `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200`
      }));
      return res.end(JSON.stringify({ ok: true, destino: '/' }));
    }
    if (req.method === 'POST' && path === '/admin/auth/sair') {
      const t = cookieDe(req); if (t) sessoes.delete(t);
      res.writeHead(303, cabecalhos({ location: '/admin/login', 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` }));
      return res.end();
    }
    if (req.method === 'GET' && path === '/admin/auth/inicio') {
      res.writeHead(302, cabecalhos({ location: sessaoOk(req) ? '/' : '/admin/login' }));
      return res.end();
    }
    if (PUBLICOS.has(path) && (req.method === 'GET' || req.method === 'HEAD')) return enviarArquivo(res, PUBLICOS.get(path));
    if (PROTEGIDOS.has(path) && (req.method === 'GET' || req.method === 'HEAD')) {
      if (!sessaoOk(req)) {
        if (querHtml(req)) { res.writeHead(302, cabecalhos({ location: '/admin/login' })); return res.end(); }
        res.writeHead(401, cabecalhos()); return res.end();
      }
      return enviarArquivo(res, PROTEGIDOS.get(path));
    }
    res.writeHead(404, cabecalhos()); res.end('Não encontrado.');
  } catch {
    if (!res.headersSent) res.writeHead(400, cabecalhos());
    res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`WorkAI preview local: http://${HOST}:${PORT}/  (não é produção; cookie ${COOKIE})`);
});
