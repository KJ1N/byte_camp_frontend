# 内容分发、榜单与互动反馈技术方案

## 1. 功能目标和用户价值

本阶段承接已经完成的登录、创作、草稿、审核、评分和发布闭环，补齐 PRD 中 MVP 第三段核心链路：

```text
已发布文章 -> 推荐信息流 -> 热点榜 / 爆文榜 -> 文章详情阅读 -> 点赞 / 收藏反馈 -> 互动数据影响排序
```

用户价值：

- 读者进入首页后看到真实发布内容，而不是静态示例内容。
- 创作者发布成功后，文章可以进入首页推荐流和榜单，形成可演示的分发闭环。
- 阅读、点赞、收藏等互动被后端记录，后续可以用于创作者数据反馈和榜单解释。
- 榜单排序从“写在页面里的假数据”升级为后端可解释计算，符合 PRD 的验收要求。

## 2. 下一步范围选择

### 推荐方案：推荐流 + 双榜单 + 互动事件

本阶段实现：

- `GET /feed` 推荐信息流接口。
- `GET /rankings/hot` 热点榜接口。
- `GET /rankings/top` 爆文榜接口。
- `POST /articles/:id/events` 互动事件接口，支持阅读、点赞、收藏。
- 首页 `/` 从后端读取推荐流和榜单。
- 新增或补齐 `/rankings` 榜单页，支持热点榜 / 爆文榜切换和分页加载。
- 文章详情 `/articles/[id]` 展示阅读、点赞、收藏统计，并在打开和点击时写入互动事件。
- seed 数据补充已发布文章、评分、审核记录和互动事件，便于本地演示榜单。

优点：

- 与 PRD 第三周“分发与交付”直接对齐。
- 复用现有 `articles`、`quality_scores`、`audit_records`、`engagement_events` 和 `ranking_snapshots` 表，不需要改 Prisma schema。
- 后端统一负责排序公式、互动记录和 Redis / PostgreSQL 回退，前端只展示结果和触发事件。

代价：

- 会同时改动 Feed、Ranking、Analytics、首页、详情页和共享类型。
- Redis 可用性需要做降级设计，避免本地没有 Redis 时阻塞演示。

### 备选方案 A：只做后端分发 API

优点：

- 变更更小，可以先把排序和互动持久化打稳。

代价：

- 首页仍是静态数据，演示脚本中“在榜单和详情页查看内容”无法从页面闭环验证。
- 初学者不容易理解页面操作如何驱动后端数据变化。

### 备选方案 B：一次性完成分发、创作者真实数据、性能报告和部署

优点：

- 更接近最终交付形态。

代价：

- 范围跨越分发、数据看板、性能优化、部署和评估报告，风险过大。
- 当前更重要的是先让发布内容进入读者侧消费链路，再做统计面板和交付优化。

本阶段采用推荐方案。创作者主页真实统计、性能评估报告、部署文档和答辩材料放入后续阶段。

## 3. 涉及模块

### 前端 `apps/web`

- 首页 `/`：移除静态 `featuredArticles` 和 `rankings` 数据，改为请求后端推荐流和榜单。
- 榜单页 `/rankings`：展示热点榜、爆文榜和分页加载。
- 文章详情 `/articles/[id]`：展示互动统计，打开文章时记录阅读，点击按钮记录点赞和收藏。
- API 工具 `apps/web/src/lib/api.ts`：复用现有 `apiFetch`，必要时增加轻量 query 拼接工具。
- 本地交互状态：使用 `localStorage` 记录当前浏览器是否已经点赞或收藏某篇文章，避免重复点击造成演示数据明显失真。

### 后端 `apps/api`

- `feed` 模块：新增 controller/service，负责推荐信息流分页。
- `ranking` 模块：扩展 service 并新增 controller，负责热点榜、爆文榜、排序分解和快照写入。
- `analytics` 模块：新增 controller/service，负责互动事件写入和文章互动统计。
- `publish` 模块：文章详情查询增加互动统计字段，仍只返回已发布文章。
- `prisma` 模块：复用现有 PrismaService，不新增数据库模型。

### 共享包 `packages/shared`

