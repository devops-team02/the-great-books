packer {
  required_plugins {
    vagrant = {
      version = ">= 1.1.0"
      source  = "github.com/hashicorp/vagrant"
    }
    ansible = {
      version = ">= 1.1.0"
      source  = "github.com/hashicorp/ansible"
    }
  }
}

source "vagrant" "postgres" {
  communicator = "ssh"

  source_path = "../builds/base/package.box"

  provider   = "virtualbox"
  output_dir = "../builds/postgres"

  skip_add = true
}

build {
  sources = ["source.vagrant.postgres"]

  provisioner "ansible" {
    playbook_file = "./postgres.yml"
  }
}