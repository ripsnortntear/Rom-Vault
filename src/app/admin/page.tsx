export const dynamic = "force-dynamic";
import "server-only";

import React from "react";
import Link from "next/link";
import {
  HardDrive,
  Users,
  Trophy,
  MessageSquare,
  Star,
  Activity,
  ArrowRight,
  ShieldCheck,
  Server,
  Database,
  Clock,
  Terminal,
} from "lucide-react";
import { getAdminStorageHealth, getAdminAuditLogs } from "@/lib/community";
import { getStorageRoot } from "@/lib/paths";
import { AdminRescanButton } from "@/components/AdminRescanButton";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default async function AdminOverviewPage() {
  const [health, auditLogs] = await Promise.all([
    getAdminStorageHealth(),
    getAdminAuditLogs(10),
  ]);

  return (
    <div className="p-5 sm:p-8 flex flex-col gap-8 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-red-500">
            Control Center
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Vault Health &amp; Infrastructure
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/admin/scripts"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition"
          >
            <Terminal className="w-4 h-4 text-rose-400" />
            <span>Scripts &amp; Automation</span>
          </Link>
          <AdminRescanButton />
          <Link
            href="/admin/users"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition"
          >
            <Users className="w-4 h-4 text-blue-400" />
            <span>Manage Accounts</span>
          </Link>
          <Link
            href="/admin/moderation"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition"
          >
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>Moderate Content</span>
          </Link>
        </div>
      </div>

      {/* 1. Quick Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-4 rounded-2xl bg-zinc-950 border border-white/10 flex flex-col gap-1">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-semibold">Active Sessions</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="text-2xl font-black font-mono text-white">
            {health.activeSessionsCount}
          </span>
          <span className="text-[10px] text-zinc-500">Valid JWT / Auth Tokens</span>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-950 border border-white/10 flex flex-col gap-1">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-semibold">Registered Users</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <span className="text-2xl font-black font-mono text-white">
            {health.totalUsersCount}
          </span>
          <span className="text-[10px] text-zinc-500">MariaDB Accounts</span>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-950 border border-white/10 flex flex-col gap-1">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-semibold">High Scores</span>
            <Trophy className="w-4 h-4 text-amber-400" />
          </div>
          <span className="text-2xl font-black font-mono text-amber-400">
            {health.totalScoresCount}
          </span>
          <span className="text-[10px] text-zinc-500">Verified Leaderboards</span>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-950 border border-white/10 flex flex-col gap-1">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-semibold">Comments</span>
            <MessageSquare className="w-4 h-4 text-purple-400" />
          </div>
          <span className="text-2xl font-black font-mono text-purple-400">
            {health.totalCommentsCount}
          </span>
          <span className="text-[10px] text-zinc-500">Community Posts</span>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-950 border border-white/10 flex flex-col gap-1">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-semibold">Game Ratings</span>
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
          </div>
          <span className="text-2xl font-black font-mono text-white">
            {health.totalRatingsCount}
          </span>
          <span className="text-[10px] text-zinc-500">1-5 Star Reviews</span>
        </div>
      </div>

      {/* 2. Storage Health Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ROMs Storage Pool */}
        <div className="p-6 rounded-3xl bg-zinc-950 border border-white/10 flex flex-col gap-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-red-600/20 text-red-400 border border-red-500/30">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">ROMs &amp; Media Pool</h3>
                <span className="font-mono text-xs text-zinc-400">{getStorageRoot()}/</span>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-white/10 text-zinc-300">
              {health.romStorage.percentUsed}% Used
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-zinc-900 rounded-full h-3 overflow-hidden border border-white/10">
            <div
              className={`h-full transition-all duration-500 ${
                health.romStorage.percentUsed > 90
                  ? "bg-red-500"
                  : health.romStorage.percentUsed > 75
                  ? "bg-amber-500"
                  : "bg-emerald-500"
              }`}
              style={{ width: `${Math.min(100, health.romStorage.percentUsed)}%` }}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 text-xs border-t border-white/5 font-mono">
            <div>
              <span className="block text-zinc-500 text-[10px]">USED</span>
              <span className="font-bold text-white">
                {formatBytes(health.romStorage.usedBytes)}
              </span>
            </div>
            <div>
              <span className="block text-zinc-500 text-[10px]">AVAILABLE</span>
              <span className="font-bold text-emerald-400">
                {formatBytes(health.romStorage.freeBytes)}
              </span>
            </div>
            <div>
              <span className="block text-zinc-500 text-[10px]">TOTAL POOL</span>
              <span className="font-bold text-zinc-400">
                {formatBytes(health.romStorage.totalBytes)}
              </span>
            </div>
          </div>
        </div>

        {/* Saves & Cloud Memory Pool */}
        <div className="p-6 rounded-3xl bg-zinc-950 border border-white/10 flex flex-col gap-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Cloud Saves &amp; Cards</h3>
                <span className="font-mono text-xs text-zinc-400">/storage/saves/</span>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-white/10 text-zinc-300">
              {health.saveStorage.percentUsed}% Used
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-zinc-900 rounded-full h-3 overflow-hidden border border-white/10">
            <div
              className="h-full bg-blue-500 transition-all duration-500"
              style={{ width: `${Math.min(100, health.saveStorage.percentUsed)}%` }}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 text-xs border-t border-white/5 font-mono">
            <div>
              <span className="block text-zinc-500 text-[10px]">USED</span>
              <span className="font-bold text-white">
                {formatBytes(health.saveStorage.usedBytes)}
              </span>
            </div>
            <div>
              <span className="block text-zinc-500 text-[10px]">AVAILABLE</span>
              <span className="font-bold text-emerald-400">
                {formatBytes(health.saveStorage.freeBytes)}
              </span>
            </div>
            <div>
              <span className="block text-zinc-500 text-[10px]">TOTAL POOL</span>
              <span className="font-bold text-zinc-400">
                {formatBytes(health.saveStorage.totalBytes)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Recent Audit Logs Preview */}
      <div className="flex flex-col gap-4 bg-zinc-950 border border-white/10 rounded-3xl p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Clock className="w-4 h-4 text-purple-400" />
            <span>Recent Administrative Audit Logs</span>
          </div>
          <Link
            href="/admin/audit"
            className="text-xs font-semibold text-zinc-400 hover:text-white flex items-center gap-1 transition"
          >
            <span>View Full Audit Log</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {auditLogs.length === 0 ? (
          <p className="text-xs text-zinc-500 italic py-4">No audit events recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 bg-zinc-900/40 text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Admin</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Target</th>
                  <th className="py-2.5 px-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/[0.02]">
                    <td className="py-2.5 px-3 text-zinc-400 text-[11px]">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-white">
                      {log.adminUsername || "System"}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-600/20 text-purple-300 border border-purple-500/30">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-zinc-300 text-[11px]">
                      {log.targetType}:{log.targetId.slice(0, 8)}
                    </td>
                    <td className="py-2.5 px-3 text-zinc-400 text-[11px] truncate max-w-xs">
                      {log.detailsJson ? JSON.stringify(log.detailsJson) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
