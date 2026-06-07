# 云素材存储与视觉审核技术方案

## 1. 功能目标和用户价值

本阶段按最新确认先不做“用户资料页、头像、昵称和基础创作者资料编辑”，只推进 README 待开发事项第 5、6 部分中仍需要落地的两条主线：

```text
创作者管理与数据反馈
  -> 创作者主页统计接入真实数据：粉丝数、阅读量、作品数、互动数据
  -> 本阶段只确认和补强真实统计，不新增用户资料页

素材与多媒体
  -> 新增素材上传模块，支持图片或资料文件上传
  -> 除文字正文外的内容统一存到云存储
  -> 对外使用 CDN URL，不使用本地静态文件路径
  -> 对上传图片添加视觉审核模型
  -> 在编辑器中插入和管理图片素材
  -> 预留多模态生成能力入口，但 MVP 阶段不阻塞主链路
```

目标业务链路为：

```text
创作者主页 `/creator`
  -> 继续读取后端真实聚合统计
  -> 粉丝数因关注模型未接入，后端明确返回 0，不伪造

草稿编辑页 `/drafts/:id`
  -> 打开素材面板
  -> 上传图片或资料文件
  -> 后端完成文件类型、大小和基础规则校验
  -> 图片文件交给视觉审核模型判断 PASS / WARN / BLOCK
  -> PASS / WARN 文件上传到云对象存储
  -> 数据库保存素材记录、审核结果和 CDN URL
  -> 前端素材列表读取 CDN URL
  -> 图片素材可插入 TipTap 正文
  -> 资料文件可管理和复制 CDN URL，不直接插入正文
  -> 多模态生成入口展示为后续能力，不阻塞保存和发布
```

用户价值：

- 创作者主页的数据反馈继续来自真实文章、评分和互动事件，演示时能解释数据来源。
- 图片和资料文件不落在应用本地磁盘，符合后续部署和 CDN 分发的方向。
- 图片上传前后都有后端校验，视觉审核结果可追踪，避免把审核责任放到前端。
- 编辑器可以直接插入已审核的云端图片素材，不再依赖用户手动输入外链。
- 后续接入图生文、图文混合理解、资料辅助生成时，可以复用当前素材表和 CDN URL。

## 2. 范围选择

### 推荐方案：云存储抽象 + CDN URL + 视觉审核模型 + 编辑器素材面板

本阶段实现：

- 保留创作者主页真实统计：
  - 阅读量、点赞、收藏、作品数、草稿数、平均质量分继续由 `UsersService.getCreatorOverview` 从数据库聚合。
  - 粉丝数当前无关注模型，返回 `0` 并在页面文案说明，不做假数据。
  - 不新增 `/profile`，不新增用户资料编辑 API，不改用户资料 schema。
- 补齐素材模块：
  - `POST /assets` 接收 `multipart/form-data` 上传图片或资料文件。
  - `GET /assets/mine` 返回当前用户素材列表。
  - `DELETE /assets/:id` 删除当前用户自己的素材记录，并调用云存储删除对象。
- 云存储路径：
  - 后端接收文件后不写入本地静态目录。
  - 使用 `CloudStorageService` 封装对象存储上传、删除和 CDN URL 生成。
  - 默认支持 S3-compatible 配置，适配 AWS S3、Cloudflare R2、阿里云 OSS S3 兼容网关、腾讯云 COS 兼容层等对象存储。
  - 本地和测试环境使用 `mock` 模式，不访问外部网络，返回稳定的 CDN 风格 URL。
- CDN URL：
  - `Asset.url` 存储最终 CDN 地址，例如 `https://cdn.example.com/assets/{userId}/{assetId}.png`。
  - `Asset.metadata.storageKey` 存储对象存储 key。
  - 前端只使用 CDN URL 展示和插入，不接触云存储密钥。
- 基础校验：
  - 图片支持 `image/png`、`image/jpeg`、`image/webp`、`image/gif`。
  - 资料文件支持 `text/plain`、`application/pdf`、`text/markdown`。
  - 图片上限 5 MB，资料文件上限 10 MB。
  - 文件名清洗，禁止路径穿越。
  - 原始文件名命中高风险词时直接拒绝。
