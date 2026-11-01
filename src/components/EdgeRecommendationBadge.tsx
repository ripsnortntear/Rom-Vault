"use client";

import React, { useState, useEffect, useRef } from "react";
import { Monitor, Info, X, CheckCircle2, ChevronRight } from "lucide-react";

export function EdgeRecommendationBadge(): React.ReactElement | null {
  const [mounted, setMounted] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [isEdge, setIsEdge] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const ua = navigator.userAgent || "";
      const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
      const smallScreen = window.innerWidth < 768;
      const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
      const mobileDevice = mobileUA || smallScreen || coarsePointer;
      setIsMobile(mobileDevice);

      // Check if browser is Microsoft Edge (contains 'Edg/' in modern Edge Chromium)
      const edgeBrowser = /edg/i.test(ua);
      setIsEdge(edgeBrowser);

      const handleResize = () => {
        const nowMobile =
          window.innerWidth < 768 ||
          window.matchMedia("(pointer: coarse)").matches ||
          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || "");
        setIsMobile(nowMobile);
      };

      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, []);

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

  // Mobile is not affected — never render for mobile devices
  if (mounted && isMobile) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="relative z-50 hidden md:inline-flex items-center"
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label="Browser recommendation for advanced consoles"
        className={`group inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer select-none ${
          isOpen
            ? "bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-md shadow-cyan-500/20"
            : isEdge
            ? "bg-cyan-950/40 hover:bg-cyan-900/50 border-cyan-500/40 text-cyan-200 hover:border-cyan-400"
            : "bg-sky-950/50 hover:bg-sky-900/60 border-sky-500/40 text-sky-200 hover:border-sky-400"
        }`}
        title="Works best with Edge for advanced consoles (PS2, GameCube, Dreamcast)"
      >
        {/* Edge / Browser Wave Icon */}
        <svg
          className="w-4 h-4 shrink-0 text-cyan-400 transition-transform group-hover:scale-110"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Stylized edge wave / compass symbol */}
          <circle cx="12" cy="12" r="10" className="opacity-40" />
          <path d="M12 2a10 10 0 0 1 10 10c0 4-3 7-7 7-3.5 0-6-2.5-6-5 0-2.5 2-4.5 4.5-4.5 2 0 3.5 1.5 3.5 3.5" />
          <path d="M8 14c-1.5 0-3-1-3-2.5S6.5 9 8 9" />
        </svg>

        <span className="flex items-center gap-1.5">
          <span>Works best with <strong className="font-extrabold text-white">Edge</strong></span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isEdge ? "bg-emerald-400 animate-pulse" : "bg-cyan-400 animate-pulse"
            }`}
          />
        </span>
      </button>

      {/* Popover Card */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 p-4 rounded-2xl bg-zinc-950/95 border border-cyan-500/40 text-zinc-200 shadow-2xl shadow-black/90 ring-1 ring-cyan-500/30 backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-start justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300">
                <Monitor className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white tracking-wide">
                  Desktop Browser Recommendation
                </h4>
                <p className="text-[11px] text-cyan-300">
                  Microsoft Edge for Advanced 3D Consoles
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition"
              aria-label="Close notice"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-zinc-300 leading-relaxed mb-3">
            For advanced 3D game consoles like <strong className="text-white">PlayStation 2</strong> (WebGPU / WASM),{" "}
            <strong className="text-cyan-300">Microsoft Edge</strong> provides the most reliable WebAssembly SIMD and WebGPU hardware acceleration on desktop. High-demand disc systems like <strong className="text-white">Nintendo GameCube</strong> and <strong className="text-white">Sega Dreamcast</strong> are optimized for standalone emulators (Dolphin &amp; Flycast).
          </p>

          <div className="p-2.5 rounded-xl bg-zinc-900/90 border border-white/10 text-[11px] flex items-center gap-2.5 mb-3">
            {isEdge ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-emerald-200">
                  <strong>Edge Detected:</strong> Your desktop browser is fully accelerated for PS2 and retro browser emulation!
                </span>
              </>
            ) : (
              <>
                <Info className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="text-zinc-300">
                  Other browsers may experience audio stutters or frame drops on heavy 3D titles.
                </span>
              </>
            )}
          </div>

          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-zinc-400">
            <span>Mobile devices run PS1 &amp; retro systems</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-cyan-400 hover:text-cyan-300 font-semibold inline-flex items-center gap-0.5"
            >
              Got it <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
