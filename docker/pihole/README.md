# 🛡️ Pihole — Network-Wide Ad Blocking

Self-hosted DNS sinkhole that blocks ads and trackers at the network level for all devices on your network.

## Why Pihole?

Unlike browser extensions that only block ads in one browser, Pihole works at the DNS level — blocking ads for every device on your network including smartphones, smart TVs, game consoles and IoT devices, without installing anything on them.

- Blocks ads and trackers before they even load
- Works for all devices on the network automatically
- Provides DNS query statistics and logs
- Speeds up browsing by blocking unnecessary requests
- Can be used as a local DNS server for custom hostnames

---

## Prerequisites

- Docker installed on your NAS
- Access to your router settings (to set DNS server)

---

## Step 1 — Deploy Pihole

```bash
mkdir -p /volume1/docker/pihole/etc-pihole
mkdir -p /volume1/docker/pihole/etc-dnsmasq.d

docker run -d \
  --name pihole \
  --restart unless-stopped \
  -p 53:53/tcp \
  -p 53:53/udp \
  -p <WEBUI_PORT>:80 \
  -e TZ=Europe/Rome \
  -e WEBPASSWORD=<YOUR_PASSWORD> \
  -v /volume1/docker/pihole/etc-pihole:/etc/pihole \
  -v /volume1/docker/pihole/etc-dnsmasq.d:/etc/dnsmasq.d \
  pihole/pihole:latest
```

> ⚠️ Port 53 (DNS) must be free on the host. If another service is using it, stop it first.

---

## Step 2 — Access the Web UI

Open Pihole admin panel at:
```
http://<NAS_IP>:<WEBUI_PORT>/admin
```

Login with the password set in `WEBPASSWORD`.

---

## Step 3 — Set Pihole as DNS on your Router

To make Pihole work for all devices automatically:

1. Log into your router admin panel (usually `192.168.0.1` or `192.168.1.1`)
2. Find **DNS settings** (usually under LAN or DHCP settings)
3. Set **Primary DNS** to your NAS IP: `<NAS_IP>`
4. Save and restart the router

All devices will now use Pihole for DNS resolution automatically.

> Alternatively, you can set Pihole as DNS manually on individual devices under network settings.

---

## Step 4 — Add Blocklists

Pihole comes with a default blocklist. You can add more:

1. Go to **Admin → Adlists**
2. Add community blocklists, for example:
   - `https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts` — consolidated hosts list
   - `https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/pro.txt` — Hagezi Pro
3. Go to **Tools → Update Gravity** to apply the new lists

---

## Step 5 — Local DNS (optional)

Pihole can resolve custom local hostnames — useful to access your services by name instead of IP:

1. Go to **Local DNS → DNS Records**
2. Add entries like:
   - `nas.home` → `<NAS_IP>`
   - `grafana.home` → `<NAS_IP>`
   - `jellyfin.home` → `<MINIPC_IP>`

Now you can access services by name from any device on your network.

---

## Notes

- If Pihole goes down, all DNS resolution on your network stops — keep it running with `--restart unless-stopped`
- Consider setting a secondary DNS (e.g. `1.1.1.1`) on your router as fallback
- Pihole logs all DNS queries — useful for debugging and monitoring network activity
- The web UI shows real-time stats: queries blocked, top blocked domains, top clients
