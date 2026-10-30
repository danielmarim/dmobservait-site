// Regras e armazenamento das pessoas com acesso ao /admin (servico-login). Sem dependências: só Node 20.
// Dados no volume DADOS (./login-dados no VPS): usuarios.json (pessoas, papéis, configuração), sessoes.json (sessões e
// logins) e auditoria.jsonl (ações de administração). NUNCA vão para o repositório público nem para dist/.
// Escrita atômica (arquivo temporário + rename), como o serviço da loja.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, appendFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

// Seções do painel (o `id` é o mesmo da barra do menu em admin/menu.mjs). `href` é a primeira página de cada uma.
export const SECOES = [
  { id: 'visao', rotulo: 'Visão geral', href: '/admin/' },
  { id: 'loja', rotulo: 'Loja', href: '/admin/loja/' },
  { id: 'infra', rotulo: 'Infraestrutura', href: '/admin/infra/' },
  { id: 'servidores', rotulo: 'Servidores', href: '/admin/servidores/' },
  { id: 'dyno', rotulo: 'Dyno AI', href: '/admin/dyno/' },
  { id: 'conta', rotulo: 'Conta', href: '/admin/conta/' }
];
export const IDS_SECAO = SECOES.map((s) => s.id);
// Papéis. Gerir acessos e a segurança é SÓ do Dono, em qualquer papel (não é uma seção que se possa conceder).
export const PAPEIS = {
  dono: { rotulo: 'Dono', descricao: 'Tudo, inclusive gerir acessos e a segurança. Só existe um.' },
  admin: { rotulo: 'Administrador', descricao: 'Vê e executa ações nas seções liberadas; não gere acessos.' },
  leitura: { rotulo: 'Somente leitura', descricao: 'Vê painéis e logs das seções liberadas; não executa nenhuma ação.' }
};
export const MAX_USUARIOS = 20;
export const ID_DONO = 'dono';

