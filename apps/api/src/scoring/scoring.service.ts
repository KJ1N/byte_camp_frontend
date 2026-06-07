import { Injectable, Optional } from "@nestjs/common";
import { qualityWeights, type QualityScore } from "@bytecamp-aigc/shared";
import { AiGatewayService } from "../ai-gateway/ai-gateway.service";

@Injectable()
export class ScoringService {
  constructor(@Optional() private readonly aiGatewayService?: AiGatewayService) {}

  async scoreArticle(input: { title: string; text: string; safetyScore?: number }): Promise<QualityScore> {
    if (this.aiGatewayService) {
      return this.aiGatewayService.scoreArticleQuality(input);
    }

    const base = Math.min(95, Math.max(60, Math.round(input.text.length / 20) + 65));
    const score = {
      contentValue: base,
      expressionQuality: base - 2,
      readerExperience: base - 4,
      spreadPotential: base - 8,
      safetyScore: input.safetyScore ?? 95,
    };

    const overall = Math.round(
      score.contentValue * qualityWeights.contentValue +
        score.expressionQuality * qualityWeights.expressionQuality +
        score.readerExperience * qualityWeights.readerExperience +
        score.spreadPotential * qualityWeights.spreadPotential +
        score.safetyScore * qualityWeights.safetyScore,
    );

    return {
      ...score,
      overall,
      reasons: ["内容结构完整", "适合进入发布前人工确认"],
      suggestions: ["补充真实案例", "优化标题的具体利益点"],
    };
  }
}
