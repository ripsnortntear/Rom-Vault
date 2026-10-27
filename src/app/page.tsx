import React from "react";
import { scanGameLibrary } from "@/lib/scanner";
import { RetroLibraryClient } from "@/components/RetroLibraryClient";

export default async function HomePage(): Promise<React.ReactElement> {
  const { games, stats } = await scanGameLibrary();

  return <RetroLibraryClient initialGames={games} stats={stats} />;
}
