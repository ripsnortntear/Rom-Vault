import React from "react";

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
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
                if (navigator.getGamepads) {
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

                // 4. Block WebHID and WebUSB device enumeration
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
      {children}
    </>
  );
}
