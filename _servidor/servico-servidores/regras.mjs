// Regras puras do painel de servidores (testadas em tools/testes/servidores.mjs e usadas pelo serviço e pela tela).
export const ACOES = ['reiniciar', 'parar', 'iniciar', 'atualizar', 'deletar'];
export const ROTULO_ACAO = { reiniciar: 'Reiniciar', parar: 'Parar', iniciar: 'Iniciar', atualizar: 'Atualizar', deletar: 'Deletar' };
// Parar, Atualizar e Deletar exigem digitar o nome do projeto; Deletar exige também um código novo (e-mail/WhatsApp)
export const PEDE_NOME = new Set(['parar', 'atualizar', 'deletar']);
export const PEDE_CODIGO = new Set(['deletar']);

// Proteção: 'protegido' = só Reiniciar e Ver logs; 'somente-ver' = só Ver logs (nenhuma ação).
const glob = (padrao, txt) => new RegExp(`^${String(padrao).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i').test(String(txt));
const PESO = { 'somente-ver': 2, protegido: 1 };
// regras: [{ vps: '*'|id, projeto?: glob, imagem?: regex (texto), nivel, motivo }]; vale a regra mais restritiva
export function protecaoDe(regras, vpsId, projeto) {
  if (!projeto || !projeto.compose) return { nivel: 'somente-ver', motivo: 'containers fora de um projeto Compose' };
  let melhor = null;
  for (const r of regras || []) {
    if (r.vps && r.vps !== '*' && r.vps !== vpsId) continue;
    const casaProjeto = r.projeto ? glob(r.projeto, projeto.nome) : true;
    const casaImagem = r.imagem ? (projeto.containers || []).some((c) => new RegExp(r.imagem, 'i').test(String(c.imagem || ''))) : true;
    if (!r.projeto && !r.imagem) continue;
    if (casaProjeto && casaImagem && (!melhor || PESO[r.nivel] > PESO[melhor.nivel])) melhor = { nivel: r.nivel, motivo: r.motivo || 'protegido' };
  }
  return melhor;
}
export function acaoPermitida(protecao, acao) {
  if (!ACOES.includes(acao)) return false;
  if (!protecao) return true;
  if (protecao.nivel === 'protegido') return acao === 'reiniciar';
  return false;
}
// Confirmações vindas da tela. Devolve null (ok) ou o motivo da recusa.
export function conferirConfirmacao({ acao, projeto, confirmado, confirmacao }) {
  if (!ACOES.includes(acao)) return 'Ação desconhecida.';
  if (confirmado !== true) return 'A ação precisa ser confirmada.';
  if (PEDE_NOME.has(acao) && String(confirmacao ?? '') !== projeto) return 'Para esta ação, digite exatamente o nome do projeto.';
  return null;
}

// Provedor pela rede: DNS reverso (PTR) primeiro, depois o nome do sistema autônomo (ASN) ou o dono do bloco (RDAP).
const PROVEDORES = [
  ['Hostinger', /hstgr\.(cloud|io)|hostinger/i, /hostinger/i, [47583]],
  ['KingHost', /kinghost/i, /king ?host/i, []],
  ['HostGator', /hostgator|websitewelcome/i, /hostgator/i, []],
  ['Locaweb', /locaweb|lwsites/i, /locaweb/i, [27715]],
  ['AWS', /amazonaws\.com|awsglobalaccelerator/i, /amazon|\baws\b/i, [16509, 14618]],
  ['Google Cloud', /googleusercontent\.com|\.bc\.googleusercontent/i, /google/i, [15169, 396982]],
  ['Azure', /cloudapp\.(azure|net)|azure/i, /microsoft/i, [8075]],
  ['DigitalOcean', /digitalocean/i, /digitalocean/i, [14061]],
  ['Contabo', /contabo/i, /contabo/i, [51167, 40021]],
  ['Oracle', /oraclecloud|oraclevcn/i, /oracle/i, [31898]],
  ['Hetzner', /hetzner|your-server\.de/i, /hetzner/i, [24940]],
  ['OVHcloud', /ovh\.(net|com|ca)|\.ip-\d/i, /\bovh/i, [16276]],
  ['Vultr', /vultr/i, /vultr|choopa/i, [20473]],
  ['Linode (Akamai)', /linode|members\.linode/i, /linode|akamai/i, [63949]],
  ['Magalu Cloud', /magalu/i, /magalu|magazine luiza/i, []]
];
export function identificarProvedor({ ptr = '', asn = null, asnNome = '', dono = '' } = {}) {
  for (const [nome, rePtr] of PROVEDORES) if (ptr && rePtr.test(ptr)) return { nome, fonte: 'DNS reverso' };
  for (const [nome, , reNome, asns] of PROVEDORES) {
    if (asn && asns.includes(Number(asn))) return { nome, fonte: `AS${asn}` };
    if (asnNome && reNome.test(asnNome)) return { nome, fonte: `AS${asn ?? '?'}` };
    if (dono && reNome.test(dono)) return { nome, fonte: 'RDAP' };
  }
  return { nome: 'Desconhecido', fonte: asn ? `AS${asn}${asnNome ? ' ' + asnNome : ''}` : (dono || 'sem dados') };
}