- 视觉审核模型：
  - 新增 `AssetAuditService`。
  - 图片文件在上传云存储前调用视觉审核模型。
  - 模型输出结构化结果：`PASS` / `WARN` / `BLOCK`、风险类别、证据说明、摘要。
  - `BLOCK` 图片不上传云存储，不生成可插入素材。
  - `WARN` 图片允许入库和插入，但 UI 展示风险提醒。
  - 模型不可用时根据 `ASSET_AUDIT_MODE` 决定：
    - `mock`：返回可预测 mock 审核结果，服务本地开发和测试。
    - `live`：失败即拒绝上传，避免绕过视觉审核。
    - `auto`：有视觉模型配置时走 live，否则走 mock。
- 编辑器图片素材管理：
  - 草稿编辑页右侧 AI 助手区域增加“素材”标签。
  - 支持上传图片、查看图片素材、插入正文、复制 CDN URL、删除素材。
  - TipTap 继续使用现有 Image 扩展，插入素材时写入 `src`、`alt` 和 `assetId` attrs。
  - 资料文件仅进入素材列表，不插入正文。
- 多模态生成入口：
  - 在素材面板底部展示“多模态生成”入口。
  - MVP 阶段显示“已预留，后续可基于图片/资料生成内容”，按钮禁用或打开轻量提示，不影响主链路。
- 实现完成后生成学习文档：
  - `docs/learn/016-assets-cloud-vision-audit-learning.md`
- 验证完成后更新 README 第 5、6 部分待办状态：
  - 第 5 部分“用户资料页”不勾选，标注本阶段按确认暂缓。
  - 第 6 部分素材上传、合规校验、编辑器图片素材、多模态入口勾选。

优点：

- 符合“除文字外内容走云存储 + CDN 路径”的新要求。
- 后端负责云存储、视觉审核、素材归属和 CDN URL，前端只负责展示和交互，模块边界清晰。
- mock 云存储与 mock 视觉审核让本地测试不依赖真实云密钥和外部网络。
- 后续替换具体云厂商时只改 `CloudStorageService`，不改前端和业务 API。

代价：

- 需要新增云存储环境变量和服务抽象。
- 真正 live 模式需要用户提供云存储配置、CDN 域名和视觉模型配置。
- 视觉审核会增加上传耗时，需要前端展示“审核中/上传中”状态。
- 文档类文件没有视觉内容，本阶段只做文件名、类型和大小校验；后续可扩展文本抽取审核。

### 备选方案 A：直接前端上传云存储

优点：

- 后端带宽压力更小。

代价：

- 需要预签名 URL、前端直传、回调确认、审核前临时私有对象等额外链路。
- 容易让未审核文件先进入云存储和 CDN。
- 当前 MVP 更需要稳定闭环。

本阶段不采用。

### 备选方案 B：只用本地 mock 存储，后续再接云

优点：

- 开发最快。

代价：

- 不满足“除文字外内容储存设定成云储存，走云存储 + CDN 路径”的要求。

本阶段不采用。

## 3. 涉及模块

### 前端 `apps/web`

- `apps/web/src/app/creator/page.tsx`
  - 保留真实统计展示。
  - 粉丝数说明为“关注模型未接入，当前为 0”。
  - 不增加资料页入口。
- `apps/web/src/app/drafts/[id]/page.tsx`
  - 将右侧面板扩展为 `AI 创作 / 内容建议 / 素材` 标签。
  - 管理素材面板状态。
  - 传入素材插入回调给编辑器。
  - 素材上传、审核、删除失败时展示明确状态。
- `apps/web/src/components/editor/rich-text-editor.tsx`
  - 支持从外部插入图片素材。
  - 保留现有手动 URL 插入能力。
- `apps/web/src/components/asset-panel.tsx`
  - 新增素材上传、素材列表、审核状态、插入、复制 CDN URL、删除和多模态入口展示。
- `apps/web/src/lib/api.ts`
  - FormData 请求时不默认设置 `Content-Type: application/json`。
- `apps/web/src/lib/assets.ts`
  - 新增素材类型判断、文件大小文案、上传状态、审核状态 helper。
- `apps/web/src/lib/assets.test.ts`
  - 覆盖文件类型、文件大小、素材筛选、审核状态文案和按钮状态。

### 后端 `apps/api`

