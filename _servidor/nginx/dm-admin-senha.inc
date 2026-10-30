# Acesso de EMERGÊNCIA do /admin: a senha antiga (basic auth), só em /admin/emergencia (abre uma sessão do Dono). Vale ao lado do login por código até o Daniel
# confirmar que o login novo funciona em produção. Para DESLIGAR a senha antiga: esvazie este arquivo (deixe só comentários),
# rode o build, publique e troque o x-site-commit (README, "Painel /admin"). Para entrar por ela: /admin/emergencia.
auth_basic "DM ObservaIT - painel interno";
auth_basic_user_file /etc/nginx/dm-admin.htpasswd;
