import { describe, it, expect } from "vitest";
import { detectBrowserEnvironment } from "./hooks/useBrowserEnvironment";

describe("detectBrowserEnvironment", () => {
  const edgeDesktopUA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
  const chromeDesktopUA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const firefoxDesktopUA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0";
  const mobileUA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

  it("identifies mobile devices correctly regardless of browser", () => {
    const res = detectBrowserEnvironment(mobileUA, 390, true, true);
    expect(res.isMobile).toBe(true);
    expect(res.state).toBe("mobile");
  });

  it("detects edge_ready when on Edge with COOP/COEP active", () => {
    const res = detectBrowserEnvironment(edgeDesktopUA, 1920, false, true);
    expect(res.isMobile).toBe(false);
    expect(res.isEdge).toBe(true);
    expect(res.hasCOOP_COEP).toBe(true);
    expect(res.state).toBe("edge_ready");
  });

  it("detects edge_no_coop when on Edge without COOP/COEP", () => {
    const res = detectBrowserEnvironment(edgeDesktopUA, 1920, false, false);
    expect(res.isMobile).toBe(false);
    expect(res.isEdge).toBe(true);
    expect(res.hasCOOP_COEP).toBe(false);
    expect(res.state).toBe("edge_no_coop");
  });

  it("detects other_with_coop when on Chrome/Firefox with COOP/COEP active", () => {
    const res = detectBrowserEnvironment(chromeDesktopUA, 1920, false, true);
    expect(res.isMobile).toBe(false);
    expect(res.isEdge).toBe(false);
    expect(res.hasCOOP_COEP).toBe(true);
    expect(res.state).toBe("other_with_coop");
  });

  it("detects other_no_coop when on Chrome/Firefox without COOP/COEP", () => {
    const res = detectBrowserEnvironment(firefoxDesktopUA, 1920, false, false);
    expect(res.isMobile).toBe(false);
    expect(res.isEdge).toBe(false);
    expect(res.hasCOOP_COEP).toBe(false);
    expect(res.state).toBe("other_no_coop");
  });
});
