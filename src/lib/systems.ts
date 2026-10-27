export interface SystemMeta {
  id: string;
  name: string;
  shortLabel: string;
  company: "Nintendo" | "Sega" | "Sony" | "Other";
  badgeColor: string;
  colorHex: string;
  ejsCore: string | null;
  playable: boolean;
  romExtensions: string[];
}

export const KNOWN_SYSTEMS: Record<string, SystemMeta> = {
  nes: {
    id: "nes",
    name: "Nintendo Entertainment System",
    shortLabel: "NES",
    company: "Nintendo",
    badgeColor: "bg-red-600",
    colorHex: "#e60012",
    ejsCore: "nes",
    playable: true,
    romExtensions: [".nes", ".zip"],
  },
  snes: {
    id: "snes",
    name: "Super Nintendo Entertainment System",
    shortLabel: "SNES",
    company: "Nintendo",
    badgeColor: "bg-purple-600",
    colorHex: "#7c3aed",
    ejsCore: "snes",
    playable: true,
    romExtensions: [".sfc", ".smc", ".fig", ".swc", ".zip"],
  },
  n64: {
    id: "n64",
    name: "Nintendo 64",
    shortLabel: "N64",
    company: "Nintendo",
    badgeColor: "bg-emerald-600",
    colorHex: "#059669",
    ejsCore: "n64",
    playable: true,
    romExtensions: [".z64", ".n64", ".v64", ".zip"],
  },
  gba: {
    id: "gba",
    name: "Game Boy Advance",
    shortLabel: "GBA",
    company: "Nintendo",
    badgeColor: "bg-indigo-600",
    colorHex: "#4f46e5",
    ejsCore: "gba",
    playable: true,
    romExtensions: [".gba", ".zip"],
  },
  gb: {
    id: "gb",
    name: "Game Boy",
    shortLabel: "GB",
    company: "Nintendo",
    badgeColor: "bg-amber-600",
    colorHex: "#d97706",
    ejsCore: "gb",
    playable: true,
    romExtensions: [".gb", ".zip"],
  },
  gbc: {
    id: "gbc",
    name: "Game Boy Color",
    shortLabel: "GBC",
    company: "Nintendo",
    badgeColor: "bg-teal-600",
    colorHex: "#0d9488",
    ejsCore: "gb",
    playable: true,
    romExtensions: [".gbc", ".zip"],
  },
  sgb: {
    id: "sgb",
    name: "Super Game Boy",
    shortLabel: "SGB",
    company: "Nintendo",
    badgeColor: "bg-yellow-600",
    colorHex: "#ca8a04",
    ejsCore: "gb",
    playable: true,
    romExtensions: [".gb", ".sgb", ".zip"],
  },
  gamecube: {
    id: "gamecube",
    name: "Nintendo GameCube",
    shortLabel: "GameCube",
    company: "Nintendo",
    badgeColor: "bg-violet-700",
    colorHex: "#6d28d9",
    ejsCore: null,
    playable: false,
    romExtensions: [".rvz", ".iso", ".gcm"],
  },
  genesis: {
    id: "genesis",
    name: "Sega Genesis / Mega Drive",
    shortLabel: "Genesis",
    company: "Sega",
    badgeColor: "bg-blue-600",
    colorHex: "#2563eb",
    ejsCore: "segaMD",
    playable: true,
    romExtensions: [".md", ".gen", ".smd", ".bin", ".zip"],
  },
  sega32x: {
    id: "sega32x",
    name: "Sega 32X",
    shortLabel: "Sega 32X",
    company: "Sega",
    badgeColor: "bg-cyan-600",
    colorHex: "#0891b2",
    ejsCore: "sega32x",
    playable: true,
    romExtensions: [".32x", ".bin", ".zip"],
  },
  sms: {
    id: "sms",
    name: "Sega Master System",
    shortLabel: "Master System",
    company: "Sega",
    badgeColor: "bg-sky-600",
    colorHex: "#0284c7",
    ejsCore: "segaMS",
    playable: true,
    romExtensions: [".sms", ".bin", ".zip"],
  },
  sgg: {
    id: "sgg",
    name: "Sega Game Gear",
    shortLabel: "Game Gear",
    company: "Sega",
    badgeColor: "bg-blue-800",
    colorHex: "#1e40af",
    ejsCore: "segaGG",
    playable: true,
    romExtensions: [".gg", ".bin", ".zip"],
  },
  saturn: {
    id: "saturn",
    name: "Sega Saturn",
    shortLabel: "Saturn",
    company: "Sega",
    badgeColor: "bg-orange-600",
    colorHex: "#ea580c",
    ejsCore: "segaSaturn",
    playable: true,
    romExtensions: [".chd", ".iso", ".cue", ".bin"],
  },
  dreamcast: {
    id: "dreamcast",
    name: "Sega Dreamcast",
    shortLabel: "Dreamcast",
    company: "Sega",
    badgeColor: "bg-rose-600",
    colorHex: "#e11d48",
    ejsCore: null,
    playable: false,
    romExtensions: [".chd", ".gdi", ".cdi"],
  },
  psx: {
    id: "psx",
    name: "Sony PlayStation",
    shortLabel: "PS1",
    company: "Sony",
    badgeColor: "bg-blue-600",
    colorHex: "#003791",
    ejsCore: "psx",
    playable: true,
    romExtensions: [".zip", ".chd", ".bin", ".cue", ".iso", ".pbp", ".img"],
  },
  ps2: {
    id: "ps2",
    name: "Sony PlayStation 2",
    shortLabel: "PS2",
    company: "Sony",
    badgeColor: "bg-blue-950",
    colorHex: "#00205b",
    ejsCore: "ps2",
    playable: true,
    romExtensions: [".zip", ".iso", ".chd", ".cso", ".bin", ".gz"],
  },
};

export function getSystemMeta(systemId: string): SystemMeta {
  const normalized = normalizeSystem(systemId);
  if (KNOWN_SYSTEMS[normalized]) {
    return KNOWN_SYSTEMS[normalized];
  }

  return {
    id: normalized,
    name: normalized.toUpperCase(),
    shortLabel: normalized.toUpperCase(),
    company: "Other",
    badgeColor: "bg-zinc-700",
    colorHex: "#71717a",
    ejsCore: null,
    playable: false,
    romExtensions: [".zip", ".chd", ".bin", ".iso"],
  };
}

export function normalizeSystem(system: string | null | undefined): string {
  if (!system) return "nes";
  const lower = system.trim().toLowerCase();
  if (lower === "nintendo") return "nes";
  if (lower === "ps1" || lower === "playstation") return "psx";
  if (lower === "playstation2") return "ps2";
  return lower;
}

export function toCleanSlug(fileName: string, system = "nes"): string {
  const cleaned = fileName
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const meta = getSystemMeta(system);
  const primaryExt = meta.romExtensions.find((ext) => ext !== ".zip")?.replace(/^\./, "") || "rom";
  return `${cleaned || "game"}.${primaryExt}`;
}
