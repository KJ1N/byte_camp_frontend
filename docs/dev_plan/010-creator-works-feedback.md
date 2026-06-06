# 创作者作品管理与数据反馈技术方案

## 1. 功能目标和用户价值

本阶段承接已经完成的创作、草稿、审核评分、发布、文章详情、信息流、榜单和互动事件链路，把创作者主页中仍然占位的“作品管理”和数据统计接入真实后端数据。

目标业务闭环为：

```text
发布文章 -> 读者阅读/点赞/收藏 -> 互动事件写入后端
  -> 创作者回到 /creator
  -> 查看真实作品列表、质量分、阅读/点赞/收藏统计
  -> 从作品列表进入文章详情或草稿编辑继续优化
```

用户价值：

- 创作者发布内容后，可以在自己的主页看到真实作品，而不是停留在“发布功能完成后开放”的提示。
- 创作者可以看到总作品数、总阅读量、总点赞数、总收藏数和平均质量分，理解内容表现。
- “我的内容”从只有草稿扩展到草稿和已发布文章并存，为后续待审核、已撤回、二次编辑做铺垫。
- 互动数据不只影响榜单，也回流到创作者侧，补齐 PRD 中“数据反馈 -> 二次优化”的关键链路。
- 前端只展示和触发跳转，统计聚合、权限判断、质量分和互动汇总都在后端完成，符合“薄前端、厚后端”的架构原则。

## 2. 下一步范围选择

### 推荐方案：创作者主页真实概览 + 作品管理列表

本阶段实现：

- 新增 `GET /users/me/creator-overview`，返回当前登录创作者的统计概览、最近草稿、已发布作品列表。
- 创作者主页 `/creator` 接入该接口，替换粉丝数、阅读量和作品管理占位。
- 左侧“作品管理”从按钮占位改成可点击的页面内筛选或锚点，展示已发布作品。
- 每篇作品展示标题、摘要、发布时间、质量分、阅读量、点赞数、收藏数、状态和操作入口。
- 保留草稿动态，并在同一页面中形成“继续编辑草稿”和“查看已发布作品”两个入口。
- README 待办完成后勾选对应项，学习文档写入 `docs/learn/010-creator-works-feedback-learning.md`。

优点：

- 直接命中 README 中“发布功能完成后，把创作者主页的作品管理从占位改成真实列表”的待办。
- 复用已有 `articles`、`quality_scores`、`engagement_events`、`drafts` 数据模型，不需要 Prisma schema 迁移。
- 能增强演示脚本：发布文章后，回到创作者主页即可看到作品和数据反馈。
- 改动边界清晰，主要落在 `users` 模块、共享 DTO 和 `/creator` 页面。

代价：

- 需要新增后端聚合查询，处理草稿、文章、评分和互动事件之间的数据映射。
- `/creator/page.tsx` 当前已有较多 UI 逻辑，实施时需要抽取少量展示/格式化 helper，避免页面继续膨胀。

### 备选方案 A：先做“我的内容”独立页面

优点：

- 可以更完整地区分草稿、待审核、已发布、已撤回。
- 后续扩展二次编辑、撤回和审核状态会更自然。

代价：

- 新增路由和页面成本更高。
- 当前最明显的占位在 `/creator`，先做独立页面会让主页仍显得没有完成。

### 备选方案 B：优先做 Playwright smoke E2E

优点：

- 能提高交付稳定性，覆盖登录、创作、审核、发布、详情链路。
- 对后续重构更有保护作用。

代价：

- 不直接补齐产品体验缺口。
- 当前创作者侧发布后反馈仍是占位，演示链路最后一段不完整。

本阶段采用推荐方案。

## 3. 涉及模块

### 前端 `apps/web`

- `apps/web/src/app/creator/page.tsx`
  - 加载新的创作者概览接口。
  - 替换统计卡片中的占位数据。
  - 将“作品管理”改为真实作品列表筛选/锚点。
  - 展示已发布作品、质量分和互动数据。
- 可新增 `apps/web/src/lib/creator-overview.ts`
  - 放置纯函数，例如统计数字格式化、作品状态文案、列表排序或筛选状态。
  - 对纯函数补测试，降低页面组件压力。

### 后端 `apps/api`

- `apps/api/src/users/users.controller.ts`
  - 新增 `GET /users/me/creator-overview`。
  - 使用 `JwtAuthGuard` 和 `CurrentUser`，不接受前端传入 `authorId`。
