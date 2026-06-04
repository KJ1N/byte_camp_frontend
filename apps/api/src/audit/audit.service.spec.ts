import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuditDecision, RiskCategory } from "@bytecamp-aigc/shared";
import { AuditService } from "./audit.service";

describe("AuditService", () => {
  const service = new AuditService();

  it("blocks high-risk gambling content before publishing", async () => {
    const result = await service.checkText("这篇文章诱导读者参与赌博并承诺快速回本。");

    assert.equal(result.decision, AuditDecision.Block);
    assert.equal(result.riskLevel, "high");
    assert.ok(result.categories.includes(RiskCategory.Gambling));
    assert.ok(result.evidence.length > 0);
    assert.ok(result.rewriteSuggestions.length > 0);
  });

  it("warns for medium-risk sensitive personal information", async () => {
    const result = await service.checkText("案例里包含身份证号和手机号，需要发布前处理。");

    assert.equal(result.decision, AuditDecision.Warn);
    assert.equal(result.riskLevel, "medium");
    assert.ok(result.categories.includes(RiskCategory.SensitiveInfo));
    assert.ok(result.summary.includes("修改"));
  });

  it("passes normal creator education content", async () => {
    const result = await service.checkText("AI 可以帮助创作者梳理选题、生成大纲，并在发布前检查内容质量。");

    assert.equal(result.decision, AuditDecision.Pass);
    assert.equal(result.riskLevel, "none");
    assert.deepEqual(result.categories, []);
    assert.deepEqual(result.evidence, []);
  });
});

