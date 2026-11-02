import type { ControllerInputEvent } from "@/types/multiplayer";

export interface GamepadLike {
  index: number;
  id: string;
  connected: boolean;
  mapping?: string;
  buttons: ReadonlyArray<{ pressed: boolean; value: number }>;
  axes: ReadonlyArray<number>;
}

export const XBOX_TO_LIBRETRO_BUTTON_MAP: ReadonlyArray<{
  xboxButtonIndex: number;
  xboxLabel: string;
  libretroIndex: number;
  libretroLabel: string;
}> = [
  { xboxButtonIndex: 0, xboxLabel: "Xbox A", libretroIndex: 0, libretroLabel: "B / Cross" },
  { xboxButtonIndex: 1, xboxLabel: "Xbox B", libretroIndex: 8, libretroLabel: "A / Circle" },
  { xboxButtonIndex: 2, xboxLabel: "Xbox X", libretroIndex: 1, libretroLabel: "Y / Square" },
  { xboxButtonIndex: 3, xboxLabel: "Xbox Y", libretroIndex: 9, libretroLabel: "X / Triangle" },
  { xboxButtonIndex: 4, xboxLabel: "Xbox LB", libretroIndex: 10, libretroLabel: "L1" },
  { xboxButtonIndex: 5, xboxLabel: "Xbox RB", libretroIndex: 11, libretroLabel: "R1" },
  { xboxButtonIndex: 6, xboxLabel: "Xbox LT", libretroIndex: 12, libretroLabel: "L2" },
  { xboxButtonIndex: 7, xboxLabel: "Xbox RT", libretroIndex: 13, libretroLabel: "R2" },
  { xboxButtonIndex: 8, xboxLabel: "Xbox View", libretroIndex: 2, libretroLabel: "SELECT" },
  { xboxButtonIndex: 9, xboxLabel: "Xbox Menu", libretroIndex: 3, libretroLabel: "START" },
  { xboxButtonIndex: 12, xboxLabel: "Xbox D-Pad Up", libretroIndex: 4, libretroLabel: "DPAD_UP" },
  { xboxButtonIndex: 13, xboxLabel: "Xbox D-Pad Down", libretroIndex: 5, libretroLabel: "DPAD_DOWN" },
  { xboxButtonIndex: 14, xboxLabel: "Xbox D-Pad Left", libretroIndex: 6, libretroLabel: "DPAD_LEFT" },
  { xboxButtonIndex: 15, xboxLabel: "Xbox D-Pad Right", libretroIndex: 7, libretroLabel: "DPAD_RIGHT" },
];

export const ANALOG_DEADZONE = 0.4;

/**
 * Selects the appropriate physical Bluetooth Xbox controller for Player 1 (host) or Player 2 (guest).
 * When two controllers are connected to the same local test workstation:
 * - Player 1 (host) maps to Controller #1 (connectedPads[0])
 * - Player 2 (guest) maps to Controller #2 (connectedPads[1]), or falls back to connectedPads[0] if only 1 pad is present in that context.
 */
export function selectGamepadForRole(
  pads: ReadonlyArray<GamepadLike | null | undefined>,
  role: "host" | "guest",
  preferredIndex?: number | null
): GamepadLike | null {
  const connected = Array.from(pads || []).filter(
    (p): p is GamepadLike => Boolean(p && p.connected)
  );
  if (connected.length === 0) return null;

  if (typeof preferredIndex === "number") {
    const explicit = connected.find((p) => p.index === preferredIndex);
    if (explicit) return explicit;
  }

  if (role === "host") {
    return connected[0] ?? null;
  }

  // Guest (Player 2): prefer second physical controller when two are paired to the workstation
  if (connected.length >= 2) {
    return connected[1] ?? connected[0] ?? null;
  }

  return connected[0] ?? null;
}

/**
 * Computes the complete active Libretro button state (indices 0..13) from a physical Xbox controller,
 * combining both digital D-Pad/face buttons and Left Analog Thumbstick axes.
 */
export function extractLibretroStateFromGamepad(
  pad: GamepadLike | null | undefined
): Record<number, boolean> {
  const state: Record<number, boolean> = {};
  if (!pad || !pad.connected) return state;

  for (const mapping of XBOX_TO_LIBRETRO_BUTTON_MAP) {
    const btn = pad.buttons[mapping.xboxButtonIndex];
    const isPressed = Boolean(btn && (btn.pressed || btn.value > 0.5));
    if (isPressed) {
      state[mapping.libretroIndex] = true;
    }
  }

  // Combine Left Analog Stick (axes[0] = X, axes[1] = Y) with D-Pad (4=Up, 5=Down, 6=Left, 7=Right)
  const axisX = pad.axes?.[0] ?? 0;
  const axisY = pad.axes?.[1] ?? 0;

  if (axisY < -ANALOG_DEADZONE) state[4] = true;
  if (axisY > ANALOG_DEADZONE) state[5] = true;
  if (axisX < -ANALOG_DEADZONE) state[6] = true;
  if (axisX > ANALOG_DEADZONE) state[7] = true;

  return state;
}

/**
 * Compares previous and current Libretro button state maps and emits ControllerInputEvent deltas.
 */
export function diffGamepadStates(
  prevState: Record<number, boolean>,
  nextState: Record<number, boolean>,
  timestamp = Date.now()
): ControllerInputEvent[] {
  const events: ControllerInputEvent[] = [];
  const allIndices = new Set<number>([
    ...Object.keys(prevState).map(Number),
    ...Object.keys(nextState).map(Number),
  ]);

  for (const idx of allIndices) {
    const wasPressed = Boolean(prevState[idx]);
    const isPressed = Boolean(nextState[idx]);
    if (wasPressed !== isPressed) {
      const meta = XBOX_TO_LIBRETRO_BUTTON_MAP.find((m) => m.libretroIndex === idx);
      events.push({
        buttonIndex: idx,
        buttonName: meta?.libretroLabel || `BUTTON_${idx}`,
        pressed: isPressed,
        value: isPressed ? 1 : 0,
        timestamp,
      });
    }
  }

  return events;
}
