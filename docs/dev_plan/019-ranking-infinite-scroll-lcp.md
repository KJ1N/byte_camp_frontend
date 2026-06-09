# 榜单页滚动加载与 LCP 优化技术方案

## 1. 功能目标和用户价值

本轮开发聚焦读者侧榜单页 `/rankings`：

```text
进入榜单页 -> 首屏直接看到榜单内容 -> 滚动到底部自动加载下一页 -> 切换热点榜/爆文榜后重新加载首屏 -> 首屏 LCP 不超过 2.5 秒
```

用户价值：

- 读者打开热点榜或爆文榜时，首屏不再只看到“榜单加载中”，而是尽快看到真实榜单内容。
- 读者向下滚动时自动加载更多内容，减少反复点击“加载更多”的操作成本。
- 浏览器不支持 `IntersectionObserver` 或自动加载失败时，仍保留手动加载入口，保证演示稳定。
- 性能目标从口头要求落到可验证指标：本地通过 Playwright 采集 `/rankings?tab=hot` 与 `/rankings?tab=top` 的 LCP，目标值不超过 2500ms。

本轮继续遵守 PRD 和架构文档约束：榜单排序、审核裁决、质量评分和分发逻辑仍由后端负责，前端只负责首屏呈现、滚动触发和状态反馈。

## 2. 涉及模块

### 前端 `apps/web`

- `/rankings` 页面：
  - 从当前客户端首屏请求改为服务端预取首屏榜单数据。
  - 拆分为服务端入口和客户端交互组件，首屏 HTML 中包含真实榜单行。
  - 使用 `IntersectionObserver` 监听底部哨兵元素，自动请求下一页。
  - 保留“加载更多”按钮作为降级入口。
  - 切换热点榜/爆文榜时重置列表、游标、错误和加载状态，并更新 URL query。
- 前端 API helper：
  - 复用 `apiFetch`、`apiBaseUrl`、`readApiJson`。
  - 如有必要新增轻量榜单请求 helper，避免页面内重复拼接 query。
- E2E：
  - 增加榜单页滚动加载和 LCP 采集用例，覆盖热点榜和爆文榜。
  - 性能 E2E 必须使用专门的测试数据库，通过独立 `DATABASE_URL` 启动 API，不向当前开发/演示数据库写入测试文章。
  - 测试文章通过 E2E 专用 seed/setup 写入测试库，测试结束后可重置或清理。

### 后端 `apps/api`

- `ranking.controller.ts` 和 `feed.service.ts` 已支持：
  - `GET /rankings/hot?limit=&cursor=`
  - `GET /rankings/top?limit=&cursor=`
  - Redis Sorted Set 优先读取，失败时回退 PostgreSQL 排序。
- 本轮预计不新增后端接口；只在验证中确认分页响应、游标和缓存回退仍可用。
- 如果实现时发现首屏接口查询成为瓶颈，再局部优化 `FeedService` 的查询范围或快照写入策略，但不改变公开 API 契约。

### 共享包 `packages/shared`

- 继续使用现有 `ArticleListItem` 和 `CursorPageResponse<T>`。
- 不新增共享 DTO，除非实现中需要给性能测试抽出纯函数类型。

## 3. 需要新增或修改的文件

### 新增文件

- `apps/web/src/app/rankings/rankings-client.tsx`
  - 承载用户菜单、本地登录态、榜单切换、滚动加载、错误和降级按钮。
- `e2e/rankings-performance.spec.ts`
  - 验证首屏有真实榜单内容、滚动后追加内容，并采集 LCP。
- `scripts/e2e-rankings-performance.mjs`
  - 以独立 E2E 数据库环境启动 Web/API，准备测试榜单数据并运行性能用例。
- `scripts/e2e-ranking-seed.mjs` 或同等测试 setup
  - 只连接 E2E `DATABASE_URL`，写入滚动加载和 LCP 采集所需的测试文章、评分和互动数据。
- `docs/learn/019-ranking-infinite-scroll-lcp-learning.md`
  - 实现完成后生成，作为本地初学者学习复盘文档。

