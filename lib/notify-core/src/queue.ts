import { Queue } from "bullmq";
import IORedis from "ioredis";
import { QUEUE_NAME, type DeliveryJob } from "./types.js";

const REDIS_URL = process.env["REDIS_URL"];

/** Is the async queue configured? When false, callers deliver inline (fallback). */
export function queueEnabled(): boolean {
  return !!REDIS_URL;
}

/** A fresh ioredis connection. BullMQ requires maxRetriesPerRequest: null. */
export function createConnection(): IORedis {
  return new IORedis(REDIS_URL || "redis://localhost:6379", { maxRetriesPerRequest: null });
}

let sharedConnection: IORedis | null = null;
let queue: Queue<DeliveryJob> | null = null;
function getQueue(): Queue<DeliveryJob> | null {
  if (!REDIS_URL) return null;
  if (!queue) {
    sharedConnection = createConnection();
    queue = new Queue<DeliveryJob>(QUEUE_NAME, { connection: sharedConnection });
  }
  return queue;
}

/** Retry policy for every delivery job (BullMQ owns the backoff schedule + DLQ). */
export const DEFAULT_JOB_OPTS = {
  attempts: 6,
  backoff: { type: "exponential" as const, delay: 30_000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

/**
 * Enqueue a delivery job. The jobId is the outbox id, so re-enqueuing the same
 * row (e.g. from the reconciliation sweep) is idempotent. Returns false when no
 * queue is configured, signalling the caller to deliver inline instead.
 */
export async function enqueueDelivery(outboxId: string): Promise<boolean> {
  const q = getQueue();
  if (!q) return false;
  await q.add("deliver", { outboxId }, { ...DEFAULT_JOB_OPTS, jobId: outboxId });
  return true;
}
