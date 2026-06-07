# 断网草稿同步与 Redis 榜单缓存技术方案

## 1. 功能目标和用户价值

本阶段一次推进 README 中两个剩余关键待办：

```text
编辑器与草稿闭环
  -> 实现断网本地暂存，网络恢复后同步到后端

内容详情、信息流与榜单
  -> 使用 Redis Sorted Set 维护榜单，Redis 不可用时回退到 PostgreSQL
```

这两个功能分别补齐“创作者写作不丢稿”和“读者榜单分发更接近生产架构”的能力。

用户价值：

- 创作者在断网、弱网或 API 临时不可用时，标题和正文不会丢失。
- 网络恢复后，草稿能自动或半自动同步到后端，发布前仍强制要求服务端草稿为事实源。
- 榜单不再完全依赖每次 PostgreSQL 查询后内存排序，Redis 可用时用 Sorted Set 承载热点榜和爆文榜排序。
- Redis 不可用时页面和接口仍可正常返回 PostgreSQL 排序结果，保证演示稳定。
- 初学者能在同一阶段理解两个常见全栈可靠性设计：浏览器本地暂存与后端缓存回退。

## 2. 本阶段范围选择

### 推荐方案：先做草稿离线同步，再做 Redis 榜单缓存

本阶段按顺序实现：

1. 草稿断网同步
   - 扩展现有 `draft-offline-state.ts`，增加本地暂存元数据。
   - 草稿编辑页监听网络状态。
   - 保存失败或离线时写入 localStorage。
   - 网络恢复后自动尝试同步到 `PATCH /drafts/:id`。
   - 同步成功后清理本地暂存、刷新版本记录。
   - 发现服务端版本变化时提示冲突，不自动覆盖。

2. Redis 榜单缓存
   - 新增 `RankingCacheService` 封装 ioredis Sorted Set。
   - `GET /rankings/hot` 和 `GET /rankings/top` 优先读取 Redis 排序。
   - Redis 未配置、不可用、miss 或异常时回退现有 PostgreSQL + 内存排序。
   - 回退计算后写回 Redis。
   - 发布、撤回和互动事件后失效或清理榜单缓存。

推荐这个顺序的原因：

- 草稿同步只改前端草稿页和 helper，不依赖 Redis，本地验证快。
- Redis 榜单涉及后端缓存、发布、互动和撤回后的失效，放在第二步更容易回归测试。
- 两者都不需要修改 Prisma schema，整体风险可控。

### 暂不采用的方案

- 不使用 IndexedDB 承载离线草稿。localStorage 足够覆盖 MVP 的标题和 TipTap JSON 正文；图片素材离线缓存留到素材模块。
- 不新增专用草稿同步 API。继续复用 `PATCH /drafts/:id`，避免扩大后端契约。
- 不把完整文章列表 JSON 存入 Redis。榜单缓存使用 Sorted Set，符合架构文档。
- 不让前端参与榜单排序。排序、缓存和公开可见性继续由后端负责。

## 3. 涉及模块

### 前端 `apps/web`

- `apps/web/src/app/drafts/[id]/page.tsx`
  - 增加网络状态、离线同步状态、冲突提示和重试入口。
  - 页面加载时读取本地暂存并与服务端版本比较。
  - 网络恢复后自动同步本地暂存。
  - 有本地未同步内容、冲突或同步中时继续禁用发布按钮。
- `apps/web/src/lib/draft-offline-state.ts`
  - 扩展本地暂存结构。
  - 增加兼容旧结构、冲突判断、摘要文案等纯函数。
- `apps/web/src/lib/draft-offline-state.test.ts`
  - 覆盖本地暂存读写、坏 JSON 容错、旧结构兼容、冲突判断和清理。

榜单页面本阶段不改 UI，继续调用现有接口。

### 后端 `apps/api`

- `apps/api/src/ranking/ranking-cache.service.ts`
  - 新增 Redis 连接、Sorted Set 读写、失效和容错封装。
- `apps/api/src/ranking/ranking.module.ts`
  - 注册 `RankingCacheService`。