- 新增互动事件枚举、文章摘要、分页响应、榜单响应、互动统计和排序分解类型。
- 保留现有 `rankingWeights`，榜单公式继续由共享常量解释，但计算仍在后端执行。

## 4. 需要新增或修改的文件

### 新增文件

- `apps/api/src/feed/feed.controller.ts`
- `apps/api/src/feed/feed.service.ts`
- `apps/api/src/feed/feed.service.spec.ts`
- `apps/api/src/ranking/ranking.controller.ts`
- `apps/api/src/ranking/ranking.service.spec.ts`
- `apps/api/src/analytics/analytics.controller.ts`
- `apps/api/src/analytics/analytics.service.ts`
- `apps/api/src/analytics/analytics.service.spec.ts`
- `apps/web/src/app/rankings/page.tsx`
- `apps/web/src/app/rankings/layout.tsx`
- `docs/learn/006-feed-ranking-analytics-learning.md`（实现完成后生成，本地学习文档，不上传 GitHub）

### 修改文件

- `packages/shared/src/index.ts`
- `apps/api/src/feed/feed.module.ts`
- `apps/api/src/ranking/ranking.module.ts`
- `apps/api/src/ranking/ranking.service.ts`
- `apps/api/src/analytics/analytics.module.ts`
- `apps/api/src/publish/publish.service.ts`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/articles/[id]/page.tsx`
- `apps/api/prisma/seed.ts`
- `README.md`（实现完成后更新开发进度清单）

### 暂不修改

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/**`
- `apps/web/src/app/creator/page.tsx` 中当前未提交的用户改动
- `apps/api/src/audit/**`
- `apps/api/src/scoring/**`
- `apps/api/src/drafts/**`

## 5. 数据模型或 API 变更

### 数据模型

本阶段不修改 Prisma schema，复用现有表：

- `articles`
- `quality_scores`
- `audit_records`
- `engagement_events`
- `ranking_snapshots`

原因：

- `engagement_events` 已经支持文章互动事件。
- `ranking_snapshots` 已经支持保存榜单快照。
- 本阶段不需要新增评论、粉丝、用户画像或推荐模型表。

### 新增共享类型

计划在 `packages/shared/src/index.ts` 增加：

```ts
export enum EngagementEventType {
  View = "VIEW",
  Like = "LIKE",
  Favorite = "FAVORITE",
}

export interface ArticleEngagementStats {
  views: number;
  likes: number;
  favorites: number;
}

export interface RankingScoreBreakdown {
  qualityScore: number;
  hotScore: number;
  freshnessScore: number;
  feedbackScore: number;
  rankScore: number;
}

export interface ArticleListItem {
  id: string;
  title: string;
  summary: string;
  author: {
    id: string;
    nickname: string;
  };
  publishedAt: string;
  qualityScore: number;
  engagement: ArticleEngagementStats;
  ranking: RankingScoreBreakdown;
}

export interface CursorPageResponse<T> {
  items: T[];
  nextCursor?: string;
}

export interface CreateEngagementEventInput {
  type: EngagementEventType;
  userKey?: string;
}

export interface CreateEngagementEventResponse {
  articleId: string;
  type: EngagementEventType;
  stats: ArticleEngagementStats;
}
```

`ArticleDetail` 需要扩展：

```ts
engagement: ArticleEngagementStats;
ranking?: RankingScoreBreakdown;
```

### API 设计

#### `GET /feed`

公开读取。

Query：

```text
limit=10
cursor=10
```

行为：

- 只读取 `status = PUBLISHED` 的文章。
- 聚合每篇文章的最新质量分和互动统计。
- 计算排序分解。
- 按推荐排序返回，MVP 使用 `rankScore desc, publishedAt desc`。
- `cursor` 使用偏移量字符串，便于前端实现无限滚动；后续可替换为更严格的游标结构。

响应：

```json
{
  "items": [
    {
      "id": "article_id",
      "title": "AI 如何改变内容创作",
      "summary": "文章摘要",
      "author": {
        "id": "user_id",
        "nickname": "训练营创作者"
      },
      "publishedAt": "2026-06-05T10:00:00.000Z",
      "qualityScore": 86,
      "engagement": {
        "views": 120,
        "likes": 12,
        "favorites": 6
      },
      "ranking": {
        "qualityScore": 86,
        "hotScore": 204,
        "freshnessScore": 72,
        "feedbackScore": 18,
        "rankScore": 122
      }
    }
  ],
  "nextCursor": "10"
}
```

