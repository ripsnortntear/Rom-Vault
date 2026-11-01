"use client";

import React from "react";
import { Monitor, ArrowLeft, Download, AlertTriangle } from "lucide-react";

interface MobileDesktopRequiredProps {
  game: {
    id: string;
    title: string;
    system: string;
    romFileName?: string;
  };
}

export function MobileDesktopRequired({
  game,
}: MobileDesktopRequiredProps): React.ReactElement {
  const systemName =
    game.system === "ps2"
      ? "PlayStation 2"
      : game.system === "dreamcast"
      ? "Sega Dreamcast"
      : game.system === "gamecube"
      ? "Nintendo GameCube"
      : game.system.toUpperCase();

  const safeGameId = game.id.includes("%") ? game.id : encodeURIComponent(game.id);
  const downloadUrl = `/roms/api/roms/${safeGameId}/stream?download=1`;

  return (
    <div className="fixed inset-0 w-screen h-screen bg-[#070709] text-zinc-100 flex flex-col items-center justify-center p-6 text-center z-50 overflow-y-auto">
      <div className="max-w-md w-full p-6 sm:p-8 rounded-3xl bg-zinc-950/90 border border-amber-500/30 shadow-2xl backdrop-blur-md flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mb-4 text-amber-400">
          <Monitor className="w-8 h-8" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-950/60 border border-amber-500/30 text-[11px] font-bold text-amber-300 uppercase tracking-wider mb-3">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          <span>Desktop Emulation Only</span>
        </div>

        <h2 className="text-xl sm:text-2xl font-black text-white mb-2 tracking-tight">
          Desktop Required
        </h2>

        <p className="text-sm font-semibold text-zinc-200 mb-1">
          {game.title}
        </p>

        <p className="text-xs text-amber-300 font-medium mb-4">
          {systemName} Emulation
        </p>

        <p className="text-xs text-zinc-400 leading-relaxed mb-4">
          <strong className="text-zinc-200">PlayStation 2</strong>,{" "}
          <strong className="text-zinc-200">Sega Dreamcast</strong>, and{" "}
          <strong className="text-zinc-200">Nintendo GameCube</strong> emulation requires desktop hardware and is not playable on mobile browsers.
        </p>

        <div className="w-full p-3 rounded-xl bg-zinc-900/90 border border-white/10 text-xs text-zinc-300 mb-6 text-left">
          <p className="mb-1 font-semibold text-white">Recommended Setup:</p>
          <ul className="list-disc list-inside space-y-1 text-[11px] text-zinc-400">
            <li>Open ROM Vault on a desktop computer.</li>
            <li><strong className="text-cyan-300">Microsoft Edge</strong> is recommended for 60 FPS hardware acceleration.</li>
            <li><strong className="text-zinc-200">PS1 (PSX)</strong> and retro 16-bit/32-bit games are fully playable on mobile!</li>
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
          <a
            href="/roms"
            className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-xs bg-white/10 hover:bg-white/15 text-white border border-white/10 transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Library
          </a>

          <a
            href={downloadUrl}
            download={game.romFileName}
            className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-xs bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 transition cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Download ROM
          </a>
        </div>
      </div>
    </div>
  );
}
