"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Maximize2, Disc3, Play } from "lucide-react";

declare global {
  interface Window {
    EJS_player?: string;
    EJS_core?: string;
    EJS_gameName?: string;
    EJS_gameUrl?: string;
    EJS_pathtodata?: string;
    EJS_startOnLoaded?: boolean;
    EJS_fullscreenOnLoad?: boolean;
    EJS_rumble?: boolean;
    EJS_vibration?: boolean;
    EJS_disableRumble?: boolean;
    EJS_resolution?: number;
    EJS_volume?: number;
    EJS_audioBufferSize?: number;
    EJS_sampleRate?: number;
    EJS_coreSettings?: Record<string, string>;
    EJS_defaultOptions?: Record<string, string>;
    EJS_virtualGamepadSettings?: {
      shoulders?: number;
      buttonLabels?: Record<string, string>;
      [key: string]: unknown;
    };
    EJS_emulator?: {
      stop?: () => void;
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
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedDiscIndex, setSelectedDiscIndex] = useState<number>(0);
  const [isInIframe, setIsInIframe] = useState<boolean>(false);
  const [hasStarted, setHasStarted] = useState<boolean>(false);

  const handleStartEmulation = () => {
    setHasStarted(true);

    // 1. Resume AudioContext if suspended
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

    // 2. Trigger EmulatorJS startup
    try {
      const emu = window.EJS_emulator as Record<string, unknown> | undefined;
      if (emu) {
        if (typeof emu.start === "function") {
          (emu.start as () => void)();
        } else if (typeof emu.play === "function") {
          (emu.play as () => void)();
        } else if (
          emu.gameManager &&
          typeof (emu.gameManager as Record<string, unknown>).start === "function"
        ) {
          ((emu.gameManager as Record<string, unknown>).start as () => void)();
        }
      }

      // Also trigger any internal start button EmulatorJS created
      const startBtn =
        document.getElementById("ejs_start_button") ||
        document.querySelector<HTMLElement>(".ejs_start_btn") ||
        document.querySelector<HTMLElement>("#ejs_parent button") ||
        document.querySelector<HTMLElement>("#mobile-emulator-container button");

      if (startBtn && typeof startBtn.click === "function") {
        startBtn.click();
      }
    } catch (err) {
      console.warn("Failed to trigger emulator start:", err);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsInIframe(window.self !== window.top);
    }
  }, []);

  const activeDisc = game.discs && game.discs[selectedDiscIndex] ? game.discs[selectedDiscIndex] : null;

  const initEmulator = useCallback((discNum?: number, fileName?: string) => {
    if (!containerRef.current || typeof window === "undefined") return;

    // 1. Defuse automatic orientation lock and programmatic fullscreen rejections
    const screenAny = (screen as unknown as { orientation?: { lock?: unknown } })?.orientation;
    if (screenAny && typeof screenAny.lock === "function") {
      try {
        screenAny.lock = () => Promise.resolve();
      } catch {}
    }

    // 2. Configure low-memory EmulatorJS flags before loading script
    const discQuery = discNum ? `?disc=${discNum}` : "";
    const fileQuery = fileName ? `${discQuery ? "&" : "?"}file=${encodeURIComponent(fileName)}` : "";
    const streamUrl = `/roms/api/roms/${encodeURIComponent(game.id)}/stream${discQuery}${fileQuery}`;

    window.EJS_player = "#mobile-emulator-container";
    window.EJS_core = game.system;
    window.EJS_gameUrl = streamUrl;

    // Strict Fullscreen & Lifecycle Control: Never auto-start or auto-fullscreen on mobile
    window.EJS_startOnLoaded = false;
    window.EJS_fullscreenOnLoad = false;

    // HARD DISABLE Rumble & Vibration to protect controller / input interfaces
    window.EJS_rumble = false;
    window.EJS_vibration = false;
    (window as unknown as Record<string, unknown>).EJS_disableRumble = true;

    // 3. Audio & WebGL Memory Conservation:
    // Force native 1x resolution (320x240 for PS1) - DO NOT upsample to 2x/4x on mobile
    window.EJS_resolution = 1;
    window.EJS_volume = 1.0;
    window.EJS_audioBufferSize = 8192; // Prevent audio starvation crackle
    window.EJS_sampleRate = 44100;

    // 4. PCSX ReARMed Dynamic Core Settings: Disable aggressive dynarec buffers and heavy shaders
    const hasPhysicalController = checkPhysicalGamepadConnected();

    window.EJS_coreSettings = {
      pcsx_rearmed_cdfs_cache: "async",
      pcsx_rearmed_async_cd: "sync",
      pcsx_rearmed_drc: "enabled",
      pcsx_rearmed_neon_enhancement_enable: "disabled", // Drop high-overhead neon shaders
      pcsx_rearmed_neon_enhancement_no_main: "disabled",
      ...(game.system === "psx" || game.system === "ps1"
        ? {
            // Switch port 1 from standard digital pad to DualShock when controller is attached
            pcsx_rearmed_pad1type: hasPhysicalController ? "dualshock" : "standard",
            // Map left analog stick to D-Pad for digital-only games
            pcsx_rearmed_analog_to_digital: hasPhysicalController ? "left_analog" : "disabled",
          }
        : {}),
    };

    window.EJS_defaultOptions = {
      "save-save-interval": "60",
      "save-state-location": "browser",
      "pcsx_rearmed_cdfs_cache": "async",
      "pcsx_rearmed_async_cd": "sync",
      "pcsx_rearmed_memcard2": "disabled",
      "input_player1_l_btn": "4",
      "input_player1_r_btn": "5",
      "input_player1_l2_btn": "6",
      "input_player1_r2_btn": "7",
      "input_player1_l3_btn": "10",
      "input_player1_r3_btn": "11",
      ...(game.system === "psx" || game.system === "ps1"
        ? {
            "input_player1_analog_dpad_mode": hasPhysicalController ? "1" : "0",
            "input_libretro_device_p1": hasPhysicalController ? "5" : "1",
          }
        : {}),
    };

    // Dynamic runtime gamepad connection hook
    const updatePadMode = (connected: boolean) => {
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
            const gm = emu.gameManager as Record<string, unknown>;
            if (typeof gm.setOption === "function") {
              (gm.setOption as (k: string, v: string) => void)("pcsx_rearmed_pad1type", connected ? "dualshock" : "standard");
              (gm.setOption as (k: string, v: string) => void)("pcsx_rearmed_analog_to_digital", connected ? "left_analog" : "disabled");
              (gm.setOption as (k: string, v: string) => void)("input_player1_analog_dpad_mode", connected ? "1" : "0");
              (gm.setOption as (k: string, v: string) => void)("input_libretro_device_p1", connected ? "5" : "1");
            }
            if (typeof gm.setVariable === "function") {
              (gm.setVariable as (k: string, v: string) => void)("pcsx_rearmed_pad1type", connected ? "dualshock" : "standard");
              (gm.setVariable as (k: string, v: string) => void)("pcsx_rearmed_analog_to_digital", connected ? "left_analog" : "disabled");
            }
          }
        } catch {}
      }
    };

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

    const handleParentMessage = (e: MessageEvent) => {
      if (e.data?.type === "GAMEPAD_PULSE" && e.data?.connected) {
        updatePadMode(true);
      }
    };

    window.addEventListener("gamepadconnected", handleGamepadConnected);
    window.addEventListener("gamepaddisconnected", handleGamepadDisconnected);
    window.addEventListener("message", handleParentMessage);

    // Enable secondary shoulder triggers (L2/R2) in the virtual controller configuration
    if (game.system === "psx" || game.system === "ps1") {
      window.EJS_virtualGamepadSettings = {
        ...window.EJS_virtualGamepadSettings,
        shoulders: 4, // Explicitly configure 4 shoulder buttons (L1, L2, R1, R2)
        buttonLabels: {
          ...window.EJS_virtualGamepadSettings?.buttonLabels,
          b: "○",
          a: "✕",
          y: "△",
          x: "□",
          l: "L1",
          r: "R1",
          l2: "L2",
          r2: "R2",
        },
      };
    }

    // 5. Inject EmulatorJS loader cleanly (check local path or fallback to CDN)
    const localLoader = "/roms/emulatorjs/data/loader.js";
    const cdnLoader = "https://cdn.emulatorjs.org/stable/data/loader.js";
    const script = document.createElement("script");

    fetch(localLoader, { method: "HEAD" })
      .then((res) => {
        if (res.ok) {
          window.EJS_pathtodata = "/roms/emulatorjs/data/";
          script.src = localLoader;
        } else {
          window.EJS_pathtodata = "https://cdn.emulatorjs.org/stable/data/";
          script.src = cdnLoader;
        }
        script.async = true;
        script.onload = () => setLoadState("ready");
        script.onerror = () => {
          setLoadState("error");
          setErrorMessage("Failed to load emulator core. Check server connection.");
        };
        containerRef.current?.appendChild(script);
      })
      .catch(() => {
        window.EJS_pathtodata = "https://cdn.emulatorjs.org/stable/data/";
        script.src = cdnLoader;
        script.async = true;
        script.onload = () => setLoadState("ready");
        script.onerror = () => {
          setLoadState("error");
          setErrorMessage("Failed to load emulator core. Check server connection.");
        };
        containerRef.current?.appendChild(script);
      });

    return () => {
      window.removeEventListener("gamepadconnected", handleGamepadConnected);
      window.removeEventListener("gamepaddisconnected", handleGamepadDisconnected);
      window.removeEventListener("message", handleParentMessage);
      script.remove();
      if (window.EJS_emulator?.stop) {
        try {
          window.EJS_emulator.stop();
        } catch {
          // cleanup fallback
        }
      }
    };
  }, [game.id, game.system]);

  useEffect(() => {
    setHasStarted(false);
    setLoadState("loading");
    const discNum = activeDisc ? activeDisc.discNumber : undefined;
    const fileName = activeDisc ? activeDisc.fileName : game.romFileName;
    return initEmulator(discNum, fileName);
  }, [activeDisc, game.romFileName, initEmulator]);

  const handleManualFullscreen = () => {
    const el = document.getElementById("mobile-emulator-container");
    if (!el) return;
    try {
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {
          // Suppress unhandled rejection on mobile Safari
        });
      } else if ((el as unknown as { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen) {
        (el as unknown as { webkitRequestFullscreen: () => void }).webkitRequestFullscreen();
      }
    } catch {}
  };

  return (
    <div
      className={`relative w-full h-full flex flex-col items-center justify-center bg-black ${
        game.system === "psx" || game.system === "ps1" ? "psx-touch-controls" : ""
      }`}
    >
      <style>{`
        /* PS1 Shoulder Buttons Styling & Ergonomic Placement */
        .psx-touch-controls .ejs_button_l,
        .psx-touch-controls .ejs_button_l2,
        .psx-touch-controls .ejs_button_r,
        .psx-touch-controls .ejs_button_r2,
        .psx-touch-controls [data-button="l"],
        .psx-touch-controls [data-button="l2"],
        .psx-touch-controls [data-button="r"],
        .psx-touch-controls [data-button="r2"] {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
          font-weight: 800 !important;
          font-size: 13px !important;
          border-radius: 8px !important;
          color: #e4e4e7 !important;
          background-color: rgba(39, 39, 42, 0.6) !important;
          border: 1px solid rgba(113, 113, 122, 0.5) !important;
          backdrop-filter: blur(4px) !important;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          user-select: none !important;
          touch-action: none !important;
        }

        /* Ergonomic Min Size & Proportions */
        .psx-touch-controls .ejs_button_l,
        .psx-touch-controls [data-button="l"],
        .psx-touch-controls .ejs_button_l2,
        .psx-touch-controls [data-button="l2"],
        .psx-touch-controls .ejs_button_r,
        .psx-touch-controls [data-button="r"],
        .psx-touch-controls .ejs_button_r2,
        .psx-touch-controls [data-button="r2"] {
          min-width: 48px !important;
          min-height: 34px !important;
        }

        /* Pressed States */
        .psx-touch-controls .ejs_button_l:active,
        .psx-touch-controls .ejs_button_l2:active,
        .psx-touch-controls .ejs_button_r:active,
        .psx-touch-controls .ejs_button_r2:active,
        .psx-touch-controls [data-button="l"]:active,
        .psx-touch-controls [data-button="l2"]:active,
        .psx-touch-controls [data-button="r"]:active,
        .psx-touch-controls [data-button="r2"]:active {
          background-color: rgba(91, 141, 249, 0.5) !important;
          border-color: #5b8df9 !important;
        }

        /* Explicit Button Content Labeling */
        .psx-touch-controls .ejs_button_l::after,
        .psx-touch-controls [data-button="l"]::after {
          content: "L1" !important;
        }
        .psx-touch-controls .ejs_button_l2::after,
        .psx-touch-controls [data-button="l2"]::after {
          content: "L2" !important;
        }
        .psx-touch-controls .ejs_button_r::after,
        .psx-touch-controls [data-button="r"]::after {
          content: "R1" !important;
        }
        .psx-touch-controls .ejs_button_r2::after,
        .psx-touch-controls [data-button="r2"]::after {
          content: "R2" !important;
        }

        /* Hide fallback text if inner spans are injected */
        .psx-touch-controls .ejs_button_l *,
        .psx-touch-controls .ejs_button_l2 *,
        .psx-touch-controls .ejs_button_r *,
        .psx-touch-controls .ejs_button_r2 *,
        .psx-touch-controls [data-button="l"] *,
        .psx-touch-controls [data-button="l2"] *,
        .psx-touch-controls [data-button="r"] *,
        .psx-touch-controls [data-button="r2"] * {
          display: none !important;
        }

        /* Ensure EmulatorJS canvas mount is centered without horizontal shift */
        #mobile-emulator-container {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 100% !important;
          height: 100% !important;
          position: relative !important;
          margin: 0 auto !important;
        }

        #mobile-emulator-container > div,
        #mobile-emulator-container #ejs_parent,
        #mobile-emulator-container canvas {
          margin: 0 auto !important;
        }

        /* Suppress internal EmulatorJS start button in favor of dead-centered prompt */
        #mobile-emulator-container #ejs_start_button,
        #mobile-emulator-container .ejs_start_btn {
          display: none !important;
        }
      `}</style>

      {/* Top Navigation & Controls Header (rendered in standalone mobile view) */}
      {!isInIframe && (
        <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-3 bg-gradient-to-b from-black/90 via-black/50 to-transparent">
          <div className="flex items-center gap-2">
            <Link
              className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md bg-zinc-800/80 text-zinc-200 backdrop-blur active:bg-zinc-700 transition"
              href="/roms"
            >
              <ArrowLeft className="w-4 h-4" /> Library
            </Link>

            {game.discs && game.discs.length > 1 && (
              <div className="flex items-center gap-1 bg-zinc-900/80 p-0.5 rounded-md border border-white/10 backdrop-blur">
                <Disc3 className="w-3.5 h-3.5 text-red-400 ml-1.5 mr-0.5" />
                {game.discs.map((disc, idx) => (
                  <button
                    key={disc.discNumber}
                    type="button"
                    onClick={() => setSelectedDiscIndex(idx)}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold transition ${
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

      {/* Dedicated Isolated Viewport Sub-Container with Exact Relative Anchoring */}
      <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden">
        {/* Dedicated Emulator Canvas Mount */}
        <div
          id="mobile-emulator-container"
          ref={containerRef}
          className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden"
        />

        {/* Loading Overlay */}
        {loadState === "loading" && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/90 text-center px-4">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm font-medium text-zinc-200">Initializing Mobile WASM Engine...</p>
            <p className="text-xs text-zinc-500 mt-1">Applying 1x Native Canvas Resolution</p>
          </div>
        )}

        {/* Pre-launch Interaction Shield & Start Prompt */}
        {loadState === "ready" && !hasStarted && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm p-4 text-center">
            <div className="flex flex-col items-center justify-center max-w-sm w-full mx-auto space-y-4">
              {/* Game System / Disc Info */}
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                {game.system.toUpperCase()} • Ready to Launch
              </div>

              <h3 className="text-lg font-bold text-zinc-100 truncate max-w-full">
                {game.title}
              </h3>

              {/* Centered Start Button */}
              <button
                type="button"
                onClick={handleStartEmulation}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-sm tracking-wide shadow-lg shadow-indigo-500/25 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Start Game</span>
              </button>

              <p className="text-xs text-zinc-500">
                Tap to initialize audio and hardware controls
              </p>
            </div>
          </div>
        )}

        {/* Error Boundary Overlay */}
        {loadState === "error" && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/95 text-center px-6">
            <p className="text-sm font-semibold text-rose-400 mb-2">Emulation Crash Averted</p>
            <p className="text-xs text-zinc-400 mb-4">{errorMessage}</p>
            <Link
              className="text-xs px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md font-semibold transition"
              href="/roms"
            >
              Return to Library
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
