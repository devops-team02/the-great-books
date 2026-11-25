# The Great Books

## Project Structure:

- `web/` - Flask REST API application and static files
- `infrastructure/` - Vagrant configuration, Consul, and VM setup scripts

# SETUP GUIDE

## Prerequisites:

- VirtualBox: https://www.virtualbox.org/wiki/Downloads
- Vagrant: https://developer.hashicorp.com/vagrant/install

### Environment Setup
Before starting the infrastructure or running the app locally, create a `.env` file in the root directory from the template:
```shell
cp .env.example .env
```

## Create VMs:

```shell
vagrant up
```

from directory where <u>*the **Vagrantfile***</u> is (`infrastructure/`)

## Accessing the Web Application:

Once all VMs are provisioned and running, access the web application through the Nginx Load Balancer:

- **Browser (Local Host)**: [http://localhost:8080](http://localhost:8080) (forwarded from the `LB` VM's port `80`)
- **Direct LB IP**: `http://192.168.56.10` (accessible from host or internal private network)

## Connect via SSH:

Access is secured via SSH key authentication.

- **Local Development**: You can use the standard Vagrant workflow:
  ```shell
  vagrant ssh <vm_name>   # e.g., vagrant ssh app1, vagrant ssh DB
  ```
- **Production Environment (Important)**:
  On Production, SSH access **MUST be restricted exclusively to the dedicated `deploy` user** using SSH key pairs (password login and root login are disabled). The default `vagrant` user must be locked and removed (enable `scripts/cleanup_vagrant.sh` in the `Vagrantfile` or your cloud-init script).

### Connecting as `deploy` user:

1. Add your public SSH key to the `.env` file before provisioning:
```shell
SSH_PUB_KEY="ssh-ed25519 AAAAC3... your_key_comment"
```

2. Connect directly via IP using the `deploy` user and your private key:
```shell
ssh deploy@<vm_ip>   # e.g., ssh deploy@192.168.56.2
```

# Vagrant VMs

## VMs specifications:

OS: Ubuntu 22.04 LTS

user: `deploy` (production) / `vagrant` (local development fallback)

### app:

1024MB, 1 cpu

ip: 192.168.56.2 (app1), 192.168.56.3 (app2)

### LB:

512MB, 1 cpu

ip: 192.168.56.10

### DB:

1024MB, 1 cpu

ip: 192.168.56.4

### Consul:

512MB, 1 cpu

ip: 192.168.56.5

# Database Structure

### *After changing the model run this (from /web/ folder):* 

```bash
flask db migrate -m "[message]" # to save the changes in the migration folder
flask db upgrade # to apply the changes to the database
```

### users

- id - int, primary key
- username - varchar(20), not null, unique
- photo_url - varchar(255)
- password - varchar(255), not null (encrypted password)
- role_id - int, not null (foreign key for role)
- house_id - int (foreign key for house)

#### **roles**

- id - int, primary key
- role_name - varchar(50), unique, not null

#### **houses**

- id - int, primary key
- name - varchar(20), (min 5, max 20), not null, unique
- motto - varchar(30), (min 5, max 30), not null
- lord_id - int, not null (foreign key for user)

#### **stats** - *(knight stats and gossip)*

- user_id - int, primary key (foreign key for user)
- strength - int (min 0, max 20)
- defense - int (min 0, max 20)
- endurance - int (min 0, max 20)
- key - varchar(64)
- next_key - datetime
- gossip_target_id - int (foreign key for user)

#### **sessions**

- id - varchar(128), primary key
- user_id - int, not null (foreign key for user)
- expires_at - timestamp, not null
- created_at - timestamp
- ip_address - varchar(15)

# Web Interface (UI Pages)

The application provides a server-rendered web interface with authentication guards:

- `GET /login` - Login and registration form (public)
- `GET /` or `GET /houses` - Main dashboard showing houses, mottos, and lords
- `GET /house` - Current user's House view (members roster, join applications, manage/leave house)
- `GET /knights` - Knights list (visible combat stats depends on house membership / gossip)
- `GET /lords` - Lords view and house administration
- `GET /profile` - User profile, current stats, and Knight gossip key generation
- `GET /nightwatch` - The Wall page for exiled/banished characters

---

# Authentication & Sessions

- Authentication is managed via a session cookie: `token=<session_token>` (`HttpOnly`, `SameSite=Lax`, expires in 24 hours).
- Public endpoints (`/api/auth/register`, `/api/auth/login`, `/api/health`, `/api/roles`, `/api/houses`) do not require authentication.
- All protected `/api/*` endpoints require a valid `token` cookie or return `401 Unauthorized`.
- Access-restricted endpoints validate roles/ownership and return `403 Forbidden` if permissions are insufficient.

---

# Endpoints

### Health

- `GET /api/health` - check backend status (returns `{"status": "ok", "service": "the-great-books-web"}`)

### General (Public)

- `GET /api/roles` - get all roles (`noble`, `knight`, `commonfolk`)
- `GET /api/houses` - get all houses with their names and mottos

### Authentication

- `POST /api/auth/register` - register a new user and start a session
  - Body (JSON): `username` (string, required), `password` (string, required), `role_id` (int, required), `house_id` (int, optional)
  - Success (201): sets `token` cookie and returns user info
- `POST /api/auth/login` - authenticate user and start a session
  - Body (JSON): `username` (string, required), `password` (string, required)
  - Success (200): sets `token` cookie and returns user info
- `POST /api/auth/logout` - invalidate session and clear cookie
  - Header/Cookie: `token=<token>`
  - Success (200): clears `token` cookie

### User & Houses (Authorized)

- `GET /api/me` - get current authenticated user profile, stats, and gossip status
  - Cookie: `token=<token>`
- `POST /api/me/gossip-key` - generate or refresh the daily gossip key (knights only, once every 24h)
  - Cookie: `token=<token>`
  - Returns `403` if not a knight, `429` if 24 hours have not passed since last generation
- `GET /api/knights` - get all knights
  - Cookie: `token=<token>`
  - Note: Combat stats (`strength`, `defense`, `endurance`) are revealed only for self, knights from the same house, or knights revealed via gossip
- `POST /api/gossip` - reveal hidden combat stats of a knight from another house using a gossip key
  - Cookie: `token=<token>`
  - Body (JSON): `key` (string, required - current user's gossip key), `target_id` (int, required - ID of target knight)
  - Returns `403` if key is invalid, `429` if key was already used today, `400` if target belongs to own house
- `GET /api/houses/<house_id>/members` - get all members of the user's house with their stats
  - Cookie: `token=<token>`
  - Returns `403` if user is not a member of the requested house
- `PUT/PATCH /api/houses/<house_id>` - update house name and/or motto
  - Cookie: `token=<token>`
  - Body (JSON): `name` (string, optional, 5-20 chars), `motto` (string, optional, 5-30 chars)
  - Returns `403` if user is not a noble or lord of this house, `409` if name is already taken
- `GET /api/houses/<house_id>` - get specific house info by its ID
  - Cookie: `token=<token>`
  - Returns `404` if house not found
- `GET /api/house` - get current authenticated user's sworn house info
  - Cookie: `token=<token>`
  - Returns `404` if user is not sworn to any house
- `POST /api/house/leave` - renounce allegiance and leave current house
  - Cookie: `token=<token>`
  - Returns `400` if user does not belong to any house
- `POST /api/houses/<house_id>/kick/<target_id>` - cast out a member from the house (Lords only)
  - Cookie: `token=<token>`
  - Returns `403` if requester is not a noble lord of this house, `400` if trying to kick self, `404` if member not found in house
- `POST /api/nightwatch/<target_id>` - banish an offender to the Night's Watch (Lords only)
  - Cookie: `token=<token>`
  - Returns `403` if not a noble or trying to ban a noble/knight of another house, `400` if trying to ban self