// Agente leve do painel /admin/servidores: um em cada VPS, igual em qualquer provedor. Só Node 20, sem dependências.
// Fala com o Docker pelo proxy de socket (tecnativa/docker-socket-proxy, só as seções necessárias; sem exec, build,
// volumes, swarm, segredos) e expõe uma API pequena, só para o serviço do painel, com assinatura HMAC por pedido
// (assinatura.mjs: chave própria da VPS, carimbo de tempo de ±60 s e nonce de uso único) e resposta assinada.
// Logs saem daqui já mascarados (mascara.mjs). Nunca devolve variáveis de ambiente de container.
//
// Variáveis de ambiente:
//   AGENTE_CHAVE           64 hex, a chave desta VPS (a mesma fica no environment do painel, DM_SERV_CHAVES). Sem ela, tudo 401.
//   AGENTE_PORTA (8090)    AGENTE_NOME (opcional, aparece no resumo)
//   DOCKER_HOST            tcp://proxy:2375 (padrão) ou unix:///var/run/docker.sock
//   AGENTE_SOMENTE_LEITURA 1 = recusa toda ação (só lista, detalhes e logs)
//   AGENTE_PROTEGIDOS      projetos que o agente nunca para, atualiza ou apaga (vírgulas; o projeto do próprio agente
//                          entra sozinho). A lista principal fica no painel; esta é a segunda trava.
//   AGENTE_TLS_CERT / AGENTE_TLS_KEY  arquivos PEM: serve HTTPS direto (VPS sem Traefik; o painel fixa a impressão digital)
//   AGENTE_IPS             opcional: só aceita pedidos destes IPs (vírgulas). AGENTE_PROXY=1 lê o IP do X-Forwarded-For.
//
// API (tudo assinado, menos /saude):
//   GET  /v1/resumo                    máquina: CPU, memória, disco, carga, Docker
//   GET  /v1/projetos[?stats=0]        projetos Compose com containers, status, saúde, portas e uso de recursos
//   GET  /v1/containers/<id>           detalhes de um container (healthcheck, redes, montagens; sem environment)
//   GET  /v1/logs?container=<id>&linhas=200   últimas linhas, mascaradas
//   POST /v1/acao {projeto, acao}      reiniciar | parar | iniciar | atualizar (pull + recriar) | deletar
import http from 'node:http';
import https from 'node:https';
import { readFileSync, existsSync } from 'node:fs';
import { readFile, statfs } from 'node:fs/promises';
import { hostname } from 'node:os';
import { pathToFileURL } from 'node:url';
import { chaveDe, criarVerificador, assinarResposta } from './assinatura.mjs';
import { mascarar } from './mascara.mjs';

export const VERSAO = '1.0.0';
const env = process.env;
const ACOES = ['reiniciar', 'parar', 'iniciar', 'atualizar', 'deletar'];
const ROTULO_PROJETO = 'com.docker.compose.project';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Docker ----------
const alvoDocker = (h = env.DOCKER_HOST || 'tcp://proxy:2375') => {
  if (h.startsWith('unix://')) return { socketPath: h.slice(7) };
  const u = new URL(h.replace(/^tcp:/, 'http:'));
  return { host: u.hostname, port: Number(u.port || 2375) };
};
export function clienteDocker(destino = alvoDocker()) {
  return (metodo, caminho, { corpo, timeout = 15_000 } = {}) => new Promise((ok, falha) => {
    const dados = corpo === undefined ? null : Buffer.from(typeof corpo === 'string' ? corpo : JSON.stringify(corpo));
    const req = http.request({ ...destino, method: metodo, path: caminho, headers: { host: 'docker', ...(dados ? { 'content-type': 'application/json', 'content-length': dados.length } : {}) }, timeout }, (res) => {
      const partes = []; let n = 0;
      res.on('data', (c) => { n += c.length; if (n <= 8 * 1024 * 1024) partes.push(c); });
      res.on('end', () => ok({ status: res.statusCode, corpo: Buffer.concat(partes) }));
      res.on('error', falha);
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('docker: tempo esgotado'), { code: 'TEMPO' })));
    req.on('error', falha);
    req.end(dados);
  });
}
const jsonDe = (r) => { try { return JSON.parse(r.corpo.toString('utf8') || 'null'); } catch { return null; } };
const erroDocker = (r, onde) => { const j = jsonDe(r); return Object.assign(new Error(`${onde}: ${j?.message || `HTTP ${r.status}`}`), { status: r.status }); };

