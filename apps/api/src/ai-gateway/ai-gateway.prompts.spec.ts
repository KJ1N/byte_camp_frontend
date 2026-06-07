import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuditDecision, RiskCategory } from "@bytecamp-aigc/shared";
import {
  buildRewriteMessages,
  buildComplianceRewriteMessages,
  buildTitleOptimizationMessages,
  parseArticleGenerationJson,
  parseRewriteJson,
  parseTitleOptimizationJson,
} from "./ai-gateway.prompts";

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

describe("title optimization prompts", () => {
  it("builds messages with topic, audience, style, and current title", () => {
    const messages = buildTitleOptimizationMessages({
      topic: "AI writing",
      audience: "creators",
      style: "practical",
      currentTitle: "Old title",
      bodyText: "Article body",
    });

    assert.equal(messages.length, 2);
    assert.match(messages[1].content, /AI writing/);
    assert.match(messages[1].content, /creators/);
    assert.match(messages[1].content, /practical/);
    assert.match(messages[1].content, /Old title/);
  });

  it("parses unique non-empty title candidates", () => {
    const result = parseTitleOptimizationJson(
      JSON.stringify({
        titles: ["A better title", "A better title", " ", "Another better title"],
      }),
    );

    assert.deepEqual(result.titles, ["A better title", "Another better title"]);
  });
});

describe("rewrite prompts", () => {
  it("builds rewrite messages with the selected mode and target style", () => {
    const messages = buildRewriteMessages({
      text: "Draft paragraph",
      mode: "CHANGE_STYLE" as never,
      targetStyle: "news",
      topic: "AI writing",
      audience: "creators",
    });

    assert.equal(messages.length, 2);
    assert.match(messages[1].content, /Draft paragraph/);
    assert.match(messages[1].content, /CHANGE_STYLE/);
    assert.match(messages[1].content, /news/);
  });

  it("parses rewritten text and suggestions", () => {
    const result = parseRewriteJson(
      JSON.stringify({
        text: "Rewritten paragraph",
        suggestions: ["Add an example", "", "Make the ending clearer"],
      }),
    );

    assert.equal(result.text, "Rewritten paragraph");
    assert.deepEqual(result.suggestions, ["Add an example", "Make the ending clearer"]);
  });
});

describe("compliance rewrite prompts", () => {
  it("builds compliance rewrite messages with audit evidence and suggestions", () => {
    const messages = buildComplianceRewriteMessages({
      title: "AI 内容发布前检查",
      bodyText: "文章包含身份证号和手机号，需要发布前处理。",
      audit: {
        decision: AuditDecision.Warn,
        riskLevel: "medium",
        categories: [RiskCategory.SensitiveInfo],
        evidence: [{ text: "身份证号和手机号", reason: "包含敏感个人信息" }],
        rewriteSuggestions: ["删除或脱敏个人信息"],
        summary: "内容需要修改后重新审核。",
      },
    });

    assert.equal(messages.length, 2);
    assert.match(messages[0].content, /compliance rewrite assistant/i);
    assert.match(messages[1].content, /AI 内容发布前检查/);
    assert.match(messages[1].content, /SENSITIVE_INFO/);
    assert.match(messages[1].content, /身份证号和手机号/);
    assert.match(messages[1].content, /删除或脱敏个人信息/);
    assert.match(messages[1].content, /保留原文的主要观点和段落结构/);
  });
});
