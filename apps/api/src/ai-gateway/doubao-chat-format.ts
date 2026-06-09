const DEFAULT_DOUBAO_API_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const CHAT_COMPLETIONS_PATH = "/chat/completions";

export interface DoubaoChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface DoubaoChatCompletionsBody {
  model: string;
  messages: DoubaoChatMessage[];
  stream: true;
  stream_options: {
    include_usage: true;
  };
  thinking: {type: "disabled"};
  temperature: 0.1;
}

export interface AiTokenUsage {
  totalTokens: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
}

export interface DoubaoStreamEvent {
  content?: string;
  tokenUsage?: AiTokenUsage;
}

interface DoubaoStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      role?: string;
    };
  }>;
  usage?: {
    total_tokens?: number | null;
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
  };
  bot_usage?: {
    model_usage?: Array<{
      total_tokens?: number | null;
      prompt_tokens?: number | null;
      completion_tokens?: number | null;
      input_tokens?: number | null;
      output_tokens?: number | null;
    }>;
  };
}

export function getDoubaoChatCompletionsUrl(baseUrl?: string) {
  const normalizedBaseUrl = (baseUrl?.trim() || DEFAULT_DOUBAO_API_BASE_URL).replace(/\/+$/, "");

  if (normalizedBaseUrl.endsWith(CHAT_COMPLETIONS_PATH)) {
    return normalizedBaseUrl;
  }

  return `${normalizedBaseUrl}${CHAT_COMPLETIONS_PATH}`;
}

export function buildDoubaoChatCompletionsBody(input: {
  model: string;
  messages: DoubaoChatMessage[];
}): DoubaoChatCompletionsBody {
  return {
    model: input.model,
    messages: input.messages,
    stream: true,
    stream_options: {
      include_usage: true,
    },
    thinking: {type: "disabled"},
    temperature: 0.1
  };
}

export function parseDoubaoStreamText(rawText: string) {
  const chunks = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return chunks
    .map((line) => parseDoubaoStreamLine(line))
    .filter((content): content is string => typeof content === "string")
    .join("");
}

export function parseDoubaoStreamResult(rawText: string) {
  const chunks = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let content = "";
  let tokenUsage: AiTokenUsage | undefined;

  for (const line of chunks) {
    const event = parseDoubaoStreamEvent(line);
    if (event.content) content += event.content;
    if (event.tokenUsage) tokenUsage = event.tokenUsage;
  }

  return { content, tokenUsage };
}

export function parseDoubaoStreamLine(rawLine: string) {
  return parseDoubaoStreamEvent(rawLine).content;
}

export function parseDoubaoStreamEvent(rawLine: string): DoubaoStreamEvent {
  const line = rawLine.startsWith("data:") ? rawLine.slice("data:".length).trim() : rawLine;

  if (!line || line === "[DONE]") {
    return {};
  }

  const chunk = JSON.parse(line) as DoubaoStreamChunk;
  const choice = chunk.choices?.[0];
  const content = choice?.delta?.content;
  const tokenUsage = extractDoubaoTokenUsage(chunk);

  return {
    ...(typeof content === "string" ? { content } : {}),
    ...(tokenUsage ? { tokenUsage } : {}),
  };
}

function extractDoubaoTokenUsage(chunk: DoubaoStreamChunk): AiTokenUsage | undefined {
  const usage = chunk.usage;
  if (usage) {
    return normalizeAiTokenUsage({
      totalTokens: usage.total_tokens,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
    });
  }

  const modelUsage = chunk.bot_usage?.model_usage?.[0];
  if (!modelUsage) return undefined;

  return normalizeAiTokenUsage({
    totalTokens: modelUsage.total_tokens,
    promptTokens: modelUsage.prompt_tokens ?? modelUsage.input_tokens,
    completionTokens: modelUsage.completion_tokens ?? modelUsage.output_tokens,
  });
}

function normalizeAiTokenUsage(input: {
  totalTokens?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
}): AiTokenUsage | undefined {
  const totalTokens = normalizeTokenNumber(input.totalTokens);
  const promptTokens = normalizeTokenNumber(input.promptTokens);
  const completionTokens = normalizeTokenNumber(input.completionTokens);

  if (totalTokens === null && promptTokens === null && completionTokens === null) return undefined;

  return {
    totalTokens,
    promptTokens,
    completionTokens,
  };
}

function normalizeTokenNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
