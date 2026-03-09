# 🏠 Home Assistant — Home Automation

Self-hosted home automation platform running on Docker, managing smart home devices and automations.

## Why Home Assistant?

Home Assistant is the most popular open-source home automation platform. It integrates with thousands of devices and services, allowing you to:

- Control smart home devices from a single interface
- Create automations (e.g. lights on at sunset, alerts when someone arrives home)
- Monitor energy consumption
- Run completely local — no cloud dependency

---

## Prerequisites

- Docker installed on your NAS
- Smart home devices (lights, sensors, plugs, etc.)
- Optional: Zigbee/Z-Wave USB dongle for local device control

---

## Step 1 — Deploy Home Assistant

```bash
mkdir -p /volume1/docker/homeassistant

docker run -d \
  --name homeassistant \
  --restart unless-stopped \
  --privileged \
  -e TZ=Europe/Rome \
  -v /volume1/docker/homeassistant:/config \
  -p <PORT>:8123 \
  ghcr.io/home-assistant/home-assistant:latest
```

> `--privileged` is required for Home Assistant to access host hardware (USB dongles, network discovery).

---

## Step 2 — Initial Setup

1. Open Home Assistant at `http://<NAS_IP>:<PORT>`
2. Create your admin account
3. Home Assistant will auto-discover devices on your local network
4. Follow the onboarding wizard to add your location and first integrations

---

## Step 3 — Expose via Tailscale + NPM (optional)

To access Home Assistant securely from outside your network, follow the same pattern used for Vaultwarden:

1. Generate Tailscale certificate (if not already done):
```bash
docker exec tailscale tailscale cert <hostname>.taile39e4f.ts.net
```

2. In Nginx Proxy Manager, create a new Proxy Host:
   - Domain: `<hostname>.taile39e4f.ts.net`
   - Forward: `http://<NAS_IP>:<HA_PORT>`
   - SSL: use your existing Tailscale certificate
   - ✅ Force SSL, ✅ Websockets Support (required for HA)

3. Update `configuration.yaml` to allow the proxy:
```yaml
http:
  use_x_forwarded_for: true
  trusted_proxies:
    - <NAS_IP>
```

---

## Step 4 — Key Concepts

**Integrations** — connect external services and devices (Google, Alexa, Zigbee, MQTT, etc.)

**Entities** — individual controllable items (a light bulb, a sensor, a switch)

**Automations** — rules that trigger actions based on conditions
```
Trigger: Sun sets
Condition: Someone is home
Action: Turn on living room lights
```

**Dashboards** — customizable UI to control and monitor everything

---

## Useful Integrations

- **HACS** (Home Assistant Community Store) — install community-made integrations and themes
- **Zigbee2MQTT** — control Zigbee devices locally without a cloud
- **Node-RED** — advanced visual automation editor
- **Grafana** — connect HA metrics to your existing Grafana dashboard

---

## Notes

- Home Assistant config is stored in `/volume1/docker/homeassistant`
- Back up the config folder regularly — it contains all your automations and settings
- The `--privileged` flag gives full hardware access — only use on trusted networks
- Websockets must be enabled in NPM if using a reverse proxy
