"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowLeft, Maximize2, Disc3, Play, AlertCircle, Save, Check, Tv } from "lucide-react";
import { PS2EmulatorView } from "./PS2EmulatorView";
import { GameCubeEmulatorView } from "./GameCubeEmulatorView";
import { getSystemMeta, isDesktopOnlySystem } from "@/lib/systems";
import { MobileDesktopRequired } from "./MobileDesktopRequired";
import { StandaloneRecommendationView } from "./StandaloneRecommendationView";
import {
  SaveSyncService,
  isValidPs1MemoryCard,
  isBlankPs1MemoryCard,
  computeSaveChecksum,
  filterCandidateSaveFiles,
} from "@/lib/sync-service";
import {
  SHADER_PRESETS,
  DEFAULT_SHADER_PRESET,
  getShaderPresetById,
  getNextShaderPreset,
} from "@/lib/shaders";
import {
  extractLibretroStateFromGamepad,
  diffGamepadStates,
  type GamepadLike,
} from "@/lib/xbox-controller";

function deepDecode(str: string): string {
  let s = str || "";
  try {
    while (s.includes("%20") || s.includes("%25")) {
      const decoded = decodeURIComponent(s);
      if (decoded === s) break;
      s = decoded;
    }
  } catch (e) {}
  return s;
}

