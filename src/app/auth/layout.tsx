import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "ROM Vault | Unified Single Sign-On Portal",
  description:
    "Unified login and authentication for ROM Vault platform, Forums, Minecraft, Jellyfin, and fleet services.",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <>{children}</>;
}
