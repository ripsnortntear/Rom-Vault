export const dynamic = "force-dynamic";

import "server-only";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata, Viewport } from "next";
import { getGameById } from "@/lib/scanner";
import { isDesktopOnlySystem } from "@/lib/systems";
import { getCurrentSession } from "@/lib/auth/session";
import { MobileEmulatorView } from "@/components/MobileEmulatorView";
import { PS2EmulatorView } from "@/components/PS2EmulatorView";
import { GameCubeEmulatorView } from "@/components/GameCubeEmulatorView";
import { MobileDesktopRequired } from "@/components/MobileDesktopRequired";
import { StandaloneRecommendationView } from "@/components/StandaloneRecommendationView";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

interface PlayPageProps {
  params: Promise<{
    id: string;
  }>;
}

export async function generateMetadata({ params }: PlayPageProps): Promise<Metadata> {
  const { id } = await params;
  const game = await getGameById(id);

  if (!game) {
    return { title: "Game Not Found | ROM Vault" };
  }

  const title = game.displayTitle || game.baseName;
  return {
    title: `Playing ${title} (${game.system.toUpperCase()}) | ROM Vault`,
    description: `Direct browser emulation for ${title} on ROM Vault.`,
  };
}

export default async function PlayPage({ params }: PlayPageProps) {
  const { id } = await params;
  const game = await getGameById(id);

  if (!game) {
    notFound();
  }

  if (game.isDisabled) {
    const session = await getCurrentSession().catch(() => null);
    if (session?.user?.role !== "admin") {
      notFound();
    }
  }

  if (!game.playable) {
    return (
      <StandaloneRecommendationView
        game={{
          id: game.id,
          title: game.displayTitle || game.baseName,
          system: game.system,
          romFileName: game.romFileName,
        }}
      />
    );
  }

  const headerList = await headers();
  const ua = headerList.get("user-agent") || "";
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);

  if (isMobileUA && isDesktopOnlySystem(game.system)) {
    return (
      <MobileDesktopRequired
        game={{
          id: game.id,
          title: game.displayTitle || game.baseName,
          system: game.system,
          romFileName: game.romFileName,
        }}
      />
    );
  }

  return (
    <main className="fixed inset-0 w-screen h-screen bg-black overflow-hidden flex flex-col">
      {game.system === "ps2" ? (
          <PS2EmulatorView
            game={{
              id: game.id,
              title: game.displayTitle || game.baseName,
              system: game.system,
              romFileName: game.romFileName,
              discs: game.discs,
            }}
          />
        ) : game.system === "gamecube" ? (
          <GameCubeEmulatorView
            game={{
              id: game.id,
              title: game.displayTitle || game.baseName,
              system: game.system,
              romFileName: game.romFileName,
              discs: game.discs,
            }}
          />
        ) : (
          <MobileEmulatorView
            game={{
              id: game.id,
              title: game.displayTitle || game.baseName,
              system: game.system,
              romFileName: game.romFileName,
              discs: game.discs,
            }}
          />
        )}
      </main>
  );
}
