# OKClip — Project Plan

## Overview
OKClip is an **A2A Agent Service Provider** on OKX.AI that creates smart video clips from YouTube. A user's agent sends a URL + natural-language brief, OKClip **negotiates** the scope and price, then uses AI to find the best moments, clip them, add subtitles, and return **decision-grade clip metadata** — structured data the requesting agent can evaluate and approve, plus downloadable files ready to post on social media.

## Why A2A (not A2MCP)?
Per OKX.AI docs, A2A fits tasks that need **judgment, custom output, multi-round iteration, and project-based pricing** — settled through **escrow on X Layer, released after the user's agent confirms**. Clipping a video to a subjective brief ("3 best DeFi moments, punchy, vertical") is exactly that: not a fixed API call, but a negotiated deliverable. A2MCP (pay-per-call, no negotiation, instant settlement) would reduce OKClip to a dumb API. The negotiation + revision loop is the core of the A2A value, not an afterthought.

## Why Agent-Native?
OKClip is a **composable service** other AI agents call to build workflows:

```
Agent finds trending video on X -> sends to OKClip -> gets 3 viral clips with subtitles
Agent monitors YouTube channel -> sends new uploads to OKClip -> auto-posts highlights to TikTok
```

## Tech Stack
- **Runtime**: Node.js + TypeScript + Express
- **Video Download**: yt-dlp (Python CLI)
- **Transcription + Diarization**: Deepgram (nova-2) — transcription, **word-level timestamps**, and **native speaker diarization** in one API, handles long audio without a 25 MB cap. (Whisper API is transcription-only and caps at 25 MB/file; kept only as a fallback ASR, diarization not available there.)
- **Video Processing**: FFmpeg
- **AI Analysis**: Sumopod API (LLM for transcript analysis, moment selection, viral scoring)
- **Storage**: VPS local temp files
- **Frontend**: Alpine.js + Tailwind CSS (CDN, no build step)

