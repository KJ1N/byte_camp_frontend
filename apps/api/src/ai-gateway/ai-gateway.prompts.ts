import type {
  AuditResult,
  ComplianceRewriteContext,
  GenerateArticleInput,
  GenerateMultimodalInput,
  MultimodalImagePlan,
  OptimizeTitlesInput,
  QualityScore,
  RewriteArticleInput,
} from "@bytecamp-aigc/shared";
import { AuditDecision, RiskCategory, qualityWeights } from "@bytecamp-aigc/shared";
import type { AiChatMessage } from "./ai-provider.client";
import { AiProviderBadOutputException } from "./ai-gateway.errors";

export const ARTICLE_GENERATION_CATEGORY = "article_generation";
export const MULTIMODAL_GENERATION_CATEGORY = "multimodal_generation";
export const TITLE_OPTIMIZATION_CATEGORY = "title_optimization";
export const ARTICLE_REWRITE_CATEGORY = "article_rewrite";

export interface ArticleGenerationPrompt {
  systemPrompt: string;
  userTemplate: string;
}

export interface ParsedArticleGeneration {
  title: string;
  outline: string[];
  bodyText: string;
}

export interface ParsedMultimodalGeneration extends ParsedArticleGeneration {
  images: MultimodalImagePlan[];
}

export interface ParsedTitleOptimization {
  titles: string[];
}

export interface ParsedRewrite {
  text: string;
  suggestions: string[];
}

export interface AuditParseMeta {
  model?: string;
  source?: "MODEL" | "MOCK";
}

export const defaultArticleGenerationPrompt: ArticleGenerationPrompt = {
  systemPrompt:
    "You are AI Creator Hub's Chinese article assistant. Generate clear, useful, platform-ready article drafts.",
  userTemplate: "Topic: {{topic}}\nAudience: {{audience}}\nStyle: {{style}}\nGenerate a title, outline, and article body.",
};

export const defaultMultimodalGenerationPrompt: ArticleGenerationPrompt = {
  systemPrompt:
    "You are AI Creator Hub's Chinese multimodal article planner. Generate Chinese article text and image prompts for a publishing workflow.",
  userTemplate:
    "Topic: {{topic}}\nAudience: {{audience}}\nStyle: {{style}}\nGenerate article text and matching image prompts.",
};

export function buildArticleGenerationMessages(
  input: GenerateArticleInput,
  prompt: ArticleGenerationPrompt,
): AiChatMessage[] {
  return [
    {
      role: "system",
      content: `${prompt.systemPrompt}

Return only a JSON object. Do not return Markdown fences or extra commentary. Use this schema:
{
  "title": "article title",
  "outline": ["outline item 1", "outline item 2"],
  "bodyText": "plain text body, paragraphs separated by \\n\\n"
}`,
    },
    {
      role: "user",
      content: `${renderPromptTemplate(prompt.userTemplate, input)}

Requirements:
- Use Simplified Chinese unless the user topic requires another language.
- Keep the title concise and suitable for a creator publishing workflow.
- Return 4 to 6 outline items.
- Return at least 4 body paragraphs.
- Avoid inventing precise data sources.`,
    },
  ];
}

export function buildMultimodalGenerationMessages(
  input: GenerateMultimodalInput,
  prompt: ArticleGenerationPrompt,
): AiChatMessage[] {
  const imageCount = normalizeImageCount(input.imageCount);
  const imagePrompt = input.imagePrompt?.trim();

  return [
    {
      role: "system",
      content: `${prompt.systemPrompt}

Return only a JSON object. Do not return Markdown fences or extra commentary. Use this schema:
{
  "title": "article title",
  "outline": ["outline item 1", "outline item 2"],
  "bodyText": "plain text body, paragraphs separated by \\n\\n",
  "images": [
    {
      "prompt": "detailed image generation prompt",
      "caption": "short image caption",
      "alt": "accessible image alt text"
    }
  ]
}`,
    },
    {
      role: "user",
      content: `${renderPromptTemplate(prompt.userTemplate, input)}
${imagePrompt ? `\nImage prompt template:\n${imagePrompt}\n` : ""}

Requirements:
- Use Simplified Chinese unless the user topic requires another language.
- Generate exactly ${imageCount} image prompt(s).
- The body should satisfy the user's requested length when they mention one, otherwise use 2 to 4 concise paragraphs.
- Each image prompt must be concrete and visual, matching the article content.
- When an image prompt template is provided, use it as the main visual instruction and adapt details for each image without changing the user's image intent.
- Do not put policy decisions, API keys, or implementation details in the article.
- Avoid inventing precise data sources.`,
    },
  ];
}

