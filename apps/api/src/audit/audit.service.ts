import { Injectable } from "@nestjs/common";
import { AuditDecision, RiskCategory, type AuditResult } from "@bytecamp-aigc/shared";

interface AuditRule {
  pattern: RegExp;
  decision: AuditDecision.Warn | AuditDecision.Block;
  riskLevel: "medium" | "high";
  category: RiskCategory;
  reason: string;
  suggestion: string;
}

const auditRules: AuditRule[] = [
  {
    pattern: /赌博|博彩|赌场/,
    decision: AuditDecision.Block,
    riskLevel: "high",
    category: RiskCategory.Gambling,
    reason: "命中赌博或博彩引导表达，发布风险高。",
    suggestion: "删除赌博相关表达，改为中性的风险提示或合规案例。",
  },
  {
    pattern: /毒品|违禁品/,
    decision: AuditDecision.Block,
    riskLevel: "high",
    category: RiskCategory.Drugs,
    reason: "命中毒品或违禁品相关表达，禁止发布。",
    suggestion: "删除违禁品相关内容，避免任何引导、交易或使用描述。",
  },
  {
    pattern: /违法犯罪|犯罪教程|绕过监管/,
    decision: AuditDecision.Block,
    riskLevel: "high",
    category: RiskCategory.Illegal,
    reason: "命中违法犯罪引导表达，禁止发布。",
    suggestion: "改为合法合规的风险教育表达，不提供操作细节。",
  },
  {
    pattern: /身份证号|手机号|银行卡|住址/,
    decision: AuditDecision.Warn,
    riskLevel: "medium",
    category: RiskCategory.SensitiveInfo,
    reason: "内容可能包含敏感个人信息，需要脱敏或删除。",
    suggestion: "将个人信息替换为脱敏表达，例如“某用户”或“尾号后四位”。",
  },
  {
    pattern: /低俗|露骨|色情/,
    decision: AuditDecision.Warn,
    riskLevel: "medium",
    category: RiskCategory.Adult,
    reason: "内容包含低俗或露骨表达，需要调整措辞。",
    suggestion: "删除刺激性描述，改为客观、中性的内容说明。",
  },
  {
    pattern: /绝对稳赚|包治百病|医疗偏方|稳赚不赔/,
    decision: AuditDecision.Warn,
    riskLevel: "medium",
    category: RiskCategory.Misleading,
    reason: "内容可能包含绝对化、医疗或金融误导表达。",
    suggestion: "补充来源和风险提示，避免承诺收益或疗效。",
  },
];

@Injectable()
export class AuditService {
  async checkText(text: string): Promise<AuditResult> {
    const matchedRules = auditRules.filter((rule) => rule.pattern.test(text));

    return {
      decision: this.getDecision(matchedRules),
      riskLevel: this.getRiskLevel(matchedRules),
      categories: [...new Set(matchedRules.map((rule) => rule.category))],
      evidence: matchedRules.map((rule) => ({
        text: this.extractEvidenceText(text, rule.pattern),
        reason: rule.reason,
      })),
      rewriteSuggestions: [...new Set(matchedRules.map((rule) => rule.suggestion))],
      summary: this.getSummary(matchedRules),
    };
  }

  private getDecision(rules: AuditRule[]) {
    if (rules.some((rule) => rule.decision === AuditDecision.Block)) return AuditDecision.Block;
    if (rules.length) return AuditDecision.Warn;
    return AuditDecision.Pass;
  }

  private getRiskLevel(rules: AuditRule[]) {
    if (rules.some((rule) => rule.riskLevel === "high")) return "high";
    if (rules.length) return "medium";
    return "none";
  }

  private getSummary(rules: AuditRule[]) {
    const decision = this.getDecision(rules);

    if (decision === AuditDecision.Block) {
      return "内容命中高风险规则，禁止发布，请修改后重新审核。";
    }

    if (decision === AuditDecision.Warn) {
      return "内容存在中风险，需要修改后重审。";
    }

    return "未发现明显风险。";
  }

  private extractEvidenceText(text: string, pattern: RegExp) {
    const match = text.match(pattern);
    if (!match?.index) return match?.[0] ?? text.slice(0, 80);

    const start = Math.max(0, match.index - 12);
    const end = Math.min(text.length, match.index + match[0].length + 12);
    return text.slice(start, end);
  }
}
