"use client";

import React, { useState, useTransition } from "react";
import {
  Trophy,
  MessageSquare,
  Trash2,
  ExternalLink,
  ShieldAlert,
  Search,
  Filter,
} from "lucide-react";
import { moderateDeleteCommentAction, moderateDeleteScoreAction } from "@/app/actions/admin";
import type { GameComment, GameHighScore } from "@/types/community";

interface AdminModerationClientProps {
  initialComments: GameComment[];
  initialScores: GameHighScore[];
}

export function AdminModerationClient({
  initialComments,
  initialScores,
}: AdminModerationClientProps) {
  const [activeTab, setActiveTab] = useState<"scores" | "comments">("scores");
  const [comments, setComments] = useState<GameComment[]>(initialComments);
  const [scores, setScores] = useState<GameHighScore[]>(initialScores);
  const [searchTerm, setSearchTerm] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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

  const handleDeleteComment = (commentId: number, gameId: string) => {
    startTransition(async () => {
      const res = await moderateDeleteCommentAction(commentId, gameId);
      if (res.ok) {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
        setFeedback("Comment removed from vault.");
        setTimeout(() => setFeedback(null), 3000);
      } else {
        setFeedback(res.error || "Failed to delete comment.");
      }
    });
  };

  const handleWipeScore = (scoreId: number, gameId: string) => {
    startTransition(async () => {
      const res = await moderateDeleteScoreAction(scoreId, gameId);
      if (res.ok) {
        setScores((prev) => prev.filter((s) => s.id !== scoreId));
        setFeedback("High score purged from leaderboard.");
        setTimeout(() => setFeedback(null), 3000);
      } else {
        setFeedback(res.error || "Failed to purge score.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-zinc-900 p-1 rounded-xl border border-white/10 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveTab("scores")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer flex-1 sm:flex-none justify-center ${
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
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer flex-1 sm:flex-none justify-center ${
              activeTab === "comments"
                ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Comments Queue ({comments.length})</span>
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={`Filter ${activeTab}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-zinc-900 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>
      </div>

      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-950 border border-emerald-500/40 text-emerald-200 text-xs">
          {feedback}
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
                        {score.proofUrl ? (
                          <a
                            href={score.proofUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 underline"
                          >
                            <span>Link</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
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
    </div>
  );
}