#### `GET /rankings/hot`

公开读取。

行为：

- 热点榜更重视阅读热度和时间衰减。
- MVP 排序公式：

```text
hot_rank_score = round(hot_score * 0.75 + freshness_score * 0.25)
```

- 返回结构复用 `CursorPageResponse<ArticleListItem>`。

#### `GET /rankings/top`

公开读取。

行为：

- 爆文榜使用 PRD 中的综合排序公式：

```text
rank_score =
  quality_score * 0.45 +
  hot_score * 0.35 +
  freshness_score * 0.15 +
  feedback_score * 0.05
```

- 返回结构复用 `CursorPageResponse<ArticleListItem>`。

#### `POST /articles/:id/events`

公开写入，后续可升级为登录态用户互动。

请求：

```json
{
  "type": "VIEW",
  "userKey": "browser-generated-key"
}
```

行为：

- 只允许对已发布文章写入事件。
- `VIEW` 在文章详情打开后自动触发。
- `LIKE` 和 `FAVORITE` 由用户点击触发。
- 后端写入 `engagement_events`，并返回最新聚合统计。
- MVP 不做严格去重，前端用 `localStorage` 避免同一浏览器重复点赞或收藏；后续可在数据模型中增加唯一约束。

## 6. 前端交互与页面状态设计

### 首页 `/`

页面定位保持内容消费页，不放创作编辑器。

状态：

- `loading`：推荐流和榜单加载中。
- `ready`：展示后端返回的推荐流、热点榜和爆文榜。
- `empty`：没有已发布文章时展示去工作台创作的引导。
- `error`：展示重试按钮，保留登录入口和创作者入口。
- `loadingMore`：滚动到底部或点击加载更多时追加下一页。

交互：

- 推荐流文章卡点击进入 `/articles/[id]`。
- 右侧热点榜、爆文榜展示前 5 条，点击进入文章详情。
- 推荐流底部使用 IntersectionObserver 实现自动加载下一页；如果浏览器环境不支持，则展示“加载更多”按钮。
- 未登录用户仍可浏览内容；登录用户保留右上角创作者菜单。

### 榜单页 `/rankings`

页面结构：

- 顶部白色导航栏。
- 主体浅灰背景。
- 中间为白色榜单列表，不使用营销式 hero。
- 顶部使用两个 tab：`热点榜`、`爆文榜`。
- 每条榜单展示排名、标题、摘要、作者、质量分、阅读、点赞、收藏和排序分。

状态：

- `loading`
- `ready`
- `empty`
- `error`
- `loadingMore`

交互：

- 切换 tab 时重新请求对应接口。
- 滚动或按钮加载更多。
- 点击文章进入详情页。

### 文章详情 `/articles/[id]`

新增展示：

- 阅读数。
- 点赞数。
- 收藏数。
- 热度分和综合排序分解释。

新增交互：

- 页面加载成功后调用 `POST /articles/:id/events`，写入 `VIEW`。
- 点击点赞后调用同一接口写入 `LIKE`，更新统计。
- 点击收藏后写入 `FAVORITE`，更新统计。
- 点赞和收藏按钮用 `localStorage` 记录当前浏览器是否已点击，重复点击时只展示已操作状态，不再重复写入。

失败处理：

- 阅读事件失败不阻塞文章阅读，只在控制台或轻量状态中记录。
- 点赞或收藏失败时恢复按钮可点击，并展示错误提示。

## 7. 后端服务、鉴权、审核、评分、发布或榜单逻辑

### Feed 服务

`FeedService` 负责：

- 查询已发布文章。
- 批量读取最新质量分。
- 批量聚合互动事件。
- 调用 `RankingService` 计算排序分解。
- 根据推荐排序分页返回。

推荐流不直接复用前端静态数组，所有文章都来自数据库。

### Analytics 服务

`AnalyticsService` 负责：

- 校验文章存在且已发布。
- 写入 `engagement_events`。
- 聚合返回当前文章互动统计。

事件类型约束在后端执行，前端不得传入任意字符串。

### Ranking 服务

