# Base de tudo que exige sessão no /admin (junto de "auth_request /_dm_auth_<seção>;" na própria localização, ver default.conf).
# Sem sessão: página → redireciona para /admin/login; qualquer outro pedido (dados.json, API, .js, .css) → 401. Sessão sem
# permissão para a seção, ou papel "somente leitura" tentando agir: página → /admin/sem-acesso/; o resto → 403.
# A senha de emergência (dm-admin-senha.inc) não vale mais direto aqui: em /admin/emergencia ela abre uma sessão do Dono.
error_page 401 = @dm_login;
error_page 403 = @dm_negado;
add_header Cache-Control "no-store" always;
add_header X-Robots-Tag "noindex, nofollow" always;
include /etc/nginx/dm/nginx/dm-headers.inc;
