"use client";

import { useCallback } from "react";

export function useSectionActions(
  id: string,
  activeSectionId: string | null,
  loadDraft: () => Promise<void>,
) {
  const handleSelectModel = useCallback(
    async (source: "a" | "b") => {
      if (!activeSectionId) return;
      const res = await fetch(`/api/v1/drafts/${id}/sections/${activeSectionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedSource: source }),
      });
      if (res.ok) await loadDraft();
    },
    [activeSectionId, id, loadDraft],
  );

  const handleSaveEdit = useCallback(async (content: string) => {
    if (!activeSectionId) return;
    try {
      await fetch(`/api/v1/drafts/${id}/sections/${activeSectionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      await loadDraft();
    } catch {}
  }, [id, activeSectionId, loadDraft]);

  const handleSaveEstimatedWords = useCallback(async (words: number) => {
    if (!activeSectionId) return;
    try {
      await fetch(`/api/v1/drafts/${id}/sections/${activeSectionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimatedWords: words }),
      });
    } catch {}
  }, [id, activeSectionId]);

  return {
    handleSelectModel,
    handleSaveEdit,
    handleSaveEstimatedWords,
  };
}
