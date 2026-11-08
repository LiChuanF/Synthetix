import { describe, expect, it } from "vitest";
import { buildFacilitatorPrompt } from "@/lib/prompts/builders/facilitator";
import { buildWritingContext } from "@/lib/prompts/builders/writing-context";

describe("prompt skill builders", () => {
  it("builds a discovery prompt without unrelated later-stage markers", () => {
    const prompt = buildFacilitatorPrompt("en", "gathering");

    expect(prompt).toContain("NEEDS_GATHERED");
    expect(prompt).toContain("Do not ask about length together with other structural questions");
    expect(prompt).toContain("ask one final standalone length question");
    expect(prompt).toContain("A. [option title]");
    expect(prompt).toContain("D. Other");
    expect(prompt).not.toContain("DIRECTION_CONFIRMED");
    expect(prompt).not.toContain("ALL_SECTIONS_CONFIRMED");
  });

  it("builds a direction prompt focused on structure selection", () => {
    const prompt = buildFacilitatorPrompt("en", "direction");

    expect(prompt).toContain("outline direction selection");
    expect(prompt).toContain("provide one confirmable initial outline");
    expect(prompt).toContain("Do not offer multiple competing outline directions");
    expect(prompt).toContain("A. Generate the complete outline directly");
    expect(prompt).toContain("B. Discuss each section first");
    expect(prompt).toContain("DIRECTION_CONFIRMED");
    expect(prompt).not.toContain("ALL_SECTIONS_CONFIRMED");
  });

  it("builds a section refinement prompt without discovery dimensions", () => {
    const prompt = buildFacilitatorPrompt("en", "section_refine");

    expect(prompt).toContain("section-by-section refinement");
    expect(prompt).toContain("clear Markdown line breaks");
    expect(prompt).toContain("ALL_SECTIONS_CONFIRMED");
    expect(prompt).not.toContain("goal and audience");
  });

  it("builds localized Chinese discovery prompts with length and option formatting rules", () => {
    const prompt = buildFacilitatorPrompt("zh-CN", "gathering");

    expect(prompt).toContain("不要把篇幅/字数/页数和其他结构问题混在同一轮询问");
    expect(prompt).toContain("最后一个独立问题");
    expect(prompt).toContain("A. 【选项标题】");
    expect(prompt).toContain("D. 其他");
  });

  it("does not include diagram or reference-retrieval instructions", () => {
    const prompt = buildWritingContext("en", { isParentSection: false });

    expect(prompt).not.toContain("DIAGRAM_REQUEST");
    expect(prompt).not.toContain("Reference handling");
    expect(prompt).toContain("leaf section");
  });

  it("uses parent overview rules for parent sections", () => {
    const prompt = buildWritingContext("en", { isParentSection: true });

    expect(prompt).toContain("child subsections");
    expect(prompt).not.toContain("leaf section");
  });

  it("builds localized Chinese writing prompts from the same skill set", () => {
    const prompt = buildWritingContext("zh-CN", { isParentSection: true });

    expect(prompt).not.toContain("图表语法");
    expect(prompt).toContain("子章节");
  });
});
