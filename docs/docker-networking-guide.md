# 🐳 Docker Networking — Explained

How Docker containers communicate with each other and with the outside world.

---

## Why Docker Networking Matters

When you run multiple containers, they need to talk to each other. Understanding Docker networking helps you:
- Connect services correctly (e.g. Nextcloud → MariaDB)
- Expose only what needs to be exposed
- Troubleshoot connection issues
- Build more secure setups

---

## The Four Network Types

### 1. Bridge (default)
The default network mode. Docker creates a virtual network and each container gets an IP on it.

```bash
docker run -d --name myapp -p 8080:80 nginx
```

```
Host machine
├── eth0 (192.168.0.36) — your real network
└── docker0 (172.17.0.1) — Docker's virtual bridge
    ├── container1 (172.17.0.2)
    └── container2 (172.17.0.3)
```

- Containers on the same bridge network can communicate by container name
- External access requires port mapping (`-p host_port:container_port`)
- **Default for most containers**

### 2. Host
The container shares the host's network stack directly — no isolation.

```bash
docker run -d --network host nginx
```

- Container uses the host's IP directly
- No port mapping needed — port 80 in container = port 80 on host
- Less secure (no network isolation)
- **Used by: Home Assistant** (needs host network for device discovery)

### 3. None
No network access at all.

```bash
docker run -d --network none myapp
```

- Complete network isolation
- Rare use case — only for containers that don't need network

### 4. Container (shared network)
A container shares another container's network stack.

```bash
docker run -d --network container:gluetun qbittorrent
```

- The container has no own network — it uses another container's
- **Used by: qBittorrent sharing Gluetun's VPN network**
- All traffic from qBittorrent goes through Gluetun's VPN tunnel

---

## Custom Bridge Networks (Recommended)

By default, containers on the default bridge network can't resolve each other by name. Create a custom network to fix this:

```bash
# Create a custom network
docker network create mynetwork

# Run containers on it
docker run -d --name db --network mynetwork mariadb
docker run -d --name app --network mynetwork nextcloud
```

Now `app` can reach `db` simply by using the hostname `db` — Docker handles DNS resolution automatically.

In Docker Compose, a custom network is created automatically:

```yaml
services:
  db:
    image: mariadb
  app:
    image: nextcloud
    depends_on:
      - db
# Both containers are on the same network automatically
# app can reach db with hostname "db"
```

---

## Port Mapping Explained

```
-p <host_port>:<container_port>
```

```
External request → host_port → Docker → container_port → container
```

Example:
```bash
-p 8080:80
```
- Someone visits `http://192.168.0.36:8080`
- Docker forwards to port 80 inside the container
- The container sees a request on port 80

**You only need to map ports for services you want to access from outside the container.**

---

## DNS Resolution Between Containers

On a custom bridge network, containers can reach each other by name:

```yaml
services:
  mariadb:
    image: mariadb
  nextcloud:
    image: nextcloud
    environment:
      - MYSQL_HOST=mariadb  # Use container name, not IP
```

Docker automatically resolves `mariadb` to the correct container IP — no need to hardcode IPs.

---

## Practical Examples from This Homelab

### Nextcloud → MariaDB
```
nextcloud container
    │ connects to hostname "mariadb"
    ▼
mariadb container
(same Docker network, resolved automatically)
```

### qBittorrent → Gluetun VPN
```
qbittorrent container
    │ shares network with gluetun (--network container:gluetun)
    ▼
gluetun container
    │ all traffic goes through VPN tunnel
    ▼
Internet (via VPN)
```

### Nginx Proxy Manager → Services
```
External request (HTTPS)
    │
    ▼
NPM container (port 443)
    │ forwards to internal service by IP:port
    ▼
Vaultwarden (192.168.0.36:41609)
```

---

## Useful Commands

```bash
# List all networks
docker network ls

# Inspect a network (see connected containers and IPs)
docker network inspect bridge

# Create a custom network
docker network create mynetwork

# Connect a running container to a network
docker network connect mynetwork mycontainer

# See container's network config
docker inspect mycontainer | grep -A 20 "Networks"
```

---

## Common Issues

**Container can't reach another container:**
- Are they on the same network?
- Are you using the container name (not IP) for DNS?

**Port already in use:**
```
Error: Bind for 0.0.0.0:8080 failed: port is already allocated
```
- Another container or service is using that host port
- Change the host port: `-p 8081:80` instead of `-p 8080:80`

**Container accessible locally but not from other devices:**
- Check if port is mapped correctly
- Check if host firewall is blocking the port

---

> 💡 Always use custom bridge networks in Docker Compose — it gives you automatic DNS resolution between containers and better isolation than the default bridge.
