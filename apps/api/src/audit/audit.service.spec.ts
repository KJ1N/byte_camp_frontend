import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuditDecision, RiskCategory } from "@bytecamp-aigc/shared";
import { AuditService } from "./audit.service";

describe("AuditService", () => {
  function createService() {
    const calls: string[] = [];
    const service = new AuditService({
      auditContent: async (text: string) => {
        calls.push(text);

        if (/赌博/.test(text)) {
          return {
            decision: AuditDecision.Block,
            riskLevel: "high",
            categories: [RiskCategory.Gambling],
            evidence: [{ text: "赌博", reason: "包含赌博引导表达" }],
            rewriteSuggestions: ["删除赌博相关表达"],
            summary: "内容命中高风险规则，禁止发布。",
            source: "MOCK",
          };
        }

        if (/身份证号|手机号/.test(text)) {
          return {
            decision: AuditDecision.Warn,
            riskLevel: "medium",
            categories: [RiskCategory.SensitiveInfo],
            evidence: [{ text: "身份证号和手机号", reason: "包含敏感个人信息" }],
            rewriteSuggestions: ["删除或脱敏个人信息"],
            summary: "内容需要修改后重新审核。",
            source: "MOCK",
          };
        }

        return {
          decision: AuditDecision.Pass,
          riskLevel: "none",
          categories: [],
          evidence: [],
          rewriteSuggestions: [],
          summary: "未发现明显风险。",
          source: "MOCK",
        };
      },
    } as never);

    return { service, calls };
  }

  it("blocks high-risk gambling content before publishing", async () => {
    const { service, calls } = createService();

    const result = await service.checkText("这篇文章诱导读者参与赌博并承诺快速回本。");

    assert.equal(calls.length, 1);
    assert.match(calls[0], /赌博/);
    assert.equal(result.decision, AuditDecision.Block);
    assert.equal(result.riskLevel, "high");
    assert.ok(result.categories.includes(RiskCategory.Gambling));
    assert.ok(result.evidence.length > 0);
    assert.ok(result.rewriteSuggestions.length > 0);
  });

  it("warns for medium-risk sensitive personal information", async () => {
    const { service, calls } = createService();

    const result = await service.checkText("案例里包含身份证号和手机号，需要发布前处理。");

    assert.equal(calls.length, 1);
    assert.equal(result.decision, AuditDecision.Warn);
    assert.equal(result.riskLevel, "medium");
    assert.ok(result.categories.includes(RiskCategory.SensitiveInfo));
    assert.ok(result.summary.includes("修改"));
  });

  it("passes normal creator education content", async () => {
    const { service, calls } = createService();

    const result = await service.checkText("AI 可以帮助创作者梳理选题、生成大纲，并在发布前检查内容质量。");

    assert.equal(calls.length, 1);
    assert.equal(result.decision, AuditDecision.Pass);
    assert.equal(result.riskLevel, "none");
    assert.deepEqual(result.categories, []);
    assert.deepEqual(result.evidence, []);
  });
});
