import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Shared structured logger. Pretty-prints in development, JSON in production.
 * Use this everywhere instead of console.log (see AGENTS.md).
 */
export const logger = pino(
  isDev
    ? {
        level: process.env.LOG_LEVEL ?? "debug",
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
        },
      }
    : { level: process.env.LOG_LEVEL ?? "info" },
);
