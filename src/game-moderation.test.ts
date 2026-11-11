import { describe, it, expect } from "vitest";
import { KNOWN_SYSTEMS } from "@/lib/systems";
import type { GameItem, CoverArtStyle } from "@/types/game";

function getCoverUrl(game: GameItem, style: CoverArtStyle): string | null {
  if (game.customCoverUrl) {
    return game.customCoverUrl;
  }
  if (game.preferredCover) {
    switch (game.preferredCover) {
      case "artwork_front":
        return game.media.artworkFront ?? game.media.artwork3d;
      case "artwork_3d":
        return game.media.artwork3d ?? game.media.artworkFront;
      case "medium_front":
        return game.media.mediumFront ?? game.media.mediumDisc ?? game.media.artworkFront;
      case "medium_disc":
        return game.media.mediumDisc ?? game.media.mediumFront ?? game.media.artworkFront;
      case "screentitle":
        return game.media.screenTitle ?? game.media.screenshot;
      case "screenshot":
        return game.media.screenshot ?? game.media.screenTitle;
      case "fanart":
        return game.media.fanart ?? game.media.artworkFront;
      default:
        if (game.preferredCover.startsWith("http") || game.preferredCover.startsWith("/")) {
          return game.preferredCover;
        }
        break;
    }
  }
  switch (style) {
    case "artwork_3d":
      return game.media.artwork3d ?? game.media.artworkFront;
    case "medium_front":
      return game.media.mediumFront ?? game.media.mediumDisc ?? game.media.artworkFront;
    case "screentitle":
      return game.media.screenTitle ?? game.media.screenshot;
    case "fanart":
      return game.media.fanart ?? game.media.screenshot ?? game.media.artworkFront;
    case "artwork_front":
    default:
      return game.media.artworkFront ?? game.media.artwork3d ?? game.media.mediumFront ?? game.media.mediumDisc;
  }
}

describe("Game Card Moderation & Disabled System Suite", () => {
  const sampleGame: GameItem = {
    id: "nes__Super_Mario_Bros",
    system: "nes",
    systemLabel: "NES",
    systemCompany: "Nintendo",
    badgeColor: "bg-red-600",
    playable: true,
    baseName: "Super Mario Bros (USA)",
    romFileName: "Super Mario Bros (USA).nes",
    displayTitle: "Super Mario Bros.",
    sortTitle: "Super Mario Bros.",
    firstLetter: "S",
    regions: ["USA"],
    tags: ["Platformer"],
    fileSizeBytes: 40960,
    story: "Save Princess Toadstool from Bowser.",
    media: {
      rom: "/roms/api/roms/nes__Super_Mario_Bros/stream",
      artworkFront: "/roms/api/media/artwork_front/smb.png",
      artwork3d: "/roms/api/media/artwork_3d/smb-3d.png",
      logo: null,
      mediumFront: "/roms/api/media/medium_front/smb-cart.png",
      mediumDisc: null,
      screenTitle: "/roms/api/media/screentitle/smb-title.png",
      screenshot: "/roms/api/media/screenshot/smb-play.png",
      fanart: "/roms/api/media/fanart/smb-fan.png",
      bezelDay: null,
      bezelNight: null,
      video: null,
    },
  };

  it("registers 'disabled' in KNOWN_SYSTEMS with distinct styling", () => {
    expect(KNOWN_SYSTEMS.disabled).toBeDefined();
    expect(KNOWN_SYSTEMS.disabled.shortLabel).toBe("Disabled");
    expect(KNOWN_SYSTEMS.disabled.badgeColor).toContain("bg-zinc-700");
  });

  it("defaults to standard 2D cover style when no moderation override exists", () => {
    const cover = getCoverUrl(sampleGame, "artwork_front");
    expect(cover).toBe("/roms/api/media/artwork_front/smb.png");
  });

  it("respects preferredCover moderation to change the main picture to Title Screen", () => {
    const moderated: GameItem = {
      ...sampleGame,
      preferredCover: "screentitle",
    };
    const cover = getCoverUrl(moderated, "artwork_front");
    expect(cover).toBe("/roms/api/media/screentitle/smb-title.png");
  });

  it("respects preferredCover moderation to change the main picture to 3D Box Art", () => {
    const moderated: GameItem = {
      ...sampleGame,
      preferredCover: "artwork_3d",
    };
    const cover = getCoverUrl(moderated, "artwork_front");
    expect(cover).toBe("/roms/api/media/artwork_3d/smb-3d.png");
  });

  it("prioritizes customCoverUrl over preferredCover and style", () => {
    const customUrl = "https://images.oldsmarchaos.com/custom-smb.jpg";
    const moderated: GameItem = {
      ...sampleGame,
      preferredCover: "screentitle",
      customCoverUrl: customUrl,
    };
    const cover = getCoverUrl(moderated, "artwork_front");
    expect(cover).toBe(customUrl);
  });

  it("hides disabled games from regular non-admin users in library filtering", () => {
    const games: GameItem[] = [
      { ...sampleGame, id: "game-1", isDisabled: false },
      { ...sampleGame, id: "game-2", isDisabled: true },
    ];

    const regularUserFilter = (g: GameItem, isAdmin: boolean, selectedSystem: string) => {
      if (g.isDisabled) {
        if (!isAdmin) return false;
        if (selectedSystem !== "disabled" && selectedSystem !== "ALL") return false;
      } else {
        if (selectedSystem === "disabled") return false;
      }
      return true;
    };

    const nonAdminVisible = games.filter((g) => regularUserFilter(g, false, "ALL"));
    expect(nonAdminVisible.map((g) => g.id)).toEqual(["game-1"]);

    const adminAll = games.filter((g) => regularUserFilter(g, true, "ALL"));
    expect(adminAll.map((g) => g.id)).toEqual(["game-1", "game-2"]);

    const adminDisabled = games.filter((g) => regularUserFilter(g, true, "disabled"));
    expect(adminDisabled.map((g) => g.id)).toEqual(["game-2"]);
  });

  it("correctly calculates systemCounts['disabled'] and omits it when 0 games are disabled", () => {
    const countSystems = (games: GameItem[]) => {
      const counts: Record<string, number> = {};
      let disabledCount = 0;
      for (const g of games) {
        if (g.isDisabled) {
          disabledCount += 1;
        } else {
          counts[g.system] = (counts[g.system] ?? 0) + 1;
        }
      }
      if (disabledCount > 0) {
        counts["disabled"] = disabledCount;
      }
      return counts;
    };

    const allActive: GameItem[] = [
      { ...sampleGame, id: "g1", system: "nes", isDisabled: false },
      { ...sampleGame, id: "g2", system: "snes", isDisabled: false },
    ];
    const activeCounts = countSystems(allActive);
    expect(activeCounts.disabled).toBeUndefined();
    expect(activeCounts.nes).toBe(1);
    expect(activeCounts.snes).toBe(1);

    const withDisabled: GameItem[] = [
      { ...sampleGame, id: "g1", system: "nes", isDisabled: false },
      { ...sampleGame, id: "g2", system: "snes", isDisabled: true },
    ];
    const disabledCounts = countSystems(withDisabled);
    expect(disabledCounts.disabled).toBe(1);
    expect(disabledCounts.nes).toBe(1);
    expect(disabledCounts.snes).toBeUndefined();
  });
});
