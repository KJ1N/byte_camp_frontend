# 每日资讯 Redis 快照与手动刷新技术方案

## 1. 功能目标和用户价值

Creator 页面右侧有“每日 AI 资讯”和“每日热点资讯”。这两类内容都来自开放 API，按天更新，不需要每次进入页面都重复请求外部服务。

本次优化目标：

```text
默认加载：
  -> 优先读取 Redis 当天快照
  -> 当天没有快照时才请求外部 API

手动刷新：
  -> 用户点击“刷新”
  -> 后端强制重新请求外部 API
  -> 外部返回非空 news 时覆盖当天快照和最近非空快照

空消息：
  -> 外部 API 成功返回 news: [] 才认为“今日无消息”
  -> 页面提示今日无消息
  -> 同时返回 Redis 中最近有消息的一天
```

AI 资讯和热点资讯都接入这套机制：

- 今天 AI 资讯有消息：写入 `ai:{today}` 和 `ai:latest`。
- 今天热点资讯有消息：写入 `hot:{today}` 和 `hot:latest`。
- 明天 AI 或热点返回 `news: []`：写入“明天为空”的当天快照，同时返回最近非空快照内容。
- 用户点击刷新：重新请求外部 API，不只读取 Redis。

用户价值：

- 减少外部 API 调用次数，页面进入更快、更稳定。
- 外部接口慢时不误判为“今日无消息”。
- 今天没有新资讯时，仍能展示最近有消息的一天作为选题参考。
- 手动刷新保留实时性，用户需要时可以主动拉取最新内容。

## 2. 涉及模块

### 前端 `apps/web`

- `apps/web/src/app/creator/page.tsx`
  - 默认进入页面继续请求 `/news/creator-daily`。
  - 点击“刷新”时请求 `/news/creator-daily?refresh=1`。
  - AI 和热点两栏都支持空日消息提示：
    - `aiNewsEmptyDate` 存在时，显示今日 AI 资讯暂无消息。
    - `hotNewsEmptyDate` 存在时，显示今日热点资讯暂无消息。
  - 如果空日消息同时带回最近非空列表，页面提示“已展示最近有消息的一天”。

### 后端 `apps/api`

- `apps/api/src/news/news.controller.ts`
  - 增加 `refresh` 查询参数解析。
  - `refresh=1` / `refresh=true` 表示手动刷新，跳过 Redis 当天快照读取，强制请求外部 API。

- `apps/api/src/news/news.service.ts`
  - 默认请求优先读 Redis 当天快照。
  - 当天快照缺失时请求外部 API。
  - 手动刷新时强制请求外部 API。
  - 外部返回非空 `news` 时写入当天快照和最近非空快照。
  - 外部返回 `news: []` 时写入当天空快照，并读取最近非空快照返回。
  - 外部超时、失败、字段缺失时不能当作“今日无消息”。

- `apps/api/src/news/news-cache.service.ts`（新增）
  - 封装 Redis 读写。
  - 支持 AI / HOT 两种资讯类型。
  - Redis 未配置或命令失败时返回 `null` / `false`，不影响主接口。
  - 复用项目已有的可选 Redis 设计。

- `apps/api/src/news/news.module.ts`
  - 注册 `NewsCacheService`。

### 共享包 `packages/shared`

- `packages/shared/src/index.ts`
  - `CreatorDailyNewsResponse` 增加或保留以下可选字段：

```ts
aiNewsDate?: string;
aiNewsEmptyDate?: string;
hotNewsDate?: string;
hotNewsEmptyDate?: string;
```

字段含义：

- `date`：用户请求的业务日期，一般是今天。
- `aiNewsDate`：实际展示的 AI 资讯来自哪一天。
- `aiNewsEmptyDate`：哪一天的 AI 资讯接口明确返回了 `news: []`。
- `hotNewsDate`：实际展示的热点资讯来自哪一天。
- `hotNewsEmptyDate`：哪一天的热点资讯接口明确返回了 `news: []`。

## 3. 新增或修改文件

计划新增：

- `apps/api/src/news/news-cache.service.ts`
- `apps/api/src/news/news-cache.service.spec.ts`
- `docs/learn/022-creator-daily-news-redis-snapshot-learning.md`（实现完成后生成，学习文档不提交 GitHub）

计划修改：

- `apps/api/src/news/news.controller.ts`
- `apps/api/src/news/news.module.ts`
- `apps/api/src/news/news.service.ts`
- `apps/api/src/news/news.service.spec.ts`
- `apps/web/src/app/creator/page.tsx`
- `packages/shared/src/index.ts`

## 4. Redis 数据结构设计

Redis 保存两类快照：

1. 当天快照：避免同一天反复请求外部 API。
2. 最近非空快照：当今天 `news: []` 时展示最近有消息的一天。

### Key 设计

AI 资讯：

```text
news:creator-daily:ai:2026-06-10
news:creator-daily:ai:latest
```

