# Publicar o WorkAI

Nada disto foi aplicado. DNS, certificado, proxy e o reload do nginx ficam com o Daniel.
O merge deste repositório **não** liga o subdomínio: o `workai.conf` não é carregado pelo
`default.conf`. O que já muda no site público, quando este commit for o do container, é só
um 404 em `/workai/` para os arquivos do escritório não ficarem abertos em `dmobservait.com`.

## Como a sessão funciona

O painel usa o cookie `__Host-dm_admin` (`Path=/`, `HttpOnly`, `Secure`, `SameSite=Strict`,
sem `Domain`). O prefixo `__Host-` **proíbe** `Domain`. Se o cookie levasse
`Domain=.dmobservait.com`, o navegador descartaria a sessão do painel. Esse `Domain` também
mandaria o cookie para qualquer outro subdomínio.

Por isso o WorkAI **não compartilha** o cookie do apex. Ele usa a mesma tela
(`/admin/login`), o mesmo `login.js` e o mesmo serviço (`/admin/auth/` → container
`dm-observait-login`). O navegador guarda outro cookie `__Host-dm_admin`, só de
`workai.dmobservait.com`. Quem já entrou em `dmobservait.com` entra de novo aqui (o mesmo
código por e-mail ou WhatsApp). As sessões caem no mesmo registro e aparecem em
Atividades da conta.

Não há CORS: login, API e escritório são a mesma origem no subdomínio. O nginx manda
`Host` com o host público. O serviço, se o host for `workai.dmobservait.com`, devolve
`destino: /` (o escritório). O `login.js` também manda para `/` nesse hostname, mesmo que
o serviço ainda não tenha sido atualizado.

A senha de emergência e as APIs do painel **não** estão neste server.

## Ordem

1. Publicar **este** commit no container do site (os arquivos estáticos e o volume
   `_servidor/`, inclusive `servico-login` e `nginx/workai.conf`).
2. Recriar o container do serviço de login com esse commit, para `/auth/inicio` também
   voltar ao escritório. O apex não muda de destino.
3. Fazer o nginx **carregar** `workai.conf` (abaixo) e recarregar.
4. No proxy que termina o TLS (o mesmo do `dmobservait.com`), aceitar o host
   `workai.dmobservait.com` e encaminhar HTTP para este container, na mesma porta de hoje.
5. Emitir ou ampliar o certificado com esse nome. Não coloque certificado nem chave no git.
6. Só então criar o DNS. Se o DNS apontar antes do server block, o `server_name _` do site
   público responde por esse host (a home institucional). `/workai/` continua 404.

## DNS

Criar o nome `workai.dmobservait.com` para o **mesmo** destino que `dmobservait.com` já usa
(CNAME para o mesmo host, ou A/AAAA para os mesmos endereços). Não há IP neste repositório.

## Certificado

Reaproveitar o mecanismo que já emite o certificado de `dmobservait.com` e incluir
`workai.dmobservait.com` (ampliar o certificado atual, ou o SSL do painel da hospedagem).
O nginx deste container escuta 80, como o site atual: o TLS fica no proxy da frente.
Não inventar caminho de certificado aqui.

## Nginx

Arquivo pronto: `_servidor/nginx/workai.conf`.

Depois do site-download ele fica em `/etc/nginx/dm/nginx/workai.conf` e **não** é lido.
No nginx que já inclui o `default.conf` no `http {}`, uma das duas:

- `include /etc/nginx/dm/nginx/workai.conf;` no bloco `http`, ou
- copiar esse arquivo para `/etc/nginx/conf.d/workai.conf`.

Testar e recarregar (`nginx -t` e o reload que vocês já usam). Não há `certbot` nem
edição de DNS neste passo.

Conferir, sem cookie:

- `https://workai.dmobservait.com/` → 302 para `/admin/login`
- a página de login é a mesma do painel
- `/workai/workai.js` sem sessão → 401
- `/workai/assets/avatares/*.webp` sem sessão → 401 (o Daniel e os robôs oficiais do Dyno AI e da Dina)

Com a sessão criada nessa origem, `/` mostra o escritório. `Sair` posta em
`/admin/auth/sair` e volta para `/admin/login`.

## Preview local

`node workai/dev-server.mjs` escuta só em `127.0.0.1`. Não é o login de produção: não envia
código, não usa o segredo do painel e não serve o resto do repositório. Qualquer código de
6 dígitos, depois de pedir o envio, abre uma sessão local. Não publicar esse processo.
O preview responde `GET /admin/auth/conta/eu` só com `{ "nome": "Daniel" }`, para o escritório
mostrar o primeiro nome. Não devolve e-mail nem telefone.

## Avisos dos agentes (`notify`)

As falas de hoje são eventos ilustrativos, marcados como `demo`, sorteados no próprio
navegador. Não há consulta a sistema real e não há envio para fora: nenhum `fetch`
de aviso, nenhum webhook.

O ponto de integração, já exposto na página, é:

```js
WorkAI.notify(agentId, texto)
WorkAI.notify(agentId, texto, { demo: true })
```

- `agentId` é o nome do agente (`"Zia"`, `"Dyno Bot"`) ou o mesmo nome sem acento e em
  minúsculas (`zia`, `dyno-bot`). O avatar do CEO não recebe aviso.
- `texto` é uma frase curta, no máximo 160 caracteres. Não coloque dado de cliente,
  chave, token, senha ou IP.
- O agente interrompe a rotina, calcula o caminho até a posição atual de quem está
  no avatar (e recalcula se a pessoa andar) e, ao chegar, mostra um balão com ícone
  de aviso. O clique abre o card com a mensagem. Fechar ou Dispensar devolve o agente
  à rotina.
- `{ demo: false }` fica reservado para quando a origem deixar de ser demonstração.
  Enquanto for ensaio, omita a opção ou use `demo: true` (é o padrão).
- `notify` só enfileira na página aberta. Não grava nada e não chama a rede.
- A ala Operação Dyno usa o mesmo gancho, pelo nome em tela (`Dyno AI`, `Brief AI`).
  Partner AI, Ads AI e Guard AI estão em breve: não andam, e `notify` devolve `false`.
