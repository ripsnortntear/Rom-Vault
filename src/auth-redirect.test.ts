import { describe, it, expect } from "vitest";
import { getSafeRedirectUrl } from "./lib/auth/redirect";

describe("OldsmarChaos SSO Redirect Flow & Safety Suite", () => {
  it("defaults to portal root '/' when no redirect parameter is provided", () => {
    expect(getSafeRedirectUrl(null)).toBe("/");
    expect(getSafeRedirectUrl(undefined)).toBe("/");
    expect(getSafeRedirectUrl("")).toBe("/");
  });

  it("returns portal root '/' when redirect is an auth route to prevent redirect loops", () => {
    expect(getSafeRedirectUrl("/auth")).toBe("/");
    expect(getSafeRedirectUrl("/auth/login")).toBe("/");
    expect(getSafeRedirectUrl("/roms/auth/login")).toBe("/");
    expect(getSafeRedirectUrl("/roms/auth/register")).toBe("/");
    expect(getSafeRedirectUrl("/roms/auth/reset-password")).toBe("/");
  });

  it("preserves intentional relative redirects to fleet services and portal pages", () => {
    expect(getSafeRedirectUrl("/")).toBe("/");
    expect(getSafeRedirectUrl("%2F")).toBe("/");
    expect(getSafeRedirectUrl("/roms")).toBe("/roms");
    expect(getSafeRedirectUrl("/charm")).toBe("/charm");
    expect(getSafeRedirectUrl("/operations")).toBe("/operations");
    expect(getSafeRedirectUrl("/jellyfin")).toBe("/jellyfin");
    expect(getSafeRedirectUrl("/tor/")).toBe("/tor/");
    expect(getSafeRedirectUrl("/tools")).toBe("/tools");
    expect(getSafeRedirectUrl("/minecraft")).toBe("/minecraft");
    expect(getSafeRedirectUrl("/roms/play/snes__Super_Mario")).toBe("/roms/play/snes__Super_Mario");
  });

  it("handles encoded query parameters properly", () => {
    expect(getSafeRedirectUrl("%2Froms%2Fplay%2Fzelda")).toBe("/roms/play/zelda");
    expect(getSafeRedirectUrl("%2Fcharm%3Fquery%3Dford")).toBe("/charm?query=ford");
  });

  it("extracts relative paths from authorized absolute URLs (e.g. from Nginx auth gateways)", () => {
    expect(getSafeRedirectUrl("https://www.oldsmarchaos.com/")).toBe("/");
    expect(getSafeRedirectUrl("https://oldsmarchaos.com/charm")).toBe("/charm");
    expect(getSafeRedirectUrl("https://www.oldsmarchaos.com/operations?filter=all")).toBe("/operations?filter=all");
    expect(getSafeRedirectUrl("http://localhost:3000/tools")).toBe("/tools");
  });

  it("blocks open redirects and protocol-relative attacks", () => {
    expect(getSafeRedirectUrl("//evil.com")).toBe("/");
    expect(getSafeRedirectUrl("//evil.com/phish")).toBe("/");
    expect(getSafeRedirectUrl("https://evil.com/attacker")).toBe("/");
    expect(getSafeRedirectUrl("https://attacker.oldsmarchaos.com.fake/")).toBe("/");
    expect(getSafeRedirectUrl("javascript:alert(1)")).toBe("/");
    expect(getSafeRedirectUrl("data:text/html,attack")).toBe("/");
  });
});
