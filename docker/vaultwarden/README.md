# 🔐 Vaultwarden + Nginx Proxy Manager + Tailscale HTTPS

Self-hosted password manager with HTTPS via Tailscale certificates and Nginx Proxy Manager as reverse proxy.

## Why this setup?

Vaultwarden requires HTTPS to work (browsers block the Subtle Crypto API on HTTP). Since the NAS is not exposed to the internet, Let's Encrypt standard HTTP challenge won't work. The solution is:

1. **Tailscale** generates a valid SSL certificate for your private domain
2. **Nginx Proxy Manager** acts as a reverse proxy, terminating HTTPS and forwarding to Vaultwarden over HTTP

```
Browser → HTTPS → Tailscale → Nginx Proxy Manager → HTTP → Vaultwarden
```

---

## Prerequisites

- Docker installed on your NAS
- Tailscale container running on your NAS
- Tailscale installed on all client devices
- MagicDNS and HTTPS Certificates enabled on Tailscale admin console

---

## Step 1 — Enable Tailscale HTTPS

1. Go to [tailscale.com/admin/dns](https://tailscale.com/admin/dns)
2. Enable **MagicDNS**
3. Click **Enable HTTPS** — confirm the dialog

Your NAS will be reachable at `<hostname>.taile39e4f.ts.net`

---

## Step 2 — Deploy Vaultwarden

```bash
docker run -d \
  --name vaultwarden \
  --restart unless-stopped \
  -p <PORT>:80 \
  -v /volume1/docker/vaultwarden:/data \
  -e SIGNUPS_ALLOWED=true \
  vaultwarden/server
```

> ⚠️ After creating your account, set `SIGNUPS_ALLOWED=false` to prevent others from registering.

---

## Step 3 — Deploy Nginx Proxy Manager

NPM requires two volumes and specific ports:

```bash
mkdir -p /volume1/docker/nginx-proxy-manager/data
mkdir -p /volume1/docker/nginx-proxy-manager/letsencrypt

docker run -d \
  --name nginx-proxy-manager \
  --restart unless-stopped \
  -p <HTTP_PORT>:80 \
  -p <HTTPS_PORT>:443 \
  -p <ADMIN_PORT>:81 \
  -v /volume1/docker/nginx-proxy-manager/data:/data \
  -v /volume1/docker/nginx-proxy-manager/letsencrypt:/etc/letsencrypt \
  jc21/nginx-proxy-manager
```

Access the admin panel at `http://<NAS_IP>:<ADMIN_PORT>`

Default credentials:
- Email: `admin@example.com`
- Password: `changeme`

> Change credentials immediately after first login.

---

## Step 4 — Generate Tailscale SSL Certificate

Tailscale runs as a Docker container, so we use `docker exec` to generate the certificate:

```bash
docker exec tailscale tailscale cert <hostname>.taile39e4f.ts.net
```

Copy the certificate files out of the container:

```bash
docker cp tailscale:/tmp/certs/<hostname>.taile39e4f.ts.net.crt /volume1/docker/nginx-proxy-manager/letsencrypt/
docker cp tailscale:/tmp/certs/<hostname>.taile39e4f.ts.net.key /volume1/docker/nginx-proxy-manager/letsencrypt/
```

---

## Step 5 — Split the Certificate File

The `.crt` file contains two certificates — split them into separate files:

**`vaultwarden-cert.crt`** — first block (your domain certificate):
```
-----BEGIN CERTIFICATE-----
... (first block) ...
-----END CERTIFICATE-----
```

**`vaultwarden-intermediate.crt`** — second block (Let's Encrypt intermediate):
```
-----BEGIN CERTIFICATE-----
... (second block) ...
-----END CERTIFICATE-----
```

**`vaultwarden.key`** — the private key file (copy as-is)

---

## Step 6 — Add Custom Certificate in NPM

1. Go to NPM admin panel → **SSL Certificates → Add Certificate → Custom**
2. Fill in:
   - Name: `vaultwarden-tailscale`
   - Certificate Key: upload `vaultwarden.key`
   - Certificate: upload `vaultwarden-cert.crt`
   - Intermediate Certificate: upload `vaultwarden-intermediate.crt`
3. Click **Save**

---

## Step 7 — Create Proxy Host in NPM

1. Go to **Hosts → Proxy Hosts → Add Proxy Host**
2. **Details tab:**
   - Domain Name: `<hostname>.taile39e4f.ts.net`
   - Scheme: `http`
   - Forward Hostname/IP: `<NAS_IP>`
   - Forward Port: `<VAULTWARDEN_PORT>`
   - ✅ Block Common Exploits
   - ✅ Websockets Support
3. **SSL tab:**
   - SSL Certificate: select `vaultwarden-tailscale`
   - ✅ Force SSL
   - ✅ HTTP/2 Support
4. Click **Save**

---

## Step 8 — Configure Bitwarden Client

In the Bitwarden app (desktop or mobile):

1. Go to **Settings → Server URL**
2. Enter: `https://<hostname>.taile39e4f.ts.net:<HTTPS_PORT>`
3. Create your account

---

## Step 9 — Disable Registrations

After creating your account, disable new registrations:

Edit the Vaultwarden container and set:
```
SIGNUPS_ALLOWED=false
```

Restart the container.

---

## Notes

- The Tailscale certificate expires every ~90 days — remember to renew it with `docker exec tailscale tailscale cert <hostname>`
- Vaultwarden is only accessible from devices connected to your Tailscale network
- NPM admin panel should never be exposed publicly
