export type ShoutType = "user" | "release" | "system";

export interface ShoutMessage {
  id: number;
  userId: string | null;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  type: ShoutType;
  gameId: string | null;
  systemId: string | null;
  message: string;
  createdAt: string; // ISO 8601 string
}

export interface PostShoutRequest {
  message: string;
  guestName?: string;
}
