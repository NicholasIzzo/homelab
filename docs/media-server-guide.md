# 🎬 Media Server & Transcoding — Beginner's Guide

Everything you need to know before setting up a media server at home — hardware requirements, transcoding explained, and what to watch out for.

---

## 📺 What is a Media Server?

A media server is software that stores, organizes and streams your movies, TV shows and music to any device on your network (or remotely). Think of it as your personal Netflix, running on your own hardware.

**Popular options:**
| Software | Best for | Notes |
|---|---|---|
| **Jellyfin** | Everyone — free and open source | No subscription, full control |
| **Plex** | Ease of use | Free tier + paid Plex Pass |
| **Emby** | Similar to Plex | Free tier + paid Premiere |

> This guide focuses on **Jellyfin** — it's completely free, open source and has no limitations.

---

## 🔄 What is Transcoding?

This is the most important concept to understand before choosing your hardware.

When you stream a video, your device needs to be able to **play** that video. If the format, resolution or codec is not supported by your device, the media server needs to **convert** it in real time — this is called **transcoding**.

```
Video file (H.265, 4K)
        │
        ▼
   Can your device play it natively?
        │
   YES ─┤─ Direct Play → server just sends the file, zero CPU usage
        │
   NO ──┤─ Transcoding → server converts in real time, HIGH CPU usage
```

### Direct Play vs Transcoding

| | Direct Play | Transcoding |
|---|---|---|
| CPU usage | ~0% | Very high |
| Quality | Perfect | Can degrade |
| Hardware needed | Minimal | Powerful CPU or GPU |
| Ideal scenario | Always aim for this | Fallback when needed |

**The goal is always Direct Play** — choose formats and devices that support your files natively.

---

## 🎞️ Codecs — What They Are and Why They Matter

A codec is the format used to compress and store video. Different devices support different codecs.

### Common video codecs:

| Codec | Also known as | Quality | File size | Hardware support |
|---|---|---|---|---|
| **H.264** | AVC | Good | Medium | ✅ Universal — every device |
| **H.265** | HEVC | Better | ~50% smaller than H.264 | ⚠️ Not all devices |
| **AV1** | AV1 | Best | ~30% smaller than H.265 | ⚠️ Only newer devices |
| **VP9** | VP9 | Good | Similar to H.265 | ⚠️ Limited |

### Recommendation for beginners:
- Store files in **H.264** for maximum compatibility and always Direct Play
- Use **H.265** if storage space is a concern — but be aware some older devices will transcode

---

## 📦 Containers vs Codecs

People often confuse the **container** (file format) with the **codec** (compression):

- **Container** = the box that holds video, audio and subtitles → `.mkv`, `.mp4`, `.avi`
- **Codec** = how the video is compressed → H.264, H.265, AV1

Example: an `.mkv` file can contain H.264, H.265 or AV1 video — the container doesn't tell you the codec.

**Best combination for compatibility:** `MP4 + H.264 + AAC audio`

**Best combination for quality/size:** `MKV + H.265 + AAC audio`

---

## 💻 Hardware Requirements

### CPU Transcoding
Every CPU can transcode, but it's resource-intensive. A rough guide:

| Transcoding load | Minimum CPU |
|---|---|
| 1x 1080p stream | Intel Core i3 / Ryzen 3 |
| 1x 4K stream | Intel Core i7 / Ryzen 7 |
| Multiple streams | Very powerful CPU or use GPU |

> Transcoding 4K on a weak CPU will stutter, drop frames or fail entirely.

### Hardware Transcoding (GPU/iGPU) — Recommended
Modern CPUs have an integrated GPU (iGPU) that can transcode video using dedicated hardware, offloading the CPU completely.

| Platform | Technology | Notes |
|---|---|---|
| Intel (8th gen+) | Intel Quick Sync | Excellent — best for Jellyfin |
| AMD | AMF | Good support |
| NVIDIA | NVENC | Great, requires Plex Pass or Jellyfin |
| ARM (NAS, Pi) | Varies | Limited — check your device |

