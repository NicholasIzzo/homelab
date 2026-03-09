# 🛡️ Security Hardening — Protecting Your Homelab

Practical security measures to protect your self-hosted infrastructure from threats.

---

## The Threat Model

Before hardening, understand what you're protecting against:

1. **External attackers** — someone on the internet trying to access your services
2. **Compromised containers** — a vulnerability in one service spreading to others
3. **Data exposure** — sensitive data (passwords, configs) leaking
4. **Insider mistakes** — accidentally exposing something you didn't mean to

---

## Layer 1 — Network Security

### Never expose services directly to the internet
The most important rule. Use a VPN (Tailscale) instead of port forwarding.

```
❌ Bad:  Router → port forward 443 → Vaultwarden (publicly accessible)
✅ Good: Router → no port forward → Tailscale VPN → Vaultwarden (private)
```

### Keep port forwarding to a minimum
If you must expose something publicly, expose only what's strictly necessary.

**Ports that should NEVER be exposed publicly:**
- NAS admin panel
- Portainer / Docker management
- Grafana / Prometheus
- Any database (MariaDB, PostgreSQL)
- SSH (expose via VPN only)

### Use a reverse proxy for everything public
Never expose application ports directly. Always go through Nginx Proxy Manager:
- Centralized SSL termination
- Can add authentication layers
- Hides internal infrastructure

---

## Layer 2 — SSH Hardening

If your Linux server is accessible via SSH, harden it:

### Disable password authentication (use SSH keys)
```bash
# Generate SSH key pair on your PC
ssh-keygen -t ed25519 -C "your-comment"

# Copy public key to server
ssh-copy-id user@<SERVER_IP>

# Disable password auth in /etc/ssh/sshd_config
PasswordAuthentication no
PermitRootLogin no

# Restart SSH
sudo systemctl restart sshd
```

### Change default SSH port (optional, security through obscurity)
```bash
# In /etc/ssh/sshd_config
Port <CUSTOM_PORT>  # e.g. 2222
```

### Use Fail2Ban to block brute force attacks
```bash
sudo apt install fail2ban -y
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

Fail2Ban automatically bans IPs that fail login too many times.

---

## Layer 3 — Docker Security

### Run containers as non-root
Most containers default to running as root inside the container. Use `PUID` and `PGID`:

```yaml
environment:
  - PUID=1000
  - PGID=1000
```

### Don't use `--privileged` unless necessary
`--privileged` gives the container full access to the host. Only use when required (e.g. Home Assistant for hardware access).

### Keep images updated
Outdated images have known vulnerabilities. Update regularly:

```bash
# Pull latest images and recreate containers
docker compose pull
docker compose up -d
```

### Use read-only volumes where possible
```yaml
volumes:
  - /etc/localtime:/etc/localtime:ro  # :ro = read-only
```

### Isolate containers with separate networks
Don't put all containers on the same network. Group related services:

```yaml
networks:
  media:        # arr stack + jellyfin
  monitoring:   # prometheus + grafana
  proxy:        # NPM + services it proxies
```

---

## Layer 4 — Secrets Management

### Never hardcode passwords in docker-compose files
Use environment files instead:

```bash
# Create .env file (never commit this to Git!)
echo "DB_PASSWORD=mysecretpassword" > /volume1/docker/nextcloud/.env
```

```yaml
# In docker-compose.yml
env_file:
  - .env
```

### Add .env to .gitignore
```bash
echo ".env" >> ~/.gitignore
```

### Use Vaultwarden for all passwords
Store every password in your self-hosted Vaultwarden — never reuse passwords, generate strong random ones.

---

## Layer 5 — Updates and Monitoring

### Keep everything updated
- Docker images: update monthly
- NAS firmware: update when stable releases are available
- Linux packages: `sudo apt update && sudo apt upgrade`

### Monitor for unusual activity
With Grafana + Prometheus already set up:
- Create alerts for unexpected CPU/network spikes
- Monitor failed login attempts in logs
- Watch for containers restarting unexpectedly

### Check container logs regularly
```bash
# View logs for a container
docker logs vaultwarden --tail 50

# Follow logs in real time
docker logs -f nginx-proxy-manager
```

---

## Layer 6 — Data Protection

### Encrypt sensitive backups
Before uploading to any cloud service, encrypt with rclone:

```bash
# rclone crypt encrypts files before uploading
rclone sync /volume1/docker/ b2crypt:my-bucket/
```

### Protect NAS admin panel
- Change default admin credentials immediately
- Enable 2FA on the NAS OS if available
- Access admin panel only from local network or via VPN

---

## Security Checklist

**Network:**
- [ ] No services exposed directly to internet
- [ ] All remote access via Tailscale VPN
- [ ] Reverse proxy for any public services

**SSH:**
- [ ] SSH key authentication only (no passwords)
- [ ] Root login disabled
- [ ] Fail2Ban installed and running

**Docker:**
- [ ] Containers updated regularly
- [ ] No unnecessary `--privileged` flags
- [ ] Secrets in .env files, not hardcoded

**Accounts:**
- [ ] Unique strong password for every service (stored in Vaultwarden)
- [ ] 2FA enabled where possible
- [ ] Default credentials changed on all services

**Backups:**
- [ ] Critical data backed up and encrypted
- [ ] Backups tested

---

> 💡 Security is a process, not a destination. Start with the basics (VPN, no exposed ports, strong passwords) and improve over time.
