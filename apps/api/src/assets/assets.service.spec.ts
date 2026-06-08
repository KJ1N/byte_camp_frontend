import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { AssetAuditStatus, AssetKind } from "@bytecamp-aigc/shared";
import type { AssetAuditService } from "./asset-audit.service";
import { AssetsService, type UploadedAssetFile } from "./assets.service";
import type { CloudStorageService } from "./cloud-storage.service";

function createFile(overrides: Partial<UploadedAssetFile> = {}): UploadedAssetFile {
  return {
    originalname: "cover.png",
    mimetype: "image/png",
    size: 128_000,
    buffer: Buffer.from("image-bytes"),
    ...overrides,
  };
}

function createService(options: { auditDecision?: AssetAuditStatus; ownerId?: string } = {}) {
  const calls = {
    auditInputs: [] as Array<{ filename: string; mimeType: string }>,
    uploads: [] as Array<{ key: string; contentType: string }>,
    deletes: [] as string[],
    createdAssets: [] as Array<{ authorId: string; filename: string; url: string; auditStatus: string }>,
    objectUrls: [] as string[],
  };
  const assets = new Map<string, any>();
  const auditDecision = options.auditDecision ?? AssetAuditStatus.Passed;
  const ownerId = options.ownerId ?? "user-1";

  const prisma = {
    asset: {
      create: async ({ data }: { data: any }) => {
        const asset = {
          id: data.id,
          createdAt: new Date("2026-06-07T10:00:00.000Z"),
          ...data,
        };
        assets.set(asset.id, asset);
        calls.createdAssets.push(data);
        return asset;
      },
      findMany: async ({ where }: { where: { authorId: string } }) =>
        [...assets.values()].filter((asset) => asset.authorId === where.authorId),
      findUnique: async ({ where }: { where: { id: string } }) => assets.get(where.id) ?? null,
      delete: async ({ where }: { where: { id: string } }) => {
        const asset = assets.get(where.id);
        assets.delete(where.id);
        return asset;
      },
    },
  };
  const audit = {
    auditImage: async ({ filename, mimeType }: { filename: string; mimeType: string }) => {
      calls.auditInputs.push({ filename, mimeType });
      return {
        decision: auditDecision,
        riskLevel: auditDecision === AssetAuditStatus.Blocked ? "high" : "none",
        categories: [],
        evidence: [],
        summary: auditDecision === AssetAuditStatus.Blocked ? "视觉审核拦截" : "视觉审核通过",
        model: "vision-audit-mock",
        source: "MOCK",
      };
    },
  };
  const storage = {
    uploadObject: async ({ key, contentType }: { key: string; contentType: string }) => {
      calls.uploads.push({ key, contentType });
      return { key, cdnUrl: `https://cdn.example.com/${key}` };
    },
    deleteObject: async (key: string) => {
      calls.deletes.push(key);
    },
    getObjectUrl: (key: string) => {
      calls.objectUrls.push(key);
      return `https://cdn.example.com/${key}`;
    },
  };

  return {
    service: new AssetsService(
      prisma as never,
      audit as unknown as AssetAuditService,
      storage as unknown as CloudStorageService,
    ),
    calls,
    assets,
    ownerId,
  };
}

