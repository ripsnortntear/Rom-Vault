# ROM Vault (`retro-gaming-interface`)

High-performance retro gaming preservation portal and in-browser multi-console emulation platform built with **Next.js 16 (App Router)**, **React 19**, **TypeScript**, and **Tailwind CSS**. Designed for high-throughput streaming and responsive in-browser emulation behind an Nginx or Apache reverse proxy at `/roms` on port `39254`.

---

> [!IMPORTANT]
> **Notice on Generalized URLs & Configuration Placeholders**:
> All domain names (`https://your-domain.example.com`, `https://roms.example.com`), hostnames (`127.0.0.1`), IP addresses, email addresses (`admin@example.com`, `support@example.com`), credentials (`your_database_password_here`), and storage paths in this documentation and example configuration files are generalized templates. Replace them with your actual deployment targets and production secrets.

---

## 🎮 Key Features

- **Multi-Console In-Browser Emulation**:
  - **EmulatorJS**: WebAssembly cores for Nintendo NES, SNES, N64, Game Boy, Game Boy Color, Game Boy Advance, Sega Master System, Sega Genesis, and Sony PlayStation 1 (`pcsx_rearmed`).
  - **TabStationToo**: High-performance PCSX2 WebAssembly and WebGL 2.0 port for PlayStation 2 emulation.
- **Cloud-Synchronized Virtual Memory Cards**:
  - Full binary support for PS1 (`.mcr`, 128 KB), PS2 (`.ps2`, 8 MB + ECC), and cartridge systems (`.srm`).
  - Up to 5 user-customizable memory card slots per platform with background auto-sync.
  - Seamless guest fallback binaries for unauthenticated sessions.
- **HTTP 206 Partial Content Streaming**:
  - Optimized byte-range streaming for disc archives (`.chd`, `.iso`, `.bin`) and MP4 video preview loops directly from the storage pool.
- **Rich Media & Metadata Enrichment**:
  - Multi-layer artwork displays (2D front box art, 3D boxes, cartridge media, transparent title logos, screenshots, and 60 FPS video loops).
  - Automated IGDB / Twitch OAuth metadata caching.
- **Community & Social Features**:
  - Global game high-score leaderboards with screenshot/video proof verification.
  - User reviews, star ratings, and community comment threads.
- **Enterprise-Grade Security Hardening**:
  - Next.js 16 root `proxy.ts` request filtering and authentication gate.
  - Cryptographically signed HMAC-SHA256 session tokens with stateful MariaDB revocation enforcement (`auth_tokens`).
  - Anti-spoofing client IP resolution and brute-force rate limiting.
  - Atomic rescan mutex lock preventing disk I/O DoS.
  - Strict CORS origin whitelisting and preflight handling.

---

## 📁 Repository & Storage Directory Structure

```text
/var/www/html/roms/                 # Application root directory
├── deploy/
│   ├── install-ubuntu.sh           # Automated Ubuntu systemd deployment script
│   ├── nginx-roms.conf             # Nginx reverse proxy configuration template
│   └── retro-gaming.service        # Systemd unit file (port 39254)
├── docs/                           # Extended technical documentation & Wiki
│   ├── ARCHITECTURE.md             # System architecture & emulation pipelines
│   ├── MEMORY_CARDS.md             # Virtual memory card formats & sync APIs
│   ├── SECURITY.md                 # Security controls & vulnerability audit notes
│   └── SETUP.md                    # In-depth production installation guide
├── migrations/
│   ├── 001_init_auth.sql           # Users, sessions, and community schema
│   └── 002_user_memory_cards.sql   # Virtual memory cards multi-slot schema
├── public/                         # Static assets and WebAssembly emulator cores
├── src/
│   ├── app/                        # Next.js App Router (Pages, APIs, Server Actions)
│   ├── components/                 # React 19 Client & Server Components
│   ├── lib/                        # Server-only utilities (DB pool, auth, scanner)
│   └── proxy.ts                    # Next.js 16 root proxy (auth & header hygiene)
├── audit-scan.sh                   # Static security scanner
└── sync-repo.sh                    # Automated build verification & sync script
```

