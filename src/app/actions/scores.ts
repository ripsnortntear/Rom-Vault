"use server";

import { z } from "zod";
import { revalidateTag, updateTag } from "next/cache";
import { getCurrentSession } from "@/lib/auth/session";
import { checkRateLimit, recordRateLimitEvent } from "@/lib/auth/rate-limit";
import { submitHighScore, getHighScoreById } from "@/lib/community";
import { isSafeHttpUrl, getSafeHttpUrl } from "@/lib/security";

export const submitScoreSchema = z.object({
  gameId: z.string().min(1, "Game ID is required").max(255),
  system: z.string().min(1, "System identifier is required"),
  score: z.number().int().positive("Score must be a positive integer"),
  proofUrl: z
    .string()
    .max(500)
    .refine(
      (val) => {
        if (!val || val === "") return true;
        try {
          const parsed = new URL(val);
          return parsed.protocol === "http:" || parsed.protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "Proof URL must be a valid HTTP or HTTPS web address." }
    )
    .optional()
    .or(z.literal("")),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const ScoreSubmissionSchema = submitScoreSchema;

export async function submitHighScoreAction(data: {
  gameId: string;
  system: string;
  score: number;
  proofUrl?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const session = await getCurrentSession();
    if (!session?.user) {
      return { ok: false, error: "You must be logged in to submit high scores." };
    }

    const validated = ScoreSubmissionSchema.safeParse(data);
    if (!validated.success) {
      return { ok: false, error: validated.error.issues[0]?.message || "Invalid score submission." };
    }

    // Rate limiting: max 10 score submissions per minute
    const rateLimit = await checkRateLimit({
      action: "submit_score",
      identifier: session.user.id,
      maxAttempts: 10,
      windowSeconds: 60,
    });

    if (!rateLimit.allowed) {
      return {
        ok: false,
        error: `Submitting scores too quickly. Please wait ${rateLimit.retryAfterSeconds} seconds.`,
      };
    }

    const scoreId = await submitHighScore({
      userId: session.user.id,
      gameId: validated.data.gameId,
      system: validated.data.system,
      score: validated.data.score,
      proofUrl: getSafeHttpUrl(validated.data.proofUrl) || null,
      metadataJson: validated.data.metadata || null,
    });

    await recordRateLimitEvent("submit_score", session.user.id);

    try {
      updateTag("leaderboards");
      revalidateTag("leaderboards", "max");
      updateTag(`game-social-${validated.data.gameId}`);
      revalidateTag(`game-social-${validated.data.gameId}`, "max");
    } catch {}

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.oldsmarchaos.com/roms";
    const shareUrl = `${appUrl}/scores/${scoreId}`;

    return {
      ok: true,
      scoreId,
      shareUrl,
    };
  } catch (error: any) {
    console.error("[submitHighScoreAction] Error:", error);
    return { ok: false, error: "An unexpected error occurred while saving your high score." };
  }
}

export async function getScoreDetailsAction(scoreId: number) {
  try {
    const score = await getHighScoreById(scoreId);
    if (!score) {
      return { ok: false, error: "Score not found" };
    }
    return { ok: true, score };
  } catch (error: any) {
    console.error("[getScoreDetailsAction] Error:", error);
    return { ok: false, error: "Failed to retrieve score details." };
  }
}
