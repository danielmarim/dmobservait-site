auth_basic "DM ObservaIT - painel interno";
auth_basic_user_file /etc/nginx/dm-admin.htpasswd;
add_header Cache-Control "no-store" always;
add_header X-Robots-Tag "noindex, nofollow" always;
include /etc/nginx/dm/nginx/dm-headers.inc;
