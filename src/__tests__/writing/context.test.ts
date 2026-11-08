import { describe, expect, it } from "vitest";
import { assembleContext } from "@/lib/writing/context";

const baseInput = {
  draft: {
    title: "Technical Proposal",
    outline: JSON.stringify({ title: "Technical Proposal", sections: [{ num: "1", title: "Architecture", children: [] }] }),
    description: null,
  },
  section: {
    title: "Architecture",
    description: "System architecture and component relationships",
    keyPoints: JSON.stringify(["API gateway", "Service layer", "Database"]),
    estimatedWords: 800,
  },
  completedSections: [],
};

describe("assembleContext", () => {
  it("places additional requirements in a mandatory section block", () => {
    const messages = assembleContext({
      ...baseInput,
      constraints: { additionalRequirements: "Include concrete module boundaries." },
    });
    const userMessage = messages[1].content;

    expect(userMessage).toContain("## Mandatory Section-Specific Requirements");
    expect(userMessage).toContain("must be followed");
    expect(userMessage).toContain("Include concrete module boundaries.");
  });

  it("does not include diagram syntax for ordinary sections", () => {
    const messages = assembleContext({
      ...baseInput,
      draft: {
        ...baseInput.draft,
        outline: JSON.stringify({ title: "Technical Proposal", sections: [{ num: "1", title: "Project Background", children: [] }] }),
      },
      section: {
        title: "Project Background",
        description: "Business context and target readers",
        keyPoints: JSON.stringify(["Business context", "Audience", "Writing goals"]),
        estimatedWords: 800,
      },
    });
    const systemMessage = messages[0].content;

    expect(systemMessage).not.toContain("DIAGRAM_REQUEST");
    expect(systemMessage).toContain("leaf section");
  });

  it("uses parent overview rules for sections with children", () => {
    const messages = assembleContext({
      ...baseInput,
      draft: {
        ...baseInput.draft,
        outline: JSON.stringify({
          title: "Technical Proposal",
          sections: [
            {
              num: "1",
              title: "Architecture",
              children: [{ num: "1.1", title: "Deployment Topology", children: [] }],
            },
          ],
        }),
      },
    });
    const systemMessage = messages[0].content;
    const userMessage = messages[1].content;

    expect(systemMessage).toContain("child subsections");
    expect(systemMessage).not.toContain("leaf section");
    expect(userMessage).toContain("This section has child subsections");
  });

  it("uses localized mandatory requirements text for Chinese documents", () => {
    const messages = assembleContext({
      ...baseInput,
      draft: { ...baseInput.draft, title: "技术方案" },
      section: {
        title: "总体架构设计",
        description: "说明系统架构和部署拓扑",
        keyPoints: JSON.stringify(["网关", "服务层", "数据库"]),
        estimatedWords: 800,
      },
      constraints: { additionalRequirements: "必须包含架构说明" },
    }, "zh-CN");
    const userMessage = messages[1].content;

    expect(userMessage).toContain("## 本章节强制要求");
    expect(userMessage).toContain("必须遵守");
  });
});