`RankingService` 在现有 `calculate()` 基础上扩展：

- `calculateBreakdown(input)`：返回 `RankingScoreBreakdown`。
- `calculateHotRank(input)`：返回热点榜分数。
- `sortForFeed(items)`：推荐流排序。
- `sortForHot(items)`：热点榜排序。
- `sortForTop(items)`：爆文榜排序。

排序解释：

```text
qualityScore = latest quality_scores.overall
hotScore = views * 1 + likes * 4 + favorites * 6
freshnessScore = round(100 / (1 + hours_since_publish / 12))
feedbackScore = likes + favorites

rankScore =
  qualityScore * 0.45 +
  hotScore * 0.35 +
  freshnessScore * 0.15 +
  feedbackScore * 0.05

hotRankScore = round(hotScore * 0.75 + freshnessScore * 0.25)
```

字段解释：

| 字段             | 来源                       | 用途                           |
| ---------------- | -------------------------- | ------------------------------ |
| `qualityScore`   | 最新质量评分 `overall`     | 让发布前质量评价进入分发排序   |
| `hotScore`       | 阅读、点赞、收藏事件聚合   | 表示内容消费规模和互动强度     |
| `freshnessScore` | 当前时间与发布时间的小时差 | 给新内容曝光机会，避免榜单固化 |
| `feedbackScore`  | 点赞数 + 收藏数            | 单独体现高价值正反馈           |

排序口径：

- 推荐流和爆文榜使用 `rankScore desc`，同分时按 `publishedAt desc`。
- 热点榜先使用 `hotRankScore desc`，同分时再使用 `rankScore desc` 和发布时间。
- Redis 写入 `rank:hot` 时使用 `hotRankScore`，写入 `rank:top` 时使用 `rankScore`。

### Redis 与 PostgreSQL 回退

架构文档要求 Redis Sorted Set 支持榜单。本阶段采用渐进式实现：

- 如果存在 `REDIS_URL` 且 Redis 可用，榜单刷新时写入：
  - `rank:hot`
  - `rank:top`
- 如果没有 `REDIS_URL` 或 Redis 操作失败，接口直接使用 PostgreSQL 查询与内存排序返回结果。
- 无论 Redis 是否可用，`GET /rankings/hot` 和 `GET /rankings/top` 都可以写入一条 `ranking_snapshots`，用于演示和复盘。

这样本地开发不依赖 Redis，部署环境有 Redis 时可以逐步启用缓存。

### 发布与文章详情

`PublishService.getPublishedArticle()` 增加：

- 互动统计。
- 排序分解。

但发布流程本身不改：

```text
draft -> audit -> scoring -> publish -> article snapshot
```

发布仍然必须由后端强制审核和评分，互动事件不能反向改变审核结论或发布状态。

## 8. 风险、边界情况和回滚方案

| 风险                           | 处理                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| 首页没有已发布文章             | 展示空状态和“去工作台创作”入口，并通过 seed 数据保证演示环境有内容                 |
| Redis 不可用                   | 自动回退 PostgreSQL 查询和内存排序                                                 |
| 互动事件被重复写入             | MVP 前端用 localStorage 限制点赞/收藏；后端保留 append-only 事件，后续再做唯一约束 |
| 榜单分页因实时排序变化出现重复 | MVP 使用 offset cursor，演示数据量小可接受；后续换成基于分数和 id 的稳定 cursor    |
| 阅读事件失败影响详情页         | 事件失败不阻塞正文展示                                                             |
| 排序查询一次读取太多数据       | MVP 限制榜单候选数量，例如最近 100 篇已发布文章；后续引入 Redis 定时刷新           |
| 质量分缺失                     | 使用 0 或默认分兜底，并在榜单解释中显示暂无评分                                    |
| 用户未登录                     | 内容浏览和互动仍允许匿名 userKey；创作入口继续需要登录                             |
| 当前工作区有无关改动           | 不覆盖 `apps/web/src/app/creator/page.tsx` 的现有未提交差异                        |

回滚方案：

- 删除新增 feed、ranking、analytics controller/service 文件。
- 恢复 `feed.module.ts`、`ranking.module.ts`、`analytics.module.ts`。
- 首页恢复静态示例数据。
- 文章详情移除互动按钮和事件写入。
- 移除共享类型扩展。
- 不涉及数据库迁移，回滚无需处理 schema。

