# 💾 Backup Strategy — The 3-2-1 Rule

How to protect your data in a homelab. RAID is not a backup — here's what you actually need.

---

## The Golden Rule: RAID ≠ Backup

This is the most common mistake in homelabs:

> "I have RAID 1, my data is safe."

**Wrong.** RAID protects against a single hard drive failure. It does NOT protect against:
- Accidental file deletion
- Ransomware encrypting your files
- NAS firmware bug corrupting data
- Fire, flood, theft
- You accidentally deleting the wrong folder

You need a **real backup strategy**.

---

## The 3-2-1 Rule

The industry standard for data protection:

```
3 — Keep 3 copies of your data
2 — Store on 2 different media types
1 — Keep 1 copy offsite (different physical location)
```

### Example for a homelab:

| Copy | Location | Media |
|---|---|---|
| Copy 1 | NAS (primary) | HDD RAID 1 |
| Copy 2 | External USB drive at home | USB HDD |
| Copy 3 | Cloud storage (offsite) | Backblaze B2 / rclone |

---

## What to Back Up

Not everything needs the same level of protection. Prioritize:

### Critical (back up everything, always):
- Vaultwarden data (`/volume1/docker/vaultwarden/`)
- Home Assistant config (`/volume1/docker/homeassistant/`)
- Nextcloud data
- Docker configs and compose files
- Personal documents and photos

### Important (back up regularly):
- Grafana dashboards
- Prometheus data
- Pihole config

### Low priority (can be recreated):
- Downloaded media (movies, TV) — can be re-downloaded
- Docker images — can be pulled again

---

## Tools for Backup

### 1. Rsync — Simple file sync
The classic Unix tool for syncing files between locations.

```bash
# Sync NAS docker configs to external drive
rsync -avh --delete /volume1/docker/ /mnt/backup/docker/

# Sync to remote server via SSH
rsync -avh -e ssh /volume1/docker/ user@remote-server:/backup/
```

**Pros:** Built into every Linux system, fast, reliable
**Cons:** Manual setup, no encryption by default

### 2. Rclone — Cloud backup
Rclone syncs files to any cloud provider (Backblaze B2, Google Drive, S3, etc.)

```bash
# Configure a remote (interactive)
rclone config

# Sync to Backblaze B2
rclone sync /volume1/docker/ b2:my-bucket/docker/ --progress

# With encryption
rclone sync /volume1/docker/ b2crypt:my-bucket/docker/ --progress
```

**Pros:** Supports 40+ cloud providers, built-in encryption, free with Backblaze B2 (cheap storage)
**Cons:** Requires configuration

### 3. Duplicati — GUI backup tool
Web-based backup tool with scheduling, encryption and deduplication.

```bash
docker run -d \
  --name duplicati \
  --restart unless-stopped \
  -p <PORT>:8200 \
  -v /volume1/docker/duplicati:/config \
  -v /volume1:/source:ro \
  -v /mnt/backup:/backup \
  lscr.io/linuxserver/duplicati
```

**Pros:** Easy web UI, scheduling, encryption, deduplication
**Cons:** Slower than rsync for large datasets

### 4. Ugreen NAS built-in backup
The Ugreen DH4300 Plus has built-in backup tools in the OS — check the Backup section in the NAS UI for scheduled local and cloud backups.

---

## Recommended Backup Schedule

| What | How often | Where |
|---|---|---|
| Docker configs | Daily | Local external drive + cloud |
| Personal documents | Daily | Cloud (encrypted) |
| Photos | Weekly | Cloud (encrypted) |
| Full NAS snapshot | Weekly | External drive |
| Media files | No backup needed | Re-downloadable |

---

## Cloud Storage Options

| Service | Price | Notes |
|---|---|---|
| **Backblaze B2** | ~$6/TB/month | Best price, rclone support |
| **Hetzner Storage Box** | ~€3/TB/month | European, GDPR compliant |
| **Google Drive** | 15GB free | Easy but expensive above free tier |
| **OneDrive** | Included with M365 | Good if you already pay for M365 |

> Always **encrypt** before uploading to any cloud — use rclone's built-in encryption or Duplicati.

---

## Testing Your Backups

A backup you've never tested is not a backup.

**Every 3 months:**
- [ ] Restore a random file from backup and verify it's intact
- [ ] Check backup logs for errors
- [ ] Verify offsite copy is up to date

---

## Quick Start

1. Identify your critical data (Docker configs, personal files)
2. Set up local backup with rsync to an external drive
3. Set up cloud backup with rclone to Backblaze B2
4. Schedule automatic backups (cron job or NAS scheduler)
5. Test a restore every few months

> 💡 The best backup is the one that runs automatically without you thinking about it.
