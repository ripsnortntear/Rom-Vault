"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Maximize2, Disc3 } from "lucide-react";

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

export function MobileEmulatorView({ game }: MobileEmulatorViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedDiscIndex, setSelectedDiscIndex] = useState<number>(0);
  const [isInIframe, setIsInIframe] = useState<boolean>(false);

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
    window.EJS_coreSettings = {
      pcsx_rearmed_cdfs_cache: "async",
      pcsx_rearmed_async_cd: "sync",
      pcsx_rearmed_drc: "enabled",
      pcsx_rearmed_neon_enhancement_enable: "disabled", // Drop high-overhead neon shaders
      pcsx_rearmed_neon_enhancement_no_main: "disabled",
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
    };

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

      {/* Primary Emulator Mount Point */}
      <div
        id="mobile-emulator-container"
        ref={containerRef}
        className="w-full h-full flex items-center justify-center bg-black"
      />

      {/* Loading Overlay */}
      {loadState === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-40 text-center px-4">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm font-medium text-zinc-200">Initializing Mobile WASM Engine...</p>
          <p className="text-xs text-zinc-500 mt-1">Applying 1x Native Canvas Resolution</p>
        </div>
      )}

      {/* Error Boundary Overlay */}
      {loadState === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 z-40 text-center px-6">
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
  );
}
