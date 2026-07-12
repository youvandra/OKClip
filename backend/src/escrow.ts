import { logger } from "./logger.js";

export type EscrowState = "funded" | "released" | "refunded";

export interface EscrowRecord {
  jobId: string;
  agentId: string;
  amountUsdt: string;
  state: EscrowState;
  createdAt: number;
  updatedAt: number;
}

/**
 * Escrow seam. In production this is backed by OKX A2A escrow settling on
 * X Layer; the concrete provider is confirmed at registration. The interface
 * lets the rest of the app stay agnostic.
 */
export interface EscrowProvider {
  fund(jobId: string, agentId: string, amountUsdt: string): Promise<EscrowRecord>;
  release(jobId: string): Promise<EscrowRecord>;
  refund(jobId: string): Promise<EscrowRecord>;
  get(jobId: string): EscrowRecord | undefined;
}

/**
 * In-memory escrow for local development and the hackathon MVP. It models the
 * lifecycle (fund -> release/refund) without moving funds. Swap for the OKX
 * provider without touching callers.
 */
export class InMemoryEscrow implements EscrowProvider {
  private readonly records = new Map<string, EscrowRecord>();

  async fund(
    jobId: string,
    agentId: string,
    amountUsdt: string,
  ): Promise<EscrowRecord> {
    const now = Date.now();
    const record: EscrowRecord = {
      jobId,
      agentId,
      amountUsdt,
      state: "funded",
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(jobId, record);
    logger.info({ jobId, amountUsdt }, "Escrow funded (stub)");
    return record;
  }

  private async transition(
    jobId: string,
    state: EscrowState,
  ): Promise<EscrowRecord> {
    const record = this.records.get(jobId);
    if (!record) throw new Error(`No escrow for job ${jobId}`);
    if (record.state !== "funded") {
      throw new Error(`Escrow for ${jobId} is already ${record.state}`);
    }
    record.state = state;
    record.updatedAt = Date.now();
    logger.info({ jobId, state }, "Escrow transition (stub)");
    return record;
  }

  release(jobId: string): Promise<EscrowRecord> {
    return this.transition(jobId, "released");
  }

  refund(jobId: string): Promise<EscrowRecord> {
    return this.transition(jobId, "refunded");
  }

  get(jobId: string): EscrowRecord | undefined {
    return this.records.get(jobId);
  }
}
