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
}

interface DoubaoStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      role?: string;
    };
  }>;
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

function parseDoubaoStreamLine(rawLine: string) {
  const line = rawLine.startsWith("data:") ? rawLine.slice("data:".length).trim() : rawLine;

  if (!line || line === "[DONE]") {
    return undefined;
  }

  const chunk = JSON.parse(line) as DoubaoStreamChunk;
  const choice = chunk.choices?.[0];
  const content = choice?.delta?.content;

  return typeof content === "string" ? content : undefined;
}
