// Abas "Mapa Infraestrutura" (/admin/infra/) e "Dyno AI" (/admin/dyno/) do painel interno.
// Este script é PÚBLICO (vai para o repositório do site) e NÃO tem nenhum dado: servidores, containers, ligações, agentes
// e stacks vêm de ../dados.json (protegido por senha no nginx; origem em admin/infra.mjs e admin/dyno-ai.mjs, cifrados
// em dist/_servidor/admin/dados.enc). Tudo é desenhado aqui a partir desses dados: SVG, animação, filtros e painel.
// Sem bibliotecas (a CSP do site só permite scripts do próprio domínio).
(async () => {
  const raiz = document.querySelector('[data-mapa]');
  if (!raiz) return;
  const qual = raiz.dataset.mapa;
  const aviso = document.getElementById('mp-status');
  const conteudo = document.getElementById('mp-conteudo');
  let dados;
  try {
    const r = await fetch('../dados.json', { cache: 'no-store', credentials: 'same-origin' });
    if (!r.ok) throw new Error(`resposta ${r.status}`);
    dados = await r.json();
  } catch (e) {
    aviso.textContent = `Não foi possível carregar os dados do painel (${e.message}). Recarregue a página ou confira o deploy.`;
    return;
  }
  const D = qual === 'infra' ? dados.infra : dados.dynoAi;
  if (!D) { aviso.textContent = 'Os dados desta aba ainda não chegaram ao servidor: rode o build, publique e recrie o projeto (README, "Mapa Infraestrutura").'; return; }
  aviso.hidden = true;
  conteudo.hidden = false;
  document.getElementById('mp-atualizado').textContent = D.atualizadoEm;

  // ---------- utilidades ----------
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const por = (lista) => Object.fromEntries(lista.map((x) => [x.id, x]));
  const linhas = (x, y, txt, cls, passo = 14, anchor = '', max = 0) => String(txt).split('\n').map((l, i) =>
    `<text class="${cls}" x="${x}" y="${y + i * passo}"${anchor ? ` text-anchor="${anchor}"` : ''}${max ? ` data-max="${max}"` : ''}>${esc(l)}</text>`).join('');
  const caminho = (pts) => 'M' + pts.map((p) => p.join(' ')).join(' L');
  const dist = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
  const marcadores = (pref) => `<defs>${['dados', 'repasse', 'copia', 'alerta'].map((e) => `<marker id="${pref}-m-${e}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" class="mp-mk mp-mk--${e}"/></marker>`).join('')}</defs>`;
  const ESTILOS = { dados: 'Fluxo de dados', repasse: 'Repasse', copia: 'Cópia ou réplica', alerta: 'Alerta', ...(D.estilos || {}) };

  // seta com pontos animados (SMIL) e área de clique larga. d = caminho SVG, len = comprimento aproximado
  const seta = ({ pref, id, de, para, d, len, estilo = 'dados', fluxo = true, confirmar = false, rotulo = '', rot, ciclo, classe = '' }) => {
    const dur = Math.min(6.5, Math.max(2.4, len / 80));
    const pontos = fluxo === false ? '' : (ciclo
      ? `<circle class="mp-ponto mp-ponto--${estilo}" r="3.4" opacity="0"><animateMotion dur="${ciclo.total}s" repeatCount="indefinite" calcMode="linear" keyPoints="0;0;1;1" keyTimes="0;${ciclo.a.toFixed(4)};${ciclo.b.toFixed(4)};1" path="${d}"/><animate attributeName="opacity" dur="${ciclo.total}s" repeatCount="indefinite" values="0;0;1;1;0;0" keyTimes="0;${ciclo.a.toFixed(4)};${(ciclo.a + 0.001).toFixed(4)};${(ciclo.b - 0.001).toFixed(4)};${ciclo.b.toFixed(4)};1"/></circle>`
      : [0, 1].map((i) => `<circle class="mp-ponto mp-ponto--${estilo}" r="3.2"><animateMotion dur="${dur.toFixed(1)}s" begin="${(-i * dur / 2).toFixed(1)}s" repeatCount="indefinite" path="${d}"/></circle>`).join(''));
    return `<g class="mp-lig mp-lig--${estilo}${fluxo === false ? ' mp-lig--parada' : ''}${confirmar ? ' mp-lig--confirmar' : ''}${classe ? ` ${classe}` : ''}" data-lig="${esc(id)}" data-de="${esc(de)}" data-para="${esc(para)}" tabindex="0" role="button" aria-label="Ligação: ${esc(rotulo.replace(/\n/g, ' ') || id)}">` +
      `<path class="mp-lig-linha" d="${d}" marker-end="url(#${pref}-m-${estilo})"/><path class="mp-lig-alvo" d="${d}"/>` +
      (rotulo && rot ? linhas(rot.x, rot.y, rotulo + (confirmar ? ' ?' : ''), 'mp-rot', 13, rot.anchor || 'middle') : '') + pontos + '</g>';
  };

  // reduz o texto que passaria da caixa (roda depois de inserido, quando dá para medir)
  const ajustar = (host) => host.querySelectorAll('text[data-max]').forEach((t) => {
    const max = Number(t.dataset.max);
    try { if (t.getComputedTextLength() > max) { t.setAttribute('textLength', max); t.setAttribute('lengthAdjust', 'spacingAndGlyphs'); } } catch { /* sem layout */ }
  });

  // ---------- controlador: seleção, filtros, painel, endereço #id ----------
  function controlador(cfg) {
    const { host, painel, relacionados, htmlPainel, visNo, visLig, vazio, existe } = cfg;
    let sel = null;
    const aplicar = () => {
      const rel = sel ? relacionados(sel) : null;
      host.classList.toggle('mp-tem-selecao', !!rel);
      host.querySelectorAll('[data-no]').forEach((el) => {
        const id = el.dataset.no;
        el.classList.toggle('mp-filtrado', !visNo(id));
        el.classList.toggle('mp-sel', !!sel && sel.tipo === 'no' && sel.id === id);
        el.classList.toggle('mp-rel', !!rel && rel.nos.has(id));
        el.setAttribute('aria-pressed', String(!!sel && sel.tipo === 'no' && sel.id === id));
      });
      host.querySelectorAll('[data-lig]').forEach((el) => {
        const id = el.dataset.lig;
        el.classList.toggle('mp-filtrado', !visLig(id));
        el.classList.toggle('mp-sel', !!sel && sel.tipo === 'lig' && sel.id === id);
        el.classList.toggle('mp-rel', !!rel && rel.ligs.has(id));
        el.setAttribute('aria-pressed', String(!!sel && sel.tipo === 'lig' && sel.id === id));
      });
    };
    const selecionar = (s, rolar = false) => {
      sel = s;
      painel.innerHTML = s ? htmlPainel(s) : vazio;
      aplicar();
      try { history.replaceState(null, '', s ? `#${encodeURIComponent(s.id)}` : location.pathname + location.search); } catch { /* ignora */ }
      if (rolar && s) painel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    host.addEventListener('click', (e) => {
      const el = e.target.closest('[data-no],[data-lig]');
      if (!el) return selecionar(null);
      selecionar(el.dataset.no ? { tipo: 'no', id: el.dataset.no } : { tipo: 'lig', id: el.dataset.lig });
    });
    host.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-no],[data-lig]')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
      if (e.key === 'Escape') selecionar(null);
    });
    painel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ir]');
      if (b) { const [t, ...id] = b.dataset.ir.split(':'); selecionar({ tipo: t, id: id.join(':') }); }
      if (e.target.closest('[data-limpar]')) selecionar(null);
    });
    painel.innerHTML = vazio;
    aplicar();
    const h = decodeURIComponent(location.hash.slice(1));
    if (h) { const s = existe(h); if (s) selecionar(s); }
    return { selecionar, aplicar };
  }

  const legendaStatus = (mapa, pref) => `<ul class="mp-legenda">${Object.entries(mapa).map(([k, v]) => `<li><i class="mp-sw mp-sw--${k}"></i>${esc(v)}</li>`).join('')}</ul>`;
  const secao = (id, titulo, corpo) => `<section class="mp-secao" id="${id}" aria-labelledby="${id}-t"><h2 id="${id}-t">${esc(titulo)}</h2>${corpo}</section>`;
  const tabela = (cab, linhasTab) => `<div class="mp-rolagem mp-rolagem--tabela"><table class="mp-tabela"><thead><tr>${cab.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${linhasTab.join('')}</tbody></table></div>`;
  const pausaHTML = '<button type="button" class="btn btn--ghost mp-pausa" id="mp-pausa" aria-pressed="false">Pausar animação</button>';
  const ligarPausa = () => {
    const b = document.getElementById('mp-pausa');
    if (!b) return;
    b.addEventListener('click', () => {
      const p = raiz.classList.toggle('mp-sem-animacao');
      b.setAttribute('aria-pressed', String(p));
      b.textContent = p ? 'Retomar animação' : 'Pausar animação';
    });
  };
  const chipsStatus = (nome, opcoes, contagem) => `<div class="mp-chips" role="group" aria-label="${esc(nome)}">${opcoes.map(([v, t]) => `<button type="button" class="mp-chip${v === 'todos' ? ' mp-chip--on' : ''}" data-valor="${esc(v)}" aria-pressed="${v === 'todos'}">${esc(t)} <b>${contagem(v)}</b></button>`).join('')}</div>`;
  const ligarChips = (el, aoMudar) => el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-valor]');
    if (!b) return;
    el.querySelectorAll('[data-valor]').forEach((x) => { const on = x === b; x.classList.toggle('mp-chip--on', on); x.setAttribute('aria-pressed', String(on)); });
    aoMudar(b.dataset.valor);
  });
  const badge = (mapa, st) => (st && mapa[st] ? `<span class="mp-badge mp-badge--${esc(st)}">${esc(mapa[st])}</span>` : '');
  const irBtn = (alvo, texto) => `<button type="button" class="mp-ir" data-ir="${esc(alvo)}">${texto}</button>`;

  // =====================================================================================
  //  MAPA DA INFRAESTRUTURA
  // =====================================================================================
  if (qual === 'infra') {
    const srvMap = por(D.servidores), ctMap = por(D.containers), exMap = por(D.externos), ligMap = por(D.ligacoes);
    const servidorDe = (id) => (srvMap[id] ? id : ctMap[id] ? ctMap[id].servidor : null);
    const nomeDe = (id) => (srvMap[id] || ctMap[id] || exMap[id] || {}).nome || id;
    const caixas = {};
    for (const e of D.externos) caixas[e.id] = { x: e.x, y: e.y, w: e.w, h: 32 };
    for (const s of D.servidores) {
      const cs = D.containers.filter((c) => c.servidor === s.id);
      const cols = s.colunas || 1, padX = cols > 1 ? 12 : 16, gap = 8, cw = (s.w - 2 * padX - (cols - 1) * gap) / cols, ch = cols > 1 ? 46 : 44;
      let fim = s.y + s.inicioY;
      cs.forEach((c, i) => {
        caixas[c.id] = { x: s.x + padX + (i % cols) * (cw + gap), y: s.y + s.inicioY + Math.floor(i / cols) * (ch + 8), w: cw, h: ch };
        fim = Math.max(fim, caixas[c.id].y + ch);
      });
      const n = (s.specs || []).length;
      caixas[s.id] = { x: s.x, y: s.y, w: s.w, h: (n ? fim + 22 + (n - 1) * 18 + 18 : fim + 16) - s.y };
    }
    const alturaTotal = Math.max(...Object.values(caixas).map((c) => c.y + c.h)) + 30;
    const larguraTotal = Math.max(...Object.values(caixas).map((c) => c.x + c.w)) + 10;
    const rotuloStatus = D.status;

    const geometria = (l) => {
      const A = caixas[l.de], B = caixas[l.para];
      if (l.rota === 'entrada') {
        const x = A.x + A.w / 2;
        return { pts: [[x, A.y + A.h + 2], [x, B.y - 2]] };
      }
      if (l.rota === 'L') {
        const yFim = B.y + B.h / 2, S = caixas[servidorDe(l.para)];
        const xFim = S.x > l.x ? S.x - 2 : S.x + S.w + 2;
        return { pts: [[l.x, A.y + A.h + 2], [l.x, yFim], [xFim, yFim]], rot: { x: (l.x + xFim) / 2, y: yFim - 8 } };
      }
      const dir = A.x < B.x;
      const x1 = dir ? A.x + A.w + 2 : A.x - 2, x2 = dir ? B.x - 2 : B.x + B.w + 2;
      const duas = String(l.rotulo || '').includes('\n');
      return { pts: [[x1, l.y], [x2, l.y]], rot: { x: (x1 + x2) / 2, y: l.y - (duas ? 22 : 8) } };
    };

    const desenhar = () => {
      const pref = 'mi';
      const srv = D.servidores.map((s) => {
        const c = caixas[s.id], estreita = s.w < 300;
        const nuvem = s.forma === 'nuvem';
        let t = '';
        if (nuvem && s.etiqueta) t += `<text class="mp-nuvem" x="${c.x + c.w / 2}" y="${c.y - 10}" text-anchor="middle">${esc(s.etiqueta)}</text>`;
        t += `<rect class="mp-srv${s.destaque ? ' mp-srv--destaque' : ''}${nuvem ? ' mp-srv--nuvem' : ''}" x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="${nuvem ? 26 : 8}"/>`;
        t += `<text class="mp-t${s.destaque ? ' mp-t--ac' : ''}" x="${c.x + 14}" y="${c.y + 22}">${esc(s.nome)}</text>`;
        const sub = [s.papel, s.ip].filter(Boolean).join(' · ');
        if (estreita) {
          if (sub) t += `<text class="mp-s" x="${c.x + 14}" y="${c.y + 38}" data-max="${c.w - 28}">${esc(sub)}</text>`;
          if (s.projeto) t += `<text class="mp-s" x="${c.x + 14}" y="${c.y + 54}" data-max="${c.w - 28}">${esc(s.projeto)}</text>`;
        } else if (sub) t += `<text class="mp-s" x="${c.x + 14 + s.nome.length * 8.6 + 10}" y="${c.y + 22}" data-max="${c.w - 28 - s.nome.length * 8.6 - 10}">${esc(sub)}</text>`;
        const ultimo = D.containers.filter((x) => x.servidor === s.id).map((x) => caixas[x.id].y + caixas[x.id].h).reduce((a, b) => Math.max(a, b), 0);
        (s.specs || []).forEach((txt, i) => { t += `<text class="mp-s" x="${c.x + 14}" y="${ultimo + 22 + i * 18}" data-max="${c.w - 28}">${esc(txt)}</text>`; });
        return `<g class="mp-no mp-no--servidor" data-no="${esc(s.id)}" tabindex="0" role="button" aria-label="Servidor ${esc(s.nome)}">${t}</g>`;
      }).join('');
      const cts = D.containers.map((c) => {
        const b = caixas[c.id];
        return `<g class="mp-no mp-no--container" data-no="${esc(c.id)}" data-servidor="${esc(c.servidor)}" data-status="${esc(c.status)}" tabindex="0" role="button" aria-label="${esc(c.nome)}, ${esc(srvMap[c.servidor].nome)}, ${esc(rotuloStatus[c.status] || c.status)}"><rect class="mp-c mp-c--${esc(c.status)}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="5"/>${linhas(b.x + 10, b.y + 19, c.nome, 'mp-cn', 14, '', b.w - 18)}${linhas(b.x + 10, b.y + 35, c.desc || '', 'mp-cr', 14, '', b.w - 18)}</g>`;
      }).join('');
      const exs = D.externos.map((e) => `<g class="mp-no mp-no--externo" data-no="${esc(e.id)}" tabindex="0" role="button" aria-label="${esc(e.nome)}"><rect class="mp-ex" x="${e.x}" y="${e.y}" width="${e.w}" height="32" rx="5"/><text class="mp-cn" x="${e.x + e.w / 2}" y="${e.y + 20}" text-anchor="middle">${esc(e.nome)}</text></g>`).join('');
      const ligs = D.ligacoes.map((l) => {
        const g = geometria(l);
        return seta({ pref, id: l.id, de: l.de, para: l.para, d: caminho(g.pts), len: dist(g.pts), estilo: l.estilo, fluxo: l.fluxo, rotulo: l.rotulo, rot: g.rot });
      }).join('');
      return `<svg viewBox="0 0 ${larguraTotal} ${alturaTotal}" role="group" aria-label="${esc(D.mapaTitulo || D.titulo)}" class="mp-svg">${marcadores(pref)}${D.entradaRotulo ? `<text class="mp-s" x="10" y="18">${esc(D.entradaRotulo)}</text>` : ''}${srv}${ligs}${cts}${exs}</svg>`;
    };

    const nContainers = D.containers.length;
    const contagem = (st) => (st === 'todos' ? nContainers : D.containers.filter((c) => c.status === st).length);
    const mapaHTML = `${D.mapaIntro ? `<p class="mp-intro">${esc(D.mapaIntro)}</p>` : ''}
<div class="mp-controles">
<label class="mp-campo">Servidor<select id="mp-srv"><option value="todos">Todos os servidores</option>${D.servidores.map((s) => `<option value="${esc(s.id)}">${esc(s.nome)}</option>`).join('')}</select></label>
${chipsStatus('Filtrar por status', [['todos', 'Todos'], ...Object.entries(rotuloStatus).map(([k, v]) => [k, v])], contagem)}
${pausaHTML}</div>
<p class="mp-contador" id="mp-contador" role="status"></p>
<div class="mp-painel" id="mp-painel" aria-live="polite"></div>
<div class="mp-rolagem" id="mp-host" tabindex="-1">${desenhar()}</div>
<p class="mp-dica">Deslize para o lado dentro do desenho no celular. Esc limpa a seleção.</p>
${legendaStatus(rotuloStatus)}
<ul class="mp-legenda mp-legenda--linhas">${Object.entries(ESTILOS).map(([k, v]) => `<li><i class="mp-traco mp-traco--${k}"></i>${esc(v)}</li>`).join('')}</ul>
${D.aviso ? `<p class="mp-nota">${esc(D.aviso)}</p>` : ''}`;

    // ---------- demais seções ----------
    const quem = D.quem;
    const desenharQuem = () => {
      const pref = 'mq', cx = por(quem.colunas);
      const caixasQ = quem.colunas.map((c) => {
        let t = `<rect class="mp-srv${c.destaque ? ' mp-srv--destaque' : ''}" x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="6"/>`;
        if (c.centro) {
          t += `<text class="mp-t" x="${c.x + c.w / 2}" y="${c.y + 40}" text-anchor="middle">${esc(c.nome)}</text>` + linhas(c.x + c.w / 2, c.y + 62, (c.linhas || []).join('\n'), 'mp-s', 16, 'middle');
        } else {
          t += `<text class="mp-t${c.destaque ? ' mp-t--ac' : ''}" x="${c.x + 16}" y="${c.y + 30}">${esc(c.nome)}</text>`;
          if (c.sub) t += `<text class="mp-s" x="${c.x + 16}" y="${c.y + 48}" data-max="${c.w - 28}">${esc(c.sub)}</text>`;
          let y = c.y + 90;
          for (const it of c.itens || []) {
            t += `<text class="mp-i" x="${c.x + 16}" y="${y}" data-max="${c.w - 28}">${esc(it[0])}</text>`;
            if (it[1]) t += `<text class="mp-s" x="${c.x + 16}" y="${y + 16}" data-max="${c.w - 28}">${esc(it[1])}</text>`;
            y += it[1] ? 44 : 32;
          }
          t += linhas(c.x + 16, c.y + c.h - 10 - ((c.rodape || []).length - 1) * 16, (c.rodape || []).join('\n'), 'mp-s', 16, '', c.w - 28);
        }
        return `<g class="mp-no" data-no="${esc(c.id)}" tabindex="0" role="button" aria-label="${esc(c.nome)}">${t}</g>`;
      }).join('');
      const setas = quem.setas.map((s, i) => {
        const A = cx[s.de], B = cx[s.para], dir = A.x < B.x;
        const x1 = dir ? A.x + A.w + 2 : A.x - 2, x2 = dir ? B.x - 2 : B.x + B.w + 2;
        return seta({ pref, id: `q${i}`, de: s.de, para: s.para, d: caminho([[x1, s.y], [x2, s.y]]), len: Math.abs(x2 - x1), estilo: s.estilo, rotulo: s.rotulo, rot: { x: (x1 + x2) / 2, y: s.y - (String(s.rotulo || '').includes('\n') ? 22 : 8) } });
      }).join('');
      const larg = Math.max(...quem.colunas.map((c) => c.x + c.w)) + 10, alt = Math.max(...quem.colunas.map((c) => c.y + c.h)) + 40;
      return `<svg viewBox="0 0 ${larg} ${alt}" role="group" aria-label="${esc(quem.titulo)}" class="mp-svg mp-svg--medio" id="mq-svg">${marcadores(pref)}${caixasQ}${setas}</svg>`;
    };

    const sequencia = (f, idx) => {
      const pref = `ms${idx}`, n = f.atores.length, x0 = 140, x1 = 860;
      const ax = {};
      f.atores.forEach((a, i) => { ax[a.id] = n === 1 ? 500 : x0 + (i * (x1 - x0)) / (n - 1); });
      const y0 = 104, passo = 52, alt = y0 + f.passos.length * passo + 24, total = f.passos.length * 1.4;
      const atores = f.atores.map((a) => `<g><rect class="mp-ator${a.destaque ? ' mp-ator--destaque' : ''}" x="${ax[a.id] - 90}" y="14" width="180" height="48" rx="6"/><text class="mp-t${a.destaque ? ' mp-t--ac' : ''}" x="${ax[a.id]}" y="35" text-anchor="middle">${esc(a.nome)}</text><text class="mp-s" x="${ax[a.id]}" y="52" text-anchor="middle" data-max="164">${esc(a.sub || '')}</text><line class="mp-vida" x1="${ax[a.id]}" y1="62" x2="${ax[a.id]}" y2="${alt - 14}"/></g>`).join('');
      const ultimo = f.atores[n - 1].id;
      const passos = f.passos.map((p, i) => {
        const y = y0 + i * passo, rotulo = `${i + 1}  ${p.texto}`;
        if (p.de === p.para) {
          const x = ax[p.de], esq = p.de === ultimo;
          return `<g class="mp-passo"><rect class="mp-ativ" x="${x - 6}" y="${y - 8}" width="12" height="40" rx="2"/><text class="mp-rot" x="${esq ? x - 16 : x + 16}" y="${y + 16}" text-anchor="${esq ? 'end' : 'start'}">${esc(rotulo)}</text></g>`;
        }
        const dir = ax[p.de] < ax[p.para], xa = ax[p.de] + (dir ? 6 : -6), xb = ax[p.para] + (dir ? -6 : 6);
        return seta({ pref, id: `${pref}-${i}`, de: p.de, para: p.para, d: caminho([[xa, y + 8], [xb, y + 8]]), len: Math.abs(xb - xa), estilo: p.estilo, rotulo, rot: { x: (xa + xb) / 2, y: y - 2 }, ciclo: { total: total.toFixed(1), a: i / f.passos.length, b: (i + 0.85) / f.passos.length } });
      }).join('');
      return `<svg viewBox="0 0 1000 ${alt}" role="img" aria-label="${esc(f.titulo)}: ${esc(f.passos.map((p, i) => `${i + 1} ${p.texto}`).join('; '))}" class="mp-svg mp-svg--medio">${marcadores(pref)}${atores}${passos}</svg>`;
    };

    const capacidade = () => {
      const C = D.capacidade, X0 = 180, X1 = 960, k = (X1 - X0) / C.max;
      let t = '';
      for (let v = 0; v <= C.max; v += 50) t += `<line class="mp-grade" x1="${X0 + v * k}" y1="40" x2="${X0 + v * k}" y2="268"/><text class="mp-rot mp-rot--m" x="${X0 + v * k}" y="284" text-anchor="middle">${v}</text>`;
      C.barras.forEach((b, i) => {
        const y = 66 + i * 120, cls = b.destaque ? 'ac' : 'mu';
        t += `<text class="mp-t${b.destaque ? ' mp-t--ac' : ''}" x="10" y="${y + 18}">${esc(b.nome)}</text><text class="mp-s" x="10" y="${y + 36}">${esc(b.sub)}</text><text class="mp-s" x="10" y="${y + 52}">${esc(b.specs)}</text>` +
          `<rect class="mp-b-teto mp-b-teto--${cls}" x="${X0 + b.folga * k}" y="${y}" width="${(b.teto - b.folga) * k}" height="34"/><rect class="mp-b-folga mp-b-folga--${cls}" x="${X0 + b.hoje * k}" y="${y}" width="${(b.folga - b.hoje) * k}" height="34"/><rect class="mp-b-hoje mp-b-hoje--${cls}" x="${X0}" y="${y}" width="${b.hoje * k}" height="34"/>` +
          `<text class="mp-rot" x="${X0 + 2}" y="${y + 56}">${esc(b.hojeRotulo)}</text><text class="mp-rot" x="${X0 + b.folga * k}" y="${y + 56}" text-anchor="middle">${esc(b.folgaRotulo)}</text><text class="mp-rot mp-rot--m" x="${X0 + b.teto * k}" y="${y + 56}" text-anchor="${b.teto >= C.max ? 'end' : 'middle'}">${esc(b.tetoRotulo)}</text>`;
      });
      t += `<line class="mp-eixo" x1="${X0}" y1="268" x2="${X1}" y2="268"/><text class="mp-s" x="${(X0 + X1) / 2}" y="303" text-anchor="middle">${esc(C.eixoRotulo)}</text>`;
      return `<svg viewBox="0 0 1000 312" role="img" aria-label="${esc(C.titulo)}: ${esc(C.barras.map((b) => `${b.nome}, ${b.hojeRotulo}, ${b.folgaRotulo}, ${b.tetoRotulo}`).join('; '))}" class="mp-svg mp-svg--medio">${t}</svg>`;
    };

    const limites = D.capacidade.limites.map((l) => `<div class="mp-col"><h3>${esc(l.titulo)}</h3><ol>${l.itens.map(([a, b]) => `<li><b>${esc(a)}</b> ${esc(b)}</li>`).join('')}</ol>${l.nota ? `<p class="mp-nota">${esc(l.nota)}</p>` : ''}</div>`).join('');

    conteudo.innerHTML = `
${D.resumo ? `<p class="mp-resumo">${esc(D.resumo)}</p>` : ''}
${D.contexto ? `<p class="mp-contexto">${esc(D.titulo)} · atualizado em ${esc(D.atualizadoEm)} · ${esc(D.contexto)}</p>` : ''}
<nav class="mp-indice" aria-label="Seções desta aba"><a href="#mapa">Mapa</a><a href="#quem">Quem fala com quem</a><a href="#funcao">Caminho de uma função</a><a href="#gravacao">Gravação direta</a><a href="#capacidade">Capacidade</a><a href="#mudou">O que mudou</a><a href="#backups">Backups</a><a href="#etapas">Próximas etapas</a></nav>
${secao('mapa', D.mapaTitulo || 'Mapa da infraestrutura', mapaHTML)}
${secao('quem', quem.titulo, `<div class="mp-rolagem">${desenharQuem()}</div><ul class="mp-legenda mp-legenda--linhas">${quem.legenda.map(([k, v]) => `<li><i class="mp-traco mp-traco--${k}"></i>${esc(v)}</li>`).join('')}</ul><p class="mp-nota">${esc(quem.legendaTexto)}</p>`)}
${D.fluxos.map((f, i) => secao(f.id, f.titulo, `<p class="mp-intro">${esc(f.intro)}</p><div class="mp-rolagem">${sequencia(f, i)}</div><p class="mp-nota">${esc(f.legenda)}</p>`)).join('')}
${secao('capacidade', D.capacidade.titulo, `<p class="mp-intro">${esc(D.capacidade.intro)}</p><div class="mp-rolagem">${capacidade()}</div><p class="mp-nota">${esc(D.capacidade.nota)}</p><div class="mp-cols">${limites}</div><p class="mp-nota">${esc(D.capacidade.notaFinal)}</p>`)}
${secao('mudou', 'O que mudou e o que não mudou', tabela(['Peça', 'Onde roda hoje', 'Mudou?'], D.mudancas.map((m) => `<tr><td>${esc(m.peca)}</td><td>${esc(m.onde)}</td><td><span class="mp-tag${m.mudou ? ' mp-tag--novo' : ''}">${m.mudou ? 'sim' : 'não'}</span></td></tr>`)))}
${secao('backups', 'Backups e reserva', tabela(['O quê', 'Situação', 'Próximo passo'], D.backups.map((b) => `<tr><td>${esc(b.o)}</td><td>${b.tag ? `<span class="mp-tag mp-tag--${esc(b.tag)}">${esc(b.tagTexto)}</span> ` : ''}${esc(b.situacao)}</td><td>${esc(b.proximo)}</td></tr>`)))}
${secao('etapas', 'Próximas etapas', `<ol class="mp-etapas">${D.etapas.map((e) => `<li class="mp-etapa${e.feita ? ' mp-etapa--feita' : ''}"><b>${esc(e.nome)}</b>${esc(e.texto)}</li>`).join('')}</ol><ul class="mp-comandos">${D.comandos.map((c) => `<li>${esc(c.para)}: <code>${esc(c.cmd)}</code></li>`).join('')}</ul>`)}
<p class="mp-nota">Fonte: ${esc(D.fonte)}. Para atualizar, edite <code>admin/infra.mjs</code>, rode <code>node build.mjs</code> e publique (README, "Mapa Infraestrutura").</p>`;

    const host = document.getElementById('mp-host'), painel = document.getElementById('mp-painel');
    ajustar(conteudo);

    const f = { srv: 'todos', st: 'todos' };
    const visNo = (id) => {
      const c = ctMap[id];
      if (c) return (f.srv === 'todos' || c.servidor === f.srv) && (f.st === 'todos' || c.status === f.st);
      if (srvMap[id]) return f.srv === 'todos' || f.srv === id;
      return f.srv === 'todos' || f.srv === 'hostinger';
    };
    const visLig = (id) => {
      const l = ligMap[id];
      const srvs = [servidorDe(l.de), servidorDe(l.para)];
      if (f.srv !== 'todos' && !(srvs.includes(f.srv) || (!srvs[0] && f.srv === servidorDe(l.para)))) return false;
      if (f.st !== 'todos' && l.usa && l.usa.length && !l.usa.some((x) => ctMap[x] && ctMap[x].status === f.st)) return false;
      return true;
    };
    const ligsDe = (id) => D.ligacoes.filter((l) => l.de === id || l.para === id || (l.usa || []).includes(id));
    const relacionados = (sel) => {
      const nos = new Set(), ligs = new Set(), addNo = (x) => { if (!x) return; nos.add(x); const s = servidorDe(x); if (s) nos.add(s); };
      if (sel.tipo === 'lig') {
        const l = ligMap[sel.id];
        ligs.add(l.id); [l.de, l.para, ...(l.usa || [])].forEach(addNo);
      } else if (srvMap[sel.id]) {
        nos.add(sel.id); D.containers.filter((c) => c.servidor === sel.id).forEach((c) => nos.add(c.id));
        D.ligacoes.filter((l) => servidorDe(l.de) === sel.id || servidorDe(l.para) === sel.id).forEach((l) => { ligs.add(l.id); addNo(l.de); addNo(l.para); });
      } else {
        nos.add(sel.id); const s = servidorDe(sel.id); if (s) nos.add(s);
        let ls = ligsDe(sel.id);
        if (!ls.length && s) ls = D.ligacoes.filter((l) => servidorDe(l.de) === s || servidorDe(l.para) === s);
        ls.forEach((l) => { ligs.add(l.id); addNo(l.de); addNo(l.para); (l.usa || []).forEach(addNo); });
      }
      return { nos, ligs };
    };
    const botaoLig = (l) => irBtn(`lig:${l.id}`, `${esc(nomeDe(l.de))} → ${esc(nomeDe(l.para))}${l.rotulo ? ` <small>(${esc(l.rotulo.replace(/\n/g, ' '))})</small>` : ''}`);
    const htmlPainel = (sel) => {
      let h = '';
      if (sel.tipo === 'lig') {
        const l = ligMap[sel.id];
        h = `<h3>${esc(nomeDe(l.de))} → ${esc(nomeDe(l.para))}</h3><p class="mp-sub">${esc((l.rotulo || '').replace(/\n/g, ' ') || 'Ligação')} · ${esc(ESTILOS[l.estilo] || l.estilo)}${l.fluxo === false ? ' · sem tráfego animado (planejada, parada ou sem uso)' : ''}</p><p>${esc(l.detalhe || '')}</p>`;
        const us = (l.usa || []).filter((x) => ctMap[x]);
        if (us.length) h += `<h4>Containers que participam</h4><p>${us.map((x) => irBtn(`no:${x}`, esc(ctMap[x].nome))).join(' ')}</p>`;
        h += `<p>${irBtn(`no:${servidorDe(l.de) || l.de}`, esc(nomeDe(servidorDe(l.de) || l.de)))} ${irBtn(`no:${servidorDe(l.para) || l.para}`, esc(nomeDe(servidorDe(l.para) || l.para)))}</p>`;
      } else if (srvMap[sel.id]) {
        const s = srvMap[sel.id], cs = D.containers.filter((c) => c.servidor === s.id);
        h = `<h3>${esc(s.nome)} <small class="mp-sub-i">${esc([s.papel, s.ip].filter(Boolean).join(' · '))}</small></h3>` +
          (s.projeto ? `<p class="mp-sub">Projeto: ${esc(s.projeto)}</p>` : '') +
          `<p>${esc(s.detalhe || '')}</p><p class="mp-sub">${(s.specs || []).map(esc).join(' · ')}${s.verificado ? ` · ${esc(s.verificado)}` : ''}</p>` +
          `<h4>Containers (${cs.length})</h4><p>${cs.map((c) => `<button type="button" class="mp-ir mp-ir--${esc(c.status)}" data-ir="no:${esc(c.id)}">${esc(c.nome)}</button>`).join(' ')}</p>` +
          `<h4>Ligações</h4><ul class="mp-lista">${D.ligacoes.filter((l) => servidorDe(l.de) === s.id || servidorDe(l.para) === s.id).map((l) => `<li>${botaoLig(l)}</li>`).join('')}</ul>`;
      } else if (exMap[sel.id]) {
        const e = exMap[sel.id];
        h = `<h3>${esc(e.nome)}</h3><p>${esc(e.detalhe || '')}</p><ul class="mp-lista">${ligsDe(e.id).map((l) => `<li>${botaoLig(l)}</li>`).join('')}</ul>`;
      } else if (ctMap[sel.id]) {
        const c = ctMap[sel.id], s = srvMap[c.servidor], ls = ligsDe(c.id);
        h = `<h3>${esc(c.nome)} ${badge(rotuloStatus, c.status)}</h3><p class="mp-sub">Servidor ${irBtn(`no:${s.id}`, esc(s.nome))}${s.ip ? ` · ${esc(s.ip)}` : ''} · ${esc(c.desc || '')}</p><p>${esc(c.detalhe || '')}</p>` +
          (ls.length ? `<h4>Ligações</h4><ul class="mp-lista">${ls.map((l) => `<li>${botaoLig(l)}</li>`).join('')}</ul>` : `<p class="mp-sub">Sem ligação própria no desenho: as setas em destaque são as do servidor ${esc(s.nome)}.</p>`);
      }
      return h + '<p><button type="button" class="btn btn--ghost mp-limpar" data-limpar>Limpar seleção</button></p>';
    };
    const vazio = '<p class="mp-vazio">Clique num servidor, num container ou numa seta: as ligações ficam em destaque e os detalhes aparecem aqui.</p>';
    const ctl = controlador({ host, painel, relacionados, htmlPainel, visNo, visLig, vazio, existe: (id) => (srvMap[id] || ctMap[id] || exMap[id] ? { tipo: 'no', id } : ligMap[id] ? { tipo: 'lig', id } : null) });

    const contador = document.getElementById('mp-contador');
    const atualizarContador = () => {
      const vis = D.containers.filter((c) => visNo(c.id)).length;
      contador.textContent = `Mostrando ${vis} de ${nContainers} containers.`;
    };
    atualizarContador();
    document.getElementById('mp-srv').addEventListener('change', (e) => { f.srv = e.target.value; ctl.aplicar(); atualizarContador(); });
    ligarChips(conteudo.querySelector('.mp-chips'), (v) => { f.st = v; ctl.aplicar(); atualizarContador(); });
    ligarPausa();
    return;
  }

  // =====================================================================================
  //  DYNO AI
  // =====================================================================================
  const nosMap = por(D.nos), ligMap = por(D.ligacoes), camMap = por(D.camadas);
  const ROT = D.status;
  const LINHA = 114, ALTO = 62, TOPO = 40;
  const caixas = {};
  D.camadas.forEach((c, i) => { c.y = TOPO + i * LINHA; });
  for (const n of D.nos) caixas[n.id] = { x: n.x - n.w / 2, y: camMap[n.camada].y, w: n.w, h: ALTO };
  const idxCamada = Object.fromEntries(D.camadas.map((c, i) => [c.y, i]));
  const larguraTotal = Math.max(...D.nos.map((n) => n.x + n.w / 2)) + 24;
  const alturaTotal = TOPO + D.camadas.length * LINHA - 20;

  // pontos de ancoragem espalhados por lado, para as setas não saírem do mesmo ponto
  const ancoras = {};
  const lado = (l) => { const A = caixas[l.de], B = caixas[l.para]; return A.y === B.y ? 'mesma' : A.y < B.y ? 'desce' : 'sobe'; };
  const grupos = {};
  for (const l of D.ligacoes) {
    const m = lado(l), A = caixas[l.de], B = caixas[l.para];
    const sa = m === 'sobe' ? 't' : 'b', sb = m === 'sobe' ? 'b' : m === 'mesma' ? 't' : 't';
    const ta = m === 'mesma' ? 't' : sa;
    (grupos[`${l.de}:${ta}`] ||= []).push({ l, ponta: 'a', outro: B.x + B.w / 2 });
    (grupos[`${l.para}:${sb}`] ||= []).push({ l, ponta: 'b', outro: A.x + A.w / 2 });
  }
  for (const [k, lista] of Object.entries(grupos)) {
    const [id] = k.split(':'), c = caixas[id];
    lista.sort((p, q) => p.outro - q.outro);
    lista.forEach((it, i) => { ancoras[`${it.l.id}:${it.ponta}`] = c.x + (c.w * (i + 1)) / (lista.length + 1); });
  }
  const geometriaDyno = (l) => {
    const A = caixas[l.de], B = caixas[l.para], m = lado(l);
    const xa = ancoras[`${l.id}:a`], xb = ancoras[`${l.id}:b`];
    if (m === 'mesma') {
      const y = A.y, alto = 44;
      return { d: `M${xa} ${y} C${xa} ${y - alto} ${xb} ${y - alto} ${xb} ${y - 2}`, len: Math.abs(xb - xa) + 80, rot: { x: (xa + xb) / 2, y: y - alto * 0.75 - 4 } };
    }
    const ya = m === 'desce' ? A.y + A.h : A.y, yb = m === 'desce' ? B.y - 2 : B.y + B.h + 2, ym = (ya + yb) / 2;
    const pt = (t) => ({ x: (1 - t) ** 3 * xa + 3 * (1 - t) ** 2 * t * xa + 3 * (1 - t) * t * t * xb + t ** 3 * xb, y: (1 - t) ** 3 * ya + 3 * (1 - t) ** 2 * t * ym + 3 * (1 - t) * t * t * ym + t ** 3 * yb });
    const alvoY = ya + (m === 'desce' ? 26 : -26);
    let melhor = 0.2, dif = 1e9;
    for (let t = 0.05; t <= 0.95; t += 0.01) { const p = pt(t), df = Math.abs(p.y - alvoY); if (df < dif) { dif = df; melhor = t; } }
    const p = pt(melhor);
    return { d: `M${xa} ${ya} C${xa} ${ym} ${xb} ${ym} ${xb} ${yb}`, len: Math.hypot(xb - xa, yb - ya) * 1.1, rot: { x: p.x + 4, y: p.y, anchor: 'start' } };
  };

  const desenharDyno = () => {
    const pref = 'md';
    const faixas = D.camadas.map((c, i) => `<rect class="mp-faixa${i % 2 ? ' mp-faixa--b' : ''}" x="0" y="${c.y - 24}" width="${larguraTotal}" height="${LINHA - 6}" rx="8"/><text class="mp-camada" x="10" y="${c.y - 10}">${esc(c.nome.toUpperCase())}</text>`).join('');
    const ligs = D.ligacoes.map((l) => {
      const g = geometriaDyno(l);
      return seta({ pref, id: l.id, de: l.de, para: l.para, d: g.d, len: g.len, estilo: l.estilo, fluxo: l.fluxo, confirmar: !!l.confirmar, rotulo: l.rotulo, rot: g.rot, classe: Math.abs(idxCamada[caixas[l.de].y] - idxCamada[caixas[l.para].y]) > 1 ? 'mp-lig--longa' : '' });
    }).join('');
    const nos = D.nos.map((n) => {
      const b = caixas[n.id];
      return `<g class="mp-no mp-no--${esc(n.tipo)}" data-no="${esc(n.id)}" data-status="${esc(n.status)}" data-tipo="${esc(n.tipo)}" tabindex="0" role="button" aria-label="${esc(n.nome)}, ${esc(ROT[n.status] || 'estrutura')}">` +
        `<rect class="mp-n mp-n--${esc(n.status)}${n.tipo === 'ia' ? ' mp-n--ia' : ''}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10"/>` +
        `<text class="mp-cn mp-cn--g" x="${b.x + b.w / 2}" y="${b.y + 24}" text-anchor="middle" data-max="${b.w - 20}">${esc(n.nome)}</text>` +
        `<text class="mp-cr" x="${b.x + b.w / 2}" y="${b.y + 40}" text-anchor="middle" data-max="${b.w - 20}">${esc(n.sub || '')}</text>` +
        (ROT[n.status] ? `<text class="mp-est mp-est--${esc(n.status)}" x="${b.x + b.w / 2}" y="${b.y + 55}" text-anchor="middle">${esc(ROT[n.status])}</text>` : '') + '</g>';
    }).join('');
    return `<svg viewBox="0 0 ${larguraTotal} ${alturaTotal}" role="group" aria-label="${esc(D.titulo)}" class="mp-svg mp-svg--dyno">${marcadores(pref)}${faixas}${ligs}${nos}</svg>`;
  };

  const contN = (st) => (st === 'todos' ? D.nos.length : D.nos.filter((n) => n.status === st).length);
  const tiposUsados = [...new Set(D.nos.map((n) => n.tipo))];
  const mapaHTML = `<p class="mp-intro">Cada caixa é uma peça do ecossistema; a cor mostra o status verificado. Clique numa caixa ou numa seta para destacar as ligações e ver os detalhes. Setas com "?" são ligações a confirmar.</p>
<div class="mp-controles">
<label class="mp-campo">Tipo<select id="mp-tipo"><option value="todos">Todos os tipos</option>${tiposUsados.map((t) => `<option value="${esc(t)}">${esc(D.tipos[t] || t)}</option>`).join('')}</select></label>
${chipsStatus('Filtrar por status', [['todos', 'Todos'], ...Object.entries(ROT)], contN)}
${pausaHTML}</div>
<p class="mp-contador" id="mp-contador" role="status"></p>
<div class="mp-painel" id="mp-painel" aria-live="polite"></div>
<div class="mp-rolagem" id="mp-host" tabindex="-1">${desenharDyno()}</div>
<p class="mp-dica">Deslize para o lado dentro do desenho no celular. Esc limpa a seleção.</p>
<ul class="mp-legenda">${Object.entries(ROT).map(([k, v]) => `<li><i class="mp-sw mp-sw--d-${k}"></i>${esc(v)} <small>${esc((D.statusAjuda || {})[k] || '')}</small></li>`).join('')}</ul>
<ul class="mp-legenda mp-legenda--linhas">${Object.entries(ESTILOS).filter(([k]) => k !== 'alerta').map(([k, v]) => `<li><i class="mp-traco mp-traco--${k}"></i>${k === 'repasse' ? 'Ligação principal de IA ou dos dados do Business' : k === 'copia' ? 'Cópia' : v}</li>`).join('')}<li><i class="mp-traco mp-traco--conf"></i>A confirmar</li></ul>
${D.aviso ? `<p class="mp-nota">${esc(D.aviso)}</p>` : ''}`;

  const agentes = D.nos.filter((n) => n.tipo === 'ia' || n.tipo === 'persona' || n.tipo === 'agente');
  const listaChips = (itens) => (itens && itens.length ? `<ul class="mp-itens">${itens.map(([st, t]) => `<li>${badge(ROT, st)} ${esc(t)}</li>`).join('')}</ul>` : '');
  const lacunasNos = D.nos.filter((n) => (n.aconfirmar && n.aconfirmar.length) || n.status === 'confirmar');
  const grupoStacks = [...new Set(D.stacks.map((s) => s.grupo))];

  conteudo.innerHTML = `
${D.resumo ? `<p class="mp-resumo">${esc(D.resumo)}</p>` : ''}
<nav class="mp-indice" aria-label="Seções desta aba"><a href="#mapa">Camadas e ligações</a><a href="#agentes">Agentes</a><a href="#solucoes">Soluções do Business</a><a href="#stacks">Stacks</a><a href="#confirmar">A confirmar</a></nav>
${secao('mapa', 'Camadas e ligações', mapaHTML)}
${secao('agentes', 'Agentes e personas', `<p class="mp-intro">O Dyno AI é o motor; Dyno e Dina são personas do DynoApp; o atendimento de leads e a prospecção ativa são agentes do Dyno Sales. Ferramentas e pontos em aberto vêm dos documentos; o que não está lá fica como "a confirmar".</p>` +
    tabela(['Agente', 'Papel', 'Ferramentas e canais', 'Status', 'A confirmar'], agentes.map((n) => `<tr id="ag-${esc(n.id)}"><td><button type="button" class="mp-ir" data-ver="${esc(n.id)}">${esc(n.nome)}</button><small>${esc(D.tipos[n.tipo] || '')}</small></td><td>${esc(n.resumo)}</td><td>${(n.ferramentas || []).length ? `<ul class="mp-itens">${n.ferramentas.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<span class="mp-sub">a confirmar</span>'}</td><td>${badge(ROT, n.status)}</td><td>${(n.aconfirmar || []).length ? `<ul class="mp-itens">${n.aconfirmar.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</td></tr>`)))}
${secao('solucoes', 'Soluções do Dyno Business', `<div class="mp-cartoes">${D.nos.filter((n) => n.tipo === 'solucao' || n.id === 'business').map((n) => `<article class="mp-cartao"><h3>${esc(n.nome)} ${badge(ROT, n.status)}</h3><p>${esc(n.resumo)}</p>${listaChips(n.itens)}</article>`).join('')}</div>`)}
${secao('stacks', 'Stacks (tecnologias)', `<p class="mp-intro">Em verde e amarelo, o que a infraestrutura e a auditoria registram. O bloco "Referência" é a pilha candidata do documento técnico, que não declara produção.</p>${grupoStacks.map((g) => `<h3 class="mp-grupo">${esc(g)}</h3>` + tabela(['Tecnologia', 'Status', 'Onde', 'Papel', 'Fonte'], D.stacks.filter((s) => s.grupo === g).map((s) => `<tr><td>${esc(s.nome)}</td><td>${badge(ROT, s.status)}</td><td>${esc(s.onde)}</td><td>${esc(s.papel)}</td><td><small>${esc(s.fonte)}</small></td></tr>`))).join('')}`)}
${secao('confirmar', 'O que falta confirmar', `<p class="mp-intro">Nada disto deve ser dito a clientes ou no site como pronto. Cada item vira fato quando houver evidência (teste ponta a ponta, uso real, documento).</p><ul class="mp-lista mp-lista--conf">${lacunasNos.map((n) => `<li><button type="button" class="mp-ir" data-ver="${esc(n.id)}">${esc(n.nome)}</button>: ${(n.aconfirmar && n.aconfirmar.length ? n.aconfirmar : ['Estado a confirmar']).map(esc).join('; ')}</li>`).join('')}${D.lacunas.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`)}
<p class="mp-nota">Fonte: ${esc(D.fonte)}. Para atualizar, edite <code>admin/dyno-ai.mjs</code>, rode <code>node build.mjs</code> e publique (README, "Mapa Infraestrutura"). Só mude um status com evidência nova, registrada em <code>docs/DYNO-ECOSSISTEMA.md</code>.</p>`;

  const host = document.getElementById('mp-host'), painel = document.getElementById('mp-painel');
  ajustar(conteudo);
  const f = { st: 'todos', tipo: 'todos' };
  const visNo = (id) => { const n = nosMap[id]; return (f.st === 'todos' || n.status === f.st) && (f.tipo === 'todos' || n.tipo === f.tipo); };
  const visLig = (id) => { const l = ligMap[id]; return visNo(l.de) && visNo(l.para); };
  const ligsNo = (id) => D.ligacoes.filter((l) => l.de === id || l.para === id);
  const relacionados = (sel) => {
    const nos = new Set(), ligs = new Set();
    if (sel.tipo === 'lig') { const l = ligMap[sel.id]; ligs.add(l.id); nos.add(l.de); nos.add(l.para); }
    else { nos.add(sel.id); ligsNo(sel.id).forEach((l) => { ligs.add(l.id); nos.add(l.de); nos.add(l.para); }); }
    return { nos, ligs };
  };
  const botaoLig = (l, ref) => {
    const outro = l.de === ref ? l.para : l.de;
    return `${irBtn(`lig:${l.id}`, `${l.de === ref ? '→' : '←'} ${esc(nosMap[outro].nome)}${l.rotulo ? ` <small>(${esc(l.rotulo)})</small>` : ''}`)}${l.confirmar ? ' <span class="mp-badge mp-badge--confirmar">a confirmar</span>' : ''}`;
  };
  const htmlPainel = (sel) => {
    let h = '';
    if (sel.tipo === 'lig') {
      const l = ligMap[sel.id];
      h = `<h3>${esc(nosMap[l.de].nome)} → ${esc(nosMap[l.para].nome)} ${l.confirmar ? '<span class="mp-badge mp-badge--confirmar">a confirmar</span>' : ''}</h3><p class="mp-sub">${esc(l.rotulo || 'Ligação')}${l.fluxo === false ? ' · planejada ou não ativa' : ''}</p><p>${esc(l.detalhe || '')}</p><p>${irBtn(`no:${l.de}`, esc(nosMap[l.de].nome))} ${irBtn(`no:${l.para}`, esc(nosMap[l.para].nome))}</p>`;
    } else {
      const n = nosMap[sel.id];
      h = `<h3>${esc(n.nome)} ${badge(ROT, n.status)}</h3><p class="mp-sub">${esc(D.tipos[n.tipo] || '')} · ${esc(camMap[n.camada].nome)}${n.sub ? ` · ${esc(n.sub)}` : ''}</p><p>${esc(n.resumo || '')}</p>` +
        (n.itens && n.itens.length ? `<h4>O que está documentado</h4>${listaChips(n.itens)}` : '') +
        (n.ferramentas && n.ferramentas.length ? `<h4>Ferramentas e canais</h4><ul class="mp-itens">${n.ferramentas.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '') +
        (n.aconfirmar && n.aconfirmar.length ? `<h4>A confirmar</h4><ul class="mp-itens">${n.aconfirmar.map((x) => `<li><span class="mp-badge mp-badge--confirmar">?</span> ${esc(x)}</li>`).join('')}</ul>` : '') +
        `<h4>Ligações</h4><ul class="mp-lista">${ligsNo(n.id).map((l) => `<li>${botaoLig(l, n.id)}</li>`).join('') || '<li class="mp-sub">Nenhuma ligação desenhada.</li>'}</ul>` +
        (n.fonte ? `<p class="mp-sub">Fonte: ${esc(n.fonte)}</p>` : '');
    }
    return h + '<p><button type="button" class="btn btn--ghost mp-limpar" data-limpar>Limpar seleção</button></p>';
  };
  const vazio = '<p class="mp-vazio">Clique numa caixa ou numa seta: as ligações ficam em destaque e os detalhes aparecem aqui.</p>';
  const ctl = controlador({ host, painel, relacionados, htmlPainel, visNo, visLig, vazio, existe: (id) => (nosMap[id] ? { tipo: 'no', id } : ligMap[id] ? { tipo: 'lig', id } : null) });
  const contador = document.getElementById('mp-contador');
  const atualizarContador = () => { contador.textContent = `Mostrando ${D.nos.filter((n) => visNo(n.id)).length} de ${D.nos.length} peças.`; };
  atualizarContador();
  document.getElementById('mp-tipo').addEventListener('change', (e) => { f.tipo = e.target.value; ctl.aplicar(); atualizarContador(); });
  ligarChips(conteudo.querySelector('.mp-chips'), (v) => { f.st = v; ctl.aplicar(); atualizarContador(); });
  ligarPausa();
  conteudo.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ver]');
    if (!b) return;
    ctl.selecionar({ tipo: 'no', id: b.dataset.ver });
    document.getElementById('mapa').scrollIntoView({ block: 'start' });
  });
})();