### ROM Storage Pool Layout (e.g. `/path/to/roms/`)

```text
/path/to/roms/
├── psx/
│   ├── artwork/
│   │   ├── artwork_3d/             # 3D box renders (.png, .webp)
│   │   ├── artwork_front/          # 2D front covers (.jpg, .png)
│   │   ├── logo/                   # Transparent title logos (.png)
│   │   ├── screenshot/             # High-res screenshots (.jpg, .png)
│   │   └── video/                  # 30-second gameplay video previews (.mp4)
│   └── roms/
│       └── *.chd                   # PlayStation CHD compressed disc images
├── ps2/
│   ├── artwork/
│   └── roms/
│       └── *.chd, *.iso            # PlayStation 2 disc archives
├── nintendo/
│   ├── nes/
│   ├── snes/
│   ├── gba/
│   └── n64/
└── saves/                          # Global fallback saves (*.srm)
```

---

## 🚀 Quick Setup & Deployment

For a detailed step-by-step walkthrough, see [`docs/SETUP.md`](docs/SETUP.md).

### 1. Configure Environment Variables

```bash
cp .env.example .env.local
chmod 600 .env.local
nano .env.local
```

Ensure you configure:
- `DB_USER`, `DB_PASSWORD`, `DB_NAME` (MariaDB credentials)
- `SESSION_SECRET` (Secure random string, minimum 32 characters)
- `STORAGE_ROOT` (Absolute path to your ROM storage pool)
- `NEXT_PUBLIC_APP_URL` (`https://your-domain.example.com/roms`)

### 2. Run Database Migrations

```bash
mysql -u rom_vault_user -p rom_vault < migrations/001_init_auth.sql
mysql -u rom_vault_user -p rom_vault < migrations/002_user_memory_cards.sql
```

### 3. Automated Ubuntu Systemd Setup

```bash
chmod +x deploy/install-ubuntu.sh
./deploy/install-ubuntu.sh
```

This installs dependencies via `npm ci`, builds the Next.js bundle, and starts `retro-gaming.service` on port `39254`.

### 4. Configure Nginx Reverse Proxy

Add the location block from `deploy/nginx-roms.conf` inside your server block (e.g., `/etc/nginx/sites-available/your-domain.example.com`):

```nginx
location ^~ /roms {
    proxy_pass http://127.0.0.1:39254;
    proxy_http_version 1.1;

    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_buffering off;
    proxy_read_timeout 300s;
    proxy_cache_bypass $http_upgrade;
    client_max_body_size 50M;
}
```

Reload Nginx:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 🧪 Testing & Verification

Run the hermetic test suite and static security scanner:

```bash
# Run Vitest unit & regression tests (hermetic, zero DB dependency)
npm test

# Run TypeScript compilation check
npx tsc --noEmit

# Run automated static security vulnerability scanner
./audit-scan.sh

# Test Next.js production build
npm run build
```

---

## 📚 Technical Documentation & Wiki

Explore the detailed technical documentation:
- 📖 [**Setup & Installation Guide**](docs/SETUP.md): Step-by-step MariaDB, systemd, and Nginx setup.
- 🏛️ [**Architecture & Emulation Design**](docs/ARCHITECTURE.md): Deep dive into WebAssembly emulation, Next.js 16 proxying, and streaming.
- 🛡️ [**Security & Hardening**](docs/SECURITY.md): Threat model, session revocation, and input sanitization guidelines.
- 💾 [**Memory Cards & Cloud Saves**](docs/MEMORY_CARDS.md): Memory card binary formats (`.mcr`, `.ps2`, `.srm`) and cloud sync protocols.

---

## 📄 License

This software is released under the [MIT License](LICENSE).
