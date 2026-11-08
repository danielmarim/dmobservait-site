# WorkAI · proposta de SSH no PC da Diretoria

Nesta rodada o PC na mesa do Daniel é **clicável** e abre um painel “SSH · em breve”. **Não há** túnel, terminal remoto, chave no front nem chamada de rede.

## Objetivo

Permitir que Daniel abra um terminal no host/jump autorizado **a partir do escritório**, com a mesma sessão de login do WorkAI, sem expor credencial SSH no navegador.

## Desenho sugerido

```
Navegador (painel SSH)
    │  cookie __Host-dm_admin
    ▼
nginx (auth_request)
    ▼
bridge WebSocket/PTY interno
    │  chave/host só no servidor
    ▼
jump host / máquina alvo (allowlist)
```

- Front: cliente terminal (xterm.js ou similar) falando **só** com `wss://workai.dmobservait.com/workai/ssh` na mesma origem.
- Bridge: valida sessão, abre PTY/SSH com identidade do **servidor** (agent forwarding ou chave em secret store), grava sessão (quem, quando, host).
- Allowlist de hosts e comandos sensíveis; logout encerra o PTY.

## Regras

1. Nenhuma chave privada, senha ou token no repositório ou no JavaScript.
2. Só operadores autenticados (Daniel); sem compartilhar o cookie entre hosts.
3. Auditoria: início/fim de sessão e, se desejado, gravação do transcript.
4. Preferir jump host + usuário de menor privilégio; root só com motivo explícito.

## Riscos

- XSS no WorkAI virando teclado no PTY → CSP estrita, escape, SameSite cookie.
- Sessão abandonada aberta → timeout de idle curto.
- Comando destrutivo → confirmação extra no bridge para padrões perigosos (opcional).

## Fora desta rodada

Sem endpoint SSH, sem container de bridge, sem alteração de auth além da documentação.
