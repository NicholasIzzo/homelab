# 🚀 Homelab for Beginners — Complete Guide

Everything you need to know before building your first homelab. No experience required.

---

## 🤔 What is a Homelab?

A homelab is a personal server setup at home where you run your own services — a password manager, media server, cloud storage, home automation and more — completely under your control, without depending on third-party cloud services.

**Why build one?**
- Learn Linux, networking, Docker and DevOps hands-on
- Replace paid subscriptions (Google Drive, Netflix, Spotify, cloud backup) with self-hosted alternatives
- Full privacy — your data stays at home
- It's genuinely fun

---

## 📚 Prerequisites — What to Learn First

Before buying hardware, invest time in these fundamentals:

### 1. Linux Basics
You don't need to be an expert, but you need to feel comfortable with the terminal.

**Topics to cover:**
- Navigation (`ls`, `cd`, `mkdir`, `cp`, `mv`, `rm`)
- File permissions (`chmod`, `chown`)
- Text editing (`nano` is fine to start)
- Services (`systemctl start/stop/status`)
- SSH (connecting remotely to your server)

**Resources:**
- [Linux Journey](https://linuxjourney.com) — free, interactive, beginner-friendly
- [The Linux Command Line (book)](https://linuxcommand.org/tlcl.php) — free PDF
- YouTube: **NetworkChuck** — *"you need to learn Linux"* series

### 2. Networking Basics
Understanding your home network is essential.

**Topics to cover:**
- IP addresses (local vs public), subnets, gateway
- DNS — what it is and how it works
- Ports — what they are and why they matter
- DHCP — how devices get an IP automatically
- Basic router configuration

**Resources:**
- YouTube: **NetworkChuck** — networking playlist
- YouTube: **Professor Messer** — CompTIA Network+ (free, very thorough)

### 3. Docker
Almost everything in a modern homelab runs in Docker containers.

**Topics to cover:**
- What a container is (vs a virtual machine)
- `docker run`, `docker ps`, `docker logs`, `docker stop`
- Volumes (persistent data)
- Ports mapping
- Docker Compose (managing multiple containers together)

**Resources:**
- [Docker official docs — Get Started](https://docs.docker.com/get-started/)
- YouTube: **TechWorld with Nana** — Docker tutorial for beginners

---

## 🖥️ Choosing Your Hardware

### Option 1 — NAS (Recommended for beginners)
A NAS (Network Attached Storage) is a small device designed to run 24/7, consume little power and store data reliably.

**Good options:**
| Model | RAM | Price range | Notes |
|---|---|---|---|
| Ugreen DH4300 Plus | 8GB | ~€350 | Excellent Docker support, ARM64 |
| Synology DS223 | 2GB | ~€300 | Great software, limited RAM |
| Synology DS923+ | 4GB | ~€550 | More powerful, upgradeable RAM |
| QNAP TS-233 | 2GB | ~€200 | Budget option |

> More RAM = more Docker containers you can run simultaneously. Aim for at least 4-8GB if you plan to run many services.

### Option 2 — Mini PC (More power, less storage focus)
A small PC running Linux gives you more CPU power for tasks like video transcoding.

**Good options:**
- **HP ProDesk G400 Mini** — cheap used, very low power consumption
- **Beelink Mini S12 Pro** — affordable new, Intel N100
- **Intel NUC** — compact, powerful, pricier

### Option 3 — Raspberry Pi
Good for learning but limited RAM (max 8GB) and storage speed. Not ideal as a primary homelab server.

---

## 💾 Hard Drives — What to Buy

### NAS Drives vs Desktop Drives
Always use **NAS-specific drives** in a NAS — they are designed for 24/7 operation and vibration tolerance.

**Recommended NAS drives:**
- **Western Digital Red Plus** — reliable, good value, designed for NAS
- **Seagate IronWolf** — solid alternative, includes health monitoring
- **Western Digital Red Pro** — for heavier workloads

> Avoid desktop drives (WD Blue, Seagate Barracuda) in a NAS — they are not designed for continuous operation.

### How Much Storage?
- **2TB** — good starting point for media + backups
- **4-8TB** — comfortable for a media server with movies and TV
- **2x same size drives** — required if you want RAID 1

---

## 🔄 RAID — What It Is and What to Choose

**RAID is NOT a backup.** It protects against drive failure, not against accidental deletion, ransomware or fire.

### Common RAID levels:

| RAID | Drives needed | Usable space | Protection |
|---|---|---|---|
| **RAID 0** | 2+ | 100% | None — if one drive fails, all data lost |
| **RAID 1** | 2 | 50% | 1 drive failure — data mirrored on both drives |
| **RAID 5** | 3+ | ~67% | 1 drive failure — data spread with parity |
| **RAID 6** | 4+ | ~50% | 2 drive failures |

**For beginners: RAID 1** is the simplest and most reliable choice. Two drives mirror each other — if one fails, you replace it and rebuild.

> Remember: RAID 1 with 2x4TB gives you 4TB usable space, not 8TB.

### The 3-2-1 Backup Rule
Even with RAID, follow this rule:
- **3** copies of your data
- **2** different storage media
- **1** offsite (cloud, external drive at a different location)

---

## 🐳 First Services to Install

Start simple — don't try to run everything at once.

**Suggested order:**
1. **Portainer** — visual Docker management UI (makes everything easier)
2. **Pihole** — network ad blocking, great first project
3. **Vaultwarden** — password manager (very useful immediately)
4. **Jellyfin** — media server if you have movies/music
5. **Prometheus + Grafana** — once you have services running, monitor them

---

## 🌐 Networking — Access Your Services Remotely

### Option 1 — Tailscale (Recommended for beginners)
Tailscale creates a private VPN mesh between your devices. No port forwarding, no public IP needed, works behind any router.

- Install Tailscale on your NAS and all your devices
- Access services via Tailscale IP or MagicDNS hostname
- Generate HTTPS certificates for your private domain

### Option 2 — Cloudflare Tunnel
Free, no port forwarding required, exposes services publicly via Cloudflare's network. Good for services you want to share with others.

### Option 3 — Port Forwarding (Not recommended)
Exposing ports directly to the internet is risky for beginners. Avoid unless you know exactly what you're doing.

---

## 📺 Recommended YouTube Channels

| Channel | Focus |
|---|---|
| **NetworkChuck** | Networking, Linux, homelab projects |
| **TechWorld with Nana** | Docker, Kubernetes, DevOps |
| **Jeff Geerling** | Raspberry Pi, self-hosting, hardware |
| **Wolfgang's Channel** | Homelab, self-hosting, privacy |
| **Craft Computing** | NAS, Proxmox, homelab builds |
| **Christian Lempa** | Docker, networking, homelab guides |

---

## 🗺️ Suggested Learning Path

```
Month 1: Linux basics + SSH + basic networking
Month 2: Docker fundamentals + first container (Pihole or Portainer)
Month 3: More services + reverse proxy + HTTPS
Month 4: Monitoring (Prometheus + Grafana) + backups
Month 5+: Explore — Home Assistant, Nextcloud, cloud integration
```

---

## ⚠️ Common Mistakes to Avoid

- **Not backing up** — RAID is not a backup
- **Exposing services directly to the internet** without understanding the risks
- **Running everything at once** — start with one service, learn it, then add more
- **Buying cheap drives** — use NAS-specific drives for 24/7 operation
- **Not documenting your setup** — you will forget how you configured things

---

> 💡 The best homelab is the one you actually use and maintain. Start small, stay curious.