describe("AssetsService", () => {
  it("uploads a passed image to cloud storage and returns a CDN URL", async () => {
    const { service, calls } = createService();

    const result = await service.uploadAsset("user-1", createFile());

    assert.equal(result.asset.kind, AssetKind.Image);
    assert.equal(result.asset.auditStatus, AssetAuditStatus.Passed);
    assert.equal(result.asset.url, `https://cdn.example.com/assets/user-1/${result.asset.id}.png`);
    assert.equal(result.asset.metadata.storageKey, `assets/user-1/${result.asset.id}.png`);
    assert.equal(calls.auditInputs.length, 1);
    assert.deepEqual(calls.uploads, [{ key: `assets/user-1/${result.asset.id}.png`, contentType: "image/png" }]);
    assert.equal(calls.createdAssets[0].authorId, "user-1");
  });

  it("decodes UTF-8 filenames that multipart parsers expose as latin1 text", async () => {
    const { service, calls } = createService();
    const garbledName = Buffer.from("头图.jpg", "utf8").toString("latin1");

    const result = await service.uploadAsset("user-1", createFile({ originalname: garbledName }));

    assert.equal(result.asset.metadata.originalName, "头图.jpg");
    assert.equal(calls.auditInputs[0].filename, "头图.jpg");
  });

  it("uploads a document without visual audit and keeps it non-insertable for the editor", async () => {
    const { service, calls } = createService();

    const result = await service.uploadAsset(
      "user-1",
      createFile({
        originalname: "brief.md",
        mimetype: "text/markdown",
        size: 8_000,
        buffer: Buffer.from("# brief"),
      }),
    );

    assert.equal(result.asset.kind, AssetKind.Document);
    assert.equal(result.asset.auditStatus, AssetAuditStatus.Passed);
    assert.equal(result.asset.url, `https://cdn.example.com/assets/user-1/${result.asset.id}.md`);
    assert.equal(calls.auditInputs.length, 0);
  });

  it("keeps WARN images usable but records the warning audit status", async () => {
    const { service } = createService({ auditDecision: AssetAuditStatus.Warn });

    const result = await service.uploadAsset("user-1", createFile({ originalname: "warn-cover.png" }));

    assert.equal(result.asset.auditStatus, AssetAuditStatus.Warn);
    assert.equal(result.asset.metadata.audit.summary, "视觉审核通过");
  });

  it("blocks high-risk images before cloud upload and persistence", async () => {
    const { service, calls } = createService({ auditDecision: AssetAuditStatus.Blocked });

    await assert.rejects(() => service.uploadAsset("user-1", createFile({ originalname: "block-cover.png" })), BadRequestException);

    assert.equal(calls.uploads.length, 0);
    assert.equal(calls.createdAssets.length, 0);
  });

  it("rejects unsupported MIME types and oversized files", async () => {
    const { service } = createService();

    await assert.rejects(() => service.uploadAsset("user-1", createFile({ mimetype: "application/zip" })), BadRequestException);
    await assert.rejects(() => service.uploadAsset("user-1", createFile({ size: 6 * 1024 * 1024 })), BadRequestException);
    await assert.rejects(
      () =>
        service.uploadAsset(
          "user-1",
          createFile({ originalname: "large.md", mimetype: "text/markdown", size: 11 * 1024 * 1024 }),
        ),
      BadRequestException,
    );
  });

  it("lists only the current user's assets", async () => {
    const { service } = createService();

    await service.uploadAsset("user-1", createFile());
    await service.uploadAsset("user-2", createFile({ originalname: "other.png" }));

    const result = await service.listMine("user-1");

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].metadata.originalName, "cover.png");
  });

  it("repairs legacy garbled original names when listing assets", async () => {
    const { service, assets } = createService();
    const garbledName = Buffer.from("头像.jpg", "utf8").toString("latin1");
    assets.set("asset-legacy", {
      id: "asset-legacy",
      authorId: "user-1",
      filename: "asset-legacy.jpg",
      mimeType: "image/jpeg",
      url: "https://cdn.example.com/assets/user-1/asset-legacy.jpg",
      auditStatus: AssetAuditStatus.Passed,
      metadata: {
        kind: AssetKind.Image,
        originalName: garbledName,
        size: 1024,
        storageKey: "assets/user-1/asset-legacy.jpg",
        audit: {
          decision: AssetAuditStatus.Passed,
          riskLevel: "none",
          categories: [],
          evidence: [],
          summary: "视觉审核通过",
          model: "vision-audit-mock",
          source: "MOCK",
        },
      },
      createdAt: new Date("2026-06-07T10:00:00.000Z"),
    });

    const result = await service.listMine("user-1");

    assert.equal(result.items[0].metadata.originalName, "头像.jpg");
  });

  it("refreshes listed asset URLs from the storage key so private bucket links stay readable", async () => {
    const { service, assets, calls } = createService();
    assets.set("asset-legacy", {
      id: "asset-legacy",
      authorId: "user-1",
      filename: "asset-legacy.jpg",
      mimeType: "image/jpeg",
      url: "https://cdn.example.com/assets/user-1/asset-legacy.jpg",
      auditStatus: AssetAuditStatus.Passed,
      metadata: {
        kind: AssetKind.Image,
        originalName: "头像.jpg",
        size: 1024,
        storageKey: "assets/user-1/asset-legacy.jpg",
        audit: {
          decision: AssetAuditStatus.Passed,
          riskLevel: "none",
          categories: [],
          evidence: [],
          summary: "视觉审核通过",
          model: "vision-audit-mock",
          source: "MOCK",
        },
      },
      createdAt: new Date("2026-06-07T10:00:00.000Z"),
    });

    const result = await service.listMine("user-1");

    assert.equal(result.items[0].url, "https://cdn.example.com/assets/user-1/asset-legacy.jpg");
    assert.deepEqual(calls.objectUrls, ["assets/user-1/asset-legacy.jpg"]);
  });

  it("deletes only owned assets and removes the cloud object", async () => {
    const { service, calls } = createService();
    const uploaded = await service.uploadAsset("user-1", createFile());

    await assert.rejects(() => service.deleteAsset("user-2", uploaded.asset.id), ForbiddenException);

    const result = await service.deleteAsset("user-1", uploaded.asset.id);

    assert.deepEqual(result, { assetId: uploaded.asset.id, message: "素材已删除。" });
    assert.deepEqual(calls.deletes, [`assets/user-1/${uploaded.asset.id}.png`]);
  });
});
