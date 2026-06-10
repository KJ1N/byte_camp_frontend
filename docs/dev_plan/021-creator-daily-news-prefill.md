# Creator 每日资讯接入与工作台预填方案

## 1. 功能目标和用户价值

本次功能把创作者主页右侧的“创作灵感”改为基于接口文档的两类日更资讯：

- 每日 AI 资讯：来自 `GET https://60s.viki.moe/v2/ai-news`，用于给创作者提供 AI、大模型、工具和行业动态选题。
- 每日热点资讯：来自 `GET https://60s.viki.moe/v2/60s`，用于给创作者提供当天社会热点、科技、民生等通用选题。

用户在 Creator 页面点击某条资讯卡片后，跳转到 `/workspace`，并用该资讯内容覆盖工作台当前本地暂存内容：

```text
Creator 每日资讯卡片
  -> 写入一次性工作台预填 payload
  -> 跳转 /workspace?prefill=creator-news
  -> 工作台读取 payload
  -> 清空旧的工作台本地暂存
  -> 预填主题、标题、正文素材
```

这样创作者可以从当天热点直接进入写作链路，减少从“看热点”到“写草稿”的摩擦。

## 2. 接口文档摘要

接口文档来自用户提供的 `D:\Users\10593\Desktop\热点资讯文档.docx`。

### 2.1 每日 AI 资讯

```text
GET https://60s.viki.moe/v2/ai-news
```

Query 参数：

- `date`：可选，新闻日期，格式 `2025-11-11`。
- `all`：可选，设置为 `1` 时拉取所有日期。
- `encoding`：可选，支持 `text`、`json`、`markdown`。

主要返回结构：

```json
{
  "code": 200,
  "message": "获取成功",
  "data": {
    "date": "2025-11-11",
    "news": [
      {
        "title": "字节发布 Doubao-Seed-Code 编程模型",
        "detail": "新闻详情",
        "link": "https://example.com",
        "source": "火山引擎",
        "date": "2025-11-11"
      }
    ]
  }
}
```

接口说明强调：AI 资讯不是每天都有，建议判空处理。

### 2.2 每日热点资讯

```text
GET https://60s.viki.moe/v2/60s
```

Query 参数：

- `date`：可选，默认当天，格式 `2025-03-01`。
- `encoding`：可选，支持 `text`、`json`、`markdown`、`image`、`image-proxy`。
- `force-update`：可选，强制刷新缓存。

主要返回结构：

```json
{
  "code": 200,
  "message": "获取成功",
  "data": {
    "date": "2025-03-01",
    "news": ["热点新闻 1", "热点新闻 2"],
    "image": "图片链接",
    "tip": "每日一句",
    "cover": "封面",
    "link": "原始链接"
  }
}
```

## 3. 涉及模块

### 前端 `apps/web`

- `apps/web/src/app/creator/page.tsx`
  - 把右侧“创作灵感”替换为“每日资讯”面板。
  - 同时展示“每日 AI 资讯”和“每日热点资讯”两组内容。
  - 点击资讯卡片时写入工作台预填状态，并跳转到 `/workspace?prefill=creator-news`。

- `apps/web/src/app/workspace/page.tsx`
  - 读取一次性工作台预填状态。
  - 预填状态优先级高于旧的本地草稿。
  - 读取后清理一次性预填状态，避免下次误覆盖。

- `apps/web/src/lib/workspace-prefill.ts`
  - 新增一次性预填状态的写入、读取、清理和规范化逻辑。
  - 把资讯内容转换为工作台可用的标题、主题、正文素材。

### 后端 `apps/api`

- 新增 `apps/api/src/news/`
  - `news.module.ts`
  - `news.controller.ts`
  - `news.service.ts`
  - `news.service.spec.ts`

后端负责调用外部资讯接口，前端不直接访问 `60s.viki.moe`，保持“薄前端、厚后端”的架构边界。

### 共享包 `packages/shared`

- `packages/shared/src/index.ts`
  - 新增每日资讯共享类型，例如：

```ts
export type DailyNewsKind = "AI" | "HOT";

export interface DailyNewsItem {
  id: string;
  kind: DailyNewsKind;
  title: string;
  summary: string;
  content: string;
  source: string;
  date: string;
  url?: string;
}

export interface CreatorDailyNewsResponse {
  source: "60s.viki.moe" | "mock";
  date: string;
  aiNews: DailyNewsItem[];
  hotNews: DailyNewsItem[];
}
```

## 4. 新增或修改文件

预计新增：

