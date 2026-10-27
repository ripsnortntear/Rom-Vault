import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ROM Vault | Multi-Console Retro Gaming Vault & Browser Emulator",
  description:
    "Browse, preview, download, and play over 6,500 retro games across 14 consoles (NES, SNES, N64, GameCube, GBA, GB, GBC, Sega Genesis, Dreamcast, Saturn, 32X, Master System, and Game Gear) with high-res artwork, video previews, and stories.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function() {
  if (typeof window === "undefined") return;
  try {
    // 1. Freeze and wipe GamepadHapticActuator & vibration prototypes
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

    // 2. Intercept navigator.getGamepads to sanitize returned pad instances
    if (typeof navigator !== "undefined" && navigator.getGamepads) {
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
                  set: () => {},
                  configurable: false,
                  enumerable: false
                });
                Object.defineProperty(pad, "hapticActuators", {
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

    // 3. Kill WebHID and WebUSB device enumeration that resets XInput controllers
    if (typeof navigator !== "undefined") {
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
    }
  } catch (err) {
    console.warn("Haptic/HID override notice:", err);
  }
})();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#070709] text-zinc-100">
        {children}
      </body>
    </html>
  );
}
