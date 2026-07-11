# OKClip — Project Plan

## Overview
OKClip is an **A2A Agent Service Provider** on OKX.AI that creates smart video clips from YouTube. Input a URL + natural language prompt, and OKClip uses AI to find the best moments, clip them, add subtitles, and return downloadable files — ready to post on social media.

## Why Agent-Native?
OKClip isn't just a web app. It's a **composable service** that other AI agents can call to build workflows:

```
Agent finds trending video on X → sends to OKClip → gets 3 viral clips with subtitles
Agent monitors YouTube channel → sends new uploads to OKClip → auto-posts highlights to TikTok
```

## Tech Stack
- **Runtime**: Node.js + TypeScript + Express
- **Video Download**: yt-dlp (Python CLI)
- **Transcription + Diarization**: OpenAI Whisper API
- **Video Processing**: FFmpeg
- **AI Analysis**: Sumopod API (LLM for transcript analysis + viral scoring)
- **Storage**: VPS local temp files (N VM)
- **Frontend**: Alpine.js + Tailwind CSS (CDN, no build step)

## ASP Type
**A2A (Agent-to-Agent)** — async processing, negotiated pricing, escrow payment on X Layer.

## Architecture

```
User Agent → A2A negotiate (URL + prompt + price + clipCount)
          → yt-dlp download video (720p)
          → Whisper transcribe audio + speaker diarization
          → LLM analyze transcript → find best timestamps + viral score
          → FFmpeg clip segments with subtitles burned in
          → Generate AI thumbnail per clip
          → Upload to temp storage
          → Deliver clip metadata (download link, thumbnail, viral score, transcript)
          → User approve → escrow released
```

## MVP Output (per clip)

```
{
  "downloadUrl": "https://...",
  "thumbnailUrl": "https://...",
  "viralScore": 87,
  "duration": "00:47",
  "transcript": "...",
  "speakers": ["Host", "Guest"],
  "timestamp": { "start": "04:32", "end": "05:19" }
}
```

## Feature Set

### Core (MVP)
| Feature | Description | Effort |
|---------|-------------|--------|
| Smart clip | YouTube URL + prompt → AI finds best moment → clip | Base |
| Multi-clip | User requests N clips (up to 5) from 1 video | 30 min |
| Download link | Temporary download URL | Base |

### Stage 2 (Polish)
| Feature | Description | Effort |
|---------|-------------|--------|
| Auto-subtitles | Whisper transcript burned into video overlay | 1h |
| Speaker labeling | Diarization: "Host:" vs "Guest:" in subtitles | 2h |
| AI thumbnail | Best frame + overlay text per clip | 2h |
| Viral score | AI rates clip 0-100 for viral potential | 1h |

### Stage 3 (Expansion)
| Feature | Description | Effort |
|---------|-------------|--------|
| Vertical reformat | Auto-crop 16:9 → 9:16 for TikTok/Reels | 2h |
| Clip stitching | Combine N clips into 1 highlight reel with transitions | 1.5h |
| Playlist batch | YouTube playlist → clip from all videos | 2h |

## Pricing Model (Negotiable A2A)

| Clip Count | Price |
|------------|-------|
| 1 clip | ~1 USDT |
| 3 clips | ~2 USDT |
| 5 clips | ~3 USDT |

## Video Processing Pipeline

```
yt-dlp (download)  →  Whisper (transcribe+diarize)  →  LLM (find moments+viral score)
   30s-2min                   10-60s                            2-5s
                                              ↓
Subscribe (burn)  ←  thumbnail (frame)  ←  FFmpeg (clip)
     5-10s                 2s                    5-15s per segment
```

Total: ~1-5 minutes per task.

## Storage Strategy
- Raw video: deleted after processing
- Clips: stored for 24 hours, then auto-cleaned
- Storage: `/tmp/okclip/` on VPS

## Limitations (v1)
- YouTube only (expand to TikTok/Twitter later)
- Max video length: 2 hours (Whisper API limit)
- Max 5 clips per task
- Requires yt-dlp & FFmpeg on server

## Technical Moats

### Clip Intelligence (Core Moat)

**Hook Detection**
First 3 seconds make or break. Not just keyword matching — detect the most attention-grabbing opener:
- Word-level Whisper timestamps → high-emotion words as clip entry point
- FFmpeg audio amplitude analysis → volume spikes (excitement, laugh, gasp)
- FFmpeg scene change detection → visual cut points

**Sentence-Boundary Clipping**
Never cut mid-word. Whisper word-level timestamps ensure every clip starts/ends at complete sentence boundaries.

**Speaker-Aware Moments**
Understand conversation dynamics, not just keywords:
- "Clip when guest answers the host's question"
- "Clip the debate moment — host interrupts guest"
- "Clip the reveal / plot twist"

**Visual Change Detection**
Transcript alone isn't enough. FFmpeg scene detection for:
- "Clip when the slide changes" (presentation/tutorial)
- "Clip when the demo starts" (coding/product video)
- "Clip when there's a visual punchline"

**Clip Narrative Chain**
N clips aren't random — they tell a story:
- Clip 1: problem intro
- Clip 2: deep dive
- Clip 3: twist / insight
- Clip 4: solution
- Clip 5: punchline

**Auto Caption + Hashtag**
Clip comes with AI-generated caption, hashtags, and suggested posting time. End-to-end content pipeline.

### Data Moat

**Style Memory**
OKClip learns from history. Each agent has a preference profile auto-tuned over time:
```
Agent preferences:
  aspectRatio: 9:16     (auto-detected from history)
  subtitleStyle: bold   (auto-detected)
  maxDuration: 30s      (auto-detected)
  promptPatterns: ["tutorial","explain"] (inferred)
```

Storage: `data/preferences/<agentId>.json` per agent.

Why it's a moat:
- Switching competitor = losing all preference history
- More usage = more accurate = higher switching cost
- Aggregated data improves default model for everyone

### Moat Hierarchy

| Tier | Feature | Status |
|------|---------|--------|
| 🔒 Hardest | Style memory (data moat) | Needs user base |
| 🔒 Hard | Sentence-boundary + speaker-aware | Whisper word-level |
| 🔒 Hard | Clip narrative chain | Prompt engineering |
| 🔒 Medium | Hook detection (audio/visual) | FFmpeg + Whisper |
| 🔒 Medium | Visual change detection | FFmpeg scene detect |
| 🟡 Easy | Auto hashtag + caption | LLM trivial |

## Success Metrics
- Agent-native differentiator: no existing AI clip tool has A2A integration
- Composable: other agents can call OKClip as part of larger workflows
- Viral-ready output: clips come with subtitles, thumbnails, and viral scores
- Data moat: style memory locks in repeat users
