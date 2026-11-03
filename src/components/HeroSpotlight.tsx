"use client";

import React, { useState, useEffect } from "react";
import {
  Play,
  Info,
  Download,
  Shuffle,
  Volume2,
  VolumeX,
  Sparkles,
  Monitor,
} from "lucide-react";
import type { GameItem } from "@/types/game";
import { isDesktopOnlySystem } from "@/lib/systems";

interface HeroSpotlightProps {
  game: GameItem;
  isMobile?: boolean;
  onPlay: (game: GameItem) => void;
  onSelectDetail: (game: GameItem) => void;
  onShuffle: () => void;
}

export function HeroSpotlight({
  game,
  isMobile = false,
  onPlay,
  onSelectDetail,
  onShuffle,
}: HeroSpotlightProps): React.ReactElement {
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [videoError, setVideoError] = useState<boolean>(false);
  const [screenshotError, setScreenshotError] = useState<boolean>(false);
  const [titleScreenError, setTitleScreenError] = useState<boolean>(false);
  const [finalFallbackError, setFinalFallbackError] = useState<boolean>(false);

  // Reset errors whenever featured game changes
  useEffect(() => {
    setVideoError(false);
    setScreenshotError(false);
    setTitleScreenError(false);
    setFinalFallbackError(false);
  }, [game.id]);

  // Fallback progression:
  // 1. Video (game.media.video)
  const canShowVideo = Boolean(game.media.video && !videoError);

  // 2. Fall back to Screenshot (game.media.screenshot)
  const canShowScreenshot = Boolean(
    !canShowVideo && game.media.screenshot && !screenshotError
  );

  // 3. Fall back to Title Screen (game.media.screenTitle)
  const canShowTitleScreen = Boolean(
    !canShowVideo && !canShowScreenshot && game.media.screenTitle && !titleScreenError
  );

  // 4. Fall back to Screenshot / Fanart / Box Art
  const finalFallbackImage =
    game.media.screenshot ??
    game.media.fanart ??
    game.media.artworkFront ??
    game.media.artwork3d ??
    null;

  const canShowFinalFallback = Boolean(
    !canShowVideo &&
      !canShowScreenshot &&
      !canShowTitleScreen &&
      finalFallbackImage &&
      !finalFallbackError
  );

  const backdropImage =
    (!screenshotError && game.media.screenshot) ||
    (!titleScreenError && game.media.screenTitle) ||
    game.media.fanart ||
    game.media.artworkFront ||
    null;

  return (
    <section className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl mb-8">
      {backdropImage && (
        <div
          className="absolute inset-0 bg-cover bg-center scale-110 blur-2xl opacity-35 transition-all duration-700"
          style={{ backgroundImage: `url("${backdropImage}")` }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/90 to-zinc-950/40" />
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-zinc-950/50" />

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 p-6 sm:p-10 items-center">
        <div className="lg:col-span-7 flex flex-col items-start gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-white shadow-lg ${
                game.badgeColor || (game.system === "snes" ? "bg-purple-600/90 shadow-purple-600/25" : "bg-red-600/90 shadow-red-600/25")
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Featured {game.systemLabel} Classic
            </span>
            {game.regions.map((region) => (
              <span
                key={region}
                className="px-2.5 py-1 rounded-full text-xs font-semibold bg-white/10 text-zinc-200 border border-white/10"
              >
                {region}
              </span>
            ))}
            {game.year && (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-600/30 text-red-200 border border-red-500/40">
                {game.year}
              </span>
            )}
            <span className="px-2.5 py-1 rounded-full text-xs font-mono bg-white/5 text-zinc-400 border border-white/10">
              {game.fileSizeBytes >= 1024 * 1024 * 1024
                ? `${(game.fileSizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
                : game.fileSizeBytes >= 1024 * 1024
                ? `${(game.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`
                : `${Math.max(1, Math.round(game.fileSizeBytes / 1024))} KB`}
            </span>
          </div>

          {game.media.logo ? (
            <div className="h-20 sm:h-28 flex items-center my-1">
              <img
                src={game.media.logo}
                alt={game.displayTitle}
                className="max-h-full max-w-[320px] sm:max-w-[420px] object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.85)]"
              />
            </div>
          ) : (
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
              {game.displayTitle}
            </h1>
          )}

          <h2 className="text-lg sm:text-xl font-bold text-zinc-100">
            {game.displayTitle}
          </h2>

          <p className="text-sm sm:text-base text-zinc-300 line-clamp-3 max-w-2xl leading-relaxed">
            {game.story ||
              `Experience this classic ${game.systemLabel} release in full original fidelity with instant browser emulation, box art, title screens, and video previews.`}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {isMobile && isDesktopOnlySystem(game.system) ? (
              <button
                type="button"
                onClick={() => onSelectDetail(game)}
                className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl font-bold text-sm sm:text-base bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-amber-500/30 transition transform hover:-translate-y-0.5 cursor-pointer"
                title="PS2, Dreamcast, GameCube, and Saturn emulation requires a desktop computer"
              >
                <Monitor className="w-5 h-5 text-amber-400" />
                <span>Desktop Only</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onPlay(game)}
                className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl font-bold text-sm sm:text-base bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 transition transform hover:-translate-y-0.5 cursor-pointer"
              >
                <Play className="w-5 h-5 fill-current" />
                Play Now
              </button>
            )}

            <button
              type="button"
              onClick={() => onSelectDetail(game)}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm sm:text-base bg-white/10 hover:bg-white/20 text-white border border-white/15 backdrop-blur-md transition cursor-pointer"
            >
              <Info className="w-5 h-5" />
              More Info &amp; Artwork
            </button>

            <a
              href={`${game.media.rom}${game.media.rom.includes("?") ? "&" : "?"}download=1`}
              download={game.romFileName}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200 border border-white/10 transition"
            >
              <Download className="w-4 h-4" />
              Download ROM
            </a>

            <button
              type="button"
              onClick={onShuffle}
              title="Randomize Featured Game"
              className="inline-flex items-center gap-2 px-3.5 py-3 rounded-xl font-medium text-sm bg-zinc-900/70 hover:bg-zinc-800 text-zinc-300 border border-white/10 transition cursor-pointer"
            >
              <Shuffle className="w-4 h-4" />
              <span className="hidden sm:inline">Surprise Me</span>
            </button>
          </div>
        </div>

        <div className="lg:col-span-5 flex items-center justify-center">
          <div className="relative w-full max-w-md aspect-video rounded-2xl overflow-hidden border border-white/15 bg-black shadow-2xl group">
            {canShowVideo ? (
              <>
                <video
                  key={game.media.video}
                  src={game.media.video!}
                  poster={game.media.screenshot ?? game.media.screenTitle ?? undefined}
                  autoPlay
                  loop
                  muted={isMuted}
                  playsInline
                  onError={() => setVideoError(true)}
                  className="w-full h-full object-contain bg-black"
                />
                <button
                  type="button"
                  onClick={() => setIsMuted((prev) => !prev)}
                  className="absolute bottom-3 right-3 p-2.5 rounded-full bg-black/70 hover:bg-black text-white border border-white/20 backdrop-blur-md transition cursor-pointer"
                  aria-label={isMuted ? "Unmute preview video" : "Mute preview video"}
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-red-400" />
                  )}
                </button>
              </>
            ) : canShowScreenshot ? (
              <img
                src={game.media.screenshot!}
                alt={`${game.displayTitle} Screenshot`}
                onError={() => setScreenshotError(true)}
                className="w-full h-full object-contain"
              />
            ) : canShowTitleScreen ? (
              <img
                src={game.media.screenTitle!}
                alt={`${game.displayTitle} Title Screen`}
                onError={() => setTitleScreenError(true)}
                className="w-full h-full object-contain"
              />
            ) : canShowFinalFallback ? (
              <img
                src={finalFallbackImage!}
                alt={`${game.displayTitle} Preview`}
                onError={() => setFinalFallbackError(true)}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900/50 text-zinc-500 p-6 text-center">
                <Sparkles className="w-8 h-8 mb-2 opacity-40 text-purple-400" />
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                  {game.systemLabel}
                </span>
                <span className="text-sm font-bold text-zinc-300 mt-1 line-clamp-1">
                  {game.displayTitle}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