// ---------- funções puras (testadas em tools/testes/servidores.mjs) ----------
export const saudeDoStatus = (s = '') => (/\(healthy\)/.test(s) ? 'saudavel' : /\(unhealthy\)/.test(s) ? 'doente' : /health: starting/.test(s) ? 'iniciando' : null);
export const codigoSaida = (s = '') => { const m = /Exited \((-?\d+)\)/.exec(s); return m ? Number(m[1]) : null; };
export const portasTexto = (ps = []) => [...new Set(ps.map((p) => (p.PublicPort ? `${p.IP && p.IP !== '0.0.0.0' && p.IP !== '::' ? p.IP + ':' : ''}${p.PublicPort}→${p.PrivatePort}/${p.Type}` : `${p.PrivatePort}/${p.Type}`)))];
// container de execução única que terminou bem (init, migrate, download): não conta como parado nem como erro
export const ehTarefaConcluida = (c) => c.estado === 'exited' && c.codigoSaida === 0;
export function statusProjeto(cs) {
  const rodando = cs.filter((c) => c.estado === 'running');
  const ruins = cs.filter((c) => c.saude === 'doente' || c.estado === 'restarting' || c.estado === 'dead' || (c.estado === 'exited' && c.codigoSaida !== 0 && c.codigoSaida !== null));
  if (!rodando.length) return cs.some((c) => c.estado === 'restarting' || c.estado === 'dead') ? 'erro' : 'interrompido';
  if (ruins.length) return 'erro';
  return 'executando';
}
export function saudeProjeto(cs) {
  const r = cs.filter((c) => c.estado === 'running');
  const com = r.filter((c) => c.saude);
  return { saudaveis: com.filter((c) => c.saude === 'saudavel').length, doentes: com.filter((c) => c.saude === 'doente').length, iniciando: com.filter((c) => c.saude === 'iniciando').length, semVerificacao: r.length - com.length };
}
export function resumirContainer(c) {
  return {
    id: c.Id.slice(0, 12), nome: String(c.Names?.[0] || '').replace(/^\//, ''), imagem: c.Image, servico: c.Labels?.['com.docker.compose.service'] || null,
    estado: c.State, status: c.Status, saude: saudeDoStatus(c.Status), codigoSaida: codigoSaida(c.Status), portas: portasTexto(c.Ports), criado: c.Created
  };
}
export function agruparProjetos(lista) {
  const grupos = new Map();
  for (const c of lista) {
    const p = c.Labels?.[ROTULO_PROJETO] || null;
    const chave = p || '(sem projeto)';
    if (!grupos.has(chave)) grupos.set(chave, { nome: chave, compose: !!p, containers: [] });
    grupos.get(chave).containers.push(resumirContainer(c));
  }
  return [...grupos.values()].map((g) => {
    g.containers.sort((a, b) => a.criado - b.criado || a.nome.localeCompare(b.nome));
    return { ...g, status: statusProjeto(g.containers), saude: saudeProjeto(g.containers), total: g.containers.length, rodando: g.containers.filter((c) => c.estado === 'running').length };
  }).sort((a, b) => a.nome.localeCompare(b.nome));
}
export function usoDeStats(s) {
  if (!s || !s.cpu_stats) return null;
  const cpu = s.cpu_stats, pre = s.precpu_stats || {};
  const dCpu = (cpu.cpu_usage?.total_usage || 0) - (pre.cpu_usage?.total_usage || 0);
  const dSis = (cpu.system_cpu_usage || 0) - (pre.system_cpu_usage || 0);
  const ncpu = cpu.online_cpus || cpu.cpu_usage?.percpu_usage?.length || 1;
  const m = s.memory_stats || {};
  const cache = m.stats?.inactive_file ?? m.stats?.total_inactive_file ?? m.stats?.cache ?? 0;
  return { cpuPct: dSis > 0 && dCpu >= 0 ? Math.round((dCpu / dSis) * ncpu * 1000) / 10 : null, memUsada: m.usage ? Math.max(0, m.usage - cache) : null, memLimite: m.limit || null };
}
// logs do Docker sem TTY vêm em quadros de 8 bytes de cabeçalho (fluxo, 0, 0, 0, tamanho big-endian)
export function demux(buf) {
  if (!buf.length || buf[0] > 2 || buf[1] || buf[2] || buf[3]) return buf.toString('utf8');
  let i = 0; const partes = [];
  while (i + 8 <= buf.length) { const n = buf.readUInt32BE(i + 4); partes.push(buf.subarray(i + 8, i + 8 + n)); i += 8 + n; }
  return Buffer.concat(partes).toString('utf8');
}
export const separarImagem = (ref) => {
  const [semDigest, digest] = String(ref).split('@');
  const barra = semDigest.lastIndexOf('/'), dois = semDigest.lastIndexOf(':');
  return dois > barra ? { repo: semDigest.slice(0, dois), tag: digest || semDigest.slice(dois + 1) } : { repo: semDigest, tag: digest || 'latest' };
};

// ---------- máquina ----------
const lerCpu = async () => { const l = (await readFile('/proc/stat', 'utf8')).split('\n')[0].trim().split(/\s+/).slice(1).map(Number); const ocioso = l[3] + (l[4] || 0); return { total: l.reduce((a, b) => a + b, 0), ocioso }; };
async function maquina(docker) {
  const info = jsonDe(await docker('GET', '/info')) || {};
  const r = { nome: env.AGENTE_NOME || null, hostname: info.Name || hostname(), so: info.OperatingSystem || null, kernel: info.KernelVersion || null, docker: info.ServerVersion || null, cpus: info.NCPU || null, memTotal: info.MemTotal || null, containers: { total: info.Containers ?? null, rodando: info.ContainersRunning ?? null, parados: info.ContainersStopped ?? null } };
  try {
    const a = await lerCpu(); await sleep(400); const b = await lerCpu();
    r.cpuPct = b.total > a.total ? Math.round((1 - (b.ocioso - a.ocioso) / (b.total - a.total)) * 1000) / 10 : null;
    const mem = Object.fromEntries((await readFile('/proc/meminfo', 'utf8')).split('\n').filter(Boolean).map((l) => { const [k, v] = l.split(':'); return [k, parseInt(v, 10) * 1024]; }));
    r.memTotal = mem.MemTotal || r.memTotal; r.memUsada = mem.MemTotal && mem.MemAvailable ? mem.MemTotal - mem.MemAvailable : null;
    r.carga = (await readFile('/proc/loadavg', 'utf8')).split(' ').slice(0, 3).map(Number);
    r.uptimeS = Math.floor(Number((await readFile('/proc/uptime', 'utf8')).split(' ')[0]));
  } catch { /* /proc indisponível (fora do Linux) */ }
  try { const f = await statfs('/'); r.discoTotal = f.blocks * f.bsize; r.discoUsado = (f.blocks - f.bfree) * f.bsize; } catch {}
  r.agente = { versao: VERSAO, somenteLeitura: env.AGENTE_SOMENTE_LEITURA === '1' };
  return r;
}

// ---------- uso de recursos: atualizado em segundo plano (stats leva ~2 s por container) ----------
function criarStats(docker) {
  const cache = new Map(); let rodando = null, ultimoPedido = 0, atualizado = 0;
  const atualizar = async () => {
    const lista = (jsonDe(await docker('GET', '/containers/json')) || []).map((c) => c.Id);
    let i = 0;
    const trab = async () => { while (i < lista.length) { const id = lista[i++]; try { const r = await docker('GET', `/containers/${id}/stats?stream=false`, { timeout: 8000 }); if (r.status === 200) cache.set(id.slice(0, 12), usoDeStats(jsonDe(r))); } catch {} } };
    await Promise.all(Array.from({ length: 8 }, trab));
    for (const k of cache.keys()) if (!lista.some((id) => id.startsWith(k))) cache.delete(k);
    atualizado = Date.now();
  };
  const disparar = () => { if (!rodando) rodando = atualizar().catch(() => {}).finally(() => { rodando = null; }); return rodando; };
  setInterval(() => { if (Date.now() - ultimoPedido < 5 * 60_000) disparar(); }, 30_000).unref();
  return {
    async obter(esperarMs = 0) { ultimoPedido = Date.now(); if (Date.now() - atualizado > 25_000) { const p = disparar(); if (esperarMs) await Promise.race([p, sleep(esperarMs)]); } return { cache, atualizado }; }
  };
}

// ---------- ações ----------
export function criarAcoes(docker, { protegidos = new Set(), somenteLeitura = false, log = console.log } = {}) {
  const travas = new Set();
  const doProjeto = async (projeto) => {
    const f = encodeURIComponent(JSON.stringify({ label: [`${ROTULO_PROJETO}=${projeto}`] }));
    const r = await docker('GET', `/containers/json?all=1&filters=${f}`);
    if (r.status !== 200) throw erroDocker(r, 'listar');
    return (jsonDe(r) || []).map((c) => ({ ...resumirContainer(c), idCompleto: c.Id, politica: null })).sort((a, b) => a.criado - b.criado);
  };
  const post = async (caminho, aceitos = [204, 304], opts) => { const r = await docker('POST', caminho, opts); if (!aceitos.includes(r.status)) throw erroDocker(r, caminho.split('?')[0]); return r; };
  const inspecionar = async (id) => { const r = await docker('GET', `/containers/${id}/json`); if (r.status !== 200) throw erroDocker(r, 'inspecionar'); return jsonDe(r); };

  async function puxar(ref) {
    const { repo, tag } = separarImagem(ref);
    const r = await docker('POST', `/images/create?fromImage=${encodeURIComponent(repo)}&tag=${encodeURIComponent(tag)}`, { timeout: 300_000 });
    const linhas = r.corpo.toString('utf8').trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return {}; } });
    const erro = linhas.find((l) => l.error || l.errorDetail);
    if (r.status !== 200 || erro) throw new Error(`baixar ${ref}: ${erro?.error || erro?.errorDetail?.message || `HTTP ${r.status}`}`);
    const im = await docker('GET', `/images/${encodeURIComponent(ref)}/json`);
    if (im.status !== 200) throw erroDocker(im, 'imagem');
    return jsonDe(im).Id;
  }

  // recria um container com a mesma configuração e a imagem nova; se algo falhar, volta o antigo
  async function recriar(insp) {
    const nome = insp.Name.replace(/^\//, ''), curto = insp.Id.slice(0, 12), rodava = insp.State.Running;
    const cfg = { ...insp.Config };
    if (cfg.Hostname === curto) delete cfg.Hostname;
    const hc = insp.HostConfig || {};
    const redes = Object.entries(insp.NetworkSettings?.Networks || {});
    const modo = hc.NetworkMode || '';
    const compartilhada = modo === 'host' || modo === 'none' || modo.startsWith('container:');
    redes.sort(([a], [b]) => (a === modo ? -1 : b === modo ? 1 : 0));
    const ep = (e) => ({ Aliases: (e.Aliases || []).filter((a) => a !== curto && a !== insp.Id), ...(e.IPAMConfig ? { IPAMConfig: e.IPAMConfig } : {}), ...(e.Links ? { Links: e.Links } : {}) });
    const antigo = `${nome}-antigo-${Date.now().toString(36)}`;
    let novo = null;
    await post(`/containers/${insp.Id}/rename?name=${encodeURIComponent(antigo)}`, [204]);
    try {
      if (rodava) await post(`/containers/${insp.Id}/stop?t=20`, [204, 304], { timeout: 60_000 });
      const corpo = { ...cfg, HostConfig: hc, NetworkingConfig: { EndpointsConfig: !compartilhada && redes[0] ? { [redes[0][0]]: ep(redes[0][1]) } : {} } };
      const r = await docker('POST', `/containers/create?name=${encodeURIComponent(nome)}`, { corpo });
      if (r.status !== 201) throw erroDocker(r, 'criar');
      novo = jsonDe(r).Id;
      if (!compartilhada) for (const [rede, e] of redes.slice(1)) await post(`/networks/${encodeURIComponent(rede)}/connect`, [200], { corpo: { Container: novo, EndpointConfig: ep(e) } });
      if (rodava) await post(`/containers/${novo}/start`, [204, 304], { timeout: 60_000 });
      await docker('DELETE', `/containers/${insp.Id}?force=1`);
      return novo;
    } catch (e) {
      if (novo) await docker('DELETE', `/containers/${novo}?force=1`).catch(() => {});
      await docker('POST', `/containers/${insp.Id}/rename?name=${encodeURIComponent(nome)}`).catch(() => {});
      if (rodava) await docker('POST', `/containers/${insp.Id}/start`).catch(() => {});
      throw Object.assign(e, { message: `${e.message} (o container antigo foi restaurado)` });
    }
  }

  const executar = {
    async reiniciar(cs) {
      const alvo = cs.filter((c) => c.estado === 'running' || c.estado === 'restarting');
      if (!alvo.length) throw Object.assign(new Error('o projeto está parado: use Iniciar'), { status: 409 });
      for (const c of alvo) await post(`/containers/${c.idCompleto}/restart?t=15`, [204], { timeout: 90_000 });
      return alvo.map((c) => `${c.nome}: reiniciado`);
    },
    async parar(cs) {
      const alvo = cs.filter((c) => c.estado === 'running' || c.estado === 'restarting' || c.estado === 'paused').reverse();
      for (const c of alvo) await post(`/containers/${c.idCompleto}/stop?t=20`, [204, 304], { timeout: 90_000 });
      return alvo.length ? alvo.map((c) => `${c.nome}: parado`) : ['nada a parar: já estava parado'];
    },
    async iniciar(cs) {
      const parados = cs.filter((c) => c.estado !== 'running');
      // tarefas de execução única (restart "no") que já terminaram bem (init, migrate, download) só rodam de novo se forem
      // tudo o que há; um serviço parado com Parar também sai com código 0, por isso a política de reinício decide
      for (const c of parados) if (ehTarefaConcluida(c)) c.politica = (await inspecionar(c.idCompleto)).HostConfig?.RestartPolicy?.Name || 'no';
      const unica = (c) => ehTarefaConcluida(c) && (c.politica === 'no' || c.politica === '');
      const alvo = parados.some((c) => !unica(c)) ? parados.filter((c) => !unica(c)) : parados;
      for (const c of alvo) await post(`/containers/${c.idCompleto}/start`, [204, 304], { timeout: 90_000 });
      return alvo.length ? alvo.map((c) => `${c.nome}: iniciado`) : ['nada a iniciar: já estava em execução'];
    },
    async atualizar(cs) {
      const det = [];
      for (const c of cs) {
        const insp = await inspecionar(c.idCompleto);
        if (ehTarefaConcluida(c) && ['no', ''].includes(insp.HostConfig?.RestartPolicy?.Name || '')) continue; // tarefa única já concluída
        const ref = insp.Config.Image;
        if (!ref || ref.startsWith('sha256:')) { det.push(`${c.nome}: imagem sem nome, não dá para baixar de novo (mantido)`); continue; }
        const nova = await puxar(ref);
        if (nova === insp.Image) { det.push(`${c.nome}: já está na versão mais recente de ${ref}`); continue; }
        await recriar(insp);
        det.push(`${c.nome}: recriado com a imagem nova de ${ref}`);
      }
      return det.length ? det : ['nada a atualizar'];
    },
    async deletar(cs, projeto) {
      const det = [];
      for (const c of [...cs].reverse()) { const r = await docker('DELETE', `/containers/${c.idCompleto}?force=1`, { timeout: 90_000 }); if (![204, 404].includes(r.status)) throw erroDocker(r, `apagar ${c.nome}`); det.push(`${c.nome}: apagado`); }
      const f = encodeURIComponent(JSON.stringify({ label: [`${ROTULO_PROJETO}=${projeto}`] }));
      for (const n of jsonDe(await docker('GET', `/networks?filters=${f}`)) || []) { const r = await docker('DELETE', `/networks/${n.Id}`); det.push(`rede ${n.Name}: ${r.status === 204 ? 'apagada' : 'mantida (em uso)'}`); }
      det.push('volumes de dados preservados (apague-os na VPS se não forem mais necessários)');
      return det;
    }
  };

  return async function acao(projeto, nome) {
    if (!ACOES.includes(nome)) throw Object.assign(new Error('ação desconhecida'), { status: 400 });
    if (typeof projeto !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(projeto)) throw Object.assign(new Error('nome de projeto inválido'), { status: 400 });
    if (somenteLeitura) throw Object.assign(new Error('agente em modo somente leitura'), { status: 403 });
    if (['parar', 'atualizar', 'deletar'].includes(nome) && protegidos.has(projeto)) throw Object.assign(new Error('projeto protegido neste agente'), { status: 403 });
    if (travas.has(projeto)) throw Object.assign(new Error('já há uma ação em andamento neste projeto'), { status: 409 });
    travas.add(projeto);
    const inicio = Date.now();
    try {
      const cs = await doProjeto(projeto);
      if (!cs.length) throw Object.assign(new Error('projeto não encontrado nesta VPS'), { status: 404 });
      const detalhes = await executar[nome](cs, projeto);
      log(`agente: ${nome} ${projeto}: ok`);
      return { ok: true, projeto, acao: nome, detalhes, duracaoMs: Date.now() - inicio };
    } catch (e) { log(`agente: ${nome} ${projeto}: falhou`); throw e; } finally { travas.delete(projeto); }
  };
}

