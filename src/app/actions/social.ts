"use server";

import { z } from "zod";
import { revalidateTag, updateTag } from "next/cache";
import { getCurrentSession } from "@/lib/auth/session";
import { checkRateLimit, recordRateLimitEvent } from "@/lib/auth/rate-limit";
import { submitRating, postComment, deleteComment } from "@/lib/community";

const RatingSchema = z.object({
  gameId: z.string().min(1, "Game ID is required"),
  rating: z.number().int().min(1, "Rating must be at least 1").max(5, "Rating cannot exceed 5"),
});

const CommentSchema = z.object({
  gameId: z.string().min(1, "Game ID is required"),
  content: z
    .string()
    .trim()
    .min(1, "Comment cannot be empty")
    .max(2000, "Comment cannot exceed 2000 characters"),
});

export async function submitGameRating(gameId: string, rating: number) {
  try {
    const session = await getCurrentSession();
    if (!session?.user) {
      return { ok: false, error: "You must be logged in to rate games." };
    }

    const validated = RatingSchema.safeParse({ gameId, rating });
    if (!validated.success) {
      return { ok: false, error: validated.error.issues[0]?.message || "Invalid rating input." };
    }

    await submitRating(session.user.id, validated.data.gameId, validated.data.rating);

    try {
      updateTag(`game-social-${gameId}`);
      revalidateTag(`game-social-${gameId}`, "max");
    } catch {}

    return { ok: true, rating: validated.data.rating };
  } catch (error: any) {
    console.error("[submitGameRating Action] Error:", error);
    return { ok: false, error: "An unexpected error occurred while saving your rating." };
  }
}

export async function postGameComment(gameId: string, content: string) {
  try {
    const session = await getCurrentSession();
    if (!session?.user) {
      return { ok: false, error: "You must be logged in to post comments." };
    }

    const validated = CommentSchema.safeParse({ gameId, content });
    if (!validated.success) {
      return { ok: false, error: validated.error.issues[0]?.message || "Invalid comment text." };
    }

    // Rate limiting: max 5 comments per minute per user
    const rateLimit = await checkRateLimit({
      action: "post_comment",
      identifier: session.user.id,
      maxAttempts: 5,
      windowSeconds: 60,
    });

    if (!rateLimit.allowed) {
      return {
        ok: false,
        error: `Posting too quickly. Please wait ${rateLimit.retryAfterSeconds} seconds before commenting again.`,
      };
    }

    const comment = await postComment(session.user.id, validated.data.gameId, validated.data.content);
    await recordRateLimitEvent("post_comment", session.user.id);

    try {
      updateTag(`game-social-${gameId}`);
      revalidateTag(`game-social-${gameId}`, "max");
    } catch {}

    return { ok: true, comment };
  } catch (error: any) {
    console.error("[postGameComment Action] Error:", error);
    return { ok: false, error: "An unexpected error occurred while posting your comment." };
  }
}

export async function deleteGameComment(commentId: number, gameId?: string) {
  try {
    const session = await getCurrentSession();
    if (!session?.user) {
      return { ok: false, error: "You must be logged in to delete comments." };
    }

    const isAdmin = session.user.role === "admin";
    const success = await deleteComment(commentId, session.user.id, isAdmin);

    if (!success) {
      return { ok: false, error: "Comment could not be found or you lack permission to delete it." };
    }

    if (gameId) {
      try {
        updateTag(`game-social-${gameId}`);
        revalidateTag(`game-social-${gameId}`, "max");
      } catch {}
    }

    return { ok: true };
  } catch (error: any) {
    console.error("[deleteGameComment Action] Error:", error);
    return { ok: false, error: "An unexpected error occurred while deleting the comment." };
  }
}
