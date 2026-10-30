// Menu móvel -------------------------------------------------------------
const header = document.querySelector('.header');
const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('#navigation');
const setMenu = (open) => {
  if (!toggle || !nav) return;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  nav.classList.toggle('open', open);
};
const isOpen = () => toggle?.getAttribute('aria-expanded') === 'true';
toggle?.addEventListener('click', () => setMenu(!isOpen()));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isOpen()) { setMenu(false); toggle.focus(); }
});
document.addEventListener('click', (e) => {
  if (isOpen() && !header.contains(e.target)) setMenu(false);
});
window.matchMedia('(max-width:960px)').addEventListener('change', (e) => { if (!e.matches) setMenu(false); });

// Revelação ao rolar: sem JS ou sem IntersectionObserver, o conteúdo já aparece visível (a classe .js só é aplicada com JS).
const revealables = document.querySelectorAll('[data-reveal]');
if ('IntersectionObserver' in window && revealables.length) {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('is-in'); io.unobserve(entry.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  revealables.forEach((el) => io.observe(el));
} else {
  revealables.forEach((el) => el.classList.add('is-in'));
}

// Navegação interna (Soluções): destaca a seção visível.
const subnavLinks = [...document.querySelectorAll('.subnav a[href^="#"]')];
if (subnavLinks.length && 'IntersectionObserver' in window) {
  const sections = subnavLinks.map((a) => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
  const mark = (id) => subnavLinks.forEach((a) => (a.getAttribute('href') === `#${id}` ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
  const spy = new IntersectionObserver((entries) => {
    const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) mark(visible.target.id);
  }, { rootMargin: '-30% 0px -55% 0px', threshold: [0, 0.1, 0.5, 1] });
  sections.forEach((s) => spy.observe(s));
}

// Abas de ferramentas (padrão WAI-ARIA): setas, Home e End trocam a aba; #ferramenta-<id> abre a aba correspondente.
// Sem JS, a lista de abas fica oculta e todos os painéis aparecem um abaixo do outro.
document.querySelectorAll('.tools').forEach((root) => {
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));
  const select = (i, focus = false) => {
    tabs.forEach((t, j) => { const on = i === j; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; panels[j].hidden = !on; });
    if (focus) { tabs[i].focus(); tabs[i].scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(i));
    tab.addEventListener('keydown', (e) => {
      const next = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
      if (next !== undefined) { e.preventDefault(); select(next, true); }
    });
  });
  const fromHash = () => {
    const i = panels.findIndex((p) => `#${p.id}` === location.hash);
    if (i >= 0) { select(i); root.closest('section').scrollIntoView({ block: 'start' }); }
    return i;
  };
  // ?ferramenta=<id> (usado pelos links da página inicial) escolhe a aba; a âncora #ferramentas posiciona a seção.
  const fromQuery = () => panels.findIndex((p) => p.id === `ferramenta-${new URLSearchParams(location.search).get('ferramenta')}`);
  const initial = fromQuery();
  if (initial >= 0) select(initial); else if (fromHash() < 0) select(0);
  window.addEventListener('hashchange', fromHash);
});

// Formulário de contato ----------------------------------------------------
// Sem endpoint configurado: apenas prepara a mensagem (copiar / abrir no e-mail ou WhatsApp).
// Com endpoint: envia e só informa sucesso quando o servidor confirma (resposta 2xx).
const form = document.querySelector('#contact-form');
if (form) {
  const { email, whatsapp, endpoint } = form.dataset;
  const status = document.querySelector('#form-status');
  const prepared = document.querySelector('#prepared');
  const output = document.querySelector('#message-output');
  const setStatus = (text, error = false) => { status.textContent = text; status.classList.toggle('is-error', error); };

  const requested = new URLSearchParams(location.search).get('area');
  if ([...form.elements.area.options].some((o) => o.value === requested)) form.elements.area.value = requested;

  const compose = (data) => {
    const company = String(data.get('company') || '').trim();
    return `¡Hola, equipo de DM ObservaIT!\n\nMi nombre es ${String(data.get('name')).trim()}.${company ? `\nEmpresa: ${company}` : ''}\nÁrea de interés: ${data.get('area')}\n\n${String(data.get('message')).trim()}`;
  };
  const showPrepared = (message, area) => {
    output.value = message;
    prepared.hidden = false;
    const mail = document.querySelector('#send-email');
    if (mail && email) mail.href = `mailto:${email}?subject=${encodeURIComponent(`Contacto desde el sitio — ${area}`)}&body=${encodeURIComponent(message)}`;
    const wa = document.querySelector('#send-whatsapp');
    if (wa && whatsapp) wa.href = `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    if (data.get('_gotcha')) return; // campo-armadilha preenchido por robô
    const message = compose(data);
    const area = String(data.get('area'));

    if (!endpoint) {
      showPrepared(message, area);
      // 29/10/2026: com WhatsApp configurado, o envio abre a conversa já com a mensagem (antes era preciso um segundo clique).
      // window.open roda antes de qualquer await, ainda dentro do clique, para o navegador não bloquear a nova aba.
      if (whatsapp) {
        window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
        setStatus('Abrimos WhatsApp con su mensaje listo: solo toque en enviar allí. Si no se abrió, use los botones de abajo.');
        return;
      }
      setStatus(email || whatsapp ?'Mensaje preparado. Todavía no se envió nada: use los botones de abajo para enviarlo.' : 'Mensaje preparado. No se envió ningún dato.');
      output.focus();
      return;
    }

    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    form.setAttribute('aria-busy', 'true');
    setStatus('Enviando…');
    try {
      const res = await fetch(endpoint, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      form.reset();
      prepared.hidden = true;
      setStatus('Mensaje enviado. Gracias por contactarnos.');
    } catch {
      showPrepared(message, area);
      setStatus('No fue posible enviar ahora. Su mensaje se conservó abajo: cópielo o use los canales de contacto.', true);
    } finally {
      submit.disabled = false;
      form.removeAttribute('aria-busy');
    }
  });

  document.querySelector('#copy-message').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(output.value);
      setStatus('Mensaje copiado.');
    } catch {
      output.focus();
      output.select();
      setStatus('Seleccione y copie el texto con el comando de copiar de su dispositivo.');
    }
  });
}

// Ao abrir a página já com âncora (#secao), reposiciona quando as fontes terminam de carregar,
// pois a troca de fonte altera a altura do conteúdo acima do alvo.
if (location.hash && document.fonts) {
  const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
  // painéis de ferramentas: rola até a seção inteira, para as abas ficarem visíveis
  const anchor = target?.closest('.tools') ? target.closest('section') : target;
  if (anchor) document.fonts.ready.then(() => anchor.scrollIntoView({ block: 'start', behavior: 'instant' }));
}
