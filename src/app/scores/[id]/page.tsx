import "server-only";

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Trophy,
  ArrowLeft,
  Play,
  ExternalLink,
  Calendar,
  Gamepad2,
  ShieldCheck,
} from "lucide-react";
import { getHighScoreById } from "@/lib/community";
import { getGameById } from "@/lib/scanner";
import { ScoreShareButtons } from "@/components/community/ScoreShareButtons";
import { getSafeHttpUrl } from "@/lib/security";

interface ScorePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata(
  props: ScorePageProps
): Promise<Metadata> {
  const { id } = await props.params;
  const scoreId = parseInt(id, 10);
  const score = isNaN(scoreId) ? null : await getHighScoreById(scoreId);
  if (!score) return { title: "High Score Record Not Found | ROM Vault" };

  const game = await getGameById(score.gameId);
  const gameTitle = game?.displayTitle || score.gameId;
  const playerName = score.user.displayName || score.user.username;

  return {
    title: `${playerName} scored ${score.score.toLocaleString()} pts on ${gameTitle} | ROM Vault Leaderboards`,
    description: `Official ROM Vault community record for ${gameTitle} (${score.system.toUpperCase()}). Check out the proof and can you beat this record?`,
    openGraph: {
      title: `${playerName} scored ${score.score.toLocaleString()} on ${gameTitle}!`,
      description: `Official record set on ROM Vault. Can you beat it?`,
      type: "website",
    },
  };
}

export default async function ScorePage(props: ScorePageProps) {
  const { id } = await props.params;
  const scoreId = parseInt(id, 10);
  if (isNaN(scoreId)) {
    notFound();
  }

  const score = await getHighScoreById(scoreId);
  if (!score) {
    notFound();
  }

  const game = await getGameById(score.gameId);
  const gameTitle = game?.displayTitle || score.gameId;
  const playerName = score.user.displayName || score.user.username;
  const shareText = `I just scored ${score.score.toLocaleString()} on ${gameTitle} (${score.system.toUpperCase()}) on ROM Vault! Can you beat it? https://www.oldsmarchaos.com/roms/scores/${score.id}`;

  const backdropUrl =
    game?.media.fanart ?? game?.media.artworkFront ?? game?.media.screenshot ?? null;

  return (
    <div className="min-h-screen bg-black text-white relative flex flex-col justify-between overflow-x-hidden">
      {/* Background Ambience */}
      {backdropUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center blur-3xl opacity-20 pointer-events-none"
          style={{ backgroundImage: `url("${backdropUrl}")` }}
        />
      )}

      {/* Top Navigation */}
      <header className="relative z-10 border-b border-white/10 bg-zinc-950/80 backdrop-blur-md px-4 sm:px-8 py-4 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to ROM Vault</span>
        </Link>

        <Link
          href="/leaderboards"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition"
        >
          <Trophy className="w-3.5 h-3.5 text-amber-400" />
          <span>All Leaderboards</span>
        </Link>
      </header>

      {/* Main High Score Card */}
      <main className="relative z-10 max-w-3xl mx-auto w-full p-4 sm:p-8 my-auto">
        <div className="rounded-3xl border border-white/15 bg-zinc-950/90 shadow-2xl p-6 sm:p-10 flex flex-col gap-8 backdrop-blur-xl">
          {/* Header Row */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-md text-xs font-black uppercase tracking-wider bg-red-600 text-white">
                {score.system.toUpperCase()}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded-md border border-emerald-500/30">
                <ShieldCheck className="w-3.5 h-3.5" />
                Verified Record
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Calendar className="w-3.5 h-3.5" />
              <span>{new Date(score.createdAt).toLocaleDateString(undefined, { dateStyle: "long" })}</span>
            </div>
          </div>

          {/* Game Title & Score Numbers */}
          <div className="flex flex-col gap-3">
            <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              {gameTitle}
            </h1>
            <div className="flex items-baseline gap-3">
              <span className="text-5xl sm:text-7xl font-black font-mono text-amber-400 drop-shadow-[0_0_25px_rgba(251,191,36,0.4)]">
                {score.score.toLocaleString()}
              </span>
              <span className="text-xl sm:text-2xl font-bold text-zinc-400">POINTS</span>
            </div>
          </div>

          {/* Player Info & Proof */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-zinc-900/60 border border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-red-600/30 border border-red-500/40 flex items-center justify-center font-bold text-lg text-white uppercase overflow-hidden shrink-0">
                {score.user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={score.user.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  playerName.charAt(0)
                )}
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">
                  Achieved By
                </span>
                <span className="text-base font-bold text-white">{playerName}</span>
              </div>
            </div>

            <div className="flex flex-col justify-center sm:items-end">
              {getSafeHttpUrl(score.proofUrl) ? (
                <a
                  href={getSafeHttpUrl(score.proofUrl)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-200 bg-white/10 hover:bg-white/20 border border-white/10 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
                  <span>View Proof Screenshot</span>
                </a>
              ) : (
                <span className="text-xs text-zinc-500 italic">No external proof screenshot attached</span>
              )}

              {Boolean(score.metadataJson?.notes) && (
                <span className="text-xs text-zinc-400 mt-1">
                  &ldquo;{String(score.metadataJson?.notes)}&rdquo;
                </span>
              )}
            </div>
          </div>

          {/* Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-white/10">
            <ScoreShareButtons scoreId={score.id} scoreText={shareText} />

            <Link
              href={`/play/${encodeURIComponent(score.gameId)}`}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-red-600 hover:bg-red-500 text-white shadow-xl shadow-red-600/30 transition cursor-pointer active:scale-95"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Play This Game Now</span>
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-6 text-center text-xs text-zinc-500">
        ROM Vault Community Leaderboards • WebGL &amp; WebAssembly Retro Preservation
      </footer>
    </div>
  );
}
