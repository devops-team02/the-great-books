datacenter = "tournament-app-dc"

node_name = "consul-server-1"

bootstrap_expect = 1

server = true

data_dir = "/var/lib/consul"

bind_addr = "192.168.56.5"
advertise_addr = "192.168.56.5"

client_addr = "0.0.0.0"

log_level = "INFO"

ui_config {
  enabled = true
}

ports {
  dns      = 8600
  http     = 8500
  https    = -1
  grpc     = -1
  grpc_tls = -1
}