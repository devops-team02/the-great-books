#!/usr/bin/env bash

set -euo pipefail

SITE_NAME="the-great-books"
CONSUL_TEMPLATE_VERSION="0.39.0"

echo "Installing Nginx, curl and unzip..."
apt-get update -y
apt-get install -y nginx curl unzip

echo "Installing consul-template..."
if [ ! -f /usr/local/bin/consul-template ]; then
  curl -sSL "https://releases.hashicorp.com/consul-template/${CONSUL_TEMPLATE_VERSION}/consul-template_${CONSUL_TEMPLATE_VERSION}_linux_amd64.zip" -o /tmp/consul-template.zip
  unzip -o /tmp/consul-template.zip -d /usr/local/bin/
  chmod +x /usr/local/bin/consul-template
  rm -f /tmp/consul-template.zip
fi

echo "Налаштування шаблону Nginx для Consul..."
mkdir -p /etc/nginx/templates /etc/consul-template.d
cp /tmp/nginx.conf.ctmpl /etc/nginx/templates/nginx.conf.ctmpl

cat > /etc/consul-template.d/consul-template.hcl <<EOF
consul {
  address = "127.0.0.1:8500"
}

template {
  source      = "/etc/nginx/templates/nginx.conf.ctmpl"
  destination = "/etc/nginx/sites-available/${SITE_NAME}"
  command     = "nginx -t && systemctl reload nginx"
}
EOF

cat > /etc/systemd/system/consul-template.service <<EOF
[Unit]
Description=Consul Template for Nginx
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/consul-template -config=/etc/consul-template.d/consul-template.hcl
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "Initializing Nginx..."
/usr/local/bin/consul-template -config=/etc/consul-template.d/consul-template.hcl -once || true

ln -sfn "/etc/nginx/sites-available/${SITE_NAME}" \
    "/etc/nginx/sites-enabled/${SITE_NAME}"

rm -f /etc/nginx/sites-enabled/default

nginx -t

systemctl enable nginx
systemctl restart nginx

systemctl daemon-reload
systemctl enable consul-template
systemctl restart consul-template

echo "Налаштування фаєрволу LB та збереження конфігурації..."

sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo netfilter-persistent save
