// WorkAI — escritório 2D visto de cima, estilo Gather (arte e código originais).
// Nada de assets/marca de terceiros. Status ilustrativos. Chat só em localStorage.
// Integração das falas: WorkAI.notify(agentId, texto, { demo: true }).
(() => {
  const COLS = 20, ROWS = 52, TILE = 40;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PASSO = 1000 / 30;
  const ZOOM_MIN = 0.55, ZOOM_MAX = 2.2;
  const PROX = 1.55;

  const ROOMS = [
    { id: 'dir', name: 'Diretoria', short: 'Diretoria', col: '#f0d78c', c: 1, r: 0, w: 18, h: 4, glass: true, ala: 'dm' },
    { id: 'op', name: 'DM Operação', sub: 'sala do head', short: 'Operação', col: '#e2b657', c: 1, r: 7, w: 4, h: 3, ala: 'dm' },
    { id: 'sre', name: 'DM SRE & O11y', short: 'SRE & O11y', col: '#3ec6e0', c: 7, r: 7, w: 5, h: 3, ala: 'dm' },
    { id: 'mkt', name: 'Dyno Marketing', short: 'Marketing', col: '#ff6fa8', c: 14, r: 7, w: 5, h: 3, ala: 'dm' },
    { id: 'com', name: 'Dyno Comercial', short: 'Comercial', col: '#7dce7a', c: 1, r: 13, w: 4, h: 3, ala: 'dm' },
    { id: 'prd', name: 'DM Produto & Receita', short: 'Produto', col: '#b18cff', c: 6, r: 13, w: 4, h: 3, ala: 'dm' },
    { id: 'copa', name: 'Copa & Reuniões', short: 'Copa', col: '#e0c080', c: 11, r: 13, w: 4, h: 3, ala: 'dm', reuniao: true },
    { id: 'desc', name: 'Sala de Descompressão', short: 'Descompressão', col: '#7ec8c3', c: 16, r: 13, w: 3, h: 3, ala: 'dm' },
    { id: 'odyn', name: 'Dyno AI', sub: 'carro-chefe', short: 'Dyno AI', col: '#8fd46a', c: 1, r: 21, w: 10, h: 4, glass: true, ala: 'dyno' },
    { id: 'gab', name: 'Gabinete', short: 'Gabinete', col: '#f0d78c', c: 12, r: 21, w: 7, h: 4, ala: 'dyno' },
    { id: 'cres', name: 'Crescimento', short: 'Crescimento', col: '#f0a05a', c: 1, r: 27, w: 6, h: 3, ala: 'dyno' },
    { id: 'cli', name: 'Clientes', short: 'Clientes', col: '#7eb6e0', c: 8, r: 27, w: 6, h: 3, ala: 'dyno' },
    { id: 'fin', name: 'Finanças', short: 'Finanças', col: '#e2b657', c: 15, r: 27, w: 4, h: 3, ala: 'dyno' },
    { id: 'tec', name: 'Tecnologia', sub: 'Estaleiro e Esteira', short: 'Tecnologia', col: '#3ec6e0', c: 1, r: 33, w: 12, h: 3, ala: 'dyno' },
    { id: 'brev', name: 'Em breve', short: 'Em breve', col: '#8a8f99', c: 14, r: 33, w: 5, h: 3, ala: 'dyno', breve: true },
    { id: 'marca', name: 'Dynamo Wear', sub: 'atendimento', short: 'Atendimento', col: '#ff7a1a', piso: '#2a1c14', c: 1, r: 40, w: 11, h: 4, glass: true, ala: 'wear' },
    { id: 'wped', name: 'Portal', sub: 'afiliados e creators', short: 'Portal', col: '#ffb020', piso: '#241910', c: 13, r: 40, w: 6, h: 4, ala: 'wear' },
    { id: 'wcom', name: 'Financeiro', short: 'Financeiro', col: '#e2c27a', piso: '#241910', c: 1, r: 47, w: 8, h: 3, ala: 'wear' },
    { id: 'wcon', name: 'Produção', sub: 'estoque', short: 'Produção', col: '#ff8a2a', piso: '#241910', c: 10, r: 47, w: 5, h: 3, ala: 'wear' },
    { id: 'wsaida', name: 'Saída de parceiro', short: 'Saída', col: '#8a8f99', piso: '#1c1c1e', c: 16, r: 47, w: 3, h: 3, ala: 'wear', breve: true }
  ];
  const room = (id) => ROOMS.find((r) => r.id === id);
  const salaDe = (c, r) => ROOMS.find((rm) => c >= rm.c && r >= rm.r && c < rm.c + rm.w && r < rm.r + rm.h) || null;

  const PORTAS = [[8, 4], [9, 4], [3, 6], [4, 6], [9, 6], [10, 6], [16, 6], [17, 6], [3, 10], [4, 10], [9, 10], [10, 10], [16, 10], [17, 10], [2, 12], [3, 12], [7, 12], [8, 12], [12, 12], [13, 12], [17, 12], [7, 20], [8, 20], [14, 20], [15, 20], [4, 24], [5, 24], [14, 24], [15, 24], [2, 26], [3, 26], [9, 26], [10, 26], [16, 26], [17, 26], [2, 30], [3, 30], [9, 30], [10, 30], [16, 30], [4, 32], [5, 32], [8, 32], [9, 32], [16, 32], [3, 44], [4, 44], [15, 44], [16, 44], [2, 46], [3, 46], [12, 46], [13, 46], [16, 46], [17, 46]];
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
    { room: 'prd', name: 'Sucesso AI', role: 'CS do Business', desk: [8, 15], c: 8.5, r: 14.35 },
    { room: 'odyn', name: 'Dyno AI', role: 'assistente do produto', destaque: true, tom: '#7dce6a', sit: 'Carro-chefe', cuida: 'Atende quem usa o produto.', nunca: 'Age fora da permissão do produto.', c: 3.5, r: 23.35 },
    { room: 'odyn', name: 'Dina', role: 'agenda e rotina', tom: '#e48ab0', sit: 'Com o Dyno AI', cuida: 'Agenda, lembretes e rotina.', nunca: 'Decide dinheiro ou publica sozinha.', c: 6.5, r: 23.35 },
    { room: 'gab', name: 'Brief AI', role: 'ponte de gestão', brief: true, sit: 'No ar', nivel: '0 · só lê', cuida: 'A mensagem das 9h e a fila única de aprovações.', nunca: 'Executa o que está na fila.', desk: [13, 22], c: 14.5, r: 23.35 },
    { room: 'cres', name: 'Pulse AI', role: 'redes sociais', sit: 'Em parte', nivel: '2 · executa com aprovação', cuida: 'Redes sociais.', nunca: 'Publica sem aprovação.', desk: [2, 27], c: 2.5, r: 28.35 },
    { room: 'cres', name: 'AI SDR', role: 'leads e atendimento', sit: 'Em parte', nivel: '1 · sugere', cuida: 'Leads e atendimento.', nunca: 'Fecha contrato sozinho.', desk: [4, 27], c: 4.5, r: 28.35 },
    { room: 'cres', name: 'Closer AI', role: 'comercial', sit: 'A construir', cuida: 'O comercial, quando existir.', nunca: 'Ainda não atua.', desk: [5, 29], c: 6.5, r: 28.35 },
    { room: 'cli', name: 'Onboard AI', role: 'implantação', sit: 'Em parte', cuida: 'Implantação e o monitor de implantação.', nunca: 'Muda o ambiente sozinho.', desk: [9, 27], c: 9.5, r: 28.35 },
    { room: 'cli', name: 'Care AI', role: 'pós-venda', sit: 'A construir', cuida: 'O pós-venda, quando existir.', nunca: 'Ainda não atua.', desk: [11, 27], c: 11.5, r: 28.35 },
    { room: 'cli', name: 'Help AI', role: 'chamados de primeira linha', sit: 'No ar', nivel: '3 · executa sozinho no limite (em dúvida, duplicado)', cuida: 'Chamados de primeira linha.', nunca: 'Fecha o diagnóstico.', desk: [8, 29], c: 8.5, r: 28.35 },
    { room: 'cli', name: 'Fix AI', role: 'diagnóstico de chamados', sit: 'A construir', cuida: 'O diagnóstico de chamados, quando existir.', nunca: 'Ainda não atua.', desk: [13, 29], c: 12.5, r: 28.35 },
    { room: 'fin', name: 'Cash AI', role: 'recebimentos, cobrança e caixa', sit: 'Em parte', nivel: '2 · executa com aprovação (teto)', cuida: 'Recebimentos, cobrança e caixa.', nunca: 'Passa dinheiro do nível 2.', desk: [16, 27], c: 17.5, r: 28.35 },
    { room: 'tec', name: 'Vigia', role: 'observabilidade do ambiente', sit: 'Em parte', nivel: '0 · só lê', cuida: 'A observabilidade do ambiente.', nunca: 'Corrige o que observa.', desk: [2, 33], c: 2.5, r: 34.35 },
    { room: 'tec', name: 'Insight AI', role: 'qualidade do Dyno AI', sit: 'Em parte', nivel: '1 · sugere', cuida: 'A qualidade do Dyno AI.', nunca: 'Muda o Dyno AI sozinho.', desk: [4, 33], c: 4.5, r: 34.35 },
    { room: 'tec', name: 'Arquiteto', role: 'desenho da mudança', sit: 'No ar', cuida: 'O desenho da mudança na esteira.', nunca: 'Publica direto.', desk: [6, 33], c: 6.5, r: 34.35 },
    { room: 'tec', name: 'Construtor', role: 'monta a mudança', sit: 'No ar', cuida: 'Montar a mudança na esteira.', nunca: 'Aprova a própria peça.', desk: [8, 33], c: 8.5, r: 34.35 },
    { room: 'tec', name: 'Testes', role: 'verifica a mudança', sit: 'No ar', cuida: 'Verificar a mudança.', nunca: 'Publica.', desk: [10, 33], c: 10.5, r: 34.35 },
    { room: 'tec', name: 'Revisor', role: 'revisa a mudança', sit: 'No ar', cuida: 'Revisar a mudança.', nunca: 'Pula a revisão.', desk: [3, 35], c: 3.5, r: 34.35 },
    { room: 'tec', name: 'Sentinela Esteira', role: 'vigia a publicação', sit: 'No ar', cuida: 'Vigiar o passo de publicação.', nunca: 'Publica no lugar do revisor.', desk: [7, 35], c: 7.5, r: 34.35 },
    { room: 'tec', name: 'Gauntlet', role: 'prova ao lado do Estaleiro', sit: 'No ar', cuida: 'A prova ao lado do Estaleiro.', nunca: 'Publica no lugar da esteira.', desk: [12, 33], c: 11.5, r: 35.35 },
    { room: 'brev', name: 'Partner AI', role: 'em breve', breve: true, sit: 'Em breve', cuida: 'Ainda sem função publicada.', nunca: 'Ainda não atua.', c: 15.5, r: 34.35 },
    { room: 'brev', name: 'Ads AI', role: 'em breve', breve: true, sit: 'Em breve', cuida: 'Ainda sem função publicada.', nunca: 'Ainda não atua.', c: 17.5, r: 34.35 },
    { room: 'brev', name: 'Guard AI', role: 'em breve', breve: true, sit: 'Em breve', cuida: 'Ainda sem função publicada.', nunca: 'Ainda não atua.', c: 16.5, r: 35.35 },
    { room: 'marca', name: 'Dyna 2.0', role: 'agente-chefe da Dynamo Wear', chefe: true, tom: '#ff7a1a', sit: 'Em teste', cuida: 'A venda com teto de desconto, o checkout, a aprovação de afiliado, o cupom de parceiro e a qualificação do lead. Em teste, fala só com o time.', nunca: 'Amplia o teste antes de fechar a conversa e a verificação do webhook. Não dá desconto fora da regra. Não fala com cliente enquanto o teste não abrir.', desk: [5, 40], c: 5.5, r: 41.4 },
    { room: 'marca', name: 'Funil Vendas', papel: 'Vendas no WhatsApp', role: 'venda no WhatsApp', sit: 'No ar', cuida: 'A venda no WhatsApp: funil por etapas, catálogo, checkout, cupom de primeira compra e a retomada de quem parou.', nunca: 'Transfere para uma pessoa sem resumo. Não cria cupom fora da primeira compra.', desk: [2, 40], c: 2.5, r: 41.4 },
    { room: 'marca', name: 'Dyna Grupos', papel: 'Grupos', role: 'grupos de creators e sócios', sit: 'Ativo, sem uso', cuida: 'Comandos nos grupos de creators e sócios.', nunca: 'Atende cliente no privado. Não registra uso que não houve.', desk: [9, 40], c: 9.5, r: 41.4 },
    { room: 'wped', name: 'Afiliados e Creators', papel: 'Portal', role: 'portal do afiliado', sit: 'No ar', cuida: 'O cadastro, a aprovação, a meta de conteúdo e o voucher que a meta gera.', nunca: 'Aprova sem o OK previsto. Não cita creator nem mostra entrega real.', desk: [14, 40], c: 15.5, r: 41.4 },
    { room: 'wped', name: 'Cupons', papel: 'Cupom e reconciliação', role: 'cupom na loja', sit: 'No ar', cuida: 'O cupom do afiliado na Shopify e na Yampi, e a reconciliação diária.', nunca: 'Cria cupom sem OK. Não mostra código.', desk: [17, 42], c: 16.5, r: 42.35 },
    { room: 'wcom', name: 'Financeiro Dynamo', papel: 'Pedidos e conciliação', role: 'pedidos e conciliação', sit: 'No ar (manual)', cuida: 'A entrada do pedido, a competência e a conciliação. O passo é manual.', nunca: 'Paga. Dinheiro nunca passa do nível 2. Não concilia sozinho.', desk: [2, 47], c: 4.5, r: 48.35 },
    { room: 'wcon', name: 'Produção e Estoque', papel: 'Inventário', role: 'inventário e produção', sit: 'No ar', cuida: 'O inventário e o quadro de produção.', nunca: 'Cita cliente ou pedido real. Não move o quadro fora do que o pedido já disparou.', desk: [11, 47], c: 12.5, r: 48.35 },
    { room: 'wsaida', name: 'Saída de Parceiro', papel: 'Proposta', role: 'encerramento de parceiro', proposta: true, breve: true, sit: 'Proposta', cuida: 'O encerramento de parceiro, quando existir.', nunca: 'Ainda não atua. Não rescinde contrato.', c: 16.5, r: 48.35 }
  ];

  const W = new Uint8Array(COLS * ROWS);
  const at = (c, r) => r * COLS + c;
  const mark = (c, r, v) => { if (c >= 0 && r >= 0 && c < COLS && r < ROWS) W[at(c, r)] = v; };
  const livre = (c, r) => { c = Math.floor(c); r = Math.floor(r); return c >= 0 && r >= 0 && c < COLS && r < ROWS && W[at(c, r)] === 1; };
  function fill(c0, r0, c1, r1, v = 1) {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) mark(c, r, v);
  }
  fill(1, 0, 18, 3); fill(1, 5, 18, 5); fill(5, 5, 6, 11); fill(12, 5, 13, 11);
  fill(1, 7, 4, 9); fill(7, 7, 11, 9); fill(14, 7, 18, 9); fill(1, 11, 18, 11);
  fill(1, 13, 4, 15); fill(6, 13, 9, 15); fill(11, 13, 14, 15); fill(16, 13, 18, 15);
  fill(5, 11, 5, 19); fill(10, 11, 10, 19); fill(4, 16, 6, 19); fill(9, 16, 11, 19); fill(1, 19, 18, 19);
  fill(1, 21, 10, 23); fill(12, 21, 18, 23); fill(1, 25, 18, 25);
  fill(1, 27, 6, 29); fill(8, 27, 13, 29); fill(15, 27, 18, 29); fill(1, 31, 18, 31);
  fill(1, 33, 12, 35); fill(14, 33, 18, 35); fill(8, 36, 9, 37); fill(6, 38, 12, 39); fill(1, 39, 18, 39);
  fill(1, 40, 11, 43); fill(13, 40, 18, 43); fill(1, 45, 18, 45);
  fill(1, 47, 8, 49); fill(10, 47, 14, 49); fill(16, 47, 18, 49);
  for (const [c, r] of PORTAS) mark(c, r, 1);
  const BLOQUEIOS = [[7, 1], [8, 1], [9, 1], [10, 1], [8, 0], [9, 0], [12, 14], [13, 14], [11, 15], [17, 15], [18, 15], [16, 15], [18, 14], [1, 9], [11, 9], [18, 7], [1, 13], [4, 15], [6, 13], [3, 21], [4, 21], [5, 21], [4, 22], [5, 22], [6, 40], [7, 40]];
  for (const a of RAW) if (a.desk) BLOQUEIOS.push(a.desk);
  for (const [c, r] of BLOQUEIOS) mark(c, r, 0);

  const HAIR = ['#2a1810', '#5c3a22', '#14161c', '#d1b36a', '#6d3ea3', '#1c4f46', '#efe8dc'];
  const SKIN = ['#f6d7bd', '#e4b48e', '#c68642', '#8d5524', '#ffe0cc'];
  const PRESENCA = ['disponivel', 'foco', 'reuniao'];
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
  const slug = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const erros = [];
  const presencaDe = (a, h) => {
    if (a.ceo) return 'disponivel';
    if (a.breve) return 'foco';
    if (a.room === 'copa') return 'reuniao';
    const mapa = { digitando: 'foco', 'em foco': 'foco', 'em reunião': 'reuniao', disponível: 'disponivel' };
    const old = ['digitando', 'em foco', 'em reunião', 'disponível'][h % 4];
    return mapa[old] || PRESENCA[h % 3];
  };
  const agents = RAW.map((a) => {
    const h = hash(a.name);
    const rm = room(a.room);
    if (!livre(a.c, a.r)) erros.push(a.name + ' em célula fechada');
    if (a.desk && livre(a.desk[0], a.desk[1])) erros.push(a.name + ' mesa aberta');
    return {
      roomId: a.room, room: rm, name: a.name, id: slug(a.name), role: a.role, papel: a.papel || '',
      coord: !!a.coord, shield: !!a.shield, bot: !!a.bot, ceo: !!a.ceo, desk: a.desk || null,
      destaque: !!a.destaque, brief: !!a.brief, breve: !!a.breve, chefe: !!a.chefe, proposta: !!a.proposta, tom: a.tom || '',
      sit: a.sit || '', nivel: a.nivel || (a.cuida ? 'não marcado' : ''),
      cuida: a.cuida || '', nunca: a.nunca || '',
      homeC: a.c, homeR: a.r, c: a.c, r: a.r, dir: 2, frame: 0, aceno: 0,
      hair: a.ceo ? '#2a1810' : a.name === 'Dina' ? '#6d3ea3' : HAIR[h % HAIR.length],
      skin: a.ceo ? '#e4b48e' : a.bot ? '#d7f6ff' : a.name === 'Dina' ? '#f6d0dc' : SKIN[h % SKIN.length],
      cloth: a.tom || (a.ceo ? '#243044' : a.bot ? '#8fd4ef' : a.chefe ? '#ff7a1a' : shade(rm.col, -40)),
      hairStyle: a.ceo ? 0 : h % 6, ph: (h % 628) / 100,
      presenca: presencaDe(a, h),
      status: null,
      nome: a.ceo ? 'Daniel' : a.name,
      caminho: null, passo: 0, espera: 5000 + (h % 9000), fila: [], missao: null, trava: 0, repath: 0, ultimoAlvo: '', _fora: false
    };
  });
  for (const [c, r] of PORTAS) if (!livre(c, r)) erros.push('porta fechada ' + c + ',' + r);
  for (const [id, lista] of Object.entries(VAGAS)) for (const [c, r] of lista) if (!livre(c, r)) erros.push('vaga ' + id + ' ' + c + ',' + r);
  if (erros.length) console.warn('WorkAI mapa', erros.join('; '));

  const ROBOS = {
    Daniel: { cor: '#e2c27a', base: '/workai/assets/avatares/daniel' },
    'Dyno AI': { cor: '#3ddc97', base: '/workai/assets/avatares/dyno' },
    Dina: { cor: '#ff4fa3', base: '/workai/assets/avatares/dina' },
    'Dyna 2.0': { cor: '#ff7a1a', base: '/workai/assets/avatares/dyna' }
  };
  const carregarImg = (src) => {
    if (typeof Image !== 'function') return null;
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    return img;
  };
  for (const a of agents) {
    const r = ROBOS[a.name];
    if (!r) continue;
    a.corRobo = r.cor;
    a.busto = r.base + '-busto.webp';
    a.face = carregarImg(r.base + '-busto.webp');
  }
  const MARCAS = {
    observait: carregarImg('/workai/assets/marcas/observait-logo.png'),
    wear: carregarImg('/workai/assets/marcas/dynamo-wear-logo.svg'),
    dyno: carregarImg('/workai/assets/marcas/dyno-mark.png')
  };
  const logoPronta = (img) => !!(img && img.complete && img.naturalWidth);

  function shade(hex, amt) {
    const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16);
    if (!Number.isFinite(n)) return '#444';
    const ch = (v) => Math.max(0, Math.min(255, ((n >> v) & 255) + amt));
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }
  const corPresenca = (p) => p === 'foco' ? '#f0c45a' : p === 'reuniao' ? '#ff6b8a' : '#3ddc97';
  const lblPresenca = (p) => p === 'foco' ? 'em foco' : p === 'reuniao' ? 'em reunião' : 'disponível';

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
    if (a.chefe) return nomeCeo() + ' (CEO)';
    if (a.room?.ala === 'wear') return 'Dyna 2.0';
    if (a.bot || a.brief) return nomeCeo() + ' (CEO)';
    if (a.room?.ala === 'dyno') return 'Brief AI';
    if (a.coord || a.roomId === 'op') return 'Dyno Bot (CTO)';
    return agents.find((x) => x.roomId === a.roomId && x.coord)?.name || 'Dyno Bot (CTO)';
  };

  // —— pathfinding ——
  function astar(de, para) {
    const sc = Math.floor(de.c), sr = Math.floor(de.r);
    let gc = Math.floor(para.c), gr = Math.floor(para.r);
    if (!livre(gc, gr)) {
      let best = null, bd = 1e9;
      for (let r = gr - 2; r <= gr + 2; r++) for (let c = gc - 2; c <= gc + 2; c++) {
        if (!livre(c, r)) continue;
        const d = Math.hypot(c - para.c, r - para.r);
        if (d < bd) { bd = d; best = [c, r]; }
      }
      if (!best) return [];
      gc = best[0]; gr = best[1];
    }
    if (sc === gc && sr === gr) return [{ c: para.c, r: para.r }];
    const key = (c, r) => r * COLS + c;
    const open = [[sc, sr]];
    const came = new Int32Array(COLS * ROWS).fill(-1);
    const gScore = new Float32Array(COLS * ROWS).fill(1e9);
    gScore[key(sc, sr)] = 0;
    const h = (c, r) => Math.abs(c - gc) + Math.abs(r - gr);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) {
        const [c, r] = open[i], [bc, br] = open[bi];
        if (gScore[key(c, r)] + h(c, r) < gScore[key(bc, br)] + h(bc, br)) bi = i;
      }
      const [c, r] = open.splice(bi, 1)[0];
      if (c === gc && r === gr) {
        const path = [];
        let cur = key(c, r);
        while (cur !== -1) {
          path.push({ c: (cur % COLS) + 0.5, r: Math.floor(cur / COLS) + 0.5 });
          cur = came[cur];
        }
        path.reverse();
        path[path.length - 1] = { c: gc + 0.5, r: gr + 0.5 };
        return path;
      }
      for (const [dc, dr] of dirs) {
        const nc = c + dc, nr = r + dr;
        if (!livre(nc, nr)) continue;
        if (dc && dr && (!livre(c + dc, r) || !livre(c, r + dr))) continue;
        const ng = gScore[key(c, r)] + (dc && dr ? 1.4 : 1);
        const nk = key(nc, nr);
        if (ng < gScore[nk]) {
          came[nk] = key(c, r);
          gScore[nk] = ng;
          if (!open.some((p) => p[0] === nc && p[1] === nr)) open.push([nc, nr]);
        }
      }
    }
    return [];
  }
  function perto(c, r, raio = 2) {
    let best = null, bd = 1e9;
    for (let rr = Math.floor(r) - raio; rr <= Math.floor(r) + raio; rr++) {
      for (let cc = Math.floor(c) - raio; cc <= Math.floor(c) + raio; cc++) {
        if (!livre(cc, rr)) continue;
        const d = Math.hypot(cc + 0.5 - c, rr + 0.5 - r);
        if (d < bd) { bd = d; best = { c: cc, r: rr }; }
      }
    }
    return best;
  }
  function podeMover(oc, orr, nc, nr) {
    if (!livre(nc, nr)) return false;
    if (Math.floor(nc) !== Math.floor(oc) && Math.floor(nr) !== Math.floor(orr)) return livre(nc, orr) && livre(oc, nr);
    return true;
  }
  function seguirCaminho(a, dt) {
    if (!andando(a)) return;
    const alvo = a.caminho[a.passo];
    const dx = alvo.c - a.c, dy = alvo.r - a.r;
    const L = Math.hypot(dx, dy) || 1;
    const vel = (a.ceo ? 2.8 : 1.7) * dt / 1000;
    if (L <= vel) {
      a.c = alvo.c; a.r = alvo.r; a.passo++;
      if (!andando(a)) a.caminho = null;
    } else {
      a.c += dx / L * vel; a.r += dy / L * vel;
      a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
      a.frame = (a.frame + dt * 0.012) % 4;
    }
  }
  function destinoRotina(a) {
    if (a.ceo || a.bot || a.breve) return { c: a.homeC, r: a.homeR };
    const roll = Math.random();
    if (roll < 0.05) {
      const id = Math.random() < 0.55 ? 'copa' : 'desc';
      const v = VAGAS[id];
      const [c, r] = v[Math.floor(Math.random() * v.length)];
      return { c: c + 0.5, r: r + 0.5 };
    }
    return { c: a.homeC, r: a.homeR };
  }
  function updateAgente(a, dt) {
    if (a.ceo) return;
    if (a.aceno > 0) a.aceno = Math.max(0, a.aceno - dt);
    if (a.missao) {
      if (!andando(a) && !a.missao.chegou) {
        const v = perto(player.c, player.r, 2);
        if (v) { a.caminho = astar(a, { c: v.c + 0.5, r: v.r + 0.5 }); a.passo = 0; }
        a.missao.chegou = true;
      }
      seguirCaminho(a, dt);
      return;
    }
    seguirCaminho(a, dt);
    if (andando(a)) return;
    a.espera -= dt;
    if (a.espera > 0) return;
    a.espera = 6000 + Math.random() * 10000;
    const d = destinoRotina(a);
    if (Math.hypot(d.c - a.c, d.r - a.r) < 0.2) {
      // rotaciona presença ilustrativa de vez em quando
      if (Math.random() < 0.35 && !a.breve) a.presenca = PRESENCA[Math.floor(Math.random() * 3)];
      return;
    }
    a.caminho = astar(a, d); a.passo = 0;
    if (salaDe(d.c, d.r)?.reuniao) a.presenca = 'reuniao';
    else if (Math.random() < 0.4) a.presenca = 'foco';
    else a.presenca = 'disponivel';
  }
  function updatePlayer(dt) {
    if (player.aceno > 0) player.aceno = Math.max(0, player.aceno - dt);
    let dc = 0, dr = 0;
    if (keys.has('w') || keys.has('arrowup')) dr--;
    if (keys.has('s') || keys.has('arrowdown')) dr++;
    if (keys.has('a') || keys.has('arrowleft')) dc--;
    if (keys.has('d') || keys.has('arrowright')) dc++;
    if (dc || dr) {
      player.caminho = null;
      const L = Math.hypot(dc, dr);
      const vel = (reduce ? 1.8 : 3.0) * dt / 1000;
      const nc = player.c + dc / L * vel, nr = player.r + dr / L * vel;
      if (podeMover(player.c, player.r, nc, nr)) { player.c = nc; player.r = nr; }
      else if (podeMover(player.c, player.r, nc, player.r)) player.c = nc;
      else if (podeMover(player.c, player.r, player.c, nr)) player.r = nr;
      player.dir = Math.abs(dc) > Math.abs(dr) ? (dc > 0 ? 1 : 3) : (dr > 0 ? 2 : 0);
      player.frame = (player.frame + dt * 0.014) % 4;
      seguir = true; focusId = '';
      return;
    }
    const before = andando(player);
    seguirCaminho(player, dt);
    if (before && andando(player)) player.frame = (player.frame + dt * 0.014) % 4;
  }
  function todosParaSalas() {
    for (const a of agents) {
      if (a.ceo) continue;
      a.c = a.homeC; a.r = a.homeR; a.caminho = null; a.passo = 0;
      a.missao = null; a.fila.length = 0; a.espera = 4000 + Math.random() * 6000;
      a._fora = false;
    }
  }
  function notify(agentId, texto, opts) {
    const a = achar(agentId);
    if (!a) return false;
    a.missao = { texto: String(texto || '').slice(0, 140), chegou: false, demo: !!(opts && opts.demo) };
    a.caminho = null; a.passo = 0;
    return true;
  }
  function tickDemo(dt) {
    if (congelado) return;
    demoEm -= dt;
    if (demoEm > 0) return;
    demoEm = 18000 + Math.random() * 12000;
    const cand = agents.filter((a) => !a.ceo && !a.breve && !a.missao && dist(a, player) > 4);
    if (!cand.length) return;
    const a = cand[Math.floor(Math.random() * cand.length)];
    notify(a.id, 'Oi! Trouxe um aviso ilustrativo.', { demo: true });
  }
  function update(dt) {
    updatePlayer(dt);
    for (const a of agents) updateAgente(a, dt);
    tickDemo(dt);
    atualizarProximidade();
    atualizarSalaPrivada();
  }

  // —— canvas / câmera ——
  const cvs = document.getElementById('c');
  const ctx = cvs.getContext('2d');
  const palco = document.getElementById('palco');
  const miniCvs = document.getElementById('mini');
  const miniCtx = miniCvs.getContext('2d');
  let viewW = 1, viewH = 1, dpr = 1, focusId = '', t = 0;
  let zoomUser = 1, cam = { s: 1, ox: 0, oy: 0 };
  let seguir = true, congelado = false, demoEm = 10000;
  let modoFoco = false, modoMini = false, showMini = true;
  const keys = new Set();
  const hits = [];
  let proxAgente = null;
  let salaAtual = null;
  let ready = false;

  function layout() {
    const r = palco.getBoundingClientRect();
    viewW = Math.max(1, r.width); viewH = Math.max(1, r.height);
    dpr = Math.min(viewW < 720 ? 1.5 : 2, devicePixelRatio || 1);
    cvs.width = Math.round(viewW * dpr); cvs.height = Math.round(viewH * dpr);
  }
  function camera() {
    const base = viewW < 720 ? 1.15 : 1.35;
    const s = base * zoomUser;
    let cx = player.c, cy = player.r;
    if (!seguir && focusId) {
      const rm = room(focusId);
      if (rm) { cx = rm.c + rm.w / 2; cy = rm.r + rm.h / 2; }
      else if (focusId === 'dyno') { cx = 10; cy = 27; }
      else if (focusId === 'wear') { cx = 10; cy = 45; }
      else if (focusId === 'dm') { cx = 10; cy = 8; }
    }
    cam = { s, ox: viewW / 2 - cx * TILE * s, oy: viewH / 2 - cy * TILE * s };
  }
  function aplicarZoom(fator) {
    zoomUser = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomUser * fator));
    const zb = document.getElementById('zoom-lbl');
    if (zb) zb.textContent = Math.round(zoomUser * 100) + '%';
  }
  function resetZoom() {
    zoomUser = 1;
    seguir = true; focusId = '';
    const zb = document.getElementById('zoom-lbl');
    if (zb) zb.textContent = '100%';
    syncChips();
  }
  const worldX = (c) => c * TILE;
  const worldY = (r) => r * TILE;
  const toScreen = (c, r) => ({ x: c * TILE * cam.s + cam.ox, y: r * TILE * cam.s + cam.oy });
  function unproject(sx, sy) {
    return { c: (sx - cam.ox) / (TILE * cam.s), r: (sy - cam.oy) / (TILE * cam.s) };
  }
  function local(e) {
    const b = cvs.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  }

  // —— desenho pixel ——
  function px(x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  function pisoCor(c, r) {
    const rm = salaDe(c + 0.5, r + 0.5);
    if (rm?.piso) return ((c + r) & 1) ? rm.piso : shade(rm.piso, 12);
    if (r >= 38) return ((c + r) & 1) ? '#1a1a1d' : '#121214';
    if (r >= 36) return ((c + r) & 1) ? '#3a2c1e' : '#2a2118';
    // madeira clara aconchegante (estilo Gather)
    if (rm) {
      const base = rm.glass ? '#d7c4a0' : '#cbb892';
      return ((c + r) & 1) ? base : shade(base, -10);
    }
    return ((c + r) & 1) ? '#b9a684' : '#a89470';
  }
  function drawFloor() {
    const margin = 2;
    const c0 = Math.max(0, Math.floor((-cam.ox) / (TILE * cam.s)) - margin);
    const r0 = Math.max(0, Math.floor((-cam.oy) / (TILE * cam.s)) - margin);
    const c1 = Math.min(COLS - 1, Math.ceil((viewW - cam.ox) / (TILE * cam.s)) + margin);
    const r1 = Math.min(ROWS - 1, Math.ceil((viewH - cam.oy) / (TILE * cam.s)) + margin);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (!W[at(c, r)]) {
        px(worldX(c), worldY(r), TILE, TILE, '#0c1018');
        continue;
      }
      px(worldX(c), worldY(r), TILE, TILE, pisoCor(c, r));
      // ripa
      if (r < 36) {
        ctx.fillStyle = 'rgba(80,55,30,.12)';
        ctx.fillRect(worldX(c), worldY(r) + TILE - 2, TILE, 2);
      }
    }
    // tapetes
    for (const rm of ROOMS) {
      if (rm.breve || rm.ala === 'wear') continue;
      if (rm.r > r1 || rm.r + rm.h < r0) continue;
      const pad = 0.35;
      ctx.fillStyle = rm.col + '33';
      ctx.fillRect(worldX(rm.c + pad), worldY(rm.r + pad), (rm.w - pad * 2) * TILE, (rm.h - pad * 2) * TILE);
    }
  }
  function drawWalls() {
    // paredes com “profundidade”: topo mais claro + sombra
    const wall = (c, r, w, h, col) => {
      px(worldX(c), worldY(r), w * TILE, h * TILE, shade(col, -50));
      px(worldX(c), worldY(r), w * TILE, 6, shade(col, -20));
      px(worldX(c), worldY(r) + 6, w * TILE, 3, shade(col, 10));
    };
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (W[at(c, r)]) continue;
      // só desenha parede se vizinho andável
      const viz = livre(c + 1, r) || livre(c - 1, r) || livre(c, r + 1) || livre(c, r - 1);
      if (!viz) continue;
      const wear = r >= 38;
      wall(c, r, 1, 1, wear ? '#2a1810' : '#6a5744');
    }
    // contorno de salas + destaque privada
    for (const rm of ROOMS) {
      const x = worldX(rm.c), y = worldY(rm.r), w = rm.w * TILE, h = rm.h * TILE;
      ctx.strokeStyle = rm === salaAtual ? '#fff' : rm.col;
      ctx.lineWidth = rm === salaAtual ? 4 : (rm.glass ? 3 : 2);
      ctx.globalAlpha = rm === salaAtual ? 0.95 : 0.55;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      ctx.globalAlpha = 1;
      if (rm === salaAtual) {
        ctx.fillStyle = rm.col + '22';
        ctx.fillRect(x, y, w, h);
      }
    }
  }
  function drawWindow(c, r) {
    const x = worldX(c) + 6, y = worldY(r) + 4;
    px(x, y, TILE - 12, 14, '#8ec8e8');
    px(x, y, TILE - 12, 14, 'rgba(255,255,255,.25)');
    ctx.strokeStyle = '#5a4636'; ctx.lineWidth = 2;
    ctx.strokeRect(x, y, TILE - 12, 14);
    ctx.beginPath(); ctx.moveTo(x + (TILE - 12) / 2, y); ctx.lineTo(x + (TILE - 12) / 2, y + 14); ctx.stroke();
  }
  function drawPlant(c, r) {
    const x = worldX(c) + 10, y = worldY(r) + 12;
    px(x + 6, y + 14, 10, 10, '#8a5a3a');
    px(x + 2, y + 2, 18, 16, '#2f8a4a');
    px(x + 6, y - 2, 10, 10, '#3cb371');
  }
  function drawDesk(a) {
    if (!a.desk) return;
    const [c, r] = a.desk;
    const x = worldX(c) + 2, y = worldY(r) + 4;
    px(x, y, TILE - 4, TILE - 10, '#d7b07a');
    px(x, y, TILE - 4, 4, '#e8d0a8');
    px(x + 8, y + 8, 14, 10, '#1b1e28');
    px(x + 10, y + 4, 10, 8, a.presenca === 'foco' ? '#5cf0ff' : '#243040');
    // cadeira
    px(x + 8, y + TILE - 8, 16, 8, '#5c4636');
    // plaquinha
    const nome = a.name.slice(0, 12);
    ctx.font = '700 8px system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = Math.min(TILE - 4, ctx.measureText(nome).width + 6);
    px(x + (TILE - 4 - tw) / 2, y - 8, tw, 10, '#fffdf6');
    ctx.fillStyle = '#1b1f2e';
    ctx.fillText(nome, x + (TILE - 4) / 2, y - 3);
  }
  function drawCozinha() {
    // bancada + geladeira + mesa de reunião grande
    px(worldX(11.1), worldY(13.1), 3.6 * TILE, 0.55 * TILE, '#ece7dc');
    px(worldX(11.2), worldY(13.2), 0.7 * TILE, 0.4 * TILE, '#9aabbc');
    px(worldX(13.7), worldY(13.15), 0.85 * TILE, 0.7 * TILE, '#dfe6ee');
    px(worldX(12.2), worldY(13.2), 0.5 * TILE, 0.35 * TILE, '#5c4636');
    // mesa de reunião oval/grande
    px(worldX(11.7), worldY(14.2), 2.6 * TILE, 1.35 * TILE, '#c4a878');
    px(worldX(11.9), worldY(14.35), 2.2 * TILE, 1.05 * TILE, '#e8d7b8');
    ctx.strokeStyle = '#8a6e48'; ctx.lineWidth = 2;
    ctx.strokeRect(worldX(11.7) + 1, worldY(14.2) + 1, 2.6 * TILE - 2, 1.35 * TILE - 2);
    // cadeiras ao redor
    [[11.4, 14.4], [12.4, 14.4], [13.4, 14.4], [11.4, 15.2], [12.4, 15.2], [13.4, 15.2]].forEach(([c, r]) => {
      px(worldX(c), worldY(r), 12, 12, '#5c4636');
    });
  }
  function drawLounge() {
    px(worldX(16.3), worldY(14.5), 1.4 * TILE, 0.7 * TILE, '#f4efe4');
    px(worldX(17.3), worldY(13.4), 1.1 * TILE, 0.7 * TILE, '#f4efe4');
    px(worldX(17.0), worldY(14.2), 0.7 * TILE, 0.5 * TILE, '#c4a15a');
    // fliperama
    px(worldX(18.0), worldY(14.7), 0.7 * TILE, 0.7 * TILE, '#2a4a8a');
    px(worldX(18.1), worldY(14.8), 0.5 * TILE, 0.35 * TILE, !reduce && Math.sin(t / 280) > 0 ? '#5cf0ff' : '#243040');
  }
  function drawDiretoria() {
    // mesa executiva
    px(worldX(6.2), worldY(0.7), 4.2 * TILE, 1.5 * TILE, '#e8d7b8');
    px(worldX(6.4), worldY(0.9), 3.8 * TILE, 1.1 * TILE, '#f3efe4');
    // PC SSH
    px(worldX(7.7), worldY(1.0), 0.9 * TILE, 0.7 * TILE, '#1b1e28');
    px(worldX(7.85), worldY(1.1), 0.6 * TILE, 0.4 * TILE, '#3ddc97');
    ctx.font = '700 8px system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    px(worldX(7.55), worldY(1.75), 1.2 * TILE, 12, 'rgba(8,10,16,.85)');
    ctx.fillStyle = '#d7f5b0';
    ctx.fillText('SSH · em breve', worldX(8.15), worldY(1.75) + 6);
    hits.push({ tipo: 'pc', c: 8.1, r: 1.3, rad: 0.9 });
    // logos na parede norte
    const slots = [
      { img: MARCAS.observait, c: 2.0, w: 88, h: 24, fallback: 'ObservaIT' },
      { img: MARCAS.wear, c: 9.2, w: 92, h: 22, fallback: 'Dynamo Wear' },
      { img: MARCAS.dyno, c: 15.6, w: 28, h: 28, fallback: 'Dyno' }
    ];
    for (const s of slots) {
      const x = worldX(s.c), y = worldY(0.2);
      px(x - 4, y - 4, s.w + 8, s.h + 8, '#f4f7f2');
      ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.strokeRect(x - 4, y - 4, s.w + 8, s.h + 8);
      if (logoPronta(s.img)) ctx.drawImage(s.img, x, y, s.w, s.h);
      else {
        ctx.fillStyle = '#172d35'; ctx.font = '700 11px system-ui,sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(s.fallback, x + s.w / 2, y + s.h / 2);
      }
    }
    drawWindow(3, 0); drawWindow(12, 0); drawWindow(16, 0);
    drawPlant(17.2, 2.5); drawPlant(1.2, 2.5);
  }
  function drawRoomLabels() {
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = '800 11px system-ui,sans-serif';
    for (const rm of ROOMS) {
      if (rm.breve && modoFoco) continue;
      const x = worldX(rm.c) + 6, y = worldY(rm.r) + 4;
      const tw = ctx.measureText(rm.short).width + 10;
      px(x, y, tw, 14, 'rgba(12,14,20,.72)');
      ctx.fillStyle = rm.col;
      ctx.fillText(rm.short, x + 5, y + 1);
    }
  }
  function drawAvatar(a) {
    const walking = andando(a);
    const x = worldX(a.c), y = worldY(a.r);
    const bob = (!reduce && walking) ? Math.abs(Math.sin(a.frame * 1.6)) * 2 : 0;
    const wave = a.aceno > 0 ? Math.sin((600 - a.aceno) / 40) * 6 : 0;
    // sombra
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.ellipse(x, y + 10, 10, 4, 0, 0, 7); ctx.fill();

    if (modoMini) {
      const col = a.corRobo || a.cloth || a.room.col;
      px(x - 10, y - 10 - bob, 20, 20, col);
      px(x - 6, y - 6 - bob, 12, 10, a.skin);
      px(x + 8, y - 14 - bob, 8, 8, corPresenca(a.presenca));
      ctx.font = '700 10px system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#fff';
      ctx.fillText(a.ceo ? a.nome : a.name, x, y + 14);
      hits.push({ a, c: a.c, r: a.r, rad: 0.7 });
      return;
    }

    const dir = a.dir | 0;
    const step = walking && !reduce ? Math.sin(a.frame) * 2.2 : 0;
    const cloth = a.cloth;
    // silhouette chibi (estilo escritório 2D)
    px(x - 10, y - 20 - bob, 20, 18, cloth);
    px(x - 9, y - 34 - bob, 18, 16, a.skin);
    px(x - 9, y - 36 - bob, 18, 7, a.hair);
    if (dir !== 0) px(x - 9, y - 31 - bob, 18, 4, a.hair);
    if (dir !== 0) {
      const ox = dir === 1 ? 3 : dir === 3 ? -3 : 0;
      px(x - 4 + ox, y - 28 - bob, 3, 3, '#1b1f2e');
      px(x + 2 + ox, y - 28 - bob, 3, 3, '#1b1f2e');
    } else {
      px(x - 5, y - 30 - bob, 10, 3, a.hair);
    }
    px(x - 8, y - 4 - bob + step, 6, 12, shade(cloth, -28));
    px(x + 2, y - 4 - bob - step, 6, 12, shade(cloth, -28));
    px(x - 7, y + 6 - bob + step, 6, 3, '#1a1520');
    px(x + 3, y + 6 - bob - step, 6, 3, '#1a1520');
    if (wave) px(x + (dir === 3 ? -16 : 10), y - 26 - bob - wave, 6, 12, a.skin);
    else {
      px(x - 14, y - 18 - bob, 5, 12, a.skin);
      px(x + 9, y - 18 - bob, 5, 12, a.skin);
    }
    if (a.bot || a.coord) px(x - 7, y - 40 - bob, 14, 5, '#ffd76a');
    px(x + 9, y - 38 - bob, 9, 9, '#0e1016');
    px(x + 10, y - 37 - bob, 7, 7, corPresenca(a.presenca));
    const label = a.ceo ? a.nome : a.name;
    ctx.font = '700 10px system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const tw = ctx.measureText(label).width + 10;
    px(x - tw / 2, y + 12, tw, 13, 'rgba(8,10,16,.85)');
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x, y + 14);
    hits.push({ a, c: a.c, r: a.r, rad: 0.8 });
  }
  function drawFurniture() {
    drawDiretoria();
    drawCozinha();
    drawLounge();
    for (const a of agents) if (a.desk) drawDesk(a);
    // plantas espalhadas
    [[1, 9], [18, 8], [1, 15], [10, 16], [2, 25], [17, 22], [1, 31], [12, 31], [3, 43]].forEach(([c, r]) => {
      if (livre(c, r) || true) drawPlant(c, r);
    });
    // janelas em salas
    for (const rm of ROOMS) {
      if (rm.ala === 'wear' || rm.h < 2) continue;
      drawWindow(rm.c + 1, rm.r);
      if (rm.w > 4) drawWindow(rm.c + rm.w - 2, rm.r);
    }
  }
  function drawMiniMap() {
    if (!showMini || !miniCvs) return;
    miniCvs.hidden = false;
    const mw = miniCvs.width, mh = miniCvs.height;
    miniCtx.setTransform(1, 0, 0, 1, 0, 0);
    miniCtx.fillStyle = '#0a0e16';
    miniCtx.fillRect(0, 0, mw, mh);
    const sx = mw / COLS, sy = mh / ROWS;
    for (const rm of ROOMS) {
      miniCtx.fillStyle = rm.col + '88';
      miniCtx.fillRect(rm.c * sx, rm.r * sy, rm.w * sx, rm.h * sy);
    }
    for (const a of agents) {
      miniCtx.fillStyle = corPresenca(a.presenca);
      miniCtx.fillRect(a.c * sx - 1, a.r * sy - 1, 3, 3);
    }
    miniCtx.strokeStyle = '#fff';
    miniCtx.lineWidth = 1;
    const vx = (-cam.ox) / (TILE * cam.s), vy = (-cam.oy) / (TILE * cam.s);
    const vw = viewW / (TILE * cam.s), vh = viewH / (TILE * cam.s);
    miniCtx.strokeRect(vx * sx, vy * sy, vw * sx, vh * sy);
  }
  function frame(ts) {
    t = ts || 0;
    if (!viewW) layout();
    camera();
    hits.length = 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0f131c';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.setTransform(dpr * cam.s, 0, 0, dpr * cam.s, dpr * cam.ox, dpr * cam.oy);
    ctx.imageSmoothingEnabled = false;

    if (!modoMini) {
      drawFloor();
      drawWalls();
      drawFurniture();
      drawRoomLabels();
    } else {
      // fundo limpo só com salas sutis
      for (const rm of ROOMS) {
        ctx.fillStyle = rm.col + '18';
        ctx.fillRect(worldX(rm.c), worldY(rm.r), rm.w * TILE, rm.h * TILE);
        ctx.strokeStyle = rm.col + '55';
        ctx.strokeRect(worldX(rm.c), worldY(rm.r), rm.w * TILE, rm.h * TILE);
      }
    }

    const lista = agents.slice().sort((a, b) => a.r - b.r || a.c - b.c);
    for (const a of lista) {
      if (modoFoco && salaAtual && a.roomId !== salaAtual.id && !a.ceo) {
        ctx.globalAlpha = 0.25;
        drawAvatar(a);
        ctx.globalAlpha = 1;
      } else drawAvatar(a);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMiniMap();
    desenharEuFace();
  }

  // —— proximidade / sala privada ——
  function atualizarProximidade() {
    let best = null, bd = PROX;
    for (const a of agents) {
      if (a.ceo) continue;
      const d = dist(a, player);
      if (d < bd) { bd = d; best = a; }
    }
    proxAgente = best;
    const el = document.getElementById('prox');
    if (!el) return;
    el.hidden = !best;
  }
  function atualizarSalaPrivada() {
    const rm = salaDe(player.c, player.r);
    salaAtual = rm;
    const painel = document.getElementById('sala-painel');
    if (!painel) return;
    if (!rm) { painel.hidden = true; return; }
    painel.hidden = false;
    document.getElementById('sala-titulo').textContent = rm.name;
    const quem = agents.filter((a) => salaDe(a.c, a.r)?.id === rm.id);
    document.getElementById('sala-lista').textContent = quem.length
      ? ('Aqui agora: ' + quem.map((a) => (a.ceo ? a.nome : a.name)).join(', '))
      : 'Sala vazia no momento.';
  }

  // —— UI chat / card / ssh ——
  function fechar() {
    const card = document.getElementById('card');
    if (card) card.hidden = true;
  }
  function abrir(a, pt) {
    const card = document.getElementById('card');
    const corpo = document.getElementById('card-corpo');
    if (!card || !corpo || !a) return;
    const nome = a.ceo ? a.nome : a.name;
    corpo.innerHTML = '';
    const cab = document.createElement('div'); cab.className = 'cabeca';
    if (a.face || a.busto) {
      const img = document.createElement('img');
      img.className = 'rosto'; img.alt = ''; img.src = a.busto || a.face.src;
      cab.append(img);
    }
    const txt = document.createElement('div');
    txt.innerHTML = `<h3 id="card-nome">${nome}</h3><p class="papel">${a.role}</p>`;
    cab.append(txt); corpo.append(cab);
    const area = document.createElement('p'); area.className = 'area';
    area.innerHTML = `<span class="ponto" style="background:${corPresenca(a.presenca)}"></span>${lblPresenca(a.presenca)} · ${a.room?.name || ''}`;
    corpo.append(area);
    if (a.sit) corpo.append(Object.assign(document.createElement('p'), { textContent: a.sit }));
    if (a.nivel) corpo.append(Object.assign(document.createElement('p'), { textContent: 'Nível: ' + a.nivel }));
    if (a.cuida) corpo.append(Object.assign(document.createElement('p'), { textContent: 'Cuida: ' + a.cuida }));
    if (a.nunca) corpo.append(Object.assign(document.createElement('small'), { textContent: 'Nunca: ' + a.nunca }));
    const chef = reportsTo(a);
    if (chef) corpo.append(Object.assign(document.createElement('small'), { textContent: 'Reporta a: ' + chef }));
    card.hidden = false;
    const x = (pt && pt.x) || 24, y = (pt && pt.y) || 80;
    card.style.left = Math.min(x, window.innerWidth - 360) + 'px';
    card.style.top = Math.min(y, window.innerHeight - 200) + 'px';
  }

  const chat = document.getElementById('chat');
  const chatHist = document.getElementById('chat-hist');
  const chatInput = document.getElementById('chat-input');
  const chatNome = document.getElementById('chat-nome');
  const CHAT_KEY = 'workai-chat-v1';
  let chatAgente = null;
  const lerChats = () => { try { return JSON.parse(localStorage.getItem(CHAT_KEY) || '{}') || {}; } catch { return {}; } };
  const gravarChats = (mapa) => { try { localStorage.setItem(CHAT_KEY, JSON.stringify(mapa)); } catch {} };
  function bolha(papel, texto) {
    const d = document.createElement('div');
    d.className = 'chat-msg chat-' + papel;
    d.textContent = texto;
    return d;
  }
  function renderChat() {
    if (!chatAgente || !chatHist) return;
    const mapa = lerChats();
    const lista = mapa[chatAgente.id] || [];
    chatHist.replaceChildren();
    chatHist.append(bolha('sistema', 'Chat ainda não conectado aos agentes. As mensagens ficam só neste navegador.'));
    for (const m of lista) chatHist.append(bolha(m.papel, m.texto));
    chatHist.scrollTop = chatHist.scrollHeight;
  }
  function respostaLocal(a, texto) {
    const t = texto.trim().toLowerCase();
    if (t === 'status' || t === '/status') return lblPresenca(a.presenca) + ' · ' + (a.sit || a.status || 'rotina ilustrativa') + ' · nível: ' + (a.nivel || 'não marcado') + '. (local)';
    if (t === 'o que está fazendo' || t === '/fazendo' || t === 'fazendo') {
      if (a.missao) return 'Há um aviso ilustrativo: ' + a.missao.texto;
      if (andando(a)) return 'Estou a caminho, ainda na rotina ilustrativa.';
      return 'Na ' + (a.room?.short || a.room?.name || 'sala') + ', em rotina ilustrativa.';
    }
    if (t === 'nova tarefa' || t === '/tarefa') return 'Ainda sem ponte com o agente real. Veja workai/CHAT-PROPOSTA.md.';
    return 'Recebi aqui no navegador, mas ainda não há conexão comigo. Nada foi enviado para fora.';
  }
  function enviarChat(texto) {
    const limpo = String(texto || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!limpo || !chatAgente) return;
    const mapa = lerChats();
    const id = chatAgente.id;
    const lista = mapa[id] || [];
    lista.push({ papel: 'voce', texto: limpo, em: Date.now() });
    lista.push({ papel: 'agente', texto: respostaLocal(chatAgente, limpo), em: Date.now() });
    mapa[id] = lista.slice(-80);
    gravarChats(mapa);
    if (chatInput) chatInput.value = '';
    renderChat();
  }
  function abrirChat(a) {
    if (!chat || !a) return;
    fechar();
    chatAgente = a;
    if (chatNome) chatNome.textContent = (a.ceo ? a.nome : a.name) + (a.coord ? ' ★' : '');
    chat.hidden = false;
    renderChat();
    chatInput?.focus();
  }
  function fecharChat() { if (chat) chat.hidden = true; chatAgente = null; }
  const ssh = document.getElementById('ssh-panel');
  function abrirSsh() { if (ssh) ssh.hidden = false; }
  function fecharSsh() { if (ssh) ssh.hidden = true; }

  function acenar(alvo) {
    const a = alvo || proxAgente || player;
    if (!a) return;
    a.aceno = 900;
    if (a !== player) player.aceno = 700;
  }

  // —— barra / status ——
  function syncStatusUi() {
    const dot = document.getElementById('status-dot');
    const lbl = document.getElementById('status-lbl');
    if (lbl) lbl.textContent = lblPresenca(player.presenca);
    if (dot) {
      dot.className = 'dot' + (player.presenca === 'foco' ? ' foco' : player.presenca === 'reuniao' ? ' reuniao' : '');
    }
  }
  function cicloStatus() {
    const i = PRESENCA.indexOf(player.presenca);
    player.presenca = PRESENCA[(i + 1) % PRESENCA.length];
    syncStatusUi();
  }
  function desenharEuFace() {
    const face = document.getElementById('eu-face');
    if (!face) return;
    const f = face.getContext('2d');
    f.imageSmoothingEnabled = false;
    f.fillStyle = '#10141c'; f.fillRect(0, 0, 40, 40);
    f.fillStyle = player.cloth; f.fillRect(10, 20, 20, 16);
    f.fillStyle = player.skin; f.fillRect(12, 8, 16, 16);
    f.fillStyle = player.hair; f.fillRect(12, 6, 16, 6);
    f.fillStyle = '#1b1f2e'; f.fillRect(15, 14, 3, 3); f.fillRect(22, 14, 3, 3);
    f.fillStyle = corPresenca(player.presenca); f.fillRect(30, 4, 8, 8);
  }

  // —— chips / árvore ——
  function syncChips() {
    document.querySelectorAll('#salas button').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.id === (focusId || (seguir ? '' : 'dm')));
    });
  }
  function setFocus(id) {
    if (!id || id === 'eu') { seguir = true; focusId = ''; }
    else { seguir = false; focusId = id; }
    syncChips();
  }
  function montarSalas() {
    const nav = document.getElementById('salas');
    if (!nav) return;
    nav.replaceChildren();
    const add = (id, label, col) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label; b.dataset.id = id;
      if (col) b.style.setProperty('--c', col);
      b.addEventListener('click', () => setFocus(id));
      nav.append(b);
    };
    add('', 'Escritório', '#e2c27a');
    add('dm', 'Casa', '#f0d78c');
    add('dyno', 'Operação Dyno', '#8fd46a');
    add('wear', 'Dynamo Wear', '#ff7a1a');
    for (const rm of ROOMS) add(rm.id, rm.short, rm.col);
  }
  function montarArvore() {
    const arvore = document.getElementById('arvore');
    if (!arvore) return;
    arvore.replaceChildren();
    const linha = (cls, texto, agente) => {
      const el = agente ? document.createElement('button') : document.createElement('div');
      el.type = agente ? 'button' : undefined;
      el.className = 'ramo ' + cls + (agente?.breve || agente?.proposta ? ' breve' : '');
      const dot = document.createElement('span');
      dot.className = 'ponto';
      if (agente) dot.style.background = corPresenca(agente.presenca);
      el.append(dot, document.createTextNode(texto));
      if (agente) el.addEventListener('click', () => {
        seguir = false; focusId = agente.roomId; syncChips();
        player.caminho = astar(player, { c: agente.c, r: agente.r }); player.passo = 0;
      });
      arvore.append(el);
    };
    linha('n0', nomeCeo() + ' (CEO)', player);
    linha('n1', 'Dyno Bot · CTO', achar('Dyno Bot'));
    linha('n2', 'Operação / SRE / Marketing…', null);
    for (const a of agents.filter((x) => x.room?.ala === 'dm' && !x.ceo && !x.bot)) linha('n3', a.name, a);
    linha('n1', 'Brief AI · Operação Dyno', achar('Brief AI'));
    for (const a of agents.filter((x) => x.room?.ala === 'dyno' && !x.brief)) linha('n3', a.name, a);
    linha('n1', 'Dyna 2.0 · Dynamo Wear', achar('Dyna 2.0'));
    for (const a of agents.filter((x) => x.room?.ala === 'wear' && !x.chefe)) linha('n3', a.name, a);
  }

  // —— input ——
  function clique(x, y) {
    const w = unproject(x, y);
    for (const h of hits) {
      if (h.tipo === 'pc' && Math.hypot(w.c - h.c, w.r - h.r) < h.rad) { abrirSsh(); return; }
      if (h.a && Math.hypot(w.c - h.c, w.r - h.r) < h.rad) {
        if (dist(h.a, player) <= PROX + 0.3) abrirChat(h.a);
        else {
          const cell = perto(h.a.c, h.a.r, 2);
          if (cell) { player.caminho = astar(player, { c: cell.c + 0.5, r: cell.r + 0.5 }); player.passo = 0; seguir = true; focusId = ''; }
        }
        return;
      }
    }
    const cell = perto(w.c, w.r, 2);
    if (!cell) return;
    player.caminho = astar(player, { c: cell.c + 0.5, r: cell.r + 0.5 });
    player.passo = 0;
    seguir = true; focusId = ''; syncChips();
  }

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      keys.add(k); e.preventDefault();
    }
    if (e.key === 'Escape') { fechar(); fecharChat(); fecharSsh(); }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  cvs.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const p = local(e);
    clique(p.x, p.y);
  });
  cvs.addEventListener('wheel', (e) => {
    e.preventDefault();
    aplicarZoom(e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });
  // pinça
  const pinça = new Map();
  let pinçaDist = 0;
  cvs.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    pinça.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinça.size === 2) {
      const [a, b] = [...pinça.values()];
      pinçaDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    }
  });
  cvs.addEventListener('pointermove', (e) => {
    if (!pinça.has(e.pointerId) || pinça.size !== 2) return;
    pinça.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [a, b] = [...pinça.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const fator = d / pinçaDist;
    if (fator > 1.02 || fator < 0.98) { aplicarZoom(fator); pinçaDist = d; }
  });
  const solta = (e) => { pinça.delete(e.pointerId); pinçaDist = 0; };
  cvs.addEventListener('pointerup', solta);
  cvs.addEventListener('pointercancel', solta);

  document.getElementById('card-fechar')?.addEventListener('click', fechar);
  document.getElementById('chat-fechar')?.addEventListener('click', fecharChat);
  document.getElementById('chat-form')?.addEventListener('submit', (e) => { e.preventDefault(); enviarChat(chatInput?.value); });
  chat?.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => enviarChat(b.getAttribute('data-cmd'))));
  document.getElementById('chat-ficha')?.addEventListener('click', () => { if (chatAgente) abrir(chatAgente, { x: 24, y: 80 }); });
  document.getElementById('ssh-fechar')?.addEventListener('click', fecharSsh);
  document.getElementById('prox-chat')?.addEventListener('click', () => { if (proxAgente) abrirChat(proxAgente); });
  document.getElementById('prox-acenar')?.addEventListener('click', () => acenar(proxAgente));
  document.getElementById('btn-acenar')?.addEventListener('click', () => acenar(proxAgente));
  document.getElementById('btn-chat')?.addEventListener('click', () => {
    if (proxAgente) abrirChat(proxAgente);
    else if (chat.hidden === false) fecharChat();
    else abrirChat(achar('Dyno Bot') || player);
  });
  document.getElementById('btn-mini')?.addEventListener('click', (e) => {
    showMini = !showMini;
    e.currentTarget.setAttribute('aria-pressed', String(showMini));
    if (miniCvs) miniCvs.hidden = !showMini;
  });
  document.getElementById('btn-foco')?.addEventListener('click', (e) => {
    modoFoco = !modoFoco;
    e.currentTarget.setAttribute('aria-pressed', String(modoFoco));
  });
  document.getElementById('btn-modo-mini')?.addEventListener('click', (e) => {
    modoMini = !modoMini;
    e.currentTarget.setAttribute('aria-pressed', String(modoMini));
  });
  document.getElementById('zoom-in')?.addEventListener('click', () => aplicarZoom(1.15));
  document.getElementById('zoom-out')?.addEventListener('click', () => aplicarZoom(1 / 1.15));
  document.getElementById('zoom-reset')?.addEventListener('click', resetZoom);
  document.getElementById('para-salas')?.addEventListener('click', () => todosParaSalas());
  document.getElementById('status-btn')?.addEventListener('click', cicloStatus);
  chat?.addEventListener('pointerdown', (e) => e.stopPropagation());
  ssh?.addEventListener('pointerdown', (e) => e.stopPropagation());

  montarSalas();
  montarArvore();
  syncStatusUi();
  document.getElementById('eu-nome').textContent = nomeCeo();
  if (miniCvs) miniCvs.hidden = !showMini;
  document.getElementById('btn-mini')?.setAttribute('aria-pressed', 'true');

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
      document.getElementById('eu-nome').textContent = n;
      montarArvore();
    })
    .catch(() => {});

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(48, now - last); last = now;
    if (!congelado) update(dt);
    frame(now);
    requestAnimationFrame(loop);
  }
  window.addEventListener('resize', () => { layout(); });
  layout();
  ready = true;
  requestAnimationFrame(loop);

  window.WorkAI = { notify };
  window.__workai = {
    notify, erros,
    get ready() { return ready; },
    get player() { return player; },
    zoom: (f) => aplicarZoom(f),
    chat: (nome) => abrirChat(achar(nome) || player),
    ssh: () => abrirSsh(),
    salas: () => todosParaSalas(),
    focar: (id) => setFocus(id),
    congelar: (v) => { congelado = !!v; },
    mini: (v) => { modoMini = !!v; document.getElementById('btn-modo-mini')?.setAttribute('aria-pressed', String(modoMini)); },
    foco: (v) => { modoFoco = !!v; document.getElementById('btn-foco')?.setAttribute('aria-pressed', String(modoFoco)); },
    irAte: (nome) => {
      const a = achar(nome);
      if (!a) return false;
      const v = perto(a.c, a.r, 2);
      if (!v) return false;
      player.caminho = astar(player, { c: v.c + 0.5, r: v.r + 0.5 });
      player.passo = 0; seguir = true; focusId = '';
      return true;
    },
    proximo: () => proxAgente,
    acenar: () => acenar(proxAgente),
    avancar: (ms) => { const n = Math.min(8000, ms / PASSO); for (let i = 0; i < n; i++) update(PASSO); }
  };
})();
