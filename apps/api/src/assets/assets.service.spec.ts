import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { describe, it } from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { AssetAuditStatus, AssetFolderKind, AssetKind, AuditDecision, RiskCategory } from "@bytecamp-aigc/shared";
import type { AuditService } from "../audit/audit.service";
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

function createService(
  options: { auditDecision?: AssetAuditStatus; textAuditDecision?: AuditDecision; ownerId?: string } = {},
) {
  const calls = {
    auditInputs: [] as Array<{ filename: string; mimeType: string }>,
    textAuditInputs: [] as string[],
    uploads: [] as Array<{ key: string; contentType: string }>,
    deletes: [] as string[],
    createdAssets: [] as Array<{ authorId: string; filename: string; url: string; auditStatus: string }>,
    objectUrls: [] as string[],
  };
  const assets = new Map<string, any>();
  const folders = new Map<string, any>();
  const auditDecision = options.auditDecision ?? AssetAuditStatus.Passed;
  const textAuditDecision = options.textAuditDecision ?? AuditDecision.Pass;
  const ownerId = options.ownerId ?? "user-1";
  const imageFolder = {
    id: "folder-image",
    authorId: ownerId,
    kind: AssetFolderKind.Image,
    name: "默认图片",
    createdAt: new Date("2026-06-07T09:00:00.000Z"),
    updatedAt: new Date("2026-06-07T09:00:00.000Z"),
  };
  const documentFolder = {
    id: "folder-document",
    authorId: ownerId,
    kind: AssetFolderKind.Document,
    name: "默认资料",
    createdAt: new Date("2026-06-07T09:00:00.000Z"),
    updatedAt: new Date("2026-06-07T09:00:00.000Z"),
  };
  folders.set(imageFolder.id, imageFolder);
  folders.set(documentFolder.id, documentFolder);

  const prisma = {
    assetFolder: {
      create: async ({ data }: { data: any }) => {
        const folder = {
          id: `folder-${folders.size + 1}`,
          createdAt: new Date("2026-06-07T09:00:00.000Z"),
          updatedAt: new Date("2026-06-07T09:00:00.000Z"),
          ...data,
        };
        folders.set(folder.id, folder);
        return folder;
      },
      findMany: async ({ where }: { where: { authorId: string } }) =>
        [...folders.values()].filter((folder) => folder.authorId === where.authorId),
      findFirst: async ({ where }: { where: { id?: string; authorId: string; kind?: string } }) =>
        [...folders.values()].find(
          (folder) =>
            (where.id === undefined || folder.id === where.id) &&
            folder.authorId === where.authorId &&
            (where.kind === undefined || folder.kind === where.kind),
        ) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: any }) => {
        const folder = folders.get(where.id);
        const updated = { ...folder, ...data, updatedAt: new Date("2026-06-07T09:30:00.000Z") };
        folders.set(where.id, updated);
        return updated;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const folder = folders.get(where.id);
        folders.delete(where.id);
        return folder;
      },
    },
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
      findMany: async ({ where }: { where: { authorId: string; folderId?: string } }) =>
        [...assets.values()].filter(
          (asset) => asset.authorId === where.authorId && (where.folderId === undefined || asset.folderId === where.folderId),
        ),
      findUnique: async ({ where }: { where: { id: string } }) => assets.get(where.id) ?? null,
      count: async ({ where }: { where: { folderId: string } }) =>
        [...assets.values()].filter((asset) => asset.folderId === where.folderId).length,
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
  const contentAudit = {
    checkText: async (text: string) => {
      calls.textAuditInputs.push(text);
      return {
        decision: textAuditDecision,
        riskLevel: textAuditDecision === AuditDecision.Block ? "high" : textAuditDecision === AuditDecision.Warn ? "medium" : "none",
        categories: textAuditDecision === AuditDecision.Pass ? [] : [RiskCategory.Misleading],
        evidence:
          textAuditDecision === AuditDecision.Pass
            ? []
            : [{ text: "内容分发口径", reason: "发布前审核规则命中素材文本。" }],
        rewriteSuggestions: textAuditDecision === AuditDecision.Pass ? [] : ["按发布前审核建议调整素材表述。"],
        summary:
          textAuditDecision === AuditDecision.Block
            ? "发布前审核拦截素材文本"
            : textAuditDecision === AuditDecision.Warn
              ? "发布前审核提示素材文本需要修改"
              : "发布前审核通过",
        model: "publish-audit-mock",
        source: "MOCK" as const,
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
      contentAudit as unknown as AuditService,
    ),
    calls,
    assets,
    folders,
    imageFolderId: imageFolder.id,
    documentFolderId: documentFolder.id,
    ownerId,
  };
}

