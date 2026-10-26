// Serviço da loja de ebooks (dmobservait.com/loja). Guarda o que é cadastrado na tela /admin/loja e as capas enviadas.
// Roda num container sem porta pública e numa rede só com o nginx do site, que repassa /admin/api/ depois de exigir a
// senha do /admin. Sem dependências: só Node 20.
//
// Dados (volume em DADOS):
//   privado/ebooks.json   todos os ebooks, inclusive os ocultos (nunca servido)
//   publico/ebooks.json   só os publicados, com os campos que a /loja mostra (o nginx serve em /loja/dados/)
//   publico/capas/        capas enviadas (servidas em /loja/dados/capas/)
// Na primeira vez, o serviço começa com os ebooks de seed-ebooks.json (gerado pelo build a partir de site.config.mjs).
import http from 'node:http';
import { readFile, writeFile, rename, mkdir, unlink, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { normalizar, validar, precoDeCentavos, CHECKOUT, LIMITES } from './regras.mjs';

const DADOS = process.env.DADOS || '/dados';
const PORTA = Number(process.env.PORTA || 8080);
const SEED = process.env.SEED || join(dirname(fileURLToPath(import.meta.url)), 'seed-ebooks.json');
const KIWIFY = process.env.KIWIFY_ORIGEM || 'https://pay.kiwify.com.br';           // trocado só nos testes
const IMAGENS_KIWIFY = /^https:\/\/([a-z0-9-]+\.)*kiwify\.com\.br\//;               // de onde a capa pode ser baixada
const IMAGENS_OK = process.env.IMAGENS_KIWIFY ? new RegExp(process.env.IMAGENS_KIWIFY) : IMAGENS_KIWIFY;
const MAX_CAPA = 3 * 1024 * 1024;
const PRIV = join(DADOS, 'privado', 'ebooks.json'), PUB = join(DADOS, 'publico', 'ebooks.json'), CAPAS = join(DADOS, 'publico', 'capas');

// ---------- dados ----------
const gravar = async (arq, obj) => { await mkdir(dirname(arq), { recursive: true }); const tmp = `${arq}.${randomBytes(4).toString('hex')}.tmp`; await writeFile(tmp, JSON.stringify(obj, null, 2)); await rename(tmp, arq); };
const publicar = (ebooks) => gravar(PUB, { atualizadoEm: new Date().toISOString(), ebooks: ebooks.filter((e) => e.ativo).map(({ ativo, criadoEm, atualizadoEm, ...e }) => e) });
let fila = Promise.resolve();                                   // uma alteração por vez; um erro não trava as próximas
const alterar = (fn) => { const p = fila.then(async () => { const lista = await ler(); const r = await fn(lista); await gravar(PRIV, { ebooks: lista }); await publicar(lista); return r; }); fila = p.catch(() => {}); return p; };
const ler = async () => JSON.parse(await readFile(PRIV, 'utf8')).ebooks;

const iniciar = async () => {
  await mkdir(CAPAS, { recursive: true });
  if (!existsSync(PRIV)) {
    const seed = existsSync(SEED) ? JSON.parse(await readFile(SEED, 'utf8')).ebooks ?? [] : [];
    const agora = new Date().toISOString();
    const lista = seed.map((e) => ({ id: novoId(e.titulo), ...normalizar(e), criadoEm: agora, atualizadoEm: agora })).filter((e) => !validar(e).length);
    await gravar(PRIV, { ebooks: lista });
    await publicar(lista);
    console.log(`dados criados com ${lista.length} ebook(s) do seed`);
  } else await publicar(await ler());                          // regrava o público (campos podem ter mudado de versão)
  // capas enviadas há mais de um dia que não ficaram em nenhum ebook (formulário abandonado)
  const usadas = new Set((await ler()).map((e) => e.capa));
  for (const f of await readdir(CAPAS)) {
    const st = await stat(join(CAPAS, f)).catch(() => null);
    if (st && !usadas.has(`/loja/dados/capas/${f}`) && Date.now() - st.mtimeMs > 864e5) await unlink(join(CAPAS, f)).catch(() => {});
  }
};

const novoId = (titulo = '') => `${titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'ebook'}-${randomBytes(3).toString('hex')}`;

// ---------- imagens ----------
const tipoImagem = (b) => (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' ? 'webp'
  : b.length > 8 && b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG' ? 'png'
  : b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? 'jpg' : null);
const salvarCapa = async (buf) => {
  const ext = tipoImagem(buf);
  if (!ext) throw new Erro(400, 'A capa precisa ser uma imagem WEBP, PNG ou JPG.');
  if (buf.length > MAX_CAPA) throw new Erro(413, 'A capa pode ter até 3 MB.');
  const nome = `capa-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}.${ext}`;
  await writeFile(join(CAPAS, nome), buf);
  return `/loja/dados/capas/${nome}`;
};
const apagarCapa = async (capa) => { if (capa?.startsWith('/loja/dados/capas/')) await unlink(join(CAPAS, capa.split('/').pop())).catch(() => {}); };

// ---------- Kiwify: título, preço e capa a partir da página de checkout (só leitura, só pay.kiwify.com.br) ----------
const baixar = async (url, max) => {
  const r = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(12000), headers: { 'user-agent': 'Mozilla/5.0 (DM ObservaIT loja)' } });
  if (!r.ok) throw new Erro(502, `A Kiwify respondeu ${r.status}.`);
  const partes = []; let total = 0;
  for await (const p of r.body) { total += p.length; if (total > max) throw new Erro(502, 'Resposta grande demais.'); partes.push(p); }
  return Buffer.concat(partes);
};
const meta = (html, prop) => (html.match(new RegExp(`<meta[^>]+property="${prop}"[^>]+content="([^"]*)"`)) || [])[1];
const desfazer = (s = '') => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
const importarKiwify = async (checkout) => {
  const m = CHECKOUT.exec(checkout || '');
  if (!m) throw new Erro(400, 'Cole o link de checkout da Kiwify (https://pay.kiwify.com.br/CODIGO).');
  const codigo = m[1];
  const html = (await baixar(`${KIWIFY}/${codigo}`, 3 * 1024 * 1024)).toString('utf8');
  const titulo = desfazer(meta(html, 'og:title')).slice(0, LIMITES.titulo);
  // nos dados da página o produto aparece como "CODIGO","Nome do produto",PREÇO_EM_CENTAVOS
  const cents = (html.match(new RegExp(`"${codigo}","[^"]{1,200}",(\\d{2,9})[,\\]]`)) || [])[1];
  const preco = cents ? precoDeCentavos(cents) : null;
  let capa = null;
  const img = desfazer(meta(html, 'og:image'));
  if (img && IMAGENS_OK.test(img)) { try { capa = await salvarCapa(await baixar(img, MAX_CAPA)); } catch { capa = null; } }
  if (!titulo && !preco && !capa) throw new Erro(422, 'Não encontrei os dados do produto nessa página da Kiwify.');
  return { titulo: titulo || null, preco, capa, checkout: `https://pay.kiwify.com.br/${codigo}` };
};

