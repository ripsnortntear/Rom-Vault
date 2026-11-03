export const dynamic = "force-dynamic";
import "server-only";

import React from "react";
import Link from "next/link";
import { Terminal, ArrowLeft, ShieldAlert } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { AdminScriptsPanel } from "@/components/admin/AdminScriptsPanel";

export const metadata = {
  title: "Script Automation & Maintenance Dashboard | ROM Vault Admin",
};

export default async function AdminScriptsPage() {
  const admin = await requireAdmin();

  return (
    <div className="p-5 sm:p-8 flex flex-col gap-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-rose-500">
            Script Management &amp; System Automation
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Terminal className="w-7 h-7 text-rose-500" />
            <span>Operational Tools &amp; Scripts Dashboard</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Execute maintenance commands, metadata downloads, artwork pruning, and upstream submodule synchronization directly from the browser.
          </p>
        </div>

        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-zinc-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Overview</span>
        </Link>
      </div>

      {/* Main Interactive Panel */}
      <AdminScriptsPanel />
    </div>
  );
}
