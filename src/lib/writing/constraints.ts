import type { ContextInput } from "@/lib/writing/context";

export interface SectionConstraintData {
  outlineNumber?: string;
  additionalRequirements?: string;
  writingRequirements?: string;
  _audit?: unknown;
}

export function parseSectionConstraints(value?: string | null): SectionConstraintData {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const obj = parsed as Record<string, unknown>;
    return {
      outlineNumber: typeof obj.outlineNumber === "string" ? obj.outlineNumber : undefined,
      additionalRequirements: typeof obj.additionalRequirements === "string" ? obj.additionalRequirements : undefined,
      writingRequirements: typeof obj.writingRequirements === "string" ? obj.writingRequirements : undefined,
      _audit: obj._audit,
    };
  } catch {
    return {};
  }
}

function stringifySectionConstraints(value: SectionConstraintData): string | null {
  const cleaned: SectionConstraintData = {};
  if (value.outlineNumber) cleaned.outlineNumber = value.outlineNumber;
  if (value.additionalRequirements) cleaned.additionalRequirements = value.additionalRequirements;
  if (value.writingRequirements) cleaned.writingRequirements = value.writingRequirements;
  if (value._audit !== undefined) cleaned._audit = value._audit;
  return Object.keys(cleaned).length > 0 ? JSON.stringify(cleaned) : null;
}

export function mergeSectionConstraints(
  existingValue: string | null | undefined,
  updates: SectionConstraintData,
): string | null {
  const existing = parseSectionConstraints(existingValue);
  return stringifySectionConstraints({
    ...existing,
    ...updates,
  });
}

export function buildEffectiveConstraints(
  sectionConstraints?: string | null,
  requestConstraints?: ContextInput["constraints"],
): ContextInput["constraints"] {
  const hidden = parseSectionConstraints(sectionConstraints);
  const hasHidden =
    Boolean(hidden.additionalRequirements) ||
    Boolean(hidden.writingRequirements);

  if (!requestConstraints && !hasHidden) {
    return undefined;
  }

  const requestAdditional = requestConstraints?.additionalRequirements?.trim();
  const persistedAdditional = hidden.additionalRequirements?.trim();
  const writingRequirements = hidden.writingRequirements?.trim();
  const additionalRequirements = [
    writingRequirements,
    requestAdditional || persistedAdditional,
  ].filter(Boolean).join("\n");

  return {
    ...requestConstraints,
    additionalRequirements: additionalRequirements || requestAdditional || persistedAdditional,
    writingRequirements: hidden.writingRequirements,
  };
}