- `apps/api/src/news/news.module.ts`
- `apps/api/src/news/news.controller.ts`
- `apps/api/src/news/news.service.ts`
- `apps/api/src/news/news.service.spec.ts`
- `apps/web/src/lib/workspace-prefill.ts`
- `apps/web/src/lib/workspace-prefill.test.ts`
- `docs/learn/021-creator-daily-news-prefill.md`

预计修改：

- `apps/api/src/app.module.ts`
- `apps/web/src/app/creator/page.tsx`
- `apps/web/src/app/workspace/page.tsx`
- `packages/shared/src/index.ts`
- `docs/PRD.md`
- `docs/architecture.md`

## 5. 数据模型或 API 变更

本次不新增数据库表，不改 Prisma schema。

新增后端接口：

```text
GET /news/creator-daily
```

Query 参数：

- `date`：可选，透传给外部接口。

响应：

```json
{
  "source": "60s.viki.moe",
  "date": "2026-06-10",
  "aiNews": [],
  "hotNews": [
    {
      "id": "hot-2026-06-10-1",
      "kind": "HOT",
      "title": "热点标题",
      "summary": "热点摘要",
      "content": "进入工作台后预填的正文素材",
      "source": "每日 60 秒",
      "date": "2026-06-10",
      "url": "https://..."
    }
  ]
}
```

后端会对外部数据做统一规范化：

- AI 资讯：`title` 映射为标题，`detail` 映射为摘要和正文素材，`source/link/date` 保留。
- 热点资讯：数组字符串逐条转成卡片，标题去掉可能存在的序号前缀，正文素材补充日期、来源和原始链接。
- 外部接口失败或当天 AI 资讯为空时返回空数组或 mock 降级数据，不让 creator 页面崩溃。
- 外部接口平均返回耗时按 5 到 10 秒处理，Creator 主页面不等待资讯接口完成。

## 6. 前端交互与页面状态设计

Creator 页面右侧面板改为：

```text
每日资讯
  [刷新]

  Tab/分区：每日 AI 资讯
    - 资讯卡片
    - 空状态：今日暂无重大 AI 资讯，建议稍晚再看

  分区：每日热点资讯
    - 热点卡片
```

卡片展示字段：

- 标题
- 来源与日期
- 摘要，两行截断
- 点击态 hover/focus

加载状态：

- Creator 概览、草稿动态和内容管理先加载展示，不等待每日资讯接口。
- 每日资讯作为右侧独立异步区域加载，加载中展示骨架屏或“资讯加载中”。
- 如果资讯接口超过 8 秒仍未返回，保留加载状态并提示“外部资讯接口响应较慢，可先进入工作台创作”，同时提供“刷新/重试”按钮。
- 如果返回的是缓存或演示数据，在面板底部显示“当前为最近缓存数据”或“当前为演示数据”。

点击卡片：

1. 把卡片内容写入 `sessionStorage` 中的一次性预填 key。
2. 跳转 `/workspace?prefill=creator-news`。
3. 工作台读取该 key。
4. 清空 `aigc_workspace_local_draft`。
5. 设置：
   - `topic`：资讯标题
   - `draftTitle`：资讯标题
   - `style`：`新闻`
   - `audience`：`内容创作者`
   - `generated.title`：资讯标题
   - `generated.bodyText`：资讯详情或热点摘要
   - `generated.body`：由正文素材转换出的富文本文档
6. 工作台继续自动本地保存新状态。

之所以使用 `sessionStorage` 而不是把完整正文放在 URL 中，是为了避免长文本、链接和特殊字符造成 URL 过长或编码问题。

## 7. 后端服务逻辑

`NewsService` 负责：

1. 构造外部请求：
   - `GET /v2/ai-news?encoding=json`
   - `GET /v2/60s?encoding=json`
2. 设置超时，默认 12 秒；该接口平均返回时间为 5 到 10 秒，避免正常慢请求被过早切断。
3. 校验外部响应结构和 `code === 200`。
4. 规范化为共享类型 `CreatorDailyNewsResponse`。
5. 处理边界：
   - AI 资讯为空：返回 `aiNews: []`。
   - 单个接口失败：另一个接口仍可返回；失败的一组为空。
   - 两个接口都失败：返回 mock 降级数据，并标记 `source: "mock"`。

### 7.1 接口不可用时的降级策略

外部资讯接口不能成为创作链路的单点依赖。后端采用四级降级：

```text
实时接口 -> 最近缓存 -> 内置演示数据 -> 前端空状态
```

实现策略：

