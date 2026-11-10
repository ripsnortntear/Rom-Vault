export const dynamic = "force-dynamic";

import "server-only";

import React, { Suspense } from "react";
import type { Metadata } from "next";
import { scanGameLibrary } from "@/lib/scanner";
import { getCurrentSession } from "@/lib/auth/session";
import {
  getContributionLeaderboard,
  getPendingAssetSlots,
  getUserRecentContributions,
} from "@/lib/contributions";
import { ContributeClient } from "@/components/contribute/ContributeClient";

export const metadata: Metadata = {
  title: "Community Asset Contribution Center & Leaderboard | ROM Vault",
  description:
    "Help complete missing 2D/3D box art, screenshots, title screens, marquees, gameplay videos, and game stories across all retro platforms and climb the Community Contributors Leaderboard.",
};

async function ContributeContent(): Promise<React.ReactElement> {
  const [{ games }, session, leaderboard, pendingSlots] = await Promise.all([
    scanGameLibrary(),
    getCurrentSession().catch(() => null),
    getContributionLeaderboard(25),
    getPendingAssetSlots(),
  ]);

  const initialUser = session?.user ? { ...session.user } : null;
  const userSubmissions = session?.user?.id
    ? await getUserRecentContributions(String(session.user.id), 20)
    : [];

  return (
    <ContributeClient
      initialGames={games}
      initialUser={initialUser}
      initialLeaderboard={leaderboard}
      initialPendingSlots={pendingSlots}
      initialUserSubmissions={userSubmissions}
    />
  );
}

export default function ContributePage(): React.ReactElement {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#070709]" />}>
      <ContributeContent />
    </Suspense>
  );
}
