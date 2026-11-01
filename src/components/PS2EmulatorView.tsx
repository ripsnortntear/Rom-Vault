"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Maximize2, Minimize2 } from "lucide-react";
import { MobileDesktopRequired } from "@/components/MobileDesktopRequired";

interface PS2EmulatorViewProps {
  game: {
    id: string;
    title: string;
    system: string;
    romFileName?: string;
    discs?: Array<{
      discNumber: number;
      fileName: string;
      romUrl: string;
    }>;
  };
}

export function PS2EmulatorView({ game }: PS2EmulatorViewProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isInIframe, setIsInIframe] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isMobileDevice, setIsMobileDevice] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const inFrame = window.self !== window.top;
      setIsInIframe(inFrame);

      const ua = navigator.userAgent || "";
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
      const isSmall = window.innerWidth < 768;
      const isCoarse = window.matchMedia("(pointer: coarse)").matches;
      setIsMobileDevice(!inFrame && (isMobileUA || isSmall || isCoarse));
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const safeGameId = game.id.includes("%") ? game.id : encodeURIComponent(game.id);
  const activeFileName =
    game.discs && game.discs.length > 0
      ? game.discs[0].fileName
      : (game.romFileName || `${game.title}.chd`);
  const biosUrl = "/roms/api/bios/scph39001.bin?system=ps2";
  const discUrl = `/roms/api/roms/${safeGameId}/stream/${encodeURIComponent(activeFileName)}`;
  const memcardUrl = "/roms/api/users/me/cards/active/download?system=ps2";

  const runnerUrl = `/roms/tabstationtoo/index.html?bios=${encodeURIComponent(
    biosUrl
  )}&disc=${encodeURIComponent(discUrl)}&memcard=${encodeURIComponent(memcardUrl)}`;

  const handleBackToLibrary = () => {
    window.location.assign("/roms");
  };

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
      } else {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
      }
    } catch {}
  };

  if (isMobileDevice) {
    return <MobileDesktopRequired game={game} />;
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex flex-col items-center justify-center bg-black overflow-hidden select-none"
    >
      {!isInIframe && (
        <div className="w-full shrink-0 z-50 flex items-center justify-between p-3 bg-zinc-950/95 border-b border-white/10 backdrop-blur-md">
          <button
            onClick={handleBackToLibrary}
            className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 active:scale-95 transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Library
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-300 font-semibold truncate max-w-[240px] sm:max-w-md">
              {game.title}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-950 text-blue-300 border border-blue-800">
              PS2 (TabStationToo)
            </span>
          </div>
          <button
            onClick={handleToggleFullscreen}
            className="p-1.5 rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 active:scale-95 transition cursor-pointer"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      )}

      <iframe
        ref={iframeRef}
        src={runnerUrl}
        className="w-full h-full border-0 flex-1"
        allow="autoplay; fullscreen; gamepad; cross-origin-isolated"
      />
    </div>
  );
}
