import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Global Header Full-Width & Responsive Pill Layout Tests", () => {
  const retroClientPath = path.join(process.cwd(), "src/components/RetroLibraryClient.tsx");
  const edgeBadgePath = path.join(process.cwd(), "src/components/EdgeRecommendationBadge.tsx");

  const retroClientSource = fs.readFileSync(retroClientPath, "utf-8");
  const edgeBadgeSource = fs.readFileSync(edgeBadgePath, "utf-8");

  it("header container spans full viewport width without artificial max-w constraints", () => {
    // Header tag must be sticky and full-width
    expect(retroClientSource).toContain(
      '<header className="sticky top-0 z-40 w-full border-b border-white/10 bg-zinc-950/90 backdrop-blur-md">'
    );

    // Inner header flex container must be w-full and justify-between (no max-w-[1600px] or mx-auto)
    expect(retroClientSource).toContain(
      '<div className="w-full px-4 sm:px-6 lg:px-8 2xl:px-10 py-3 flex items-center justify-between gap-3 sm:gap-4">'
    );
    expect(retroClientSource).not.toContain(
      '<div className="max-w-[1600px] mx-auto px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-4">'
    );
  });

  it("logo is aligned to far left with shrink-0 and whitespace-nowrap", () => {
    expect(retroClientSource).toContain('shrink-0"');
    expect(retroClientSource).toContain('ROM <span className="text-red-500 group-hover:text-red-400">VAULT</span>');
    expect(retroClientSource).toContain('Multi-Console Retro Library');
  });

  it("implements responsive pill collapsing with 'More' dropdown below 2xl viewports", () => {
    // 2xl Stats pill hidden below 2xl
    expect(retroClientSource).toContain('hidden 2xl:flex items-center gap-3.5 px-3.5 py-1.5 rounded-xl');

    // More dropdown trigger rendered below 2xl
    expect(retroClientSource).toContain('className="relative inline-block 2xl:hidden shrink-0"');
    expect(retroClientSource).toContain('<MoreHorizontal className="w-4 h-4 text-zinc-300" />');
    expect(retroClientSource).toContain('<ChevronDown');

    // More menu contains Vault Statistics card
    expect(retroClientSource).toContain('Vault Statistics');
    expect(retroClientSource).toContain('{stats.totalGames}');
    expect(retroClientSource).toContain('{stats.withVideoCount}');

    // More menu contains responsive action fallbacks
    expect(retroClientSource).toContain('Community Leaderboards');
  });

  it("ensures EdgeRecommendationBadge supports custom responsive classNames", () => {
    expect(edgeBadgeSource).toContain('className?: string');
    expect(retroClientSource).toContain('<EdgeRecommendationBadge className="hidden xl:inline-flex items-center shrink-0" />');
  });

  it("keeps primary user actions (2P Rooms and Profile/Sign In) persistently visible", () => {
    expect(retroClientSource).toContain('title="Open 2-Player Retro Multiplayer Rooms"');
    expect(retroClientSource).toContain('2P Rooms');
    expect(retroClientSource).toContain('title="Manage Profile & Security"');
    expect(retroClientSource).toContain('href="/auth/login"');
  });
});
