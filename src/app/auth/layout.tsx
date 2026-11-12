import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "OldsmarChaos | Unified Single Sign-On Portal",
  description:
    "Unified login and authentication for OldsmarChaos platform, ROM Vault, Forums, Minecraft, Jellyfin, and fleet services.",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <>{children}</>;
}
