import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { query, execute } from "@/lib/db";
import { generateUUID } from "@/lib/auth/crypto";

const execAsync = promisify(exec);

export interface UserSeedbox {
  id: string;
  userId: string;
  username: string;
  port: number;
  status: "active" | "stopped" | "error";
  quotaGb: number;
  zfsDataset: string;
  containerName: string;
  vpnContainerName: string;
  createdAt: string;
  updatedAt: string;
}

const SEEDBOX_BASE_DIR = "/mnt/storage/oldsmarchaos.com/seedboxes";
const NGINX_MAP_FILE = "/etc/nginx/conf.d/seedbox_ports.map";
const START_PORT = 8201;
const END_PORT = 8250;

/**
 * Regenerate /etc/nginx/conf.d/seedbox_ports.map and reload Nginx
 */
export async function syncNginxSeedboxMap(): Promise<void> {
  const seedboxes = await query<{ username: string; port: number }>(
    "SELECT username, port FROM user_seedboxes WHERE status = 'active'"
  );

  let mapContent = "# Dynamic SSO Seedbox Routing Map - Generated Automatically\n";
  for (const box of seedboxes) {
    mapContent += `${box.username} ${box.port};\n`;
  }

  // Ensure cfw34683 default is always present
  if (!seedboxes.some((b) => b.username === "cfw34683")) {
    mapContent += `cfw34683 8090;\n`;
  }

  // Write temporary file and move atomically with sudo
  const tempPath = `/tmp/seedbox_ports_${Date.now()}.map`;
  await fs.writeFile(tempPath, mapContent, "utf8");
  await execAsync(`sudo mv ${tempPath} ${NGINX_MAP_FILE} && sudo chmod 644 ${NGINX_MAP_FILE}`);
  await execAsync("sudo nginx -s reload");
}

/**
 * Find next available port for a new seedbox
 */
async function getNextAvailablePort(): Promise<number> {
  const usedPorts = await query<{ port: number }>("SELECT port FROM user_seedboxes");
  const portSet = new Set(usedPorts.map((r) => r.port));
  portSet.add(8090); // default cfw34683 port

  for (let p = START_PORT; p <= END_PORT; p++) {
    if (!portSet.has(p)) {
      return p;
    }
  }
  throw new Error("No free ports available in the seedbox range (8201-8250).");
}

/**
 * Get seedbox details by user ID
 */
