# OKClip — Tech Stack

Chosen for power, ecosystem support, and alignment with the OKX.AI / onchainos
world (Node/TypeScript) and the txwrap precedent (which shipped and passed review).

## Decisions

| Layer | Choice | Why |
|-------|--------|-----|
| Language / runtime | **Node.js 20+ · TypeScript (strict)** | The OKX Agent Payments SDK and onchainos skills are Node; txwrap is Node+TS. One language across A2A, video orchestration, and web. |
| Web framework | **Express 5** | OKX's payment/escrow middleware is Express-based; largest middleware ecosystem; proven in txwrap. |
| Input validation | **zod** | Type-safe schemas for negotiation briefs and A2A payloads; single source of truth for types + runtime checks. |
| Video download | **yt-dlp** (invoked via `child_process`) | The de-facto most robust YouTube downloader; handles formats/age-gating better than any Node-native lib. |
| Transcription / ASR | **@deepgram/sdk** (nova-2) | Transcription **+ word-level timestamps + native speaker diarization** in one call, long-audio safe, cheaper than Whisper. Fixes the "Whisper has no diarization + 25 MB cap" problem. |
| LLM analysis | **openai SDK → Sumopod base URL** | Powerful, ubiquitous client; Sumopod is OpenAI-compatible; same provider txwrap used. Used for moment selection, viral scoring, reasons, captions. |
| Video processing | **FFmpeg via `child_process`** (raw args) | Direct control over filtergraphs (cut, subtitle burn, aspect crop, scene detection). Dropped fluent-ffmpeg — it is deprecated and adds a layer we do not need since we already spawn processes for yt-dlp. |
| Subtitles | Build **SRT/ASS** from Deepgram word timings | Full control over sentence-boundary cuts and speaker labels ("Host:" / "Guest:"). |
| Job queue | **In-memory, single-worker** (MVP) | No Redis for the hackathon; video work is I/O-bound and serialized to avoid bandwidth saturation. Swappable for BullMQ later. |
| Logging | **pino** | Fast structured logging (AGENTS.md forbids `console.log` in production). |
| IDs | **nanoid** | Compact, URL-safe job IDs. |
| Testing | **node:test** | Built-in, hermetic (no network); same approach as txwrap's green suite. |
| Dev / build | **tsx watch** (dev) · **tsc** (build) | Fast TS execution in dev, plain compile for prod. |
| Frontend | **Alpine.js + Tailwind (CDN)** | No build step; matches txwrap's neo-brutalist SPA. |
| Deploy | **VPS + nginx + pm2**, TLS via Let's Encrypt | Same proven path as txwrap. |
| Payments | **OKX A2A escrow** (via onchainos) | A2A settles through X Layer escrow; exact SDK/flow confirmed at registration. |

## Deliberately NOT used

- **Python backend** — video/ML is Python-heavy, but the heavy lifting (Deepgram, FFmpeg, yt-dlp) runs as external APIs/CLIs callable from Node. Staying in Node keeps one language and reuses the OKX/txwrap ecosystem.
- **Fastify** — faster than Express, but the OKX payment middleware targets Express; alignment beats marginal throughput here.
- **fluent-ffmpeg** — deprecated ("no longer supported"); we invoke FFmpeg directly via `child_process` for full filtergraph control.
- **Redis / BullMQ** — overkill for a single-VPS hackathon MVP; the in-memory queue is swappable behind an interface.
- **Whisper as primary ASR** — no diarization, 25 MB cap. Kept only as a possible fallback.

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `PORT` | no (default `3001`) | HTTP port |
| `NODE_ENV` | no (default `development`) | Environment |
| `DEEPGRAM_API_KEY` | yes (for ASR) | Deepgram transcription + diarization |
| `SUMOPOD_API_KEY` | yes (for analysis) | LLM moment selection / scoring / captions |
| `SUMOPOD_BASE_URL` | no | OpenAI-compatible base URL for Sumopod |
| `SUMOPOD_MODEL` | no | Model id (e.g. a deepseek variant) |
| `STORAGE_DIR` | no (default `/tmp/okclip`) | Temp file root |
| `CLIP_TTL_MS` | no (default 24h) | Clip retention before cleanup |
| `MAX_SOURCE_SECONDS` | no (default 7200) | Product cap on source length (2 h) |
