import type { ChatMessage } from "@/lib/llm/types";
import { buildWritingContext, type DocumentLanguage } from "@/lib/prompts";

export interface ContextInput {
  draft: {
    title: string;
    outline: string;
    description?: string | null;
  };
  section: {
    title: string;
    description?: string | null;
    keyPoints?: string | null;
    estimatedWords?: number | null;
  };
  completedSections: {
    title: string;
    summary: string | null;
    status: string;
  }[];
  constraints?: {
    referenceSections?: string[];
    wordLimit?: number;
    additionalRequirements?: string;
    writingRequirements?: string;
  } | null;
}

const COMPLETED_SUMMARIES_TOTAL_CHAR_LIMIT = 6_000;

function truncateText(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 72)).trimEnd()}\n[Content truncated to keep section generation focused.]`;
}

function buildSystemMessage(
  docLocale: DocumentLanguage = "en",
  options: { isParentSection?: boolean } = {},
): ChatMessage {
  return { role: "system", content: buildWritingContext(docLocale, options) };
}

function buildOutlineSummary(
  draft: ContextInput["draft"],
  section: ContextInput["section"]
): string {
  const outlineEntries: string[] = [];

  outlineEntries.push(`Document: "${draft.title}"`);
  if (draft.description) {
    outlineEntries.push(`Description: ${draft.description}`);
  }

  try {
    const parsed = JSON.parse(draft.outline) as unknown;

    if (typeof parsed === "object" && parsed !== null && "sections" in parsed) {
      const outlineData = parsed as { sections: OutlineNode[] };
      const current = findOutlineNodeWithContext(
        outlineData.sections,
        section.title.replace(/^\d+(\.\d+)*\s*/, "").trim(),
      );
      const lines: string[] = ["Relevant Outline Context:"];
      if (current) {
        lines.push(`Current path: ${current.path.map((node) => `${node.num} ${node.title}`).join(" > ")}`);
        if (current.parent) {
          lines.push(`Parent section: ${current.parent.num} ${current.parent.title}`);
        }
        if (current.siblings.length > 0) {
          lines.push(
            `Sibling sections: ${current.siblings.map((node) => `${node.num} ${node.title}`).join("; ")}`
          );
        }
        if (current.node.children?.length) {
          lines.push(
            `Direct child sections to avoid duplicating: ${current.node.children.map((node) => `${node.num} ${node.title}`).join("; ")}`
          );
        }
      } else {
        lines.push(`Current section: ${section.title}`);
      }
      outlineEntries.push(lines.join("\n"));
    } else if (Array.isArray(parsed)) {
      const sectionTitles = parsed
        .map((item: unknown, index: number) => {
          if (typeof item === "object" && item !== null && "title" in item) {
            return `  ${index + 1}. ${(item as { title: string }).title}`;
          }
          return `  ${index + 1}. ${String(item)}`;
        })
        .join("\n");
      outlineEntries.push(`Outline:\n${sectionTitles}`);
    } else {
      outlineEntries.push(`Outline: ${draft.outline}`);
    }
  } catch {
    outlineEntries.push(`Outline: ${draft.outline}`);
  }

  return outlineEntries.join("\n");
}

interface OutlineNode {
  num: string;
  title: string;
  children?: OutlineNode[];
}

interface OutlineNodeContext {
  node: OutlineNode;
  parent: OutlineNode | null;
  siblings: OutlineNode[];
  path: OutlineNode[];
}

function findOutlineNode(sections: OutlineNode[], cleanTitle: string): OutlineNode | null {
  for (const section of sections) {
    const currentTitle = section.title.replace(/^\d+(\.\d+)*\s*/, "").trim();
    if (currentTitle === cleanTitle) return section;
    if (section.children) {
      const found = findOutlineNode(section.children, cleanTitle);
      if (found) return found;
    }
  }
  return null;
}

function findOutlineNodeWithContext(
  sections: OutlineNode[],
  cleanTitle: string,
  parent: OutlineNode | null = null,
  path: OutlineNode[] = [],
): OutlineNodeContext | null {
  for (const section of sections) {
    const currentTitle = section.title.replace(/^\d+(\.\d+)*\s*/, "").trim();
    const currentPath = [...path, section];
    if (currentTitle === cleanTitle) {
      return {
        node: section,
        parent,
        siblings: sections.filter((item) => item !== section),
        path: currentPath,
      };
    }
    if (section.children) {
      const found = findOutlineNodeWithContext(
        section.children,
        cleanTitle,
        section,
        currentPath,
      );
      if (found) return found;
    }
  }
  return null;
}

function buildCompletedSectionsSummary(
  completedSections: ContextInput["completedSections"]
): string {
  const completed = completedSections.filter(
    (s) => ["completed", "locked", "summarized", "reviewing"].includes(s.status) && s.summary
  );

  if (completed.length === 0) {
    return "";
  }

  const entries: string[] = [];
  let used = 0;
  for (const section of completed) {
    const header = `### ${section.title}\n`;
    const remaining = COMPLETED_SUMMARIES_TOTAL_CHAR_LIMIT - used - header.length;
    if (remaining <= 0) break;
    const entry = `${header}${truncateText(section.summary || "", remaining)}`;
    entries.push(entry);
    used += entry.length;
  }

  return [
    "## Previously Completed Sections (for continuity)",
    "",
    ...entries,
  ].join("\n");
}

