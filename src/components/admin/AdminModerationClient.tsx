"use client";

import React, { useState, useTransition } from "react";
import {
  Trophy,
  MessageSquare,
  Trash2,
  ExternalLink,
  Search,
  UploadCloud,
  CheckCircle2,
  XCircle,
  Clock,
  Film,
  Image as ImageIcon,
  FileText,
  Eye,
  X,
} from "lucide-react";
import {
  moderateDeleteCommentAction,
  moderateDeleteScoreAction,
  approveAssetContributionAction,
  rejectAssetContributionAction,
} from "@/app/actions/admin";
import type { GameComment, GameHighScore } from "@/types/community";
import type { AssetContributionItem, ContributionStatus } from "@/lib/contributions";

interface AdminModerationClientProps {
  initialComments: GameComment[];
  initialScores: GameHighScore[];
  initialContributions?: AssetContributionItem[];
}

const CATEGORY_LABELS: Record<string, string> = {
  artwork_front: "2D Box Art",
  artwork_3d: "3D Box Art",
  screenshot: "In-Game Screenshot",
  screentitle: "Title Screen",
  logo: "Logo / Marquee",
  medium: "Cartridge / Disc Art",
  video: "Gameplay Video (.mp4)",
  story: "Story / Overview (.txt)",
};

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function AdminModerationClient({
  initialComments,
  initialScores,
  initialContributions = [],
}: AdminModerationClientProps) {
  const [activeTab, setActiveTab] = useState<"assets" | "scores" | "comments">("assets");
  const [contributions, setContributions] = useState<AssetContributionItem[]>(initialContributions);
  const [assetStatusFilter, setAssetStatusFilter] = useState<ContributionStatus | "all">("pending");
  const [comments, setComments] = useState<GameComment[]>(initialComments);
  const [scores, setScores] = useState<GameHighScore[]>(initialScores);
  const [searchTerm, setSearchTerm] = useState("");
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [previewModalItem, setPreviewModalItem] = useState<AssetContributionItem | null>(null);
  const [rejectNoteById, setRejectNoteById] = useState<Record<number, string>>({});
  const [isPending, startTransition] = useTransition();

  const pendingContributionsCount = contributions.filter((c) => c.status === "pending").length;

  const filteredContributions = contributions.filter((c) => {
    if (assetStatusFilter !== "all" && c.status !== assetStatusFilter) return false;
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      c.gameTitle.toLowerCase().includes(term) ||
      c.baseName.toLowerCase().includes(term) ||
      c.system.toLowerCase().includes(term) ||
      c.username.toLowerCase().includes(term) ||
      (c.displayName && c.displayName.toLowerCase().includes(term)) ||
      (CATEGORY_LABELS[c.category] || c.category).toLowerCase().includes(term)
    );
  });

  const filteredScores = scores.filter((s) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      s.gameId.toLowerCase().includes(term) ||
      s.system.toLowerCase().includes(term) ||
      s.user.username.toLowerCase().includes(term) ||
      (s.user.displayName && s.user.displayName.toLowerCase().includes(term))
    );
  });

  const filteredComments = comments.filter((c) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      c.gameId.toLowerCase().includes(term) ||
      c.content.toLowerCase().includes(term) ||
      c.author.username.toLowerCase().includes(term)
    );
  });

  const showToast = (type: "ok" | "err", text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleApproveContribution = (submissionId: number) => {
    startTransition(async () => {
      const res = await approveAssetContributionAction(submissionId);
      if (res.ok && res.item) {
        setContributions((prev) =>
          prev.map((c) => (c.id === submissionId ? res.item! : c))
        );
        if (previewModalItem?.id === submissionId) {
          setPreviewModalItem(res.item);
        }
        showToast("ok", res.message || "Asset approved and published to the Vault!");
      } else {
        showToast("err", res.error || "Failed to approve asset.");
      }
    });
  };

  const handleRejectContribution = (submissionId: number) => {
    const note = rejectNoteById[submissionId] || "";
    startTransition(async () => {
      const res = await rejectAssetContributionAction(submissionId, note);
      if (res.ok && res.item) {
        setContributions((prev) =>
          prev.map((c) => (c.id === submissionId ? res.item! : c))
        );
        if (previewModalItem?.id === submissionId) {
          setPreviewModalItem(null);
        }
        showToast("ok", res.message || "Asset submission rejected and deleted.");
      } else {
        showToast("err", res.error || "Failed to reject asset.");
      }
    });
  };

  const handleDeleteComment = (commentId: number, gameId: string) => {
    startTransition(async () => {
      const res = await moderateDeleteCommentAction(commentId, gameId);
      if (res.ok) {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
        showToast("ok", "Comment removed from vault.");
      } else {
        showToast("err", res.error || "Failed to delete comment.");
      }
    });
  };

  const handleWipeScore = (scoreId: number, gameId: string) => {
    startTransition(async () => {
      const res = await moderateDeleteScoreAction(scoreId, gameId);
      if (res.ok) {
        setScores((prev) => prev.filter((s) => s.id !== scoreId));
        showToast("ok", "High score purged from leaderboard.");
      } else {
        showToast("err", res.error || "Failed to purge score.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Tabs & Search */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 bg-zinc-900 p-1 rounded-xl border border-white/10">
          <button
            type="button"
            onClick={() => setActiveTab("assets")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === "assets"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Asset Uploads Queue</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                pendingContributionsCount > 0
                  ? "bg-amber-400 text-black"
                  : "bg-white/15 text-white"
              }`}
            >
              {pendingContributionsCount} Pending
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("scores")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === "scores"
                ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>High Scores Queue ({scores.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("comments")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === "comments"
                ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Comments Queue ({comments.length})</span>
          </button>
        </div>

        <div className="relative w-full lg:w-72">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={`Search ${activeTab}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-zinc-900 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold border ${
            feedback.type === "ok"
              ? "bg-emerald-950 border-emerald-500/40 text-emerald-200"
              : "bg-red-950 border-red-500/40 text-red-200"
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Asset Uploads Moderation Tab */}
      {activeTab === "assets" && (
        <div className="flex flex-col gap-4">
          {/* Status Filter Sub-Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-950 border border-white/10 rounded-2xl p-3">
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  {
                    key: "pending",
                    label: "Pending Verification",
                    count: contributions.filter((c) => c.status === "pending").length,
                  },
                  {
                    key: "approved",
                    label: "Approved & Live",
                    count: contributions.filter((c) => c.status === "approved").length,
                  },
                  {
                    key: "rejected",
                    label: "Rejected",
                    count: contributions.filter((c) => c.status === "rejected").length,
                  },
                  {
                    key: "all",
                    label: "All Submissions",
                    count: contributions.length,
                  },
                ] as const
              ).map((st) => (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => setAssetStatusFilter(st.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                    assetStatusFilter === st.key
                      ? "bg-emerald-600/20 border-emerald-500/50 text-emerald-300"
                      : "bg-zinc-900 border-white/10 text-zinc-400 hover:text-white"
                  }`}
                >
                  <span>{st.label}</span>
                  <span className="px-1.5 py-0.5 rounded bg-black/40 text-[10px] font-mono">
                    {st.count}
                  </span>
                </button>
              ))}
            </div>

            <span className="text-[11px] text-zinc-400">
              All community uploads are staged in quarantine until an administrator inspects and approves them.
            </span>
          </div>

          {filteredContributions.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-zinc-950 p-12 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <div className="text-base font-bold text-white">
                No {assetStatusFilter === "all" ? "" : assetStatusFilter} asset submissions found
              </div>
              <p className="text-xs text-zinc-400">
                When community members upload missing box art, screenshots, videos, or stories on /contribute, they will appear here for visual verification before going live.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredContributions.map((item) => {
                const previewUrl = `/roms/api/admin/contributions/${item.id}/preview`;
                const isVideo = item.category === "video";
                const isStory = item.category === "story";

                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl bg-zinc-950 border p-4 flex flex-col justify-between gap-4 shadow-xl ${
                      item.status === "pending"
                        ? "border-amber-500/40"
                        : item.status === "approved"
                        ? "border-emerald-500/30"
                        : "border-red-500/30 opacity-75"
                    }`}
                  >
                    {/* Header Metadata */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-red-600/20 border border-red-500/30 text-red-300 text-[10px] font-black uppercase">
                            {item.system}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-zinc-900 border border-white/10 text-zinc-300 text-[10px] font-bold">
                            {CATEGORY_LABELS[item.category] || item.category}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-mono font-bold">
                            +{item.points} pts
                          </span>
                        </div>

                        {item.status === "pending" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            <Clock className="w-3 h-3" /> Pending
                          </span>
                        )}
                        {item.status === "approved" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            <CheckCircle2 className="w-3 h-3" /> Approved
                          </span>
                        )}
                        {item.status === "rejected" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/40">
                            <XCircle className="w-3 h-3" /> Rejected
                          </span>
                        )}
                      </div>

                      <div>
                        <h3 className="text-sm font-black text-white truncate" title={item.gameTitle}>
                          {item.gameTitle}
                        </h3>
                        <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-2">
                          <span>ROM: {item.baseName}</span>
                          <span>•</span>
                          <span>{formatFileSize(item.fileSize)}</span>
                        </div>
                      </div>

                      <div className="text-[11px] text-zinc-400 flex items-center justify-between border-t border-white/5 pt-1.5">
                        <span>
                          Uploaded by{" "}
                          <strong className="text-white">
                            {item.displayName || item.username}
                          </strong>
                        </span>
                        <span className="font-mono text-[10px] text-zinc-500">
                          {new Date(item.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Visual Inspection Preview Box */}
                    <div className="relative rounded-xl bg-zinc-900 border border-white/10 overflow-hidden h-52 flex items-center justify-center">
                      {isStory ? (
                        <div className="p-3 w-full h-full overflow-y-auto text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed font-sans">
                          {item.storyText || "No story text."}
                        </div>
                      ) : item.status === "pending" && item.stagedFilename ? (
                        isVideo ? (
                          <video
                            src={previewUrl}
                            controls
                            playsInline
                            preload="metadata"
                            className="w-full h-full object-contain bg-black"
                          />
                        ) : (
                          <div
                            onClick={() => setPreviewModalItem(item)}
                            className="w-full h-full flex items-center justify-center p-2 cursor-zoom-in group relative"
                          >
                            <img
                              src={previewUrl}
                              alt={`${item.gameTitle} ${item.category}`}
                              className="max-w-full max-h-full object-contain"
                            />
                            <div className="absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-black/75 border border-white/15 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
                              <Eye className="w-3 h-3" /> Fullscreen Inspect
                            </div>
                          </div>
                        )
                      ) : (
                        <div className="text-center p-4 text-xs text-zinc-500 space-y-1">
                          {isVideo ? (
                            <Film className="w-7 h-7 mx-auto text-zinc-600" />
                          ) : isStory ? (
                            <FileText className="w-7 h-7 mx-auto text-zinc-600" />
                          ) : (
                            <ImageIcon className="w-7 h-7 mx-auto text-zinc-600" />
                          )}
                          <div>
                            {item.status === "approved"
                              ? "Promoted to live Vault artwork directory"
                              : "Staged file deleted after rejection"}
                          </div>
                          {item.reviewerUsername && (
                            <div className="text-[10px] text-zinc-400">
                              Reviewed by {item.reviewerUsername}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action Controls */}
                    {item.status === "pending" ? (
                      <div className="space-y-2 pt-1">
                        <input
                          type="text"
                          placeholder="Optional rejection reason..."
                          value={rejectNoteById[item.id] || ""}
                          onChange={(e) =>
                            setRejectNoteById((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleApproveContribution(item.id)}
                            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve (+{item.points})</span>
                          </button>

                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleRejectContribution(item.id)}
                            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 transition cursor-pointer disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject &amp; Delete</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-zinc-400 flex items-center justify-between pt-1 border-t border-white/5">
                        <span>
                          {item.status === "approved" ? "Approved" : "Rejected"} by{" "}
                          <strong className="text-zinc-200">
                            {item.reviewerUsername || "Admin"}
                          </strong>
                        </span>
                        {item.reviewNote && (
                          <span className="text-red-300 truncate max-w-[180px]" title={item.reviewNote}>
                            Note: {item.reviewNote}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* High Scores Tab */}
      {activeTab === "scores" && (
        <div className="rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 bg-zinc-900/60 text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Score</th>
                  <th className="py-3 px-4">Game</th>
                  <th className="py-3 px-4">System</th>
                  <th className="py-3 px-4">Player</th>
                  <th className="py-3 px-4">Proof</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-medium">
                {filteredScores.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-zinc-500 italic">
                      No high scores in moderation queue.
                    </td>
                  </tr>
                ) : (
                  filteredScores.map((score) => (
                    <tr key={score.id} className="hover:bg-white/[0.02] transition">
                      <td className="py-3 px-4 font-mono font-bold text-amber-400 text-sm">
                        {score.score.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-bold text-white max-w-[180px] truncate">
                        {score.gameId}
                      </td>
                      <td className="py-3 px-4 uppercase text-zinc-400 font-mono text-[11px]">
                        {score.system}
                      </td>
                      <td className="py-3 px-4 text-zinc-300">
                        {score.user.displayName || score.user.username}
                      </td>
                      <td className="py-3 px-4">
                        {(() => {
                          const safeProofUrl =
                            score.proofUrl &&
                            (score.proofUrl.startsWith("http://") || score.proofUrl.startsWith("https://"))
                              ? score.proofUrl
                              : undefined;

                          return safeProofUrl ? (
                            <a
                              href={safeProofUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 underline"
                            >
                              <span>Link</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-4 text-zinc-500 font-mono text-[11px]">
                        {new Date(score.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleWipeScore(score.id, score.gameId)}
                          disabled={isPending}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 transition cursor-pointer active:scale-95"
                          title="Purge falsified score"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Wipe Score</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Comments Tab */}
      {activeTab === "comments" && (
        <div className="rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 bg-zinc-900/60 text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Author</th>
                  <th className="py-3 px-4">Game</th>
                  <th className="py-3 px-4">Comment</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-medium">
                {filteredComments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-zinc-500 italic">
                      No comments in moderation queue.
                    </td>
                  </tr>
                ) : (
                  filteredComments.map((comment) => (
                    <tr key={comment.id} className="hover:bg-white/[0.02] transition">
                      <td className="py-3 px-4 font-bold text-white whitespace-nowrap">
                        {comment.author.displayName || comment.author.username}
                      </td>
                      <td className="py-3 px-4 font-semibold text-zinc-400 max-w-[140px] truncate">
                        {comment.gameId}
                      </td>
                      <td className="py-3 px-4 text-zinc-200 max-w-md truncate">
                        {comment.content}
                      </td>
                      <td className="py-3 px-4">
                        {comment.isDeleted ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-400 border border-red-500/30">
                            Deleted
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                            Visible
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-zinc-500 font-mono text-[11px] whitespace-nowrap">
                        {new Date(comment.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {!comment.isDeleted && (
                          <button
                            type="button"
                            onClick={() => handleDeleteComment(comment.id, comment.gameId)}
                            disabled={isPending}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 transition cursor-pointer active:scale-95"
                            title="Remove offending comment"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fullscreen Image Lightbox Modal for Admin Inspection */}
      {previewModalItem && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setPreviewModalItem(null)}
        >
          <div
            className="max-w-5xl w-full bg-zinc-950 border border-white/15 rounded-3xl overflow-hidden flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-red-600/20 text-red-300 text-[10px] font-black uppercase">
                    {previewModalItem.system}
                  </span>
                  <span className="text-xs font-bold text-zinc-300">
                    {CATEGORY_LABELS[previewModalItem.category] || previewModalItem.category}
                  </span>
                  <span className="text-xs text-zinc-400">
                    by <strong>{previewModalItem.displayName || previewModalItem.username}</strong>
                  </span>
                </div>
                <h3 className="text-base font-black text-white mt-0.5">
                  {previewModalItem.gameTitle} ({previewModalItem.baseName})
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setPreviewModalItem(null)}
                className="p-2 rounded-full bg-white/5 hover:bg-white/15 text-zinc-300 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-auto flex items-center justify-center bg-black">
              <img
                src={`/roms/api/admin/contributions/${previewModalItem.id}/preview`}
                alt={previewModalItem.gameTitle}
                className="max-w-full max-h-[70vh] object-contain"
              />
            </div>

            {previewModalItem.status === "pending" && (
              <div className="px-6 py-4 border-t border-white/10 bg-zinc-900/60 flex items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleRejectContribution(previewModalItem.id)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 cursor-pointer"
                >
                  Reject &amp; Delete
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleApproveContribution(previewModalItem.id)}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 cursor-pointer"
                >
                  Approve &amp; Publish (+{previewModalItem.points} pts)
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
