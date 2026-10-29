"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowLeft, Maximize2, Disc3, Play, AlertCircle } from "lucide-react";

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
      gameManager?: {
        setOption?: (key: string, value: string) => void;
        setVariable?: (key: string, value: string) => void;
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
    // 1. Force flush save data to persistent storage if emulator is active
    const emu = window.EJS_emulator;
    if (emu) {
      try {
        if (typeof emu.gameManager?.saveSaveFiles === "function") {
          emu.gameManager.saveSaveFiles();
        } else if (typeof emu.saveSaveFiles === "function") {
          emu.saveSaveFiles();
        }
      } catch (e) {
        console.warn("[Emulator] Flush save error:", e);
      }
    }

    // Brief delay to allow IndexedDB / localStorage async transaction to settle
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
  }, []);

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

  const handleStartGame = () => {
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

      if (typeof window !== "undefined") {
        const screenAny = (screen as unknown as { orientation?: { lock?: unknown } })?.orientation;
        if (screenAny && typeof screenAny.lock === "function") {
          try {
            screenAny.lock = () => Promise.resolve();
          } catch {}
        }

        const discNum = activeDisc ? activeDisc.discNumber : undefined;
        const discQuery = discNum ? `?disc=${discNum}` : "";
        const cleanId = deepDecode(game.id).trim();

        // Direct stream route with disc query
        const streamUrl = `/roms/api/roms/${encodeURIComponent(cleanId)}/stream${discQuery}`;

        // Compute clean filename with explicit .chd extension
        const rawFileName = activeDisc ? activeDisc.fileName : game.romFileName;
        const cleanFileName = (rawFileName ? deepDecode(rawFileName).trim() : (game.title + ".chd")).replace(/\.(bin|cue|zip)$/i, ".chd");

        window.EJS_player = "#mobile-emulator-container";
        window.EJS_core = game.system;
        window.EJS_gameName = game.title;
        if (game.system === "psx" || game.system === "ps1") {
          window.EJS_biosUrl = "/roms/api/bios/scph5501.bin?system=psx";
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

        const hasPhysicalController = checkPhysicalGamepadConnected();
        if (game.system === "psx" || game.system === "ps1") {
          window.EJS_coreSettings = {
            pcsx_rearmed_cdfs_cache: "disabled",
            pcsx_rearmed_async_cd: "sync",
            pcsx_rearmed_drc: "enabled",
            pcsx_rearmed_neon_enhancement_enable: "disabled",
            pcsx_rearmed_neon_enhancement_no_main: "disabled",
            pcsx_rearmed_pad1type: hasPhysicalController ? "dualshock" : "standard",
            pcsx_rearmed_analog_to_digital: "left_analog",
          };

          window.EJS_defaultOptions = {
            "save-save-interval": "10",
            "autosave": "1",
            "save-state-location": "browser",
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
            "input_libretro_device_p1": hasPhysicalController ? "5" : "1",
          };
        }

        window.EJS_onStart = () => {
          setBootState("running");
        };
        window.EJS_onGameStart = () => {
          setBootState("running");
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

          <span className="text-xs text-zinc-300 font-medium truncate max-w-[150px] sm:max-w-[220px]">
            {game.title}
          </span>

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
                Tap to initialize engine and audio context
              </p>
            </div>
          </div>
        )}

        {/* 2. Booting / Compilation Spinner */}
        {bootState === "booting" && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/95 p-4 text-center">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm font-semibold text-zinc-200">Starting Emulator Core...</p>
            <p className="text-xs text-zinc-500 mt-1">Downloading core & streaming game data</p>
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