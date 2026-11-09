import "server-only";

import React, { Suspense } from "react";
import type { Metadata } from "next";
import { scanGameLibrary } from "@/lib/scanner";
import { getCurrentSession } from "@/lib/auth/session";
import { ContributeClient } from "@/components/contribute/ContributeClient";

export const metadata: Metadata = {
  title: "Community Asset Contribution Center | ROM Vault",
  description:
    "Help complete missing 2D/3D box art, screenshots, title screens, marquees, gameplay videos, and game stories across all retro platforms.",
};

async function ContributeContent(): Promise<React.ReactElement> {
  const [{ games }, session] = await Promise.all([
    scanGameLibrary(),
    getCurrentSession().catch(() => null),
  ]);

  const initialUser = session?.user ? { ...session.user } : null;

  return <ContributeClient initialGames={games} initialUser={initialUser} />;
}

export default function ContributePage(): React.ReactElement {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#070709]" />}>
      <ContributeContent />
    </Suspense>
  );
}
