# 创作者我的内容统一管理技术方案

## 1. 功能目标和用户价值

本阶段承接已经完成的创作者主页、草稿箱、发布、文章详情、榜单和互动反馈能力，补齐 README 与 PRD 中“我的内容统一列表、已发布内容二次编辑、作者撤回已发布内容”的关键管理闭环。

目标业务链路为：

```text
创作者主页 `/creator`
  -> 我的内容
      -> 草稿：继续编辑 / 去发布审核
      -> 已发布：查看详情 / 继续编辑 / 撤回
      -> 已撤回：查看详情 / 继续编辑重新发布
```

用户价值：

- 创作者不用在“草稿箱”和“作品管理”之间来回切换，可以在一个列表里理解内容当前状态。
- 已发布内容不再只是展示结果，而是可以进入二次编辑，重新走审核、评分和发布流程。
- 作者可以撤回已发布内容，撤回后内容不再进入公开详情、信息流和榜单。
- 创作者主页统计继续从真实草稿、文章和互动事件聚合，减少占位感，更适合演示和答辩。
- 前端只负责状态展示、筛选和触发操作，撤回权限、文章状态、公开可见性和发布强约束仍保留在后端。

## 2. 下一步范围选择

### 推荐方案：统一内容管理 + 撤回 + 二次编辑入口

本阶段实现：

- 扩展 `GET /users/me/creator-overview`，返回统一 `contents` 列表，包含草稿、已发布文章和已撤回文章。
- 创作者主页 `/creator` 将“作品管理”升级为“我的内容”，支持按“全部 / 草稿 / 已发布 / 已撤回”筛选。
- 新增 `POST /articles/:id/withdraw`，仅允许作者撤回自己的文章。
- 公开文章详情 `GET /articles/:id` 只返回 `PUBLISHED` 内容；撤回后公开访问返回 404。
- 创作者自己的统一列表仍能看到撤回内容，并可点击进入草稿继续编辑。
- 已发布或已撤回内容的“继续编辑”入口跳转到原始草稿 `/drafts/:draftId`，复用现有草稿编辑、审核和发布流程。
- 更新 README 待办，并在实现完成后生成 `docs/learn/014-creator-content-management-learning.md`。

优点：

- 直接命中 README 中未完成的“我的内容统一列表”“二次编辑”“撤回已发布内容”。
- 复用现有 `ArticleStatus.Withdrawn`、`Article.draftId` 和 `PublishService` 的二次发布更新逻辑，不需要新增 Prisma schema。
- 能让创作者主页从数据看板变成真实内容管理台，演示价值高。
- 撤回后公开链路与创作者私有链路边界清晰，符合厚后端架构。

代价：

- `CreatorOverviewResponse` 需要增加统一内容 DTO，前端页面状态和筛选逻辑会增加。
- `PublishService.getPublishedArticle` 与 `withdrawArticle` 需要严格区分公开访问和作者管理访问。
- 撤回后重新发布同一草稿时，需要确保现有发布逻辑能恢复文章状态为 `PUBLISHED`。

### 备选方案 A：只做前端统一展示，不做撤回 API

优点：

- 改动更小，主要集中在 `/creator`。

代价：

- README 中“撤回已发布内容”仍然缺失。
- “已撤回”状态只能靠 seed 或假数据展示，不是真实闭环。

本阶段不采用。

### 备选方案 B：新增独立 `/contents` 页面

优点：

- 页面职责更独立，后续可以做更复杂的运营后台。

代价：

- 当前 MVP 已有 `/creator` 作为创作者主页，新增页面会让导航更分散。
- 需要额外做页面标题、入口和布局，范围大于当前演示需要。

本阶段不采用。

## 3. 涉及模块

### 前端 `apps/web`

- `apps/web/src/app/creator/page.tsx`
  - 将“作品管理”升级为“我的内容”。
  - 展示统一内容列表和筛选标签。
  - 为不同内容状态展示不同操作按钮。
  - 调用撤回接口并局部刷新创作者数据。