> **ASR decision.** The original plan named "Whisper diarization," which does not exist — OpenAI Whisper does not do speaker diarization, and its API caps uploads at 25 MB (a 1–2 h podcast is far larger, forcing manual chunking). Deepgram nova-2 provides transcription + word-level timestamps + diarization in a single call, accepts long audio, and is cheaper (~$0.0043/min vs Whisper's $0.006/min). This fixes three problems at once.

## ASP Type
**A2A (Agent-to-Agent)** — async processing, negotiated pricing, multi-round iteration, escrow payment on X Layer.

## Architecture

```
User Agent -> A2A negotiate (URL + brief)
           -> OKClip clarifies + counters (platform? tone? length? price for scope)
           -> terms agreed -> escrow funded on X Layer
           -> yt-dlp download video (720p)
           -> Deepgram transcribe + word-level timestamps + speaker diarization
           -> LLM analyze transcript -> best timestamps + viral score + why-picked reasons
           -> FFmpeg clip segments at sentence boundaries, burn subtitles
           -> extract best-frame thumbnail per clip
           -> upload to temp storage
           -> deliver DECISION-GRADE metadata (score + reasons + evidence + snippet + links)
           -> User Agent evaluates -> approve -> escrow released
              or reject with feedback -> OKClip revises affected clips (revision loop)
```

## Delivery Shape (per clip) — decision-grade

Escrow requires the user's agent to **approve before funds release**, but an agent cannot watch a video. So the delivery is **structured decision data** the agent can reason over — not just an mp4 link. Every clip explains **why it was chosen** (the txwrap lesson: evidence travels with every result).

```jsonc
{
  "downloadUrl": "https://...",
  "thumbnailUrl": "https://...",
  "viralScore": 87,                 // heuristic, capped at 95 — never certainty
  "confidence": 0.82,               // how sure the moment matches the brief
  "duration": "00:47",
  "timestamp": { "start": "04:32", "end": "05:19" },
  "transcriptSnippet": "...",       // the actual words in the clip (agent-readable)
  "speakers": ["Host", "Guest"],
  "reasons": [                      // WHY this moment was picked
    "brief match: DeFi discussion (topic score 0.9)",
    "laughter/volume spike at 04:35",
    "question -> answer exchange (Host asks, Guest reveals)",
    "starts and ends on complete sentence boundaries"
  ],
  "caption": "...",                 // auto caption for posting
  "hashtags": ["#DeFi", "..."],
  "evidence": {                     // honesty block — borrowed from txwrap
    "sourceDurationSec": 3720,
    "analyzedSegments": 214,
    "asr": "deepgram-nova-2",
    "caveat": "Moment ranking is heuristic over the transcript, not a guarantee of virality."
  }
}
```

Optional **runner-up moments** (candidate timestamps not clipped) let the agent swap a pick without a full re-process.

## Negotiation & Revision (the A2A core)

**Negotiation** — OKClip does not just accept a brief; it aligns on scope like a freelancer:
- Missing info -> clarifying question ("Which platform — TikTok 9:16 or YouTube 16:9?", "Tone: punchy or explainer?", "Max clip length?").
- Scope/price -> counter-offer ("5 clips from a 2 h source is 2.5 USDT — proceed?").
- Out-of-scope -> decline honestly ("Source is 3 h, over the 2 h limit — split the URL or reduce range").

**Revision loop** — after delivery, the user's agent can reject specific clips with feedback ("clip 2 is too long, cut to the punchline"). OKClip re-clips **only** the affected moments (transcript already cached) and re-delivers. Bounded revision rounds are part of the agreed terms.

## Feature Set

### Core (MVP)
| Feature | Description | Effort |
|---------|-------------|--------|
| Negotiation intelligence | Clarify brief, counter-offer scope/price, decline out-of-scope | Base (A2A core) |
| Smart clip | YouTube URL + brief -> AI finds best moment -> clip | Base |
| Multi-clip | User requests N clips (up to 5) from 1 video | 30 min |
| Evidence block | Every clip carries why-picked reasons + confidence + evidence | 1h (differentiator) |
| Decision-grade delivery | Structured metadata the agent can approve without watching | 1h |
| Download link | Temporary download URL | Base |

### Stage 2 (Polish)
| Feature | Description | Effort |
|---------|-------------|--------|
| Auto-subtitles | Deepgram transcript burned into video overlay | 1h |
| Speaker labeling | Diarization: "Host:" vs "Guest:" in subtitles | 1h (native in Deepgram) |
| Sentence-boundary clipping | Never cut mid-word (word-level timestamps) | 1h |
| Best-frame thumbnail | Extract best frame + text overlay per clip (frame pick + caption, not image-gen) | 2h |
| Viral score | AI rates clip 0–95 for viral potential, with reasons | 1h |
| Revision loop | Re-clip rejected moments on feedback (transcript cached) | 1.5h |
| Runner-up moments | Return candidate timestamps not clipped | 30 min |

### Stage 3 (Expansion)
| Feature | Description | Effort |
|---------|-------------|--------|
| Vertical reformat | Auto-crop 16:9 -> 9:16 for TikTok/Reels **with face/subject tracking** (naive center-crop cuts off the speaker) | 3h |
| Clip stitching | Combine N clips into 1 highlight reel with transitions | 1.5h |
| Playlist batch | YouTube playlist -> clip from all videos | 2h |
| Multi-language | Auto-detect language (Deepgram) -> language-aware LLM prompt | 1h |
| Style memory | Per-agent preference profiling (data moat) | 2h |

## Pricing Model (Negotiable A2A)

Transcription (ASR) cost scales with **source video length**, and is paid **once per task** regardless of clip count. Clipping itself (FFmpeg) is near-free CPU. So price = a clip-count tier + a source-length surcharge.

| Clip Count | Base Price (source <= 30 min) |
|------------|-------------------------------|
| 1 clip | 0.5 USDT |
| 3 clips | 1 USDT |
| 5 clips | 1.5 USDT |

**Source-length surcharge:** +0.5 USDT per additional 30-minute block (covers extra ASR). Negotiated per task, so a long podcast is quoted honestly up front.

Premium add-ons (negotiable): vertical reformat with face-tracking (+0.5), custom subtitle style (+0.1), highlight-reel stitch (+0.5).

## Cost Model (our side, honest)

Per-task cost, not per-clip — ASR and LLM run once over the whole video:

| Component | Cost | Scales with |
|-----------|------|-------------|
| yt-dlp download | $0 (bandwidth) | — |
| Deepgram ASR (nova-2, ~$0.0043/min) | $0.043 (10 min) · $0.26 (60 min) · $0.52 (120 min) | source length |
| LLM analysis (Sumopod) | ~$0.005 | source length (transcript size) |
| FFmpeg clip + subtitle burn | $0 (VPS CPU) | clip count |
| Best-frame thumbnail | $0 (VPS CPU) | clip count |
| Storage (temp, 24h) | $0 (VPS disk) | — |

Example margins:
- 10-min source, 3 clips: cost ~$0.05, charge 1 USDT -> ~20x
- 60-min source, 3 clips: cost ~$0.27, charge 1 + 0.5 surcharge = 1.5 USDT -> ~5x
- 120-min source, 5 clips: cost ~$0.53, charge 1.5 + 1.5 surcharge = 3 USDT -> ~5x

Margins hold because the surcharge tracks the ASR cost that actually scales.

## Video Processing Pipeline

```
yt-dlp (download)  ->  Deepgram (transcribe + word-level + diarize)  ->  LLM (find moments + viral score + reasons)
   30s-2min                        10-60s                                          2-5s
                                                        |
Subtitle burn  <-  thumbnail (best frame)  <-  FFmpeg (clip at sentence boundary)
     5-10s                 2s                            5-15s per segment
```

Total: ~1–5 minutes per task (async — hence A2A, not a sync API call).

## Storage Strategy
- Raw video: deleted after processing
- Transcript: cached per task for the revision window (avoids re-ASR on revision)
- Clips: stored 24 hours, then auto-cleaned
- Storage: `/tmp/okclip/` on VPS

## Constraints (v1)
- YouTube only (expand to TikTok/Twitter later)
- Max source length: 2 hours (product cap, not an ASR limit — keeps task latency and cost bounded; longer sources are declined during negotiation)
- Max 5 clips per task
- Requires yt-dlp & FFmpeg on server, Deepgram API key
- Bounded revision rounds per task (agreed during negotiation)

## Technical Moats

### Clip Intelligence (Core Moat)

**Evidence-backed moment selection.** Every clip ships the reasons it was picked (topic match, audio/visual signal, conversational structure, boundary quality) plus a confidence score — so the requesting agent can *justify* accepting it, not just receive a black-box `viralScore`. Directly borrowed from what made txwrap decision-grade.

**Hook Detection** — first 3 seconds make or break:
- Word-level Deepgram timestamps -> high-emotion words as clip entry point
- FFmpeg audio-amplitude analysis -> volume spikes (excitement, laugh, gasp)
- FFmpeg scene-change detection -> visual cut points

**Sentence-Boundary Clipping** — never cut mid-word; word-level timestamps ensure every clip starts/ends on complete sentences.

**Speaker-Aware Moments** — understand conversation dynamics via diarization:
- "Clip when the guest answers the host's question"
- "Clip the debate moment — host interrupts guest"
- "Clip the reveal / plot twist"

**Visual Change Detection** — FFmpeg scene detection for "clip when the slide changes", "clip when the demo starts", "clip the visual punchline".

**Clip Narrative Chain** — N clips tell a story (problem -> deep dive -> twist -> solution -> punchline), not random cuts.

**Auto Caption + Hashtag** — each clip comes with AI caption, hashtags, and suggested posting time.

### Data Moat — Style Memory

OKClip learns per-agent preferences over time:
```
Agent preferences (auto-tuned from history):
  aspectRatio: 9:16
  subtitleStyle: bold
  maxDuration: 30s
  promptPatterns: ["tutorial", "explain"]
```
Storage: `data/preferences/<agentId>.json`. Why it's a moat: switching competitor loses all history; more usage -> more accurate -> higher switching cost; aggregated data improves defaults for everyone.

### Moat Hierarchy
| Tier | Feature | Status |
|------|---------|--------|
| 🔒 Hardest | Style memory (data moat) | Needs user base |
| 🔒 Hard | Evidence-backed selection + negotiation/revision | A2A core |
| 🔒 Hard | Sentence-boundary + speaker-aware | Word-level + diarization |
| 🔒 Hard | Clip narrative chain | Prompt engineering |
| 🔒 Medium | Hook detection (audio/visual) | FFmpeg + ASR |
| 🔒 Medium | Visual change detection | FFmpeg scene detect |
| 🟡 Easy | Auto hashtag + caption | LLM trivial |

## A2A Interaction Flow

```
User Agent -> discover OKClip on OKX.AI marketplace (asp, category content)

User Agent -> asp-match: "1 YouTube URL, 3 best clips about DeFi, vertical"

OKClip -> clarify + counter: "Vertical 9:16 for TikTok, punchy tone, <= 30s each?
          Source is 45 min -> 1 USDT + 0.5 length surcharge = 1.5 USDT. Proceed?"

User Agent -> agree -> escrow funded on X Layer

OKClip processes:
  yt-dlp download -> Deepgram transcribe+diarize -> LLM select moments + score + reasons
  -> FFmpeg clip at sentence boundaries -> burn subtitles -> best-frame thumbnails

OKClip -> deliver: 3 clips, each with viralScore + reasons + confidence + snippet
          + thumbnail + caption + evidence
          message: "3 clips. Each explains why it was picked. Approve to release, or
          reject a clip with feedback to revise."

User Agent -> approve -> escrow released
           or reject clip 2 ("too long") -> OKClip re-clips clip 2 from cached transcript

Dispute: handled per OKX A2A escrow rules — arbitration terms and any deposit are
         set by the platform, NOT invented here. Verify exact rules at registration.
```

## Detailed Architecture

```
okclip/
├── backend/src/
│   ├── index.ts              # Express server + A2A handler
│   ├── config.ts             # Env config (Sumopod, Deepgram keys)
│   ├── types.ts              # Task, Clip, Transcript, Delivery, Negotiation types
│   ├── negotiation.ts        # Clarify brief, counter-offer, decline out-of-scope
│   ├── pipeline.ts           # Pipeline orchestrator
│   ├── downloader.ts         # yt-dlp integration (download -> validate)
│   ├── transcriber.ts        # Deepgram (transcribe + diarize + word-level)
│   ├── analyzer.ts           # LLM moment selection + viral score + reasons/evidence
│   ├── clipper.ts            # FFmpeg (cut at boundary, subtitle burn, reformat)
│   ├── thumbnail.ts          # Best-frame extraction + text overlay
│   ├── delivery.ts           # Decision-grade delivery + revision handling
│   ├── storage.ts            # Temp file management (store, serve, cleanup)
│   ├── memory.ts             # Style memory — per-agent preference profiling
│   ├── caption.ts            # Auto caption + hashtag generator
│   ├── queue.ts              # In-memory job queue (single-worker, MVP)
│   └── cleanup.ts            # Cron — delete files >24h old
└── data/
    └── preferences/          # Per-agent style memory JSON files
```

## Job Queue (in-memory, MVP)

No external queue for the hackathon:

```ts
interface ClipJob {
  id: string;
  agentId: string;
  status: "negotiating" | "queued" | "downloading" | "transcribing"
        | "analyzing" | "clipping" | "delivering" | "revising" | "done" | "failed";
  input: { url: string; brief: string; clipCount: number; terms: NegotiatedTerms };
  output?: ClipResult[];
  transcriptCache?: Transcript;   // kept for the revision window
  error?: string;
  createdAt: number;
}
```

Single-worker sequential; max 1 concurrent download to avoid bandwidth saturation.

## Edge Cases & Fallbacks

| Scenario | Handling |
|----------|----------|
| yt-dlp fails (age-restricted, private, deleted) | Return error during/after negotiation -> agent can cancel/retry |
| Source > 2 hours | Decline during negotiation (product cap) |
| No spoken words (music/visual only) | Fallback to visual scene-change detection + explicit low confidence |
| Language not English | Auto-detect via Deepgram -> language-aware LLM prompt |
| FFmpeg fails (corrupt download) | Re-download once, then fail |
| Clip too short (<5s) | Extend buffer or skip, flag in reasons |
| Storage full | Reject new tasks, trigger immediate cleanup |
| Revision requested | Re-clip only affected moments from cached transcript (no re-ASR) |

## Competitive Positioning

| Tool | Type | AI Clip | Agent-Native | Pay-Per-Use | Evidence-backed | Subtitles | Vertical |
|------|------|---------|--------------|-------------|-----------------|-----------|----------|
| Opus Clip | SaaS | ✅ | ❌ | $19/mo sub | ❌ | ✅ | ✅ |
| Veed.io | Web | ❌ | ❌ | Freemium | ❌ | ✅ | ❌ |
| Kapwing | Web | ❌ | ❌ | Freemium | ❌ | ✅ | ❌ |
| Munch | SaaS | ✅ | ❌ | $49/mo sub | ❌ | ✅ | ✅ |
| **OKClip** | **A2A ASP** | **✅** | **✅** | **Pay-per-clip** | **✅** | **✅** | **✅** |

**OKClip's unique angle:** not a web app — an agent service other agents compose into workflows, and the only one that returns **why each clip was picked** so a requesting agent can approve it programmatically.

## Honesty Rules (borrowed from txwrap)

- **Viral score is capped at 95.** A transcript heuristic can never justify certainty.
- **Evidence travels with every clip.** Source length, segments analyzed, ASR used, and an explicit caveat.
- **Reasons are real signals**, not decoration — topic-match scores, audio spikes, boundary quality, conversational structure. No invented justification.
- **The fee matches reality.** A quoted price reflects the actual scope; length surcharge covers real ASR cost.
- **No invented platform rules.** Escrow, arbitration, and deposit terms come from OKX A2A, not hardcoded guesses.

## Demo Script (90s)

```
0:00 — Title: "OKClip — AI Smart Clip Agent (A2A on OKX.AI)"
0:05 — User agent discovers OKClip on the OKX.AI marketplace
0:10 — Brief: "Clip 3 best DeFi moments from this podcast, vertical"
0:15 — NEGOTIATION: OKClip clarifies tone + length, quotes 45-min source at 1.5 USDT -> agree -> escrow funded
0:28 — Processing: download -> transcribe+diarize -> analyze -> clip
0:40 — Delivery: 3 clips, each with viralScore + REASONS + confidence + speaker labels
0:52 — Clip 1: viral score 87, reasons "laughter spike + Q->A exchange"
1:02 — Clip 2 rejected "too long" -> REVISION: re-clipped from cached transcript in seconds
1:12 — User agent approves -> escrow released on X Layer
1:18 — Clip showcase: vertical, subtitles, speaker-labeled
1:24 — End card: "OKClip — on OKX.AI"
```

## Success Metrics
- Agent-native differentiator: no existing AI clip tool has A2A integration
- Decision-grade: every clip carries why-picked reasons + evidence (the txwrap edge)
- Composable: other agents call OKClip inside larger workflows
- Viral-ready output: subtitles, thumbnails, captions, viral scores
- Data moat: style memory locks in repeat users

## Submission
Built for the OKX.AI Genesis Hackathon. Deadline: **Jul 17, 2026 23:59 UTC**.
```
Registration flow (per docs, run by wallet owner): install `okx/onchainos-skills`,
log in to Agentic Wallet, register an **A2A** ASP, then **list** it (registration
alone does not publish). OKX reviews within 24h. Escrow/arbitration terms follow the
platform's A2A rules — confirm exact numbers at registration, do not assume.
```
