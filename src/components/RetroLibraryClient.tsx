"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Gamepad2,
  Shuffle,
  Sparkles,
  HardDrive,
  Film,
  User,
  Trophy,
  ShieldAlert,
  Users,
  MoreHorizontal,
  ChevronDown,
  UploadCloud,
} from "lucide-react";
import type { CoverArtStyle, GameItem, LibraryStats } from "@/types/game";
import { HeroSpotlight } from "@/components/HeroSpotlight";
import { Shoutbox } from "@/components/Shoutbox";
import {
  FilterBar,
  type CollectionFilter,
  type SystemFilter,
} from "@/components/FilterBar";
import { GameCard } from "@/components/GameCard";
import { GameDetailModal } from "@/components/GameDetailModal";
import { EmulatorModal } from "@/components/EmulatorModal";
import { EmulatorErrorBoundary } from "@/components/EmulatorErrorBoundary";
import { UserProfileModal } from "@/components/UserProfileModal";
import { MultiplayerModal } from "@/components/MultiplayerModal";
import { EdgeRecommendationBadge } from "@/components/EdgeRecommendationBadge";
import { ServerUserAgentContext } from "@/hooks/useBrowserEnvironment";
import { isDesktopOnlySystem } from "@/lib/systems";

interface RetroLibraryClientProps {
  initialGames: GameItem[];
  stats: LibraryStats;
  initialSeed?: number;
  initialUser?: Record<string, unknown> | null;
  initialUserAgent?: string;
}

const FAVORITES_STORAGE_KEY = "nes_vault_favorites_v1";
const RECENT_STORAGE_KEY = "nes_vault_recent_v1";
const PAGE_SIZE = 48;

const ICONIC_TITLES = [
  "Super Mario Bros. 3",
  "Super Mario World",
  "Legend of Zelda",
  "Chrono Trigger",
  "Super Metroid",
  "Metroid",
  "Contra (USA)",
  "Castlevania III",
  "Mega Man 2",
  "Mike Tyson's Punch-Out!!",
  "Kirby's Adventure",
  "Donkey Kong Country",
];

