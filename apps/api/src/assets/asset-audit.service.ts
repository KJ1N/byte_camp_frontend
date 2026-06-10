import { BadGatewayException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AssetAuditStatus, RiskCategory, type AssetAuditResult } from "@bytecamp-aigc/shared";

type AssetAuditMode = "auto" | "mock" | "live";

const maxImageBytes = 5 * 1024 * 1024;
const maxImageRedirects = 5;
const maxImageDownloadAttempts = 3;
const defaultImageDownloadTimeoutMs = 10_000;

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

  async auditGeneratedImage(input: {
    url: string;
    alt?: string;
    caption?: string;
    prompt?: string;
  }): Promise<AssetAuditResult> {
    const riskText = [input.url, input.alt, input.caption, input.prompt].filter(Boolean).join(" ");
    const filenameRisk = this.findFilenameRisk(riskText);
    if (filenameRisk) return filenameRisk;

    if (!/^https?:\/\//i.test(input.url)) {
      return {
        decision: AssetAuditStatus.Warn,
        riskLevel: "medium",
        categories: [RiskCategory.LowQuality],
        evidence: [{ text: input.url || "空图片地址", reason: "生成图片缺少可审核的 http/https 地址。" }],
        summary: "生成图片地址不可用，需要重新生成或移除后再发布。",
        model: "vision-audit-rules",
        source: "MOCK",
      };
    }

    const mode = this.getMode();
    if (mode === "mock") return this.auditMockGeneratedImage(input);
    if (mode === "auto" && !this.hasLiveConfig()) return this.auditMockGeneratedImage(input);

    const downloaded = await this.downloadImage(input.url);
    return this.auditLiveImageData({
      buffer: downloaded.buffer,
      mimeType: downloaded.mimeType,
      description: [
        "审核生成图片。",
        `alt: ${input.alt ?? ""}`,
        `caption: ${input.caption ?? ""}`,
        `prompt: ${input.prompt ?? ""}`,
      ].join("\n"),
    });
  }

  downloadGeneratedImage(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
    return this.downloadImage(url);
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

  private auditMockGeneratedImage(input: {
    url: string;
    alt?: string;
    caption?: string;
    prompt?: string;
  }): AssetAuditResult {
    const text = [input.alt, input.caption, input.prompt, input.url].filter(Boolean).join(" ");
    const risk = this.findFilenameRisk(text);
    if (risk) return risk;

    if (/warn/i.test(text)) {
      return {
        decision: AssetAuditStatus.Warn,
        riskLevel: "medium",
        categories: [RiskCategory.LowQuality],
        evidence: [{ text, reason: "mock 视觉审核命中 warn 描述。" }],
        summary: "生成图片存在中低风险，建议确认后发布。",
        model: "vision-audit-mock",
        source: "MOCK",
      };
    }

    return {
      decision: AssetAuditStatus.Passed,
      riskLevel: "none",
      categories: [],
      evidence: [],
      summary: "生成图片审核通过。",
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
    return this.auditLiveImageData({
      buffer: input.buffer,
      mimeType: input.mimeType,
      description: `审核图片素材：${input.filename}`,
    });
  }

  private async auditLiveImageData(input: {
    buffer: Buffer;
    mimeType: string;
    description: string;
  }): Promise<AssetAuditResult> {
    const apiKey = this.readConfig("AI_API_KEY");
    const baseUrl = this.getLiveAuditUrl();
    const model = this.getLiveAuditModel();
    console.log('[图片审核] 目标接口地址：', baseUrl);
    console.log('[图片审核] Base64长度：', input.buffer.toString("base64")?.length || 0);

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
              "你是内容安全视觉审核模型。只返回 JSON 对象，严格格式为：decision 只能是 PASSED/WARN/BLOCKED；riskLevel 只能是 none/low/medium/high；categories 必须是字符串数组，元素只能是 ADULT/GAMBLING/DRUGS/SENSITIVE_INFO/ILLEGAL/LOW_QUALITY/MISLEADING；evidence 必须是对象数组，每项包含 text 和 reason；summary 必须是字符串。",
          },
          {
            role: "user",
            content: [
              { type: "text", text: input.description },
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
    let value: unknown;

    try {
      value = JSON.parse(content) as unknown;
    } catch {
      throw new BadGatewayException("视觉审核模型返回了无效 JSON。");
    }

    if (!value || typeof value !== "object") {
      throw new BadGatewayException("视觉审核模型返回了无效结果。");
    }

    const parsed = value as Record<string, unknown>;
    const decision = typeof parsed.decision === "string" ? parsed.decision : "";
    if (!["PASSED", "WARN", "BLOCKED"].includes(decision)) {
      throw new BadGatewayException("视觉审核模型返回了无效裁决。");
    }

    const riskLevelValue = typeof parsed.riskLevel === "string" ? parsed.riskLevel : "";
    const riskLevel = ["none", "low", "medium", "high"].includes(riskLevelValue)
      ? (parsed.riskLevel as AssetAuditResult["riskLevel"])
      : "medium";

    return {
      decision: decision as AssetAuditStatus,
      riskLevel,
      categories: this.readRiskCategories(parsed.categories),
      evidence: this.readEvidence(parsed.evidence),
      summary:
        typeof parsed.summary === "string" && parsed.summary.trim()
          ? parsed.summary.trim()
          : "视觉审核已完成。",
      model,
      source: "MODEL",
    };
  }

  private async downloadImage(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
    let currentUrl = new URL(url);
    const timeoutMs = this.readPositiveInt("ASSET_AUDIT_DOWNLOAD_TIMEOUT_MS", defaultImageDownloadTimeoutMs);

    for (let redirectCount = 0; redirectCount <= maxImageRedirects; redirectCount += 1) {
      this.assertDownloadUrlAllowed(currentUrl);
      const response = await this.fetchImageWithRetry(currentUrl, timeoutMs);

      if (this.isRedirect(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirectCount === maxImageRedirects) {
          throw new BadGatewayException("图片地址重定向次数过多。");
        }

        currentUrl = new URL(location, currentUrl);
        continue;
      }

      if (!response.ok) {
        throw new BadGatewayException(`图片下载失败，响应状态为 ${response.status}。`);
      }

      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > maxImageBytes) {
        throw new BadGatewayException("图片超过 5MB，无法完成审核。");
      }

      const buffer = await this.readImageResponse(response);
      const mimeType = this.detectImageMimeType(buffer);
      if (!mimeType) {
        throw new BadGatewayException("图片响应格式不受支持。");
      }

      return { buffer, mimeType };
    }

    throw new BadGatewayException("图片地址重定向次数过多。");
  }

  private async fetchImageWithRetry(url: URL, timeoutMs: number): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxImageDownloadAttempts; attempt += 1) {
      const signal =
        typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(timeoutMs)
          : undefined;

      try {
        const response = await fetch(url, {
          method: "GET",
          headers: { Accept: "image/png,image/jpeg,image/webp,image/gif" },
          redirect: "manual",
          signal,
        });

        if (!this.shouldRetryDownloadStatus(response.status) || attempt === maxImageDownloadAttempts) {
          return response;
        }

        await response.body?.cancel();
        lastError = new Error(`图片下载返回可重试状态 ${response.status}`);
      } catch (error) {
        lastError = error;
      }
    }

    const message = lastError instanceof Error ? lastError.message : "";
    throw new BadGatewayException(
      /timeout|timed out|abort/i.test(message) ? "图片下载超时，请重试。" : "图片下载失败，请重试。",
    );
  }

  private shouldRetryDownloadStatus(status: number) {
    return status === 408 || status === 425 || status === 429 || status >= 500;
  }

  private async readImageResponse(response: Response): Promise<Buffer> {
    if (!response.body) throw new BadGatewayException("图片响应为空。");

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    while (true) {
      const result = await reader.read();
      if (result.done) break;

      totalBytes += result.value.byteLength;
      if (totalBytes > maxImageBytes) {
        await reader.cancel();
        throw new BadGatewayException("图片超过 5MB，无法完成审核。");
      }

      chunks.push(Buffer.from(result.value));
    }

    if (!totalBytes) throw new BadGatewayException("图片响应为空。");
    return Buffer.concat(chunks, totalBytes);
  }

  private detectImageMimeType(buffer: Buffer): string | undefined {
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return "image/png";
    }

    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return "image/jpeg";
    }

    const header = buffer.subarray(0, 12).toString("ascii");
    if (header.startsWith("GIF87a") || header.startsWith("GIF89a")) return "image/gif";
    if (header.startsWith("RIFF") && header.slice(8, 12) === "WEBP") return "image/webp";
    return undefined;
  }

  private assertDownloadUrlAllowed(url: URL) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new BadGatewayException("图片地址仅支持 http 或 https。");
    }

    if (this.isTrustedApiOrigin(url)) return;

    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (this.isPrivateHostname(hostname)) {
      throw new BadGatewayException("图片地址不可访问。");
    }
  }

  private isTrustedApiOrigin(url: URL) {
    const trustedOrigins = new Set<string>();
    const apiBaseUrl = this.readConfig("NEXT_PUBLIC_API_BASE_URL");
    if (apiBaseUrl) {
      try {
        trustedOrigins.add(new URL(apiBaseUrl).origin);
      } catch {
        // Ignore invalid optional configuration and continue with the current API port.
      }
    }

    const port = this.readPositiveInt("PORT", 3001);
    trustedOrigins.add(`http://localhost:${port}`);
    trustedOrigins.add(`http://127.0.0.1:${port}`);

    return trustedOrigins.has(url.origin);
  }

  private isPrivateHostname(hostname: string) {
    if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
    if (
      hostname === "::1" ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd") ||
      hostname.startsWith("fe80:")
    ) {
      return true;
    }

    const parts = hostname.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return false;
    }

    const [first, second] = parts;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19)) ||
      first >= 224
    );
  }

  private isRedirect(status: number) {
    return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
  }

  private readRiskCategories(value: unknown): RiskCategory[] {
    const values = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(/[,，]/)
        : [];
    const known = new Set<string>(Object.values(RiskCategory));

    return values
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item): item is RiskCategory => known.has(item));
  }

  private readEvidence(value: unknown): AssetAuditResult["evidence"] {
    if (!Array.isArray(value)) return [];

    return value
      .map((item) => {
        if (!item || typeof item !== "object") return undefined;
        const record = item as Record<string, unknown>;
        const text = typeof record.text === "string" ? record.text.trim() : "";
        const reason = typeof record.reason === "string" ? record.reason.trim() : "";
        return text || reason ? { text, reason } : undefined;
      })
      .filter((item): item is { text: string; reason: string } => Boolean(item));
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

  private readPositiveInt(key: string, fallback: number) {
    const value = Number(this.readConfig(key));
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }

  private isPlaceholder(value: string | undefined) {
    return !value || value.startsWith("replace-with-") || value.includes("your-");
  }
}
