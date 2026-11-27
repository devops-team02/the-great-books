#!/usr/bin/env bash
set -euo pipefail

echo "Installing dependencies, Java and Ansible"
apt-get update -y
apt-get install -y fontconfig openjdk-21-jre ansible git curl
echo "All dependencies have been installed successfully"

echo "Adding repo for Jenkins (not in basic Ubuntu package)"
rm -f /usr/share/keyrings/jenkins-keyring.asc
mkdir -p /etc/apt/keyrings
curl -fsSL https://pkg.jenkins.io/debian-stable/jenkins.io-2026.key -o /etc/apt/keyrings/jenkins-keyring.asc

echo "deb [signed-by=/etc/apt/keyrings/jenkins-keyring.asc] https://pkg.jenkins.io/debian-stable binary/" | tee \
  /etc/apt/sources.list.d/jenkins.list > /dev/null

apt-get update -y
apt-get install -y jenkins

echo "Launching Jenkins"
systemctl enable --now jenkins

echo "Creating Ansible directory"
mkdir -p /etc/ansible

echo "Preparing SSH-directory for Jenkins"
mkdir -p /var/lib/jenkins/.ssh
chmod 700 /var/lib/jenkins/.ssh
chown -R jenkins:jenkins /var/lib/jenkins/.ssh

echo "Setting up firewall for Jenkins"
iptables -A INPUT -p tcp --dport 8080 -j ACCEPT
netfilter-persistent save

echo "Jenkins and Ansible successdully set up"