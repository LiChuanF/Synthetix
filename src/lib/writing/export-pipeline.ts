import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { spawn } from "child_process";
import { db } from "@/lib/db";
import { stripLeadingSectionTitle } from "@/lib/writing/strip-section-title";
import { CONFIRMED_SECTION_STATUSES } from "@/lib/writing/status";

const EXPORT_SCRIPT = path.resolve(/* turbopackIgnore: true */ "workers/python/export.py");
const PYTHON_PATH = process.env.PYTHON_PATH || (process.platform === "win32" ? "python" : "python3");
const TMP_DIR = path.resolve("data/tmp");

export type ExportFormat = "markdown" | "pdf" | "docx";

export function sanitizeFilename(title: string): string {
  const sanitized = title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
  return sanitized || "document";
}

export function contentDisposition(filename: string, ext: string): string {
  const fallback = filename.replace(/[^\x20-\x7E]+/g, "") || "document";
  const encoded = encodeURIComponent(`${filename}.${ext}`);
  return `attachment; filename="${fallback}.${ext}"; filename*=UTF-8''${encoded}`;
}

export function normalizeFormat(format: unknown): ExportFormat | null {
  if (format === "md" || format === "markdown" || format === undefined || format === null) return "markdown";
  if (format === "doc" || format === "docs" || format === "docx") return "docx";
  if (format === "pdf") return "pdf";
  return null;
}

function parseOutlineNumber(section: { constraints: string | null }): string | null {
  if (!section.constraints) return null;
  try {
    const parsed = JSON.parse(section.constraints) as { outlineNumber?: unknown };
    return typeof parsed.outlineNumber === "string" && parsed.outlineNumber.trim() ? parsed.outlineNumber.trim() : null;
  } catch { return null; }
}

function buildSectionDepths(sections: Array<{ id: string; parentId: string | null }>): Map<string, number> {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const cache = new Map<string, number>();
  function depthOf(id: string): number {
    const cached = cache.get(id);
    if (cached !== undefined) return cached;
    const s = byId.get(id);
    if (!s?.parentId) { cache.set(id, 0); return 0; }
    const d = depthOf(s.parentId) + 1;
    cache.set(id, d);
    return d;
  }
  for (const s of sections) depthOf(s.id);
  return cache;
}

export async function buildMarkdown(draftId: string, userId: string): Promise<string> {
  const draft = await db.draft.findFirst({ where: { id: draftId, userId } });
  if (!draft) throw new Error("Draft not found");

  const sections = await db.section.findMany({
    where: { draftId, status: { in: CONFIRMED_SECTION_STATUSES } },
    orderBy: { index: "asc" },
  });
  if (sections.length === 0) throw new Error("No confirmed sections available to export");

  const depths = buildSectionDepths(sections);
  const titleHeader = `# ${draft.title}\n\n`;
  const sectionParts = sections.map((section) => {
    const depth = depths.get(section.id) ?? 0;
    const headingLevel = Math.min(6, depth + 2);
    const headingPrefix = "#".repeat(headingLevel);
    const outlineNumber = parseOutlineNumber(section);
    const headingTitle = outlineNumber ? `${outlineNumber}. ${section.title.replace(/^\d+(\.\d+)*\.?\s*/, "")}` : section.title;
    const content = stripLeadingSectionTitle(section.content ?? "", section.title);
    return `${headingPrefix} ${headingTitle}\n\n${content}\n\n`;
  });
  return titleHeader + sectionParts.join("");
}

export function runExport(input: string, output: string, format: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_PATH, [EXPORT_SCRIPT, "--input", input, "--output", output, "--format", format], { stdio: "pipe", timeout: 60_000 });
    let stderr = "";
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code: number | null) => { if (code === 0) { resolve(); } else { reject(new Error(stderr || `Export failed with code ${code}`)); } });
    proc.on("error", (err: Error) => reject(err));
  });
}

export async function renderPdfWithPlaywright(htmlPath: string, outputPath: string): Promise<void> {
  let chromium: typeof import("playwright").chromium;
  try { ({ chromium } = await import("playwright")); } catch { throw new Error("Playwright is not installed. Run: pnpm install"); }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlPath).toString(), { waitUntil: "networkidle" });
    await page.pdf({ path: outputPath, format: "A4", printBackground: true, margin: { top: "20mm", right: "22mm", bottom: "20mm", left: "22mm" } });
  } finally { await browser.close(); }
}

export function cleanupFiles(...files: string[]) {
  for (const file of files) {
    try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch {}
  }
}

export function getTmpDir(): string { return TMP_DIR; }
