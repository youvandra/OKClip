import { parseJobToBrief } from "./a2a-adapter.js";
import type { Brief } from "./types.js";

/**
 * Pure parsing/classification of OKX `active-tasks` rows. Kept separate from
 * the worker loop so it can be unit-tested against the real task shape without
 * starting the poller.
 *
 * A row looks like:
 *   { jobId, statusCode: 0, status: "created", myAgentId, myRole: "asp",
 *     counterpartyAgentId, tokenAmount, tokenSymbol, title }
 * Note `statusCode` is the number; `status` is human text.
 */

/** Task status codes (see `onchainos agent active-tasks`). */
export const STATUS = {
  created: 0,
  accepted: 1,
  submitted: 2,
  refused: 3,
  disputed: 4,
} as const;

/** Does an error indicate the action already happened (idempotent no-op)? */
export function alreadyDone(err: unknown): boolean {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return m.includes("already") || m.includes("duplicate") || m.includes("exists");
}

/** Is `agentId` the provider (ASP) on this task? */
export function isOurs(t: any, agentId: string): boolean {
  if (String(t.myAgentId ?? "") === agentId && t.myRole === "asp") return true;
  const provider = String(
    t.providerAgentId ?? t.provider ?? t.aspAgentId ?? t.agentId ?? "",
  );
  return provider === agentId;
}

/** The client agent on the other side of the task. */
export function clientOf(t: any): string {
  return String(t.counterpartyAgentId ?? t.userAgentId ?? "");
}

export function jobIdOf(t: any): string {
  return String(t.jobId ?? t.id ?? t.taskId ?? "");
}

/** Numeric status: `statusCode` is the number; `status` is text ("created"). */
export function statusOf(t: any): number {
  return Number(t.statusCode ?? t.status);
}

/** True for terminal states (completed / failed / expired / cancelled …). */
export function isTerminalStatus(status: number): boolean {
  return status >= 5;
}

/** Build a Brief from the task's serviceParams / description. Throws if no URL. */
export function briefFromTask(t: any): Brief {
  let params: Record<string, unknown> = {};
  const raw = t.serviceParams ?? t.serviceBody ?? t.params;
  if (typeof raw === "string") {
    try {
      params = JSON.parse(raw);
    } catch {
      /* not JSON — fall back to the description */
    }
  } else if (raw && typeof raw === "object") {
    params = raw as Record<string, unknown>;
  }
  return parseJobToBrief({
    description: String(t.description ?? t.title ?? ""),
    serviceParams: params,
  });
}
