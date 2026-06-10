import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { AssetAuditStatus, RiskCategory } from "@bytecamp-aigc/shared";
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

  it("downloads a generated image and sends it to the model as a base64 data URL", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const image = createPngBuffer();
    globalThis.fetch = createGeneratedImageAuditFetch(calls, image);
    const service = new AssetAuditService(
      createConfig({
        ASSET_AUDIT_MODE: "live",
        AI_API_KEY: "test-api-key",
        AI_BASE_URL: "https://provider.example/custom/vision-audit",
        ASSET_VISION_MODEL: "vision-model",
      }),
    );

    const result = await service.auditGeneratedImage({
      url: "https://images.example/cover.png",
      alt: "通胀类型示意图",
      caption: "四类通胀",
    });
    const request = JSON.parse(String(calls[1].init.body)) as {
      messages: Array<{ content: string | Array<{ type: string; image_url?: { url: string } }> }>;
    };
    const userContent = request.messages[1].content as Array<{ type: string; image_url?: { url: string } }>;

    assert.equal(result.decision, AssetAuditStatus.Passed);
    assert.equal(calls[0].url, "https://images.example/cover.png");
    assert.equal(calls[0].init.method, "GET");
    assert.equal(calls[1].url, "https://provider.example/custom/vision-audit");
    assert.equal(userContent[1].image_url?.url, `data:image/png;base64,${image.toString("base64")}`);
  });

  it("follows the trusted local asset redirect before sending base64 to the model", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const image = createPngBuffer();
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      if (calls.length === 1) {
        return new Response(null, {
          status: 302,
          headers: { Location: "https://cdn.example/assets/cover.png" },
        });
      }
      if (calls.length === 2) {
        return new Response(new Uint8Array(image), {
          status: 200,
          headers: { "Content-Type": "image/png", "Content-Length": String(image.length) },
        });
      }
      return createAuditResponse();
    }) as typeof fetch;
    const service = new AssetAuditService(
      createConfig({
        ASSET_AUDIT_MODE: "live",
        AI_API_KEY: "test-api-key",
        AI_BASE_URL: "https://provider.example/custom/vision-audit",
        ASSET_VISION_MODEL: "vision-model",
        NEXT_PUBLIC_API_BASE_URL: "http://localhost:3201",
      }),
    );

    const result = await service.auditGeneratedImage({
      url: "http://localhost:3201/assets/asset-1/view",
    });

    assert.equal(result.decision, AssetAuditStatus.Passed);
    assert.deepEqual(
      calls.map((call) => call.url),
      [
        "http://localhost:3201/assets/asset-1/view",
        "https://cdn.example/assets/cover.png",
        "https://provider.example/custom/vision-audit",
      ],
    );
  });

  it("normalizes a string category and ignores non-array evidence", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = createGeneratedImageAuditFetch(calls, createPngBuffer(), {
      decision: "WARN",
      riskLevel: "medium",
      categories: "LOW_QUALITY",
      evidence: { text: "图片", reason: "清晰度一般" },
      summary: "需要确认图片质量",
    });
    const service = new AssetAuditService(
      createConfig({
        ASSET_AUDIT_MODE: "live",
        AI_API_KEY: "test-api-key",
        AI_BASE_URL: "https://provider.example/custom/vision-audit",
        ASSET_VISION_MODEL: "vision-model",
      }),
    );

    const result = await service.auditGeneratedImage({
      url: "https://images.example/cover.png",
    });

    assert.equal(result.decision, AssetAuditStatus.Warn);
    assert.deepEqual(result.categories, [RiskCategory.LowQuality]);
    assert.deepEqual(result.evidence, []);
  });

  it("rejects downloaded images larger than 5MB before reading the response body", async () => {
    globalThis.fetch = (async () =>
      new Response(new Uint8Array(createPngBuffer()), {
        status: 200,
        headers: { "Content-Type": "image/png", "Content-Length": String(5 * 1024 * 1024 + 1) },
      })) as typeof fetch;
    const service = new AssetAuditService(
      createConfig({
        ASSET_AUDIT_MODE: "live",
        AI_API_KEY: "test-api-key",
        AI_BASE_URL: "https://provider.example/custom/vision-audit",
        ASSET_VISION_MODEL: "vision-model",
      }),
    );

    await assert.rejects(
      service.auditGeneratedImage({ url: "https://images.example/large.png" }),
      /图片超过 5MB/,
    );
  });

  it("retries a transient asset download failure before sending the image as base64", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const image = createPngBuffer();
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      if (calls.length === 1) throw new TypeError("fetch failed");
      if (calls.length === 2) {
        return new Response(new Uint8Array(image), {
          status: 200,
          headers: { "Content-Type": "image/png", "Content-Length": String(image.length) },
        });
      }
      return createAuditResponse();
    }) as typeof fetch;
    const service = new AssetAuditService(
      createConfig({
        ASSET_AUDIT_MODE: "live",
        AI_API_KEY: "test-api-key",
        AI_BASE_URL: "https://provider.example/custom/vision-audit",
        ASSET_VISION_MODEL: "vision-model",
      }),
    );

    const result = await service.auditGeneratedImage({
      url: "https://cdn.example/assets/cover.png",
    });

    assert.equal(result.decision, AssetAuditStatus.Passed);
    assert.deepEqual(
      calls.map((call) => call.url),
      [
        "https://cdn.example/assets/cover.png",
        "https://cdn.example/assets/cover.png",
        "https://provider.example/custom/vision-audit",
      ],
    );
  });

  it("retries a temporary 503 response but does not retry a permanent 404 response", async () => {
    let transientCalls = 0;
    globalThis.fetch = (async (url: string | URL | Request) => {
      if (String(url) === "https://provider.example/custom/vision-audit") {
        return createAuditResponse();
      }

      transientCalls += 1;
      if (transientCalls === 1) return new Response(null, { status: 503 });
      return new Response(new Uint8Array(createPngBuffer()), { status: 200 });
    }) as typeof fetch;
    const service = new AssetAuditService(
      createConfig({
        ASSET_AUDIT_MODE: "live",
        AI_API_KEY: "test-api-key",
        AI_BASE_URL: "https://provider.example/custom/vision-audit",
        ASSET_VISION_MODEL: "vision-model",
      }),
    );

    const result = await service.auditGeneratedImage({ url: "https://cdn.example/assets/cover.png" });

    assert.equal(result.decision, AssetAuditStatus.Passed);
    assert.equal(transientCalls, 2);

    let permanentCalls = 0;
    globalThis.fetch = (async () => {
      permanentCalls += 1;
      return new Response(null, { status: 404 });
    }) as typeof fetch;

    await assert.rejects(
      service.auditGeneratedImage({ url: "https://cdn.example/assets/missing.png" }),
      /响应状态为 404/,
    );
    assert.equal(permanentCalls, 1);
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

function createGeneratedImageAuditFetch(
  calls: Array<{ url: string; init: RequestInit }>,
  image: Buffer,
  auditResult: Record<string, unknown> = {
    decision: "PASSED",
    riskLevel: "none",
    categories: [],
    evidence: [],
    summary: "audit passed",
  },
) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (calls.length === 1) {
      return new Response(new Uint8Array(image), {
        status: 200,
        headers: { "Content-Type": "image/png", "Content-Length": String(image.length) },
      });
    }
    return createAuditResponse(auditResult);
  }) as typeof fetch;
}

function createAuditResponse(
  auditResult: Record<string, unknown> = {
    decision: "PASSED",
    riskLevel: "none",
    categories: [],
    evidence: [],
    summary: "audit passed",
  },
) {
  return new Response(
    JSON.stringify({
      model: "vision-audit-live",
      choices: [{ message: { content: JSON.stringify(auditResult) } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function createPngBuffer() {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
}
