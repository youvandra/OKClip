import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { config, features } from "./config.js";
import { createJobsRouter } from "./jobs.js";
import { logger } from "./logger.js";
import { runPipeline } from "./pipeline.js";
import { JobQueue } from "./queue.js";
import { resolveClipPath, startCleanup } from "./storage.js";

// The worker runs the full clip pipeline for each job, reporting progress
// through the queue's status setter.
const queue = new JobQueue(async (job) => {
  await runPipeline(job, {
    setStatus: (status, patch) => queue.setStatus(job.id, status, patch),
  });
});

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "okclip",
    version: process.env.npm_package_version ?? "0.1.0",
    uptimeSec: Math.round(process.uptime()),
    features,
    queued: queue.size,
  });
});

// Internal clip-work API (frontend + onchainos ASP agent).
app.use("/api", createJobsRouter(queue));

// Static frontend (Alpine + Tailwind SPA). Works in dev (src) and prod (dist)
// since both resolve to the sibling frontend/ directory.
const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../frontend");
app.use(express.static(frontendDir));

// Serve produced clips and thumbnails (path-traversal safe).
app.get("/clips/:jobId/:file", (req, res) => {
  const path = resolveClipPath(req.params.jobId, req.params.file);
  if (!path) return res.status(400).json({ error: "invalid path" });
  return res.sendFile(path, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "not found" });
  });
});

const server = app.listen(config.PORT, () => {
  logger.info(
    { port: config.PORT, env: config.NODE_ENV },
    "OKClip backend listening",
  );
});

startCleanup();

// Graceful shutdown.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info({ signal }, "Shutting down");
    server.close(() => process.exit(0));
  });
}

export { app, queue };
