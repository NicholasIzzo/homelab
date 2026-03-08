# 📊 Prometheus + Grafana Monitoring Stack

Full monitoring stack for NAS (ARM64) and additional Linux servers using Prometheus, Grafana, Node Exporter and cAdvisor.

## Architecture

```
NAS (ARM64)                          Mini PC (x86)
├── Prometheus    ←── scrapes ───────── Node Exporter
├── Grafana                          
├── Node Exporter (NAS metrics)      
└── cAdvisor (Docker metrics)        
```

---

## Prerequisites

- Docker installed on your NAS
- SSH access to your NAS
- Additional Linux servers you want to monitor

---

## Step 1 — Install Node Exporter on remote servers (apt)

On each Linux server you want to monitor:

```bash
sudo apt update
sudo apt install prometheus-node-exporter -y
sudo systemctl enable prometheus-node-exporter
sudo systemctl start prometheus-node-exporter
```

Verify it's running:

```bash
sudo systemctl status prometheus-node-exporter
```

Node Exporter exposes metrics on port `9100`.

---

## Step 2 — Deploy cAdvisor on NAS (ARM64)

> ⚠️ The official `gcr.io/cadvisor/cadvisor` image does not support ARM64. Use `zcube/cadvisor` instead.

cAdvisor requires access to host system paths:

```bash
docker run -d \
  --name cadvisor \
  --restart unless-stopped \
  -p 8080:8080 \
  -v /:/rootfs:ro \
  -v /var/run:/var/run:rw \
  -v /sys:/sys:ro \
  -v /var/lib/docker:/var/lib/docker:ro \
  zcube/cadvisor
```

---

## Step 3 — Deploy Node Exporter on NAS

```bash
docker run -d \
  --name node-exporter \
  --restart unless-stopped \
  -p 9100:9100 \
  prom/node-exporter
```

---

## Step 4 — Create Prometheus configuration

```bash
mkdir -p /volume1/docker/prometheus
```

Create `/volume1/docker/prometheus/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'nas'
    static_configs:
      - targets: ['<NAS_IP>:9100']

  - job_name: 'minipc'
    static_configs:
      - targets: ['<MINIPC_IP>:9100']

  - job_name: 'docker'
    static_configs:
      - targets: ['<NAS_IP>:8080']
```

Set correct permissions:

```bash
chmod 644 /volume1/docker/prometheus/prometheus.yml
```

---

## Step 5 — Deploy Prometheus

```bash
docker run -d \
  --name prometheus \
  --restart unless-stopped \
  -p <PORT>:9090 \
  -v /volume1/docker/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus
```

---

## Step 6 — Deploy Grafana

```bash
mkdir -p /volume1/docker/grafana
chown -R 472:472 /volume1/docker/grafana

docker run -d \
  --name grafana \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /volume1/docker/grafana:/var/lib/grafana \
  -e GF_SMTP_ENABLED=true \
  -e GF_SMTP_HOST=smtp-mail.outlook.com:587 \
  -e "GF_SMTP_USER=<YOUR_EMAIL>" \
  -e "GF_SMTP_PASSWORD=<YOUR_PASSWORD>" \
  -e "GF_SMTP_FROM_ADDRESS=<YOUR_EMAIL>" \
  grafana/grafana
```

> Remove SMTP environment variables if you don't need email alerts.

---

## Step 7 — Configure Grafana

1. Open Grafana at `http://<NAS_IP>:3000`
2. Default credentials: `admin` / `admin` (change immediately)
3. Go to **Connections → Data Sources → Add data source**
4. Select **Prometheus**
5. URL: `http://<NAS_IP>:<PROMETHEUS_PORT>`
6. Click **Save & Test**

---

## Step 8 — Import Node Exporter Dashboard

1. Go to **Dashboards → Import**
2. Enter ID: `1860`
3. Click **Load**
4. Select your Prometheus datasource
5. Click **Import**

You now have a full dashboard with CPU, RAM, disk, and network metrics for all your machines.

---

## Step 9 — Set up Alerting (optional)

1. Go to **Alerting → Contact points → Create contact point**
2. Choose your preferred integration (Email, Discord, Telegram, etc.)
3. Configure **Alert rules** for the metrics you want to monitor
4. Set **Notification policies** to route alerts to your contact point

---

## Notes

- cAdvisor ARM64 support: use `zcube/cadvisor`, not the official image
- Grafana data directory must be owned by UID 472
- Prometheus config file must have read permissions (`chmod 644`)
- Default data retention in Prometheus is 15 days