export function RetroLibraryClient({
  initialGames,
  stats,
  initialSeed,
  initialUser = null,
  initialUserAgent = "",
}: RetroLibraryClientProps): React.ReactElement {
  const searchParams = useSearchParams();

  // Read initial filter values from URL parameters
  const initialSystem = useMemo<SystemFilter>(() => {
    const sys = searchParams?.get("system");
    if (sys) {
      const lower = sys.toLowerCase();
      if (lower in (stats.systems ?? {}) || lower === "all") {
        return lower === "all" ? "ALL" : (lower as SystemFilter);
      }
    }
    return "ALL";
  }, [searchParams, stats.systems]);

  const initialSearch = useMemo<string>(() => {
    return searchParams?.get("q") || searchParams?.get("search") || "";
  }, [searchParams]);

  const initialLetter = useMemo<string>(() => {
    return searchParams?.get("letter") || "ALL";
  }, [searchParams]);

  const initialRegion = useMemo<string>(() => {
    return searchParams?.get("region") || "ALL";
  }, [searchParams]);

  const initialCollection = useMemo<CollectionFilter>(() => {
    const col = searchParams?.get("collection");
    if (col === "favorites" || col === "recent") return col;
    return "all";
  }, [searchParams]);

  const initialCoverStyle = useMemo<CoverArtStyle>(() => {
    const s = searchParams?.get("style") as CoverArtStyle;
    if (s === "artwork_3d" || s === "medium_front" || s === "screentitle") return s;
    return "artwork_front";
  }, [searchParams]);

  const initialLimit = useMemo<number>(() => {
    const l = searchParams?.get("limit");
    return l ? parseInt(l, 10) || PAGE_SIZE : PAGE_SIZE;
  }, [searchParams]);

  const [searchQuery, setSearchQuery] = useState<string>(initialSearch);
  const [selectedSystem, setSelectedSystem] = useState<SystemFilter>(initialSystem);
  const [selectedLetter, setSelectedLetter] = useState<string>(initialLetter);
  const [selectedRegion, setSelectedRegion] = useState<string>(initialRegion);
  const [coverStyle, setCoverStyle] = useState<CoverArtStyle>(initialCoverStyle);
  const [collectionFilter, setCollectionFilter] = useState<CollectionFilter>(initialCollection);
  const [visibleCount, setVisibleCount] = useState<number>(initialLimit);

  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  const [featuredGame, setFeaturedGame] = useState<GameItem | null>(() => {
    if (!initialGames || initialGames.length === 0) return null;
    const pool =
      initialSystem === "ALL"
        ? initialGames
        : initialGames.filter((g) => g.system === initialSystem);
    const candidates = pool.length > 0 ? pool : initialGames;
    // Use server-supplied initialSeed so SSR and client hydration select the exact same game
    const seed = typeof initialSeed === "number" ? initialSeed : 0;
    const index = Math.floor(seed * candidates.length) % candidates.length;
    return candidates[index] ?? null;
  });

  const prevSystemRef = useRef<SystemFilter>(selectedSystem);

  const [detailGame, setDetailGame] = useState<GameItem | null>(null);
  const [playingGame, setPlayingGame] = useState<GameItem | null>(null);

  const [currentUser, setCurrentUser] = useState<any | null>(initialUser);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [isMultiplayerModalOpen, setIsMultiplayerModalOpen] = useState<boolean>(false);
  const [isMobileDevice, setIsMobileDevice] = useState<boolean>(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState<boolean>(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isMoreMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMoreMenuOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const checkMobile = () => {
      const ua = navigator.userAgent || "";
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
      const isSmallScreen = window.innerWidth < 768;
      const isCoarse = window.matchMedia("(pointer: coarse)").matches;
      setIsMobileDevice(isMobileUA || isSmallScreen || isCoarse);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (initialUser !== null && initialUser !== undefined) {
      return;
    }
    fetch("/roms/api/users/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.user) {
          setCurrentUser({
            ...data.user,
            displayName: data.profile?.displayName ?? data.user.displayName,
            favorites: data.profile?.favorites || [],
            quotaDaily: data.user.role === "admin" ? null : (data.profile?.quotaDaily ?? data.user.quotaDaily ?? 50),
            quotaUsedToday: data.user.role === "admin" ? 0 : (data.profile?.quotaUsedToday ?? data.user.quotaUsedToday ?? 0),
          });
        }
      })
      .catch(() => {});
  }, [initialUser]);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Synchronize active filters bidirectionally with URL search parameters
  const syncUrlParams = useCallback(
    (updates: {
      system?: SystemFilter;
      q?: string;
      letter?: string;
      region?: string;
      collection?: CollectionFilter;
      style?: CoverArtStyle;
      limit?: number;
    }) => {
      if (typeof window === "undefined") return;

      const currentParams = new URLSearchParams(window.location.search);

      if (updates.system !== undefined) {
        if (updates.system === "ALL") {
          currentParams.delete("system");
        } else {
          currentParams.set("system", updates.system);
        }
      }

      if (updates.q !== undefined) {
        const trimmed = updates.q.trim();
        if (!trimmed) {
          currentParams.delete("q");
          currentParams.delete("search");
        } else {
          currentParams.set("q", trimmed);
          currentParams.delete("search");
        }
      }

      if (updates.letter !== undefined) {
        if (updates.letter === "ALL") {
          currentParams.delete("letter");
        } else {
          currentParams.set("letter", updates.letter);
        }
      }

      if (updates.region !== undefined) {
        if (updates.region === "ALL") {
          currentParams.delete("region");
        } else {
          currentParams.set("region", updates.region);
        }
      }

      if (updates.collection !== undefined) {
        if (updates.collection === "all") {
          currentParams.delete("collection");
        } else {
          currentParams.set("collection", updates.collection);
        }
      }

      if (updates.style !== undefined) {
        if (updates.style === "artwork_front") {
          currentParams.delete("style");
        } else {
          currentParams.set("style", updates.style);
        }
      }

      if (updates.limit !== undefined) {
        if (updates.limit <= PAGE_SIZE) {
          currentParams.delete("limit");
        } else {
          currentParams.set("limit", updates.limit.toString());
        }
      }

      const queryString = currentParams.toString();
      const newUrl = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname;
      window.history.replaceState(null, "", newUrl);
    },
    []
  );

  useEffect(() => {
    try {
      const savedFavs = localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (savedFavs) {
        setFavorites(JSON.parse(savedFavs) as string[]);
      }
      const savedRecent = localStorage.getItem(RECENT_STORAGE_KEY);
      if (savedRecent) {
        setRecentIds(JSON.parse(savedRecent) as string[]);
      }
    } catch (error) {
      console.error("[RetroLibraryClient] Failed reading localStorage:", error);
    }
  }, []);

  const hasSyncedFavoritesRef = useRef<boolean>(false);

  // Synchronize favorites bidirectionally between localStorage and the user's cloud account
  useEffect(() => {
    if (!currentUser) return;
    if (hasSyncedFavoritesRef.current) return;
    hasSyncedFavoritesRef.current = true;

    try {
      let localFavs: string[] = [];
      const savedFavs = localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (savedFavs) {
        localFavs = JSON.parse(savedFavs) as string[];
      }

      const cloudFavs: string[] = Array.isArray(currentUser.favorites)
        ? currentUser.favorites
        : [];

      // Combine both sets preserving order and eliminating duplicates
      const mergedFavs = Array.from(new Set([...cloudFavs, ...localFavs]));

      if (mergedFavs.length > 0) {
        setFavorites(mergedFavs);
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(mergedFavs));
      }

      // If local favorites had entries that were missing from the cloud, push to server
      const isMissingFromCloud =
        mergedFavs.length !== cloudFavs.length ||
        mergedFavs.some((id, idx) => id !== cloudFavs[idx]);

      if (isMissingFromCloud && mergedFavs.length > 0) {
        fetch("/roms/api/users/me", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ favorites: mergedFavs }),
        }).catch((err) => {
          console.error("[RetroLibraryClient] Failed syncing favorites to cloud:", err);
        });
      }
    } catch (error) {
      console.error("[RetroLibraryClient] Error during favorites cloud sync:", error);
    }
  }, [currentUser]);

  // Update component filter state if browser navigates back/forward
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const sys = params.get("system");
      if (sys) {
        const lower = sys.toLowerCase();
        if (lower in (stats.systems ?? {}) || lower === "all") {
          setSelectedSystem(lower === "all" ? "ALL" : (lower as SystemFilter));
        }
      } else {
        setSelectedSystem("ALL");
      }
      setSearchQuery(params.get("q") || params.get("search") || "");
      setSelectedLetter(params.get("letter") || "ALL");
      setSelectedRegion(params.get("region") || "ALL");
      setCollectionFilter((params.get("collection") as CollectionFilter) || "all");
      setCoverStyle((params.get("style") as CoverArtStyle) || "artwork_front");
      const limit = params.get("limit");
      if (limit) setVisibleCount(parseInt(limit, 10) || PAGE_SIZE);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [stats.systems]);

  const handleSearchChange = useCallback(
    (val: string) => {
      setSearchQuery(val);
      syncUrlParams({ q: val });
    },
    [syncUrlParams]
  );

  const handleSystemChange = useCallback(
    (sys: SystemFilter) => {
      setSelectedSystem(sys);
      setVisibleCount(PAGE_SIZE);
      syncUrlParams({ system: sys, limit: PAGE_SIZE });
    },
    [syncUrlParams]
  );

  const handleLetterChange = useCallback(
    (letter: string) => {
      setSelectedLetter(letter);
      syncUrlParams({ letter });
    },
    [syncUrlParams]
  );

  const handleRegionChange = useCallback(
    (region: string) => {
      setSelectedRegion(region);
      syncUrlParams({ region });
    },
    [syncUrlParams]
  );

  const handleCoverStyleChange = useCallback(
    (style: CoverArtStyle) => {
      setCoverStyle(style);
      syncUrlParams({ style });
    },
    [syncUrlParams]
  );

  const handleCollectionFilterChange = useCallback(
    (col: CollectionFilter) => {
      setCollectionFilter(col);
      syncUrlParams({ collection: col });
    },
    [syncUrlParams]
  );

  const handleResetFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedSystem("ALL");
    setSelectedLetter("ALL");
    setSelectedRegion("ALL");
    setCollectionFilter("all");
    setVisibleCount(PAGE_SIZE);
    syncUrlParams({
      q: "",
      system: "ALL",
      letter: "ALL",
      region: "ALL",
      collection: "all",
      limit: PAGE_SIZE,
    });
  }, [syncUrlParams]);

  const toggleFavorite = useCallback((gameId: string): void => {
    setFavorites((prev) => {
      const exists = prev.includes(gameId);
      const next = exists
        ? prev.filter((id) => id !== gameId)
        : [gameId, ...prev];
      try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
      } catch (error) {
        console.error("[RetroLibraryClient] Failed saving favorites:", error);
      }

      if (currentUser) {
        fetch("/roms/api/users/me", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ favorites: next }),
        }).catch((error) => {
          console.error("[RetroLibraryClient] Failed syncing favorites to cloud:", error);
        });
      }

      return next;
    });
  }, [currentUser]);

  const handlePlayGame = useCallback((game: GameItem): void => {
    setRecentIds((prev) => {
      const next = [game.id, ...prev.filter((id) => id !== game.id)].slice(
        0,
        30
      );
      try {
        localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
      } catch (error) {
        console.error("[RetroLibraryClient] Failed saving recent games:", error);
      }
      return next;
    });

    // Detect mobile viewports (< 768px, coarse touch, or mobile user agent)
    const isMobile =
      typeof window !== "undefined" &&
      (window.innerWidth < 768 ||
        window.matchMedia("(pointer: coarse)").matches ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || ""));

    // PS2, Dreamcast, and GameCube are NOT playable on mobile devices; PSX remains playable!
    if (isMobile && isDesktopOnlySystem(game.system)) {
      setDetailGame(game);
      return;
    }

    // Non-playable systems show the standalone recommendation modal
    if (!game.playable) {
      setPlayingGame(game);
      return;
    }

    if (isMobile) {
      const safeId = (() => {
        try {
          return decodeURIComponent(game.id);
        } catch {
          return game.id;
        }
      })();
      window.location.assign(`/roms/play/${encodeURIComponent(safeId)}`);
      return;
    }

    setPlayingGame(game);
  }, []);

  const handleShuffleFeatured = useCallback((): void => {
    const pool =
      selectedSystem === "ALL"
        ? initialGames
        : initialGames.filter((g) => g.system === selectedSystem);
    if (pool.length === 0) {
      return;
    }
    const randomIndex = Math.floor(Math.random() * pool.length);
    setFeaturedGame(pool[randomIndex]);
  }, [initialGames, selectedSystem]);

  const handleResetHome = useCallback((e?: React.MouseEvent<HTMLAnchorElement>): void => {
    if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)) {
      return;
    }
    if (e) {
      e.preventDefault();
    }
    setSearchQuery("");
    setSelectedSystem("ALL");
    setSelectedLetter("ALL");
    setSelectedRegion("ALL");
    setCollectionFilter("all");
    setVisibleCount(PAGE_SIZE);
    setDetailGame(null);
    setPlayingGame(null);
    if (typeof window !== "undefined") {
      if (window.location.search || window.location.hash) {
        window.history.pushState({}, "", "/roms");
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const handleRandomPick = useCallback((): void => {
    const pool =
      selectedSystem === "ALL"
        ? initialGames
        : initialGames.filter((g) => g.system === selectedSystem);
    if (pool.length > 0) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      setDetailGame(pick);
    }
  }, [initialGames, selectedSystem]);

  useEffect(() => {
    // Skip on initial mount to preserve the server-rendered featured game and eliminate double-load flicker
    if (prevSystemRef.current === selectedSystem) {
      return;
    }
    prevSystemRef.current = selectedSystem;

    const pool = selectedSystem === "ALL"
      ? initialGames
      : initialGames.filter((g) => g.system === selectedSystem);

    if (pool.length > 0) {
      const randomIndex = Math.floor(Math.random() * pool.length);
      setFeaturedGame(pool[randomIndex] ?? null);
    }
  }, [selectedSystem, initialGames]);

  const availableRegions = useMemo(() => {
    return Object.keys(stats.regions).sort(
      (a, b) => (stats.regions[b] ?? 0) - (stats.regions[a] ?? 0)
    );
  }, [stats.regions]);

  const favoritesSet = useMemo(() => new Set(favorites), [favorites]);

  const filteredGames = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    let baseList = initialGames;
    if (collectionFilter === "favorites") {
      baseList = initialGames.filter((g) => favoritesSet.has(g.id));
    } else if (collectionFilter === "recent") {
      const map = new Map(initialGames.map((g) => [g.id, g]));
      baseList = recentIds
        .map((id) => map.get(id))
        .filter((g): g is GameItem => Boolean(g));
    }

    return baseList.filter((game) => {
      if (selectedSystem !== "ALL" && game.system !== selectedSystem) {
        return false;
      }
      if (selectedLetter !== "ALL" && game.firstLetter !== selectedLetter) {
        return false;
      }
      if (
        selectedRegion !== "ALL" &&
        !game.regions.includes(selectedRegion)
      ) {
        return false;
      }
      if (query.length > 0) {
        const matchesTitle = game.displayTitle.toLowerCase().includes(query);
        const matchesBase = game.baseName.toLowerCase().includes(query);
        const matchesStory = game.story.toLowerCase().includes(query);
        const matchesGenre = game.genres?.some((g) => g.toLowerCase().includes(query)) ?? false;
        const matchesDeveloper = game.developer?.toLowerCase().includes(query) ?? false;
        const matchesPublisher = game.publisher?.toLowerCase().includes(query) ?? false;
        const matchesTags = game.tags?.some((t) => t.toLowerCase().includes(query)) ?? false;
        return (
          matchesTitle ||
          matchesBase ||
          matchesStory ||
          matchesGenre ||
          matchesDeveloper ||
          matchesPublisher ||
          matchesTags
        );
      }
      return true;
    });
  }, [
    initialGames,
    collectionFilter,
    favoritesSet,
    recentIds,
    selectedSystem,
    selectedLetter,
    selectedRegion,
    searchQuery,
  ]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, selectedSystem, selectedLetter, selectedRegion, collectionFilter]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) =>
            Math.min(prev + PAGE_SIZE, filteredGames.length)
          );
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [filteredGames.length]);

  const visibleGames = useMemo(
    () => filteredGames.slice(0, visibleCount),
    [filteredGames, visibleCount]
  );

  return (
    <ServerUserAgentContext.Provider value={initialUserAgent}>
    <div className="min-h-screen bg-[#070709] text-zinc-100 flex flex-col">
      <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-zinc-950/90 backdrop-blur-md">
        <div className="w-full px-4 sm:px-6 lg:px-8 2xl:px-10 py-3 flex items-center justify-between gap-3 sm:gap-4">
          <a
            href="/roms"
            onClick={handleResetHome}
            className="flex items-center gap-3 group transition transform hover:scale-[1.01] active:scale-[0.99] cursor-pointer shrink-0"
            title="ROM Vault Home (Reset all filters)"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center shadow-lg shadow-red-600/30 group-hover:shadow-red-600/50 group-hover:from-red-500 group-hover:to-red-700 transition shrink-0">
              <Gamepad2 className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg lg:text-xl font-black tracking-tight text-white group-hover:text-red-100 transition whitespace-nowrap">
                  ROM <span className="text-red-500 group-hover:text-red-400">VAULT</span>
                </span>
                <span className="hidden xl:inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded bg-white/10 text-zinc-300 group-hover:bg-white/15 transition whitespace-nowrap">
                  Multi-Console Retro Library
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-zinc-400 group-hover:text-zinc-300 transition truncate hidden sm:block">
                Archive &amp; Instant Browser Emulation Deck
              </p>
            </div>
          </a>

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* 1. Large-Screen Vault Statistics (>= 2xl: 1536px) */}
            <div className="hidden 2xl:flex items-center gap-3.5 px-3.5 py-1.5 rounded-xl bg-zinc-900 border border-white/10 text-xs text-zinc-400 shrink-0 select-none">
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-red-400" />
                <strong className="text-white">{stats.totalGames}</strong> ROMs
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5 text-red-400" />
                <strong className="text-white">{stats.withVideoCount}</strong>{" "}
                Videos
              </span>
              <span className="inline-flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-red-400" />
                <strong className="text-white">
                  {stats.totalSizeBytes >= 1024 * 1024 * 1024
                    ? `${(stats.totalSizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
                    : `${(stats.totalSizeBytes / (1024 * 1024)).toFixed(1)} MB`}
                </strong>
              </span>
            </div>

            {/* 2. Edge / Browser Acceleration Badge (>= xl: 1280px) */}
            <EdgeRecommendationBadge className="hidden xl:inline-flex items-center shrink-0" />

            {/* 3. Random Game Button (>= md: 768px) */}
            <button
              type="button"
              onClick={handleRandomPick}
              className="hidden md:inline-flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-white border border-white/10 transition cursor-pointer shrink-0"
              title="Pick a random game from the library"
            >
              <Shuffle className="w-3.5 h-3.5 text-red-400" />
              <span className="hidden lg:inline">Random Game</span>
              <span className="lg:hidden">Random</span>
            </button>

            {/* 4. 2-Player Multiplayer Rooms Button (Featured) */}
            <button
              type="button"
              onClick={() => setIsMultiplayerModalOpen(true)}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/35 transition cursor-pointer shadow-sm shadow-emerald-950/50 shrink-0"
              title="Open 2-Player Retro Multiplayer Rooms"
            >
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span>2P Rooms</span>
            </button>

            {/* 5. Community Leaderboards (>= lg: 1024px) */}
            <a
              href="/roms/leaderboards"
              className="hidden lg:inline-flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition cursor-pointer shrink-0"
              title="Community Leaderboards"
            >
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>Leaderboards</span>
            </a>

            {/* 5b. Asset Contribution Center (>= lg: 1024px) */}
            <a
              href="/roms/contribute"
              className="hidden lg:inline-flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition cursor-pointer shrink-0"
              title="Help Complete Missing Game Assets"
            >
              <UploadCloud className="w-3.5 h-3.5 text-emerald-400" />
              <span>Contribute</span>
            </a>

            {/* 6. Admin Link (if admin, >= xl: 1280px) */}
            {currentUser?.role === "admin" && (
              <a
                href="/roms/admin"
                className="hidden xl:inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-3 sm:py-2 rounded-xl text-xs font-bold bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 transition cursor-pointer shrink-0"
                title="Open Admin Dashboard"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                <span>Admin</span>
              </a>
            )}

            {/* 7. Responsive "More" Dropdown Menu (< 2xl: 1536px) */}
            <div ref={moreMenuRef} className="relative inline-block 2xl:hidden shrink-0">
              <button
                type="button"
                onClick={() => setIsMoreMenuOpen((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl text-xs font-bold border transition cursor-pointer select-none ${
                  isMoreMenuOpen
                    ? "bg-white/20 border-white/30 text-white shadow-md shadow-black/40"
                    : "bg-white/10 hover:bg-white/15 text-zinc-200 border-white/10"
                }`}
                title="More vault options and stats"
                aria-expanded={isMoreMenuOpen}
              >
                <MoreHorizontal className="w-4 h-4 text-zinc-300" />
                <span className="hidden sm:inline">More</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
                    isMoreMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isMoreMenuOpen && (
                <div className="absolute right-0 mt-2 w-72 sm:w-80 rounded-2xl bg-zinc-950/95 border border-white/15 shadow-2xl backdrop-blur-xl p-3 z-50 flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-150">
                  {/* Vault Statistics Card */}
                  <div className="p-3 rounded-xl bg-zinc-900/80 border border-white/5 space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-red-400" /> Vault Statistics
                      </span>
                      <span className="text-zinc-500 font-mono text-[9px]">Live Index</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center pt-0.5">
                      <div className="p-1.5 rounded-lg bg-zinc-950/70 border border-white/5">
                        <div className="text-xs font-black text-white">{stats.totalGames}</div>
                        <div className="text-[10px] text-zinc-400">ROMs</div>
                      </div>
                      <div className="p-1.5 rounded-lg bg-zinc-950/70 border border-white/5">
                        <div className="text-xs font-black text-white">{stats.withVideoCount}</div>
                        <div className="text-[10px] text-zinc-400">Videos</div>
                      </div>
                      <div className="p-1.5 rounded-lg bg-zinc-950/70 border border-white/5">
                        <div className="text-xs font-black text-white">
                          {stats.totalSizeBytes >= 1024 * 1024 * 1024
                            ? `${(stats.totalSizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
                            : `${(stats.totalSizeBytes / (1024 * 1024)).toFixed(0)} MB`}
                        </div>
                        <div className="text-[10px] text-zinc-400">Storage</div>
                      </div>
                    </div>
                  </div>

                  {/* Actions inside More Menu */}
                  <div className="flex flex-col gap-1 pt-0.5">
                    {/* Random Game (< md) */}
                    <button
                      type="button"
                      onClick={() => {
                        handleRandomPick();
                        setIsMoreMenuOpen(false);
                      }}
                      className="md:hidden w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-bold text-zinc-200 hover:text-white hover:bg-white/10 transition cursor-pointer text-left"
                    >
                      <div className="w-7 h-7 rounded-lg bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                        <Shuffle className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-bold text-xs">Random Game</div>
                        <div className="text-[10px] text-zinc-400 truncate">
                          Shuffle &amp; discover a surprise retro title
                        </div>
                      </div>
                    </button>

                    {/* Community Leaderboards (< lg) */}
                    <a
                      href="/roms/leaderboards"
                      onClick={() => setIsMoreMenuOpen(false)}
                      className="lg:hidden w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-bold text-zinc-200 hover:text-white hover:bg-white/10 transition cursor-pointer text-left"
                    >
                      <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                        <Trophy className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-bold text-xs">Community Leaderboards</div>
                        <div className="text-[10px] text-zinc-400 truncate">
                          Hall of fame high scores &amp; records
                        </div>
                      </div>
                    </a>

                    {/* Contribute Assets (< lg) */}
                    <a
                      href="/roms/contribute"
                      onClick={() => setIsMoreMenuOpen(false)}
                      className="lg:hidden w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-bold text-zinc-200 hover:text-white hover:bg-white/10 transition cursor-pointer text-left"
                    >
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                        <UploadCloud className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-bold text-xs">Contribute Assets</div>
                        <div className="text-[10px] text-zinc-400 truncate">
                          Help upload missing box art, screenshots &amp; videos
                        </div>
                      </div>
                    </a>

                    {/* Admin Console (< xl) */}
                    {currentUser?.role === "admin" && (
                      <a
                        href="/roms/admin"
                        onClick={() => setIsMoreMenuOpen(false)}
                        className="xl:hidden w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-bold text-red-300 hover:text-white hover:bg-red-600/20 transition cursor-pointer text-left"
                      >
                        <div className="w-7 h-7 rounded-lg bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                          <ShieldAlert className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-white font-bold text-xs">Admin Dashboard</div>
                          <div className="text-[10px] text-zinc-400 truncate">
                            Catalog scan, audits &amp; moderation
                          </div>
                        </div>
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Subtle Divider */}
            <div className="hidden sm:block h-5 w-px bg-white/10 shrink-0 mx-0.5" />

            {/* 8. User Profile / Sign In (Always pinned to the far right) */}
            {currentUser ? (
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(true)}
                className="inline-flex items-center gap-2 px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-xs font-semibold text-white transition cursor-pointer shrink-0"
                title="Manage Profile & Security"
              >
                <div className="w-5 h-5 rounded-full bg-red-600/30 border border-red-500/40 flex items-center justify-center text-[10px] text-red-300 font-bold shrink-0">
                  {currentUser.displayName ? currentUser.displayName[0].toUpperCase() : currentUser.username[0].toUpperCase()}
                </div>
                <span className="hidden sm:inline max-w-[100px] 2xl:max-w-[130px] truncate">
                  {currentUser.displayName || currentUser.username}
                </span>
              </button>
            ) : (
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-600/30 transition cursor-pointer shrink-0"
              >
                <User className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-8 py-6">
        <Shoutbox
          currentUser={currentUser}
          allGames={initialGames}
          onSelectGameById={(gameId) => {
            const decodedTarget = (() => {
              try {
                return decodeURIComponent(gameId);
              } catch {
                return gameId;
              }
            })();
            const match = initialGames.find(
              (g) =>
                g.id === gameId ||
                g.id === decodedTarget ||
                g.displayTitle.toLowerCase() === decodedTarget.toLowerCase()
            );
            if (match) {
              setDetailGame(match);
            }
          }}
        />

        {featuredGame && (
          <HeroSpotlight
            game={featuredGame}
            isMobile={isMobileDevice}
            onPlay={handlePlayGame}
            onSelectDetail={setDetailGame}
            onShuffle={handleShuffleFeatured}
          />
        )}

        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          selectedSystem={selectedSystem}
          onSystemChange={handleSystemChange}
          systemCounts={stats.systems ?? {}}
          selectedLetter={selectedLetter}
          onLetterChange={handleLetterChange}
          selectedRegion={selectedRegion}
          onRegionChange={handleRegionChange}
          availableRegions={availableRegions}
          coverStyle={coverStyle}
          onCoverStyleChange={handleCoverStyleChange}
          collectionFilter={collectionFilter}
          onCollectionFilterChange={handleCollectionFilterChange}
          totalFiltered={filteredGames.length}
          totalLibrary={initialGames.length}
          favoritesCount={favorites.length}
          recentCount={recentIds.length}
        />

        {visibleGames.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center rounded-3xl border border-white/10 bg-zinc-900/30">
            <Gamepad2 className="w-12 h-12 text-zinc-600 mb-3" />
            <h3 className="text-lg font-bold text-zinc-200">
              No matching retro games found
            </h3>
            <p className="text-sm text-zinc-500 mt-1 max-w-md">
              Try clearing your search filter, switching the console tab,
              or selecting &ldquo;All Regions&rdquo;.
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-4 px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition cursor-pointer"
            >
              Reset All Filters
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
              {visibleGames.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  coverStyle={coverStyle}
                  isFavorite={favoritesSet.has(game.id)}
                  isMobile={isMobileDevice}
                  onToggleFavorite={toggleFavorite}
                  onSelectDetail={setDetailGame}
                  onPlay={handlePlayGame}
                />
              ))}
            </div>

            {visibleCount < filteredGames.length && (
              <div
                ref={loadMoreRef}
                className="flex justify-center py-10"
              >
                <button
                  type="button"
                  onClick={() => {
                    setVisibleCount((prev) => {
                      const next = Math.min(prev + PAGE_SIZE, filteredGames.length);
                      syncUrlParams({ limit: next });
                      return next;
                    });
                  }}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-white/10 transition cursor-pointer"
                >
                  Load More ({filteredGames.length - visibleCount} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <GameDetailModal
        game={detailGame}
        isFavorite={detailGame ? favoritesSet.has(detailGame.id) : false}
        isMobile={isMobileDevice}
        onToggleFavorite={toggleFavorite}
        onClose={() => setDetailGame(null)}
        onPlay={(game) => {
          setDetailGame(null);
          handlePlayGame(game);
        }}
      />

      {playingGame && (
        <EmulatorErrorBoundary
          onReset={() => setPlayingGame(null)}
          gameTitle={playingGame.displayTitle}
          downloadUrl={playingGame.media.rom ? `${playingGame.media.rom}&download=1` : undefined}
        >
          <EmulatorModal
            game={playingGame}
            onClose={() => setPlayingGame(null)}
          />
        </EmulatorErrorBoundary>
      )}

      {currentUser && (
        <UserProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          currentUser={currentUser}
          onProfileUpdated={(updated) => {
            setCurrentUser((prev: any) => ({
              ...prev,
              displayName: updated.displayName,
            }));
          }}
        />
      )}

      <MultiplayerModal
        isOpen={isMultiplayerModalOpen}
        onClose={() => setIsMultiplayerModalOpen(false)}
        currentUser={currentUser}
        allGames={initialGames}
        initialGame={detailGame || featuredGame}
      />
    </div>
    </ServerUserAgentContext.Provider>
  );
}
