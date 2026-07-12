# OKX.AI Genesis Hackathon — Submission Draft (OKClip)

Deadline: **Jul 17, 2026 23:59 UTC**.

## Google Form Fields

### ASP Name
```
OKClip — Your video, clipped by an agent.
```

### Agent ID
```
[fill after registration]
```

### ASP Description
```
OKClip is an A2A Agent Service Provider that turns a YouTube URL and a
natural-language brief into decision-grade social clips. A requesting agent
negotiates scope and price; OKClip transcribes the video with speaker
diarization, selects the best moments with an LLM, and cuts them at sentence
boundaries with burned-in speaker-labeled subtitles.

What makes it decision-grade rather than a black box: every clip carries a viral
score (capped at 95, never certainty), a confidence, and the concrete reasons it
was picked (topic match, laughter/scene-cut hook, question->answer exchange), plus
an evidence block (source length, segments analyzed, ASR used). The requesting
agent approves on structured data — it never has to watch the video.

A2A end to end: negotiate (priced terms + stated assumptions, out-of-scope
declines), fund escrow on X Layer, deliver, then approve to release or reject a
clip with feedback for a revision that re-cuts only that moment from the cached
transcript. Per-agent style memory learns aspect ratio, clip length, and topics
from history and auto-fills future briefs.
```

### ASP Type
```
A2A
```

### Example Agent Tasks
```
- "Clip the 3 best DeFi moments from this podcast for TikTok."   -> negotiate -> 3 vertical clips + reasons
- "Make a 5-clip highlight reel from this talk."                 -> 5 clips, narrative-ordered
- "This clip is too long, cut to the punchline."                 -> revision loop, re-cut from cache
- "Turn this playlist into clips."                               -> playlist batch
- "What would 3 clips of this 90-min stream cost?"               -> negotiate (price + length surcharge)
```

### Use Cases
```
- Content / social agents — pull shareable clips from long video as a pipeline step
- Creator-tooling agents — subtitle + score + caption in one call
- Media-monitoring agents — clip highlights from new uploads automatically
```

### X Account Handle
```
@[your x handle]
```

### X Participation Post (Link)
```
[link after demo video is ready]
```

### Telegram Handle
```
@[your telegram handle]
```

---

## X Post Template

```
Your content agent needs clips — not a web app it can't use.

OKClip is an A2A agent on OKX.AI. Give it a YouTube URL + a brief; it negotiates,
then returns clips with:

🎯 the REASONS each moment was picked (not a black-box score)
🗣️ speaker-labeled burned-in subtitles
🔁 a revision loop — reject a clip, it re-cuts just that moment
💸 escrow on X Layer — approve to release

Built for @OKXAI Genesis Hackathon #OKXAI
```

---

## Demo Video Script (≤90s)

| Time | Scene |
|------|-------|
| 0:00 | Hook: "Your content agent needs clips it can reason about." |
| 0:08 | Agent brief: "3 best DeFi moments, vertical, for TikTok" |
| 0:15 | NEGOTIATION: OKClip infers 9:16, quotes a 45-min source at 1.5 USDT, states assumptions -> accept -> escrow funded |
| 0:30 | Processing: download -> transcribe+diarize -> analyze -> clip |
| 0:42 | Delivery: 3 clips, each with viralScore + REASONS + speaker labels + evidence |
| 0:55 | Reject clip 2 "too long" -> REVISION re-cuts from cached transcript in seconds |
| 1:08 | Approve -> escrow released on X Layer |
| 1:15 | Clip showcase: vertical, burned subtitles, "Host:/Guest:" labels |
| 1:24 | End card: "OKClip · A2A on OKX.AI" |

Recording checklist:
- [ ] Real API keys set (`DEEPGRAM_API_KEY`, `SUMOPOD_API_KEY`); yt-dlp + ffmpeg installed
- [ ] Use a podcast with clear two-speaker dialogue (diarization shines)
- [ ] Pre-warm one run so the demo is fast
- [ ] Big terminal font; pretty-print JSON

---

## Submission checklist

Code — DONE:
- [x] Backend feature-complete (Phases 1–9): A2A negotiate/deliver/revise, pipeline, style memory, storage
- [x] Frontend SPA
- [x] 49 tests green, typecheck clean

Needs YOUR action (blockers):
- [ ] Install yt-dlp + ffmpeg on the VPS; set API keys
- [ ] Deploy backend (pm2) + nginx + TLS; verify `/health` and a real end-to-end run
- [ ] Register + list the A2A ASP (wallet signature) — see ASP_REGISTRATION.md
- [ ] Fill Agent ID, X handle, Telegram handle above
- [ ] Record demo video ≤90s; post on X with #OKXAI
- [ ] Submit the Google Form before the deadline

Honesty: say "registered, Agent ID #…" only — do not claim "listed/live" while
review is pending.
