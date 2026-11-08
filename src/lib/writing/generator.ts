import { getLLMClient } from "@/lib/llm/client";
import { createLLMProvider } from "@/lib/llm/factory";
import { recordTokenUsageSafely } from "@/lib/llm/usage";
import { assembleContext, type ContextInput } from "@/lib/writing/context";
import type { DocumentLanguage } from "@/lib/prompts";
import { buildEffectiveConstraints } from "@/lib/writing/constraints";

const GENERATION_TEMPERATURE = 0.7;

/** Detect document language from title/content CJK presence */
function detectDocLocale(title: string): DocumentLanguage {
  if (/[一-鿿぀-ヿ가-힯]/.test(title)) return "zh-CN";
  return "en";
}

export interface GenerationResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

export interface FullGenerationResult extends GenerationResult {
  modelConfigId: string;
}

// ─── Internal deep module: shared generation context preparation ────────────

interface PreparedGenerationContext {
  provider: ReturnType<typeof createLLMProvider>;
  modelId: string;
  modelConfigId: string;
  messages: ReturnType<typeof assembleContext>;
}

/** Resolve the LLM provider/model, preferring an explicit custom config. */
export async function resolveGenerationProvider(
  userId: string,
  customModelConfigId?: string,
): Promise<{
  provider: ReturnType<typeof createLLMProvider>;
  modelId: string;
  modelConfigId: string;
}> {
  if (customModelConfigId) {
    const { db } = await import("@/lib/db");
    const modelConfig = await db.modelConfig.findUnique({
      where: { id: customModelConfigId },
      include: { provider: true },
    });
    if (!modelConfig?.provider || modelConfig.provider.userId !== userId) {
      throw new Error(`Model config ${customModelConfigId} not found`);
    }
    return {
      provider: createLLMProvider({
        apiBaseUrl: modelConfig.provider.apiBaseUrl,
        apiKey: modelConfig.provider.apiKey,
        providerType: modelConfig.provider.providerType,
      }),
      modelId: modelConfig.modelId,
      modelConfigId: modelConfig.id,
    };
  }
  const resolved = await getLLMClient("writing", userId);
  return {
    provider: resolved.provider,
    modelId: resolved.modelId,
    modelConfigId: resolved.modelConfigId,
  };
}

/**
 * Prepare the generation context from the outline, previously completed
 * sections, section notes/key points, and user constraints only.
 */
async function prepareGenerationContext(
  draft: ContextInput["draft"],
  section: ContextInput["section"] & { constraints?: string | null },
  completedSections: ContextInput["completedSections"],
  userId: string,
  constraints?: ContextInput["constraints"],
  customModelConfigId?: string,
): Promise<PreparedGenerationContext> {
  const { provider, modelId, modelConfigId } = await resolveGenerationProvider(
    userId,
    customModelConfigId,
  );

  const effectiveConstraints = buildEffectiveConstraints(section.constraints, constraints);

  const messages = assembleContext(
    {
      draft,
      section,
      completedSections,
      constraints: effectiveConstraints,
    },
    detectDocLocale(draft.title),
  );

  return { provider, modelId, modelConfigId, messages };
}

export async function generateSectionFull(
  draft: ContextInput["draft"],
  section: ContextInput["section"] & { constraints?: string | null },
  completedSections: ContextInput["completedSections"],
  userId: string,
  constraints?: ContextInput["constraints"],
  customModelConfigId?: string,
): Promise<FullGenerationResult> {
  const ctx = await prepareGenerationContext(
    draft, section, completedSections, userId, constraints, customModelConfigId,
  );

  try {
    const response = await ctx.provider.chat({
      model: ctx.modelId,
      messages: ctx.messages,
      temperature: GENERATION_TEMPERATURE,
    });

    if (!response.content.trim()) {
      throw new Error("Model returned empty content for section generation.");
    }

    await recordTokenUsageSafely({
      userId,
      modelConfigId: ctx.modelConfigId,
      module: "writing",
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    });

    return {
      content: response.content,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      modelConfigId: ctx.modelConfigId,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Section generation failed: ${message}`);
  }
}

export async function generateSectionStream(
  draft: ContextInput["draft"],
  section: ContextInput["section"] & { constraints?: string | null },
  completedSections: ContextInput["completedSections"],
  userId: string,
  constraints?: ContextInput["constraints"],
  customModelConfigId?: string
) {
  const ctx = await prepareGenerationContext(
    draft, section, completedSections, userId, constraints, customModelConfigId,
  );

  const stream = ctx.provider.chatStream({
    model: ctx.modelId,
    messages: ctx.messages,
    temperature: GENERATION_TEMPERATURE,
    stream: true,
  });

  return { stream, modelConfigId: ctx.modelConfigId };
}

export interface CompareStreamCallbacks {
  onChunk: (source: "a" | "b", content: string) => void;
  onDone: (result: {
    contentA: string;
    contentB: string;
    modelA: string;
    modelB: string;
    inputTokensA: number;
    outputTokensA: number;
    inputTokensB: number;
    outputTokensB: number;
  }) => void;
  onError: (source: "a" | "b", error: string) => void;
}

export async function compareSectionStream(
  draft: ContextInput["draft"],
  section: ContextInput["section"] & { constraints?: string | null },
  completedSections: ContextInput["completedSections"],
  userId: string,
  modelAConfig: { provider: unknown; modelId: string; modelConfigId?: string },
  modelBConfig: { provider: unknown; modelId: string; modelConfigId?: string },
  constraints: ContextInput["constraints"] | undefined,
  callbacks: CompareStreamCallbacks,
): Promise<void> {
  const providerA = modelAConfig.provider as ReturnType<typeof createLLMProvider>;
  const providerB = modelBConfig.provider as ReturnType<typeof createLLMProvider>;

  const effectiveConstraints = buildEffectiveConstraints(section.constraints, constraints);

  const messages = assembleContext(
    {
      draft,
      section,
      completedSections,
      constraints: effectiveConstraints,
    },
    detectDocLocale(draft.title),
  );

  const chatParams = {
    messages,
    temperature: GENERATION_TEMPERATURE,
    stream: true as const,
  };

  let contentA = "";
  let contentB = "";
  let modelA = "";
  let modelB = "";
  let inputTokensA = 0;
  let outputTokensA = 0;
  let inputTokensB = 0;
  let outputTokensB = 0;

  await Promise.allSettled([
    (async () => {
      try {
        const stream = providerA.chatStream({ ...chatParams, model: modelAConfig.modelId });
        for await (const chunk of stream) {
          if (chunk.content) {
            contentA += chunk.content;
            callbacks.onChunk("a", chunk.content);
          }
          if (chunk.done) {
            modelA = modelAConfig.modelId;
            inputTokensA = chunk.inputTokens ?? 0;
            outputTokensA = chunk.outputTokens ?? 0;
          }
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        callbacks.onError("a", message);
      }
    })(),
    (async () => {
      try {
        const stream = providerB.chatStream({ ...chatParams, model: modelBConfig.modelId });
        for await (const chunk of stream) {
          if (chunk.content) {
            contentB += chunk.content;
            callbacks.onChunk("b", chunk.content);
          }
          if (chunk.done) {
            modelB = modelBConfig.modelId;
            inputTokensB = chunk.inputTokens ?? 0;
            outputTokensB = chunk.outputTokens ?? 0;
          }
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        callbacks.onError("b", message);
      }
    })(),
  ]);

  callbacks.onDone({
    contentA,
    contentB,
    modelA,
    modelB,
    inputTokensA,
    outputTokensA,
    inputTokensB,
    outputTokensB,
  });
}
