import { BadGatewayException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AssetAuditStatus, RiskCategory, type AssetAuditResult } from "@bytecamp-aigc/shared";

type AssetAuditMode = "auto" | "mock" | "live";

const highRiskFilenameRules: Array<{ pattern: RegExp; category: RiskCategory; reason: string }> = [
  { pattern: /赌博|博彩|赌场/i, category: RiskCategory.Gambling, reason: "文件名命中赌博或博彩风险词。" },
  { pattern: /毒品|违禁品/i, category: RiskCategory.Drugs, reason: "文件名命中毒品或违禁品风险词。" },
  { pattern: /违法|犯罪/i, category: RiskCategory.Illegal, reason: "文件名命中违法犯罪风险词。" },
  { pattern: /色情|低俗|露骨/i, category: RiskCategory.Adult, reason: "文件名命中成人低俗风险词。" },
];

@Injectable()
export class AssetAuditService {
  constructor(private readonly config?: ConfigService) {}

  async auditImage(input: { buffer: Buffer; mimeType: string; filename: string }): Promise<AssetAuditResult> {
    const filenameRisk = this.findFilenameRisk(input.filename);
    if (filenameRisk) return filenameRisk;

    const mode = this.getMode();
    if (mode === "mock") return this.auditMockImage(input.filename);
    if (mode === "auto" && !this.hasLiveConfig()) return this.auditMockImage(input.filename);

    return this.auditLiveImage(input);
  }

  private auditMockImage(filename: string): AssetAuditResult {
    if (/block/i.test(filename)) {
      return {
        decision: AssetAuditStatus.Blocked,
        riskLevel: "high",
        categories: [RiskCategory.Illegal],
        evidence: [{ text: filename, reason: "mock 视觉审核命中 block 文件名。" }],
        summary: "视觉审核发现高风险图片，禁止上传。",
        model: "vision-audit-mock",
        source: "MOCK",
      };
    }

    if (/warn/i.test(filename)) {
      return {
        decision: AssetAuditStatus.Warn,
        riskLevel: "medium",
        categories: [RiskCategory.LowQuality],
        evidence: [{ text: filename, reason: "mock 视觉审核命中 warn 文件名。" }],
        summary: "视觉审核发现中低风险，允许上传但建议确认。",
        model: "vision-audit-mock",
        source: "MOCK",
      };
    }

    return {
      decision: AssetAuditStatus.Passed,
      riskLevel: "none",
      categories: [],
      evidence: [],
      summary: "视觉审核通过。",
      model: "vision-audit-mock",
      source: "MOCK",
    };
  }

  private findFilenameRisk(filename: string): AssetAuditResult | null {
    for (const rule of highRiskFilenameRules) {
      if (!rule.pattern.test(filename)) continue;

      return {
        decision: AssetAuditStatus.Blocked,
        riskLevel: "high",
        categories: [rule.category],
        evidence: [{ text: filename, reason: rule.reason }],
        summary: "文件名命中高风险规则，禁止上传。",
        model: "vision-audit-rules",
        source: "MOCK",
      };
    }

    return null;
  }

  private async auditLiveImage(input: { buffer: Buffer; mimeType: string; filename: string }): Promise<AssetAuditResult> {
    const apiKey = this.readConfig("AI_API_KEY");
    const baseUrl = this.getLiveAuditUrl();
    const model = this.getLiveAuditModel();

    if (!apiKey || !model || this.isPlaceholder(apiKey) || this.isPlaceholder(model)) {
      throw new ServiceUnavailableException("视觉审核模型未配置。");
    }

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "你是内容安全视觉审核模型。只返回 JSON，字段为 decision(PASSED/WARN/BLOCKED)、riskLevel、categories、evidence、summary。",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `审核图片素材：${input.filename}` },
              {
                type: "image_url",
                image_url: { url: `data:${input.mimeType};base64,${input.buffer.toString("base64")}` },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      throw new BadGatewayException("视觉审核模型调用失败。");
    }

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; model?: string };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new BadGatewayException("视觉审核模型返回为空。");

    return this.parseLiveAudit(content, payload.model ?? model);
  }

  private parseLiveAudit(content: string, model: string): AssetAuditResult {
    let parsed: {
      decision?: string;
      riskLevel?: string;
      categories?: string[];
      evidence?: Array<{ text?: string; reason?: string }>;
      summary?: string;
    };

    try {
      parsed = JSON.parse(content) as typeof parsed;
    } catch {
      throw new BadGatewayException("视觉审核模型返回了无效 JSON。");
    }

    if (!parsed.decision || !["PASSED", "WARN", "BLOCKED"].includes(parsed.decision)) {
      throw new BadGatewayException("视觉审核模型返回了无效裁决。");
    }

    const riskLevel = ["none", "low", "medium", "high"].includes(parsed.riskLevel ?? "")
      ? (parsed.riskLevel as AssetAuditResult["riskLevel"])
      : "medium";

    return {
      decision: parsed.decision as AssetAuditStatus,
      riskLevel,
      categories: (parsed.categories ?? []).filter((category): category is RiskCategory =>
        Object.values(RiskCategory).includes(category as RiskCategory),
      ),
      evidence: (parsed.evidence ?? []).map((item) => ({
        text: item.text ?? "",
        reason: item.reason ?? "",
      })),
      summary: parsed.summary || "视觉审核已完成。",
      model,
      source: "MODEL",
    };
  }

  private getMode(): AssetAuditMode {
    const mode = this.readConfig("ASSET_AUDIT_MODE");
    if (mode === "live" || mode === "mock") return mode;
    return "auto";
  }

  private getLiveAuditUrl() {
    return this.readConfig("AI_BASE_URL") || "https://api.openai.com/v1/chat/completions";
  }

  private getLiveAuditModel() {
    const visionModel = this.readConfig("ASSET_VISION_MODEL");
    if (!this.isPlaceholder(visionModel)) return visionModel;

    const sharedModel = this.readConfig("AI_MODEL");
    return this.isPlaceholder(sharedModel) ? undefined : sharedModel;
  }

  private hasLiveConfig() {
    return !this.isPlaceholder(this.readConfig("AI_API_KEY")) && Boolean(this.getLiveAuditModel());
  }

  private readConfig(key: string) {
    const value = this.config?.get<string>(key);
    return typeof value === "string" ? value.trim() : undefined;
  }

  private isPlaceholder(value: string | undefined) {
    return !value || value.startsWith("replace-with-") || value.includes("your-");
  }
}
