#!/usr/bin/env node
/**
 * End-to-End 2-Player Netplay & Chat Room Live Verification Script
 * Simulates two browser sessions (Player 1 / Host & Player 2 / Challenger)
 * with two Bluetooth Xbox Wireless Controllers against the live ROM Vault server.
 */

const BASE_URL = process.env.ROM_VAULT_URL || "http://127.0.0.1:39254/roms";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED] ${message}`);
  }
}

async function runLiveE2EVerification() {
  console.log("==================================================================");
  console.log(" 2-Player Retro Netplay & Dual Xbox Controller E2E Verification");
  console.log(` Target Server: ${BASE_URL}`);
  console.log("==================================================================\n");

  const browser1 = {
    playerId: `e2e_browser1_${Date.now()}`,
    playerName: "XboxPlayer1_Host",
    controller: "Xbox Wireless Controller #0 (Bluetooth - Port 1)",
  };

  const browser2 = {
    playerId: `e2e_browser2_${Date.now()}`,
    playerName: "XboxPlayer2_Guest",
    controller: "Xbox Wireless Controller #1 (Bluetooth - Port 2)",
  };

  let roomCode = null;

  try {
    // 1. Room Creation (Player 1)
    console.log("[Step 1/6] Player 1 (Browser 1) creating a new multiplayer room...");
    const createRes = await fetch(`${BASE_URL}/api/multiplayer/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "E2E Verification Room",
        playerId: browser1.playerId,
        playerName: browser1.playerName,
        systemId: "snes",
      }),
    });
    const createData = await createRes.json();
    assert(createRes.ok && createData.success, `Room creation failed: ${JSON.stringify(createData)}`);
    roomCode = createData.room.id;
    assert(/^RM-[A-Z0-9]{4}$/.test(roomCode), `Invalid room code format: ${roomCode}`);
    console.log(`  ✓ Room created with unique join code: ${roomCode} (Host: ${createData.room.host.displayName}, Port ${createData.room.host.controllerPort})`);

    // 2. Room Joining (Player 2)
    console.log(`\n[Step 2/6] Player 2 (Browser 2) joining room ${roomCode}...`);
    const joinRes = await fetch(`${BASE_URL}/api/multiplayer/rooms/${encodeURIComponent(roomCode)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "join",
        playerId: browser2.playerId,
        playerName: browser2.playerName,
      }),
    });
    const joinData = await joinRes.json();
    assert(joinRes.ok && joinData.success, `Room join failed: ${JSON.stringify(joinData)}`);
    assert(joinData.role === "guest", `Expected role 'guest', got '${joinData.role}'`);
    assert(joinData.room.guest?.id === browser2.playerId, "Guest ID mismatch");
    console.log(`  ✓ Player 2 connected to ${roomCode} as ${joinData.room.guest.displayName} (Controller Port ${joinData.room.guest.controllerPort})`);

    // 3. Lobby Communication
    console.log("\n[Step 3/6] Verifying bi-directional real-time lobby chat...");
    const chat1Res = await fetch(`${BASE_URL}/api/multiplayer/rooms/${encodeURIComponent(roomCode)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "chat",
        playerId: browser1.playerId,
        playerName: browser1.playerName,
        message: "Player 1 ready with Bluetooth Xbox Controller #1!",
      }),
    });
    assert((await chat1Res.json()).success, "Player 1 chat message failed");

    const chat2Res = await fetch(`${BASE_URL}/api/multiplayer/rooms/${encodeURIComponent(roomCode)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "chat",
        playerId: browser2.playerId,
        playerName: browser2.playerName,
        message: "Player 2 ready with Bluetooth Xbox Controller #2!",
      }),
    });
    const chat2Data = await chat2Res.json();
    assert(chat2Data.success, "Player 2 chat message failed");

    const participantMsgs = chat2Data.chat.filter(
      (m) => m.senderRole === "host" || m.senderRole === "guest"
    );
    assert(participantMsgs.length === 2, `Expected 2 participant messages, got ${participantMsgs.length}`);
    console.log(`  ✓ Bi-directional chat verified (${chat2Data.chat.length} total room messages including system events)`);

    // 4. Game & Emulator Selection
    console.log("\n[Step 4/6] Player 1 (Host) selecting console emulator and ROM...");
    const selectRes = await fetch(`${BASE_URL}/api/multiplayer/rooms/${encodeURIComponent(roomCode)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "select_game",
        playerId: browser1.playerId,
        systemId: "snes",
        gameId: "snes__Super Mario Kart (USA)",
        gameTitle: "Super Mario Kart (USA)",
        gameFileName: "Super Mario Kart (USA).sfc",
      }),
    });
    const selectData = await selectRes.json();
    assert(selectRes.ok && selectData.success, "Game selection failed");
    assert(selectData.room.emulatorCore === "snes", "Emulator core mismatch");
    assert(selectData.room.gameTitle === "Super Mario Kart (USA)", "Game title mismatch");
    console.log(`  ✓ Selected Emulator Core: ${selectData.room.emulatorCore} | Game: ${selectData.room.gameTitle}`);

    // 5. Ready-Up & Launch
    console.log("\n[Step 5/6] Both players toggling Ready status & launching unified session...");
    const r1 = await (
      await fetch(`${BASE_URL}/api/multiplayer/rooms/${encodeURIComponent(roomCode)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_ready", playerId: browser1.playerId, isReady: true }),
      })
    ).json();
    assert(r1.room.host.isReady === true && r1.room.canStart === false, "canStart should remain false when only P1 is ready");

    const r2 = await (
      await fetch(`${BASE_URL}/api/multiplayer/rooms/${encodeURIComponent(roomCode)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_ready", playerId: browser2.playerId, isReady: true }),
      })
    ).json();
    assert(r2.room.guest.isReady === true && r2.room.canStart === true, "canStart ('Go' button) should activate when both players are Ready");
    console.log("  ✓ Both players marked READY — 'GO! Launch 2P Session' button is ACTIVE");

    const launchData = await (
      await fetch(`${BASE_URL}/api/multiplayer/rooms/${encodeURIComponent(roomCode)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start_session", playerId: browser1.playerId }),
      })
    ).json();
    assert(launchData.success && launchData.room.status === "playing", "Failed to launch session");
    console.log("  ✓ Session launched! Room status is now 'playing'");

    // 6. Synchronized Gameplay & Dual Xbox Controller Input
    console.log("\n[Step 6/6] Verifying synchronized canvas stream & dual Xbox controller input relay...");
    // Browser 2 sends Xbox Controller #2 inputs (Start=3, A=8, D-Pad Right=7)
    const p2XboxEvents = [
      { buttonIndex: 3, buttonName: "START", pressed: true, value: 1 },
      { buttonIndex: 8, buttonName: "A / Circle", pressed: true, value: 1 },
      { buttonIndex: 7, buttonName: "DPAD_RIGHT", pressed: true, value: 1 },
    ];

    for (const evt of p2XboxEvents) {
      const sigRes = await fetch(
        `${BASE_URL}/api/multiplayer/rooms/${encodeURIComponent(roomCode)}/signal`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderId: browser2.playerId,
            targetRole: "host",
            type: "p2-input",
            payload: JSON.stringify(evt),
          }),
        }
      );
      assert(sigRes.ok, "Failed to post P2 Xbox controller input signal");
    }

    // Browser 1 (Host) polls P2 Xbox inputs for Port 1 injection
    const hostSigRes = await fetch(
      `${BASE_URL}/api/multiplayer/rooms/${encodeURIComponent(roomCode)}/signal?role=host&afterId=0`
    );
    const hostSigData = await hostSigRes.json();
    assert(
      hostSigData.success && hostSigData.signals.length === 3,
      `Expected 3 P2 Xbox controller signals on Host, got ${hostSigData.signals?.length}`
    );
    console.log("  ✓ Host received all 3 Player 2 Bluetooth Xbox Controller inputs for Libretro Port 2");

    // Browser 1 (Host) broadcasts shared Libretro canvas frame to Browser 2
    const sampleFrame = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/";
    await fetch(`${BASE_URL}/api/multiplayer/rooms/${encodeURIComponent(roomCode)}/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senderId: browser1.playerId,
        targetRole: "guest",
        type: "frame-sync",
        payload: sampleFrame,
      }),
    });

    const guestSigRes = await fetch(
      `${BASE_URL}/api/multiplayer/rooms/${encodeURIComponent(roomCode)}/signal?role=guest&afterId=0`
    );
    const guestSigData = await guestSigRes.json();
    assert(
      guestSigData.success &&
        guestSigData.signals.some((s) => s.type === "frame-sync" && s.payload === sampleFrame),
      "Guest did not receive synchronized Libretro canvas frame"
    );
    console.log("  ✓ Guest received synchronized Libretro canvas stream frame from Host");

    console.log("\n==================================================================");
    console.log(" [PASS] All 6 E2E 2-Player Netplay & Dual Xbox Controller Checks Passed!");
    console.log("==================================================================");
  } finally {
    if (roomCode) {
      await fetch(`${BASE_URL}/api/multiplayer/rooms/${encodeURIComponent(roomCode)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leave", playerId: browser1.playerId }),
      }).catch(() => {});
    }
  }
}

runLiveE2EVerification().catch((err) => {
  console.error("\n[FAIL] E2E Verification Error:", err);
  process.exit(1);
});
