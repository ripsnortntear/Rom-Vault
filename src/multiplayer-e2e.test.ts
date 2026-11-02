import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Stateful in-memory MariaDB mock for Hermetic End-to-End 2-Player Netplay & Chat Room Flow
 * (Complies with AGENTS.md Section 13: 100% hermetic in CI with zero live DB socket required)
 */
const { mockDbState, mockDbQuery, mockDbExecute } = vi.hoisted(() => {
  const state = {
    rooms: new Map<string, Record<string, any>>(),
    chats: [] as Array<Record<string, any>>,
    signals: [] as Array<Record<string, any>>,
    nextChatId: 1,
    nextSignalId: 1,
  };

  const queryFn = vi.fn(async (sql: string, params: any[] = []) => {
    const normalized = sql.replace(/\s+/g, " ").trim();

    if (normalized.startsWith("SELECT * FROM multiplayer_rooms WHERE id = ?")) {
      const id = String(params[0] || "").toUpperCase();
      const row = state.rooms.get(id);
      if (!row || row.status === "closed") return [];
      return [{ ...row }];
    }

    if (normalized.startsWith("SELECT * FROM multiplayer_rooms WHERE status != 'closed'")) {
      return Array.from(state.rooms.values()).filter((r) => r.status !== "closed");
    }

    if (normalized.startsWith("SELECT * FROM multiplayer_chat WHERE id = ?")) {
      const id = Number(params[0]);
      const found = state.chats.find((c) => c.id === id);
      return found ? [{ ...found }] : [];
    }

    if (normalized.includes("FROM multiplayer_chat WHERE room_id = ?")) {
      const roomId = String(params[0] || "").toUpperCase();
      return state.chats
        .filter((c) => c.room_id === roomId)
        .slice()
        .reverse();
    }

    if (normalized.includes("FROM multiplayer_signals WHERE room_id = ? AND target_role = ? AND id > ?")) {
      const roomId = String(params[0] || "").toUpperCase();
      const targetRole = String(params[1]);
      const afterId = Number(params[2] || 0);
      return state.signals
        .filter(
          (s) => s.room_id === roomId && s.target_role === targetRole && s.id > afterId
        )
        .sort((a, b) => a.id - b.id);
    }

    return [];
  });

  const executeFn = vi.fn(async (sql: string, params: any[] = []) => {
    const normalized = sql.replace(/\s+/g, " ").trim();

    if (normalized.startsWith("INSERT INTO multiplayer_rooms")) {
      const [
        id,
        name,
        system_id,
        emulator_core,
        game_id,
        game_title,
        game_file_name,
        game_cover_url,
        host_id,
        host_username,
        host_display_name,
      ] = params;
      const now = new Date();
      state.rooms.set(String(id).toUpperCase(), {
        id: String(id).toUpperCase(),
        name,
        system_id,
        emulator_core,
        game_id,
        game_title,
        game_file_name,
        game_cover_url,
        status: "waiting",
        host_id,
        host_username,
        host_display_name,
        host_ready: 0,
        host_joined_at: now,
        host_last_seen: now,
        guest_id: null,
        guest_username: null,
        guest_display_name: null,
        guest_ready: 0,
        guest_joined_at: null,
        guest_last_seen: null,
        created_at: now,
        updated_at: now,
      });
      return { insertId: 1, affectedRows: 1 };
    }

    if (normalized.startsWith("UPDATE multiplayer_rooms SET guest_id = ?")) {
      const [guest_id, guest_username, guest_display_name, roomId] = params;
      const row = state.rooms.get(String(roomId).toUpperCase());
      if (row) {
        row.guest_id = guest_id;
        row.guest_username = guest_username;
        row.guest_display_name = guest_display_name;
        row.guest_ready = 0;
        row.guest_joined_at = new Date();
        row.guest_last_seen = new Date();
        row.updated_at = new Date();
      }
      return { affectedRows: 1 };
    }

    if (normalized.startsWith("UPDATE multiplayer_rooms SET system_id = ?")) {
      const [
        system_id,
        emulator_core,
        game_id,
        game_title,
        game_file_name,
        game_cover_url,
        roomId,
      ] = params;
      const row = state.rooms.get(String(roomId).toUpperCase());
      if (row) {
        row.system_id = system_id;
        row.emulator_core = emulator_core;
        row.game_id = game_id;
        row.game_title = game_title;
        row.game_file_name = game_file_name;
        row.game_cover_url = game_cover_url;
        row.host_ready = 0;
        row.guest_ready = 0;
        row.status = "waiting";
        row.updated_at = new Date();
      }
      return { affectedRows: 1 };
    }

    if (normalized.startsWith("UPDATE multiplayer_rooms SET host_ready = ?")) {
      const [host_ready, status, roomId] = params;
      const row = state.rooms.get(String(roomId).toUpperCase());
      if (row) {
        row.host_ready = host_ready;
        row.status = status;
        row.updated_at = new Date();
      }
      return { affectedRows: 1 };
    }

    if (normalized.startsWith("UPDATE multiplayer_rooms SET guest_ready = ?")) {
      const [guest_ready, status, roomId] = params;
      const row = state.rooms.get(String(roomId).toUpperCase());
      if (row) {
        row.guest_ready = guest_ready;
        row.status = status;
        row.updated_at = new Date();
      }
      return { affectedRows: 1 };
    }

    if (normalized.startsWith("UPDATE multiplayer_rooms SET status = 'playing'")) {
      const [roomId] = params;
      const row = state.rooms.get(String(roomId).toUpperCase());
      if (row) {
        row.status = "playing";
        row.updated_at = new Date();
      }
      return { affectedRows: 1 };
    }

    if (normalized.startsWith("INSERT INTO multiplayer_chat")) {
      const [room_id, sender_id, sender_name, sender_role, message] = params;
      const id = state.nextChatId++;
      state.chats.push({
        id,
        room_id: String(room_id).toUpperCase(),
        sender_id,
        sender_name,
        sender_role,
        message,
        created_at: new Date(),
      });
      return { insertId: id, affectedRows: 1 };
    }

    if (normalized.startsWith("DELETE FROM multiplayer_signals WHERE room_id = ? AND type = 'frame-sync'")) {
      const [roomId] = params;
      state.signals = state.signals.filter(
        (s) => !(s.room_id === String(roomId).toUpperCase() && s.type === "frame-sync")
      );
      return { affectedRows: 1 };
    }

    if (normalized.startsWith("DELETE FROM multiplayer_signals WHERE room_id = ?")) {
      const [roomId] = params;
      state.signals = state.signals.filter(
        (s) => s.room_id !== String(roomId).toUpperCase()
      );
      return { affectedRows: 1 };
    }

    if (normalized.startsWith("INSERT INTO multiplayer_signals")) {
      const [room_id, sender_id, target_role, type, payload] = params;
      const id = state.nextSignalId++;
      state.signals.push({
        id,
        room_id: String(room_id).toUpperCase(),
        sender_id,
        target_role,
        type,
        payload,
        created_at: new Date(),
      });
      return { insertId: id, affectedRows: 1 };
    }

    return { insertId: 0, affectedRows: 1 };
  });

  return {
    mockDbState: state,
    mockDbQuery: queryFn,
    mockDbExecute: executeFn,
  };
});