- 请求外部接口时设置 12 秒默认超时，覆盖 5 到 10 秒的平均响应时间，同时避免异常长请求拖住后端连接。
- 前端不阻塞 Creator 主页面渲染。创作者概览先加载和展示，右侧“每日资讯”作为独立异步区域显示骨架屏或慢请求提示。
- “刷新/重试”只刷新每日资讯区域，不重新拉取创作者概览。
- 只要实时接口成功，就把规范化结果写入服务端内存缓存；如果后续接口失败，优先返回最近一次成功数据，并把 `source` 标记为 `cache`。
- 如果没有可用缓存，则返回内置演示数据，并把 `source` 标记为 `mock`，保证本地演示和答辩不受外部网络影响。
- 如果某一类数据本身为空，例如 AI 资讯当天没有更新，则保留空数组，由前端显示“今日暂无重大 AI 资讯”。
- 前端根据 `source` 展示轻量提示：
  - `60s.viki.moe`：实时数据。
  - `cache`：最近缓存数据。
  - `mock`：演示数据。

可选环境变量：

```text
NEWS_PROVIDER_MODE=auto | live | mock
NEWS_FETCH_TIMEOUT_MS=12000
```

- `auto`：默认模式，优先实时接口，失败后走缓存和演示数据。
- `live`：只使用实时接口，适合正式联调。
- `mock`：只使用演示数据，适合无网络、本地开发和答辩兜底。
- `NEWS_FETCH_TIMEOUT_MS`：外部资讯接口超时时间，默认 12000。

鉴权策略：

- `GET /news/creator-daily` 使用 `JwtAuthGuard`。
- 原因：该数据用于 Creator 页面，不作为公开首页内容；保持与现有 creator 数据加载方式一致。

## 8. 审核、评分、发布和榜单逻辑

本次只把外部资讯作为创作素材预填到工作台，不直接发布，不绕过审核。

后续发布仍沿用现有链路：

```text
资讯预填 -> 用户编辑 -> 保存草稿 -> 发布页 -> AI 审核 -> 质量评分 -> 发布
```

这满足现有规则：

- 外部资讯不直接进入已发布内容。
- 用户必须编辑或确认后保存草稿。
- 发布前仍然经过后端审核和评分。

## 9. 风险、边界情况和回滚方案

风险：

- 外部接口网络失败或限流。
- AI 资讯不是每天都有。
- 热点新闻文本过短，不足以直接成为完整文章。
- 用户已有工作台本地草稿，点击资讯后被覆盖。

处理：

- 接口失败时按“实时接口 -> 最近缓存 -> 内置演示数据 -> 前端空状态”降级。
- Creator 页面显示“今日暂无重大 AI 资讯”的空状态。
- 工作台预填的是“素材草稿”，用户仍可 AI 生成、改写、保存。
- 点击卡片即视为用户主动覆盖工作台内容；工作台顶部仍保留本地保存提示。

回滚：

- 后端可以临时让 `/news/creator-daily` 返回 mock 数据。
- 前端可以恢复原 `creator-inspirations` 展示，不影响草稿、发布和榜单链路。
- 新增功能不改数据库，回滚不涉及迁移。

## 10. 验证方式和测试计划

本地验证：

- 登录后进入 `/creator`。
- 右侧显示“每日 AI 资讯”和“每日热点资讯”。
- 接口为空时展示空状态。
- 点击一条资讯跳转到 `/workspace?prefill=creator-news`。
- 工作台旧本地草稿被覆盖，标题、主题和正文素材变为点击资讯内容。
- 保存草稿后可以进入草稿编辑页。

自动化检查：

```text
corepack pnpm --filter @bytecamp-aigc/api test -- src/news/news.service.spec.ts
corepack pnpm --filter @bytecamp-aigc/web test -- src/lib/workspace-prefill.test.ts
corepack pnpm -r typecheck
```

如果改动影响构建入口，再运行：

```text
corepack pnpm --filter @bytecamp-aigc/web build
```

浏览器验证：

- 使用本地开发服务打开 `/creator`。
- 检查点击资讯卡片后的工作台预填结果。
- 检查浏览器控制台无错误。
- 在 `NEWS_PROVIDER_MODE=mock` 下验证接口不可用时仍能展示演示数据。
- 在模拟 fetch 超时/失败的单测中验证缓存或 mock 降级路径。

## 11. 初学者复盘文档

实现完成后新增：

```text
docs/learn/021-creator-daily-news-prefill.md
```

内容会解释：

- 为什么外部接口要由后端调用。
- 后端如何把不同接口结构统一成前端可用的数据。
- 前端如何用 `sessionStorage` 完成一次性跨页面预填。
- 为什么预填素材仍需经过草稿保存、审核和发布链路。
