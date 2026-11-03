/**
 * Universal Cross-Device Save Synchronization & Database Authority Service
 * Authoritative bridge between client-side WebAssembly emulators and MariaDB.
 */

export interface CloudSaveResult {
  bytes: Uint8Array;
  updatedAt: string;
  checksum: string;
  fileSize?: number;
}

export const PS1_MEMORY_CARD_SIZE = 131072;

/**
 * Validates that a buffer is an authentic 128 KB (131,072-byte) PS1 Memory Card image
 * starting with the Sony "MC" (0x4D, 0x43) magic header.
 */
export function isValidPs1MemoryCard(
  buf: Uint8Array | ArrayBuffer | null | undefined
): boolean {
  if (!buf) return false;
  const uint8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (uint8.byteLength !== PS1_MEMORY_CARD_SIZE) return false;
  return uint8[0] === 0x4d && uint8[1] === 0x43;
}

/**
 * Checks whether a valid 128 KB PS1 Memory Card has all 15 directory frames
 * (frames 1..15 at offsets 128..1920) marked as unallocated (0xA0).
 * Returns false if the buffer is not a valid PS1 card or if any slot contains save data.
 */
export function isBlankPs1MemoryCard(
  buf: Uint8Array | ArrayBuffer | null | undefined
): boolean {
  if (!buf || !isValidPs1MemoryCard(buf)) return false;
  const uint8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  for (let frame = 1; frame <= 15; frame++) {
    if (uint8[frame * 128] !== 0xa0) {
      return false;
    }
  }
  return true;
}

/**
 * Computes a full-byte FNV-1a checksum + length fingerprint across every byte of a save buffer.
 */
export function computeSaveChecksum(buf: Uint8Array | ArrayBuffer): string {
  const uint8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let hash = 2166136261;
  for (let i = 0; i < uint8.length; i++) {
    hash ^= uint8[i];
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16) + "_" + uint8.byteLength;
}

/**
 * Filters a list of filenames from shared Emscripten /data/saves IDBFS so only
 * files matching the current game's candidate names are read or written, preventing
 * cross-game save contamination across systems.
 */
export function filterCandidateSaveFiles(
  existingFiles: string[],
  candidateNames: Iterable<string>
): string[] {
  const allowed = new Set<string>();
  for (const name of candidateNames) {
    if (name) allowed.add(name);
  }
  return existingFiles.filter((fn) => allowed.has(fn));
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const len = bytes.byteLength;
  const chunkSize = 16384;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(base64, "base64");
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function resolveSaveEndpoint(path: string): string {
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/roms")) {
    return path.startsWith("/roms") ? path : `/roms${path}`;
  }
  return path;
}

