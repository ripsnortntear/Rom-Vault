"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Gamepad2, Lock, User, AlertCircle, CheckCircle2, Loader2, ArrowRight, AlertTriangle, Info } from "lucide-react";
import { useBrowserEnvironment } from "@/hooks/useBrowserEnvironment";
import { getSafeRedirectUrl } from "@/lib/auth/redirect";

function LoginForm(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mounted, isMobile, state } = useBrowserEnvironment();

  const [identifier, setIdentifier] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("verified") === "true") {
      setSuccessMessage("Your email has been verified! You can now log in.");
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const res = await fetch("/roms/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "Authentication failed. Please check your credentials.");
        setIsLoading(false);
        return;
      }

      // Successful login -> perform top-level navigation to ensure fresh session state
      setSuccessMessage("Authentication successful! Redirecting...");
      const redirectParam = searchParams.get("redirect");
      const target = getSafeRedirectUrl(redirectParam);
      window.location.replace(target);
    } catch {
      setErrorMessage("Network error occurred. Please check your connection.");
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md relative z-10">
      {/* Branding */}
      <div className="flex flex-col items-center mb-8 text-center">
        <Link
          href="/"
          className="flex items-center gap-3 group transition transform hover:scale-[1.02] mb-3"
        >
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center shadow-lg shadow-red-600/40">
            <Gamepad2 className="w-7 h-7 text-white" />
          </div>
          <span className="text-2xl font-black tracking-tight text-white">
            ROM <span className="text-red-500">VAULT</span>
          </span>
        </Link>
        <p className="text-xs text-zinc-400">
          Sign in to access your retro gaming library &amp; cloud saves
        </p>
      </div>

      {/* Card */}
      <div className="bg-zinc-900/90 border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        <h1 className="text-xl font-bold text-white mb-6">Sign In</h1>

        {/* Contextual Desktop Browser & Acceleration Warning Banners */}
        {mounted && !isMobile && (
          <>
            {state === "edge_no_coop" && (
              <div className="mb-6 p-3.5 rounded-xl bg-amber-950/80 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <strong className="text-white">Microsoft Edge Detected: COOP/COEP Required</strong>
                  <span>
                    Only basic systems (NES, SNES, Genesis, GBA) will be playable until COOP/COEP is enabled. Advanced systems (PS2, GameCube, Dreamcast) require Cross-Origin Isolation.
                  </span>
                  <div className="mt-1 pt-1 border-t border-amber-500/20 text-[11px] text-amber-300">
                    <strong>How to enable:</strong> Ensure you are connecting via secure HTTPS, verify <code className="px-1 py-0.5 rounded bg-black/60 text-white font-mono text-[10px]">edge://settings/system</code> has &quot;Use graphics acceleration when available&quot; turned ON, and restart Edge.
                  </div>
                </div>
              </div>
            )}

            {state === "other_with_coop" && (
              <div className="mb-6 p-3.5 rounded-xl bg-sky-950/70 border border-sky-500/40 text-sky-200 text-xs flex items-start gap-2.5">
                <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-0.5">
                  <strong className="text-white">Browser Recommendation</strong>
                  <span>
                    You are not currently using Microsoft Edge. While COOP &amp; COEP are enabled, advanced 3D consoles (PS2, GameCube, Dreamcast) work best with Microsoft Edge on desktop for 60 FPS hardware acceleration.
                  </span>
                </div>
              </div>
            )}

            {state === "other_no_coop" && (
              <div className="mb-6 p-3.5 rounded-xl bg-amber-950/80 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-0.5">
                  <strong className="text-white">Browser &amp; Acceleration Notice</strong>
                  <span>
                    You are not using Microsoft Edge, and <strong className="text-white">COOP/COEP (Cross-Origin Isolation)</strong> is NOT enabled. You need to at least turn COOP/COEP on to run multi-threaded emulators, and for the full 60 FPS experience on advanced consoles, use Microsoft Edge on desktop.
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {successMessage && (
          <div className="mb-6 p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mb-6 p-3.5 rounded-xl bg-red-950/80 border border-red-500/40 text-red-200 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Username or Email
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                required
                autoFocus
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g. cloud_strife or user@example.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/80 focus:ring-1 focus:ring-red-500/80 transition"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-zinc-300">
                Password
              </label>
              <Link
                href="/auth/forgot-password"
                className="text-xs text-red-400 hover:text-red-300 transition"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/80 focus:ring-1 focus:ring-red-500/80 transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white shadow-lg shadow-red-600/30 transition transform active:scale-98 cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-white/10 text-center text-xs text-zinc-400">
          Don&apos;t have an account?{" "}
          <Link
            href={searchParams.get("redirect") ? `/auth/register?redirect=${encodeURIComponent(searchParams.get("redirect")!)}` : "/auth/register"}
            className="font-bold text-red-400 hover:text-red-300 transition underline underline-offset-4"
          >
            Create Account
          </Link>
        </div>
      </div>

      <div className="text-center mt-6 flex flex-col gap-2 items-center text-xs text-zinc-500">
        <a
          href="/"
          className="text-zinc-400 hover:text-cyan-400 transition flex items-center gap-1 font-medium"
        >
          <span>&larr;</span> Return to OldsmarChaos Home
        </a>
        <span>ROM Vault &bull; Multi-Console Retro Archive</span>
      </div>
    </div>
  );
}

export default function LoginPage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-[#070709] text-zinc-100 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-600/10 rounded-full blur-[140px] pointer-events-none" />
      <Suspense fallback={<Loader2 className="w-8 h-8 text-red-500 animate-spin" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}

