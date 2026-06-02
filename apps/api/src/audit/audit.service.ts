import { Injectable } from "@nestjs/common";
import { AuditDecision, type AuditResult } from "@bytecamp-aigc/shared";

@Injectable()
export class AuditService {
  async checkText(text: string): Promise<AuditResult> {
    const hasRisk = /赌博|毒品|身份证号|低俗/.test(text);

    return {
      decision: hasRisk ? AuditDecision.Warn : AuditDecision.Pass,
      riskLevel: hasRisk ? "medium" : "none",
      categories: [],
      evidence: hasRisk ? [{ text, reason: "命中演示风险词，需要进一步确认" }] : [],
      rewriteSuggestions: hasRisk ? ["请删除敏感表达，改为更中性的事实描述。"] : [],
      summary: hasRisk ? "内容存在中风险，需要修改后重审。" : "未发现明显风险。",
    };
  }
}

