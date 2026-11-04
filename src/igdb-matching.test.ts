import { describe, it, expect } from "vitest";
import {
  normalizeForMatch,
  extractSequelNumber,
  findBestIgdbMatch,
  cleanTitleForSearch,
} from "./lib/igdb";

describe("IGDB Matching & Sequel Collision Prevention", () => {
  it("normalizes titles and Roman numerals accurately", () => {
    expect(normalizeForMatch("Dark Cloud 2")).toBe("dark cloud 2");
    expect(normalizeForMatch("Dark Cloud II")).toBe("dark cloud 2");
    expect(normalizeForMatch("Final Fantasy VII")).toBe("final fantasy 7");
    expect(normalizeForMatch("Street Fighter II: Champion Edition")).toBe("street fighter 2 champion edition");
    expect(normalizeForMatch("Red Faction II (USA)")).toBe("red faction 2");
  });

  it("extracts sequel numbers correctly without confusing unnumbered prequels", () => {
    expect(extractSequelNumber(normalizeForMatch("Dark Cloud"))).toBeNull();
    expect(extractSequelNumber(normalizeForMatch("Dark Cloud 2"))).toBe("2");
    expect(extractSequelNumber(normalizeForMatch("Dark Cloud II"))).toBe("2");
    expect(extractSequelNumber(normalizeForMatch("Devil May Cry 3"))).toBe("3");
    expect(extractSequelNumber(normalizeForMatch("Mega Man X2"))).toBe("2");
    expect(extractSequelNumber(normalizeForMatch("Mega Man X"))).toBeNull();
  });

  it("strictly separates prequels from sequels when matching candidates", () => {
    const candidates = [
      { id: 1215, name: "Dark Cloud 2", platforms: [8], cover: { image_id: "co2zhm" }, category: 0 },
      { id: 1214, name: "Dark Cloud", platforms: [8], cover: { image_id: "cod3ga" }, category: 0 },
    ];

    // Searching for "Dark Cloud" must NOT match "Dark Cloud 2" even if it appears first
    const match1 = findBestIgdbMatch(candidates, "Dark Cloud", 8);
    expect(match1).toBeDefined();
    expect(match1.id).toBe(1214);
    expect(match1.name).toBe("Dark Cloud");

    // Searching for "Dark Cloud 2" must match "Dark Cloud 2"
    const match2 = findBestIgdbMatch(candidates, "Dark Cloud 2", 8);
    expect(match2).toBeDefined();
    expect(match2.id).toBe(1215);
    expect(match2.name).toBe("Dark Cloud 2");
  });

  it("matches Roman numeral sequels to Arabic numeral candidates and vice versa", () => {
    const candidates = [
      { id: 4083, name: "Red Faction II", platforms: [8], cover: { image_id: "co3yd5" }, category: 0 },
      { id: 6273, name: "Red Faction", platforms: [8], cover: { image_id: "co48x2" }, category: 0 },
    ];

    const matchPrequel = findBestIgdbMatch(candidates, "Red Faction", 8);
    expect(matchPrequel.id).toBe(6273);

    const matchSequel = findBestIgdbMatch(candidates, "Red Faction 2", 8);
    expect(matchSequel.id).toBe(4083);
  });

  it("handles subtitle extensions when sequel number matches", () => {
    const candidates = [
      {
        id: 136,
        name: "Devil May Cry 3: Dante's Awakening",
        platforms: [8],
        cover: { image_id: "co3dit" },
        category: 0,
      },
      {
        id: 135,
        name: "Devil May Cry 2",
        platforms: [8],
        cover: { image_id: "co3diu" },
        category: 0,
      },
    ];

    const match = findBestIgdbMatch(candidates, "Devil May Cry 3", 8);
    expect(match).toBeDefined();
    expect(match.id).toBe(136);
  });

  it("returns null when no confident match exists rather than picking arbitrary fallback", () => {
    const candidates = [
      { id: 9999, name: "Totally Unrelated Game", platforms: [8], cover: { image_id: "random" }, category: 0 },
    ];

    const match = findBestIgdbMatch(candidates, "Dark Cloud", 8);
    expect(match).toBeNull();
  });
});
