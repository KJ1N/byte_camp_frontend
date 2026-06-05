import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseArticleGenerationJson } from "./ai-gateway.prompts";

describe("parseArticleGenerationJson", () => {
  it("accepts model output with literal line breaks inside bodyText", () => {
    const article = parseArticleGenerationJson(`{
  "title": "普通人用 AI 建立写作流程",
  "outline": ["确定主题", "生成初稿", "人工编辑"],
  "bodyText": "第一段正文。

第二段正文。"
}`);

    assert.equal(article.title, "普通人用 AI 建立写作流程");
    assert.deepEqual(article.outline, ["确定主题", "生成初稿", "人工编辑"]);
    assert.equal(article.bodyText, "第一段正文。\n\n第二段正文。");
  });
});
