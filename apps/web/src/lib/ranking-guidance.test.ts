import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getRankingGuidance, getRankingGuidanceTitleBarCopy } from "./ranking-guidance.ts";

describe("ranking guidance", () => {
  it("explains hot and top ranking formulas for creators", () => {
    const hot = getRankingGuidance("hot");
    const top = getRankingGuidance("top");

    assert.equal(hot.title, "热点榜排序逻辑");
    assert.match(hot.algorithm, /阅读/);
    assert.match(hot.algorithm, /时间衰减/);
    assert.match(hot.creatorTip, /真实互动/);

    assert.equal(top.title, "爆文榜排序逻辑");
    assert.match(top.algorithm, /质量分/);
    assert.match(top.algorithm, /热度/);
    assert.match(top.creatorTip, /信息价值/);
  });

  it("builds title-bar copy for the content distribution explanation", () => {
    const hotCopy = getRankingGuidanceTitleBarCopy("hot");
    const topCopy = getRankingGuidanceTitleBarCopy("top");

    assert.equal(hotCopy.label, "内容分发说明");
    assert.match(hotCopy.description, /热点榜/);
    assert.match(hotCopy.description, /阅读/);
    assert.match(hotCopy.description, /真实互动/);

    assert.equal(topCopy.label, "内容分发说明");
    assert.match(topCopy.description, /爆文榜/);
    assert.match(topCopy.description, /质量分/);
    assert.match(topCopy.description, /反馈/);
  });
});
