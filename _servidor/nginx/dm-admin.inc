# Tudo que exige sessão no /admin. Entra quem tiver o cookie de sessão do login por código (auth_request ao serviço
# dm-observait-login) OU, enquanto o dm-admin-senha.inc existir, a senha antiga. Sem nenhum dos dois: página → redireciona
# para /admin/login; qualquer outro pedido (dados.json, API, .js, .css) → 401.
satisfy any;
auth_request /_dm_auth;
include /etc/nginx/dm/nginx/dm-admin-senha.inc;
error_page 401 = @dm_login;
add_header Cache-Control "no-store" always;
add_header X-Robots-Tag "noindex, nofollow" always;
include /etc/nginx/dm/nginx/dm-headers.inc;
