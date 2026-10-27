"use client";

import React from "react";
import {
  Search,
  X,
  Heart,
  Clock,
  Library,
  Layers,
  Globe,
} from "lucide-react";
import type { ConsoleSystem, CoverArtStyle } from "@/types/game";
import { KNOWN_SYSTEMS } from "@/lib/systems";

export type CollectionFilter = "all" | "favorites" | "recent";
export type SystemFilter = "ALL" | ConsoleSystem;

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  selectedSystem: SystemFilter;
  onSystemChange: (system: SystemFilter) => void;
  systemCounts: Record<ConsoleSystem, number>;
  selectedLetter: string;
  onLetterChange: (letter: string) => void;
  selectedRegion: string;
  onRegionChange: (region: string) => void;
  availableRegions: string[];
  coverStyle: CoverArtStyle;
  onCoverStyleChange: (style: CoverArtStyle) => void;
  collectionFilter: CollectionFilter;
  onCollectionFilterChange: (filter: CollectionFilter) => void;
  totalFiltered: number;
  totalLibrary: number;
  favoritesCount: number;
  recentCount: number;
}

const ALPHABET = [
  "ALL",
  "#",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
];

const COVER_STYLE_OPTIONS: Array<{ value: CoverArtStyle; label: string }> = [
  { value: "artwork_front", label: "2D Box Art" },
  { value: "artwork_3d", label: "3D Box Art" },
  { value: "medium_front", label: "Cartridge" },
  { value: "screentitle", label: "Title Screen" },
];

export function FilterBar({
  searchQuery,
  onSearchChange,
  selectedSystem,
  onSystemChange,
  systemCounts,
  selectedLetter,
  onLetterChange,
  selectedRegion,
  onRegionChange,
  availableRegions,
  coverStyle,
  onCoverStyleChange,
  collectionFilter,
  onCollectionFilterChange,
  totalFiltered,
  totalLibrary,
  favoritesCount,
  recentCount,
}: FilterBarProps): React.ReactElement {
  return (
    <div className="sticky top-0 z-30 mb-6 rounded-2xl border border-white/10 bg-zinc-950/85 backdrop-blur-xl p-4 shadow-xl">
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={`Search ${totalLibrary} ROMs by title, story, or region...`}
              className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-zinc-900/90 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/70 focus:ring-2 focus:ring-red-500/20 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl bg-zinc-900 p-1 border border-white/10">
              <button
                type="button"
                onClick={() => onCollectionFilterChange("all")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  collectionFilter === "all"
                    ? "bg-red-600 text-white shadow"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Library className="w-3.5 h-3.5" />
                All
              </button>
              <button
                type="button"
                onClick={() => onCollectionFilterChange("favorites")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  collectionFilter === "favorites"
                    ? "bg-red-600 text-white shadow"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Heart className="w-3.5 h-3.5" />
                Favorites ({favoritesCount})
              </button>
              <button
                type="button"
                onClick={() => onCollectionFilterChange("recent")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  collectionFilter === "recent"
                    ? "bg-red-600 text-white shadow"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                Recent ({recentCount})
              </button>
            </div>

            <div className="relative inline-flex items-center">
              <Globe className="w-3.5 h-3.5 text-zinc-400 absolute left-3 pointer-events-none" />
              <select
                value={selectedRegion}
                onChange={(e) => onRegionChange(e.target.value)}
                aria-label="Filter by region"
                className="pl-8 pr-7 py-2 rounded-xl bg-zinc-900 border border-white/10 text-xs font-semibold text-zinc-200 focus:outline-none focus:border-red-500/60 cursor-pointer"
              >
                <option value="ALL">All Regions</option>
                {availableRegions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative inline-flex items-center">
              <Layers className="w-3.5 h-3.5 text-zinc-400 absolute left-3 pointer-events-none" />
              <select
                value={coverStyle}
                onChange={(e) =>
                  onCoverStyleChange(e.target.value as CoverArtStyle)
                }
                aria-label="Select artwork view style"
                className="pl-8 pr-7 py-2 rounded-xl bg-zinc-900 border border-white/10 text-xs font-semibold text-zinc-200 focus:outline-none focus:border-red-500/60 cursor-pointer"
              >
                {COVER_STYLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* System Selector Bar */}
        <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => onSystemChange("ALL")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              selectedSystem === "ALL"
                ? "bg-white/20 text-white shadow-md border border-white/20"
                : "bg-zinc-900/80 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-white/5"
            }`}
          >
            All Consoles ({totalLibrary})
          </button>

          {Object.entries(KNOWN_SYSTEMS).map(([id, meta]) => {
            const count = systemCounts[id] ?? 0;
            if (count === 0 && totalLibrary > 0) return null;
            const isSelected = selectedSystem === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSystemChange(id)}
                className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  isSelected
                    ? `${meta.badgeColor} text-white shadow-md shadow-black/40 ring-2 ring-white/30`
                    : "bg-zinc-900/80 text-zinc-300 hover:text-white hover:bg-zinc-800 border border-white/5"
                }`}
                title={meta.name}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: meta.colorHex }}
                />
                {meta.shortLabel}
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                  isSelected ? "bg-black/30 text-white" : "bg-white/5 text-zinc-400"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1">
          {ALPHABET.map((letter) => {
            const active = selectedLetter === letter;
            return (
              <button
                key={letter}
                type="button"
                onClick={() => onLetterChange(letter)}
                className={`px-2 py-1 rounded-md text-xs font-bold transition cursor-pointer shrink-0 ${
                  active
                    ? "bg-red-600 text-white shadow-sm shadow-red-600/50"
                    : "text-zinc-400 hover:text-white hover:bg-white/10"
                }`}
              >
                {letter}
              </button>
            );
          })}
        </div>

        <div className="text-xs text-zinc-400 font-medium shrink-0 pl-2">
          Showing <span className="text-white font-bold">{totalFiltered}</span>{" "}
          games
        </div>
      </div>
    </div>
  );
}
