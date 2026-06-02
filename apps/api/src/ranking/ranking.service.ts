import { Injectable } from "@nestjs/common";
import { rankingWeights } from "@bytecamp-aigc/shared";

@Injectable()
export class RankingService {
  calculate(input: {
    qualityScore: number;
    views: number;
    likes: number;
    favorites: number;
    hoursSincePublish: number;
  }) {
    const hotScore = input.views + input.likes * 4 + input.favorites * 6;
    const freshnessScore = 100 / (1 + input.hoursSincePublish / 12);
    const feedbackScore = input.likes + input.favorites;

    return Math.round(
      input.qualityScore * rankingWeights.qualityScore +
        hotScore * rankingWeights.hotScore +
        freshnessScore * rankingWeights.freshnessScore +
        feedbackScore * rankingWeights.feedbackScore,
    );
  }
}

