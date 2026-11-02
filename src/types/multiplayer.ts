export type RoomStatus = "waiting" | "ready" | "playing" | "closed";

export type ParticipantRole = "host" | "guest";

export interface MultiplayerParticipant {
  id: string;
  username: string;
  displayName: string;
  role: ParticipantRole;
  isReady: boolean;
  controllerPort: 1 | 2;
  joinedAt: string;
  lastSeenAt: string;
}

export interface RoomChatMessage {
  id: number;
  roomId: string;
  senderId: string;
  senderName: string;
  senderRole: "host" | "guest" | "system";
  message: string;
  createdAt: string;
}

export type SignalMessageType =
  | "webrtc-offer"
  | "webrtc-answer"
  | "webrtc-ice"
  | "p2-input"
  | "frame-sync"
  | "session-state";

export interface MultiplayerSignal {
  id: number;
  roomId: string;
  senderId: string;
  targetRole: "host" | "guest";
  type: SignalMessageType;
  payload: string;
  createdAt: string;
}

export interface MultiplayerRoom {
  id: string;
  name: string;
  systemId: string;
  emulatorCore: string;
  gameId: string | null;
  gameTitle: string | null;
  gameFileName: string | null;
  gameCoverUrl: string | null;
  status: RoomStatus;
  host: MultiplayerParticipant;
  guest: MultiplayerParticipant | null;
  canStart: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Standard Libretro / EmulatorJS button index mapping for Port 0 (P1) and Port 1 (P2):
 * 0: B / Cross (BUTTON_2)
 * 1: Y / Square (BUTTON_4)
 * 2: Select (SELECT)
 * 3: Start (START)
 * 4: D-Pad Up (DPAD_UP)
 * 5: D-Pad Down (DPAD_DOWN)
 * 6: D-Pad Left (DPAD_LEFT)
 * 7: D-Pad Right (DPAD_RIGHT)
 * 8: A / Circle (BUTTON_1)
 * 9: X / Triangle (BUTTON_3)
 * 10: L1 (LEFT_TOP_SHOULDER)
 * 11: R1 (RIGHT_TOP_SHOULDER)
 * 12: L2 (LEFT_BOTTOM_SHOULDER)
 * 13: R2 (RIGHT_BOTTOM_SHOULDER)
 */
export interface ControllerInputEvent {
  buttonIndex: number;
  buttonName: string;
  pressed: boolean;
  value: number;
  timestamp: number;
}
