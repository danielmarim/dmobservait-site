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

// Tela /admin/loja: cadastra, edita, oculta, reordena e exclui os ebooks da loja, falando com o serviço da loja em
// /admin/api/ (o nginx só deixa passar com a senha do /admin). Todo pedido leva o cabeçalho x-dm-admin, que o serviço
// exige. A prévia usa o mesmo cartão da loja (cartao.mjs) e as mesmas regras (regras.mjs), que o build junta na
// frente deste arquivo em dist/admin/loja.js.
const $ = (s) => document.querySelector(s);
const form = $('#lj-form'), lista = $('#lj-lista'), statusEl = $('#lj-status'), erros = $('#lj-erros');
const secForm = $('#lj-form-sec'), secPrevia = $('#lj-previa-sec'), previa = $('#lj-previa'), capaPrevia = $('#lj-capa-previa');
let ebooks = [], editando = null, ocupado = false;

const aviso = (msg, tipo = 'ok') => { statusEl.textContent = msg; statusEl.dataset.tipo = tipo; statusEl.hidden = !msg; };

const api = async (metodo, caminho, corpo, tipo = 'application/json') => {
  const r = await fetch(`/admin/api${caminho}`, { method: metodo, credentials: 'same-origin', headers: { 'x-dm-admin': '1', accept: 'application/json', ...(corpo !== undefined ? { 'content-type': tipo } : {}) }, body: corpo === undefined ? undefined : tipo === 'application/json' ? JSON.stringify(corpo) : corpo });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) throw Object.assign(new Error('A sessão do painel expirou. Recarregue a página e entre de novo.'), { d });
  if (!r.ok) throw Object.assign(new Error(d.erro || `Erro ${r.status}.`), { d });
  return d;
};

// ---------- lista ----------
const desenharLista = () => {
  lista.innerHTML = ebooks.length ? ebooks.map((e, i) => `<li class="lj-item${e.ativo ? '' : ' lj-oculto'}" data-id="${esc(e.id)}">
<div class="lj-thumb">${capaHtml(e)}</div>
<div class="lj-info"><strong>${esc(e.titulo)}</strong><span>${esc(e.preco)} · <span class="lj-chip">${e.ativo ? 'Publicado' : 'Oculto'}</span></span></div>
<div class="lj-botoes">
<button type="button" class="btn btn--ghost" data-acao="editar">Editar</button>
<button type="button" class="btn btn--ghost" data-acao="alternar">${e.ativo ? 'Ocultar' : 'Publicar'}</button>
<button type="button" class="btn btn--ghost lj-seta" data-acao="cima" aria-label="Subir ${esc(e.titulo)}"${i === 0 ? ' disabled' : ''}>↑</button>
<button type="button" class="btn btn--ghost lj-seta" data-acao="baixo" aria-label="Descer ${esc(e.titulo)}"${i === ebooks.length - 1 ? ' disabled' : ''}>↓</button>
<button type="button" class="btn btn--ghost lj-excluir" data-acao="excluir">Excluir</button>
</div></li>`).join('') : '<li class="lj-vazio">Nenhum ebook cadastrado. Clique em “Novo ebook”.</li>';
};

const carregar = async () => {
  try { ebooks = (await api('GET', '/ebooks')).ebooks; desenharLista(); if (statusEl.dataset.tipo === 'erro') aviso(''); }
  catch (err) { aviso(err.message, 'erro'); }
};

lista.addEventListener('click', async (ev) => {
  const b = ev.target.closest('button[data-acao]');
  if (!b || ocupado) return;
  const e = ebooks.find((x) => x.id === b.closest('[data-id]').dataset.id);
  const acao = b.dataset.acao;
  if (acao === 'editar') return abrir(e);
  if (acao === 'excluir' && !b.dataset.confirmar) {   // exclusão em dois cliques, sem caixa de diálogo
    b.dataset.confirmar = '1'; b.textContent = 'Confirmar exclusão'; b.classList.add('lj-perigo');
    setTimeout(() => { if (b.isConnected) { delete b.dataset.confirmar; b.textContent = 'Excluir'; b.classList.remove('lj-perigo'); } }, 5000);
    return;
  }
  ocupado = true;
  try {
    if (acao === 'excluir') { await api('DELETE', `/ebooks/${e.id}`); aviso(`“${e.titulo}” foi excluído da loja.`); if (editando === e.id) fechar(); }
    if (acao === 'alternar') { await api('PUT', `/ebooks/${e.id}`, { ...e, ativo: !e.ativo }); aviso(e.ativo ? `“${e.titulo}” saiu da loja (continua salvo aqui).` : `“${e.titulo}” voltou para a loja.`); }
    if (acao === 'cima' || acao === 'baixo') await api('POST', `/ebooks/${e.id}/mover`, { direcao: acao });
    await carregar();
  } catch (err) { aviso(err.message, 'erro'); }
  finally { ocupado = false; }
});

