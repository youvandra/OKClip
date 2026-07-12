#!/usr/bin/env node
import { join } from "node:path";
import { buildDeliverySummary } from "./a2a-adapter.js";
import { config } from "./config.js";
import { buildDelivery } from "./delivery.js";
import { probe } from "./downloader.js";
import { negotiate } from "./negotiation.js";
import type { Brief } from "./types.js";
import { runJob } from "./worker.js";

/**
 * Headless clip runner for the onchainos ASP agent. Given a job, it produces
 * the clips and prints a JSON deliverable (metadata + absolute file paths +
 * an XMTP-ready summary) to stdout. All logs go to stderr.
 *
 *   okclip run --url <yt> --prompt "3 DeFi clips" --clips 3 [--aspect 9:16]
 */
function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a?.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = "true";
      }
    }
  }
  return out;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd !== "run") {
    process.stderr.write("usage: okclip run --url <yt> --prompt <text> --clips <n>\n");
    process.exit(2);
  }
  const args = parseArgs(rest);
  if (!args.url) {
    process.stderr.write("error: --url is required\n");
    process.exit(2);
  }

  const brief: Brief = {
    url: args.url,
    prompt: args.prompt ?? "the best moments",
    clipCount: args.clips ? Number(args.clips) : 1,
    ...(args.aspect ? { aspectRatio: args.aspect as Brief["aspectRatio"] } : {}),
    ...(args.max ? { maxClipSeconds: Number(args.max) } : {}),
  };
  const agentId = args.agent ?? "cli";

  let meta;
  try {
    meta = await probe(brief.url);
  } catch (err) {
    process.stderr.write(`probe failed: ${(err as Error).message}\n`);
  }

  const terms = negotiate(brief, meta, config.MAX_SOURCE_SECONDS);
  if (terms.kind !== "proposal") {
    process.stdout.write(JSON.stringify({ ok: false, negotiation: terms }, null, 2) + "\n");
    process.exit(1);
  }

  const job = await runJob(agentId, brief, terms.terms);
  const delivery = buildDelivery(job);

  if (job.status === "failed") {
    process.stdout.write(JSON.stringify({ ok: false, error: job.error }, null, 2) + "\n");
    process.exit(1);
  }

  const clipFiles = delivery.clips.map((c) =>
    join(config.STORAGE_DIR, job.id, c.downloadUrl.split("/").pop()!),
  );

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        jobId: job.id,
        price: terms.terms.priceUsdt,
        summary: buildDeliverySummary(delivery),
        delivery,
        clipFiles,
        workDir: join(config.STORAGE_DIR, job.id),
      },
      null,
      2,
    ) + "\n",
  );
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
