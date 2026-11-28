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

source "vagrant" "base" {
  communicator = "ssh"
  source_path  = "ubuntu/jammy64"
  provider     = "virtualbox"
  output_dir   = "../builds/base"
  skip_add     = true
}

build {
  sources = ["source.vagrant.base"]

  provisioner "ansible" {
    playbook_file = "./playbook.yml"
    roles_path    = "../../ansible/roles"
  }
}