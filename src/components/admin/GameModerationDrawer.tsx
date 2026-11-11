"use client";

import React, { useState, useTransition } from "react";
import {
  ShieldAlert,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  Image as ImageIcon,
  RotateCcw,
  Trash2,
  Save,
  Box,
  Disc,
  Tv,
  Layers,
  Sparkles,
} from "lucide-react";
import type { GameItem } from "@/types/game";
import { moderateGameAction, wipeGameScoresAction } from "@/app/actions/admin";

interface GameModerationDrawerProps {
  game: GameItem;
  isOpen: boolean;
  onClose: () => void;
  onGameUpdated: (updatedGame: GameItem) => void;
}

interface MediaOption {
  key: string;
  label: string;
  url: string | null;
  icon: React.ReactNode;
}

export function GameModerationDrawer({
  game,
  isOpen,
  onClose,
  onGameUpdated,
}: GameModerationDrawerProps): React.ReactElement | null {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const [isDisabled, setIsDisabled] = useState<boolean>(Boolean(game.isDisabled));
  const [selectedCoverKey, setSelectedCoverKey] = useState<string>(
    game.preferredCover || "default"
  );
  const [customCoverUrl, setCustomCoverUrl] = useState<string>(game.customCoverUrl || "");
  const [customTitle, setCustomTitle] = useState<string>(game.displayTitle);
  const [customStory, setCustomStory] = useState<string>(game.story || "");

  if (!isOpen) return null;

  const availableMedia: MediaOption[] = [
    {
      key: "artwork_front",
      label: "2D Box Art",
      url: game.media.artworkFront,
      icon: <Box className="w-3.5 h-3.5" />,
    },
    {
      key: "artwork_3d",
      label: "3D Box Art",
      url: game.media.artwork3d,
      icon: <Box className="w-3.5 h-3.5" />,
    },
    {
      key: "screentitle",
      label: "Title Screen",
      url: game.media.screenTitle,
      icon: <Tv className="w-3.5 h-3.5" />,
    },
    {
      key: "screenshot",
      label: "Screenshot",
      url: game.media.screenshot,
      icon: <ImageIcon className="w-3.5 h-3.5" />,
    },
    {
      key: "medium_front",
      label: "Cartridge",
      url: game.media.mediumFront,
      icon: <Disc className="w-3.5 h-3.5" />,
    },
    {
      key: "medium_disc",
      label: "Disc",
      url: game.media.mediumDisc,
      icon: <Disc className="w-3.5 h-3.5" />,
    },
    {
      key: "fanart",
      label: "Fan Art",
      url: game.media.fanart,
      icon: <Sparkles className="w-3.5 h-3.5" />,
    },
  ].filter((m) => Boolean(m.url));

  const handleSaveModeration = () => {
    setMessage(null);
    startTransition(async () => {
      const preferred = selectedCoverKey === "default" ? null : selectedCoverKey;
      const cleanCustomUrl = customCoverUrl.trim() || null;
      const cleanTitle = customTitle.trim() || game.displayTitle;
      const cleanStory = customStory.trim() || game.story;

      const res = await moderateGameAction(game.id, game.system, {
        isDisabled,
        preferredCover: preferred,
        customCoverUrl: cleanCustomUrl,
        customTitle: cleanTitle !== game.baseName ? cleanTitle : null,
        customStory: cleanStory,
      });

      if (res.ok) {
        setMessage({ text: res.message || "Moderation saved successfully.", type: "success" });
        const updated: GameItem = {
          ...game,
          isDisabled,
          preferredCover: preferred,
          customCoverUrl: cleanCustomUrl,
          displayTitle: cleanTitle,
          sortTitle: cleanTitle,
          story: cleanStory,
        };
        onGameUpdated(updated);
      } else {
        setMessage({ text: res.error || "Failed to save moderation settings.", type: "error" });
      }
    });
  };

  const handleToggleDisabled = () => {
    const nextState = !isDisabled;
    setIsDisabled(nextState);
    setMessage(null);
    startTransition(async () => {
      const res = await moderateGameAction(game.id, game.system, {
        isDisabled: nextState,
      });
      if (res.ok) {
        setMessage({ text: res.message || "Status updated.", type: "success" });
        const updated: GameItem = {
          ...game,
          isDisabled: nextState,
        };
        onGameUpdated(updated);
      } else {
        setIsDisabled(!nextState);
        setMessage({ text: res.error || "Failed to toggle game status.", type: "error" });
      }
    });
  };

  const handleWipeScores = () => {
    if (!confirm(`Are you sure you want to wipe all leaderboard scores for "${game.displayTitle}"? This cannot be undone.`)) {
      return;
    }

    startTransition(async () => {
      const res = await wipeGameScoresAction(game.id);
      if (res.ok) {
        setMessage({ text: res.message || "Scores wiped.", type: "success" });
      } else {
        setMessage({ text: res.error || "Failed to wipe scores.", type: "error" });
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl max-h-[90vh] bg-zinc-950 border border-amber-500/40 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden text-xs text-zinc-300"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-zinc-900/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-white flex items-center gap-2">
                <span>Game Card Moderation</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-600/30 text-red-300 border border-red-500/30">
                  Admin Tool
                </span>
              </h3>
              <p className="text-[11px] text-zinc-400 truncate max-w-sm sm:max-w-md">
                {game.displayTitle} ({game.systemLabel})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Message Banner */}
        {message && (
          <div
            className={`px-5 py-2.5 flex items-center gap-2 text-xs font-semibold ${
              message.type === "success"
                ? "bg-emerald-950/80 text-emerald-200 border-b border-emerald-500/30"
                : "bg-red-950/80 text-red-200 border-b border-red-500/30"
            }`}
          >
            {message.type === "success" ? (
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex flex-col gap-6">
          {/* 1. Disable / Enable Toggle */}
          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 font-bold text-sm text-white">
                {isDisabled ? (
                  <>
                    <EyeOff className="w-4 h-4 text-amber-400" />
                    <span>Status: Disabled</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4 text-emerald-400" />
                    <span>Status: Active in Library</span>
                  </>
                )}
              </div>
              <p className="text-zinc-400 text-[11px] leading-relaxed max-w-md">
                {isDisabled
                  ? "This game is currently hidden from regular players. It is grouped into the 'Disabled' system filter pill for administrators."
                  : "Disabling this game will hide it from normal views and create or increment the 'Disabled' system pill."}
              </p>
            </div>

            <button
              type="button"
              disabled={isPending}
              onClick={handleToggleDisabled}
              className={`shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold transition shadow-md cursor-pointer ${
                isDisabled
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20"
                  : "bg-amber-600 hover:bg-amber-500 text-black shadow-amber-600/20"
              }`}
            >
              {isDisabled ? (
                <>
                  <Eye className="w-4 h-4" />
                  <span>Re-enable Game</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-4 h-4" />
                  <span>Disable Game</span>
                </>
              )}
            </button>
          </div>

          {/* 2. Choose Main Picture */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="font-bold text-sm text-white flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-amber-400" />
                <span>Select Main Picture for Game Card</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setSelectedCoverKey("default");
                  setCustomCoverUrl("");
                }}
                className="text-[11px] text-zinc-400 hover:text-white inline-flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset to Default</span>
              </button>
            </div>
            <p className="text-zinc-400 text-[11px]">
              Click any artwork or screenshot below to set it as the primary cover image on the game card.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-1">
              {availableMedia.map((media) => {
                const isSelected = selectedCoverKey === media.key && !customCoverUrl;
                return (
                  <button
                    key={media.key}
                    type="button"
                    onClick={() => {
                      setSelectedCoverKey(media.key);
                      setCustomCoverUrl("");
                    }}
                    className={`relative flex flex-col items-center gap-2 p-2 rounded-xl border text-center transition cursor-pointer group ${
                      isSelected
                        ? "border-amber-400 bg-amber-950/30 ring-2 ring-amber-400/50"
                        : "border-white/10 bg-zinc-900/40 hover:bg-zinc-800 hover:border-white/20"
                    }`}
                  >
                    <div className="w-full aspect-square rounded-lg bg-black/60 flex items-center justify-center overflow-hidden p-1">
                      {media.url ? (
                        <img
                          src={media.url}
                          alt={media.label}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-zinc-600">No Image</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-zinc-300 group-hover:text-white">
                      {media.icon}
                      <span>{media.label}</span>
                    </div>

                    {isSelected && (
                      <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500 text-black shadow">
                        Main Pic
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Custom Image URL fallback */}
            <div className="mt-2 flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-zinc-400">
                Or Custom Image URL:
              </label>
              <input
                type="url"
                placeholder="https://... (direct image URL)"
                value={customCoverUrl}
                onChange={(e) => setCustomCoverUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/15 text-white font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            </div>
          </div>

          {/* 3. Title & Synopsis Content */}
          <div className="flex flex-col gap-3 pt-2 border-t border-white/10">
            <label className="font-bold text-sm text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-400" />
              <span>Game Title &amp; Description</span>
            </label>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-zinc-400">Display Title:</label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/15 text-white font-medium text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-zinc-400">Story / Synopsis:</label>
              <textarea
                rows={3}
                value={customStory}
                onChange={(e) => setCustomStory(e.target.value)}
                placeholder="Game overview and storyline..."
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/15 text-white text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            </div>
          </div>

          {/* 4. Score Moderation */}
          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10 flex items-center justify-between gap-4">
            <div>
              <h4 className="font-bold text-white text-xs">Reset Leaderboard Records</h4>
              <p className="text-[11px] text-zinc-400">
                Permanently purge all user high scores for this game if records were manipulated.
              </p>
            </div>
            <button
              type="button"
              disabled={isPending}
              onClick={handleWipeScores}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Wipe Scores</span>
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 bg-zinc-900/90 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl font-semibold bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={handleSaveModeration}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl font-bold bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20 transition cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isPending ? "Saving..." : "Save Moderation"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
