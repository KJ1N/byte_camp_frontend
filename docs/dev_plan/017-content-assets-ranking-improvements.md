# 我的内容删除、素材文件夹与榜单说明技术方案

## 1. 功能目标和用户价值

本轮开发覆盖四条业务链路：

1. 在创作者主页“我的内容”区域，每张内容卡片右下角增加删除文章/草稿按钮，方便创作者直接清理不再需要的内容。
2. 将素材管理改为“文件夹优先”的管理方式：侧栏只展示图片素材文件夹和资料文件夹，点击文件夹后用最高层级弹窗展示该文件夹内的素材卡片；上传前先弹出带背景模糊的文件夹选择弹窗，支持创建、重命名、删除文件夹。
3. 资料文件白名单只保留 `txt`、`md`、`docx`。资料文件必须在后端先抽取为文字并完成合规检查，通过后才上传云存储。正文引用资料只能使用附件卡片或选择部分抽取文本插入正文。
4. 首页热点榜和爆文榜展示排序逻辑说明，并给出创作者指引，让榜单结果可解释。

用户价值：

- 创作者不必跳转到草稿箱才能删除内容，管理效率更高。
- 素材按文件夹组织，图片与资料文件不混在长列表里，更符合生产工具的管理习惯。
- 资料文件在入云前先经过文本合规校验，避免未审核资料进入云端和正文链路。
- 榜单排序规则对创作者透明，用户能知道应该提升质量、热度、新鲜度和互动反馈，而不是盲目猜测。

用户本轮已明确说明：“技术文档后不需要等我同意，直接开始开发，中间不停下来”。因此本方案写入后直接进入实现。

## 2. 涉及模块

### 前端 `apps/web`

- `apps/web/src/app/creator/page.tsx`
  - 在“我的内容”卡片右下角新增删除按钮和确认态。
  - 复用后端 `DELETE /drafts/:id`，删除草稿会级联删除关联文章。
- `apps/web/src/components/asset-panel.tsx`
  - 改为文件夹列表优先展示。
  - 上传前展示最高层级弹窗选择目标文件夹，背景使用 `backdrop-blur`。
  - 文件夹支持创建、重命名、删除。
  - 点击文件夹打开素材选择弹窗，只在弹窗内展示对应素材卡片。
  - 图片素材卡片点击后显示预览和插入按钮。
  - 资料文件卡片点击后显示附件引用、抽取文本预览、选中文本插入入口。
- `apps/web/src/app/workspace/page.tsx`
  - 增加资料附件卡片插入和资料文本插入回调。
- `apps/web/src/app/drafts/[id]/page.tsx`
  - 同步增加资料附件卡片插入和资料文本插入回调。
- `apps/web/src/components/editor/rich-text-editor.tsx`
  - 支持外部请求插入附件卡片和纯文本段落。
- `apps/web/src/lib/assets.ts`
  - 更新资料文件 MIME 白名单。
  - 新增文件夹过滤、默认文件夹选择、资料文本选择 helper。
- `apps/web/src/lib/assets.test.ts`
  - 覆盖新白名单、文件夹 helper、附件卡片可插入规则。
- `apps/web/src/app/page.tsx`
  - 在热点榜和爆文榜面板增加排序算法说明和创作者指引。

### 后端 `apps/api`

- `apps/api/prisma/schema.prisma`
  - 新增 `AssetFolder` 模型。
  - `Asset` 新增 `folderId` 可空字段并关联文件夹。
  - 用 `metadata` 保存资料文件抽取文本、文本摘要和文本审核结果。
- `apps/api/prisma/migrations/**`
  - 新增一次迁移，创建素材文件夹表并给素材表增加 `folderId`。
- `apps/api/src/assets/assets.controller.ts`
  - 新增文件夹 CRUD API。
  - 上传接口接收 `folderId`。
- `apps/api/src/assets/assets.service.ts`
  - 校验目标文件夹归属和类型。
  - 上传资料文件前抽取文字并执行文本规则审核。
  - 拒绝 `pdf` 等不在白名单的资料文件。
  - 返回文件夹列表、文件夹内素材列表和资料文本元数据。
- `apps/api/src/assets/assets.service.spec.ts`
  - TDD 覆盖文件夹 CRUD、上传到指定文件夹、资料文件抽取审核、白名单和权限。
- `apps/api/src/drafts/drafts.service.ts`
  - 继续作为“删除我的内容”的后端入口，已有级联和榜单缓存清理逻辑保持不变。

### 共享包 `packages/shared`

- `packages/shared/src/index.ts`
  - 新增 `AssetFolderKind`、`AssetFolderSummary`、文件夹 CRUD DTO。
  - `AssetSummary.metadata` 扩展 `textContent`、`textPreview` 等资料文件公开字段。
  - `UploadAssetResponse` 继续返回上传后的素材。

