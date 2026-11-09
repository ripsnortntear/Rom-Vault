"use client";

import React, { useState, useMemo, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  Upload,
  CheckCircle2,
  AlertCircle,
  Filter,
  ArrowUpDown,
  Image as ImageIcon,
  Film,
  FileText,
  Disc,
  Sparkles,
  X,
  ChevronLeft,
  ChevronRight,
  Layers,
  Award,
} from "lucide-react";
import type { GameItem } from "@/types/game";
import { KNOWN_SYSTEMS } from "@/lib/systems";

export type AssetCategoryKey =
  | "artwork_front"
  | "artwork_3d"
  | "screenshot"
  | "screentitle"
  | "logo"
  | "medium"
  | "video"
  | "story";

export type MissingFilterType = "any_missing" | "all_games" | AssetCategoryKey;

export type ContributeSortKey =
  | "title_asc"
  | "title_desc"
  | "most_missing"
  | "nearly_complete"
  | "system";

interface AssetCategoryDef {
  key: AssetCategoryKey;
  label: string;
  shortLabel: string;
  accept: string;
  description: string;
  isAvailable: (game: GameItem) => boolean;
  getPreviewUrl: (game: GameItem) => string | null;
}

export const ASSET_CATEGORIES: AssetCategoryDef[] = [
  {
    key: "artwork_front",
    label: "2D Box Art",
    shortLabel: "2D Box",
    accept: ".png,.jpg,.jpeg,.webp",
    description: "Front 2D box cover or arcade flyer (.png, .jpg, .webp)",
    isAvailable: (g) => Boolean(g.media.artworkFront),
    getPreviewUrl: (g) => g.media.artworkFront,
  },
  {
    key: "artwork_3d",
    label: "3D Box Art",
    shortLabel: "3D Box",
    accept: ".png,.jpg,.jpeg,.webp",
    description: "3D angled box art render (.png, .jpg, .webp)",
    isAvailable: (g) => Boolean(g.media.artwork3d),
    getPreviewUrl: (g) => g.media.artwork3d,
  },
  {
    key: "screenshot",
    label: "In-Game Screenshot",
    shortLabel: "Screenshot",
    accept: ".png,.jpg,.jpeg,.webp",
    description: "Action gameplay screenshot (.png, .jpg, .webp)",
    isAvailable: (g) => Boolean(g.media.screenshot),
    getPreviewUrl: (g) => g.media.screenshot,
  },
  {
    key: "screentitle",
    label: "Title Screen",
    shortLabel: "Title Screen",
    accept: ".png,.jpg,.jpeg,.webp",
    description: "Game title screen capture (.png, .jpg, .webp)",
    isAvailable: (g) => Boolean(g.media.screenTitle),
    getPreviewUrl: (g) => g.media.screenTitle,
  },
  {
    key: "logo",
    label: "Logo / Marquee",
    shortLabel: "Logo",
    accept: ".png,.jpg,.jpeg,.webp",
    description: "Transparent clear logo or arcade marquee banner (.png, .webp)",
    isAvailable: (g) => Boolean(g.media.logo || g.media.marquee),
    getPreviewUrl: (g) => g.media.logo || g.media.marquee || null,
  },
  {
    key: "medium",
    label: "Cartridge / Disc Art",
    shortLabel: "Cart/Disc",
    accept: ".png,.jpg,.jpeg,.webp",
    description: "Cartridge, CD/DVD disc scan, or arcade PCB plate (.png, .webp)",
    isAvailable: (g) => Boolean(g.media.mediumFront || g.media.mediumDisc),
    getPreviewUrl: (g) => g.media.mediumFront || g.media.mediumDisc,
  },
  {
    key: "video",
    label: "Gameplay Video",
    shortLabel: "Video",
    accept: ".mp4",
    description: "Short gameplay preview clip (.mp4, up to 65 MB)",
    isAvailable: (g) => Boolean(g.media.video),
    getPreviewUrl: (g) => g.media.video,
  },
  {
    key: "story",
    label: "Story / Overview",
    shortLabel: "Story",
    accept: ".txt",
    description: "Game synopsis, history, and description text",
    isAvailable: (g) => Boolean(g.story && g.story.trim().length > 0),
    getPreviewUrl: () => null,
  },
];

