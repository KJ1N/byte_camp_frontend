import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AiGatewayService {
  constructor(private readonly config: ConfigService) {}

  async generateArticleDraft(input: { topic: string; audience: string; style: string }) {
    const model = this.config.get<string>("AI_MODEL") ?? "mock-model";

    return {
      model,
      title: `${input.topic}：创作者需要知道的 5 个变化`,
      outline: ["趋势背景", "核心机会", "实践方法", "风险与边界", "行动建议"],
      body: `面向${input.audience}，这是一篇采用${input.style}风格生成的文章草稿。`,
    };
  }
}

