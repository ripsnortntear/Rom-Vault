export const dynamic = "force-dynamic";

import "server-only";

import type { Metadata } from "next";
import Link from "next/link";
import {
  Trophy,
  ArrowLeft,
  Share2,
  ExternalLink,
  Flame,
  Award,
  Gamepad2,
  Filter,
} from "lucide-react";
import { getLeaderboards } from "@/lib/community";
import { getGameById } from "@/lib/scanner";
import { KNOWN_SYSTEMS } from "@/lib/systems";
import { getSafeAvatarUrl } from "@/lib/security";

export const metadata: Metadata = {
  title: "Community Leaderboards & Records | ROM Vault",
  description: "Browse top verified retro gaming high scores across all 15 consoles on ROM Vault.",
};

const SYSTEM_TABS = [
  { id: "all", label: "Global All-Stars" },
  { id: "psx", label: "PlayStation" },
  { id: "snes", label: "SNES" },
  { id: "nes", label: "NES" },
  { id: "n64", label: "Nintendo 64" },
  { id: "gba", label: "Game Boy Advance" },
  { id: "gb", label: "Game Boy" },
  { id: "gbc", label: "Game Boy Color" },
  { id: "genesis", label: "Genesis / Mega Drive" },
  { id: "ps2", label: "PlayStation 2" },
  { id: "gamecube", label: "GameCube" },
  { id: "saturn", label: "Sega Saturn" },
  { id: "segacd", label: "Sega CD" },
  { id: "mastersystem", label: "Master System" },
  { id: "gamegear", label: "Game Gear" },
];

interface LeaderboardsPageProps {
  searchParams: Promise<{ system?: string }>;
}