function buildTargetSectionBlock(section: ContextInput["section"], effectiveWordCount?: number | null): string {
  const parts: string[] = [
    "## Target Section to Write",
    "",
    `Title: ${section.title}`,
  ];

  if (section.description) {
    parts.push(`Description: ${section.description}`);
  }

  if (section.keyPoints) {
    parts.push(`Key Points to Cover:\n${section.keyPoints}`);
  }

  const wordCount = effectiveWordCount ?? section.estimatedWords;
  if (wordCount) {
    parts.push(`Target Word Count: approximately ${wordCount} words`);
  }

  return parts.join("\n");
}

function buildConstraintsBlock(
  constraints: NonNullable<ContextInput["constraints"]>,
  docLocale: DocumentLanguage,
): string {
  const parts: string[] = [
    docLocale === "zh-CN"
      ? "## 本章节强制要求"
      : "## Mandatory Section-Specific Requirements",
  ];

  if (constraints.referenceSections && constraints.referenceSections.length > 0) {
    parts.push(
      `Prioritize these reference sections: ${constraints.referenceSections.join(", ")}`
    );
  }

  if (constraints.additionalRequirements) {
    parts.push(
      docLocale === "zh-CN"
        ? `以下要求由用户针对当前章节提供，必须遵守：\n${constraints.additionalRequirements}`
        : `The following requirements are user-provided and must be followed for this section:\n${constraints.additionalRequirements}`
    );
  }

  return parts.join("\n");
}

export function assembleContext(input: ContextInput, docLocale: DocumentLanguage = "en"): ChatMessage[] {
  const userParts: string[] = [];

  userParts.push(buildOutlineSummary(input.draft, input.section));

  const completedSummary = buildCompletedSectionsSummary(
    input.completedSections
  );
  if (completedSummary) {
    userParts.push("");
    userParts.push(completedSummary);
  }

  // detect if target section is a parent (has child sections in outline)
  let isParent = false;
  try {
    const parsed = JSON.parse(input.draft.outline) as unknown;
    if (typeof parsed === "object" && parsed !== null && "sections" in parsed) {
      const outlineData = parsed as { sections: OutlineNode[] };
      const cleanTitle = input.section.title.replace(/^\d+(\.\d+)*\s*/, "").trim();
      isParent = Boolean(findOutlineNode(outlineData.sections, cleanTitle)?.children?.length);
    }
  } catch {}

  userParts.push("");
  userParts.push(buildTargetSectionBlock(input.section, input.constraints?.wordLimit ?? input.section.estimatedWords));

  if (input.constraints) {
    userParts.push("");
    userParts.push(buildConstraintsBlock(input.constraints, docLocale));
  }

  if (isParent) {
    userParts.push("");
    userParts.push(
      "IMPORTANT: This section has child subsections (indicated with ▶ in the outline above). Write a CONCISE OVERVIEW that introduces the topic scope at a high level. Do NOT write detailed content for child subsections — those will be generated separately under their own titles. Keep it brief (200-500 words recommended)."
    );
  } else {
    userParts.push("");
    userParts.push(
      "Write the final reader-facing content for the target section now. Do not repeat the target section title or section number."
    );
  }

  return [
    buildSystemMessage(docLocale, { isParentSection: isParent }),
    { role: "user", content: userParts.join("\n") },
  ];
}
