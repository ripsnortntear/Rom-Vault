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
    // 1. Strip Gamepad haptic actuators & rumble prototypes
    if ("GamepadHapticActuator" in window) {
      try {
        Object.defineProperty(window, "GamepadHapticActuator", {
          value: undefined,
          writable: true,
          configurable: true,
        });
      } catch (e) {}
    }
    if ("Gamepad" in window && window.Gamepad && window.Gamepad.prototype) {
      Object.defineProperty(window.Gamepad.prototype, "vibrationActuator", {
        get: function() { return null; },
        configurable: true,
      });
      Object.defineProperty(window.Gamepad.prototype, "hapticActuators", {
        get: function() { return []; },
        configurable: true,
      });
    }

    // 2. Intercept navigator.getGamepads to sanitize returned pad objects
    if (typeof navigator !== "undefined" && navigator.getGamepads) {
      var origGetGamepads = navigator.getGamepads.bind(navigator);
      navigator.getGamepads = function() {
        var pads = origGetGamepads();
        if (pads) {
          for (var i = 0; i < pads.length; i++) {
            var pad = pads[i];
            if (pad && "vibrationActuator" in pad) {
              try {
                Object.defineProperty(pad, "vibrationActuator", {
                  get: function() { return null; },
                  configurable: true,
                });
              } catch(e) {}
            }
          }
        }
        return pads;
      };
    }

    // 3. Block WebHID & WebUSB device enumeration that trips Windows gamepad drivers
    if (typeof navigator !== "undefined") {
      if ("hid" in navigator) {
        Object.defineProperty(navigator, "hid", {
          get: function() { return undefined; },
          configurable: true,
        });
      }
      if ("usb" in navigator) {
        Object.defineProperty(navigator, "usb", {
          get: function() { return undefined; },
          configurable: true,
        });
      }
      if ("vibrate" in navigator) {
        navigator.vibrate = function() { return false; };
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
