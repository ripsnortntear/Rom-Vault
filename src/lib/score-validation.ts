import { z } from "zod";

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