- `apps/api/src/assets/assets.controller.ts`
  - 新增上传、列表、删除接口。
- `apps/api/src/assets/assets.service.ts`
  - 文件类型/大小校验。
  - 文件名清洗。
  - 调用 `AssetAuditService`。
  - 调用 `CloudStorageService` 上传和删除对象。
  - 写入 `assets` 表。
- `apps/api/src/assets/asset-audit.service.ts`
  - 封装 mock / live / auto 视觉审核。
  - live 模式通过 AI Gateway 或 OpenAI-compatible 视觉模型输出结构化审核结果。
- `apps/api/src/assets/cloud-storage.service.ts`
  - 封装 mock / S3-compatible 对象存储。
  - 生成 CDN URL。
- `apps/api/src/assets/assets.module.ts`
  - 注册 controller/service。
- `apps/api/src/assets/assets.service.spec.ts`
  - 覆盖上传校验、视觉审核、云存储调用、归属和删除权限。
- `apps/api/src/users/users.service.ts`
  - 如发现统计有占位或撤回文章计入错误，只做统计修正。
- `apps/api/src/users/users.service.spec.ts`
  - 覆盖真实统计：阅读量、点赞、收藏、作品数、平均质量分、粉丝数为 0。

### 共享包 `packages/shared`

- `packages/shared/src/index.ts`
  - 新增 `AssetKind`、`AssetAuditStatus`、`AssetAuditResult`、`AssetSummary`、`UploadAssetResponse`、`ListAssetsResponse`、`DeleteAssetResponse`。
  - 不新增用户资料 DTO。
  - 扩展 `RichTextNode.attrs` 无需改类型，继续使用 `Record<string, unknown>`。

### 文档

- `README.md`
  - 实现和验证完成后更新第 5、6 部分待办状态。
- `.env.example`
  - 新增云存储、CDN 和视觉审核模型配置。
- `docs/learn/016-assets-cloud-vision-audit-learning.md`
  - 实现完成后生成面向初学者的全链路学习文档。

## 4. 需要新增或修改的文件

### 新增文件

- `apps/web/src/components/asset-panel.tsx`
- `apps/web/src/lib/assets.ts`
- `apps/web/src/lib/assets.test.ts`
- `apps/api/src/assets/assets.controller.ts`
- `apps/api/src/assets/assets.service.ts`
- `apps/api/src/assets/asset-audit.service.ts`
- `apps/api/src/assets/cloud-storage.service.ts`
- `apps/api/src/assets/assets.service.spec.ts`
- `docs/learn/016-assets-cloud-vision-audit-learning.md`

### 修改文件

- `README.md`
- `.env.example`
- `packages/shared/src/index.ts`
- `apps/api/src/assets/assets.module.ts`
- `apps/api/src/users/users.service.ts`
- `apps/api/src/users/users.service.spec.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/src/app/creator/page.tsx`
- `apps/web/src/app/drafts/[id]/page.tsx`
- `apps/web/src/components/editor/rich-text-editor.tsx`

