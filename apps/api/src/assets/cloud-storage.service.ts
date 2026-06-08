import { createHash, createHmac } from "node:crypto";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface CloudStorageUploadInput {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface CloudStorageUploadResult {
  key: string;
  cdnUrl: string;
}

type AssetStorageMode = "mock" | "s3";

@Injectable()
export class CloudStorageService {
  constructor(private readonly config?: ConfigService) {}

  async uploadObject(input: CloudStorageUploadInput): Promise<CloudStorageUploadResult> {
    const mode = this.getMode();
    if (mode === "mock") {
      return { key: input.key, cdnUrl: this.buildCdnUrl(input.key) };
    }

    await this.signedRequest("PUT", input.key, input.body, input.contentType);
    return { key: input.key, cdnUrl: this.buildCdnUrl(input.key) };
  }

  async deleteObject(key: string): Promise<void> {
    const mode = this.getMode();
    if (mode === "mock") return;

    await this.signedRequest("DELETE", key, Buffer.alloc(0), "application/octet-stream");
  }

  getObjectUrl(key: string): string {
    return this.buildCdnUrl(key);
  }

  private getMode(): AssetStorageMode {
    return this.config?.get<string>("ASSET_STORAGE_MODE")?.trim() === "s3" ? "s3" : "mock";
  }

  private buildCdnUrl(key: string) {
    const baseUrl = this.config?.get<string>("ASSET_CDN_BASE_URL")?.trim() || "https://cdn.example.com";
    const url = `${baseUrl.replace(/\/$/, "")}/${key
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/")}`;
    return this.buildAliyunOssReadUrl(key, url);
  }

  private buildAliyunOssReadUrl(key: string, url: string) {
    const mode = this.getMode();
    const endpoint = this.config?.get<string>("ASSET_ENDPOINT")?.trim();
    const bucket = this.config?.get<string>("ASSET_BUCKET")?.trim();
    const accessKeyId = this.config?.get<string>("ASSET_ACCESS_KEY_ID")?.trim();
    const secretAccessKey = this.config?.get<string>("ASSET_SECRET_ACCESS_KEY")?.trim();
    const endpointHost = endpoint ? new URL(endpoint).hostname : "";

    if (mode !== "s3" || !isAliyunOssEndpoint(endpointHost) || !bucket || !accessKeyId || !secretAccessKey) {
      return url;
    }

    const ttlSeconds = Number(this.config?.get<string>("ASSET_SIGNED_URL_TTL_SECONDS")?.trim()) || 7 * 24 * 60 * 60;
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    const canonicalResource = `/${bucket}/${key}`;
    const stringToSign = ["GET", "", "", String(expires), canonicalResource].join("\n");
    const signature = createHmac("sha1", secretAccessKey).update(stringToSign).digest("base64");
    const signedUrl = new URL(url);
    signedUrl.searchParams.set("OSSAccessKeyId", accessKeyId);
    signedUrl.searchParams.set("Expires", String(expires));
    signedUrl.searchParams.set("Signature", signature);
    return signedUrl.toString();
  }

  private async signedRequest(method: "PUT" | "DELETE", key: string, body: Buffer, contentType: string) {
    const endpoint = this.config?.get<string>("ASSET_ENDPOINT")?.trim();
    const bucket = this.config?.get<string>("ASSET_BUCKET")?.trim();
    const accessKeyId = this.config?.get<string>("ASSET_ACCESS_KEY_ID")?.trim();
    const secretAccessKey = this.config?.get<string>("ASSET_SECRET_ACCESS_KEY")?.trim();
    const region = this.config?.get<string>("ASSET_REGION")?.trim() || "auto";

    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      throw new ServiceUnavailableException("云存储配置不完整。");
    }

    const endpointUrl = new URL(endpoint);
    const encodedKey = key
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    if (isAliyunOssEndpoint(endpointUrl.hostname)) {
      await this.aliyunOssSignedRequest({
        method,
        endpointUrl,
        bucket,
        encodedKey,
        body,
        contentType,
        accessKeyId,
        secretAccessKey,
        region,
      });
      return;
    }

    const canonicalUri = `/${bucket}/${encodedKey}`;
    const url = new URL(canonicalUri, `${endpointUrl.protocol}//${endpointUrl.host}`);
    const now = new Date();
    const amzDate = toAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256Hex(body);
    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const canonicalHeaders = [
      `content-type:${contentType}`,
      `host:${url.host}`,
      `x-amz-content-sha256:${payloadHash}`,
      `x-amz-date:${amzDate}`,
      "",
    ].join("\n");
    const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = [method, url.pathname, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      sha256Hex(Buffer.from(canonicalRequest)),
    ].join("\n");
    const signature = hmacHex(getSignatureKey(secretAccessKey, dateStamp, region, "s3"), stringToSign);
    const authorization = [
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(", ");

    const requestBody = method === "PUT" ? bufferToArrayBuffer(body) : undefined;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: authorization,
        "Content-Type": contentType,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
      },
      body: requestBody,
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(`云存储${method === "PUT" ? "上传" : "删除"}失败。`);
    }
  }

  private async aliyunOssSignedRequest(input: {
    method: "PUT" | "DELETE";
    endpointUrl: URL;
    bucket: string;
    encodedKey: string;
    body: Buffer;
    contentType: string;
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
  }) {
    const bucketHost = `${input.bucket}.${input.endpointUrl.host}`;
    const url = new URL(`/${input.encodedKey}`, `${input.endpointUrl.protocol}//${bucketHost}`);
    const now = new Date();
    const ossDate = toAmzDate(now);
    const dateStamp = ossDate.slice(0, 8);
    const credentialScope = `${dateStamp}/${input.region}/oss/aliyun_v4_request`;
    const payloadHash = "UNSIGNED-PAYLOAD";
    const canonicalUri = `/${input.bucket}/${input.encodedKey}`;
    const canonicalHeaders = [
      `content-type:${input.contentType}`,
      `x-oss-content-sha256:${payloadHash}`,
      `x-oss-date:${ossDate}`,
      "",
    ].join("\n");
    const additionalHeaders = "";
    const canonicalRequest = [input.method, canonicalUri, "", canonicalHeaders, additionalHeaders, payloadHash].join("\n");
    const stringToSign = [
      "OSS4-HMAC-SHA256",
      ossDate,
      credentialScope,
      sha256Hex(Buffer.from(canonicalRequest)),
    ].join("\n");
    const signature = hmacHex(getAliyunOssSignatureKey(input.secretAccessKey, dateStamp, input.region), stringToSign);
    const authorization = [
      `OSS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}`,
      `Signature=${signature}`,
    ].join(",");

    const requestBody = input.method === "PUT" ? bufferToArrayBuffer(input.body) : undefined;
    const response = await fetch(url, {
      method: input.method,
      headers: {
        Authorization: authorization,
        "Content-Type": input.contentType,
        "x-oss-content-sha256": payloadHash,
        "x-oss-date": ossDate,
      },
      body: requestBody,
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(`云存储${input.method === "PUT" ? "上传" : "删除"}失败。`);
    }
  }
}

function sha256Hex(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmacBuffer(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function getSignatureKey(secretAccessKey: string, dateStamp: string, region: string, service: string) {
  const dateKey = hmacBuffer(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmacBuffer(dateKey, region);
  const serviceKey = hmacBuffer(regionKey, service);
  return hmacBuffer(serviceKey, "aws4_request");
}

function getAliyunOssSignatureKey(secretAccessKey: string, dateStamp: string, region: string) {
  const dateKey = hmacBuffer(`aliyun_v4${secretAccessKey}`, dateStamp);
  const regionKey = hmacBuffer(dateKey, region);
  const serviceKey = hmacBuffer(regionKey, "oss");
  return hmacBuffer(serviceKey, "aliyun_v4_request");
}

function toAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const view = new Uint8Array(buffer);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
}

function isAliyunOssEndpoint(hostname: string) {
  return /(^|\.)oss-[a-z0-9-]+\.aliyuncs\.com$/i.test(hostname);
}
