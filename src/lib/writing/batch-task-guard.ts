import { findTasksByResourceIdentity } from "@/lib/queue/task-identity-query";

/**
 * A draft_generate_all task counts as live while its row shows activity within
 * this window. Running tasks are auto-heartbeated every 60s (queue.ts), so the
 * window is aligned with the queue's heartbeat timeout
 * (QUEUE_HEARTBEAT_TIMEOUT_MS, 5 min): past it the heartbeat scanner fails the
 * task within its 2-minute scan interval, and the sections it held become
 * genuine orphans again.
 */
const LIVE_BATCH_TASK_WINDOW_MS = 5 * 60 * 1000;

/**
 * Find a draft_generate_all task for this draft that is pending/running and
 * recently active, or null when none is.
 *
 * The worker only touches section.updatedAt when a section enters/leaves a
 * status — a section streaming for 4-9 minutes looks stale to the 3-minute
 * stuck-section sweep in drafts/[id] even though the worker is actively
 * writing into it. Callers:
 *  - drafts/[id] GET: skip the sweep while a batch task is alive;
 *  - single-section generate/compare: reject with 409 so a manual generation
 *    can't double-write a section the batch task is (or is about to be)
 *    working on — the worker takes its section snapshot once at startup and
 *    never re-checks statuses mid-run.
 */
export async function findLiveBatchTask(userId: string, draftId: string) {
  const tasks = await findTasksByResourceIdentity({
    userId,
    field: "draftId",
    value: draftId,
    types: ["draft_generate_all"],
    statuses: ["pending", "running"],
  });
  return (
    tasks.find((task) => {
      // Same preference as the queue's scanHeartbeats: the dedicated
      // heartbeat column, falling back to updatedAt for a pending task that
      // hasn't been claimed yet (its row still carries the submission time).
      const lastBeat =
        task.heartbeatAt && task.heartbeatAt.getTime() > 0
          ? task.heartbeatAt
          : task.updatedAt;
      return Date.now() - lastBeat.getTime() < LIVE_BATCH_TASK_WINDOW_MS;
    }) ?? null
  );
}