热点资讯：

```text
news:creator-daily:hot:2026-06-10
news:creator-daily:hot:latest
```

当天快照 value：

```json
{
  "requestedDate": "2026-06-11",
  "contentDate": "2026-06-10",
  "emptyDate": "2026-06-11",
  "items": [
    {
      "id": "ai-2026-06-10-1",
      "kind": "AI",
      "title": "AI 资讯标题",
      "summary": "摘要",
      "content": "完整选题内容",
      "source": "来源",
      "date": "2026-06-10",
      "url": "https://example.com"
    }
  ],
  "updatedAt": "2026-06-11T08:00:00.000Z"
}
```

说明：

- `requestedDate`：用户请求的日期。
- `contentDate`：实际返回内容来自哪一天。
- `emptyDate`：如果请求日期的外部 `news: []`，记录这个日期；否则为空。
- `items`：实际展示的资讯列表。

最近非空快照 value：

```json
{
  "requestedDate": "2026-06-10",
  "contentDate": "2026-06-10",
  "items": ["非空资讯列表"],
  "updatedAt": "2026-06-10T08:00:00.000Z"
}
```

### TTL 策略

- 当天快照 key 设置 2 到 7 天 TTL，避免 Redis 无限增长。
- `latest` key 不设置短 TTL，直到下一次非空资讯覆盖。
- Redis 是缓存层，不是长期事实源；后续如需审计和历史查询，再接 PostgreSQL `news_snapshots`。

## 5. 后端链路设计

### 默认加载：优先 Redis

```text
GET /news/creator-daily
  -> 计算 today
  -> 读取 Redis ai:{today}
  -> 读取 Redis hot:{today}
  -> 两类当天快照都命中：
       直接返回，不请求外部 API
  -> 任一缺失：
       只请求缺失的外部接口
       成功后写入 Redis
```

### 手动刷新：强制请求外部 API

```text
GET /news/creator-daily?refresh=1
  -> 跳过 Redis 当天快照读取
  -> 重新请求 /v2/ai-news
  -> 重新请求 /v2/60s
  -> 非空 news 覆盖当天快照和 latest
  -> news: [] 写入当天空快照，并读取 latest 返回
```

手动刷新仍然遵守错误语义：

- 外部接口超时或失败，不显示“今日无消息”。
- 有 Redis 旧快照时可以返回旧快照并标记 `source: "cache"`。
- 没有任何快照时返回 `ServiceUnavailableException`。

### 今天有消息

```text
provider 返回 news: [ ... ]
  -> normalize 为 DailyNewsItem[]
  -> 写入 news:creator-daily:{kind}:{today}
  -> 覆盖 news:creator-daily:{kind}:latest
  -> 返回 {kind}NewsDate=today, {kind}NewsEmptyDate=undefined
```

### 今天明确无消息

```text
provider 返回 news: []
  -> 读取 news:creator-daily:{kind}:latest
      -> 有 latest：
           写入 today 快照，emptyDate=today，contentDate=latest.contentDate，items=latest.items
           返回 today 无消息提示 + latest 内容
      -> 无 latest：
           写入 today 空快照，emptyDate=today，contentDate=today，items=[]
           返回 today 无消息提示 + 空列表
```

### 失败路径

```text
provider 超时 / HTTP 错误 / news 字段不存在
  -> 不能写入 emptyDate
  -> 不能显示“今日无消息”
  -> 尝试返回 Redis 当天快照或 latest 快照
  -> 没有可用快照时抛 ServiceUnavailableException
```

## 6. 前端交互与页面状态

前端只消费 API 响应，不直接读 Redis。

| 响应状态                                  | 页面表现                                                           |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `aiNewsEmptyDate` 不存在，`aiNews` 非空   | 正常展示 AI 资讯                                                   |
| `aiNewsEmptyDate` 存在，`aiNews` 非空     | 显示“今日 AI 资讯暂无消息，已展示最近有消息的一天（日期）的资讯。” |
| `aiNewsEmptyDate` 存在，`aiNews` 为空     | 显示“今日 AI 资讯暂无消息。”                                       |
| `hotNewsEmptyDate` 不存在，`hotNews` 非空 | 正常展示热点资讯                                                   |
| `hotNewsEmptyDate` 存在，`hotNews` 非空   | 显示“今日热点资讯暂无消息，已展示最近有消息的一天（日期）的资讯。” |
| `hotNewsEmptyDate` 存在，`hotNews` 为空   | 显示“今日热点资讯暂无消息。”                                       |
| 接口失败                                  | 显示加载失败 / 重试，不显示“今日无消息”                            |

刷新按钮：

```text
用户点击刷新
  -> loadDailyNews(token, { refresh: true })
  -> GET /news/creator-daily?refresh=1
  -> 按钮显示加载中
  -> 响应回来后更新两栏资讯
```

## 7. 鉴权、审核、评分、发布和榜单逻辑