declare global {
  interface Window {
    EJS_player?: string;
    EJS_core?: string;
    EJS_biosUrl?: string;
    EJS_gameName?: string;
    EJS_gameUrl?: string;
    EJS_gamePath?: string;
    EJS_pathtodata?: string;
    EJS_language?: string;
    EJS_disableAutoLang?: boolean;
    EJS_startOnLoaded?: boolean;
    EJS_fullscreenOnLoad?: boolean;
    EJS_rumble?: boolean;
    EJS_vibration?: boolean;
    EJS_disableRumble?: boolean;
    EJS_loadToMemory?: boolean;
    EJS_disableCue?: boolean;
    EJS_threads?: boolean;
    EJS_CacheLimit?: number;
    EJS_resolution?: number;
    EJS_volume?: number;
    EJS_audioBufferSize?: number;
    EJS_sampleRate?: number;
    EJS_loadSaveUrl?: string;
    EJS_onSave?: (data: { name: string; data: Uint8Array | ArrayBuffer }) => void | Promise<void>;
    EJS_onSaveSaveFiles?: (data: unknown) => void;
    EJS_onSaveSave?: (data: unknown) => void;
    EJS_onSaveDatabaseLoaded?: (fs: unknown) => void;
    EJS_cloudSaveData?: Uint8Array | null;
    EJS_cardName?: string;
    EJS_saveFileNames?: string[];
    EJS_onStart?: () => void;
    EJS_onGameStart?: () => void;
    EJS_onLinkPacket?: (kind: number, data: number, fast: number) => void;
    EJS_pollLinkPackets?: () => void;
    EJS_coreSettings?: Record<string, string>;
    EJS_defaultOptions?: Record<string, string>;
    EJS_defaultControls?: Record<number, Record<number, { value?: string; value2?: string }>>;
    EJS_virtualGamepadSettings?: {
      shoulders?: number;
      buttonLabels?: Record<string, string>;
      [key: string]: unknown;
    };
    EJS_emulator?: {
      stop?: () => void;
      on?: (event: string, callback: (...args: unknown[]) => void) => void;
      setCoreSetting?: (key: string, value: string) => void;
      saveSaveFiles?: () => void;
      getSaveFile?: () => Uint8Array | ArrayBuffer | null;
      enableShader?: (shader: string) => void;
      gameManager?: {
        simulateInput?: (player: number, index: number, value: number) => void;
        functions?: {
          simulateInput?: (player: number, index: number, value: number) => void;
          [key: string]: unknown;
        };
        setOption?: (key: string, value: string) => void;
        setVariable?: (key: string, value: string) => void;
        saveSaveFiles?: () => void;
        getSaveFile?: () => Uint8Array | ArrayBuffer | null;
        saveFile?: Uint8Array | ArrayBuffer;
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };
  }
}

interface AdditionalDisc {
  discNumber: number;
  fileName: string;
  romUrl: string;
  fileSizeBytes: number;
}

interface MobileEmulatorViewProps {
  game: {
    id: string;
    title: string;
    system: string;
    romFileName?: string;
    discs?: AdditionalDisc[];
  };
}

function checkPhysicalGamepadConnected(): boolean {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return false;
  try {
    const pads = navigator.getGamepads();
    return Array.from(pads).some(
      (pad) => Boolean(pad && pad.connected && pad.axes && pad.axes.length >= 2)
    );
  } catch {
    return false;
  }
}

export function MobileEmulatorView({ game }: MobileEmulatorViewProps) {
  if (game.system === "ps2") {
    return <PS2EmulatorView game={game} />;
  }

  if (game.system === "gamecube") {
    return <GameCubeEmulatorView game={game} />;
  }

  const systemMeta = getSystemMeta(game.system);
  if (!systemMeta.playable || !systemMeta.ejsCore) {
    return <StandaloneRecommendationView game={game} />;
  }

  return <StandardMobileEmulatorView game={game} systemMeta={systemMeta} />;
}

function StandardMobileEmulatorView({
  game,
  systemMeta,
}: {
  game: MobileEmulatorViewProps["game"];
  systemMeta: ReturnType<typeof getSystemMeta>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [bootState, setBootState] = useState<"idle" | "booting" | "running" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedDiscIndex, setSelectedDiscIndex] = useState<number>(() => {
    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        const discParam = params.get("disc");
        if (discParam) {
          const num = parseInt(discParam, 10);
          if (!isNaN(num) && num >= 1 && game.discs && game.discs.length >= num) {
            return num - 1;
          }
        }
      } catch {}
    }
    return 0;
  });
  const [isInIframe, setIsInIframe] = useState<boolean>(false);
  const [isMobileDevice, setIsMobileDevice] = useState<boolean>(false);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [justSaved, setJustSaved] = useState<boolean>(false);
  const [currentShader, setCurrentShader] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("rom_vault_shader_preset") || DEFAULT_SHADER_PRESET;
      } catch {}
    }
    return DEFAULT_SHADER_PRESET;
  });

  const handleCycleShader = useCallback(() => {
    const next = getNextShaderPreset(currentShader);
    setCurrentShader(next.id);
    try {
      localStorage.setItem("rom_vault_shader_preset", next.id);
    } catch {}
    const emu = window.EJS_emulator;
    if (emu && typeof emu.enableShader === "function") {
      emu.enableShader(next.id);
    }
  }, [currentShader]);

  const cleanGameId = deepDecode(game.id).trim();
  const activeCardIdRef = useRef<string | null>(activeCardId);
  useEffect(() => {
    activeCardIdRef.current = activeCardId;
  }, [activeCardId]);
  const lastSyncedChecksumRef = useRef<string | null>(null);
  const hasNonBlankSaveRef = useRef<boolean>(false);
  const isSavingRef = useRef<boolean>(false);
  const hasPriorCloudSaveRef = useRef<boolean>(false);

  // Unified save pusher: syncs to user memory card slot or falls back to global game saves route
  const pushSaveToServer = useCallback(
    async (buffer: ArrayBuffer | Uint8Array, force = false) => {
      if (!buffer || (buffer as ArrayBuffer).byteLength === 0) return;
      if (isSavingRef.current && !force) return;

      const isPs1 = game.system === "psx" || game.system === "ps1";
      const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

      // Guardrail: PS1 virtual memory cards must be valid 128 KB (131,072-byte) Sony "MC" images
      if (isPs1 && !isValidPs1MemoryCard(uint8)) {
        console.warn(
          "[SaveSync] Ignoring invalid PS1 memory card buffer (expected 131072 bytes with MC header, got):",
          uint8.byteLength
        );
        return;
      }

      // Full-byte FNV-1a checksum to avoid redundant network transfers and catch any slot change
      const checksumStr = computeSaveChecksum(uint8);

      if (!force && lastSyncedChecksumRef.current === checksumStr) {
        return;
      }

      if (isPs1) {
        const isBlank = isBlankPs1MemoryCard(uint8);
        if (!isBlank) {
          hasNonBlankSaveRef.current = true;
        } else if (!force && !hasNonBlankSaveRef.current) {
          // Do not automatically upload a blank PS1 card when no save has ever been written
          // (e.g. when a game probes Slot 1 on the "Continue" screen of a brand-new card)
          lastSyncedChecksumRef.current = checksumStr;
          return;
        }
      }

      const cardId = activeCardIdRef.current || "active";
      let saveSucceeded = false;

      try {
        isSavingRef.current = true;
        setIsSaving(true);
        if (typeof window !== "undefined" && window.parent && window.parent !== window) {
          window.parent.postMessage({ type: "VAULT_SAVE_STATUS", status: "saving" }, "*");
        }

        const blob = new Blob([uint8 as unknown as BlobPart]);

        // 1. Authenticated User / PS1 Virtual Memory Card sync (strictly isolated to /api/users/me/cards)
        // NOTE: Never set `keepalive: true` on 128 KB PS1 cards — Chromium/Edge enforces a strict
        // 64 KiB (65,536-byte) body limit on keepalive fetches and throws TypeError: Failed to fetch!
        if (isPs1) {
          const res = await fetch(
            `/roms/api/users/me/cards/${encodeURIComponent(cardId)}/sync?system=${encodeURIComponent(
              game.system
            )}&gameId=${encodeURIComponent(cleanGameId)}`,
            {
              credentials: "include",
              method: "PUT",
              headers: { "Content-Type": "application/octet-stream" },
              body: blob,
            }
          );
          if (res.ok) {
            lastSyncedChecksumRef.current = checksumStr;
            saveSucceeded = true;
            setJustSaved(true);
            setTimeout(() => setJustSaved(false), 3000);
            console.log("[SaveSync] Cloud Memory Card synchronized to slot:", cardId);
            if (typeof window !== "undefined" && window.parent && window.parent !== window) {
              window.parent.postMessage({ type: "VAULT_SAVE_STATUS", status: "saved" }, "*");
            }
          } else {
            if (!force) {
              lastSyncedChecksumRef.current = checksumStr;
            }
            console.warn("[SaveSync] PS1 Memory Card sync returned non-OK status:", res.status);
            if (typeof window !== "undefined" && window.parent && window.parent !== window) {
              window.parent.postMessage({ type: "VAULT_SAVE_STATUS", status: "error" }, "*");
            }
          }
          return;
        }

        // 2. Non-PlayStation Global Game Save Sync (only use keepalive if payload <= 48 KB)
        const fallbackRes = await fetch(
          `/roms/api/saves/${encodeURIComponent(cleanGameId)}?system=${encodeURIComponent(game.system)}`,
          {
            credentials: "include",
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: blob,
            keepalive: uint8.byteLength <= 49152,
          }
        );

        // Also push to authoritative user_game_saves for non-PlayStation platforms
        SaveSyncService.uploadCloudSave(cleanGameId, uint8, "savegame", 0).catch((err) => {
          console.warn("[SaveSync] Authoritative user_game_saves upload warning:", err);
        });

        if (fallbackRes.ok) {
          lastSyncedChecksumRef.current = checksumStr;
          saveSucceeded = true;
          setJustSaved(true);
          setTimeout(() => setJustSaved(false), 3000);
          console.log("[SaveSync] Save written to global repository:", cleanGameId);
          if (typeof window !== "undefined" && window.parent && window.parent !== window) {
            window.parent.postMessage({ type: "VAULT_SAVE_STATUS", status: "saved" }, "*");
          }
        } else {
          if (!force) {
            lastSyncedChecksumRef.current = checksumStr;
          }
          if (typeof window !== "undefined" && window.parent && window.parent !== window) {
            window.parent.postMessage({ type: "VAULT_SAVE_STATUS", status: "error" }, "*");
          }
        }
      } catch (err) {
        if (!force) {
          lastSyncedChecksumRef.current = checksumStr;
        }
        console.warn("[SaveSync] Failed to push save:", err);
        if (typeof window !== "undefined" && window.parent && window.parent !== window) {
          window.parent.postMessage({ type: "VAULT_SAVE_STATUS", status: "error" }, "*");
        }
      } finally {
        isSavingRef.current = false;
        setIsSaving(false);
        if (!saveSucceeded && typeof window !== "undefined" && window.parent && window.parent !== window) {
          // Ensure parent modal is never left stuck on "saving"
          window.parent.postMessage({ type: "VAULT_SAVE_STATUS", status: "error" }, "*");
        }
      }
    },
    [cleanGameId, game.system]
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      const inFrame = window.self !== window.top;
      setIsInIframe(inFrame);

      const ua = navigator.userAgent || "";
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
      const isSmall = window.innerWidth < 768;
      const isCoarse = window.matchMedia("(pointer: coarse)").matches;
      setIsMobileDevice(!inFrame && (isMobileUA || isSmall || isCoarse));

      window.EJS_rumble = false;
      window.EJS_vibration = false;
      (window as unknown as Record<string, unknown>).EJS_disableRumble = true;

      const handleUnhandledRejection = (e: PromiseRejectionEvent) => {
        const reason = e.reason;
        const isExpectedError =
          reason?.name === "NotAllowedError" ||
          reason?.name === "SecurityError" ||
          reason?.message?.includes("requestFullscreen") ||
          reason?.message?.includes("user gesture") ||
          reason?.message?.includes("not visible") ||
          reason?.message?.includes("Permissions check failed");

        if (isExpectedError) {
          e.preventDefault();
        }
      };

      window.addEventListener("unhandledrejection", handleUnhandledRejection);
      return () => window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    }
  }, []);

  const activeDisc =
    game.discs && game.discs[selectedDiscIndex] ? game.discs[selectedDiscIndex] : null;

  const flushSaveNow = useCallback(async (): Promise<Uint8Array | null> => {
    const emu = window.EJS_emulator;
    if (!emu) return null;

    const isPs1 = game.system === "psx" || game.system === "ps1";

    try {
      if (typeof emu.gameManager?.saveSaveFiles === "function") {
        emu.gameManager.saveSaveFiles();
      } else if (typeof emu.saveSaveFiles === "function") {
        emu.saveSaveFiles();
      }

      const gm = emu.gameManager as Record<string, unknown> | undefined;
      const fs = gm?.FS as { syncfs?: (populate: boolean, cb: () => void) => void } | undefined;
      if (fs && typeof fs.syncfs === "function") {
        try {
          fs.syncfs(false, () => {});
        } catch {}
      }

      const rawBuffer =
        typeof emu.getSaveFile === "function"
          ? emu.getSaveFile()
          : typeof gm?.getSaveFile === "function"
          ? (gm.getSaveFile as () => Uint8Array | ArrayBuffer)()
          : (gm?.saveFile as Uint8Array | ArrayBuffer | undefined);

      if (rawBuffer && (rawBuffer as ArrayBuffer).byteLength > 0) {
        const uint8 = rawBuffer instanceof Uint8Array ? rawBuffer : new Uint8Array(rawBuffer);
        if (isPs1 && !isValidPs1MemoryCard(uint8)) {
          return null;
        }
        if (!isPs1) {
          SaveSyncService.triggerBeaconExit(
            "current",
            cleanGameId,
            game.system === "tabstationtoo" ? "tabstationtoo" : "emulatorjs",
            uint8
          );
        }
        await pushSaveToServer(uint8, true);
        return uint8;
      }
    } catch (err) {
      console.warn("[SaveSync] flushSaveNow error:", err);
    }
    return null;
  }, [cleanGameId, game.system, pushSaveToServer]);

  const stopEmulator = useCallback(async () => {
    await flushSaveNow();

    await new Promise((resolve) => setTimeout(resolve, 350));

    const existingScript = document.getElementById("ejs-loader-script");
    if (existingScript) existingScript.remove();

    if (window.EJS_emulator?.stop) {
      try {
        window.EJS_emulator.stop();
      } catch {}
    }

    if (containerRef.current) {
      containerRef.current.innerHTML = "";
    }
  }, [flushSaveNow]);

  useEffect(() => {
    return () => {
      stopEmulator();
    };
  }, [stopEmulator]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushSaveNow();
      }
    };
    const handlePageHide = () => {
      flushSaveNow();
    };
    // Intercept beforeunload in capture phase so attachment downloads or canceled navigations
    // do not trigger EmulatorJS's destructive beforeunload -> exit -> restart() -> Module.abort() handler
    const handleBeforeUnloadCapture = (e: BeforeUnloadEvent) => {
      flushSaveNow();
      e.stopImmediatePropagation();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handleBeforeUnloadCapture, true);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handleBeforeUnloadCapture, true);
    };
  }, [flushSaveNow]);

  const updatePadMode = useCallback(
    (_connected: boolean) => {
      if (game.system !== "psx" && game.system !== "ps1") return;

      // Keep pad1type as "standard" with "left_analog" mapping.
      // Forcing "dualshock" (device 5) causes the PCSX ReARMed WASM core to transmit
      // motor handshake packets via the Gamepad Haptic API, which trips low-voltage
      // cut-offs and crashes the Bluetooth MCU on desktop controllers (Xbox/PS4/PS5/8BitDo).
      if (window.EJS_coreSettings) {
        window.EJS_coreSettings.pcsx_rearmed_pad1type = "standard";
        window.EJS_coreSettings.pcsx_rearmed_analog_to_digital = "left_analog";
      }

      if (window.EJS_defaultOptions) {
        window.EJS_defaultOptions["input_player1_analog_dpad_mode"] = "1";
        window.EJS_defaultOptions["input_libretro_device_p1"] = "1";
      }

      const emu = window.EJS_emulator;
      if (emu) {
        try {
          if (typeof emu.setCoreSetting === "function") {
            emu.setCoreSetting("pcsx_rearmed_pad1type", "standard");
            emu.setCoreSetting("pcsx_rearmed_analog_to_digital", "left_analog");
          }
          if (emu.gameManager) {
            const gm = emu.gameManager;
            if (typeof gm.setOption === "function") {
              gm.setOption("pcsx_rearmed_pad1type", "standard");
              gm.setOption("pcsx_rearmed_analog_to_digital", "left_analog");
              gm.setOption("input_player1_analog_dpad_mode", "1");
              gm.setOption("input_libretro_device_p1", "1");
            }
            if (typeof gm.setVariable === "function") {
              gm.setVariable("pcsx_rearmed_pad1type", "standard");
              gm.setVariable("pcsx_rearmed_analog_to_digital", "left_analog");
              gm.setVariable("input_player1_analog_dpad_mode", "1");
            }
          }
        } catch (e) {
          console.warn("[Emulator] Core setting injection warning:", e);
        }
      }
    },
    [game.system]
  );

  useEffect(() => {
    const handleParentMessage = async (e: MessageEvent) => {
      if (e.data?.type === "VAULT_MP_P1_INPUT" || e.data?.type === "VAULT_MP_P2_INPUT") {
        const port = e.data.type === "VAULT_MP_P1_INPUT" ? 0 : 1;
        const btnIndex = Number(e.data.buttonIndex);
        const val = Number(e.data.value);
        if (!Number.isNaN(btnIndex) && !Number.isNaN(val)) {
          const winAny = window as unknown as {
            __VAULT_LIBRETRO_INPUT_LOG__?: Array<{ port: number; buttonIndex: number; value: number; timestamp: number }>;
          };
          if (!winAny.__VAULT_LIBRETRO_INPUT_LOG__) {
            winAny.__VAULT_LIBRETRO_INPUT_LOG__ = [];
          }
          winAny.__VAULT_LIBRETRO_INPUT_LOG__.push({
            port,
            buttonIndex: btnIndex,
            value: val,
            timestamp: Date.now(),
          });
          if (winAny.__VAULT_LIBRETRO_INPUT_LOG__.length > 200) {
            winAny.__VAULT_LIBRETRO_INPUT_LOG__.shift();
          }

          const emu = window.EJS_emulator;
          const gm = emu?.gameManager;
          try {
            if (gm && typeof gm.simulateInput === "function") {
              gm.simulateInput(port, btnIndex, val);
            } else if (gm?.functions && typeof gm.functions.simulateInput === "function") {
              gm.functions.simulateInput(port, btnIndex, val);
            }
          } catch {}
        }
        return;
      }

      // Game Boy / Game Boy Color Virtual Link Cable packet from peer over WebRTC
      if (e.data?.type === "VAULT_LINK_PACKET_IN") {
        const { kind, data, fast } = e.data;
        try {
          const emu = window.EJS_emulator as any;
          const mod = emu?.gameManager?.Module || (window as any).Module;
          if (mod && typeof mod._ejs_link_cable_receive === "function") {
            mod._ejs_link_cable_receive(Number(kind) || 0, Number(data) || 0, Number(fast) || 0);
          }
        } catch (err) {
          console.warn("[LinkCable] Error receiving link packet in iframe:", err);
        }
        return;
      }

      // Explicit trigger to start link cable session
      if (e.data?.type === "VAULT_LINK_CABLE_CONNECT") {
        const isHost = Boolean(e.data?.isHost);
        try {
          const emu = window.EJS_emulator as any;
          const mod = emu?.gameManager?.Module || (window as any).Module;
          if (mod && typeof mod._ejs_link_cable_start === "function") {
            console.log(`[LinkCable] Connecting link cable via message (${isHost ? "Host" : "Guest"})`);
            mod._ejs_link_cable_start(isHost ? 1 : 0);
          }
        } catch (err) {
          console.warn("[LinkCable] Error connecting link cable via message:", err);
        }
        return;
      }

      if (e.data?.type === "VAULT_SET_SHADER") {
        const shader = e.data.shader;
        if (typeof shader === "string") {
          setCurrentShader(shader);
          try {
            localStorage.setItem("rom_vault_shader_preset", shader);
          } catch {}
          const emu = window.EJS_emulator;
          if (emu && typeof emu.enableShader === "function") {
            emu.enableShader(shader);
          }
        }
        return;
      }

      if (e.data?.type === "VAULT_FORWARD_KEY") {
        const { eventType, key, code, keyCode } = e.data;
        const kbEvent = new KeyboardEvent(eventType, {
          key,
          code,
          keyCode,
          which: keyCode,
          bubbles: true,
          cancelable: true,
        });
        window.dispatchEvent(kbEvent);
        const gameElem = document.getElementById("game") || document.querySelector(".ejs_parent");
        if (gameElem) {
          gameElem.dispatchEvent(kbEvent);
        }
        return;
      }

      if (e.data?.type === "VAULT_MP_P1_INPUT") {
        const { buttonIndex, value } = e.data;
        const emu = window.EJS_emulator;
        const gm = emu?.gameManager;
        try {
          if (gm && typeof gm.simulateInput === "function") {
            gm.simulateInput(0, buttonIndex, value);
          } else if (gm?.functions && typeof gm.functions.simulateInput === "function") {
            gm.functions.simulateInput(0, buttonIndex, value);
          }
        } catch {}
        return;
      }

      if (e.data?.type === "GAMEPAD_PULSE" && e.data?.connected && bootState === "running") {
        updatePadMode(true);
      } else if (e.data?.type === "VAULT_FORCE_SAVE") {
        await flushSaveNow();
      } else if (e.data?.type === "VAULT_EXPORT_CARD") {
        const latestBytes = await flushSaveNow();
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(
            {
              type: "VAULT_EXPORT_CARD_DATA",
              buffer: latestBytes ? Array.from(latestBytes) : null,
            },
            "*"
          );
        }
      } else if (e.data?.type === "VAULT_SAVE_AND_EXIT") {
        await flushSaveNow();
        if (window.parent) {
          window.parent.postMessage({ type: "VAULT_EXIT_READY" }, "*");
        }
      }
    };

    window.addEventListener("message", handleParentMessage);
    return () => window.removeEventListener("message", handleParentMessage);
  }, [bootState, updatePadMode, flushSaveNow]);

  // Periodically flush in-memory SRAM / PS1 Memory Card changes to IDBFS & Cloud
  useEffect(() => {
    if (bootState !== "running") return;

    const intervalId = setInterval(() => {
      if (isSavingRef.current) return;
      const emu = window.EJS_emulator;
      const gm = emu?.gameManager;
      if (!gm) return;
      try {
        if (typeof gm.saveSaveFiles === "function") {
          gm.saveSaveFiles();
        }
      } catch {}
    }, 5000);

    return () => clearInterval(intervalId);
  }, [bootState]);

  useEffect(() => {
    if (bootState !== "running") return;

    let animId: number;
    let prevLibretroState: Record<number, boolean> = {};

    // Auto-focus emulator container on boot
    const container = document.querySelector("#mobile-emulator-container") as HTMLElement;
    if (container) {
      container.tabIndex = 0;
      container.focus();
    }

    // Ensure EmulatorJS keys and gamepad bindings are properly registered
    const emu = window.EJS_emulator as any;
    if (emu) {
      if (typeof emu.setupKeys === "function") {
        try { emu.setupKeys(); } catch {}
      }
      if (typeof emu.updateGamepadLabels === "function") {
        try { emu.updateGamepadLabels(); } catch {}
      }
    }

    const pollPhysicalStick = () => {
      const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
      const pad = Array.from(pads).find((p) => p && p.connected);

      if (pad) {
        // Auto-assign player 1 controller if not already bound
        if (emu && Array.isArray(emu.gamepadSelection)) {
          const padKey = `${pad.id}_${pad.index}`;
          if (!emu.gamepadSelection[0]) {
            emu.gamepadSelection[0] = padKey;
            if (typeof emu.updateGamepadLabels === "function") {
              try { emu.updateGamepadLabels(); } catch {}
            }
          }
        }

        const gm = emu?.gameManager;
        const sim = (gm && typeof gm.simulateInput === "function")
          ? gm.simulateInput.bind(gm)
          : (gm?.functions && typeof gm.functions.simulateInput === "function")
          ? gm.functions.simulateInput.bind(gm.functions)
          : null;

        const nextState = extractLibretroStateFromGamepad(pad as unknown as GamepadLike);
        const deltas = diffGamepadStates(prevLibretroState, nextState);
        if (deltas.length > 0) {
          prevLibretroState = nextState;
          for (const evt of deltas) {
            const val = evt.pressed ? 1 : 0;
            if (sim) {
              try {
                sim(0, evt.buttonIndex, val);
              } catch {}
            }

            // Keyboard event fallback for D-Pad directions
            if (evt.buttonIndex === 6) {
              window.dispatchEvent(
                new KeyboardEvent(evt.pressed ? "keydown" : "keyup", {
                  key: "ArrowLeft",
                  code: "ArrowLeft",
                  keyCode: 37,
                  which: 37,
                  bubbles: true,
                })
              );
            } else if (evt.buttonIndex === 7) {
              window.dispatchEvent(
                new KeyboardEvent(evt.pressed ? "keydown" : "keyup", {
                  key: "ArrowRight",
                  code: "ArrowRight",
                  keyCode: 39,
                  which: 39,
                  bubbles: true,
                })
              );
            } else if (evt.buttonIndex === 4) {
              window.dispatchEvent(
                new KeyboardEvent(evt.pressed ? "keydown" : "keyup", {
                  key: "ArrowUp",
                  code: "ArrowUp",
                  keyCode: 38,
                  which: 38,
                  bubbles: true,
                })
              );
            } else if (evt.buttonIndex === 5) {
              window.dispatchEvent(
                new KeyboardEvent(evt.pressed ? "keydown" : "keyup", {
                  key: "ArrowDown",
                  code: "ArrowDown",
                  keyCode: 40,
                  which: 40,
                  bubbles: true,
                })
              );
            }
          }
        }
      }

      animId = requestAnimationFrame(pollPhysicalStick);
    };

    animId = requestAnimationFrame(pollPhysicalStick);
    return () => cancelAnimationFrame(animId);
  }, [bootState]);

  useEffect(() => {
    if (bootState !== "running") return;

    const handleGamepadConnected = (e: GamepadEvent) => {
      const pad = e.gamepad;
      if (pad && pad.axes && pad.axes.length >= 2) {
        updatePadMode(true);
      }
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(
            {
              type: "VAULT_GAMEPAD_STATUS",
              connected: true,
              id: pad.id || "Controller",
            },
            "*"
          );
        }
      } catch {}
    };

    const handleGamepadDisconnected = () => {
      const stillConnected = checkPhysicalGamepadConnected();
      updatePadMode(stillConnected);
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(
            {
              type: "VAULT_GAMEPAD_STATUS",
              connected: stillConnected,
              id: stillConnected ? "Controller" : null,
            },
            "*"
          );
        }
      } catch {}
    };

    window.addEventListener("gamepadconnected", handleGamepadConnected);
    window.addEventListener("gamepaddisconnected", handleGamepadDisconnected);

    return () => {
      window.removeEventListener("gamepadconnected", handleGamepadConnected);
      window.removeEventListener("gamepaddisconnected", handleGamepadDisconnected);
    };
  }, [bootState, updatePadMode]);

  const handleStartGame = async () => {
    if (bootState !== "idle") return;
    setBootState("booting");
    setErrorMessage(null);

    try {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const tempCtx = new AudioCtx();
          if (tempCtx.state === "suspended") {
            tempCtx.resume();
          }
        }
      } catch {}

      let resolvedCardId: string | null = null;
      let loadUrl: string | undefined = undefined;
      let loadedCardName: string = "Cloud Memory Card";

      if (game.system === "psx" || game.system === "ps1") {
        try {
          const cardsRes = await fetch(
            `/roms/api/users/me/cards?system=${encodeURIComponent(game.system)}&_t=${Date.now()}`,
            { credentials: "include" }
          );
          if (cardsRes.ok) {
            const data = await cardsRes.json();
            resolvedCardId = data.activeSlot1Id || (data.cards && data.cards[0]?.id) || "active";
            const activeCard = data.cards?.find(
              (c: any) => c.id === resolvedCardId || c.slot_index === 1
            );
            if (activeCard?.card_name) {
              loadedCardName = activeCard.card_name;
            }
            setActiveCardId(resolvedCardId);
            activeCardIdRef.current = resolvedCardId;
            loadUrl = `/roms/api/users/me/cards/${encodeURIComponent(resolvedCardId || "active")}/download?system=${encodeURIComponent(
              game.system
            )}&_t=${Date.now()}`;
          }
        } catch (err) {
          console.warn("[MemoryCard] Could not fetch user cards:", err);
        }

        if (!loadUrl) {
          loadUrl = `/roms/api/saves/${encodeURIComponent(cleanGameId)}?system=${encodeURIComponent(
            game.system
          )}&_t=${Date.now()}`;
        }
      } else {
        loadUrl = `/roms/api/saves/${encodeURIComponent(cleanGameId)}?system=${encodeURIComponent(
          game.system
        )}&_t=${Date.now()}`;
      }

      // Pre-download cloud memory card / in-game save payload before emulator boot
      const isPs1 = game.system === "psx" || game.system === "ps1";
      let cloudBuffer: Uint8Array | null = null;
      if (!isPs1) {
        try {
          const cloudSave = await SaveSyncService.fetchCloudSave(cleanGameId, "savegame", 0);
          if (cloudSave?.bytes && cloudSave.bytes.byteLength > 0) {
            cloudBuffer = cloudSave.bytes;
            console.log("[SaveSync] Loaded authoritative database save from user_game_saves, bytes:", cloudBuffer.byteLength);
          }
        } catch (err) {
          console.warn("[SaveSync] Authoritative user_game_saves fetch warning:", err);
        }
      }

      if (!cloudBuffer && loadUrl) {
        try {
          const dlRes = await fetch(loadUrl, { credentials: "include" });
          if (dlRes.ok) {
            const ab = await dlRes.arrayBuffer();
            if (ab && ab.byteLength > 0) {
              const downloaded = new Uint8Array(ab);
              if (!isPs1 || isValidPs1MemoryCard(downloaded)) {
                cloudBuffer = downloaded;
                console.log("[SaveSync] Downloaded cloud save data, bytes:", ab.byteLength);
              } else {
                console.warn("[SaveSync] Ignoring invalid downloaded PS1 card buffer of size:", ab.byteLength);
              }
            }
          }
        } catch (e) {
          console.warn("[SaveSync] Could not fetch cloud save:", e);
        }
      }

      if (cloudBuffer && cloudBuffer.byteLength > 0) {
        lastSyncedChecksumRef.current = computeSaveChecksum(cloudBuffer);
      }
      let resolvedBootSaveBuffer: Uint8Array | null = cloudBuffer;
      const hasPriorSave = Boolean(cloudBuffer && cloudBuffer.byteLength > 0);
      hasPriorCloudSaveRef.current = hasPriorSave;
      console.log("[SaveSync] Prior cloud save exists in database:", hasPriorSave);

      if (typeof window !== "undefined") {
        const screenAny = (screen as unknown as { orientation?: { lock?: unknown } })?.orientation;
        if (screenAny && typeof screenAny.lock === "function") {
          try {
            screenAny.lock = () => Promise.resolve();
          } catch {}
        }

        const discNum = activeDisc ? activeDisc.discNumber : undefined;
        const discQuery = discNum ? `?disc=${discNum}` : "";

        const rawFileName = activeDisc ? activeDisc.fileName : game.romFileName;
        const fallbackExt = game.system === "mame" ? ".zip" : ".chd";
        const decodedRawName = rawFileName
          ? deepDecode(rawFileName).trim()
          : `${cleanGameId.includes("__") ? cleanGameId.split("__").slice(1).join("__") : game.title}${fallbackExt}`;
        const cleanFileName = isPs1
          ? decodedRawName.replace(/\.(bin|cue|zip)$/i, ".chd")
          : decodedRawName;
        const streamUrl = `/roms/api/roms/${encodeURIComponent(cleanGameId)}/stream/${encodeURIComponent(cleanFileName)}${discQuery}`;

        const baseWithoutExt = cleanFileName.replace(
          /\.(chd|rvz|iso|bin|cue|zip|7z|sfc|smc|nes|z64|v64|n64|gba|gbc|gb)$/i,
          ""
        );
        const strippedDisc = baseWithoutExt
          .replace(/[\s\(\[]+(?:disc|disk)\s*[^)\]]*[)\]]+/gi, "")
          .trim();

        const candidateNames = new Set<string>();
        candidateNames.add(`${baseWithoutExt}.srm`);
        candidateNames.add(`${strippedDisc}.srm`);
        candidateNames.add(`${strippedDisc} (Disc 1).srm`);
        candidateNames.add(`${strippedDisc} (Disc 2).srm`);
        candidateNames.add(`${strippedDisc} (Disc 3).srm`);
        candidateNames.add(`${strippedDisc} (Disc 4).srm`);
        candidateNames.add(`${deepDecode(game.title).trim()}.srm`);
        const candidateNamesArray = Array.from(candidateNames);

        const systemMeta = getSystemMeta(game.system);
        window.EJS_player = "#mobile-emulator-container";
        window.EJS_core = systemMeta.ejsCore || game.system;
        window.EJS_gameName = game.title;
        if (isPs1) {
          window.EJS_biosUrl = "/roms/api/bios/scph5501.bin?system=psx";
        } else if (game.system === "dreamcast") {
          window.EJS_biosUrl = "/roms/api/bios/dc_boot.bin?system=dreamcast";
        }
        window.EJS_gamePath = cleanFileName;
        window.EJS_disableCue = true;
        window.EJS_loadToMemory = true;
        window.EJS_CacheLimit = 32 * 1024 * 1024;
        window.EJS_threads = false;

        window.EJS_gameUrl = streamUrl;
        window.EJS_pathtodata = "/roms/emulatorjs/data/";
        window.EJS_language = "en-US";
        window.EJS_disableAutoLang = true;

        window.EJS_startOnLoaded = true;
        window.EJS_fullscreenOnLoad = false;

        window.EJS_rumble = false;
        window.EJS_vibration = false;
        (window as unknown as Record<string, unknown>).EJS_disableRumble = true;

        window.EJS_resolution = 1;
        window.EJS_volume = 1.0;
        window.EJS_audioBufferSize = 2048;
        window.EJS_sampleRate = 44100;

        // Game Boy & Game Boy Color Virtual Link Cable outbound packet bridge
        window.EJS_onLinkPacket = (kind: number, data: number, fast: number) => {
          if (window.parent && window.parent !== window) {
            window.parent.postMessage(
              {
                type: "VAULT_LINK_PACKET_OUT",
                kind,
                data,
                fast,
              },
              "*"
            );
          }
        };

        // Configure dual-controller mappings for Port 0 (Player 1) and Port 1 (Player 2)
        window.EJS_defaultControls = {
          0: {
            0: { value: "x", value2: "BUTTON_2" },
            1: { value: "s", value2: "BUTTON_4" },
            2: { value: "v", value2: "SELECT" },
            3: { value: "enter", value2: "START" },
            4: { value: "up arrow", value2: "DPAD_UP" },
            5: { value: "down arrow", value2: "DPAD_DOWN" },
            6: { value: "left arrow", value2: "DPAD_LEFT" },
            7: { value: "right arrow", value2: "DPAD_RIGHT" },
            8: { value: "z", value2: "BUTTON_1" },
            9: { value: "a", value2: "BUTTON_3" },
            10: { value: "q", value2: "LEFT_TOP_SHOULDER" },
            11: { value: "e", value2: "RIGHT_TOP_SHOULDER" },
            12: { value: "tab", value2: "LEFT_BOTTOM_SHOULDER" },
            13: { value: "r", value2: "RIGHT_BOTTOM_SHOULDER" },
          },
          1: {
            0: { value: "k", value2: "BUTTON_2" },
            1: { value: "j", value2: "BUTTON_4" },
            2: { value: "n", value2: "SELECT" },
            3: { value: "m", value2: "START" },
            4: { value: "i", value2: "DPAD_UP" },
            5: { value: "k", value2: "DPAD_DOWN" },
            6: { value: "j", value2: "DPAD_LEFT" },
            7: { value: "l", value2: "DPAD_RIGHT" },
            8: { value: "u", value2: "BUTTON_1" },
            9: { value: "o", value2: "BUTTON_3" },
            10: { value: "7", value2: "LEFT_TOP_SHOULDER" },
            11: { value: "9", value2: "RIGHT_TOP_SHOULDER" },
            12: { value: "6", value2: "LEFT_BOTTOM_SHOULDER" },
            13: { value: "0", value2: "RIGHT_BOTTOM_SHOULDER" },
          },
          2: {},
          3: {},
        };

        if (isPs1) {
          window.EJS_coreSettings = {
            pcsx_rearmed_cdfs_cache: "disabled",
            pcsx_rearmed_async_cd: "sync",
            pcsx_rearmed_drc: "enabled",
            pcsx_rearmed_neon_enhancement_enable: "disabled",
            pcsx_rearmed_neon_enhancement_no_main: "disabled",
            pcsx_rearmed_pad1type: "standard",
            pcsx_rearmed_pad2type: "standard",
            pcsx_rearmed_analog_to_digital: "left_analog",
            pcsx_rearmed_vibration: "disabled",
            enable_device_vibration: "false",
            pcsx_rearmed_rgb32_output: "enabled",
            pcsx_rearmed_dithering: "enabled",
          };

          window.EJS_defaultOptions = {
            "save-save-interval": "30",
            "autosave": "1",
            "pcsx_rearmed_cdfs_cache": "disabled",
            "pcsx_rearmed_async_cd": "sync",
            "pcsx_rearmed_memcard2": "disabled",
            "pcsx_rearmed_vibration": "disabled",
            "enable_device_vibration": "false",
            "pcsx_rearmed_rgb32_output": "enabled",
            "pcsx_rearmed_dithering": "enabled",
            "shader": currentShader,
            "input_player1_l_btn": "4",
            "input_player1_r_btn": "5",
            "input_player1_l2_btn": "6",
            "input_player1_r2_btn": "7",
            "input_player1_l3_btn": "10",
            "input_player1_r3_btn": "11",
            "input_player1_analog_dpad_mode": "1",
            "input_libretro_device_p1": "1",
            "input_libretro_device_p2": "1",
          };
        } else {
          window.EJS_defaultOptions = {
            ...(window.EJS_defaultOptions || {}),
            "save-save-interval": "30",
            shader: currentShader,
          };
        }

        // Sanitize broken or empty controlSettings from localStorage so emulator falls back to clean defaults
        try {
          const ejsCore = systemMeta.ejsCore || game.system;
          const storageKey = `ejs-1-${ejsCore}-${game.title}-settings`;
          const stored = localStorage.getItem(storageKey);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (!parsed?.controlSettings || Object.keys(parsed.controlSettings?.[0] || {}).length === 0) {
              localStorage.removeItem(storageKey);
              console.log("[ControlSanitizer] Purged empty controls key:", storageKey);
            }
          }
        } catch {}

        // Bridge: When Emscripten mounts /data/saves IDBFS, inject cloud memory card scoped strictly to this game
        window.EJS_onSaveDatabaseLoaded = (fs: any) => {
          try {
            if (!fs || typeof fs.readdir !== "function") return;

            const existingFiles: string[] = fs
              .readdir("/data/saves")
              .filter((f: string) => f !== "." && f !== "..");

            // Strictly scope local file inspection to candidate filenames for the current game
            const matchingFiles = filterCandidateSaveFiles(existingFiles, candidateNamesArray);

            let localSaveFound: Uint8Array | null = null;
            let isLocalNonBlank = false;

            for (const fn of matchingFiles) {
              try {
                const data = fs.readFile("/data/saves/" + fn);
                if (data && data.byteLength > 0) {
                  const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);
                  if (isPs1) {
                    if (!isValidPs1MemoryCard(uint8)) {
                      // Purge corrupted/cross-game residue (e.g. 2KB SNES .srm) from PS1 candidate path
                      console.warn("[SaveSync] Purging corrupted non-128KB PS1 save file in IDBFS:", fn, uint8.byteLength);
                      try {
                        fs.unlink("/data/saves/" + fn);
                      } catch {}
                      continue;
                    }
                    if (!isBlankPs1MemoryCard(uint8)) {
                      isLocalNonBlank = true;
                      localSaveFound = uint8;
                      break;
                    }
                  } else {
                    isLocalNonBlank = true;
                    localSaveFound = uint8;
                    break;
                  }
                }
              } catch {}
            }

            const isCloudNonBlank = isPs1
              ? Boolean(cloudBuffer && isValidPs1MemoryCard(cloudBuffer) && !isBlankPs1MemoryCard(cloudBuffer))
              : Boolean(cloudBuffer && cloudBuffer.byteLength > 0);

            let targetBuffer: Uint8Array | null = null;

            if (isCloudNonBlank && cloudBuffer) {
              targetBuffer = cloudBuffer;
              hasNonBlankSaveRef.current = true;
              lastSyncedChecksumRef.current = computeSaveChecksum(cloudBuffer);
              console.log("[SaveSync] Injected cloud memory card into emulator.");
            } else if (isLocalNonBlank && localSaveFound) {
              targetBuffer = localSaveFound;
              hasNonBlankSaveRef.current = true;
              console.log("[SaveSync] Found non-blank local save; rescuing to MariaDB cloud card.");
              pushSaveToServer(localSaveFound, true);
            } else if (cloudBuffer && (!isPs1 || isValidPs1MemoryCard(cloudBuffer))) {
              targetBuffer = cloudBuffer;
              hasNonBlankSaveRef.current = false;
              lastSyncedChecksumRef.current = computeSaveChecksum(cloudBuffer);
            }

            resolvedBootSaveBuffer = targetBuffer;

            if (targetBuffer) {
              // Write ONLY to candidateNamesArray for the active game — never overwrite other games in existingFiles!
              for (const name of candidateNamesArray) {
                try {
                  fs.writeFile("/data/saves/" + name, targetBuffer);
                } catch {}
              }

              if (typeof fs.syncfs === "function") {
                fs.syncfs(false, () => {
                  console.log("[SaveSync] Synced memory card to local IndexedDB.");
                });
              }

              if (window.parent && window.parent !== window) {
                window.parent.postMessage(
                  {
                    type: "VAULT_SAVE_STATUS",
                    status: "loaded",
                    cardName: loadedCardName,
                  },
                  "*"
                );
              }
            }
          } catch (err) {
            console.warn("[SaveSync] Error in saveDatabaseLoaded hook:", err);
          }
        };

        // Auto-save listeners during gameplay
        window.EJS_onSaveSaveFiles = (saveData: any) => {
          if (saveData) {
            const raw =
              saveData instanceof Uint8Array || saveData instanceof ArrayBuffer
                ? saveData
                : (saveData.data || saveData.save);
            if (raw) {
              const gm = window.EJS_emulator?.gameManager as Record<string, any> | undefined;
              if (gm?.FS && typeof gm.FS.syncfs === "function") {
                try {
                  gm.FS.syncfs(false, () => {});
                } catch {}
              }
              pushSaveToServer(raw);
            }
          }
        };

        window.EJS_onSaveSave = (saveData: any) => {
          if (saveData?.save) {
            pushSaveToServer(saveData.save);
          }
        };

        window.EJS_onSave = (saveData: any) => {
          if (saveData?.data) {
            pushSaveToServer(saveData.data);
          }
        };

        const applyAnalogMapping = () => {
          const emu = window.EJS_emulator;
          if (!emu) return;

          try {
            if (typeof emu.setCoreSetting === "function") {
              emu.setCoreSetting("pcsx_rearmed_pad1type", "standard");
              emu.setCoreSetting("pcsx_rearmed_analog_to_digital", "left_analog");
            }
            const gm = emu.gameManager;
            if (gm) {
              if (typeof gm.setOption === "function") {
                gm.setOption("pcsx_rearmed_pad1type", "standard");
                gm.setOption("pcsx_rearmed_analog_to_digital", "left_analog");
                gm.setOption("input_player1_analog_dpad_mode", "1");
              }
              if (typeof gm.setVariable === "function") {
                gm.setVariable("pcsx_rearmed_pad1type", "standard");
                gm.setVariable("pcsx_rearmed_analog_to_digital", "left_analog");
                gm.setVariable("input_player1_analog_dpad_mode", "1");
              }
            }
          } catch (e) {
            console.warn("[Emulator] Core setting injection warning:", e);
          }
        };

        const dismissSaveDropzone = () => {
          try {
            const emu = (window as unknown as { EJS_emulator?: { elements?: { statePopupPanel?: { parentElement?: HTMLElement } } } }).EJS_emulator;
            if (emu?.elements?.statePopupPanel?.parentElement) {
              emu.elements.statePopupPanel.parentElement.style.display = "none";
              try {
                emu.elements.statePopupPanel.parentElement.remove();
              } catch {}
            }
            const dropzones = containerRef.current?.querySelectorAll<HTMLElement>(
              ".ejs_popup_container, .ejs_state_dropzone_container"
            );
            dropzones?.forEach((dz) => {
              const text = dz.textContent?.toLowerCase() || "";
              if (text.includes("drop save") || text.includes("drop a save") || dz.classList.contains("ejs_state_dropzone_container")) {
                dz.style.display = "none";
                try {
                  dz.remove();
                } catch {}
              }
            });
          } catch {}
        };

        window.EJS_onStart = () => {
          setBootState("running");
          applyAnalogMapping();
          dismissSaveDropzone();
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: "VAULT_EMU_STARTED" }, "*");
          }

          // Check for Game Boy online virtual link cable mode
          try {
            const urlParams = new URLSearchParams(window.location.search);
            const mpRole = urlParams.get("multiplayer");
            if (mpRole === "link-host" || mpRole === "link-guest") {
              const isHost = mpRole === "link-host";
              const emu = window.EJS_emulator as any;
              const mod = emu?.gameManager?.Module || (window as any).Module;
              if (mod && typeof mod._ejs_link_cable_start === "function") {
                console.log(`[LinkCable] Gambatte Virtual Link Cable started (${isHost ? "Host" : "Guest"})`);
                mod._ejs_link_cable_start(isHost ? 1 : 0);
              }
              if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: "VAULT_LINK_CABLE_READY", role: mpRole }, "*");
              }
            }
          } catch (e) {
            console.warn("[LinkCable] Auto-start check error:", e);
          }
        };
        window.EJS_onGameStart = () => {
          setBootState("running");
          applyAnalogMapping();
          setTimeout(applyAnalogMapping, 500);
          setTimeout(applyAnalogMapping, 1500);
          dismissSaveDropzone();
          setTimeout(dismissSaveDropzone, 100);
          setTimeout(dismissSaveDropzone, 500);
          setTimeout(dismissSaveDropzone, 1500);
          try {
            const activePreset =
              (typeof window !== "undefined"
                ? localStorage.getItem("rom_vault_shader_preset")
                : null) || currentShader;
            const emu = window.EJS_emulator;
            if (emu && typeof emu.enableShader === "function") {
              emu.enableShader(activePreset);
            }
          } catch {}
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: "VAULT_EMU_STARTED" }, "*");
          }

          // Check for Game Boy online virtual link cable mode
          try {
            const urlParams = new URLSearchParams(window.location.search);
            const mpRole = urlParams.get("multiplayer");
            if (mpRole === "link-host" || mpRole === "link-guest") {
              const isHost = mpRole === "link-host";
              const emu = window.EJS_emulator as any;
              const mod = emu?.gameManager?.Module || (window as any).Module;
              if (mod && typeof mod._ejs_link_cable_start === "function") {
                console.log(`[LinkCable] Gambatte Virtual Link Cable started (${isHost ? "Host" : "Guest"})`);
                mod._ejs_link_cable_start(isHost ? 1 : 0);
              }
              if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: "VAULT_LINK_CABLE_READY", role: mpRole }, "*");
              }
            }
          } catch (e) {
            console.warn("[LinkCable] Auto-start check error:", e);
          }

          try {
            const emu = window.EJS_emulator;
            const gm = emu?.gameManager;
            if (gm && typeof gm.getSaveFilePath === "function") {
              const savePath = gm.getSaveFilePath();
              const fs = gm.FS as any;
              if (savePath && fs) {
                let authoritativeBuffer = resolvedBootSaveBuffer || cloudBuffer;

                // Protect against overwriting a valid non-blank local PS1 save at savePath with a blank cloud card
                if (isPs1 && (!authoritativeBuffer || isBlankPs1MemoryCard(authoritativeBuffer))) {
                  try {
                    if (fs.analyzePath(savePath).exists) {
                      const existingAtPath = fs.readFile(savePath);
                      const uint8AtPath =
                        existingAtPath instanceof Uint8Array
                          ? existingAtPath
                          : new Uint8Array(existingAtPath);
                      if (isValidPs1MemoryCard(uint8AtPath) && !isBlankPs1MemoryCard(uint8AtPath)) {
                        authoritativeBuffer = uint8AtPath;
                        resolvedBootSaveBuffer = uint8AtPath;
                        pushSaveToServer(uint8AtPath, true);
                      }
                    }
                  } catch {}
                }

                if (
                  authoritativeBuffer &&
                  authoritativeBuffer.byteLength > 0 &&
                  (!isPs1 || isValidPs1MemoryCard(authoritativeBuffer))
                ) {
                  console.log("[SaveSync] Authoritative save sync: mounting save path:", savePath);
                  try {
                    if (fs.analyzePath(savePath).exists) {
                      fs.unlink(savePath);
                    }
                  } catch {}
                  fs.writeFile(savePath, authoritativeBuffer);
                  if (typeof gm.loadSaveFiles === "function") {
                    gm.loadSaveFiles();
                  }
                }
              }
            }
          } catch (e) {
            console.warn("[SaveSync] Post-start verification warning:", e);
          }
        };

        const existingScript = document.getElementById("ejs-loader-script");
        if (existingScript) existingScript.remove();

        if (containerRef.current) {
          containerRef.current.innerHTML = "";
        }

        const script = document.createElement("script");
        script.id = "ejs-loader-script";
        script.src = `/roms/emulatorjs/data/loader.js?v=${Date.now()}`;
        script.async = true;

        script.onerror = () => {
          setBootState("error");
          setErrorMessage(
            "Failed to load /roms/emulatorjs/data/loader.js (Check static files or proxy)."
          );
        };

        document.body.appendChild(script);
      }
    } catch (err: unknown) {
      setBootState("error");
      setErrorMessage(err instanceof Error ? err.message : "Failed to boot emulator.");
    }
  };

  const hasAutoStartedRef = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined" && bootState === "idle" && !hasAutoStartedRef.current) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("autostart") === "1") {
        hasAutoStartedRef.current = true;
        handleStartGame();
      }
    }
  });

  const handleDiscSelect = (idx: number) => {
    if (idx === selectedDiscIndex) return;
    stopEmulator();
    setSelectedDiscIndex(idx);
    setBootState("idle");
    setErrorMessage(null);
  };

  const handleBackToLibrary = async () => {
    await stopEmulator();
    window.location.assign("/roms");
  };

  const handleManualFullscreen = () => {
    const el = document.getElementById("mobile-emulator-container");
    if (!el) return;
    try {
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      } else if (
        (el as unknown as { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen
      ) {
        (el as unknown as { webkitRequestFullscreen: () => void }).webkitRequestFullscreen();
      }
    } catch {}
  };

  // Safe navigation decorator: ensures controller configuration and menu popups
  // contain accessible header dismiss controls (Back / Close) and lift action buttons above mobile safe-areas
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const decoratePopup = (popup: HTMLElement) => {
      // Ignore sub-dialogs like key capture popup box
      if (popup.classList.contains("ejs_popup_box") || popup.hasAttribute("hidden")) return;

      const text = popup.textContent?.toLowerCase() || "";
      const isDropzone =
        popup.classList.contains("ejs_state_dropzone_container") ||
        text.includes("drop save state") ||
        text.includes("drop a save") ||
        text.includes("drop save");

      // Desktop save-state dropzone is permanently suppressed on mobile viewports
      if (isDropzone) {
        popup.style.display = "none";
        popup.style.pointerEvents = "none";
        try {
          popup.remove();
        } catch {}
        return;
      }

      if (popup.querySelector(".ejs_popup_header")) {
        return;
      }

      const titleEl = popup.querySelector("h4");
      const titleText = titleEl?.textContent?.trim() || "Control Settings";

      // Locate close button or handler in popup
      const closeBtnExisting = Array.from(popup.querySelectorAll<HTMLAnchorElement>(".ejs_button")).find(
        (b) => {
          const t = b.textContent?.trim().toLowerCase();
          return t === "close" || t === "done" || t === "back";
        }
      );

      const handleDismiss = (e?: Event) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (closeBtnExisting) {
          try {
            closeBtnExisting.click();
          } catch {}
        }
        popup.style.display = "none";
        popup.style.pointerEvents = "none";
      };

      const header = document.createElement("div");
      header.className = "ejs_popup_header";

      const backBtn = document.createElement("button");
      backBtn.type = "button";
      backBtn.className = "ejs_popup_back_btn";
      backBtn.setAttribute("aria-label", "Back");
      backBtn.innerHTML = '<span class="ejs_popup_back_arrow" aria-hidden="true">&#8249;</span> Back';
      backBtn.onclick = handleDismiss;
      backBtn.ontouchend = handleDismiss;

      const title = document.createElement("h4");
      title.className = "ejs_popup_title";
      title.textContent = titleText;

      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "ejs_popup_close_btn";
      closeBtn.setAttribute("aria-label", "Close");
      closeBtn.innerHTML = "&#10005;";
      closeBtn.onclick = handleDismiss;
      closeBtn.ontouchend = handleDismiss;

      header.appendChild(backBtn);
      header.appendChild(title);
      header.appendChild(closeBtn);

      if (titleEl) {
        titleEl.replaceWith(header);
      } else {
        popup.insertBefore(header, popup.firstChild);
      }

      // Ensure footer wraps bottom action buttons if not already wrapped
      if (!popup.querySelector(".ejs_popup_footer")) {
        const buttons = Array.from(popup.children).filter((c) =>
          c.classList.contains("ejs_button")
        );
        if (buttons.length > 0) {
          const footer = document.createElement("div");
          footer.className = "ejs_popup_footer";
          buttons.forEach((btn) => footer.appendChild(btn));
          popup.appendChild(footer);
        }
      }

      // Guarantee immediate touch response for footer action buttons
      popup.querySelectorAll<HTMLElement>(".ejs_popup_footer .ejs_button").forEach((btn) => {
        if (!btn.dataset.touchBound) {
          btn.dataset.touchBound = "true";
          btn.addEventListener(
            "touchend",
            (e) => {
              e.preventDefault();
              btn.click();
            },
            { passive: false }
          );
        }
      });
    };

    // Decorate any existing popups already rendered
    container.querySelectorAll<HTMLElement>(".ejs_popup_container").forEach(decoratePopup);

    const observer = new MutationObserver(() => {
      container.querySelectorAll<HTMLElement>(".ejs_popup_container").forEach(decoratePopup);
    });

    observer.observe(container, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
    };
  }, []);

  if (isMobileDevice && isDesktopOnlySystem(game.system)) {
    return <MobileDesktopRequired game={game} />;
  }

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-black overflow-hidden select-none">
      <style>{`
        :root {
          --ejs-virtual-pad-bottom-offset: calc(env(safe-area-inset-bottom, 0px) + clamp(180px, 24vh, 260px));
        }

        @media (orientation: landscape) {
          :root {
            --ejs-virtual-pad-bottom-offset: calc(env(safe-area-inset-bottom, 0px) + 24px);
          }
        }

        #mobile-emulator-container {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 100% !important;
          height: 100% !important;
          position: relative !important;
          margin: 0 auto !important;
          overflow: hidden !important;
        }

        /* Portrait Canvas Scaling: Restrict canvas parent area to the upper viewport above lifted controls */
        @media (orientation: portrait) {
          #mobile-emulator-container .ejs_canvas_parent,
          #mobile-emulator-container #ejs_parent .ejs_canvas_parent {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: calc(var(--ejs-virtual-pad-bottom-offset) + 140px) !important;
            width: 100% !important;
            height: auto !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 8px !important;
            box-sizing: border-box !important;
          }

          #mobile-emulator-container canvas,
          #mobile-emulator-container .ejs_canvas {
            display: block !important;
            margin: auto !important;
            max-width: 100% !important;
            max-height: 100% !important;
            object-fit: contain !important;
          }
        }

        /* Landscape Canvas Scaling: Occupy full height with controls flanking in horizontal pillarboxes */
        @media (orientation: landscape) {
          #mobile-emulator-container .ejs_canvas_parent,
          #mobile-emulator-container #ejs_parent .ejs_canvas_parent {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100% !important;
            height: 100% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            box-sizing: border-box !important;
          }

          #mobile-emulator-container canvas,
          #mobile-emulator-container .ejs_canvas {
            display: block !important;
            margin: auto !important;
            max-width: 100% !important;
            max-height: 100% !important;
            object-fit: contain !important;
          }
        }

        #mobile-emulator-container > div,
        #mobile-emulator-container #ejs_parent,
        #mobile-emulator-container canvas {
          margin: 0 auto !important;
        }

        #mobile-emulator-container #ejs_start_button,
        #mobile-emulator-container .ejs_start_btn {
          display: none !important;
        }

        /* Virtual Gamepad Deck Layout & Touch Isolation */
        #mobile-emulator-container .ejs_virtualGamepad_parent,
        .ejs_virtualGamepad_parent {
          width: 100% !important;
          position: absolute !important;
          bottom: var(--ejs-virtual-pad-bottom-offset) !important;
          left: 0 !important;
          right: 0 !important;
          pointer-events: none !important;
          z-index: 30 !important;
        }

        #mobile-emulator-container .ejs_virtualGamepad_parent > *,
        .ejs_virtualGamepad_parent > * {
          pointer-events: auto !important;
        }

        /* Directional Controls (D-Pad & Analog Stick) */
        #mobile-emulator-container .ejs_virtualGamepad_left,
        .ejs_virtualGamepad_left {
          position: absolute !important;
          bottom: 0 !important;
          left: max(16px, env(safe-area-inset-left, 0px)) !important;
          width: 140px !important;
          height: 140px !important;
          touch-action: none !important;
        }

        /* Action Buttons (A, B, X, Y) */
        #mobile-emulator-container .ejs_virtualGamepad_right,
        .ejs_virtualGamepad_right {
          position: absolute !important;
          bottom: 0 !important;
          right: max(16px, env(safe-area-inset-right, 0px)) !important;
          width: 140px !important;
          height: 140px !important;
          touch-action: none !important;
        }

        /* Center Control Deck (Select, Start, Speed Toggles) */
        #mobile-emulator-container .ejs_virtualGamepad_bottom,
        .ejs_virtualGamepad_bottom {
          position: absolute !important;
          bottom: -45px !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
          margin-left: 0 !important;
          height: 32px !important;
          width: 140px !important;
          touch-action: none !important;
        }

        /* Upper Deck (L, R, Z Shoulders) */
        #mobile-emulator-container .ejs_virtualGamepad_top,
        .ejs_virtualGamepad_top {
          position: absolute !important;
          bottom: 145px !important;
          width: 100% !important;
          left: 0 !important;
          right: 0 !important;
          touch-action: none !important;
        }

        #mobile-emulator-container .ejs_virtualGamepad_top .b_l {
          left: max(16px, env(safe-area-inset-left, 0px)) !important;
        }

        #mobile-emulator-container .ejs_virtualGamepad_top .b_r {
          right: max(16px, env(safe-area-inset-right, 0px)) !important;
        }

        /* Modal Overlay & Controller Mapping Menu Styling */
        #mobile-emulator-container .ejs_popup_container {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          width: 100% !important;
          height: 100% !important;
          max-height: 100% !important;
          flex-direction: column !important;
          background: rgba(10, 10, 14, 0.96) !important;
          backdrop-filter: blur(12px) !important;
          -webkit-backdrop-filter: blur(12px) !important;
          z-index: 9999 !important;
          overflow: hidden !important;
          box-sizing: border-box !important;
        }

        /* Enforce display: none for pre-initialized hidden dialogs (Controls, Cheats, Netplay) */
        #mobile-emulator-container .ejs_popup_container[style*="display: none"],
        #mobile-emulator-container .ejs_popup_container[style*="display:none"],
        #mobile-emulator-container .ejs_popup_container[hidden] {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }

        /* Only render visible when explicitly opened by user via hamburger menu / buttons */
        #mobile-emulator-container .ejs_popup_container:not([style*="display: none"]):not([style*="display:none"]):not([hidden]) {
          display: flex !important;
        }

        #mobile-emulator-container .ejs_popup_header {
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          width: 100% !important;
          min-height: 48px !important;
          padding: max(8px, env(safe-area-inset-top, 0px)) max(12px, env(safe-area-inset-right, 0px)) 8px max(12px, env(safe-area-inset-left, 0px)) !important;
          background: rgba(18, 18, 24, 0.98) !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.12) !important;
          flex-shrink: 0 !important;
          box-sizing: border-box !important;
          gap: 8px !important;
        }

        #mobile-emulator-container .ejs_popup_back_btn {
          display: inline-flex !important;
          align-items: center !important;
          gap: 4px !important;
          background: rgba(99, 102, 241, 0.18) !important;
          border: 1px solid rgba(99, 102, 241, 0.4) !important;
          color: #a5b4fc !important;
          font-size: 14px !important;
          font-weight: 600 !important;
          border-radius: 8px !important;
          padding: 6px 12px !important;
          min-height: 36px !important;
          cursor: pointer !important;
          touch-action: manipulation !important;
          flex-shrink: 0 !important;
        }

        #mobile-emulator-container .ejs_popup_back_btn:active {
          background: rgba(99, 102, 241, 0.35) !important;
          color: #ffffff !important;
          transform: scale(0.97) !important;
        }

        #mobile-emulator-container .ejs_popup_title,
        #mobile-emulator-container .ejs_popup_container h4 {
          color: #f4f4f5 !important;
          font-size: 16px !important;
          font-weight: 700 !important;
          margin: 0 !important;
          padding: 0 !important;
          text-align: center !important;
          flex: 1 !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }

        #mobile-emulator-container .ejs_popup_close_btn {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 36px !important;
          height: 36px !important;
          background: rgba(255, 255, 255, 0.1) !important;
          border: 1px solid rgba(255, 255, 255, 0.2) !important;
          color: #e4e4e7 !important;
          font-size: 16px !important;
          font-weight: 700 !important;
          border-radius: 8px !important;
          cursor: pointer !important;
          touch-action: manipulation !important;
          flex-shrink: 0 !important;
        }

        #mobile-emulator-container .ejs_popup_close_btn:active {
          background: rgba(255, 255, 255, 0.2) !important;
          color: #ffffff !important;
          transform: scale(0.97) !important;
        }

        #mobile-emulator-container .ejs_popup_body,
        #mobile-emulator-container .ejs_control_body {
          flex: 1 1 0% !important;
          height: auto !important;
          min-height: 0 !important;
          max-height: 100% !important;
          width: 100% !important;
          overflow-y: auto !important;
          -webkit-overflow-scrolling: touch !important;
          overscroll-behavior: contain !important;
          padding: 12px 16px 24px !important;
          box-sizing: border-box !important;
        }

        #mobile-emulator-container .ejs_popup_footer {
          display: flex !important;
          flex-wrap: wrap !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 12px !important;
          width: 100% !important;
          flex-shrink: 0 !important;
          margin-top: auto !important;
          padding: 14px 16px max(79px, calc(env(safe-area-inset-bottom, 0px) + 63px)) 16px !important;
          background: rgba(18, 18, 24, 0.98) !important;
          border-top: 1px solid rgba(255, 255, 255, 0.15) !important;
          box-sizing: border-box !important;
          z-index: 20 !important;
        }

        #mobile-emulator-container .ejs_button,
        #mobile-emulator-container .ejs_popup_container .ejs_button {
          border-radius: 8px !important;
          font-size: 15px !important;
          font-weight: 700 !important;
          min-height: 44px !important;
          min-width: 80px !important;
          padding: 10px 20px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          background-color: rgba(var(--ejs-primary-color, 99, 102, 241), 1) !important;
          margin: 4px 6px !important;
          color: #fff !important;
          touch-action: manipulation !important;
          cursor: pointer !important;
          text-decoration: none !important;
        }

        #mobile-emulator-container .ejs_control_set_button {
          touch-action: manipulation !important;
          min-height: 32px !important;
          min-width: 50px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          border-radius: 6px !important;
          font-weight: 600 !important;
        }

        #mobile-emulator-container .ejs_control_cancel_button {
          margin-left: 8px !important;
          background-color: rgba(255, 255, 255, 0.15) !important;
          border: 1px solid rgba(255, 255, 255, 0.25) !important;
          color: #e4e4e7 !important;
        }

        /* Save Dropzone is strictly for desktop drag-and-drop; permanently suppressed on mobile */
        #mobile-emulator-container .ejs_state_dropzone_container,
        #mobile-emulator-container .ejs_popup_container.ejs_state_dropzone_container {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
      `}</style>

      {/* Top Header when running standalone (not in modal iframe) */}
      {!isInIframe && (
        <div className="w-full shrink-0 z-50 flex items-center justify-between p-3.5 bg-zinc-950/95 border-b border-white/10">
          <div className="flex items-center gap-2">
            <button
              onClick={handleBackToLibrary}
              className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md bg-zinc-800/80 text-zinc-200 backdrop-blur active:bg-zinc-700 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /> Library
            </button>

            {bootState === "running" && (
              <button
                type="button"
                onClick={() => flushSaveNow()}
                disabled={isSaving}
                className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md transition cursor-pointer shadow-sm ${
                  justSaved
                    ? "bg-emerald-600 text-white"
                    : isSaving
                    ? "bg-amber-600/80 text-white animate-pulse"
                    : "bg-emerald-700/80 hover:bg-emerald-600 active:bg-emerald-800 text-white"
                }`}
                title="Force Cloud Memory Card Save"
              >
                {justSaved ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSaving ? "Saving..." : "Save Card"}</span>
                  </>
                )}
              </button>
            )}

            {bootState === "running" && (
              <button
                type="button"
                onClick={handleCycleShader}
                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md bg-purple-950/70 hover:bg-purple-900 border border-purple-500/30 text-purple-200 backdrop-blur transition cursor-pointer"
                title={`Visual Filter: ${getShaderPresetById(currentShader).name} (Click to switch)`}
              >
                <Tv className="w-3.5 h-3.5 text-purple-400" />
                <span className="hidden sm:inline">{getShaderPresetById(currentShader).name}</span>
              </button>
            )}

            {game.discs && game.discs.length > 1 && (
              <div className="flex items-center gap-1 bg-zinc-900/80 p-0.5 rounded-md border border-white/10 backdrop-blur">
                <Disc3 className="w-3.5 h-3.5 text-red-400 ml-1.5 mr-0.5" />
                {game.discs.map((disc: AdditionalDisc, idx: number) => (
                  <button
                    key={disc.discNumber}
                    type="button"
                    onClick={() => handleDiscSelect(idx)}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold transition cursor-pointer ${
                      idx === selectedDiscIndex
                        ? "bg-red-600 text-white shadow"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    D{disc.discNumber}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isSaving && (
              <span className="flex items-center gap-1 text-[11px] text-indigo-400 bg-indigo-950/60 border border-indigo-500/30 px-2 py-0.5 rounded-full animate-pulse">
                <Save className="w-3 h-3" /> Syncing Card...
              </span>
            )}
            <span className="text-xs text-zinc-300 font-medium truncate max-w-[120px] sm:max-w-[220px]">
              {game.title}
            </span>
          </div>

          <button
            onClick={handleManualFullscreen}
            className="p-1.5 rounded-md bg-zinc-800/80 text-zinc-200 backdrop-blur active:bg-zinc-700 transition cursor-pointer"
            title="Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Dedicated Emulator Mount Sub-Container */}
      <div className="relative w-full flex-1 flex items-center justify-center bg-black overflow-hidden">
        <div
          id="mobile-emulator-container"
          ref={containerRef}
          className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden"
        />

        {/* 1. Idle Pre-Launch Shield */}
        {bootState === "idle" && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm p-4 text-center">
            <div className="flex flex-col items-center justify-center max-w-sm w-full mx-auto space-y-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                {game.system.toUpperCase()} • Direct Boot
              </div>

              <h3 className="text-lg font-bold text-zinc-100 truncate max-w-full">
                {game.title}
              </h3>

              <button
                type="button"
                onClick={handleStartGame}
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-sm tracking-wide shadow-lg shadow-indigo-500/30 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Start Game</span>
              </button>

              <p className="text-xs text-zinc-500">
                Tap to mount Cloud Memory Card & audio context
              </p>
            </div>
          </div>
        )}

        {/* 2. Booting / Compilation Spinner */}
        {bootState === "booting" && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/95 p-4 text-center">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm font-semibold text-zinc-200">
              Mounting Cloud Memory Card & Core...
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              Downloading save state & streaming game data
            </p>
          </div>
        )}

        {/* 3. Error Fallback */}
        {bootState === "error" && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/95 p-6 text-center">
            <AlertCircle className="w-10 h-10 text-rose-500 mb-3" />
            <p className="text-sm font-semibold text-rose-400 mb-2">Launch Error</p>
            <p className="text-xs text-zinc-400 mb-4">{errorMessage}</p>
            <button
              onClick={handleBackToLibrary}
              className="text-xs px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md font-semibold transition cursor-pointer"
            >
              Return to Library
            </button>
          </div>
        )}
      </div>
    </div>
  );
}