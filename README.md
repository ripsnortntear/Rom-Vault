# Nintendo Vault (`retro-gaming-interface`)

Full-stack Next.js retro gaming interface and in-browser NES emulator designed to run behind Nginx at `https://www.oldsmarchaos.com/roms` on port `39254`.

---

## Directory Layout on the Production Server

Keep Nintendo ROMs and artwork inside `/var/www/html/roms/nintendo/` (or set `ROMS_DIR` and `ARTWORK_DIR` environment variables in `systemd`):

```text
/var/www/html/roms/
├── nintendo/
│   ├── artwork/
│   │   ├── artwork_3d/
│   │   ├── artwork_front/
│   │   ├── logo/
│   │   ├── medium_front/
│   │   ├── screenshot/
│   │   ├── screentitle/
│   │   ├── story/
│   │   └── video/
│   └── roms/
│       └── *.zip (721 NES ROM archives)
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

1. **Place your Nintendo `roms/` & `artwork/` folders in `/var/www/html/roms/nintendo/`**:
   ```bash
   mkdir -p /var/www/html/roms/nintendo
   ```
   *(Place `roms` and `artwork` inside `/var/www/html/roms/nintendo/` so `/var/www/html/roms/nintendo/roms` and `/var/www/html/roms/nintendo/artwork` exist.)*

2. **Run the automated installer script** (installs dependencies, builds Next.js, and registers/starts the `retro-gaming` systemd service on port `39254`):
   ```bash
   cd /var/www/html/roms
   chmod +x deploy/install-ubuntu.sh
   ./deploy/install-ubuntu.sh
   ```

3. **Add the Nginx reverse proxy block** to your `oldsmarchaos.com` site config:
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
   }
   ```
   Then reload Nginx:
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```
