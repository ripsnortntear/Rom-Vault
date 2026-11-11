"use client";

import React, { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Gamepad2, CheckCircle2, AlertCircle, ArrowRight, Loader2, Clock, ShieldCheck } from "lucide-react";

function VerifyContent(): React.ReactElement {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const statusParam = searchParams.get("status");

  const [state, setState] = useState<"loading" | "success" | "pending_approval" | "expired" | "invalid" | "error">("loading");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    if (statusParam === "pending_approval") {
      setState("pending_approval");
      setMessage(
        "Your email address has been verified! Your account is now pending administrator approval. An admin will review and approve or deny your account within 24 hours. You will receive an automated email as soon as a decision is made."
      );
      return;
    }
    if (statusParam === "expired") {
      setState("expired");
      setMessage("Your verification link has expired. Verification links are valid for 24 hours.");
      return;
    }
    if (statusParam === "invalid") {
      setState("invalid");
      setMessage("Invalid or already used verification token.");
      return;
    }
    if (statusParam === "error") {
      setState("error");
      setMessage("An error occurred while verifying your account. Please try again or contact support.");
      return;
    }

    if (token) {
      // Perform verification via POST API
      fetch("/roms/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            if (data.status === "pending_approval") {
              setState("pending_approval");
            } else {
              setState("success");
            }
            setMessage(data.message || "Email verified successfully!");
          } else {
            setState("invalid");
            setMessage(data.error || "Verification failed.");
          }
        })
        .catch(() => {
          setState("error");
          setMessage("Network error occurred during verification.");
        });
    } else {
      setState("invalid");
      setMessage("No verification token provided.");
    }
  }, [token, statusParam]);

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
        <p className="text-xs text-zinc-400">Account Activation Verification</p>
      </div>

      <div className="bg-zinc-900/90 border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl text-center">
        {state === "loading" && (
          <div className="py-8">
            <Loader2 className="w-10 h-10 text-red-500 animate-spin mx-auto mb-4" />
            <h1 className="text-lg font-bold text-white mb-2">Verifying Account...</h1>
            <p className="text-xs text-zinc-400">Please wait while we validate your activation token.</p>
          </div>
        )}

        {state === "pending_approval" && (
          <div className="py-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto mb-4 text-amber-400 shadow-lg shadow-amber-500/20">
              <Clock className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Email Verified</h1>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/15 border border-amber-500/30 text-amber-300 mb-4">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Pending Administrator Approval</span>
            </div>
            <p className="text-sm text-zinc-300 mb-6 leading-relaxed">
              Your email has been verified successfully! All new registrations must be approved by an administrator before access is granted. An admin will review and approve or deny your account within <strong>24 hours</strong>.
            </p>
            <p className="text-xs text-zinc-400 mb-6 bg-zinc-950/60 p-3 rounded-xl border border-white/5">
              📧 You will receive an automated email confirmation as soon as your account is reviewed.
            </p>
            <div className="flex flex-col gap-2.5">
              <Link
                href="/auth/login"
                className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl text-sm font-bold bg-white/10 hover:bg-white/20 text-white transition"
              >
                <span>Return to Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/"
                className="text-xs text-zinc-400 hover:text-white transition py-1"
              >
                Back to Home Portal
              </Link>
            </div>
          </div>
        )}

        {state === "success" && (
          <div className="py-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto mb-4 text-emerald-400 shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Account Activated!</h1>
            <p className="text-sm text-zinc-300 mb-6">{message}</p>
            <Link
              href="/auth/login"
              className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl text-sm font-bold bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white shadow-lg shadow-red-600/30 transition"
            >
              <span>Sign In to ROM Vault</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {(state === "invalid" || state === "expired" || state === "error") && (
          <div className="py-4">
            <div className="w-14 h-14 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center mx-auto mb-4 text-red-400 shadow-lg shadow-red-500/20">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">
              {state === "expired" ? "Link Expired" : "Verification Failed"}
            </h1>
            <p className="text-sm text-zinc-400 mb-6 leading-relaxed">{message}</p>
            <div className="flex flex-col gap-2.5">
              <Link
                href="/auth/register"
                className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl text-sm font-bold bg-white/10 hover:bg-white/20 text-white transition"
              >
                <span>Register a New Account</span>
              </Link>
              <Link
                href="/auth/login"
                className="text-xs text-zinc-400 hover:text-white transition py-1"
              >
                Return to Sign In
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyPage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-[#070709] text-zinc-100 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-600/10 rounded-full blur-[140px] pointer-events-none" />
      <Suspense fallback={<Loader2 className="w-8 h-8 text-red-500 animate-spin" />}>
        <VerifyContent />
      </Suspense>
    </div>
  );
}

