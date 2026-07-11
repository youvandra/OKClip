# OKClip — Task Tracker

## Phase 1: Foundation
- [ ] `pending` Initialize project structure (directories, package.json, tsconfig)
- [ ] `pending` Setup Express server with basic health endpoint
- [ ] `pending` Setup environment config
- [ ] `pending` Create TypeScript types
- [ ] `pending` Create AGENTS.md, PLAN.md, TASKS.md

## Phase 2: Video Processing
- [ ] `pending` Integrate yt-dlp for video downloading
- [ ] `pending` Integrate Whisper API for transcription
- [ ] `pending` Build LLM transcript analyzer (find relevant timestamps)
- [ ] `pending` Integrate FFmpeg for video clipping
- [ ] `pending` Build processing pipeline (download → transcribe → analyze → clip)

## Phase 3: Storage & Delivery
- [ ] `pending` Set up Cloudflare R2 or local temp storage
- [ ] `pending` Implement clip upload & download link generation
- [ ] `pending` Implement auto-cleanup (24 hour TTL)
- [ ] `pending` Handle file size limits & streaming

## Phase 4: A2A Agent
- [ ] `pending` Implement A2A service registration on OKX.AI
- [ ] `pending` Build negotiation & pricing logic
- [ ] `pending` Build delivery & approval flow
- [ ] `pending` Implement escrow payment handling

## Phase 5: Frontend
- [ ] `pending` Design landing page (Alpine.js + Tailwind)
- [ ] `pending` Build clip preview / status UI
- [ ] `pending` Implement download button & share link

## Phase 6: Polish & Deploy
- [ ] `pending` Deploy backend to VPS
- [ ] `pending` Deploy frontend
- [ ] `pending` Test full flow end-to-end
- [ ] `pending` Register ASP on OKX.AI
- [ ] `pending` Create X post + demo video

## Open Questions (to discuss)
- [ ] Storage: VPS local or Cloudflare R2?
- [ ] Whisper: local model or API?
- [ ] YouTube TOS compliance
- [ ] Max video length limit
