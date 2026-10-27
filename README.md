# ROM Vault (`retro-gaming-interface`)

High-performance retro gaming preservation portal and in-browser multi-console emulation platform built with Next.js 16 (App Router), React 19, and TypeScript. Designed to run behind an Nginx/Apache reverse proxy at `https://your-domain.com/roms` on port `39254`.

---

## Directory Layout on the Production Server

Keep ROMs and multi-layer artwork inside `/mnt/storage/roms/` (or configure paths via environment variables):

```text
/mnt/storage/roms/
├── psx/
│   ├── artwork/
│   │   ├── artwork_3d/
│   │   ├── artwork_front/
│   │   ├── logo/
│   │   ├── screenshot/
│   │   ├── story/
│   │   └── video/
│   └── roms/
│       └── *.chd (PlayStation disc archives)
├── nintendo/
│   ├── artwork/
│   └── roms/
├── deploy/
│   ├── install-ubuntu.sh
│   ├── nginx-roms.conf
│   └── retro-gaming.service
├── src/
├── next.config.ts
└── package.json
```

---

## Quick Production Setup on Ubuntu

1. **Configure Environment Variables**:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your MariaDB credentials, SMTP settings, and session secret
   nano .env.local
   ```

2. **Run the automated installer script** (installs dependencies, builds Next.js, and registers/starts the `retro-gaming` systemd service on port `39254`):
   ```bash
   chmod +x deploy/install-ubuntu.sh
   ./deploy/install-ubuntu.sh
   ```

3. **Add the Nginx reverse proxy block** to your site configuration (e.g., `/etc/nginx/sites-available/your-domain.com`):
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
       client_max_body_size 0;
   }
   ```
   Then reload Nginx:
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```
