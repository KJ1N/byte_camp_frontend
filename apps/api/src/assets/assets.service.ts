import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AssetAuditStatus,
  AssetKind,
  type AssetAuditResult,
  type AssetSummary,
  type DeleteAssetResponse,
  type ListAssetsResponse,
  type UploadAssetResponse,
} from "@bytecamp-aigc/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AssetAuditService } from "./asset-audit.service";
import { CloudStorageService } from "./cloud-storage.service";

export interface UploadedAssetFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface AssetRecord {
  id: string;
  authorId: string;
  filename: string;
  mimeType: string;
  url: string;
  auditStatus: string;
  metadata: unknown;
  createdAt: Date;
}

interface StoredAssetMetadata {
  kind: AssetKind;
  originalName: string;
  size: number;
  storageKey: string;
  audit: AssetAuditResult;
  cdnUrl?: string;
}

const imageMimeTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const documentMimeTypes = new Set(["text/plain", "text/markdown", "application/pdf"]);
const imageSizeLimit = 5 * 1024 * 1024;
const documentSizeLimit = 10 * 1024 * 1024;
const extensionByMimeType: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "text/plain": "txt",
  "text/markdown": "md",
  "application/pdf": "pdf",
};
const riskyFilenamePattern = /赌博|博彩|赌场|毒品|违禁品|违法|犯罪|色情|低俗|露骨/i;

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetAudit: AssetAuditService,
    private readonly storage: CloudStorageService,
  ) {}

  async uploadAsset(userId: string, file: UploadedAssetFile | undefined): Promise<UploadAssetResponse> {
    if (!file?.buffer?.length) throw new BadRequestException("请选择要上传的素材文件。");

    const kind = this.getAssetKind(file.mimetype);
    this.validateFile(file, kind);

    const originalName = this.sanitizeOriginalName(file.originalname);
    if (riskyFilenamePattern.test(originalName)) {
      throw new BadRequestException("素材文件名命中高风险规则，禁止上传。");
    }

    const audit = kind === AssetKind.Image ? await this.assetAudit.auditImage({
      buffer: file.buffer,
      mimeType: file.mimetype,
      filename: originalName,
    }) : this.createDocumentAuditResult();

    if (audit.decision === AssetAuditStatus.Blocked) {
      throw new BadRequestException(audit.summary || "素材未通过视觉审核。");
    }

    const assetId = randomUUID();
    const extension = extensionByMimeType[file.mimetype] ?? "bin";
    const storageKey = `assets/${userId}/${assetId}.${extension}`;
    const upload = await this.storage.uploadObject({
      key: storageKey,
      body: file.buffer,
      contentType: file.mimetype,
    });
    const filename = `${assetId}.${extension}`;
    const metadata = {
      kind,
      originalName,
      size: file.size,
      storageKey: upload.key,
      cdnUrl: upload.cdnUrl,
      audit,
    };

    const record = await this.prisma.asset.create({
      data: {
        id: assetId,
        authorId: userId,
        filename,
        mimeType: file.mimetype,
        url: upload.cdnUrl,
        auditStatus: audit.decision,
        metadata: metadata as unknown as never,
      },
    });

    return { asset: this.mapAsset(record as AssetRecord) };
  }

  async listMine(userId: string): Promise<ListAssetsResponse> {
    const records = await this.prisma.asset.findMany({
      where: { authorId: userId },
      orderBy: { createdAt: "desc" },
    });

    return { items: (records as AssetRecord[]).map((asset) => this.mapAsset(asset)) };
  }

  async deleteAsset(userId: string, assetId: string): Promise<DeleteAssetResponse> {
    const asset = (await this.prisma.asset.findUnique({ where: { id: assetId } })) as AssetRecord | null;
    if (!asset) throw new NotFoundException("素材不存在。");
    if (asset.authorId !== userId) throw new ForbiddenException("不能删除其他用户的素材。");

    const metadata = this.readMetadata(asset.metadata);
    await this.storage.deleteObject(metadata.storageKey);
    await this.prisma.asset.delete({ where: { id: assetId } });

    return { assetId, message: "素材已删除。" };
  }

  private validateFile(file: UploadedAssetFile, kind: AssetKind) {
    const limit = kind === AssetKind.Image ? imageSizeLimit : documentSizeLimit;
    if (file.size > limit) {
      throw new BadRequestException(kind === AssetKind.Image ? "图片素材不能超过 5MB。" : "资料文件不能超过 10MB。");
    }
  }

  private getAssetKind(mimeType: string): AssetKind {
    if (imageMimeTypes.has(mimeType)) return AssetKind.Image;
    if (documentMimeTypes.has(mimeType)) return AssetKind.Document;
    throw new BadRequestException("不支持的素材文件类型。");
  }

  private sanitizeOriginalName(originalName: string) {
    const name = this.decodeMultipartFilename(originalName).split(/[\\/]/).pop()?.trim();
    return name || "asset";
  }

  private decodeMultipartFilename(originalName: string) {
    const decoded = Buffer.from(originalName, "latin1").toString("utf8");
    if (decoded === originalName || decoded.includes("\uFFFD")) return originalName;
    return /[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(decoded) ? decoded : originalName;
  }

  private createDocumentAuditResult(): AssetAuditResult {
    return {
      decision: AssetAuditStatus.Passed,
      riskLevel: "none",
      categories: [],
      evidence: [],
      summary: "资料文件基础校验通过。",
      model: "asset-document-rules",
      source: "MOCK",
    };
  }

  private mapAsset(asset: AssetRecord): AssetSummary {
    const metadata = this.readMetadata(asset.metadata);
    const { kind: _kind, cdnUrl: _cdnUrl, ...publicMetadata } = metadata;
    return {
      id: asset.id,
      kind: metadata.kind,
      filename: asset.filename,
      mimeType: asset.mimeType,
      url: metadata.storageKey ? this.storage.getObjectUrl(metadata.storageKey) : asset.url,
      auditStatus: asset.auditStatus as AssetAuditStatus,
      metadata: publicMetadata,
      createdAt: asset.createdAt.toISOString(),
    };
  }

  private readMetadata(value: unknown): StoredAssetMetadata {
    const metadata = value && typeof value === "object" ? (value as Partial<StoredAssetMetadata>) : {};
    const audit = metadata.audit && typeof metadata.audit === "object" ? metadata.audit : this.createDocumentAuditResult();

    return {
      kind: metadata.kind === AssetKind.Document ? AssetKind.Document : AssetKind.Image,
      originalName: typeof metadata.originalName === "string" ? this.decodeMultipartFilename(metadata.originalName) : "",
      size: typeof metadata.size === "number" ? metadata.size : 0,
      storageKey: typeof metadata.storageKey === "string" ? metadata.storageKey : "",
      audit: audit as AssetAuditResult,
    };
  }
}
