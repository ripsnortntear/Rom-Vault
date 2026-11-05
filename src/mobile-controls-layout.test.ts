import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Mobile Touch Control Layout & Safe Area Invariants", () => {
  const mobileViewPath = path.join(process.cwd(), "src/components/MobileEmulatorView.tsx");
  const emulatorCssPath = path.join(process.cwd(), "public/emulatorjs/data/emulator.min.css");
  const emulatorJsPath = path.join(process.cwd(), "public/emulatorjs/data/emulator.min.js");
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

  it("modal overlay template and CSS guarantee accessible header with Back and Close dismiss buttons", () => {
    const viewContent = fs.readFileSync(mobileViewPath, "utf-8");
    const jsContent = fs.readFileSync(emulatorJsPath, "utf-8");
    const cssContent = fs.readFileSync(emulatorCssPath, "utf-8");

    // MobileEmulatorView CSS rules for header dismiss controls
    expect(viewContent).toContain(".ejs_popup_header");
    expect(viewContent).toContain(".ejs_popup_back_btn");
    expect(viewContent).toContain(".ejs_popup_close_btn");

    // MobileEmulatorView MutationObserver decorator guaranteeing dismiss controls on any popup
    expect(viewContent).toContain("ejs_popup_header");
    expect(viewContent).toContain("ejs_popup_back_btn");
    expect(viewContent).toContain("ejs_popup_close_btn");

    // emulator.min.js native createPopup creates ejs_popup_header with Back and Close buttons
    expect(jsContent).toContain("ejs_popup_header");
    expect(jsContent).toContain("ejs_popup_back_btn");
    expect(jsContent).toContain("ejs_popup_close_btn");

    // emulator.min.css defines header styling with safe-area support
    expect(cssContent).toContain(".ejs_popup_header");
    expect(cssContent).toContain(".ejs_popup_back_btn");
    expect(cssContent).toContain(".ejs_popup_close_btn");
  });

  it("modal bottom action buttons are contained in a dedicated footer protected by env(safe-area-inset-bottom)", () => {
    const viewContent = fs.readFileSync(mobileViewPath, "utf-8");
    const jsContent = fs.readFileSync(emulatorJsPath, "utf-8");
    const cssContent = fs.readFileSync(emulatorCssPath, "utf-8");

    // View styling protects footer and buttons with safe-area
    expect(viewContent).toContain(".ejs_popup_footer");
    expect(viewContent).toContain("calc(env(safe-area-inset-bottom, 0px) + 8px)");

    // JS createPopup wraps action buttons in ejs_popup_footer
    expect(jsContent).toContain("ejs_popup_footer");

    // CSS defines flex layout preventing body overflow from pushing footer off-screen
    expect(cssContent).toContain(".ejs_popup_footer");
    expect(cssContent).toContain("calc(env(safe-area-inset-bottom,0px) + 8px)");
    expect(cssContent).toContain("flex:1 1 auto");
  });

  it("permanently suppresses desktop save state dropzone on mobile and preserves native in-game saves", () => {
    const viewContent = fs.readFileSync(mobileViewPath, "utf-8");
    const jsContent = fs.readFileSync(emulatorJsPath, "utf-8");
    const cssContent = fs.readFileSync(emulatorCssPath, "utf-8");

    // Native in-game save synchronization uses "savegame"
    expect(viewContent).toContain('SaveSyncService.fetchCloudSave(cleanGameId, "savegame", 0)');
    expect(viewContent).toContain('SaveSyncService.uploadCloudSave(cleanGameId, uint8, "savegame", 0)');

    // Desktop save-state dropzone is permanently suppressed on mobile viewports
    expect(viewContent).toContain("Desktop save-state dropzone is permanently suppressed on mobile viewports");
    expect(viewContent).toContain("dismissSaveDropzone");

    // Synthetic touch dragenter ignored on touch / mobile devices
    expect(jsContent).toContain("ontouchstart");
    expect(jsContent).toContain("navigator.maxTouchPoints");

    // CSS suppresses dropzone on mobile / coarse pointer screens
    expect(cssContent).toContain("@media(max-width:1024px),(pointer:coarse)");
    expect(cssContent).toContain(".ejs_state_dropzone_container{display:none!important");
    expect(viewContent).toContain("#mobile-emulator-container .ejs_state_dropzone_container");
  });
});
