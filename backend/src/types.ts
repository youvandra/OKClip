/**
 * Core domain types for OKClip.
 *
 * The A2A flow: a requesting agent sends a brief -> OKClip negotiates terms ->
 * escrow is funded -> OKClip processes the video -> it delivers decision-grade
 * clip metadata -> the agent approves (or requests a bounded revision).
 */

/** Aspect ratio of the output clips. */
export type AspectRatio = "16:9" | "9:16" | "1:1";

/** A natural-language clip request from a user's agent. */
export interface Brief {
  /** Source video (YouTube URL for v1). */
  url: string;
  /** What to clip, in natural language ("3 best DeFi moments, punchy"). */
  prompt: string;
  /** How many clips to produce (1..5). */
  clipCount: number;
  /** Optional explicit preferences; anything omitted may be negotiated. */
  aspectRatio?: AspectRatio;
  maxClipSeconds?: number;
  language?: string;
}

/** Terms agreed during negotiation, before escrow is funded. */
export interface NegotiatedTerms {
  clipCount: number;
  aspectRatio: AspectRatio;
  maxClipSeconds: number;
  /** Agreed price in USDT (string to avoid float drift). */
  priceUsdt: string;
  /** How many revision rounds are included. */
  revisionRounds: number;
}

/** A single word with timing and speaker, from the ASR layer. */
export interface TranscriptWord {
  word: string;
  start: number; // seconds
  end: number; // seconds
  speaker?: number; // diarization index
  confidence?: number;
}

/** Full transcript for a source video, cached for the revision window. */
export interface Transcript {
  words: TranscriptWord[];
  text: string;
  language: string;
  durationSec: number;
  speakerCount: number;
}

/** Why a moment was chosen — the decision-grade evidence per clip. */
export interface ClipEvidence {
  sourceDurationSec: number;
  analyzedSegments: number;
  asr: string;
  caveat: string;
}

/** One delivered clip: a file plus the structured reasoning an agent approves on. */
export interface ClipResult {
  downloadUrl: string;
  thumbnailUrl: string;
  /** Heuristic 0..95 — never certainty. */
  viralScore: number;
  /** How well the moment matches the brief, 0..1. */
  confidence: number;
  durationSec: number;
  timestamp: { startSec: number; endSec: number };
  transcriptSnippet: string;
  speakers: string[];
  /** Human/agent-readable reasons this moment was picked. */
  reasons: string[];
  caption: string;
  hashtags: string[];
  evidence: ClipEvidence;
}

/**
 * A moment chosen by the analyzer, before it is cut into a file. Timestamps are
 * already snapped to sentence boundaries.
 */
export interface SelectedMoment {
  startSec: number;
  endSec: number;
  viralScore: number; // 0..95
  confidence: number; // 0..1
  reasons: string[];
  transcriptSnippet: string;
  speakers: string[];
  caption: string;
  hashtags: string[];
}

/** A candidate moment that was scored but not clipped. */
export interface RunnerUpMoment {
  timestamp: { startSec: number; endSec: number };
  viralScore: number;
  reason: string;
}

/** Lifecycle of a clip job. */
export type JobStatus =
  | "negotiating"
  | "queued"
  | "downloading"
  | "transcribing"
  | "analyzing"
  | "clipping"
  | "delivering"
  | "revising"
  | "done"
  | "failed";

/** A unit of work tracked by the queue. */
export interface ClipJob {
  id: string;
  agentId: string;
  status: JobStatus;
  brief: Brief;
  terms: NegotiatedTerms;
  output?: ClipResult[];
  runnerUps?: RunnerUpMoment[];
  /** Kept for the revision window so revisions skip re-ASR. */
  transcriptCache?: Transcript;
  /** Kept until approval/expiry so revisions skip re-download. */
  sourcePath?: string;
  /** Set once the requesting agent approves the delivery (escrow releases). */
  approved?: boolean;
  /** Revision rounds consumed so far. */
  revisionsUsed: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

/** Result of a negotiation round, before escrow is funded. */
export type NegotiationResult =
  | {
      kind: "proposal";
      terms: NegotiatedTerms;
      priceBreakdown: PriceBreakdown;
      /** Inferred choices the agent should confirm (e.g. aspect ratio). */
      assumptions: string[];
    }
  | { kind: "clarify"; questions: string[] }
  | { kind: "decline"; reason: string };

/** Transparent price components (honesty: the fee matches real cost). */
export interface PriceBreakdown {
  baseUsdt: string;
  lengthSurchargeUsdt: string;
  totalUsdt: string;
  note: string;
}

/** The full delivery handed back to the requesting agent. */
export interface Delivery {
  jobId: string;
  status: JobStatus;
  clips: ClipResult[];
  runnerUps: RunnerUpMoment[];
  message: string;
  approved: boolean;
}

/** A per-clip rejection during the revision loop. */
export interface ClipRejection {
  clipIndex: number;
  feedback: string;
}
