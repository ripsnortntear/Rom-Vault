export const dynamic = "force-dynamic";
import "server-only";

import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ShieldAlert,
  Users,
  Trophy,
  MessageSquare,
  FileText,
  HardDrive,
  ArrowLeft,
  Activity,
  LogOut,
  Terminal,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { getPendingContributionsCount } from "@/lib/contributions";

export const metadata = {
  title: "ROM Vault Administration Portal",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [admin, pendingAssetsCount] = await Promise.all([
    requireAdmin(),
    getPendingContributionsCount(),
  ]);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-zinc-950 border-b md:border-b-0 md:border-r border-white/10 flex flex-col shrink-0">
        {/* Brand Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-600/40">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <span className="font-black text-sm tracking-wider uppercase block text-white">
                Admin Vault
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">v16.4 • MariaDB</span>
            </div>
          </div>

          <Link
            href="/"
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-zinc-400 hover:text-white transition"
            title="Exit Admin to Library"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </div>

        {/* Current Admin Tag */}
        <div className="px-5 py-3 bg-zinc-900/60 border-b border-white/5 flex items-center gap-2.5 text-xs">
          <div className="w-6 h-6 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 flex items-center justify-center font-bold text-[10px] uppercase">
            {admin.username.charAt(0)}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-white truncate">{admin.displayName || admin.username}</span>
            <span className="text-[10px] text-red-400 font-mono uppercase">Master Administrator</span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="p-3 flex flex-col gap-1 text-xs font-semibold flex-1">
          <Link
            href="/admin"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 text-zinc-300 hover:text-white transition"
          >
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>Overview &amp; Health</span>
          </Link>

          <Link
            href="/admin/users"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 text-zinc-300 hover:text-white transition"
          >
            <Users className="w-4 h-4 text-blue-400" />
            <span>User Management</span>
          </Link>

          <Link
            href="/admin/moderation"
            className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl hover:bg-white/10 text-zinc-300 hover:text-white transition"
          >
            <span className="flex items-center gap-3">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>Assets &amp; Moderation</span>
            </span>
            {pendingAssetsCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-black">
                {pendingAssetsCount}
              </span>
            )}
          </Link>

          <Link
            href="/admin/scripts"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 text-zinc-300 hover:text-white transition"
          >
            <Terminal className="w-4 h-4 text-rose-400" />
            <span>Scripts &amp; Automation</span>
          </Link>

          <Link
            href="/admin/audit"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 text-zinc-300 hover:text-white transition"
          >
            <FileText className="w-4 h-4 text-purple-400" />
            <span>System Audit Logs</span>
          </Link>
        </nav>

        {/* Bottom Status */}
        <div className="p-4 border-t border-white/10 text-[11px] text-zinc-500 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span>System Status:</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              ONLINE
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Port / Service:</span>
            <span className="font-mono text-zinc-400">39254</span>
          </div>
        </div>
      </aside>

      {/* Main View Area */}
      <main className="flex-1 bg-black overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
