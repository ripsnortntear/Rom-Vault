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
    // 1. Neuter GamepadHapticActuator prototype methods before wiping global reference
    if (window.GamepadHapticActuator && window.GamepadHapticActuator.prototype) {
      try {
        GamepadHapticActuator.prototype.playEffect = function() { return Promise.resolve("complete"); };
        GamepadHapticActuator.prototype.pulse = function() { return Promise.resolve(true); };
        GamepadHapticActuator.prototype.reset = function() { return Promise.resolve("complete"); };
      } catch(e) {}
    }
    window.GamepadHapticActuator = undefined;

    // 2. Override Gamepad prototype getters once (prevents continuous Object.defineProperty calls)
    if (window.Gamepad && window.Gamepad.prototype) {
      try {
        Object.defineProperty(Gamepad.prototype, "vibrationActuator", {
          get: function() { return null; },
          set: function() {},
          configurable: true,
          enumerable: false
        });
        Object.defineProperty(Gamepad.prototype, "hapticActuators", {
          get: function() { return []; },
          set: function() {},
          configurable: true,
          enumerable: false
        });
      } catch(e) {}
    }

    // 3. Throttle navigator.getGamepads to 60 FPS (16ms)
    // Prevents Windows XInput / Xbox Wireless Adapter USB endpoint buffer saturation
    if (typeof navigator !== "undefined" && navigator.getGamepads) {
      const origGetGamepads = navigator.getGamepads.bind(navigator);
      let lastPollTime = 0;
      let cachedGamepads = [];

      navigator.getGamepads = function() {
        const now = performance.now();
        if (now - lastPollTime >= 15) {
          lastPollTime = now;
          try {
            cachedGamepads = origGetGamepads();
          } catch(e) {
            cachedGamepads = [];
          }
        }
        return cachedGamepads;
      };
    }

    // 4. Block WebHID and WebUSB device enumeration that resets XInput controllers
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
