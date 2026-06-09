import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { AiTokenUsage } from "./doubao-chat-format";

export type AiRequestFeature =
  | "article_generation"
  | "multimodal_generation"
  | "image_generation"
  | "title_optimization"
  | "article_rewrite"
  | "compliance_rewrite"
  | "content_audit"
  | "quality_scoring";

export type AiRequestProviderMode = "mock" | "live";

export interface AiRequestMetric {
  requestId: string;
  feature: AiRequestFeature;
  providerMode: AiRequestProviderMode;
  model: string;
  startedAt: number;
}

export interface AiRequestLogPayload {
  requestId: string;
  feature: AiRequestFeature;
  providerMode: AiRequestProviderMode;
  model: string;
  durationMs: number;
  tokenUsage: AiTokenUsage;
  status: "success" | "error";
  errorCode?: string;
}

@Injectable()
export class AiRequestLogger {
  private readonly logger = new Logger("AiGateway");

  log(payload: AiRequestLogPayload) {
    this.logger.log(JSON.stringify(payload));
  }
}

export function createAiRequestMetric(input: {
  feature: AiRequestFeature;
  providerMode: AiRequestProviderMode;
  model: string;
}): AiRequestMetric {
  return {
    requestId: randomUUID(),
    feature: input.feature,
    providerMode: input.providerMode,
    model: input.model,
    startedAt: Date.now(),
  };
}

export function createEmptyAiTokenUsage(): AiTokenUsage {
  return {
    totalTokens: null,
    promptTokens: null,
    completionTokens: null,
  };
}

export function mergeAiTokenUsage(current: AiTokenUsage, next?: AiTokenUsage): AiTokenUsage {
  if (!next) return current;

  return {
    totalTokens: next.totalTokens ?? current.totalTokens,
    promptTokens: next.promptTokens ?? current.promptTokens ?? null,
    completionTokens: next.completionTokens ?? current.completionTokens ?? null,
  };
}

export function finishAiRequestMetric(
  metric: AiRequestMetric,
  input: {
    status: "success" | "error";
    model?: string;
    tokenUsage?: AiTokenUsage;
    error?: unknown;
  },
): AiRequestLogPayload {
  return {
    requestId: metric.requestId,
    feature: metric.feature,
    providerMode: metric.providerMode,
    model: input.model ?? metric.model,
    durationMs: Math.max(0, Date.now() - metric.startedAt),
    tokenUsage: input.tokenUsage ?? createEmptyAiTokenUsage(),
    status: input.status,
    errorCode: input.status === "error" ? getAiRequestErrorCode(input.error) : undefined,
  };
}

function getAiRequestErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "UnknownError";

  const record = error as { constructor?: { name?: string }; getStatus?: () => number; name?: string };
  const status = typeof record.getStatus === "function" ? record.getStatus() : undefined;
  const name = record.constructor?.name || record.name || "Error";

  return typeof status === "number" ? `${name}:${status}` : name;
}
