export interface GameRating {
  id: number;
  userId: string;
  gameId: string;
  rating: number; // 1 to 5
  createdAt: string;
  updatedAt: string;
}

export interface GameCommentAuthor {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: "user" | "admin";
}

export interface GameComment {
  id: number;
  userId: string;
  gameId: string;
  content: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  author: GameCommentAuthor;
}

export interface GameHighScoreUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface GameHighScore {
  id: number;
  userId: string;
  gameId: string;
  system: string;
  score: number;
  proofUrl: string | null;
  metadataJson: Record<string, unknown> | null;
  isVerified: boolean;
  createdAt: string;
  user: GameHighScoreUser;
  gameTitle?: string;
}

export interface GameSocialStats {
  averageRating: number;
  totalRatings: number;
  userRating: number | null;
  commentsCount: number;
  recentComments: GameComment[];
  topScores: GameHighScore[];
}

export interface AuditLogItem {
  id: number;
  adminId: string | null;
  adminUsername?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  detailsJson: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AdminUserSeedboxInfo {
  id: string;
  port: number;
  status: "active" | "stopped" | "error";
  quotaGb: number;
  createdAt: string;
}

export interface AdminUserListItem {
  id: string;
  username: string;
  email: string;
  role: "user" | "admin";
  accountStatus: "pending" | "pending_approval" | "active" | "suspended" | "denied";
  downloadQuotaDaily: number;
  downloadCountToday: number;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
  displayName: string | null;
  avatarUrl: string | null;
  seedbox?: AdminUserSeedboxInfo | null;
}

export interface AdminStorageHealth {
  romStorage: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    percentUsed: number;
  };
  saveStorage: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    percentUsed: number;
  };
  activeSessionsCount: number;
  totalUsersCount: number;
  totalScoresCount: number;
  totalCommentsCount: number;
  totalRatingsCount: number;
}
