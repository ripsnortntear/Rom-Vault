"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { SaveSyncService } from "@/lib/sync-service";

interface EmulatorContainerProps {
  gameId: string;
  emulatorType: "tabstationtoo" | "emulatorjs";
  romUrl: string;
  userId?: string;
}

export default function EmulatorContainer({
  gameId,
  emulatorType,
  romUrl,
  userId = "current",
}: EmulatorContainerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("Initializing cloud saves...");
  const emulatorRef = useRef<HTMLDivElement | null>(null);

  const captureAndUpload = useCallback(async () => {
    try {
      const saveBytes = SaveSyncService.captureSaveFromEmulator(gameId, emulatorType);
      if (saveBytes && saveBytes.byteLength > 0) {
        const saveType = emulatorType === "tabstationtoo" ? "savestate" : "savegame";
        await SaveSyncService.uploadCloudSave(gameId, saveBytes, saveType, 0);
        console.log("[EmulatorContainer] Auto-save successfully synced to MariaDB database.");
      }
    } catch (err) {
      console.error("[EmulatorContainer] Auto-save sync failed:", err);
    }
  }, [gameId, emulatorType]);

  const triggerSyncBeforeExit = useCallback(() => {
    try {
      const bytes = SaveSyncService.captureSaveFromEmulator(gameId, emulatorType);
      if (bytes && bytes.byteLength > 0) {
        SaveSyncService.triggerBeaconExit(userId, gameId, emulatorType, bytes);
      }
    } catch (err) {
      console.warn("[EmulatorContainer] Exit sync warning:", err);
    }
  }, [userId, gameId, emulatorType]);

  useEffect(() => {
    let isMounted = true;

    async function initializeEmulatorWithSaves() {
      try {
        setStatusMessage("Fetching cloud save data...");

        // 1. Determine save type based on system/emulator
        const saveType = emulatorType === "tabstationtoo" ? "savestate" : "savegame";

        // 2. Pull authoritative save from MariaDB via API
        const cloudSave = await SaveSyncService.fetchCloudSave(gameId, saveType, 0);

        if (!isMounted) return;

        if (cloudSave) {
          setStatusMessage("Restoring authoritative save to emulator virtual storage...");
          // 3. Pre-populate virtual storage before emulator boot
          await SaveSyncService.writeSaveToVirtualFileSystem(emulatorType, gameId, cloudSave.bytes);
        } else {
          console.log("[EmulatorContainer] No existing cloud save found. Starting fresh session.");
        }

        setIsLoading(false);
      } catch (error) {
        console.error("[EmulatorContainer] Failed to initialize save synchronization:", error);
        setStatusMessage("Error loading cloud save. Starting session...");
        setIsLoading(false);
      }
    }

    initializeEmulatorWithSaves();

    // 4. Handle graceful exit / tab close synchronization
    const handleBeforeUnload = () => {
      triggerSyncBeforeExit();
    };

    const handlePageHide = () => {
      triggerSyncBeforeExit();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      isMounted = false;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      triggerSyncBeforeExit();
    };
  }, [gameId, emulatorType, triggerSyncBeforeExit]);

  // Periodic Auto-Save Sync Loop (every 60 seconds)
  useEffect(() => {
    if (isLoading) return;

    const intervalId = setInterval(async () => {
      await captureAndUpload();
    }, 60000);

    return () => clearInterval(intervalId);
  }, [isLoading, captureAndUpload]);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-black">
      {isLoading ? (
        <div className="text-white flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
          <p className="text-sm font-mono">{statusMessage}</p>
        </div>
      ) : (
        <div id="emulator-canvas-container" className="w-full h-full relative">
          <div ref={emulatorRef} className="w-full h-full" />
        </div>
      )}
    </div>
  );
}
