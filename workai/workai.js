// WorkAI — escritório isométrico desenhado no canvas (sem sprites de terceiros).
// Status e falas são ilustrativos: nada aqui lê sistema real, dado de cliente,
// chave, token ou IP, e nada é enviado para fora.
// Integração das falas: WorkAI.notify(agentId, texto, { demo: true }).
(() => {
  const COLS = 20, ROWS = 52, TW = 64, TH = 32, WALL = 52;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PASSO = 1000 / 30;

  const ROOMS = [
    { id: 'dir', name: 'Diretoria', short: 'Diretoria', col: '#f0d78c', c: 1, r: 0, w: 18, h: 4, glass: true, ala: 'dm' },
    { id: 'op', name: 'DM Operação', sub: 'sala do head', short: 'Operação', col: '#e2b657', c: 1, r: 7, w: 4, h: 3, ala: 'dm' },
    { id: 'sre', name: 'DM SRE & O11y', short: 'SRE & O11y', col: '#3ec6e0', c: 7, r: 7, w: 5, h: 3, ala: 'dm' },
    { id: 'mkt', name: 'Dyno Marketing', short: 'Marketing', col: '#ff6fa8', c: 14, r: 7, w: 5, h: 3, ala: 'dm' },
    { id: 'com', name: 'Dyno Comercial', short: 'Comercial', col: '#7dce7a', c: 1, r: 13, w: 4, h: 3, ala: 'dm' },
    { id: 'prd', name: 'DM Produto & Receita', short: 'Produto', col: '#b18cff', c: 6, r: 13, w: 4, h: 3, ala: 'dm' },
    { id: 'copa', name: 'Copa & Reuniões', short: 'Copa', col: '#e0c080', c: 11, r: 13, w: 4, h: 3, ala: 'dm' },
    { id: 'desc', name: 'Sala de Descompressão', short: 'Descompressão', col: '#7ec8c3', c: 16, r: 13, w: 3, h: 3, ala: 'dm' },
    { id: 'odyn', name: 'Dyno AI', sub: 'carro-chefe', short: 'Dyno AI', col: '#8fd46a', c: 1, r: 21, w: 10, h: 4, glass: true, ala: 'dyno' },
    { id: 'gab', name: 'Gabinete', short: 'Gabinete', col: '#f0d78c', c: 12, r: 21, w: 7, h: 4, ala: 'dyno' },
    { id: 'cres', name: 'Crescimento', short: 'Crescimento', col: '#f0a05a', c: 1, r: 27, w: 6, h: 3, ala: 'dyno' },
    { id: 'cli', name: 'Clientes', short: 'Clientes', col: '#7eb6e0', c: 8, r: 27, w: 6, h: 3, ala: 'dyno' },
    { id: 'fin', name: 'Finanças', short: 'Finanças', col: '#e2b657', c: 15, r: 27, w: 4, h: 3, ala: 'dyno' },
    { id: 'tec', name: 'Tecnologia', sub: 'Estaleiro e Esteira', short: 'Tecnologia', col: '#3ec6e0', c: 1, r: 33, w: 12, h: 3, ala: 'dyno' },
    { id: 'brev', name: 'Em breve', short: 'Em breve', col: '#8a8f99', c: 14, r: 33, w: 5, h: 3, ala: 'dyno', breve: true },
    { id: 'marca', name: 'Dynamo Wear', sub: 'atendimento', short: 'Atendimento', col: '#ff7a1a', piso: '#2a1c14cc', c: 1, r: 40, w: 11, h: 4, glass: true, ala: 'wear' },
    { id: 'wped', name: 'Portal', sub: 'afiliados e creators', short: 'Portal', col: '#ffb020', piso: '#241910cc', c: 13, r: 40, w: 6, h: 4, ala: 'wear' },
    { id: 'wcom', name: 'Financeiro', short: 'Financeiro', col: '#e2c27a', piso: '#241910cc', c: 1, r: 47, w: 8, h: 3, ala: 'wear' },
    { id: 'wcon', name: 'Produção', sub: 'estoque', short: 'Produção', col: '#ff8a2a', piso: '#241910cc', c: 10, r: 47, w: 5, h: 3, ala: 'wear' },
    { id: 'wsaida', name: 'Saída de parceiro', short: 'Saída', col: '#8a8f99', piso: '#1c1c1eaa', c: 16, r: 47, w: 3, h: 3, ala: 'wear', breve: true }
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
    { room: 'marca', name: 'Dyna 2.0', role: 'agente-chefe da Dynamo Wear', chefe: true, tom: '#ff7a1a', sit: 'Em teste', cuida: 'A venda com teto de desconto, o checkout, a aprovação de afiliado, o cupom de parceiro e a qualificação do lead. Em teste, fala só com o time.', nunca: 'Amplia o teste antes de fechar a conversa e a verificação do webhook. Não dá desconto fora da regra. Não fala com cliente enquanto o teste não abrir.', c: 5.5, r: 42.35 },
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
  fill(5, 11, 5, 19);
  fill(10, 11, 10, 19);
  fill(4, 16, 6, 19);
  fill(9, 16, 11, 19);
  fill(1, 19, 18, 19);
  fill(1, 21, 10, 23);
  fill(12, 21, 18, 23);
  fill(1, 25, 18, 25);
  fill(1, 27, 6, 29);
  fill(8, 27, 13, 29);
  fill(15, 27, 18, 29);
  fill(1, 31, 18, 31);
  fill(1, 33, 12, 35);
  fill(14, 33, 18, 35);
  fill(8, 36, 9, 37);
  fill(6, 38, 12, 39);
  fill(1, 39, 18, 39);
  fill(1, 40, 11, 43);
  fill(13, 40, 18, 43);
  fill(1, 45, 18, 45);
  fill(1, 47, 8, 49);
  fill(10, 47, 14, 49);
  fill(16, 47, 18, 49);
  for (const [c, r] of PORTAS) mark(c, r, 1);
  const BLOQUEIOS = [[7, 1], [8, 1], [9, 1], [10, 1], [8, 0], [9, 0], [12, 14], [13, 14], [11, 15], [17, 15], [18, 15], [16, 15], [18, 14], [1, 9], [11, 9], [18, 7], [1, 13], [4, 15], [6, 13], [3, 21], [4, 21], [5, 21], [4, 22], [5, 22], [6, 40], [7, 40]];
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
      roomId: a.room, room: rm, name: a.name, id: slug(a.name), role: a.role, papel: a.papel || '',
      coord: !!a.coord, shield: !!a.shield, bot: !!a.bot, ceo: !!a.ceo, desk: a.desk || null,
      destaque: !!a.destaque, brief: !!a.brief, breve: !!a.breve, chefe: !!a.chefe, proposta: !!a.proposta, tom: a.tom || '',
      sit: a.sit || '', nivel: a.nivel || (a.cuida ? 'não marcado' : ''),
      cuida: a.cuida || '', nunca: a.nunca || '',
      homeC: a.c, homeR: a.r, c: a.c, r: a.r,
      hair: a.ceo ? '#2a1810' : a.name === 'Dina' ? '#6d3ea3' : HAIR[h % HAIR.length],
      skin: a.ceo ? '#e4b48e' : a.bot ? '#d7f6ff' : a.name === 'Dina' ? '#f6d0dc' : SKIN[h % SKIN.length],
      hairStyle: a.ceo ? 0 : h % 6, ph: (h % 628) / 100,
      status: a.ceo || a.breve || rm.ala === 'dyno' || rm.ala === 'wear' ? null : STATUS[h % 4],
      nome: a.ceo ? 'Daniel' : a.name,
      caminho: null, passo: 0, espera: 1200 + (h % 5000), fila: [], missao: null, trava: 0, repath: 0, ultimoAlvo: ''
    };
  });
  for (const [c, r] of PORTAS) if (!livre(c, r)) erros.push('porta fechada ' + c + ',' + r);
  for (const [id, lista] of Object.entries(VAGAS)) for (const [c, r] of lista) if (!livre(c, r)) erros.push('vaga ' + id + ' ' + c + ',' + r);
  if (erros.length) console.warn('WorkAI mapa', erros.join('; '));

  // O robô verde é só o Dyno AI. O Dyno Bot (CTO) continua o holograma com coroa.
  // A Dyna 2.0 é o robô preto e laranja, com o W. Não é a Dina.
  const ROBOS = {
    Daniel: { cor: '#e2c27a', base: '/workai/assets/avatares/daniel', alto: 102 },
    'Dyno AI': { cor: '#3ddc97', base: '/workai/assets/avatares/dyno', alto: 98 },
    Dina: { cor: '#ff4fa3', base: '/workai/assets/avatares/dina', alto: 90 },
    'Dyna 2.0': { cor: '#ff7a1a', base: '/workai/assets/avatares/dyna', alto: 96 }
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
    a.altoRobo = r.alto;
    a.busto = r.base + '-busto.webp';
    a.sprite512 = carregarImg(r.base + '-512.webp');
    a.sprite256 = carregarImg(r.base + '-256.webp');
  }

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

  const cvs = document.getElementById('c');
  const ctx = cvs.getContext('2d');
  const palco = document.getElementById('palco');
  let viewW = 1, viewH = 1, dpr = 1, focusId = '', t = 0, cam = { s: 1, ox: 0, oy: 0 };
  let mouse = null, hover = null, ready = false, seguir = true, congelado = false, demoEm = 12000, fluxos = false;
  let vista = [0, ROWS - 1];
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
    if (!a || a.ceo || a.breve) return false;
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
    'Dyno Bot': 'Os coordenadores receberam a tarefa ilustrativa.',
    'Dyno AI': 'Um atendimento ilustrativo do produto ficou pronto.',
    'Dina': 'Um lembrete ilustrativo de rotina está na hora.',
    'Brief AI': 'A fila ilustrativa das 9h está reunida.',
    'Pulse AI': 'Um rascunho ilustrativo de rede social espera aprovação.',
    'AI SDR': 'Um lead ilustrativo pediu retorno.',
    'Closer AI': 'O comercial ilustrativo ainda está no papel.',
    'Onboard AI': 'O monitor ilustrativo de implantação mudou de etapa.',
    'Care AI': 'O pós-venda ilustrativo ainda não começou.',
    'Help AI': 'Um chamado ilustrativo de primeira linha entrou.',
    'Fix AI': 'O diagnóstico ilustrativo ainda não está no ar.',
    'Cash AI': 'Um recebimento ilustrativo espera aprovação. Dinheiro não passa do nível 2.',
    'Vigia': 'Um sinal ilustrativo do ambiente pediu olhar.',
    'Insight AI': 'Uma leitura ilustrativa da qualidade do Dyno AI ficou pronta.',
    'Arquiteto': 'O desenho ilustrativo de uma mudança está na esteira.',
    'Construtor': 'A peça ilustrativa da esteira foi montada.',
    'Testes': 'A verificação ilustrativa da esteira terminou.',
    'Revisor': 'A revisão ilustrativa da esteira está na fila.',
    'Sentinela Esteira': 'O passo ilustrativo de publicação foi observado.',
    'Gauntlet': 'A prova ilustrativa ao lado do Estaleiro terminou.',
    'Dyna 2.0': 'O teste ilustrativo do setor pediu uma leitura.',
    'Funil Vendas': 'Uma conversa ilustrativa de venda pediu retomada.',
    'Afiliados e Creators': 'Um cadastro ilustrativo espera aprovação.',
    Cupons: 'A reconciliação ilustrativa de cupons fechou o dia.',
    'Financeiro Dynamo': 'Uma conciliação ilustrativa espera o passo manual. Dinheiro não passa do nível 2.',
    'Produção e Estoque': 'O quadro ilustrativo de produção mudou de etapa.',
    'Dyna Grupos': 'Um comando ilustrativo de grupo ficou sem uso.'
  };
  function tickDemo(dt) {
    demoEm -= dt;
    if (demoEm > 0) return;
    demoEm = 14000 + Math.random() * 10000;
    if (agents.filter((a) => a.missao).length >= 2) return;
    const livres = agents.filter((a) => !a.ceo && !a.breve && !a.missao && !a.fila.length);
    if (!livres.length) return;
    const a = livres[Math.floor(Math.random() * livres.length)];
    notify(a.name, FALAS[a.name] || 'Tenho um aviso ilustrativo.', { demo: true });
  }

  function updateAgente(a, dt) {
    if (a.ceo || a.breve) return;
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

  function caixa(c0, r0, c1, r1) {
    const pts = [project(c0, r0, WALL), project(c1, r0, WALL), project(c0, r1, 0), project(c1, r1, 0)];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    return { x: minX - 16, y: minY - 12, w: maxX - minX + 32, h: maxY - minY + 28 };
  }
  function boundsOf(id) {
    if (id === 'dyno') return caixa(0, 18.2, COLS, 36.3);
    if (id === 'wear') return caixa(0, 37.2, COLS, ROWS + 0.3);
    if (!id || id === 'dm') return caixa(0, -0.4, COLS, 16.8);
    const rm = room(id);
    if (!rm) return caixa(0, -0.4, COLS, 16.8);
    return caixa(rm.c - 0.2, rm.r - 0.2, rm.c + rm.w + 0.3, rm.r + rm.h + 0.45);
  }
  function faixaR() {
    if (seguir) {
      const r = Math.floor(player.r);
      return [Math.max(0, r - 12), Math.min(ROWS - 1, r + 10)];
    }
    if (focusId === 'dyno') return [18, 36];
    if (focusId === 'wear') return [37, ROWS - 1];
    const rm = room(focusId);
    if (rm) return [Math.max(0, rm.r - 2), Math.min(ROWS - 1, rm.r + rm.h + 2)];
    return [0, 17];
  }
  function drawWalls() {
    const h = WALL;
    const faixa = (c0, c1, r, col, cap) => {
      quad(project(c0, r, h), project(c1, r, h), project(c1, r, 0), project(c0, r, 0), col);
      quad(project(c0, r, h + 5), project(c1, r, h + 5), project(c1, r, h), project(c0, r, h), cap);
    };
    const lado = (c, r0, r1, col, cap) => {
      quad(project(c, r0, h), project(c, r1, h), project(c, r1, 0), project(c, r0, 0), col);
      quad(project(c, r0, h + 5), project(c, r1, h + 5), project(c, r1, h), project(c, r0, h), cap);
    };
    faixa(0, COLS, -0.2, '#3a342c', '#e2c27a');
    lado(-0.2, 0, 36, '#2e2924', '#c4a15a');
    faixa(0, 7.6, 37.8, '#161616', '#ff7a1a');
    faixa(10.4, COLS, 37.8, '#161616', '#ff7a1a');
    lado(-0.2, 38, ROWS, '#121212', '#ff7a1a');
  }
  function tile(c, r, col) {
    quad(project(c, r), project(c + 1, r), project(c + 1, r + 1), project(c, r + 1), col);
  }
  function drawFloor() {
    const [r0, r1] = vista;
    for (let r = r0; r <= r1; r++) for (let c = 0; c < COLS; c++) if (W[at(c, r)]) {
      const zona = r >= 38 ? 'wear' : (r >= 36 ? 'ponte' : 'casa');
      const cor = zona === 'wear' ? ((c + r) % 2 ? '#121214' : '#1a1a1d') : zona === 'ponte' ? ((c + r) % 2 ? '#2a2118' : '#3a2c1e') : ((c + r) % 2 ? '#171a22' : '#1c1f29');
      tile(c, r, cor);
    }
    for (const rm of ROOMS) {
      if (rm.r + rm.h < r0 || rm.r > r1) continue;
      ctx.save();
      if (rm.breve) ctx.globalAlpha = 0.42;
      quad(project(rm.c, rm.r), project(rm.c + rm.w, rm.r), project(rm.c + rm.w, rm.r + rm.h), project(rm.c, rm.r + rm.h), rm.piso || (rm.col + (rm.glass ? '99' : '66')));
      ctx.beginPath();
      const a = project(rm.c, rm.r), b = project(rm.c + rm.w, rm.r), c = project(rm.c + rm.w, rm.r + rm.h), d = project(rm.c, rm.r + rm.h);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
      ctx.strokeStyle = rm.ala === 'wear' ? '#ff7a1a' : rm.id === 'odyn' ? '#d7f5b0' : rm.col;
      ctx.globalAlpha = rm.breve ? 0.45 : rm.glass ? 0.95 : 0.55;
      ctx.lineWidth = rm.ala === 'wear' || rm.id === 'odyn' ? 3.2 : rm.glass ? 2.4 : 1.5;
      ctx.stroke();
      ctx.restore();
    }
    for (const [c, r] of PORTAS) if (r >= r0 && r <= r1) tile(c, r, '#3a3428');
    const o = (c, r) => project(c, r);
    const contorno = (pts, cor) => {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.strokeStyle = cor; ctx.lineWidth = 2; ctx.stroke();
    };
    contorno([o(0, 0), o(COLS, 0), o(COLS, 36), o(10.3, 36), o(10.3, 36.15), o(7.7, 36.15), o(7.7, 36), o(0, 36)], 'rgba(226,194,122,.8)');
    contorno([o(0, 38), o(7.7, 38), o(7.7, 37.85), o(10.3, 37.85), o(10.3, 38), o(COLS, 38), o(COLS, ROWS), o(0, ROWS)], 'rgba(255,122,26,.9)');
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
  function drawPalco() {
    box(3.05, 21.05, 2.7, 1.15, 10, '#d7f5b0', '#6ea84a', '#3e6a2c');
    box(3.35, 21.3, 2.1, 0.55, 16, '#e2c27a', '#a6853f', '#6e5424');
  }
  function drawArara() {
    box(5.7, 40.15, 1.7, 0.32, 20, '#141414', '#0e0e0e', '#080808');
    box(5.82, 40.2, 0.12, 0.2, 28, '#ff7a1a', '#c45a10', '#8a3c08');
    box(7.05, 40.2, 0.12, 0.2, 28, '#ff7a1a', '#c45a10', '#8a3c08');
    const p = project(6.55, 40.28, 24);
    ctx.fillStyle = '#111';
    ctx.fillRect(p.x - 16, p.y - 10, 18, 14);
    ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 1; ctx.strokeRect(p.x - 16, p.y - 10, 18, 14);
  }
  function drawLetreiro() {
    const p = project(6.1, 39.15, 36);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = '#111';
    ctx.fillRect(-58, -24, 116, 40);
    ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 1.6; ctx.strokeRect(-58, -24, 116, 40);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.font = '800 14px system-ui,sans-serif';
    ctx.fillText('DYNAMO', 0, -8);
    ctx.fillStyle = '#ff7a1a'; ctx.font = '800 11px system-ui,sans-serif';
    ctx.fillText('WEAR', 0, 6);
    ctx.fillStyle = '#f4efe4'; ctx.font = '600 7px system-ui,sans-serif';
    ctx.fillText('EST. 2026', 0, 16);
    ctx.restore();
  }
  function drawFluxos() {
    if (!fluxos) return;
    const ala = focusId === 'dyno' || room(focusId)?.ala === 'dyno' || (seguir && player.r > 17 && player.r < 36);
    if (!ala) return;
    const pos = (nome) => { const a = achar(nome); return project(a.homeC, a.homeR, 3); };
    const est = project(6.2, 34.1, 3);
    const seta = (pts, cor) => {
      ctx.save();
      ctx.strokeStyle = cor; ctx.fillStyle = cor; ctx.lineWidth = 2.6; ctx.setLineDash([8, 6]);
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      ctx.setLineDash([]);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - 9 * Math.cos(ang - 0.45), b.y - 9 * Math.sin(ang - 0.45));
        ctx.lineTo(b.x - 9 * Math.cos(ang + 0.45), b.y - 9 * Math.sin(ang + 0.45));
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    };
    seta(['Pulse AI', 'AI SDR', 'Closer AI', 'Onboard AI', 'Care AI'].map(pos), '#f0a05a');
    seta([pos('Help AI'), pos('Fix AI'), est, pos('Help AI')], '#7eb6e0');
    seta([pos('Vigia'), pos('Fix AI'), est], '#3ec6e0');
    seta([pos('Brief AI'), project(7.5, 19.2, 3)], '#f0d78c');
  }
  function spriteRobo(a) {
    const pref = viewW < 720 ? a.sprite256 : a.sprite512;
    const alt = viewW < 720 ? a.sprite512 : a.sprite256;
    if (pref && pref.complete && pref.naturalWidth) return pref;
    if (alt && alt.complete && alt.naturalWidth) return alt;
    return null;
  }
  function desenharRobo(a, walking) {
    const img = spriteRobo(a);
    if (!img) return false;
    const feet = project(a.c, a.r, 0);
    const bob = reduce ? 0 : walking ? Math.abs(Math.sin(t / 140)) * 3.2 : Math.sin(t / 700 + a.ph) * 1.3;
    const sway = walking && !reduce ? Math.sin(t / 160) * 0.055 : 0;
    const alto = a.altoRobo;
    const larg = alto * (img.naturalWidth / img.naturalHeight);
    ctx.save();
    ctx.translate(feet.x, feet.y);
    const marca = a.destaque || a.ceo || a.chefe;
    ellipse(0, 3, marca ? 20 : 16, 7, 'rgba(0,0,0,.32)');
    if (!reduce) {
      ctx.strokeStyle = a.corRobo;
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = marca ? 2.6 : 2;
      ctx.beginPath();
      ctx.ellipse(0, 3, marca ? 22 : 17, 8, 0, 0, 7);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.translate(0, -bob);
    ctx.rotate(sway);
    ctx.drawImage(img, -larg / 2, -alto + 8, larg, alto);
    ctx.restore();
    return true;
  }
  function drawAgent(a, walking) {
    if (desenharRobo(a, walking)) return;
    const feet = project(a.c, a.r, 0);
    const bob = reduce ? 0 : walking ? Math.abs(Math.sin(t / 120)) * 2 : Math.sin(t / 700 + a.ph) * 1.4;
    const x = feet.x, y = feet.y - bob;
    ctx.save(); ctx.translate(x, y);
    if (a.breve) ctx.globalAlpha = 0.3;
    const glow = a.room.col;
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ellipse(0, 4, 13, 5, 'rgba(0,0,0,.28)');
    if (a.ceo && !reduce) {
      ctx.strokeStyle = '#e2c27a'; ctx.globalAlpha = 0.9; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(0, 3, 16, 6, 0, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    } else if (a.destaque && !reduce) {
      ctx.strokeStyle = '#d7f5b0'; ctx.globalAlpha = 0.95; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.ellipse(0, 3, 20, 8, 0, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    } else if (!a.ceo && !a.breve && !reduce) {
      ctx.save(); ctx.strokeStyle = glow; ctx.globalAlpha = 0.7; ctx.setLineDash([3, 4]); ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.ellipse(0, 2, 14, 5.5, 0, 0, 7); ctx.stroke(); ctx.restore();
    }
    const step = walking && !reduce ? Math.sin(t / 90) * 2.2 : 0;
    const arm = !walking && a.status === 'digitando' && !reduce ? Math.sin(t / 80 + a.ph) * 3 : 0;
    const ink = 'rgba(8,12,20,.9)';
    const cloth = a.ceo ? '#243044' : a.breve ? '#9aa0aa' : (a.tom || shade(glow, -25));
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
    if (!a.ceo && !a.breve) {
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
  function visivel(a) {
    if (seguir) return Math.abs(a.r - player.r) < 14 && Math.abs(a.c - player.c) < 16;
    if (focusId === 'dyno') return a.room?.ala === 'dyno';
    if (focusId === 'wear') return a.room?.ala === 'wear';
    if (focusId === 'dm' || !focusId) return a.room?.ala === 'dm';
    return a.roomId === focusId;
  }

  function drawLabels() {
    const overview = !seguir && ((focusId === 'dyno' && cam.s < 0.95) || ((focusId === 'dm' || !focusId) && cam.s < 0.72));
    if (overview) {
      const ala = focusId === 'dyno' ? 'dyno' : focusId === 'wear' ? 'wear' : 'dm';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 12px system-ui,sans-serif';
      for (const rm of ROOMS) {
        if (rm.ala !== ala) continue;
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
      const s = toScreen(feet.x, feet.y - (a.altoRobo ? a.altoRobo + 22 : 78));
      const extra = a.ceo ? ' · você' : a.proposta ? ' · proposta' : a.breve ? ' · em breve' : (a.coord || a.bot ? ' ★' : '') + (a.shield ? ' 🛡' : '');
      const label = (a.ceo ? a.nome : a.name) + extra;
      const w = Math.min(220, ctx.measureText(label).width + (a.status ? 22 : 14));
      let y = s.y;
      for (const p of placed) if (Math.abs(p.x - s.x) < (p.w + w) / 2 && Math.abs(p.y - y) < 18) y = p.y - 18;
      placed.push({ x: s.x, y, w });
      const hot = hover === a;
      const claro = hot || a.ceo || a.destaque || a.chefe || a.name === 'Dina';
      const borda = a.ceo ? '#e2c27a' : (a.corRobo || (a.destaque ? '#3ddc97' : a.room.col));
      rr(s.x - w / 2, y - 10, w, 20, 8, claro ? '#fffdf6' : 'rgba(8,10,16,.88)', borda);
      ctx.fillStyle = claro ? '#1b1f2e' : '#fff';
      ctx.fillText(label, s.x + (a.status ? 4 : 0), y);
      if (a.status) {
        const dot = { digitando: '#7ee07e', 'em foco': '#ffb84d', 'em reunião': '#ff6f6f', disponível: '#4dd2ff' }[a.status];
        ctx.fillStyle = dot; ctx.beginPath(); ctx.arc(s.x - w / 2 + 8, y, 3.1, 0, 7); ctx.fill();
      }
      hits.push({ a, x: s.x, y: y + 36, r: 36 });
      if (a.ceo) {
        const seta = toScreen(feet.x, feet.y - (a.altoRobo ? a.altoRobo + 40 : 108));
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
    const s = toScreen(feet.x, feet.y - 122 - (a.altoRobo ? 36 : 0));
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
  function drawLegendaFluxos() {
    if (!fluxos) return;
    const ala = focusId === 'dyno' || room(focusId)?.ala === 'dyno' || (seguir && player.r > 17 && player.r < 36);
    if (!ala) return;
    const itens = [['#f0a05a', 'Cliente novo'], ['#7eb6e0', 'Chamado'], ['#3ec6e0', 'Erro no ambiente'], ['#f0d78c', 'Gestão → Daniel']];
    ctx.font = '700 12px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    let y = 40;
    for (const [cor, texto] of itens) {
      const w = ctx.measureText(texto).width + 28;
      rr(12, y, w, 20, 8, 'rgba(8,10,16,.88)');
      ctx.fillStyle = cor; ctx.fillRect(18, y + 6, 8, 8);
      ctx.fillStyle = '#fff'; ctx.fillText(texto, 32, y + 10);
      y += 24;
    }
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
    vista = faixaR();
    const rmFocus = !seguir ? room(focusId) : null;
    if (rmFocus) {
      const pad = 0.15;
      ctx.save();
      ctx.beginPath();
      const a = project(rmFocus.c - pad, rmFocus.r - pad), b = project(rmFocus.c + rmFocus.w + pad, rmFocus.r - pad);
      const c = project(rmFocus.c + rmFocus.w + pad, rmFocus.r + rmFocus.h + pad), d = project(rmFocus.c - pad, rmFocus.r + rmFocus.h + pad);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
      ctx.clip();
    }
    drawWalls(); drawFloor(); drawFluxos();
    if (vista[0] < 10) {
      pool(8, 1.6, 80, 'rgba(240,215,140,.16)');
      pool(12.8, 14.2, 70, 'rgba(224,192,128,.16)');
      pool(17.2, 14.4, 60, 'rgba(126,200,195,.16)');
      medallion(9.5, 5.5);
    }
    if (vista[0] < 30 && vista[1] > 20) pool(5, 22.4, 96, 'rgba(141,212,106,.22)');
    const list = [];
    const add = (k, fn) => list.push({ k, fn });
    if (vista[0] < 16) {
      add(7.2, drawMesaExec);
      [[1, 9], [11, 9], [18, 7], [1, 13], [4, 15], [6, 13]].forEach(([c, r]) => add(c + r, () => drawPlant(c, r)));
      add(26, drawMesaCopa); add(26.2, drawCafe); add(30, drawLounge);
    }
    if (vista[0] < 34 && vista[1] > 20) add(24.4, drawPalco);
    if (vista[1] > 38) { add(39.3, drawLetreiro); add(40.5, drawArara); }
    for (const a of agents) if (a.desk && visivel(a)) add(a.desk[0] + a.desk[1] + 0.2, () => drawDesk(a));
    for (const a of agents) if (visivel(a)) add(a.c + a.r + 0.05, () => drawAgent(a, andando(a)));
    list.sort((a, b) => a.k - b.k);
    for (const it of list) it.fn();
    if (vista[0] < 8) drawGlass();
    if (mouse && seguir) {
      const w = unproject(mouse.x, mouse.y);
      const cell = perto(w.c, w.r, 1);
      if (cell) {
        ctx.globalAlpha = 0.35;
        tile(cell.c, cell.r, '#e2c27a');
        ctx.globalAlpha = 1;
      }
    }
    if (rmFocus) ctx.restore();
    for (const a of agents) if (visivel(a)) {
      const feet = project(a.c, a.r, 0);
      const s = toScreen(feet.x, feet.y - 20);
      hits.push({ a, x: s.x, y: s.y, r: 28 });
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (focusId && !seguir) {
      const rm = room(focusId);
      const texto = rm ? (rm.sub ? rm.name + ' · ' + rm.sub : rm.name) : (focusId === 'dyno' ? 'Operação Dyno' : focusId === 'wear' ? 'Dynamo Wear · EST. 2026' : 'Escritório');
      const col = rm ? rm.col : (focusId === 'dyno' ? '#8fd46a' : focusId === 'wear' ? '#ff7a1a' : '#e2c27a');
      ctx.font = '700 13px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(texto).width + 16;
      rr(12, 10, w, 22, 8, 'rgba(8,10,16,.88)');
      ctx.fillStyle = col; ctx.fillRect(18, 16, 8, 8);
      ctx.fillStyle = '#fff'; ctx.fillText(texto, 32, 21);
    }
    captionSala();
    drawLegendaFluxos();
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
    papel.textContent = a.ceo ? 'CEO' : a.bot ? 'CTO' : a.chefe ? 'Chefe da Dynamo Wear' : a.papel ? a.papel : a.proposta ? 'Proposta' : a.destaque ? 'Carro-chefe' : a.name === 'Dina' ? 'Agenda e rotina' : a.brief ? 'Ponte de gestão' : a.breve ? 'Em breve' : a.coord ? 'Coordenador' : a.shield ? 'Segurança' : 'Agente';
    const area = document.createElement('p'); area.className = 'area';
    const dot = document.createElement('span'); dot.className = 'ponto'; dot.style.background = a.room.col;
    area.append(dot, document.createTextNode(a.room.sub ? a.room.name + ' · ' + a.room.sub : a.room.name));
    const cab = document.createElement('div');
    cab.className = 'cabeca';
    if (a.busto) {
      const foto = document.createElement('img');
      foto.className = 'rosto';
      foto.alt = '';
      foto.src = a.busto;
      if (a.corRobo) foto.style.borderColor = a.corRobo;
      cab.append(foto);
    }
    const textos = document.createElement('div');
    textos.append(h, papel);
    cab.append(textos);
    corpo.append(cab, area);
    const campo = (rotulo, texto) => {
      if (!texto) return;
      const p = document.createElement('p');
      const sm = document.createElement('small');
      sm.textContent = rotulo;
      p.append(sm, document.createTextNode(texto));
      corpo.append(p);
    };
    if (a.bot) { const g = document.createElement('p'); g.textContent = 'Gerente dos agentes.'; corpo.append(g); }
    else if (a.chefe) { const g = document.createElement('p'); g.textContent = 'Agente-chefe da Dynamo Wear. Responde ao Daniel.'; corpo.append(g); }
    else if (!a.ceo && !a.cuida) {
      const role = document.createElement('p');
      role.textContent = a.role.charAt(0).toUpperCase() + a.role.slice(1) + '.';
      corpo.append(role);
    }
    campo('Situação: ', a.sit);
    campo('Nível: ', a.nivel);
    campo('Cuida de: ', a.cuida);
    campo('Nunca faz: ', a.nunca);
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
    const w = 340, hgt = card.offsetHeight || 220;
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
  chip('dm', 'Escritório', '#e2c27a');
  chip('dyno', 'Operação Dyno', '#8fd46a');
  chip('wear', 'Dynamo Wear', '#ff7a1a');
  ROOMS.forEach((r) => chip(r.id, r.short, r.col));
  document.getElementById('centralizar').addEventListener('click', () => { seguir = true; focusId = ''; syncChips(); });
  const btnFluxos = document.getElementById('fluxos');
  if (btnFluxos) btnFluxos.addEventListener('click', () => {
    fluxos = !fluxos;
    btnFluxos.classList.toggle('is-on', fluxos);
    btnFluxos.setAttribute('aria-pressed', fluxos ? 'true' : 'false');
    const noEscritorio = seguir ? player.r < 18 : (focusId === 'dm' || !focusId || room(focusId)?.ala === 'dm');
    if (fluxos && noEscritorio) setFocus('dyno');
  });
  syncChips();

  const arvore = document.getElementById('arvore');
  function montarArvore() {
    arvore.replaceChildren();
    const linha = (cls, texto, agente, aoClicar) => {
      const el = aoClicar || agente ? document.createElement('button') : document.createElement('div');
      el.className = cls; if (el.tagName === 'BUTTON') el.type = 'button';
      if (agente?.busto) {
        const foto = document.createElement('img');
        foto.className = 'rosto';
        foto.alt = '';
        foto.src = agente.busto;
        el.append(foto);
      }
      el.append(document.createTextNode(texto));
      if (aoClicar) el.addEventListener('click', aoClicar);
      else if (agente) el.addEventListener('click', () => abrir(agente, el.getBoundingClientRect()));
      arvore.append(el);
    };
    linha('n0', nomeCeo() + ' (CEO)', player, () => { seguir = true; focusId = ''; syncChips(); abrir(player, { x: 80, y: 120 }); });
    linha('n1', 'Dyno Bot · CTO · gerente', achar('Dyno Bot'));
    linha('n2', 'Recap AI', achar('Recap AI'));
    for (const rm of ROOMS) {
      if (rm.ala !== 'dm' || rm.id === 'dir' || rm.id === 'copa' || rm.id === 'desc' || rm.id === 'op') continue;
      const coord = agents.find((a) => a.roomId === rm.id && a.coord);
      if (!coord) continue;
      linha('n2', '★ ' + coord.name + ' · ' + rm.short, coord);
      agents.filter((a) => a.roomId === rm.id && !a.coord).forEach((a) => linha('n3', a.name + (a.shield ? ' · segurança' : ''), a));
    }
    linha('n1', 'Operação Dyno', null, () => setFocus('dyno'));
    linha('n2', 'Brief AI · ponte', achar('Brief AI'));
    linha('n2', 'Dyno AI · carro-chefe', achar('Dyno AI'));
    linha('n3', 'Dina', achar('Dina'));
    for (const id of ['cres', 'cli', 'fin', 'tec', 'brev']) {
      const rm = room(id);
      linha('n2', rm.short, null, () => setFocus(id));
      agents.filter((a) => a.roomId === id).forEach((a) => linha(a.breve ? 'n3 breve' : 'n3', a.name, a));
    }
    linha('n1', 'Dynamo Wear', null, () => setFocus('wear'));
    linha('n2', 'Dyna 2.0 · em teste', achar('Dyna 2.0'));
    linha('n3', 'Funil Vendas · no ar', achar('Funil Vendas'));
    linha('n3', 'Afiliados e Creators · no ar', achar('Afiliados e Creators'));
    linha('n3', 'Cupons · no ar', achar('Cupons'));
    linha('n3', 'Financeiro Dynamo · manual', achar('Financeiro Dynamo'));
    linha('n3', 'Produção e Estoque · no ar', achar('Produção e Estoque'));
    linha('n3', 'Dyna Grupos · sem uso', achar('Dyna Grupos'));
    linha('n3 breve', 'Saída de Parceiro · proposta', achar('Saída de Parceiro'));
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
    repouso: () => {
      for (const a of agents) {
        a.c = a.homeC; a.r = a.homeR; a.caminho = null; a.passo = 0;
        a.missao = null; a.fila.length = 0; a.espera = 1e9; a.ultimoAlvo = '';
      }
      demoEm = 1e15;
    },
    card: (nome, x, y) => {
      const a = nome === 'Daniel' || nome === player.nome ? player : achar(nome);
      if (!a) return '';
      abrir(a, { x: x == null ? 640 : x, y: y == null ? 120 : y });
      return document.getElementById('card-corpo').textContent;
    },
    robosProntos: () => ['Daniel', 'Dyno AI', 'Dina', 'Dyna 2.0'].every((n) => {
      const a = achar(n);
      return !!(a && spriteRobo(a));
    }),
    fluxos: (v) => {
      fluxos = !!v;
      const b = document.getElementById('fluxos');
      if (b) { b.classList.toggle('is-on', fluxos); b.setAttribute('aria-pressed', fluxos ? 'true' : 'false'); }
    },
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
