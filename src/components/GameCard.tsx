"use client";

import React, { useState, useRef } from "react";
import { Play, Info, Heart, Download, Monitor, EyeOff, Shield } from "lucide-react";
import type { CoverArtStyle, GameItem } from "@/types/game";
import { isDesktopOnlySystem } from "@/lib/systems";

interface GameCardProps {
  game: GameItem;
  coverStyle: CoverArtStyle;
  isFavorite: boolean;
  isMobile?: boolean;
  isAdmin?: boolean;
  onToggleFavorite: (gameId: string) => void;
  onSelectDetail: (game: GameItem) => void;
  onPlay: (game: GameItem) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function getCoverUrl(game: GameItem, style: CoverArtStyle): string | null {
  if (game.customCoverUrl) {
    return game.customCoverUrl;
  }
  if (game.preferredCover) {
    switch (game.preferredCover) {
      case "artwork_front":
        return game.media.artworkFront ?? game.media.artwork3d;
      case "artwork_3d":
        return game.media.artwork3d ?? game.media.artworkFront;
      case "medium_front":
        return game.media.mediumFront ?? game.media.mediumDisc ?? game.media.artworkFront;
      case "medium_disc":
        return game.media.mediumDisc ?? game.media.mediumFront ?? game.media.artworkFront;
      case "screentitle":
        return game.media.screenTitle ?? game.media.screenshot;
      case "screenshot":
        return game.media.screenshot ?? game.media.screenTitle;
      case "fanart":
        return game.media.fanart ?? game.media.artworkFront;
      default:
        if (game.preferredCover.startsWith("http") || game.preferredCover.startsWith("/")) {
          return game.preferredCover;
        }
        break;
    }
  }
  switch (style) {
    case "artwork_3d":
      return game.media.artwork3d ?? game.media.artworkFront;
    case "medium_front":
      return game.media.mediumFront ?? game.media.mediumDisc ?? game.media.artworkFront;
    case "screentitle":
      return game.media.screenTitle ?? game.media.screenshot;
    case "fanart":
      return game.media.fanart ?? game.media.screenshot ?? game.media.artworkFront;
    case "artwork_front":
    default:
      return game.media.artworkFront ?? game.media.artwork3d ?? game.media.mediumFront ?? game.media.mediumDisc;
  }
}

export function GameCard({
  game,
  coverStyle,
  isFavorite,
  isMobile = false,
  onToggleFavorite,
  onSelectDetail,
  onPlay,
}: GameCardProps): React.ReactElement {
  const [showVideoPreview, setShowVideoPreview] = useState<boolean>(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDesktopOnly = isDesktopOnlySystem(game.system);
  const isBlockedOnMobile = isMobile && isDesktopOnly;

  const coverUrl = getCoverUrl(game, coverStyle);
  const isWideAspect = coverStyle === "screentitle";

  const handleMouseEnter = (): void => {
    if (!game.media.video) {
      return;
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setShowVideoPreview(true);
    }, 450);
  };

  const handleMouseLeave = (): void => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setShowVideoPreview(false);
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => onSelectDetail(game)}
      className={`group relative flex flex-col rounded-2xl border ${
        game.isDisabled
          ? "border-amber-500/50 bg-zinc-950/90 opacity-80 hover:opacity-100 hover:border-amber-400"
          : "border-white/10 bg-zinc-900/70 hover:bg-zinc-900 hover:border-red-500/60"
      } transition-all duration-300 overflow-hidden shadow-lg hover:shadow-2xl hover:shadow-red-600/15 hover:-translate-y-1.5 cursor-pointer`}
    >
      <div
        className={`relative w-full ${
          isWideAspect ? "aspect-video" : "aspect-[3/4]"
        } bg-zinc-950 flex items-center justify-center overflow-hidden p-2`}
      >
        {showVideoPreview && game.media.video ? (
          <video
            src={game.media.video}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover rounded-xl"
          />
        ) : coverUrl ? (
          <img
            src={coverUrl}
            alt={game.displayTitle}
            loading="lazy"
            className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105 drop-shadow-[0_8px_16px_rgba(0,0,0,0.8)]"
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-center px-3 text-xs text-zinc-500">
            {game.displayTitle}
          </div>
        )}

        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-1.5 flex-wrap">
            {game.isDisabled && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-zinc-900/90 text-amber-300 border border-amber-500/50 shadow flex items-center gap-1 backdrop-blur-md">
                <EyeOff className="w-3 h-3 text-amber-400" />
                <span>Disabled</span>
              </span>
            )}
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider text-white shadow ${
                game.badgeColor || (game.system === "snes" ? "bg-purple-600/90" : "bg-red-600/90")
              }`}
            >
              {game.systemLabel}
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-black/75 text-zinc-200 border border-white/10 backdrop-blur-md">
              {game.regions[0] ?? "USA"}{game.year ? ` (${game.year})` : ""}
            </span>
            {game.discs && game.discs.length > 1 && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-red-950/85 text-red-200 border border-red-500/40 backdrop-blur-md">
                {game.discs.length} Discs
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(game.id);
            }}
            aria-label={
              isFavorite ? "Remove from favorites" : "Add to favorites"
            }
            className={`pointer-events-auto p-1.5 rounded-full backdrop-blur-md border transition cursor-pointer ${
              isFavorite
                ? "bg-red-600 text-white border-red-400"
                : "bg-black/60 text-zinc-300 border-white/15 opacity-0 group-hover:opacity-100 hover:bg-black"
            }`}
          >
            <Heart
              className={`w-3.5 h-3.5 ${isFavorite ? "fill-current" : ""}`}
            />
          </button>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black via-black/85 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
          {isBlockedOnMobile ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectDetail(game);
              }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold bg-zinc-800/90 hover:bg-zinc-700 text-amber-300 border border-amber-500/30 transition cursor-pointer"
              title="PS2, Dreamcast, and GameCube emulation requires desktop"
            >
              <Monitor className="w-3.5 h-3.5 text-amber-400" />
              Desktop Only
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPlay(game);
              }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/40 transition cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {game.playable ? "Play" : "Details"}
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectDetail(game);
            }}
            className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/15 backdrop-blur-md transition cursor-pointer"
            title="View Story, Video & Artwork"
          >
            <Info className="w-3.5 h-3.5" />
          </button>

          <a
            href={`${game.media.rom}${game.media.rom.includes("?") ? "&" : "?"}download=1`}
            download={game.romFileName}
            onClick={(e) => e.stopPropagation()}
            className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/15 backdrop-blur-md transition"
            title="Download ROM"
          >
            <Download className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      <div className="p-3.5 flex flex-col gap-1 flex-1 justify-between bg-zinc-900/90 border-t border-white/5">
        <h3
          className="text-sm font-bold text-zinc-100 group-hover:text-red-400 transition line-clamp-1"
          title={game.displayTitle}
        >
          {game.displayTitle}
        </h3>
        <div className="flex items-center justify-between text-[11px] text-zinc-500">
          <span className="truncate">{game.regions.join(", ")}{game.year ? ` (${game.year})` : ""}</span>
          <span className="font-mono shrink-0">
            {formatFileSize(game.fileSizeBytes)}
          </span>
        </div>
      </div>
    </div>
  );
}
