import "server-only";
import { notFound } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { getGameById } from "@/lib/scanner";
import { MobileEmulatorView } from "@/components/MobileEmulatorView";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

interface PlayPageProps {
  params: Promise<{
    id: string;
  }>;
}

export async function generateMetadata({ params }: PlayPageProps): Promise<Metadata> {
  const { id } = await params;
  const game = await getGameById(id);

  if (!game) {
    return { title: "Game Not Found | ROM Vault" };
  }

  const title = game.displayTitle || game.baseName;
  return {
    title: `Playing ${title} (${game.system.toUpperCase()}) | ROM Vault`,
    description: `Direct browser emulation for ${title} on ROM Vault.`,
  };
}

export default async function PlayPage({ params }: PlayPageProps) {
  const { id } = await params;
  const game = await getGameById(id);

  if (!game) {
    notFound();
  }

  return (
    <>
      {/* 
        SYNCHRONOUS ROOT SANITIZATION:
        Executes immediately in initial HTML parser before React hydration 
        or EmulatorJS can probe haptics/WebHID.
      */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                // 1. Wipe GamepadHapticActuator
                window.GamepadHapticActuator = undefined;
                // Neuter orientation lock crash on iOS Safari
                if (window.screen && window.screen.orientation) {
                  try { window.screen.orientation.lock = function() { return Promise.resolve(); }; } catch(e) {}
                }

                // 2. Lock Gamepad prototype getters
                if (window.Gamepad && window.Gamepad.prototype) {
                  Object.defineProperty(Gamepad.prototype, "vibrationActuator", {
                    get: function() { return null; },
                    set: function() {},
                    configurable: false,
                    enumerable: false
                  });
                  Object.defineProperty(Gamepad.prototype, "hapticActuators", {
                    get: function() { return []; },
                    set: function() {},
                    configurable: false,
                    enumerable: false
                  });
                }

                // 3. Patch navigator.getGamepads to sanitize returned pad objects
                if (navigator.getGamepads) {
                  const origGetGamepads = navigator.getGamepads.bind(navigator);
                  navigator.getGamepads = function() {
                    const pads = origGetGamepads();
                    if (pads) {
                      for (let i = 0; i < pads.length; i++) {
                        const pad = pads[i];
                        if (pad) {
                          try {
                            Object.defineProperty(pad, "vibrationActuator", {
                              get: () => null,
                              configurable: false
                            });
                            Object.defineProperty(pad, "hapticActuators", {
                              get: () => [],
                              configurable: false
                            });
                          } catch(e) {}
                        }
                      }
                    }
                    return pads;
                  };
                }

                // 4. Neutralize WebHID, WebUSB, and navigator.vibrate
                if (navigator.hid) {
                  navigator.hid.getDevices = () => Promise.resolve([]);
                  navigator.hid.requestDevice = () => Promise.reject(new Error("WebHID blocked"));
                }
                if (navigator.usb) {
                  navigator.usb.getDevices = () => Promise.resolve([]);
                  navigator.usb.requestDevice = () => Promise.reject(new Error("WebUSB blocked"));
                }
                if (navigator.vibrate) {
                  navigator.vibrate = () => false;
                }
              } catch (e) {}
            })();
          `,
        }}
      />

      <main className="fixed inset-0 w-screen h-screen bg-black overflow-hidden flex flex-col">
        <MobileEmulatorView
          game={{
            id: game.id,
            title: game.displayTitle || game.baseName,
            system: game.system,
            romFileName: game.romFileName,
            discs: game.discs,
          }}
        />
      </main>
    </>
  );
}
