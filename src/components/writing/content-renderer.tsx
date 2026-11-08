"use client";

import { stripLeadingSectionTitle } from "@/lib/writing/strip-section-title";
import { MarkdownBlock } from "./markdown-renderer";

export function ContentRenderer({
  content,
  sectionTitle,
}: {
  content: string;
  sectionTitle?: string | null;
}) {
  return (
    <div className="doc-content">
      <MarkdownBlock text={stripLeadingSectionTitle(content, sectionTitle)} />
    </div>
  );
}
