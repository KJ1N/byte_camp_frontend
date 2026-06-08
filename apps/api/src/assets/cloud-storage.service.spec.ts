import { createHash, createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { CloudStorageService } from "./cloud-storage.service";

const originalFetch = globalThis.fetch;

describe("CloudStorageService", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("uploads to Aliyun OSS and returns a signed private-bucket read URL", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init: init ?? {} });
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    const service = new CloudStorageService(createConfig({
      ASSET_STORAGE_MODE: "s3",
      ASSET_ENDPOINT: "https://oss-cn-shanghai.aliyuncs.com",
      ASSET_BUCKET: "kjin",
      ASSET_REGION: "cn-shanghai",
      ASSET_ACCESS_KEY_ID: "test-access-key",
      ASSET_SECRET_ACCESS_KEY: "test-secret",
    }));

    const result = await service.uploadObject({
      key: "assets/user-1/cover.png",
      body: Buffer.from("image-bytes"),
      contentType: "image/png",
    });

    assert.equal(result.key, "assets/user-1/cover.png");
    const readUrl = new URL(result.cdnUrl);
    assert.equal(readUrl.origin + readUrl.pathname, "https://cdn.example.com/assets/user-1/cover.png");
    assert.equal(readUrl.searchParams.get("OSSAccessKeyId"), "test-access-key");
    const expires = readUrl.searchParams.get("Expires");
    assert.ok(expires);
    assert.equal(
      readUrl.searchParams.get("Signature"),
      createExpectedAliyunReadSignature(expires),
    );
    assert.equal(requests[0].url, "https://kjin.oss-cn-shanghai.aliyuncs.com/assets/user-1/cover.png");
    const headers = requests[0].init.headers as Record<string, string>;
    assert.equal(headers["Content-Type"], "image/png");
    assert.equal(headers["x-oss-content-sha256"], "UNSIGNED-PAYLOAD");
    assert.match(headers["x-oss-date"], /^\d{8}T\d{6}Z$/);
    assert.equal(headers["x-oss-object-acl"], undefined);
    const dateStamp = headers["x-oss-date"].slice(0, 8);
    assert.equal(
      headers.Authorization,
      `OSS4-HMAC-SHA256 Credential=test-access-key/${dateStamp}/cn-shanghai/oss/aliyun_v4_request,Signature=${createExpectedAliyunSignature(headers["x-oss-date"])}`,
    );
  });
});

function createConfig(values: Record<string, string>) {
  return {
    get: (key: string) => values[key],
  } as never;
}

function createExpectedAliyunSignature(ossDate: string) {
  const dateStamp = ossDate.slice(0, 8);
  const canonicalHeaders = [
    "content-type:image/png",
    "x-oss-content-sha256:UNSIGNED-PAYLOAD",
    `x-oss-date:${ossDate}`,
    "",
  ].join("\n");
  const canonicalRequest = [
    "PUT",
    "/kjin/assets/user-1/cover.png",
    "",
    canonicalHeaders,
    "",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const scope = `${dateStamp}/cn-shanghai/oss/aliyun_v4_request`;
  const stringToSign = [
    "OSS4-HMAC-SHA256",
    ossDate,
    scope,
    createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");
  const dateKey = hmac(`aliyun_v4test-secret`, dateStamp);
  const regionKey = hmac(dateKey, "cn-shanghai");
  const serviceKey = hmac(regionKey, "oss");
  const signingKey = hmac(serviceKey, "aliyun_v4_request");
  return createHmac("sha256", signingKey).update(stringToSign).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function createExpectedAliyunReadSignature(expires: string) {
  const stringToSign = ["GET", "", "", expires, "/kjin/assets/user-1/cover.png"].join("\n");
  return createHmac("sha1", "test-secret").update(stringToSign).digest("base64");
}
