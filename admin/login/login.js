// Tela /admin/login: pede o código (e-mail e/ou WhatsApp) e troca por uma sessão. Não tem nenhum dado do painel.
(() => {
  const $ = (s) => document.querySelector(s);
  const passo1 = $('#lg-passo1'), passo2 = $('#lg-passo2'), aviso = $('#lg-aviso');
  const campo = $('#lg-destino'), rotulo = $('#lg-destino-rotulo'), canais = $('#lg-canais'), enviar = $('#lg-enviar');
  const recup = $('#lg-recuperar'), titulo = $('#lg-titulo-1'), codigo = $('#lg-codigo'), entrar = $('#lg-entrar');
  let modoRecuperacao = false;
  const msg = (texto, tipo) => { aviso.textContent = texto; aviso.dataset.tipo = tipo || ''; aviso.hidden = !texto; };
  const chamar = async (caminho, corpo) => {
    const r = await fetch(caminho, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dm-admin': '1' }, body: JSON.stringify(corpo), credentials: 'same-origin' });
    let j = {}; try { j = await r.json(); } catch { /* resposta sem JSON */ }
    return { ok: r.ok, status: r.status, j };
  };
  const modo = (recuperacao) => {
    modoRecuperacao = recuperacao;
    canais.hidden = recuperacao;
    rotulo.textContent = recuperacao ? 'E-mail de recuperação' : 'E-mail ou WhatsApp cadastrado';
    campo.type = recuperacao ? 'email' : 'text';
    campo.autocomplete = recuperacao ? 'email' : 'username';
    titulo.textContent = recuperacao ? 'Perdi o acesso ao e-mail principal' : 'Entrar no painel';
    enviar.textContent = recuperacao ? 'Enviar código para o e-mail de recuperação' : 'Enviar código';
    recup.textContent = recuperacao ? 'Voltar ao acesso normal' : 'Perdi acesso ao e-mail principal';
    recup.setAttribute('aria-expanded', String(recuperacao));
    msg('');
    campo.focus();
  };
  recup.addEventListener('click', () => modo(!modoRecuperacao));

  passo1.addEventListener('submit', async (e) => {
    e.preventDefault();
    const escolhidos = [...document.querySelectorAll('#lg-canais input:checked')].map((i) => i.value);
    if (!campo.value.trim()) return msg('Digite o e-mail ou o número cadastrado.', 'erro');
    if (!modoRecuperacao && !escolhidos.length) return msg('Escolha receber o código por e-mail, WhatsApp ou pelos dois.', 'erro');
    enviar.disabled = true; msg('Enviando…');
    try {
      const r = await chamar('/admin/auth/enviar', { destino: campo.value.trim(), canais: escolhidos, recuperacao: modoRecuperacao });
      if (r.status === 429) return msg(r.j.erro || 'Muitas tentativas. Aguarde alguns minutos.', 'erro');
      if (!r.ok) return msg('Não foi possível enviar agora. Tente de novo em instantes.', 'erro');
      // a mesma resposta vale para destino cadastrado ou não: nada aqui revela quem tem acesso
      passo1.hidden = true; passo2.hidden = false;
      msg(r.j.mensagem || '', 'ok'); codigo.value = ''; codigo.focus();
    } catch { msg('Sem conexão. Tente de novo.', 'erro'); }
    finally { enviar.disabled = false; }
  });

  passo2.addEventListener('submit', async (e) => {
    e.preventDefault();
    const c = codigo.value.replace(/\D/g, '');
    if (c.length !== 6) return msg('O código tem 6 números.', 'erro');
    entrar.disabled = true;
    try {
      const r = await chamar('/admin/auth/entrar', { codigo: c });
      if (r.ok) { msg('Entrando…', 'ok'); location.assign('/admin/'); return; }
      msg(r.j.erro || 'Código inválido ou expirado. Peça um novo código.', 'erro'); codigo.select();
    } catch { msg('Sem conexão. Tente de novo.', 'erro'); }
    finally { entrar.disabled = false; }
  });
  $('#lg-outro').addEventListener('click', () => { passo2.hidden = true; passo1.hidden = false; msg(''); campo.focus(); });
})();
