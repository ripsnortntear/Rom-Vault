import "server-only";

import React from "react";
import Link from "next/link";
import { FileText, ArrowLeft, Shield } from "lucide-react";
import { getAdminAuditLogs } from "@/lib/community";

export const metadata = {
  title: "Administrative Audit Trail | ROM Vault Admin",
};

export default async function AdminAuditPage() {
  const auditLogs = await getAdminAuditLogs(100);

  return (
    <div className="p-5 sm:p-8 flex flex-col gap-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-purple-400">
            Compliance &amp; Security Trail
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            System Administrative Audit Logs
          </h1>
        </div>

        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Overview</span>
        </Link>
      </div>

      <div className="rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-zinc-900/60 text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Admin</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Target Entity</th>
                <th className="py-3 px-4">IP Address</th>
                <th className="py-3 px-4">Action Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-500 italic">
                    No administrative audit events recorded yet.
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/[0.02] transition">
                    <td className="py-3 px-4 text-zinc-400 text-[11px] whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-bold text-white whitespace-nowrap">
                      {log.adminUsername || "System"}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-600/20 text-purple-300 border border-purple-500/30">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-zinc-300 text-[11px]">
                      {log.targetType}:{log.targetId.slice(0, 12)}
                    </td>
                    <td className="py-3 px-4 text-zinc-500 text-[11px]">
                      {log.ipAddress || "—"}
                    </td>
                    <td className="py-3 px-4 text-zinc-300 text-[11px] truncate max-w-sm">
                      {log.detailsJson ? JSON.stringify(log.detailsJson) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