// ---------- normalização e validação ----------
export const normEmail = (s) => String(s || '').trim().toLowerCase();
export const emailValido = (s) => s.length <= 120 && /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[a-z]{2,}$/i.test(s);
// WhatsApp só com dígitos e DDI; 10 ou 11 dígitos sem DDI viram Brasil (55)
export const normWhats = (s) => { const d = String(s || '').replace(/\D/g, ''); return d.length === 10 || d.length === 11 ? `55${d}` : d; };
export const whatsValido = (d) => /^\d{12,15}$/.test(d);
export const mesmoWhats = (a, b) => !!a && !!b && a.replace(/^55/, '') === b.replace(/^55/, '');
export const nomeValido = (s) => /^[\p{L}][\p{L} .'-]{1,59}$/u.test(s);

// d***@gmail.com   |   +55 11 *****-1325
export const mascaraEmail = (e) => { const [l, d] = String(e || '').split('@'); return l && d ? `${l[0]}***@${d}` : ''; };
export const mascaraWhats = (w) => {
  const d = String(w || '').replace(/\D/g, '');
  if (d.length < 8) return '';
  if (d.startsWith('55') && d.length >= 12) return `+55 ${d.slice(2, 4)} *****-${d.slice(-4)}`;
  return `+${d.slice(0, 2)} *****-${d.slice(-4)}`;
};

// data limite (AAAA-MM-DD) → instante em que o acesso acaba (fim do dia no horário de Brasília); '' = sem validade
export const fimDoDia = (data) => (data ? new Date(`${data}T23:59:59-03:00`).getTime() : 0);
export const dataValida = (data) => /^\d{4}-\d{2}-\d{2}$/.test(data) && !Number.isNaN(fimDoDia(data)) && new Date(`${data}T12:00:00Z`).toISOString().startsWith(data);

export const secoesDe = (u) => (u.papel === 'dono' ? [...IDS_SECAO] : (u.secoes || []).filter((s) => IDS_SECAO.includes(s)));
export const expirado = (u, agora = Date.now()) => !!u.expiraEm && fimDoDia(u.expiraEm) < agora;
// estado de exibição: ativo, convite (ainda não entrou), suspenso ou expirado
export const estadoDe = (u, agora = Date.now()) => (u.status === 'suspenso' ? 'suspenso' : expirado(u, agora) ? 'expirado' : u.status === 'convite' ? 'convite' : 'ativo');
export const podeEntrar = (u, agora = Date.now()) => !!u && ['ativo', 'convite'].includes(estadoDe(u, agora));
export const primeiraPagina = (u) => SECOES.find((s) => secoesDe(u).includes(s.id))?.href || '/admin/conta/';

// Decisão do auth_request do nginx: 204 (liberado), 403 (sem permissão). `secao` = id de seção, 'dono' (só o Dono) ou
// 'qualquer' (qualquer pessoa com sessão válida: arquivos estáticos do painel). Somente leitura só faz GET/HEAD.
export function decidir(u, secao, metodo) {
  if (secao === 'dono') return u.papel === 'dono' ? 204 : 403;
  if (secao !== 'qualquer' && !secoesDe(u).includes(secao)) return 403;
  if (u.papel === 'leitura' && !['GET', 'HEAD'].includes(String(metodo || 'GET').toUpperCase())) return 403;
  return 204;
}

// ---------- armazenamento ----------
export function criarArmazem(dir, { agora = () => Date.now() } = {}) {
  mkdirSync(dir, { recursive: true });
  const arqU = join(dir, 'usuarios.json'), arqS = join(dir, 'sessoes.json'), arqA = join(dir, 'auditoria.jsonl');
  const gravar = (arq, obj) => { const tmp = `${arq}.${randomBytes(4).toString('hex')}.tmp`; writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: 0o600 }); renameSync(tmp, arq); };
  const ler = (arq, padrao) => { try { return JSON.parse(readFileSync(arq, 'utf8')); } catch { return padrao; } };
  const estado = ler(arqU, { versao: 1, config: {}, usuarios: [] });
  if (!Array.isArray(estado.usuarios)) estado.usuarios = [];
  estado.config ||= {};
  const sessoes = new Map(Object.entries(ler(arqS, {})));
  let sujas = false;

  const api = {
    estado,
    salvarUsuarios: () => gravar(arqU, estado),
    usuario: (id) => estado.usuarios.find((u) => u.id === id) || null,
    dono: () => estado.usuarios.find((u) => u.id === ID_DONO) || null,
    novoId: () => randomBytes(6).toString('hex'),
    // sessões
    sessoes,
    sessao: (sid) => sessoes.get(sid) || null,
    salvarSessoes: () => { sujas = false; // mantém as 400 mais recentes; sessões vencidas há mais de 30 dias saem
      const corte = agora() - 30 * 86_400_000;
      const lista = [...sessoes.entries()].filter(([, s]) => (s.ultimoEm || s.criadoEm) > corte).sort((a, b) => (b[1].criadoEm || 0) - (a[1].criadoEm || 0)).slice(0, 400);
      sessoes.clear(); for (const [k, v] of lista) sessoes.set(k, v);
      gravar(arqS, Object.fromEntries(sessoes)); },
    marcarSuja: () => { sujas = true; },
    descarregar: () => { if (sujas) api.salvarSessoes(); },
    // auditoria (uma linha JSON por ação; sem códigos, segredos nem contatos completos)
    auditar: (e) => {
      const linha = { em: new Date(agora()).toISOString(), ...e };
      try { if (existsSync(arqA) && statSync(arqA).size > 2 * 1024 * 1024) renameSync(arqA, `${arqA}.1`); appendFileSync(arqA, JSON.stringify(linha) + '\n', { mode: 0o600 }); } catch {}
      return linha;
    },
    lerAuditoria: (n = 200) => { try { return readFileSync(arqA, 'utf8').trim().split('\n').filter(Boolean).slice(-n).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).reverse(); } catch { return []; } }
  };
  return api;
}
