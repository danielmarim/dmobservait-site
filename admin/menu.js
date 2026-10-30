/* Menu do /admin: grupos que abrem e fecham (estado lembrado no navegador) e gaveta no celular. */
(() => {
  const CHAVE = 'dm-admin-menu-grupos';
  const ler = () => { try { return JSON.parse(localStorage.getItem(CHAVE)) || {}; } catch { return {}; } };
  const gravar = (e) => { try { localStorage.setItem(CHAVE, JSON.stringify(e)); } catch {} };
  const nav = document.getElementById('adm-menu');
  if (!nav) return;
  const estado = ler();

  const abrirGrupo = (li, abrir) => {
    li.querySelector('.adm-item--grupo').setAttribute('aria-expanded', String(abrir));
    li.querySelector('.adm-filhos').hidden = !abrir;
  };
  nav.querySelectorAll('.adm-grupo').forEach((li) => {
    const id = li.dataset.grupo;
    // o grupo da página atual fica sempre aberto; os demais seguem o que foi lembrado
    abrirGrupo(li, li.classList.contains('tem-ativo') || estado[id] === true);
    li.querySelector('.adm-item--grupo').addEventListener('click', () => {
      const abrir = li.querySelector('.adm-item--grupo').getAttribute('aria-expanded') !== 'true';
      abrirGrupo(li, abrir);
      estado[id] = abrir;
      gravar(estado);
    });
  });

  // gaveta (largura até 960 px): o botão abre; Esc, o fundo e a escolha de um link fecham
  const botao = document.querySelector('.adm-gaveta');
  const fundo = document.querySelector('.adm-fundo');
  if (!botao) return;
  const gaveta = () => document.documentElement.classList.contains('adm-gaveta-aberta');
  const definir = (abrir, devolverFoco) => {
    document.documentElement.classList.toggle('adm-gaveta-aberta', abrir);
    botao.setAttribute('aria-expanded', String(abrir));
    botao.setAttribute('aria-label', abrir ? 'Fechar o menu' : 'Abrir o menu');
    if (fundo) fundo.hidden = !abrir;
    if (abrir) (nav.querySelector('.adm-item.is-ativo, .adm-rail-item.is-ativo') || nav.querySelector('a, button'))?.focus({ preventScroll: true });
    else if (devolverFoco) botao.focus({ preventScroll: true });
  };
  botao.addEventListener('click', () => definir(!gaveta(), true));
  fundo?.addEventListener('click', () => definir(false, true));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && gaveta()) { e.preventDefault(); definir(false, true); } });
  window.matchMedia('(min-width: 961px)').addEventListener('change', (e) => { if (e.matches && gaveta()) definir(false, false); });
})();
