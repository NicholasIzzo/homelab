# 🔐 VPN Guide — Tailscale vs WireGuard vs OpenVPN

A practical comparison of the most common VPN solutions for homelab use, with recommendations for each use case.

---

## What is a VPN (in homelab context)?

In a homelab context, a VPN lets you **securely access your home network from anywhere** — as if you were physically connected to your home router.

This is different from commercial VPNs (NordVPN, ExpressVPN) which are used to hide your internet traffic. Here we're talking about **self-hosted VPNs for remote access**.

---

## The Three Main Options

### 1. Tailscale ⭐ Recommended for beginners

Tailscale is a managed VPN service built on top of WireGuard. It handles all the complexity for you.

**How it works:**
- Install Tailscale on each device
- Devices connect to each other directly (peer-to-peer) through Tailscale's coordination server
- Each device gets a stable IP on the `100.x.x.x` range
- MagicDNS gives each device a hostname (e.g. `my-nas.taile39e4f.ts.net`)

**Pros:**
- ✅ Zero configuration — works behind any NAT/firewall
- ✅ No port forwarding required
- ✅ Free tier supports up to 100 devices
- ✅ MagicDNS and HTTPS certificates included
- ✅ Works on every OS (Linux, Windows, macOS, iOS, Android)
- ✅ Generates valid SSL certificates for your private domain

**Cons:**
- ❌ Relies on Tailscale's coordination servers (not 100% self-hosted)
- ❌ Free tier limited to 100 devices and 3 users

**Best for:** Beginners, homelab remote access, accessing self-hosted services securely

---

### 2. WireGuard — Self-hosted, fast, modern

WireGuard is a modern VPN protocol built into the Linux kernel. It's the foundation that Tailscale is built on.

**How it works:**
- You run a WireGuard server on your NAS/VPS
- Clients connect to your server using a config file with keys
- All traffic is encrypted and routed through your server

**Pros:**
- ✅ Completely self-hosted — no third party involved
- ✅ Extremely fast and lightweight
- ✅ Built into Linux kernel (no extra software)
- ✅ Simple config file

**Cons:**
- ❌ Requires port forwarding on your router
- ❌ Requires a static public IP or dynamic DNS
- ❌ Manual key management for each client
- ❌ More complex to set up than Tailscale

**Best for:** Users who want full control, no third-party dependency, comfortable with networking

---

### 3. OpenVPN — Battle-tested, widely supported

OpenVPN is the classic VPN solution, widely used in enterprise and homelab environments.

**How it works:**
- Run an OpenVPN server (e.g. via Docker)
- Distribute `.ovpn` config files to clients
- Clients connect through SSL/TLS tunnel

**Pros:**
- ✅ Extremely mature and battle-tested
- ✅ Supported by virtually every device and router
- ✅ Highly configurable

**Cons:**
- ❌ Slower than WireGuard
- ❌ Complex configuration
- ❌ Heavy — uses more CPU and battery than WireGuard
- ❌ Requires port forwarding

**Best for:** Enterprise environments, older devices, situations where WireGuard is blocked

---

## Comparison Table

| | Tailscale | WireGuard | OpenVPN |
|---|---|---|---|
| Setup difficulty | ⭐ Very easy | ⭐⭐⭐ Medium | ⭐⭐⭐⭐ Hard |
| Speed | Fast | Very fast | Moderate |
| Port forwarding needed | ❌ No | ✅ Yes | ✅ Yes |
| Self-hosted | Partial | ✅ Full | ✅ Full |
| Free | ✅ Free tier | ✅ Free | ✅ Free |
| SSL certificates | ✅ Built-in | ❌ Manual | ❌ Manual |
| Best for | Beginners | Advanced | Enterprise |

---

## My Setup

I use **Tailscale** running as a Docker container on the NAS:
- All homelab services are accessible only through Tailscale
- No ports exposed to the internet
- SSL certificates generated via `tailscale cert` for HTTPS
- Nginx Proxy Manager uses these certificates for all services

This means even if someone knows my public IP, they can't reach any service — everything is behind Tailscale.

---

## Recommendation

| Scenario | Use |
|---|---|
| Just starting out | **Tailscale** |
| Want full self-hosting | **WireGuard** |
| Need enterprise compatibility | **OpenVPN** |
| VPN for torrenting (kill switch) | **Gluetun** (supports all three) |