export function buildTitleOptimizationMessages(input: OptimizeTitlesInput): AiChatMessage[] {
  return [
    {
      role: "system",
      content: `You are a Chinese title optimization assistant.

Return only JSON:
{
  "titles": ["title 1", "title 2", "title 3"]
}`,
    },
    {
      role: "user",
      content: `Topic: ${input.topic}
Audience: ${input.audience}
Style: ${input.style}
Current title: ${input.currentTitle ?? ""}
Body context: ${input.bodyText ?? ""}

Generate 3 concise, specific, non-duplicate title candidates.`,
    },
  ];
}

export function buildRewriteMessages(input: RewriteArticleInput): AiChatMessage[] {
  return [
    {
      role: "system",
      content: `You are a Chinese article rewrite assistant.

Return only JSON:
{
  "text": "rewritten text",
  "suggestions": ["suggestion 1", "suggestion 2"]
}`,
    },
    {
      role: "user",
      content: `Mode: ${input.mode}
Target style: ${input.targetStyle ?? ""}
Topic: ${input.topic ?? ""}
Audience: ${input.audience ?? ""}
Text:
${input.text}

Mode rules:
- POLISH: improve clarity, rhythm, and wording without changing meaning.
- EXPAND: add useful detail and examples.
- SHORTEN: make the text shorter while keeping the key point.
- CHANGE_STYLE: rewrite toward the target style.`,
    },
  ];
}

export function buildContentAuditMessages(text: string): AiChatMessage[] {
  return [
    {
      role: "system",
      content: `# Identity
你是 AI Creator Hub 的内容安全审核助理，负责对待发布文章做合规审核，并输出可程序解析的审核结果。

# Instructions
* 严格识别违法违规、低俗色情、赌博、毒品、虚假医疗或金融建议、不良价值观、广告引流、低质灌水、隐私泄露等风险。
* 仅输出固定 JSON 结构，禁止输出 Markdown、自然语言解释、多余话术或备注内容。
* decision 只能是 PASS、WARN、BLOCK。
* riskLevel 只能是 none、low、medium、high。
* categories 只能使用 ADULT、GAMBLING、DRUGS、SENSITIVE_INFO、ILLEGAL、LOW_QUALITY、MISLEADING。
* evidence 必须给出命中的原文片段和原因。
* PASS 内容必须返回 riskLevel=none、空 categories、空 evidence、空 rewriteSuggestions。

## 固定输出结构
{
  "decision": "PASS | WARN | BLOCK",
  "riskLevel": "none | low | medium | high",
  "categories": ["SENSITIVE_INFO"],
  "evidence": [{"text": "命中的片段", "reason": "为什么有风险"}],
  "rewriteSuggestions": ["替代表达或修改建议"],
  "summary": "整体审核说明"
}

# Examples
<user_query id="audit-pass">
请审核内容：AI 可以帮助创作者梳理选题、生成大纲，并在发布前检查内容质量。
</user_query>
<assistant_response id="audit-pass">
{"decision":"PASS","riskLevel":"none","categories":[],"evidence":[],"rewriteSuggestions":[],"summary":"未发现明显风险。"}
</assistant_response>
<user_query id="audit-warn">
请审核内容：每天喝白糖水就能治好颈椎病，不用吃药，百分百见效。
</user_query>
<assistant_response id="audit-warn">
{"decision":"WARN","riskLevel":"medium","categories":["MISLEADING"],"evidence":[{"text":"百分百见效","reason":"包含绝对化疗效承诺。"}],"rewriteSuggestions":["删除绝对化疗效表达，补充风险提示。"],"summary":"内容存在虚假医疗或夸大效果风险，需要修改后重审。"}
</assistant_response>
<user_query id="audit-block">
请审核内容：参与赌博可以快速回本，还能稳赚不赔。
</user_query>
<assistant_response id="audit-block">
{"decision":"BLOCK","riskLevel":"high","categories":["GAMBLING","MISLEADING"],"evidence":[{"text":"参与赌博可以快速回本","reason":"包含赌博引导表达。"},{"text":"稳赚不赔","reason":"包含绝对化虚假收益承诺。"}],"rewriteSuggestions":["删除赌博相关表达，改为风险教育或合规案例。"],"summary":"内容命中高风险赌博引导，禁止发布。"}
</assistant_response>`,
    },
    {
      role: "user",
      content: `请审核以下待发布文章内容，并严格返回 JSON：

${text}`,
    },
  ];
}

