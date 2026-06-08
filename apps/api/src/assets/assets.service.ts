import { randomUUID } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AuditDecision,
  AssetAuditStatus,
  AssetFolderKind,
  AssetKind,
  type AuditResult,
  type AssetAuditResult,
  type AssetFolderMutationResponse,
  type AssetFolderSummary,
  type AssetSummary,
  type CreateAssetFolderInput,
  type DeleteAssetResponse,
  type DeleteAssetFolderResponse,
  type ListAssetFoldersResponse,
  type ListAssetsResponse,
  type RenameAssetFolderInput,
  type UploadAssetResponse,
} from "@bytecamp-aigc/shared";
import { AuditService } from "../audit/audit.service";
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
  folderId?: string | null;
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
  textContent?: string;
  textPreview?: string;
  textSize?: number;
}

interface AssetFolderRecord {
  id: string;
  authorId: string;
  kind: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

const imageMimeTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const docxMimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const documentMimeTypes = new Set(["text/plain", "text/markdown", docxMimeType]);
const imageSizeLimit = 5 * 1024 * 1024;
const documentSizeLimit = 10 * 1024 * 1024;
const extensionByMimeType: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "text/plain": "txt",
  "text/markdown": "md",
  [docxMimeType]: "docx",
};
const riskyFilenamePattern = /赌博|博彩|赌场|毒品|违禁品|违法|犯罪|色情|低俗|露骨/i;

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetAudit: AssetAuditService,
    private readonly storage: CloudStorageService,
    private readonly auditService: AuditService,
  ) {}

  async createFolder(userId: string, input: CreateAssetFolderInput): Promise<AssetFolderMutationResponse> {
    const name = this.ensureFolderName(input.name);
    const kind = this.ensureFolderKind(input.kind);
    const folder = await this.prisma.assetFolder.create({
      data: { authorId: userId, kind, name },
    });

    return { folder: await this.mapFolder(folder as AssetFolderRecord) };
  }

  async listFolders(userId: string): Promise<ListAssetFoldersResponse> {
    const folders = (await this.prisma.assetFolder.findMany({
      where: { authorId: userId },
      orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
    })) as AssetFolderRecord[];

    return { items: await Promise.all(folders.map((folder) => this.mapFolder(folder))) };
  }

  async renameFolder(
    userId: string,
    folderId: string,
    input: RenameAssetFolderInput,
  ): Promise<AssetFolderMutationResponse> {
    const folder = await this.getOwnedFolder(userId, folderId);
    const renamed = await this.prisma.assetFolder.update({
      where: { id: folder.id },
      data: { name: this.ensureFolderName(input.name) },
    });

    return { folder: await this.mapFolder(renamed as AssetFolderRecord) };
  }

  async deleteFolder(userId: string, folderId: string): Promise<DeleteAssetFolderResponse> {
    const folder = await this.getOwnedFolder(userId, folderId);
    const assetCount = await this.prisma.asset.count({ where: { folderId: folder.id } });
    if (assetCount > 0) throw new BadRequestException("文件夹内还有素材，不能删除。");

    await this.prisma.assetFolder.delete({ where: { id: folder.id } });
    return { folderId: folder.id, message: "素材文件夹已删除。" };
  }

  async uploadAsset(
    userId: string,
    file: UploadedAssetFile | undefined,
    folderId?: string,
  ): Promise<UploadAssetResponse> {
    if (!file?.buffer?.length) throw new BadRequestException("请选择要上传的素材文件。");

    const kind = this.getAssetKind(file.mimetype);
    this.validateFile(file, kind);
    const folder = await this.getUploadFolder(userId, folderId, kind);

    const originalName = this.sanitizeOriginalName(file.originalname);
    if (riskyFilenamePattern.test(originalName)) {
      throw new BadRequestException("素材文件名命中高风险规则，禁止上传。");
    }

    const documentText = kind === AssetKind.Document ? this.extractDocumentText(file, originalName) : "";
    const audit =
      kind === AssetKind.Image
        ? await this.assetAudit.auditImage({
            buffer: file.buffer,
            mimeType: file.mimetype,
            filename: originalName,
          })
        : await this.auditDocumentText(documentText, originalName);

    if (audit.decision === AssetAuditStatus.Blocked) {
      throw new BadRequestException(audit.summary || "素材未通过审核。");
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
      ...(kind === AssetKind.Document
        ? {
            textContent: documentText,
            textPreview: this.createTextPreview(documentText),
            textSize: documentText.length,
          }
        : {}),
    };

    const record = await this.prisma.asset.create({
      data: {
        id: assetId,
        authorId: userId,
        folderId: folder.id,
        filename,
        mimeType: file.mimetype,
        url: upload.cdnUrl,
        auditStatus: audit.decision,
        metadata: metadata as unknown as never,
      },
    });

    return { asset: this.mapAsset(record as AssetRecord) };
  }

  async listMine(userId: string, folderId?: string): Promise<ListAssetsResponse> {
    const records = await this.prisma.asset.findMany({
      where: folderId ? { authorId: userId, folderId } : { authorId: userId },
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

  private ensureFolderKind(kind: AssetFolderKind): AssetFolderKind {
    if (kind === AssetFolderKind.Image || kind === AssetFolderKind.Document) return kind;
    throw new BadRequestException("不支持的素材文件夹类型。");
  }

  private ensureFolderName(value: string) {
    const name = value?.trim();
    if (!name) throw new BadRequestException("文件夹名称不能为空。");
    if (name.length > 24) throw new BadRequestException("文件夹名称不能超过 24 个字。");
    return name;
  }

  private async getOwnedFolder(userId: string, folderId: string): Promise<AssetFolderRecord> {
    const folder = (await this.prisma.assetFolder.findFirst({
      where: { id: folderId, authorId: userId },
    })) as AssetFolderRecord | null;
    if (!folder) throw new NotFoundException("素材文件夹不存在。");
    return folder;
  }

  private async getUploadFolder(userId: string, folderId: string | undefined, kind: AssetKind): Promise<AssetFolderRecord> {
    if (!folderId?.trim()) throw new BadRequestException("请选择素材文件夹。");
    const folderKind = kind === AssetKind.Image ? AssetFolderKind.Image : AssetFolderKind.Document;
    const folder = (await this.prisma.assetFolder.findFirst({
      where: { id: folderId, authorId: userId, kind: folderKind },
    })) as AssetFolderRecord | null;

    if (!folder) throw new BadRequestException("请选择当前账号下匹配类型的素材文件夹。");
    return folder;
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

  private async auditDocumentText(text: string, filename: string): Promise<AssetAuditResult> {
    const result = await this.auditService.checkText(`${filename}\n${text}`);
    return this.mapContentAuditResult(result);
  }

  private createDocumentAuditResult(): AssetAuditResult {
    return {
      decision: AssetAuditStatus.Passed,
      riskLevel: "none",
      categories: [],
      evidence: [],
      summary: "资料文本合规检查通过。",
      model: "content-audit",
      source: "MOCK",
    };
  }

  private mapContentAuditResult(result: AuditResult): AssetAuditResult {
    return {
      decision: this.mapAuditDecision(result.decision),
      riskLevel: result.riskLevel,
      categories: result.categories,
      evidence: result.evidence,
      summary: result.summary,
      model: result.model ?? "content-audit",
      source: result.source ?? "MOCK",
    };
  }

  private mapAuditDecision(decision: AuditDecision): AssetAuditStatus {
    if (decision === AuditDecision.Block) return AssetAuditStatus.Blocked;
    if (decision === AuditDecision.Warn) return AssetAuditStatus.Warn;
    return AssetAuditStatus.Passed;
  }

  private extractDocumentText(file: UploadedAssetFile, filename: string) {
    const text =
      file.mimetype === docxMimeType
        ? this.extractDocxText(file.buffer)
        : file.buffer.toString("utf8").replace(/\u0000/g, "").trim();

    const normalized = text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
    if (!normalized) throw new BadRequestException(`${filename} 未抽取到可审核文字。`);
    return normalized;
  }

  private extractDocxText(buffer: Buffer) {
    const xml = this.readZipEntry(buffer, "word/document.xml");
    if (!xml) throw new BadRequestException("docx 文件缺少正文内容。");

    const withLineBreaks = xml
      .replace(/<w:tab\s*\/>/g, "\t")
      .replace(/<w:br\s*\/>/g, "\n");
    const paragraphs = [...withLineBreaks.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)]
      .map((match) => this.extractDocxTextParts(match[0]).join(""))
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);

    if (paragraphs.length) return paragraphs.join("\n");

    const textParts = this.extractDocxTextParts(withLineBreaks);

    return textParts.join("").replace(/\n{3,}/g, "\n\n").trim();
  }

  private extractDocxTextParts(xml: string) {
    return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) =>
      this.decodeXmlEntities(match[1]),
    );
  }

  private readZipEntry(buffer: Buffer, targetName: string): string {
    const centralDirectoryEntry = this.readZipEntryFromCentralDirectory(buffer, targetName);
    if (centralDirectoryEntry) return centralDirectoryEntry;

    let offset = 0;

    while (offset + 30 <= buffer.length) {
      const signature = buffer.readUInt32LE(offset);
      if (signature !== 0x04034b50) {
        offset += 1;
        continue;
      }

      const flags = buffer.readUInt16LE(offset + 6);
      const compressionMethod = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const fileNameLength = buffer.readUInt16LE(offset + 26);
      const extraLength = buffer.readUInt16LE(offset + 28);
      const nameStart = offset + 30;
      const nameEnd = nameStart + fileNameLength;
      const dataStart = nameEnd + extraLength;
      const dataEnd = dataStart + compressedSize;

      if (nameEnd > buffer.length || dataEnd > buffer.length || (flags & 0x08) !== 0) {
        offset += 1;
        continue;
      }

      const entryName = buffer.subarray(nameStart, nameEnd).toString("utf8");
      const compressed = buffer.subarray(dataStart, dataEnd);
      if (entryName === targetName) {
        return this.decodeZipPayload(compressed, compressionMethod);
      }

      offset = dataEnd;
    }

    return "";
  }

  private readZipEntryFromCentralDirectory(buffer: Buffer, targetName: string): string {
    const endOffset = this.findEndOfCentralDirectoryOffset(buffer);
    if (endOffset < 0 || endOffset + 22 > buffer.length) return "";

    const entryCount = buffer.readUInt16LE(endOffset + 10);
    const centralDirectoryOffset = buffer.readUInt32LE(endOffset + 16);
    let offset = centralDirectoryOffset;

    for (let index = 0; index < entryCount && offset + 46 <= buffer.length; index += 1) {
      const signature = buffer.readUInt32LE(offset);
      if (signature !== 0x02014b50) return "";

      const compressionMethod = buffer.readUInt16LE(offset + 10);
      const compressedSize = buffer.readUInt32LE(offset + 20);
      const fileNameLength = buffer.readUInt16LE(offset + 28);
      const extraLength = buffer.readUInt16LE(offset + 30);
      const commentLength = buffer.readUInt16LE(offset + 32);
      const localHeaderOffset = buffer.readUInt32LE(offset + 42);
      const nameStart = offset + 46;
      const nameEnd = nameStart + fileNameLength;

      if (nameEnd > buffer.length) return "";

      const entryName = buffer.subarray(nameStart, nameEnd).toString("utf8");
      if (entryName === targetName) {
        if (compressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
          throw new BadRequestException("docx Zip64 正文格式暂不支持。");
        }

        return this.readZipEntryFromLocalHeader(buffer, localHeaderOffset, compressedSize, compressionMethod);
      }

      offset = nameEnd + extraLength + commentLength;
    }

    return "";
  }

  private readZipEntryFromLocalHeader(
    buffer: Buffer,
    offset: number,
    compressedSize: number,
    compressionMethod: number,
  ): string {
    if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== 0x04034b50) return "";

    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const dataStart = offset + 30 + fileNameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataStart > buffer.length || dataEnd > buffer.length) return "";

    return this.decodeZipPayload(buffer.subarray(dataStart, dataEnd), compressionMethod);
  }

  private findEndOfCentralDirectoryOffset(buffer: Buffer) {
    const minimumOffset = Math.max(0, buffer.length - 65_557);

    for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
      if (buffer.readUInt32LE(offset) !== 0x06054b50) continue;

      const commentLength = buffer.readUInt16LE(offset + 20);
      if (offset + 22 + commentLength === buffer.length) return offset;
    }

    return -1;
  }

  private decodeZipPayload(payload: Buffer, compressionMethod: number) {
    if (compressionMethod === 0) return payload.toString("utf8");
    if (compressionMethod === 8) return inflateRawSync(payload).toString("utf8");
    throw new BadRequestException("docx 正文压缩格式暂不支持。");
  }

  private decodeXmlEntities(value: string) {
    return value
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  private createTextPreview(text: string) {
    return text.length > 500 ? `${text.slice(0, 500)}...` : text;
  }

  private async mapFolder(folder: AssetFolderRecord): Promise<AssetFolderSummary> {
    const assetCount = await this.prisma.asset.count({ where: { folderId: folder.id } });
    return {
      id: folder.id,
      kind: folder.kind === AssetFolderKind.Document ? AssetFolderKind.Document : AssetFolderKind.Image,
      name: folder.name,
      assetCount,
      createdAt: folder.createdAt.toISOString(),
      updatedAt: folder.updatedAt.toISOString(),
    };
  }

  private mapAsset(asset: AssetRecord): AssetSummary {
    const metadata = this.readMetadata(asset.metadata);
    const { kind: _kind, cdnUrl: _cdnUrl, ...publicMetadata } = metadata;
    return {
      id: asset.id,
      kind: metadata.kind,
      folderId: asset.folderId ?? null,
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
      textContent: typeof metadata.textContent === "string" ? metadata.textContent : undefined,
      textPreview: typeof metadata.textPreview === "string" ? metadata.textPreview : undefined,
      textSize: typeof metadata.textSize === "number" ? metadata.textSize : undefined,
    };
  }
}
