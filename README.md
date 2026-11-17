<div align="center">

# 🕹️ ROM Vault

**High-performance retro gaming preservation portal, 1G1R archive manager, and in-browser WebAssembly emulation suite.**

[![Release](https://img.shields.io/badge/release-v0.2.1-00f0ff?style=for-the-badge)](https://github.com/ripsnortntear/Rom-Vault/releases/tag/v0.2.1)
[![Next.js](https://img.shields.io/badge/Next.js-16.4-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-20232a?style=for-the-badge&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![MariaDB](https://img.shields.io/badge/MariaDB-Pool-003545?style=for-the-badge&logo=mariadb)](https://mariadb.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald?style=for-the-badge)](LICENSE)

[Wiki](https://github.com/ripsnortntear/Rom-Vault/wiki) · [Changelog](CHANGELOG.md) · [Setup Guide](docs/SETUP.md) · [Architecture](docs/ARCHITECTURE.md) · [Security](docs/SECURITY.md)

</div>

---

> [!IMPORTANT]
> **Generalized Configuration Templates**:
> All domain names (`https://your-domain.example.com`), hostnames (`127.0.0.1`), credentials, and storage paths (`/path/to/roms/`) in this repository are generalized templates. Configure your own production values in `.env.local`.

---

## ✨ Highlights

| Capability | Details |
| :--- | :--- |
| **18 Emulated Platforms** | In-browser WebGL/WASM/WebAudio emulation via **EmulatorJS** (Libretro), **TabStationToo** (PCSX2 WASM for PS2), **Gecko** (Dolphin WASM for GameCube), and **Gambatte-GameVault** (GB/GBC Link Cable). |
| **2P WebRTC Netplay Rooms** | Couch-play screen/input streaming across all **18 systems on Desktop** (including TabStationToo PS2) and **12 curated systems on Mobile**, plus dual-instance **GB/GBC/GBA Virtual Link Cable** over WebRTC DataChannels. |
| **Cloud Memory Cards & Universal Saves** | Up to **5 cloud-synced slots per platform** for PS1 (`.mcr`, 128 KB) and PS2 (`.ps2`, 8 MB + ECC), plus automatic MariaDB-backed `.srm` / `.state` sync (`navigator.sendBeacon` on unload). |
| **Community Asset Contribution Center (`/contribute`)** | Multi-asset batch staging per game card with magic-byte verification, image URL/file intake, YouTube links, and **direct video uploads up to 150 MB** (auto-transcoded to MP4 via `ffmpeg`). |
| **Instant Startup & HTTP 206 Streaming** | `src/instrumentation.ts` pre-warms the ROM catalog on boot (`inFlightScan` deduplication), while disc images (`.chd`, `.iso`, `.rvz`) and preview MP4s stream via zero-copy HTTP 206 byte-ranges. |
| **1G1R Curation & IGDB/ArcadeDB Enrichment** | Automated 1G1R parent/clone cleanup (`scripts/cleanup-1g1r.mjs`), MAME `gamelist.xml` parsing, multi-layer artwork, and strict sequel/prequel IGDB matching. |
| **Security & Auth Hardening** | Next.js 16 root `proxy.ts` HMAC-SHA256 + MariaDB stateful session validation, brute-force rate limiting, path-traversal whitelists, and Xbox USB haptic power-down safeguards. |

---

## 🎮 Supported Platforms (18 Systems)

| Family | Systems | Engine / Core |
| :--- | :--- | :--- |
| **Nintendo** | `NES`, `SNES`, `N64`, `GB`, `GBC`, `SGB`, `GBA`, `GameCube` | EmulatorJS (`fceumm`, `snes9x`, `mupen64plus_next`, `gambatte`, `mgba`) + **Gecko** (GameCube) |
| **Sony** | `PS1`, `PS2` | EmulatorJS (`pcsx_rearmed`) + **TabStationToo** (PCSX2 WASM) |
| **Sega** | `Master System`, `Game Gear`, `Genesis / Mega Drive`, `Sega 32X`, `Saturn`, `Dreamcast` | EmulatorJS (`smsplus`, `genesis_plus_gx`, `picodrive`, `yabause`, `flycast`) |
| **Arcade** | `MAME`, `SNK Neo Geo` | EmulatorJS (`mame2003_plus`, `fbneo`) |

---

## 📁 Project & Storage Structure

```text
roms/
├── deploy/                         # Ubuntu systemd unit & Nginx reverse proxy templates
├── docs/                           # Architecture, Setup, Memory Cards, and Security docs
├── migrations/                     # MariaDB SQL migrations (auth, saves, memory cards, CACC)
├── public/                         # Static assets, EmulatorJS cores, TabStationToo, Gecko
├── scripts/                        # 1G1R audit/cleanup, IGDB/ArcadeDB metadata, scan automation
├── src/
│   ├── app/                        # Next.js 16 App Router pages, API routes, & Server Actions
│   ├── components/                 # Client UI (Library, Emulator, 2P Rooms, CACC, Admin)
│   ├── lib/                        # Server-only DB pool, auth, scanner, IGDB, contributions
│   ├── instrumentation.ts          # Startup ROM library cache pre-warming hook
│   └── proxy.ts                    # Next.js 16 root proxy (auth gate & header hygiene)
└── vendor/                         # Tracked upstream submodules (TabStationToo, Gambatte-GameVault)
```

<details>
<summary><strong>Storage Pool Layout (<code>STORAGE_ROOT=/path/to/roms</code>)</strong></summary>

```text
/path/to/roms/
├── <system>/
│   ├── artwork/
│   │   ├── artwork_front/          # 2D front box art (.jpg, .png)
│   │   ├── artwork_3d/             # 3D box renders (.png, .webp)
│   │   ├── logo/                   # Transparent title logos / marquees (.png)
│   │   ├── medium_front/           # Cartridge / disc art (.png)
│   │   ├── screenshot/             # In-game screenshots (.jpg, .png)
│   │   ├── screentitle/            # Title screens (.jpg, .png)
│   │   ├── story/                  # Game overviews (.txt)
│   │   └── video/                  # Gameplay preview loops (.mp4)
│   └── roms/                       # Curated 1G1R ROMs, CHDs, ISOs, & BIOS archives
└── saves/                          # Per-user virtual memory cards & cloud saves
```

</details>

---

## 🚀 Quick Start & Deployment

For the complete production walkthrough, see [`docs/SETUP.md`](docs/SETUP.md) or the [Wiki](https://github.com/ripsnortntear/Rom-Vault/wiki).

### 1. Environment & Database

```bash
cp .env.example .env.local
chmod 600 .env.local
# Set DB_USER, DB_PASSWORD, DB_NAME, SESSION_SECRET (32+ chars), STORAGE_ROOT, NEXT_PUBLIC_APP_URL

mysql -u rom_vault_user -p rom_vault < migrations/001_init_auth.sql
mysql -u rom_vault_user -p rom_vault < migrations/002_user_memory_cards.sql
```

### 2. Install, Build & Run

```bash
npm ci
npm run build
chmod +x deploy/install-ubuntu.sh && ./deploy/install-ubuntu.sh
```

### 3. Nginx Reverse Proxy (COOP/COEP + CACC Exemption)

Emulator routes require `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` for WASM `SharedArrayBuffer`, while `/roms/contribute` and `/roms/admin` use `location ^~` blocks without `COEP` so third-party YouTube preview embeds connect cleanly:

```nginx
location ^~ /roms/contribute {
    proxy_pass http://127.0.0.1:39254;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_buffering off;
    client_max_body_size 0;
}

location ^~ /roms {
    proxy_pass http://127.0.0.1:39254;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "credentialless" always;
    proxy_buffering off;
    client_max_body_size 0;
}
```

---

## 🧪 Testing & Verification

```bash
# Run all 24 Vitest suites (188 hermetic tests)
npm test

# Type-check & production build
npx tsc --noEmit && npm run build

# Static security audit
./audit-scan.sh
```

---

## 📚 Documentation

- 📖 [**Setup & Installation Guide**](docs/SETUP.md) — MariaDB, systemd, and Nginx setup
- 🏛️ [**Architecture & Pipelines**](docs/ARCHITECTURE.md) — Next.js 16 proxying, streaming, & WASM emulation
- 🛡️ [**Security & Hardening**](docs/SECURITY.md) — Threat model, session revocation, & input sanitization
- 💾 [**Memory Cards & Cloud Saves**](docs/MEMORY_CARDS.md) — `.mcr`, `.ps2`, and `.srm` specifications
- 🌐 [**GitHub Wiki**](https://github.com/ripsnortntear/Rom-Vault/wiki) — Extended operational guides

---

## 📄 License

Released under the [MIT License](LICENSE).
