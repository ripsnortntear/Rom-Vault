import React from "react";

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                // 1. Permanently delete GamepadHapticActuator interface
                window.GamepadHapticActuator = undefined;

                // 2. Override Gamepad prototype getters
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

                // 3. Patch navigator.getGamepads to strip actuators on every pad instance
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
