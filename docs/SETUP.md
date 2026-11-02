# ROM Vault — Production Setup & Deployment Guide

> [!IMPORTANT]
> **Notice on Generalized Placeholders**:
> All domains (`https://your-domain.example.com`, `https://roms.example.com`), hostnames (`127.0.0.1`), IP addresses, email addresses (`admin@example.com`), database passwords (`your_database_password_here`), and secrets in this guide are generalized templates. Replace them with your organization's domain name, actual storage mount points, and production secrets.

---

## 1. System Requirements & Prerequisites

- **Operating System**: Linux (Ubuntu 22.04 / 24.04 LTS or Debian 12 recommended)
- **Node.js**: v20.x LTS or higher (Node 22 / Node 26 supported)
- **Database**: MariaDB 10.6+ or MySQL 8.0+
- **Reverse Proxy**: Nginx 1.18+ or Apache 2.4+
- **Storage**: Fast SSD or NVMe mount point for ROMs and multi-layer artwork (e.g., `/path/to/roms/`)

---

## 2. Database Provisioning & Schema Migrations

Log into MariaDB/MySQL as an administrator:

```bash
sudo mysql -u root -p
```

Create the dedicated database, user, and grant privileges:

```sql
CREATE DATABASE IF NOT EXISTS rom_vault CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'rom_vault_user'@'localhost' IDENTIFIED BY 'your_database_password_here';
GRANT ALL PRIVILEGES ON rom_vault.* TO 'rom_vault_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Run the schema migrations in sequence from the project root:

```bash
cd /path/to/rom-vault

# 1. Base authentication, tokens, user accounts, and community schema
mysql -u rom_vault_user -p rom_vault < migrations/001_init_auth.sql

# 2. Virtual memory card multi-slot management schema
mysql -u rom_vault_user -p rom_vault < migrations/002_user_memory_cards.sql
```

---

## 3. Storage & Directory Layout

Organize your game library under the configured storage root (default: `/path/to/roms`):

```text
/path/to/roms/
├── psx/
│   ├── artwork/
│   │   ├── artwork_3d/      # 3D box renders (.png, .webp)
│   │   ├── artwork_front/   # 2D front covers (.jpg, .png)
│   │   ├── logo/            # Transparent title logos (.png)
│   │   ├── screenshot/      # Gameplay screenshots (.jpg, .png)
│   │   └── video/           # 30-second gameplay video previews (.mp4)
│   └── roms/
│       └── *.chd            # PlayStation CHD disc images
├── ps2/
│   ├── artwork/
│   └── roms/
│       └── *.chd, *.iso     # PlayStation 2 disc images
├── nintendo/
│   ├── nes/
│   ├── snes/
│   ├── gba/
│   └── n64/
└── saves/                   # Global / fallback battery saves (*.srm)
```

Ensure the web application service user (`www-data` or your execution user) has read permissions for the ROMs/artwork directories and read/write permissions for `saves/`:

```bash
sudo chown -R www-data:www-data /path/to/roms/saves
sudo chmod -R 775 /path/to/roms/saves
```

---

## 4. Environment Configuration

Copy the example configuration to `.env.local`:

```bash
cp .env.example .env.local
chmod 600 .env.local
nano .env.local
```

Populate the required configuration variables:

```ini
NODE_ENV=production
PORT=39254

# Storage Paths
STORAGE_ROOT=/path/to/roms
SAVES_DIR=/path/to/roms/saves

# MariaDB Connection
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=rom_vault_user
DB_PASSWORD=your_database_password_here
DB_NAME=rom_vault

# Session & Security (Ensure SESSION_SECRET is at least 32 characters)
AUTH_SESSION_COOKIE_NAME=rom_vault_session
SESSION_SECRET=a_very_long_secure_random_hex_string_with_64_characters
SESSION_MAX_AGE_DAYS=14
NEXT_PUBLIC_APP_URL=https://your-domain.example.com/roms

# SMTP Mail Delivery (Optional: for password resets)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=support@example.com
SMTP_PASS=your_smtp_password
SMTP_FROM="ROM Vault <support@example.com>"

# Admin Registration Whitelist
ADMIN_USERNAMES=admin
ADMIN_EMAILS=admin@example.com
```

---

## 5. Build & Systemd Service Setup

Install dependencies and build the Next.js production bundle:

```bash
npm ci
npm run build
```

Register the application as a systemd service using `deploy/retro-gaming.service`:

```bash
sudo cp deploy/retro-gaming.service /etc/systemd/system/retro-gaming.service
sudo systemctl daemon-reload
sudo systemctl enable retro-gaming.service
sudo systemctl start retro-gaming.service
sudo systemctl status retro-gaming.service
```

---

## 6. Reverse Proxy Configuration (Nginx)

In your Nginx site configuration (`/etc/nginx/sites-available/your-domain.example.com`), include the `/roms` location block:

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

    # Media streaming & large ROM file transfers
    proxy_buffering off;
    proxy_read_timeout 300s;
    proxy_cache_bypass $http_upgrade;
    client_max_body_size 50M;
}
```

Verify and reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Your ROM Vault instance is now accessible at `https://your-domain.example.com/roms`.
