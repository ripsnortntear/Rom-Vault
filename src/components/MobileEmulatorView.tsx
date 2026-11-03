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
  const activeCardIdRef = useRef<string | null>(null);
  activeCardIdRef.current = activeCardId;
  const lastSyncedChecksumRef = useRef<string | null>(null);
  const isSavingRef = useRef<boolean>(false);

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

      // Do not automatically upload an untouched blank PS1 card on initial boot
      if (isPs1 && !force && isBlankPs1MemoryCard(uint8) && lastSyncedChecksumRef.current === null) {
        lastSyncedChecksumRef.current = checksumStr;
        return;
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
              keepalive: true,
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
            console.warn("[SaveSync] PS1 Memory Card sync returned non-OK status:", res.status);
            if (typeof window !== "undefined" && window.parent && window.parent !== window) {
              window.parent.postMessage({ type: "VAULT_SAVE_STATUS", status: "error" }, "*");
            }
          }
          return;
        }

        // 2. Non-PlayStation Global Game Save Sync
        const fallbackRes = await fetch(
          `/roms/api/saves/${encodeURIComponent(cleanGameId)}?system=${encodeURIComponent(game.system)}`,
          {
            credentials: "include",
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: blob,
            keepalive: true,
          }
        );

        // Also push to authoritative user_game_saves for non-PlayStation platforms
        SaveSyncService.uploadCloudSave(cleanGameId, uint8, "savestate", 0).catch((err) => {
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
        } else if (typeof window !== "undefined" && window.parent && window.parent !== window) {
          window.parent.postMessage({ type: "VAULT_SAVE_STATUS", status: "error" }, "*");
        }
      } catch (err) {
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
    const DEADZONE = 0.4;
    const lastAxesState = { up: false, down: false, left: false, right: false };

    const pollPhysicalStick = () => {
      const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
      const pad = Array.from(pads).find((p) => p && p.connected && p.axes && p.axes.length >= 2);

      if (pad) {
        const axisX = pad.axes[0] || 0;
        const axisY = pad.axes[1] || 0;

        const left = axisX < -DEADZONE;
        const right = axisX > DEADZONE;
        const up = axisY < -DEADZONE;
        const down = axisY > DEADZONE;

        if (left !== lastAxesState.left) {
          window.dispatchEvent(
            new KeyboardEvent(left ? "keydown" : "keyup", {
              key: "ArrowLeft",
              code: "ArrowLeft",
              bubbles: true,
            })
          );
          lastAxesState.left = left;
        }
        if (right !== lastAxesState.right) {
          window.dispatchEvent(
            new KeyboardEvent(right ? "keydown" : "keyup", {
              key: "ArrowRight",
              code: "ArrowRight",
              bubbles: true,
            })
          );
          lastAxesState.right = right;
        }
        if (up !== lastAxesState.up) {
          window.dispatchEvent(
            new KeyboardEvent(up ? "keydown" : "keyup", {
              key: "ArrowUp",
              code: "ArrowUp",
              bubbles: true,
            })
          );
          lastAxesState.up = up;
        }
        if (down !== lastAxesState.down) {
          window.dispatchEvent(
            new KeyboardEvent(down ? "keydown" : "keyup", {
              key: "ArrowDown",
              code: "ArrowDown",
              bubbles: true,
            })
          );
          lastAxesState.down = down;
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

      // Pre-download cloud memory card / save state payload before emulator boot
      const isPs1 = game.system === "psx" || game.system === "ps1";
      let cloudBuffer: Uint8Array | null = null;
      if (!isPs1) {
        try {
          const cloudSave = await SaveSyncService.fetchCloudSave(cleanGameId, "savestate", 0);
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

      if (typeof window !== "undefined") {
        const screenAny = (screen as unknown as { orientation?: { lock?: unknown } })?.orientation;
        if (screenAny && typeof screenAny.lock === "function") {
          try {
            screenAny.lock = () => Promise.resolve();
          } catch {}
        }

        const discNum = activeDisc ? activeDisc.discNumber : undefined;
        const discQuery = discNum ? `?disc=${discNum}` : "";

        const streamUrl = `/roms/api/roms/${encodeURIComponent(cleanGameId)}/stream${discQuery}`;
        const rawFileName = activeDisc ? activeDisc.fileName : game.romFileName;
        const cleanFileName = (
          rawFileName ? deepDecode(rawFileName).trim() : game.title + ".chd"
        ).replace(/\.(bin|cue|zip)$/i, ".chd");

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
              lastSyncedChecksumRef.current = computeSaveChecksum(cloudBuffer);
              console.log("[SaveSync] Injected cloud memory card into emulator.");
            } else if (isLocalNonBlank && localSaveFound) {
              targetBuffer = localSaveFound;
              console.log("[SaveSync] Found non-blank local save; rescuing to MariaDB cloud card.");
              pushSaveToServer(localSaveFound, true);
            } else if (cloudBuffer && (!isPs1 || isValidPs1MemoryCard(cloudBuffer))) {
              targetBuffer = cloudBuffer;
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

        window.EJS_onStart = () => {
          setBootState("running");
          applyAnalogMapping();
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: "VAULT_EMU_STARTED" }, "*");
          }
        };
        window.EJS_onGameStart = () => {
          setBootState("running");
          applyAnalogMapping();
          setTimeout(applyAnalogMapping, 500);
          setTimeout(applyAnalogMapping, 1500);
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

  if (isMobileDevice && isDesktopOnlySystem(game.system)) {
    return <MobileDesktopRequired game={game} />;
  }

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-black overflow-hidden select-none">
      <style>{`
        #mobile-emulator-container {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 100% !important;
          height: 100% !important;
          position: relative !important;
          margin: 0 auto !important;
        }

        #mobile-emulator-container canvas {
          display: block !important;
          margin: auto !important;
          max-width: 100% !important;
          max-height: 100% !important;
          object-fit: contain !important;
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
                {game.discs.map((disc, idx) => (
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