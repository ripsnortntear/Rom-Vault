"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowLeft, Maximize2, Disc3, Play, AlertCircle, Save } from "lucide-react";

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
    EJS_onStart?: () => void;
    EJS_onGameStart?: () => void;
    EJS_coreSettings?: Record<string, string>;
    EJS_defaultOptions?: Record<string, string>;
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
      gameManager?: {
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [bootState, setBootState] = useState<"idle" | "booting" | "running" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedDiscIndex, setSelectedDiscIndex] = useState<number>(0);
  const [isInIframe, setIsInIframe] = useState<boolean>(false);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const cleanGameId = deepDecode(game.id).trim();
  const activeCardIdRef = useRef<string | null>(null);
  activeCardIdRef.current = activeCardId;

  // Unified save pusher: syncs to card slot if available, else falls back to game save route
  const pushSaveToServer = useCallback(async (buffer: ArrayBuffer | Uint8Array) => {
    if (!buffer || buffer.byteLength === 0) return;
    const cardId = activeCardIdRef.current;

    try {
      setIsSaving(true);
      const blob = new Blob([buffer as any]);

      if (cardId) {
        const res = await fetch(`/roms/api/users/me/cards/${encodeURIComponent(cardId)}/sync`, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: blob,
                  });
        if (res.ok) {
          console.log("[SaveSync] Card synchronized to slot:", cardId);
          return;
        }
      }

      // Fallback: save directly to game saves route
      await fetch(`/roms/api/saves/${encodeURIComponent(cleanGameId)}?system=${encodeURIComponent(game.system)}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: blob,
              });
      console.log("[SaveSync] Save written to game save repository.");
    } catch (err) {
      console.warn("[SaveSync] Failed to push save:", err);
    } finally {
      setIsSaving(false);
    }
  }, [cleanGameId, game.system]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsInIframe(window.self !== window.top);

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

  const activeDisc = game.discs && game.discs[selectedDiscIndex] ? game.discs[selectedDiscIndex] : null;

  const stopEmulator = useCallback(async () => {
    const emu = window.EJS_emulator;
    if (emu) {
      try {
        if (typeof emu.gameManager?.saveSaveFiles === "function") {
          emu.gameManager.saveSaveFiles();
        } else if (typeof emu.saveSaveFiles === "function") {
          emu.saveSaveFiles();
        }

        const gm = emu.gameManager as Record<string, unknown> | undefined;
        const rawBuffer =
          typeof emu.getSaveFile === "function"
            ? emu.getSaveFile()
            : typeof gm?.getSaveFile === "function"
            ? (gm.getSaveFile as () => Uint8Array | ArrayBuffer)()
            : (gm?.saveFile as Uint8Array | ArrayBuffer | undefined);

        if (rawBuffer && rawBuffer.byteLength > 0) {
          await pushSaveToServer(rawBuffer);
        }
      } catch (e) {
        console.warn("[Emulator] Flush save error:", e);
      }
    }

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
  }, [pushSaveToServer]);

  useEffect(() => {
    return () => {
      stopEmulator();
    };
  }, [stopEmulator]);

  const updatePadMode = useCallback((connected: boolean) => {
    if (game.system !== "psx" && game.system !== "ps1") return;

    if (window.EJS_coreSettings) {
      window.EJS_coreSettings.pcsx_rearmed_pad1type = connected ? "dualshock" : "standard";
      window.EJS_coreSettings.pcsx_rearmed_analog_to_digital = connected ? "left_analog" : "disabled";
    }

    if (window.EJS_defaultOptions) {
      window.EJS_defaultOptions["input_player1_analog_dpad_mode"] = connected ? "1" : "0";
      window.EJS_defaultOptions["input_libretro_device_p1"] = connected ? "5" : "1";
    }

    const emu = window.EJS_emulator;
    if (emu) {
      try {
        if (typeof emu.setCoreSetting === "function") {
          emu.setCoreSetting("pcsx_rearmed_pad1type", connected ? "dualshock" : "standard");
          emu.setCoreSetting("pcsx_rearmed_analog_to_digital", connected ? "left_analog" : "disabled");
        }
        if (emu.gameManager) {
          const gm = emu.gameManager;
          if (typeof gm.setOption === "function") {
            gm.setOption("pcsx_rearmed_pad1type", connected ? "dualshock" : "standard");
            gm.setOption("pcsx_rearmed_analog_to_digital", connected ? "left_analog" : "disabled");
            gm.setOption("input_player1_analog_dpad_mode", connected ? "1" : "0");
            gm.setOption("input_libretro_device_p1", connected ? "5" : "1");
          }
          if (typeof gm.setVariable === "function") {
            gm.setVariable("pcsx_rearmed_pad1type", connected ? "dualshock" : "standard");
            gm.setVariable("pcsx_rearmed_analog_to_digital", connected ? "left_analog" : "disabled");
            gm.setVariable("input_player1_analog_dpad_mode", connected ? "1" : "0");
          }
        }
      } catch {}
    }
  }, [game.system]);

  useEffect(() => {
    const handleParentMessage = (e: MessageEvent) => {
      if (e.data?.type === "GAMEPAD_PULSE" && e.data?.connected && bootState === "running") {
        updatePadMode(true);
      } else if (e.data?.type === "VAULT_SAVE_AND_EXIT") {
        stopEmulator();
        if (window.parent) {
          window.parent.postMessage({ type: "VAULT_EXIT_READY" }, "*");
        }
      }
    };

    window.addEventListener("message", handleParentMessage);
    return () => window.removeEventListener("message", handleParentMessage);
  }, [bootState, updatePadMode, stopEmulator]);

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
          window.dispatchEvent(new KeyboardEvent(left ? "keydown" : "keyup", { key: "ArrowLeft", code: "ArrowLeft", bubbles: true }));
          lastAxesState.left = left;
        }
        if (right !== lastAxesState.right) {
          window.dispatchEvent(new KeyboardEvent(right ? "keydown" : "keyup", { key: "ArrowRight", code: "ArrowRight", bubbles: true }));
          lastAxesState.right = right;
        }
        if (up !== lastAxesState.up) {
          window.dispatchEvent(new KeyboardEvent(up ? "keydown" : "keyup", { key: "ArrowUp", code: "ArrowUp", bubbles: true }));
          lastAxesState.up = up;
        }
        if (down !== lastAxesState.down) {
          window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { key: "ArrowDown", code: "ArrowDown", bubbles: true }));
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
    };

    const handleGamepadDisconnected = () => {
      const stillConnected = checkPhysicalGamepadConnected();
      updatePadMode(stillConnected);
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

      if (game.system === "psx" || game.system === "ps1") {
        try {
          const cardsRes = await fetch("/roms/api/users/me/cards", { credentials: "include" });
          if (cardsRes.ok) {
            const data = await cardsRes.json();
            resolvedCardId = data.activeSlot1Id || (data.cards && data.cards[0]?.id) || null;
            setActiveCardId(resolvedCardId);
            if (resolvedCardId) {
              loadUrl = `/roms/api/users/me/cards/${encodeURIComponent(resolvedCardId)}/download`;
            }
          }
        } catch (err) {
          console.warn("[MemoryCard] Could not fetch user cards:", err);
        }

        // If no user card was resolved, load from game saves endpoint
        if (!loadUrl) {
          loadUrl = `/roms/api/saves/${encodeURIComponent(cleanGameId)}?system=${encodeURIComponent(game.system)}`;
        }
      }

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
        const cleanFileName = (rawFileName ? deepDecode(rawFileName).trim() : (game.title + ".chd")).replace(/\.(bin|cue|zip)$/i, ".chd");

        window.EJS_player = "#mobile-emulator-container";
        window.EJS_core = game.system;
        window.EJS_gameName = game.title;
        if (game.system === "psx" || game.system === "ps1") {
          window.EJS_biosUrl = "/roms/api/bios/scph5501.bin?system=psx";
          if (loadUrl) {
            window.EJS_loadSaveUrl = loadUrl;
          }
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

        if (game.system === "psx" || game.system === "ps1") {
          window.EJS_coreSettings = {
            pcsx_rearmed_cdfs_cache: "disabled",
            pcsx_rearmed_async_cd: "sync",
            pcsx_rearmed_drc: "enabled",
            pcsx_rearmed_neon_enhancement_enable: "disabled",
            pcsx_rearmed_neon_enhancement_no_main: "disabled",
            pcsx_rearmed_pad1type: "standard",
            pcsx_rearmed_analog_to_digital: "left_analog",
          };

          window.EJS_defaultOptions = {
            "save-save-interval": "10",
            "autosave": "1",
            "pcsx_rearmed_cdfs_cache": "disabled",
            "pcsx_rearmed_async_cd": "sync",
            "pcsx_rearmed_memcard2": "disabled",
            "input_player1_l_btn": "4",
            "input_player1_r_btn": "5",
            "input_player1_l2_btn": "6",
            "input_player1_r2_btn": "7",
            "input_player1_l3_btn": "10",
            "input_player1_r3_btn": "11",
            "input_player1_analog_dpad_mode": "1",
            "input_libretro_device_p1": "5",
          };
        }

        window.EJS_onSave = (saveData) => {
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
        };
        window.EJS_onGameStart = () => {
          setBootState("running");
          applyAnalogMapping();
          setTimeout(applyAnalogMapping, 500);
          setTimeout(applyAnalogMapping, 1500);
        };

        const existingScript = document.getElementById("ejs-loader-script");
        if (existingScript) existingScript.remove();

        if (containerRef.current) {
          containerRef.current.innerHTML = "";
        }

        const script = document.createElement("script");
        script.id = "ejs-loader-script";
        script.src = "/roms/emulatorjs/data/loader.js";
        script.async = true;

        script.onerror = () => {
          setBootState("error");
          setErrorMessage("Failed to load /roms/emulatorjs/data/loader.js (Check static files or proxy).");
        };

        document.body.appendChild(script);
      }
    } catch (err: unknown) {
      setBootState("error");
      setErrorMessage(err instanceof Error ? err.message : "Failed to boot emulator.");
    }
  };

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
      } else if ((el as unknown as { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen) {
        (el as unknown as { webkitRequestFullscreen: () => void }).webkitRequestFullscreen();
      }
    } catch {}
  };

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
            <p className="text-sm font-semibold text-zinc-200">Mounting Cloud Memory Card & Core...</p>
            <p className="text-xs text-zinc-500 mt-1">Downloading save state & streaming game data</p>
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