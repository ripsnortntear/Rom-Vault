"use client";

import React from "react";
import { HardDrive, ArrowLeft, Download, ExternalLink } from "lucide-react";

interface StandaloneRecommendationViewProps {
  game: {
    id: string;
    title: string;
    system: string;
    romFileName?: string;
  };
}

export function StandaloneRecommendationView({
  game,
}: StandaloneRecommendationViewProps): React.ReactElement {
  const isGameCube = game.system === "gamecube";
  const isDreamcast = game.system === "dreamcast";

  const systemName = isGameCube
    ? "Nintendo GameCube"
    : isDreamcast
    ? "Sega Dreamcast"
    : game.system === "ps2"
    ? "PlayStation 2"
    : game.system.toUpperCase();

  const emulatorName = isGameCube ? "Dolphin" : isDreamcast ? "Flycast / Redream" : "RetroArch";
  const emulatorUrl = isGameCube
    ? "https://dolphin-emu.org/download/"
    : isDreamcast
    ? "https://flycast.emuplace.com/"
    : "https://www.retroarch.com/";

  const safeGameId = game.id.includes("%") ? game.id : encodeURIComponent(game.id);
  const downloadUrl = `/roms/api/roms/${safeGameId}/stream?download=1`;

  return (
    <div className="fixed inset-0 w-screen h-screen bg-[#070709] text-zinc-100 flex flex-col items-center justify-center p-6 text-center z-50 overflow-y-auto">
      <div className="max-w-md w-full p-6 sm:p-8 rounded-3xl bg-zinc-950/90 border border-purple-500/30 shadow-2xl backdrop-blur-md flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center mb-4 text-purple-400">
          <HardDrive className="w-8 h-8" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-950/60 border border-purple-500/30 text-[11px] font-bold text-purple-300 uppercase tracking-wider mb-3">
          <span>Standalone Emulator Recommended</span>
        </div>

        <h2 className="text-xl sm:text-2xl font-black text-white mb-1 tracking-tight">
          {game.title}
        </h2>

        <p className="text-xs text-purple-300 font-semibold mb-4">
          {systemName} Disc Image
        </p>

        <p className="text-xs text-zinc-400 leading-relaxed mb-6">
          <strong className="text-zinc-200">{systemName}</strong> titles are full disc images optimized for standalone desktop emulators (<strong className="text-white">{emulatorName}</strong>) for true 60 FPS performance, low-latency audio, and enhanced internal rendering resolutions.
        </p>

        <div className="flex flex-col gap-2.5 w-full mb-4">
          <a
            href={emulatorUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-xs bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/30 transition transform hover:-translate-y-0.5 cursor-pointer"
          >
            <ExternalLink className="w-4 h-4" />
            Download {isGameCube ? "Dolphin Emulator" : isDreamcast ? "Flycast Emulator" : "Standalone Emulator"}
          </a>

          <a
            href={downloadUrl}
            download={game.romFileName}
            className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-xs bg-zinc-800 hover:bg-zinc-700 text-white border border-white/10 shadow-md transition transform hover:-translate-y-0.5 cursor-pointer"
          >
            <Download className="w-4 h-4 text-purple-400" />
            Download Game Archive
          </a>
        </div>

        <a
          href="/roms"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Library
        </a>
      </div>
    </div>
  );
}