- `apps/api/src/users/users.service.ts`
  - 聚合当前用户的草稿、已发布文章、最新质量分和互动数据。
  - 计算总作品数、总阅读量、总点赞数、总收藏数、平均质量分。
- `apps/api/src/users/users.module.ts`
  - 引入 `PrismaModule`，注册 controller 和 service。
- `apps/api/src/users/users.service.spec.ts`
  - 覆盖统计聚合、空数据、最新质量分、互动汇总和权限边界。

### 共享包 `packages/shared`

- `packages/shared/src/index.ts`
  - 新增创作者概览、作品列表、统计卡片相关 DTO。

### 文档

- `README.md`
  - 实现完成后勾选“作品管理从占位改成真实列表”和“互动数据进入创作者数据反馈”。
- `docs/learn/010-creator-works-feedback-learning.md`
  - 实现完成后生成本地学习文档，保持 `docs/learn/` 不进入 GitHub。

## 4. 需要新增或修改的文件

### 新增文件

- `apps/api/src/users/users.controller.ts`
- `apps/api/src/users/users.service.ts`
- `apps/api/src/users/users.service.spec.ts`
- `apps/web/src/lib/creator-overview.ts`
- `apps/web/src/lib/creator-overview.test.ts`
- `docs/learn/010-creator-works-feedback-learning.md`，实现完成后生成

### 修改文件

- `packages/shared/src/index.ts`
- `apps/api/src/users/users.module.ts`
- `apps/web/src/app/creator/page.tsx`
- `README.md`

