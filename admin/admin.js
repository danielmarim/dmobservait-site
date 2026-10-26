// Painel interno /admin: busca ./dados.json (protegido por senha no nginx) e monta cartões, filtros, tabela e gráfico.
// Esta página e este script são públicos (vão para o repositório do site); nenhum número fica aqui.
// Sem bibliotecas externas (a CSP do site só permite scripts do próprio domínio).
(async () => {
  const aviso = document.getElementById('adm-status');
  let dados;
  try {
    const r = await fetch('./dados.json', { cache: 'no-store', credentials: 'same-origin' });
    if (!r.ok) throw new Error(`resposta ${r.status}`);
    dados = await r.json();
  } catch (e) {
    if (aviso) aviso.textContent = `Não foi possível carregar os dados do painel (${e.message}). Recarregue a página ou confira o deploy.`;
    return;
  }
  if (aviso) aviso.hidden = true;
  const { itens, taxaHora, metas, atualizadoEm } = dados;

  const brl = (v, casas = 0) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: casas, maximumFractionDigits: casas });
  const num = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  const GRUPOS = { atual: 'Projeto atual · Dyno', dm: 'Projeto atual · DM', ideia1: 'Ideia · lista 1', ideia2: 'Ideia · lista 2' };
  const SITUACOES = { uso: 'Em uso', piloto: 'Piloto', implantacao: 'Em implantação', planejado: 'Planejado', ideia: 'Ideia' };

  // campos calculados
  for (const it of itens) {
    it.horas = it.hInv + it.hRest;
    it.custo = it.horas * taxaHora;
    it.lucroCliente = it.preco * it.margem / 100;               // lucro bruto por cliente por mês
    it.payback = it.lucroCliente > 0 ? it.custo / it.lucroCliente : Infinity; // clientes-mês para pagar o MVP
    it.rentRotulo = it.margem >= 85 ? 'Alta' : it.margem >= 70 ? 'Média' : 'Baixa';
  }

  // ---------- estado (filtros lembrados só neste navegador) ----------
  const CHAVE = 'dm-admin-filtros';
  let estado = { busca: '', grupo: 'todos', situacao: 'todas', iniciado: 'todos', ordem: 'prob', dir: -1 };
  try { estado = { ...estado, ...JSON.parse(localStorage.getItem(CHAVE) || '{}') }; } catch { /* sem armazenamento */ }
  const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch { /* ignora */ } };

  const visiveis = () => {
    const q = estado.busca.trim().toLowerCase();
    return itens.filter((it) =>
      (estado.grupo === 'todos' || (estado.grupo === 'ideias' ? it.grupo.startsWith('ideia') : estado.grupo === 'atuais' ? !it.grupo.startsWith('ideia') : it.grupo === estado.grupo)) &&
      (estado.situacao === 'todas' || it.situacao === estado.situacao) &&
      (estado.iniciado === 'todos' || String(it.iniciado) === estado.iniciado) &&
      (!q || `${it.nome} ${it.desc}`.toLowerCase().includes(q))
    ).sort((a, b) => {
      const k = estado.ordem, va = a[k], vb = b[k];
      const c = typeof va === 'string' ? va.localeCompare(vb, 'pt-BR') : (va === vb ? 0 : va > vb ? 1 : -1);
      return c * estado.dir || b.prob - a.prob || a.custo - b.custo;
    });
  };

  // ---------- cartões ----------
  const cartoes = document.getElementById('adm-cartoes');
  const metaMrr = metas.pessoal.clientes * metas.pessoal.ticket + metas.business.clientes * metas.business.ticket;
  const mrrHoje = metas.baseHoje.pessoalPagantes * metas.pessoal.ticket;
  const renderCartoes = (lista) => {
    const iniciados = lista.filter((i) => i.iniciado);
    const investido = lista.reduce((s, i) => s + i.hInv * taxaHora, 0);
    const restante = lista.reduce((s, i) => s + i.hRest * taxaHora, 0);
    const probMedia = lista.length ? lista.reduce((s, i) => s + i.prob, 0) / lista.length : 0;
    const top = lista.filter((i) => i.prob >= 4).length;
    cartoes.innerHTML = [
      ['Itens no filtro', lista.length, `${iniciados.length} iniciados · ${lista.length - iniciados.length} não iniciados`],
      ['Já investido (estimado)', brl(investido), `${num(investido / taxaHora)} h a ${brl(taxaHora)}/h`],
      ['Falta investir (estimado)', brl(restante), `${num(restante / taxaHora)} h até os MVPs ficarem vendáveis`],
      ['Probabilidade média', `${num(probMedia)} / 5`, `${top} com nota 4 ou 5`],
      ['Receita recorrente hoje', `~${brl(mrrHoje)}/mês`, `${metas.baseHoje.pessoalPagantes} pagantes no Pessoal (ticket médio)`],
      [`Meta de receita ${metas.pessoal.prazo}`,`${brl(metaMrr)}/mês`, `${metas.pessoal.clientes} Pessoal + ${metas.business.clientes} Business`]
    ].map(([t, v, s]) => `<li><span class="adm-card-t">${t}</span><strong>${v}</strong><span class="adm-card-s">${s}</span></li>`).join('');
  };

  // ---------- tabela ----------
  const corpo = document.getElementById('adm-linhas');
  const pontos = (n) => `<span class="adm-prob adm-prob--${n}" role="img" aria-label="${n} de 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}<b>${n}</b></span>`;
  const renderTabela = (lista) => {
    corpo.innerHTML = lista.map((it) => `<tr id="mvp-${it.id}" class="adm-linha">
<td class="adm-nome"><button type="button" class="adm-abrir" aria-expanded="false" aria-controls="det-${it.id}"><span class="adm-seta" aria-hidden="true">▸</span><span>${esc(it.nome)}</span></button><span class="adm-chips"><span class="adm-chip adm-chip--${it.grupo}">${GRUPOS[it.grupo]}</span><span class="adm-chip adm-sit--${it.situacao}">${SITUACOES[it.situacao]}</span></span></td>
<td><span class="adm-sn adm-sn--${it.iniciado ? 'sim' : 'nao'}">${it.iniciado ? 'Sim' : 'Não'}</span></td>
<td><span class="adm-barra" role="img" aria-label="${it.status}%"><i style="width:${it.status}%"></i></span><span class="adm-pct">${it.status}%</span></td>
<td class="adm-num"><strong>${brl(it.custo)}</strong><small>${num(it.horas)} h${it.hInv ? ` · ${num(it.hInv)} h feitas` : ''}</small></td>
<td>${esc(it.precoTxt)}</td>
<td class="adm-num">${it.impl ? brl(it.impl) : '—'}</td>
<td><span class="adm-rent adm-rent--${it.rentRotulo.toLowerCase()}">${it.margem}% · ${it.rentRotulo}</span><small>${Number.isFinite(it.payback) ? `paga o MVP com ~${num(Math.ceil(it.payback))} clientes-mês` : 'sem preço definido'}</small></td>
<td>${pontos(it.prob)}</td>
</tr>
<tr id="det-${it.id}" class="adm-det" hidden><td colspan="8"><div class="adm-det-grid">
<p><b>O que é.</b> ${esc(it.desc)}</p>
<p><b>Por que essa nota.</b> ${esc(it.porque)}</p>
<p><b>Próximo passo.</b> ${esc(it.proximo)}</p>
<p><b>Conta.</b> ${num(it.hInv)} h feitas + ${num(it.hRest)} h restantes = ${num(it.horas)} h × ${brl(taxaHora)} = ${brl(it.custo)}. Lucro bruto por cliente: ${brl(it.lucroCliente, 2)}/mês.</p>
</div></td></tr>`).join('') || '<tr><td colspan="8" class="adm-vazio">Nada encontrado com esses filtros.</td></tr>';
    document.querySelectorAll('#adm-tabela th[data-ordem]').forEach((th) => th.setAttribute('aria-sort', th.dataset.ordem === estado.ordem ? (estado.dir > 0 ? 'ascending' : 'descending') : 'none'));
  };
  corpo.addEventListener('click', (e) => {
    const b = e.target.closest('.adm-abrir');
    if (!b) return;
    const det = document.getElementById(b.getAttribute('aria-controls'));
    const abrir = det.hidden;
    det.hidden = !abrir;
    b.setAttribute('aria-expanded', String(abrir));
  });

  // ---------- gráfico: probabilidade × custo ----------
  const grafico = document.getElementById('adm-grafico');
  const renderGrafico = (lista) => {
    const W = 760, H = 320, m = { l: 44, r: 30, t: 14, b: 40 };
    const maxC = Math.max(1000, ...lista.map((i) => i.custo));
    const passo = maxC > 15000 ? 5000 : 2500;
    const topo = Math.ceil(maxC / passo) * passo;
    const x = (c) => m.l + (c / topo) * (W - m.l - m.r);
    const y = (p) => H - m.b - (p / 5) * (H - m.t - m.b);
    const gx = []; for (let c = 0; c <= topo; c += passo) gx.push(c);
    // espalha pontos iguais para não ficarem sobrepostos
    const usados = {};
    const pts = lista.map((it) => {
      const k = `${it.prob}:${Math.round(it.custo / 600)}`;
      const n = (usados[k] = (usados[k] || 0) + 1) - 1;
      return { it, cx: x(it.custo) + (n % 3) * 9 - 9 * (n > 0 ? 1 : 0), cy: y(it.prob) - Math.floor(n / 3) * 9 + (n % 2) * 4 };
    });
    grafico.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Probabilidade de acerto (eixo vertical) por custo do MVP (eixo horizontal). A tabela acima traz os mesmos dados.">
<rect class="adm-g-ideal" x="${m.l}" y="${y(5)}" width="${x(topo * 0.35) - m.l}" height="${y(3.5) - y(5)}"/><text class="adm-g-ideal-t" x="${m.l + 6}" y="${y(5) + 14}">barato e com boa chance</text>
${[0, 1, 2, 3, 4, 5].map((p) => `<line class="adm-g-linha" x1="${m.l}" x2="${W - m.r}" y1="${y(p)}" y2="${y(p)}"/><text class="adm-g-eixo" x="${m.l - 10}" y="${y(p) + 4}" text-anchor="end">${p}</text>`).join('')}
${gx.map((c) => `<text class="adm-g-eixo" x="${x(c)}" y="${H - m.b + 18}" text-anchor="middle">${c >= 1000 ? `${c / 1000} mil` : c}</text>`).join('')}
<text class="adm-g-rotulo" x="${(W + m.l) / 2}" y="${H - 6}" text-anchor="middle">custo do MVP (R$)</text>
${pts.map(({ it, cx, cy }) => `<a href="#mvp-${it.id}" class="adm-g-ponto adm-g-${it.grupo}"><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="7"/><title>${esc(it.nome)}: ${brl(it.custo)} · nota ${it.prob} · margem ${it.margem}%</title></a>`).join('')}
</svg>`;
  };

  // ---------- filtros ----------
  const form = document.getElementById('adm-filtros');
  for (const [nome, valor] of Object.entries(estado)) if (form.elements[nome]) form.elements[nome].value = valor;
  const render = () => { const l = visiveis(); renderCartoes(l); renderTabela(l); renderGrafico(l); };
  form.addEventListener('input', () => {
    for (const k of ['busca', 'grupo', 'situacao', 'iniciado']) estado[k] = form.elements[k].value;
    salvar(); render();
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  document.querySelectorAll('#adm-tabela th[data-ordem] button').forEach((b) => b.addEventListener('click', () => {
    const k = b.parentElement.dataset.ordem;
    estado.dir = estado.ordem === k ? -estado.dir : (k === 'nome' ? 1 : -1);
    estado.ordem = k; salvar(); render();
  }));
  document.getElementById('adm-atualizado').textContent = atualizadoEm;
  document.getElementById('adm-taxa').textContent = `${brl(taxaHora)}/h`;
  render();
})();
