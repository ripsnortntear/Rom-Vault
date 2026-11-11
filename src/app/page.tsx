export const dynamic = "force-dynamic";
import React, { Suspense } from "react";
import { headers } from "next/headers";
import { scanGameLibrary } from "@/lib/scanner";
import { getCurrentSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import type { UserProfile } from "@/types/auth";
import { RetroLibraryClient } from "@/components/RetroLibraryClient";

export default async function HomePage(): Promise<React.ReactElement> {
  const [{ games, stats }, session, reqHeaders] = await Promise.all([
    scanGameLibrary(),
    getCurrentSession().catch(() => null),
    headers().catch(() => null),
  ]);

  let initialUser: Record<string, unknown> | null = null;
  if (session?.user) {
    let profile: UserProfile | undefined;
    try {
      const profiles = await query<UserProfile>(
        "SELECT * FROM user_profiles WHERE user_id = ? LIMIT 1",
        [session.user.id]
      );
      profile = profiles[0];
    } catch {}

    const rawFavs = profile?.favorites;
    const userFavorites: string[] = Array.isArray(rawFavs)
      ? rawFavs
      : typeof rawFavs === "string"
      ? (() => {
          try {
            return JSON.parse(rawFavs);
          } catch {
            return [];
          }
        })()
      : [];

    initialUser = {
      ...session.user,
      displayName: profile?.display_name ?? session.user.displayName,
      favorites: userFavorites,
      quotaDaily:
        session.user.role === "admin"
          ? null
          : (profile?.download_quota_daily ?? 50),
      quotaUsedToday:
        session.user.role === "admin"
          ? 0
          : (profile?.download_count_today ?? 0),
    };
  }

  // Generate deterministic seed on the server so SSR and Client Hydration select the exact same featured game
  const initialSeed = (Date.now() % 100000) / 100000;
  const initialUserAgent = reqHeaders?.get("user-agent") || "";

  const isAdmin = session?.user?.role === "admin";
  const visibleGames = isAdmin ? games : games.filter((g) => !g.isDisabled);
  const visibleStats = isAdmin
    ? stats
    : {
        ...stats,
        totalGames: visibleGames.length,
        systems: (() => {
          const s = { ...stats.systems };
          delete s["disabled"];
          return s;
        })(),
      };

  return (
    <Suspense fallback={<div className="min-h-screen bg-[#070709]" />}>
      <RetroLibraryClient
        initialGames={visibleGames}
        stats={visibleStats}
        initialSeed={initialSeed}
        initialUser={initialUser}
        initialUserAgent={initialUserAgent}
      />
    </Suspense>
  );
}