export const SaveSyncService = {
  /**
   * Authoritatively pulls save data from MariaDB database.
   */
  async fetchCloudSave(
    gameId: string,
    saveType: string = "savestate",
    slotIndex: number = 0
  ): Promise<CloudSaveResult | null> {
    try {
      const url = resolveSaveEndpoint(
        `/api/saves?gameId=${encodeURIComponent(gameId)}&saveType=${encodeURIComponent(
          saveType
        )}&slotIndex=${slotIndex}&_t=${Date.now()}`
      );
      const res = await fetch(url, {
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 404) return null;
        throw new Error(`Failed to fetch cloud save: ${res.statusText}`);
      }

      const data = await res.json();
      if (!data || !data.exists || !data.saveData) {
        return null;
      }

      const bytes = base64ToUint8Array(data.saveData);
      return {
        bytes,
        updatedAt: data.updatedAt,
        checksum: data.checksum,
        fileSize: data.fileSize || bytes.byteLength,
      };
    } catch (err) {
      console.error("[SaveSyncService] Error fetching cloud save:", err);
      return null;
    }
  },

  /**
   * Pushes latest save data directly to MariaDB database.
   */
  async uploadCloudSave(
    gameId: string,
    saveDataBytes: Uint8Array,
    saveType: string = "savestate",
    slotIndex: number = 0
  ): Promise<{ success: boolean; checksum?: string } | null> {
    try {
      if (!saveDataBytes || saveDataBytes.byteLength === 0) return null;

      const base64Data = uint8ArrayToBase64(saveDataBytes);
      const url = resolveSaveEndpoint("/api/saves");

      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId,
          saveType,
          slotIndex,
          saveData: base64Data,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to sync save to cloud: ${res.statusText}`);
      }

      const result = await res.json();
      return result;
    } catch (err) {
      console.error("[SaveSyncService] Error uploading save:", err);
      return null;
    }
  },

  /**
   * Injects authoritative cloud save into emulator virtual storage / file system.
   */
  async writeSaveToVirtualFileSystem(
    emulatorType: string,
    gameId: string,
    bytes: Uint8Array
  ): Promise<void> {
    if (typeof window === "undefined") return;

    try {
      if (emulatorType === "tabstationtoo" && (window as any).Module?.FS) {
        const FS = (window as any).Module.FS;
        const dir = "/home/web_user/roms/saves";
        try {
          if (!FS.analyzePath(dir).exists) {
            FS.mkdirTree(dir);
          }
        } catch {}

        const savePath = `${dir}/${gameId}.state`;
        FS.writeFile(savePath, bytes);
        console.log("[SaveSyncService] Injected cloud state into TabStationToo VFS:", savePath);
      } else {
        // EmulatorJS / LocalStorage / IDBFS bridge
        const dbName = `roms-vfs-${gameId}`;
        const b64 = uint8ArrayToBase64(bytes);
        localStorage.setItem(`${dbName}-save`, b64);

        // Also check if window.EJS_emulator?.gameManager has FS mounted
        const gm = (window as any).EJS_emulator?.gameManager;
        if (gm && gm.FS) {
          const fs = gm.FS;
          try {
            const savePath = typeof gm.getSaveFilePath === "function" ? gm.getSaveFilePath() : `/data/saves/${gameId}.srm`;
            if (savePath) {
              fs.writeFile(savePath, bytes);
              if (typeof fs.syncfs === "function") {
                fs.syncfs(false, () => {});
              }
              console.log("[SaveSyncService] Injected cloud save into EmulatorJS FS:", savePath);
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error("[SaveSyncService] Error writing save to VFS:", err);
    }
  },

  /**
   * Captures raw save bytes from emulator virtual storage.
   */
  captureSaveFromEmulator(gameId: string, emulatorType: string): Uint8Array | null {
    if (typeof window === "undefined") return null;

    try {
      if (emulatorType === "tabstationtoo" && (window as any).Module?.FS) {
        const FS = (window as any).Module.FS;
        const savePath = `/home/web_user/roms/saves/${gameId}.state`;
        if (FS.analyzePath(savePath).exists) {
          return FS.readFile(savePath);
        }
      }

      // Check EmulatorJS gameManager first
      const gm = (window as any).EJS_emulator?.gameManager;
      if (gm) {
        if (typeof gm.getSaveFile === "function") {
          const raw = gm.getSaveFile();
          if (raw && (raw.byteLength > 0 || raw.length > 0)) {
            return raw instanceof Uint8Array ? raw : new Uint8Array(raw);
          }
        }
        if (gm.saveFile && (gm.saveFile.byteLength > 0 || gm.saveFile.length > 0)) {
          return gm.saveFile instanceof Uint8Array ? gm.saveFile : new Uint8Array(gm.saveFile);
        }
        if (gm.FS && typeof gm.getSaveFilePath === "function") {
          const p = gm.getSaveFilePath();
          if (p && gm.FS.analyzePath(p).exists) {
            return gm.FS.readFile(p);
          }
        }
      }

      // Fallback: check localStorage bridge
      const dbName = `roms-vfs-${gameId}`;
      const raw = localStorage.getItem(`${dbName}-save`);
      if (raw) {
        return base64ToUint8Array(raw);
      }
    } catch (err) {
      console.warn("[SaveSyncService] Capture save from emulator error:", err);
    }

    return null;
  },

  /**
   * Dispatches emergency save persistence via navigator.sendBeacon when closing tabs or navigating away.
   */
  triggerBeaconExit(
    userId: string,
    gameId: string,
    emulatorType: string,
    saveBytes?: Uint8Array | null
  ): boolean {
    if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
      return false;
    }

    try {
      const bytes = saveBytes || this.captureSaveFromEmulator(gameId, emulatorType);
      if (!bytes || bytes.byteLength === 0) return false;

      const base64Data = uint8ArrayToBase64(bytes);
      const payload = JSON.stringify({
        userId,
        gameId,
        emulatorType,
        saveData: base64Data,
        saveType: emulatorType === "tabstationtoo" ? "savestate" : "memory_card",
        slotIndex: 0,
      });

      const blob = new Blob([payload], { type: "application/json" });
      const beaconUrl = resolveSaveEndpoint("/api/saves/beacon");
      const queued = navigator.sendBeacon(beaconUrl, blob);
      console.log("[SaveSyncService] Emergency beacon dispatched:", queued, "bytes:", bytes.byteLength);
      return queued;
    } catch (err) {
      console.error("[SaveSyncService] Failed to dispatch sendBeacon emergency save:", err);
      return false;
    }
  },
};