describe("AssetsService", () => {
  it("creates, lists, renames, and deletes owned asset folders", async () => {
    const { service } = createService();

    const created = await service.createFolder("user-1", { name: "选题截图", kind: AssetFolderKind.Image });
    const renamed = await service.renameFolder("user-1", created.folder.id, { name: "封面图片" });
    const listed = await service.listFolders("user-1");
    const deleted = await service.deleteFolder("user-1", created.folder.id);

    assert.equal(created.folder.kind, AssetFolderKind.Image);
    assert.equal(renamed.folder.name, "封面图片");
    assert.deepEqual(listed.items.map((folder) => folder.name), ["默认图片", "默认资料", "封面图片"]);
    assert.equal(deleted.folderId, created.folder.id);
  });

  it("rejects deleting a non-empty asset folder", async () => {
    const { service, imageFolderId } = createService();
    await service.uploadAsset("user-1", createFile(), imageFolderId);

    await assert.rejects(() => service.deleteFolder("user-1", imageFolderId), BadRequestException);
  });

  it("uploads a passed image to cloud storage and returns a CDN URL", async () => {
    const { service, calls, imageFolderId } = createService();

    const result = await service.uploadAsset("user-1", createFile(), imageFolderId);

    assert.equal(result.asset.kind, AssetKind.Image);
    assert.equal(result.asset.folderId, imageFolderId);
    assert.equal(result.asset.auditStatus, AssetAuditStatus.Passed);
    assert.equal(result.asset.url, `https://cdn.example.com/assets/user-1/${result.asset.id}.png`);
    assert.equal(result.asset.metadata.storageKey, `assets/user-1/${result.asset.id}.png`);
    assert.equal(calls.auditInputs.length, 1);
    assert.deepEqual(calls.uploads, [{ key: `assets/user-1/${result.asset.id}.png`, contentType: "image/png" }]);
    assert.equal(calls.createdAssets[0].authorId, "user-1");
  });

  it("decodes UTF-8 filenames that multipart parsers expose as latin1 text", async () => {
    const { service, calls, imageFolderId } = createService();
    const garbledName = Buffer.from("头图.jpg", "utf8").toString("latin1");

    const result = await service.uploadAsset("user-1", createFile({ originalname: garbledName }), imageFolderId);

    assert.equal(result.asset.metadata.originalName, "头图.jpg");
    assert.equal(calls.auditInputs[0].filename, "头图.jpg");
  });

  it("extracts and audits a markdown document before cloud upload", async () => {
    const { service, calls, documentFolderId } = createService();

    const result = await service.uploadAsset(
      "user-1",
      createFile({
        originalname: "brief.md",
        mimetype: "text/markdown",
        size: 8_000,
        buffer: Buffer.from("# brief"),
      }),
      documentFolderId,
    );

    assert.equal(result.asset.kind, AssetKind.Document);
    assert.equal(result.asset.folderId, documentFolderId);
    assert.equal(result.asset.auditStatus, AssetAuditStatus.Passed);
    assert.equal(result.asset.url, `https://cdn.example.com/assets/user-1/${result.asset.id}.md`);
    assert.equal(result.asset.metadata.textContent, "# brief");
    assert.equal(result.asset.metadata.textPreview, "# brief");
    assert.equal(calls.auditInputs.length, 0);
    assert.deepEqual(calls.textAuditInputs, ["brief.md\n# brief"]);
  });

  it("extracts text from a docx document before cloud upload", async () => {
    const { service, documentFolderId } = createService();

    const result = await service.uploadAsset(
      "user-1",
      createFile({
        originalname: "brief.docx",
        mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: 4_000,
        buffer: createDocxBuffer("第一段资料\n第二段资料"),
      }),
      documentFolderId,
    );

    assert.equal(result.asset.kind, AssetKind.Document);
    assert.equal(result.asset.metadata.textContent, "第一段资料\n第二段资料");
  });

  it("extracts text from a docx whose local header uses a data descriptor", async () => {
    const { service, documentFolderId } = createService();

    const result = await service.uploadAsset(
      "user-1",
      createFile({
        originalname: "wechat-import.docx",
        mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: 8_000,
        buffer: createDocxBufferWithDataDescriptor("微信导入正文\n第二段正文"),
      }),
      documentFolderId,
    );

    assert.equal(result.asset.kind, AssetKind.Document);
    assert.equal(result.asset.metadata.textContent, "微信导入正文\n第二段正文");
  });

  it("keeps WARN documents usable but records the publish audit status", async () => {
    const { service, documentFolderId } = createService({ textAuditDecision: AuditDecision.Warn });

    const result = await service.uploadAsset(
      "user-1",
      createFile({
        originalname: "warn-brief.txt",
        mimetype: "text/plain",
        size: 64,
        buffer: Buffer.from("这是一段需要发布前提示的普通素材文本"),
      }),
      documentFolderId,
    );

    assert.equal(result.asset.auditStatus, AssetAuditStatus.Warn);
    assert.equal(result.asset.metadata.audit.summary, "发布前审核提示素材文本需要修改");
    assert.deepEqual(result.asset.metadata.audit.categories, [RiskCategory.Misleading]);
  });

  it("blocks document text when the publish audit service blocks it", async () => {
    const { service, calls, documentFolderId } = createService({ textAuditDecision: AuditDecision.Block });

    await assert.rejects(
      () =>
        service.uploadAsset(
          "user-1",
          createFile({
            originalname: "brief.txt",
            mimetype: "text/plain",
            size: 64,
            buffer: Buffer.from("这是一段由发布前审核判定高风险的普通素材文本"),
          }),
          documentFolderId,
        ),
      BadRequestException,
    );

    assert.equal(calls.uploads.length, 0);
    assert.equal(calls.createdAssets.length, 0);
  });

  it("requires uploads to target an owned folder of the matching asset kind", async () => {
    const { service, imageFolderId, documentFolderId } = createService();

    await assert.rejects(() => service.uploadAsset("user-1", createFile(), undefined), BadRequestException);
    await assert.rejects(() => service.uploadAsset("user-2", createFile(), imageFolderId), BadRequestException);
    await assert.rejects(
      () =>
        service.uploadAsset(
          "user-1",
          createFile({
            originalname: "brief.md",
            mimetype: "text/markdown",
            size: 8_000,
            buffer: Buffer.from("# brief"),
          }),
          imageFolderId,
        ),
      BadRequestException,
    );
    await assert.rejects(() => service.uploadAsset("user-1", createFile(), documentFolderId), BadRequestException);
  });

  it("keeps WARN images usable but records the warning audit status", async () => {
    const { service, imageFolderId } = createService({ auditDecision: AssetAuditStatus.Warn });

    const result = await service.uploadAsset("user-1", createFile({ originalname: "warn-cover.png" }), imageFolderId);

    assert.equal(result.asset.auditStatus, AssetAuditStatus.Warn);
    assert.equal(result.asset.metadata.audit.summary, "视觉审核通过");
  });

  it("blocks high-risk images before cloud upload and persistence", async () => {
    const { service, calls, imageFolderId } = createService({ auditDecision: AssetAuditStatus.Blocked });

    await assert.rejects(
      () => service.uploadAsset("user-1", createFile({ originalname: "block-cover.png" }), imageFolderId),
      BadRequestException,
    );

    assert.equal(calls.uploads.length, 0);
    assert.equal(calls.createdAssets.length, 0);
  });

  it("rejects unsupported MIME types and oversized files", async () => {
    const { service, imageFolderId, documentFolderId } = createService();

    await assert.rejects(
      () => service.uploadAsset("user-1", createFile({ mimetype: "application/zip" }), imageFolderId),
      BadRequestException,
    );
    await assert.rejects(() => service.uploadAsset("user-1", createFile({ size: 6 * 1024 * 1024 }), imageFolderId), BadRequestException);
    await assert.rejects(
      () =>
        service.uploadAsset(
          "user-1",
          createFile({ originalname: "large.md", mimetype: "text/markdown", size: 11 * 1024 * 1024 }),
          documentFolderId,
        ),
      BadRequestException,
    );
    await assert.rejects(
      () =>
        service.uploadAsset(
          "user-1",
          createFile({ originalname: "legacy.pdf", mimetype: "application/pdf", size: 1024 }),
          documentFolderId,
        ),
      BadRequestException,
    );
  });

  it("lists only the current user's assets", async () => {
    const { service, imageFolderId } = createService();

    await service.uploadAsset("user-1", createFile(), imageFolderId);

    const result = await service.listMine("user-1");
    const folderResult = await service.listMine("user-1", imageFolderId);

    assert.equal(result.items.length, 1);
    assert.equal(folderResult.items.length, 1);
    assert.equal(result.items[0].metadata.originalName, "cover.png");
  });

  it("repairs legacy garbled original names when listing assets", async () => {
    const { service, assets } = createService();
    const garbledName = Buffer.from("头像.jpg", "utf8").toString("latin1");
    assets.set("asset-legacy", {
      id: "asset-legacy",
      authorId: "user-1",
      filename: "asset-legacy.jpg",
      folderId: "folder-image",
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
      folderId: "folder-image",
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
    const { service, calls, imageFolderId } = createService();
    const uploaded = await service.uploadAsset("user-1", createFile(), imageFolderId);

    await assert.rejects(() => service.deleteAsset("user-2", uploaded.asset.id), ForbiddenException);

    const result = await service.deleteAsset("user-1", uploaded.asset.id);

    assert.deepEqual(result, { assetId: uploaded.asset.id, message: "素材已删除。" });
    assert.deepEqual(calls.deletes, [`assets/user-1/${uploaded.asset.id}.png`]);
  });
});

function createDocxBuffer(text: string): Buffer {
  const escaped = text
    .split("\n")
    .map((line) => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`)
    .join("");
  const xml = Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${escaped}</w:body></w:document>`,
  );
  const filename = Buffer.from("word/document.xml");
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt32LE(0, 10);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(xml.length, 18);
  header.writeUInt32LE(xml.length, 22);
  header.writeUInt16LE(filename.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, filename, xml]);
}

function createDocxBufferWithDataDescriptor(text: string): Buffer {
  const xml = createDocumentXml(text);
  const filename = Buffer.from("word/document.xml");
  const compressed = deflateRawSync(xml);
  const localHeaderOffset = 0;
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0x0808, 6);
  localHeader.writeUInt16LE(8, 8);
  localHeader.writeUInt32LE(0, 10);
  localHeader.writeUInt32LE(0, 14);
  localHeader.writeUInt32LE(0, 18);
  localHeader.writeUInt32LE(0, 22);
  localHeader.writeUInt16LE(filename.length, 26);
  localHeader.writeUInt16LE(0, 28);

  const dataDescriptor = Buffer.alloc(16);
  dataDescriptor.writeUInt32LE(0x08074b50, 0);
  dataDescriptor.writeUInt32LE(0, 4);
  dataDescriptor.writeUInt32LE(compressed.length, 8);
  dataDescriptor.writeUInt32LE(xml.length, 12);

  const centralDirectoryOffset = localHeader.length + filename.length + compressed.length + dataDescriptor.length;
  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0x0808, 8);
  centralHeader.writeUInt16LE(8, 10);
  centralHeader.writeUInt32LE(0, 12);
  centralHeader.writeUInt32LE(0, 16);
  centralHeader.writeUInt32LE(compressed.length, 20);
  centralHeader.writeUInt32LE(xml.length, 24);
  centralHeader.writeUInt16LE(filename.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE(0, 38);
  centralHeader.writeUInt32LE(localHeaderOffset, 42);

  const centralDirectorySize = centralHeader.length + filename.length;
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(1, 8);
  endOfCentralDirectory.writeUInt16LE(1, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectorySize, 12);
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  return Buffer.concat([
    localHeader,
    filename,
    compressed,
    dataDescriptor,
    centralHeader,
    filename,
    endOfCentralDirectory,
  ]);
}

function createDocumentXml(text: string): Buffer {
  const escaped = text
    .split("\n")
    .map((line) => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`)
    .join("");
  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${escaped}</w:body></w:document>`,
  );
}