- `apps/web/src/lib/creator-overview.ts`
  - 增加统一内容筛选、状态文案、操作可用性、排序等纯函数。
- `apps/web/src/lib/creator-overview.test.ts`
  - 覆盖内容筛选、状态标签、撤回按钮可见性和排序逻辑。
- `apps/web/src/lib/api.ts`
  - 复用现有 `apiFetch`、`readApiJson` 和错误处理，不新增请求库。

### 后端 `apps/api`

- `apps/api/src/users/users.service.ts`
  - `getCreatorOverview` 增加 `contents` 列表。
  - 聚合草稿、已发布文章、已撤回文章，生成统一管理 DTO。
  - 继续统计真实阅读、点赞、收藏、平均质量分。
- `apps/api/src/users/users.service.spec.ts`
  - 覆盖统一内容列表、撤回文章可见、统计不把撤回文章计入已发布数。
- `apps/api/src/publish/publish.controller.ts`
  - 新增 `POST /articles/:id/withdraw`，使用 JWT 鉴权。
- `apps/api/src/publish/publish.service.ts`
  - 新增 `withdrawArticle(authorId, articleId)`。
  - `getPublishedArticle` 继续只返回公开发布内容。
  - 发布已有文章时将状态恢复为 `PUBLISHED`，支持撤回后重新发布。
- `apps/api/src/publish/publish.service.spec.ts`
  - 覆盖撤回权限、撤回后公开不可见、撤回后重新发布恢复公开状态。

### 共享包 `packages/shared`

- `packages/shared/src/index.ts`
  - 新增统一内容类型：
    - `CreatorContentType`
    - `CreatorContentStatus`
    - `CreatorContentItem`
    - `WithdrawArticleResponse`
  - 扩展 `CreatorOverviewResponse.contents`。

### 文档

- `README.md`
  - 实现和验证完成后勾选：
    - 增加“我的内容”统一列表，区分草稿、待审核、已发布、已撤回。
    - 支持已发布内容二次编辑，并重新进入审核发布流程。
    - 支持作者撤回已发布内容。
  - 若本阶段确认创作者主页统计已接入真实数据，也同步说明当前粉丝数仍为 MVP 占位。
- `docs/learn/014-creator-content-management-learning.md`
  - 实现完成后生成本地学习文档，继续保持 `docs/learn/` 不上传 GitHub。

## 4. 需要新增或修改的文件

### 新增文件

- `docs/learn/014-creator-content-management-learning.md`，实现完成后生成。

### 修改文件

- `packages/shared/src/index.ts`
- `apps/api/src/users/users.service.ts`
- `apps/api/src/users/users.service.spec.ts`
- `apps/api/src/publish/publish.controller.ts`
- `apps/api/src/publish/publish.service.ts`
- `apps/api/src/publish/publish.service.spec.ts`
- `apps/web/src/app/creator/page.tsx`
- `apps/web/src/lib/creator-overview.ts`
- `apps/web/src/lib/creator-overview.test.ts`
- `README.md`