**Enable hardware transcoding in Jellyfin:**
Settings → Dashboard → Playback → Hardware acceleration → Select your platform

### My Setup
- **NAS (Ugreen DH4300 Plus / ARM64)** — limited transcoding capability, used mainly for storage
- **Mini PC (HP ProDesk G400)** — runs Jellyfin with hardware transcoding via Intel Quick Sync
- Result: the Mini PC handles all transcoding, NAS just serves the files

---

## 🗂️ Organizing Your Media

Jellyfin (and the Arr stack) expect a specific folder structure to correctly identify and match metadata:

### Movies:
```
/media/movies/
├── The Dark Knight (2008)/
│   └── The Dark Knight (2008).mkv
├── Inception (2010)/
│   └── Inception (2010).mkv
```

### TV Series:
```
/media/tv/
├── Breaking Bad/
│   ├── Season 01/
│   │   ├── Breaking Bad S01E01.mkv
│   │   └── Breaking Bad S01E02.mkv
│   └── Season 02/
│       └── Breaking Bad S02E01.mkv
```

> Always include the **year** in movie folder names — helps with metadata matching.

---

## 🔊 Audio and Subtitles

### Audio codecs:
| Codec | Notes |
|---|---|
| **AAC** | Universal compatibility, good quality |
| **AC3 / Dolby Digital** | Wide support, common in movies |
| **DTS** | High quality, not supported on all devices — may need transcoding |
| **TrueHD / Atmos** | Best quality, requires powerful hardware to transcode |

### Subtitles:
| Format | Notes |
|---|---|
| **SRT** | Text-based, always Direct Play, tiny file size |
| **ASS/SSA** | Styled subtitles, usually Direct Play |
| **PGS** | Image-based (Blu-ray), requires transcoding on some devices |

> **SRT subtitles** are the most compatible — prefer them over PGS when possible.

---

## ⚠️ Common Mistakes to Avoid

- **Buying a NAS for transcoding** — most NAS devices (especially ARM-based) have weak CPUs. Use a separate Mini PC or PC for Jellyfin if you need transcoding.
- **Storing everything in 4K H.265** — great quality but requires hardware transcoding on most clients. Fine if all your devices support H.265 natively.
- **Not enabling hardware transcoding** — leaving software transcoding on destroys CPU performance. Always enable hardware acceleration.
- **Wrong folder structure** — Jellyfin won't match metadata correctly if folders are named wrong.
- **Ignoring audio codec compatibility** — DTS and TrueHD audio often cause transcoding even when video is Direct Play.

---

## 📱 Recommended Clients

| Platform | App | Notes |
|---|---|---|
| Android / iOS | Jellyfin mobile app | Free, good Direct Play support |
| Smart TV | Jellyfin for Android TV | Free |
| Apple TV | Infuse | Best iOS/tvOS client, paid |
| Web browser | Jellyfin web UI | Works everywhere, limited codec support |
| Windows / Mac | Jellyfin Media Player | Desktop client, excellent codec support |

> **Infuse** (Apple TV/iOS) is the best client for Direct Play — supports almost every codec natively, minimizing transcoding.

---

## 🚀 Quick Start Checklist

- [ ] Choose your hardware (dedicated Mini PC recommended for transcoding)
- [ ] Install Jellyfin via Docker
- [ ] Organize media in the correct folder structure
- [ ] Enable hardware transcoding in Jellyfin settings
- [ ] Install Jellyfin client on your devices
- [ ] Test playback — check if streams are Direct Play or Transcoding in the dashboard
- [ ] Set up Radarr + Sonarr + Prowlarr for automated media management

---

> 💡 The best media server setup is one where everything Direct Plays. Invest time in compatible formats and hardware transcoding — you'll never have buffering issues again.
