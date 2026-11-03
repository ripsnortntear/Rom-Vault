import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HeroSpotlight } from "./components/HeroSpotlight";
import type { GameItem } from "./types/game";

function createMockGame(overrides: Partial<GameItem["media"]> = {}): GameItem {
  return {
    id: "snes/super-mario-world",
    system: "snes",
    systemLabel: "Super Nintendo",
    systemCompany: "Nintendo",
    badgeColor: "bg-purple-600/90",
    playable: true,
    baseName: "Super Mario World (USA)",
    romFileName: "Super Mario World (USA).sfc",
    displayTitle: "Super Mario World",
    sortTitle: "super mario world",
    firstLetter: "S",
    story: "Experience Super Mario World on Super Nintendo.",
    regions: ["USA"],
    tags: ["platformer"],
    year: 1990,
    fileSizeBytes: 524288,
    media: {
      rom: "/roms/api/roms/snes__smw/stream",
      artworkFront: "/roms/media/artwork_front/smw.png",
      artwork3d: "/roms/media/artwork_3d/smw.png",
      logo: "/roms/media/logo/smw.png",
      mediumFront: null,
      mediumDisc: null,
      screenshot: "/roms/media/screenshot/smw.png",
      screenTitle: "/roms/media/screentitle/smw.png",
      fanart: "/roms/media/fanart/smw.png",
      bezelDay: null,
      bezelNight: null,
      video: "/roms/media/video/smw.mp4",
      ...overrides,
    },
  };
}

describe("HeroSpotlight Media Fallback Suite", () => {
  it("renders video element when game.media.video is present", () => {
    const game = createMockGame({ video: "/roms/media/video/smw.mp4" });
    const html = renderToStaticMarkup(
      <HeroSpotlight
        game={game}
        onPlay={() => {}}
        onSelectDetail={() => {}}
        onShuffle={() => {}}
      />
    );

    expect(html).toContain("<video");
    expect(html).toContain('src="/roms/media/video/smw.mp4"');
    expect(html.toLowerCase()).toContain("playsinline");
    expect(html.toLowerCase()).toContain("autoplay");
    expect(html.toLowerCase()).toContain("loop");
  });

  it("falls back to screenshot when no video is found", () => {
    const game = createMockGame({
      video: null,
      screenshot: "/roms/media/screenshot/smw.png",
      screenTitle: "/roms/media/screentitle/smw.png",
    });

    const html = renderToStaticMarkup(
      <HeroSpotlight
        game={game}
        onPlay={() => {}}
        onSelectDetail={() => {}}
        onShuffle={() => {}}
      />
    );

    expect(html).not.toContain("<video");
    expect(html).toContain("<img");
    expect(html).toContain('src="/roms/media/screenshot/smw.png"');
    expect(html).toContain('alt="Super Mario World Screenshot"');
  });

  it("falls back to title screen when neither video nor screenshot is found", () => {
    const game = createMockGame({
      video: null,
      screenshot: null,
      screenTitle: "/roms/media/screentitle/smw.png",
      artworkFront: "/roms/media/artwork_front/smw.png",
    });

    const html = renderToStaticMarkup(
      <HeroSpotlight
        game={game}
        onPlay={() => {}}
        onSelectDetail={() => {}}
        onShuffle={() => {}}
      />
    );

    expect(html).not.toContain("<video");
    expect(html).toContain("<img");
    expect(html).toContain('src="/roms/media/screentitle/smw.png"');
    expect(html).toContain('alt="Super Mario World Title Screen"');
  });

  it("falls back to boxart / fanart preview when video, screenshot, and title screen are all absent", () => {
    const game = createMockGame({
      video: null,
      screenshot: null,
      screenTitle: null,
      fanart: "/roms/media/fanart/smw.png",
      artworkFront: "/roms/media/artwork_front/smw.png",
    });

    const html = renderToStaticMarkup(
      <HeroSpotlight
        game={game}
        onPlay={() => {}}
        onSelectDetail={() => {}}
        onShuffle={() => {}}
      />
    );

    expect(html).not.toContain("<video");
    expect(html).toContain("<img");
    expect(html).toContain('src="/roms/media/fanart/smw.png"');
    expect(html).toContain('alt="Super Mario World Preview"');
  });

  it("renders elegant placeholder when all media items are absent", () => {
    const game = createMockGame({
      video: null,
      screenshot: null,
      screenTitle: null,
      fanart: null,
      artworkFront: null,
      artwork3d: null,
    });

    const html = renderToStaticMarkup(
      <HeroSpotlight
        game={game}
        onPlay={() => {}}
        onSelectDetail={() => {}}
        onShuffle={() => {}}
      />
    );

    expect(html).not.toContain("<video");
    expect(html).toContain("Super Mario World");
    expect(html).toContain("Super Nintendo");
  });

  it("satisfies mobile video invariants: playsInline, initial muted state, and volume toggle button", () => {
    const game = createMockGame({ video: "/roms/media/video/smw.mp4" });
    const html = renderToStaticMarkup(
      <HeroSpotlight
        game={game}
        onPlay={() => {}}
        onSelectDetail={() => {}}
        onShuffle={() => {}}
      />
    );

    expect(html.toLowerCase()).toContain("playsinline");
    expect(html.toLowerCase()).toContain("muted");
    expect(html).toContain('aria-label="Unmute preview video"');
  });

  it("initializes featuredGame deterministically from server-supplied initialSeed to prevent SSR hydration flip", () => {
    const clientSource = fs.readFileSync(
      path.join(process.cwd(), "src/components/RetroLibraryClient.tsx"),
      "utf-8"
    );
    const pageSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/page.tsx"),
      "utf-8"
    );

    expect(pageSource).toContain("initialSeed={initialSeed}");
    expect(pageSource).toContain("initialUser={initialUser}");
    expect(pageSource).toContain("initialUserAgent={initialUserAgent}");
    expect(clientSource).toContain("const seed = typeof initialSeed === \"number\" ? initialSeed : 0;");
  });
});
