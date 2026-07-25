import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

function client(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey.startsWith("sk-ant-xxxx")) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add a real key from https://console.anthropic.com"
      );
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

/** Single-turn text completion. Returns the concatenated text content. */
export async function complete(prompt: string, opts?: { system?: string; maxTokens?: number }): Promise<string> {
  const res = await client().messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    max_tokens: opts?.maxTokens ?? 500,
    system: opts?.system,
    messages: [{ role: "user", content: prompt }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/** Same as complete(), but instructs the model to return only JSON and parses it. */
export async function completeJSON<T>(prompt: string, opts?: { system?: string; maxTokens?: number }): Promise<T> {
  const system =
    (opts?.system ? opts.system + "\n\n" : "") +
    "Respond with ONLY valid JSON. No prose, no markdown code fences, no preamble.";
  const raw = await complete(prompt, { system, maxTokens: opts?.maxTokens ?? 500 });
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned) as T;
}