### 修改文件

- `apps/web/src/app/rankings/page.tsx`
  - 改为服务端组件，根据 `searchParams.tab` 预取首屏榜单数据并传给客户端组件。
- `apps/web/src/app/rankings/layout.tsx`
  - 预计不需要修改；如需要补充描述型 metadata，可小范围调整。
- `apps/web/src/lib/api.ts`
  - 预计不需要修改；如服务端 fetch 需要复用 base URL，只使用现有 `apiBaseUrl`。
- `playwright.config.ts` 或 `scripts/e2e-smoke.mjs`
  - 默认不改 smoke 主链路；如果复用启动逻辑，只新增性能 E2E 专用脚本，避免影响现有 smoke 用例。
- `.env.example`
  - 补充 `E2E_DATABASE_URL` 示例，明确测试数据库与开发数据库隔离。

### 暂不修改

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/**`
- `packages/shared/src/index.ts`
- `apps/api/src/audit/**`
- `apps/api/src/scoring/**`
- `apps/api/src/publish/**`
- 首页 `/` 的推荐流滚动逻辑。本轮只处理用户指定的榜单页。
- `apps/api/prisma/seed.ts` 中已有演示文章内容。性能 E2E 不在这里新增测试文章，避免把测试数据提交到现有数据库链路。

## 4. 数据模型或 API 变更

### 数据模型

不修改 Prisma schema，不新增数据库迁移。

继续复用：

- `articles`
- `quality_scores`
- `engagement_events`
- `ranking_snapshots`
- Redis Sorted Set：`rank:hot`、`rank:top`

### E2E 数据库隔离

性能 E2E 使用专门的数据库，例如：

```text
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bytecamp_aigc_e2e
```

约束：

- 不把 LCP/滚动加载测试专用文章写入开发库 `bytecamp_aigc`。
- 不修改 `apps/api/prisma/seed.ts` 来追加测试文章。
- E2E 专用 seed/setup 必须读取 `E2E_DATABASE_URL`，并在启动 API 时把它传给 `DATABASE_URL`。
- E2E 测试数据使用固定前缀或固定 ID，例如 `e2e-ranking-lcp-*`，方便重置和排查。
- 如果本地没有专门测试库，性能 E2E 应直接失败并提示创建/配置 `E2E_DATABASE_URL`，不能悄悄回退到开发数据库。

### API 契约

公开接口保持不变：

```text
GET /rankings/hot?limit=10&cursor=0
GET /rankings/top?limit=10&cursor=0
```

响应仍为：

```ts
interface CursorPageResponse<ArticleListItem> {
  items: ArticleListItem[];
  nextCursor?: string;
}
```

前端分页策略：

- 首屏默认请求 `limit=10`。
- 后续滚动使用上一次响应的 `nextCursor`。
- `nextCursor` 为空时停止自动加载并显示“没有更多内容了”。
- 切换 tab 后从对应榜单的第一页重新请求。

## 5. 前端交互与页面状态设计

### 首屏渲染

`apps/web/src/app/rankings/page.tsx` 改为服务端组件：

1. 读取 `searchParams.tab`，只接受 `hot` 或 `top`，非法值回退 `hot`。
2. 服务端调用后端榜单接口获取第一页。
3. 将 `initialTab`、`initialItems`、`initialNextCursor`、`initialError` 传给 `RankingsClient`。
4. 客户端组件首 render 直接展示这些数据，避免等待 `useEffect` 后才出现主要内容。

这样首屏最大内容通常会是榜单标题、说明或第一条榜单行，而不是加载占位。

### 滚动加载

客户端组件维护：

```ts
type RankingTab = "hot" | "top";
type PageState = "ready" | "empty" | "error";

items: ArticleListItem[];
nextCursor?: string;
loadingMore: boolean;
autoLoadEnabled: boolean;
error: string;
```

交互规则：

- 页面底部放置 `ref` 哨兵元素。
- `IntersectionObserver` 支持时，哨兵进入视口且存在 `nextCursor` 时自动执行 `loadMore()`。
- `loadingMore` 为 true 时不重复请求。
- 自动加载失败时保留当前列表，展示错误提示和“重试加载”入口。
- 浏览器不支持 `IntersectionObserver` 时展示“加载更多”按钮。
- 为避免短列表在首屏连续触发多次，可以在每次请求完成后依赖 `nextCursor` 和 `items.length` 重新观察，且用 `loadingMore` 做并发锁。

### 榜单切换

- 点击“热点榜 / 爆文榜”时：
  - 更新 `tab`。
  - 使用 `window.history.replaceState` 或 Next Router 更新 `/rankings?tab=...`。
  - 清空旧列表并显示轻量加载状态。
  - 请求新榜单第一页。
- 如果请求失败：
  - 页面进入 `error` 状态。
  - 保留重试按钮。
  - 不把失败榜单内容误显示为旧 tab 的内容。

### 可访问性与移动端

- 保留 button 语义和 `disabled` 状态。
- 底部加载状态使用文本提示，不用大面积骨架屏影响 LCP。
- 移动端继续单列展示榜单行，底部操作区不遮挡内容。

## 6. 后端服务、鉴权、审核、评分、发布和榜单逻辑

- 榜单接口保持公开读，不新增鉴权要求，符合读者浏览场景。
- 审核、评分、发布职责不迁移到前端。
- 热点榜与爆文榜排序仍走 `FeedService.listRanking(kind)`：
  - Redis 可用时读取 `rank:hot` 或 `rank:top` 的文章 id 顺序。
  - Redis miss、未配置或异常时回退 PostgreSQL 查询并用 `RankingService` 计算排序。
  - 互动、发布、撤回后的缓存失效逻辑保持现状。
- 首屏 SSR 请求只是提前消费同一个公开接口，不新增绕过排序的前端计算。
- 若后端返回空列表，前端展示“暂无榜单内容”，并提供创作入口不作为本轮必改。

## 7. 性能目标与 LCP 策略

目标：

```text
/rankings?tab=hot LCP <= 2500ms
/rankings?tab=top LCP <= 2500ms
```

优化策略：

- 首屏数据服务端预取，让主要榜单内容进入初始 HTML。
- 首屏只请求第一页 `limit=10`，不一次性拉取全部榜单。
- 页面主体不引入图片、富文本编辑器或额外大依赖，避免增加首屏 JS 和资源体积。
- 自动滚动逻辑只在 hydration 后接管，不阻塞首屏内容展示。
- 错误与空状态保持轻量文本，不使用大面积动画或装饰。
- 保持 Tailwind utility class 写法，不新增全局业务 CSS。

性能采集方式：

- 新增 Playwright 性能用例，在页面加载前注册 `PerformanceObserver` 捕获 `largest-contentful-paint`。
- 等待首屏榜单标题或第一条榜单行可见。
- 读取 LCP 值并断言不超过 2500ms。
- 同时在用例中滚动到底部，确认列表数量增加或出现“没有更多内容了”。
- 性能用例运行前由专用脚本准备测试库数据；测试文章只存在于 E2E 数据库，不进入当前开发数据库。

本地开发环境会比生产慢，若 dev server 的 LCP 波动明显，验证记录中会同时说明：

- dev 模式观测值。
- build/start 或生产模式观测值，优先用生产模式作为最终 LCP 判断。

## 8. 风险、边界情况和回滚方案

### 风险

- 服务端预取依赖 API 服务可用，API 未启动时 `/rankings` 会展示首屏错误。
- dev 模式编译和热更新可能导致 LCP 偏高，不能代表生产部署。
- 如果 seed 数据不足，滚动加载可能很快到尾，需要用已有 seed 或发布文章补足演示数据。
- 如果 E2E 数据库没有准备足够测试文章，滚动加载用例可能只能看到“没有更多内容了”，需要专用 seed 写入超过首屏 `limit` 的文章。
- 如果 E2E 脚本没有正确传入 `DATABASE_URL`，可能误连开发库；脚本必须显式校验 `E2E_DATABASE_URL` 与普通 `DATABASE_URL` 不相同。
- `IntersectionObserver` 在短列表场景可能连续触发，需要并发锁和 cursor 判断。
- 切换 tab 时旧请求晚返回，可能覆盖新 tab 数据。

### 边界情况

- `tab` 非法：回退热点榜。
- `nextCursor` 为空：停止观察并展示“没有更多内容了”。
- 续页请求失败：保留已有列表并提供重试。
- 首屏接口失败：展示错误和重试，不空白。
- 浏览器禁用 sessionStorage：文章点击意图记录失败不影响跳转。
- Redis 不可用：后端回退 PostgreSQL 排序。
- `E2E_DATABASE_URL` 未配置或与开发库相同：性能 E2E 中止，不写入数据。

### 回滚方案

- 如果 SSR 预取导致运行环境问题，可回退到客户端首屏请求，同时保留滚动加载组件。
- 如果自动滚动在特定浏览器不稳定，可关闭自动触发，只保留“加载更多”按钮。
- API 契约不变，回滚前端不会影响后端发布、评分、审核和 Redis 榜单缓存。

## 9. 验证方式和测试计划

### 自动化检查

实现完成后计划运行：

```text
corepack pnpm --filter @bytecamp-aigc/web test
corepack pnpm --filter @bytecamp-aigc/api test -- src/feed/feed.service.spec.ts
corepack pnpm typecheck
corepack pnpm --filter @bytecamp-aigc/web build
node scripts/e2e-rankings-performance.mjs
```

说明：

- 本轮不改 Prisma schema，因此不运行迁移。
- 性能 E2E 运行前需要测试数据库已完成迁移；如果脚本内无法安全创建/迁移测试库，会在交付说明中写明手动准备命令。
- 若新增 E2E 性能用例依赖生产构建，会补充对应运行命令和结果。
- 如果某项检查因本地端口、数据库或浏览器依赖无法运行，会在交付说明中明确原因。

### 手动验证

1. 启动本地 Web/API。
2. 确认普通开发数据库中没有新增 `e2e-ranking-lcp-*` 测试文章。
3. 用 `E2E_DATABASE_URL` 启动性能 E2E，准备测试库数据。
4. 打开 `/rankings?tab=hot`，确认首屏直接展示热点榜内容。
5. 滚动到底部，确认自动加载下一页或展示“没有更多内容了”。
6. 切换到爆文榜，确认列表重置并展示爆文榜内容。
7. 再次滚动，确认爆文榜也能续页。
8. 关闭或模拟 Redis 不可用时，确认榜单仍可通过 PostgreSQL 回退返回。
9. 查看浏览器控制台，确认没有未处理异常。

## 10. 初学者学习文档计划

实现完成后新增：

```text
docs/learn/019-ranking-infinite-scroll-lcp-learning.md
```

学习文档会按业务闭环解释：

- 为什么滚动加载属于读者侧分发体验。
- 为什么首屏数据要服务端预取，而后续分页交给客户端。
- `searchParams`、Server Component、Client Component、`useEffect`、`IntersectionObserver`、API cursor 在本功能中的职责。
- 从页面滚动到后端 `GET /rankings/:kind`、Redis / PostgreSQL 排序、返回 `nextCursor`、前端追加列表的完整链路。
- 如何用 Playwright 和 PerformanceObserver 验证 LCP。
- 榜单首屏 LCP ≤ 2.5s 指标采取的优化手段：服务端预取首屏数据、首屏只加载第一页、避免首屏图片和重依赖、滚动逻辑延后到 hydration 后执行、错误/空状态保持轻量、生产模式优先作为最终性能判断。
- 为什么 E2E 要使用独立数据库，以及测试 seed 为什么不能污染开发/演示数据库。
- 常见误区：一次性加载全部数据、前端自行排序、只看 dev 模式 LCP、滚动触发重复请求、把测试文章写入开发库。