export async function getSeedboxByUserId(userId: string): Promise<UserSeedbox | null> {
  const rows = await query<any>(
    "SELECT * FROM user_seedboxes WHERE user_id = ? LIMIT 1",
    [userId]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    userId: r.user_id,
    username: r.username,
    port: r.port,
    status: r.status,
    quotaGb: r.quota_gb,
    zfsDataset: r.zfs_dataset,
    containerName: r.container_name,
    vpnContainerName: r.vpn_container_name,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

/**
 * Provision an isolated qBittorrent + Gluetun seedbox for an admin user
 */
export async function provisionSeedbox(
  userId: string,
  quotaGb = 100
): Promise<{ ok: boolean; port?: number; error?: string }> {
  try {
    // 1. Verify user exists and is an admin
    const userRows = await query<{ id: string; username: string; role: string }>(
      "SELECT id, username, role FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    const user = userRows[0];
    if (!user) {
      return { ok: false, error: "User not found." };
    }
    if (user.role !== "admin") {
      return { ok: false, error: "Seedboxes can only be provisioned for administrators." };
    }

    // 2. Check if already provisioned
    const existing = await getSeedboxByUserId(userId);
    if (existing) {
      return { ok: false, error: `Seedbox already provisioned on port ${existing.port}.` };
    }

    const cleanUsername = user.username.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase();
    const port = await getNextAvailablePort();
    const boxId = generateUUID();
    const userDir = path.join(SEEDBOX_BASE_DIR, cleanUsername);
    const downloadsDir = path.join(userDir, "downloads");
    const configDir = path.join(userDir, "config", "qBittorrent");
    const gluetunDir = path.join(userDir, "gluetun");
    const zfsDataset = `storage/oldsmarchaos.com/seedboxes/${cleanUsername}`;
    const vpnContainer = `gluetun-${cleanUsername}`;
    const qbtContainer = `qbittorrent-${cleanUsername}`;

    // 3. Create ZFS Dataset with Hard Quota under /mnt/storage/oldsmarchaos.com
    console.log(`[Seedbox] Creating ZFS dataset ${zfsDataset} with quota ${quotaGb}G...`);
    await execAsync(`sudo mkdir -p ${SEEDBOX_BASE_DIR}`);
    await execAsync(
      `sudo zfs create -p -o mountpoint=${downloadsDir} -o quota=${quotaGb}G ${zfsDataset}`
    );
    await execAsync(`sudo mkdir -p ${configDir} ${gluetunDir}`);
    await execAsync(`sudo chown -R 1000:1000 ${userDir}`);
    await execAsync(`sudo chmod -R 775 ${userDir}`);

    // 4. Pre-configure qBittorrent.conf for single sign-on bypass
    const qbtConf = `[LegalNotice]
Accepted=true

[Preferences]
AuthSubnetWhitelist=0.0.0.0/0, ::/0
AuthSubnetWhitelistEnabled=true
Downloads\\SavePath=/downloads/
Session\\DefaultSavePath=/downloads/
WebUI\\Address=0.0.0.0
WebUI\\Port=${port}
WebUI\\UseUPnP=false
`;
    await fs.writeFile(path.join(configDir, "qBittorrent.conf"), qbtConf, "utf8");
    await execAsync(`sudo chown -R 1000:1000 ${configDir}`);

    // 5. Generate Docker Compose File
    const composeContent = `---
services:
  gluetun:
    image: qmcgaw/gluetun:latest
    container_name: ${vpnContainer}
    cap_add:
      - NET_ADMIN
    devices:
      - /dev/net/tun:/dev/net/tun
    ports:
      - 127.0.0.1:${port}:${port}/tcp
    volumes:
      - ./gluetun:/gluetun
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=America/New_York
      - VPN_SERVICE_PROVIDER=private internet access
      - VPN_TYPE=openvpn
      - OPENVPN_USER=p5139352
      - OPENVPN_PASSWORD=aLEMv?HhnVku3PW2
      - SERVER_REGIONS=US Florida
      - HTTPPROXY=off
      - SHADOWSOCKS=off
      - FIREWALL_OUTBOUND_SUBNETS=192.168.1.0/24,172.20.0.0/16,192.168.0.0/24
      - UPDATER_PERIOD=24h
    security_opt:
      - no-new-privileges=true
    restart: unless-stopped

  qbittorrent:
    image: lscr.io/linuxserver/qbittorrent:latest
    container_name: ${qbtContainer}
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=America/New_York
      - WEBUI_PORT=${port}
      - UMASK=022
    volumes:
      - ./config:/config
      - ./downloads:/downloads
    network_mode: service:gluetun
    depends_on:
      gluetun:
        condition: service_healthy
    security_opt:
      - no-new-privileges=true
    restart: unless-stopped
`;
    await fs.writeFile(path.join(userDir, "docker-compose.yml"), composeContent, "utf8");

    // 6. Launch Docker Containers in background
    console.log(`[Seedbox] Launching container stack for ${cleanUsername}...`);
    await execAsync(`docker compose -f ${path.join(userDir, "docker-compose.yml")} up -d`);

    // 7. Store in Database
    await execute(
      `INSERT INTO user_seedboxes (id, user_id, username, port, status, quota_gb, zfs_dataset, container_name, vpn_container_name)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
      [boxId, user.id, user.username, port, quotaGb, zfsDataset, qbtContainer, vpnContainer]
    );

    // 8. Update Nginx Map and reload proxy
    await syncNginxSeedboxMap();

    return { ok: true, port };
  } catch (err: any) {
    console.error("[provisionSeedbox Error]:", err);
    return { ok: false, error: err.message || String(err) };
  }
}

/**
 * Deprovision a user's seedbox, tearing down containers and optionally wiping ZFS dataset
 */
export async function deprovisionSeedbox(
  userId: string,
  destroyData = false
): Promise<{ ok: boolean; error?: string }> {
  try {
    const box = await getSeedboxByUserId(userId);
    if (!box) {
      return { ok: false, error: "Seedbox not found." };
    }

    if (box.username === "cfw34683") {
      return { ok: false, error: "Cannot deprovision primary system administrator seedbox." };
    }

    const cleanUsername = box.username.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase();
    const userDir = path.join(SEEDBOX_BASE_DIR, cleanUsername);
    const composeFile = path.join(userDir, "docker-compose.yml");

    // 1. Stop and remove containers
    try {
      await execAsync(`docker compose -f ${composeFile} down`);
    } catch (composeErr) {
      console.warn("[deprovisionSeedbox] Docker compose down warning:", composeErr);
    }

    // 2. Destroy ZFS Dataset if requested
    if (destroyData && box.zfsDataset) {
      try {
        await execAsync(`sudo zfs destroy -r ${box.zfsDataset}`);
      } catch (zfsErr) {
        console.warn("[deprovisionSeedbox] ZFS destroy warning:", zfsErr);
      }
      try {
        await execAsync(`sudo rm -rf ${userDir}`);
      } catch (rmErr) {
        console.warn("[deprovisionSeedbox] Directory removal warning:", rmErr);
      }
    }

    // 3. Remove from database
    await execute("DELETE FROM user_seedboxes WHERE id = ?", [box.id]);

    // 4. Update Nginx Map and reload proxy
    await syncNginxSeedboxMap();

    return { ok: true };
  } catch (err: any) {
    console.error("[deprovisionSeedbox Error]:", err);
    return { ok: false, error: err.message || String(err) };
  }
}

/**
 * Restart a user's seedbox container stack
 */
export async function restartSeedbox(userId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const box = await getSeedboxByUserId(userId);
    if (!box) {
      return { ok: false, error: "Seedbox not found." };
    }

    if (box.username === "cfw34683") {
      await execAsync("docker compose -f /home/cfw34683/docker/vpntorrent/docker-compose.yml restart");
      return { ok: true };
    }

    const cleanUsername = box.username.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase();
    const composeFile = path.join(SEEDBOX_BASE_DIR, cleanUsername, "docker-compose.yml");
    await execAsync(`docker compose -f ${composeFile} restart`);

    return { ok: true };
  } catch (err: any) {
    console.error("[restartSeedbox Error]:", err);
    return { ok: false, error: err.message || String(err) };
  }
}
