# OKClip — Project Plan

## Overview
OKClip is an **A2A Agent Service Provider** on OKX.AI that creates smart video clips. Input a YouTube URL + natural language prompt ("clip the part where he explains DeFi lending"), and OKClip uses AI to find the right moment and returns a precise video clip as a downloadable file.

## Tech Stack
- **Runtime**: Node.js + TypeScript + Express
- **Video Download**: yt-dlp (Python CLI)
- **Transcription**: OpenAI Whisper API
- **Video Processing**: FFmpeg
- **AI Analysis**: Sumopod API (LLM for transcript analysis)
- **Storage**: Cloudflare R2 or local temp files
- **Frontend**: Alpine.js + Tailwind CSS (CDN, no build step)

## ASP Type
**A2A (Agent-to-Agent)** — async processing, negotiated pricing, escrow payment.

## Architecture

```
User Agent → A2A negotiate (URL + prompt + price)
          → yt-dlp download video
          → Whisper transcribe audio → full transcript with timestamps
          → LLM analyze transcript → find relevant timestamps
          → FFmpeg clip segment(s)
          → Upload to storage
          → Deliver download link to user
          → User approve → escrow released
```

## Workflow Steps

1. **Receive task** — user agent sends YouTube URL + prompt + max clips
2. **Download** — yt-dlp fetches video (720p quality to save bandwidth)
3. **Transcribe** — Whisper API converts audio to text with word-level timestamps
4. **Analyze** — LLM scans transcript, identifies most relevant segments
5. **Clip** — FFmpeg cuts segments (with buffer padding: -5s/+5s)
6. **Upload** — segments uploaded to R2 / temp storage
7. **Deliver** — download link returned to user agent
8. **Approve** — user reviews, approves → payment released

## Pricing Model

| Clip Count | Price |
|------------|-------|
| 1 clip | ~1 USDT |
| 3 clips | ~2 USDT |
| 5 clips | ~3 USDT |

## Video Processing Pipeline

```
yt-dlp (download)  →  Whisper (transcribe)  →  LLM (find moments)  →  FFmpeg (cut)
   30s-2min               10-60s                   2-5s                   5-15s
                                                                    └─ Per segment
```

Total: ~1-5 minutes per task.

## Storage Strategy

- Raw video: deleted after processing
- Clips: stored for 24 hours, then auto-cleaned
- Storage: `/tmp/okclip/` on VPS or Cloudflare R2

## Limitations

- Max video length: 2 hours (Whisper API limit)
- Max clips per task: 5
- YouTube only for v1 (expand to TikTok/Twitter later)
- Requires stable internet connection for yt-dlp
