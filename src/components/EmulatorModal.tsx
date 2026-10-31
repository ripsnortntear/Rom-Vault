"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useGamepadManager } from "@/hooks/useGamepadManager";
import {
  X,
  Download,
  Gamepad2,
  Keyboard,
  Maximize,
  Minimize,
  HardDrive,
  Info,
  Save,
  CheckCircle2,
  Loader2,
  Disc3,
  Menu,
} from "lucide-react";
import type { GameItem } from "@/types/game";

const BASE_PATH = "/roms";

interface EmulatorModalProps {
  game: GameItem | null;
  onClose: () => void;
}

export function EmulatorModal({
  game,
  onClose,
}: EmulatorModalProps): React.ReactElement | null {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Block WebHID/WebUSB device grabs and neuter Gamepad vibration prototypes
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      if ("GamepadHapticActuator" in window) {
        try {
          Object.defineProperty(window, "GamepadHapticActuator", {
            value: undefined,
            writable: true,
            configurable: true,
          });
        } catch {}
      }
      if (typeof Gamepad !== "undefined" && Gamepad.prototype) {
        try {
          Object.defineProperty(Gamepad.prototype, "vibrationActuator", {
            get: () => null,
            configurable: true,
          });
          Object.defineProperty(Gamepad.prototype, "hapticActuators", {
            get: () => [],
            configurable: true,
          });
        } catch {}
      }
    } catch {}
  }, []);

  // Trap unhandled fullscreen rejections to prevent crashing the modal on mobile
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleUnhandledRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      const isFsError =
        reason?.name === "NotAllowedError" ||
        reason?.name === "SecurityError" ||
        reason?.message?.includes("requestFullscreen") ||
        reason?.message?.includes("user gesture") ||
        reason?.message?.includes("Permissions check failed");

      if (isFsError) {
        e.preventDefault();
        console.warn("[EmulatorModal] Suppressed unhandled fullscreen rejection:", reason?.message || reason);
      }
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  }, []);

  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showFullscreenBars, setShowFullscreenBars] = useState<boolean>(false);
  const hideBarsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveringBarRef = useRef<boolean>(false);

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "loaded">("idle");
  const [mountedCardName, setMountedCardName] = useState<string>("");

  // Dismissable state reset pattern (replaces useEffect setState)
  const [dismissedGameId, setDismissedGameId] = useState<string | null>(null);
  const showNotice = Boolean(game?.id && dismissedGameId !== game.id);

  // Derive initial disc index directly during render
  const defaultDiscIndex = game?.discs && game.romFileName
    ? Math.max(0, game.discs.findIndex((d) => d.fileName === game.romFileName))
    : 0;

  const [discSelection, setDiscSelection] = useState<{ gameId: string; index: number }>({
    gameId: game?.id || "",
    index: defaultDiscIndex >= 0 ? defaultDiscIndex : 0,
  });

  const selectedDiscIndex = discSelection.gameId === game?.id ? discSelection.index : (defaultDiscIndex >= 0 ? defaultDiscIndex : 0);

  const setSelectedDiscIndex = useCallback((index: number) => {
    if (!game?.id) return;
    setDiscSelection({ gameId: game.id, index });
  }, [game]);

  const [gamepadConnected, setGamepadConnected] = useState<boolean>(false);
  const [gamepadId, setGamepadId] = useState<string | null>(null);
  const gamepadNeedsActivation = false;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkInitialPads = () => {
      try {
        if (navigator.getGamepads) {
          const pads = navigator.getGamepads();
          const first = Array.from(pads).find((p) => p && p.connected);
          if (first) {
            setGamepadConnected(true);
            setGamepadId(first.id || "Controller");
          }
        }
      } catch {}
    };

    const handleConnected = (e: GamepadEvent) => {
      setGamepadConnected(true);
      setGamepadId(e.gamepad.id || "Controller");
    };

    const handleDisconnected = () => {
      try {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        const stillConnected = Array.from(pads).some((p) => p && p.connected);
        setGamepadConnected(stillConnected);
        if (!stillConnected) setGamepadId(null);
      } catch {
        setGamepadConnected(false);
        setGamepadId(null);
      }
    };

    window.addEventListener("gamepadconnected", handleConnected);
    window.addEventListener("gamepaddisconnected", handleDisconnected);
    checkInitialPads();

    return () => {
      window.removeEventListener("gamepadconnected", handleConnected);
      window.removeEventListener("gamepaddisconnected", handleDisconnected);
    };
  }, []);

  const resetHideTimer = useCallback(() => {
    if (hideBarsTimerRef.current) {
      clearTimeout(hideBarsTimerRef.current);
      hideBarsTimerRef.current = null;
    }
    setShowFullscreenBars(true);
    hideBarsTimerRef.current = setTimeout(() => {
      if (!isHoveringBarRef.current) {
        setShowFullscreenBars(false);
      }
    }, 4000);
  }, []);

  const handleContainerMouseMove = () => {
    if (isFullscreen) {
      resetHideTimer();
    }
  };

  // Clean timer cleanup on exit/unmount without calling setState inside an effect
  useEffect(() => {
    if (!isFullscreen && hideBarsTimerRef.current) {
      clearTimeout(hideBarsTimerRef.current);
      hideBarsTimerRef.current = null;
    }
  }, [isFullscreen]);

  const handleExit = useCallback(() => {
    const doc = document as unknown as {
      fullscreenElement?: Element;
      webkitFullscreenElement?: Element;
      exitFullscreen?: () => Promise<void>;
      webkitExitFullscreen?: () => Promise<void>;
    };

    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      try {
        if (doc.exitFullscreen) {
          doc.exitFullscreen().catch(() => {});
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
        }
      } catch {}
    }
    setIsFullscreen(false);
    setShowFullscreenBars(false);
    try {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: "VAULT_SAVE_AND_EXIT" }, "*");
      }
    } catch {}
    onClose();
  }, [onClose]);

  const toggleFullscreen = useCallback(async () => {
    const elem = containerRef.current as unknown as {
      requestFullscreen?: () => Promise<void>;
      webkitRequestFullscreen?: () => Promise<void>;
    };
    const doc = document as unknown as {
      fullscreenElement?: Element;
      webkitFullscreenElement?: Element;
      exitFullscreen?: () => Promise<void>;
      webkitExitFullscreen?: () => Promise<void>;
    };

    const isCurrentlyFs = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);

    if (!isCurrentlyFs) {
      if (elem) {
        try {
          if (elem.requestFullscreen) {
            await elem.requestFullscreen();
          } else if (elem.webkitRequestFullscreen) {
            await elem.webkitRequestFullscreen();
          }
        } catch {}
      }
      setIsFullscreen(true);
      resetHideTimer();
    } else {
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        try {
          if (doc.exitFullscreen) {
            await doc.exitFullscreen();
          } else if (doc.webkitExitFullscreen) {
            await doc.webkitExitFullscreen();
          }
        } catch {}
      }
      setIsFullscreen(false);
      setShowFullscreenBars(false);
    }
  }, [resetHideTimer]);

  const handleForceSave = () => {
    setSaveStatus("saving");
    if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage({ type: "VAULT_FORCE_SAVE" }, "*");
      } catch {}
    }
  };

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === "VAULT_GAMEPAD_STATUS") {
        setGamepadConnected(Boolean(e.data.connected));
        if (e.data.id) setGamepadId(e.data.id);
      } else if (e.data?.type === "VAULT_SAVE_STATUS") {
        setSaveStatus(e.data.status);
        if (e.data?.cardName) {
          setMountedCardName(e.data.cardName);
        }
      } else if (e.data?.type === "VAULT_EXIT_READY") {
        onClose();
      } else if (e.data?.type === "VAULT_MOUSE_MOVE") {
        if (document.fullscreenElement) {
          resetHideTimer();
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onClose, resetHideTimer]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as unknown as {
        fullscreenElement?: Element;
        webkitFullscreenElement?: Element;
      };
      const fsActive = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
      setIsFullscreen(fsActive);
      if (!fsActive) {
        setShowFullscreenBars(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === "Escape" && !document.fullscreenElement && !(document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement) {
        handleExit();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleExit, toggleFullscreen]);

  if (!game) {
    return null;
  }

  const activeDisc =
    game.discs && game.discs[selectedDiscIndex]
      ? game.discs[selectedDiscIndex]
      : null;
  const activeRomFileName = activeDisc ? activeDisc.fileName : game.romFileName;
  const activeRomUrl = activeDisc ? activeDisc.romUrl : game.media.rom;
  const activeDiscNum = activeDisc ? activeDisc.discNumber : 1;

  const safeGameId = game.id.includes("%") ? game.id : encodeURIComponent(game.id);
  const ps2BiosUrl = "/roms/api/bios/scph39001.bin?system=ps2";
  const ps2DiscUrl = `/roms/api/roms/${safeGameId}/stream/${encodeURIComponent(activeRomFileName || `${game.displayTitle || game.baseName}.chd`)}`;
  const ps2MemcardUrl = "/roms/api/users/me/cards/active/download?system=ps2";
  const ps2RunnerUrl = `/roms/tabstationtoo/index.html?bios=${encodeURIComponent(ps2BiosUrl)}&disc=${encodeURIComponent(ps2DiscUrl)}&memcard=${encodeURIComponent(ps2MemcardUrl)}`;

  const playerUrl =
    game.system === "ps2"
      ? ps2RunnerUrl
      : `${BASE_PATH}/play/${safeGameId}?file=${encodeURIComponent(activeRomFileName || "")}&system=${encodeURIComponent(game.system)}&disc=${activeDiscNum}`;
  const downloadUrl = activeRomUrl ? `${activeRomUrl}${activeRomUrl.includes("?") ? "&" : "?"}download=1` : "#";

  const renderControls = () => {
    switch (game.system) {
      case "snes":
      case "gba":
        return (
          <>
            <span><strong className="text-zinc-200">Arrows</strong> D-Pad</span>
            <span><strong className="text-zinc-200">Z / X / A / S</strong> B / A / Y / X</span>
            <span><strong className="text-zinc-200">Q / W</strong> L / R</span>
            <span><strong className="text-zinc-200">Enter</strong> Start</span>
            <span><strong className="text-zinc-200">R-Shift</strong> Select</span>
          </>
        );
      case "genesis":
      case "sega32x":
      case "saturn":
        return (
          <>
            <span><strong className="text-zinc-200">Arrows</strong> D-Pad</span>
            <span><strong className="text-zinc-200">A / S / D</strong> A / B / C</span>
            <span><strong className="text-zinc-200">Q / W / E</strong> X / Y / Z</span>
            <span><strong className="text-zinc-200">Enter</strong> Start</span>
          </>
        );
      case "n64":
        return (
          <>
            <span><strong className="text-zinc-200">Arrows</strong> Stick</span>
            <span><strong className="text-zinc-200">Z / X</strong> B / A</span>
            <span><strong className="text-zinc-200">A / S / Q / W</strong> C-Buttons</span>
            <span><strong className="text-zinc-200">Space</strong> Z-Trigger</span>
            <span><strong className="text-zinc-200">Enter</strong> Start</span>
          </>
        );
      case "psx":
        return (
          <>
            <span><strong className="text-zinc-200">Arrows</strong> D-Pad</span>
            <span><strong className="text-zinc-200">Z / X</strong> Square / Cross</span>
            <span><strong className="text-zinc-200">A / S</strong> Triangle / Circle</span>
            <span><strong className="text-zinc-200">Q / W</strong> L1 / R1</span>
            <span><strong className="text-zinc-200">E / R</strong> L2 / R2</span>
            <span><strong className="text-zinc-200">Enter</strong> Start</span>
            <span><strong className="text-zinc-200">R-Shift</strong> Select</span>
          </>
        );
      case "gamecube":
        return (
          <>
            <span><strong className="text-zinc-200">Arrows / Analog</strong> Control Stick</span>
            <span><strong className="text-zinc-200">A / B / X / Y</strong> Action Buttons</span>
            <span><strong className="text-zinc-200">L / R</strong> Triggers</span>
            <span><strong className="text-zinc-200">Z</strong> Z-Button</span>
            <span><strong className="text-zinc-200">Enter</strong> Start</span>
          </>
        );
      case "dreamcast":
        return (
          <>
            <span><strong className="text-zinc-200">Arrows</strong> D-Pad</span>
            <span><strong className="text-zinc-200">A / B / X / Y</strong> Action Buttons</span>
            <span><strong className="text-zinc-200">Q / W</strong> L / R Triggers</span>
            <span><strong className="text-zinc-200">Enter</strong> Start</span>
          </>
        );
      case "ps2":
        return (
          <>
            <span><strong className="text-zinc-200">Arrows / WASD</strong> D-Pad / Left Stick</span>
            <span><strong className="text-zinc-200">J / K</strong> Square / Cross</span>
            <span><strong className="text-zinc-200">I / L</strong> Triangle / Circle</span>
            <span><strong className="text-zinc-200">Q / E</strong> L1 / R1</span>
            <span><strong className="text-zinc-200">1 / 3</strong> L2 / R2</span>
            <span><strong className="text-zinc-200">Enter</strong> Start</span>
            <span><strong className="text-zinc-200">Backspace</strong> Select</span>
          </>
        );
      default:
        return (
          <>
            <span><strong className="text-zinc-200">Arrows</strong> D-Pad</span>
            <span><strong className="text-zinc-200">Z / X</strong> B / A Buttons</span>
            <span><strong className="text-zinc-200">Enter</strong> Start</span>
            <span><strong className="text-zinc-200">R-Shift</strong> Select</span>
          </>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-xl p-0 sm:p-2 md:p-3 overflow-hidden"
      onClick={handleExit}
      role="dialog"
      aria-modal="true"
      aria-label={`Playing ${game.displayTitle}`}
    >
      <div
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
        onMouseMove={handleContainerMouseMove}
        onTouchStart={handleContainerMouseMove}
        className={`relative flex flex-col bg-zinc-950 overflow-hidden ${
          isFullscreen
            ? "fixed inset-0 z-50 w-screen h-screen max-w-none rounded-none border-0 " + (!showFullscreenBars ? "cursor-none" : "")
            : "w-full md:w-[98vw] h-full md:h-[97vh] max-w-[99vw] 2xl:max-w-[1920px] max-h-[98vh] rounded-none md:rounded-2xl border-0 md:border md:border-white/15 shadow-2xl"
        }`}
      >
        {gamepadNeedsActivation && (
          <div className="absolute top-4 right-4 z-50 bg-amber-500/95 text-black px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-xl border border-amber-300 backdrop-blur-md animate-pulse pointer-events-auto">
            Click window or press any button to resume controller
          </div>
        )}

        {/* Invisible edge hover/touch triggers for fullscreen reveal */}
        {isFullscreen && (
          <>
            <div
              className="absolute top-0 inset-x-0 h-12 sm:h-10 z-40 pointer-events-auto"
              onMouseEnter={() => {
                isHoveringBarRef.current = true;
                resetHideTimer();
              }}
              onMouseLeave={() => {
                isHoveringBarRef.current = false;
                resetHideTimer();
              }}
              onTouchStart={() => {
                setShowFullscreenBars(true);
                resetHideTimer();
              }}
              onClick={() => {
                setShowFullscreenBars(true);
                resetHideTimer();
              }}
            />
            <div
              className="absolute bottom-0 inset-x-0 h-8 z-40 pointer-events-auto"
              onMouseEnter={() => {
                isHoveringBarRef.current = true;
                resetHideTimer();
              }}
              onMouseLeave={() => {
                isHoveringBarRef.current = false;
                resetHideTimer();
              }}
              onTouchStart={() => {
                setShowFullscreenBars(true);
                resetHideTimer();
              }}
              onClick={() => {
                setShowFullscreenBars(true);
                resetHideTimer();
              }}
            />
          </>
        )}

        {/* Floating Quick Action Pill (Mobile and Fullscreen Ease of Access) */}
        {isFullscreen && !showFullscreenBars && (
          <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-50 flex items-center gap-1.5 bg-zinc-950/90 backdrop-blur-md border border-white/20 rounded-full p-1 shadow-2xl transition">
            {game.discs && game.discs.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setShowFullscreenBars(true);
                  resetHideTimer();
                }}
                className="min-h-[36px] px-3 py-1 rounded-full text-xs font-bold bg-white/15 hover:bg-white/25 active:scale-95 touch-manipulation text-white flex items-center gap-1.5 transition cursor-pointer"
                title="Switch Disc"
              >
                <Disc3 className="w-3.5 h-3.5 text-red-400" />
                <span>Disc {activeDiscNum}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowFullscreenBars(true);
                resetHideTimer();
              }}
              className="min-h-[36px] px-2.5 sm:px-3 py-1 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 active:scale-95 touch-manipulation text-zinc-200 flex items-center gap-1.5 transition cursor-pointer"
              title="Open Menu"
            >
              <Menu className="w-4 h-4 text-zinc-300" />
              <span className="hidden xs:inline">Menu</span>
            </button>
            <button
              type="button"
              onClick={handleExit}
              className="min-h-[36px] px-3.5 py-1 rounded-full text-xs font-bold bg-red-600 hover:bg-red-500 active:scale-95 touch-manipulation text-white shadow flex items-center gap-1.5 transition cursor-pointer"
              title="Exit Game"
            >
              <X className="w-4 h-4" />
              <span>Exit</span>
            </button>
          </div>
        )}

        {/* Top Header & Warning Notification (Slides in/out in fullscreen) */}
        <div
          onMouseEnter={() => {
            isHoveringBarRef.current = true;
            resetHideTimer();
          }}
          onMouseLeave={() => {
            isHoveringBarRef.current = false;
            resetHideTimer();
          }}
          className={`transition-all duration-300 ease-in-out ${
            isFullscreen
              ? `absolute top-0 inset-x-0 z-30 shadow-2xl ${
                  showFullscreenBars
                    ? "translate-y-0 opacity-100 pointer-events-auto"
                    : "-translate-y-full opacity-0 pointer-events-none"
                }`
              : "relative shrink-0"
          }`}
        >
          {/* Main Top Header Row */}
          <div className="flex items-center justify-between px-3 sm:px-5 py-2.5 sm:py-3.5 border-b border-white/10 bg-zinc-900/95 backdrop-blur-md">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <span
                className={`inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-md text-[10px] sm:text-xs font-bold uppercase tracking-wider text-white shadow shrink-0 ${
                  game.badgeColor || "bg-red-600"
                }`}
              >
                <Gamepad2 className="w-3.5 h-3.5" />
                <span>{game.systemLabel}</span>
                <span className="hidden sm:inline">LIVE EMULATOR</span>
              </span>
              <h2 className="text-sm sm:text-lg font-bold text-white truncate max-w-[130px] xs:max-w-[190px] sm:max-w-md md:max-w-xl lg:max-w-2xl">
                {game.displayTitle}
              </h2>
              {game.discs && game.discs.length > 1 && (
                <div className="hidden md:flex items-center gap-1 bg-black/60 p-1 rounded-lg border border-white/10 shrink-0">
                  <span className="text-[11px] font-semibold text-zinc-400 px-1">Disc:</span>
                  {game.discs.map((disc, idx) => {
                    const isSelected = idx === selectedDiscIndex;
                    return (
                      <button
                        key={disc.discNumber}
                        type="button"
                        onClick={() => setSelectedDiscIndex(idx)}
                        className={`min-h-[28px] min-w-[32px] px-2.5 py-0.5 rounded text-xs font-bold transition cursor-pointer active:scale-95 touch-manipulation ${
                          isSelected
                            ? "bg-red-600 text-white shadow ring-1 ring-red-400"
                            : "text-zinc-400 hover:text-white hover:bg-white/10"
                        }`}
                        title={`Boot Disc ${disc.discNumber} (${disc.fileName})`}
                      >
                        D{disc.discNumber}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {gamepadConnected && (
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                  <Gamepad2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="truncate max-w-[140px]" title={gamepadId || "Gamepad active"}>
                    {gamepadId ? gamepadId.split("(")[0].trim() : "Gamepad active"}
                  </span>
                </span>
              )}
              {saveStatus === "saved" && (
                <span className="hidden lg:inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span suppressHydrationWarning>{mountedCardName ? `${mountedCardName} Synced` : "Memory Card Synced"}</span>
                </span>
              )}
              {saveStatus === "saving" && (
                <span className="hidden lg:inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold bg-amber-950/80 border border-amber-500/40 text-amber-300">
                  <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                  <span>Saving to Cloud...</span>
                </span>
              )}
              {saveStatus === "loaded" && (
                <span className="hidden lg:inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold bg-blue-950/80 border border-blue-500/40 text-blue-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                  <span suppressHydrationWarning>{mountedCardName ? `${mountedCardName} Mounted` : "Card Loaded"}</span>
                </span>
              )}

              <button
                type="button"
                onClick={handleForceSave}
                className="hidden sm:inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-medium bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-200 transition cursor-pointer active:scale-95 touch-manipulation"
                title="Force Save Memory Card to Server Cloud"
              >
                <Save className="w-3.5 h-3.5 text-emerald-400" />
                <span>Save Card</span>
              </button>

              <a
                href={
                  game.system === "psx"
                    ? `${BASE_PATH}/api/users/me/cards/active/download?system=psx&download=1`
                    : game.system === "ps2"
                    ? `${BASE_PATH}/api/users/me/cards/active/download?system=ps2&download=1`
                    : `${BASE_PATH}/api/saves/${encodeURIComponent(game.id)}?system=${encodeURIComponent(game.system)}&download=1`
                }
                className="hidden md:inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-medium bg-white/10 hover:bg-white/20 text-zinc-200 transition"
                title={
                  game.system === "psx"
                    ? "Export User PS1 Virtual Memory Card (.MCR / DuckStation)"
                    : game.system === "ps2"
                    ? "Export User PS2 Virtual Memory Card (.PS2 / PCSX2)"
                    : "Export .SRM Memory Card (for DuckStation / RetroArch)"
                }
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Card</span>
              </a>

              <button
                type="button"
                onClick={toggleFullscreen}
                title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 active:scale-95 touch-manipulation text-zinc-200 transition cursor-pointer"
              >
                {isFullscreen ? (
                  <>
                    <Minimize className="w-4 h-4 text-zinc-200" />
                    <span className="hidden sm:inline">Exit Fullscreen</span>
                  </>
                ) : (
                  <>
                    <Maximize className="w-4 h-4 text-zinc-200" />
                    <span className="hidden sm:inline">Fullscreen</span>
                  </>
                )}
              </button>

              <a
                href={downloadUrl}
                download={activeRomFileName}
                className="hidden lg:inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-medium bg-white/10 hover:bg-white/20 text-zinc-200 transition"
                title={`Download ${activeRomFileName}`}
              >
                <Download className="w-3.5 h-3.5" />
                Download {activeDisc && game.discs && game.discs.length > 1 ? `Disc ${activeDiscNum}` : ""}
              </a>

              <button
                type="button"
                onClick={handleExit}
                className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3.5 sm:px-4 py-1.5 rounded-xl text-xs sm:text-sm font-bold bg-red-600 hover:bg-red-500 active:scale-95 touch-manipulation text-white shadow-md shadow-red-600/30 transition cursor-pointer"
                title="Exit emulator and return to library"
              >
                <X className="w-4 h-4" />
                <span>Exit</span>
              </button>
            </div>
          </div>

          {/* Dedicated Mobile Multi-Disc Switcher Strip */}
          {game.discs && game.discs.length > 1 && (
            <div className="flex md:hidden items-center justify-between px-3 py-2 bg-zinc-950/95 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-1.5 text-xs text-zinc-300 font-semibold shrink-0">
                <Disc3 className="w-4 h-4 text-red-400" />
                <span>Discs:</span>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                {game.discs.map((disc, idx) => {
                  const isSelected = idx === selectedDiscIndex;
                  return (
                    <button
                      key={disc.discNumber}
                      type="button"
                      onClick={() => setSelectedDiscIndex(idx)}
                      className={`min-h-[36px] min-w-[58px] px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer active:scale-95 touch-manipulation flex items-center justify-center gap-1 shadow-sm ${
                        isSelected
                          ? "bg-red-600 text-white ring-2 ring-red-400 shadow-red-600/40"
                          : "bg-zinc-800/90 text-zinc-300 hover:text-white border border-white/10"
                      }`}
                      title={`Boot Disc ${disc.discNumber} (${disc.fileName})`}
                    >
                      <span>Disc {disc.discNumber}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {showNotice && game.playable && (game.system === "saturn" || game.system === "psx" || game.system === "gamecube" || game.system === "dreamcast" || game.system === "ps2") && (
            <div className="bg-amber-950/80 border-b border-amber-600/30 px-4 py-1.5 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <span className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>
                  {game.system === "ps2" ? (
                    <>
                      <strong>PlayStation 2 Notice:</strong> In-browser PS2 emulation runs via PCSX2 WebAssembly &amp; WebGPU (TabStationToo). For optimal 60 FPS performance, use Chrome, Edge, or Brave with hardware acceleration enabled.
                    </>
                  ) : game.system === "gamecube" ? (
                    <>
                      <strong>Nintendo GameCube Notice:</strong> In-browser GameCube emulation requires heavy WebAssembly compute. For best performance, 60 FPS, and hardware rendering, you can also click <strong>Download</strong> and play in desktop{" "}
                      <a
                        href="https://dolphin-emu.org/download/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold underline hover:text-white transition"
                        title="Download Dolphin Emulator"
                      >
                        Dolphin
                      </a>.
                    </>
                  ) : game.system === "dreamcast" ? (
                    <>
                      <strong>Sega Dreamcast Notice:</strong> In-browser Dreamcast emulation runs via WebAssembly. For full 60 FPS and enhanced 3D resolution, you can also click <strong>Download</strong> and play in desktop{" "}
                      <a
                        href="https://flycast.emuplace.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold underline hover:text-white transition"
                        title="Download Flycast"
                      >
                        Flycast
                      </a>{" "}
                      or{" "}
                      <a
                        href="https://redream.io/download"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold underline hover:text-white transition"
                        title="Download Redream"
                      >
                        Redream
                      </a>.
                    </>
                  ) : game.system === "saturn" ? (
                    <>
                      <strong>Sega Saturn Notice:</strong> In-browser Saturn emulation uses software rendering and runs at ~1–5 FPS. For full 60 FPS, click <strong>Download</strong> and play in desktop{" "}
                      <a
                        href="https://buildbot.libretro.com/stable/1.22.2/windows-msvc2010/x86_64/RetroArch-MSVC10-Win64-setup.exe"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold underline hover:text-white transition"
                        title="Download RetroArch Installer (Win64 v1.22.2)"
                      >
                        RetroArch
                      </a>{" "}
                      (Beetle Saturn core).
                    </>
                  ) : (
                    <>
                      <strong>PlayStation Notice:</strong> In-browser PS1 emulation runs via WebAssembly. For full 60 FPS, enhanced 3D resolution, and multi-disc save swapping, you can also click <strong>Download</strong> and play in desktop{" "}
                      <a
                        href="https://duckstation.org/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold underline hover:text-white transition"
                        title="Download DuckStation"
                      >
                        DuckStation
                      </a>{" "}
                      or{" "}
                      <a
                        href="https://buildbot.libretro.com/stable/1.22.2/windows-msvc2010/x86_64/RetroArch-MSVC10-Win64-setup.exe"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold underline hover:text-white transition"
                        title="Download RetroArch Installer (Win64 v1.22.2)"
                      >
                        RetroArch
                      </a>.
                    </>
                  )}
                </span>
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={downloadUrl}
                  download={activeRomFileName}
                  className="underline hover:text-white font-medium shrink-0"
                >
                  Download {game.system === "saturn" || game.system === "psx" || game.system === "dreamcast" || game.system === "gamecube" || game.system === "ps2" ? (activeDisc ? `Disc ${activeDiscNum}` : "Game") : "ROM"}
                </a>
                {game.discs && game.discs.length > 1 && (
                  <span className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-amber-600/40 text-[11px]">
                    <span>Discs:</span>
                    {game.discs.map((d, idx) => (
                      <button
                        key={d.discNumber}
                        type="button"
                        onClick={() => setSelectedDiscIndex(idx)}
                        className={`min-h-[26px] min-w-[28px] px-1.5 py-0.5 rounded border font-mono transition cursor-pointer active:scale-95 touch-manipulation ${
                          idx === selectedDiscIndex
                            ? "bg-amber-600 border-amber-300 text-white font-bold"
                            : "bg-amber-900/60 hover:bg-amber-800 border-amber-500/40 text-amber-200"
                        }`}
                        title={`Boot Disc ${d.discNumber} (${d.fileName})`}
                      >
                        D{d.discNumber}
                      </button>
                    ))}
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => setDismissedGameId(game.id)}
                  className="ml-1 min-h-[32px] min-w-[32px] p-1.5 rounded-md hover:bg-amber-900/80 text-amber-300 hover:text-white transition cursor-pointer active:scale-95 touch-manipulation flex items-center justify-center"
                  title="Dismiss warning"
                  aria-label="Dismiss warning"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div
          className={`bg-black flex items-center justify-center ${
            isFullscreen
              ? "absolute inset-0 w-full h-full z-0"
              : "relative flex-1 overflow-hidden"
          }`}
        >
          {game.playable ? (
            <iframe
              ref={iframeRef}
              key={`${game.id}-${selectedDiscIndex}`}
              title={`Emulator - ${game.displayTitle}${activeDisc ? ` (Disc ${activeDiscNum})` : ""}`}
              src={playerUrl}
              className="w-full h-full border-0"
              allow="autoplay; fullscreen; gamepad; cross-origin-isolated"
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center max-w-xl">
              <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-white/15 flex items-center justify-center mb-4 text-purple-400">
                <HardDrive className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">
                Standalone Emulator Recommended
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed mb-6">
                {game.systemLabel} releases are large full-disc images ({Math.round(game.fileSizeBytes / (1024 * 1024))} MB) optimized for standalone desktop emulators (such as{" "}
                <strong className="text-zinc-200">
                  {game.system === "gamecube" ? (
                    "Dolphin"
                  ) : game.system === "ps2" ? (
                    <a
                      href="https://pcsx2.net/downloads/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-white transition text-zinc-200 font-bold"
                      title="Download PCSX2 (PlayStation 2 Emulator)"
                    >
                      PCSX2
                    </a>
                  ) : (
                    <>
                      Flycast / Redream /{" "}
                      <a
                        href="https://buildbot.libretro.com/stable/1.22.2/windows-msvc2010/x86_64/RetroArch-MSVC10-Win64-setup.exe"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-white transition text-zinc-200 font-bold"
                        title="Download RetroArch Installer (Win64 v1.22.2)"
                      >
                        RetroArch
                      </a>
                    </>
                  )}
                </strong>
                ) for maximum frame rate and audio quality.
              </p>
              <a
                href={downloadUrl}
                download={game.romFileName}
                className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl font-bold text-sm bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/30 transition transform hover:-translate-y-0.5"
              >
                <Download className="w-4 h-4" />
                Download {game.romFileName} ({Math.round(game.fileSizeBytes / (1024 * 1024))} MB)
              </a>
            </div>
          )}
        </div>

        {game.playable && (
          <div
            onMouseEnter={() => {
              isHoveringBarRef.current = true;
              resetHideTimer();
            }}
            onMouseLeave={() => {
              isHoveringBarRef.current = false;
              resetHideTimer();
            }}
            className={`transition-all duration-300 ease-in-out ${
              isFullscreen
                ? `absolute bottom-0 inset-x-0 z-30 shadow-2xl ${
                    showFullscreenBars
                      ? "translate-y-0 opacity-100 pointer-events-auto"
                      : "translate-y-full opacity-0 pointer-events-none"
                  }`
                : "relative shrink-0"
            }`}
          >
            <div className="hidden sm:flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 bg-zinc-900/95 backdrop-blur-md border-t border-white/10 text-xs text-zinc-400">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-zinc-300 font-medium">
                  <Keyboard className="w-3.5 h-3.5 text-red-400" />
                  Controls:
                </span>
                {renderControls()}
              </div>
              <div className="flex items-center gap-3 text-zinc-500">
                <span className="hidden md:inline">Press <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-white/10 text-[10px] font-mono">F11</kbd> for Fullscreen</span>
                {gamepadConnected ? (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                    Controller connected
                  </span>
                ) : (
                  <span>Gamepads automatically detected</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default EmulatorModal;
