import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnthropicAdapter } from "@/lib/llm/anthropic-adapter";

const mockFetch = vi.fn();
global.fetch = mockFetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function chatResponse(): Response {
  return jsonResponse({
    content: [{ type: "text", text: "ok" }],
    usage: { input_tokens: 5, output_tokens: 1 },
    model: "test-model",
    stop_reason: "end_turn",
  });
}

function requestBody(call = 0): Record<string, unknown> {
  const init = mockFetch.mock.calls[call][1] as RequestInit;
  return JSON.parse(String(init.body));
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("AnthropicAdapter thinking opt-out", () => {
  it("sends thinking.disabled to DeepSeek Anthropic-compatible endpoints", async () => {
    mockFetch.mockResolvedValueOnce(chatResponse());
    const adapter = new AnthropicAdapter({
      baseUrl: "https://api.deepseek.com/anthropic",
      apiKey: "test-key",
    });

    await adapter.chat({
      model: "deepseek-flash",
      messages: [{ role: "user", content: "hi" }],
      disableThinking: true,
    });

    expect(requestBody().thinking).toEqual({ type: "disabled" });
  });

  it("omits the non-standard field for real Anthropic endpoints", async () => {
    mockFetch.mockResolvedValueOnce(chatResponse());
    const adapter = new AnthropicAdapter({
      baseUrl: "https://api.anthropic.com",
      apiKey: "test-key",
    });

    await adapter.chat({
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "hi" }],
      disableThinking: true,
    });

    expect(requestBody()).not.toHaveProperty("thinking");
  });

  it("leaves thinking enabled (field absent) when not requested", async () => {
    mockFetch.mockResolvedValueOnce(chatResponse());
    const adapter = new AnthropicAdapter({
      baseUrl: "https://api.deepseek.com/anthropic",
      apiKey: "test-key",
    });

    await adapter.chat({
      model: "deepseek-flash",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(requestBody()).not.toHaveProperty("thinking");
  });
});