## 9. 验证方式和测试计划

### 测试先行

实现时优先补充后端服务测试：

- `RankingService`：
  - 正确计算 `hotScore`、`freshnessScore`、`feedbackScore` 和 `rankScore`。
  - 热点榜按热度与新鲜度排序。
  - 爆文榜按综合分排序。

- `AnalyticsService`：
  - 对已发布文章写入 `VIEW`、`LIKE`、`FAVORITE`。
  - 对不存在或未发布文章返回 404。
  - 写入后返回最新聚合统计。

- `FeedService`：
  - 只返回已发布文章。
  - 返回最新质量分和互动统计。
  - 支持分页，并给出 `nextCursor`。

### 类型检查

```bash
pnpm typecheck
```

如当前环境没有裸 `pnpm`，使用：

```bash
corepack pnpm -r typecheck
```

### 构建检查

因为会新增 NestJS controller/service 和 Next.js 路由，运行：

```bash
pnpm --filter @bytecamp-aigc/api build
pnpm --filter @bytecamp-aigc/web build
```

如需要 `corepack`：

```bash
corepack pnpm --filter @bytecamp-aigc/api build
corepack pnpm --filter @bytecamp-aigc/web build
```

### 手动页面验证

1. 启动数据库、API 和 Web。
2. 运行 seed，确保存在演示账号、已发布文章和互动事件。
3. 打开首页 `/`，确认推荐流来自后端，而不是静态数组。
4. 确认首页热点榜和爆文榜有数据，并且点击可进入文章详情。
5. 滚动推荐流底部，确认可以加载更多或展示没有更多内容。
6. 打开 `/rankings`，确认可以在热点榜和爆文榜之间切换。
7. 打开任意 `/articles/[id]`，确认阅读数、点赞数、收藏数显示。
8. 刷新或重新打开详情页，确认阅读事件写入后统计增加。
9. 点击点赞和收藏，确认按钮状态变化，统计更新。
10. 同一浏览器重复点击点赞或收藏，确认不会重复写入。
11. 暂停 Redis 或不配置 `REDIS_URL`，确认榜单接口仍正常返回。
12. 使用不存在的文章 id 调用互动接口，确认返回 404。

### 数据库验证

互动后检查：

- `engagement_events` 新增对应记录。
- `type` 为 `VIEW`、`LIKE` 或 `FAVORITE`。
- `articleId` 指向已发布文章。

榜单后检查：

- `ranking_snapshots` 新增 `hot` 或 `top` 快照。
- 快照 payload 中包含文章 id、排序分和生成时间。

## 10. 与总体架构的一致性

- `apps/web` 只负责页面展示、滚动加载、按钮状态和触发 API。
- `apps/api` 负责互动事件持久化、分发排序、榜单快照和 Redis / PostgreSQL 回退。
- `packages/shared` 负责前后端共享 DTO、枚举、分页结构和排序解释类型。
- 榜单排序和互动聚合不放到前端，避免用户篡改排序结果。
- 发布状态仍来自后端发布流程，互动数据只影响分发，不改变审核和评分记录。
- 页面主体样式继续使用 Tailwind CSS utility class，保持工具型内容平台风格。

## 11. 实现完成后的学习文档

实现完成后，根据 `AGENTS.md` 生成：

```text
docs/learn/006-feed-ranking-analytics-learning.md
```

学习文档面向第一次做全栈应用的初学者，重点解释：

- 为什么发布文章后还需要单独的分发和互动链路。
- 用户从首页打开文章，到后端写入阅读事件，再到榜单排序变化的完整链路。
- Feed、Ranking、Analytics 三个后端模块分别承担什么责任。
- Controller、Service、Prisma、DTO、localStorage 和分页在本功能中的作用。
- 热点榜和爆文榜为什么不是同一个排序。
- Redis 为什么是加速和缓存能力，而不是本地演示的硬依赖。
- 如何通过页面、接口、数据库、类型检查和构建命令验证功能正确。
- 常见误区：在前端计算榜单、没有发布状态过滤、重复写入互动、没有 Redis 回退、把创作者统计和榜单排序混在一个阶段。
