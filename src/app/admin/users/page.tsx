import "server-only";

import React from "react";
import Link from "next/link";
import { Users, ArrowLeft } from "lucide-react";
import { getAdminUsers } from "@/lib/community";
import { AdminUsersTable } from "@/components/admin/AdminUsersTable";

export const metadata = {
  title: "User Account Management | ROM Vault Admin",
};

export default async function AdminUsersPage() {
  const users = await getAdminUsers(undefined, 100, 0);

  return (
    <div className="p-5 sm:p-8 flex flex-col gap-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
            Lifecycle &amp; Access Controls
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            User Account Management
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

      <AdminUsersTable initialUsers={users} />
    </div>
  );
}
