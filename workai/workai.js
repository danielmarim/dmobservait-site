// WorkAI — escritório isométrico desenhado no canvas (sem sprites de terceiros).
// Os status são ilustrativos: nada aqui lê sistema real nem dado de cliente.
(() => {
  const COLS = 16, ROWS = 12, TW = 72, TH = 36, WALL = 62;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ROOMS = [
    { id: 'op', name: 'DM Operação', sub: 'sala do head', short: 'Operação', col: '#e2b657', c: 0.35, r: 0.35, w: 5.05, h: 5.05 },
    { id: 'sre', name: 'DM SRE & O11y', short: 'SRE & O11y', col: '#3ec6e0', c: 5.55, r: 0.35, w: 5.05, h: 5.05 },
    { id: 'mkt', name: 'Dyno Marketing', short: 'Marketing', col: '#ff6fa8', c: 10.75, r: 0.35, w: 4.9, h: 5.05 },
    { id: 'com', name: 'Dyno Comercial', short: 'Comercial', col: '#7dce7a', c: 0.35, r: 6.55, w: 5.05, h: 5.05 },
    { id: 'prd', name: 'DM Produto & Receita', short: 'Produto', col: '#b18cff', c: 5.55, r: 6.55, w: 5.05, h: 5.05 },
    { id: 'copa', name: 'Copa & Reuniões', short: 'Copa', col: '#e0c080', c: 10.75, r: 6.55, w: 4.9, h: 5.05 }
  ];
  const room = (id) => ROOMS.find((r) => r.id === id);

  const RAW = [
    ['op', 'Dyno Bot', 'gerente de todos os agentes', 1, 0, 1.15, 1.15],
    ['op', 'Recap AI', 'atas e follow-ups', 0, 0, 3.15, 2.35],
    ['sre', 'Dyno Atlas', 'engenharia de IA e DevOps', 1, 0, 6.15, 1.2],
    ['sre', 'Stan', 'chamados N2/N3', 0, 0, 8.55, 1.2],
    ['sre', 'Observa AI', 'observabilidade e banco de dados', 0, 0, 6.35, 3.15],
    ['sre', 'Sentinela', 'segurança', 0, 1, 8.75, 3.15],
    ['mkt', 'Zia', 'social media', 1, 0, 11.35, 1.15],
    ['mkt', 'Trend AI', 'pautas do Instagram', 0, 0, 13.15, 1.15],
    ['mkt', 'Criativos AI', 'imagens e vídeos', 0, 0, 11.55, 3.2],
    ['mkt', 'Rank AI', 'SEO e textos dos sites', 0, 0, 13.45, 3.2],
    ['mkt', 'Scout AI', 'concorrentes', 0, 0, 14.55, 2.05],
    ['com', 'ProspectAI', 'prospecção B2B no Brasil', 1, 0, 1.2, 7.35],
    ['com', 'Tráfego AI', 'anúncios (teto de R$ 15 por dia)', 0, 0, 3.35, 7.35],
    ['com', 'Tone AI', 'tom das mensagens', 0, 0, 2.15, 9.45],
    ['prd', 'Produto AI', 'PM das duas linhas', 1, 0, 6.2, 7.3],
    ['prd', 'Receita AI', 'receita', 0, 0, 8.45, 7.3],
    ['prd', 'Spend AI', 'assinaturas e custos', 0, 0, 6.4, 9.45],
    ['prd', 'Sucesso AI', 'CS do Business', 0, 0, 8.65, 9.45]
  ];
  const HAIR = ['#2a1810', '#5c3a22', '#14161c', '#d1b36a', '#6d3ea3', '#1c4f46', '#efe8dc'];
  const SKIN = ['#f6d7bd', '#e4b48e', '#c68642', '#8d5524', '#ffe0cc'];
  const STATUS = ['digitando', 'em foco', 'em reunião', 'disponível'];
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
  const agents = RAW.map((a) => {
    const h = hash(a[1]);
    const rm = room(a[0]);
    return {
      roomId: a[0], room: rm, name: a[1], role: a[2], coord: !!a[3], shield: !!a[4], bot: a[1] === 'Dyno Bot',
      deskC: a[5], deskR: a[6], homeC: a[5] + 0.18, homeR: a[6] + 0.98,
      c: a[5] + 0.18, r: a[6] + 0.98,
      hair: HAIR[h % HAIR.length], skin: a[1] === 'Dyno Bot' ? '#d7f6ff' : SKIN[h % SKIN.length],
      hairStyle: h % 6, ph: (h % 628) / 100, status: STATUS[h % 4], walk: null
    };
  });
  const byName = (n) => agents.find((a) => a.name === n);
  const reportsTo = (a) => {
    if (a.name === 'Dyno Bot') return 'Daniel (CEO)';
    if (a.roomId === 'op' || a.coord) return 'Dyno Bot';
    return agents.find((x) => x.roomId === a.roomId && x.coord)?.name || 'Dyno Bot';
  };

  const cvs = document.getElementById('c');
  const ctx = cvs.getContext('2d');
  const palco = document.getElementById('palco');
  let viewW = 1, viewH = 1, dpr = 1, focusId = '', t = 0, cam = { s: 1, ox: 0, oy: 0 };
  let mouse = null, hover = null, ready = false;
  const visivel = (a) => !focusId || a.roomId === focusId;
  const hits = [];

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
  const rr = (x, y, w, h, r, fill, stroke) => {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = 1.5; ctx.strokeStyle = stroke; ctx.stroke(); }
  };

  function boundsOf(id) {
    const pts = [];
    const add = (c, r, h) => pts.push(project(c, r, h));
    if (!id) {
      add(-0.55, -0.45, WALL); add(COLS + 0.2, -0.45, WALL);
      add(-0.55, ROWS + 0.15, 0); add(COLS + 0.2, ROWS + 0.15, 0);
    } else {
      const rm = room(id);
      add(rm.c - 0.15, rm.r - 0.15, 78); add(rm.c + rm.w + 0.2, rm.r - 0.1, 70);
      add(rm.c - 0.1, rm.r + rm.h + 0.35, 0); add(rm.c + rm.w + 0.25, rm.r + rm.h + 0.35, 0);
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    return { x: minX - 18, y: minY - 16, w: maxX - minX + 36, h: maxY - minY + 36 };
  }

  function drawWalls() {
    const h = WALL;
    quad(project(0, -0.28, h), project(COLS, -0.28, h), project(COLS, -0.28, 0), project(0, -0.28, 0), '#3a342c');
    quad(project(-0.28, 0, h), project(-0.28, ROWS, h), project(-0.28, ROWS, 0), project(-0.28, 0, 0), '#2e2924');
    quad(project(0, -0.28, h + 6), project(COLS, -0.28, h + 6), project(COLS, -0.28, h), project(0, -0.28, h), '#e2c27a');
    quad(project(-0.28, 0, h + 6), project(-0.28, ROWS, h + 6), project(-0.28, ROWS, h), project(-0.28, 0, h), '#c4a15a');
    const win = (c0, c1, h0, h1) => {
      quad(project(c0, -0.22, h1), project(c1, -0.22, h1), project(c1, -0.22, h0), project(c0, -0.22, h0), '#c5e7f2');
      quad(project(c0, -0.22, h1), project(c1, -0.22, h1), project(c1, -0.22, h1 - 2), project(c0, -0.22, h1 - 2), '#f7f1e4');
    };
    win(1.2, 3.1, 18, 46); win(6.4, 8.5, 18, 46); win(11.6, 13.8, 18, 46);
  }

  function drawFloor() {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const alt = (c + r) % 2 === 0;
      quad(project(c, r), project(c + 1, r), project(c + 1, r + 1), project(c, r + 1), alt ? '#1c1f29' : '#171a22');
    }
    for (const rm of ROOMS) {
      quad(project(rm.c, rm.r), project(rm.c + rm.w, rm.r), project(rm.c + rm.w, rm.r + rm.h), project(rm.c, rm.r + rm.h), rm.col + '22');
      ctx.beginPath();
      const a = project(rm.c, rm.r), b = project(rm.c + rm.w, rm.r), c = project(rm.c + rm.w, rm.r + rm.h), d = project(rm.c, rm.r + rm.h);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
      ctx.strokeStyle = rm.col; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.6; ctx.stroke(); ctx.globalAlpha = 1;
    }
    const edge = [project(0, 0), project(COLS, 0), project(COLS, ROWS), project(0, ROWS)];
    ctx.beginPath(); edge.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
    ctx.strokeStyle = 'rgba(226,194,122,.8)'; ctx.lineWidth = 2.2; ctx.stroke();
    medallion(8, 5.85);
    vine(project(1.1, 0.7), 0.6); vine(project(14.6, 0.8), 2.2); vine(project(1.2, 11.1), -0.8); vine(project(14.5, 11), 3.6);
  }

  function medallion(c, r) {
    const p = project(c, r, 0);
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 0.5);
    ctx.strokeStyle = 'rgba(226,194,122,.8)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 34, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, 7); ctx.stroke();
    ctx.fillStyle = 'rgba(226,194,122,.9)';
    for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.ellipse(26, 0, 6, 3, 0, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  function vine(p, rot) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(rot); ctx.scale(1, 0.62);
    ctx.strokeStyle = 'rgba(226,194,122,.9)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(18, -16, 36, 8, 58, -2); ctx.bezierCurveTo(74, -8, 78, 14, 64, 26); ctx.stroke();
    ctx.fillStyle = 'rgba(226,194,122,.85)';
    [[34, -2, 0.4], [60, 16, 1.1], [18, 6, -0.6]].forEach(([x, y, a]) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, 0, 8, 3.4, 0, 0, 7); ctx.fill(); ctx.restore();
    });
    ctx.restore();
  }
  function pool(c, r, rad, color) {
    const p = project(c, r, 0);
    const g = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, rad);
    g.addColorStop(0, color); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(p.x, p.y, rad, rad * 0.52, 0, 0, 7); ctx.fill();
  }

  function drawDesk(a) {
    const c = a.deskC, r = a.deskR;
    box(c, r + 0.72, 0.42, 0.42, 8, '#3d4454', '#2c3342', '#232a36');
    box(c + 0.08, r + 0.78, 0.1, 0.34, 16, '#4a5366', '#353c4e', '#2a3140');
    box(c, r, 1.22, 0.7, 16, '#c49a6a', '#8a5a38', '#5c3b28');
    box(c + 0.28, r + 0.08, 0.42, 0.12, 30, '#1b1e28', '#12151c', '#0c0e14');
    const on = a.status === 'digitando' || Math.sin(t / 400 + a.ph) > -0.2;
    quad(project(c + 0.32, r + 0.1, 28), project(c + 0.66, r + 0.1, 28), project(c + 0.66, r + 0.1, 18), project(c + 0.32, r + 0.1, 18), on ? a.room.col + 'cc' : '#243040');
    if (on) {
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      for (let i = 0; i < 3; i++) {
        const y = 20 + i * 2.4;
        const w = 6 + ((i + Math.floor(t / 180)) % 3) * 3;
        const p = project(c + 0.36, r + 0.1, y);
        ctx.fillRect(p.x, p.y, w, 1.2);
      }
    }
    box(c + 0.34, r + 0.46, 0.4, 0.16, 17, '#2a3142', '#222838', '#1a2030');
    if (hash(a.name) % 2 === 0) {
      const m = project(c + 1.02, r + 0.28, 20);
      ellipse(m.x, m.y, 5, 3, '#f4f1ea');
      ctx.fillStyle = a.room.col; ctx.fillRect(m.x - 4, m.y - 7, 8, 6);
    }
  }

  function drawPlant(c, r, s = 1) {
    box(c, r, 0.38 * s, 0.38 * s, 8 * s, '#a8643e', '#7a4528', '#5a321c');
    const p = project(c + 0.19 * s, r + 0.19 * s, 10 * s);
    const leaves = [['#1e7a46', -10, -8, 14, 7], ['#3cb371', 8, -10, 13, 6], ['#145c34', 0, -16, 12, 7], ['#2e9a5a', -6, -4, 11, 5]];
    leaves.forEach(([col, x, y, rx, ry], i) => {
      ctx.save(); ctx.translate(p.x + x * s, p.y + y * s); ctx.rotate(-0.4 + i); ellipse(0, 0, rx * s, ry * s, col, '#0e3d22'); ctx.restore();
    });
  }

  function drawSofa(c, r, len) {
    box(c, r, len, 0.78, 12, '#4a5568', '#343e50', '#283140');
    box(c, r, len, 0.22, 26, '#5c677a', '#3d485c', '#303848');
    box(c, r, 0.2, 0.78, 18, '#5c677a', '#3d485c', '#303848');
    box(c + len - 0.2, r, 0.2, 0.78, 18, '#5c677a', '#3d485c', '#303848');
    box(c + 0.28, r + 0.28, len / 2 - 0.24, 0.4, 15, '#6b768a', '#4a5568', '#3a4454');
    box(c + len / 2 + 0.06, r + 0.28, len / 2 - 0.34, 0.4, 15, '#7b879c', '#556070', '#445060');
  }

  function drawRack(c, r) {
    box(c, r, 0.55, 0.4, 36, '#2a3140', '#1c2432', '#121820');
    for (let i = 0; i < 5; i++) {
      const on = reduce ? i % 2 === 0 : Math.sin(t / 220 + i) > 0;
      quad(project(c + 0.55, r + 0.08, 8 + i * 5), project(c + 0.55, r + 0.3, 8 + i * 5), project(c + 0.55, r + 0.3, 10 + i * 5), project(c + 0.55, r + 0.08, 10 + i * 5), on ? '#7dffb3' : '#1d4d38');
    }
  }

  function drawBoard(c, r, cd, colors) {
    box(c, r, 0.1, cd, 28, '#d9d4c8', '#f7f4ee', '#c8c2b6');
    colors.forEach((col, i) => {
      const y0 = 0.12 + i * (cd / colors.length);
      const bh = 8 + (i % 3) * 4;
      quad(project(c + 0.1, r + y0, 8), project(c + 0.1, r + y0 + 0.16, 8), project(c + 0.1, r + y0 + 0.16, 8 + bh), project(c + 0.1, r + y0, 8 + bh), col);
    });
  }

  function drawColumn(c, r) {
    const p = project(c + 0.35, r + 0.35, 0);
    const top = project(c + 0.35, r + 0.35, 84);
    ellipse(p.x, p.y, 20, 9, '#e2c27a');
    ctx.fillStyle = '#f4efe6';
    ctx.beginPath(); ctx.moveTo(p.x - 13, p.y); ctx.lineTo(top.x - 11, top.y); ctx.lineTo(top.x + 11, top.y); ctx.lineTo(p.x + 13, p.y); ctx.fill();
    ctx.strokeStyle = 'rgba(226,194,122,.55)'; ctx.lineWidth = 1;
    for (const dx of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(p.x + dx, p.y - 2); ctx.lineTo(top.x + dx * 0.8, top.y); ctx.stroke(); }
    ellipse(top.x, top.y, 16, 7, '#f7f3ea', '#e2c27a');
    ellipse(top.x, top.y - 6, 18, 7, '#e2c27a');
    ellipse(p.x, p.y, 16, 6, '#c4a15a');
  }

  function drawTable() {
    const c = 11.55, r = 8.05;
    for (let i = 0; i < 3; i++) {
      box(c - 0.15 + i * 1.15, r - 0.55, 0.4, 0.4, 8, '#c45a4a', '#8d3a32', '#6a2a26');
      box(c - 0.15 + i * 1.15, r + 1.35, 0.4, 0.4, 8, '#c45a4a', '#8d3a32', '#6a2a26');
    }
    box(c, r, 2.7, 1.35, 14, '#d7b07a', '#a67948', '#6e4a2c');
    box(c + 0.35, r + 0.35, 0.55, 0.32, 18, '#dfe7ea', '#b9c6cc', '#8fa0a8');
    box(c + 1.5, r + 0.55, 0.7, 0.4, 16, '#f4f0e6', '#d9d0c0', '#b7ad9c');
    const cup = project(c + 2.2, r + 0.4, 18);
    ellipse(cup.x, cup.y, 5, 3, '#f7f4ee', '#c4a15a');
  }

  function drawCoffee() {
    box(11.15, 10.35, 1.15, 0.55, 18, '#5c4636', '#3e2e24', '#2a1e18');
    const p = project(11.55, 10.5, 28);
    rr(p.x - 8, p.y - 16, 16, 18, 3, '#2a241c', '#e2c27a');
    ellipse(p.x, p.y - 2, 5, 3, '#6b3a28');
    ctx.fillStyle = '#f4efe4'; ctx.font = '700 9px system-ui,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('café', p.x, p.y - 8);
  }

  function drawSign() {
    box(13.5, 7.05, 1.2, 0.42, 14, '#f7f3ea', '#e7dcc8', '#cbbfa6');
  }

  const props = [];
  const add = (k, fn) => props.push({ k, fn });
  agents.forEach((a) => add(a.deskC + a.deskR + 0.4, () => drawDesk(a)));
  [[0.5, 0.5], [4.5, 4.3], [5.7, 0.5], [9.7, 4.2], [10.9, 4.3], [0.5, 6.7], [4.6, 10.7], [5.7, 10.8], [9.8, 6.7], [14.7, 6.7]].forEach(([c, r]) => add(c + r, () => drawPlant(c, r)));
  add(2.2, () => drawSofa(1.15, 3.55, 1.7));
  add(9.2, () => drawRack(9.55, 0.55));
  add(10.2, () => drawBoard(14.85, 0.7, 1.15, ['#ff6fa8', '#e2b657', '#7dce7a']));
  add(9.4, () => drawBoard(9.85, 8.3, 1.2, ['#b18cff', '#3ec6e0', '#e2b657', '#7dce7a']));
  add(20, () => drawTable());
  add(22, () => drawCoffee());
  add(21.5, () => drawColumn(14.55, 10.15));
  add(15, () => drawSign());
  add(14.2, () => drawSofa(11.2, 10.15, 1.55));

  function drawCrown(x, y, big) {
    ctx.fillStyle = '#ffd76a'; ctx.strokeStyle = '#8a5a12'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    const s = big ? 1 : 0.72;
    ctx.moveTo(x - 8 * s, y + 4); ctx.lineTo(x - 8 * s, y - 2);
    ctx.lineTo(x - 4 * s, y + 2); ctx.lineTo(x, y - 7 * s); ctx.lineTo(x + 4 * s, y + 2);
    ctx.lineTo(x + 8 * s, y - 2); ctx.lineTo(x + 8 * s, y + 4); ctx.closePath();
    ctx.fill(); ctx.stroke();
    if (big) { ctx.fillStyle = '#fff'; ctx.fillRect(x - 1, y - 8, 2, 2); }
  }
  function drawShield(x, y) {
    ctx.fillStyle = '#9bd0ff'; ctx.strokeStyle = '#1e4f86'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 9, y - 5); ctx.lineTo(x + 9, y + 2); ctx.lineTo(x, y + 10); ctx.lineTo(x - 9, y + 2); ctx.lineTo(x - 9, y - 5); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#1e4f86'; ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x - 0.5, y + 3); ctx.lineTo(x + 4, y - 3); ctx.stroke();
  }

  function drawAgent(a, walking) {
    const feet = project(a.c, a.r, 0);
    const bob = reduce ? 0 : walking ? Math.abs(Math.sin(t / 120)) * 2.2 : Math.sin(t / 700 + a.ph) * 1.6;
    const x = feet.x, y = feet.y - bob;
    ctx.save(); ctx.translate(x, y);
    const glow = a.room.col;
    const aura = ctx.createRadialGradient(0, -26, 2, 0, -16, 40);
    aura.addColorStop(0, glow + '55'); aura.addColorStop(1, 'transparent');
    ctx.fillStyle = aura; ellipse(0, -18, 26, 32, aura);
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ellipse(0, 4, 14, 5, 'rgba(0,0,0,.28)');
    if (!reduce) {
      ctx.save(); ctx.strokeStyle = glow; ctx.globalAlpha = 0.75; ctx.setLineDash([3, 4]); ctx.lineWidth = 1.2;
      const pulse = 15 + Math.sin(t / 500 + a.ph) * 1.5;
      ctx.beginPath(); ctx.ellipse(0, 2, pulse, 6, 0, 0, 7); ctx.stroke(); ctx.restore();
    }
    const step = walking && !reduce ? Math.sin(t / 90) * 2.4 : 0;
    const arm = !walking && a.status === 'digitando' && !reduce ? Math.sin(t / 80 + a.ph) * 3 : 0;
    const ink = 'rgba(8,12,20,.9)';
    const cloth = shade(a.room.col, -25);
    rr(-7, -4 + step, 6, 11, 2, '#1c2430', ink); rr(1, -4 - step, 6, 11, 2, '#1c2430', ink);
    rr(-8, 5 + step, 7, 4, 2, '#0e1218', ink); rr(1, 5 - step, 7, 4, 2, '#0e1218', ink);
    rr(-11, -24, 22, 20, 7, cloth, ink);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(-11, -16, 22, 2);
    rr(-16, -22 + arm, 6, 13, 3, cloth, ink); rr(10, -22 - arm, 6, 13, 3, cloth, ink);
    ellipse(-13, -8 + arm, 3.1, 3.1, a.skin, ink); ellipse(13, -8 - arm, 3.1, 3.1, a.skin, ink);
    ellipse(0, -38, 13.5, 13.5, a.skin, ink);
    ellipse(0, -30, 4, 2.2, 'rgba(255,255,255,.18)');
    ctx.fillStyle = a.hair; ctx.strokeStyle = ink; ctx.lineWidth = 1.3;
    ctx.beginPath();
    if (a.bot) {
      ctx.arc(0, -38, 12, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
      ctx.strokeStyle = '#9be7ff'; ctx.beginPath(); ctx.moveTo(0, -48); ctx.lineTo(0, -56); ctx.stroke();
      ellipse(0, -57, 2.4, 2.4, '#9be7ff');
    } else if (a.hairStyle === 1) {
      ctx.arc(0, -38, 12.5, Math.PI, 0); ctx.quadraticCurveTo(11, -30, 8, -26); ctx.lineTo(-4, -28); ctx.quadraticCurveTo(-12, -32, -12, -38); ctx.fill(); ctx.stroke();
    } else if (a.hairStyle === 2) {
      ctx.arc(0, -37, 13, Math.PI, 0); ctx.lineTo(12, -24); ctx.lineTo(8, -24); ctx.lineTo(6, -32); ctx.lineTo(-6, -32); ctx.lineTo(-8, -24); ctx.lineTo(-12, -24); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (a.hairStyle === 3) {
      ctx.arc(0, -38, 12, Math.PI, 0); ctx.fill(); ctx.stroke(); ellipse(0, -50, 5, 5, a.hair, ink);
    } else {
      ctx.arc(0, -38, 12, Math.PI, 0.05); ctx.quadraticCurveTo(4, -30, 2, -28); ctx.lineTo(-8, -30); ctx.quadraticCurveTo(-13, -34, -12, -40); ctx.fill(); ctx.stroke();
    }
    const blink = !reduce && ((t / 1000 + a.ph) % 4.5) < 0.12;
    if (a.bot) {
      rr(-7, -38, 14, 5, 2, blink ? '#145066' : '#16384a', '#9be7ff');
      if (!blink) { ctx.fillStyle = '#9be7ff'; ctx.fillRect(-4, -37, 2, 3); ctx.fillRect(2, -37, 2, 3); }
    } else if (blink) {
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-6, -36, 4, 1.2); ctx.fillRect(2, -36, 4, 1.2);
    } else {
      ellipse(-4, -36, 1.7, 1.9, '#1a1a1a'); ellipse(4, -36, 1.7, 1.9, '#1a1a1a');
      ctx.fillStyle = '#fff'; ctx.fillRect(-4.7, -37.2, 1.3, 1.3); ctx.fillRect(3.3, -37.2, 1.3, 1.3);
      ctx.strokeStyle = 'rgba(90,40,40,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, -32.5, 3.2, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    }
    ctx.save(); ctx.globalAlpha = 0.16; ctx.strokeStyle = '#e8fbff'; ctx.lineWidth = 1;
    for (let yy = -48; yy < 8; yy += 4) { ctx.beginPath(); ctx.moveTo(-16, yy); ctx.lineTo(16, yy); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = glow; ctx.globalAlpha = 0.9; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(-7, -30, 8, Math.PI * 0.6, Math.PI * 1.15); ctx.stroke(); ctx.globalAlpha = 1;
    if (!reduce) {
      for (let i = 0; i < 3; i++) {
        const ang = t / 520 + i * 2.1 + a.ph;
        ctx.fillStyle = glow; ctx.fillRect(Math.cos(ang) * 20, Math.sin(ang) * 8 - 22, 2.5, 2.5);
      }
    }
    if (a.bot) drawCrown(0, -64, true);
    else if (a.coord) drawCrown(0, -58, false);
    if (a.shield) drawShield(18, -16);
    ctx.restore();
    return { x, y };
  }

  function layout() {
    const rect = palco.getBoundingClientRect();
    viewW = Math.max(1, rect.width); viewH = Math.max(1, rect.height);
    dpr = Math.min(2, devicePixelRatio || 1);
    cvs.width = Math.round(viewW * dpr); cvs.height = Math.round(viewH * dpr);
  }
  function camera() {
    const b = boundsOf(focusId);
    const s = Math.min((viewW - 16) / b.w, (viewH - 16) / b.h, focusId ? 2.05 : 4);
    cam = { s, ox: (viewW - b.w * s) / 2 - b.x * s, oy: (viewH - b.h * s) / 2 - b.y * s };
  }
  const toScreen = (x, y) => ({ x: x * cam.s + cam.ox, y: y * cam.s + cam.oy });

  function drawLabels() {
    if (cam.s < 0.85 && !focusId) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 13px system-ui,sans-serif';
      for (const rm of ROOMS) {
        const p = toScreen(project(rm.c + rm.w / 2, rm.r + rm.h / 2, 8).x, project(rm.c + rm.w / 2, rm.r + rm.h / 2, 8).y);
        const label = rm.short;
        const w = ctx.measureText(label).width + 18;
        rr(p.x - w / 2, p.y - 11, w, 22, 8, 'rgba(8,10,16,.86)');
        ctx.fillStyle = rm.col; ctx.fillRect(p.x - w / 2 + 6, p.y - 4, 8, 8);
        ctx.fillStyle = '#fff'; ctx.fillText(label, p.x + 6, p.y);
      }
      return;
    }
    const placed = [];
    const list = agents.slice().sort((a, b) => a.r - b.r);
    ctx.font = '700 12px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const a of list) {
      if (!visivel(a)) continue;
      const feet = project(a.c, a.r, 0);
      const s = toScreen(feet.x, feet.y - 74);
      const extra = (a.coord || a.bot ? ' ★' : '') + (a.shield ? ' 🛡' : '');
      const label = a.name + extra;
      const w = ctx.measureText(label).width + 22;
      let y = s.y;
      for (const p of placed) if (Math.abs(p.x - s.x) < (p.w + w) / 2 && Math.abs(p.y - y) < 18) y = p.y - 18;
      placed.push({ x: s.x, y, w });
      const hot = hover === a || a.walk;
      rr(s.x - w / 2, y - 10, w, 20, 8, hot ? '#fffdf6' : 'rgba(8,10,16,.88)', a.room.col);
      ctx.fillStyle = hot ? '#1b1f2e' : '#fff';
      ctx.fillText(label, s.x + 4, y);
      const dot = { digitando: '#7ee07e', 'em foco': '#ffb84d', 'em reunião': '#ff6f6f', disponível: '#4dd2ff' }[a.status];
      ctx.fillStyle = dot; ctx.beginPath(); ctx.arc(s.x - w / 2 + 8, y, 3.2, 0, 7); ctx.fill();
      hits.push({ a, x: s.x, y: y + 28, r: 34 });
    }
  }

  function bubble(a) {
    if (!a.walk?.msg) return;
    const feet = project(a.c, a.r, 0);
    const s = toScreen(feet.x, feet.y - 86);
    ctx.font = '700 12px system-ui,sans-serif';
    const w = ctx.measureText(a.walk.msg).width + 14;
    rr(s.x - w / 2, s.y - 12, w, 20, 8, '#fffdf6', '#1b1f2e');
    ctx.fillStyle = '#1b1f2e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(a.walk.msg, s.x, s.y - 2);
  }

  function frame(ts) {
    t = ts || 0;
    if (!viewW) layout();
    camera();
    hits.length = 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0e1016'; ctx.fillRect(0, 0, viewW, viewH);
    const b = boundsOf(focusId);
    ctx.setTransform(dpr * cam.s, 0, 0, dpr * cam.s, dpr * cam.ox, dpr * cam.oy);
    ctx.save();
    ctx.beginPath();
    if (focusId) {
      const rm = room(focusId), pad = 0.2;
      const a = project(rm.c - pad, rm.r - pad), c2 = project(rm.c + rm.w + pad, rm.r - pad);
      const d = project(rm.c + rm.w + pad, rm.r + rm.h + pad), e = project(rm.c - pad, rm.r + rm.h + pad);
      ctx.moveTo(a.x, a.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(d.x, d.y); ctx.lineTo(e.x, e.y); ctx.closePath();
    } else ctx.rect(b.x, b.y, b.w, b.h);
    ctx.clip();
    drawWalls(); drawFloor();
    pool(2.5, 2.2, 90, 'rgba(226,182,87,.16)');
    pool(13, 9, 110, 'rgba(255,214,150,.14)');
    const list = props.map((p) => ({ k: p.k, fn: p.fn }));
    for (const a of agents) if (visivel(a)) list.push({ k: a.c + a.r + 0.02, fn: () => drawAgent(a, !!(a.walk && !(a.walk.pts[a.walk.i] || {}).wait)) });
    list.sort((a, b) => a.k - b.k);
    for (const it of list) it.fn();
    for (const a of agents) if (visivel(a)) {
      const feet = project(a.c, a.r, 0);
      const s = toScreen(feet.x, feet.y - 24);
      hits.push({ a, x: s.x, y: s.y, r: 30 });
    }
    ctx.restore();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (focusId) {
      const rm = room(focusId);
      const texto = rm.sub ? `${rm.name} · ${rm.sub}` : rm.name;
      ctx.font = '700 13px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(texto).width + 16;
      rr(12, 10, w, 22, 8, 'rgba(8,10,16,.88)');
      ctx.fillStyle = rm.col; ctx.fillRect(18, 16, 8, 8);
      ctx.fillStyle = '#fff'; ctx.fillText(texto, 32, 21);
    }
    drawLabels();
    for (const a of agents) bubble(a);
    const g = ctx.createRadialGradient(viewW / 2, viewH / 2, viewH * 0.35, viewW / 2, viewH / 2, viewH * 0.72);
    g.addColorStop(0, 'transparent'); g.addColorStop(1, 'rgba(0,0,0,.28)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, viewW, viewH);
    hover = null;
    if (mouse) {
      let best = null, bd = 1e9;
      for (const h of hits) { const d = Math.hypot(mouse.x - h.x, mouse.y - h.y); if (d < h.r && d < bd) { bd = d; best = h.a; } }
      hover = best;
    }
    cvs.style.cursor = hover ? 'pointer' : 'default';
    if (!ready) { ready = true; window.__workai.ready = true; }
    if (!document.hidden) requestAnimationFrame(loop);
  }

  const walkers = [];
  function route(a, to) {
    const aisle = 5.9;
    const same = Math.abs(a.homeR - to.homeR) < 3;
    if (same) return [{ c: to.homeC + 0.85, r: to.homeR }];
    return [{ c: a.c, r: aisle }, { c: to.homeC, r: aisle }, { c: to.homeC + 0.75, r: to.homeR }];
  }
  function startWalk() {
    if (reduce || walkers.length >= 2) return;
    let a, to;
    if (Math.random() < 0.35) {
      a = byName('Dyno Bot');
      to = byName(['Dyno Atlas', 'Zia', 'ProspectAI', 'Produto AI'][Math.floor(Math.random() * 4)]);
    } else {
      const pool = agents.filter((x) => !x.coord && x.roomId !== 'op' && !x.walk);
      if (!pool.length) return;
      a = pool[Math.floor(Math.random() * pool.length)];
      to = agents.find((x) => x.roomId === a.roomId && x.coord);
    }
    if (!a || !to || a.walk || a === to) return;
    const there = route(a, to);
    const back = there.slice(0, -1).reverse().map((p) => ({ ...p }));
    a.walk = { pts: [...there, { wait: 1500, msg: a.name === 'Dyno Bot' ? 'nova tarefa!' : 'pronto ✔' }, ...back, { c: a.homeC, r: a.homeR }], i: 0, wt: 0 };
    walkers.push(a);
  }
  let last = 0;
  function step(ts) {
    const dt = Math.min(40, ts - last || 16); last = ts;
    for (const a of walkers.slice()) {
      const w = a.walk, p = w.pts[w.i];
      if (!p) { a.walk = null; a.c = a.homeC; a.r = a.homeR; walkers.splice(walkers.indexOf(a), 1); continue; }
      if (p.wait) { w.wt += dt; w.msg = p.msg; if (w.wt > p.wait) { w.i++; w.wt = 0; w.msg = null; } continue; }
      w.msg = null;
      const dx = p.c - a.c, dy = p.r - a.r, d = Math.hypot(dx, dy), s = 0.0032 * dt;
      if (d <= s) { a.c = p.c; a.r = p.r; w.i++; } else { a.c += dx / d * s; a.r += dy / d * s; }
    }
  }
  function loop(ts) { step(ts); frame(ts); }

  const card = document.getElementById('card');
  const corpo = document.getElementById('card-corpo');
  function fechar() { card.hidden = true; }
  function abrir(a, pt) {
    corpo.replaceChildren();
    const h = document.createElement('h3'); h.id = 'card-nome'; h.textContent = a.name + (a.coord ? ' ★' : '') + (a.shield ? ' 🛡' : '');
    const papel = document.createElement('p'); papel.className = 'papel';
    papel.textContent = a.bot ? 'Gerente' : a.coord ? 'Coordenador' : a.shield ? 'Segurança' : 'Agente';
    const area = document.createElement('p'); area.className = 'area';
    const dot = document.createElement('span'); dot.className = 'ponto'; dot.style.background = a.room.col;
    area.append(dot, document.createTextNode(a.room.sub ? `${a.room.name} · ${a.room.sub}` : a.room.name));
    const role = document.createElement('p'); role.textContent = a.role.charAt(0).toUpperCase() + a.role.slice(1) + '.';
    const resp = document.createElement('p');
    const sm = document.createElement('small'); sm.textContent = 'Responde a: ';
    resp.append(sm, document.createTextNode(reportsTo(a)));
    const st = document.createElement('p');
    const sm2 = document.createElement('small'); sm2.textContent = `Status: ${a.status} (ilustrativo)`;
    st.append(sm2);
    corpo.append(h, papel, area, role, resp, st);
    card.hidden = false;
    const w = 300, hgt = card.offsetHeight || 180;
    if (window.innerWidth < 960) { card.style.left = '12px'; card.style.top = 'auto'; return; }
    const x = Math.max(8, Math.min((pt?.x || 80) + 12, window.innerWidth - w - 8));
    const y = Math.max(8, Math.min((pt?.y || 80) + 12, window.innerHeight - hgt - 8));
    card.style.left = x + 'px'; card.style.top = y + 'px';
  }
  document.getElementById('card-fechar').addEventListener('click', fechar);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fechar(); });
  card.addEventListener('click', (e) => e.stopPropagation());

  function pick(x, y) {
    let best = null, bd = 1e9;
    for (const h of hits) { const d = Math.hypot(x - h.x, y - h.y); if (d < h.r && d < bd) { bd = d; best = h; } }
    return best;
  }
  cvs.addEventListener('click', (e) => {
    const b = cvs.getBoundingClientRect();
    const hit = pick(e.clientX - b.left, e.clientY - b.top);
    if (!hit) return fechar();
    abrir(hit.a, { x: e.clientX, y: e.clientY });
  });
  cvs.addEventListener('mousemove', (e) => { const b = cvs.getBoundingClientRect(); mouse = { x: e.clientX - b.left, y: e.clientY - b.top }; });
  cvs.addEventListener('mouseleave', () => { mouse = null; });

  const salas = document.getElementById('salas');
  function setFocus(id) {
    focusId = id;
    for (const b of salas.querySelectorAll('button')) b.classList.toggle('is-on', b.dataset.id === id);
  }
  function chip(id, label, col) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.id = id; b.textContent = label;
    b.style.setProperty('--c', col); b.addEventListener('click', () => setFocus(id)); salas.append(b);
  }
  chip('', 'Visão geral', '#e2c27a');
  ROOMS.forEach((r) => chip(r.id, r.short, r.col));
  setFocus('');

  const arvore = document.getElementById('arvore');
  function linha(cls, texto, agente) {
    const el = agente ? document.createElement('button') : document.createElement('div');
    el.className = cls; if (agente) el.type = 'button';
    el.textContent = texto;
    if (agente) el.addEventListener('click', () => { setFocus(agente.roomId); abrir(agente, el.getBoundingClientRect()); });
    arvore.append(el);
  }
  linha('fixo n0', 'Daniel (CEO)');
  linha('n1', 'Dyno Bot · gerente', byName('Dyno Bot'));
  linha('n2', 'Recap AI', byName('Recap AI'));
  for (const rm of ROOMS.filter((r) => r.id !== 'op' && r.id !== 'copa')) {
    const coord = agents.find((a) => a.roomId === rm.id && a.coord);
    const equipe = agents.filter((a) => a.roomId === rm.id && !a.coord);
    linha('n2', `★ ${coord.name} · ${rm.name}`, coord);
    equipe.forEach((a) => linha('n3', a.name + (a.shield ? ' · segurança' : ''), a));
  }

  const aberto = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (aberto) { const a = byName(aberto); if (a) setTimeout(() => abrir(a, { x: 48, y: 120 }), 60); }

  window.__workai = { get ready() { return ready; }, abrir: (n) => { const a = byName(n); if (a) abrir(a, { x: 80, y: 100 }); }, andar: startWalk, agents: () => agents.map((a) => a.name) };
  addEventListener('resize', layout);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) requestAnimationFrame(loop); });
  layout();
  requestAnimationFrame(loop);
  if (!reduce) { setTimeout(startWalk, 4200); setInterval(startWalk, 5200); }
})();
