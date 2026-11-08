# WorkAI · proposta de chat com agentes reais

Esta rodada entrega só a **interface** no escritório: histórico, campo de texto, atalhos (`status`, `o que está fazendo`, `nova tarefa`) e aviso claro de que ainda **não está conectado**. O histórico fica **apenas em `localStorage`**. Nada é enviado para fora do navegador.

Este documento descreve como ligar o chat aos agentes de verdade **sem colocar segredo no front nem no repositório**.

## Princípios

1. O front do WorkAI continua atrás do mesmo login (`auth_request` / cookie `__Host-dm_admin`).
2. Nenhuma chave de agente, token de Cursor/API ou credencial de ferramenta aparece no JavaScript, HTML ou neste repo.
3. Nenhum agente **executa** ação externa nem **envia** mensagem para fora sem **aprovação do Daniel, item por item**.
4. Toda conversa relevante fica registrada no servidor (auditoria), além do rascunho local opcional no navegador.

## Ponte no servidor (mesma origem)

```
Navegador (WorkAI)
    │  cookie de sessão já existente
    ▼
nginx workai.dmobservait.com
    │  auth_request → /_dm_auth_workai
    ▼
serviço interno (ex.: dm-workai-bridge)
    │  credenciais só no ambiente do container / secrets do host
    ▼
runtime do agente (Cursor Cloud / Agent SDK / fila interna)
```

- Endpoint sugerido (mesma origem): `POST /workai/api/chat` e `GET /workai/api/chat/:agenteId/historico`.
- Nginx: `auth_request` igual ao `/` e aos assets protegidos; `proxy_pass` para o bridge; **sem** CORS e **sem** exposição de porta do bridge.
- O bridge lê a sessão (mesmo verificador do login) e rejeita quem não for Daniel (ou lista explícita de operadores).
- A chave do runtime fica só no ambiente do bridge (`CURSOR_*`, webhook secret, etc.). O front manda só `{ agenteId, texto, clientMsgId }`.

## Para onde as mensagens iriam

| Etapa | Destino | Conteúdo |
|-------|---------|----------|
| 1 | Bridge (servidor) | Texto do Daniel + id do agente + id de correlação |
| 2 | Fila / sessão do agente | Prompt curto + contexto permitido (ficha, sala, nível) |
| 3 | Resposta do agente | Volta ao bridge; o bridge grava e devolve ao front |
| 4 | Ações propostas | **Não** executam sozinhas: viram itens de aprovação |

Mensagens do tipo comando (`status`, `nova tarefa`) viram intenções tipadas no bridge. Ferramentas com efeito externo (e-mail, deploy, compra, SSH, n8n, etc.) geram um **pedido de aprovação**, nunca uma execução direta nesta fase.

## Aprovação item a item (obrigatória)

Regra de produto, não só de implementação:

- O agente pode **responder em texto** e **sugerir** passos.
- Qualquer passo que altere sistema externo, gaste dinheiro, envie comunicação ou mova dado sensível exige **OK explícito do Daniel** (botão/API de aprovação por item).
- Dinheiro permanece no máximo nível 2 (executa só com aprovação), alinhado à barra lateral do escritório.
- Rejeição ou timeout = nada acontece do lado de fora.
- O bridge nunca reenvia a chave ao front; o front só vê status (`pendente` / `aprovado` / `negado` / `feito`).

Fluxo resumido:

1. Daniel manda “publique o post X”.
2. Agente devolve plano + item `pub-123`.
3. UI mostra “Aprovar / Negar”.
4. Só após `POST /workai/api/aprovacoes/pub-123` o bridge dispara a ferramenta.

## Registro das conversas

- **Agora (esta PR):** `localStorage` chave `workai-chat-v1`, mapa `{ [agenteId]: [{ papel, texto, em }] }`, limitado (~80 msgs/agente), só neste browser.
- **Depois (produção):**
  - Tabela ou log append-only no servidor: `quando`, `operador`, `agenteId`, `papel`, `texto` (ou hash se sensível), `clientMsgId`, `aprovacaoId` se houver.
  - Retenção definida pelo Daniel (ex.: 90 dias) e export sob demanda.
  - O front pode continuar com cache local, mas a fonte da verdade passa a ser o servidor autenticado.

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Chave no front ou no git | Só no ambiente do bridge; revisão de PR bloqueia `.env` / tokens |
| Agente executa sem aprovação | Bridge exige aprovação por item; ferramentas desligadas até o OK |
| Prompt injection pedindo “ignore a aprovação” | Bridge ignora pedidos do modelo para pular o gate; allowlist de tools |
| Vazamento de conversa via XSS | CSP + escape de HTML (texto puro como hoje) + cookie HttpOnly |
| Histórico local em PC compartilhado | Aviso na UI; limpar ao sair; em produção preferir só servidor |
| Custo / flood de mensagens | Rate limit por sessão; tamanho máx. (já 500 chars no UI) |
| Homologação acidental em produção | Feature flag no bridge; ambiente de preview separado |

## Fora desta rodada

- Não há `fetch` de chat no `workai.js`.
- Não há endpoint `/workai/api/*` no nginx.
- Não há integração Cursor/Agent SDK ligada.

Quando for implementar, abrir PR só da ponte + nginx + testes de auth, mantendo o front sem segredo.
