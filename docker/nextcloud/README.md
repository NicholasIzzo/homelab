# ☁️ Nextcloud — Self-Hosted Cloud Storage

Self-hosted alternative to Google Drive / OneDrive, running on Docker with MariaDB as database backend.

## Why Nextcloud?

Nextcloud gives you full control over your files — no third-party cloud, no data sharing, no subscription fees. Features include:

- File sync across devices (desktop + mobile apps available)
- Photo gallery and automatic phone backup
- Calendar and contacts sync
- Office document editing (with Collabora/OnlyOffice integration)
- Accessible via HTTPS through Tailscale + NPM

---

## Prerequisites

- Docker installed on your NAS
- MariaDB container running (used as database backend)
- Nginx Proxy Manager + Tailscale certificate (for HTTPS access)

---

## Step 1 — Deploy MariaDB

Nextcloud requires a database. MariaDB is the recommended option:

```bash
mkdir -p /volume1/docker/mariadb

docker run -d \
  --name mariadb \
  --restart unless-stopped \
  -e MYSQL_ROOT_PASSWORD=<ROOT_PASSWORD> \
  -e MYSQL_DATABASE=nextcloud \
  -e MYSQL_USER=nextcloud \
  -e MYSQL_PASSWORD=<DB_PASSWORD> \
  -v /volume1/docker/mariadb:/var/lib/mysql \
  mariadb:latest
```

---

## Step 2 — Deploy Nextcloud

```bash
mkdir -p /volume1/docker/nextcloud
mkdir -p /volume1/media/nextcloud-data

docker run -d \
  --name nextcloud \
  --restart unless-stopped \
  -p <PORT>:80 \
  -e MYSQL_HOST=<NAS_IP> \
  -e MYSQL_DATABASE=nextcloud \
  -e MYSQL_USER=nextcloud \
  -e MYSQL_PASSWORD=<DB_PASSWORD> \
  -v /volume1/docker/nextcloud:/var/www/html \
  -v /volume1/media/nextcloud-data:/var/www/html/data \
  linuxserver/nextcloud:latest
```

---

## Step 3 — Initial Setup

1. Open Nextcloud at `http://<NAS_IP>:<PORT>`
2. Create admin account
3. Database settings:
   - Database: **MySQL/MariaDB**
   - Host: `<NAS_IP>`
   - Database name: `nextcloud`
   - User: `nextcloud`
   - Password: `<DB_PASSWORD>`
4. Click **Finish setup**

---

## Step 4 — Expose via Tailscale + NPM

To access Nextcloud securely via HTTPS:

1. In Nginx Proxy Manager, create a new Proxy Host:
   - Domain: `nextcloud.<hostname>.taile39e4f.ts.net` (or use a subdomain)
   - Forward: `http://<NAS_IP>:<NEXTCLOUD_PORT>`
   - SSL: use your Tailscale certificate
   - ✅ Force SSL, ✅ Websockets Support

2. Add trusted domain to Nextcloud config (`/volume1/docker/nextcloud/config/config.php`):
```php
'trusted_domains' =>
  array (
    0 => '<NAS_IP>:<PORT>',
    1 => '<hostname>.taile39e4f.ts.net',
  ),
'overwrite.cli.url' => 'https://<hostname>.taile39e4f.ts.net:<HTTPS_PORT>',
'overwriteprotocol' => 'https',
```

---

## Step 5 — Desktop & Mobile Sync

Install the Nextcloud client on your devices:
- **Desktop**: [nextcloud.com/install](https://nextcloud.com/install) (Windows, Mac, Linux)
- **Mobile**: Nextcloud app on App Store / Google Play

Connect using your Tailscale HTTPS URL.

---

## Useful Apps (from Nextcloud App Store)

- **Nextcloud Photos** — automatic photo backup from mobile
- **Calendar** — sync with your phone calendar
- **Contacts** — sync contacts across devices
- **Memories** — Google Photos-like interface for your photos
- **Talk** — video calls and chat (self-hosted)

---

## Notes

- Store Nextcloud data on a large volume — it will grow with your files
- MariaDB and Nextcloud containers must be on the same Docker network or use host IP
- Back up both the `/var/www/html` volume and the MariaDB volume regularly
- Nextcloud has a maintenance mode for safe updates: `docker exec nextcloud php occ maintenance:mode --on`
