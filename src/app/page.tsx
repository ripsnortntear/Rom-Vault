import React, { Suspense } from "react";
import { scanGameLibrary } from "@/lib/scanner";
import { RetroLibraryClient } from "@/components/RetroLibraryClient";

export default async function HomePage(): Promise<React.ReactElement> {
  const { games, stats } = await scanGameLibrary();

  return (
    <Suspense fallback={<div className="min-h-screen bg-[#070709]" />}>
      <RetroLibraryClient initialGames={games} stats={stats} />
    </Suspense>
  );
}
