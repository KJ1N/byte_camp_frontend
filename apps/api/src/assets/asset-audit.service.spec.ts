import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { AssetAuditStatus } from "@bytecamp-aigc/shared";
import { AssetAuditService } from "./asset-audit.service";

const originalFetch = globalThis.fetch;

describe("AssetAuditService", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("calls the configured AI_BASE_URL directly for live image audit", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = createAuditFetch(calls);
    const service = new AssetAuditService(
      createConfig({
        ASSET_AUDIT_MODE: "live",
        AI_API_KEY: "test-api-key",
        AI_BASE_URL: "https://provider.example/custom/vision-audit",
        ASSET_VISION_MODEL: "vision-model",
      }),
    );

    const result = await service.auditImage({
      buffer: Buffer.from("image-bytes"),
      mimeType: "image/png",
      filename: "cover.png",
    });

    assert.equal(result.decision, AssetAuditStatus.Passed);
    assert.equal(calls[0].url, "https://provider.example/custom/vision-audit");
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer test-api-key");
  });

  it("uses live model audit by default when AI credentials are configured", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = createAuditFetch(calls);
    const service = new AssetAuditService(
      createConfig({
        AI_API_KEY: "test-api-key",
        AI_BASE_URL: "https://provider.example/custom/vision-audit",
        AI_MODEL: "shared-vision-model",
      }),
    );

    const result = await service.auditImage({
      buffer: Buffer.from("image-bytes"),
      mimeType: "image/png",
      filename: "cover.png",
    });
    const body = JSON.parse(String(calls[0].init.body)) as { model: string };

    assert.equal(result.source, "MODEL");
    assert.equal(body.model, "shared-vision-model");
  });
});

function createConfig(values: Record<string, string>) {
  return {
    get: (key: string) => values[key],
  } as never;
}

function createAuditFetch(calls: Array<{ url: string; init: RequestInit }>) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(
      JSON.stringify({
        model: "vision-audit-live",
        choices: [
          {
            message: {
              content: JSON.stringify({
                decision: "PASSED",
                riskLevel: "none",
                categories: [],
                evidence: [],
                summary: "audit passed",
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
}