- `apps/api/src/feed/feed.service.ts`
  - 榜单接口优先读 Redis。
  - Redis 失败时回退 PostgreSQL 排序。
  - 回退结果写回 Redis，并继续记录 `ranking_snapshots`。
- `apps/api/src/publish/publish.service.ts`
  - 发布成功后失效榜单缓存。
  - 撤回文章后从 Redis 榜单移除或失效。
- `apps/api/src/analytics/analytics.service.ts`
  - 阅读、点赞、收藏写入后失效榜单缓存。

### 共享包 `packages/shared`

- 不新增共享类型。
- 草稿离线状态属于浏览器私有状态，留在 `apps/web`。
- 榜单响应继续使用现有 `ArticleListItem`、`RankingScoreBreakdown`。

## 4. 需要新增或修改的文件

### 新增文件

- `apps/api/src/ranking/ranking-cache.service.ts`
- `apps/api/src/ranking/ranking-cache.service.spec.ts`
- `docs/learn/015-draft-offline-sync-and-redis-ranking-learning.md`，实现完成后生成。

### 修改文件

- `apps/web/src/app/drafts/[id]/page.tsx`
- `apps/web/src/lib/draft-offline-state.ts`
- `apps/web/src/lib/draft-offline-state.test.ts`
- `apps/api/src/ranking/ranking.module.ts`
- `apps/api/src/feed/feed.service.ts`
- `apps/api/src/feed/feed.service.spec.ts`
- `apps/api/src/publish/publish.service.ts`
- `apps/api/src/publish/publish.service.spec.ts`
- `apps/api/src/analytics/analytics.service.ts`
- `apps/api/src/analytics/analytics.service.spec.ts`
- `.env.example`
- `README.md`

