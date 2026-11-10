"use client";

import React, { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

const STORAGE_KEY = "oldsmar_admin_exit_url";

export function ExitAdminButton() {
  const [returnUrl, setReturnUrl] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. If document.referrer is provided and is NOT within the admin portal itself
    const ref = document.referrer;
    if (ref) {
      try {
        const refUrl = new URL(ref);
        // Only accept referrers from the same origin/host
        if (refUrl.hostname === window.location.hostname) {
          // If the referrer does not point into /admin, record it as the entry point
          if (!refUrl.pathname.includes("/admin")) {
            sessionStorage.setItem(STORAGE_KEY, ref);
            setReturnUrl(ref);
            return;
          }
        }
      } catch {
        // Ignore URL parsing errors
      }
    }

    // 2. If already saved in sessionStorage from an earlier entry, use it
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      setReturnUrl(saved);
    }
  }, []);

  const handleExit = (e: React.MouseEvent) => {
    e.preventDefault();

    if (typeof window === "undefined") return;

    const saved = sessionStorage.getItem(STORAGE_KEY);

    // 1. If we have a saved non-admin URL that the user entered from, go there
    if (saved) {
      try {
        const parsed = new URL(saved);
        if (parsed.hostname === window.location.hostname && !parsed.pathname.includes("/admin")) {
          sessionStorage.removeItem(STORAGE_KEY);
          window.location.href = saved;
          return;
        }
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }

    // 2. Fallback: check document.referrer directly
    if (document.referrer) {
      try {
        const refUrl = new URL(document.referrer);
        if (refUrl.hostname === window.location.hostname && !refUrl.pathname.includes("/admin")) {
          window.location.href = document.referrer;
          return;
        }
      } catch {}
    }

    // 3. Fallback: browser history if available
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    // 4. Default fallback if opened directly with no history
    window.location.href = "/roms";
  };

  return (
    <button
      type="button"
      onClick={handleExit}
      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-zinc-400 hover:text-white transition cursor-pointer flex items-center justify-center"
      title={returnUrl ? `Exit Admin (Back to ${returnUrl})` : "Exit Admin Panel"}
      aria-label="Exit Admin Panel"
    >
      <ArrowLeft className="w-4 h-4" />
    </button>
  );
}
