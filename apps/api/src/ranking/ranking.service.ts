import { Injectable } from "@nestjs/common";
import { rankingWeights, type RankingScoreBreakdown } from "@bytecamp-aigc/shared";

export interface RankableArticleInput {
  id: string;
  qualityScore: number;
  views: number;
  likes: number;
  favorites: number;
  publishedAt: Date;
}

export interface RankedArticleInput extends RankableArticleInput {
  ranking: RankingScoreBreakdown;
}

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

  calculateBreakdown(input: {
    qualityScore: number;
    views: number;
    likes: number;
    favorites: number;
    publishedAt: Date;
    now?: Date;
  }): RankingScoreBreakdown {
    const now = input.now ?? new Date();
    const hoursSincePublish = Math.max(0, (now.getTime() - input.publishedAt.getTime()) / 1000 / 60 / 60);
    const hotScore = input.views + input.likes * 4 + input.favorites * 6;
    const freshnessScore = Math.round(100 / (1 + hoursSincePublish / 12));
    const feedbackScore = input.likes + input.favorites;
    const rankScore = Math.round(
      input.qualityScore * rankingWeights.qualityScore +
        hotScore * rankingWeights.hotScore +
        freshnessScore * rankingWeights.freshnessScore +
        feedbackScore * rankingWeights.feedbackScore,
    );

    return {
      qualityScore: input.qualityScore,
      hotScore,
      freshnessScore,
      feedbackScore,
      rankScore,
    };
  }

  calculateHotRank(input: RankableArticleInput, now = new Date()) {
    const ranking = this.calculateBreakdown({ ...input, now });
    return Math.round(ranking.hotScore * 0.75 + ranking.freshnessScore * 0.25);
  }

  sortForFeed<T extends RankableArticleInput>(items: T[], now = new Date()) {
    return this.withRanking(items, now).sort(this.compareByCompositeRank);
  }

  sortForHot<T extends RankableArticleInput>(items: T[], now = new Date()) {
    return this.withRanking(items, now).sort((left, right) => {
      const hotDiff = this.calculateHotRank(right, now) - this.calculateHotRank(left, now);
      if (hotDiff !== 0) return hotDiff;
      return this.compareByCompositeRank(left, right);
    });
  }

  sortForTop<T extends RankableArticleInput>(items: T[], now = new Date()) {
    return this.withRanking(items, now).sort(this.compareByCompositeRank);
  }

  private withRanking<T extends RankableArticleInput>(items: T[], now: Date) {
    return items.map((item) => ({
      ...item,
      ranking: this.calculateBreakdown({ ...item, now }),
    }));
  }

  private compareByCompositeRank(left: RankedArticleInput, right: RankedArticleInput) {
    const rankDiff = right.ranking.rankScore - left.ranking.rankScore;
    if (rankDiff !== 0) return rankDiff;
    return right.publishedAt.getTime() - left.publishedAt.getTime();
  }
}
