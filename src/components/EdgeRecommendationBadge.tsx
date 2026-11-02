"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Monitor,
  Info,
  X,
  CheckCircle2,
  ChevronRight,
  SlidersHorizontal,
  Cpu,
  AlertTriangle,
} from "lucide-react";
import { useBrowserEnvironment } from "@/hooks/useBrowserEnvironment";

interface EdgeRecommendationBadgeProps {
  className?: string;
}

export function EdgeRecommendationBadge({ className }: EdgeRecommendationBadgeProps = {}): React.ReactElement | null {
  const { mounted, isMobile, state } = useBrowserEnvironment();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close popup on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Mobile is not affected — never render badge for mobile devices
  if (!mounted || isMobile) {
    return null;
  }

  // 1. Edge with COOP/COEP: all green and good to go
  const isEdgeReady = state === "edge_ready";
  // 2. Edge without COOP/COEP: warn COOP/COEP needed for advanced systems
  const isEdgeNoCoop = state === "edge_no_coop";
  // 3. Non-Edge with COOP/COEP: displays standard Works best with Edge
  const isOtherWithCoop = state === "other_with_coop";
  // 4. Non-Edge without COOP/COEP: warn to turn COOP/COEP on and recommend Edge
  const isOtherNoCoop = state === "other_no_coop";

  return (
    <div
      ref={containerRef}
      className={`relative z-50 ${className ?? "hidden md:inline-flex items-center"}`}
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label="Browser recommendation and acceleration status"
        className={`group inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer select-none ${
          isOpen
            ? isEdgeReady
              ? "bg-emerald-500/25 border-emerald-400 text-emerald-200 shadow-md shadow-emerald-500/20"
              : isEdgeNoCoop || isOtherNoCoop
              ? "bg-amber-500/25 border-amber-400 text-amber-200 shadow-md shadow-amber-500/20"
              : "bg-cyan-500/25 border-cyan-400 text-cyan-200 shadow-md shadow-cyan-500/20"
            : isEdgeReady
            ? "bg-emerald-950/60 hover:bg-emerald-900/60 border-emerald-500/50 text-emerald-200 hover:border-emerald-400"
            : isEdgeNoCoop
            ? "bg-amber-950/60 hover:bg-amber-900/60 border-amber-500/50 text-amber-200 hover:border-amber-400"
            : isOtherNoCoop
            ? "bg-amber-950/60 hover:bg-amber-900/60 border-amber-500/50 text-amber-200 hover:border-amber-400"
            : "bg-sky-950/50 hover:bg-sky-900/60 border-sky-500/40 text-sky-200 hover:border-sky-400"
        }`}
        title={
          isEdgeReady
            ? "Microsoft Edge + COOP/COEP Active: All 16 systems fully accelerated at 60 FPS!"
            : isEdgeNoCoop
            ? "Edge Detected: COOP/COEP required to unlock advanced systems"
            : isOtherNoCoop
            ? "COOP/COEP disabled: Enable COOP/COEP and use Edge for full experience"
            : "Works best with Edge for advanced consoles (PS2, GameCube, Dreamcast)"
        }
      >
        {/* Status Icon */}
        {isEdgeReady ? (
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 transition-transform group-hover:scale-110" />
        ) : isEdgeNoCoop || isOtherNoCoop ? (
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 transition-transform group-hover:scale-110" />
        ) : (
          <svg
            className="w-4 h-4 shrink-0 text-cyan-400 transition-transform group-hover:scale-110"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" className="opacity-40" />
            <path d="M12 2a10 10 0 0 1 10 10c0 4-3 7-7 7-3.5 0-6-2.5-6-5 0-2.5 2-4.5 4.5-4.5 2 0 3.5 1.5 3.5 3.5" />
            <path d="M8 14c-1.5 0-3-1-3-2.5S6.5 9 8 9" />
          </svg>
        )}

        {/* Dynamic Button Label according to status */}
        <span className="flex items-center gap-1.5">
          {isEdgeReady ? (
            <span>Edge Accelerated &bull; <strong className="font-extrabold text-emerald-100">All Systems Ready</strong></span>
          ) : isEdgeNoCoop ? (
            <span>Edge &bull; <strong className="font-extrabold text-amber-200">COOP/COEP Required</strong></span>
          ) : isOtherNoCoop ? (
            <span>COOP/COEP Off &bull; <strong className="font-extrabold text-amber-200">Edge Recommended</strong></span>
          ) : (
            <span>Works best with <strong className="font-extrabold text-white">Edge</strong></span>
          )}
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isEdgeReady
                ? "bg-emerald-400 animate-pulse"
                : isEdgeNoCoop || isOtherNoCoop
                ? "bg-amber-400 animate-pulse"
                : "bg-cyan-400 animate-pulse"
            }`}
          />
        </span>
      </button>

      {/* Popover Card */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-[440px] p-4 rounded-2xl bg-zinc-950/95 border border-cyan-500/40 text-zinc-200 shadow-2xl shadow-black/90 ring-1 ring-cyan-500/30 backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-start justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                  isEdgeReady
                    ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                    : isEdgeNoCoop || isOtherNoCoop
                    ? "bg-amber-500/20 border border-amber-500/40 text-amber-300"
                    : "bg-cyan-500/20 border border-cyan-500/40 text-cyan-300"
                }`}
              >
                {isEdgeReady ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : isEdgeNoCoop || isOtherNoCoop ? (
                  <AlertTriangle className="w-4 h-4" />
                ) : (
                  <Monitor className="w-4 h-4" />
                )}
              </div>
              <div>
                <h4 className="text-xs font-bold text-white tracking-wide">
                  {isEdgeReady
                    ? "Desktop Emulation Fully Accelerated"
                    : isEdgeNoCoop
                    ? "Edge Detected &bull; COOP/COEP Setup Needed"
                    : isOtherNoCoop
                    ? "Action Needed: COOP/COEP &amp; Browser Recommendation"
                    : "Desktop Browser Recommendation"}
                </h4>
                <p
                  className={`text-[11px] ${
                    isEdgeReady
                      ? "text-emerald-300"
                      : isEdgeNoCoop || isOtherNoCoop
                      ? "text-amber-300"
                      : "text-cyan-300"
                  }`}
                >
                  {isEdgeReady
                    ? "Microsoft Edge + Cross-Origin Isolation Verified"
                    : isEdgeNoCoop
                    ? "Only basic systems available until enabled"
                    : isOtherNoCoop
                    ? "Enable COOP/COEP and use Edge for full experience"
                    : "Microsoft Edge for Advanced 3D Consoles"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition cursor-pointer"
              aria-label="Close notice"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body Narrative based on the exact state */}
          {isEdgeReady && (
            <p className="text-xs text-zinc-300 leading-relaxed mb-3">
              All systems are green and good to go! Microsoft Edge is detected with active{" "}
              <strong className="text-emerald-300">COOP &amp; COEP (Cross-Origin Isolation)</strong> and GPU acceleration. All 16 platforms, including <strong className="text-white">PlayStation 2</strong>, <strong className="text-white">Nintendo GameCube</strong>, and <strong className="text-white">Sega Dreamcast</strong>, are fully unlocked and ready to play at 60 FPS.
            </p>
          )}

          {isEdgeNoCoop && (
            <p className="text-xs text-zinc-300 leading-relaxed mb-3">
              <strong className="text-amber-300">Notice:</strong> You are on Microsoft Edge, but <strong className="text-white">COOP/COEP (Cross-Origin Isolation)</strong> is currently disabled. Only basic systems (NES, SNES, Genesis, GBA) can be played until COOP/COEP is enabled to unlock multi-threaded WebAssembly with <code className="text-amber-300">SharedArrayBuffer</code>.
            </p>
          )}

          {isOtherWithCoop && (
            <p className="text-xs text-zinc-300 leading-relaxed mb-3">
              <strong className="text-emerald-300">COOP &amp; COEP are enabled</strong> in your browser. However, for advanced 3D game consoles like <strong className="text-white">PlayStation 2</strong> (WebGPU / WASM), <strong className="text-white">GameCube</strong>, and <strong className="text-white">Dreamcast</strong>, <strong className="text-cyan-300">Microsoft Edge</strong> provides the most reliable WebAssembly SIMD and WebGPU hardware acceleration on desktop without audio stutters.
            </p>
          )}

          {isOtherNoCoop && (
            <p className="text-xs text-zinc-300 leading-relaxed mb-3">
              <strong className="text-amber-300">Action Recommended:</strong> You are not using Microsoft Edge, and <strong className="text-white">COOP/COEP (Cross-Origin Isolation)</strong> is NOT enabled. You need to at least turn COOP/COEP on to run multi-threaded emulators, and for the full 60 FPS experience on advanced consoles, switch to <strong className="text-cyan-300">Microsoft Edge</strong> on desktop.
            </p>
          )}

          {/* Browser Configuration & Acceleration Checklist */}
          <div className="p-3 rounded-xl bg-zinc-900/95 border border-white/10 mb-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-white">
              <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>Recommended Browser Settings (for 60 FPS):</span>
            </div>
            <ul className="space-y-1.5 text-[11px] text-zinc-300">
              <li className="flex items-start gap-1.5">
                <Cpu className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${isEdgeReady || isOtherWithCoop ? "text-emerald-400" : "text-amber-400"}`} />
                <span>
                  <strong className="text-white">COOP &amp; COEP</strong> (Cross-Origin Isolation):{" "}
                  {isEdgeReady || isOtherWithCoop ? (
                    <span className="text-emerald-300 font-semibold">Active &bull; SharedArrayBuffer is unlocked.</span>
                  ) : (
                    <span className="text-amber-300">
                      Disabled &bull; Access via secure HTTPS or enable Cross-Origin Isolation in browser flags.
                    </span>
                  )}
                </span>
              </li>
              <li className="flex items-start gap-1.5">
                <Monitor className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-white">Hardware Acceleration</strong>: In <code className="px-1 py-0.5 rounded bg-black/60 text-emerald-300 border border-white/10 font-mono text-[10px]">edge://settings/system</code>, ensure <strong className="text-emerald-200">&quot;Use graphics acceleration when available&quot;</strong> is toggled <strong>ON</strong>.
                </span>
              </li>
            </ul>
          </div>

          <div className="p-2.5 rounded-xl bg-zinc-900/90 border border-white/10 text-[11px] flex items-center gap-2.5 mb-3">
            {isEdgeReady ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-emerald-200">
                  <strong>Ready to Play:</strong> Full 60 FPS hardware acceleration active for all 16 systems!
                </span>
              </>
            ) : isEdgeNoCoop ? (
              <>
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-amber-200">
                  <strong>Setup Needed:</strong> Toggle hardware acceleration on and reload over HTTPS to enable COOP/COEP.
                </span>
              </>
            ) : isOtherNoCoop ? (
              <>
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-amber-200">
                  <strong>Notice:</strong> Turn COOP/COEP on and switch to Edge for advanced 3D systems.
                </span>
              </>
            ) : (
              <>
                <Info className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="text-zinc-300">
                  COOP/COEP active. Microsoft Edge is still recommended for heavy 3D titles (PS2, GameCube, Dreamcast).
                </span>
              </>
            )}
          </div>

          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-zinc-400">
            <span>Mobile devices run PS1 &amp; retro systems</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-cyan-400 hover:text-cyan-300 font-semibold inline-flex items-center gap-0.5 cursor-pointer"
            >
              Got it <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