// ---------- servidor ----------
export function criarAgente({ chave = chaveDe(env.AGENTE_CHAVE), docker = clienteDocker(), protegidos = new Set(String(env.AGENTE_PROTEGIDOS || 'dm-painel-agente').split(',').map((s) => s.trim()).filter(Boolean)), somenteLeitura = env.AGENTE_SOMENTE_LEITURA === '1', ips = String(env.AGENTE_IPS || '').split(',').map((s) => s.trim()).filter(Boolean), atrasDeProxy = env.AGENTE_PROXY === '1', log = console.log } = {}) {
  const verificar = criarVerificador(chave);
  const stats = criarStats(docker);
  const acao = criarAcoes(docker, { protegidos, somenteLeitura, log });
  const falhas = new Map();
  // o projeto do próprio agente entra na lista de protegidos (descoberto pelo rótulo do container)
  docker('GET', `/containers/${hostname()}/json`).then((r) => { const p = jsonDe(r)?.Config?.Labels?.[ROTULO_PROJETO]; if (r.status === 200 && p) protegidos.add(p); }).catch(() => {});
  const ipDe = (req) => { const x = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean); return (atrasDeProxy && x.at(-1)) || req.socket.remoteAddress || '?'; };

  const rotas = async (req, metodo, url) => {
    const p = url.pathname;
    if (metodo === 'GET' && p === '/v1/resumo') return [200, await maquina(docker)];
    if (metodo === 'GET' && p === '/v1/projetos') {
      const r = await docker('GET', '/containers/json?all=1');
      if (r.status !== 200) throw erroDocker(r, 'listar containers');
      const projetos = agruparProjetos(jsonDe(r) || []);
      let atualizado = null;
      if (url.searchParams.get('stats') !== '0') {
        const s = await stats.obter(4000); atualizado = s.atualizado || null;
        for (const pr of projetos) {
          let cpu = 0, mem = 0, tem = false;
          for (const c of pr.containers) { const u = s.cache.get(c.id); c.uso = u || null; if (u) { tem = true; cpu += u.cpuPct || 0; mem += u.memUsada || 0; } }
          pr.uso = tem ? { cpuPct: Math.round(cpu * 10) / 10, memUsada: mem } : null;
        }
      }
      return [200, { projetos, statsEm: atualizado, protegidosNoAgente: [...protegidos], somenteLeitura }];
    }
    let m;
    if (metodo === 'GET' && (m = /^\/v1\/containers\/([a-zA-Z0-9][a-zA-Z0-9_.-]{0,127})$/.exec(p))) {
      const r = await docker('GET', `/containers/${m[1]}/json`);
      if (r.status === 404) return [404, { erro: 'container não encontrado' }];
      if (r.status !== 200) throw erroDocker(r, 'inspecionar');
      const c = jsonDe(r), h = c.Config?.Healthcheck, l = c.Config?.Labels || {};
      return [200, {
        id: c.Id.slice(0, 12), nome: c.Name.replace(/^\//, ''), projeto: l[ROTULO_PROJETO] || null, servico: l['com.docker.compose.service'] || null,
        imagem: c.Config?.Image, imagemId: String(c.Image).replace('sha256:', '').slice(0, 12), criado: c.Created, iniciado: c.State?.StartedAt, estado: c.State?.Status, codigoSaida: c.State?.ExitCode,
        reinicios: c.RestartCount, politica: c.HostConfig?.RestartPolicy?.Name || 'no', limiteMem: c.HostConfig?.Memory || null,
        healthcheck: h?.Test ? { teste: mascarar(h.Test.filter((t) => t !== 'CMD' && t !== 'CMD-SHELL').join(' ')), intervaloS: h.Interval ? h.Interval / 1e9 : null } : null,
        saude: c.State?.Health?.Status || null, verificacoes: (c.State?.Health?.Log || []).slice(-3).map((v) => ({ fim: v.End, codigo: v.ExitCode, saida: mascarar(String(v.Output || '')).slice(0, 400) })),
        redes: Object.keys(c.NetworkSettings?.Networks || {}), montagens: (c.Mounts || []).map((x) => ({ tipo: x.Type, origem: x.Type === 'volume' ? x.Name : x.Source, destino: x.Destination, somenteLeitura: !x.RW }))
      }];
    }
    if (metodo === 'GET' && p === '/v1/logs') {
      const id = url.searchParams.get('container') || '';
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(id)) return [400, { erro: 'container inválido' }];
      const linhas = Math.min(1000, Math.max(10, Number(url.searchParams.get('linhas')) || 200));
      const r = await docker('GET', `/containers/${id}/logs?stdout=1&stderr=1&timestamps=1&tail=${linhas}`, { timeout: 15_000 });
      if (r.status === 404) return [404, { erro: 'container não encontrado' }];
      if (r.status !== 200) throw erroDocker(r, 'logs');
      const texto = mascarar(demux(r.corpo)).split('\n').slice(-linhas).join('\n').slice(-512 * 1024);
      return [200, { container: id, linhas, texto, em: new Date().toISOString() }];
    }
    if (metodo === 'POST' && p === '/v1/acao') {
      let b; try { b = JSON.parse(req.corpoTexto || '{}'); } catch { return [400, { erro: 'corpo inválido' }]; }
      try { return [200, await acao(b?.projeto, b?.acao)]; } catch (e) { return [e.status || 500, { erro: e.status ? e.message : `falhou: ${mascarar(e.message)}` }]; }
    }
    return [404, { erro: 'não encontrado' }];
  };

  return async (req, res) => {
    const responder = (status, obj, nonce) => {
      const corpo = JSON.stringify(obj);
      const h = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
      if (nonce && chave) h['x-dm-resposta'] = assinarResposta(chave, { nonce, status, corpo });
      res.writeHead(status, h); res.end(corpo);
    };
    try {
      const url = new URL(req.url, 'http://agente');
      if (req.method === 'GET' && url.pathname === '/saude') return responder(200, { ok: true });
      const ip = ipDe(req);
      if (ips.length && !ips.includes(ip)) return responder(403, { erro: 'origem não autorizada' });
      const f = falhas.get(ip);
      if (f && f.ate > Date.now() && f.n >= 20) return responder(429, { erro: 'muitas tentativas' });
      let n = 0; const partes = [];
      for await (const c of req) { n += c.length; if (n > 16_384) return responder(413, { erro: 'corpo grande' }); partes.push(c); }
      req.corpoTexto = Buffer.concat(partes).toString('utf8');
      const v = verificar({ metodo: req.method, caminho: req.url, cabecalhos: req.headers, corpo: req.corpoTexto });
      if (!v.ok) {
        const j = f && f.ate > Date.now() ? f : { n: 0, ate: Date.now() + 60_000 }; j.n++; falhas.set(ip, j);
        return responder(401, { erro: 'não autorizado' });
      }
      const [status, obj] = await rotas(req, req.method, url);
      return responder(status, obj, req.headers['x-dm-nonce']);
    } catch (e) {
      log(`agente: erro (${e.code || e.status || 'interno'})`);
      return responder(e.code === 'TEMPO' ? 504 : 502, { erro: e.code === 'TEMPO' ? 'o Docker demorou a responder' : 'falha ao falar com o Docker' }, req.headers['x-dm-nonce']);
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const porta = Number(env.AGENTE_PORTA || 8090);
  const tratar = criarAgente();
  if (!chaveDe(env.AGENTE_CHAVE)) console.error('agente: AGENTE_CHAVE ausente ou inválida: todos os pedidos serão recusados.');
  const tls = env.AGENTE_TLS_CERT && env.AGENTE_TLS_KEY && existsSync(env.AGENTE_TLS_CERT) && existsSync(env.AGENTE_TLS_KEY);
  const srv = tls ? https.createServer({ cert: readFileSync(env.AGENTE_TLS_CERT), key: readFileSync(env.AGENTE_TLS_KEY), minVersion: 'TLSv1.2' }, tratar) : http.createServer(tratar);
  srv.requestTimeout = 330_000; srv.headersTimeout = 10_000;
  srv.listen(porta, () => console.log(`agente ${VERSAO}: porta ${porta} (${tls ? 'HTTPS' : 'HTTP, atrás do Traefik'})${env.AGENTE_SOMENTE_LEITURA === '1' ? ', somente leitura' : ''}`));
}