// ---------- formulário ----------
const dados = () => {
  const f = new FormData(form);
  return normalizar({ titulo: f.get('titulo'), descricao: f.get('descricao'), preco: f.get('preco'), checkout: f.get('checkout'), tema: f.get('tema'), publico: f.get('publico'), conteudo: f.get('conteudo'), capa: f.get('capa'), ativo: form.elements.ativo.checked });
};
const mostrarCapa = (capa) => { form.elements.capa.value = capa || ''; capaPrevia.innerHTML = capa ? `<img src="${esc(capa)}" alt="Capa escolhida">` : 'Sem capa: o site desenha uma.'; $('#lj-capa-remover').hidden = !capa; };
const atualizarPrevia = () => {
  const e = dados();
  previa.innerHTML = cartao({ ...e, titulo: e.titulo || 'Título do ebook', descricao: e.descricao || 'Descrição do ebook.', preco: e.preco || 'R$ 0,00', checkout: '#' });
  for (const [campo, max] of [['descricao', LIMITES.descricao], ['titulo', LIMITES.titulo]]) { const c = document.querySelector(`[data-contador="${campo}"]`); if (c) c.textContent = `${form.elements[campo].value.length}/${max}`; }
};
const abrir = (e) => {
  editando = e ? e.id : null;
  form.reset(); erros.innerHTML = '';
  $('#lj-form-titulo').textContent = e ? 'Editar ebook' : 'Novo ebook';
  if (e) {
    for (const k of ['titulo', 'descricao', 'preco', 'checkout', 'tema', 'publico']) form.elements[k].value = e[k] || '';
    form.elements.conteudo.value = (e.conteudo || []).join('\n');
    form.elements.ativo.checked = e.ativo !== false;
  }
  mostrarCapa(e?.capa);
  secForm.hidden = false; secPrevia.hidden = false;
  atualizarPrevia();
  form.elements.checkout.focus();
};
const fechar = () => { editando = null; secForm.hidden = true; secPrevia.hidden = true; form.reset(); };

form.addEventListener('input', atualizarPrevia);
$('#lj-novo').addEventListener('click', () => abrir(null));
$('#lj-cancelar').addEventListener('click', fechar);
$('#lj-capa-remover').addEventListener('click', () => { mostrarCapa(''); atualizarPrevia(); });

$('#lj-capa-arquivo').addEventListener('change', async (ev) => {
  const arq = ev.target.files[0];
  if (!arq) return;
  if (!/^image\/(webp|png|jpeg)$/.test(arq.type)) return aviso('A capa precisa ser WEBP, PNG ou JPG.', 'erro');
  if (arq.size > 3 * 1024 * 1024) return aviso('A capa pode ter até 3 MB.', 'erro');
  aviso('Enviando a capa…');
  try { mostrarCapa((await api('POST', '/capas', arq, arq.type)).capa); atualizarPrevia(); aviso('Capa enviada. Ela só aparece na loja depois de salvar.'); }
  catch (err) { aviso(err.message, 'erro'); }
  finally { ev.target.value = ''; }
});

$('#lj-kiwify').addEventListener('click', async () => {
  const checkout = form.elements.checkout.value.trim();
  if (!CHECKOUT.test(checkout)) return aviso('Cole primeiro o link de checkout da Kiwify (https://pay.kiwify.com.br/CODIGO).', 'erro');
  aviso('Buscando o produto na Kiwify…');
  try {
    const k = await api('POST', '/kiwify', { checkout });
    if (k.titulo) form.elements.titulo.value = k.titulo;
    if (k.preco) form.elements.preco.value = k.preco;
    if (k.capa) mostrarCapa(k.capa);
    form.elements.checkout.value = k.checkout;
    atualizarPrevia();
    aviso(`Puxei da Kiwify: ${[k.titulo && 'título', k.preco && 'preço', k.capa && 'capa'].filter(Boolean).join(', ') || 'nada'}. Confira e complete a descrição antes de salvar.`);
  } catch (err) { aviso(err.message, 'erro'); }
});

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (ocupado) return;
  const e = dados();
  const prob = validar(e);
  erros.innerHTML = prob.map((p) => `<li>${esc(p)}</li>`).join('');
  if (prob.length) return;
  ocupado = true; $('#lj-salvar').disabled = true;
  try {
    if (editando) await api('PUT', `/ebooks/${editando}`, e); else await api('POST', '/ebooks', e);
    aviso(`“${e.titulo}” foi salvo${e.ativo ? ' e já está na loja' : ' (oculto: não aparece na loja)'}.`);
    fechar();
    await carregar();
  } catch (err) {
    erros.innerHTML = (err.d?.problemas || [err.message]).map((p) => `<li>${esc(p)}</li>`).join('');
  } finally { ocupado = false; $('#lj-salvar').disabled = false; }
});

$('#lj-baixar').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ exportadoEm: new Date().toISOString(), ebooks }, null, 2)], { type: 'application/json' }));
  a.download = `loja-ebooks-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a); a.click(); a.remove();
});

carregar();

})();
