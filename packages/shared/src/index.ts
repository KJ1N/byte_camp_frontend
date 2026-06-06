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

export enum ArticleStatus {
  Published = "PUBLISHED",
  Withdrawn = "WITHDRAWN",
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

const lineNodeTypes = new Set(["paragraph", "heading"]);

export function richTextToPlainText(doc: RichTextDocument): string {
  return doc.content
    .flatMap((node) => richTextNodeToLines(node))
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function richTextNodeToLines(node: RichTextNode): string[] {
  if (node.text) return [node.text];

  const childLines = (node.content ?? []).flatMap((child) => richTextNodeToLines(child));

  if (lineNodeTypes.has(node.type)) {
    const line = childLines.join("").trim();
    return line ? [line] : [];
  }

  return childLines;
}

export interface GenerateArticleInput {
  topic: string;
  audience: string;
  style: string;
  promptId?: string;
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

export interface PromptTemplateSummary {
  id: string;
  name: string;
  category: string;
  owner: PromptOwner;
  isStarter: boolean;
  description?: string;
}

export interface ListPromptsResponse {
  items: PromptTemplateSummary[];
}

export interface OptimizeTitlesInput {
  topic: string;
  audience: string;
  style: string;
  currentTitle?: string;
  bodyText?: string;
}

export interface OptimizeTitlesResponse {
  model: string;
  titles: string[];
}

export enum RewriteMode {
  Polish = "POLISH",
  Expand = "EXPAND",
  Shorten = "SHORTEN",
  ChangeStyle = "CHANGE_STYLE",
}

export interface RewriteArticleInput {
  text: string;
  mode: RewriteMode;
  targetStyle?: string;
  topic?: string;
  audience?: string;
}

export interface RewriteArticleResponse {
  model: string;
  text: string;
  suggestions: string[];
}

export type AiStreamEvent =
  | { event: "meta"; data: { model: string } }
  | { event: "title"; data: { text: string; index?: number; partial?: boolean } }
  | { event: "outline"; data: { items: string[] } }
  | { event: "body-delta"; data: { text: string } }
  | { event: "text-delta"; data: { text: string } }
  | { event: "suggestion"; data: { text: string } }
  | { event: "done"; data: Record<string, unknown> }
  | { event: "error"; data: { message: string } };

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

export interface RestoreDraftVersionInput {
  versionId: string;
}

export interface RestoreDraftVersionResponse extends DraftDetail {
  restoredFromVersion: number;
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

export interface AuditCheckInput {
  draftId: string;
}

export interface AuditCheckResponse {
  recordId: string;
  result: AuditResult;
  createdAt: string;
}

export interface ScoringArticleInput {
  draftId: string;
}

export interface ScoringArticleResponse extends QualityScore {
  scoreId: string;
  createdAt: string;
}

export interface PublishArticleResponse {
  articleId?: string;
  status: "PUBLISHED" | "BLOCKED" | "NEEDS_REVISION";
  audit: AuditCheckResponse;
  score: ScoringArticleResponse;
  message: string;
}

export interface ArticleDetail {
  id: string;
  draftId: string;
  title: string;
  body: RichTextDocument;
  summary: string;
  status: ArticleStatus;
  author: {
    id: string;
    nickname: string;
  };
  publishedAt: string;
  updatedAt: string;
  latestAudit?: AuditCheckResponse;
  latestScore?: ScoringArticleResponse;
  engagement?: ArticleEngagementStats;
  ranking?: RankingScoreBreakdown;
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

export enum EngagementEventType {
  View = "VIEW",
  Like = "LIKE",
  Favorite = "FAVORITE",
}

export interface ArticleEngagementStats {
  views: number;
  likes: number;
  favorites: number;
}

export interface RankingScoreBreakdown {
  qualityScore: number;
  hotScore: number;
  freshnessScore: number;
  feedbackScore: number;
  rankScore: number;
}

export interface ArticleListItem {
  id: string;
  title: string;
  summary: string;
  author: {
    id: string;
    nickname: string;
  };
  publishedAt: string;
  qualityScore: number;
  engagement: ArticleEngagementStats;
  ranking: RankingScoreBreakdown;
}

export interface CursorPageResponse<T> {
  items: T[];
  nextCursor?: string;
}

export interface CreateEngagementEventInput {
  type: EngagementEventType;
  userKey?: string;
}

export interface CreateEngagementEventResponse {
  articleId: string;
  type: EngagementEventType;
  stats: ArticleEngagementStats;
}
