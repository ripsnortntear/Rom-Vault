import "server-only";

import { notFound } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { getGameById } from "@/lib/scanner";
import { MobileEmulatorView } from "@/components/MobileEmulatorView";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export async function generateMetadata(
  props: PageProps<"/play/[id]">
): Promise<Metadata> {
  const { id } = await props.params;
  const game = await getGameById(id);
  if (!game) return { title: "Game Not Found | ROM Vault" };
  return {
    title: `Playing ${game.displayTitle || game.baseName} | ROM Vault`,
  };
}

export default async function PlayPage(props: PageProps<"/play/[id]">) {
  const { id } = await props.params;
  const game = await getGameById(id);

  if (!game) {
    notFound();
  }

  return (
    <main className="fixed inset-0 bg-black flex flex-col justify-center items-center overflow-hidden">
      <MobileEmulatorView
        game={{
          id: game.id,
          title: game.displayTitle,
          system: game.system,
          romFileName: game.romFileName,
          discs: game.discs,
        }}
      />
    </main>
  );
}
