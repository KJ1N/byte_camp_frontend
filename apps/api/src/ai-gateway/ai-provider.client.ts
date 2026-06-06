import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  AiProviderBadOutputException,
  AiProviderTimeoutException,
  AiProviderUnavailableException,
  type AiProviderErrorDetail,
} from "./ai-gateway.errors";
import {
  buildDoubaoChatCompletionsBody,
  getDoubaoChatCompletionsUrl,
  parseDoubaoStreamLine,
  parseDoubaoStreamText,
  type DoubaoChatMessage,
} from "./doubao-chat-format";

export type AiChatMessage = DoubaoChatMessage;

export interface AiProviderCompleteInput {
  apiKey: string;
  baseUrl?: string;
  model: string;
  messages: AiChatMessage[];
  timeoutMs: number;
  maxRetries: number;
}

export interface AiProviderCompleteResponse {
  model: string;
  content: string;
}

export interface AiProviderTextDelta {
  model: string;
  content: string;
}

export type DoubaoFetch = (url: string, init: RequestInit) => Promise<Response>;
export const DOUBAO_FETCH = Symbol("DOUBAO_FETCH");

@Injectable()
export class AiProviderClient {
  constructor(
    @Optional()
    @Inject(DOUBAO_FETCH)
    private readonly fetchImpl?: DoubaoFetch,
  ) {}

  async complete(input: AiProviderCompleteInput): Promise<AiProviderCompleteResponse> {
    let content = "";

    for await (const delta of this.streamText(input)) {
      content += delta.content;
    }

    if (!content.trim()) {
      throw new AiProviderBadOutputException("Model output is empty. Please try again.");
    }

    return {
      model: input.model,
      content: content.trim(),
    };
  }

  async *streamText(input: AiProviderCompleteInput): AsyncGenerator<AiProviderTextDelta> {
    let attempt = 0;

    while (true) {
      try {
        yield* this.streamTextOnce(input);
        return;
      } catch (error) {
        if (error instanceof AiProviderBadOutputException) throw error;
        if (error instanceof AiProviderTimeoutException) throw error;
        if (error instanceof AiProviderUnavailableException && attempt >= input.maxRetries) throw error;
        if (!(error instanceof AiProviderUnavailableException)) throw error;
        attempt += 1;
      }
    }
  }

  private async *streamTextOnce(input: AiProviderCompleteInput): AsyncGenerator<AiProviderTextDelta> {
    const response = await this.sendRequest(input);

    if (!response.ok) {
      throw new AiProviderUnavailableException(await getProviderErrorDetailFromResponse(response));
    }

    if (!response.body) {
      const rawContent = await this.readResponseText(response);
      const content = this.parseResponseText(rawContent);

      if (content) {
        yield { model: input.model, content };
      }
      return;
    }

    yield* this.readResponseStream(response.body, input.model);
  }

  private async *readResponseStream(
    body: ReadableStream<Uint8Array>,
    model: string,
  ): AsyncGenerator<AiProviderTextDelta> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const content = this.parseResponseLine(line.trim());
          if (content) {
            yield { model, content };
          }
        }
      }

      buffer += decoder.decode();
      const tail = buffer.trim();
      if (tail) {
        const content = this.parseResponseLine(tail);
        if (content) {
          yield { model, content };
        }
      }
    } catch (error) {
      if (isTimeoutError(error)) throw new AiProviderTimeoutException();
      if (error instanceof AiProviderBadOutputException) throw error;
      throw new AiProviderUnavailableException(getProviderErrorDetail(error));
    } finally {
      reader.releaseLock();
    }
  }

  private async readResponseText(response: Response) {
    try {
      return await response.text();
    } catch (error) {
      if (isTimeoutError(error)) throw new AiProviderTimeoutException();
      throw new AiProviderUnavailableException(getProviderErrorDetail(error));
    }
  }

  private parseResponseText(rawContent: string) {
    try {
      return parseDoubaoStreamText(rawContent).trim();
    } catch {
      throw new AiProviderBadOutputException();
    }
  }

  private parseResponseLine(line: string) {
    if (!line) return undefined;

    try {
      return parseDoubaoStreamLine(line);
    } catch {
      throw new AiProviderBadOutputException();
    }
  }

  private async sendRequest(input: AiProviderCompleteInput) {
    const fetcher = this.fetchImpl ?? fetch;

    try {
      return await fetcher(getDoubaoChatCompletionsUrl(input.baseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${input.apiKey}`,
        },
        body: JSON.stringify(
          buildDoubaoChatCompletionsBody({
            model: input.model,
            messages: input.messages,
          }),
        ),
        signal: createTimeoutSignal(input.timeoutMs),
      });
    } catch (error) {
      if (isTimeoutError(error)) throw new AiProviderTimeoutException();
      throw new AiProviderUnavailableException(getProviderErrorDetail(error));
    }
  }
}

function createTimeoutSignal(timeoutMs: number) {
  if (typeof AbortSignal === "undefined" || typeof AbortSignal.timeout !== "function") {
    return undefined;
  }

  return AbortSignal.timeout(timeoutMs);
}

function isTimeoutError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|timed out|abort/i.test(message);
}

export function getProviderErrorDetail(error: unknown): AiProviderErrorDetail {
  if (!error || typeof error !== "object") return {};

  const record = error as Record<string, unknown>;
  const detail: AiProviderErrorDetail = {};
  const status = record.status;
  const code = record.code;
  const message = record.message;

  if (typeof status === "number") detail.providerStatus = status;
  if (typeof code === "string") detail.providerCode = code;
  if (typeof message === "string") detail.providerMessage = message.slice(0, 500);

  return detail;
}

async function getProviderErrorDetailFromResponse(response: Response): Promise<AiProviderErrorDetail> {
  const bodyText = await response.text();
  const detail: AiProviderErrorDetail = { providerStatus: response.status };

  if (!bodyText) {
    return detail;
  }

  detail.providerMessage = extractProviderMessage(bodyText).slice(0, 500);
  const code = extractProviderCode(bodyText);

  if (code) {
    detail.providerCode = code.slice(0, 120);
  }

  return detail;
}

function extractProviderMessage(bodyText: string) {
  try {
    const value = JSON.parse(bodyText) as unknown;
    if (!value || typeof value !== "object") return bodyText;

    const record = value as Record<string, unknown>;
    const error = record.error;

    if (typeof record.message === "string") return record.message;
    if (error && typeof error === "object" && typeof (error as Record<string, unknown>).message === "string") {
      return (error as Record<string, string>).message;
    }

    return bodyText;
  } catch {
    return bodyText;
  }
}

function extractProviderCode(bodyText: string) {
  try {
    const value = JSON.parse(bodyText) as unknown;
    if (!value || typeof value !== "object") return undefined;

    const record = value as Record<string, unknown>;
    const error = record.error;

    if (typeof record.code === "string") return record.code;
    if (error && typeof error === "object" && typeof (error as Record<string, unknown>).code === "string") {
      return (error as Record<string, string>).code;
    }

    return undefined;
  } catch {
    return undefined;
  }
}
