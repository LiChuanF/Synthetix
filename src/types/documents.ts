// Text/document formats accepted for brainstorm background uploads.
// Spreadsheet formats (xlsx/csv) are dropped because they hold tabular data
// with little value for prose writing.
export const SUPPORTED_FORMATS = [
  "pdf", "docx", "pptx", "html", "epub", "txt", "md"
] as const;
export type SupportedFormat = typeof SUPPORTED_FORMATS[number];

/**
 * Brainstorm document upload limits. Requirements/background docs are
 * expected to be modest; these caps prevent unreasonable uploads from
 * blowing the LLM context window while still covering typical PRDs.
 */
export const BRAINSTORM_MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const BRAINSTORM_MAX_CONTENT_CHARS = 12000;

/** Derived <input accept> string so frontend and backend stay in sync. */
export const BRAINSTORM_ACCEPT = SUPPORTED_FORMATS.map((f) => `.${f}`).join(",");
