export enum DraftMode {
  Fast = "FAST",
  Fine = "FINE",
}

export enum DraftStatus {
  Draft = "DRAFT",
  Reviewing = "REVIEWING",
  Published = "PUBLISHED",
  Rejected = "REJECTED",
}

export enum PromptOwner {
  Platform = "PLATFORM",
  Private = "PRIVATE",
}

export enum AuditDecision {
  Pass = "PASS",
  Warn = "WARN",
  Block = "BLOCK",
}

export interface RichTextMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface RichTextNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: RichTextMark[];
  content?: RichTextNode[];
}

export interface RichTextDocument {
  type: "doc";
  content: RichTextNode[];
}

export interface GenerateArticleInput {
  topic: string;
  audience: string;
  style: string;
}

export interface GeneratedArticleDraft {
  model: string;
  title: string;
  outline: string[];
  bodyText: string;
  body: RichTextDocument;
}

export interface CreatorInspiration {
  id: string;
  topic: string;
  reason: string;
  category: string;
}

export interface CreatorInspirationsResponse {
  model: string;
  items: CreatorInspiration[];
}

export interface CreateDraftInput {
  title: string;
  body: RichTextDocument;
  mode?: DraftMode;
}

export interface UpdateDraftInput {
  title?: string;
  body?: RichTextDocument;
}

export interface DraftSummary {
  id: string;
  title: string;
  status: DraftStatus;
  mode: DraftMode;
  version: number;
  updatedAt: string;
  createdAt: string;
}

export interface DraftDetail extends DraftSummary {
  body: RichTextDocument;
}

export interface DraftVersionSummary {
  id: string;
  draftId: string;
  title: string;
  snapshot: RichTextDocument;
  version: number;
  createdAt: string;
}

export enum RiskCategory {
  Adult = "ADULT",
  Gambling = "GAMBLING",
  Drugs = "DRUGS",
  SensitiveInfo = "SENSITIVE_INFO",
  Illegal = "ILLEGAL",
  LowQuality = "LOW_QUALITY",
  Misleading = "MISLEADING",
}

export interface QualityScore {
  contentValue: number;
  expressionQuality: number;
  readerExperience: number;
  spreadPotential: number;
  safetyScore: number;
  overall: number;
  reasons: string[];
  suggestions: string[];
}

export interface AuditResult {
  decision: AuditDecision;
  riskLevel: "none" | "low" | "medium" | "high";
  categories: RiskCategory[];
  evidence: Array<{ text: string; reason: string }>;
  rewriteSuggestions: string[];
  summary: string;
}

export const qualityWeights = {
  contentValue: 0.3,
  expressionQuality: 0.25,
  readerExperience: 0.2,
  spreadPotential: 0.15,
  safetyScore: 0.1,
} as const;

export const rankingWeights = {
  qualityScore: 0.45,
  hotScore: 0.35,
  freshnessScore: 0.15,
  feedbackScore: 0.05,
} as const;