### 暂不修改

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/**`
- `apps/api/src/audit/**`
- `apps/api/src/scoring/**`
- `apps/api/src/publish/**`
- `apps/api/src/ranking/**`
- `apps/api/src/feed/**`
- 用户资料页和用户资料编辑相关文件

## 5. 数据模型或 API 变更

### Prisma 数据模型

本阶段不修改 Prisma schema，复用已有 `Asset`：

```prisma
model Asset {
  id          String   @id @default(cuid())
  authorId    String
  filename    String
  mimeType    String
  url         String
  auditStatus String   @default("PENDING")
  metadata    Json
  createdAt   DateTime @default(now())

  author User @relation(fields: [authorId], references: [id], onDelete: Cascade)

  @@index([authorId])
  @@map("assets")
}
```

`Asset.url` 保存 CDN URL。

`metadata` 计划结构：

```json
{
  "kind": "IMAGE",
  "originalName": "cover.png",
  "size": 124000,
  "storageKey": "assets/user-id/asset-id.png",
  "cdnUrl": "https://cdn.example.com/assets/user-id/asset-id.png",
  "audit": {
    "decision": "PASS",
    "riskLevel": "none",
    "categories": [],
    "summary": "视觉审核通过",
    "model": "vision-audit-mock",
    "source": "MOCK"
  }
}
```

### 共享类型

新增：

```ts
export enum AssetKind {
  Image = "IMAGE",
  Document = "DOCUMENT",
}

export enum AssetAuditStatus {
  Passed = "PASSED",
  Warn = "WARN",
  Blocked = "BLOCKED",
}

export interface AssetAuditResult {
  decision: AssetAuditStatus;
  riskLevel: "none" | "low" | "medium" | "high";
  categories: RiskCategory[];
  evidence: Array<{ text: string; reason: string }>;
  summary: string;
  model: string;
  source: "MODEL" | "MOCK";
}

export interface AssetSummary {
  id: string;
  kind: AssetKind;
  filename: string;
  mimeType: string;
  url: string;
  auditStatus: AssetAuditStatus;
  metadata: {
    originalName: string;
    size: number;
    storageKey: string;
    audit: AssetAuditResult;
  };
  createdAt: string;
}

export interface UploadAssetResponse {
  asset: AssetSummary;
}

export interface ListAssetsResponse {
  items: AssetSummary[];
}

export interface DeleteAssetResponse {
  assetId: string;
  message: string;
}
```

### API 设计

```text
GET    /assets/mine
POST   /assets
DELETE /assets/:id
```

`POST /assets` 使用 `multipart/form-data`：

```text
file: File
```

### 环境变量

`.env.example` 新增：

```env
ASSET_STORAGE_MODE=mock
ASSET_CDN_BASE_URL=https://cdn.example.com
ASSET_BUCKET=bytecamp-assets
ASSET_REGION=auto
ASSET_ENDPOINT=
ASSET_ACCESS_KEY_ID=
ASSET_SECRET_ACCESS_KEY=

ASSET_AUDIT_MODE=mock
ASSET_VISION_MODEL=
```

说明：

- `ASSET_STORAGE_MODE=mock`：不访问云，返回 CDN 风格 URL，服务本地测试。
- `ASSET_STORAGE_MODE=s3`：使用 S3-compatible 对象存储。
- `ASSET_AUDIT_MODE=mock`：返回可预测视觉审核结果。
- `ASSET_AUDIT_MODE=live`：必须配置视觉模型，失败则拒绝上传。
- `ASSET_AUDIT_MODE=auto`：有视觉模型配置走 live，否则 mock。

## 6. 前端交互与页面状态设计

### 创作者主页 `/creator`

- 保留现有数据概览。
- 后端继续返回真实阅读量、点赞、收藏、作品数和平均质量分。
- 粉丝数暂为 `0`，文案明确“关注模型未接入，当前展示 0”。
- 不新增资料页入口。

### 草稿编辑页素材面板

右侧面板标签：

```text
AI 创作 | 内容建议 | 素材
```

素材状态：

```ts
type AssetPanelState = "loading" | "idle" | "uploading" | "failed";
```

交互：

1. 打开草稿编辑页时加载 `GET /assets/mine`。
2. 切到“素材”标签后展示上传区和素材列表。
3. 上传图片或资料文件：
   - 前端先做文件大小和 MIME 预检查。
   - 后端再次校验，后端结果为准。
   - 图片上传时显示“视觉审核中 / 上传到云存储中”。
4. 图片素材显示缩略图、文件名、大小、上传时间和审核状态。
5. `PASS` 图片可直接插入正文。
6. `WARN` 图片可插入正文，但按钮旁展示风险提醒。
7. `BLOCK` 图片不会出现在可插入列表，因为后端不会返回可用素材。
8. 点击“插入正文”后调用编辑器命令插入图片节点，`src` 使用 CDN URL。
9. 点击“复制 URL”复制 CDN URL。
10. 点击“删除”删除素材记录并请求后端删除云对象。
11. 资料文件展示为文件卡片，只允许复制 CDN URL或删除，不允许插入正文。
12. 多模态生成入口显示为预留状态，不影响保存、审核和发布。

视觉要求：

- 继续使用浅灰应用背景、白色编辑画布、右侧浅色助手面板。
- 素材卡片保持 6px 到 8px 圆角，紧凑工具化，不做营销式大卡片。
- 上传、审核、失败提示使用克制的浅色提示条。
- 移动端改为单列，素材面板位于编辑器下方，不能遮挡正文输入。

## 7. 后端服务、鉴权、审核、评分、发布或榜单逻辑

### 鉴权

- 所有素材接口必须使用 `JwtAuthGuard`。
- `GET /assets/mine` 只返回当前用户素材。
- `DELETE /assets/:id` 只能删除当前用户自己的素材。
- 前端不得传 `authorId`。

### 素材上传服务

- `AssetsService` 负责：
  - 校验文件存在。
  - 校验大小上限：
    - 图片 5 MB。
    - 资料文件 10 MB。
  - 校验 MIME 类型白名单。
  - 清洗文件名，只保留安全 basename 和安全后缀。
  - 生成对象存储 key：`assets/{userId}/{assetId}.{ext}`。
  - 对图片调用 `AssetAuditService.auditImage`。
  - `BLOCK` 时拒绝上传和入库。
  - `PASS` / `WARN` 时调用 `CloudStorageService.uploadObject`。
  - 写入 `assets` 表，`url` 为 CDN URL。
- `AssetsController` 使用 Nest `FileInterceptor` 接收文件。
- 不暴露本地 `/uploads` 静态目录。

### 云存储服务

`CloudStorageService` 提供：

```ts
interface CloudStorageUploadInput {
  key: string;
  body: Buffer;
  contentType: string;
}

interface CloudStorageUploadResult {
  key: string;
  cdnUrl: string;
}

uploadObject(input: CloudStorageUploadInput): Promise<CloudStorageUploadResult>;
deleteObject(key: string): Promise<void>;
```

模式：

- `mock`：不访问外部网络，只按 `ASSET_CDN_BASE_URL` 拼接 CDN URL。
- `s3`：使用 S3-compatible API 上传对象。

### 视觉审核服务

`AssetAuditService` 提供：

```ts
auditImage(input: {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}): Promise<AssetAuditResult>;
```

审核规则：

- 文件名命中“赌博、毒品、违法、色情”等高风险词时直接 `BLOCK`。
- mock 模式：
  - 文件名包含 `warn` 返回 `WARN`。
  - 文件名包含 `block` 或高风险词返回 `BLOCK`。
  - 其他返回 `PASS`。
- live 模式：
  - 通过 AI Gateway 或 OpenAI-compatible 视觉模型提交图片内容。
  - 要求模型返回 JSON 结构。
  - 结构不合法或调用失败时拒绝上传。

### 审核、评分、发布、榜单逻辑

- 本阶段不修改文章发布强审核和质量评分逻辑。
- 已插入正文的图片节点会随草稿正文 JSON 保存，发布时仍走现有审核、评分和发布流程。
- 素材本身不会进入榜单排序。
- 榜单仍只读取已发布文章、质量分和互动事件。

## 8. 风险、边界情况和回滚方案

| 风险 | 处理 |
| --- | --- |
| 云存储密钥缺失 | 本地默认 `ASSET_STORAGE_MODE=mock`，live 部署前必须配置 |
| 云存储上传失败 | 不写入素材记录，前端展示上传失败 |
| CDN 域名配置错误 | mock 和测试校验 URL 拼接，部署时通过环境变量修正 |
| 视觉审核模型不可用 | `live` 模式拒绝上传；`mock/auto` 模式按配置降级 |
| 图片审核耗时较长 | 前端展示“视觉审核中”，按钮禁用防重复提交 |
| 前端伪造 MIME 类型 | 后端以 MIME 白名单和文件后缀共同校验，后续可增加二进制嗅探 |
| 文件名路径穿越 | 后端丢弃原路径，只保留安全 basename 和随机对象 key |
| 用户删除已插入正文的图片素材 | 删除云对象可能导致正文旧图失效，删除前提示 |
| 资料文件内容未深度审核 | 本阶段只做类型、大小和文件名规则校验，后续可加文本抽取审核 |
| 粉丝数没有关注模型 | 后端返回 0，页面说明 MVP 未接入关注关系，不伪造数据 |

回滚方案：

- 前端可临时隐藏“素材”标签，草稿编辑仍保留手动 URL 插图。
- 后端可从 `AssetsModule` 移除 controller 注册，已有草稿、发布、榜单不受影响。
- 云存储异常时可切回 `ASSET_STORAGE_MODE=mock` 做本地演示，但生产仍应配置真实对象存储。
- 视觉审核异常时可切回 `ASSET_AUDIT_MODE=mock` 做本地演示，但生产 live 模式保持失败拒绝上传。

## 9. 验证方式和测试计划

### 自动化测试

按 TDD 顺序实现，先写失败测试再写实现：

- `apps/api/src/users/users.service.spec.ts`
  - 创作者统计返回真实阅读量、点赞、收藏、作品数和平均质量分。
  - 粉丝数在无关注模型时返回 0。
  - 撤回文章不计入已发布作品数。
- `apps/api/src/assets/assets.service.spec.ts`
  - 允许上传合法图片，并写入 CDN URL。
  - 允许上传合法资料文件，并写入 CDN URL。
  - 图片上传前会调用视觉审核服务。
  - `WARN` 图片可入库，审核状态为 `WARN`。
  - `BLOCK` 图片不会上传云存储，不会写入素材记录。
  - 拒绝超大文件。
  - 拒绝不支持 MIME 类型。
  - 拒绝命中高风险文件名。
  - 只能删除当前用户自己的素材。
  - 删除素材时调用云存储删除对象。
- `apps/web/src/lib/assets.test.ts`
  - 文件大小格式化。
  - MIME 类型到素材类型映射。
  - 上传按钮禁用状态。
  - 审核状态文案。
  - 图片素材可插入，资料文件不可插入。

### 类型检查和构建

需要运行：

```bash
corepack pnpm typecheck
corepack pnpm --filter @bytecamp-aigc/api test
corepack pnpm --filter @bytecamp-aigc/web test
corepack pnpm --filter @bytecamp-aigc/web build
```

用户已明确验证时不用执行：

```bash
corepack pnpm test:e2e:smoke
```

本阶段不修改 Prisma schema，默认不需要迁移。若实现过程中发现必须改 schema，需要先更新方案并确认。

### 手动验证

1. 登录演示账号。
2. 进入 `/creator`，确认阅读量、作品数、点赞、收藏和平均质量分来自真实数据。
3. 确认粉丝数展示为 0，并说明关注模型未接入。
4. 进入草稿编辑页 `/drafts/:id`。
5. 切换到“素材”标签。
6. 上传一张合法图片，确认展示“视觉审核中 / 上传中”状态。
7. 审核通过后确认素材卡片出现，图片地址为 CDN URL。
8. 点击“插入正文”，确认图片进入 TipTap 正文。
9. 保存草稿，刷新后确认图片节点仍存在，`src` 为 CDN URL。
10. 上传文件名包含 `warn` 的图片，确认显示 WARN 风险提醒但可插入。
11. 上传文件名包含 `block` 或高风险词的图片，确认被视觉审核拦截。
12. 上传不支持类型或超大文件，确认错误提示。
13. 上传资料文件，确认可展示和复制 CDN URL，但不能插入正文。
14. 删除素材，确认列表刷新。
15. 确认“多模态生成”入口已显示为预留状态，不阻塞保存和发布。

## 10. 初学者学习文档计划

实现完成后生成：

```text
docs/learn/016-assets-cloud-vision-audit-learning.md
```

学习文档至少解释：

- 这个功能解决了什么业务问题：为什么图片和资料文件不能只存在前端或本地磁盘。
- 用户从上传文件，到后端校验、视觉审核、云存储上传、数据库记录，再到编辑器插入图片的完整链路。
- 涉及的前端、后端、共享包文件。
- React 状态、FormData、Nest Controller、Service、Prisma、JWT Guard、TipTap Image、云存储、CDN URL、视觉审核模型分别承担什么责任。
- 成功路径和失败路径分别发生什么。
- 为什么云存储密钥、视觉审核裁决和 CDN URL 生成必须放在后端。
- 为什么本地测试可以 mock 云存储和视觉审核，但生产 live 模式不能在审核失败时放行。
- 如何通过页面、接口、数据库、类型检查、测试和构建命令验证功能正确。
- 常见误区：前端直传绕过审核、把云存储密钥暴露给浏览器、上传接口手动设置 multipart boundary、把资料文件当图片插入、删除素材不提示正文旧图可能失效、把粉丝数伪造成真实数据。
