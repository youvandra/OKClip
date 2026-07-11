# OKClip — Task Tracker

## Phase 1: Foundation
- [ ] `pending` Initialize project structure (directories, package.json, tsconfig)
- [ ] `pending` Setup Express server with basic health endpoint
- [ ] `pending` Setup environment config (Sumopod, Whisper keys)
- [ ] `pending` Create TypeScript types (task, clip, transcript, delivery)
- [ ] `pending` Create AGENTS.md, PLAN.md, TASKS.md

## Phase 2: Video Processing — Core
- [ ] `pending` Integrate yt-dlp for video downloading (720p)
- [ ] `pending` Integrate Whisper API for transcription (word-level timestamps)
- [ ] `pending` Integrate Whisper diarization (speaker labeling)
- [ ] `pending` Build LLM transcript analyzer (find relevant timestamps)
- [ ] `pending` Integrate FFmpeg for video clipping
- [ ] `pending` Wire up pipeline: download → transcribe → analyze → clip

## Phase 3: Video Processing — Polish
- [ ] `pending` Auto-subtitles — burn Whisper transcript into video overlay
- [ ] `pending` Speaker labeling — "Host:", "Guest:" in subtitles (diarization)
- [ ] `pending` AI thumbnail — best frame extraction + overlay text per clip
- [ ] `pending` Viral score — LLM rates clip 0-100 for viral potential
- [ ] `pending` Multi-clip support — N clips from 1 video
- [ ] `pending` Sentence-boundary clipping — never cut mid-word
- [ ] `pending` Speaker-aware moments — understand conversation dynamics
- [ ] `pending` Hook detection — audio amplitude + scene change for best opener
- [ ] `pending` Visual change detection — FFmpeg scene detect for slides/demos
- [ ] `pending` Clip narrative chain — N clips flow as a story
- [ ] `pending` Auto caption + hashtag — LLM generate posting metadata

## Phase 4: Data Moat
- [ ] `pending` Style memory — per-agent preference profiling
- [ ] `pending` Preference auto-tuning from request history
- [ ] `pending` Storage: data/preferences/<agentId>.json

## Phase 4: Storage & Delivery
- [ ] `pending` Set up temp storage (/tmp/okclip/)
- [ ] `pending` Implement clip upload & download link generation
- [ ] `pending` Implement auto-cleanup (24 hour TTL)
- [ ] `pending` Handle file size limits

## Phase 5: A2A Integration
- [ ] `pending` Implement A2A service registration on OKX.AI
- [ ] `pending` Build negotiation & pricing logic (1/3/5 clips)
- [ ] `pending` Build delivery & approval flow
- [ ] `pending` Implement escrow payment handling

## Phase 6: Frontend
- [ ] `pending` Design landing page (Alpine.js + Tailwind — neo-brutalism)
- [ ] `pending` Build task status UI
- [ ] `pending` Build clip preview with metadata (viral score, speakers, thumbnail)

## Phase 7: Expansion (if time)
- [ ] `pending` Vertical reformat — 16:9 → 9:16 for TikTok/Reels
- [ ] `pending` Clip stitching — combine N clips into 1 highlight reel
- [ ] `pending` Playlist batch — YouTube playlist → process all videos

## Phase 8: Polish & Deploy
- [ ] `pending` Deploy backend to VPS
- [ ] `pending` Deploy frontend
- [ ] `pending` Install yt-dlp & FFmpeg on VPS
- [ ] `pending` Test full flow end-to-end
- [ ] `pending` Register ASP on OKX.AI
- [ ] `pending` Create X post + demo video

## Discussion Notes (2026-07-11)
- Core idea: A2A agent that creates smart clips from YouTube
- Differentiator: agent-native — composable by other agents
- Output: downloadable clips with subtitles, thumbnails, viral scores
- Storage: VPS /tmp (cheapest option for hackathon), 24h TTL
- Naming: OKClip (singular) vs OKClips → decided OKClip