export default async function LeaderboardsPage(props: LeaderboardsPageProps) {
  const searchParams = await props.searchParams;
  const currentSystem = typeof searchParams?.system === "string" ? searchParams.system : "all";

  const rawScores = await getLeaderboards(currentSystem, 50);

  // Enrich scores with game metadata
  const scores = await Promise.all(
    rawScores.map(async (s) => {
      const game = await getGameById(s.gameId);
      return {
        ...s,
        gameTitle: game?.displayTitle || s.gameId,
        gameThumbnail: game?.media.artworkFront || game?.media.screenshot || null,
      };
    })
  );

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-white/10 bg-zinc-950/80 backdrop-blur-md px-4 sm:px-8 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Vault Library</span>
          </Link>
          <span className="text-zinc-600">/</span>
          <div className="flex items-center gap-2 font-bold text-white text-sm sm:text-base">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>Hall of Fame Leaderboards</span>
          </div>
        </div>

        <span className="text-xs font-mono text-zinc-500 hidden sm:inline">
          {scores.length} Records Logged
        </span>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto w-full px-4 sm:px-8 py-8 flex flex-col gap-6 flex-1">
        {/* Banner */}
        <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-amber-950/40 via-red-950/30 to-zinc-950 border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-2xl">
          <div className="flex flex-col gap-2">
            <span className="px-3 py-1 rounded-md text-[11px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 w-max">
              Official Community Records
            </span>
            <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              Vault Arcade &amp; Console Leaderboards
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-xl leading-relaxed">
              Verified high scores, speedrun records, and legendary runs achieved directly inside the
              browser emulator and synced across the ROM Vault community.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-black/40 border border-white/10 p-4 rounded-2xl shrink-0">
            <div className="text-center px-2">
              <span className="block text-2xl font-black font-mono text-amber-400">
                {scores.length}
              </span>
              <span className="text-[10px] text-zinc-500 uppercase font-bold">Top Records</span>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-center px-2">
              <span className="block text-2xl font-black font-mono text-red-400">15</span>
              <span className="text-[10px] text-zinc-500 uppercase font-bold">Consoles</span>
            </div>
          </div>
        </div>

        {/* System Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {SYSTEM_TABS.map((tab) => {
            const isActive = currentSystem === tab.id;
            return (
              <Link
                key={tab.id}
                href={tab.id === "all" ? "/leaderboards" : `/leaderboards?system=${tab.id}`}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer active:scale-95 ${
                  isActive
                    ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20 font-black"
                    : "bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/10"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {/* Leaderboard Table */}
        <div className="rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl overflow-hidden">
          {scores.length === 0 ? (
            <div className="py-16 text-center flex flex-col items-center justify-center gap-3">
              <Trophy className="w-10 h-10 text-zinc-700" />
              <h3 className="text-base font-bold text-zinc-300">No Records Yet</h3>
              <p className="text-xs text-zinc-500 max-w-sm">
                No high scores have been submitted for this platform yet. Play a game and be the first
                to set a record!
              </p>
              <Link
                href="/"
                className="mt-2 px-4 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition"
              >
                Browse Games
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 bg-zinc-900/60 text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3.5 px-4 w-12 text-center">Rank</th>
                    <th className="py-3.5 px-4">Player</th>
                    <th className="py-3.5 px-4">Game</th>
                    <th className="py-3.5 px-4">System</th>
                    <th className="py-3.5 px-4 text-right">Score</th>
                    <th className="py-3.5 px-4 text-right">Date</th>
                    <th className="py-3.5 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-medium">
                  {scores.map((score, index) => {
                    const rankBadge =
                      index === 0
                        ? "🥇"
                        : index === 1
                        ? "🥈"
                        : index === 2
                        ? "🥉"
                        : `#${index + 1}`;
                    const isTopThree = index < 3;
                    const playerName = score.user.displayName || score.user.username;

                    return (
                      <tr
                        key={score.id}
                        className={`hover:bg-white/[0.03] transition ${
                          isTopThree ? "bg-amber-500/[0.02]" : ""
                        }`}
                      >
                        {/* Rank */}
                        <td className="py-3 px-4 text-center font-bold text-sm">
                          {rankBadge}
                        </td>

                        {/* Player */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-zinc-800 border border-white/15 flex items-center justify-center font-bold text-xs text-white uppercase overflow-hidden shrink-0">
                              {getSafeAvatarUrl(score.user.avatarUrl, null) ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={getSafeAvatarUrl(score.user.avatarUrl)!}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                playerName.charAt(0)
                              )}
                            </div>
                            <span className="font-bold text-white">{playerName}</span>
                          </div>
                        </td>

                        {/* Game */}
                        <td className="py-3 px-4">
                          <Link
                            href={`/play/${encodeURIComponent(score.gameId)}`}
                            className="font-bold text-zinc-200 hover:text-white underline truncate max-w-[200px] block"
                            title={`Play ${score.gameTitle}`}
                          >
                            {score.gameTitle}
                          </Link>
                        </td>

                        {/* System */}
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-zinc-800 text-zinc-300 border border-white/10">
                            {score.system.toUpperCase()}
                          </span>
                        </td>

                        {/* Score */}
                        <td className="py-3 px-4 text-right">
                          <span
                            className={`font-mono font-black text-sm ${
                              isTopThree ? "text-amber-400" : "text-white"
                            }`}
                          >
                            {score.score.toLocaleString()}
                          </span>
                        </td>

                        {/* Date */}
                        <td className="py-3 px-4 text-right text-zinc-500 font-mono text-[11px]">
                          {new Date(score.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </td>

                        {/* Action Permalinks */}
                        <td className="py-3 px-4 text-center">
                          <Link
                            href={`/scores/${score.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white/10 hover:bg-white/20 text-zinc-200 hover:text-white transition"
                          >
                            <span>View</span>
                            <ExternalLink className="w-3 h-3 text-zinc-400" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-white/10 py-6 text-center text-xs text-zinc-500">
        ROM Vault Community Leaderboards • Preserving Retro High Scores
      </footer>
    </div>
  );
}
