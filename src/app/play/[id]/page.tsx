"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSystemMeta, normalizeSystem, toCleanSlug } from "@/lib/systems";
import {
  Cpu,
  Download,
  Play,
  Loader2,
  Sparkles,
  AlertCircle,
  ExternalLink,
  ArrowLeft,
  Maximize2,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";

const BASE_PATH = "/roms";

declare global {
  interface Window {
    EJS_player?: string;
    EJS_core?: string;
    EJS_gameName?: string;
    EJS_gameID?: string | number;
    EJS_color?: string;
    EJS_startOnLoaded?: boolean;
    EJS_pathtodata?: string;
    EJS_gameUrl?: string;
    EJS_biosUrl?: string;
    EJS_defaultOptions?: Record<string, string>;
    EJS_threads?: boolean;
    EJS_rumble?: boolean;
    EJS_vibration?: boolean;
    EJS_disableRumble?: boolean;
    EJS_emulator?: any;
    EJS_ready?: () => void;
    EJS_onGameStart?: () => void;
    VAULT_DIAGNOSTICS?: any;
    __ACTIVE_AUDIO_CONTEXTS?: Set<AudioContext>;
  }
}

function getRecompProgress(log: string, elapsedSec: number): { step: number; title: string; percent: number } {
  if (log.includes("SUCCESS: Recompilation complete!") || log.includes("Deploying")) {
    return { step: 6, title: "Finalizing & Deploying Web Build", percent: 98 };
  }
  if (log.includes("== [6/6]") || log.includes("ninja:") || log.includes("Linking CXX executable")) {
    return { step: 6, title: "Building WebAssembly & WebGPU Compute Shaders", percent: 85 };
  }
  if (log.includes("== [5/6]")) {
    return { step: 5, title: "Compiling Vector Unit Programs", percent: 70 };
  }
  if (log.includes("== [4/6]")) {
    return { step: 4, title: "Exploring & Tracing Execution Flow", percent: 50 };
  }
  if (log.includes("== [3/6]")) {
    return { step: 3, title: "Translating MIPS Machine Code to C++", percent: 30 };
  }
  if (log.includes("== [2/6]")) {
    return { step: 2, title: "Analyzing Game Executable (ELF)", percent: 15 };
  }
  if (log.includes("== [1/6]")) {
    return { step: 1, title: "Scanning Disc Structure", percent: 5 };
  }

  // Fallback estimate based on elapsed time (~180s typical compile time)
  const timePercent = Math.min(90, Math.max(5, Math.floor((elapsedSec / 180) * 85)));
  return { step: 1, title: "Initializing Recompilation Pipeline", percent: timePercent };
}

export default function EmulatorPlayPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const initializedRef = useRef<boolean>(false);

  // PS2 Recompilation state
  const [ps2Status, setPs2Status] = useState<"checking" | "idle" | "running" | "completed" | "failed">("checking");
  const [ps2PlayUrl, setPs2PlayUrl] = useState<string | null>(null);
  const [ps2Log, setPs2Log] = useState<string>("");
  const [isStartingRecomp, setIsStartingRecomp] = useState<boolean>(false);
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  const rawDecoded =
    typeof params.id === "string"
      ? (() => {
          try {
            return decodeURIComponent(params.id);
          } catch {
            return params.id;
          }
        })()
      : "";

  let system = "nes";
  let baseName = rawDecoded;

  if (rawDecoded.includes("__")) {
    const splitIdx = rawDecoded.indexOf("__");
    system = normalizeSystem(rawDecoded.slice(0, splitIdx));
    baseName = rawDecoded.slice(splitIdx + 2);
  } else if (searchParams.get("system")) {
    system = normalizeSystem(searchParams.get("system"));
  }

  const meta = getSystemMeta(system);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Poll status when PS2 recompilation is running
  useEffect(() => {
    if (system !== "ps2" || ps2Status !== "running") return;

    const timer = setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);

    const poller = setInterval(() => {
      fetch(`${BASE_PATH}/api/ps2-recompile?id=${encodeURIComponent(params.id)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.log) setPs2Log(data.log);
          if (data.status === "completed" && data.playUrl) {
            setPs2PlayUrl(data.playUrl);
            setPs2Status("completed");
          } else if (data.status === "failed") {
            setPs2Status("failed");
          }
        })
        .catch(() => {});
    }, 2000);

    return () => {
      clearInterval(timer);
      clearInterval(poller);
    };
  }, [params.id, ps2Status, system]);

  useEffect(() => {
    if (initializedRef.current || !baseName) {
      return;
    }
    initializedRef.current = true;

    // Block WebHID/WebUSB device grabs and neuter Gamepad vibration prototypes
    if (typeof window !== "undefined") {
      if ("GamepadHapticActuator" in window) {
        (window as unknown as { GamepadHapticActuator: unknown }).GamepadHapticActuator = undefined;
      }
      if (typeof Gamepad !== "undefined" && Gamepad.prototype) {
        try {
          Object.defineProperty(Gamepad.prototype, "vibrationActuator", {
            get: () => null,
            configurable: true,
          });
          Object.defineProperty(Gamepad.prototype, "hapticActuators", {
            get: () => [],
            configurable: true,
          });
        } catch {}
      }
      if (typeof navigator !== "undefined") {
        try {
          if ("hid" in navigator) {
            Object.defineProperty(navigator, "hid", { get: () => undefined, configurable: true });
          }
          if ("usb" in navigator) {
            Object.defineProperty(navigator, "usb", { get: () => undefined, configurable: true });
          }
        } catch {}
      }
    }

    // 1. Sanitize stale localStorage settings left by previous runs so they don't corrupt retroarch core options
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("ejs-") && key.endsWith("-settings")) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.settings) {
              delete parsed.settings.audio_latency;
              delete parsed.settings.audio_sync;
              delete parsed.settings.audio_rate_control;
              delete parsed.settings.audio_rate_control_delta;
              delete parsed.settings.audio_max_timing_skew;
              delete parsed.settings.audio_out_rate;
              localStorage.setItem(key, JSON.stringify(parsed));
            }
          }
        }
      }
    } catch {}

    // 2. Hardware audio sample rate detection & proactive AudioContext management
    let detectedSampleRate = 48000;
    try {
      const probeCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (probeCtx.sampleRate) {
        detectedSampleRate = probeCtx.sampleRate;
      }
      probeCtx.close().catch(() => {});
    } catch {}

    const OrigAudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const activeCtxs = new Set<AudioContext>();
    if (OrigAudioCtx) {
      window.__ACTIVE_AUDIO_CONTEXTS = activeCtxs;
      try {
        class ManagedAudioContext extends OrigAudioCtx {
          constructor(options?: AudioContextOptions) {
            super(options);
            activeCtxs.add(this);
          }
        }
        (window as any).AudioContext = ManagedAudioContext;
        if ((window as any).webkitAudioContext) {
          (window as any).webkitAudioContext = ManagedAudioContext;
        }
      } catch {}
    }

    const resumeAllAudio = () => {
      try {
        activeCtxs.forEach((ctx) => {
          if (ctx.state === "suspended") {
            ctx.resume().catch(() => {});
          }
        });
        const emu = window.EJS_emulator;
        const alCtx = emu?.Module?.AL?.currentCtx?.audioCtx;
        if (alCtx && alCtx.state === "suspended") {
          alCtx.resume().catch(() => {});
        }
      } catch {}
    };

    const audioInteractions = ["pointerdown", "mousedown", "keydown", "touchstart", "focus"];
    audioInteractions.forEach((evt) => {
      window.addEventListener(evt, resumeAllAudio, { passive: true });
    });

    // Detect actual file name from searchParams or baseName
    const fileParam = searchParams.get("file");
    const romFileName = fileParam || (baseName.includes(".") ? baseName : `${baseName}.zip`);
    const slug = toCleanSlug(romFileName, system);
    const origin = window.location.origin;
    const absoluteRomUrl = `${origin}${BASE_PATH}/api/nes/${encodeURIComponent(
      romFileName
    )}/${encodeURIComponent(slug)}?system=${encodeURIComponent(system)}`;

    // Handle PS2 Check
    if (system === "ps2") {
      fetch(`${BASE_PATH}/api/ps2-recompile?id=${encodeURIComponent(params.id)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.status === "completed" && data.playUrl) {
            setPs2PlayUrl(data.playUrl);
            setPs2Status("completed");
          } else if (data.status === "running") {
            setPs2Status("running");
            if (data.log) setPs2Log(data.log);
          } else {
            setPs2Status("idle");
          }
        })
        .catch(() => {
          setPs2Status("idle");
        });
      return;
    }

    const biosMap: Record<string, string> = {
      saturn: "saturn_bios.bin",
      gba: "gba_bios.bin",
      sega32x: "32X_G_BIOS.BIN",
      psx: "scph5501.bin",
    };

    const targetBios = biosMap[system];

    const CLIENT_ID_KEY = "rom_vault_machine_id_v1";
    let clientId = "";
    try {
      clientId = localStorage.getItem(CLIENT_ID_KEY) || "";
      if (!clientId) {
        clientId = "mach_" + Math.random().toString(36).substring(2, 10);
        localStorage.setItem(CLIENT_ID_KEY, clientId);
      }
    } catch {}

    const cleanBaseGameName = baseName
      .replace(/[\s\(\[]+(?:disc|disk)\s*[^)\]]*[)\]]+/gi, "")
      .trim();

    const isPs1 = system === "psx";
    const ps1DownloadUrl = `${origin}${BASE_PATH}/api/users/me/cards/active/download`;
    const ps1SyncUrl = `${origin}${BASE_PATH}/api/users/me/cards/active/sync`;
    const genericSaveUrl = `${origin}${BASE_PATH}/api/saves/${encodeURIComponent(params.id)}?system=${encodeURIComponent(system)}&client=${encodeURIComponent(clientId)}`;
    const saveApiUrl = isPs1 ? ps1DownloadUrl : genericSaveUrl;

    // Fast 32-bit FNV-1a checksum to avoid large string allocations and GC pauses during emulation
    const computeFastChecksum = (bytes: Uint8Array): number => {
      let hash = 0x811c9dc5;
      const len = bytes.length;
      const step = Math.max(1, Math.floor(len / 256));
      for (let i = 0; i < len; i += step) {
        hash ^= bytes[i];
        hash = Math.imul(hash, 0x01000193);
      }
      return (hash ^ len) >>> 0;
    };

    let lastSaveChecksum = 0;
    let lastEtag = "";
    let loadedCardName = "";
    let loadedCardSlot = 1;
    let hasInjectedServerSave = false;
    let isSaving = false;

    // Prefetch memory card save immediately during page load so it is ready before core boot
    let prefetchedSaveBytes: Uint8Array | null = null;
    let prefetchedCardName = "";
    let prefetchedCardSlot = 1;
    let prefetchedEtag = "";

    fetch(saveApiUrl)
      .then(async (res) => {
        if (!res.ok && isPs1) {
          const fallback = await fetch(genericSaveUrl).catch(() => null);
          if (fallback && fallback.ok) return fallback;
        }
        return res;
      })
      .then(async (res) => {
        if (!res || !res.ok) return;
        const ab = await res.arrayBuffer();
        if (!ab || ab.byteLength === 0) return;
        prefetchedSaveBytes = new Uint8Array(ab);

        const cardNameHeader = res.headers.get("X-Card-Name");
        if (cardNameHeader) {
          try {
            prefetchedCardName = decodeURIComponent(cardNameHeader);
          } catch {
            prefetchedCardName = cardNameHeader;
          }
        }
        const cardSlotHeader = res.headers.get("X-Card-Slot");
        if (cardSlotHeader) {
          prefetchedCardSlot = parseInt(cardSlotHeader, 10) || 1;
        }
        const etagHeader = res.headers.get("ETag");
        if (etagHeader) {
          prefetchedEtag = etagHeader.replace(/"/g, "");
        }

        // If FS is already mounted while ROM is downloading, inject immediately before startGame
        const emu = window.EJS_emulator;
        if (emu?.gameManager?.FS && !hasInjectedServerSave) {
          applySaveBytes(emu.gameManager.FS, prefetchedSaveBytes, emu);
        }
      })
      .catch((err) => {
        console.warn("[SaveSync] Prefetch failed:", err);
      });

    const tuneRetroarchConfig = (fs: any) => {
      const cfgPath = "/home/web_user/.config/retroarch/retroarch.cfg";
      try {
        let existingCfg = "";
        try {
          const raw = fs.readFile(cfgPath);
          existingCfg = new TextDecoder().decode(raw);
        } catch {}

        let newCfg = existingCfg;

        // 384ms audio latency gives an 18-buffer queue in OpenAL to comfortably absorb frame timing drift
        if (newCfg.includes("audio_latency")) {
          newCfg = newCfg.replace(/audio_latency\s*=\s*\d+/g, "audio_latency = 384");
        } else {
          newCfg += "\naudio_latency = 384\n";
        }

        // Configure audio sync, dynamic rate control and matching hardware sample rate with generous skew tolerance
        const desiredSettings: Record<string, string> = {
          "audio_sync": "true",
          "audio_rate_control": "true",
          "audio_rate_control_delta": "0.02",
          "audio_max_timing_skew": "0.10",
          "audio_out_rate": String(detectedSampleRate),
          "video_vsync": "true",
        };

        for (const [key, val] of Object.entries(desiredSettings)) {
          const regex = new RegExp(`^${key}\\s*=.*$`, "m");
          if (regex.test(newCfg)) {
            newCfg = newCfg.replace(regex, `${key} = ${val}`);
          } else {
            newCfg += `${key} = ${val}\n`;
          }
        }

        fs.writeFile(cfgPath, newCfg);
        console.log(`[AudioOpt] Configured retroarch.cfg: latency=384ms, rate=${detectedSampleRate}Hz, delta=0.02, skew=0.10`);
      } catch (err) {
        console.warn("[AudioOpt] Failed to tune retroarch.cfg:", err);
      }
    };

    const applySaveBytes = (fs: any, saveBytes: Uint8Array, emu?: any) => {
      if (hasInjectedServerSave || !saveBytes || saveBytes.byteLength === 0) return;

      const savePath = emu?.gameManager?.getSaveFilePath ? emu.gameManager.getSaveFilePath() : `/data/saves/${cleanBaseGameName}.srm`;
      if (!savePath) return;

      const parts = savePath.split("/");
      let cur = "";
      for (let i = 0; i < parts.length - 1; i++) {
        if (!parts[i]) continue;
        cur += "/" + parts[i];
        try {
          if (!fs.analyzePath(cur).exists) fs.mkdir(cur);
        } catch {}
      }

      try {
        fs.writeFile(savePath, saveBytes);
      } catch (err) {
        console.warn("[SaveSync] Failed to write savePath:", err);
      }

      // Also write disc variations so switching discs uses same memory card
      const baseRom = romFileName.replace(/\.[^.]+$/, "");
      const baseNoDisc = baseRom.replace(/[\s\(\[]+(?:disc|disk)\s*[^)\]]*[)\]]+/gi, "").trim();
      for (let d = 1; d <= 5; d++) {
        const dPath = `/data/saves/${baseNoDisc} (Disc ${d}).srm`;
        try {
          if (dPath !== savePath) fs.writeFile(dPath, saveBytes);
        } catch {}
      }

      try {
        fs.syncfs(false, () => {});
      } catch {}

      if (emu?.started && emu?.gameManager?.loadSaveFiles) {
        try {
          emu.gameManager.loadSaveFiles();
        } catch {}
      }

      hasInjectedServerSave = true;
      lastSaveChecksum = computeFastChecksum(saveBytes);
      if (prefetchedEtag) lastEtag = prefetchedEtag;
      if (prefetchedCardName) loadedCardName = prefetchedCardName;
      if (prefetchedCardSlot) loadedCardSlot = prefetchedCardSlot;

      console.log(`[SaveSync] Injected server memory card (${saveBytes.byteLength} bytes) for ${isPs1 ? `User PS1 Card (Slot ${loadedCardSlot})` : "Game"}`);

      window.parent?.postMessage(
        {
          type: "VAULT_SAVE_STATUS",
          status: "loaded",
          size: saveBytes.byteLength,
          cardName: loadedCardName,
          cardSlot: loadedCardSlot,
        },
        "*"
      );
    };

    const injectServerSave = async (emu: any) => {
      if (hasInjectedServerSave) return;
      if (prefetchedSaveBytes && emu?.gameManager?.FS) {
        applySaveBytes(emu.gameManager.FS, prefetchedSaveBytes, emu);
        return;
      }
      try {
        let res = await fetch(saveApiUrl);
        // Fallback to legacy game save if user card is unavailable
        if (!res.ok && isPs1) {
          const fallback = await fetch(genericSaveUrl).catch(() => null);
          if (fallback && fallback.ok) res = fallback;
        }

        if (!res.ok) return;
        const ab = await res.arrayBuffer();
        if (!ab || ab.byteLength === 0) return;
        const saveBytes = new Uint8Array(ab);

        const cardNameHeader = res.headers.get("X-Card-Name");
        if (cardNameHeader) {
          try {
            loadedCardName = decodeURIComponent(cardNameHeader);
          } catch {
            loadedCardName = cardNameHeader;
          }
        }
        const cardSlotHeader = res.headers.get("X-Card-Slot");
        if (cardSlotHeader) {
          loadedCardSlot = parseInt(cardSlotHeader, 10) || 1;
        }
        const etagHeader = res.headers.get("ETag");
        if (etagHeader) {
          lastEtag = etagHeader.replace(/"/g, "");
        }

        const fs = emu?.gameManager?.FS;
        if (!fs) return;

        applySaveBytes(fs, saveBytes, emu);
      } catch (err) {
        console.error("[SaveSync] Injection failed:", err);
      }
    };

    const flushAndPushSave = async (emu: any, force = false): Promise<void> => {
      if (!emu || !emu.gameManager || !emu.started || isSaving) return;
      isSaving = true;
      try {
        // ONLY force core flush on explicit exit or force-save.
        // During active gameplay, RetroArch writes to MEMFS via autosave_interval.
        // Calling saveSaveFiles() halts the C/WASM emulation loop synchronously!
        if (force) {
          emu.gameManager.saveSaveFiles();
        }

        const fs = emu.gameManager.FS;
        const savePath = emu.gameManager.getSaveFilePath();
        if (!savePath || !fs.analyzePath(savePath).exists) {
          isSaving = false;
          return;
        }

        const saveBytes = fs.readFile(savePath);
        if (!saveBytes || saveBytes.byteLength === 0) {
          isSaving = false;
          return;
        }

        const checksum = computeFastChecksum(saveBytes);
        if (checksum === lastSaveChecksum && !force) {
          isSaving = false;
          return;
        }
        lastSaveChecksum = checksum;

        // Clone buffer to avoid locking the virtual file buffer during background sync
        const savePayload = new Uint8Array(saveBytes);

        // Schedule disc duplication and IndexedDB commit on idle frame
        const scheduleDiskSync = () => {
          const baseRom = romFileName.replace(/\.[^.]+$/, "");
          const baseNoDisc = baseRom.replace(/[\s\(\[]+(?:disc|disk)\s*[^)\]]*[)\]]+/gi, "").trim();
          for (let d = 1; d <= 5; d++) {
            const dPath = `/data/saves/${baseNoDisc} (Disc ${d}).srm`;
            try {
              if (dPath !== savePath) fs.writeFile(dPath, savePayload);
            } catch {}
          }
          fs.syncfs(false, () => {});
        };

        if (typeof window !== "undefined" && "requestIdleCallback" in window) {
          (window as any).requestIdleCallback(scheduleDiskSync, { timeout: 2000 });
        } else {
          setTimeout(scheduleDiskSync, 0);
        }

        // Push to server cloud asynchronously in detached promise
        const pushPromise = isPs1
          ? fetch(ps1SyncUrl, {
              method: "PUT",
              headers: {
                "Content-Type": "application/octet-stream",
                ...(lastEtag ? { "If-Match": `"${lastEtag}"` } : {}),
              },
              body: savePayload,
            })
          : fetch(genericSaveUrl, {
              method: "POST",
              headers: { "Content-Type": "application/octet-stream" },
              body: savePayload,
            });

        pushPromise
          .then(async (syncRes) => {
            if (syncRes.ok && isPs1) {
              const data = await syncRes.json().catch(() => null);
              if (data?.checksum) {
                lastEtag = data.checksum;
              }
            }
            window.parent?.postMessage(
              {
                type: "VAULT_SAVE_STATUS",
                status: "saved",
                size: savePayload.byteLength,
                cardName: loadedCardName,
                cardSlot: loadedCardSlot,
                timestamp: Date.now(),
              },
              "*"
            );
          })
          .catch((err) => {
            console.error("[SaveSync] Push failed:", err);
          });
      } catch (err) {
        console.error("[SaveSync] Push error:", err);
      } finally {
        isSaving = false;
      }
    };

    let checkTimer: any = null;
    let isUnmounted = false;
    let cleanupEmulator: (() => void) | null = null;

    const startEmulator = (biosUrl?: string) => {
      window.EJS_player = "#emulator-target";
      window.EJS_core = meta.ejsCore || "nes";
      window.EJS_gameName = baseName;
      window.EJS_gameID = `${system}_${cleanBaseGameName}`;
      window.EJS_color = meta.colorHex;
      window.EJS_startOnLoaded = true;
      window.EJS_pathtodata = "https://cdn.emulatorjs.org/stable/data/";
      window.EJS_gameUrl = absoluteRomUrl;

      // HARD DISABLE: Strip all rumble, haptics, and vibration probing
      window.EJS_rumble = false;
      window.EJS_vibration = false;
      (window as unknown as Record<string, unknown>).EJS_disableRumble = true;

      window.EJS_defaultOptions = {
        "save-save-interval": "60",
        "save-state-location": "browser",
      };
      if (biosUrl) {
        window.EJS_biosUrl = biosUrl;
      }

      let resumeInterval: any = null;

      // Hook emulator initialization: tune retroarch.cfg and inject save before core boot
      window.EJS_ready = () => {
        const emu = window.EJS_emulator;
        if (emu) {
          emu.on("saveDatabaseLoaded", (fs: any) => {
            tuneRetroarchConfig(fs);
            if (prefetchedSaveBytes) {
              applySaveBytes(fs, prefetchedSaveBytes, emu);
            }
          });
        }
      };

      window.EJS_onGameStart = () => {
        resumeAllAudio();
        const emu = window.EJS_emulator;
        if (emu) {
          // Tune OpenAL lookahead on the Emscripten module to 200ms
          try {
            if (emu.Module?.AL) {
              emu.Module.AL.QUEUE_LOOKAHEAD = 0.20;
              console.log("[AudioOpt] Set OpenAL QUEUE_LOOKAHEAD = 0.20s");
            }
          } catch {}

          if (!hasInjectedServerSave) {
            if (prefetchedSaveBytes && emu?.gameManager?.FS) {
              applySaveBytes(emu.gameManager.FS, prefetchedSaveBytes, emu);
            } else {
              injectServerSave(emu);
            }
          }
        }

        // Proactively resume WebAudio context and maintain lookahead for first 5 seconds
        let checks = 0;
        resumeInterval = setInterval(() => {
          checks++;
          resumeAllAudio();
          try {
            if (window.EJS_emulator?.Module?.AL) {
              window.EJS_emulator.Module.AL.QUEUE_LOOKAHEAD = 0.20;
            }
          } catch {}
          if (checks >= 5) clearInterval(resumeInterval);
        }, 1000);
      };

      // Relaxed, non-blocking dirty-check using requestIdleCallback every 60s
      const scheduleSaveCheck = () => {
        if (isUnmounted) return;
        checkTimer = setTimeout(() => {
          if (isUnmounted) return;
          const runCheck = () => {
            const emu = window.EJS_emulator;
            if (emu && emu.started) {
              if (!hasInjectedServerSave) {
                injectServerSave(emu);
              } else {
                flushAndPushSave(emu, false);
              }
            }
            scheduleSaveCheck();
          };

          if (typeof window !== "undefined" && "requestIdleCallback" in window) {
            (window as any).requestIdleCallback(runCheck, { timeout: 3000 });
          } else {
            setTimeout(runCheck, 0);
          }
        }, 60000);
      };

      scheduleSaveCheck();

      // Listen for parent messages (e.g. exit or force save)
      const handleParentMessage = async (e: MessageEvent) => {
        const emu = window.EJS_emulator;
        if (e.data?.type === "VAULT_SAVE_AND_EXIT") {
          await flushAndPushSave(emu, true);
          window.parent?.postMessage({ type: "VAULT_EXIT_READY" }, "*");
        } else if (e.data?.type === "VAULT_FORCE_SAVE") {
          await flushAndPushSave(emu, true);
        }
      };

      window.addEventListener("message", handleParentMessage);
      window.addEventListener("beforeunload", () => {
        const emu = window.EJS_emulator;
        if (emu?.gameManager?.FS) {
          emu.gameManager.saveSaveFiles();
          emu.gameManager.FS.syncfs(false, () => {});
        }
      });

      // Throttled notification for fullscreen controls to prevent high-frequency event loop starvation
      let mouseThrottlePending = false;
      let lastMouseMoveTime = 0;
      const handleWindowMouseMove = () => {
        if (mouseThrottlePending) return;
        const now = Date.now();
        if (now - lastMouseMoveTime > 500) {
          lastMouseMoveTime = now;
          mouseThrottlePending = true;
          requestAnimationFrame(() => {
            mouseThrottlePending = false;
            try {
              window.parent?.postMessage({ type: "VAULT_MOUSE_MOVE" }, "*");
            } catch {}
          });
        }
      };
      window.addEventListener("mousemove", handleWindowMouseMove, { passive: true });

      const script = document.createElement("script");
      script.src = "https://cdn.emulatorjs.org/stable/data/loader.js";
      script.async = true;
      document.body.appendChild(script);

      cleanupEmulator = () => {
        isUnmounted = true;
        if (checkTimer) clearTimeout(checkTimer);
        if (resumeInterval) clearInterval(resumeInterval);
        window.removeEventListener("message", handleParentMessage);
        window.removeEventListener("mousemove", handleWindowMouseMove);
        audioInteractions.forEach((evt) => {
          window.removeEventListener(evt, resumeAllAudio);
        });
        if (window.EJS_emulator?.stop) {
          try {
            window.EJS_emulator.stop();
          } catch {
            // no-op
          }
        }
      };
    };

    if (targetBios) {
      const candidateUrl = `${origin}${BASE_PATH}/api/bios/${targetBios}?system=${encodeURIComponent(system)}`;
      fetch(candidateUrl, { method: "HEAD" })
        .then((res) => {
          if (res.ok) {
            startEmulator(candidateUrl);
          } else {
            startEmulator();
          }
        })
        .catch(() => startEmulator());
    } else {
      startEmulator();
    }

    return () => {
      if (cleanupEmulator) cleanupEmulator();
    };
  }, [baseName, meta, params.id, searchParams, system]);

  const handleStartRecompile = async () => {
    setIsStartingRecomp(true);
    // Instantly switch into progress view without flicker
    setPs2Status("running");
    setElapsedSec(0);

    try {
      const res = await fetch(`${BASE_PATH}/api/ps2-recompile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: params.id }),
      });
      const data = await res.json();
      if (data.status === "completed" && data.playUrl) {
        setPs2PlayUrl(data.playUrl);
        setPs2Status("completed");
      }
    } catch (err) {
      console.error("Failed to start recompilation:", err);
    } finally {
      setIsStartingRecomp(false);
    }
  };

  // PS2 Custom WebGPU Interface
  if (system === "ps2") {
    // 1. Fully Recompiled -> Boot Game directly with navigation header!
    if (ps2Status === "completed" && ps2PlayUrl) {
      return (
        <div className="w-screen h-screen bg-black overflow-hidden flex flex-col relative">
          {/* Top Quick Bar */}
          <div className="h-10 bg-[#121216] border-b border-white/10 px-4 flex items-center justify-between text-xs text-zinc-300 z-10 shrink-0">
            <div className="flex items-center gap-3">
              <Link
                href="/?system=ps2"
                className="inline-flex items-center gap-1.5 hover:text-white transition px-2 py-1 rounded hover:bg-white/5"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-blue-400" />
                <span>ROM Vault</span>
              </Link>
              <span className="text-zinc-600">|</span>
              <span className="font-semibold text-white truncate max-w-sm sm:max-w-md">
                {baseName}
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-950 text-blue-300 border border-blue-500/30">
                <Sparkles className="w-2.5 h-2.5 text-blue-400" />
                60 FPS WebGPU
              </span>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={ps2PlayUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow transition cursor-pointer"
                title="Open in dedicated tab for direct WebGPU and maximum performance"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Standalone Player</span>
              </a>
              <button
                type="button"
                onClick={() => {
                  if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(() => {});
                  } else {
                    document.exitFullscreen().catch(() => {});
                  }
                }}
                className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition cursor-pointer"
                title="Toggle Fullscreen (F11)"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 w-full h-full relative">
            <iframe
              title={`PS2 WebGPU - ${baseName}`}
              src={ps2PlayUrl}
              className="w-full h-full border-0"
              allow="autoplay; fullscreen; gamepad; webgpu; cross-origin-isolated"
            />
          </div>
        </div>
      );
    }

    const fileParam = searchParams.get("file") || `${baseName}.zip`;
    const downloadUrl = `${BASE_PATH}/api/media/roms/${encodeURIComponent(fileParam)}?system=ps2&download=1`;

    // 2. Currently Recompiling (Progress View with real-time bar)
    if (ps2Status === "running") {
      const minutes = Math.floor(elapsedSec / 60);
      const seconds = elapsedSec % 60;
      const timeFormatted = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
      const progressInfo = getRecompProgress(ps2Log, elapsedSec);

      return (
        <div className="w-screen h-screen bg-[#070709] text-zinc-100 flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="max-w-xl w-full bg-zinc-900/90 border border-blue-500/30 rounded-2xl p-8 shadow-2xl backdrop-blur-md relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 animate-pulse" />

            <div className="w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center mx-auto mb-4 text-blue-400 shadow-lg shadow-blue-500/10">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-950 text-blue-300 border border-blue-600/30 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              WebGPU Static Recompilation Active
            </div>

            <h2 className="text-xl font-bold text-white mb-2">{baseName}</h2>

            {/* Current Stage Indicator */}
            <div className="text-xs font-semibold text-blue-300 mb-3 flex items-center justify-center gap-1.5">
              <span>{progressInfo.title}</span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-black/60 rounded-full h-2.5 p-0.5 border border-white/10 mb-4 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressInfo.percent}%` }}
              />
            </div>

            {/* Step Indicators */}
            <div className="grid grid-cols-6 gap-1 mb-5 text-[10px] text-zinc-500 font-mono">
              {[
                "1. Disc",
                "2. ELF",
                "3. MIPS→C++",
                "4. Trace",
                "5. VU Gen",
                "6. WASM",
              ].map((name, idx) => {
                const stepNum = idx + 1;
                const isDone = stepNum < progressInfo.step;
                const isCurr = stepNum === progressInfo.step;
                return (
                  <div
                    key={name}
                    className={`p-1 rounded border text-center transition-all ${
                      isDone
                        ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-300"
                        : isCurr
                        ? "border-blue-500 bg-blue-950/60 text-blue-200 font-bold animate-pulse"
                        : "border-white/5 bg-white/[0.02] text-zinc-600"
                    }`}
                  >
                    {name}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-400 font-mono mb-4 px-1">
              <span>Elapsed: <strong className="text-blue-400">{timeFormatted}</strong></span>
              <span>Progress: <strong className="text-emerald-400">{progressInfo.percent}%</strong></span>
            </div>

            {/* Terminal Live Output */}
            {ps2Log && (
              <div className="bg-black/80 border border-white/10 rounded-xl p-3.5 text-left mb-5 font-mono text-[11px] text-zinc-300 max-h-36 overflow-y-auto whitespace-pre leading-relaxed no-scrollbar shadow-inner">
                {ps2Log}
              </div>
            )}

            <div className="text-[11px] text-zinc-500">
              ⚡ This only runs once per game. When finished, the game boots automatically.
            </div>
          </div>
        </div>
      );
    }

    // 3. Recompilation Failed
    if (ps2Status === "failed") {
      return (
        <div className="w-screen h-screen bg-[#070709] text-zinc-100 flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="max-w-xl w-full bg-zinc-900/90 border border-red-500/30 rounded-2xl p-8 shadow-2xl backdrop-blur-md">
            <div className="w-16 h-16 rounded-2xl bg-red-600/20 border border-red-500/40 flex items-center justify-center mx-auto mb-5 text-red-400">
              <AlertCircle className="w-8 h-8" />
            </div>

            <h2 className="text-xl font-bold text-white mb-2">Recompilation Error</h2>
            <p className="text-sm text-zinc-400 leading-relaxed mb-6">
              Could not complete in-browser recompilation for this disc image. You can still download the game to play at full speed in PCSX2.
            </p>

            {ps2Log && (
              <div className="bg-black/70 border border-red-500/20 rounded-xl p-3.5 text-left mb-6 font-mono text-[11px] text-red-400 max-h-36 overflow-y-auto whitespace-pre leading-relaxed no-scrollbar">
                {ps2Log}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleStartRecompile}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition cursor-pointer"
              >
                Retry Recompilation
              </button>
              <a
                href={downloadUrl}
                download={fileParam}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-zinc-200 transition"
              >
                <Download className="w-4 h-4" />
                Download for PCSX2
              </a>
            </div>
          </div>
        </div>
      );
    }

    // 4. Uncompiled Notice & 1-Click Action
    return (
      <div className="w-screen h-screen bg-[#070709] text-zinc-100 flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="max-w-xl w-full bg-zinc-900/90 border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur-md">
          <div className="w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mx-auto mb-5 text-blue-400 shadow-inner">
            <Cpu className="w-8 h-8" />
          </div>

          <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-blue-900/50 text-blue-300 border border-blue-600/30 mb-3">
            PlayStation 2 Web Recompilation
          </div>

          <h2 className="text-xl font-bold text-white mb-2">{baseName}</h2>
          <p className="text-sm text-zinc-400 leading-relaxed mb-4">
            This game has not yet been recompiled for in-browser play. Recompiling translates the PS2 architecture directly to WebAssembly &amp; WebGPU compute shaders for <strong>full 60 FPS play in your browser</strong>.
            <br />
            <span className="text-zinc-500 text-xs mt-1 block">
              ⚡ This only needs to be compiled once per game (~3 minutes). Once done, it will boot instantly every time.
            </span>
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
            <button
              type="button"
              onClick={handleStartRecompile}
              disabled={isStartingRecomp}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white transition shadow-lg shadow-blue-600/30 cursor-pointer disabled:opacity-50"
            >
              {isStartingRecomp ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  Recompile Game Now (~3 min)
                </>
              )}
            </button>

            <a
              href={downloadUrl}
              download={fileParam}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold bg-white/10 hover:bg-white/20 text-zinc-200 transition"
              title="Download ISO/ZIP file"
            >
              <Download className="w-4 h-4" />
              Download for PCSX2
            </a>
          </div>

          {/* Secure Context notice */}
          <div className="bg-blue-950/40 border border-blue-500/20 rounded-xl p-3 text-left flex items-start gap-2.5 text-xs text-zinc-400">
            <ShieldAlert className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong className="text-zinc-300">Browser Note:</strong> WebGPU requires a secure context. Play over HTTPS (<code className="text-blue-300">https://www.oldsmarchaos.com/roms/</code>) or, if playing over direct local HTTP IP (<code className="text-zinc-300">192.168.0.43</code>), enable the Chrome/Edge flag <code className="text-amber-300">chrome://flags/#unsafely-treat-insecure-origin-as-secure</code>.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Other systems (NES, SNES, GBA, N64, Genesis, PSX, Saturn, etc.)
  return (
    <div className="w-screen h-screen bg-black overflow-hidden flex items-center justify-center relative">
      <div id="emulator-target" className="w-full h-full" />
    </div>
  );
}
