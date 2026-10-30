# Base das localizações internas /_dm_auth_<seção> (default.conf): chamam o serviço de login só para conferir a sessão e a
# permissão. O método original segue em X-DM-Metodo (o papel "somente leitura" só passa com GET/HEAD).
set $login http://dm-observait-login:8081;
proxy_http_version 1.1;
proxy_pass_request_body off;
proxy_set_header Content-Length "";
proxy_set_header Cookie $http_cookie;
proxy_set_header X-DM-Metodo $request_method;
proxy_connect_timeout 2s;
proxy_read_timeout 3s;
proxy_intercept_errors on;
error_page 500 502 503 504 = @dm_auth_negado;