### 暂不修改

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/**`
- `apps/api/src/feed/**`
- `apps/api/src/ranking/**`
- `apps/api/src/analytics/**`
- `apps/web/src/app/articles/[id]/page.tsx`
- `apps/web/src/app/drafts/[id]/page.tsx`

## 5. 数据模型或 API 变更

### 数据模型

本阶段不修改 Prisma schema，复用已有模型：

- `Draft`
  - 作为草稿和二次编辑入口。
  - 已发布文章通过 `Article.draftId` 回到原始草稿继续编辑。
- `Article`
  - `status = PUBLISHED`：公开可见，进入信息流、榜单和公开详情。
  - `status = WITHDRAWN`：作者私有可见，不进入公开详情、信息流和榜单。
- `ArticleRevision`
  - 继续记录初次发布和二次发布快照。
- `AuditRecord` / `QualityScore`
  - 继续记录每次发布审核和评分。
- `EngagementEvent`
  - 继续记录历史互动数据；撤回不会删除历史事件。

说明：

- 撤回是状态变更，不物理删除文章。
- 撤回后历史审核、评分、互动数据保留，便于创作者复盘。
- 撤回后重新发布沿用现有 `publishDraft` 的二次发布路径，并将文章状态恢复为 `PUBLISHED`。

### 共享类型

计划新增：

```ts
export enum CreatorContentType {
  Draft = "DRAFT",
  Article = "ARTICLE",
}

export enum CreatorContentStatus {
  Draft = "DRAFT",
  Published = "PUBLISHED",
  Withdrawn = "WITHDRAWN",
  NeedsRevision = "NEEDS_REVISION",
}

export interface CreatorContentItem {
  id: string;
  type: CreatorContentType;
  status: CreatorContentStatus;
  title: string;
  summary: string;
  draftId?: string;
  articleId?: string;
  updatedAt: string;
  publishedAt?: string;
  qualityScore?: number;
  engagement?: ArticleEngagementStats;
}

export interface WithdrawArticleResponse {
  articleId: string;
  draftId: string;
  status: ArticleStatus.Withdrawn;
  message: string;
}
```

`CreatorOverviewResponse` 增加：

```ts
contents: CreatorContentItem[];
```

兼容策略：

- 保留现有 `recentDrafts` 和 `works` 字段，避免一次性改动过大。
- `/creator` 可以逐步改用 `contents`，其他已有调用不受影响。

### API 变更

#### `GET /users/me/creator-overview`

鉴权：需要 JWT。

响应新增 `contents`：

```json
{
  "contents": [
    {
      "id": "draft_1",
      "type": "DRAFT",
      "status": "DRAFT",
      "title": "待发布草稿",
      "summary": "v3，最近更新于 06-07 10:00",
      "draftId": "draft_1",
      "updatedAt": "2026-06-07T02:00:00.000Z"
    },
    {
      "id": "article_1",
      "type": "ARTICLE",
      "status": "PUBLISHED",
      "title": "已发布文章",
      "summary": "文章摘要",
      "draftId": "draft_2",
      "articleId": "article_1",
      "publishedAt": "2026-06-07T02:00:00.000Z",
      "updatedAt": "2026-06-07T02:00:00.000Z",
      "qualityScore": 86,
      "engagement": { "views": 10, "likes": 2, "favorites": 1 }
    }
  ]
}
```

后端排序：

- 按 `updatedAt` 倒序。
- 草稿使用 `draft.updatedAt`。
- 文章使用 `article.updatedAt`，已发布文章也展示 `publishedAt`。

#### `POST /articles/:id/withdraw`

鉴权：需要 JWT。

行为：

- 只允许作者撤回自己的文章。
- 只有 `PUBLISHED` 文章可以撤回。
- 撤回后 `status = WITHDRAWN`。
- 不删除文章、修订、审核记录、质量分和互动事件。
- 撤回后公开 `GET /articles/:id` 返回 404。
- 撤回后 feed/ranking 因已有查询只取 `PUBLISHED`，自然不再展示。

响应：

```json
{
  "articleId": "article_1",
  "draftId": "draft_1",
  "status": "WITHDRAWN",
  "message": "文章已撤回，读者将无法继续访问。"
}
```

错误：

- 401：未登录或 token 无效。
- 404：文章不存在或不属于当前用户。
- 409：文章已经撤回，不能重复撤回。

## 6. 前端交互与页面状态设计

### 页面结构

`/creator` 保持当前生产工具风格：

- 浅灰应用背景。
- 白色顶部导航。
- 左侧导航栏。
- 中间主内容区。
- 右侧创作灵感栏。

本阶段不做营销式 hero，不新增大面积装饰背景。

### “我的内容”区域

左侧管理菜单中，将“作品管理”改为“我的内容”。

主内容区域展示：

- 顶部标题：“我的内容”。
- 状态筛选：
  - 全部
  - 草稿
  - 已发布
  - 已撤回
- 列表项：
  - 标题
  - 摘要或版本说明
  - 状态标签
  - 更新时间 / 发布时间
  - 质量分和互动数据，只有文章展示
  - 操作按钮

### 操作规则

草稿：

- `继续编辑` -> `/drafts/:draftId`
- `去发布` -> `/publish/:draftId`

已发布文章：

- `查看详情` -> `/articles/:articleId`
- `继续编辑` -> `/drafts/:draftId`
- `撤回` -> 打开确认状态后调用 `POST /articles/:id/withdraw`

已撤回文章：

- `继续编辑` -> `/drafts/:draftId`
- `重新发布` -> `/publish/:draftId`
- 不展示公开详情按钮，避免用户误以为读者还能访问。

### 撤回交互

页面状态：

- `withdrawingArticleId`：当前撤回中的文章。
- `withdrawError`：撤回失败提示。
- `pendingWithdrawArticleId`：待确认撤回的文章。

交互：

1. 用户点击“撤回”。
2. 当前列表项展示确认文案：“撤回后读者将无法访问，确认撤回？”
3. 用户点击“确认撤回”。
4. 前端调用 `POST /articles/:id/withdraw`。
5. 成功后刷新 `GET /users/me/creator-overview`。
6. 当前文章状态变为“已撤回”。
7. 失败时保留错误提示和重试入口。

### 移动端

- 继续使用单列布局。
- 筛选标签可横向换行。
- 列表项操作按钮换行排列，不能遮挡标题和摘要。
- 撤回确认文案放在当前列表项内，不使用复杂浮层。

## 7. 后端服务、鉴权、审核、评分、发布和榜单逻辑

### 鉴权

- `GET /users/me/creator-overview` 继续使用 `JwtAuthGuard`。
- `POST /articles/:id/withdraw` 使用 `JwtAuthGuard` 和 `CurrentUser("userId")`。
- 撤回接口不接受前端传入 `authorId`。
- 查询文章时使用 `id + authorId`，防止撤回他人文章。

### 创作者统一内容列表

`UsersService.getCreatorOverview(userId)` 扩展流程：

```text
load user
  -> load drafts by authorId
  -> load articles by authorId, include latest score and events
  -> map drafts to CreatorContentItem
  -> map articles to CreatorContentItem
  -> merge and sort by updatedAt desc
  -> return stats, recentDrafts, works, contents
```

统计规则：

- `draftCount`：仍统计当前用户所有草稿。
- `publishedArticles`：只统计 `ArticleStatus.Published`。
- `totalViews` / `totalLikes` / `totalFavorites`：默认统计所有文章历史互动，包括已撤回文章，表示创作者历史数据。
- `averageQualityScore`：按有评分文章计算，已撤回文章可继续计入历史平均质量分。
- `followers`：MVP 阶段仍为 0，并在页面文案中说明未接入粉丝模型。

### 撤回

`PublishService.withdrawArticle(authorId, articleId)`：

```text
load article by id + authorId
  -> if not found: 404
  -> if status is WITHDRAWN: 409
  -> update status to WITHDRAWN
  -> return articleId, draftId, status, message
```

公开详情：

- `getPublishedArticle(id)` 保持 `status = PUBLISHED` 查询。
- 撤回文章公开访问返回 404。

### 二次编辑和重新发布

本阶段不新增单独的“复制文章为草稿”逻辑，因为当前数据模型中文章已经保留 `draftId`：

- `继续编辑` 直接进入 `/drafts/:draftId`。
- 草稿保存后版本递增。
- 点击发布进入 `/publish/:draftId`。
- `PublishService.publishDraft` 对已有文章执行更新路径。

需要补充一点后端行为：

- 当已有文章为 `WITHDRAWN` 时，二次发布通过后应将 `Article.status` 更新为 `PUBLISHED`。
- `publishedAt` 是否更新：本阶段保持初次发布时间不变，`updatedAt` 表示重新发布更新时间。后续如需要展示“重新发布时间”，可新增字段或从 `ArticleRevision` 推导。

### 审核、评分和发布强约束

- 撤回不需要重新审核。
- 二次编辑后的重新发布必须走现有 `publishDraft`：
  - 重新审核。
  - 重新评分。
  - PASS 后才恢复公开。
  - WARN/BLOCK 不恢复公开。
- 前端不能直接把撤回文章改回已发布。

### 信息流和榜单

本阶段不修改 feed/ranking 查询逻辑。

预期行为：

- 因公开列表接口只读取 `ArticleStatus.Published`，撤回后文章自然消失。
- Redis Sorted Set 仍未接入，本阶段不处理缓存失效。
- 未来接入 Redis 后，撤回需要同步移除 sorted set 中对应 articleId。

## 8. 风险、边界情况和回滚方案

| 风险 | 处理 |
| --- | --- |
| 用户撤回他人文章 | 后端按 `articleId + authorId` 查询，不匹配返回 404 |
| 重复撤回 | 已撤回文章返回 409，前端提示已经撤回 |
| 撤回后公开详情仍可访问 | `getPublishedArticle` 保持 `status=PUBLISHED` 过滤，并补单测 |
| 撤回后榜单仍展示 | 当前榜单从 PostgreSQL 查询 `PUBLISHED` 文章，撤回后自然过滤；Redis 接入后另做失效 |
| 已撤回文章无法重新发布 | `publishDraft` 对已有文章更新时恢复 `status=PUBLISHED` |
| 前端把“二次编辑”理解成直接编辑文章快照 | 页面按钮进入原草稿，复用草稿保存和发布审核，不直接改文章 |
| 统一列表重复展示同一内容 | 草稿和文章是不同生命周期节点：已发布文章展示为文章，原草稿仍可在草稿筛选中出现；如视觉过载，默认“全部”可优先展示文章，草稿筛选展示所有草稿 |
| 创作者统计口径不清晰 | 页面 hint 明确阅读、点赞、收藏是历史互动；已发布作品只统计公开状态 |
| 页面状态复杂 | 抽取 `creator-overview.ts` 纯函数，页面只保留必要交互状态 |

回滚方案：

- 移除 `POST /articles/:id/withdraw`。
- `CreatorOverviewResponse` 保留旧字段，前端恢复使用 `works` 和 `recentDrafts`。
- 删除新增统一内容 helper。
- 撤回只是状态更新，不涉及 schema 迁移；如需恢复单篇文章，可手动把 `articles.status` 改回 `PUBLISHED`。

## 9. 验证方式和测试计划

### 后端单元测试

扩展 `apps/api/src/users/users.service.spec.ts`：

- 返回 `contents`，包含草稿、已发布文章和已撤回文章。
- `contents` 按 `updatedAt` 倒序。
- 已发布作品数只统计 `PUBLISHED`。
- 撤回文章仍可在作者统一内容列表中看到。
- 互动数据聚合为 `views`、`likes`、`favorites`。

扩展 `apps/api/src/publish/publish.service.spec.ts`：

- 作者可以撤回自己的已发布文章。
- 撤回他人文章返回 404。
- 重复撤回返回 409。
- 撤回后 `getPublishedArticle` 返回 404。
- 撤回后重新发布同一草稿，文章状态恢复为 `PUBLISHED`。
- WARN/BLOCK 的重新发布不会恢复公开状态。

### 前端纯函数测试

扩展 `apps/web/src/lib/creator-overview.test.ts`：

- 统一内容状态映射为“草稿 / 已发布 / 已撤回”。
- 筛选“全部 / 草稿 / 已发布 / 已撤回”返回正确内容。
- 草稿显示“继续编辑 / 去发布”。
- 已发布文章显示“查看详情 / 继续编辑 / 撤回”。
- 已撤回文章显示“继续编辑 / 重新发布”。
- 排序函数不修改原数组。

### 类型检查

```bash
pnpm typecheck
```

### 构建检查

因为会修改共享类型、NestJS service/controller 和 Next.js 页面，运行：

```bash
pnpm --filter @bytecamp-aigc/api build
pnpm --filter @bytecamp-aigc/web build
```

### 相关测试

```bash
pnpm --filter @bytecamp-aigc/api test
pnpm --filter @bytecamp-aigc/web test
```

### 手动页面验证

1. 启动数据库、API 和 Web。
2. 使用 `demo@bytecamp.local / bytecamp123` 登录。
3. 进入 `/creator`。
4. 打开“我的内容”，确认能看到草稿、已发布文章。
5. 切换筛选标签，确认列表变化正确。
6. 点击草稿“继续编辑”，确认进入 `/drafts/:id`。
7. 点击草稿“去发布”，确认进入 `/publish/:id`。
8. 点击已发布文章“查看详情”，确认进入公开详情页。
9. 点击已发布文章“撤回”，确认出现二次确认。
10. 确认撤回后，列表中状态变为“已撤回”。
11. 刷新文章详情 URL，确认公开访问不再可见。
12. 对撤回文章点击“继续编辑”，修改草稿后重新审核发布。
13. 发布 PASS 后，确认文章重新出现在详情页、首页或榜单列表中。

### 数据库验证

- 撤回后 `articles.status = WITHDRAWN`。
- 撤回不会删除 `article_revisions`、`audit_records`、`quality_scores` 和 `engagement_events`。
- 重新发布后同一 `article.id` 恢复为 `PUBLISHED`，并新增 `article_revisions`。
- 重新发布后新增审核记录和质量评分。

## 10. 与总体架构的一致性

- `apps/web` 只负责创作者主页展示、筛选、按钮状态和 API 调用。
- `apps/api` 负责作者权限校验、文章撤回、公开可见性、统一内容聚合和发布状态恢复。
- `packages/shared` 负责统一内容 DTO、状态枚举和撤回响应契约。
- 审核、评分、发布强约束仍集中在后端，二次编辑不会绕过审核。
- 撤回不影响历史数据留存，公开分发只展示 `PUBLISHED` 内容。
- 页面主体样式继续使用 Tailwind CSS utility class，保持克制、高密度、生产工具风格。

## 11. 实现完成后的学习文档

实现完成后，根据 `AGENTS.md` 生成：

```text
docs/learn/014-creator-content-management-learning.md
```

学习文档面向第一次做全栈应用的初学者，重点解释：

- 这个功能解决了什么业务问题：为什么创作者需要一个统一的“我的内容”管理视图。
- 用户从 `/creator` 查看内容、筛选状态、撤回文章、继续编辑、重新发布的完整链路。
- `creator/page.tsx`、`creator-overview.ts`、`UsersController`、`UsersService`、`PublishController`、`PublishService`、Prisma `Draft`、`Article`、`ArticleRevision` 分别承担什么责任。
- 为什么撤回是改状态，不是删除数据库记录。
- 为什么撤回后重新发布仍必须经过审核和评分。
- 公开详情、作者私有列表、信息流和榜单为什么要使用不同可见性规则。
- 成功路径和失败路径分别发生什么。
- 初学者需要重点理解的 React 状态、HTTP 请求、Controller、Service、Prisma relation、JWT Guard、DTO、文章生命周期状态。
- 如何通过页面、接口、数据库、类型检查、测试和构建命令验证功能正确。
- 常见误区：前端直接修改文章状态、撤回时删除历史数据、二次编辑绕过审核、公开接口暴露撤回内容、统计口径不清楚。
