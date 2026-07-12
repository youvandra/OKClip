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
- [ ] `pending` Auto-subtitles — burn Deepgram transcript into video overlay
- [ ] `pending` Speaker labeling — "Host:", "Guest:" in subtitles (diarization)
- [ ] `pending` Best-frame thumbnail — frame extraction + text overlay per clip
- [ ] `pending` Viral score — LLM rates clip 0–95 with reasons
- [ ] `pending` Multi-clip support — N clips (up to 5) from 1 video
- [x] `done` Sentence-boundary clipping — never cut mid-word (snapToSentenceBoundaries)
- [ ] `pending` Speaker-aware moments — understand conversation dynamics
- [ ] `pending` Hook detection — audio amplitude + scene change for best opener
- [ ] `pending` Visual change detection — FFmpeg scene detect for slides/demos
- [ ] `pending` Clip narrative chain — N clips flow as a story
- [ ] `pending` Auto caption + hashtag — LLM generate posting metadata

## Phase 5: Data Moat
- [ ] `pending` Style memory — per-agent preference profiling
- [ ] `pending` Preference auto-tuning from request history
- [ ] `pending` Storage: data/preferences/<agentId>.json

## Phase 6: Storage & Delivery
- [ ] `pending` Set up temp storage (/tmp/okclip/)
- [ ] `pending` Transcript cache for revision window (avoid re-ASR)
- [ ] `pending` Implement clip upload & download link generation
- [ ] `pending` Implement auto-cleanup (24 hour TTL)
- [ ] `pending` Handle file size limits

## Phase 7: A2A Integration
- [ ] `pending` Implement A2A service registration on OKX.AI (asp, category content)
- [ ] `pending` Build negotiation & pricing logic (clip tiers + length surcharge)
- [ ] `pending` Build delivery & approval flow
- [ ] `pending` Implement escrow payment handling (per OKX A2A rules — verify)

## Phase 8: Frontend
- [ ] `pending` Design landing page (Alpine.js + Tailwind — neo-brutalism)
- [ ] `pending` Build task status UI
- [ ] `pending` Build clip preview with metadata (viral score, reasons, speakers, thumbnail)

## Phase 9: Expansion (if time)
- [ ] `pending` Vertical reformat — 16:9 → 9:16 with face/subject tracking
- [ ] `pending` Clip stitching — combine N clips into 1 highlight reel
- [ ] `pending` Playlist batch — YouTube playlist → process all videos
- [ ] `pending` Multi-language — auto-detect (Deepgram) → language-aware LLM prompt

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
