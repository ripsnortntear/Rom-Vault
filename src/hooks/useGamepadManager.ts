"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface GamepadState {
  connected: boolean;
  id: string | null;
  index: number | null;
  needsActivation: boolean;
}

export interface UseGamepadManagerOptions {
  /**
   * Whether gamepad polling and event listeners should be active.
   * Defaults to true. Set false when modal/emulator is not actively mounted.
   */
  enabled?: boolean;
  /**
   * Called on every animation frame with a fresh snapshot of the active gamepad.
   * Runs directly inside the requestAnimationFrame loop to avoid React state lag.
   */
  onPoll?: (gamepad: Gamepad) => void;
  /**
   * Fallback deadzone threshold for analog sticks [0.0 - 1.0]. Defaults to 0.1.
   */
  deadzone?: number;
}

export function useGamepadManager({
  enabled = true,
  onPoll,
  deadzone = 0.1,
}: UseGamepadManagerOptions = {}) {
  const [controllerState, setControllerState] = useState<GamepadState>({
    connected: false,
    id: null,
    index: null,
    needsActivation: false,
  });

  const activeIndexRef = useRef<number | null>(null);
  const onPollRef = useRef(onPoll);
  onPollRef.current = onPoll;

  const isTabActiveRef = useRef(true);
  const rafIdRef = useRef<number | null>(null);

  // Helper to retrieve an actual live snapshot without caching reference objects
  const getLiveGamepad = useCallback((targetIndex: number | null): Gamepad | null => {
    if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
    const gamepads = navigator.getGamepads();
    if (targetIndex !== null && targetIndex >= 0) {
      const pad = gamepads[targetIndex];
      if (pad && pad.connected) return pad;
    }
    // Fallback: search for first valid connected gamepad
    for (let i = 0; i < gamepads.length; i++) {
      const pad = gamepads[i];
      if (pad && pad.connected) return pad;
    }
    return null;
  }, []);

  // Neutralize GamepadHapticActuator to prevent firmware trip across browser sessions
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("GamepadHapticActuator" in window) {
      (window as unknown as { GamepadHapticActuator: unknown }).GamepadHapticActuator = undefined;
    }
  }, []);

  // Frame polling loop
  useEffect(() => {
    if (!enabled) return;
    let running = true;

    const pollLoop = () => {
      if (!running) return;

      if (isTabActiveRef.current) {
        const pad = getLiveGamepad(activeIndexRef.current);

        if (pad) {
          // If the active index shifted or wasn't set, sync it
          if (activeIndexRef.current !== pad.index) {
            activeIndexRef.current = pad.index;
            setControllerState({
              connected: true,
              id: pad.id,
              index: pad.index,
              needsActivation: false,
            });
          }

          // Pure digital/analog button reads ONLY - zero haptic access
          if (onPollRef.current) {
            // Pass sanitized pad instance without touching pad.vibrationActuator
            onPollRef.current(pad);
          }
        } else if (activeIndexRef.current !== null) {
          // In Chromium, gamepads temporarily vanish if inactive or after certain sleep cycles
          // Verify if any controller is available before marking disconnected
          const fallback = getLiveGamepad(null);
          if (!fallback) {
            activeIndexRef.current = null;
            setControllerState({
              connected: false,
              id: null,
              index: null,
              needsActivation: false,
            });
          }
        }
      }

      rafIdRef.current = requestAnimationFrame(pollLoop);
    };

    rafIdRef.current = requestAnimationFrame(pollLoop);

    return () => {
      running = false;
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [enabled, getLiveGamepad]);

  // Window listeners for Connection, Disconnection, Focus, and Visibility
  useEffect(() => {
    if (typeof window === "undefined" || !enabled) return;

    const handleConnected = (e: GamepadEvent) => {
      activeIndexRef.current = e.gamepad.index;
      setControllerState({
        connected: true,
        id: e.gamepad.id,
        index: e.gamepad.index,
        needsActivation: false,
      });
    };

    const handleDisconnected = (e: GamepadEvent) => {
      if (activeIndexRef.current === e.gamepad.index) {
        // Query remaining gamepads before tearing down
        const fallback = getLiveGamepad(null);
        if (fallback) {
          activeIndexRef.current = fallback.index;
          setControllerState({
            connected: true,
            id: fallback.id,
            index: fallback.index,
            needsActivation: false,
          });
        } else {
          activeIndexRef.current = null;
          setControllerState({
            connected: false,
            id: null,
            index: null,
            needsActivation: false,
          });
        }
      }
    };

    const handleFocus = () => {
      isTabActiveRef.current = true;
      // Chrome requires a fresh query on re-focus; inspect live pads immediately
      const pad = getLiveGamepad(activeIndexRef.current);
      if (pad) {
        activeIndexRef.current = pad.index;
        setControllerState({
          connected: true,
          id: pad.id,
          index: pad.index,
          needsActivation: false,
        });
      } else {
        // Mark activation required if user must click into canvas to unfreeze browser permissions
        setControllerState((prev) => ({
          ...prev,
          needsActivation: prev.connected,
        }));
      }
    };

    const handleBlur = () => {
      // Retain active index during blur to prevent virtual emulator port unbinding
      isTabActiveRef.current = false;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        isTabActiveRef.current = false;
      } else {
        handleFocus();
      }
    };

    // User gesture listener to clear needsActivation state
    const handleUserInteraction = () => {
      if (!isTabActiveRef.current) isTabActiveRef.current = true;
      const pad = getLiveGamepad(activeIndexRef.current);
      if (pad) {
        setControllerState((prev) =>
          prev.needsActivation ? { ...prev, needsActivation: false } : prev
        );
      }
    };

    window.addEventListener("gamepadconnected", handleConnected);
    window.addEventListener("gamepaddisconnected", handleDisconnected);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pointerdown", handleUserInteraction);
    window.addEventListener("keydown", handleUserInteraction);

    return () => {
      window.removeEventListener("gamepadconnected", handleConnected);
      window.removeEventListener("gamepaddisconnected", handleDisconnected);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pointerdown", handleUserInteraction);
      window.removeEventListener("keydown", handleUserInteraction);
    };
  }, [enabled, getLiveGamepad]);

  // Utility to map standard axes with deadzone filtering
  const normalizeAxis = useCallback(
    (value: number) => {
      return Math.abs(value) < deadzone ? 0 : value;
    },
    [deadzone]
  );

  return {
    ...controllerState,
    normalizeAxis,
  };
}
