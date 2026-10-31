"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Maximize2 } from "lucide-react";

interface PS2EmulatorViewProps {
  game: {
    id: string;
    title: string;
    system: string;
    romFileName?: string;
  };
}

export function PS2EmulatorView({ game }: PS2EmulatorViewProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [isInIframe, setIsInIframe] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsInIframe(window.self !== window.top);
    }
  }, []);

  const romStreamUrl = `/roms/api/roms/${encodeURIComponent(game.id)}/stream`;
  const runnerUrl = `/roms/playjs/index.html?rom=${encodeURIComponent(romStreamUrl)}&title=${encodeURIComponent(game.title)}&embedded=1`;

  const handleBackToLibrary = () => {
    window.location.assign("/roms");
  };

  const handleManualFullscreen = () => {
    if (!iframeRef.current) return;
    try {
      if (iframeRef.current.requestFullscreen) {
        iframeRef.current.requestFullscreen();
      }
    } catch {}
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-black overflow-hidden select-none">
      {!isInIframe && (
        <div className="w-full shrink-0 z-50 flex items-center justify-between p-3.5 bg-zinc-950/95 border-b border-white/10">
          <button
            onClick={handleBackToLibrary}
            className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md bg-zinc-800/80 text-zinc-200 backdrop-blur active:bg-zinc-700 transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Library
          </button>
          <span className="text-xs text-zinc-300 font-medium truncate max-w-[220px]">
            {game.title} (Play! PS2)
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

      <div className="relative w-full flex-1 flex items-center justify-center bg-black overflow-hidden">
        <iframe
          ref={iframeRef}
          src={runnerUrl}
          className="w-full h-full border-0 block"
          allow="autoplay; fullscreen; gamepad"
        />
      </div>
    </div>
  );
}