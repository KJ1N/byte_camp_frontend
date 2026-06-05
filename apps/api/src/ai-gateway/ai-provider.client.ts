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
    let attempt = 0;

    while (true) {
      try {
        return await this.completeOnce(input);
      } catch (error) {
        if (error instanceof AiProviderBadOutputException) throw error;
        if (error instanceof AiProviderTimeoutException) throw error;
        if (error instanceof AiProviderUnavailableException && attempt >= input.maxRetries) throw error;
        if (!(error instanceof AiProviderUnavailableException)) throw error;
        attempt += 1;
      }
    }
  }

  private async completeOnce(input: AiProviderCompleteInput): Promise<AiProviderCompleteResponse> {
    const response = await this.sendRequest(input);

    if (!response.ok) {
      throw new AiProviderUnavailableException(await getProviderErrorDetailFromResponse(response));
    }

    const rawContent = await this.readResponseText(response);
    const content = this.parseResponseText(rawContent);

    if (!content) {
      throw new AiProviderBadOutputException("模型输出为空，请稍后重试。");
    }

    return {
      model: input.model,
      content,
    };
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