vi.mock("@/lib/db", () => ({
  db: { query: mockDbQuery, execute: mockDbExecute },
  query: mockDbQuery,
  execute: mockDbExecute,
}));

vi.mock("./lib/db", () => ({
  db: { query: mockDbQuery, execute: mockDbExecute },
  query: mockDbQuery,
  execute: mockDbExecute,
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentSession: vi.fn(async () => null),
}));

import { POST as createRoomRoute, GET as listRoomsRoute } from "./app/api/multiplayer/rooms/route";
import {
  GET as getRoomRoute,
  PATCH as patchRoomRoute,
} from "./app/api/multiplayer/rooms/[roomId]/route";
import {
  GET as pollSignalRoute,
  POST as postSignalRoute,
} from "./app/api/multiplayer/rooms/[roomId]/signal/route";
import { _resetMultiplayerInitForTesting } from "./lib/multiplayer";
import {
  selectGamepadForRole,
  extractLibretroStateFromGamepad,
  diffGamepadStates,
  type GamepadLike,
} from "./lib/xbox-controller";

function createMockXboxController(index: number, label: string): {
  pad: GamepadLike;
  pressButton: (btnIdx: number) => void;
  releaseButton: (btnIdx: number) => void;
  moveStick: (x: number, y: number) => void;
} {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  const axes = [0, 0, 0, 0];

  const pad: GamepadLike = {
    index,
    id: `Xbox Wireless Controller (${label} - Standard Gamepad Vendor: 045e Product: 0b13)`,
    connected: true,
    mapping: "standard",
    buttons,
    axes,
  };

  return {
    pad,
    pressButton(btnIdx: number) {
      buttons[btnIdx] = { pressed: true, value: 1 };
    },
    releaseButton(btnIdx: number) {
      buttons[btnIdx] = { pressed: false, value: 0 };
    },
    moveStick(x: number, y: number) {
      axes[0] = x;
      axes[1] = y;
    },
  };
}