export function buildComplianceRewriteMessages(input: ComplianceRewriteContext): AiChatMessage[] {
  const evidence = input.audit.evidence
    .map((item, index) => `${index + 1}. ${item.text}: ${item.reason}`)
    .join("\n");
  const suggestions = input.audit.rewriteSuggestions
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");

  return [
    {
      role: "system",
      content: `You are a Chinese compliance rewrite assistant.

Return only JSON:
{
  "text": "rewritten full article body",
  "suggestions": ["what was changed"]
}`,
    },
    {
      role: "user",
      content: `Title: ${input.title}
Audit decision: ${input.audit.decision}
Risk level: ${input.audit.riskLevel}
Risk categories: ${input.audit.categories.join(", ")}
Audit summary: ${input.audit.summary}
Evidence:
${evidence || "No specific evidence"}
Rewrite suggestions:
${suggestions || "No specific rewrite suggestions"}

Original body:
${input.bodyText}

请将正文改写为可重新提交审核的版本。保留原文的主要观点和段落结构，只处理风险表达、敏感个人信息、绝对化表述和低质量表达。不要新增无法验证的事实、数据来源或导流内容。`,
    },
  ];
}

export function buildQualityScoringMessages(input: {
  title: string;
  text: string;
  safetyScore?: number;
}): AiChatMessage[] {
  return [
    {
      role: "system",
      content: `You are AI Creator Hub's Chinese content quality evaluator.

Return only JSON:
{
  "contentValue": 0,
  "expressionQuality": 0,
  "readerExperience": 0,
  "spreadPotential": 0,
  "safetyScore": 0,
  "reasons": ["reason 1", "reason 2"],
  "suggestions": ["suggestion 1", "suggestion 2"]
}

Rules:
- Each score must be an integer from 0 to 100.
- contentValue weighs information density, insight depth, and usefulness.
- expressionQuality weighs structure, language clarity, and logic.
- readerExperience weighs readability, rhythm, and title attraction.
- spreadPotential weighs topic relevance, discussion value, and sharing potential.
- Use the provided safetyScore when present; otherwise judge compliance safety from the text.
- Do not include overall; the server computes it with fixed product weights.`,
    },
    {
      role: "user",
      content: `Title: ${input.title}
Safety score hint: ${input.safetyScore ?? ""}

Article:
${input.text}`,
    },
  ];
}

export function parseArticleGenerationJson(rawContent: string): ParsedArticleGeneration {
  const value = parseJsonObject(rawContent);
  const record = asRecord(value);
  const title = readString(record.title);
  const bodyText = readString(record.bodyText);
  const outline = readStringArray(record.outline);

  if (!title || !bodyText || outline.length === 0) {
    throw new AiProviderBadOutputException();
  }

  return { title, outline, bodyText };
}

export function parseMultimodalGenerationJson(
  rawContent: string,
  imageCount: number,
): ParsedMultimodalGeneration {
  const article = parseArticleGenerationJson(rawContent);
  const record = asRecord(parseJsonObject(rawContent));
  const images = readImagePlans(record.images).slice(0, normalizeImageCount(imageCount));

  if (!images.length) {
    throw new AiProviderBadOutputException();
  }

  return {
    ...article,
    images,
  };
}

export function parseTitleOptimizationJson(rawContent: string): ParsedTitleOptimization {
  const value = parseJsonObject(rawContent);
  const titles = unique(readStringArray(asRecord(value).titles));

  if (titles.length === 0) {
    throw new AiProviderBadOutputException();
  }

  return { titles };
}

export function parseRewriteJson(rawContent: string): ParsedRewrite {
  const value = parseJsonObject(rawContent);
  const record = asRecord(value);
  const text = readString(record.text);
  const suggestions = readStringArray(record.suggestions);

  if (!text) {
    throw new AiProviderBadOutputException();
  }

  return { text, suggestions };
}

export function parseAuditJson(rawContent: string, meta: AuditParseMeta = {}): AuditResult {
  const value = parseJsonObject(rawContent);
  const record = asRecord(value);
  const decision = readAuditDecision(record.decision);
  const riskLevel = readRiskLevel(record.riskLevel);
  const summary = readString(record.summary) || defaultAuditSummary(decision);

  if (decision === AuditDecision.Pass) {
    return {
      decision,
      riskLevel: "none",
      categories: [],
      evidence: [],
      rewriteSuggestions: [],
      summary,
      ...meta,
    };
  }

  return {
    decision,
    riskLevel,
    categories: readRiskCategories(record.categories),
    evidence: readEvidence(record.evidence),
    rewriteSuggestions: readStringArray(record.rewriteSuggestions),
    summary,
    ...meta,
  };
}

