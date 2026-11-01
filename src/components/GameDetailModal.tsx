"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Play,
  Download,
  Heart,
  Film,
  Image as ImageIcon,
  Box,
  Disc,
  Tv,
  BookOpen,
  MessageSquare,
  Volume2,
  VolumeX,
  Monitor,
  Info,
} from "lucide-react";
import type { GameItem } from "@/types/game";
import { isDesktopOnlySystem } from "@/lib/systems";
import {
  GameSocialProvider,
  GameRatingWidget,
  GameLeaderboardSnapshot,
  GameCommentsFeed,
} from "@/components/community/GameSocialSection";

interface GameDetailModalProps {
  game: GameItem | null;
  isFavorite: boolean;
  isMobile?: boolean;
  onToggleFavorite: (gameId: string) => void;
  onClose: () => void;
  onPlay: (game: GameItem) => void;
}

type MediaTab =
  | "video"
  | "screentitle"
  | "screenshot"
  | "artwork_front"
  | "artwork_3d"
  | "medium_front"
  | "medium_disc"
  | "fanart"
  | "bezel_day";

interface MediaTabOption {
  id: MediaTab;
  label: string;
  available: boolean;
  icon: React.ReactNode;
}

export function GameDetailModal({
  game,
  isFavorite,
  isMobile = false,
  onToggleFavorite,
  onClose,
  onPlay,
}: GameDetailModalProps): React.ReactElement | null {
  const [activeTab, setActiveTab] = useState<MediaTab>("video");
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [selectedDiscIndex, setSelectedDiscIndex] = useState<number>(0);
  const [enrichedMeta, setEnrichedMeta] = useState<{
    year?: number | null;
    developer?: string | null;
    publisher?: string | null;
    genres?: string[];
  } | null>(null);

  const isDesktopOnly = game ? isDesktopOnlySystem(game.system) : false;
  const isBlockedOnMobile = isMobile && isDesktopOnly;

  useEffect(() => {
    if (game) {
      setIsMuted(true);
      setSelectedDiscIndex(0);
      setEnrichedMeta(null);
      setActiveTab(
        game.media.video
          ? "video"
          : game.media.screenTitle
          ? "screentitle"
          : game.media.artworkFront
          ? "artwork_front"
          : "screenshot"
      );

      if (!game.year) {
        let isMounted = true;
        fetch(
          `/roms/api/games/${encodeURIComponent(game.id)}/metadata?title=${encodeURIComponent(
            game.displayTitle
          )}`
        )
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (isMounted && data?.metadata) {
              setEnrichedMeta({
                year: data.metadata.year,
                developer: data.metadata.developer,
                publisher: data.metadata.publisher,
                genres: data.metadata.genres,
              });
            }
          })
          .catch(() => {});

        return () => {
          isMounted = false;
        };
      }
    }
  }, [game]);

  if (!game) {
    return null;
  }

  const activeDisc =
    game.discs && game.discs[selectedDiscIndex]
      ? game.discs[selectedDiscIndex]
      : null;
  const activeRomFileName = activeDisc ? activeDisc.fileName : game.romFileName;
  const activeRomUrl = activeDisc ? activeDisc.romUrl : game.media.rom;
  const activeDiscNum = activeDisc ? activeDisc.discNumber : 1;

  const handlePlayActive = () => {
    onPlay({
      ...game,
      romFileName: activeRomFileName,
      media: {
        ...game.media,
        rom: activeRomUrl,
      },
    });
  };

  const allTabs: MediaTabOption[] = [
    {
      id: "video",
      label: "Gameplay Video",
      available: Boolean(game.media.video),
      icon: <Film className="w-3.5 h-3.5" />,
    },
    {
      id: "screentitle",
      label: "Title Screen",
      available: Boolean(game.media.screenTitle),
      icon: <Tv className="w-3.5 h-3.5" />,
    },
    {
      id: "screenshot",
      label: "Screenshot",
      available: Boolean(game.media.screenshot),
      icon: <ImageIcon className="w-3.5 h-3.5" />,
    },
    {
      id: "artwork_front",
      label: "2D Box Art",
      available: Boolean(game.media.artworkFront),
      icon: <Box className="w-3.5 h-3.5" />,
    },
    {
      id: "artwork_3d",
      label: "3D Box Art",
      available: Boolean(game.media.artwork3d),
      icon: <Box className="w-3.5 h-3.5" />,
    },
    {
      id: "medium_front",
      label: "Cartridge",
      available: Boolean(game.media.mediumFront),
      icon: <Disc className="w-3.5 h-3.5" />,
    },
    {
      id: "medium_disc",
      label: "Disc Media",
      available: Boolean(game.media.mediumDisc),
      icon: <Disc className="w-3.5 h-3.5" />,
    },
    {
      id: "fanart",
      label: "Fan Art",
      available: Boolean(game.media.fanart),
      icon: <ImageIcon className="w-3.5 h-3.5" />,
    },
    {
      id: "bezel_day",
      label: "Bezel Frame",
      available: Boolean(game.media.bezelDay),
      icon: <Tv className="w-3.5 h-3.5" />,
    },
  ];

  const tabs = allTabs.filter((t) => t.available);

  const getActiveImageUrl = (): string | null => {
    switch (activeTab) {
      case "screentitle":
        return game.media.screenTitle;
      case "screenshot":
        return game.media.screenshot;
      case "artwork_front":
        return game.media.artworkFront;
      case "artwork_3d":
        return game.media.artwork3d;
      case "medium_front":
        return game.media.mediumFront;
      case "medium_disc":
        return game.media.mediumDisc;
      case "fanart":
        return game.media.fanart;
      case "bezel_day":
        return game.media.bezelDay;
      default:
        return null;
    }
  };

  const backdropUrl =
    game.media.fanart ?? game.media.artworkFront ?? game.media.screenshot ?? game.media.screenTitle;

  const thumbnailItems: Array<{
    label: string;
    url: string | null;
    tab: MediaTab;
  }> = [
    { label: "2D Box", url: game.media.artworkFront, tab: "artwork_front" },
    { label: "3D Box", url: game.media.artwork3d, tab: "artwork_3d" },
    {
      label: game.media.mediumDisc ? "Disc" : "Cartridge",
      url: game.media.mediumDisc ?? game.media.mediumFront,
      tab: game.media.mediumDisc ? "medium_disc" : "medium_front",
    },
    { label: "Title Screen", url: game.media.screenTitle, tab: "screentitle" },
    { label: "Screenshot", url: game.media.screenshot, tab: "screenshot" },
    { label: "Fan Art", url: game.media.fanart, tab: "fanart" },
  ];

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/85 backdrop-blur-xl p-2 sm:p-3 md:p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full md:w-[98vw] max-w-[99vw] 2xl:max-w-[1920px] rounded-2xl md:rounded-3xl border border-white/15 bg-zinc-950 shadow-2xl overflow-hidden my-auto h-full sm:h-[95vh] max-h-[96vh] flex flex-col"
      >
        {backdropUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center blur-3xl opacity-25 pointer-events-none"
            style={{ backgroundImage: `url("${backdropUrl}")` }}
          />
        )}

        {/* Modal Header */}
        <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-zinc-900/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase text-white ${
                game.badgeColor || (game.system === "snes" ? "bg-purple-600" : "bg-red-600")
              }`}
            >
              {game.systemLabel}
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-white truncate">
              {game.displayTitle}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-zinc-200 transition cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body wrapped in GameSocialProvider */}
        <GameSocialProvider
          gameId={game.id}
          gameTitle={game.displayTitle}
          system={game.system}
        >
          <div className="relative z-10 overflow-y-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 flex-1">
            {/* Left Column: Media Viewport + Red Play Button Directly Under Media */}
            <div className="lg:col-span-6 flex flex-col gap-4">
              {/* Media Viewport */}
              <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-white/15 bg-black flex items-center justify-center shadow-2xl group">
                {activeTab === "video" && game.media.video ? (
                  <>
                    <video
                      key={game.media.video}
                      src={game.media.video}
                      poster={game.media.screenTitle ?? game.media.screenshot ?? undefined}
                      autoPlay
                      loop
                      muted={isMuted}
                      playsInline
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
                        <Volume2 className="w-4 h-4" />
                      )}
                    </button>
                  </>
                ) : (
                  <img
                    src={getActiveImageUrl() ?? ""}
                    alt={`${game.displayTitle} - ${activeTab}`}
                    className="w-full h-full object-contain p-3"
                  />
                )}
              </div>

              {/* Big Red Play Button & Disc Selector - Placed immediately beneath media container */}
              <div className="flex flex-col gap-2.5 pt-1">
                {isBlockedOnMobile ? (
                  <>
                    <button
                      type="button"
                      disabled
                      className="w-full inline-flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-2xl font-bold text-sm bg-zinc-900 border border-amber-500/40 text-amber-300 shadow-md cursor-not-allowed"
                    >
                      <Monitor className="w-5 h-5 text-amber-400" />
                      <span>Playable on Desktop Only</span>
                    </button>
                    <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs text-amber-200 flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="flex flex-col gap-0.5">
                        <strong className="text-white">Desktop Required for {game.systemLabel}</strong>
                        <span>
                          PlayStation 2, Sega Dreamcast, and Nintendo GameCube emulation requires desktop hardware and is not supported on mobile devices. Open ROM Vault on a desktop browser (Microsoft Edge recommended).
                        </span>
                        <span className="text-zinc-400 text-[11px] mt-1">
                          PS1 (PlayStation) and retro 16-bit / 32-bit consoles remain fully playable on mobile.
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handlePlayActive}
                      className="w-full inline-flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-2xl font-black text-base bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 active:from-red-700 active:to-red-800 text-white shadow-xl shadow-red-600/30 transition transform active:scale-[0.98] cursor-pointer"
                    >
                      <Play className="w-5 h-5 fill-current" />
                      <span>
                        {game.playable
                          ? game.discs && game.discs.length > 1
                            ? `Play Disc ${activeDiscNum} in Browser Now`
                            : "Play in Browser Now"
                          : "Play / Download Options"}
                      </span>
                    </button>
                    {isDesktopOnly && (
                      <div className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-xs text-cyan-200 flex items-center gap-2">
                        <Monitor className="w-4 h-4 text-cyan-400 shrink-0" />
                        <span>
                          <strong>Edge Recommended:</strong> For optimal 60 FPS performance on {game.systemLabel}, Microsoft Edge is recommended on desktop.
                        </span>
                      </div>
                    )}
                  </>
                )}

                {/* Multi-disc Starting Disc Selector */}
                {game.discs && game.discs.length > 1 && (
                  <div className="flex flex-col gap-2 p-3 rounded-xl bg-zinc-950/80 border border-white/10 text-xs">
                    <div className="font-semibold text-zinc-300 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Disc className="w-3.5 h-3.5 text-red-400" />
                        Select Starting Disc ({game.discs.length} Discs)
                      </span>
                      <span className="text-red-400 font-bold text-[11px] bg-red-950/80 px-2 py-0.5 rounded border border-red-500/30">
                        Loaded: Disc {activeDiscNum}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {game.discs.map((d, idx) => {
                        const isSelected = idx === selectedDiscIndex;
                        return (
                          <div
                            key={d.discNumber}
                            onClick={() => setSelectedDiscIndex(idx)}
                            className={`group flex items-center justify-between p-2 rounded-lg border transition cursor-pointer ${
                              isSelected
                                ? "bg-red-600/20 border-red-500/80 text-white shadow-md shadow-red-600/20 ring-1 ring-red-500/50"
                                : "bg-zinc-900/90 hover:bg-zinc-800 border-white/10 text-zinc-300 hover:border-white/25"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                  isSelected
                                    ? "border-red-400 bg-red-500 text-white"
                                    : "border-zinc-500 bg-zinc-800"
                                }`}
                              >
                                {isSelected && (
                                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                )}
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="font-bold text-xs truncate">
                                  Disc {d.discNumber}
                                </span>
                                <span className="text-[10px] text-zinc-400 font-mono">
                                  {d.fileSizeBytes >= 1024 * 1024 * 1024
                                    ? `${(d.fileSizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
                                    : `${Math.round(d.fileSizeBytes / (1024 * 1024))} MB`}
                                </span>
                              </div>
                            </div>

                            <a
                              href={`${d.romUrl}${d.romUrl.includes("?") ? "&" : "?"}download=1`}
                              download={d.fileName}
                              onClick={(e) => e.stopPropagation()}
                              className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-zinc-200 hover:text-white transition shrink-0 ml-1"
                              title={`Download Disc ${d.discNumber}`}
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Media Switcher Tab Buttons */}
              <div className="flex flex-wrap gap-2 pt-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      activeTab === tab.id
                        ? "bg-red-600 text-white border-red-500 shadow-lg shadow-red-600/30"
                        : "bg-zinc-900/90 text-zinc-300 border-white/10 hover:bg-zinc-800 hover:text-white"
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Media Thumbnails Grid */}
              <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-3 xl:grid-cols-6 gap-2 pt-1">
                {thumbnailItems.map(
                  (thumb) =>
                    thumb.url && (
                      <button
                        key={thumb.label}
                        type="button"
                        onClick={() => setActiveTab(thumb.tab)}
                        className={`group flex flex-col items-center gap-1 p-1.5 rounded-xl border transition cursor-pointer ${
                          activeTab === thumb.tab
                            ? "border-red-500 bg-red-600/10"
                            : "border-white/10 bg-zinc-900/60 hover:border-white/30"
                        }`}
                      >
                        <img
                          src={thumb.url}
                          alt={thumb.label}
                          className="h-12 w-full object-contain group-hover:scale-105 transition"
                        />
                        <span className="text-[9px] font-medium text-zinc-400 truncate">
                          {thumb.label}
                        </span>
                      </button>
                    )
                )}
              </div>

              {/* Desktop Comments Section */}
              <div className="mt-4 border-t border-zinc-800/80 pt-4 flex-1 hidden lg:flex flex-col min-h-0">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-red-400" />
                  <span>Community Comments</span>
                </h4>
                <div className="max-h-[380px] overflow-y-auto pr-2 custom-scrollbar [scrollbar-width:thin] [scrollbar-color:rgba(63,63,70,0.4)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-700/40 hover:[&::-webkit-scrollbar-thumb]:bg-zinc-500/70 active:[&::-webkit-scrollbar-thumb]:bg-indigo-500">
                  <GameCommentsFeed gameId={game.id} />
                </div>
              </div>
            </div>

            {/* Right Column: Badges, Rating, Download & Fav, Overview */}
            <div className="lg:col-span-6 flex flex-col justify-between gap-6">
              <div className="flex flex-col gap-4">
                {game.media.logo && (
                  <div className="h-20 flex items-center justify-center sm:justify-start bg-zinc-900/50 rounded-2xl p-3 border border-white/5">
                    <img
                      src={game.media.logo}
                      alt={game.displayTitle}
                      className="max-h-full max-w-full object-contain drop-shadow-lg"
                    />
                  </div>
                )}

                {/* Metadata & Badges */}
                <div className="flex flex-wrap items-center gap-2">
                  {game.regions.map((region) => (
                    <span
                      key={region}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/10 text-zinc-200 border border-white/10"
                    >
                      Region: {region}
                    </span>
                  ))}
                  {(enrichedMeta?.year ?? game.year) && (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-600/20 text-red-300 border border-red-500/30">
                      Year: {enrichedMeta?.year ?? game.year}
                    </span>
                  )}
                  {(enrichedMeta?.developer ?? game.developer) && (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/10 text-zinc-200 border border-white/10">
                      Dev: {enrichedMeta?.developer ?? game.developer}
                    </span>
                  )}
                  {(enrichedMeta?.publisher ?? game.publisher) && (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/10 text-zinc-200 border border-white/10">
                      Pub: {enrichedMeta?.publisher ?? game.publisher}
                    </span>
                  )}
                  {game.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 border border-white/10"
                    >
                      {tag}
                    </span>
                  ))}
                  <span className="px-2.5 py-1 rounded-lg text-xs font-mono bg-zinc-900 text-zinc-400 border border-white/10">
                    {game.fileSizeBytes >= 1024 * 1024 * 1024
                      ? `${(game.fileSizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
                      : game.fileSizeBytes >= 1024 * 1024
                      ? `${(game.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`
                      : `${Math.max(1, Math.round(game.fileSizeBytes / 1024))} KB`}
                  </span>
                </div>

                {/* Star Rating Widget */}
                <GameRatingWidget />

                {/* Secondary Actions: Download and Favorite */}
                <div className="grid grid-cols-2 gap-3 py-1">
                  <a
                    href={`${activeRomUrl}${activeRomUrl.includes("?") ? "&" : "?"}download=1`}
                    download={activeRomFileName}
                    className="inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-xs sm:text-sm bg-white/10 hover:bg-white/20 text-white border border-white/15 transition"
                  >
                    <Download className="w-4 h-4" />
                    Download {game.discs && game.discs.length > 1 ? `Disc ${activeDiscNum}` : "ROM"}
                  </a>

                  <button
                    type="button"
                    onClick={() => onToggleFavorite(game.id)}
                    className={`inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-xs sm:text-sm border transition cursor-pointer ${
                      isFavorite
                        ? "bg-red-600/20 border-red-500 text-red-200"
                        : "bg-zinc-900 hover:bg-zinc-800 border-white/15 text-zinc-200"
                    }`}
                  >
                    <Heart
                      className={`w-4 h-4 ${isFavorite ? "fill-current text-red-500" : ""}`}
                    />
                    {isFavorite ? "Favorited" : "Favorite"}
                  </button>
                </div>

                {/* Storyline Overview */}
                <div className="flex flex-col gap-2 bg-zinc-900/70 border border-white/10 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-400">
                    <BookOpen className="w-4 h-4" />
                    Story &amp; Gameplay Overview
                  </div>
                  <div className="text-sm text-zinc-300 leading-relaxed max-h-52 overflow-y-auto pr-1 whitespace-pre-line custom-scrollbar">
                    {game.story || "No story text available for this title."}
                  </div>
                </div>

                {/* Vault Leaderboard Snapshot Banner */}
                <GameLeaderboardSnapshot />

                {/* Mobile Comments Section */}
                <div className="mt-6 border-t border-zinc-800/80 pt-4 flex lg:hidden flex-col">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-red-400" />
                    <span>Community Comments</span>
                  </h4>
                  <div className="max-h-[380px] overflow-y-auto pr-2 custom-scrollbar [scrollbar-width:thin] [scrollbar-color:rgba(63,63,70,0.4)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-700/40 hover:[&::-webkit-scrollbar-thumb]:bg-zinc-500/70 active:[&::-webkit-scrollbar-thumb]:bg-indigo-500">
                    <GameCommentsFeed gameId={game.id} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </GameSocialProvider>
      </div>
    </div>
  );
}
