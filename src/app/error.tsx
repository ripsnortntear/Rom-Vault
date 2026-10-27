"use client";

import React, { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  useEffect(() => {
    console.error("[ROM Vault Client Error Boundary caught]:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#070709] text-zinc-100 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-zinc-950 border border-white/10 rounded-2xl p-6 text-center shadow-2xl">
        <div className="w-12 h-12 rounded-xl bg-red-950/80 border border-red-500/30 flex items-center justify-center mx-auto mb-4 text-red-400">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
        <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
          An unexpected interface error occurred. You can retry the operation or return to the library.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
          <button
            type="button"
            onClick={() => {
              window.location.href = "/roms";
            }}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-white/10 hover:bg-white/15 text-zinc-200 transition cursor-pointer"
          >
            Back to Library
          </button>
        </div>
      </div>
    </div>
  );
}
