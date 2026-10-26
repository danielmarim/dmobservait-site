// Regras dos ebooks da loja, usadas pelo build do site (loja.mjs), pelo serviço da loja (server.mjs) e pela tela
// /admin/loja (que repete só as mensagens; quem decide é o serviço). Sem dependências: roda no Node e no navegador.
export const LIMITES = { titulo: 90, descricao: 340, tema: 28, publico: 180, item: 90, itens: 10, ebooks: 60 };
export const CHECKOUT = /^https:\/\/pay\.kiwify\.com\.br\/([A-Za-z0-9_-]{4,40})(\?[A-Za-z0-9_=&%.-]{0,200})?$/;
export const PRECO = /^R\$ \d{1,3}(\.\d{3})*,\d{2}$/;
// capa: arquivo do site (assets/loja/, vindo do build) ou enviado pelo /admin/loja (serviço, em /loja/dados/capas/)
export const CAPA = /^\/(assets\/loja|loja\/dados\/capas)\/[a-z0-9-]{1,80}\.(webp|png|jpg)$/;

const texto = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

// deixa o ebook só com os campos conhecidos, sem espaços sobrando; listas vazias e textos vazios somem
export const normalizar = (e = {}) => {
  const conteudo = (Array.isArray(e.conteudo) ? e.conteudo : String(e.conteudo ?? '').split('\n')).map(texto).filter(Boolean);
  const out = { titulo: texto(e.titulo), descricao: texto(e.descricao), preco: texto(e.preco), checkout: texto(e.checkout) };
  for (const k of ['tema', 'publico', 'capa']) if (texto(e[k])) out[k] = texto(e[k]);
  if (conteudo.length) out.conteudo = conteudo;
  out.ativo = e.ativo !== false;
  return out;
};

// lista de problemas em português (vazia = ebook válido)
export const validar = (e) => {
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
export const precoDeCentavos = (c) => {
  const n = Number(c);
  if (!Number.isInteger(n) || n <= 0 || n > 99999999) return null;
  const [r, cents] = (n / 100).toFixed(2).split('.');
  return `R$ ${r.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${cents}`;
};

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
