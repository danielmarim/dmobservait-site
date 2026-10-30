// Mascaramento de segredos em logs (usado no agente, no serviço do painel e na tela: três camadas).
// Troca por *** o VALOR de variáveis com nome de segredo (TOKEN, KEY, SECRET, PASSWORD, SENHA, AUTH, COOKIE...), em
// qualquer formato comum (NOME=valor, NOME: valor, "nome":"valor", --nome valor), as credenciais dentro de URLs
// (esquema://usuario:senha@host), cabeçalhos Bearer/Basic, JWTs, chaves com prefixo conhecido (sk-, ghp_, AKIA...) e
// sequências longas de hex/base64 que parecem chave. Também tira códigos de cor ANSI. Prefere mascarar demais a vazar.
const NOME = String.raw`[A-Za-z0-9_.-]*(?:token|secret|segredo|senha|passw(?:or)?d|passwd|pwd|api[_-]?key|apikey|access[_-]?key|private[_-]?key|chave|key|auth|authorization|credential|credencial|cookie|session|sessao|jwt|bearer|signature|assinatura|dsn|webhook)[A-Za-z0-9_.-]*`;
const REGRAS = [
  [/\x1b\[[0-9;?]*[ -/]*[@-~]/g, ''],
  // esquema://usuario:senha@host  e  esquema://token@host
  [/\b([a-z][a-z0-9+.-]{1,20}:\/\/)[^\s/@:'"]*:[^\s/@'"]*@/gi, '$1***:***@'],
  [/\b((?:https?|wss?|postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqps?):\/\/)[^\s/@:'"]{12,}@/gi, '$1***@'],
  // cabeçalhos
  [/\b(Bearer|Basic|Token|Digest)\s+[A-Za-z0-9._~+/=-]{6,}/gi, '$1 ***'],
  // "nome": "valor"  e  'nome': 'valor'
  [new RegExp(String.raw`(["'])(${NOME})\1(\s*:\s*)(["'])(?:\\.|(?!\4).)*\4`, 'gi'), '$1$2$1$3$4***$4'],
  // "nome": 12345 / true (sem aspas)
  [new RegExp(String.raw`(["'])(${NOME})\1(\s*:\s*)(?!["'\s{[])[^,}\s]+`, 'gi'), '$1$2$1$3***'],
  // NOME=valor, NOME: valor, nome = "valor" (até o fim do valor)
  [new RegExp(String.raw`\b(${NOME})(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&'"}\]]+)`, 'gi'), '$1$2***'],
  // --nome valor / --nome=valor
  [new RegExp(String.raw`(--${NOME})(\s+|=)(?!-)\S+`, 'gi'), '$1$2***'],
  // ?token=... em querystring (cobre nomes curtos como ?k=, &sig=)
  [/([?&](?:k|sig|code|codigo|t|key|token|apikey|access_token|auth)=)[^&\s'"]+/gi, '$1***'],
  // caminho secreto de webhook (n8n e afins: a proteção é o próprio endereço)
  [/(\/webhook(?:-test)?\/)[^\s?'"]+/gi, '$1***'],
  // JWT e chaves com prefixo conhecido
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '***jwt***'],
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/g, '***'],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/g, '***'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, '***'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '***'],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, '***'],
  // sequências longas que parecem chave (hex de 32+ ou base64 de 40+)
  [/\b[0-9a-f]{32,}\b/gi, '***'],
  [/(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{40,}={0,2}(?![A-Za-z0-9+/=])/g, '***']
];

export function mascarar(texto) {
  let t = String(texto ?? '');
  for (const [re, troca] of REGRAS) t = t.replace(re, troca);
  return t;
}