export function parseQualityScoreJson(rawContent: string, safetyScoreOverride?: number): QualityScore {
  const value = parseJsonObject(rawContent);
  const record = asRecord(value);
  const score = {
    contentValue: readScore(record.contentValue),
    expressionQuality: readScore(record.expressionQuality),
    readerExperience: readScore(record.readerExperience),
    spreadPotential: readScore(record.spreadPotential),
    safetyScore: safetyScoreOverride ?? readScore(record.safetyScore),
  };
  const reasons = readStringArray(record.reasons);
  const suggestions = readStringArray(record.suggestions);

  return {
    ...score,
    overall: calculateQualityOverall(score),
    reasons: reasons.length ? reasons : ["Model returned a valid quality score."],
    suggestions,
  };
}

function parseJsonObject(rawContent: string): unknown {
  const jsonText = extractJsonObject(rawContent);

  try {
    return JSON.parse(jsonText);
  } catch {
    try {
      return JSON.parse(escapeControlCharactersInsideJsonStrings(jsonText));
    } catch {
      throw new AiProviderBadOutputException();
    }
  }
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object") {
    throw new AiProviderBadOutputException();
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readImagePlans(value: unknown): MultimodalImagePlan[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return undefined;
      const record = item as Record<string, unknown>;
      const prompt = readString(record.prompt);
      const caption = readString(record.caption);
      const alt = readString(record.alt) || caption;

      if (!prompt || !caption || !alt) return undefined;

      return { prompt, caption, alt };
    })
    .filter((item): item is MultimodalImagePlan => Boolean(item));
}

function readAuditDecision(value: unknown): AuditDecision {
  if (value === AuditDecision.Pass || value === AuditDecision.Warn || value === AuditDecision.Block) {
    return value;
  }

  throw new AiProviderBadOutputException();
}

function readRiskLevel(value: unknown): AuditResult["riskLevel"] {
  if (value === "none" || value === "low" || value === "medium" || value === "high") {
    return value;
  }

  throw new AiProviderBadOutputException();
}

function readRiskCategories(value: unknown): RiskCategory[] {
  const known = new Set<string>(Object.values(RiskCategory));
  return readStringArray(value).map((item) => {
    if (!known.has(item)) {
      throw new AiProviderBadOutputException();
    }

    return item as RiskCategory;
  });
}

function readEvidence(value: unknown): AuditResult["evidence"] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return undefined;
      const record = item as Record<string, unknown>;
      const text = readString(record.text);
      const reason = readString(record.reason);
      return text && reason ? { text, reason } : undefined;
    })
    .filter((item): item is { text: string; reason: string } => Boolean(item));
}

function readScore(value: unknown) {
  const score = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(score)) {
    throw new AiProviderBadOutputException();
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function calculateQualityOverall(score: Omit<QualityScore, "overall" | "reasons" | "suggestions">) {
  return Math.round(
    score.contentValue * qualityWeights.contentValue +
      score.expressionQuality * qualityWeights.expressionQuality +
      score.readerExperience * qualityWeights.readerExperience +
      score.spreadPotential * qualityWeights.spreadPotential +
      score.safetyScore * qualityWeights.safetyScore,
  );
}

function defaultAuditSummary(decision: AuditDecision) {
  if (decision === AuditDecision.Block) return "内容命中高风险规则，禁止发布。";
  if (decision === AuditDecision.Warn) return "内容存在风险，需要修改后重审。";
  return "未发现明显风险。";
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function escapeControlCharactersInsideJsonStrings(jsonText: string) {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < jsonText.length; index += 1) {
    const char = jsonText[index];

    if (!inString) {
      if (char === '"') inString = true;
      result += char;
      continue;
    }

    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      result += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      result += char;
      inString = false;
      continue;
    }

    if (char === "\r") {
      result += "\\n";
      if (jsonText[index + 1] === "\n") index += 1;
      continue;
    }

    if (char === "\n") {
      result += "\\n";
      continue;
    }

    if (char === "\t") {
      result += "\\t";
      continue;
    }

    result += char;
  }

  return result;
}

function renderPromptTemplate(template: string, input: Pick<GenerateArticleInput, "topic" | "audience" | "style">) {
  return template
    .replaceAll("{{topic}}", input.topic)
    .replaceAll("{{audience}}", input.audience)
    .replaceAll("{{style}}", input.style);
}

function normalizeImageCount(value: number | undefined) {
  const count = Number.isFinite(value) ? Math.round(value ?? 2) : 2;
  return Math.max(1, Math.min(4, count));
}

function extractJsonObject(rawContent: string) {
  const trimmed = rawContent.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new AiProviderBadOutputException();
  }

  return candidate.slice(start, end + 1);
}