- 接口仍使用 `JwtAuthGuard`。
- Redis 快照只服务 Creator 页面选题素材，不影响草稿、审核、质量评分、发布或榜单。
- 不把资讯快照写入前端 localStorage，避免缓存规则分散。
- 不新增用户维度缓存，所有登录创作者共享同一份每日资讯快照。
- 不自动降级到 mock；`mock` 只在显式 `NEWS_PROVIDER_MODE=mock` 时使用。

## 8. 风险、边界情况和回滚方案

| 风险或边界                           | 处理                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------- |
| Redis 未配置                         | `NewsCacheService` disabled，保持实时接口和服务内存缓存逻辑             |
| Redis 命令失败                       | catch 后返回 `null` / `false`，不影响主接口                             |
| 今天 `news: []` 且 Redis 没有 latest | 写入当天空快照，前端显示今日无消息                                      |
| 今天接口超时                         | 不写 emptyDate，不显示今日无消息                                        |
| 手动刷新时接口失败                   | 有快照返回快照，无快照返回错误                                          |
| 快照 JSON 结构损坏                   | 读取失败视为 miss，继续实时或其他缓存路径                               |
| Redis latest 太旧                    | MVP 按最近非空展示；后续可加最大可回退天数                              |
| 回滚                                 | 删除 `NewsCacheService` 注入和调用，恢复 `NewsService` 当前内存缓存逻辑 |

## 9. 验证方式和测试计划

### 单元测试

- `news-cache.service.spec.ts`
  - Redis 未配置时读取返回 `null`。
  - `getDailySnapshot(kind, date)` 能读取当天快照。
  - `setDailySnapshot(kind, snapshot)` 能写入当天 key。
  - `getLatestSnapshot(kind)` 能读取最近非空快照。
  - `setLatestSnapshot(kind, snapshot)` 能覆盖 latest key。
  - Redis JSON 损坏时返回 `null`。
  - Redis 命令失败时不抛出。

- `news.service.spec.ts`
  - 默认加载命中 AI 和 HOT 当天快照时，不请求外部 API。
  - 默认加载缺少 AI 快照时，只请求 AI 外部接口。
  - 手动刷新 `refresh=1` 时，即使 Redis 有当天快照也重新请求外部 API。
  - AI 今天 `news` 非空时写入 AI 当天快照和 AI latest。
  - HOT 今天 `news` 非空时写入 HOT 当天快照和 HOT latest。
  - AI 今天 `news: []` 且 Redis 有 latest 时，返回 latest 并设置 `aiNewsEmptyDate=today`。
  - HOT 今天 `news: []` 且 Redis 有 latest 时，返回 latest 并设置 `hotNewsEmptyDate=today`。
  - 外部接口超时，不写 emptyDate，不显示今日无消息。
  - `NEWS_PROVIDER_MODE=mock` 仍只在显式 mock 模式下生效。

### 类型检查和构建

```bash
corepack pnpm --filter @bytecamp-aigc/api exec node --test -r ts-node/register src/news/news.service.spec.ts src/news/news-cache.service.spec.ts
corepack pnpm typecheck
corepack pnpm --filter @bytecamp-aigc/api build
corepack pnpm --filter @bytecamp-aigc/web build
```

### 手动验证

1. 模拟 `2026-06-10` AI 和 HOT 都返回非空，确认 Redis 写入：

```text
news:creator-daily:ai:2026-06-10
news:creator-daily:ai:latest
news:creator-daily:hot:2026-06-10
news:creator-daily:hot:latest
```

2. 再次打开 Creator 页面，不点击刷新，确认直接读取 Redis 当天快照。

3. 点击刷新，确认请求 `/news/creator-daily?refresh=1`，并重新请求外部 API。

4. 模拟 `2026-06-11` AI 返回 `news: []`，确认接口返回：

```json
{
  "date": "2026-06-11",
  "aiNewsDate": "2026-06-10",
  "aiNewsEmptyDate": "2026-06-11",
  "aiNews": ["2026-06-10 的 AI 消息"]
}
```

5. 模拟 `2026-06-11` HOT 返回 `news: []`，确认接口返回：

```json
{
  "date": "2026-06-11",
  "hotNewsDate": "2026-06-10",
  "hotNewsEmptyDate": "2026-06-11",
  "hotNews": ["2026-06-10 的热点消息"]
}
```

6. 关闭 Redis 或清空 `REDIS_URL`，确认接口仍可启动，失败时显示重试而不是今日无消息。

## 10. 是否加入作业提交文档

该改动仍然可控，且符合现有架构中“Redis 作为缓存层”的方向，因此建议直接按本技术方案实现，不需要只写入作业提交文档的“未来优化方向”。

如果后续要把每日资讯历史长期保存、做运营后台查询或审计，再将 PostgreSQL `news_snapshots` 表作为后续优化写入作业提交文档。
