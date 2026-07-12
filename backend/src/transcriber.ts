import { readFile } from "node:fs/promises";
import { createClient } from "@deepgram/sdk";
import { config } from "./config.js";
import { logger } from "./logger.js";
import type { Transcript, TranscriptWord } from "./types.js";

/** Minimal shape of the Deepgram prerecorded response we rely on. */
interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence?: number;
  speaker?: number;
  punctuated_word?: string;
}

interface DeepgramResponse {
  metadata?: { duration?: number };
  results?: {
    channels?: {
      detected_language?: string;
      alternatives?: { words?: DeepgramWord[] }[];
    }[];
  };
}

/** Convert a Deepgram prerecorded response into our Transcript shape. */
export function parseDeepgram(res: DeepgramResponse): Transcript {
  const channel = res.results?.channels?.[0];
  const alt = channel?.alternatives?.[0];
  const raw = alt?.words ?? [];

  const words: TranscriptWord[] = raw.map((w) => ({
    word: w.punctuated_word ?? w.word,
    start: w.start,
    end: w.end,
    speaker: w.speaker,
    confidence: w.confidence,
  }));

  const speakers = new Set(
    raw.map((w) => w.speaker).filter((s): s is number => s !== undefined),
  );

  return {
    words,
    text: words.map((w) => w.word).join(" "),
    language: channel?.detected_language ?? "en",
    durationSec: Math.round(res.metadata?.duration ?? 0),
    speakerCount: Math.max(1, speakers.size),
  };
}

/**
 * Transcribe a local audio/video file with word-level timestamps and speaker
 * diarization (Deepgram nova-2). Requires DEEPGRAM_API_KEY.
 */
export async function transcribe(filePath: string): Promise<Transcript> {
  if (!config.DEEPGRAM_API_KEY) {
    throw new Error("DEEPGRAM_API_KEY is not configured");
  }
  const deepgram = createClient(config.DEEPGRAM_API_KEY);
  const buffer = await readFile(filePath);

  const { result, error } =
    await deepgram.listen.prerecorded.transcribeFile(buffer, {
      model: "nova-2",
      smart_format: true,
      punctuate: true,
      diarize: true,
    });

  if (error) throw new Error(`Deepgram error: ${error.message ?? error}`);

  const transcript = parseDeepgram(result as DeepgramResponse);
  logger.info(
    {
      filePath,
      words: transcript.words.length,
      speakers: transcript.speakerCount,
      language: transcript.language,
    },
    "Transcription complete",
  );
  return transcript;
}
