"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Gamepad2, Lock, AlertCircle, CheckCircle2, Loader2, ArrowRight, ShieldCheck } from "lucide-react";

function ResetPasswordForm(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  // Criteria validation
  const hasLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password);
  const isMatch = password.length > 0 && password === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!token) {
      setErrorMessage("Missing or invalid reset token. Please request a new link.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    if (!hasLength || !hasUpper || !hasLower || !hasNumber || !hasSpecial) {
      setErrorMessage("Password does not meet all security complexity requirements.");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/roms/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "Failed to reset password.");
        setIsLoading(false);
        return;
      }

      setIsSuccess(true);
      setIsLoading(false);
    } catch {
      setErrorMessage("Network error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md relative z-10">
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
        <p className="text-xs text-zinc-400">Set a New Account Password</p>
      </div>

      <div className="bg-zinc-900/90 border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        {isSuccess ? (
          <div className="text-center py-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto mb-4 text-emerald-400">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Password Reset Complete</h1>
            <p className="text-sm text-zinc-300 mb-6">
              Your password has been securely updated. You can now sign in with your new credentials.
            </p>
            <Link
              href="/auth/login"
              className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl text-sm font-bold bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white shadow-lg shadow-red-600/30 transition"
            >
              <span>Sign In Now</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-bold text-white mb-2">Create New Password</h1>
            <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
              Choose a strong password with at least 8 characters, numbers, and symbols.
            </p>

            {errorMessage && (
              <div className="mb-6 p-3.5 rounded-xl bg-red-950/80 border border-red-500/40 text-red-200 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="password"
                    required
                    autoFocus
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/80 focus:ring-1 focus:ring-red-500/80 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/80 focus:ring-1 focus:ring-red-500/80 transition"
                  />
                </div>
              </div>

              {password.length > 0 && (
                <div className="p-3 bg-zinc-950 rounded-xl border border-white/10 text-[11px] space-y-1.5 text-zinc-400">
                  <div className="font-semibold text-zinc-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-red-400" />
                    <span>Security Requirements:</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 pt-1">
                    <span className={hasLength ? "text-emerald-400" : "text-zinc-500"}>
                      {hasLength ? "✓" : "○"} 8+ Characters
                    </span>
                    <span className={hasUpper ? "text-emerald-400" : "text-zinc-500"}>
                      {hasUpper ? "✓" : "○"} Uppercase (A-Z)
                    </span>
                    <span className={hasLower ? "text-emerald-400" : "text-zinc-500"}>
                      {hasLower ? "✓" : "○"} Lowercase (a-z)
                    </span>
                    <span className={hasNumber ? "text-emerald-400" : "text-zinc-500"}>
                      {hasNumber ? "✓" : "○"} Number (0-9)
                    </span>
                    <span className={hasSpecial ? "text-emerald-400" : "text-zinc-500"}>
                      {hasSpecial ? "✓" : "○"} Special Symbol
                    </span>
                    <span className={isMatch ? "text-emerald-400" : "text-zinc-500"}>
                      {isMatch ? "✓" : "○"} Passwords Match
                    </span>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white shadow-lg shadow-red-600/30 transition transform active:scale-98 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving New Password...</span>
                  </>
                ) : (
                  <>
                    <span>Update Password</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-[#070709] text-zinc-100 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-600/10 rounded-full blur-[140px] pointer-events-none" />
      <Suspense fallback={<Loader2 className="w-8 h-8 text-red-500 animate-spin" />}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}

