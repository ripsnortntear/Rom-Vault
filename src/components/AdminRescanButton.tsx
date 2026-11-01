"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";

export function AdminRescanButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{ message: string; isError: boolean } | null>(null);

  const handleRescan = async () => {
    if (isLoading) return;

    setIsLoading(true);
    setStatus(null);

    try {
      const res = await fetch("/roms/api/admin/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus({
          message: data?.error || `Scan failed (${res.status})`,
          isError: true,
        });
      } else {
        const total = data?.stats?.totalGames;
        setStatus({
          message: total
            ? `Scanned ${total.toLocaleString()} games successfully!`
            : "Library rescan complete!",
          isError: false,
        });
        router.refresh();
      }
    } catch (err: any) {
      setStatus({
        message: err?.message || "Failed to trigger scan.",
        isError: true,
      });
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        setStatus(null);
      }, 7000);
    }
  };

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={handleRescan}
        disabled={isLoading}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
          isLoading
            ? "bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 cursor-not-allowed"
            : "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30"
        }`}
        title="Trigger full filesystem rescan of ROM directories"
      >
        <RefreshCw className={`w-4 h-4 text-emerald-400 ${isLoading ? "animate-spin" : ""}`} />
        <span>{isLoading ? "Scanning Vault..." : "Rescan Library"}</span>
      </button>

      {status && (
        <div
          role="status"
          aria-live="polite"
          className={`absolute top-full right-0 mt-2 z-50 px-3 py-2 rounded-xl text-xs font-semibold shadow-2xl border flex items-center gap-2 whitespace-nowrap backdrop-blur-md ${
            status.isError
              ? "bg-rose-950/90 text-rose-200 border-rose-500/40"
              : "bg-emerald-950/90 text-emerald-200 border-emerald-500/40"
          }`}
        >
          {status.isError ? (
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          )}
          <span>{status.message}</span>
        </div>
      )}
    </div>
  );
}