### 暂不修改

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/**`
- `apps/api/src/feed/**`
- `apps/api/src/ranking/**`
- `apps/api/src/analytics/**`
- `apps/web/src/app/articles/[id]/page.tsx`
- `apps/web/src/app/drafts/**`

## 5. 数据模型或 API 变更

### 数据模型

本阶段不修改 Prisma schema，复用已有表：

- `drafts`：读取当前用户最近草稿和草稿状态。
- `articles`：读取当前用户已发布或已撤回作品。
- `quality_scores`：读取每篇文章最新质量分。
- `engagement_events`：汇总阅读、点赞和收藏。

后续若需要更高性能，可增加物化统计表或定时汇总表；MVP 阶段直接聚合即可。

### 共享类型

计划在 `packages/shared/src/index.ts` 增加：

```ts
export interface CreatorOverviewStats {
  followers: number;
  publishedArticles: number;
  draftCount: number;
  totalViews: number;
  totalLikes: number;
  totalFavorites: number;
  averageQualityScore: number;
}

export interface CreatorWorkItem {
  id: string;
  title: string;
  summary: string;
  status: ArticleStatus;
  publishedAt: string;
  updatedAt: string;
  qualityScore: number;
  engagement: ArticleEngagementStats;
}

export interface CreatorOverviewResponse {
  user: {
    id: string;
    nickname: string;
    avatarUrl?: string;
  };
  stats: CreatorOverviewStats;
  recentDrafts: DraftSummary[];
  works: CreatorWorkItem[];
}
```

说明：

- `followers` MVP 阶段没有粉丝模型，固定返回 `0`，但由后端返回，前端不硬编码。
- `works` 默认返回最近 20 篇当前用户文章，按 `publishedAt desc` 排序。
- `qualityScore` 使用文章最新一条 `quality_scores.overall`，没有评分时返回 `0`。
- `engagement` 由 `engagement_events` 按类型汇总。

### API 设计

#### `GET /users/me/creator-overview`

鉴权：需要 `Authorization: Bearer <token>`。

行为：

- 只返回当前 token 对应用户的数据。
- 未登录返回 `401`。
- 用户存在但没有草稿和作品时，返回空列表和 0 统计。
- 后端一次性返回主页需要的最小数据，避免前端串行请求多个接口。

响应示例：

```json
{
  "user": {
    "id": "user_1",
    "nickname": "训练营创作者",
    "avatarUrl": null
  },
  "stats": {
    "followers": 0,
    "publishedArticles": 3,
    "draftCount": 2,
    "totalViews": 120,
    "totalLikes": 15,
    "totalFavorites": 8,
    "averageQualityScore": 84
  },
  "recentDrafts": [
    {
      "id": "draft_1",
      "title": "AI 如何改变内容创作",
      "status": "DRAFT",
      "mode": "FAST",
      "version": 4,
      "updatedAt": "2026-06-06T10:00:00.000Z",
      "createdAt": "2026-06-06T09:30:00.000Z"
    }
  ],
  "works": [
    {
      "id": "article_1",
      "title": "AI 正在重塑内容创作的完整链路",
      "summary": "从选题、生成、编辑到审核发布，AI 创作工具正在变成完整工作流。",
      "status": "PUBLISHED",
      "publishedAt": "2026-06-06T10:30:00.000Z",
      "updatedAt": "2026-06-06T10:30:00.000Z",
      "qualityScore": 86,
      "engagement": {
        "views": 80,
        "likes": 10,
        "favorites": 5
      }
    }
  ]
}
```

## 6. 前端交互与页面状态设计

创作者主页继续保持当前生产工具风格：浅灰应用背景、顶部白色导航栏、左侧导航、中央内容区、右侧创作灵感栏，页面主体样式使用 Tailwind CSS utility class。

### 页面加载

- 登录后调用 `GET /users/me/creator-overview` 和 `GET /ai/creator-inspirations`。
- 草稿列表不再单独调用 `/drafts/mine`，由概览接口返回最近草稿，减少请求数量。
- 任一接口返回 401 时，清理本地登录态并展示登录入口。
- 概览接口失败时，中央区域展示错误提示和重试按钮；灵感接口失败只影响右侧栏。

### 统计区

把当前占位统计替换为四到六个紧凑指标：

- 总阅读量
- 已发布作品
- 草稿数
- 点赞/收藏
- 平均质量分
- 粉丝数，MVP 先展示 0

数字格式化：

- 小于 10000 直接展示整数。
- 大于等于 10000 展示 `1.2万` 风格。
- 没有数据时展示 `0`，不要显示 `--`。

### 作品管理

- 左侧“作品管理”点击后切换中央区域到作品列表，或滚动到作品列表锚点。
- 作品列表位于草稿动态下方，作为主页核心内容之一。
- 每个作品项展示：
  - 标题和摘要。
  - 发布时间。
  - 质量分。
  - 阅读、点赞、收藏。
  - 状态标签。
  - “查看详情”链接到 `/articles/:id`。
- 空状态展示“还没有发布作品”，并提供“去工作台创作”入口。

### 草稿动态

- 保留最近草稿模块。
- 草稿项继续链接到 `/drafts/:id`。
- 如果没有草稿，展示当前空状态。

### 移动端

- 左侧导航、中央内容和右侧灵感栏改为单列堆叠。
- 统计卡片使用两列网格。
- 作品项操作按钮不遮挡摘要和指标。

## 7. 后端服务、鉴权、审核、评分、发布或榜单逻辑

### 鉴权

- `UsersController` 使用 `JwtAuthGuard`。
- 通过 `CurrentUser` 获取 `userId`。
- 不允许前端传入任意用户 id 查询数据。

### 查询与聚合

`UsersService.getCreatorOverview(userId)`：

1. 查询用户基础信息。
2. 查询最近 5 条草稿，按 `updatedAt desc`。
3. 查询最近 20 篇当前用户文章，包含：
   - 最新质量分：`scores orderBy createdAt desc take 1`。
   - 互动事件：`events select type value`。
4. 对每篇文章计算 `ArticleEngagementStats`。
5. 汇总：
   - `publishedArticles`：状态为 `PUBLISHED` 的作品数。
   - `totalViews`、`totalLikes`、`totalFavorites`：所有作品事件累加。
   - `averageQualityScore`：有质量分作品的平均分，四舍五入。
   - `draftCount`：当前用户草稿总数。
6. 组装 `CreatorOverviewResponse`。

### 审核、评分、发布和榜单

本阶段不修改审核、评分、发布和榜单核心逻辑。

- 创作者概览只读取已发布结果，不触发重新审核。
- 质量分只使用发布链路生成的 `quality_scores`。
- 互动数据来自现有 `POST /articles/:id/events`。
- 榜单排序仍由 `FeedService` 和 `RankingService` 负责，创作者概览不参与排序。

### 错误处理

- 用户不存在：返回 401 或 404，取决于 guard 当前行为；前端统一清理登录态或展示重试。
- 聚合列表为空：返回空数组和 0 统计，不视为异常。
- 某篇文章没有质量分：该作品 `qualityScore` 为 0，不纳入平均质量分分母。

## 8. 风险、边界情况和回滚方案

| 风险 | 处理 |
| --- | --- |
| `/creator/page.tsx` 文件继续变大 | 抽取 `creator-overview.ts` 放纯函数，页面只保留请求和 JSX |
| 中文文本已有乱码风险 | 实施时统一用 UTF-8 重写受影响文案，并通过页面和 typecheck 验证 |
| 文章没有评分或互动事件 | 后端返回 0 值，前端展示稳定空数据 |
| 用户没有任何作品 | 展示空状态和“去工作台创作”入口 |
| 多接口并发导致错误互相覆盖 | 概览错误和灵感错误分开管理，避免右侧失败影响主页核心数据 |
| 统计实时聚合性能不足 | MVP 数据量小可直接聚合；后续再引入缓存或统计表 |
| 前端误展示其他用户作品 | 后端按 token userId 查询，前端不传 authorId |
| README 勾选早于实现 | 只有实现和验证完成后再更新 README |

回滚方案：

- 移除 `UsersController`、`UsersService` 和新增测试。
- `users.module.ts` 恢复为空模块。
- `/creator/page.tsx` 回到原先调用 `/drafts/mine` 和作品管理占位。
- `packages/shared` 移除新增 DTO。
- 不涉及数据库 schema 和迁移，回滚成本低。

## 9. 验证方式和测试计划

### 后端单元测试

新增 `apps/api/src/users/users.service.spec.ts`：

- 当前用户没有草稿和文章时，返回空列表和 0 统计。
- 当前用户有草稿时，`recentDrafts` 按更新时间倒序返回。
- 当前用户有已发布文章时，`works` 返回标题、摘要、状态、发布时间。
- 多条互动事件能正确汇总阅读、点赞和收藏。
- 多篇文章的平均质量分按有评分作品计算并四舍五入。
- 不返回其他用户的草稿或文章。

### 前端纯函数测试

新增 `apps/web/src/lib/creator-overview.test.ts`：

- 数字格式化：`9999 -> "9999"`，`12000 -> "1.2万"`。
- 空统计返回稳定展示值。
- 作品状态文案映射正确。
- 作品列表筛选不会改变原数组。

### 类型检查

```bash
pnpm typecheck
```

### 构建检查

因为会修改 NestJS users 模块和 Next.js creator 页面，运行：

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
2. 注册或登录演示账号。
3. 进入工作台生成文章，保存草稿并发布。
4. 打开文章详情页，触发阅读、点赞、收藏。
5. 回到 `/creator`。
6. 确认统计区展示已发布作品数、总阅读量、点赞、收藏和平均质量分。
7. 点击左侧“作品管理”，确认看到已发布作品列表。
8. 点击“查看详情”，确认进入 `/articles/:id`。
9. 新账号没有作品时，确认展示空状态和工作台入口。

### 数据库验证

- `articles` 中当前用户有已发布文章。
- `quality_scores` 中对应文章有质量分记录。
- `engagement_events` 中对应文章有阅读、点赞、收藏事件。
- `GET /users/me/creator-overview` 返回的统计与数据库聚合结果一致。

## 10. 与总体架构的一致性

- `apps/web` 只负责页面状态、展示、筛选和跳转。
- `apps/api` 负责当前用户鉴权、作品查询、质量分读取和互动统计聚合。
- `packages/shared` 负责前后端共享 DTO。
- 不把统计计算、用户权限判断或作品归属校验放到前端。
- 不修改审核、评分、发布和榜单职责边界。
- 页面主体样式继续使用 Tailwind CSS utility class，保持创作者后台的克制工具感。

## 11. 实现完成后的学习文档

实现完成后，根据 `AGENTS.md` 生成：

```text
docs/learn/010-creator-works-feedback-learning.md
```

学习文档面向第一次做全栈应用的初学者，重点解释：

- 这个功能解决了什么业务问题：为什么发布后要回到创作者主页看作品和数据。
- 用户从发布文章、读者互动，到创作者主页读取统计数据的完整链路。
- `creator/page.tsx`、`UsersController`、`UsersService`、Prisma `Article`、`QualityScore`、`EngagementEvent` 和共享 DTO 分别承担什么责任。
- 为什么统计聚合要放在后端，而不是让前端自己拉文章、评分和互动事件再计算。
- 成功路径和失败路径分别发生什么。
- 初学者需要重点理解的 React 状态、HTTP 请求、Controller、Service、Prisma relation、JWT Guard、DTO 和 reduce 聚合。
- 如何通过页面、接口、数据库、类型检查、测试和构建命令验证功能正确。
- 常见误区：前端传 authorId 查询他人数据、把无评分文章算进平均分分母、没有处理空状态、把互动数据只用于榜单而不反馈给创作者。
