export type UserRole = "user" | "admin";
export type AccountStatus = "pending" | "pending_approval" | "active" | "suspended" | "denied";
export type TokenType = "session" | "email_verification" | "password_reset";

export interface User {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  role: UserRole;
  account_status: AccountStatus;
  failed_login_attempts: number;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserPreferences {
  theme?: "dark" | "retro" | "cyberpunk";
  defaultArtworkStyle?: "artwork_front" | "artwork_box" | "artwork_cartridge" | "screenshot";
  defaultConsole?: string;
  soundEffects?: boolean;
}

export interface UserProfile {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  preferences: UserPreferences | null;
  favorites: string[];
  download_quota_daily: number;
  download_count_today: number;
  last_download_reset: string;
  download_history: Array<{
    gameId: string;
    gameTitle: string;
    system: string;
    downloadedAt: string;
  }>;
  created_at: string;
  updated_at: string;
}

export interface AuthSession {
  user: {
    id: string;
    username: string;
    email: string;
    role: UserRole;
    account_status: AccountStatus;
    displayName: string | null;
    avatarUrl: string | null;
    quotaDaily: number | null;
    quotaUsedToday: number;
  };
  expiresAt: string;
}

export interface UserMemoryCard {
  id: string;
  user_id: string;
  system?: "psx" | "ps2" | string;
  slot_index: number; // 1 to 5
  card_name: string;
  file_path: string;
  size_bytes: number;
  checksum: string;
  version: number;
  created_at: string;
  updated_at: string;
}
