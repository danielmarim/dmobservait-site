// WorkAI — escritório isométrico desenhado no canvas (sem sprites de terceiros).
// Status e falas são ilustrativos: nada aqui lê sistema real, dado de cliente,
// chave, token ou IP, e nada é enviado para fora.
// Integração das falas: WorkAI.notify(agentId, texto, { demo: true }).
(() => {
  const COLS = 20, ROWS = 16, TW = 64, TH = 32, WALL = 52;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PASSO = 1000 / 30;

  const ROOMS = [
    { id: 'dir', name: 'Diretoria', short: 'Diretoria', col: '#f0d78c', c: 1, r: 0, w: 18, h: 4, glass: true },
    { id: 'op', name: 'DM Operação', sub: 'sala do head', short: 'Operação', col: '#e2b657', c: 1, r: 7, w: 4, h: 3 },
    { id: 'sre', name: 'DM SRE & O11y', short: 'SRE & O11y', col: '#3ec6e0', c: 7, r: 7, w: 5, h: 3 },
    { id: 'mkt', name: 'Dyno Marketing', short: 'Marketing', col: '#ff6fa8', c: 14, r: 7, w: 5, h: 3 },
    { id: 'com', name: 'Dyno Comercial', short: 'Comercial', col: '#7dce7a', c: 1, r: 13, w: 4, h: 3 },
    { id: 'prd', name: 'DM Produto & Receita', short: 'Produto', col: '#b18cff', c: 6, r: 13, w: 4, h: 3 },
    { id: 'copa', name: 'Copa & Reuniões', short: 'Copa', col: '#e0c080', c: 11, r: 13, w: 4, h: 3 },
    { id: 'desc', name: 'Sala de Descompressão', short: 'Descompressão', col: '#7ec8c3', c: 16, r: 13, w: 3, h: 3 }
  ];
  const room = (id) => ROOMS.find((r) => r.id === id);
  const salaDe = (c, r) => ROOMS.find((rm) => c >= rm.c && r >= rm.r && c < rm.c + rm.w && r < rm.r + rm.h) || null;

  const PORTAS = [[8, 4], [9, 4], [3, 6], [4, 6], [9, 6], [10, 6], [16, 6], [17, 6], [3, 10], [4, 10], [9, 10], [10, 10], [16, 10], [17, 10], [2, 12], [3, 12], [7, 12], [8, 12], [12, 12], [13, 12], [17, 12]];
  const VAGAS = {
    copa: [[12, 13], [13, 13], [14, 13], [14, 15], [11, 14], [12, 15], [13, 15]],
    desc: [[16, 13], [16, 14], [18, 13], [17, 13], [17, 14]],
    dir: [[4, 2], [4, 3], [11, 2], [12, 3], [14, 2], [15, 3], [16, 2], [3, 3]]
  };

  const RAW = [
    { room: 'dir', name: 'Daniel', role: 'CEO', ceo: true, c: 6.8, r: 2.6 },
    { room: 'dir', name: 'Dyno Bot', role: 'Gerente dos agentes', bot: true, c: 8.4, r: 2.6 },
    { room: 'op', name: 'Recap AI', role: 'atas e follow-ups', desk: [2, 7], c: 2.5, r: 8.35 },
    { room: 'sre', name: 'Dyno Atlas', role: 'engenharia de IA e DevOps', coord: true, desk: [8, 7], c: 8.5, r: 8.35 },
    { room: 'sre', name: 'Stan', role: 'chamados N2/N3', desk: [11, 7], c: 11.5, r: 8.35 },
    { room: 'sre', name: 'Observa AI', role: 'observabilidade e banco de dados', desk: [7, 9], c: 7.5, r: 8.35 },
    { room: 'sre', name: 'Sentinela', role: 'segurança', shield: true, desk: [10, 9], c: 10.5, r: 8.35 },
    { room: 'mkt', name: 'Zia', role: 'social media', coord: true, desk: [15, 7], c: 15.5, r: 8.35 },
    { room: 'mkt', name: 'Trend AI', role: 'pautas do Instagram', desk: [17, 7], c: 17.5, r: 8.35 },
    { room: 'mkt', name: 'Criativos AI', role: 'imagens e vídeos', desk: [16, 9], c: 16.5, r: 8.35 },
    { room: 'mkt', name: 'Rank AI', role: 'SEO e textos dos sites', desk: [18, 9], c: 18.5, r: 8.35 },
    { room: 'mkt', name: 'Scout AI', role: 'concorrentes', desk: [14, 9], c: 14.5, r: 8.35 },
    { room: 'com', name: 'ProspectAI', role: 'prospecção B2B no Brasil', coord: true, desk: [2, 13], c: 2.5, r: 14.35 },
    { room: 'com', name: 'Tráfego AI', role: 'anúncios (teto de R$ 15 por dia)', desk: [4, 13], c: 4.5, r: 14.35 },
    { room: 'com', name: 'Tone AI', role: 'tom das mensagens', desk: [1, 15], c: 1.5, r: 14.35 },
    { room: 'prd', name: 'Produto AI', role: 'PM das duas linhas', coord: true, desk: [7, 13], c: 7.5, r: 14.35 },
    { room: 'prd', name: 'Receita AI', role: 'receita', desk: [9, 13], c: 9.5, r: 14.35 },
    { room: 'prd', name: 'Spend AI', role: 'assinaturas e custos', desk: [6, 15], c: 6.5, r: 14.35 },
    { room: 'prd', name: 'Sucesso AI', role: 'CS do Business', desk: [8, 15], c: 8.5, r: 14.35 }
  ];

  const W = new Uint8Array(COLS * ROWS);
  const at = (c, r) => r * COLS + c;
  const mark = (c, r, v) => { if (c >= 0 && r >= 0 && c < COLS && r < ROWS) W[at(c, r)] = v; };
  const livre = (c, r) => { c = Math.floor(c); r = Math.floor(r); return c >= 0 && r >= 0 && c < COLS && r < ROWS && W[at(c, r)] === 1; };
  function fill(c0, r0, c1, r1, v = 1) {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) mark(c, r, v);
  }
  fill(1, 0, 18, 3);
  fill(1, 5, 18, 5);
  fill(5, 5, 6, 11);
  fill(12, 5, 13, 11);
  fill(1, 7, 4, 9);
  fill(7, 7, 11, 9);
  fill(14, 7, 18, 9);
  fill(1, 11, 18, 11);
  fill(1, 13, 4, 15);
  fill(6, 13, 9, 15);
  fill(11, 13, 14, 15);
  fill(16, 13, 18, 15);
  for (const [c, r] of PORTAS) mark(c, r, 1);
  const BLOQUEIOS = [[7, 1], [8, 1], [9, 1], [10, 1], [8, 0], [9, 0], [12, 14], [13, 14], [11, 15], [17, 15], [18, 15], [16, 15], [18, 14], [1, 9], [11, 9], [18, 7], [1, 13], [4, 15], [6, 13]];
  for (const a of RAW) if (a.desk) BLOQUEIOS.push(a.desk);
  for (const [c, r] of BLOQUEIOS) mark(c, r, 0);

  const HAIR = ['#2a1810', '#5c3a22', '#14161c', '#d1b36a', '#6d3ea3', '#1c4f46', '#efe8dc'];
  const SKIN = ['#f6d7bd', '#e4b48e', '#c68642', '#8d5524', '#ffe0cc'];
  const STATUS = ['digitando', 'em foco', 'em reunião', 'disponível'];
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
  const slug = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const erros = [];
  const agents = RAW.map((a) => {
    const h = hash(a.name);
    const rm = room(a.room);
    if (!livre(a.c, a.r)) erros.push(a.name + ' em célula fechada');
    if (a.desk && livre(a.desk[0], a.desk[1])) erros.push(a.name + ' mesa aberta');
    return {
      roomId: a.room, room: rm, name: a.name, id: slug(a.name), role: a.role,
      coord: !!a.coord, shield: !!a.shield, bot: !!a.bot, ceo: !!a.ceo, desk: a.desk || null,
      homeC: a.c, homeR: a.r, c: a.c, r: a.r,
      hair: a.ceo ? '#2a1810' : HAIR[h % HAIR.length],
      skin: a.ceo ? '#e4b48e' : a.bot ? '#d7f6ff' : SKIN[h % SKIN.length],
      hairStyle: a.ceo ? 0 : h % 6, ph: (h % 628) / 100,
      status: a.ceo ? null : STATUS[h % 4],
      nome: a.ceo ? 'Daniel' : a.name,
      caminho: null, passo: 0, espera: 1200 + (h % 5000), fila: [], missao: null, trava: 0, repath: 0, ultimoAlvo: ''
    };
  });
  for (const [c, r] of PORTAS) if (!livre(c, r)) erros.push('porta fechada ' + c + ',' + r);
  for (const [id, lista] of Object.entries(VAGAS)) for (const [c, r] of lista) if (!livre(c, r)) erros.push('vaga ' + id + ' ' + c + ',' + r);
  if (erros.length) console.warn('WorkAI mapa', erros.join('; '));

  const player = agents.find((a) => a.ceo);
  const achar = (id) => {
    const k = String(id || '').trim();
    const s = slug(k);
    return agents.find((a) => a.name === k || a.id === k || a.id === s);
  };
  const dist = (a, b) => Math.hypot(a.c - b.c, a.r - b.r);
  const andando = (a) => !!(a.caminho && a.passo < a.caminho.length);
  const nomeCeo = () => player.nome || 'Daniel';
  const reportsTo = (a) => {
    if (a.ceo) return '';
    if (a.bot) return nomeCeo() + ' (CEO)';
    if (a.coord || a.roomId === 'op') return 'Dyno Bot (CTO)';
    return agents.find((x) => x.roomId === a.roomId && x.coord)?.name || 'Dyno Bot (CTO)';
  };

  const cvs = document.getElementById('c');
  const ctx = cvs.getContext('2d');
  const palco = document.getElementById('palco');
  let viewW = 1, viewH = 1, dpr = 1, focusId = '', t = 0, cam = { s: 1, ox: 0, oy: 0 };
  let mouse = null, hover = null, ready = false, seguir = true, congelado = false, demoEm = 12000;
  const keys = new Set();
  const hits = [];
  const baloes = [];
  const FALAR = 1.9;

  const project = (c, r, h = 0) => ({ x: (c - r) * TW / 2, y: (c + r) * TH / 2 - h });
  const shade = (hex, amt) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = (v) => Math.max(0, Math.min(255, v + amt));
    return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  };
  const quad = (a, b, c, d, fill, stroke) => {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  };
  const box = (c, r, cw, cd, h, top, left, right) => {
    const A = project(c, r, h), B = project(c + cw, r, h), D = project(c, r + cd, h), E = project(c + cw, r + cd, h);
    const D0 = project(c, r + cd, 0), E0 = project(c + cw, r + cd, 0), B0 = project(c + cw, r, 0);
    quad(D, E, E0, D0, left);
    quad(B, E, E0, B0, right);
    quad(A, B, E, D, top, 'rgba(0,0,0,.25)');
  };
  const ellipse = (x, y, rx, ry, fill, stroke) => {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.4; ctx.stroke(); }
  };
  const rr = (x, y, w, h, rad, fill, stroke) => {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, rad);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = 1.5; ctx.strokeStyle = stroke; ctx.stroke(); }
  };

  function perto(c, r, raio) {
    let best = null, bd = 1e9;
    const C = Math.round(c), R = Math.round(r);
    for (let rr = R - raio; rr <= R + raio; rr++) for (let cc = C - raio; cc <= C + raio; cc++) {
      if (!livre(cc, rr)) continue;
      const d = (cc + 0.5 - c) ** 2 + (rr + 0.5 - r) ** 2;
      if (d < bd) { bd = d; best = { c: cc, r: rr }; }
    }
    return best;
  }

  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  function astar(de, para) {
    const sc = Math.floor(de.c), sr = Math.floor(de.r);
    let gc = Math.floor(para.c), gr = Math.floor(para.r);
    if (!livre(gc, gr)) {
      const n = perto(para.c, para.r, 4);
      if (!n) return [];
      gc = n.c; gr = n.r;
    }
    if (!livre(sc, sr)) return [];
    if (sc === gc && sr === gr) return [];
    const start = sc + ',' + sr, goal = gc + ',' + gr;
    const open = [start];
    const g = new Map([[start, 0]]);
    const prev = new Map();
    const f = new Map([[start, 0]]);
    const seen = new Set();
    const heur = (c, r) => { const dx = Math.abs(c - gc), dy = Math.abs(r - gr); return Math.max(dx, dy) + 0.4 * Math.min(dx, dy); };
    f.set(start, heur(sc, sr));
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f.get(open[i]) < f.get(open[bi])) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur === goal) break;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const [cc, rr] = cur.split(',').map(Number);
      for (const [dc, dr] of DIRS) {
        const nc = cc + dc, nr = rr + dr;
        if (!livre(nc, nr)) continue;
        if (dc && dr && (!livre(cc + dc, rr) || !livre(cc, rr + dr))) continue;
        const nk = nc + ',' + nr;
        const ng = g.get(cur) + (dc && dr ? 1.41 : 1);
        if (ng < (g.get(nk) ?? 1e9)) {
          g.set(nk, ng); prev.set(nk, cur); f.set(nk, ng + heur(nc, nr));
          if (!open.includes(nk)) open.push(nk);
        }
      }
    }
    if (!prev.has(goal)) return [];
    const cells = [];
    let k = goal;
    while (k && k !== start) {
      const [c, r] = k.split(',').map(Number);
      cells.push({ c: c + 0.5, r: r + 0.5 });
      k = prev.get(k);
    }
    cells.reverse();
    return cells;
  }

  function quemOcupa(p, self) {
    return agents.find((o) => o !== self && Math.hypot(o.c - p.c, o.r - p.r) < 0.45);
  }
  function seguirCaminho(a, dt) {
    if (!a.caminho || a.passo >= a.caminho.length) return;
    const alvo = a.caminho[a.passo];
    const ultimo = a.passo === a.caminho.length - 1 && a.missao && !a.missao.chegou;
    const outro = ultimo ? null : quemOcupa(alvo, a);
    if (outro) {
      a.trava += dt;
      const cedo = hash(a.name) > hash(outro.name);
      if (cedo && a.trava < 520) return;
      if (cedo) { a.caminho = null; a.espera = 160; a.trava = 0; a.ultimoAlvo = ''; return; }
      a.trava = 0;
    }
    a.trava = 0;
    const dx = alvo.c - a.c, dy = alvo.r - a.r, L = Math.hypot(dx, dy) || 1;
    const vel = (reduce ? 1.5 : 2.45) * dt / 1000;
    if (vel >= L) { a.c = alvo.c; a.r = alvo.r; a.passo++; }
    else { a.c += dx / L * vel; a.r += dy / L * vel; }
  }
  function vagaLivre(lista, quem) {
    const livres = lista.filter(([c, r]) => livre(c, r) && !agents.some((o) => o !== quem && o !== player && Math.hypot(o.c - (c + 0.5), o.r - (r + 0.5)) < 0.6));
    const pool = (livres.length ? livres : lista);
    const [c, r] = pool[Math.floor(Math.random() * pool.length)];
    return { c: c + 0.5, r: r + 0.5 };
  }
  function vizinhoDo(alvo, quem) {
    const sala = salaDe(alvo.c, alvo.r);
    let best = null, bd = 1e9;
    const C = Math.floor(alvo.c), R = Math.floor(alvo.r);
    for (let r = R - 2; r <= R + 2; r++) for (let c = C - 2; c <= C + 2; c++) {
      if (!livre(c, r)) continue;
      const p = { c: c + 0.5, r: r + 0.5 };
      const dAlvo = Math.hypot(p.c - alvo.c, p.r - alvo.r);
      if (dAlvo < 0.85 || dAlvo > 1.65) continue;
      if (agents.some((o) => o !== quem && o !== alvo && dist(o, p) < 0.45)) continue;
      const mesma = !!(sala && salaDe(p.c, p.r)?.id === sala.id);
      const score = dAlvo + (mesma ? 0 : 3);
      if (score < bd) { bd = score; best = p; }
    }
    if (best) return best;
    const n = perto(alvo.c + 1, alvo.r, 3);
    return n ? { c: n.c + 0.5, r: n.r + 0.5 } : { c: alvo.c + 1, r: alvo.r };
  }
  function destinoRotina(a) {
    const giro = a.ph + (a._giro || 0);
    const n = giro % 5;
    a._giro = (a._giro || 0) + 1 + Math.floor(Math.random() * 3);
    if (n < 1.2) return { c: a.homeC, r: a.homeR };
    if (n < 2.2) return vagaLivre(VAGAS.copa, a);
    if (n < 3.2) return vagaLivre(VAGAS.desc, a);
    if (n < 4.1) return vagaLivre(VAGAS.dir, a);
    const rm = a.room;
    for (let r = rm.r; r < rm.r + rm.h; r++) for (let c = rm.c; c < rm.c + rm.w; c++) {
      if (livre(c, r) && (c !== Math.floor(a.homeC) || r !== Math.floor(a.homeR))) return { c: c + 0.5, r: r + 0.5 };
    }
    return { c: a.homeC, r: a.homeR };
  }

  function limparTexto(s) {
    return String(s || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
  }
  function notify(agentId, texto, opts) {
    const a = achar(agentId);
    if (!a || a.ceo) return false;
    const limpo = limparTexto(texto);
    if (!limpo) return false;
    const ev = { texto: limpo, demo: !opts || opts.demo !== false, lida: false, chegou: false };
    if (!a.missao) { a.missao = ev; a.caminho = null; a.ultimoAlvo = ''; }
    else a.fila.push(ev);
    return true;
  }
  function soltar(a) {
    if (!a?.missao) return;
    const prox = a.fila.shift();
    a.caminho = null;
    a.ultimoAlvo = '';
    if (prox) a.missao = { ...prox, lida: false, chegou: false };
    else { a.missao = null; a.espera = 700; }
  }

  const FALAS = {
    'Recap AI': 'A ata ilustrativa da reunião está pronta.',
    'Dyno Atlas': 'Um alerta ilustrativo de observabilidade pediu revisão.',
    'Stan': 'Um chamado ilustrativo subiu de nível.',
    'Observa AI': 'O painel ilustrativo de métricas mudou.',
    'Sentinela': 'A verificação ilustrativa de segurança terminou.',
    'Zia': 'A pauta ilustrativa da semana está pronta.',
    'Trend AI': 'Surgiu um tema ilustrativo para a semana.',
    'Criativos AI': 'Um rascunho ilustrativo de peça ficou pronto.',
    'Rank AI': 'O texto ilustrativo de uma página foi revisado.',
    'Scout AI': 'O recorte ilustrativo de concorrentes foi atualizado.',
    'ProspectAI': 'Há um retorno ilustrativo de prospecção.',
    'Tráfego AI': 'A campanha ilustrativa precisa de um olhar.',
    'Tone AI': 'Uma mensagem ilustrativa espera aprovação de tom.',
    'Produto AI': 'O quadro ilustrativo das duas linhas mudou.',
    'Receita AI': 'O resumo ilustrativo de receita foi fechado.',
    'Spend AI': 'O resumo ilustrativo de custos foi fechado.',
    'Sucesso AI': 'Um acompanhamento ilustrativo de CS está na fila.',
    'Dyno Bot': 'Os coordenadores receberam a tarefa ilustrativa.'
  };
  function tickDemo(dt) {
    demoEm -= dt;
    if (demoEm > 0) return;
    demoEm = 14000 + Math.random() * 10000;
    if (agents.filter((a) => a.missao).length >= 2) return;
    const livres = agents.filter((a) => !a.ceo && !a.missao && !a.fila.length);
    if (!livres.length) return;
    const a = livres[Math.floor(Math.random() * livres.length)];
    notify(a.name, FALAS[a.name] || 'Tenho um aviso ilustrativo.', { demo: true });
  }

  function updateAgente(a, dt) {
    if (a.ceo) return;
    if (a.missao && !a.missao.chegou) {
      const alvo = vizinhoDo(player, a);
      const chave = Math.floor(alvo.c) + ',' + Math.floor(alvo.r);
      a.repath -= dt;
      if (!a.caminho || a.passo >= a.caminho.length || chave !== a.ultimoAlvo && a.repath <= 0) {
        a.caminho = astar(a, alvo);
        a.passo = 0;
        a.ultimoAlvo = chave;
        a.repath = 450;
      }
      seguirCaminho(a, dt);
      if (dist(a, player) < 1.35) { a.missao.chegou = true; a.caminho = null; }
      return;
    }
    if (a.missao?.chegou) return;
    if (a.bot) {
      if (dist(a, player) < 1.85) { a.caminho = null; return; }
      a.repath -= dt;
      if (!a.caminho || a.passo >= a.caminho.length || a.repath <= 0) {
        const casa = salaDe(player.c, player.r);
        const alvo = casa && casa.id === 'dir' && dist(player, { c: a.homeC, r: a.homeR }) < 3.2
          ? { c: a.homeC, r: a.homeR }
          : vizinhoDo(player, a);
        a.caminho = astar(a, alvo);
        a.passo = 0;
        a.repath = 1100;
      }
      seguirCaminho(a, dt);
      return;
    }
    if (a.caminho && a.passo < a.caminho.length) { seguirCaminho(a, dt); return; }
    if (a.caminho) {
      const s = salaDe(a.c, a.r);
      if (s) { a.passou = a.passou || {}; a.passou[s.id] = (a.passou[s.id] || 0) + 1; }
      a.caminho = null;
    }
    a.espera -= dt;
    if (a.espera > 0) return;
    const dest = destinoRotina(a);
    a.caminho = astar(a, dest);
    a.passo = 0;
    a.espera = 4200 + Math.random() * 4600;
  }

  function podeMover(oc, orr, nc, nr) {
    if (!livre(nc, nr)) return false;
    if (Math.floor(nc) !== Math.floor(oc) && Math.floor(nr) !== Math.floor(orr)) return livre(nc, orr) && livre(oc, nr);
    return true;
  }
  function updatePlayer(dt) {
    const p = player;
    let dc = 0, dr = 0;
    if (keys.has('w') || keys.has('arrowup')) { dc--; dr--; }
    if (keys.has('s') || keys.has('arrowdown')) { dc++; dr++; }
    if (keys.has('a') || keys.has('arrowleft')) { dc--; dr++; }
    if (keys.has('d') || keys.has('arrowright')) { dc++; dr--; }
    if (dc || dr) {
      p.caminho = null;
      const L = Math.hypot(dc, dr);
      const vel = (reduce ? 1.7 : 2.7) * dt / 1000;
      const nc = p.c + dc / L * vel, nr = p.r + dr / L * vel;
      if (podeMover(p.c, p.r, nc, nr)) { p.c = nc; p.r = nr; }
      else if (podeMover(p.c, p.r, nc, p.r)) p.c = nc;
      else if (podeMover(p.c, p.r, p.c, nr)) p.r = nr;
      return;
    }
    seguirCaminho(p, dt);
  }
  function update(dt) {
    updatePlayer(dt);
    for (const a of agents) updateAgente(a, dt);
    tickDemo(dt);
  }

  function boundsOf(id) {
    const pts = [];
    const add = (c, r, h) => pts.push(project(c, r, h));
    if (!id) {
      add(0, 0, WALL); add(COLS, 0, WALL); add(0, ROWS, 0); add(COLS, ROWS, 0);
    } else {
      const rm = room(id);
      add(rm.c - 0.2, rm.r - 0.2, 70); add(rm.c + rm.w + 0.3, rm.r - 0.1, 64);
      add(rm.c - 0.15, rm.r + rm.h + 0.45, 0); add(rm.c + rm.w + 0.3, rm.r + rm.h + 0.45, 0);
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    return { x: minX - 16, y: minY - 12, w: maxX - minX + 32, h: maxY - minY + 28 };
  }
  function drawWalls() {
    const h = WALL;
    quad(project(0, -0.2, h), project(COLS, -0.2, h), project(COLS, -0.2, 0), project(0, -0.2, 0), '#3a342c');
    quad(project(-0.2, 0, h), project(-0.2, ROWS, h), project(-0.2, ROWS, 0), project(-0.2, 0, 0), '#2e2924');
    quad(project(0, -0.2, h + 5), project(COLS, -0.2, h + 5), project(COLS, -0.2, h), project(0, -0.2, h), '#e2c27a');
    quad(project(-0.2, 0, h + 5), project(-0.2, ROWS, h + 5), project(-0.2, ROWS, h), project(-0.2, 0, h), '#c4a15a');
  }
  function tile(c, r, col) {
    quad(project(c, r), project(c + 1, r), project(c + 1, r + 1), project(c, r + 1), col);
  }
  function drawFloor() {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (W[at(c, r)]) {
      tile(c, r, (c + r) % 2 ? '#171a22' : '#1c1f29');
    }
    for (const rm of ROOMS) {
      quad(project(rm.c, rm.r), project(rm.c + rm.w, rm.r), project(rm.c + rm.w, rm.r + rm.h), project(rm.c, rm.r + rm.h), rm.col + (rm.glass ? '99' : '66'));
      ctx.beginPath();
      const a = project(rm.c, rm.r), b = project(rm.c + rm.w, rm.r), c = project(rm.c + rm.w, rm.r + rm.h), d = project(rm.c, rm.r + rm.h);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
      ctx.strokeStyle = rm.col; ctx.globalAlpha = rm.glass ? 0.95 : 0.55; ctx.lineWidth = rm.glass ? 2.4 : 1.5; ctx.stroke(); ctx.globalAlpha = 1;
    }
    for (const [c, r] of PORTAS) tile(c, r, '#3a3428');
    const edge = [project(0, 0), project(COLS, 0), project(COLS, ROWS), project(0, ROWS)];
    ctx.beginPath(); edge.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
    ctx.strokeStyle = 'rgba(226,194,122,.8)'; ctx.lineWidth = 2; ctx.stroke();
  }
  function medallion(c, r) {
    const p = project(c, r, 0);
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 0.5);
    ctx.strokeStyle = 'rgba(226,194,122,.75)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, 7); ctx.stroke();
    ctx.restore();
  }
  function pool(c, r, rad, color) {
    const p = project(c, r, 0);
    const g = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, rad);
    g.addColorStop(0, color); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(p.x, p.y, rad, rad * 0.5, 0, 0, 7); ctx.fill();
  }
  function drawDesk(a) {
    const c = a.desk[0], r = a.desk[1];
    box(c, r, 0.92, 0.58, 14, '#c49a6a', '#8a5a38', '#5c3b28');
    box(c + 0.22, r + 0.06, 0.36, 0.1, 26, '#1b1e28', '#12151c', '#0c0e14');
    const on = a.status === 'digitando' || (!reduce && Math.sin(t / 400 + a.ph) > -0.2);
    quad(project(c + 0.26, r + 0.08, 24), project(c + 0.54, r + 0.08, 24), project(c + 0.54, r + 0.08, 16), project(c + 0.26, r + 0.08, 16), on ? a.room.col + 'cc' : '#243040');
  }
  function drawPlant(c, r) {
    box(c, r, 0.34, 0.34, 7, '#a8643e', '#7a4528', '#5a321c');
    const p = project(c + 0.17, r + 0.17, 9);
    [['#1e7a46', -8, -6, 11, 5], ['#3cb371', 7, -8, 10, 5], ['#145c34', 0, -13, 9, 5]].forEach(([col, x, y, rx, ry], i) => {
      ctx.save(); ctx.translate(p.x + x, p.y + y); ctx.rotate(i); ellipse(0, 0, rx, ry, col); ctx.restore();
    });
  }
  function drawSofa(c, r, len, cloth) {
    box(c, r, len, 0.7, 11, cloth, shade(cloth, -30), shade(cloth, -50));
    box(c, r, len, 0.18, 22, shade(cloth, 20), shade(cloth, -10), shade(cloth, -30));
  }
  function drawMesaExec() {
    box(6.15, 0.55, 4.3, 1.2, 16, '#f3efe4', '#d9d0c0', '#b7ad9c');
    box(6.45, 0.85, 3.7, 0.62, 18, '#e2c27a', '#a6853f', '#6e5424');
  }
  function drawMesaCopa() {
    box(11.85, 13.85, 2.15, 1.05, 13, '#d7b07a', '#a67948', '#6e4a2c');
    box(12.2, 14.05, 0.45, 0.28, 16, '#f4f0e6', '#d9d0c0', '#b7ad9c');
  }
  function drawCafe() {
    box(11.05, 14.85, 0.85, 0.45, 16, '#5c4636', '#3e2e24', '#2a1e18');
    const p = project(11.45, 15.05, 22);
    ellipse(p.x, p.y, 4, 2.4, '#6b3a28', '#e2c27a');
  }
  function drawLounge() {
    const p = project(17.2, 14.2, 0);
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 0.5);
    ctx.fillStyle = 'rgba(126,200,195,.35)'; ctx.beginPath(); ctx.ellipse(0, 0, 28, 28, 0, 0, 7); ctx.fill(); ctx.restore();
    drawSofa(16.15, 14.85, 1.7, '#3d6f78');
    box(18.05, 14.05, 0.7, 0.55, 8, '#c4a15a', '#8a6a30', '#5c451c');
  }
  function drawGlass() {
    const rm = room('dir');
    const faixa = (c0, c1, r, h, col) => quad(project(c0, r, h), project(c1, r, h), project(c1, r, 0), project(c0, r, 0), col);
    ctx.save(); ctx.globalAlpha = 0.38;
    faixa(rm.c, 8, rm.r + rm.h, 46, '#d7eef2');
    faixa(10, rm.c + rm.w, rm.r + rm.h, 46, '#d7eef2');
    quad(project(rm.c + rm.w, rm.r, 46), project(rm.c + rm.w, rm.r + rm.h, 46), project(rm.c + rm.w, rm.r + rm.h, 0), project(rm.c + rm.w, rm.r, 0), '#d7eef2');
    ctx.restore();
    box(7.82, 3.72, 0.2, 0.28, 42, '#e2c27a', '#a6853f', '#6e5424');
    box(9.98, 3.72, 0.2, 0.28, 42, '#e2c27a', '#a6853f', '#6e5424');
  }
  function drawCrown(x, y, big) {
    ctx.fillStyle = '#ffd76a'; ctx.strokeStyle = '#8a5a12'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    const s = big ? 1 : 0.72;
    ctx.moveTo(x - 8 * s, y + 4); ctx.lineTo(x - 8 * s, y - 2); ctx.lineTo(x - 4 * s, y + 2); ctx.lineTo(x, y - 7 * s);
    ctx.lineTo(x + 4 * s, y + 2); ctx.lineTo(x + 8 * s, y - 2); ctx.lineTo(x + 8 * s, y + 4); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  function drawShield(x, y) {
    ctx.fillStyle = '#9bd0ff'; ctx.strokeStyle = '#1e4f86'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 9, y - 5); ctx.lineTo(x + 9, y + 2); ctx.lineTo(x, y + 10); ctx.lineTo(x - 9, y + 2); ctx.lineTo(x - 9, y - 5); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  function drawAgent(a, walking) {
    const feet = project(a.c, a.r, 0);
    const bob = reduce ? 0 : walking ? Math.abs(Math.sin(t / 120)) * 2 : Math.sin(t / 700 + a.ph) * 1.4;
    const x = feet.x, y = feet.y - bob;
    ctx.save(); ctx.translate(x, y);
    const glow = a.room.col;
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ellipse(0, 4, 13, 5, 'rgba(0,0,0,.28)');
    if (a.ceo && !reduce) {
      ctx.strokeStyle = '#e2c27a'; ctx.globalAlpha = 0.9; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(0, 3, 16, 6, 0, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    } else if (!a.ceo && !reduce) {
      ctx.save(); ctx.strokeStyle = glow; ctx.globalAlpha = 0.7; ctx.setLineDash([3, 4]); ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.ellipse(0, 2, 14, 5.5, 0, 0, 7); ctx.stroke(); ctx.restore();
    }
    const step = walking && !reduce ? Math.sin(t / 90) * 2.2 : 0;
    const arm = !walking && a.status === 'digitando' && !reduce ? Math.sin(t / 80 + a.ph) * 3 : 0;
    const ink = 'rgba(8,12,20,.9)';
    const cloth = a.ceo ? '#243044' : shade(glow, -25);
    const calca = a.ceo ? '#1a2330' : '#1c2430';
    rr(-7, -4 + step, 6, 11, 2, calca, ink); rr(1, -4 - step, 6, 11, 2, calca, ink);
    rr(-8, 5 + step, 7, 4, 2, '#0e1218', ink); rr(1, 5 - step, 7, 4, 2, '#0e1218', ink);
    rr(-11, -24, 22, 20, 7, cloth, ink);
    if (a.ceo) {
      ctx.fillStyle = '#e2c27a';
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(2.4, -16); ctx.lineTo(0, -8); ctx.lineTo(-2.4, -16); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(-11, -16, 22, 2);
    }
    rr(-16, -22 + arm, 6, 13, 3, cloth, ink); rr(10, -22 - arm, 6, 13, 3, cloth, ink);
    ellipse(-13, -8 + arm, 3.1, 3.1, a.skin, ink); ellipse(13, -8 - arm, 3.1, 3.1, a.skin, ink);
    ellipse(0, -38, 13.5, 13.5, a.skin, ink);
    ctx.fillStyle = a.hair; ctx.strokeStyle = ink; ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (a.bot) {
      ctx.arc(0, -38, 12, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
      ctx.strokeStyle = '#9be7ff'; ctx.beginPath(); ctx.moveTo(0, -48); ctx.lineTo(0, -56); ctx.stroke();
      ellipse(0, -57, 2.4, 2.4, '#9be7ff');
    } else {
      ctx.arc(0, -38, 12, Math.PI, 0.05); ctx.quadraticCurveTo(4, -30, 2, -28); ctx.lineTo(-8, -30); ctx.quadraticCurveTo(-13, -34, -12, -40); ctx.fill(); ctx.stroke();
    }
    const blink = !reduce && !a.ceo && ((t / 1000 + a.ph) % 4.5) < 0.12;
    if (a.bot) {
      rr(-7, -38, 14, 5, 2, blink ? '#145066' : '#16384a', '#9be7ff');
      if (!blink) { ctx.fillStyle = '#9be7ff'; ctx.fillRect(-4, -37, 2, 3); ctx.fillRect(2, -37, 2, 3); }
    } else if (blink) {
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-6, -36, 4, 1.2); ctx.fillRect(2, -36, 4, 1.2);
    } else {
      ellipse(-4, -36, 1.7, 1.9, '#1a1a1a'); ellipse(4, -36, 1.7, 1.9, '#1a1a1a');
      ctx.fillStyle = '#fff'; ctx.fillRect(-4.6, -37, 1.2, 1.2); ctx.fillRect(3.4, -37, 1.2, 1.2);
    }
    if (!a.ceo) {
      ctx.save(); ctx.globalAlpha = 0.16; ctx.strokeStyle = '#e8fbff'; ctx.lineWidth = 1;
      for (let yy = -46; yy < 6; yy += 4) { ctx.beginPath(); ctx.moveTo(-14, yy); ctx.lineTo(14, yy); ctx.stroke(); }
      ctx.restore();
      if (!reduce) for (let i = 0; i < 3; i++) {
        const ang = t / 520 + i * 2.1 + a.ph;
        ctx.fillStyle = glow; ctx.fillRect(Math.cos(ang) * 18, Math.sin(ang) * 7 - 20, 2.2, 2.2);
      }
    }
    if (a.bot) drawCrown(0, -64, true);
    else if (a.coord) drawCrown(0, -56, false);
    if (a.shield) drawShield(16, -14);
    ctx.restore();
  }

  function layout() {
    const rect = palco.getBoundingClientRect();
    viewW = Math.max(1, rect.width); viewH = Math.max(1, rect.height);
    dpr = Math.min(viewW < 720 ? 1.25 : 2, devicePixelRatio || 1);
    cvs.width = Math.round(viewW * dpr); cvs.height = Math.round(viewH * dpr);
  }
  function camera() {
    if (seguir) {
      const p = project(player.c, player.r, 0);
      const z = viewW < 720 ? 1.62 : 2.05;
      const baixo = viewH < 360 ? 0.7 : 0.6;
      cam = { s: z, ox: viewW / 2 - p.x * z, oy: viewH * baixo - p.y * z };
      return;
    }
    const b = boundsOf(focusId);
    const s = Math.min((viewW - 12) / b.w, (viewH - 12) / b.h, focusId ? 2.05 : 4);
    cam = { s, ox: (viewW - b.w * s) / 2 - b.x * s, oy: (viewH - b.h * s) / 2 - b.y * s };
  }
  const toScreen = (x, y) => ({ x: x * cam.s + cam.ox, y: y * cam.s + cam.oy });
  function unproject(sx, sy) {
    const x = (sx - cam.ox) / cam.s, y = (sy - cam.oy) / cam.s;
    return { c: (x / (TW / 2) + y / (TH / 2)) / 2, r: (y / (TH / 2) - x / (TW / 2)) / 2 };
  }
  function visivel(a) { return !focusId || a.roomId === focusId || seguir; }

  function drawLabels() {
    const overview = !seguir && !focusId && cam.s < 0.72;
    if (overview) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 12px system-ui,sans-serif';
      for (const rm of ROOMS) {
        const p = toScreen(project(rm.c + rm.w / 2, rm.r + rm.h / 2, 6).x, project(rm.c + rm.w / 2, rm.r + rm.h / 2, 6).y);
        const w = ctx.measureText(rm.short).width + 16;
        rr(p.x - w / 2, p.y - 10, w, 20, 8, 'rgba(8,10,16,.88)');
        ctx.fillStyle = rm.col; ctx.fillRect(p.x - w / 2 + 6, p.y - 3, 7, 7);
        ctx.fillStyle = '#fff'; ctx.fillText(rm.short, p.x + 5, p.y + 1);
      }
      return;
    }
    const placed = [];
    ctx.font = '700 12px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const a of agents.slice().sort((a, b) => a.r - b.r)) {
      if (!visivel(a)) continue;
      const feet = project(a.c, a.r, 0);
      const s = toScreen(feet.x, feet.y - 78);
      const extra = a.ceo ? ' · você' : (a.coord || a.bot ? ' ★' : '') + (a.shield ? ' 🛡' : '');
      const label = (a.ceo ? a.nome : a.name) + extra;
      const w = Math.min(220, ctx.measureText(label).width + (a.status ? 22 : 14));
      let y = s.y;
      for (const p of placed) if (Math.abs(p.x - s.x) < (p.w + w) / 2 && Math.abs(p.y - y) < 18) y = p.y - 18;
      placed.push({ x: s.x, y, w });
      const hot = hover === a;
      rr(s.x - w / 2, y - 10, w, 20, 8, hot || a.ceo ? '#fffdf6' : 'rgba(8,10,16,.88)', a.ceo ? '#e2c27a' : a.room.col);
      ctx.fillStyle = hot || a.ceo ? '#1b1f2e' : '#fff';
      ctx.fillText(label, s.x + (a.status ? 4 : 0), y);
      if (a.status) {
        const dot = { digitando: '#7ee07e', 'em foco': '#ffb84d', 'em reunião': '#ff6f6f', disponível: '#4dd2ff' }[a.status];
        ctx.fillStyle = dot; ctx.beginPath(); ctx.arc(s.x - w / 2 + 8, y, 3.1, 0, 7); ctx.fill();
      }
      hits.push({ a, x: s.x, y: y + 36, r: 36 });
      if (a.ceo) {
        const seta = toScreen(feet.x, feet.y - 108);
        const bob = reduce ? 0 : Math.sin(t / 280) * 3;
        ctx.strokeStyle = '#f0d78c'; ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(seta.x - 8, seta.y + bob); ctx.lineTo(seta.x, seta.y + 9 + bob); ctx.lineTo(seta.x + 8, seta.y + bob); ctx.stroke();
      }
    }
  }
  function drawBaloes() {
    baloes.length = 0;
    let falar = null, fd = FALAR;
    for (const a of agents) {
      if (a.ceo || !visivel(a)) continue;
      if (a.missao?.chegou) { porBalao(a, 'aviso'); continue; }
      const d = dist(a, player);
      if (d < fd && !a.missao) { fd = d; falar = a; }
    }
    if (falar) porBalao(falar, 'falar');
  }
  function porBalao(a, tipo) {
    const feet = project(a.c, a.r, 0);
    const s = toScreen(feet.x, feet.y - 122);
    ctx.font = '700 12px system-ui,sans-serif';
    const texto = tipo === 'aviso' ? 'aviso' : 'Falar';
    const w = ctx.measureText(texto).width + 28;
    const x = s.x - w / 2, y = s.y - 12;
    rr(x, y, w, 22, 8, '#fffdf6', '#1b1f2e');
    if (tipo === 'aviso') {
      ctx.fillStyle = '#c4552a';
      ctx.beginPath(); ctx.moveTo(x + 12, y + 4); ctx.lineTo(x + 20, y + 18); ctx.lineTo(x + 4, y + 18); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '700 10px system-ui,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('!', x + 12, y + 16);
    }
    ctx.fillStyle = '#1b1f2e'; ctx.font = '700 12px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(texto, s.x + (tipo === 'aviso' ? 8 : 0), s.y - 1);
    baloes.push({ a, x, y, w, h: 22, tipo });
  }
  function captionSala() {
    if (!seguir) return;
    const rm = salaDe(player.c, player.r);
    const texto = rm ? (rm.sub ? rm.name + ' · ' + rm.sub : rm.name) : 'Corredor';
    ctx.font = '700 13px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(texto).width + 16;
    rr(12, 10, w, 22, 8, 'rgba(8,10,16,.88)');
    ctx.fillStyle = rm ? rm.col : '#e2c27a'; ctx.fillRect(18, 16, 8, 8);
    ctx.fillStyle = '#fff'; ctx.fillText(texto, 32, 21);
  }

  function frame(ts) {
    t = ts || 0;
    if (!viewW) layout();
    camera();
    hits.length = 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0e1016'; ctx.fillRect(0, 0, viewW, viewH);
    ctx.setTransform(dpr * cam.s, 0, 0, dpr * cam.s, dpr * cam.ox, dpr * cam.oy);
    if (focusId && !seguir) {
      const rm = room(focusId), pad = 0.15;
      ctx.save();
      ctx.beginPath();
      const a = project(rm.c - pad, rm.r - pad), b = project(rm.c + rm.w + pad, rm.r - pad);
      const c = project(rm.c + rm.w + pad, rm.r + rm.h + pad), d = project(rm.c - pad, rm.r + rm.h + pad);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
      ctx.clip();
    }
    drawWalls(); drawFloor();
    pool(8, 1.6, 80, 'rgba(240,215,140,.16)');
    pool(12.8, 14.2, 70, 'rgba(224,192,128,.16)');
    pool(17.2, 14.4, 60, 'rgba(126,200,195,.16)');
    medallion(9.5, 5.5);
    const list = [];
    const add = (k, fn) => list.push({ k, fn });
    add(7.2, drawMesaExec);
    for (const a of agents) if (a.desk && visivel(a)) add(a.desk[0] + a.desk[1] + 0.2, () => drawDesk(a));
    [[1, 9], [11, 9], [18, 7], [1, 13], [4, 15], [6, 13]].forEach(([c, r]) => add(c + r, () => drawPlant(c, r)));
    add(26, drawMesaCopa); add(26.2, drawCafe); add(30, drawLounge);
    for (const a of agents) if (visivel(a)) add(a.c + a.r + 0.05, () => drawAgent(a, andando(a)));
    list.sort((a, b) => a.k - b.k);
    for (const it of list) it.fn();
    drawGlass();
    if (mouse && seguir) {
      const w = unproject(mouse.x, mouse.y);
      const cell = perto(w.c, w.r, 1);
      if (cell) {
        ctx.globalAlpha = 0.35;
        tile(cell.c, cell.r, '#e2c27a');
        ctx.globalAlpha = 1;
      }
    }
    if (focusId && !seguir) ctx.restore();
    for (const a of agents) if (visivel(a)) {
      const feet = project(a.c, a.r, 0);
      const s = toScreen(feet.x, feet.y - 20);
      hits.push({ a, x: s.x, y: s.y, r: 28 });
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (focusId && !seguir) {
      const rm = room(focusId);
      const texto = rm.sub ? rm.name + ' · ' + rm.sub : rm.name;
      ctx.font = '700 13px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(texto).width + 16;
      rr(12, 10, w, 22, 8, 'rgba(8,10,16,.88)');
      ctx.fillStyle = rm.col; ctx.fillRect(18, 16, 8, 8);
      ctx.fillStyle = '#fff'; ctx.fillText(texto, 32, 21);
    }
    captionSala();
    drawLabels();
    drawBaloes();
    hover = null;
    if (mouse) {
      let best = null, bd = 1e9;
      for (const h of hits) { const d = Math.hypot(mouse.x - h.x, mouse.y - h.y); if (d < h.r && d < bd) { bd = d; best = h.a; } }
      hover = best;
    }
    const sobreBalao = mouse && baloes.some((b) => mouse.x >= b.x && mouse.x <= b.x + b.w && mouse.y >= b.y && mouse.y <= b.y + b.h);
    cvs.style.cursor = hover || sobreBalao ? 'pointer' : 'crosshair';
    if (!ready) { ready = true; window.__workai.ready = true; }
  }

  let acc = 0, accDraw = 0, last = 0, running = false;
  function loop(ts) {
    if (document.hidden) { running = false; return; }
    const dt = Math.min(80, last ? ts - last : 16);
    last = ts;
    if (!congelado) {
      acc += dt;
      if (acc > 100) acc = 100;
      while (acc >= PASSO) { update(PASSO); acc -= PASSO; }
    }
    accDraw += dt;
    if (accDraw >= PASSO) { frame(ts); accDraw %= PASSO; }
    requestAnimationFrame(loop);
  }

  const card = document.getElementById('card');
  const corpo = document.getElementById('card-corpo');
  let cardAberto = null;
  function fechar() {
    if (cardAberto?.missao?.lida) soltar(cardAberto);
    cardAberto = null;
    card.hidden = true;
  }
  function abrir(a, pt) {
    if (cardAberto && cardAberto !== a && cardAberto.missao?.lida) soltar(cardAberto);
    cardAberto = a;
    corpo.replaceChildren();
    const h = document.createElement('h3');
    h.id = 'card-nome';
    h.textContent = (a.ceo ? a.nome : a.name) + (a.coord ? ' ★' : '') + (a.shield ? ' 🛡' : '');
    const papel = document.createElement('p'); papel.className = 'papel';
    papel.textContent = a.ceo ? 'CEO' : a.bot ? 'CTO' : a.coord ? 'Coordenador' : a.shield ? 'Segurança' : 'Agente';
    const area = document.createElement('p'); area.className = 'area';
    const dot = document.createElement('span'); dot.className = 'ponto'; dot.style.background = a.room.col;
    area.append(dot, document.createTextNode(a.room.sub ? a.room.name + ' · ' + a.room.sub : a.room.name));
    corpo.append(h, papel, area);
    if (a.bot) { const g = document.createElement('p'); g.textContent = 'Gerente dos agentes.'; corpo.append(g); }
    else if (!a.ceo) {
      const role = document.createElement('p');
      role.textContent = a.role.charAt(0).toUpperCase() + a.role.slice(1) + '.';
      corpo.append(role);
    }
    if (!a.ceo) {
      const resp = document.createElement('p');
      const sm = document.createElement('small'); sm.textContent = 'Responde a: ';
      resp.append(sm, document.createTextNode(reportsTo(a)));
      corpo.append(resp);
    }
    if (a.status) {
      const st = document.createElement('p');
      const sm2 = document.createElement('small'); sm2.textContent = 'Status: ' + a.status + ' (ilustrativo)';
      st.append(sm2); corpo.append(st);
    }
    if (a.missao) {
      const msg = document.createElement('p'); msg.className = 'msg';
      const b = document.createElement('b'); b.textContent = a.missao.demo ? 'Mensagem (demo)' : 'Mensagem';
      msg.append(b, document.createTextNode(' ' + a.missao.texto));
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'dispensar'; btn.textContent = 'Dispensar';
      btn.addEventListener('click', () => { soltar(a); cardAberto = null; card.hidden = true; });
      corpo.append(msg, btn);
      a.missao.lida = true;
    }
    card.hidden = false;
    if (window.innerWidth < 960) { card.style.left = '12px'; card.style.top = 'auto'; return; }
    const w = 300, hgt = card.offsetHeight || 200;
    const x = Math.max(8, Math.min((pt?.x || 80) + 12, window.innerWidth - w - 8));
    const y = Math.max(8, Math.min((pt?.y || 80) + 12, window.innerHeight - hgt - 8));
    card.style.left = x + 'px'; card.style.top = y + 'px';
  }
  document.getElementById('card-fechar').addEventListener('click', fechar);
  card.addEventListener('pointerdown', (e) => e.stopPropagation());

  function clique(x, y, pt) {
    const b = baloes.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (b) { abrir(b.a, pt); return; }
    let best = null, bd = 1e9;
    for (const h of hits) { const d = Math.hypot(x - h.x, y - h.y); if (d < h.r && d < bd) { bd = d; best = h; } }
    if (best) { abrir(best.a, pt); return; }
    const wpt = unproject(x, y);
    const cell = perto(wpt.c, wpt.r, 3);
    if (!cell) return;
    player.caminho = astar(player, { c: cell.c + 0.5, r: cell.r + 0.5 });
    player.passo = 0;
    seguir = true; focusId = ''; syncChips();
  }
  const local = (e) => { const b = cvs.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top, pt: { x: e.clientX, y: e.clientY } }; };
  cvs.addEventListener('pointerdown', (e) => { const p = local(e); clique(p.x, p.y, p.pt); });
  cvs.addEventListener('pointermove', (e) => { const p = local(e); mouse = { x: p.x, y: p.y }; });
  cvs.addEventListener('pointerleave', () => { mouse = null; });

  const MOVER = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd']);
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { fechar(); return; }
    const k = e.key.toLowerCase();
    if (!MOVER.has(k) || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    keys.add(k);
    seguir = true; focusId = ''; syncChips();
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());

  const salas = document.getElementById('salas');
  function syncChips() {
    for (const b of salas.querySelectorAll('button')) b.classList.toggle('is-on', !seguir && b.dataset.id === focusId);
  }
  function setFocus(id) {
    focusId = id; seguir = false; syncChips();
  }
  function chip(id, label, col) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.id = id; b.textContent = label;
    b.style.setProperty('--c', col); b.addEventListener('click', () => setFocus(id)); salas.append(b);
  }
  chip('', 'Visão geral', '#e2c27a');
  ROOMS.forEach((r) => chip(r.id, r.short, r.col));
  document.getElementById('centralizar').addEventListener('click', () => { seguir = true; focusId = ''; syncChips(); });
  syncChips();

  const arvore = document.getElementById('arvore');
  function montarArvore() {
    arvore.replaceChildren();
    const linha = (cls, texto, agente, aoClicar) => {
      const el = aoClicar || agente ? document.createElement('button') : document.createElement('div');
      el.className = cls; if (el.tagName === 'BUTTON') el.type = 'button';
      el.textContent = texto;
      if (aoClicar) el.addEventListener('click', aoClicar);
      else if (agente) el.addEventListener('click', () => abrir(agente, el.getBoundingClientRect()));
      arvore.append(el);
    };
    linha('n0', nomeCeo() + ' (CEO)', null, () => { seguir = true; focusId = ''; syncChips(); abrir(player, { x: 80, y: 120 }); });
    linha('n1', 'Dyno Bot · CTO · gerente', achar('Dyno Bot'));
    linha('n2', 'Recap AI', achar('Recap AI'));
    for (const rm of ROOMS) {
      if (rm.id === 'dir' || rm.id === 'copa' || rm.id === 'desc' || rm.id === 'op') continue;
      const coord = agents.find((a) => a.roomId === rm.id && a.coord);
      if (!coord) continue;
      linha('n2', '★ ' + coord.name + ' · ' + rm.short, coord);
      agents.filter((a) => a.roomId === rm.id && !a.coord).forEach((a) => linha('n3', a.name + (a.shield ? ' · segurança' : ''), a));
    }
  }
  montarArvore();

  function nomeSeguro(bruto) {
    const t = String(bruto || '').replace(/\s+/g, ' ').trim();
    if (!/^[\p{L}][\p{L} .'-]{0,40}$/u.test(t)) return '';
    if (/@|\d/.test(t)) return '';
    const primeiro = t.split(' ')[0];
    if (primeiro.length < 2 || primeiro.length > 24) return '';
    return primeiro;
  }
  fetch('/admin/auth/conta/eu', { credentials: 'same-origin', headers: { 'x-dm-admin': '1' } })
    .then((r) => r.ok ? r.json() : null)
    .then((j) => {
      const n = nomeSeguro(j && j.nome);
      if (!n) return;
      player.nome = n;
      montarArvore();
    })
    .catch(() => {});

  function colocar(nome, c, r) {
    const a = nome === 'Daniel' || nome === player.nome ? player : achar(nome);
    if (!a) return false;
    a.c = c; a.r = r; a.caminho = null; a.passo = 0;
    return true;
  }
  window.WorkAI = { notify };
  window.__workai = {
    notify, erros, colocar,
    get ready() { return ready; },
    get player() { return player; },
    rota: (c, r, c2, r2) => astar({ c, r }, { c: c2, r: r2 }).length,
    congelar: (v) => { congelado = !!v; },
    visao: (modo) => { seguir = modo === 'seguir'; if (modo !== 'sala') focusId = ''; syncChips(); },
    focar: (id) => setFocus(id),
    avancar: (ms) => { const n = Math.min(8000, ms / PASSO); for (let i = 0; i < n; i++) update(PASSO); },
    chegar: (nome, texto) => {
      notify(nome, texto, { demo: true });
      const a = achar(nome);
      if (!a?.missao) return false;
      const v = vizinhoDo(player, a);
      a.c = v.c; a.r = v.r; a.caminho = null; a.missao.chegou = true;
      return true;
    },
    demo: (ligado) => { demoEm = ligado ? 8000 : 1e15; },
    get baloes() { return baloes.map((b) => ({ nome: b.a.name, tipo: b.tipo, x: b.x, y: b.y, w: b.w, h: b.h })); },
    estado: () => agents.map((a) => ({ name: a.name, sala: (salaDe(a.c, a.r) || {}).id || 'corredor', andando: andando(a), missao: !!(a.missao && a.missao.chegou), passou: a.passou || {} }))
  };

  addEventListener('resize', layout);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !running) { running = true; last = 0; requestAnimationFrame(loop); }
  });
  layout();
  running = true;
  requestAnimationFrame(loop);
})();