## 3. 需要新增或修改的文件

新增：

- `docs/dev_plan/017-content-assets-ranking-improvements.md`
- `docs/learn/017-content-assets-ranking-improvements-learning.md`
- `apps/api/prisma/migrations/20260608000000_asset_folders_and_document_text/migration.sql`

修改：

- `packages/shared/src/index.ts`
- `apps/api/prisma/schema.prisma`
- `apps/api/src/assets/assets.controller.ts`
- `apps/api/src/assets/assets.service.ts`
- `apps/api/src/assets/assets.service.spec.ts`
- `apps/web/src/lib/assets.ts`
- `apps/web/src/lib/assets.test.ts`
- `apps/web/src/components/asset-panel.tsx`
- `apps/web/src/components/editor/rich-text-editor.tsx`
- `apps/web/src/app/workspace/page.tsx`
- `apps/web/src/app/drafts/[id]/page.tsx`
- `apps/web/src/app/creator/page.tsx`
- `apps/web/src/app/page.tsx`

## 4. 数据模型或 API 变更

### Prisma

新增：

```prisma
model AssetFolder {
  id        String   @id @default(cuid())
  authorId  String
  kind      String
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  author User    @relation(fields: [authorId], references: [id], onDelete: Cascade)
  assets Asset[]

  @@index([authorId, kind])
  @@unique([authorId, kind, name])
  @@map("asset_folders")
}
```

`Asset` 增加：

```prisma
folderId String?
folder   AssetFolder? @relation(fields: [folderId], references: [id], onDelete: SetNull)
@@index([folderId])
```

### API

```text
GET    /assets/folders
POST   /assets/folders
PATCH  /assets/folders/:id
DELETE /assets/folders/:id

GET    /assets/mine?folderId=xxx
POST   /assets
DELETE /assets/:id
```

`POST /assets` 使用 `multipart/form-data`：

```text
file: File
folderId: string
```

### 资料文件白名单

保留：

```text
text/plain
text/markdown
application/vnd.openxmlformats-officedocument.wordprocessingml.document
```

拒绝：

```text
application/pdf
application/zip
其他未知 MIME
```

### 资料文件文本抽取与审核

- `txt` 和 `md` 使用 UTF-8 解码为文字。
- `docx` 使用轻量 XML 抽取方案，从 zip 内容中读取 `word/document.xml` 的文本节点；若抽取失败则拒绝上传。
- 资料文本为空时拒绝上传。
- 文本命中高风险词时拒绝上传。
- 审核通过后才上传云存储，并把文本预览和完整抽取文本写入 `metadata`，供前端插入正文使用。

## 5. 前端交互与页面状态设计

### 我的内容删除

- 每张卡片保留现有查看、编辑、撤回等操作。
- 卡片底部右侧固定展示“删除”按钮。
- 点击后展示卡片内确认区：
  - 草稿：提示“删除后不可恢复”。
  - 已发布/已撤回文章：提示“删除后会移除关联文章和草稿”。
- 确认后调用 `DELETE /drafts/:draftId`。
- 成功后重新加载创作者数据。

### 素材文件夹

- 侧栏只展示文件夹，不直接展示所有素材。
- 图片素材和资料文件分别有独立区域。
- 默认创建或展示“默认图片”“默认资料”虚拟入口；没有真实文件夹时允许用户创建。
- 上传按钮点击后不直接打开系统文件选择，而是先弹出最高层级文件夹选择弹窗。
- 弹窗 `z-index` 高于页面其他层，背景使用半透明遮罩和 `backdrop-blur-sm`。
- 选择文件夹后再打开文件选择器。
- 点击文件夹打开素材选择弹窗：
  - 图片卡片只展示名称；点击卡片后显示预览、审核状态、插入正文、复制 URL、删除。
  - 资料卡片只展示名称；点击卡片后显示抽取文本预览、附件卡片插入、选中文本插入、复制 URL、删除。

### 正文引用资料

- 附件卡片插入：在正文插入一个带文件名、类型、大小和链接的引用块。
- 选取部分插入文本：用户在资料预览 textarea 中选择文本，点击后把选中文本作为新段落插入正文。
- 不支持把资料文件 URL 当普通图片或裸链接自动插入正文。

### 首页榜单说明

- 热点榜说明：热度优先，主要看阅读、点赞、收藏和发布时间衰减。
- 爆文榜说明：综合排序，质量分、热度、新鲜度和反馈共同影响。
- 创作者指引：提高内容价值和表达质量，发布后争取真实互动，保持内容更新节奏。

## 6. 后端服务、鉴权、审核、评分、发布或榜单逻辑

