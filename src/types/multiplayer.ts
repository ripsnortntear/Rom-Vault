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
  | "session-state"
  | "link-packet"
  | "link-cable-ready";

export type MultiplayerMode = "couch" | "link-cable";

export interface LinkCablePacket {
  kind: number; // 1 = master byte, 2 = slave reply byte
  data: number; // 8-bit byte value (0-255)
  fast: number; // CGB double-speed flag (0 or 1)
  timestamp?: number;
}

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
  mode?: MultiplayerMode;
  gameId: string | null;
  gameTitle: string | null;
  gameFileName: string | null;
  gameCoverUrl: string | null;
  guestSystemId?: string | null;
  guestGameId?: string | null;
  guestGameTitle?: string | null;
  guestGameFileName?: string | null;
  guestGameCoverUrl?: string | null;
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

export interface SupportedMultiplayerSystem {
  id: string;
  label: string;
  core: string;
}

/**
 * Supported initial console emulator cores for 2-player multiplayer rooms.
 * Dreamcast (flycast) and Sega Saturn (yabause/kronos) are explicitly removed and unsupported for 2P netplay rooms.
 */
export const SUPPORTED_MULTIPLAYER_SYSTEMS: ReadonlyArray<SupportedMultiplayerSystem> = [
  { id: "snes", label: "Super Nintendo (SNES)", core: "snes9x (Libretro)" },
  { id: "nes", label: "Nintendo Entertainment System (NES)", core: "fceumm (Libretro)" },
  { id: "genesis", label: "Sega Genesis / Mega Drive", core: "genesis_plus_gx (Libretro)" },
  { id: "n64", label: "Nintendo 64 (N64)", core: "mupen64plus_next (Libretro)" },
  { id: "psx", label: "Sony PlayStation (PS1)", core: "pcsx_rearmed (Libretro)" },
  { id: "gba", label: "Game Boy Advance (GBA)", core: "mgba (Libretro)" },
  { id: "gbc", label: "Game Boy Color (GBC)", core: "gambatte (Libretro)" },
  { id: "gb", label: "Game Boy (GB)", core: "gambatte (Libretro)" },
  { id: "sms", label: "Sega Master System", core: "smsplus (Libretro)" },
  { id: "sega32x", label: "Sega 32X", core: "picodrive (Libretro)" },
];

export const UNSUPPORTED_MULTIPLAYER_SYSTEMS = ["dreamcast", "saturn"] as const;

export function isSupportedMultiplayerSystem(systemId: string | null | undefined): boolean {
  if (!systemId) return false;
  const norm = systemId.toLowerCase().trim();
  if (norm === "dreamcast" || norm === "saturn") return false;
  return SUPPORTED_MULTIPLAYER_SYSTEMS.some((sys) => sys.id === norm);
}

/**
 * Game Boy handheld systems (GB, GBC, GBA) utilize the Virtual Link Cable protocol
 * allowing two separate handheld emulator instances (each with their own ROM and save file)
 * to communicate over WebRTC serial link cable packets.
 */
export function isLinkCableSystem(systemId: string | null | undefined): boolean {
  if (!systemId) return false;
  const norm = systemId.toLowerCase().trim();
  return norm === "gb" || norm === "gbc" || norm === "gba";
}

/**
 * Returns allowed link cable systems for a guest given the host's system.
 * Game Boy (gb) and Game Boy Color (gbc) can cross-link.
 * Game Boy Advance (gba) links with Game Boy Advance (gba).
 */
export function getLinkCableAllowedSystems(hostSystemId: string | null | undefined): string[] {
  if (!hostSystemId) return [];
  const norm = hostSystemId.toLowerCase().trim();
  if (norm === "gb" || norm === "gbc") {
    return ["gb", "gbc"];
  }
  if (norm === "gba") {
    return ["gba"];
  }
  return [];
}

export function getMultiplayerModeForSystem(systemId: string | null | undefined): MultiplayerMode {
  return isLinkCableSystem(systemId) ? "link-cable" : "couch";
}
