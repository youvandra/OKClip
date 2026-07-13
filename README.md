# OKClip

**An A2A Agent Service Provider on OKX.AI that turns a YouTube URL + a
natural-language brief into decision-grade video clips.** A requesting agent
sends a video and a brief; OKClip negotiates scope and price, finds the best
moments, cuts them with burned-in speaker-labeled subtitles, and returns
**structured clip metadata the agent can approve** — every clip carrying a viral
score, a confidence, and the *reasons it was picked*.

Built for the OKX.AI Genesis Hackathon. Sibling project to
[WalletLens](https://github.com/youvandra/WalletLens).

| | |
|---|---|
| **Type** | A2A (Agent-to-Agent) — negotiated, escrow-settled on X Layer |
| **OKX.AI Agent ID** | `#5189` |
| **Protocol** | OKX onchainos agent (CLI + XMTP state machine); escrow is gas-free via the platform paymaster |
| **Work engine** | this repo — invoked by the ASP agent on `job_accepted` |
| **Human surface** | `/` — Alpine + Tailwind SPA |
| **Stack** | Node 20 · TypeScript · Express 5 · Deepgram · Sumopod LLM · FFmpeg |

---

## Why OKClip

Clipping a video is a commodity — Whisper/Deepgram + an LLM + FFmpeg, and every
SaaS tool already does it. OKClip is different in two ways that matter to an
autonomous agent:

- **It's agent-native, not a web app.** Other agents compose OKClip into
  workflows: *find a trending video → OKClip → 3 posted clips*. No competitor
  offers an A2A interface.
- **Its output is decision-grade, not a black box.** Every clip ships the
  *reasons* it was picked (topic match, laughter/scene-cut hook, question→answer
  exchange, sentence-boundary), a `confidence`, and an `evidence` block. The
  requesting agent approves on structured data — it never has to watch the video.

Plus the things a serious clip tool needs: **negotiation** (infer platform/aspect,
price transparently, decline out-of-scope), a **revision loop** (reject a clip
with feedback; OKClip re-cuts just that moment from the cached transcript), and
**per-agent style memory** that learns aspect ratio, clip length, and topics from
history.

---

## How A2A works here

OKX A2A is **not** an HTTP endpoint — it is an agent process driven by the
`onchainos agent` CLI over XMTP, with escrow funded and released on the platform
(gas-free). The ASP agent negotiates, applies, and — only once the job is
accepted and escrow is funded — runs OKClip as its **work engine**, then delivers
the clips over XMTP.

```
user publishes task
  -> job_created           ASP agent: apply (on-chain, gas-free)        [OKX CLI]
  -> user confirm-accept
  -> job_accepted          escrow funded; NOW do the work               [OKX event]
       run the engine:  okclip run --url <yt> --prompt "<brief>" --clips <n>
       -> clip files + metadata + summary
  -> deliver               attach clips + send summary over XMTP        [OKX CLI]
  -> user confirms         payment released                             [OKX]
```

### Invoking the engine

**CLI** — what the ASP agent shells out to:

```bash
okclip run --url "https://youtu.be/…" --prompt "3 DeFi clips for tiktok" --clips 3
# stdout: JSON { ok, jobId, price, summary, delivery, clipFiles[], workDir }
```

`clipFiles[]` are absolute paths to attach; `summary` is an XMTP-ready text block.

**Internal HTTP API** — used by the frontend and local callers:

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/negotiate` | `{ agentId, brief }` → `proposal \| clarify \| decline` (probes source, applies style memory) |
| `POST` | `/api/jobs` | `{ agentId, brief, terms }` → `{ jobId }` (enqueues the job) |
| `GET` | `/api/jobs/:id` | poll the delivery |
| `POST` | `/api/jobs/:id/revise` | `{ rejections[] }` → re-clips rejected moments (async) |
| `GET` | `/clips/:jobId/:file` | the produced mp4 / thumbnail (path-traversal safe) |
| `GET` | `/health` | liveness + feature flags |

A `brief` is `{ url, prompt, clipCount (1–5), aspectRatio?, maxClipSeconds?, language? }`.

### Delivery shape (per clip)

```jsonc
{
  "downloadUrl": "/clips/<job>/clip-1.mp4",
  "thumbnailUrl": "/clips/<job>/clip-1.jpg",
  "viralScore": 87,            // heuristic, capped at 95 — never certainty
  "confidence": 0.82,          // how well the moment matches the brief
  "durationSec": 47,
  "timestamp": { "startSec": 272, "endSec": 319 },
  "transcriptSnippet": "…",
  "speakers": ["Host", "Guest 1"],
  "reasons": ["topic match: DeFi", "question -> answer exchange", "opens on a scene cut"],
  "caption": "…", "hashtags": ["#DeFi"],
  "evidence": { "sourceDurationSec": 3720, "analyzedSegments": 214, "asr": "deepgram-nova-2", "caveat": "…" }
}
```

The delivery also carries scored **runner-up** moments (candidates not clipped),
so an agent can swap a pick without a full re-process.

---

## Pipeline

```
3rd-party download (720p) -> Deepgram transcribe + word-level + diarize
  -> LLM select moments (+ score + reasons + runner-ups)
  -> scene-cut refine (hook) -> FFmpeg cut + burn speaker-labeled subtitles
  -> thumbnail -> decision-grade delivery
```

Deterministic where possible; the LLM only writes the selection and captions.
Scene detection degrades gracefully. Clips start/end on complete sentences
(word-level timestamps), never mid-word.

---

## Pricing

Transcription cost scales with **source length** and is paid once per task, not
per clip — so price is a clip-count tier plus a length surcharge.

| Clips | Base (source ≤ 30 min) |
|-------|------------------------|
| 1 | 0.5 USDT |
| 3 | 1 USDT |
| 5 | 1.5 USDT |

**+0.5 USDT per additional 30-minute block** of source. Quoted up front during
negotiation.

---

## Quick start (local)

### Prerequisites

- **Node.js 20+**
- **`ffmpeg`** on `PATH`
- A **Deepgram** API key and a **Sumopod** (OpenAI-compatible) API key

```bash
# macOS
brew install ffmpeg
```

### Run

```bash
cd backend
npm install
cp .env.example .env         # fill in DEEPGRAM_API_KEY + SUMOPOD_API_KEY
npm run dev                  # http://localhost:3001
```

Open `http://localhost:3001` for the SPA, POST to `/api/*` as an agent, or run
the engine directly:

```bash
npm run build
node dist/cli.js run --url "https://youtu.be/…" --prompt "best moments" --clips 1
```

### Scripts

```bash
npm run dev        # tsx watch
npm run build      # tsc -> dist/
npm start          # node dist/index.js
npm test           # node:test suite (hermetic, no network)
npm run typecheck  # tsc --noEmit
```

The test suite is hermetic (no network): it covers the pure logic — pricing,
aspect inference, sentence-boundary snapping, score clamping, SRT/ffmpeg arg
building, playlist parsing, and the A2A job adapter.

---

## Configuration

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `PORT` | no | `3001` | HTTP port |
| `NODE_ENV` | no | `development` | Environment |
| `DEEPGRAM_API_KEY` | for ASR | — | Transcription + word timings + diarization |
| `SUMOPOD_API_KEY` | for analysis | — | LLM moment selection / scoring / captions |
| `SUMOPOD_BASE_URL` | no | `https://ai.sumopod.com/v1` | OpenAI-compatible base URL |
| `SUMOPOD_MODEL` | no | `deepseek-v4-flash` | Model id |
| `STORAGE_DIR` | no | `/tmp/okclip` | Temp clip storage |
| `PREFERENCES_DIR` | no | `data/preferences` | Persistent per-agent style memory |
| `CLIP_TTL_MS` | no | `86400000` | Clip retention before cleanup (24 h) |
| `MAX_SOURCE_SECONDS` | no | `7200` | Product cap on source length (2 h) |

The server boots without the API keys — `/health` reports which features are
enabled — so discovery and negotiation always work.

---

## Project layout

```
backend/src/
  index.ts        Express server: work API, clip serving, cleanup
  cli.ts          `okclip run` — headless engine the ASP agent shells out to
  worker.ts       run one job to completion (no HTTP)
  a2a-adapter.ts  OKX A2A job <-> Brief + XMTP delivery summary
  jobs.ts         internal work API (negotiate / jobs / revise)
  negotiation.ts  pricing, aspect inference, decline/clarify
  pipeline.ts     download -> transcribe -> analyze -> clip orchestration
  downloader.ts   Video download via loader.to API + oEmbed probe
  transcriber.ts  Deepgram nova-2 (transcript + word-level + diarization)
  analyzer.ts     LLM moment selection, scoring, sentence-boundary snapping
  clipper.ts      ffmpeg cut + aspect crop + subtitle burn
  subtitles.ts    speaker-labeled SRT from word timings
  thumbnail.ts    frame extraction
  hooks.ts        scene detection + hook refine
  stitch.ts       highlight-reel concat
  memory.ts       per-agent style memory (the data moat)
  storage.ts      safe clip serving + TTL cleanup
  queue.ts        in-memory single-worker job queue
  delivery.ts     decision-grade delivery envelope
  config.ts types.ts logger.ts exec.ts
frontend/
  index.html      Alpine + Tailwind SPA (no build step)
```

---

## Deployment

Node backend under **pm2** behind **nginx** (TLS via Let's Encrypt) on a VPS.
See `ecosystem.config.cjs` (single instance — the queue and style memory are
in-process). Install `ffmpeg`, then:
then set the API keys in `backend/.env`.

---

## Honesty rules

Deliberate constraints, not omissions:

- **Viral score is capped at 95.** A transcript heuristic never justifies
  certainty.
- **Evidence travels with every clip** — source length, segments analyzed, ASR
  used, and an explicit caveat.
- **Reasons are real signals** — topic-match, audio/scene hooks, boundary
  quality, conversational structure — not decoration.
- **Prices reflect real cost** — the length surcharge tracks the ASR cost that
  actually scales.

---

## Submission

Built for the OKX.AI Genesis Hackathon. Registered as an A2A ASP,
**Agent ID #5189**. Deadline: **Jul 17, 2026 23:59 UTC**.
```

## License

MIT