### 暂不修改

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/**`
- `packages/shared/src/index.ts`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/rankings/page.tsx`

## 5. 数据模型或 API 变更

### Prisma 数据模型

不修改 Prisma schema，不新增迁移。

草稿同步继续使用：

```text
GET   /drafts/:id
PATCH /drafts/:id
GET   /drafts/:id/versions
```

榜单继续使用：

```text
GET /rankings/hot
GET /rankings/top
GET /feed
POST /articles/:id/events
POST /publish/:draftId
POST /articles/:id/withdraw
```

### 草稿本地暂存结构

现有结构：

```ts
interface DraftOfflineState {
  title: string;
  body: RichTextDocument;
}
```

扩展为：

```ts
interface DraftOfflineState {
  draftId: string;
  title: string;
  body: RichTextDocument;
  baseVersion: number;
  serverUpdatedAt: string;
  localUpdatedAt: string;
  reason: "offline" | "save_failed" | "sync_failed";
}
```

兼容策略：

- 旧结构仍可读取恢复。
- 旧结构缺少版本信息时，不自动覆盖服务端，要求用户确认。
- 同步成功后清理 localStorage。

### Redis 数据结构

```text
rank:hot
  member: articleId
  score: hotRankScore

rank:top
  member: articleId
  score: compositeRankScore
```

可选调试元数据：

```text
rank:hot:updated_at
rank:top:updated_at
```

`.env.example` 补充：

```env
REDIS_URL=redis://localhost:6379
```

未配置 `REDIS_URL` 时 API 启动不失败，榜单直接走 PostgreSQL 回退。

## 6. 前端交互与页面状态设计

### 草稿编辑页

新增状态：

```ts
type NetworkState = "online" | "offline";
type OfflineSyncState =
  | "idle"
  | "local_pending"
  | "syncing"
  | "synced"
  | "sync_failed"
  | "conflict";
```

交互路径：

1. 页面加载服务端草稿后读取 localStorage。
2. 如果存在本地暂存：
   - `baseVersion === draft.version`：提示“检测到本地未同步内容”，允许恢复或自动同步。
   - `baseVersion < draft.version`：提示“服务端已有更新”，用户选择覆盖保存本地内容或放弃本地暂存。
3. 用户编辑后保持 `dirty=true`。
4. 保存时：
   - 浏览器离线：直接写 localStorage，显示“离线编辑中，恢复网络后自动同步”。
   - 请求失败：写 localStorage，显示“保存失败，已暂存到本地”。
5. 浏览器触发 `online` 后：
   - 无冲突则自动 PATCH 同步。
   - 成功后清理 localStorage，刷新版本记录。
   - 失败后继续保留本地暂存并显示重试入口。
6. 有本地未同步内容、冲突或同步中时，发布按钮不可用。

视觉要求：

- 继续使用浅灰应用背景、白色编辑画布、右侧 AI 助手面板。
- 状态提示使用克制的浅色提示条。
- 移动端提示条允许换行，底部操作区不能遮挡正文输入。

### 榜单页面

本阶段不修改前端页面。

- Redis 命中或 PostgreSQL 回退对页面透明。
- 分页 cursor 继续使用当前 offset 字符串。
- 页面错误处理沿用现有逻辑。

## 7. 后端服务、鉴权、审核、评分、发布和榜单逻辑

### 草稿同步

- 鉴权继续由现有草稿接口负责。
- 前端同步仍调用 `PATCH /drafts/:id`。
- 后端继续保存草稿、递增版本并创建版本快照。
- 发布页不读取 localStorage，必须依赖服务端草稿。
- 审核、评分和发布逻辑不变。

### Redis 榜单缓存

`RankingCacheService`：

- 从 `ConfigService` 读取 `REDIS_URL`。
- 未配置时不创建 Redis 连接。
- Redis 命令失败时 catch 并返回失败状态，不让榜单接口失败。
- 应用关闭时断开 Redis 连接。

`FeedService.listRanking(kind)`：

```text
normalize limit/cursor
  -> try read articleIds from Redis sorted set by score desc
  -> Redis hit:
       load published articles by ids from PostgreSQL
       keep Redis order
       build ArticleListItem
       record ranking snapshot
       return page
  -> Redis miss/error:
       run current PostgreSQL candidate + memory sort
       write sorted ids and scores into Redis
       record ranking snapshot
       return page
```

失效策略：

- 发布成功：删除 `rank:hot` 和 `rank:top`，下一次榜单请求重建。
- 互动事件写入：删除 `rank:hot` 和 `rank:top`，下一次榜单请求重建。
- 文章撤回：从 sorted set 移除该 articleId，或直接删除两个榜单 key。

关键约束：

- Redis 只存 articleId 和分数。
- PostgreSQL 仍过滤 `ArticleStatus.Published`，撤回文章不会因 Redis 残留公开。
- 质量分、互动数据、文章正文、作者信息仍以 PostgreSQL 为事实源。

## 8. 风险、边界情况和回滚方案

| 风险 | 处理 |
| --- | --- |
| localStorage 不可用 | helper 保持 try/catch，页面降级为普通保存失败提示 |
| 网络恢复但 API 仍不可用 | 同步失败后保留本地暂存，显示重试入口 |
| 服务端版本已经变化 | 进入冲突状态，不自动覆盖 |
| 旧本地暂存缺少版本信息 | 兼容读取，但要求用户确认后保存 |
| 未同步内容进入发布 | `canPublish` 排除本地未同步、冲突和同步中状态 |
| Redis 未启动或未配置 | API 启动不失败，榜单走 PostgreSQL 回退 |
| Redis 中残留撤回文章 | PostgreSQL 查询只取 `PUBLISHED` |
| Redis 新鲜度分变旧 | 发布和互动后失效，榜单请求重建 |
| Redis hit 文章详情数量不足 | 跳过无效文章，不足时回退或补充 PostgreSQL 排序 |

回滚方案：

- 草稿部分：恢复 `draft-offline-state.ts` 简单结构，移除草稿页网络监听和同步状态。
- 榜单部分：从 `FeedService` 移除 `RankingCacheService` 依赖，恢复当前 PostgreSQL 排序路径。
- 删除 `ranking-cache.service.ts` 和相关测试。
- 不涉及数据库迁移，回滚不需要数据处理。

## 9. 验证方式和测试计划

### 前端测试

```bash
pnpm --filter @bytecamp-aigc/web test
```

覆盖：

- 草稿本地暂存新结构读写清理。
- 旧结构兼容读取。
- 坏 JSON 容错。
- 版本冲突判断。
- 同步成功后清理本地暂存。

### 后端测试

```bash
pnpm --filter @bytecamp-aigc/api test
```

覆盖：

- Redis 未配置时 cache service 不可用但不抛错。
- Redis hit 时榜单按 Redis 顺序返回。
- Redis miss 时走 PostgreSQL 排序并写回 Redis。
- Redis 异常时回退 PostgreSQL。
- 发布、互动、撤回后触发榜单失效或移除。

### 类型检查

```bash
pnpm typecheck
```

### 构建检查

```bash
pnpm --filter @bytecamp-aigc/web build
pnpm --filter @bytecamp-aigc/api build
```

### 手动草稿验证

1. 登录并进入 `/drafts/:id`。
2. 修改标题和正文，停止 API 或断开网络。
3. 点击保存，确认页面提示已暂存到本地。
4. 刷新页面，确认检测到本地未同步内容。
5. 恢复网络或 API，确认自动同步。
6. 同步成功后刷新页面，确认服务端内容已更新、本地暂存已清理。
7. 制造服务端版本变化后恢复本地暂存，确认页面提示冲突。
8. 有本地未同步内容时确认发布按钮不可用。

### 手动 Redis 验证

1. 启动数据库和 Redis：

```bash
pnpm db:up
```

2. 确认 `.env` 中存在：

```env
REDIS_URL=redis://localhost:6379
```

3. 访问：

```text
GET /rankings/hot
GET /rankings/top
```

4. 使用 Redis CLI 或日志确认：

```text
ZRANGE rank:hot 0 -1 WITHSCORES
ZRANGE rank:top 0 -1 WITHSCORES
```

5. 点赞、收藏或发布新文章后再次访问榜单，确认榜单会重建。
6. 停止 Redis 或清空 `REDIS_URL`，确认榜单接口仍能返回 PostgreSQL 排序结果。

### 数据库验证

- 草稿同步成功后 `drafts.version` 递增。
- `draft_versions` 新增对应快照。
- Redis 不写入文章正文、审核结果或完整用户信息。
- `ranking_snapshots` 继续写入榜单快照。

## 10. 与总体架构的一致性

- `apps/web` 只负责草稿编辑状态、本地暂存、网络状态和 API 调用。
- `apps/api` 负责草稿保存、版本递增、榜单排序、Redis 缓存和回退。
- `packages/shared` 不承载浏览器私有 localStorage 类型，也不新增 Redis 专用契约。
- 审核、评分、发布和公开可见性仍由后端控制。
- Redis 是缓存和加速层，不是事实源；PostgreSQL 仍保存文章、评分、互动、发布状态和快照。
- 页面主体样式继续使用 Tailwind CSS utility class。

## 11. 实现完成后的学习文档

实现完成后生成：

```text
docs/learn/015-draft-offline-sync-and-redis-ranking-learning.md
```

学习文档面向初学者，重点解释：

- 草稿断网同步解决什么业务问题，Redis 榜单缓存解决什么业务问题。
- 用户从编辑页面到 localStorage、网络恢复、PATCH 草稿、版本快照的完整链路。
- 用户从榜单页面到 Controller、FeedService、RankingService、RankingCacheService、Redis 和 PostgreSQL 的完整链路。
- React 状态、浏览器 `online/offline` 事件、localStorage、HTTP 请求、Controller、Service、Prisma、Redis Sorted Set 分别承担什么责任。
- 成功路径、保存失败路径、同步失败路径、版本冲突路径、Redis hit、Redis miss、Redis 异常回退分别发生什么。
- 如何通过页面、接口、localStorage、Redis CLI、数据库、类型检查、测试和构建命令验证功能正确。
- 常见误区：本地暂存后允许发布、自动覆盖服务端新版本、把 Redis 当唯一数据源、在前端计算榜单、撤回文章只改数据库不处理缓存。
