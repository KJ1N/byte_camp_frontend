import type {
  ComplianceRewriteContext,
  GenerateArticleInput,
  OptimizeTitlesInput,
  RewriteArticleInput,
} from "@bytecamp-aigc/shared";
import type { AiChatMessage } from "./ai-provider.client";
import { AiProviderBadOutputException } from "./ai-gateway.errors";

export const ARTICLE_GENERATION_CATEGORY = "article_generation";
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

export interface ParsedTitleOptimization {
  titles: string[];
}

export interface ParsedRewrite {
  text: string;
  suggestions: string[];
}

export const defaultArticleGenerationPrompt: ArticleGenerationPrompt = {
  systemPrompt:
    "You are AI Creator Hub's Chinese article assistant. Generate clear, useful, platform-ready article drafts.",
  userTemplate: "Topic: {{topic}}\nAudience: {{audience}}\nStyle: {{style}}\nGenerate a title, outline, and article body.",
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

function renderPromptTemplate(template: string, input: GenerateArticleInput) {
  return template
    .replaceAll("{{topic}}", input.topic)
    .replaceAll("{{audience}}", input.audience)
    .replaceAll("{{style}}", input.style);
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
