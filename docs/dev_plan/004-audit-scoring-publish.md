# 审核、评分与发布闭环技术方案

## 1. 功能目标和用户价值

本阶段承接已经完成的登录、创作工作台、草稿保存和草稿编辑能力，补齐 PRD 中 MVP 的第二段核心闭环：

```text
草稿编辑 -> 发布前审核 -> 质量评分 -> 审核通过后发布 -> 生成文章快照 -> 查看最小文章详情
```

用户价值：

- 创作者不再只停留在“保存草稿”，可以把草稿推进到可发布内容。
- 发布动作必须经过后端审核和评分，符合“审核是发布链路强约束”的架构原则。
- WARN/BLOCK 风险会给出证据和修改建议，帮助初学者理解内容安全不是简单拦截，而是“识别风险 -> 解释原因 -> 修改后重审”。
- 生成文章快照后，为下一阶段推荐流、热点榜、爆文榜和互动反馈提供真实数据来源。

## 2. 下一步范围选择

### 推荐方案：审核评分发布闭环 + 最小文章详情

本阶段实现：

- `POST /audit/check`
- `POST /scoring/article`
- `POST /publish/:draftId`
- `/publish/[id]` 发布确认页
- `/articles/[id]` 最小文章详情页
- 草稿编辑页增加“预览并发布”入口

优点：

- 能直接推进 PRD 验收标准中的“发布动作必须经过 AI 审核和质量评分”。
- 后端强制执行审核和评分，前端只展示状态和结果，模块边界清晰。
- 不提前展开完整榜单、互动和作品管理，风险可控。

代价：

- 需要同时改动前端、后端和共享类型。
- 发布页和文章详情页先保持 MVP 级别，完整分发体验留到下一阶段。

### 备选方案 A：只做后端审核/评分/发布 API

优点：

- 变更更小，便于先把服务层和数据持久化打稳。

代价：

- 用户无法通过页面完成演示脚本。
- 初学者不容易理解从页面操作到后端状态变化的完整链路。

### 备选方案 B：一次性完成发布、详情、信息流、榜单和互动

优点：

- 更接近最终验收闭环。

代价：

- 跨越审核、评分、发布、Feed、Ranking、Analytics 多个模块，范围过大。
- Redis 回退、分页、互动排序、seed 数据和 E2E 会一起进入，容易影响已有稳定能力。

本阶段采用推荐方案，下一阶段再进入“内容详情、信息流与榜单”完整分发闭环。

## 3. 涉及模块

### 前端 `apps/web`

- 草稿编辑页 `/drafts/[id]`：新增发布入口。
- 新增发布确认页 `/publish/[id]`：展示草稿预览、审核结果、质量评分和发布按钮。
- 新增最小文章详情页 `/articles/[id]`：展示已发布文章快照、作者、发布时间、正文和本次质量分/审核摘要。
- 扩展 API 调用封装或页面局部调用，统一携带 JWT token。
- 页面主体样式继续使用 Tailwind CSS utility class，沿用工作台/草稿编辑页的头条发布后台风格。

### 后端 `apps/api`

- `audit` 模块：新增 controller，开放 `POST /audit/check`；增强 service，使其可返回 PASS/WARN/BLOCK 并写入审核记录。
- `scoring` 模块：新增 controller，开放 `POST /scoring/article`；增强 service，使其写入质量评分记录。
- `publish` 模块：新增 controller/service，开放 `POST /publish/:draftId`；发布时强制重新执行审核和评分，通过后创建文章快照。
- 可在 `publish` 或新建轻量查询能力中支持 `GET /articles/:id`，为最小文章详情页提供数据。
- 复用现有 `JwtAuthGuard` 和 `PrismaService`。

### 共享包 `packages/shared`

- 增加审核、评分、发布、文章详情相关 DTO。
- 增加 `ArticleStatus` 枚举或文章详情类型。
- 增加富文本转纯文本工具，供审核、评分、摘要生成和前端展示复用。

## 4. 需要新增或修改的文件

### 新增文件

- `apps/api/src/audit/audit.controller.ts`
- `apps/api/src/scoring/scoring.controller.ts`
- `apps/api/src/publish/publish.controller.ts`
- `apps/api/src/publish/publish.service.ts`
- `apps/api/src/publish/publish.service.spec.ts`
- `apps/web/src/app/publish/[id]/page.tsx`
- `apps/web/src/app/publish/[id]/layout.tsx`
- `apps/web/src/app/articles/[id]/page.tsx`
- `apps/web/src/app/articles/[id]/layout.tsx`
- `docs/learn/004-audit-scoring-publish-learning.md`（实现完成后生成，本地学习文档，不上传 GitHub）

