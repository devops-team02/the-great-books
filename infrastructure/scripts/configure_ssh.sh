sudo tee /etc/ssh/sshd_config.d/99-hardening.conf > /dev/null <<'EOF'
PermitRootLogin no

PasswordAuthentication no
PermitEmptyPasswords no
ChallengeResponseAuthentication no
KbdInteractiveAuthentication no

PubkeyAuthentication yes

MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2

X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding no
EOF

if [ -n "${SSH_PUB_KEY:-}" ]; then
  SSH_DIR="/home/vagrant/.ssh"
  AUTH_KEYS="$SSH_DIR/authorized_keys"

  mkdir -p "$SSH_DIR"
  touch "$AUTH_KEYS"

  grep -qxF "$SSH_PUB_KEY" "$AUTH_KEYS" || echo "$SSH_PUB_KEY" >> "$AUTH_KEYS"

  chmod 700 "$SSH_DIR"
  chmod 600 "$AUTH_KEYS"
  chown -R vagrant:vagrant "$SSH_DIR"
  echo "SSH key from .env applied."
else
  echo "WARNING: SSH_PUB_KEY is not set in .env"
fi