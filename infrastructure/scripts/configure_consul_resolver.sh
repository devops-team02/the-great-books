sudo mkdir -p /etc/systemd/resolved.conf.d
sudo tee /etc/systemd/resolved.conf.d/consul.conf <<EOF
[Resolve]
DNS=127.0.0.1:8600
Domains=~consul
EOF

sudo systemctl restart systemd-resolved

echo "Consul client DNS configuration completed on $(hostname)!"