// ---------- HTTP ----------
class Erro extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }
const lerCorpo = async (req, max) => {
  const partes = []; let total = 0;
  for await (const p of req) { total += p.length; if (total > max) throw new Erro(413, 'Envio grande demais.'); partes.push(p); }
  return Buffer.concat(partes);
};
const json = async (req) => { try { return JSON.parse((await lerCorpo(req, 64 * 1024)).toString('utf8') || '{}'); } catch (e) { if (e instanceof Erro) throw e; throw new Erro(400, 'JSON inválido.'); } };
const responder = (res, status, obj) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(obj)); };

const rotas = async (req, res) => {
  const url = new URL(req.url, 'http://loja');
  const p = url.pathname.replace(/\/+$/, '');
  if (req.method === 'GET' && p === '/saude') return responder(res, 200, { ok: true });
  if (!p.startsWith('/admin/api/')) throw new Erro(404, 'Não encontrado.');
  // contra envio por outro site com a senha guardada no navegador: exige o cabeçalho da tela e pedido da mesma origem
  if (req.headers['x-dm-admin'] !== '1' || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) throw new Erro(403, 'Pedido recusado.');
  const r = p.slice('/admin/api'.length);
  const id = (r.match(/^\/ebooks\/([a-z0-9-]{1,60})(\/mover)?$/) || [])[1];

  if (req.method === 'GET' && r === '/ebooks') return responder(res, 200, { ebooks: await ler() });
  if (req.method === 'POST' && r === '/ebooks') {
    const e = normalizar(await json(req));
    const prob = validar(e);
    if (prob.length) throw new Erro(422, 'Revise os campos.', { problemas: prob });
    const novo = await alterar((lista) => {
      if (lista.length >= LIMITES.ebooks) throw new Erro(409, `A loja aceita até ${LIMITES.ebooks} ebooks.`);
      const agora = new Date().toISOString();
      const n = { id: novoId(e.titulo), ...e, criadoEm: agora, atualizadoEm: agora };
      lista.unshift(n);
      return n;
    });
    return responder(res, 201, { ebook: novo });
  }
  if (id && req.method === 'PUT' && !r.endsWith('/mover')) {
    const e = normalizar(await json(req));
    const prob = validar(e);
    if (prob.length) throw new Erro(422, 'Revise os campos.', { problemas: prob });
    let capaAntiga;
    const salvo = await alterar((lista) => {
      const i = lista.findIndex((x) => x.id === id);
      if (i < 0) throw new Erro(404, 'Ebook não encontrado.');
      capaAntiga = lista[i].capa;
      lista[i] = { id, ...e, criadoEm: lista[i].criadoEm, atualizadoEm: new Date().toISOString() };
      return lista[i];
    });
    if (capaAntiga && capaAntiga !== salvo.capa) await apagarCapa(capaAntiga);
    return responder(res, 200, { ebook: salvo });
  }
  if (id && req.method === 'POST' && r.endsWith('/mover')) {
    const { direcao } = await json(req);
    await alterar((lista) => {
      const i = lista.findIndex((x) => x.id === id);
      if (i < 0) throw new Erro(404, 'Ebook não encontrado.');
      const j = direcao === 'cima' ? i - 1 : direcao === 'baixo' ? i + 1 : -1;
      if (j >= 0 && j < lista.length) [lista[i], lista[j]] = [lista[j], lista[i]];
    });
    return responder(res, 200, { ebooks: await ler() });
  }
  if (id && req.method === 'DELETE') {
    const removido = await alterar((lista) => {
      const i = lista.findIndex((x) => x.id === id);
      if (i < 0) throw new Erro(404, 'Ebook não encontrado.');
      return lista.splice(i, 1)[0];
    });
    await apagarCapa(removido.capa);
    return responder(res, 200, { removido: removido.id });
  }
  if (req.method === 'POST' && r === '/capas') return responder(res, 201, { capa: await salvarCapa(await lerCorpo(req, MAX_CAPA + 1)) });
  if (req.method === 'POST' && r === '/kiwify') return responder(res, 200, await importarKiwify((await json(req)).checkout));
  throw new Erro(404, 'Não encontrado.');
};

await iniciar();
http.createServer(async (req, res) => {
  try { await rotas(req, res); }
  catch (e) {
    const status = e instanceof Erro ? e.status : 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) responder(res, status, { erro: e instanceof Erro ? e.message : 'Erro interno.', ...(e.extra ?? {}) });
    req.resume();
  }
}).listen(PORTA, () => console.log(`loja: porta ${PORTA}, dados em ${DADOS}`));
