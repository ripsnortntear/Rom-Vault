export type ConsoleSystem = string;

export type MediaCategory =
  | "roms"
  | "artwork_3d"
  | "artwork_front"
  | "box2d"
  | "images"
  | "boxback"
  | "logo"
  | "marquee"
  | "medium_front"
  | "cartridges"
  | "medium_disc"
  | "screenshot"
  | "thumbnails"
  | "screentitle"
  | "titles"
  | "fanart"
  | "fanarts"
  | "manuals"
  | "bezel_day"
  | "bezel_night"
  | "story"
  | "video"
  | "videos";

export type CoverArtStyle =
  | "artwork_front"
  | "artwork_3d"
  | "medium_front"
  | "screentitle"
  | "fanart";

export interface GameMediaUrls {
  rom: string;
  artworkFront: string | null;
  artwork3d: string | null;
  logo: string | null;
  mediumFront: string | null;
  mediumDisc: string | null;
  screenshot: string | null;
  screenTitle: string | null;
  fanart: string | null;
  bezelDay: string | null;
  bezelNight: string | null;
  video: string | null;
  boxback?: string | null;
  manual?: string | null;
  marquee?: string | null;
}

export interface AdditionalDisc {
  discNumber: number;
  fileName: string;
  romUrl: string;
  fileSizeBytes: number;
}

export interface GameItem {
  id: string;
  system: string;
  systemLabel: string;
  systemCompany: string;
  badgeColor: string;
  playable: boolean;
  baseName: string;
  romFileName: string;
  displayTitle: string;
  sortTitle: string;
  firstLetter: string;
  regions: string[];
  tags: string[];
  fileSizeBytes: number;
  story: string;
  media: GameMediaUrls;
  discs?: AdditionalDisc[];
  year?: number | null;
  developer?: string | null;
  publisher?: string | null;
  genres?: string[];
  isDisabled?: boolean;
  preferredCover?: string | null;
  customCoverUrl?: string | null;
}

export interface LibraryStats {
  totalGames: number;
  totalSizeBytes: number;
  regions: Record<string, number>;
  systems: Record<string, number>;
  withVideoCount: number;
  withStoryCount: number;
  scannedAt: string;
}

export interface GameLibraryResponse {
  games: GameItem[];
  stats: LibraryStats;
}
