// Assinatura dos pedidos entre o painel (servico-servidores) e o agente de cada VPS (servico-agente). Sem dependências.
//
// Pedido: cabeçalhos x-dm-ts (segundos), x-dm-nonce (32 hex, uso único) e x-dm-assinatura =
//   HMAC-SHA256(chave da VPS, "dm-agente-v1\n" + MÉTODO + "\n" + caminho com query + "\n" + ts + "\n" + nonce + "\n" + sha256(corpo))
// O agente recusa carimbo fora de ±60 s, nonce repetido (guardado pelo tempo da janela) e qualquer byte alterado.
// Resposta: x-dm-resposta = HMAC-SHA256(chave, "dm-agente-resp-v1\n" + nonce do pedido + "\n" + status + "\n" + sha256(corpo)),
// assim o painel sabe que a resposta veio do agente certo e é a desse pedido (mesmo atrás de um proxy).
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const JANELA_S = 60;
export const sha256 = (b) => createHash('sha256').update(b ?? '').digest('hex');
export const chaveDe = (hex) => (/^[0-9a-f]{64}$/i.test(String(hex || '').trim()) ? Buffer.from(String(hex).trim(), 'hex') : null);
const hmac = (chave, txt) => createHmac('sha256', chave).update(txt).digest('hex');
const igualHex = (a, b) => { const x = Buffer.from(String(a || ''), 'hex'), y = Buffer.from(String(b || ''), 'hex'); return x.length === 32 && y.length === 32 && timingSafeEqual(x, y); };

export const assinarPedido = (chave, { metodo, caminho, ts, nonce, corpo = '' }) =>
  hmac(chave, `dm-agente-v1\n${String(metodo).toUpperCase()}\n${caminho}\n${ts}\n${nonce}\n${sha256(corpo)}`);
export const assinarResposta = (chave, { nonce, status, corpo = '' }) => hmac(chave, `dm-agente-resp-v1\n${nonce}\n${status}\n${sha256(corpo)}`);

// Cabeçalhos para um pedido novo (lado do painel)
export function cabecalhos(chave, metodo, caminho, corpo = '', agora = Date.now()) {
  const ts = String(Math.floor(agora / 1000)), nonce = randomBytes(16).toString('hex');
  return { 'x-dm-ts': ts, 'x-dm-nonce': nonce, 'x-dm-assinatura': assinarPedido(chave, { metodo, caminho, ts, nonce, corpo }) };
}

export const conferirResposta = (chave, { nonce, status, corpo, assinatura }) => igualHex(assinatura, assinarResposta(chave, { nonce, status, corpo }));

// Verificador do agente: guarda os nonces vistos dentro da janela (anti-replay). Devolve { ok, motivo }.
export function criarVerificador(chave, { janelaS = JANELA_S, agora = () => Date.now() } = {}) {
  const vistos = new Map(); // nonce -> expira (ms)
  return ({ metodo, caminho, cabecalhos: h, corpo = '' }) => {
    if (!chave) return { ok: false, motivo: 'agente sem chave' };
    const ts = String(h['x-dm-ts'] || ''), nonce = String(h['x-dm-nonce'] || ''), sig = String(h['x-dm-assinatura'] || '');
    if (!/^\d{9,12}$/.test(ts) || !/^[0-9a-f]{32}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(sig)) return { ok: false, motivo: 'cabeçalhos ausentes' };
    const t = agora();
    if (Math.abs(t / 1000 - Number(ts)) > janelaS) return { ok: false, motivo: 'carimbo fora da janela' };
    if (!igualHex(sig, assinarPedido(chave, { metodo, caminho, ts, nonce, corpo }))) return { ok: false, motivo: 'assinatura inválida' };
    for (const [n, e] of vistos) if (e <= t) vistos.delete(n);
    if (vistos.has(nonce)) return { ok: false, motivo: 'pedido repetido' };
    if (vistos.size > 50_000) return { ok: false, motivo: 'muitos pedidos' };
    vistos.set(nonce, t + janelaS * 2000);
    return { ok: true };
  };
}