- 所有文件夹和素材接口继续使用 `JwtAuthGuard`。
- 文件夹只能操作当前用户自己的记录。
- 图片素材只能放入图片文件夹，资料文件只能放入资料文件夹。
- 删除非空文件夹时拒绝，避免素材失去清晰归属。
- 删除素材时继续调用云存储删除对象。
- 资料文件审核在云上传前完成：
  - 类型和大小校验。
  - 文件名风险词校验。
  - 文本抽取。
  - 文本合规词规则审核。
  - 通过后上传云存储并入库。
- 榜单后端排序算法不变，本轮只在首页展示解释。
- 删除发布文章通过删除关联草稿完成，Prisma 级联删除文章、评分、审核记录和互动事件；已发布文章从 Redis 榜单缓存移除。

## 7. 风险、边界情况和回滚方案

| 风险 | 处理 |
| --- | --- |
| 现有素材没有文件夹 | 列表仍可兼容 `folderId = null`，前端提供创建文件夹后上传的新路径 |
| 删除非空文件夹导致素材无归属 | 后端拒绝删除非空文件夹 |
| docx 抽取不完整 | MVP 只抽取 `word/document.xml` 主正文，抽取失败直接拒绝 |
| 资料文件过大或文本过长 | 继续使用 10MB 文件上限，前端预览截断，metadata 保留可用文本 |
| 用户上传伪造 MIME | 后端 MIME 白名单为主，后续可扩展二进制嗅探 |
| 删除文章误操作 | 卡片内二次确认，成功后刷新列表 |
| 首页说明过于占空间 | 使用紧凑说明块，保持工具化信息密度 |

回滚方案：

- 前端可隐藏文件夹弹窗和资料插入按钮，保留已有素材上传接口。
- 后端可继续允许 `folderId` 为空，旧素材不受影响。
- 删除按钮可从“我的内容”卡片移除，不影响草稿箱删除入口。
- 榜单说明为纯前端文案，可单独回滚。

## 8. 验证方式和测试计划

### TDD 测试

- `apps/api/src/assets/assets.service.spec.ts`
  - 创建图片/资料文件夹。
  - 重命名当前用户文件夹。
  - 拒绝删除非空文件夹。
  - 上传图片必须指定当前用户图片文件夹。
  - 上传资料文件必须指定当前用户资料文件夹。
  - txt/md/docx 抽取文字并通过审核后才上传。
  - pdf 被拒绝。
  - 命中文本高风险规则的资料文件不上传云。
- `apps/web/src/lib/assets.test.ts`
  - 资料文件白名单只包含 txt/md/docx。
  - 文件夹按图片/资料类型过滤。
  - 默认选中同类型第一个文件夹。
  - 附件卡片插入只允许审核通过或警告的资料文件。
- `apps/web/src/lib/creator-overview.test.ts`
  - 内容操作增加删除动作，发布态仍保留查看、编辑、撤回。

### 类型检查和构建

需要运行：

```bash
corepack pnpm --filter @bytecamp-aigc/api test
corepack pnpm --filter @bytecamp-aigc/web test
corepack pnpm typecheck
corepack pnpm --filter @bytecamp-aigc/web build
```

修改 Prisma schema 后需要运行：

```bash
corepack pnpm prisma:generate
```

如本地没有数据库，不运行迁移应用，只检查 migration SQL 和 Prisma generate。

### 手动验证

1. 登录后进入 `/creator`，切到“我的内容”。
2. 确认每张卡片右下角有删除按钮，删除前有确认态。
3. 进入 `/workspace` 或 `/drafts/:id`，切到素材栏。
4. 确认侧栏只显示文件夹。
5. 上传前先弹出文件夹选择弹窗，背景模糊。
6. 创建、重命名、删除空文件夹。
7. 上传图片到图片文件夹，点击文件夹后在弹窗中看到图片名称卡片，点击卡片后出现预览和插入按钮。
8. 上传 txt/md/docx 到资料文件夹，点击文件卡片后看到抽取文本预览。
9. 插入资料附件卡片，确认正文出现附件块。
10. 选中资料预览文本并插入正文，确认正文新增文本段落。
11. 上传 pdf，确认前端和后端均拒绝。
12. 首页确认热点榜和爆文榜都有排序解释和创作者指引。

## 9. 初学者学习文档计划

实现完成后生成：

```text
docs/learn/017-content-assets-ranking-improvements-learning.md
```

学习文档会解释：

- 为什么删除文章应从“我的内容”进入，但后端复用草稿删除链路。
- 为什么素材要先按文件夹管理，再展示具体卡片。
- FormData 如何带上 `folderId`。
- Nest Controller 如何接收上传文件和路由参数。
- Service 为什么负责文件夹归属、白名单、文本抽取、审核和云上传。
- Prisma 关系如何让文件夹拥有素材。
- TipTap 正文中附件卡片和普通文本分别如何表示。
- 榜单排序公式如何影响创作者行为。
- 如何用页面、接口、数据库、类型检查、测试和构建命令验证本功能。
