import type { DocumentLanguage } from "../index";
import { composePromptSkills, type PromptSkillId } from "../skills";

export interface WritingPromptOptions {
  isParentSection?: boolean;
}

export function buildWritingContext(
  locale: DocumentLanguage = "en",
  options: WritingPromptOptions = {},
): string {
  const skills: PromptSkillId[] = [
    "writing-base",
    "writing-section-boundary",
    "writing-anti-ai-style",
    options.isParentSection ? "writing-parent-overview" : "writing-leaf-section",
    "writing-output-format",
  ];

  return composePromptSkills(locale, skills);
}