### 修改文件

- `packages/shared/src/index.ts`
- `apps/api/src/audit/audit.module.ts`
- `apps/api/src/audit/audit.service.ts`
- `apps/api/src/scoring/scoring.module.ts`
- `apps/api/src/scoring/scoring.service.ts`
- `apps/api/src/publish/publish.module.ts`
- `apps/api/src/app.module.ts`（如模块引用已存在，则只保持现状）
- `apps/web/src/app/drafts/[id]/page.tsx`
- `apps/web/src/lib/api.ts`（仅在确有复用价值时扩展）

### 暂不修改

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/**`
- `apps/api/src/feed/**`
- `apps/api/src/ranking/**`
- `apps/api/src/analytics/**`
- 创作者主页的作品管理占位状态

## 5. 数据模型或 API 变更

### 数据模型

本阶段不修改 Prisma schema，复用现有表：

- `drafts`
- `audit_records`
- `quality_scores`
- `articles`
- `article_revisions`

原因：

- 当前 schema 已经包含发布闭环所需核心表。
- 不新增迁移可以降低回滚成本。
- Feed、Ranking、Analytics 后续再基于 `articles` 和 `engagement_events` 扩展。

### 共享类型

计划新增：

```ts
export enum ArticleStatus {
  Published = "PUBLISHED",
  Withdrawn = "WITHDRAWN",
}

export interface AuditCheckInput {
  draftId: string;
}

export interface AuditCheckResponse {
  recordId: string;
  result: AuditResult;
  createdAt: string;
}

export interface ScoringArticleInput {
  draftId: string;
}

export interface ScoringArticleResponse extends QualityScore {
  scoreId: string;
  createdAt: string;
}

export interface PublishArticleResponse {
  articleId?: string;
  status: "PUBLISHED" | "BLOCKED" | "NEEDS_REVISION";
  audit: AuditCheckResponse;
  score: ScoringArticleResponse;
  message: string;
}

export interface ArticleDetail {
  id: string;
  draftId: string;
  title: string;
  body: RichTextDocument;
  summary: string;
  status: ArticleStatus;
  author: {
    id: string;
    nickname: string;
  };
  publishedAt: string;
  updatedAt: string;
  latestAudit?: AuditCheckResponse;
  latestScore?: ScoringArticleResponse;
}
```

`AuditCheckResponse` 使用组合结构，避免把业务结果字段和记录元信息混在同一层，前端读取时也更容易区分“审核裁决”和“数据库记录”。

### API 设计

#### `POST /audit/check`

鉴权：需要 `Authorization: Bearer <token>`。

请求：

```json
{
  "draftId": "draft_id"
}
```

行为：

- 后端根据当前用户和 `draftId` 加载草稿。
- 从 ProseMirror JSON 中提取纯文本。
- 调用 `AuditService` 得到审核结果。
- 写入 `audit_records`，`stage` 使用 `PUBLISH_PRECHECK`。
- 返回审核结果、记录 id 和创建时间。

#### `POST /scoring/article`

鉴权：需要 `Authorization: Bearer <token>`。

请求：

```json
{
  "draftId": "draft_id"
}
```

行为：

- 后端根据当前用户和 `draftId` 加载草稿。
- 提取标题和正文纯文本。
- 调用 `ScoringService` 得到五维分和总分。
- 写入 `quality_scores`。
- 返回评分结果、记录 id 和创建时间。

#### `POST /publish/:draftId`

鉴权：需要 `Authorization: Bearer <token>`。

行为：

- 后端根据当前用户和 `draftId` 加载草稿。
- 发布接口内部重新执行审核和评分，不能信任前端预检查结果。
- 如果审核结果为 `BLOCK`：写入审核记录和评分记录，返回 `BLOCKED`，不创建文章。
- 如果审核结果为 `WARN`：写入审核记录和评分记录，返回 `NEEDS_REVISION`，不创建文章。
- 如果审核结果为 `PASS`：创建 `articles` 和 `article_revisions`，写入审核记录和评分记录，更新草稿状态为 `PUBLISHED`。
- 返回文章 id 和本次审核/评分结果。

#### `GET /articles/:id`

鉴权：MVP 阶段可先允许公开读取已发布文章。

行为：

- 只返回 `status = PUBLISHED` 的文章。
- 返回作者昵称、标题、正文、摘要、发布时间、最新审核摘要和最新质量分。
- 互动统计、榜单来源和相关推荐留到下一阶段。

## 6. 前端交互与页面状态设计

### 草稿编辑页 `/drafts/[id]`

新增底部操作：

- `预览并发布`：跳转 `/publish/[id]`。
- 当草稿存在未保存修改、正在保存或草稿加载失败时禁用发布入口。
- 禁用状态下提示用户先保存草稿，避免发布旧内容。

保留：

- 手动保存。
- 自动保存。
- 本地恢复。
- 版本记录只读展示。

### 发布确认页 `/publish/[id]`

页面布局：

- 顶部白色导航栏，左侧返回草稿，右侧显示当前用户。
- 主体浅灰背景，左侧白色文章预览画布，右侧审核与评分面板。
- 左侧显示标题、正文纯文本预览和草稿版本信息。
- 右侧显示发布流程状态。

页面状态：

- `loading`：加载草稿。
- `ready`：草稿加载完成，可开始审核。
- `checking`：调用审核和评分。
- `pass`：审核通过，展示质量分和确认发布按钮。
- `warn`：展示风险片段和修改建议，引导返回编辑。
- `block`：展示高危拦截说明，只允许返回编辑。
- `publishing`：调用 `POST /publish/:draftId`。
- `published`：发布成功后自动跳转文章详情页。
- `error`：展示接口错误和重试入口。

交互规则：

- 点击 `开始审核` 后，前端依次调用 `POST /audit/check` 和 `POST /scoring/article`。
- 只有审核结果 `PASS` 时显示 `确认发布`。
- 点击 `确认发布` 后调用 `POST /publish/:draftId`，发布成功后自动进入 `/articles/:id`。
- 即使前端已经预检查通过，后端发布接口仍会重新审核和评分，防止绕过。
- WARN/BLOCK 时展示 `evidence`、`summary` 和 `rewriteSuggestions`。

### 最小文章详情页 `/articles/[id]`

页面目标：

- 验证发布后生成的文章快照确实可被读取。
- 为下一阶段 Feed、Ranking 和 Analytics 提供落点。

展示内容：

- 文章标题。
- 作者昵称。
- 发布时间。
- 正文内容。
- 质量总分和五维评分。
- 审核摘要。

暂不展示：

- 阅读量、点赞、收藏。
- 推荐来源。
- 榜单排名。
- 评论。

## 7. 后端服务、鉴权、审核、评分、发布或榜单逻辑

### 鉴权

- `POST /audit/check`、`POST /scoring/article` 和 `POST /publish/:draftId` 全部使用 `JwtAuthGuard`。
- 所有草稿读取都必须包含 `{ id: draftId, authorId: currentUser.userId }` 条件。
- 前端不得传入 authorId、审核裁决或质量分。

### 审核逻辑

MVP 继续使用 mock/rule-based 审核，但要覆盖三类结果：

- 命中高危词，如“赌博”“毒品”“违法犯罪引导”：`BLOCK`。
- 命中中风险词，如“身份证号”“低俗”“绝对稳赚”“医疗偏方”：`WARN`。
- 未命中明显风险：`PASS`。

审核输出必须包含：

- `decision`
- `riskLevel`
- `categories`
- `evidence`
- `rewriteSuggestions`
- `summary`

### 质量评分逻辑

MVP 继续使用 deterministic 评分，便于测试：

- 基于正文长度、标题完整度、段落数量生成基础分。
- 根据审核结果调整 `safetyScore`。
- 按 `qualityWeights` 计算 overall。
- 写入 `quality_scores`。

后续真实模型接入时，仍只替换 `ScoringService` 内部实现。

### 发布逻辑

发布接口是最终裁决点：

```text
load draft by current user
  -> extract plain text
  -> audit
  -> scoring
  -> if BLOCK/WARN return without article
  -> create article snapshot
  -> create article revision
  -> update draft status PUBLISHED
  -> return articleId
```

边界：

- 已发布草稿重复发布时，优先返回已有文章或明确提示已发布，避免重复生成多篇文章。
- 发布失败不删除草稿，不覆盖草稿正文。
- WARN 内容不能直接发布，必须返回编辑后重审。

### 榜单逻辑

本阶段不实现 Redis Sorted Set 和榜单排序。

但是发布成功后生成的 `articles`、`quality_scores` 和 `audit_records` 将成为下一阶段 `feed/ranking` 的数据基础。

## 8. 风险、边界情况和回滚方案

| 风险 | 处理 |
| --- | --- |
| 前端预检查 PASS 后内容被修改 | 发布接口内部重新审核和评分，以后端结果为准 |
| 用户尝试发布他人草稿 | 所有查询都加 `authorId` 条件，找不到时返回 404 |
| WARN 内容被误发布 | `POST /publish/:draftId` 只允许 `PASS` 创建文章 |
| BLOCK 内容没有评分 | 仍可生成评分记录，但 `safetyScore` 降低，便于评估 |
| 重复点击发布 | 前端 `publishing` 状态禁用按钮，后端检查草稿状态或已有文章 |
| 富文本为空 | 审核可 PASS，但评分降低；发布页提示内容过短 |
| ProseMirror JSON 提取纯文本失败 | 返回明确错误，不创建文章 |
| 文章详情读取不存在内容 | 返回 404，前端展示错误和返回入口 |
| 发布事务中途失败 | 使用 Prisma transaction，保留草稿，避免产生半成品文章 |

回滚方案：

- 删除新增的 controller/service/page 文件。
- 恢复 `publish.module.ts`、`audit.module.ts`、`scoring.module.ts` 的 controller 引用。
- 移除草稿编辑页发布入口。
- 不涉及数据库迁移，回滚不需要处理 schema。

## 9. 验证方式和测试计划

### 测试先行

实现时优先补充后端服务测试：

- PASS 草稿可以发布并创建文章。
- WARN 草稿返回 `NEEDS_REVISION` 且不创建文章。
- BLOCK 草稿返回 `BLOCKED` 且不创建文章。
- 他人草稿不能发布。
- 重复发布不会创建重复文章。

测试文件建议：

```text
apps/api/src/publish/publish.service.spec.ts
```

如果当前测试环境暂不方便连接 Prisma 测试库，先对纯逻辑方法做单元测试，并在实现后通过手动 API 验证补足。

### 类型检查

```bash
pnpm typecheck
```

如当前环境没有裸 `pnpm`，使用：

```bash
corepack pnpm -r typecheck
```

### 构建检查

因为会新增 Next.js 路由和 NestJS controller/service，运行：

```bash
pnpm --filter @bytecamp-aigc/web build
pnpm --filter @bytecamp-aigc/api build
```

如需要 `corepack`：

```bash
corepack pnpm --filter @bytecamp-aigc/web build
corepack pnpm --filter @bytecamp-aigc/api build
```

### 手动页面验证

1. 启动数据库、API 和 Web。
2. 使用演示账号登录。
3. 进入工作台生成文章并保存草稿。
4. 进入草稿编辑页，确认有 `预览并发布` 入口。
5. 未保存修改时，确认发布入口要求先保存。
6. 保存后进入 `/publish/[id]`。
7. 正常内容点击 `开始审核`，确认显示 PASS 和质量分。
8. 点击 `确认发布`，确认发布成功并得到文章详情入口。
9. 打开 `/articles/[id]`，确认文章快照、作者、时间、审核摘要和质量分可见。
10. 编辑包含中风险词的草稿，确认 WARN 展示证据和修改建议，不能发布。
11. 编辑包含高风险词的草稿，确认 BLOCK 拦截，不能发布。
12. 使用无 token 或错误 token 调用发布接口，确认返回 401。

### 数据库验证

发布 PASS 后检查：

- `drafts.status = PUBLISHED`
- `articles` 新增一条记录
- `article_revisions` 新增一条初始版本
- `audit_records` 新增审核记录
- `quality_scores` 新增评分记录

WARN/BLOCK 后检查：

- `articles` 不新增记录
- `drafts.status` 保持 `DRAFT`，方便用户修改后直接重审
- `audit_records` 保留失败记录
- `quality_scores` 保留评分记录

## 10. 与总体架构的一致性

- `apps/web` 只负责发布确认页、状态展示、按钮交互和路由跳转。
- `apps/api` 负责草稿归属校验、审核裁决、质量评分、发布事务和文章持久化。
- `packages/shared` 负责前后端共享枚举、DTO 和富文本工具。
- AI 密钥、审核裁决、质量评分和发布状态不进入前端。
- 审核和评分是发布接口内部的强约束，前端预检查只是用户体验辅助。
- 不提前实现 Redis 榜单排序，避免把下一阶段分发职责混入发布阶段。

## 11. 实现完成后的学习文档

实现完成后，根据 `AGENTS.md` 生成：

```text
docs/learn/004-audit-scoring-publish-learning.md
```

学习文档面向第一次做全栈应用的初学者，重点解释：

- 为什么发布不能只靠前端按钮判断，必须由后端重新审核。
- 用户从草稿编辑页点击发布，到后端创建文章快照的完整链路。
- Controller、Service、Prisma、JWT Guard、DTO 在这次功能中的职责。
- PASS、WARN、BLOCK 三条路径分别发生什么。
- 质量评分为什么要拆成五个维度，并如何计算总分。
- 如何通过页面、接口、数据库、类型检查和构建命令验证功能正确。
- 常见误区：前端伪造审核结果、跳过草稿归属校验、重复发布、发布失败后丢草稿。
