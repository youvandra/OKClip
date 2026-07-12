# OKClip — Task Tracker

## Phase 1: Foundation
- [x] `done` Create AGENTS.md, PLAN.md, TASKS.md
- [x] `done` Initialize project structure (directories, package.json, tsconfig)
- [x] `done` Setup Express server with basic health endpoint
- [x] `done` Setup environment config (Sumopod, Deepgram keys)
- [x] `done` Create TypeScript types (task, clip, transcript, delivery, negotiation)
- [x] `done` Implement job queue (in-memory, single-worker)

## Phase 2: Video Processing — Core
- [x] `done` Integrate yt-dlp for video downloading (720p)
- [x] `done` Integrate Deepgram for transcription (word-level timestamps)
- [x] `done` Enable Deepgram speaker diarization (native, not Whisper)
- [x] `done` Build LLM transcript analyzer (find relevant timestamps)
- [x] `done` Integrate FFmpeg for video clipping
- [x] `done` Wire up pipeline: download → transcribe → analyze → clip

## Phase 3: A2A Core — Negotiation & Decision-Grade Output
- [x] `done` Negotiation: clarify brief (platform, tone, length) via Q&A
- [x] `done` Negotiation: counter-offer scope/price, decline out-of-scope
- [x] `done` Evidence block — per-clip why-picked reasons + confidence
- [x] `done` Decision-grade delivery — structured metadata agent can approve
- [x] `done` Revision loop — re-clip rejected moments from cached transcript
- [x] `done` Runner-up moments — return candidate timestamps not clipped

## Phase 4: Video Processing — Polish
- [x] `done` Auto-subtitles — burn Deepgram transcript into video overlay
- [x] `done` Speaker labeling — "Host:", "Guest:" in subtitles (diarization)
- [x] `done` Best-frame thumbnail — frame extraction per clip (text overlay: future)
- [x] `done` Viral score — LLM rates clip 0–95 with reasons
- [x] `done` Multi-clip support — N clips (up to 5) from 1 video
- [x] `done` Sentence-boundary clipping — never cut mid-word (snapToSentenceBoundaries)
- [x] `done` Speaker-aware moments — understand conversation dynamics
- [x] `done` Hook detection — scene-change refine for best opener (audio amplitude: future)
- [x] `done` Visual change detection — FFmpeg scene detect for slides/demos
- [x] `done` Clip narrative chain — N clips flow as a story
- [x] `done` Auto caption + hashtag — LLM generate posting metadata

## Phase 5: Data Moat
- [x] `done` Style memory — per-agent preference profiling
- [x] `done` Preference auto-tuning from request history
- [x] `done` Storage: data/preferences/<agentId>.json

## Phase 6: Storage & Delivery
- [x] `done` Set up temp storage (/tmp/okclip/)
- [x] `done` Transcript cache for revision window (avoid re-ASR)
- [x] `done` Implement clip upload & download link generation
- [x] `done` Implement auto-cleanup (24 hour TTL)
- [x] `done` Handle file size limits

## Phase 7: A2A Integration
- [ ] `manual` Implement A2A service registration on OKX.AI (asp, category content) — needs wallet signature
- [x] `done` Build negotiation & pricing logic (clip tiers + length surcharge)
- [x] `done` Build delivery & approval flow
- [x] `done` Implement escrow payment handling (per OKX A2A rules — verify)

## Phase 8: Frontend
- [x] `done` Design landing page (Alpine.js + Tailwind — neo-brutalism)
- [x] `done` Build task status UI
- [x] `done` Build clip preview with metadata (viral score, reasons, speakers, thumbnail)

## Phase 9: Expansion (if time)
- [x] `done` Vertical reformat — 16:9 → 9:16 center crop (face/subject tracking: future)
- [x] `done` Clip stitching — combine N clips into 1 highlight reel
- [x] `done` Playlist batch — YouTube playlist → process all videos
- [x] `done` Multi-language — auto-detect (Deepgram) → language-aware LLM prompt

## Phase 10: Polish & Deploy
- [ ] `pending` Deploy backend to VPS
- [ ] `pending` Deploy frontend
- [ ] `pending` Install yt-dlp & FFmpeg on VPS
- [ ] `pending` Test full flow end-to-end
- [ ] `pending` Register + list ASP on OKX.AI (A2A)
- [ ] `pending` Create X post + demo video

## Discussion Notes (2026-07-11)
- Core idea: A2A agent that creates smart clips from YouTube
- Differentiator: agent-native — composable by other agents
- Output: downloadable clips with subtitles, thumbnails, viral scores
- Storage: VPS /tmp (cheapest option for hackathon), 24h TTL
- Naming: OKClip (singular) vs OKClips → decided OKClip

## Revision Notes (2026-07-12)
- Confirmed ASP type: **A2A** (domain-fit: negotiation, revision, escrow) — not A2MCP
- ASR switched Whisper → **Deepgram nova-2**: Whisper has no diarization + 25 MB cap;
  Deepgram does transcription + word-level + diarization + long audio, cheaper
- Pricing reworked: ASR cost is per-task (scales with source length), not per-clip →
  clip-count tier + length surcharge; margins recomputed honestly
- Added A2A core as first-class: negotiation, revision loop, evidence-backed delivery
- Removed invented arbitration numbers ("5% bounty deposit") — use OKX A2A rules
- Borrowed txwrap edge: evidence block + honesty rules (viral score capped at 95)
