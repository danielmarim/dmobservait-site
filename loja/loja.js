(() => {
'use strict';
// Regras dos ebooks da loja, usadas pelo build do site (loja.mjs), pelo serviço da loja (server.mjs) e pela tela
// /admin/loja (que repete só as mensagens; quem decide é o serviço). Sem dependências: roda no Node e no navegador.
const LIMITES = { titulo: 90, descricao: 340, tema: 28, publico: 180, item: 90, itens: 10, ebooks: 60 };
const CHECKOUT = /^https:\/\/pay\.kiwify\.com\.br\/([A-Za-z0-9_-]{4,40})(\?[A-Za-z0-9_=&%.-]{0,200})?$/;
const PRECO = /^R\$ \d{1,3}(\.\d{3})*,\d{2}$/;
// capa: arquivo do site (assets/loja/, vindo do build) ou enviado pelo /admin/loja (serviço, em /loja/dados/capas/)
const CAPA = /^\/(assets\/loja|loja\/dados\/capas)\/[a-z0-9-]{1,80}\.(webp|png|jpg)$/;

const texto = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

// deixa o ebook só com os campos conhecidos, sem espaços sobrando; listas vazias e textos vazios somem
const normalizar = (e = {}) => {
  const conteudo = (Array.isArray(e.conteudo) ? e.conteudo : String(e.conteudo ?? '').split('\n')).map(texto).filter(Boolean);
  const out = { titulo: texto(e.titulo), descricao: texto(e.descricao), preco: texto(e.preco), checkout: texto(e.checkout) };
  for (const k of ['tema', 'publico', 'capa']) if (texto(e[k])) out[k] = texto(e[k]);
  if (conteudo.length) out.conteudo = conteudo;
  out.ativo = e.ativo !== false;
  return out;
};

// lista de problemas em português (vazia = ebook válido)
const validar = (e) => {
  const p = [];
  if (!e.titulo || e.titulo.length > LIMITES.titulo) p.push(`Título é obrigatório (até ${LIMITES.titulo} caracteres).`);
  if (!e.descricao || e.descricao.length > LIMITES.descricao) p.push(`Descrição é obrigatória (até ${LIMITES.descricao} caracteres).`);
  if (!PRECO.test(e.preco ?? '')) p.push('Preço deve ser como R$ 29,90.');
  if (!CHECKOUT.test(e.checkout ?? '')) p.push('Link de checkout deve ser da Kiwify: https://pay.kiwify.com.br/CODIGO.');
  if (e.tema && e.tema.length > LIMITES.tema) p.push(`Tema deve ter até ${LIMITES.tema} caracteres.`);
  if (e.publico && e.publico.length > LIMITES.publico) p.push(`"Para quem é" deve ter até ${LIMITES.publico} caracteres.`);
  if (e.conteudo && (e.conteudo.length > LIMITES.itens || e.conteudo.some((c) => c.length > LIMITES.item))) p.push(`"O que tem no ebook" aceita até ${LIMITES.itens} itens de até ${LIMITES.item} caracteres.`);
  if (e.capa && !CAPA.test(e.capa)) p.push('Capa inválida: envie a imagem pela tela do /admin/loja.');
  return p;
};

// preço em centavos (como a Kiwify guarda) para o formato do site: 1990 → "R$ 19,90"
const precoDeCentavos = (c) => {
  const n = Number(c);
  if (!Number.isInteger(n) || n <= 0 || n > 99999999) return null;
  const [r, cents] = (n / 100).toFixed(2).split('.');
  return `R$ ${r.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${cents}`;
};

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Cartão de um ebook da loja: o mesmo HTML no build (página /loja/), no navegador (lista ao vivo, vinda do serviço)
// e na prévia da tela /admin/loja. Usa os ícones do sprite do site (#i-check, #i-arrow-up-right, #logo-mark).


const svg = (cls, id) => `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#${id}"/></svg>`;

const capaHtml = (e) => e.capa
  ? `<img src="${esc(e.capa)}" alt="Capa do ebook ${esc(e.titulo)}" width="600" height="900" loading="lazy" decoding="async">`
  : `<div class="ebook-cover-art" aria-hidden="true"><span class="mono-label">EBOOK · DM OBSERVAIT</span><strong>${esc(e.titulo)}</strong>${svg('logo-mark logo-mark--bare', 'logo-mark')}</div>`;

const cartao = (e) => `<li class="ebook">
<div class="ebook-cover">${capaHtml(e)}</div>
<div class="ebook-body">${e.tema ? `<p class="ebook-tema">${esc(e.tema)}</p>` : ''}<h3>${esc(e.titulo)}</h3><p class="ebook-desc">${esc(e.descricao)}</p>${e.publico ? `<p class="ebook-publico"><strong>Para quem é:</strong> ${esc(e.publico)}</p>` : ''}${e.conteudo?.length ? `<div class="ebook-conteudo"><p class="mono-label">O QUE TEM NO EBOOK</p><ul>${e.conteudo.map((c) => `<li>${svg('icon', 'i-check')}<span>${esc(c)}</span></li>`).join('')}</ul></div>` : ''}
<div class="ebook-foot"><p class="ebook-preco"><span class="mono-label">PREÇO</span><strong>${esc(e.preco)}</strong></p><a class="btn btn--primary" href="${esc(e.checkout)}" target="_blank" rel="noopener" aria-label="Comprar o ebook ${esc(e.titulo)} na Kiwify (abre em nova aba)"><span>Comprar na Kiwify</span>${svg('icon', 'i-arrow-up-right')}</a></div></div>
</li>`;

const classeLista = (n) => `ebooks${n === 1 ? ' ebooks--um' : ''}`;

// /loja/: troca a lista que veio pronta do build pela lista atual do serviço (/loja/dados/ebooks.json).
// Se o arquivo não existir ou falhar, a página fica como veio. Só mostra ebook que passa nas mesmas regras do
// serviço (link da Kiwify, preço, capa do próprio site), e todo texto passa por esc() antes de virar HTML.
// (O build junta regras.mjs e cartao.mjs na frente deste arquivo, em dist/loja/loja.js.)
const lista = document.querySelector('[data-loja]');
const vazia = document.querySelector('[data-loja-vazia]');
if (lista) {
  fetch('/loja/dados/ebooks.json', { cache: 'no-cache', headers: { accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d || !Array.isArray(d.ebooks)) return;
      const ebooks = d.ebooks.map(normalizar).filter((e) => e.ativo && !validar(e).length);
      lista.className = classeLista(ebooks.length);
      lista.innerHTML = ebooks.map(cartao).join('');
      if (vazia) vazia.hidden = ebooks.length > 0;
    })
    .catch(() => {});
}

})();
