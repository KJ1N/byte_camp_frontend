import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { GeneratedArticleDraft, GenerateArticleInput, RichTextDocument } from "@bytecamp-aigc/shared";

@Injectable()
export class AiGatewayService {
  constructor(private readonly config: ConfigService) {}

  async generateArticleDraft(input: GenerateArticleInput): Promise<GeneratedArticleDraft> {
    const model = this.config.get<string>("AI_MODEL") ?? "mock-model";
    const outline = ["趋势背景", "核心机会", "实践方法", "风险与边界", "行动建议"];
    const bodyText = [
      `面向${input.audience}，${input.topic}正在从单点工具升级为完整的内容生产链路。`,
      `在${input.style}风格下，创作者可以先用 AI 形成标题、大纲和正文，再通过人工编辑补充真实案例、观点和表达节奏。`,
      "真正有价值的创作流程不是把内容完全交给模型，而是让模型负责初稿、改写和校对，让创作者负责判断、取舍和最终表达。",
      "发布前仍需要经过内容安全审核和质量评分，确保文章既有可读性，也符合平台规则。",
    ].join("\n\n");
    const body = this.toRichTextDocument([
      `围绕「${input.topic}」的创作方向`,
      ...bodyText.split("\n\n"),
      "下一步建议：补充一个具体案例，并用更明确的行动建议收束全文。",
    ]);

    return {
      model,
      title: `${input.topic}：创作者需要知道的 5 个变化`,
      outline,
      bodyText,
      body,
    };
  }

  private toRichTextDocument(paragraphs: string[]): RichTextDocument {
    return {
      type: "doc",
      content: paragraphs.map((text) => ({
        type: "paragraph",
        content: [{ type: "text", text }],
      })),
    };
  }
}
