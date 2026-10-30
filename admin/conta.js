// Telas da seção "Conta" do /admin: Informações da conta, Compartilhamento de acesso, Segurança e Atividades da conta.
// Fala só com /admin/auth/conta/ (serviço de login). O servidor é quem decide: aqui nada é segredo nem permissão.
(() => {
  const app = document.getElementById('ct-app');
  const tela = document.querySelector('main[data-tela]')?.dataset.tela;
  if (!app || !tela) return;

  // ---------- utilidades ----------
  const h = (tag, a = {}, ...filhos) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(a)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of filhos.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  };
  const api = async (metodo, caminho, corpo) => {
    const r = await fetch(`/admin/auth/conta${caminho}`, { method: metodo, headers: { 'content-type': 'application/json', 'x-dm-admin': '1' }, body: corpo ? JSON.stringify(corpo) : undefined, credentials: 'same-origin' });
    let j = {}; try { j = await r.json(); } catch { /* sem corpo */ }
    if (r.status === 401 && !j.precisaCodigo) location.assign('/admin/login');
    return { ok: r.ok, status: r.status, j };
  };
  const fmt = (v) => (v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }) : '—');
  const fmtData = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
  const status = h('p', { class: 'adm-status ct-status', role: 'status', hidden: true });
  const aviso = (txt, tipo) => { status.textContent = txt; status.dataset.tipo = tipo || 'ok'; status.hidden = !txt; if (txt) status.scrollIntoView({ block: 'nearest' }); };
  const ESTADOS = { ativo: 'Ativo', convite: 'Convite pendente', suspenso: 'Suspenso', expirado: 'Expirado' };
  const selo = (estado) => h('span', { class: `ct-selo ct-selo--${estado}` }, ESTADOS[estado] || estado);
  const titulo = (t, intro) => [h('h1', {}, t), intro ? h('p', { class: 'adm-intro' }, intro) : null, status];

  // diálogo simples (Esc fecha); `corpo` é um elemento; devolve { fechar }
  const dialogo = (tituloTxt, corpo) => {
    const d = h('dialog', { class: 'ct-dialogo', 'aria-labelledby': 'ct-dlg-t' }, h('h2', { id: 'ct-dlg-t' }, tituloTxt), corpo);
    document.body.append(d);
    d.addEventListener('close', () => d.remove());
    d.showModal();
    return { fechar: () => d.close(), el: d };
  };
  // bloco "código de confirmação": botão que envia um código novo ao contato atual do Dono + campo de 6 números
  const blocoCodigo = (escopo) => {
    const campo = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '8', placeholder: '000000', 'aria-label': 'Código de confirmação' });
    const msg = h('small', { class: 'ct-dica' }, 'Enviamos um código novo ao seu e-mail e WhatsApp cadastrados.');
    const botao = h('button', { type: 'button', class: 'btn btn--ghost', onclick: async () => {
      botao.disabled = true;
      const r = await api('POST', '/codigo', { escopo });
      msg.textContent = r.ok ? r.j.mensagem : r.j.erro || 'Não foi possível enviar o código agora.';
      setTimeout(() => { botao.disabled = false; }, 30_000);
    } }, 'Enviar código');
    return { el: h('div', { class: 'ct-codigo' }, h('label', {}, 'Código de confirmação', campo), botao, msg), valor: () => campo.value.replace(/\D/g, '') };
  };
  const linha = (rotulo, valor, extra) => h('div', { class: 'ct-linha' }, h('span', { class: 'ct-rotulo' }, rotulo), h('span', { class: 'ct-valor' }, valor || '—'), extra || h('span'));

  // ---------- Informações da conta ----------
  async function telaInfo() {
    app.replaceChildren(...titulo('Informações da conta', 'Seus dados de acesso ao painel. Mudar um contato exige um código novo, enviado ao contato atual.'));
    const r = await api('GET', '/perfil');
    if (!r.ok) return aviso('Não foi possível carregar a conta.', 'erro');
    const { pessoa: p, emergencia } = r.j;
    const dono = p.ehDono;
    const cartaoDados = h('section', { class: 'ct-cartao', 'aria-labelledby': 'ct-info-t' }, h('h2', { id: 'ct-info-t' }, 'Informações pessoais'),
      linha('Nome', p.nome), linha('E-mail principal', p.email), linha('E-mail de recuperação', dono ? p.recuperacao : ''), linha('WhatsApp', p.whatsapp), linha('Empresa', p.empresa),
      linha('Membro desde', fmt(p.criadoEm)));
    const acesso = h('section', { class: 'ct-cartao', 'aria-labelledby': 'ct-acesso-t' }, h('h2', { id: 'ct-acesso-t' }, 'Seu acesso'),
      linha('Papel', p.papelRotulo), linha('Seções', p.secoes.join(', ') || '—'), linha('Validade', p.expiraEm ? `até ${fmtData(p.expiraEm)}` : 'sem prazo'), linha('Situação', null, selo(p.estado)));
    app.append(cartaoDados, acesso);
    if (!dono) { app.append(h('p', { class: 'ct-dica' }, 'Só o Dono altera os dados de acesso. Para mudar um contato, fale com ele.')); return; }

    const campos = { nome: p.nome, empresa: p.empresa, email: p.email, whatsapp: p.whatsapp, recuperacao: p.recuperacao };
    const inp = (nome, rotulo, tipo = 'text', extra = {}) => h('label', {}, rotulo, h('input', { name: nome, type: tipo, value: campos[nome] || '', autocomplete: 'off', ...extra }));
    const cod = blocoCodigo('contato');
    cod.el.hidden = true;
    const form = h('form', { class: 'ct-form', novalidate: true },
      h('div', { class: 'ct-dupla' }, inp('nome', 'Nome', 'text', { maxlength: '60' }), inp('empresa', 'Empresa', 'text', { maxlength: '60' })),
      h('div', { class: 'ct-dupla' }, inp('email', 'E-mail principal', 'email'), inp('whatsapp', 'WhatsApp (com DDD)', 'text', { inputmode: 'tel' })),
      inp('recuperacao', 'E-mail de recuperação', 'email'), cod.el,
      h('div', { class: 'ct-acoes' }, h('button', { type: 'submit', class: 'btn btn--primary' }, 'Salvar')));
    const mudouContato = () => ['email', 'whatsapp', 'recuperacao'].some((n) => form.elements[n].value.trim() !== (campos[n] || ''));
    form.addEventListener('input', () => { cod.el.hidden = !mudouContato(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const corpo = Object.fromEntries(['nome', 'empresa', 'email', 'whatsapp', 'recuperacao'].map((n) => [n, form.elements[n].value.trim()]));
      if (mudouContato()) corpo.codigo = cod.valor();
      const r2 = await api('POST', '/perfil', corpo);
      if (r2.ok) { aviso('Dados salvos.'); telaInfo(); } else aviso(r2.j.erro || 'Não foi possível salvar.', 'erro');
    });
    app.append(h('section', { class: 'ct-cartao', 'aria-labelledby': 'ct-edit-t' }, h('h2', { id: 'ct-edit-t' }, 'Editar dados do Dono'), form));
    if (emergencia) app.append(h('p', { class: 'ct-dica' }, `Senha de emergência: ${emergencia.ativa ? 'ativa' : 'desligada'}. Veja em Segurança.`));
  }

  // ---------- Compartilhamento de acesso ----------
  const SECOES_LISTA = [['visao', 'Visão geral'], ['loja', 'Loja'], ['infra', 'Infraestrutura'], ['servidores', 'Servidores'], ['dyno', 'Dyno AI'], ['conta', 'Conta']];
  const rotuloSecao = Object.fromEntries(SECOES_LISTA);
  const PAPEIS_UI = [['admin', 'Administrador', 'Vê e executa ações nas seções liberadas; não gere acessos.'], ['leitura', 'Somente leitura', 'Vê painéis e logs das seções liberadas; não executa nenhuma ação.']];

  // formulário de pessoa (convite e edição). `p` = dados atuais (edição) ou null.
  const formPessoa = (p, aoEnviar, rotuloBotao) => {
    const f = h('form', { class: 'ct-form', novalidate: true });
    const nome = h('input', { name: 'nome', type: 'text', maxlength: '60', autocomplete: 'off', value: p?.nome || '' });
    const email = h('input', { name: 'email', type: 'email', autocomplete: 'off', value: p?.email || '' });
    const whats = h('input', { name: 'whatsapp', type: 'text', inputmode: 'tel', autocomplete: 'off', placeholder: '11 99999-9999', value: p?.whatsapp || '' });
    const validade = h('input', { name: 'expiraEm', type: 'date', value: p?.expiraEm || '' });
    const papeis = h('fieldset', { class: 'ct-papeis' }, h('legend', {}, 'Papel'), PAPEIS_UI.map(([v, t, d]) => h('label', { class: 'ct-opcao' }, h('input', { type: 'radio', name: 'papel', value: v, checked: (p?.papel || 'leitura') === v }), h('span', {}, h('strong', {}, t), h('small', {}, d)))));
    const secoes = h('fieldset', { class: 'ct-secoes' }, h('legend', {}, 'Seções liberadas'), SECOES_LISTA.map(([v, t]) => h('label', { class: 'ct-check' }, h('input', { type: 'checkbox', name: 'secoes', value: v, checked: p ? p.secoes.includes(v) : true }), t)));
    const erro = h('p', { class: 'ct-erro', role: 'alert', hidden: true });
    f.append(h('label', {}, 'Nome', nome), h('div', { class: 'ct-dupla' }, h('label', {}, 'E-mail', email), h('label', {}, 'WhatsApp', whats)), papeis, secoes,
      h('label', {}, 'Validade do acesso (opcional)', validade, h('small', { class: 'ct-dica' }, 'Na data escolhida o acesso acaba sozinho. Deixe em branco para não ter prazo.')), erro,
      h('div', { class: 'ct-acoes' }, h('button', { type: 'submit', class: 'btn btn--primary' }, rotuloBotao)));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const corpo = { nome: nome.value.trim(), email: email.value.trim(), whatsapp: whats.value.trim(), papel: f.elements.papel.value, secoes: [...f.querySelectorAll('input[name=secoes]:checked')].map((i) => i.value), expiraEm: validade.value };
      const r = await aoEnviar(corpo);
      erro.hidden = !r || r.ok; if (r && !r.ok) erro.textContent = r.j.erro || 'Não foi possível salvar.';
    });
    return f;
  };

  async function telaAcessos() {
    app.replaceChildren(...titulo('Compartilhamento de acesso', 'Dê acesso ao painel a outras pessoas, com um papel e as seções que elas podem ver. Quem recebe o convite entra com um código enviado ao contato cadastrado: nenhuma senha é criada.'));
    const abas = h('div', { class: 'adm-abas', role: 'tablist' });
    const painel = h('div', { class: 'ct-painel' });
    app.append(abas, painel);
    let dados = null, aba = 'lista';
    const recarregar = async () => { const r = await api('GET', '/acessos'); if (r.ok) dados = r.j; else aviso('Não foi possível carregar os acessos.', 'erro'); desenhar(); };
    const desenharAbas = () => {
      abas.replaceChildren(...[['dar', 'Dar acesso'], ['lista', `Pessoas com acesso${dados ? ` (${dados.usuarios.length}/${dados.max})` : ''}`]].map(([id, t]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(aba === id), onclick: () => { aba = id; desenhar(); } }, t)));
    };
    const desenhar = () => { desenharAbas(); painel.replaceChildren(aba === 'dar' ? abaDar() : abaLista()); };

    const abaDar = () => {
      if (dados && dados.usuarios.length >= dados.max) return h('p', { class: 'ct-vazio' }, `Limite de ${dados.max} acessos atingido. Exclua alguém para convidar outra pessoa.`);
      return h('section', { class: 'ct-cartao' }, h('h2', {}, 'Dar acesso a alguém'), formPessoa(null, async (corpo) => {
        const r = await api('POST', '/acessos', corpo);
        if (r.ok) { aviso(`Acesso concedido a ${r.j.usuario.nome}. Convite enviado por ${r.j.convite.map((c) => (c === 'email' ? 'e-mail' : 'WhatsApp')).join(' e ') || 'nenhum canal'}.`); aba = 'lista'; await recarregar(); }
        return r;
      }, 'Dar acesso e enviar convite'));
    };

    const abaLista = () => {
      const lista = dados?.usuarios || [];
      const vazio = lista.every((p) => p.ehDono);
      return h('div', {}, h('ul', { class: 'ct-pessoas' }, lista.map(cartaoPessoa)),
        vazio ? h('div', { class: 'ct-vazio', id: 'ct-vazio' }, h('strong', {}, 'Nada encontrado'), h('p', {}, 'Mais ninguém tem acesso ao painel. Use a aba “Dar acesso” para convidar alguém.')) : null);
    };
    const cartaoPessoa = (p) => {
      const contato = [p.email, p.whatsapp].filter(Boolean).join(' · ');
      const acoes = p.ehDono ? [h('span', { class: 'ct-dica' }, 'O Dono não pode ser alterado nem excluído.')] : [
        h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => editar(p) }, 'Editar'),
        p.estado === 'suspenso' ? h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => agir(p, 'reativar', 'Acesso reativado.') }, 'Reativar') : h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => agir(p, 'suspender', 'Acesso suspenso.') }, 'Suspender'),
        p.estado === 'convite' ? h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => agir(p, 'reenviar', 'Convite reenviado.') }, 'Reenviar convite') : null,
        h('button', { type: 'button', class: 'btn btn--ghost ct-perigo', onclick: () => excluir(p) }, 'Excluir')
      ];
      return h('li', { class: 'ct-pessoa', 'data-id': p.id },
        h('div', { class: 'ct-pessoa-topo' }, h('div', {}, h('strong', {}, p.nome), h('small', {}, contato || 'sem contato')), selo(p.estado)),
        h('dl', { class: 'ct-meta' },
          h('div', {}, h('dt', {}, 'Papel'), h('dd', {}, p.papelRotulo)),
          h('div', {}, h('dt', {}, 'Seções'), h('dd', {}, p.secoes.map((s) => rotuloSecao[s] || s).join(', '))),
          h('div', {}, h('dt', {}, 'Último acesso'), h('dd', {}, fmt(p.ultimoAcesso))),
          h('div', {}, h('dt', {}, 'Validade'), h('dd', {}, p.expiraEm ? `até ${fmtData(p.expiraEm)}` : 'sem prazo'))),
        h('div', { class: 'ct-acoes' }, acoes));
    };
    const agir = async (p, acao, ok) => {
      const r = await api('POST', `/acessos/${p.id}/${acao}`, {});
      aviso(r.ok ? ok : r.j.erro || 'Não foi possível concluir.', r.ok ? 'ok' : 'erro');
      await recarregar();
    };
    const editar = async (p) => {
      const c = await api('GET', `/acessos/${p.id}`);
      if (!c.ok) return aviso(c.j.erro || 'Não foi possível abrir.', 'erro');
      let dlg;
      const f = formPessoa(c.j.usuario, async (corpo) => {
        const r = await api('POST', `/acessos/${p.id}/editar`, corpo);
        if (r.ok) { dlg.fechar(); aviso('Acesso atualizado.'); await recarregar(); }
        return r;
      }, 'Salvar');
      dlg = dialogo(`Editar ${p.nome}`, f);
    };
    const excluir = (p) => {
      const cod = blocoCodigo(`excluir:${p.id}`);
      const nome = h('input', { type: 'text', autocomplete: 'off', 'aria-label': `Digite ${p.nome}` });
      const erro = h('p', { class: 'ct-erro', role: 'alert', hidden: true });
      let dlg;
      const f = h('form', { class: 'ct-form' }, h('p', {}, `Excluir remove o acesso de ${p.nome} e encerra as sessões dele agora. Não dá para desfazer (um novo convite cria outro acesso).`),
        h('label', {}, `Para confirmar, digite o nome: ${p.nome}`, nome), cod.el, erro,
        h('div', { class: 'ct-acoes' }, h('button', { type: 'submit', class: 'btn btn--primary ct-perigo-solido' }, 'Excluir acesso'), h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => dlg.fechar() }, 'Cancelar')));
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const r = await api('POST', `/acessos/${p.id}/excluir`, { confirmaNome: nome.value, codigo: cod.valor() });
        if (r.ok) { dlg.fechar(); aviso(`Acesso de ${p.nome} excluído.`); await recarregar(); } else { erro.textContent = r.j.erro || 'Não foi possível excluir.'; erro.hidden = false; }
      });
      dlg = dialogo(`Excluir ${p.nome}?`, f);
    };
    await recarregar();
  }

  // ---------- Segurança ----------
  async function telaSeguranca() {
    app.replaceChildren(...titulo('Segurança', 'Como o login do painel funciona, por onde cada pessoa recebe o código e a senha de emergência.'));
    const r = await api('GET', '/seguranca');
    if (!r.ok) return aviso('Não foi possível carregar a segurança.', 'erro');
    const s = r.j;
    app.append(h('section', { class: 'ct-cartao' }, h('h2', {}, 'Como está o login'),
      linha('Entrada', `Código de ${s.codigo.digitos} números por e-mail e/ou WhatsApp; nenhuma senha`),
      linha('Validade do código', `${s.codigo.validadeMin} minutos, uso único, ${s.codigo.tentativas} erros invalidam`),
      linha('Envios', `1 a cada ${s.codigo.reenvioS} s e até ${s.codigo.porHora} por hora para cada contato`),
      linha('Limites por IP', `${s.limites.pedidosPorIp} pedidos de código e ${s.limites.errosPorIp} erros bloqueiam o IP por ${s.limites.bloqueioMin} min`),
      linha('Sessão', `${s.sessaoHoras} horas; cookie ${s.cookie}`),
      linha('Mensagens a outras pessoas', s.envio.assinado ? 'assinadas (convites habilitados)' : 'sem assinatura: convites desligados')));

    const tabela = h('div', { class: 'ct-pessoas-canais' });
    for (const p of s.pessoas) {
      const email = h('input', { type: 'checkbox', checked: p.canais.includes('email'), disabled: !p.temEmail });
      const whats = h('input', { type: 'checkbox', checked: p.canais.includes('whatsapp'), disabled: !p.temWhatsapp });
      tabela.append(h('div', { class: 'ct-canais-linha' }, h('strong', {}, p.nome, ' ', h('small', {}, p.papel === 'dono' ? '(Dono)' : '')),
        h('label', { class: 'ct-check' }, email, 'E-mail'), h('label', { class: 'ct-check' }, whats, 'WhatsApp'),
        h('button', { type: 'button', class: 'btn btn--ghost', onclick: async () => {
          const canais = [email.checked && 'email', whats.checked && 'whatsapp'].filter(Boolean);
          const r2 = await api('POST', '/seguranca/canais', { id: p.id, canais });
          aviso(r2.ok ? `Canais de ${p.nome} atualizados.` : r2.j.erro || 'Não foi possível salvar.', r2.ok ? 'ok' : 'erro');
        } }, 'Salvar')));
    }
    app.append(h('section', { class: 'ct-cartao' }, h('h2', {}, 'Canais do código de cada pessoa'), h('p', { class: 'ct-dica' }, 'O código só vai para os contatos cadastrados, pelos canais marcados aqui.'), tabela));

    const e = s.emergencia;
    const botao = h('button', { type: 'button', class: 'btn btn--ghost ct-perigo', onclick: () => confirmarEmergencia(e.ativa) }, e.ativa ? 'Desligar a senha de emergência…' : 'Religar a senha de emergência…');
    app.append(h('section', { class: 'ct-cartao' }, h('h2', {}, 'Senha de emergência'),
      linha('Situação', null, h('span', { class: `ct-selo ct-selo--${e.ativa ? 'ativo' : 'suspenso'}` }, e.ativa ? 'Ativa' : 'Desligada')),
      h('p', { class: 'ct-dica' }, 'Em /admin/emergencia a senha antiga ainda abre uma sessão do Dono. O combinado é manter até 06/11/2026; depois, desligue aqui (e, de vez, no arquivo do nginx, como explica o README).'),
      !e.arquivoLigado ? h('p', { class: 'ct-dica' }, 'O nginx já está sem a senha antiga (arquivo vazio).') : null, e.arquivoLigado ? botao : null));
  }
  function confirmarEmergencia(ativa) {
    const cod = blocoCodigo('emergencia');
    const palavra = ativa ? 'DESLIGAR' : 'LIGAR';
    const campo = h('input', { type: 'text', autocomplete: 'off', 'aria-label': `Digite ${palavra}` });
    const erro = h('p', { class: 'ct-erro', role: 'alert', hidden: true });
    let dlg;
    const f = h('form', { class: 'ct-form' }, h('p', {}, ativa ? 'Sem a senha de emergência, quem perder o acesso aos códigos só volta pelo e-mail de recuperação. Tem certeza?' : 'A senha antiga voltará a abrir /admin/emergencia.'),
      h('label', {}, `Digite ${palavra} para confirmar`, campo), cod.el, erro,
      h('div', { class: 'ct-acoes' }, h('button', { type: 'submit', class: 'btn btn--primary' }, 'Confirmar'), h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => dlg.fechar() }, 'Cancelar')));
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const r = await api('POST', '/seguranca/emergencia', { ligar: !ativa, confirmacao: campo.value.trim(), codigo: cod.valor() });
      if (r.ok) { dlg.fechar(); aviso(ativa ? 'Senha de emergência desligada.' : 'Senha de emergência religada.'); telaSeguranca(); } else { erro.textContent = r.j.erro || 'Não foi possível confirmar.'; erro.hidden = false; }
    });
    dlg = dialogo(ativa ? 'Desligar a senha de emergência' : 'Religar a senha de emergência', f);
  }

  // ---------- Atividades da conta ----------
  async function telaAtividades() {
    app.replaceChildren(...titulo('Atividades da conta', 'Você pode encerrar a sessão de qualquer dispositivo que tenha entrado na sua conta.'));
    const eu = (await api('GET', '/eu')).j;
    const ehDono = !!eu.ehDono;
    let todas = false, lista = [], busca = '', ordem = { campo: 'loginAtual', dir: -1 }, pagina = 1, tamanho = 5;
    const reconhece = h('button', { type: 'button', class: 'btn btn--ghost', id: 'ct-desconhece', onclick: async () => {
      if (!confirm('Encerrar todas as outras sessões desta conta?')) return;
      const r = await api('POST', '/sessoes/encerrar', { outras: true });
      aviso(r.ok ? `${r.j.encerradas} sessão(ões) encerrada(s).` : 'Não foi possível encerrar.', r.ok ? 'ok' : 'erro');
      carregar();
    } }, 'Não reconhece um dispositivo?');
    const campoBusca = h('input', { type: 'search', placeholder: 'Buscar por país, dispositivo, IP…', 'aria-label': 'Buscar', oninput: (e) => { busca = e.target.value.trim().toLowerCase(); pagina = 1; desenhar(); } });
    const todasChk = ehDono ? h('label', { class: 'ct-check' }, h('input', { type: 'checkbox', onchange: (e) => { todas = e.target.checked; carregar(); } }), 'Mostrar as sessões de todas as pessoas') : null;
    const corpo = h('div', { class: 'ct-tabela' });
    app.append(h('div', { class: 'ct-cartao' }, h('p', {}, 'Não reconhece um dispositivo? Encerre todas as outras sessões de uma vez.'), reconhece),
      h('div', { class: 'ct-barra' }, campoBusca, todasChk), corpo);
    const COLUNAS = [['loginAtual', 'Login atual'], ['dispositivo', 'Dispositivo'], ['pais', 'Localização'], ['primeiroLogin', 'Primeiro login'], ['tipo', 'Tipo de login']];
    const texto = (s) => `${s.pessoa} ${s.dispositivo} ${s.navegador} ${s.ip} ${s.pais} ${s.tipo}`.toLowerCase();
    const carregar = async () => { const r = await api('GET', `/sessoes${todas ? '?todas=1' : ''}`); if (r.ok) { lista = r.j.sessoes; pagina = 1; desenhar(); } else aviso('Não foi possível carregar as sessões.', 'erro'); };
    const desenhar = () => {
      const filtrada = lista.filter((s) => !busca || texto(s).includes(busca)).sort((a, b) => { const x = a[ordem.campo], y = b[ordem.campo]; return (x > y ? 1 : x < y ? -1 : 0) * ordem.dir; });
      const total = filtrada.length, paginas = Math.max(1, Math.ceil(total / tamanho));
      pagina = Math.min(pagina, paginas);
      const fatia = filtrada.slice((pagina - 1) * tamanho, pagina * tamanho);
      const th = (c, t) => h('th', { 'aria-sort': ordem.campo === c ? (ordem.dir > 0 ? 'ascending' : 'descending') : 'none' }, h('button', { type: 'button', onclick: () => { ordem = { campo: c, dir: ordem.campo === c ? -ordem.dir : -1 }; desenhar(); } }, t));
      const tabela = h('table', { class: 'adm-tabela ct-sessoes' },
        h('thead', {}, h('tr', {}, todas ? h('th', {}, h('span', { class: 'ct-th' }, 'Pessoa')) : null, COLUNAS.map(([c, t]) => th(c, t)), h('th', {}, h('span', { class: 'ct-th' }, 'Sessão')))),
        h('tbody', {}, fatia.length ? fatia.map((s) => h('tr', {},
          todas ? h('td', {}, s.pessoa) : null,
          h('td', {}, fmt(s.loginAtual)), h('td', {}, s.dispositivo, h('small', {}, s.navegador)),
          h('td', {}, s.pais || 'não identificado', h('small', {}, s.ip)), h('td', {}, fmt(s.primeiroLogin)), h('td', {}, s.tipo),
          h('td', {}, s.atual ? h('span', { class: 'ct-selo ct-selo--ativo' }, 'Sessão atual') : s.ativa ? h('button', { type: 'button', class: 'btn btn--ghost', onclick: async () => { const r = await api('POST', '/sessoes/encerrar', { ref: s.ref }); aviso(r.ok ? 'Sessão encerrada.' : r.j.erro || 'Não foi possível encerrar.', r.ok ? 'ok' : 'erro'); carregar(); } }, 'Encerrar') : h('span', { class: 'ct-dica' }, 'Encerrada')))) : h('tr', {}, h('td', { colspan: '7', class: 'ct-vazio' }, 'Nada encontrado'))));
      const tam = h('select', { 'aria-label': 'Tamanho da página', onchange: (e) => { tamanho = Number(e.target.value); pagina = 1; desenhar(); } }, [5, 10, 25].map((n) => h('option', { value: n, selected: n === tamanho }, n)));
      const de = total ? (pagina - 1) * tamanho + 1 : 0, ate = Math.min(total, pagina * tamanho);
      corpo.replaceChildren(h('div', { class: 'adm-tabela-wrap' }, tabela),
        h('div', { class: 'ct-pag' }, h('label', {}, 'Tamanho da página ', tam), h('span', { class: 'ct-pag-info' }, `${de} para ${ate} de ${total}`),
          h('span', { class: 'ct-pag-nav' }, h('button', { type: 'button', class: 'btn btn--ghost', disabled: pagina <= 1, 'aria-label': 'Página anterior', onclick: () => { pagina--; desenhar(); } }, '‹'), h('b', {}, `Página ${pagina} de ${paginas}`), h('button', { type: 'button', class: 'btn btn--ghost', disabled: pagina >= paginas, 'aria-label': 'Próxima página', onclick: () => { pagina++; desenhar(); } }, '›'))));
    };
    await carregar();

    if (ehDono) { // registro de auditoria das ações de administração
      const r = await api('GET', '/auditoria');
      const ev = r.ok ? r.j.eventos : [];
      app.append(h('h2', { class: 'ct-sub' }, 'Auditoria das ações de administração'), h('div', { class: 'adm-tabela-wrap' }, h('table', { class: 'adm-tabela ct-aud' },
        h('thead', {}, h('tr', {}, ['Quando', 'Quem', 'Ação', 'Pessoa', 'Detalhe'].map((t) => h('th', {}, h('span', { class: 'ct-th' }, t))))),
        h('tbody', {}, ev.length ? ev.map((e) => h('tr', {}, h('td', {}, fmt(e.em)), h('td', {}, e.quem), h('td', {}, e.acao), h('td', {}, e.alvo || '—'), h('td', {}, e.detalhe || ''))) : h('tr', {}, h('td', { colspan: '5', class: 'ct-vazio' }, 'Nada encontrado'))))));
    }
  }

  const telas = { info: telaInfo, acessos: telaAcessos, seguranca: telaSeguranca, atividades: telaAtividades };
  (telas[tela] || telaInfo)().catch(() => aviso('Não foi possível carregar esta tela.', 'erro'));
})();
