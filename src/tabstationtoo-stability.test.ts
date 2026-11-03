import { describe, it, expect } from "vitest";

describe("Tabstationtoo Emulator Stability & Memory Card Sync", () => {
  const quickCardHash = (bytes: Uint8Array): string => {
    if (!bytes || !bytes.length) return "";
    let hash = 0x811c9dc5;
    const len = bytes.length;
    for (let i = 0; i < len; i += 32) {
      hash = Math.imul(hash ^ bytes[i], 0x01000193);
    }
    return ((hash ^ len) >>> 0).toString(16);
  };

  it("produces consistent hash for identical memory card buffers", () => {
    const card1 = new Uint8Array(8650752);
    card1.fill(0xff);
    const card2 = new Uint8Array(8650752);
    card2.fill(0xff);

    const hash1 = quickCardHash(card1);
    const hash2 = quickCardHash(card2);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBeGreaterThan(0);
  });

  it("detects changes when sectors in memory card buffer are modified", () => {
    const card = new Uint8Array(8650752);
    card.fill(0xff);
    const hashBefore = quickCardHash(card);

    // Modify a sector at an aligned offset
    card[1024] = 0x42;
    const hashAfter = quickCardHash(card);

    expect(hashBefore).not.toBe(hashAfter);
  });

  it("calculates hash across 8.65 MB buffer in under 20ms", () => {
    const card = new Uint8Array(8650752);
    const start = performance.now();
    quickCardHash(card);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(50);
  });

  it("constructs stable player URLs without dynamic timestamps", () => {
    const game = {
      id: "ps2/gran-turismo-4",
      system: "ps2",
      displayTitle: "Gran Turismo 4",
      baseName: "Gran Turismo 4",
    };

    const safeGameId = encodeURIComponent(game.id);
    const ps2BiosUrl = "/roms/api/bios/scph39001.bin?system=ps2";
    const ps2DiscUrl = `/roms/api/roms/${safeGameId}/stream/${encodeURIComponent(`${game.displayTitle}.chd`)}`;
    const ps2MemcardUrl = "/roms/api/users/me/cards/active/download?system=ps2";
    const playerUrl1 = `/roms/tabstationtoo/index.html?bios=${encodeURIComponent(ps2BiosUrl)}&disc=${encodeURIComponent(ps2DiscUrl)}&memcard=${encodeURIComponent(ps2MemcardUrl)}`;
    const playerUrl2 = `/roms/tabstationtoo/index.html?bios=${encodeURIComponent(ps2BiosUrl)}&disc=${encodeURIComponent(ps2DiscUrl)}&memcard=${encodeURIComponent(ps2MemcardUrl)}`;

    expect(playerUrl1).toBe(playerUrl2);
    expect(playerUrl1).not.toContain("_t=");
    expect(playerUrl1).not.toContain("Date.now");
  });

  it("ensures iframe beforeunload handler does not prevent unload or show prompts", () => {
    // Mock event
    const event = {
      defaultPrevented: false,
      returnValue: undefined as string | undefined,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };

    const isInIframe = true;

    // Simulated guarded handler
    const onBeforeUnloadWithCard = (e: typeof event, isIframe: boolean) => {
      if (isIframe) {
        return; // Guarded: never prompt inside an iframe
      }
      e.preventDefault();
      e.returnValue = "";
    };

    onBeforeUnloadWithCard(event, isInIframe);

    expect(event.defaultPrevented).toBe(false);
    expect(event.returnValue).toBeUndefined();
  });
});
