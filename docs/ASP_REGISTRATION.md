# ASP Registration — OKX.AI (A2A)

OKClip registers as an **A2A** (Agent-to-Agent) ASP: a negotiated service settled
through **escrow on X Layer**, not a per-call x402 API (that is A2MCP, which
[txwrap](https://github.com/youvandra/txwrap) uses). Registration requires **your
wallet + an on-chain consent signature**, so it must be run by you.

## Official flow (okx.ai/tutorial/asp)

```bash
# 1. Install Onchain OS skills in your agent (Claude Code / Codex / etc.)
npx skills add okx/onchainos-skills --yes -g
```

Then, one prompt per step in the agent:

| # | Prompt | Notes |
|---|--------|-------|
| 2 | `Log in to Agentic Wallet on Onchain OS with my email` | **Required.** Review results are emailed here. |
| 3 | `Help me register an A2A ASP on OKX.AI using OKX Agent Identity from Onchain OS` | Identity + capability Q&A → `agent create` |
| 4 | `Help me list my ASP on OKX.AI using Onchain OS` | **Required.** Registration alone does not publish you. |

OKX reviews within ~24h; the result goes to your Agentic Wallet email and the
agent chat.

## Identity

| Field | Value |
|-------|-------|
| Role | `asp` |
| Type | `A2A` |
| Name | `OKClip` |
| Category | content |
| Description | `OKClip turns a YouTube URL and a natural-language brief into decision-grade social clips — negotiated scope, subtitles, viral scores, and the reasons each moment was picked.` |

## Capability declaration (A2A)

A2A registration asks for the agent's capabilities, pricing strategy, and
delivery spec. Draft answers:

- **What it does:** negotiates and produces N (1–5) short clips from one YouTube
  video per a natural-language brief, with burned-in speaker-labeled subtitles,
  a viral score, and per-clip reasons.
- **Pricing strategy:** clip-count tier (0.5 / 1 / 1.5 USDT for 1 / 3 / 5) plus a
  0.5 USDT surcharge per extra 30-min of source. Quoted up front during
  negotiation.
- **Delivery spec:** JSON clip metadata (download URL, thumbnail, score,
  confidence, reasons, evidence) + downloadable mp4s. One revision round
  included.
- **Boundaries (must decline):** sources over 2 hours, non-YouTube URLs,
  private/age-restricted videos, more than 5 clips.

## To verify at registration (do NOT assume)

The public A2A docs did not specify these; confirm during the skill Q&A and
record the real values here:

- [ ] Whether A2A requires a reachable **service endpoint URL** (and if so, point
      it at the deployed `/a2a` surface) or is purely agent-negotiated.
- [ ] The exact **escrow mechanics**: how funds are funded/held/released, and the
      dispute/arbitration terms and any deposit. Wire the real provider behind
      `escrow.ts` (currently an in-memory stub with a clean seam).
- [ ] Any capability-declaration schema constraints (field limits, avatar size).

## Honesty note

Do not claim "listed / live" while the status is "under review" — say
"registered" only. The endpoint may be live before the marketplace listing is.
