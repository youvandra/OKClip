# OKClip

**An A2A Agent Service Provider on OKX.AI that turns a YouTube URL + a brief
into decision-grade video clips.** A requesting agent sends a video and a
natural-language brief; OKClip negotiates scope and price, finds the best
moments, cuts them with burned-in speaker-labeled subtitles, and returns
**structured clip metadata the agent can approve** — every clip carrying a viral
score, a confidence, and the *reasons it was picked*.

Built for the OKX.AI Genesis Hackathon. Sibling project to
[txwrap](https://github.com/youvandra/txwrap).

| | |
|---|---|
| **Type** | A2A (Agent-to-Agent) — negotiated, escrow-settled on X Layer |
| **Agent surface** | `POST /a2a/*` (JSON) |
| **Human surface** | `/` — Alpine + Tailwind SPA |
| **Pricing** | clip-count tier + source-length surcharge (see below) |

---

## Why A2A, not a clip SaaS

Clipping a video is a commodity. What makes OKClip decision-grade:

- **Negotiation, not a fixed call.** OKClip infers the platform/aspect from the
  brief, prices the job transparently, states its assumptions, and declines
  out-of-scope work — the A2A judgment layer.
- **Evidence per clip.** Every moment ships `reasons` (topic match, laughter
  spike, question→answer, sentence-boundary), a `confidence`, and an `evidence`
  block. The requesting agent approves on data, not a black-box score.
- **Revision loop.** Reject a clip with feedback; OKClip re-cuts just that
  moment from the cached transcript (no re-download, no re-ASR).
- **Style memory.** Per-agent preferences (aspect, length, topics) are inferred
  from history and auto-fill future briefs — a switching-cost data moat.

Full strategy in [docs/VISION.md](docs/VISION.md).

---

## A2A flow

```
POST /a2a/negotiate   { agentId, brief }        -> proposal | clarify | decline
POST /a2a/jobs        { agentId, brief, terms } -> { jobId }  (funds escrow)
GET  /a2a/jobs/:id                              -> delivery (poll)
POST /a2a/jobs/:id/approve                      -> releases escrow, records memory
POST /a2a/jobs/:id/revise { rejections[] }      -> re-clips rejected moments
GET  /clips/:jobId/:file                        -> the produced mp4 / thumbnail
```

A `brief` is `{ url, prompt, clipCount (1–5), aspectRatio?, maxClipSeconds?, language? }`.
Each delivered clip:

```jsonc
{
  "downloadUrl": "/clips/<job>/clip-1.mp4",
  "thumbnailUrl": "/clips/<job>/clip-1.jpg",
  "viralScore": 87,            // heuristic, capped at 95 — never certainty
  "confidence": 0.82,
  "durationSec": 47,
  "timestamp": { "startSec": 272, "endSec": 319 },
  "transcriptSnippet": "...",
  "speakers": ["Host", "Guest 1"],
  "reasons": ["topic match: DeFi", "question -> answer exchange", "opens on a scene cut"],
  "caption": "...", "hashtags": ["#DeFi"],
  "evidence": { "sourceDurationSec": 3720, "analyzedSegments": 214, "asr": "deepgram-nova-2", "caveat": "..." }
}
```

---

## Pipeline

```
yt-dlp download (720p) -> Deepgram transcribe + word-level + diarize
  -> LLM select moments (+ score + reasons + runner-ups)
  -> scene-cut refine (hook) -> FFmpeg cut + burn speaker-labeled subtitles
  -> thumbnail -> decision-grade delivery
```

The metrics/selection are deterministic where possible; the LLM writes the
selection and captions. Scene detection degrades gracefully.

---

## Pricing

| Clips | Base (source ≤ 30 min) |
|-------|------------------------|
| 1 | 0.5 USDT |
| 3 | 1 USDT |
| 5 | 1.5 USDT |

**+0.5 USDT per extra 30-minute block** of source (transcription cost scales
with length, and is paid once per task, not per clip).

---

## Run locally

### Prerequisites
Node.js 20+, `yt-dlp` and `ffmpeg` on PATH, a Deepgram API key, a Sumopod
(OpenAI-compatible) API key.

```bash
# macOS
brew install yt-dlp ffmpeg
```

### Start
```bash
cd backend
npm install
cp .env.example .env     # fill in DEEPGRAM_API_KEY + SUMOPOD_API_KEY
npm run dev              # http://localhost:3001
```

Open `http://localhost:3001` for the SPA, or POST to `/a2a/*` as an agent.

### Scripts
```bash
npm run dev        # tsx watch
npm run build      # tsc -> dist/
npm start          # node dist/index.js
npm test           # node:test suite (hermetic, no network)
npm run typecheck  # tsc --noEmit
```

---

## Configuration

See [docs/STACK.md](docs/STACK.md) for the full env table. Required for real
runs: `DEEPGRAM_API_KEY`, `SUMOPOD_API_KEY`. The server boots without them
(features report disabled) so `/health` and discovery always work.

---

## Project layout

```
backend/src/
  index.ts        Express server: A2A router, clip serving, cleanup
  a2a.ts          A2A endpoints (negotiate / jobs / approve / revise)
  negotiation.ts  pricing, aspect inference, decline/clarify
  pipeline.ts     download -> transcribe -> analyze -> clip orchestration
  downloader.ts   yt-dlp (probe, download, playlist)
  transcriber.ts  Deepgram nova-2 (transcript + diarization)
  analyzer.ts     LLM moment selection, scoring, sentence-boundary snapping
  clipper.ts      ffmpeg cut + aspect crop + subtitle burn
  subtitles.ts    speaker-labeled SRT from word timings
  thumbnail.ts    frame extraction
  hooks.ts        scene detection + hook refine
  stitch.ts       highlight-reel concat
  memory.ts       per-agent style memory (data moat)
  storage.ts      safe clip serving + TTL cleanup
  escrow.ts       escrow seam (in-memory stub; OKX in prod)
  queue.ts        in-memory single-worker job queue
  delivery.ts     decision-grade delivery envelope
  config.ts types.ts logger.ts exec.ts
frontend/
  index.html      Alpine + Tailwind SPA (no build)
docs/
  VISION.md STACK.md ASP_REGISTRATION.md SUBMISSION.md
```

---

## Deployment

pm2 + nginx on a VPS (same pattern as txwrap). See
[docs/SUBMISSION.md](docs/SUBMISSION.md) for registration and submission steps,
[ecosystem.config.cjs](ecosystem.config.cjs) and
[deploy/nginx.conf.example](deploy/nginx.conf.example) for the process/proxy
config.

## Submission

OKX.AI Genesis Hackathon. Deadline **Jul 17, 2026 23:59 UTC**.
