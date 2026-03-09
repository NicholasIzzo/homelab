# 🌐 DNS Explained — From Basics to Pihole and Beyond

Everything you need to know about DNS, how Pihole works, and advanced concepts like DNS-over-HTTPS and split DNS.

---

## What is DNS?

DNS (Domain Name System) is the internet's phone book. It translates human-readable names into IP addresses.

```
You type:     google.com
DNS resolves: 142.250.180.46
Browser connects to: 142.250.180.46
```

Without DNS, you'd need to remember IP addresses for every website.

---

## How DNS Resolution Works

```
Your device
    │
    │ "What is the IP of google.com?"
    ▼
DNS Resolver (usually your router or ISP)
    │
    │ Doesn't know → asks Root DNS servers
    ▼
Root DNS server
    │ "I don't know, but .com is handled by these servers"
    ▼
TLD (Top Level Domain) server for .com
    │ "I don't know, but google.com is handled by Google's DNS"
    ▼
Google's authoritative DNS server
    │ "google.com = 142.250.180.46"
    ▼
Answer returned to your device
    │
Browser connects to 142.250.180.46
```

This whole process takes milliseconds and results are **cached** so it doesn't repeat every time.

---

## DNS in Your Home Network

By default, your devices use your router's DNS, which uses your ISP's DNS servers.

```
Device → Router (192.168.0.1) → ISP DNS → Internet
```

**Problems with this:**
- ISP can see every domain you visit
- No ad blocking
- Slow ISP DNS servers
- No custom local hostnames

---

## Pihole — DNS Sinkhole

Pihole replaces your router's DNS. Instead of forwarding everything to the ISP, it:
1. Checks if the domain is in a blocklist
2. If yes → returns `0.0.0.0` (blocked)
3. If no → forwards to upstream DNS (Cloudflare, Google, etc.)

```
Device → Pihole (192.168.0.36)
              │
              ├── ads.tracking.com → BLOCKED (0.0.0.0)
              │
              └── google.com → Upstream DNS → 142.250.180.46
```

**Result:** Ads and trackers are blocked for every device on your network, without installing anything on those devices.

### How Pihole blocks ads
Pihole uses **blocklists** — huge lists of known ad and tracker domains. When a device asks for one of these domains, Pihole returns a fake "not found" response instead of the real IP.

```
Device: "What is the IP of doubleclick.net?"
Pihole: "0.0.0.0" (blocked — ad network)
Browser: can't connect → ad doesn't load
```

---

## DNS-over-HTTPS (DoH)

Standard DNS queries are sent in **plain text** — anyone between you and the DNS server can see what domains you're looking up (your ISP, network admin, etc.).

DNS-over-HTTPS encrypts DNS queries inside HTTPS traffic.

```
Standard DNS:  device → DNS server (unencrypted, port 53)
DNS-over-HTTPS: device → DNS server (encrypted, port 443)
```

### Enable DoH in Pihole
Configure Pihole to use a DoH-capable upstream resolver:
- Cloudflare: `https://1.1.1.1/dns-query`
- NextDNS: `https://dns.nextdns.io/`
- Google: `https://dns.google/dns-query`

Or use **cloudflared** as a DoH proxy alongside Pihole.

---

## Split DNS

Split DNS means having **different DNS answers depending on where you're asking from**.

### Use case in homelab:
You want `nas.home` to resolve to:
- `192.168.0.36` when you're at home (local network)
- `100.x.x.x` (Tailscale IP) when you're remote

### How to set up local DNS records in Pihole:
1. Go to Pihole admin → **Local DNS → DNS Records**
2. Add your entries:

| Domain | IP |
|---|---|
| `nas.home` | `<NAS_IP>` |
| `jellyfin.home` | `<MINIPC_IP>` |
| `grafana.home` | `<NAS_IP>` |

Now from any device on your network, you can access services by name instead of IP.

---

## Common DNS Record Types

| Type | Purpose | Example |
|---|---|---|
| **A** | Maps domain to IPv4 address | `nas.home → 192.168.x.x` |
| **AAAA** | Maps domain to IPv6 address | `nas.home → ::1` |
| **CNAME** | Alias pointing to another domain | `www → nas.home` |
| **MX** | Mail server for a domain | Email routing |
| **TXT** | Text records | Domain verification, SPF |
| **PTR** | Reverse DNS (IP → domain) | `192.168.x.x → nas.home` |

---

## DNS TTL (Time to Live)

Every DNS record has a TTL — how long (in seconds) the result should be cached.

```
google.com TTL=300 → cached for 5 minutes
```

- **High TTL** (3600+): faster resolution, but changes take longer to propagate
- **Low TTL** (60-300): changes propagate quickly, but more DNS queries

---

## Useful DNS Tools

```bash
# Look up a domain
nslookup google.com

# Detailed DNS lookup
dig google.com

# Check which DNS server you're using
nslookup google.com 1.1.1.1

# Reverse lookup (IP to domain)
nslookup 8.8.8.8

# Check if Pihole is resolving correctly
nslookup ads.google.com <PIHOLE_IP>
# Should return 0.0.0.0 if blocked
```

---

## Pihole Statistics

Pihole logs every DNS query and shows you:
- How many queries were blocked (typically 10-30% of all traffic)
- Which domains are most queried
- Which devices generate the most traffic
- Top blocked domains

This gives you a clear picture of how much tracking and advertising is happening on your network.

---

## Summary

| Concept | What it does |
|---|---|
| DNS | Translates domain names to IPs |
| Pihole | Blocks ads/trackers at DNS level for entire network |
| DNS-over-HTTPS | Encrypts DNS queries to prevent snooping |
| Split DNS | Different DNS answers for local vs remote |
| Local DNS records | Custom hostnames for your local services |

---

> 💡 Setting up Pihole is one of the highest-impact things you can do for your home network — it takes 10 minutes and immediately benefits every device without any configuration on those devices.
