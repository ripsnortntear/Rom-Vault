import "server-only";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getModerationComments, getModerationScores } from "@/lib/community";
import { getModerationContributions } from "@/lib/contributions";
import { AdminModerationClient } from "@/components/admin/AdminModerationClient";

export const metadata = {
  title: "Content, Assets & Scores Moderation | ROM Vault Admin",
};

export default async function AdminModerationPage() {
  const [comments, scores, contributions] = await Promise.all([
    getModerationComments(100),
    getModerationScores(100),
    getModerationContributions("all", 200),
  ]);

  return (
    <div className="p-5 sm:p-8 flex flex-col gap-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
            Vault Integrity &amp; Safety
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Asset Uploads, High Scores &amp; Content Moderation
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

      <AdminModerationClient
        initialComments={comments}
        initialScores={scores}
        initialContributions={contributions}
      />
    </div>
  );
}
