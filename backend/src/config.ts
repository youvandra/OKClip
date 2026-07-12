import "dotenv/config";
import { z } from "zod";
import { logger } from "./logger.js";

/**
 * Environment schema. Secrets are optional so the server can boot for health
 * checks and local development; features that need a key check it at call time
 * and fail clearly if it is missing.
 */
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  DEEPGRAM_API_KEY: z.string().optional(),

  SUMOPOD_API_KEY: z.string().optional(),
  SUMOPOD_BASE_URL: z.string().url().default("https://ai.sumopod.com/v1"),
  SUMOPOD_MODEL: z.string().default("deepseek-v4-flash"),

  STORAGE_DIR: z.string().default("/tmp/okclip"),
  // Persistent (not tmp) — per-agent style memory survives restarts.
  PREFERENCES_DIR: z.string().default("data/preferences"),
  CLIP_TTL_MS: z.coerce.number().int().positive().default(24 * 60 * 60 * 1000),

  MAX_SOURCE_SECONDS: z.coerce.number().int().positive().default(2 * 60 * 60),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  logger.error(
    { issues: parsed.error.flatten().fieldErrors },
    "Invalid environment configuration",
  );
  throw new Error("Invalid environment configuration");
}

export const config = parsed.data;

/** True when the given feature has the credentials it needs. */
export const features = {
  transcription: Boolean(config.DEEPGRAM_API_KEY),
  analysis: Boolean(config.SUMOPOD_API_KEY),
} as const;

// Surface missing-but-optional keys once at boot so it is obvious in dev.
for (const [feature, ready] of Object.entries(features)) {
  if (!ready) {
    logger.warn(`Feature "${feature}" is disabled — missing API key`);
  }
}
