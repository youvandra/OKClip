import express from "express";
import { config, features } from "./config.js";
import { logger } from "./logger.js";
import { runPipeline } from "./pipeline.js";
import { JobQueue } from "./queue.js";

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

app.get("/", (_req, res) => {
  res.json({
    name: "OKClip",
    description:
      "A2A agent that creates smart video clips from YouTube, on OKX.AI",
    docs: "https://github.com/youvandra/OKClip",
  });
});

const server = app.listen(config.PORT, () => {
  logger.info(
    { port: config.PORT, env: config.NODE_ENV },
    "OKClip backend listening",
  );
});

// Graceful shutdown.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info({ signal }, "Shutting down");
    server.close(() => process.exit(0));
  });
}

export { app, queue };
