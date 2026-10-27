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

export async function generateMetadata(
  props: PageProps<"/play/[id]">
): Promise<Metadata> {
  const { id } = await props.params;
  const game = await getGameById(id);
  if (!game) return { title: "Game Not Found | ROM Vault" };
  return {
    title: `Playing ${game.displayTitle || game.baseName} | ROM Vault`,
  };
}

export default async function PlayPage(props: PageProps<"/play/[id]">) {
  const { id } = await props.params;
  const game = await getGameById(id);

  if (!game) {
    notFound();
  }

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `
(function() {
  if (typeof window === "undefined") return;
  try {
    // 1. Freeze and wipe GamepadHapticActuator
    window.GamepadHapticActuator = undefined;
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
    if (navigator.getGamepads) {
      const origGetGamepads = navigator.getGamepads.bind(navigator);
      navigator.getGamepads = function() {
        const pads = origGetGamepads();
        if (pads) {
          for (let i = 0; i < pads.length; i++) {
            if (pads[i]) {
              try {
                Object.defineProperty(pads[i], "vibrationActuator", {
                  get: () => null,
                  set: () => {},
                  configurable: false,
                  enumerable: false
                });
                Object.defineProperty(pads[i], "hapticActuators", {
                  get: () => [],
                  set: () => {},
                  configurable: false,
                  enumerable: false
                });
              } catch(e) {}
            }
          }
        }
        return pads;
      };
    }
    // 2. Kill WebHID and WebUSB device enumeration that resets XInput controllers
    if (navigator.hid) {
      navigator.hid.getDevices = () => Promise.resolve([]);
      navigator.hid.requestDevice = () => Promise.reject(new Error("WebHID disabled"));
    }
    if (navigator.usb) {
      navigator.usb.getDevices = () => Promise.resolve([]);
      navigator.usb.requestDevice = () => Promise.reject(new Error("WebUSB disabled"));
    }
    if (navigator.vibrate) {
      navigator.vibrate = () => false;
    }
    // 3. Suppress visibility/fullscreen rejections
    window.addEventListener("unhandledrejection", function(e) {
      var reason = e.reason;
      if (
        reason &&
        (reason.name === "NotAllowedError" ||
         reason.name === "SecurityError" ||
         (reason.message && (
           reason.message.indexOf("not visible") !== -1 ||
           reason.message.indexOf("requestFullscreen") !== -1 ||
           reason.message.indexOf("user gesture") !== -1
         )))
      ) {
        e.preventDefault();
      }
    });
  } catch(e) {}
})();
          `,
        }}
      />
      <main className="fixed inset-0 bg-black flex flex-col justify-center items-center overflow-hidden">
        <MobileEmulatorView
          game={{
            id: game.id,
            title: game.displayTitle,
            system: game.system,
            romFileName: game.romFileName,
            discs: game.discs,
          }}
        />
      </main>
    </>
  );
}
