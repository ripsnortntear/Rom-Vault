"use client";

import React, { useState, useEffect, useTransition, useOptimistic } from "react";
import {
  Star,
  MessageSquare,
  Trophy,
  Send,
  Trash2,
  Share2,
  Check,
  AlertCircle,
  ExternalLink,
  Plus,
} from "lucide-react";
import { submitGameRating, postGameComment, deleteGameComment } from "@/app/actions/social";
import { submitHighScoreAction } from "@/app/actions/scores";
import type { GameSocialStats, GameComment, GameHighScore } from "@/types/community";
import type { AuthSession } from "@/types/auth";

interface GameSocialSectionProps {
  gameId: string;
  gameTitle: string;
  system: string;
  initialStats?: GameSocialStats | null;
  currentUser?: AuthSession["user"] | null;
}

export function GameSocialSection({
  gameId,
  gameTitle,
  system,
  initialStats,
  currentUser: initialUser,
}: GameSocialSectionProps) {
  const [stats, setStats] = useState<GameSocialStats>(
    initialStats || {
      averageRating: 0,
      totalRatings: 0,
      userRating: null,
      commentsCount: 0,
      recentComments: [],
      topScores: [],
    }
  );

  const [currentUser, setCurrentUser] = useState<AuthSession["user"] | null>(initialUser || null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [commentText, setCommentText] = useState("");
  const [isSubmittingComment, startCommentTransition] = useTransition();
  const [isSubmittingRating, startRatingTransition] = useTransition();
  const [commentError, setCommentError] = useState<string | null>(null);

  // High score submission modal/state
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [scoreInput, setScoreInput] = useState("");
  const [proofInput, setProofInput] = useState("");
  const [scoreNotes, setScoreNotes] = useState("");
  const [isSubmittingScore, startScoreTransition] = useTransition();
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [copiedScoreId, setCopiedScoreId] = useState<number | null>(null);

  // Optimistic rating state
  const [optimisticRating, setOptimisticRating] = useOptimistic(
    {
      userRating: stats.userRating,
      averageRating: stats.averageRating,
      totalRatings: stats.totalRatings,
    },
    (state, newRating: number) => {
      const alreadyRated = state.userRating !== null;
      const count = alreadyRated ? state.totalRatings : state.totalRatings + 1;
      const totalScore = state.averageRating * state.totalRatings - (state.userRating || 0) + newRating;
      const newAvg = count > 0 ? Number((totalScore / count).toFixed(1)) : newRating;
      return {
        userRating: newRating,
        averageRating: newAvg,
        totalRatings: count,
      };
    }
  );

  // Fetch initial/refreshed social stats if not fully provided
  useEffect(() => {
    let isMounted = true;
    fetch(`/roms/api/games/${encodeURIComponent(gameId)}/social`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.ok) {
          setStats(data.stats);
          if (data.currentUser) {
            setCurrentUser(data.currentUser);
          }
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [gameId]);

  // Handle rating click
  const handleRate = (stars: number) => {
    if (!currentUser) {
      setCommentError("Please log in to rate this title.");
      return;
    }

    startRatingTransition(async () => {
      setOptimisticRating(stars);
      const res = await submitGameRating(gameId, stars);
      if (res.ok) {
        setStats((prev) => {
          const hadRating = prev.userRating !== null;
          const count = hadRating ? prev.totalRatings : prev.totalRatings + 1;
          const total = prev.averageRating * prev.totalRatings - (prev.userRating || 0) + stars;
          return {
            ...prev,
            userRating: stars,
            totalRatings: count,
            averageRating: count > 0 ? Number((total / count).toFixed(1)) : stars,
          };
        });
      } else {
        setCommentError(res.error || "Failed to submit rating.");
      }
    });
  };

  // Handle comment submit
  const handlePostComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    if (!currentUser) {
      setCommentError("Please log in to post comments.");
      return;
    }

    setCommentError(null);
    startCommentTransition(async () => {
      const res = await postGameComment(gameId, commentText.trim());
      if (res.ok && res.comment) {
        setCommentText("");
        setStats((prev) => ({
          ...prev,
          commentsCount: prev.commentsCount + 1,
          recentComments: [res.comment as GameComment, ...prev.recentComments],
        }));
      } else {
        setCommentError(res.error || "Failed to post comment.");
      }
    });
  };

  // Handle comment delete
  const handleDeleteComment = async (commentId: number) => {
    const res = await deleteGameComment(commentId, gameId);
    if (res.ok) {
      setStats((prev) => ({
        ...prev,
        commentsCount: Math.max(0, prev.commentsCount - 1),
        recentComments: prev.recentComments.filter((c) => c.id !== commentId),
      }));
    } else {
      setCommentError(res.error || "Failed to delete comment.");
    }
  };

  // Handle High Score submit
  const handleScoreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const scoreVal = parseInt(scoreInput.replace(/,/g, ""), 10);
    if (isNaN(scoreVal) || scoreVal <= 0) {
      setScoreError("Please enter a valid positive score number.");
      return;
    }

    setScoreError(null);
    startScoreTransition(async () => {
      const res = await submitHighScoreAction({
        gameId,
        system,
        score: scoreVal,
        proofUrl: proofInput.trim() || undefined,
        metadata: scoreNotes.trim() ? { notes: scoreNotes.trim() } : undefined,
      });

      if (res.ok && res.scoreId) {
        setShowScoreModal(false);
        setScoreInput("");
        setProofInput("");
        setScoreNotes("");

        const newScore: GameHighScore = {
          id: res.scoreId,
          userId: currentUser?.id || "",
          gameId,
          system,
          score: scoreVal,
          proofUrl: proofInput.trim() || null,
          metadataJson: scoreNotes.trim() ? { notes: scoreNotes.trim() } : null,
          isVerified: true,
          createdAt: new Date().toISOString(),
          user: {
            id: currentUser?.id || "",
            username: currentUser?.username || "Player",
            displayName: currentUser?.displayName || null,
            avatarUrl: currentUser?.avatarUrl || null,
          },
        };

        setStats((prev) => ({
          ...prev,
          topScores: [...prev.topScores, newScore].sort((a, b) => b.score - a.score).slice(0, 5),
        }));
      } else {
        setScoreError(res.error || "Failed to submit high score.");
      }
    });
  };

  // Share High Score
  const handleShareScore = async (score: GameHighScore) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://www.oldsmarchaos.com";
    const shareUrl = `${origin}/roms/scores/${score.id}`;
    const shareText = `I just scored ${score.score.toLocaleString()} on ${gameTitle} (${system.toUpperCase()}) on ROM Vault! Can you beat it? ${shareUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `ROM Vault High Score: ${gameTitle}`,
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch {}
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedScoreId(score.id);
      setTimeout(() => setCopiedScoreId(null), 3000);
    } catch {
      window.prompt("Copy score link:", shareUrl);
    }
  };

  return (
    <div className="flex flex-col gap-6 pt-4 border-t border-white/10 text-zinc-200">
      {/* 1. Header & Star Rating Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-900/60 border border-white/10 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Star className="w-5 h-5 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black text-white">
                {optimisticRating.averageRating > 0 ? optimisticRating.averageRating.toFixed(1) : "—"}
              </span>
              <span className="text-xs text-zinc-400">/ 5.0</span>
              <span className="text-xs text-zinc-500">
                ({optimisticRating.totalRatings} {optimisticRating.totalRatings === 1 ? "rating" : "ratings"})
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              {optimisticRating.userRating
                ? `You rated this title ${optimisticRating.userRating} ★`
                : "Rate this game to support the community"}
            </p>
          </div>
        </div>

        {/* Interactive Star Picker */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          {[1, 2, 3, 4, 5].map((star) => {
            const activeVal = hoverRating ?? optimisticRating.userRating ?? 0;
            const isFilled = star <= activeVal;
            return (
              <button
                key={star}
                type="button"
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(null)}
                onClick={() => handleRate(star)}
                disabled={isSubmittingRating}
                className="p-1 rounded-lg hover:bg-white/10 transition cursor-pointer active:scale-95 disabled:opacity-50"
                title={`Rate ${star} star${star > 1 ? "s" : ""}`}
              >
                <Star
                  className={`w-6 h-6 transition ${
                    isFilled
                      ? "text-amber-400 fill-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]"
                      : "text-zinc-600 hover:text-zinc-400"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {commentError && (
        <div className="p-3 rounded-xl bg-red-950/80 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{commentError}</span>
        </div>
      )}

      {/* 2. Top High Scores & Submit Score Button */}
      <div className="flex flex-col gap-3 bg-zinc-900/60 border border-white/10 rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>Vault Leaderboard Records</span>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!currentUser) {
                setCommentError("Please log in to submit a high score.");
                return;
              }
              setShowScoreModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition cursor-pointer active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Submit Score</span>
          </button>
        </div>

        {stats.topScores.length === 0 ? (
          <p className="text-xs text-zinc-500 italic py-2">
            No high scores logged yet. Be the first to claim the top spot!
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-white/5">
            {stats.topScores.map((score, index) => {
              const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`;
              return (
                <div key={score.id} className="flex items-center justify-between py-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-bold w-6 text-center text-zinc-400">{medal}</span>
                    <span className="font-semibold text-white truncate">
                      {score.user.displayName || score.user.username}
                    </span>
                    {score.proofUrl && (
                      <a
                        href={score.proofUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-zinc-400 hover:text-white underline flex items-center gap-0.5"
                        title="View Score Proof Screenshot"
                      >
                        Proof <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-mono font-black text-amber-300">
                      {score.score.toLocaleString()} pts
                    </span>

                    <button
                      type="button"
                      onClick={() => handleShareScore(score)}
                      className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition cursor-pointer"
                      title="Share Score"
                    >
                      {copiedScoreId === score.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Share2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Community Comments Feed */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-400">
            <MessageSquare className="w-4 h-4" />
            <span>Community Discussion ({stats.commentsCount})</span>
          </div>
        </div>

        {/* Post Comment Input */}
        {currentUser ? (
          <form onSubmit={handlePostComment} className="flex flex-col gap-2">
            <div className="relative">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Share your review, strategies, secret codes, or memories..."
                maxLength={2000}
                rows={3}
                className="w-full rounded-xl bg-zinc-900 border border-white/15 px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-red-500 resize-none transition"
              />
              <div className="absolute right-3 bottom-3 text-[10px] text-zinc-500">
                {commentText.length} / 2000
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSubmittingComment || !commentText.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white shadow-md shadow-red-600/30 transition cursor-pointer active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSubmittingComment ? "Posting..." : "Post Comment"}</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/10 text-xs text-zinc-400 flex items-center justify-between">
            <span>Log in to join the conversation and post comments.</span>
            <a
              href="/roms/auth/login"
              className="font-bold text-red-400 hover:text-red-300 underline"
            >
              Log In
            </a>
          </div>
        )}

        {/* Comments List */}
        <div className="flex flex-col gap-2.5 mt-2 max-h-72 overflow-y-auto pr-1">
          {stats.recentComments.length === 0 ? (
            <p className="text-xs text-zinc-500 italic py-3 text-center">
              No comments posted yet. Start the conversation!
            </p>
          ) : (
            stats.recentComments.map((comment) => {
              const isAuthor = currentUser?.id === comment.author.id;
              const isAdmin = currentUser?.role === "admin";
              const canDelete = isAuthor || isAdmin;

              return (
                <div
                  key={comment.id}
                  className="flex flex-col gap-1.5 p-3 rounded-xl bg-zinc-900/40 border border-white/10 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-zinc-800 border border-white/15 flex items-center justify-center font-bold text-[10px] text-zinc-300 uppercase overflow-hidden shrink-0">
                        {comment.author.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={comment.author.avatarUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          (comment.author.displayName || comment.author.username).charAt(0)
                        )}
                      </div>
                      <span className="font-semibold text-white">
                        {comment.author.displayName || comment.author.username}
                      </span>
                      {comment.author.role === "admin" && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-red-600/30 text-red-400 border border-red-500/30">
                          Admin
                        </span>
                      )}
                      <span className="text-[10px] text-zinc-500">
                        {new Date(comment.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>

                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDeleteComment(comment.id)}
                        className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-white/10 transition cursor-pointer"
                        title="Delete Comment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-zinc-300 whitespace-pre-wrap leading-relaxed pl-8">
                    {comment.content}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 4. High Score Submission Modal */}
      {showScoreModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={() => setShowScoreModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-zinc-950 border border-white/20 p-5 shadow-2xl flex flex-col gap-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>Submit High Score for {gameTitle}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowScoreModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {scoreError && (
              <div className="p-2.5 rounded-lg bg-red-950 border border-red-500/40 text-red-200 text-xs">
                {scoreError}
              </div>
            )}

            <form onSubmit={handleScoreSubmit} className="flex flex-col gap-3">
              <div>
                <label className="block font-semibold text-zinc-300 mb-1">
                  Final Score (Numbers only) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 1420500"
                  value={scoreInput}
                  onChange={(e) => setScoreInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/15 text-white font-mono text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-300 mb-1">
                  Proof Screenshot / Clip URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://imgur.com/..."
                  value={proofInput}
                  onChange={(e) => setProofInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/15 text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-300 mb-1">
                  Notes (Character used, stage, difficulty)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Hard mode, Marco, 1CC"
                  value={scoreNotes}
                  onChange={(e) => setScoreNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/15 text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowScoreModal(false)}
                  className="px-4 py-2 rounded-xl font-semibold bg-white/10 hover:bg-white/20 text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingScore || !scoreInput}
                  className="px-4 py-2 rounded-xl font-bold bg-amber-500 hover:bg-amber-400 text-black shadow-md shadow-amber-500/20 disabled:opacity-50"
                >
                  {isSubmittingScore ? "Submitting..." : "Submit Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
