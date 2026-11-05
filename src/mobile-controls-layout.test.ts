import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Mobile Touch Control Layout & Safe Area Invariants", () => {
  const mobileViewPath = path.join(process.cwd(), "src/components/MobileEmulatorView.tsx");
  const emulatorCssPath = path.join(process.cwd(), "public/emulatorjs/data/emulator.min.css");
  const multiplayerModalPath = path.join(process.cwd(), "src/components/MultiplayerModal.tsx");

  it("MobileEmulatorView defines responsive bottom offset lifting controls 500px-750px (device equivalent) above gesture deck", () => {
    const content = fs.readFileSync(mobileViewPath, "utf-8");

    // CSS variable specifying safe area inset + clamp(180px, 24vh, 260px)
    expect(content).toContain("--ejs-virtual-pad-bottom-offset: calc(env(safe-area-inset-bottom, 0px) + clamp(180px, 24vh, 260px));");

    // Landscape media query adjusting offset for pillarboxed landscape screens
    expect(content).toContain("@media (orientation: landscape)");
    expect(content).toContain("--ejs-virtual-pad-bottom-offset: calc(env(safe-area-inset-bottom, 0px) + 24px);");
  });

  it("MobileEmulatorView constrains portrait canvas parent to upper viewport to prevent overlap with lifted controls", () => {
    const content = fs.readFileSync(mobileViewPath, "utf-8");

    // Portrait media query constraining canvas parent bottom
    expect(content).toContain("@media (orientation: portrait)");
    expect(content).toContain("bottom: calc(var(--ejs-virtual-pad-bottom-offset) + 140px) !important;");
    expect(content).toContain("max-width: 100% !important;");
    expect(content).toContain("max-height: 100% !important;");
    expect(content).toContain("object-fit: contain !important;");
  });

  it("MobileEmulatorView ensures symmetrical horizontal alignment and baseline for D-Pad and action buttons", () => {
    const content = fs.readFileSync(mobileViewPath, "utf-8");

    // Parent container uses the variable and pointer-events isolation
    expect(content).toContain("bottom: var(--ejs-virtual-pad-bottom-offset) !important;");
    expect(content).toContain("pointer-events: none !important;");
    expect(content).toContain("pointer-events: auto !important;");

    // Left controls (D-Pad & Analog Stick)
    expect(content).toContain("left: max(16px, env(safe-area-inset-left, 0px)) !important;");

    // Right controls (Action Buttons)
    expect(content).toContain("right: max(16px, env(safe-area-inset-right, 0px)) !important;");

    // Symmetrical vertical baseline (bottom: 0 relative to parent)
    expect(content).toContain(".ejs_virtualGamepad_left");
    expect(content).toContain(".ejs_virtualGamepad_right");
  });

  it("emulator.min.css contains root CSS variable and lifted virtualGamepad_parent positioning", () => {
    const css = fs.readFileSync(emulatorCssPath, "utf-8");

    expect(css).toContain("--ejs-virtual-pad-bottom-offset");
    expect(css).toContain("var(--ejs-virtual-pad-bottom-offset");
    expect(css).toContain("left:max(16px,env(safe-area-inset-left,0px))");
    expect(css).toContain("right:max(16px,env(safe-area-inset-right,0px))");
  });

  it("MultiplayerModal P2 controller deck applies safe-area bottom padding to prevent gesture collisions", () => {
    const content = fs.readFileSync(multiplayerModalPath, "utf-8");

    expect(content).toContain("pb-[calc(env(safe-area-inset-bottom,0px)+12px)]");
  });
});
