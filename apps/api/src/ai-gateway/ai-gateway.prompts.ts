import type { GenerateArticleInput } from "@bytecamp-aigc/shared";
import type { AiChatMessage } from "./ai-provider.client";
import { AiProviderBadOutputException } from "./ai-gateway.errors";

export const ARTICLE_GENERATION_CATEGORY = "article_generation";

export interface ArticleGenerationPrompt {
  systemPrompt: string;
  userTemplate: string;
}

export interface ParsedArticleGeneration {
  title: string;
  outline: string[];
  bodyText: string;
}

export const defaultArticleGenerationPrompt: ArticleGenerationPrompt = {
  systemPrompt:
    "你是 AI Creator Hub 的中文内容创作助手，擅长生成结构清晰、信息密度高、适合图文平台分发的文章初稿。",
  userTemplate: "请围绕主题 {{topic}}，面向 {{audience}}，用 {{style}} 风格生成标题、大纲和正文。",
};

export function buildArticleGenerationMessages(
  input: GenerateArticleInput,
  prompt: ArticleGenerationPrompt,
): AiChatMessage[] {
  return [
    {
      role: "system",
      content: `${prompt.systemPrompt}

你必须只返回 JSON object，不要返回 Markdown 代码块、解释文字或额外前后缀。JSON 字段固定为：
{
  "title": "文章标题",
  "outline": ["大纲要点 1", "大纲要点 2"],
  "bodyText": "正文纯文本，段落之间使用两个换行分隔"
}
注意：bodyText 必须是合法 JSON 字符串，段落换行请写成 \\n\\n，不要在字符串内部直接写真实换行。`,
    },
    {
      role: "user",
      content: `${renderPromptTemplate(prompt.userTemplate, input)}

补充要求：
- 文章使用简体中文。
- 标题控制在 16 到 32 个汉字附近。
- 大纲 4 到 6 条。
- 正文至少 4 段，适合保存为草稿后继续编辑。
- 不要编造具体数据来源。`,
    },
  ];
}

export function parseArticleGenerationJson(rawContent: string): ParsedArticleGeneration {
  const jsonText = extractJsonObject(rawContent);
  const value = parseModelJson(jsonText);

  if (!value || typeof value !== "object") {
    throw new AiProviderBadOutputException();
  }

  const record = value as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const bodyText = typeof record.bodyText === "string" ? record.bodyText.trim() : "";
  const outline = Array.isArray(record.outline)
    ? record.outline
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  if (!title || !bodyText || outline.length === 0) {
    throw new AiProviderBadOutputException();
  }

  return { title, outline, bodyText };
}

function parseModelJson(jsonText: string): unknown {
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

function escapeControlCharactersInsideJsonStrings(jsonText: string) {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < jsonText.length; index += 1) {
    const char = jsonText[index];

    if (!inString) {
      if (char === '"') {
        inString = true;
      }
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
      if (jsonText[index + 1] === "\n") {
        index += 1;
      }
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