const ALPHABET = ["ALL", "#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];
const PAGE_SIZE = 48;

interface ContributeClientProps {
  initialGames: GameItem[];
  initialUser: Record<string, unknown> | null;
}

function getMissingCount(game: GameItem): number {
  let missing = 0;
  for (const cat of ASSET_CATEGORIES) {
    if (!cat.isAvailable(game)) missing++;
  }
  return missing;
}

export function ContributeClient({
  initialGames,
  initialUser,
}: ContributeClientProps): React.ReactElement {
  const [games, setGames] = useState<GameItem[]>(initialGames);
  const [selectedSystem, setSelectedSystem] = useState<string>("all");
  const [missingFilter, setMissingFilter] = useState<MissingFilterType>("any_missing");
  const [sortBy, setSortBy] = useState<ContributeSortKey>("most_missing");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedLetter, setSelectedLetter] = useState<string>("ALL");
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Modal state
  const [activeGame, setActiveGame] = useState<GameItem | null>(null);
  const [activeCategory, setActiveCategory] = useState<AssetCategoryKey>("artwork_front");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [storyDraft, setStoryDraft] = useState<string>("");
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Available systems in library
  const availableSystems = useMemo(() => {
    const counts = new Map<string, { total: number; incomplete: number }>();
    for (const g of games) {
      const cur = counts.get(g.system) || { total: 0, incomplete: 0 };
      cur.total++;
      if (getMissingCount(g) > 0) cur.incomplete++;
      counts.set(g.system, cur);
    }
    return Array.from(counts.entries())
      .map(([sysId, stat]) => ({
        id: sysId,
        meta: KNOWN_SYSTEMS[sysId] || {
          id: sysId,
          name: sysId.toUpperCase(),
          shortLabel: sysId.toUpperCase(),
          badgeColor: "bg-zinc-700",
        },
        ...stat,
      }))
      .sort((a, b) => a.meta.shortLabel.localeCompare(b.meta.shortLabel));
  }, [games]);

  // System-scoped summary statistics
  const systemScopedStats = useMemo(() => {
    const scoped =
      selectedSystem === "all"
        ? games
        : games.filter((g) => g.system === selectedSystem);

    const totalGames = scoped.length;
    let totalAssetsPossible = totalGames * ASSET_CATEGORIES.length;
    let totalAssetsPresent = 0;
    let incompleteGames = 0;

    const missingByCat: Record<AssetCategoryKey, number> = {
      artwork_front: 0,
      artwork_3d: 0,
      screenshot: 0,
      screentitle: 0,
      logo: 0,
      medium: 0,
      video: 0,
      story: 0,
    };

    for (const g of scoped) {
      let gameMissing = 0;
      for (const cat of ASSET_CATEGORIES) {
        if (cat.isAvailable(g)) {
          totalAssetsPresent++;
        } else {
          gameMissing++;
          missingByCat[cat.key]++;
        }
      }
      if (gameMissing > 0) incompleteGames++;
    }

    const completionPct =
      totalAssetsPossible > 0
        ? ((totalAssetsPresent / totalAssetsPossible) * 100).toFixed(1)
        : "100.0";

    return {
      totalGames,
      incompleteGames,
      completeGames: totalGames - incompleteGames,
      completionPct,
      missingByCat,
    };
  }, [games, selectedSystem]);

  // Filtered and sorted games
  const filteredGames = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const list = games.filter((game) => {
      if (selectedSystem !== "all" && game.system !== selectedSystem) {
        return false;
      }

      if (selectedLetter !== "ALL" && game.firstLetter !== selectedLetter) {
        return false;
      }

      if (missingFilter === "any_missing") {
        if (getMissingCount(game) === 0) return false;
      } else if (missingFilter !== "all_games") {
        const catDef = ASSET_CATEGORIES.find((c) => c.key === missingFilter);
        if (catDef && catDef.isAvailable(game)) return false;
      }

      if (q) {
        const matchTitle = game.displayTitle.toLowerCase().includes(q);
        const matchBase = game.baseName.toLowerCase().includes(q);
        const matchSystem = game.systemLabel.toLowerCase().includes(q);
        if (!matchTitle && !matchBase && !matchSystem) return false;
      }

      return true;
    });

    list.sort((a, b) => {
      if (sortBy === "title_asc") {
        return a.sortTitle.localeCompare(b.sortTitle);
      }
      if (sortBy === "title_desc") {
        return b.sortTitle.localeCompare(a.sortTitle);
      }
      if (sortBy === "most_missing") {
        const diff = getMissingCount(b) - getMissingCount(a);
        return diff !== 0 ? diff : a.sortTitle.localeCompare(b.sortTitle);
      }
      if (sortBy === "nearly_complete") {
        const ma = getMissingCount(a) || 99;
        const mb = getMissingCount(b) || 99;
        return ma !== mb ? ma - mb : a.sortTitle.localeCompare(b.sortTitle);
      }
      if (sortBy === "system") {
        const sysCmp = a.systemLabel.localeCompare(b.systemLabel);
        return sysCmp !== 0 ? sysCmp : a.sortTitle.localeCompare(b.sortTitle);
      }
      return 0;
    });

    return list;
  }, [games, selectedSystem, selectedLetter, missingFilter, searchQuery, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredGames.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const visibleGames = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredGames.slice(start, start + PAGE_SIZE);
  }, [filteredGames, safePage]);

  const openModal = (game: GameItem, preferredCat?: AssetCategoryKey) => {
    setActiveGame(game);
    setSelectedFile(null);
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      setPreviewObjectUrl(null);
    }
    setUploadStatus(null);
    setStoryDraft(game.story || "");

    if (preferredCat) {
      setActiveCategory(preferredCat);
    } else if (missingFilter !== "any_missing" && missingFilter !== "all_games") {
      setActiveCategory(missingFilter);
    } else {
      const firstMissing = ASSET_CATEGORIES.find((c) => !c.isAvailable(game));
      setActiveCategory(firstMissing ? firstMissing.key : "artwork_front");
    }
  };

  const closeModal = () => {
    setActiveGame(null);
    setSelectedFile(null);
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      setPreviewObjectUrl(null);
    }
    setUploadStatus(null);
  };

  const handleFileChange = (file: File | null) => {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      setPreviewObjectUrl(null);
    }
    setSelectedFile(file);
    setUploadStatus(null);
    if (file && (file.type.startsWith("image/") || file.type.startsWith("video/"))) {
      setPreviewObjectUrl(URL.createObjectURL(file));
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGame) return;

    setUploading(true);
    setUploadStatus(null);

    try {
      const formData = new FormData();
      formData.append("system", activeGame.system);
      formData.append("baseName", activeGame.baseName);
      formData.append("assetType", activeCategory);

      if (activeCategory === "story") {
        if (selectedFile) {
          formData.append("file", selectedFile);
        } else {
          formData.append("storyText", storyDraft);
        }
      } else {
        if (!selectedFile) {
          setUploadStatus({
            type: "error",
            message: "Please select a file to upload first.",
          });
          setUploading(false);
          return;
        }
        formData.append("file", selectedFile);
      }

      const res = await fetch("/roms/api/contribute/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setUploadStatus({
          type: "error",
          message: data.error || "Upload failed.",
        });
        setUploading(false);
        return;
      }

      // Update local state immediately so the user sees their contribution reflected
      const updatedGame: GameItem = {
        ...activeGame,
        story: activeCategory === "story" ? data.story : activeGame.story,
        media: {
          ...activeGame.media,
          artworkFront:
            activeCategory === "artwork_front"
              ? data.mediaUrl
              : activeGame.media.artworkFront,
          artwork3d:
            activeCategory === "artwork_3d"
              ? data.mediaUrl
              : activeGame.media.artwork3d,
          screenshot:
            activeCategory === "screenshot"
              ? data.mediaUrl
              : activeGame.media.screenshot,
          screenTitle:
            activeCategory === "screentitle"
              ? data.mediaUrl
              : activeGame.media.screenTitle,
          logo:
            activeCategory === "logo" ? data.mediaUrl : activeGame.media.logo,
          mediumFront:
            activeCategory === "medium"
              ? data.mediaUrl
              : activeGame.media.mediumFront,
          video:
            activeCategory === "video" ? data.mediaUrl : activeGame.media.video,
        },
      };

      setGames((prev) =>
        prev.map((g) => (g.id === updatedGame.id ? updatedGame : g))
      );
      setActiveGame(updatedGame);
      setSelectedFile(null);
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
        setPreviewObjectUrl(null);
      }

      const catLabel =
        ASSET_CATEGORIES.find((c) => c.key === activeCategory)?.label ||
        activeCategory;
      setUploadStatus({
        type: "success",
        message: `${catLabel} saved! Thank you for contributing to the ROM Vault.`,
      });
    } catch (err: any) {
      setUploadStatus({
        type: "error",
        message: err?.message || "Network error while uploading asset.",
      });
    } finally {
      setUploading(false);
    }
  };

  const activeCategoryDef =
    ASSET_CATEGORIES.find((c) => c.key === activeCategory) || ASSET_CATEGORIES[0];

  return (
    <div className="min-h-screen bg-[#070709] text-zinc-100 flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#09090d]/90 backdrop-blur-xl">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-zinc-200 transition"
            >
              <ArrowLeft className="w-4 h-4 text-red-400" />
              Back to ROM Vault
            </Link>
            <div className="h-5 w-px bg-white/10 hidden sm:block" />
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-red-600/20 border border-red-500/30 text-red-400">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-black tracking-tight text-white">
                  Community Asset Contribution Center
                </h1>
                <p className="text-[11px] text-zinc-400 hidden sm:block">
                  Help complete missing box art, screenshots, marquees, videos &amp; game stories across all platforms
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {initialUser ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 font-semibold">
                <Award className="w-4 h-4 text-emerald-400" />
                <span>
                  Contributing as{" "}
                  <strong className="text-white">
                    {String(initialUser.displayName || initialUser.username)}
                  </strong>
                </span>
              </div>
            ) : (
              <Link
                href="/auth/login"
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white shadow-lg shadow-red-600/30 transition"
              >
                Sign In to Contribute
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1800px] w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Completion Overview & Missing Breakdown Cards */}
        <section className="rounded-3xl bg-zinc-950/90 border border-white/10 p-5 sm:p-6 shadow-2xl space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-red-600/20 text-red-400 border border-red-500/30">
                  {selectedSystem === "all"
                    ? "All Platforms"
                    : KNOWN_SYSTEMS[selectedSystem]?.name || selectedSystem.toUpperCase()}
                </span>
                <span className="text-xs text-zinc-400">
                  {systemScopedStats.completeGames.toLocaleString()} of{" "}
                  {systemScopedStats.totalGames.toLocaleString()} games 100% complete
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
                {systemScopedStats.incompleteGames.toLocaleString()} Games Missing Assets
              </h2>
            </div>

            <div className="flex flex-col sm:items-end gap-1.5 min-w-[240px]">
              <div className="flex items-center justify-between sm:justify-end gap-3 text-xs">
                <span className="text-zinc-400 font-medium">Overall Asset Completeness</span>
                <span className="font-mono font-black text-emerald-400 text-sm">
                  {systemScopedStats.completionPct}%
                </span>
              </div>
              <div className="w-full sm:w-64 h-2.5 rounded-full bg-zinc-900 overflow-hidden border border-white/10">
                <div
                  className="h-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500 transition-all duration-500"
                  style={{ width: `${systemScopedStats.completionPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Clickable Quick-Filter Cards by Missing Asset Category */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 pt-2">
            {ASSET_CATEGORIES.map((cat) => {
              const count = systemScopedStats.missingByCat[cat.key];
              const isSelected = missingFilter === cat.key;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => {
                    setMissingFilter(isSelected ? "any_missing" : cat.key);
                    setCurrentPage(1);
                  }}
                  className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between gap-1.5 ${
                    isSelected
                      ? "bg-red-600/20 border-red-500 text-white shadow-lg shadow-red-600/15"
                      : "bg-zinc-900/70 hover:bg-zinc-900 border-white/10 text-zinc-300"
                  }`}
                >
                  <span className="text-[11px] font-bold text-zinc-400 truncate">
                    {cat.shortLabel}
                  </span>
                  <div className="flex items-baseline justify-between gap-1">
                    <span
                      className={`text-base font-black font-mono ${
                        count === 0 ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {count.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-zinc-500">missing</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* System Filter Bar (Mirrors Main ROM Vault) */}
        <section className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
          <button
            type="button"
            onClick={() => {
              setSelectedSystem("all");
              setCurrentPage(1);
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition cursor-pointer flex items-center gap-2 ${
              selectedSystem === "all"
                ? "bg-red-600 text-white border-red-400 shadow-lg shadow-red-600/25"
                : "bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border-white/10"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>All Systems</span>
            <span className="px-1.5 py-0.5 rounded-md bg-black/40 text-[10px] font-mono">
              {games.length.toLocaleString()}
            </span>
          </button>

          {availableSystems.map((sys) => {
            const active = selectedSystem === sys.id;
            return (
              <button
                key={sys.id}
                type="button"
                onClick={() => {
                  setSelectedSystem(sys.id);
                  setCurrentPage(1);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition cursor-pointer flex items-center gap-2 ${
                  active
                    ? "bg-red-600 text-white border-red-400 shadow-lg shadow-red-600/25"
                    : "bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border-white/10"
                }`}
              >
                <span>{sys.meta.shortLabel}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                    sys.incomplete > 0
                      ? "bg-amber-500/20 text-amber-300"
                      : "bg-emerald-500/20 text-emerald-300"
                  }`}
                  title={`${sys.incomplete} games missing assets out of ${sys.total}`}
                >
                  {sys.incomplete.toLocaleString()}
                </span>
              </button>
            );
          })}
        </section>

        {/* Search, Missing Type Dropdown, & Sort Bar */}
        <section className="rounded-2xl bg-zinc-950/90 border border-white/10 p-4 flex flex-col gap-4">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
            {/* Search by Name or ROM code */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search by game name or MAME ROM code (e.g. 3 Count Bout, 3countb, Mario)..."
                className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/60"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setCurrentPage(1);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Dropdown Filter by Type of Missing Asset */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-red-400 shrink-0 hidden sm:block" />
              <select
                aria-label="Filter by missing asset type"
                value={missingFilter}
                onChange={(e) => {
                  setMissingFilter(e.target.value as MissingFilterType);
                  setCurrentPage(1);
                }}
                className="px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-xs font-bold text-zinc-200 focus:outline-none focus:border-red-500/60 cursor-pointer"
              >
                <option value="any_missing">Filter: Any Missing Asset (Incomplete)</option>
                <option value="artwork_front">Missing: 2D Box Art</option>
                <option value="artwork_3d">Missing: 3D Box Art</option>
                <option value="screenshot">Missing: In-Game Screenshot</option>
                <option value="screentitle">Missing: Title Screen</option>
                <option value="logo">Missing: Logo / Marquee</option>
                <option value="medium">Missing: Cartridge / Disc Art</option>
                <option value="video">Missing: Gameplay Video (.mp4)</option>
                <option value="story">Missing: Story / Overview (.txt)</option>
                <option value="all_games">Show All Games (Including 100% Complete)</option>
              </select>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-zinc-400 shrink-0 hidden sm:block" />
              <select
                aria-label="Sort games by"
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as ContributeSortKey);
                  setCurrentPage(1);
                }}
                className="px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-xs font-bold text-zinc-200 focus:outline-none focus:border-red-500/60 cursor-pointer"
              >
                <option value="most_missing">Sort: Most Missing Assets First</option>
                <option value="nearly_complete">Sort: Nearly Complete First (1 Missing)</option>
                <option value="title_asc">Sort: Name (A → Z)</option>
                <option value="title_desc">Sort: Name (Z → A)</option>
                <option value="system">Sort: System</option>
              </select>
            </div>
          </div>

          {/* A-Z Quick Filter Bar */}
          <div className="flex items-center gap-1 overflow-x-auto pt-1 no-scrollbar">
            {ALPHABET.map((letter) => {
              const active = selectedLetter === letter;
              return (
                <button
                  key={letter}
                  type="button"
                  onClick={() => {
                    setSelectedLetter(letter);
                    setCurrentPage(1);
                  }}
                  className={`min-w-[28px] h-7 px-2 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                    active
                      ? "bg-red-600 text-white"
                      : "bg-zinc-900/70 hover:bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        </section>

        {/* Results Count & Pagination Header */}
        <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
          <span>
            Showing{" "}
            <strong className="text-white">
              {filteredGames.length.toLocaleString()}
            </strong>{" "}
            matching games
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg bg-zinc-900 border border-white/10 disabled:opacity-40 hover:bg-zinc-800 text-white cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-mono text-zinc-300">
                Page {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg bg-zinc-900 border border-white/10 disabled:opacity-40 hover:bg-zinc-800 text-white cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Games Contribution Grid */}
        {visibleGames.length === 0 ? (
          <div className="rounded-3xl bg-zinc-950 border border-white/10 p-12 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <h3 className="text-lg font-bold text-white">
              No Games Missing Selected Assets!
            </h3>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              All games matching your current filter already have this asset completed. Try switching systems or changing the missing asset filter.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visibleGames.map((game) => {
              const missingCount = getMissingCount(game);
              const presentCount = ASSET_CATEGORIES.length - missingCount;
              const thumb =
                game.media.artworkFront ??
                game.media.artwork3d ??
                game.media.screenTitle ??
                game.media.screenshot ??
                game.media.mediumFront ??
                game.media.logo;

              return (
                <div
                  key={game.id}
                  onClick={() => openModal(game)}
                  className="group rounded-2xl bg-zinc-950/90 border border-white/10 hover:border-red-500/50 p-4 flex flex-col justify-between gap-4 transition cursor-pointer shadow-lg hover:shadow-red-600/10"
                >
                  {/* Top Info Row */}
                  <div className="flex items-start gap-3.5">
                    <div className="w-20 h-24 rounded-xl bg-zinc-900 border border-white/10 shrink-0 flex items-center justify-center overflow-hidden p-1.5">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={game.displayTitle}
                          loading="lazy"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-zinc-700" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase text-white ${
                            game.badgeColor || "bg-red-600"
                          }`}
                        >
                          {game.systemLabel}
                        </span>
                        {game.system === "mame" && (
                          <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-white/10 text-[10px] font-mono text-zinc-400">
                            {game.baseName}.zip
                          </span>
                        )}
                      </div>

                      <h3
                        className="text-sm font-bold text-white group-hover:text-red-400 transition line-clamp-2"
                        title={game.displayTitle}
                      >
                        {game.displayTitle}
                      </h3>

                      {/* Completion progress */}
                      <div className="pt-1 space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span
                            className={
                              missingCount === 0
                                ? "text-emerald-400 font-bold"
                                : "text-amber-400 font-bold"
                            }
                          >
                            {presentCount} / {ASSET_CATEGORIES.length} Assets
                          </span>
                          {missingCount > 0 && (
                            <span className="text-zinc-500">
                              {missingCount} missing
                            </span>
                          )}
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-zinc-900 overflow-hidden">
                          <div
                            className={`h-full ${
                              missingCount === 0 ? "bg-emerald-500" : "bg-amber-500"
                            }`}
                            style={{
                              width: `${(presentCount / ASSET_CATEGORIES.length) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Asset Status Pills */}
                  <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-white/5">
                    {ASSET_CATEGORIES.map((cat) => {
                      const hasIt = cat.isAvailable(game);
                      return (
                        <button
                          key={cat.key}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openModal(game, cat.key);
                          }}
                          title={
                            hasIt
                              ? `${cat.label}: Present (Click to view or replace)`
                              : `${cat.label}: Missing (Click to upload)`
                          }
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold truncate flex items-center justify-center gap-1 border transition cursor-pointer ${
                            hasIt
                              ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/50"
                              : "bg-amber-950/40 border-amber-500/40 text-amber-300 hover:bg-red-600 hover:text-white hover:border-red-400"
                          }`}
                        >
                          {hasIt ? (
                            <CheckCircle2 className="w-2.5 h-2.5 shrink-0 text-emerald-400" />
                          ) : (
                            <Upload className="w-2.5 h-2.5 shrink-0" />
                          )}
                          <span className="truncate">{cat.shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 py-6">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => {
                setCurrentPage((p) => Math.max(1, p - 1));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="px-4 py-2 rounded-xl bg-zinc-900 border border-white/10 disabled:opacity-40 hover:bg-zinc-800 text-xs font-bold text-white cursor-pointer"
            >
              Previous
            </button>
            <span className="text-xs font-mono text-zinc-400">
              Page <strong className="text-white">{safePage}</strong> of{" "}
              {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => {
                setCurrentPage((p) => Math.min(totalPages, p + 1));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="px-4 py-2 rounded-xl bg-zinc-900 border border-white/10 disabled:opacity-40 hover:bg-zinc-800 text-xs font-bold text-white cursor-pointer"
            >
              Next
            </button>
          </div>
        )}
      </main>

      {/* Asset Contribution Upload Modal */}
      {activeGame && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-3xl rounded-3xl bg-zinc-950 border border-white/15 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between gap-4 bg-zinc-900/50">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase text-white ${
                      activeGame.badgeColor || "bg-red-600"
                    }`}
                  >
                    {activeGame.systemLabel}
                  </span>
                  <span className="text-xs font-mono text-zinc-400 truncate">
                    {activeGame.romFileName}
                  </span>
                </div>
                <h2 className="text-lg font-black text-white truncate mt-0.5">
                  {activeGame.displayTitle}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="p-2 rounded-full bg-white/5 hover:bg-white/15 text-zinc-300 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Category Selector Tabs */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                  1. Select Asset Slot to Contribute or Inspect
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ASSET_CATEGORIES.map((cat) => {
                    const hasIt = cat.isAvailable(activeGame);
                    const isSelected = activeCategory === cat.key;
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => {
                          setActiveCategory(cat.key);
                          setSelectedFile(null);
                          if (previewObjectUrl) {
                            URL.revokeObjectURL(previewObjectUrl);
                            setPreviewObjectUrl(null);
                          }
                          setUploadStatus(null);
                        }}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex items-center justify-between gap-2 ${
                          isSelected
                            ? "bg-red-600/20 border-red-500 text-white"
                            : "bg-zinc-900/80 hover:bg-zinc-900 border-white/10 text-zinc-300"
                        }`}
                      >
                        <span className="text-xs font-bold truncate">
                          {cat.label}
                        </span>
                        {hasIt ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Current Asset vs New Upload Form */}
              <form onSubmit={handleUploadSubmit} className="space-y-4">
                <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        {activeCategory === "video" ? (
                          <Film className="w-4 h-4 text-red-400" />
                        ) : activeCategory === "story" ? (
                          <FileText className="w-4 h-4 text-red-400" />
                        ) : activeCategory === "medium" ? (
                          <Disc className="w-4 h-4 text-red-400" />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-red-400" />
                        )}
                        <span>{activeCategoryDef.label}</span>
                      </h3>
                      <p className="text-xs text-zinc-400">
                        {activeCategoryDef.description}
                      </p>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                        activeCategoryDef.isAvailable(activeGame)
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      }`}
                    >
                      {activeCategoryDef.isAvailable(activeGame)
                        ? "Currently Present"
                        : "Missing Asset"}
                    </span>
                  </div>

                  {/* Current Preview if Present */}
                  {activeCategory !== "story" &&
                    activeCategoryDef.getPreviewUrl(activeGame) &&
                    !previewObjectUrl && (
                      <div className="rounded-xl bg-black/60 border border-white/10 p-3 flex flex-col items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                          Current {activeCategoryDef.label}
                        </span>
                        {activeCategory === "video" ? (
                          <video
                            src={activeCategoryDef.getPreviewUrl(activeGame)!}
                            controls
                            muted
                            playsInline
                            className="max-h-48 rounded-lg"
                          />
                        ) : (
                          <img
                            src={activeCategoryDef.getPreviewUrl(activeGame)!}
                            alt={activeCategoryDef.label}
                            className="max-h-48 object-contain rounded-lg"
                          />
                        )}
                      </div>
                    )}

                  {/* Story Textarea or File Upload */}
                  {activeCategory === "story" ? (
                    <div className="space-y-3">
                      <textarea
                        rows={6}
                        value={storyDraft}
                        onChange={(e) => setStoryDraft(e.target.value)}
                        placeholder="Write or paste the game's story, synopsis, arcade history, or gameplay overview here..."
                        className="w-full p-3.5 rounded-xl bg-zinc-950 border border-white/10 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-red-500/60"
                      />
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const dropped = e.dataTransfer.files?.[0] || null;
                        if (dropped) handleFileChange(dropped);
                      }}
                      className="border-2 border-dashed border-white/15 hover:border-red-500/60 rounded-2xl p-6 text-center cursor-pointer transition bg-zinc-950/60 flex flex-col items-center justify-center gap-2"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={activeCategoryDef.accept}
                        onChange={(e) =>
                          handleFileChange(e.target.files?.[0] || null)
                        }
                        className="hidden"
                      />
                      {previewObjectUrl ? (
                        <div className="space-y-2">
                          {activeCategory === "video" ? (
                            <video
                              src={previewObjectUrl}
                              controls
                              muted
                              playsInline
                              className="max-h-48 mx-auto rounded-lg"
                            />
                          ) : (
                            <img
                              src={previewObjectUrl}
                              alt="Upload preview"
                              className="max-h-48 mx-auto object-contain rounded-lg"
                            />
                          )}
                          <p className="text-xs font-bold text-emerald-400">
                            {selectedFile?.name} (Ready to upload)
                          </p>
                        </div>
                      ) : (
                        <>
                          <Upload className="w-7 h-7 text-red-400" />
                          <p className="text-xs font-bold text-zinc-200">
                            Click to choose a file or drag &amp; drop here
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            Accepted formats: {activeCategoryDef.accept} (Saved automatically as{" "}
                            <code className="text-zinc-300">
                              {activeGame.baseName}
                            </code>
                            )
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {uploadStatus && (
                  <div
                    className={`p-3.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                      uploadStatus.type === "success"
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                        : "bg-red-500/15 border-red-500/40 text-red-300"
                    }`}
                  >
                    {uploadStatus.type === "success" ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{uploadStatus.message}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-xs font-bold text-zinc-300 cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={uploading || !initialUser}
                    className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 text-xs font-bold text-white shadow-lg shadow-red-600/30 flex items-center gap-2 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>
                      {uploading
                        ? "Uploading Asset..."
                        : `Save ${activeCategoryDef.label}`}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
