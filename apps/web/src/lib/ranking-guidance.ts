export type RankingGuidanceKind = "hot" | "top";

export interface RankingGuidance {
  title: string;
  algorithm: string;
  creatorTip: string;
}

export interface RankingGuidanceTitleBarCopy {
  label: string;
  description: string;
}

const guidance: Record<RankingGuidanceKind, RankingGuidance> = {
  hot: {
    title: "热点榜排序逻辑",
    algorithm: "按阅读、点赞、收藏形成热度分，并叠加发布时间衰减；越新的真实互动越容易上榜。",
    creatorTip: "创作者应优先做清晰标题、热点切入和真实互动承接，避免只堆关键词。",
  },
  top: {
    title: "爆文榜排序逻辑",
    algorithm: "按质量分、热度、新鲜度和反馈分综合排序，质量分权重最高，热度负责放大传播表现。",
    creatorTip: "创作者应提高信息价值、表达质量和读者体验，再通过稳定更新获得持续反馈。",
  },
};

export function getRankingGuidance(kind: RankingGuidanceKind): RankingGuidance {
  return guidance[kind];
}

export function getRankingGuidanceTitleBarCopy(kind: RankingGuidanceKind): RankingGuidanceTitleBarCopy {
  const item = getRankingGuidance(kind);
  const tabName = kind === "hot" ? "热点榜" : "爆文榜";

  return {
    label: "内容分发说明",
    description: `${tabName}：${item.algorithm} ${item.creatorTip}`,
  };
}
