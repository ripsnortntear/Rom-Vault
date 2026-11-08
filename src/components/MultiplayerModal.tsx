"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Users,
  Gamepad2,
  Play,
  CheckCircle2,
  Circle,
  Send,
  Plus,
  RefreshCw,
  LogOut,
  X,
  Radio,
  Sparkles,
  Search,
  Tv,
  ShieldCheck,
  Wifi,
  Copy,
  Check,
  MessageSquare,
  Volume2,
  VolumeX,
  Cable,
  Minimize2,
  Maximize2,
  ArrowLeft,
} from "lucide-react";
import type { GameItem } from "@/types/game";
import {
  MultiplayerRoom,
  RoomChatMessage,
  MultiplayerSignal,
  SUPPORTED_MULTIPLAYER_SYSTEMS,
  isSupportedMultiplayerSystem,
  isLinkCableSystem,
  getLinkCableAllowedSystems,
  LinkCablePacket,
} from "@/types/multiplayer";
import { KNOWN_SYSTEMS, getSystemMeta } from "@/lib/systems";
import {
  selectGamepadForRole,
  extractLibretroStateFromGamepad,
  diffGamepadStates,
  type GamepadLike,
} from "@/lib/xbox-controller";

interface MultiplayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: {
    id?: string;
    username: string;
    displayName?: string;
    role?: string;
  } | null;
  allGames: GameItem[];
  initialGame?: GameItem | null;
}

const MULTIPLAYER_SYSTEMS = SUPPORTED_MULTIPLAYER_SYSTEMS;

/**
 * Standard Libretro Button Map for Player 2 (Port 1):
 * 0: B / Cross
 * 1: Y / Square
 * 2: Select
 * 3: Start
 * 4: D-Pad Up
 * 5: D-Pad Down
 * 6: D-Pad Left
 * 7: D-Pad Right
 * 8: A / Circle
 * 9: X / Triangle
 * 10: L1
 * 11: R1
 * 12: L2
 * 13: R2
 */