describe("End-to-End 2-Player Netplay & Chat Room Flow Integration Specification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetMultiplayerInitForTesting();
    mockDbState.rooms.clear();
    mockDbState.chats = [];
    mockDbState.signals = [];
    mockDbState.nextChatId = 1;
    mockDbState.nextSignalId = 1;
  });

  it("executes the complete 6-step 2-player multiplayer flow with dual Bluetooth Xbox controllers and two browser contexts", async () => {
    // =========================================================================
    // PREREQUISITES:
    // - Two Bluetooth-connected Xbox controllers mapped to local workstation
    // - Two separate browser contexts (Browser 1 = Player 1, Browser 2 = Player 2)
    // =========================================================================
    const xboxController1 = createMockXboxController(0, "Player 1 Bluetooth Pad");
    const xboxController2 = createMockXboxController(1, "Player 2 Bluetooth Pad");
    const workstationGamepads: ReadonlyArray<GamepadLike | null> = [
      xboxController1.pad,
      xboxController2.pad,
      null,
      null,
    ];

    const browser1Context = {
      playerId: "mp_browser1_p1",
      playerName: "Player1_Host",
      role: "host" as const,
      lastSignalId: 0,
    };

    const browser2Context = {
      playerId: "mp_browser2_p2",
      playerName: "Player2_Challenger",
      role: "guest" as const,
      lastSignalId: 0,
    };

    // =========================================================================
    // STEP 1: Room Creation (Player 1)
    // Player 1 creates a new multiplayer room via the platform interface,
    // generating a unique room join code.
    // =========================================================================
    const createReq = new NextRequest("http://localhost:39254/roms/api/multiplayer/rooms", {
      method: "POST",
      body: JSON.stringify({
        name: "Oldsmar Chaos 2P Showdown",
        playerId: browser1Context.playerId,
        playerName: browser1Context.playerName,
        systemId: "snes",
      }),
    });

    const createRes = await createRoomRoute(createReq);
    const createData = await createRes.json();

    expect(createRes.status).toBe(200);
    expect(createData.success).toBe(true);
    expect(createData.role).toBe("host");

    const roomJoinCode: string = createData.room.id;
    expect(roomJoinCode).toMatch(/^RM-[A-Z0-9]{4}$/);
    expect(createData.room.host.id).toBe(browser1Context.playerId);
    expect(createData.room.host.controllerPort).toBe(1);
    expect(createData.room.guest).toBeNull();

    // Verify room appears in active rooms directory
    const listRes = await listRoomsRoute();
    const listData = await listRes.json();
    expect(listData.rooms.some((r: any) => r.id === roomJoinCode)).toBe(true);

    // =========================================================================
    // STEP 2: Room Joining (Player 2)
    // Player 2 enters the join code in their browser session to connect to the same room.
    // =========================================================================
    const joinReq = new NextRequest(
      `http://localhost:39254/roms/api/multiplayer/rooms/${roomJoinCode}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          action: "join",
          playerId: browser2Context.playerId,
          playerName: browser2Context.playerName,
        }),
      }
    );

    const joinRes = await patchRoomRoute(joinReq, {
      params: Promise.resolve({ roomId: roomJoinCode }),
    });
    const joinData = await joinRes.json();

    expect(joinRes.status).toBe(200);
    expect(joinData.success).toBe(true);
    expect(joinData.role).toBe("guest");
    expect(joinData.room.guest).not.toBeNull();
    expect(joinData.room.guest.id).toBe(browser2Context.playerId);
    expect(joinData.room.guest.displayName).toBe("Player2_Challenger");
    expect(joinData.room.guest.controllerPort).toBe(2);

    // =========================================================================
    // STEP 3: Lobby Communication
    // Both players exchange messages in the room's real-time chat interface
    // to verify bi-directional messaging.
    // =========================================================================
    const p1ChatReq = new NextRequest(
      `http://localhost:39254/roms/api/multiplayer/rooms/${roomJoinCode}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          action: "chat",
          playerId: browser1Context.playerId,
          playerName: browser1Context.playerName,
          message: "Hey Player 2! My Bluetooth Xbox controller is synced on Port 1.",
        }),
      }
    );
    const p1ChatRes = await patchRoomRoute(p1ChatReq, {
      params: Promise.resolve({ roomId: roomJoinCode }),
    });
    expect((await p1ChatRes.json()).success).toBe(true);

    const p2ChatReq = new NextRequest(
      `http://localhost:39254/roms/api/multiplayer/rooms/${roomJoinCode}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          action: "chat",
          playerId: browser2Context.playerId,
          playerName: browser2Context.playerName,
          message: "Awesome! My second Xbox controller is ready on Port 2. Pick Contra III!",
        }),
      }
    );
    const p2ChatRes = await patchRoomRoute(p2ChatReq, {
      params: Promise.resolve({ roomId: roomJoinCode }),
    });
    const p2ChatData = await p2ChatRes.json();
    expect(p2ChatData.success).toBe(true);

    // Both browsers poll the room and verify bi-directional chat history
    const pollLobbyReq = new NextRequest(
      `http://localhost:39254/roms/api/multiplayer/rooms/${roomJoinCode}?role=host&afterSignalId=0`
    );
    const pollLobbyRes = await getRoomRoute(pollLobbyReq, {
      params: Promise.resolve({ roomId: roomJoinCode }),
    });
    const pollLobbyData = await pollLobbyRes.json();

    const userChatMessages = pollLobbyData.chat.filter(
      (m: any) => m.senderRole === "host" || m.senderRole === "guest"
    );
    expect(userChatMessages).toHaveLength(2);
    expect(userChatMessages[0].senderRole).toBe("host");
    expect(userChatMessages[0].message).toContain("Bluetooth Xbox controller is synced on Port 1");
    expect(userChatMessages[1].senderRole).toBe("guest");
    expect(userChatMessages[1].message).toContain("Pick Contra III!");

    // =========================================================================
    // STEP 4: Game & Emulator Selection
    // Player 1 (Host) selects a retro console emulator and a target ROM from the catalog.
    // =========================================================================
    const selectGameReq = new NextRequest(
      `http://localhost:39254/roms/api/multiplayer/rooms/${roomJoinCode}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          action: "select_game",
          playerId: browser1Context.playerId,
          systemId: "snes",
          gameId: "snes__Contra III - The Alien Wars (USA)",
          gameTitle: "Contra III - The Alien Wars (USA)",
          gameFileName: "Contra III - The Alien Wars (USA).sfc",
        }),
      }
    );
    const selectGameRes = await patchRoomRoute(selectGameReq, {
      params: Promise.resolve({ roomId: roomJoinCode }),
    });
    const selectGameData = await selectGameRes.json();

    expect(selectGameData.success).toBe(true);
    expect(selectGameData.room.systemId).toBe("snes");
    expect(selectGameData.room.emulatorCore).toBe("snes");
    expect(selectGameData.room.gameId).toBe("snes__Contra III - The Alien Wars (USA)");
    expect(selectGameData.room.gameTitle).toBe("Contra III - The Alien Wars (USA)");
    expect(selectGameData.room.canStart).toBe(false);

    // =========================================================================
    // STEP 5: Ready-Up & Launch
    // Both players toggle their status to "Ready," activating the session start ("Go") button.
    // =========================================================================
    // Player 1 toggles Ready
    const p1ReadyReq = new NextRequest(
      `http://localhost:39254/roms/api/multiplayer/rooms/${roomJoinCode}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          action: "toggle_ready",
          playerId: browser1Context.playerId,
          isReady: true,
        }),
      }
    );
    const p1ReadyData = await (
      await patchRoomRoute(p1ReadyReq, { params: Promise.resolve({ roomId: roomJoinCode }) })
    ).json();
    expect(p1ReadyData.room.host.isReady).toBe(true);
    expect(p1ReadyData.room.guest.isReady).toBe(false);
    expect(p1ReadyData.room.canStart).toBe(false); // "Go" still disabled until Player 2 is ready

    // Player 2 toggles Ready -> activates "Go" button (canStart === true, status === "ready")
    const p2ReadyReq = new NextRequest(
      `http://localhost:39254/roms/api/multiplayer/rooms/${roomJoinCode}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          action: "toggle_ready",
          playerId: browser2Context.playerId,
          isReady: true,
        }),
      }
    );
    const p2ReadyData = await (
      await patchRoomRoute(p2ReadyReq, { params: Promise.resolve({ roomId: roomJoinCode }) })
    ).json();
    expect(p2ReadyData.room.host.isReady).toBe(true);
    expect(p2ReadyData.room.guest.isReady).toBe(true);
    expect(p2ReadyData.room.canStart).toBe(true);
    expect(p2ReadyData.room.status).toBe("ready");

    // Player 1 clicks "GO! Launch 2P Session"
    const launchReq = new NextRequest(
      `http://localhost:39254/roms/api/multiplayer/rooms/${roomJoinCode}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          action: "start_session",
          playerId: browser1Context.playerId,
        }),
      }
    );
    const launchData = await (
      await patchRoomRoute(launchReq, { params: Promise.resolve({ roomId: roomJoinCode }) })
    ).json();
    expect(launchData.success).toBe(true);
    expect(launchData.room.status).toBe("playing");

    // =========================================================================
    // STEP 6: Synchronized Gameplay & Dual Physical Xbox Controller Input
    // Verify both browsers render the shared libretro canvas session while mapping
    // Player 1 (Xbox Controller #1 -> Port 0) and Player 2 (Xbox Controller #2 -> Port 1)
    // into the unified Libretro game instance.
    // =========================================================================
    const unifiedLibretroInputLog: Array<{
      port: number;
      buttonIndex: number;
      value: number;
    }> = [];

    const mockUnifiedLibretroInstance = {
      gameManager: {
        simulateInput: vi.fn((port: number, buttonIndex: number, value: number) => {
          unifiedLibretroInputLog.push({ port, buttonIndex, value });
        }),
      },
    };

    // 6a. Verify controller binding isolation on the workstation:
    // Browser 1 (Host) selects Xbox Controller #1 (index 0)
    // Browser 2 (Guest) selects Xbox Controller #2 (index 1)
    const p1BoundPad = selectGamepadForRole(workstationGamepads, "host");
    const p2BoundPad = selectGamepadForRole(workstationGamepads, "guest");

    expect(p1BoundPad?.index).toBe(0);
    expect(p1BoundPad?.id).toContain("Player 1 Bluetooth Pad");
    expect(p2BoundPad?.index).toBe(1);
    expect(p2BoundPad?.id).toContain("Player 2 Bluetooth Pad");

    // 6b. Player 1 presses Start (Xbox Menu button 9 -> Libretro 3), B (Xbox A button 0 -> Libretro 0),
    // and pushes Left Analog Thumbstick Right (axes[0] = +0.85 -> Libretro 7 DPAD_RIGHT)
    let p1PrevState: Record<number, boolean> = {};
    xboxController1.pressButton(9); // Xbox Menu (Start)
    xboxController1.pressButton(0); // Xbox A (Libretro B)
    xboxController1.moveStick(0.85, 0); // Analog Stick Right

    const p1NextState = extractLibretroStateFromGamepad(p1BoundPad);
    const p1Deltas = diffGamepadStates(p1PrevState, p1NextState);
    p1PrevState = p1NextState;

    for (const evt of p1Deltas) {
      mockUnifiedLibretroInstance.gameManager.simulateInput(0, evt.buttonIndex, evt.value);
    }

    // 6c. Player 2 presses Y/Fire (Xbox X button 2 -> Libretro 1), Jump (Xbox B button 1 -> Libretro 8),
    // and D-Pad Up (Xbox button 12 -> Libretro 4) in Browser 2, transmitting to Host via room signaling
    let p2PrevState: Record<number, boolean> = {};
    xboxController2.pressButton(2); // Xbox X (Libretro Y)
    xboxController2.pressButton(1); // Xbox B (Libretro A)
    xboxController2.pressButton(12); // Xbox D-Pad Up (Libretro DPAD_UP)

    const p2NextState = extractLibretroStateFromGamepad(p2BoundPad);
    const p2Deltas = diffGamepadStates(p2PrevState, p2NextState);
    p2PrevState = p2NextState;

    for (const evt of p2Deltas) {
      const sigReq = new NextRequest(
        `http://localhost:39254/roms/api/multiplayer/rooms/${roomJoinCode}/signal`,
        {
          method: "POST",
          body: JSON.stringify({
            senderId: browser2Context.playerId,
            targetRole: "host",
            type: "p2-input",
            payload: JSON.stringify(evt),
          }),
        }
      );
      const sigRes = await postSignalRoute(sigReq, {
        params: Promise.resolve({ roomId: roomJoinCode }),
      });
      expect(sigRes.status).toBe(200);
    }

    // Host polls incoming signals and injects Player 2 inputs into Port 1 of the unified Libretro instance
    const hostPollSignalsReq = new NextRequest(
      `http://localhost:39254/roms/api/multiplayer/rooms/${roomJoinCode}/signal?role=host&afterId=${browser1Context.lastSignalId}`
    );
    const hostPollSignalsRes = await pollSignalRoute(hostPollSignalsReq, {
      params: Promise.resolve({ roomId: roomJoinCode }),
    });
    const hostSignalsData = await hostPollSignalsRes.json();

    expect(hostSignalsData.success).toBe(true);
    expect(hostSignalsData.signals).toHaveLength(3);

    for (const sig of hostSignalsData.signals) {
      const parsed = JSON.parse(sig.payload);
      mockUnifiedLibretroInstance.gameManager.simulateInput(
        1,
        parsed.buttonIndex,
        parsed.value
      );
    }

    // Verify Unified Libretro Instance received both Player 1 (Port 0) and Player 2 (Port 1) Xbox inputs accurately
    const port0Inputs = unifiedLibretroInputLog.filter((i) => i.port === 0);
    const port1Inputs = unifiedLibretroInputLog.filter((i) => i.port === 1);

    expect(port0Inputs).toEqual(
      expect.arrayContaining([
        { port: 0, buttonIndex: 3, value: 1 }, // P1 Start
        { port: 0, buttonIndex: 0, value: 1 }, // P1 B
        { port: 0, buttonIndex: 7, value: 1 }, // P1 Left Stick Right -> DPAD_RIGHT
      ])
    );

    expect(port1Inputs).toEqual(
      expect.arrayContaining([
        { port: 1, buttonIndex: 1, value: 1 }, // P2 Y
        { port: 1, buttonIndex: 8, value: 1 }, // P2 A
        { port: 1, buttonIndex: 4, value: 1 }, // P2 D-Pad Up
      ])
    );

    // 6d. Verify Host's shared Libretro canvas stream frame sync reaches Player 2's browser
    const sampleCanvasFrame = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=";
    const frameBroadcastReq = new NextRequest(
      `http://localhost:39254/roms/api/multiplayer/rooms/${roomJoinCode}/signal`,
      {
        method: "POST",
        body: JSON.stringify({
          senderId: browser1Context.playerId,
          targetRole: "guest",
          type: "frame-sync",
          payload: sampleCanvasFrame,
        }),
      }
    );
    await postSignalRoute(frameBroadcastReq, {
      params: Promise.resolve({ roomId: roomJoinCode }),
    });

    const guestPollSignalsReq = new NextRequest(
      `http://localhost:39254/roms/api/multiplayer/rooms/${roomJoinCode}/signal?role=guest&afterId=${browser2Context.lastSignalId}`
    );
    const guestPollSignalsRes = await pollSignalRoute(guestPollSignalsReq, {
      params: Promise.resolve({ roomId: roomJoinCode }),
    });
    const guestSignalsData = await guestPollSignalsRes.json();

    expect(guestSignalsData.signals).toHaveLength(1);
    expect(guestSignalsData.signals[0].type).toBe("frame-sync");
    expect(guestSignalsData.signals[0].payload).toBe(sampleCanvasFrame);
  });
});
