# NAS backup — Restic

Deploy artifacts per il backup giornaliero del NAS verso hpserver (Restic + SFTP).

- `nas-backup.sh` → `/usr/local/sbin/nas-backup.sh`
- `nas-backup.service` + `nas-backup.timer` → `/etc/systemd/system/`

Documentazione completa: [../../docs/backup-guide.md](../../docs/backup-guide.md).
Procedura di restore: [../../docs/restore-guide.md](../../docs/restore-guide.md).
