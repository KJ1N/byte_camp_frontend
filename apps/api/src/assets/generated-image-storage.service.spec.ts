import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GeneratedImageStorageService } from "./generated-image-storage.service";

describe("GeneratedImageStorageService", () => {
  it("downloads an AI image, stores it under the user namespace, and returns a stable API URL", async () => {
    const uploads: Array<{ key: string; body: Buffer; contentType: string }> = [];
    const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const service = new GeneratedImageStorageService(
      {
        get: (key: string) => (key === "PUBLIC_API_BASE_URL" ? "https://api.example.com/" : undefined),
      } as never,
      {
        downloadGeneratedImage: async (url: string) => {
          assert.equal(url, "https://provider.example/generated.jpeg");
          return { buffer: image, mimeType: "image/jpeg" };
        },
      } as never,
      {
        uploadObject: async (input: { key: string; body: Buffer; contentType: string }) => {
          uploads.push(input);
          return { key: input.key, cdnUrl: `https://cdn.example.com/${input.key}` };
        },
      } as never,
    );

    const result = await service.storeGeneratedImage("user-1", "https://provider.example/generated.jpeg");

    assert.equal(uploads.length, 1);
    assert.match(uploads[0].key, /^generated-images\/user-1\/[a-f0-9-]{36}\.jpg$/);
    assert.equal(uploads[0].body, image);
    assert.equal(uploads[0].contentType, "image/jpeg");
    assert.match(
      result.url,
      /^https:\/\/api\.example\.com\/assets\/generated\/user-1\/[a-f0-9-]{36}\.jpg\/view$/,
    );
  });

  it("builds a fresh signed read URL from a stable generated-image path", () => {
    const service = new GeneratedImageStorageService(
      { get: () => undefined } as never,
      {} as never,
      {
        getObjectUrl: (key: string) => `https://signed.example.com/${key}?signature=fresh`,
      } as never,
    );

    const url = service.getGeneratedImageReadUrl(
      "user-1",
      "123e4567-e89b-12d3-a456-426614174000.webp",
    );

    assert.equal(
      url,
      "https://signed.example.com/generated-images/user-1/123e4567-e89b-12d3-a456-426614174000.webp?signature=fresh",
    );
  });

  it("retries a transient OSS upload failure", async () => {
    let uploadAttempts = 0;
    const service = new GeneratedImageStorageService(
      {
        get: (key: string) => {
          if (key === "PUBLIC_API_BASE_URL") return "https://api.example.com";
          if (key === "GENERATED_IMAGE_UPLOAD_ATTEMPTS") return "3";
          return undefined;
        },
      } as never,
      {
        downloadGeneratedImage: async () => ({
          buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
          mimeType: "image/png",
        }),
      } as never,
      {
        uploadObject: async (input: { key: string }) => {
          uploadAttempts += 1;
          if (uploadAttempts < 2) throw new Error("temporary timeout");
          return { key: input.key, cdnUrl: `https://cdn.example.com/${input.key}` };
        },
      } as never,
    );

    const result = await service.storeGeneratedImage("user-1", "https://provider.example/generated.png");

    assert.equal(uploadAttempts, 2);
    assert.match(result.url, /\/assets\/generated\/user-1\/.+\.png\/view$/);
  });
});