const P2_KEY_TO_BUTTON: Record<string, { index: number; label: string }> = {
  ArrowUp: { index: 4, label: "UP" },
  ArrowDown: { index: 5, label: "DOWN" },
  ArrowLeft: { index: 6, label: "LEFT" },
  ArrowRight: { index: 7, label: "RIGHT" },
  KeyX: { index: 0, label: "B" },
  KeyZ: { index: 8, label: "A" },
  KeyS: { index: 1, label: "Y" },
  KeyA: { index: 9, label: "X" },
  KeyQ: { index: 10, label: "L1" },
  KeyE: { index: 11, label: "R1" },
  Tab: { index: 12, label: "L2" },
  KeyR: { index: 13, label: "R2" },
  Enter: { index: 3, label: "START" },
  ShiftRight: { index: 2, label: "SELECT" },
  KeyV: { index: 2, label: "SELECT" },
};

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function MultiplayerModal({
  isOpen,
  onClose,
  currentUser,
  allGames,
  initialGame,
}: MultiplayerModalProps): React.ReactElement | null {
  // Unique per-tab client identity so even two tabs on the same machine can join as P1 and P2
  const [clientId] = useState<string>(() => {
    if (typeof window === "undefined") return "mp_server";
    const existing = sessionStorage.getItem("rom_vault_mp_client_id");
    if (existing) return existing;
    const generated = `mp_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
    sessionStorage.setItem("rom_vault_mp_client_id", generated);
    return generated;
  });

  const [playerName, setPlayerName] = useState<string>(() => {
    if (currentUser?.displayName) return currentUser.displayName;
    if (currentUser?.username) return currentUser.username;
    if (typeof window !== "undefined") {
      return localStorage.getItem("rom_vault_mp_name") || `Player_${Math.floor(100 + Math.random() * 899)}`;
    }
    return "RetroPlayer";
  });

  useEffect(() => {
    if (currentUser?.displayName || currentUser?.username) {
      setPlayerName(currentUser.displayName || currentUser.username);
    }
  }, [currentUser]);

  // Directory & Room Creation State
  const [rooms, setRooms] = useState<MultiplayerRoom[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState<boolean>(false);
  const [roomNameInput, setRoomNameInput] = useState<string>("");
  const [joinCodeInput, setJoinCodeInput] = useState<string>("");
  const [selectedSystemId, setSelectedSystemId] = useState<string>(() => {
    if (initialGame && isSupportedMultiplayerSystem(initialGame.system)) {
      return initialGame.system;
    }
    return "snes";
  });
  const [selectedGameId, setSelectedGameId] = useState<string>(() => {
    if (initialGame && isSupportedMultiplayerSystem(initialGame.system)) {
      return initialGame.id;
    }
    return "";
  });
  const [gameSearchQuery, setGameSearchQuery] = useState<string>("");
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [copiedRoomCode, setCopiedRoomCode] = useState<boolean>(false);

  // Active Room State
  const [activeRoom, setActiveRoom] = useState<MultiplayerRoom | null>(null);
  const [myRole, setMyRole] = useState<"host" | "guest">("host");
  const [chatMessages, setChatMessages] = useState<RoomChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>("");
  const [isSendingChat, setIsSendingChat] = useState<boolean>(false);
  const [isMutatingRoom, setIsMutatingRoom] = useState<boolean>(false);

  // Synchronized 2P Emulation & WebRTC State
  const [connectionState, setConnectionState] = useState<
    "connecting" | "webrtc-live" | "relay-sync"
  >("connecting");
  const [activeP2Buttons, setActiveP2Buttons] = useState<Record<number, boolean>>({});
  const [latestRelayFrame, setLatestRelayFrame] = useState<string | null>(null);
  const [isGuestMuted, setIsGuestMuted] = useState<boolean>(false);

  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const hostIframeRef = useRef<HTMLIFrameElement | null>(null);
  const guestIframeRef = useRef<HTMLIFrameElement | null>(null);
  const guestVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const lastSignalIdRef = useRef<number>(0);
  const lastChatCountRef = useRef<number>(0);
  const pressedKeysRef = useRef<Set<string>>(new Set());

  // Game Boy (GB / GBC / GBA) Link Cable mode state
  const [linkPipVisible, setLinkPipVisible] = useState<boolean>(true);
  const [linkPipExpanded, setLinkPipExpanded] = useState<boolean>(false);
  const [linkPacketsCount, setLinkPacketsCount] = useState<number>(0);
  const [isSelectingGuestGame, setIsSelectingGuestGame] = useState<boolean>(true);
  const [guestGameSearchQuery, setGuestGameSearchQuery] = useState<string>("");
  const [selectedGuestSystemId, setSelectedGuestSystemId] = useState<string>("");
  const [mobileLobbyTab, setMobileLobbyTab] = useState<"setup" | "chat">("setup");

  const isLinkMode = Boolean(activeRoom && isLinkCableSystem(activeRoom.systemId));

  const allowedGuestSystems = useMemo(() => {
    if (!activeRoom) return [];
    return getLinkCableAllowedSystems(activeRoom.systemId);
  }, [activeRoom?.systemId]);

  // Keep guest system in sync with allowed systems when entering a link-cable room
  useEffect(() => {
    if (activeRoom && isLinkCableSystem(activeRoom.systemId)) {
      const allowed = getLinkCableAllowedSystems(activeRoom.systemId);
      if (activeRoom.guestSystemId && allowed.includes(activeRoom.guestSystemId.toLowerCase())) {
        setSelectedGuestSystemId(activeRoom.guestSystemId.toLowerCase());
      } else if (allowed.length > 0) {
        setSelectedGuestSystemId((prev) => (allowed.includes(prev.toLowerCase()) ? prev.toLowerCase() : allowed[0]));
      }
    }
  }, [activeRoom?.systemId, activeRoom?.guestSystemId]);

  // Automatically trigger cartridge selection when entering a link-cable room as guest
  useEffect(() => {
    if (activeRoom && isLinkCableSystem(activeRoom.systemId) && myRole === "guest") {
      setIsSelectingGuestGame(true);
    }
  }, [activeRoom?.id, activeRoom?.systemId, myRole]);

  // Filter playable games for the selected console emulator
  const systemGames = useMemo(() => {
    const q = gameSearchQuery.trim().toLowerCase();
    return allGames
      .filter((g) => g.system.toLowerCase() === selectedSystemId.toLowerCase())
      .filter((g) => {
        if (!q) return true;
        return (
          g.displayTitle.toLowerCase().includes(q) ||
          g.baseName.toLowerCase().includes(q)
        );
      })
      .slice(0, 120);
  }, [allGames, selectedSystemId, gameSearchQuery]);

  const selectedGameObj = useMemo(() => {
    const targetId = activeRoom ? activeRoom.gameId : selectedGameId;
    if (!targetId) return null;
    return allGames.find((g) => g.id === targetId) || null;
  }, [allGames, activeRoom, selectedGameId]);

  const guestSystemGames = useMemo(() => {
    if (!activeRoom) return [];
    const q = guestGameSearchQuery.trim().toLowerCase();
    const targetSys = selectedGuestSystemId || activeRoom.guestSystemId || activeRoom.systemId;
    return allGames
      .filter((g) => g.system.toLowerCase() === targetSys.toLowerCase())
      .filter((g) => {
        if (!q) return true;
        return (
          g.displayTitle.toLowerCase().includes(q) ||
          g.baseName.toLowerCase().includes(q)
        );
      })
      .slice(0, 150);
  }, [allGames, activeRoom, selectedGuestSystemId, guestGameSearchQuery]);

  const guestSelectedGameObj = useMemo(() => {
    if (!activeRoom) return null;
    const targetId = activeRoom.guestGameId || activeRoom.gameId;
    if (!targetId) return null;
    return allGames.find((g) => g.id === targetId) || null;
  }, [allGames, activeRoom?.guestGameId, activeRoom?.gameId]);

  const scrollChatToBottom = useCallback((smooth = true) => {
    const el = chatContainerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? "smooth" : "instant",
    });
  }, []);

  useEffect(() => {
    if (chatMessages.length > lastChatCountRef.current) {
      scrollChatToBottom(lastChatCountRef.current > 0);
      lastChatCountRef.current = chatMessages.length;
    }
  }, [chatMessages.length, scrollChatToBottom]);

  // Fetch open rooms when in directory view
  const fetchRoomsList = useCallback(async () => {
    if (!isOpen || activeRoom) return;
    setIsLoadingRooms(true);
    try {
      const res = await fetch("/roms/api/multiplayer/rooms", { cache: "no-store" });
      const data = await res.json();
      if (data.success && Array.isArray(data.rooms)) {
        setRooms(data.rooms);
      }
    } catch {
      // Ignore transient network errors
    } finally {
      setIsLoadingRooms(false);
    }
  }, [isOpen, activeRoom]);

  useEffect(() => {
    if (isOpen && !activeRoom) {
      fetchRoomsList();
      const interval = setInterval(fetchRoomsList, 4000);
      return () => clearInterval(interval);
    }
  }, [isOpen, activeRoom, fetchRoomsList]);

  // Inject Player 1 (Port 0) or Player 2 (Port 1) controller button event into Host's running EmulatorJS iframe
  const injectPlayerInputOnHost = useCallback(
    (port: 0 | 1, buttonIndex: number, pressed: boolean) => {
      if (port === 1) {
        setActiveP2Buttons((prev) => ({ ...prev, [buttonIndex]: pressed }));
      }
      const value = pressed ? 1 : 0;

      const iframeWin = hostIframeRef.current?.contentWindow as any;
      if (!iframeWin) return;

      try {
        // Direct same-origin call for zero-latency Port 0 / Port 1 input injection
        const emu = iframeWin.EJS_emulator;
        const gm = emu?.gameManager;
        if (gm && typeof gm.simulateInput === "function") {
          gm.simulateInput(port, buttonIndex, value);
        } else if (gm?.functions && typeof gm.functions.simulateInput === "function") {
          gm.functions.simulateInput(port, buttonIndex, value);
        }
      } catch {}

      // Also notify MobileEmulatorView inside iframe so input telemetry is recorded
      try {
        iframeWin.postMessage(
          {
            type: port === 0 ? "VAULT_MP_P1_INPUT" : "VAULT_MP_P2_INPUT",
            buttonIndex,
            value,
          },
          "*"
        );
      } catch {}
    },
    []
  );

  const injectPlayer2InputOnHost = useCallback(
    (buttonIndex: number, pressed: boolean) => {
      injectPlayerInputOnHost(1, buttonIndex, pressed);
    },
    [injectPlayerInputOnHost]
  );

  // Send a signal to the other participant via API
  const postSignal = useCallback(
    async (
      roomId: string,
      targetRole: "host" | "guest",
      type: MultiplayerSignal["type"],
      payloadObj: unknown
    ) => {
      try {
        await fetch(`/roms/api/multiplayer/rooms/${encodeURIComponent(roomId)}/signal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderId: clientId,
            targetRole,
            type,
            payload:
              typeof payloadObj === "string" ? payloadObj : JSON.stringify(payloadObj),
          }),
        });
      } catch {}
    },
    [clientId]
  );

  // Handle incoming signals (WebRTC Offer/Answer/ICE, Player 2 controller inputs, and frame sync)
  const processIncomingSignals = useCallback(
    async (signals: MultiplayerSignal[], room: MultiplayerRoom, role: "host" | "guest") => {
      for (const sig of signals) {
        if (sig.id > lastSignalIdRef.current) {
          lastSignalIdRef.current = sig.id;
        }

        if (role === "host" && sig.type === "p2-input") {
          try {
            const data = JSON.parse(sig.payload);
            if (typeof data.buttonIndex === "number") {
              injectPlayer2InputOnHost(data.buttonIndex, Boolean(data.pressed));
            }
          } catch {}
        } else if (role === "guest" && sig.type === "frame-sync") {
          if (sig.payload.startsWith("data:image/")) {
            setLatestRelayFrame(sig.payload);
            setConnectionState((prev) =>
              prev === "webrtc-live" ? "webrtc-live" : "relay-sync"
            );
          }
        } else if (role === "guest" && sig.type === "webrtc-offer") {
          try {
            const pc = peerConnectionRef.current;
            if (pc) {
              const offerDesc = JSON.parse(sig.payload);
              await pc.setRemoteDescription(new RTCSessionDescription(offerDesc));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await postSignal(room.id, "host", "webrtc-answer", answer);
            }
          } catch {}
        } else if (role === "host" && sig.type === "webrtc-answer") {
          try {
            const pc = peerConnectionRef.current;
            if (pc && pc.signalingState === "have-local-offer") {
              const answerDesc = JSON.parse(sig.payload);
              await pc.setRemoteDescription(new RTCSessionDescription(answerDesc));
            }
          } catch {}
        } else if (sig.type === "webrtc-ice") {
          try {
            const pc = peerConnectionRef.current;
            if (pc) {
              const candidate = JSON.parse(sig.payload);
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
          } catch {}
        } else if (sig.type === "link-packet") {
          try {
            const data = JSON.parse(sig.payload);
            const targetWin = (role === "host" ? hostIframeRef.current : guestIframeRef.current)?.contentWindow as any;
            targetWin?.postMessage(
              {
                type: "VAULT_LINK_PACKET_IN",
                kind: data.kind,
                data: data.data,
                fast: data.fast,
              },
              "*"
            );
            setLinkPacketsCount((c) => c + 1);
          } catch {}
        }
      }
    },
    [injectPlayer2InputOnHost, postSignal]
  );

  // Poll active room state, chat messages, and signals
  useEffect(() => {
    if (!isOpen || !activeRoom) return;

    let cancelled = false;
    const pollIntervalMs = activeRoom.status === "playing" ? 450 : 1200;

    const pollRoom = async () => {
      try {
        const res = await fetch(
          `/roms/api/multiplayer/rooms/${encodeURIComponent(
            activeRoom.id
          )}?role=${myRole}&afterSignalId=${lastSignalIdRef.current}`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          if (res.status === 404 && !cancelled) {
            setErrorBanner("The multiplayer room was closed by the host.");
            setActiveRoom(null);
          }
          return;
        }
        const data = await res.json();
        if (cancelled || !data.success) return;

        if (data.room) {
          setActiveRoom(data.room);
          setSelectedSystemId(data.room.systemId);
          if (data.room.gameId) {
            setSelectedGameId(data.room.gameId);
          }
        }
        if (Array.isArray(data.chat)) {
          setChatMessages(data.chat);
        }
        if (Array.isArray(data.signals) && data.signals.length > 0 && data.room) {
          await processIncomingSignals(data.signals, data.room, myRole);
        }
      } catch {}
    };

    pollRoom();
    const timer = setInterval(pollRoom, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isOpen, activeRoom?.id, activeRoom?.status, myRole, processIncomingSignals]);

  // Setup WebRTC & Canvas Streaming when session status === "playing"
  useEffect(() => {
    if (!isOpen || !activeRoom || activeRoom.status !== "playing") {
      if (peerConnectionRef.current) {
        try {
          peerConnectionRef.current.close();
        } catch {}
        peerConnectionRef.current = null;
      }
      dataChannelRef.current = null;
      setLatestRelayFrame(null);
      setConnectionState("connecting");
      return;
    }

    const roomId = activeRoom.id;
    let frameRelayTimer: ReturnType<typeof setInterval> | null = null;
    let streamAttachTimer: ReturnType<typeof setInterval> | null = null;

    if (typeof RTCPeerConnection !== "undefined") {
      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionRef.current = pc;

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          postSignal(
            roomId,
            myRole === "host" ? "guest" : "host",
            "webrtc-ice",
            e.candidate
          );
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setConnectionState("webrtc-live");
        }
      };

      if (myRole === "host") {
        // Create low-latency DataChannel for Player 2 controller inputs and link cable packets
        const dc = pc.createDataChannel("p2-controller", { ordered: true });
        dataChannelRef.current = dc;
        dc.onopen = () => setConnectionState("webrtc-live");
        dc.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === "link-packet") {
              const targetWin = hostIframeRef.current?.contentWindow as any;
              targetWin?.postMessage(
                {
                  type: "VAULT_LINK_PACKET_IN",
                  kind: msg.kind,
                  data: msg.data,
                  fast: msg.fast,
                },
                "*"
              );
              setLinkPacketsCount((c) => c + 1);
            } else if (typeof msg.buttonIndex === "number") {
              injectPlayer2InputOnHost(msg.buttonIndex, Boolean(msg.pressed));
            }
          } catch {}
        };

        // Host receives Guest's video track in link mode
        pc.ontrack = (ev) => {
          const [remoteStream] = ev.streams;
          if (remoteStream && peerVideoRef.current) {
            peerVideoRef.current.srcObject = remoteStream;
            peerVideoRef.current.play().catch(() => {});
            setConnectionState("webrtc-live");
          }
        };

        // Wait for EmulatorJS WebGL canvas inside hostIframeRef and attach captureStream(30)
        let streamAttached = false;
        streamAttachTimer = setInterval(async () => {
          if (streamAttached) return;
          try {
            const iframeDoc = hostIframeRef.current?.contentDocument;
            const canvas = iframeDoc?.querySelector(
              "#mobile-emulator-container canvas"
            ) as HTMLCanvasElement | null;
            if (canvas && typeof canvas.captureStream === "function") {
              streamAttached = true;
              const stream = canvas.captureStream(30);
              stream.getTracks().forEach((track) => pc.addTrack(track, stream));
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              await postSignal(roomId, "guest", "webrtc-offer", offer);
            }
          } catch {}
        }, 1000);
      } else {
        // Guest receives video stream and opens DataChannel
        pc.ontrack = (ev) => {
          const [remoteStream] = ev.streams;
          const targetVideo = isLinkMode ? peerVideoRef.current : guestVideoRef.current;
          if (remoteStream && targetVideo) {
            targetVideo.srcObject = remoteStream;
            targetVideo.play().catch(() => {});
            setConnectionState("webrtc-live");
          }
        };

        pc.ondatachannel = (ev) => {
          const dc = ev.channel;
          dataChannelRef.current = dc;
          dc.onopen = () => setConnectionState("webrtc-live");
          dc.onmessage = (msgEv) => {
            try {
              const msg = JSON.parse(msgEv.data);
              if (msg.type === "link-packet") {
                const targetWin = guestIframeRef.current?.contentWindow as any;
                targetWin?.postMessage(
                  {
                    type: "VAULT_LINK_PACKET_IN",
                    kind: msg.kind,
                    data: msg.data,
                    fast: msg.fast,
                  },
                  "*"
                );
                setLinkPacketsCount((c) => c + 1);
              }
            } catch {}
          };
        };

        // In link-cable mode, Guest also captures and sends their canvas back to Host
        if (isLinkMode) {
          let guestStreamAttached = false;
          streamAttachTimer = setInterval(async () => {
            if (guestStreamAttached) return;
            try {
              const iframeDoc = guestIframeRef.current?.contentDocument;
              const canvas = iframeDoc?.querySelector(
                "#mobile-emulator-container canvas"
              ) as HTMLCanvasElement | null;
              if (canvas && typeof canvas.captureStream === "function") {
                guestStreamAttached = true;
                const stream = canvas.captureStream(30);
                stream.getTracks().forEach((track) => pc.addTrack(track, stream));
              }
            } catch {}
          }, 1000);
        }
      }
    }

    // Host also runs a lightweight canvas snapshot relay fallback so Guest always sees video even across strict NATs
    if (myRole === "host") {
      const offscreenCanvas = document.createElement("canvas");
      offscreenCanvas.width = 384;
      offscreenCanvas.height = 288;
      const ctx = offscreenCanvas.getContext("2d");

      frameRelayTimer = setInterval(() => {
        try {
          const iframeDoc = hostIframeRef.current?.contentDocument;
          const srcCanvas = iframeDoc?.querySelector(
            "#mobile-emulator-container canvas"
          ) as HTMLCanvasElement | null;
          if (srcCanvas && ctx && srcCanvas.width > 0) {
            ctx.drawImage(srcCanvas, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
            const dataUrl = offscreenCanvas.toDataURL("image/jpeg", 0.52);
            if (dataUrl && dataUrl.length > 100) {
              postSignal(roomId, "guest", "frame-sync", dataUrl);
            }
          }
        } catch {}
      }, 650);
    }

    return () => {
      if (frameRelayTimer) clearInterval(frameRelayTimer);
      if (streamAttachTimer) clearInterval(streamAttachTimer);
      if (peerConnectionRef.current) {
        try {
          peerConnectionRef.current.close();
        } catch {}
        peerConnectionRef.current = null;
      }
      dataChannelRef.current = null;
    };
  }, [
    isOpen,
    activeRoom?.id,
    activeRoom?.status,
    myRole,
    injectPlayer2InputOnHost,
    postSignal,
  ]);

  // Transmit Player 2 button state from Guest to Host (via WebRTC DataChannel or Signal Relay)
  const sendGuestControllerInput = useCallback(
    (buttonIndex: number, pressed: boolean) => {
      if (!activeRoom || activeRoom.status !== "playing") return;
      setActiveP2Buttons((prev) => ({ ...prev, [buttonIndex]: pressed }));

      const payload = JSON.stringify({
        buttonIndex,
        pressed,
        value: pressed ? 1 : 0,
        timestamp: Date.now(),
      });

      const dc = dataChannelRef.current;
      if (dc && dc.readyState === "open") {
        try {
          dc.send(payload);
          return;
        } catch {}
      }

      postSignal(activeRoom.id, "host", "p2-input", payload);
    },
    [activeRoom, postSignal]
  );

  // Dual Physical Bluetooth Xbox Gamepad + Keyboard Listener for Host (Player 1) & Guest (Player 2)
  useEffect(() => {
    if (!isOpen || !activeRoom || activeRoom.status !== "playing") {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (myRole !== "guest") return;
      if (
        document.activeElement &&
        (document.activeElement.tagName === "INPUT" ||
          document.activeElement.tagName === "TEXTAREA")
      ) {
        return;
      }

      const mapped = P2_KEY_TO_BUTTON[e.code];
      if (mapped) {
        e.preventDefault();
        if (!pressedKeysRef.current.has(e.code)) {
          pressedKeysRef.current.add(e.code);
          sendGuestControllerInput(mapped.index, true);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (myRole !== "guest") return;
      const mapped = P2_KEY_TO_BUTTON[e.code];
      if (mapped) {
        e.preventDefault();
        if (pressedKeysRef.current.has(e.code)) {
          pressedKeysRef.current.delete(e.code);
          sendGuestControllerInput(mapped.index, false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // Poll physical Bluetooth Xbox controllers via W3C Gamepad API for both Player 1 (Host) and Player 2 (Guest)
    let prevLibretroState: Record<number, boolean> = {};
    let animId: number;

    const pollGamepad = () => {
      const rawPads =
        typeof navigator !== "undefined" && navigator.getGamepads
          ? (navigator.getGamepads() as unknown as ReadonlyArray<GamepadLike | null>)
          : [];
      const selectedPad = selectGamepadForRole(rawPads, myRole);

      if (selectedPad) {
        const nextState = extractLibretroStateFromGamepad(selectedPad);
        const deltas = diffGamepadStates(prevLibretroState, nextState);
        if (deltas.length > 0) {
          prevLibretroState = nextState;
          for (const evt of deltas) {
            if (myRole === "host") {
              injectPlayerInputOnHost(0, evt.buttonIndex, evt.pressed);
            } else {
              sendGuestControllerInput(evt.buttonIndex, evt.pressed);
            }
          }
        }
      }
      animId = requestAnimationFrame(pollGamepad);
    };
    animId = requestAnimationFrame(pollGamepad);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      cancelAnimationFrame(animId);
      pressedKeysRef.current.clear();
    };
  }, [isOpen, activeRoom, myRole, injectPlayerInputOnHost, sendGuestControllerInput]);

  // Listen for outbound virtual Link Cable packets emitted from the local EmulatorJS iframe
  useEffect(() => {
    if (!isOpen || !activeRoom || activeRoom.status !== "playing" || !isLinkMode) {
      return;
    }

    const handleWindowMessage = (e: MessageEvent) => {
      if (e.data?.type === "VAULT_LINK_PACKET_OUT") {
        const { kind, data, fast } = e.data;
        const payloadObj = {
          type: "link-packet",
          kind,
          data,
          fast,
          timestamp: Date.now(),
        };
        const payloadStr = JSON.stringify(payloadObj);

        // Try direct WebRTC DataChannel first for sub-millisecond latency
        const dc = dataChannelRef.current;
        if (dc && dc.readyState === "open") {
          try {
            dc.send(payloadStr);
            setLinkPacketsCount((c) => c + 1);
            return;
          } catch {}
        }

        // Fallback to server signaling queue if WebRTC DataChannel isn't open yet
        const targetRole = myRole === "host" ? "guest" : "host";
        postSignal(activeRoom.id, targetRole, "link-packet", {
          kind,
          data,
          fast,
        });
        setLinkPacketsCount((c) => c + 1);
      }
    };

    window.addEventListener("message", handleWindowMessage);
    return () => {
      window.removeEventListener("message", handleWindowMessage);
    };
  }, [isOpen, activeRoom?.id, activeRoom?.status, isLinkMode, myRole, postSignal]);

  // Room Actions
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMutatingRoom) return;
    setIsMutatingRoom(true);
    setErrorBanner(null);

    try {
      if (typeof window !== "undefined" && playerName.trim()) {
        localStorage.setItem("rom_vault_mp_name", playerName.trim());
      }

      const initialGameCandidate =
        allGames.find((g) => g.id === selectedGameId) ||
        systemGames[0] ||
        null;

      const res = await fetch("/roms/api/multiplayer/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:
            roomNameInput.trim() ||
            `${playerName.trim() || "Player 1"}'s 2P Retro Room`,
          playerId: clientId,
          playerName: playerName.trim() || "Player 1",
          systemId: selectedSystemId,
          gameId: initialGameCandidate?.id || null,
          gameTitle: initialGameCandidate?.displayTitle || null,
          gameFileName: initialGameCandidate?.romFileName || null,
          gameCoverUrl:
            initialGameCandidate?.media.artworkFront ||
            initialGameCandidate?.media.artwork3d ||
            initialGameCandidate?.media.screenTitle ||
            null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorBanner(data.error || "Failed to create room.");
      } else {
        lastSignalIdRef.current = 0;
        setMyRole("host");
        setActiveRoom(data.room);
        setSelectedSystemId(data.room.systemId);
        setSelectedGameId(data.room.gameId || "");
      }
    } catch {
      setErrorBanner("Network error while creating room.");
    } finally {
      setIsMutatingRoom(false);
    }
  };

  const handleJoinRoom = async (targetRoomId: string) => {
    const cleanCode = targetRoomId.trim().toUpperCase();
    if (!cleanCode || isMutatingRoom) return;
    setIsMutatingRoom(true);
    setErrorBanner(null);

    try {
      if (typeof window !== "undefined" && playerName.trim()) {
        localStorage.setItem("rom_vault_mp_name", playerName.trim());
      }

      const res = await fetch(
        `/roms/api/multiplayer/rooms/${encodeURIComponent(cleanCode)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "join",
            playerId: clientId,
            playerName: playerName.trim() || "Player 2",
          }),
        }
      );

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorBanner(data.error || "Could not join room.");
      } else {
        lastSignalIdRef.current = 0;
        setMyRole(data.role || "guest");
        setActiveRoom(data.room);
        if (Array.isArray(data.chat)) setChatMessages(data.chat);
      }
    } catch {
      setErrorBanner("Network error while joining room.");
    } finally {
      setIsMutatingRoom(false);
    }
  };

  const handleSelectSystemOrGame = async (newSystemId: string, game: GameItem | null) => {
    if (!activeRoom || myRole !== "host") return;
    setSelectedSystemId(newSystemId);
    setSelectedGameId(game?.id || "");

    try {
      const res = await fetch(
        `/roms/api/multiplayer/rooms/${encodeURIComponent(activeRoom.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "select_game",
            playerId: clientId,
            systemId: newSystemId,
            gameId: game?.id || null,
            gameTitle: game?.displayTitle || null,
            gameFileName: game?.romFileName || null,
            gameCoverUrl:
              game?.media.artworkFront ||
              game?.media.artwork3d ||
              game?.media.screenTitle ||
              null,
          }),
        }
      );
      const data = await res.json();
      if (data.success && data.room) {
        setActiveRoom(data.room);
        if (Array.isArray(data.chat)) setChatMessages(data.chat);
      }
    } catch {}
  };

  const handleSelectGuestGame = async (game: GameItem | null) => {
    if (!activeRoom || myRole !== "guest" || !game) return;
    try {
      const res = await fetch(
        `/roms/api/multiplayer/rooms/${encodeURIComponent(activeRoom.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "select_guest_game",
            playerId: clientId,
            systemId: game.system.toLowerCase(),
            gameId: game.id,
            gameTitle: game.displayTitle || game.baseName,
            gameFileName: game.romFileName,
            gameCoverUrl:
              game.media.artworkFront ||
              game.media.artwork3d ||
              game.media.screenTitle ||
              null,
          }),
        }
      );
      const data = await res.json();
      if (data.success && data.room) {
        setActiveRoom(data.room);
        if (Array.isArray(data.chat)) setChatMessages(data.chat);
        setIsSelectingGuestGame(false);
      }
    } catch {}
  };

  const handleToggleReady = async () => {
    if (!activeRoom || isMutatingRoom) return;
    setIsMutatingRoom(true);
    setErrorBanner(null);

    try {
      const res = await fetch(
        `/roms/api/multiplayer/rooms/${encodeURIComponent(activeRoom.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "toggle_ready",
            playerId: clientId,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorBanner(data.error || "Failed to toggle Ready state.");
      } else {
        setActiveRoom(data.room);
        if (Array.isArray(data.chat)) setChatMessages(data.chat);
      }
    } catch {
      setErrorBanner("Network error toggling Ready status.");
    } finally {
      setIsMutatingRoom(false);
    }
  };

  const handleLaunchSession = async () => {
    if (!activeRoom || myRole !== "host" || !activeRoom.canStart || isMutatingRoom) return;
    setIsMutatingRoom(true);
    setErrorBanner(null);

    try {
      const res = await fetch(
        `/roms/api/multiplayer/rooms/${encodeURIComponent(activeRoom.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "start_session",
            playerId: clientId,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorBanner(data.error || "Cannot start session yet.");
      } else {
        setActiveRoom(data.room);
        if (Array.isArray(data.chat)) setChatMessages(data.chat);
      }
    } catch {
      setErrorBanner("Failed to launch multiplayer session.");
    } finally {
      setIsMutatingRoom(false);
    }
  };

  const handleReturnToLobby = async () => {
    if (!activeRoom) return;
    try {
      const res = await fetch(
        `/roms/api/multiplayer/rooms/${encodeURIComponent(activeRoom.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "return_lobby",
            playerId: clientId,
          }),
        }
      );
      const data = await res.json();
      if (data.success && data.room) {
        setActiveRoom(data.room);
        if (Array.isArray(data.chat)) setChatMessages(data.chat);
      }
    } catch {}
  };

  const handleLeaveRoom = async () => {
    if (!activeRoom) {
      onClose();
      return;
    }
    const leavingId = activeRoom.id;
    setActiveRoom(null);
    setChatMessages([]);
    try {
      await fetch(`/roms/api/multiplayer/rooms/${encodeURIComponent(leavingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "leave",
          playerId: clientId,
        }),
      });
      fetchRoomsList();
    } catch {}
  };

  // Submit room chat message while maintaining input focus and preventing any page scroll jump
  const submitRoomChat = async () => {
    const trimmed = chatInput.trim();
    if (!trimmed || !activeRoom || isSendingChat) {
      chatInputRef.current?.focus({ preventScroll: true });
      return;
    }

    setChatInput("");
    setIsSendingChat(true);
    requestAnimationFrame(() => {
      chatInputRef.current?.focus({ preventScroll: true });
    });

    try {
      const res = await fetch(
        `/roms/api/multiplayer/rooms/${encodeURIComponent(activeRoom.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "chat",
            playerId: clientId,
            playerName,
            message: trimmed,
          }),
        }
      );
      const data = await res.json();
      if (data.success && Array.isArray(data.chat)) {
        setChatMessages(data.chat);
        setTimeout(() => scrollChatToBottom(true), 40);
      }
    } catch {
      setChatInput(trimmed);
    } finally {
      setIsSendingChat(false);
      requestAnimationFrame(() => {
        chatInputRef.current?.focus({ preventScroll: true });
      });
    }
  };

  const handleCopyRoomCode = () => {
    if (!activeRoom) return;
    navigator.clipboard?.writeText(activeRoom.id).catch(() => {});
    setCopiedRoomCode(true);
    setTimeout(() => setCopiedRoomCode(false), 2000);
  };

  if (!isOpen) return null;

  const isPlaying = Boolean(activeRoom && activeRoom.status === "playing");
  const amIReady =
    activeRoom &&
    (myRole === "host"
      ? activeRoom.host.isReady
      : Boolean(activeRoom.guest?.isReady));

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md ${
        isPlaying ? "p-0 sm:p-2" : "p-2 sm:p-4"
      }`}
    >
      <div
        className={`relative w-full md:w-[98vw] max-w-[99vw] 2xl:max-w-[1920px] bg-zinc-950 flex flex-col overflow-hidden ${
          isPlaying
            ? "h-full sm:h-[97vh] rounded-none sm:rounded-2xl border-0 sm:border border-white/15 shadow-2xl"
            : "h-[95vh] sm:h-[96vh] rounded-2xl border border-white/15 shadow-2xl"
        }`}
      >
        {/* Top Modal Header */}
        {activeRoom && activeRoom.status === "playing" ? (
          <div className="shrink-0 flex items-center justify-between px-3 sm:px-5 py-2 sm:py-2.5 bg-zinc-950/95 border-b border-white/10 z-30">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <span className="shrink-0 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {activeRoom.systemId.toUpperCase()}
              </span>
              <h2 className="text-xs sm:text-sm font-bold text-white truncate max-w-[140px] xs:max-w-[200px] sm:max-w-md">
                {isLinkMode && myRole === "guest"
                  ? (activeRoom.guestGameTitle || activeRoom.gameTitle)
                  : activeRoom.gameTitle}
              </h2>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-white/10 shrink-0">
                {myRole === "host" ? "Player 1 (Host)" : "Player 2 (Challenger)"}
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={handleReturnToLobby}
                className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg sm:rounded-xl text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition cursor-pointer"
                title="Leave emulator and go back to room lobby"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Room</span>
              </button>

              <button
                type="button"
                onClick={handleLeaveRoom}
                className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg sm:rounded-xl text-xs font-bold bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 transition cursor-pointer"
                title="Disconnect and leave the room"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Leave Room</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg sm:rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-3.5 bg-zinc-900/90 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-600/25">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-sm sm:text-base font-black tracking-tight text-white uppercase">
                    2-Player Retro Multiplayer Arena
                  </h2>
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    Unified Libretro Netplay
                  </span>
                  {activeRoom && (
                    <button
                      type="button"
                      onClick={handleCopyRoomCode}
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-xs font-mono font-bold text-amber-300 transition cursor-pointer"
                      title="Copy Room Code"
                    >
                      <span>{activeRoom.id}</span>
                      {copiedRoomCode ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3 text-zinc-400" />
                      )}
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400">
                  {activeRoom
                    ? `Room Lobby: "${activeRoom.name}" • Select an emulator & game, chat, and both Ready Up to launch!`
                    : "Create a custom room as Host (Port 1) or join an open room as Challenger (Port 2)."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {activeRoom && (
                <button
                  type="button"
                  onClick={handleLeaveRoom}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 transition cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Leave Room</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition cursor-pointer"
                title="Close Multiplayer Window"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {errorBanner && (
          <div className="shrink-0 px-6 py-2.5 bg-red-950/80 border-b border-red-500/30 text-xs text-red-200 flex items-center justify-between">
            <span>{errorBanner}</span>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="text-red-300 hover:text-white font-bold cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* VIEW 1: ROOM DIRECTORY & CREATION */}
        {!activeRoom && (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 sm:p-6 overflow-y-auto">
            {/* Left Column: Create a Room */}
            <div className="lg:col-span-5 flex flex-col gap-4 bg-zinc-900/60 border border-white/10 rounded-2xl p-5">
              <div className="flex items-center gap-2.5">
                <Plus className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">
                  1. Create a 2-Player Multiplayer Room (Host)
                </h3>
              </div>
              <p className="text-xs text-zinc-400">
                Create a custom chat &amp; netplay room. As Host, you control Player 1 (Port 1) and choose the retro console emulator and game ROM.
              </p>

              <form onSubmit={handleCreateRoom} className="space-y-4 mt-1">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                    Your Player Handle
                  </label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    maxLength={32}
                    placeholder="Enter your player handle..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white focus:outline-none focus:border-emerald-500/60"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                    Custom Room Name
                  </label>
                  <input
                    type="text"
                    value={roomNameInput}
                    onChange={(e) => setRoomNameInput(e.target.value)}
                    maxLength={60}
                    placeholder={`${playerName || "Player 1"}'s Retro Arcade Room`}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white focus:outline-none focus:border-emerald-500/60"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                    Initial Console Emulator Core
                  </label>
                  <select
                    value={selectedSystemId}
                    onChange={(e) => {
                      setSelectedSystemId(e.target.value);
                      setSelectedGameId("");
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white focus:outline-none focus:border-emerald-500/60"
                  >
                    {MULTIPLAYER_SYSTEMS.map((sys) => (
                      <option key={sys.id} value={sys.id}>
                        {sys.label} — {sys.core}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={isMutatingRoom}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/25 transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Gamepad2 className="w-4 h-4" />
                  <span>Create Multiplayer Room</span>
                </button>
              </form>

              <div className="pt-4 border-t border-white/10">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Have a Direct Room Code?
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    placeholder="e.g. RM-4829"
                    maxLength={12}
                    className="flex-1 px-3.5 py-2 rounded-xl bg-zinc-950 border border-white/10 text-sm font-mono uppercase text-white focus:outline-none focus:border-emerald-500/60"
                  />
                  <button
                    type="button"
                    onClick={() => handleJoinRoom(joinCodeInput)}
                    disabled={!joinCodeInput.trim() || isMutatingRoom}
                    className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs font-bold text-white border border-white/10 transition cursor-pointer"
                  >
                    Join by Code
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Active Multiplayer Rooms */}
            <div className="lg:col-span-7 flex flex-col bg-zinc-900/60 border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <Radio className="w-5 h-5 text-emerald-400 animate-pulse" />
                  <h3 className="text-base font-bold text-white">
                    Live Multiplayer Rooms ({rooms.length})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={fetchRoomsList}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-white/10 transition cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRooms ? "animate-spin" : ""}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {rooms.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-16 px-4 border border-dashed border-white/10 rounded-xl bg-zinc-950/40">
                  <Users className="w-10 h-10 text-zinc-600 mb-3" />
                  <p className="text-sm font-bold text-zinc-300">
                    No active multiplayer rooms right now
                  </p>
                  <p className="text-xs text-zinc-500 mt-1 max-w-md">
                    Create a room on the left to become the Host, pick a retro console &amp; game, and invite Player 2!
                  </p>
                </div>
              ) : (
                <div className="space-y-3 overflow-y-auto pr-1">
                  {rooms.map((rm) => {
                    const sysMeta = getSystemMeta(rm.systemId);
                    const isFull = Boolean(rm.guest);
                    return (
                      <div
                        key={rm.id}
                        className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-zinc-950/90 border border-white/10 hover:border-emerald-500/40 transition"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider text-white ${sysMeta.badgeColor}`}
                          >
                            {sysMeta.shortLabel}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white truncate">
                                {rm.name}
                              </span>
                              <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                {rm.id}
                              </span>
                            </div>
                            <p className="text-xs text-zinc-400 truncate mt-0.5">
                              {rm.gameTitle ? (
                                <>
                                  Game: <strong className="text-zinc-200">{rm.gameTitle}</strong>
                                </>
                              ) : (
                                "Selecting game in lobby..."
                              )}{" "}
                              • Host: <span className="text-emerald-300">{rm.host.displayName}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                              rm.status === "playing"
                                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                                : isFull
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            }`}
                          >
                            {rm.status === "playing"
                              ? "In Session (2/2)"
                              : isFull
                              ? "Lobby Full (2/2)"
                              : "Open (1/2 Players)"}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleJoinRoom(rm.id)}
                            disabled={isMutatingRoom}
                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition cursor-pointer"
                          >
                            {isFull ? "Reconnect" : "Join as Player 2"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 2: PRE-GAME LOBBY (GAME & EMULATOR SELECTION, CHAT, READY-UP, AND "GO!" BUTTON) */}
        {activeRoom && activeRoom.status !== "playing" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Mobile Tab Switcher */}
            <div className="lg:hidden shrink-0 flex items-center gap-2 px-4 py-2.5 bg-zinc-950 border-b border-white/10">
              <button
                type="button"
                onClick={() => setMobileLobbyTab("setup")}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer ${
                  mobileLobbyTab === "setup"
                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30"
                    : "bg-zinc-900 text-zinc-400 hover:text-white"
                }`}
              >
                <Gamepad2 className="w-4 h-4" />
                <span>1. Game Setup</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileLobbyTab("chat")}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer relative ${
                  mobileLobbyTab === "chat"
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                    : "bg-zinc-900 text-zinc-400 hover:text-white"
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                <span>2. Room Chat ({chatMessages.length})</span>
                {chatMessages.length > 0 && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                )}
              </button>
            </div>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 p-4 sm:p-6 overflow-y-auto">
              {/* Left / Center (7 cols): Players Ready Deck + Host Emulator & Game Selector */}
              <div className={`lg:col-span-7 flex flex-col gap-5 overflow-y-auto pr-1 ${mobileLobbyTab === "setup" ? "flex" : "hidden lg:flex"}`}>
                {/* Dual Controller Player Slots */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Player 1 (Host) Card */}
                  <div
                    className={`p-4 rounded-2xl border transition ${
                      activeRoom.host.isReady
                        ? "bg-emerald-950/30 border-emerald-500/50 shadow-lg shadow-emerald-900/20"
                        : "bg-zinc-900/70 border-white/10"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 rounded bg-red-600/20 border border-red-500/40 text-[10px] font-black uppercase tracking-wider text-red-300">
                        Controller Port 1 • Host
                      </span>
                      {myRole === "host" ? (
                        <button
                          type="button"
                          onClick={handleToggleReady}
                          disabled={isMutatingRoom}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider transition cursor-pointer shadow ${
                            activeRoom.host.isReady
                              ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 ring-1 ring-emerald-400"
                              : "bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-black shadow-amber-500/30 ring-2 ring-amber-300 animate-pulse"
                          }`}
                        >
                          {activeRoom.host.isReady ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>READY ✓</span>
                            </>
                          ) : (
                            <>
                              <Circle className="w-3.5 h-3.5 fill-black/20" />
                              <span>READY UP!</span>
                            </>
                          )}
                        </button>
                      ) : activeRoom.host.isReady ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
                          <CheckCircle2 className="w-4 h-4" /> READY
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-400">
                          <Circle className="w-3.5 h-3.5" /> Not Ready
                        </span>
                      )}
                    </div>
                    <div className="text-base font-black text-white truncate">
                      {activeRoom.host.displayName}
                      {myRole === "host" && (
                        <span className="ml-2 text-[11px] font-normal text-zinc-400">(You)</span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {isLinkMode
                        ? "Selects Game Boy system • Runs Player 1 handheld instance"
                        : "Selects target emulator & ROM • Runs primary Libretro core"}
                    </p>
                  </div>

                  {/* Player 2 (Guest) Card */}
                  <div
                    className={`p-4 rounded-2xl border transition ${
                      activeRoom.guest?.isReady
                        ? "bg-emerald-950/30 border-emerald-500/50 shadow-lg shadow-emerald-900/20"
                        : "bg-zinc-900/70 border-white/10"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 rounded bg-indigo-600/20 border border-indigo-500/40 text-[10px] font-black uppercase tracking-wider text-indigo-300">
                        {isLinkMode ? "Link Port 2 • Challenger" : "Controller Port 2 • Challenger"}
                      </span>
                      {activeRoom.guest ? (
                        myRole === "guest" ? (
                          <button
                            type="button"
                            onClick={handleToggleReady}
                            disabled={isMutatingRoom}
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider transition cursor-pointer shadow ${
                              activeRoom.guest.isReady
                                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 ring-1 ring-emerald-400"
                                : "bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-black shadow-amber-500/30 ring-2 ring-amber-300 animate-pulse"
                            }`}
                          >
                            {activeRoom.guest.isReady ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>READY ✓</span>
                              </>
                            ) : (
                              <>
                                <Circle className="w-3.5 h-3.5 fill-black/20" />
                                <span>READY UP!</span>
                              </>
                            )}
                          </button>
                        ) : activeRoom.guest.isReady ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
                            <CheckCircle2 className="w-4 h-4" /> READY
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-400">
                            <Circle className="w-3.5 h-3.5" /> Not Ready
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-amber-400 animate-pulse font-semibold">
                          Waiting for P2...
                        </span>
                      )}
                    </div>
                  {activeRoom.guest ? (
                    <>
                      <div className="text-base font-black text-white truncate">
                        {activeRoom.guest.displayName}
                        {myRole === "guest" && (
                          <span className="ml-2 text-[11px] font-normal text-zinc-400">(You)</span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-1">
                        {isLinkMode
                          ? "Selects own Game Boy cartridge • Runs Player 2 handheld instance"
                          : "Bound to Libretro Port 2 controller • Synchronized stream"}
                      </p>
                    </>
                  ) : (
                    <div>
                      <div className="text-sm font-bold text-zinc-400">
                        Open Slot — Share Code{" "}
                        <span className="font-mono text-amber-300">{activeRoom.id}</span>
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Ask Player 2 to open Multiplayer and join room {activeRoom.id}.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Game & Emulator Selection Panel */}
              <div className="flex-1 flex flex-col bg-zinc-900/60 border border-white/10 rounded-2xl p-5">
                {isLinkMode && (
                  <div className="flex items-center gap-3 p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/40 text-xs text-indigo-200 mb-4">
                    <Cable className="w-5 h-5 text-indigo-400 shrink-0" />
                    <div className="flex-1">
                      <div className="font-bold text-indigo-300 flex items-center gap-2">
                        <span>Game Boy Virtual Link Cable Mode</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-indigo-500/30 text-indigo-200 border border-indigo-400/40">
                          Independent Handhelds
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-300 mt-0.5">
                        Each player runs their own Game Boy with their personal save file. Guest can choose any Game Boy cartridge from the library (e.g. Pokémon Red vs. Pokémon Blue) to trade and battle over the link cable!
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-2">
                    <Tv className="w-5 h-5 text-red-400" />
                    <h3 className="text-sm sm:text-base font-bold text-white">
                      2. Console Emulator &amp; Game Selection
                    </h3>
                  </div>
                  <span className="text-xs text-zinc-400">
                    {myRole === "host"
                      ? "You are the Host — choose an emulator & game below"
                      : "Host is selecting the console emulator & game"}
                  </span>
                </div>

                {/* Selected Game Banner */}
                <div className="flex items-center gap-4 p-3.5 rounded-xl bg-zinc-950 border border-white/10 mb-4">
                  {activeRoom.gameCoverUrl || selectedGameObj?.media.artworkFront ? (
                    <img
                      src={
                        activeRoom.gameCoverUrl ||
                        selectedGameObj?.media.artworkFront ||
                        ""
                      }
                      alt={activeRoom.gameTitle || "Selected Game"}
                      className="w-14 h-14 rounded-lg object-cover border border-white/10 shrink-0 bg-zinc-900"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-zinc-900 border border-white/10 flex items-center justify-center shrink-0">
                      <Gamepad2 className="w-6 h-6 text-zinc-600" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-600 text-white">
                        {isLinkMode ? "P1 Cartridge" : getSystemMeta(activeRoom.systemId).shortLabel}
                      </span>
                      <span className="text-xs font-mono text-zinc-400">
                        Core: {activeRoom.emulatorCore}
                      </span>
                    </div>
                    <div className="text-base font-black text-white truncate mt-0.5">
                      {activeRoom.gameTitle || "No game selected yet — pick a ROM below"}
                    </div>
                  </div>
                </div>

                {/* Link Cable Mode: Cartridge & Emulator Selector for Player 2 */}
                {isLinkMode && (
                  <div className="p-4 rounded-xl bg-zinc-950 border border-indigo-500/40 mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                        <Cable className="w-4 h-4" />
                        <span>{myRole === "guest" ? "2. Your Link Cable Handheld & Cartridge" : "Player 2 Handheld Cartridge"}</span>
                      </span>
                      {myRole === "guest" && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                          Independent Handheld
                        </span>
                      )}
                    </div>

                    {/* Active P2 Cartridge Display */}
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/90 border border-white/10 mb-3">
                      {activeRoom.guestGameCoverUrl || guestSelectedGameObj?.media.artworkFront ? (
                        <img
                          src={
                            activeRoom.guestGameCoverUrl ||
                            guestSelectedGameObj?.media.artworkFront ||
                            ""
                          }
                          alt={activeRoom.guestGameTitle || "Guest Game"}
                          className="w-12 h-12 rounded-lg object-cover border border-white/10 shrink-0 bg-zinc-900"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-zinc-900 border border-white/10 flex items-center justify-center shrink-0">
                          <Gamepad2 className="w-5 h-5 text-zinc-600" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-indigo-600 text-white">
                            {getSystemMeta(selectedGuestSystemId || activeRoom.guestSystemId || activeRoom.systemId).shortLabel}
                          </span>
                          <span className="text-sm font-bold text-white truncate">
                            {activeRoom.guestGameTitle || activeRoom.gameTitle || "Choose a Cartridge Below"}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          {myRole === "guest"
                            ? activeRoom.guestGameTitle
                              ? "✓ Cartridge locked in. You can choose any different game below anytime."
                              : "Choose any cartridge below from the library to play over the link cable."
                            : activeRoom.guestGameTitle
                            ? "Custom cartridge chosen by Player 2"
                            : "Matching Host cartridge (Player 2 can pick their own ROM below)"}
                        </p>
                      </div>
                    </div>

                    {/* Guest Cartridge & Emulator Selector */}
                    {myRole === "guest" && (
                      <div className="pt-3 border-t border-white/10 flex flex-col gap-3">
                        {/* If multiple link-cable ready emulators (e.g. GB and GBC), show emulator switcher */}
                        {allowedGuestSystems.length > 1 && (
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                              Link-Cable Handheld Core:
                            </label>
                            <div className="flex items-center gap-2">
                              {allowedGuestSystems.map((sysId) => {
                                const isCurrentSys =
                                  (selectedGuestSystemId || activeRoom.guestSystemId || activeRoom.systemId).toLowerCase() ===
                                  sysId.toLowerCase();
                                const meta = getSystemMeta(sysId);
                                return (
                                  <button
                                    key={sysId}
                                    type="button"
                                    onClick={() => setSelectedGuestSystemId(sysId)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 border ${
                                      isCurrentSys
                                        ? "bg-indigo-600 border-indigo-400 text-white shadow-md shadow-indigo-600/30"
                                        : "bg-zinc-900 border-white/10 text-zinc-400 hover:text-white"
                                    }`}
                                  >
                                    <Cable className="w-3.5 h-3.5" />
                                    <span>{meta.name} ({meta.shortLabel})</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={guestGameSearchQuery}
                            onChange={(e) => setGuestGameSearchQuery(e.target.value)}
                            placeholder={`Search ${getSystemMeta(selectedGuestSystemId || activeRoom.guestSystemId || activeRoom.systemId).shortLabel} cartridges (${guestSystemGames.length} available)...`}
                            className="w-full pl-8 pr-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-xs text-white focus:outline-none focus:border-indigo-500/60"
                          />
                        </div>

                        <div className="max-h-[220px] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 pr-1">
                          {guestSystemGames.map((g) => {
                            const isSelected =
                              (activeRoom.guestGameId || activeRoom.gameId) === g.id;
                            return (
                              <button
                                key={g.id}
                                type="button"
                                onClick={() => handleSelectGuestGame(g)}
                                className={`flex items-center gap-2.5 p-2 rounded-xl border text-left transition cursor-pointer ${
                                  isSelected
                                    ? "bg-indigo-600/30 border-indigo-400 text-white shadow-md shadow-indigo-600/20"
                                    : "bg-zinc-900/80 hover:bg-zinc-800 border-white/10 text-zinc-300"
                                }`}
                              >
                                <div className="w-8 h-8 rounded bg-zinc-800 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                                  {g.media.artworkFront ? (
                                    <img
                                      src={g.media.artworkFront}
                                      alt={g.displayTitle}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <Gamepad2 className="w-4 h-4 text-zinc-500" />
                                  )}
                                </div>
                                <span className="text-xs font-semibold truncate flex-1">
                                  {g.displayTitle}
                                </span>
                                {isSelected && (
                                  <Check className="w-4 h-4 text-indigo-400 shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Host Controls for changing Console Emulator and Game */}
                {myRole === "host" ? (
                  <div className="flex-1 flex flex-col gap-3 min-h-0">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                          Target Retro Console Emulator
                        </label>
                        <select
                          value={selectedSystemId}
                          onChange={(e) => {
                            const nextSys = e.target.value;
                            const firstGame =
                              allGames.find(
                                (g) => g.system.toLowerCase() === nextSys.toLowerCase()
                              ) || null;
                            handleSelectSystemOrGame(nextSys, firstGame);
                          }}
                          className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/10 text-xs font-semibold text-white focus:outline-none focus:border-emerald-500/60"
                        >
                          {MULTIPLAYER_SYSTEMS.map((sys) => (
                            <option key={sys.id} value={sys.id}>
                              {sys.label} ({sys.core})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                          Search {getSystemMeta(selectedSystemId).shortLabel} Catalog ({systemGames.length} shown)
                        </label>
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={gameSearchQuery}
                            onChange={(e) => setGameSearchQuery(e.target.value)}
                            placeholder="Filter games by title..."
                            className="w-full pl-8 pr-3 py-2 rounded-xl bg-zinc-950 border border-white/10 text-xs text-white focus:outline-none focus:border-emerald-500/60"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 max-h-[240px] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 pr-1">
                      {systemGames.map((g) => {
                        const isSelected = activeRoom.gameId === g.id;
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => handleSelectSystemOrGame(selectedSystemId, g)}
                            className={`flex items-center gap-2.5 p-2 rounded-xl border text-left transition cursor-pointer ${
                              isSelected
                                ? "bg-emerald-600/20 border-emerald-500 text-white"
                                : "bg-zinc-950/70 hover:bg-zinc-800/70 border-white/10 text-zinc-300"
                            }`}
                          >
                            <div className="w-8 h-8 rounded bg-zinc-900 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                              {g.media.artworkFront || g.media.artwork3d ? (
                                <img
                                  src={g.media.artworkFront || g.media.artwork3d || ""}
                                  alt={g.displayTitle}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Gamepad2 className="w-4 h-4 text-zinc-600" />
                              )}
                            </div>
                            <span className="text-xs font-semibold truncate flex-1">
                              {g.displayTitle}
                            </span>
                            {isSelected && (
                              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  !isLinkMode && (
                    <div className="p-4 rounded-xl bg-zinc-950/80 border border-white/10 text-xs text-zinc-300 mb-2">
                      <div className="flex items-center gap-2 mb-1 text-sm font-bold text-white">
                        <Gamepad2 className="w-4 h-4 text-emerald-400" />
                        <span>2-Player Co-op / VS Room</span>
                      </div>
                      <p className="text-zinc-400 leading-relaxed">
                        Host (<strong className="text-white">{activeRoom.host.displayName}</strong>) selected <strong className="text-white">{activeRoom.gameTitle || "a game"}</strong> on <strong className="text-white">{getSystemMeta(activeRoom.systemId).name}</strong>. You are assigned to Controller Port 2. Hit <strong className="text-amber-400">READY UP</strong> below when you are ready to play!
                      </p>
                    </div>
                  )
                )}

                {/* Ready-Up & "GO!" Action Bar (Sticky at bottom of setup deck) */}
                <div className="sticky bottom-0 z-20 mt-5 pt-4 pb-2 bg-zinc-950/95 backdrop-blur-md border-t border-white/15 flex flex-wrap items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={handleToggleReady}
                    disabled={isMutatingRoom}
                    className={`flex-1 min-w-[200px] py-4 px-6 rounded-2xl font-black text-sm sm:text-base tracking-wide transition-all flex items-center justify-center gap-3 cursor-pointer shadow-2xl ${
                      amIReady
                        ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border-2 border-emerald-400 shadow-emerald-600/40 ring-4 ring-emerald-500/20 hover:scale-[1.02] active:scale-[0.98]"
                        : "bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-300 text-black border-2 border-amber-300 shadow-amber-500/40 ring-4 ring-amber-500/20 animate-pulse hover:scale-[1.02] active:scale-[0.98]"
                    }`}
                  >
                    {amIReady ? (
                      <>
                        <CheckCircle2 className="w-6 h-6" />
                        <span>YOU ARE READY ✓ (Click to Unready)</span>
                      </>
                    ) : (
                      <>
                        <Gamepad2 className="w-6 h-6 fill-black/20" />
                        <span>CLICK TO READY UP!</span>
                      </>
                    )}
                  </button>

                  {myRole === "host" ? (
                    <button
                      type="button"
                      onClick={handleLaunchSession}
                      disabled={!activeRoom.canStart || isMutatingRoom}
                      className={`flex-1 min-w-[220px] py-4 px-8 rounded-2xl font-black text-sm sm:text-base uppercase tracking-wider transition-all flex items-center justify-center gap-3 ${
                        activeRoom.canStart
                          ? "bg-gradient-to-r from-red-600 via-amber-500 to-emerald-500 hover:brightness-110 text-white shadow-2xl shadow-emerald-500/40 ring-4 ring-emerald-500/20 animate-pulse cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                          : "bg-zinc-900 text-zinc-500 border border-white/10 cursor-not-allowed"
                      }`}
                    >
                      <Play className="w-6 h-6 fill-current" />
                      <span>
                        {activeRoom.canStart
                          ? "GO! Launch 2P Session"
                          : !activeRoom.guest
                          ? "Waiting for Player 2..."
                          : !activeRoom.host.isReady
                          ? "You must Ready Up first"
                          : "Waiting for Player 2 to Ready Up..."}
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleToggleReady}
                      disabled={isMutatingRoom}
                      className={`flex-1 min-w-[200px] py-4 px-5 rounded-2xl border-2 text-center text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        activeRoom.canStart
                          ? "bg-emerald-950/80 border-emerald-400 text-emerald-300 animate-pulse hover:bg-emerald-900 shadow-lg shadow-emerald-900/30"
                          : amIReady
                          ? "bg-zinc-900/80 border-white/10 text-zinc-300 hover:bg-zinc-800"
                          : "bg-amber-950/40 border-amber-500/40 hover:bg-amber-900/40 text-amber-300 shadow-lg shadow-amber-900/20 animate-pulse"
                      }`}
                    >
                      {activeRoom.canStart ? (
                        <span>🚀 Both Players Ready! Waiting for Host to hit GO...</span>
                      ) : amIReady ? (
                        <span>⏳ You are Ready! Waiting for Host to Ready Up...</span>
                      ) : (
                        <span>👉 Tap here or click Ready Up to lock in!</span>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column (5 cols): Built-in Lobby Chat */}
            <div className={`lg:col-span-5 flex flex-col bg-zinc-900/60 border border-white/10 rounded-2xl overflow-hidden h-[520px] lg:h-auto ${mobileLobbyTab === "chat" ? "flex" : "hidden lg:flex"}`}>
              <div className="px-4 py-3 bg-zinc-950/80 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-white">
                    3. Room Lobby Chat
                  </span>
                </div>
                <span className="text-[11px] text-zinc-400">
                  Real-time room comms
                </span>
              </div>

              {/* Ready Status Bar inside Chat */}
              <div className="px-4 py-2 bg-zinc-950/95 border-b border-white/10 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-zinc-400 font-bold">Your Status:</span>
                  {amIReady ? (
                    <span className="text-emerald-400 font-black flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> READY
                    </span>
                  ) : (
                    <span className="text-amber-400 font-black flex items-center gap-1 animate-pulse">
                      <Circle className="w-3.5 h-3.5" /> NOT READY
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleToggleReady}
                  disabled={isMutatingRoom}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition cursor-pointer shadow ${
                    amIReady
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                      : "bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-black shadow-amber-500/30 ring-2 ring-amber-300 animate-pulse"
                  }`}
                >
                  {amIReady ? "Unready" : "Ready Up Now"}
                </button>
              </div>

              <div
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto p-4 space-y-2.5"
              >
                {chatMessages.map((msg) => {
                  if (msg.senderRole === "system") {
                    return (
                      <div
                        key={msg.id}
                        className="px-3 py-2 rounded-xl bg-indigo-950/40 border border-indigo-500/25 text-xs text-indigo-200 flex items-center gap-2"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span>{msg.message}</span>
                      </div>
                    );
                  }
                  const isHostMsg = msg.senderRole === "host";
                  return (
                    <div
                      key={msg.id}
                      className="p-2.5 rounded-xl bg-zinc-950/80 border border-white/5 text-xs"
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${
                            isHostMsg
                              ? "bg-red-600/20 text-red-300 border border-red-500/30"
                              : "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                          }`}
                        >
                          {isHostMsg ? "P1 Host" : "P2 Guest"}
                        </span>
                        <span className="font-bold text-white">{msg.senderName}</span>
                      </div>
                      <p className="text-zinc-300 break-words leading-relaxed">
                        {msg.message}
                      </p>
                    </div>
                  );
                })}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitRoomChat();
                }}
                className="p-3 bg-zinc-950 border-t border-white/10 flex items-center gap-2"
              >
                <input
                  ref={chatInputRef}
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      e.stopPropagation();
                      submitRoomChat();
                    }
                  }}
                  placeholder="Type a message to your 2P partner and hit Enter..."
                  maxLength={400}
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-xs text-white focus:outline-none focus:border-emerald-500/60"
                />
                <button
                  type="submit"
                  onMouseDown={(e) => e.preventDefault()}
                  disabled={!chatInput.trim()}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </form>
            </div>
          </div>
        </div>
        )}

        {/* VIEW 3: SYNCHRONIZED 2-PLAYER LIBRETRO SESSION */}
        {activeRoom && activeRoom.status === "playing" && (
          <div className="flex-1 flex flex-col overflow-hidden bg-black w-full h-full">
            {/* Shared Unified Libretro Screen Area */}
            <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden w-full h-full">
              {isLinkMode ? (
                <div className="relative w-full h-full bg-black flex items-center justify-center">
                  {myRole === "host" && activeRoom.gameId ? (
                    <iframe
                      ref={hostIframeRef}
                      src={`/roms/play/${encodeURIComponent(activeRoom.gameId)}?autostart=1&multiplayer=link-host`}
                      title={activeRoom.gameTitle || "Host Game Boy"}
                      className="w-full h-full border-0"
                      allow="autoplay; fullscreen; gamepad"
                    />
                  ) : (
                    <iframe
                      ref={guestIframeRef}
                      src={`/roms/play/${encodeURIComponent(activeRoom.guestGameId || activeRoom.gameId || "")}?autostart=1&multiplayer=link-guest`}
                      title={activeRoom.guestGameTitle || activeRoom.gameTitle || "Guest Game Boy"}
                      className="w-full h-full border-0"
                      allow="autoplay; fullscreen; gamepad"
                    />
                  )}

                  {/* Floating Picture-in-Picture "Cable Cam" showing partner's Game Boy */}
                  {linkPipVisible ? (
                    <div
                      className={`absolute top-3 right-3 z-20 rounded-xl overflow-hidden border border-white/20 bg-zinc-950/95 shadow-2xl transition-all duration-300 ${
                        linkPipExpanded
                          ? "w-64 h-56 sm:w-80 sm:h-72"
                          : "w-32 h-28 sm:w-48 sm:h-44"
                      }`}
                    >
                      <div className="px-2 py-1 bg-zinc-900 border-b border-white/10 flex items-center justify-between text-[10px] sm:text-[11px] font-bold text-white select-none">
                        <div className="flex items-center gap-1 truncate">
                          <Cable className="w-3 h-3 text-indigo-400 shrink-0" />
                          <span className="truncate">
                            {myRole === "host"
                              ? `${activeRoom.guest?.displayName || "Player 2"}'s Screen`
                              : `${activeRoom.host.displayName}'s Screen`}
                          </span>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => setLinkPipExpanded((v) => !v)}
                            className="p-1 hover:bg-white/10 rounded text-zinc-300 hover:text-white cursor-pointer"
                            title={linkPipExpanded ? "Minimize" : "Expand"}
                          >
                            {linkPipExpanded ? (
                              <Minimize2 className="w-3 h-3" />
                            ) : (
                              <Maximize2 className="w-3 h-3" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setLinkPipVisible(false)}
                            className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-white cursor-pointer"
                            title="Hide Cable Cam"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="relative w-full h-[calc(100%-24px)] bg-black flex items-center justify-center">
                        <video
                          ref={peerVideoRef}
                          playsInline
                          autoPlay
                          muted
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setLinkPipVisible(true)}
                      className="absolute top-3 right-3 z-20 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-indigo-500/40 text-[10px] font-bold text-indigo-300 shadow-lg backdrop-blur-sm cursor-pointer"
                      title="Show partner's Game Boy screen"
                    >
                      <Cable className="w-3 h-3 text-indigo-400" />
                      <span>Cable Cam</span>
                    </button>
                  )}
                </div>
              ) : myRole === "host" && activeRoom.gameId ? (
                <iframe
                  ref={hostIframeRef}
                  src={`/roms/play/${encodeURIComponent(activeRoom.gameId)}?autostart=1&multiplayer=host`}
                  title={activeRoom.gameTitle || "Unified 2-Player Emulator"}
                  className="w-full h-full border-0"
                  allow="autoplay; fullscreen; gamepad"
                />
              ) : (
                <div className="relative w-full h-full flex flex-col items-center justify-center bg-black">
                  {/* WebRTC Live Stream Video */}
                  <div className="flex-1 w-full min-h-0 relative flex items-center justify-center bg-black overflow-hidden">
                    <video
                      ref={guestVideoRef}
                      playsInline
                      autoPlay
                      muted={isGuestMuted}
                      className={`w-full h-full object-contain ${
                        connectionState === "webrtc-live" ? "block" : "hidden"
                      }`}
                    />

                    {/* Instant Frame-Sync Fallback Image */}
                    {connectionState !== "webrtc-live" && latestRelayFrame && (
                      <img
                        src={latestRelayFrame}
                        alt="Synchronized 2P Game Screen"
                        className="w-full h-full object-contain select-none"
                      />
                    )}

                    {connectionState !== "webrtc-live" && !latestRelayFrame && (
                      <div className="flex flex-col items-center justify-center text-center p-6">
                        <div className="w-9 h-9 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
                        <p className="text-sm font-bold text-white">
                          Synchronizing with Host&apos;s Unified Libretro Session...
                        </p>
                        <p className="text-xs text-zinc-400 mt-1">
                          Binding your keyboard &amp; gamepad to Controller Port 2
                        </p>
                      </div>
                    )}

                    {/* Guest Audio Mute Toggle */}
                    <button
                      type="button"
                      onClick={() => setIsGuestMuted((m) => !m)}
                      className="absolute top-3 right-3 p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200 border border-white/10 transition cursor-pointer"
                      title={isGuestMuted ? "Unmute Stream" : "Mute Stream"}
                    >
                      {isGuestMuted ? (
                        <VolumeX className="w-4 h-4 text-red-400" />
                      ) : (
                        <Volume2 className="w-4 h-4 text-emerald-400" />
                      )}
                    </button>
                  </div>

                  {/* Interactive Player 2 Virtual Gamepad Deck (Mirrors Player 1's On-Screen Gamepad) */}
                  <div className="w-full shrink-0 bg-zinc-950/95 border-t border-white/10 px-3 sm:px-6 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] flex items-center justify-between touch-none select-none">
                    <div className="w-full max-w-lg mx-auto flex items-end justify-between gap-2 sm:gap-6">
                      {/* Left Side: L Shoulder + Cross D-Pad */}
                      <div className="flex flex-col items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onMouseDown={() => sendGuestControllerInput(10, true)}
                          onMouseUp={() => sendGuestControllerInput(10, false)}
                          onMouseLeave={() => sendGuestControllerInput(10, false)}
                          onTouchStart={(e) => {
                            e.preventDefault();
                            sendGuestControllerInput(10, true);
                          }}
                          onTouchEnd={(e) => {
                            e.preventDefault();
                            sendGuestControllerInput(10, false);
                          }}
                          className={`w-16 h-7 rounded-lg font-black text-xs border tracking-wider transition-transform select-none cursor-pointer flex items-center justify-center ${
                            activeP2Buttons[10]
                              ? "bg-indigo-600 text-white border-indigo-400 scale-95 shadow-md shadow-indigo-500/40"
                              : "bg-zinc-900 text-zinc-300 border-white/15 hover:bg-zinc-800"
                          }`}
                        >
                          L
                        </button>

                        {/* D-Pad Cross */}
                        <div className="relative w-[112px] h-[112px] flex items-center justify-center">
                          {/* Center Cross Pivot */}
                          <div className="absolute w-9 h-9 bg-zinc-900/90 border border-white/10 rounded-sm pointer-events-none flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-zinc-700/60" />
                          </div>

                          {/* Up Button */}
                          <button
                            type="button"
                            onMouseDown={() => sendGuestControllerInput(4, true)}
                            onMouseUp={() => sendGuestControllerInput(4, false)}
                            onMouseLeave={() => sendGuestControllerInput(4, false)}
                            onTouchStart={(e) => {
                              e.preventDefault();
                              sendGuestControllerInput(4, true);
                            }}
                            onTouchEnd={(e) => {
                              e.preventDefault();
                              sendGuestControllerInput(4, false);
                            }}
                            className={`absolute top-0 left-[38px] w-9 h-9 rounded-t-xl rounded-b-none border font-bold text-xs flex items-center justify-center select-none cursor-pointer transition-transform ${
                              activeP2Buttons[4]
                                ? "bg-indigo-600 text-white border-indigo-400 scale-95"
                                : "bg-zinc-900 text-zinc-200 border-white/15 hover:bg-zinc-800"
                            }`}
                            title="Up"
                          >
                            ▲
                          </button>

                          {/* Down Button */}
                          <button
                            type="button"
                            onMouseDown={() => sendGuestControllerInput(5, true)}
                            onMouseUp={() => sendGuestControllerInput(5, false)}
                            onMouseLeave={() => sendGuestControllerInput(5, false)}
                            onTouchStart={(e) => {
                              e.preventDefault();
                              sendGuestControllerInput(5, true);
                            }}
                            onTouchEnd={(e) => {
                              e.preventDefault();
                              sendGuestControllerInput(5, false);
                            }}
                            className={`absolute bottom-0 left-[38px] w-9 h-9 rounded-b-xl rounded-t-none border font-bold text-xs flex items-center justify-center select-none cursor-pointer transition-transform ${
                              activeP2Buttons[5]
                                ? "bg-indigo-600 text-white border-indigo-400 scale-95"
                                : "bg-zinc-900 text-zinc-200 border-white/15 hover:bg-zinc-800"
                            }`}
                            title="Down"
                          >
                            ▼
                          </button>

                          {/* Left Button */}
                          <button
                            type="button"
                            onMouseDown={() => sendGuestControllerInput(6, true)}
                            onMouseUp={() => sendGuestControllerInput(6, false)}
                            onMouseLeave={() => sendGuestControllerInput(6, false)}
                            onTouchStart={(e) => {
                              e.preventDefault();
                              sendGuestControllerInput(6, true);
                            }}
                            onTouchEnd={(e) => {
                              e.preventDefault();
                              sendGuestControllerInput(6, false);
                            }}
                            className={`absolute top-[38px] left-0 w-9 h-9 rounded-l-xl rounded-r-none border font-bold text-xs flex items-center justify-center select-none cursor-pointer transition-transform ${
                              activeP2Buttons[6]
                                ? "bg-indigo-600 text-white border-indigo-400 scale-95"
                                : "bg-zinc-900 text-zinc-200 border-white/15 hover:bg-zinc-800"
                            }`}
                            title="Left"
                          >
                            ◀
                          </button>

                          {/* Right Button */}
                          <button
                            type="button"
                            onMouseDown={() => sendGuestControllerInput(7, true)}
                            onMouseUp={() => sendGuestControllerInput(7, false)}
                            onMouseLeave={() => sendGuestControllerInput(7, false)}
                            onTouchStart={(e) => {
                              e.preventDefault();
                              sendGuestControllerInput(7, true);
                            }}
                            onTouchEnd={(e) => {
                              e.preventDefault();
                              sendGuestControllerInput(7, false);
                            }}
                            className={`absolute top-[38px] right-0 w-9 h-9 rounded-r-xl rounded-l-none border font-bold text-xs flex items-center justify-center select-none cursor-pointer transition-transform ${
                              activeP2Buttons[7]
                                ? "bg-indigo-600 text-white border-indigo-400 scale-95"
                              : "bg-zinc-900 text-zinc-200 border-white/15 hover:bg-zinc-800"
                            }`}
                            title="Right"
                          >
                            ▶
                          </button>
                        </div>
                      </div>

                      {/* Center: Select & Start Pills */}
                      <div className="flex flex-col items-center justify-end pb-2 gap-2.5 shrink-0">
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 select-none">
                          Port 2
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onMouseDown={() => sendGuestControllerInput(2, true)}
                            onMouseUp={() => sendGuestControllerInput(2, false)}
                            onTouchStart={(e) => {
                              e.preventDefault();
                              sendGuestControllerInput(2, true);
                            }}
                            onTouchEnd={(e) => {
                              e.preventDefault();
                              sendGuestControllerInput(2, false);
                            }}
                            className={`px-3 py-1.5 rounded-full font-black text-[9px] tracking-wider border transition-transform select-none cursor-pointer ${
                              activeP2Buttons[2]
                                ? "bg-amber-500 text-black border-amber-300 scale-95"
                                : "bg-zinc-900 text-zinc-400 border-white/15 hover:bg-zinc-800"
                            }`}
                          >
                            SELECT
                          </button>
                          <button
                            type="button"
                            onMouseDown={() => sendGuestControllerInput(3, true)}
                            onMouseUp={() => sendGuestControllerInput(3, false)}
                            onTouchStart={(e) => {
                              e.preventDefault();
                              sendGuestControllerInput(3, true);
                            }}
                            onTouchEnd={(e) => {
                              e.preventDefault();
                              sendGuestControllerInput(3, false);
                            }}
                            className={`px-3 py-1.5 rounded-full font-black text-[9px] tracking-wider border transition-transform select-none cursor-pointer ${
                              activeP2Buttons[3]
                                ? "bg-amber-500 text-black border-amber-300 scale-95"
                                : "bg-zinc-900 text-zinc-400 border-white/15 hover:bg-zinc-800"
                            }`}
                          >
                            START
                          </button>
                        </div>
                      </div>

                      {/* Right Side: R Shoulder + Diamond Action Buttons */}
                      <div className="flex flex-col items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onMouseDown={() => sendGuestControllerInput(11, true)}
                          onMouseUp={() => sendGuestControllerInput(11, false)}
                          onMouseLeave={() => sendGuestControllerInput(11, false)}
                          onTouchStart={(e) => {
                            e.preventDefault();
                            sendGuestControllerInput(11, true);
                          }}
                          onTouchEnd={(e) => {
                            e.preventDefault();
                            sendGuestControllerInput(11, false);
                          }}
                          className={`w-16 h-7 rounded-lg font-black text-xs border tracking-wider transition-transform select-none cursor-pointer flex items-center justify-center ${
                            activeP2Buttons[11]
                              ? "bg-indigo-600 text-white border-indigo-400 scale-95 shadow-md shadow-indigo-500/40"
                              : "bg-zinc-900 text-zinc-300 border-white/15 hover:bg-zinc-800"
                          }`}
                        >
                          R
                        </button>

                        {/* Action Diamond (X Top, B Bottom, Y Left, A Right) */}
                        <div className="relative w-[112px] h-[112px] flex items-center justify-center">
                          {/* X Button (Top) */}
                          <button
                            type="button"
                            onMouseDown={() => sendGuestControllerInput(9, true)}
                            onMouseUp={() => sendGuestControllerInput(9, false)}
                            onTouchStart={(e) => {
                              e.preventDefault();
                              sendGuestControllerInput(9, true);
                            }}
                            onTouchEnd={(e) => {
                              e.preventDefault();
                              sendGuestControllerInput(9, false);
                            }}
                            className={`absolute top-0 left-[38px] w-9 h-9 rounded-full font-black text-xs border transition-transform select-none cursor-pointer flex items-center justify-center shadow-md ${
                              activeP2Buttons[9]
                                ? "bg-blue-500 text-white border-blue-300 scale-95 shadow-blue-500/50"
                                : "bg-zinc-900 text-blue-300 border-blue-500/30 hover:bg-zinc-800"
                            }`}
                            title="X"
                          >
                            X
                          </button>

                          {/* B Button (Bottom) */}
                          <button
                            type="button"
                            onMouseDown={() => sendGuestControllerInput(0, true)}
                            onMouseUp={() => sendGuestControllerInput(0, false)}
                            onTouchStart={(e) => {
                              e.preventDefault();
                              sendGuestControllerInput(0, true);
                            }}
                            onTouchEnd={(e) => {
                              e.preventDefault();
                              sendGuestControllerInput(0, false);
                            }}
                            className={`absolute bottom-0 left-[38px] w-9 h-9 rounded-full font-black text-xs border transition-transform select-none cursor-pointer flex items-center justify-center shadow-md ${
                              activeP2Buttons[0]
                                ? "bg-amber-500 text-black border-amber-300 scale-95 shadow-amber-500/50"
                                : "bg-zinc-900 text-amber-300 border-amber-500/30 hover:bg-zinc-800"
                            }`}
                            title="B"
                          >
                            B
                          </button>

                          {/* Y Button (Left) */}
                          <button
                            type="button"
                            onMouseDown={() => sendGuestControllerInput(1, true)}
                            onMouseUp={() => sendGuestControllerInput(1, false)}
                            onTouchStart={(e) => {
                              e.preventDefault();
                              sendGuestControllerInput(1, true);
                            }}
                            onTouchEnd={(e) => {
                              e.preventDefault();
                              sendGuestControllerInput(1, false);
                            }}
                            className={`absolute top-[38px] left-0 w-9 h-9 rounded-full font-black text-xs border transition-transform select-none cursor-pointer flex items-center justify-center shadow-md ${
                              activeP2Buttons[1]
                                ? "bg-emerald-500 text-black border-emerald-300 scale-95 shadow-emerald-500/50"
                                : "bg-zinc-900 text-emerald-300 border-emerald-500/30 hover:bg-zinc-800"
                            }`}
                            title="Y"
                          >
                            Y
                          </button>

                          {/* A Button (Right) */}
                          <button
                            type="button"
                            onMouseDown={() => sendGuestControllerInput(8, true)}
                            onMouseUp={() => sendGuestControllerInput(8, false)}
                            onTouchStart={(e) => {
                              e.preventDefault();
                              sendGuestControllerInput(8, true);
                            }}
                            onTouchEnd={(e) => {
                              e.preventDefault();
                              sendGuestControllerInput(8, false);
                            }}
                            className={`absolute top-[38px] right-0 w-9 h-9 rounded-full font-black text-xs border transition-transform select-none cursor-pointer flex items-center justify-center shadow-md ${
                              activeP2Buttons[8]
                                ? "bg-red-500 text-white border-red-300 scale-95 shadow-red-500/50"
                                : "bg-zinc-900 text-red-300 border-red-500/30 hover:bg-zinc-800"
                            }`}
                            title="A"
                          >
                            A
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
