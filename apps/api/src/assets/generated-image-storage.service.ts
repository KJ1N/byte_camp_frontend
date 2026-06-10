import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AssetAuditService } from "./asset-audit.service";
import { CloudStorageService } from "./cloud-storage.service";

const extensionByMimeType: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const defaultUploadAttempts = 3;

@Injectable()
export class GeneratedImageStorageService {
  constructor(
    private readonly config: ConfigService,
    private readonly imageDownloader: AssetAuditService,
    private readonly storage: CloudStorageService,
  ) {}

  async storeGeneratedImage(userId: string, sourceUrl: string): Promise<{ key: string; url: string }> {
    const image = await this.imageDownloader.downloadGeneratedImage(sourceUrl);
    const extension = extensionByMimeType[image.mimeType];
    if (!extension) throw new ServiceUnavailableException("AI 生成图片格式不受支持。");

    const filename = `${randomUUID()}.${extension}`;
    const key = `generated-images/${userId}/${filename}`;
    const upload = await this.uploadWithRetry({
      key,
      body: image.buffer,
      contentType: image.mimeType,
    });

    return {
      key: upload.key,
      url: this.buildStableViewUrl(userId, filename),
    };
  }

  getGeneratedImageReadUrl(userId: string, filename: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(userId) || !/^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/i.test(filename)) {
      throw new BadRequestException("生成图片地址无效。");
    }

    return this.storage.getObjectUrl(`generated-images/${userId}/${filename}`);
  }

  private buildStableViewUrl(userId: string, filename: string) {
    const apiBaseUrl =
      this.config.get<string>("PUBLIC_API_BASE_URL")?.trim() ||
      this.config.get<string>("NEXT_PUBLIC_API_BASE_URL")?.trim() ||
      `http://localhost:${this.config.get<string>("PORT")?.trim() || "3001"}`;

    return `${apiBaseUrl.replace(/\/$/, "")}/assets/generated/${encodeURIComponent(userId)}/${encodeURIComponent(filename)}/view`;
  }

  private async uploadWithRetry(input: { key: string; body: Buffer; contentType: string }) {
    const configuredAttempts = Number(this.config.get<string>("GENERATED_IMAGE_UPLOAD_ATTEMPTS"));
    const attempts =
      Number.isInteger(configuredAttempts) && configuredAttempts > 0
        ? configuredAttempts
        : defaultUploadAttempts;
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await this.storage.uploadObject(input);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }
}
