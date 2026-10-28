import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findLiveBatchTask } from "@/lib/writing/batch-task-guard";

const USER_ID = "batch-task-guard-user";
const DRAFT_ID = "batch-task-guard-draft";
const WINDOW_MS = 5 * 60 * 1000;

async function createTask(input: {
  id: string;
  status?: string;
  type?: string;
  draftId?: string | null;
  heartbeatAt?: Date | null;
  updatedAt?: Date;
}) {
  await db.asyncTask.create({
    data: {
      id: input.id,
      userId: USER_ID,
      type: input.type ?? "draft_generate_all",
      status: input.status ?? "running",
      inputData: JSON.stringify({ draftId: input.draftId ?? DRAFT_ID }),
      draftId: input.draftId ?? DRAFT_ID,
      heartbeatAt: input.heartbeatAt ?? null,
      ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
    },
  });
}

describe("findLiveBatchTask", () => {
  beforeEach(async () => {
    await db.user.upsert({
      where: { id: USER_ID },
      create: { id: USER_ID, username: USER_ID, passwordHash: "test-hash" },
      update: {},
    });
    await db.asyncTask.deleteMany({ where: { userId: USER_ID } });
  });

  afterEach(async () => {
    await db.asyncTask.deleteMany({ where: { userId: USER_ID } });
  });

  it("returns null when the draft has no task rows", async () => {
    expect(await findLiveBatchTask(USER_ID, DRAFT_ID)).toBeNull();
  });

  it("treats a running task with a fresh heartbeat as live", async () => {
    await createTask({
      id: "guard-fresh-heartbeat",
      heartbeatAt: new Date(Date.now() - 60_000),
    });
    expect((await findLiveBatchTask(USER_ID, DRAFT_ID))?.id).toBe("guard-fresh-heartbeat");
  });

  it("falls back to updatedAt for a running task without heartbeatAt", async () => {
    // A task claimed but pre-first-progress has no heartbeatAt column value;
    // its updatedAt still carries the claim time.
    await createTask({ id: "guard-no-heartbeat", heartbeatAt: null });
    expect((await findLiveBatchTask(USER_ID, DRAFT_ID))?.id).toBe("guard-no-heartbeat");
  });

  it("treats a pending task as live until the window passes", async () => {
    await createTask({
      id: "guard-pending-recent",
      status: "pending",
      updatedAt: new Date(Date.now() - WINDOW_MS + 60_000),
    });
    expect((await findLiveBatchTask(USER_ID, DRAFT_ID))?.id).toBe("guard-pending-recent");

    await createTask({
      id: "guard-pending-stale",
      status: "pending",
      updatedAt: new Date(Date.now() - WINDOW_MS - 60_000),
    });
    const live = await findLiveBatchTask(USER_ID, DRAFT_ID);
    expect(live?.id).toBe("guard-pending-recent");
  });

  it("prefers a stale heartbeatAt over a fresh updatedAt — the queue's scanner would fail that task too", async () => {
    await createTask({
      id: "guard-stale-heartbeat",
      heartbeatAt: new Date(Date.now() - WINDOW_MS - 60_000),
      updatedAt: new Date(),
    });
    expect(await findLiveBatchTask(USER_ID, DRAFT_ID)).toBeNull();
  });

  it("ignores terminal tasks regardless of freshness", async () => {
    for (const status of ["completed", "failed", "cancelled"]) {
      await createTask({
        id: `guard-terminal-${status}`,
        status,
        heartbeatAt: new Date(),
      });
    }
    expect(await findLiveBatchTask(USER_ID, DRAFT_ID)).toBeNull();
  });

  it("ignores tasks for other drafts and other task types", async () => {
    await createTask({
      id: "guard-other-draft",
      draftId: "some-other-draft",
      heartbeatAt: new Date(),
    });
    await createTask({
      id: "guard-other-type",
      type: "document_convert",
      draftId: null,
      heartbeatAt: new Date(),
      updatedAt: new Date(),
    });
    expect(await findLiveBatchTask(USER_ID, DRAFT_ID)).toBeNull();
  });
});
