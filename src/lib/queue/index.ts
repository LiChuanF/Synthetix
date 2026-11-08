import { TaskQueue } from "./queue";
import { generateDraftAll } from "./workers/draft-worker";
import { generateOutline } from "./workers/outline-worker";
import type { TaskPayload, TaskResult } from "./types";
export { DocumentMutationBusyError, executionRegistry } from "./execution-registry";

let queue: TaskQueue | null = null;

const LONG_DRAFT_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours
const OUTLINE_GENERATE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes — recursive multi-level expansion

// Heartbeat-stall detection: a running task whose lastHeartbeatAt is older
// than this is marked failed (zombie worker defense). Defaults align with the
// LLM fetch timeout (5 min) — see queue.ts scanHeartbeats().
const QUEUE_HEARTBEAT_SCAN_INTERVAL_MS = readPositiveInt("QUEUE_HEARTBEAT_SCAN_INTERVAL_MS", 2 * 60 * 1000);
const QUEUE_HEARTBEAT_TIMEOUT_MS = readPositiveInt("QUEUE_HEARTBEAT_TIMEOUT_MS", 5 * 60 * 1000);
const QUEUE_TOTAL_CONCURRENCY = readPositiveInt("QUEUE_TOTAL_CONCURRENCY", 4);

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

let draining = false;

export function getQueue(): TaskQueue {
  if (!queue) {
    queue = new TaskQueue({
      concurrency: QUEUE_TOTAL_CONCURRENCY,
      timeoutMs: 30 * 60 * 1000,
      heartbeatScanIntervalMs: QUEUE_HEARTBEAT_SCAN_INTERVAL_MS,
      heartbeatTimeoutMs: QUEUE_HEARTBEAT_TIMEOUT_MS,
      taskTimeoutMs: {
        draft_generate_all: LONG_DRAFT_TIMEOUT_MS,
        outline_generate: OUTLINE_GENERATE_TIMEOUT_MS,
      },
    });

    queue.registerWorker("draft_generate_all", async (
      payload: TaskPayload,
      ctx,
    ): Promise<TaskResult> => {
      const draftId = payload.draftId as string;
      if (!ctx.taskId || !draftId || !ctx.userId) {
        throw new Error("Missing required draft generation payload");
      }
      return generateDraftAll(
        {
          ...payload,
          taskId: ctx.taskId,
          draftId,
          userId: ctx.userId,
        },
        ctx,
      );
    });

    queue.registerWorker("outline_generate", async (
      payload: TaskPayload,
      ctx,
    ): Promise<TaskResult> => {
      return generateOutline(payload, ctx);
    });

    if (!draining) {
      draining = true;
      void queue.drain();
    }

    // Start the heartbeat-stall scanner so zombie workers (e.g. an LLM
    // provider holding a connection open without replying) are failed within
    // minutes instead of waiting for the 4h hard timeout.
    queue.startHeartbeatScan();
  }
  return queue;
}
