# 技术架构设计

## 1. 架构目标

本项目采用“薄前端、厚后端、AI 能力集中编排”的架构。前端专注交互、编辑器、状态展示；后端负责 AI 调用、Prompt 编排、审核、评分、发布、分发排序和数据持久化。

核心原则：

1. AI 调用统一通过后端网关，避免前端暴露模型密钥。
2. Prompt 是数据，不是散落在代码中的字符串。
3. 审核是发布链路的强约束，不是可选提示。
4. 内容质量分和互动数据共同影响分发。
5. MVP 保持可演示，架构保留扩展空间。

## 2. 应用技术栈

| 层级 | 技术选型 | 说明 |
| --- | --- | --- |
| Monorepo | pnpm workspace | 管理 `apps/*` 与 `packages/*`，统一脚本、依赖和类型检查 |
| 前端框架 | Next.js + React + TypeScript | 承载页面路由、创作工作台、榜单、详情页和登录态管理 |
| 前端样式 | Tailwind CSS 主导 + 少量全局 CSS | 页面与组件样式优先使用 Tailwind utility class，全局 CSS 仅承载 reset、设计变量、基础排版和第三方组件兜底 |
| 富文本编辑 | TipTap / ProseMirror JSON | 编辑器内容以前后端可共享的结构化 JSON 存储 |
| 后端框架 | NestJS + TypeScript | 承载鉴权、草稿、AI Gateway、审核、评分、发布和分发业务 |
| 数据库 | PostgreSQL + Prisma | 存储用户、草稿、版本、审核记录、质量分、文章和互动数据 |
| 缓存/榜单 | Redis Sorted Set | 承载热点榜、爆文榜、Prompt 缓存、限流和编辑锁等能力 |
| AI 接入 | OpenAI SDK 兼容模式 | 统一适配火山方舟、豆包或其他 OpenAI-compatible 模型供应商 |
| 鉴权 | JWT + bcrypt | 密码哈希存储，登录后签发 access token |
| 测试 | TypeScript typecheck、Jest/Vitest、Supertest、Playwright | 覆盖类型检查、服务单测、接口测试和端到端流程 |
| 部署 | Vercel + Railway/Render/ECS + 托管 PostgreSQL/Redis | MVP 优先选择低运维成本的托管平台 |

## 3. 总体架构

```text
Browser
  |
  | HTTPS
  v
Next.js Web
  |
  | REST/SSE
  v
NestJS API
  |        |         |
  |        |         +--> AI Provider(OpenAI compatible / Volcano Ark / Doubao)
  |        +------------> Redis(ranking, cache, rate limit)
  +---------------------> PostgreSQL(Prisma)
```

## 4. Monorepo 分层

```text
apps/web
  - 页面路由
  - 创作工作台
  - 富文本编辑器
  - 榜单和详情页
  - 登录态管理

apps/api
  - 用户与鉴权
  - 草稿、版本、发布
  - Prompt 管理
  - 每日资讯接入
  - AI Gateway
  - 审核与评分
  - 榜单排序
  - 数据反馈

packages/shared
  - 枚举
  - DTO 类型
  - 评分权重
  - API 约定
```

## 5. 前端架构

### 5.1 页面结构

```text
apps/web/src/app
├── page.tsx                 # 内容首页/推荐流入口
├── workspace/page.tsx       # 创作工作台
├── login/page.tsx           # 登录
├── drafts/page.tsx          # 我的草稿
├── drafts/[id]/page.tsx     # 编辑器
├── publish/[id]/page.tsx    # 发布确认
├── feed/page.tsx            # 推荐流
├── rankings/page.tsx        # 热点/爆文榜
└── articles/[id]/page.tsx   # 内容详情
```

### 5.2 前端职责

- 表单输入、编辑器交互、状态反馈。
- 首页负责内容信息流、热点/爆文入口和用户菜单；工作台入口通过右上角用户名称 hover 菜单进入。
- 用户菜单负责跳转工作台、草稿箱和退出登录，退出登录仅清理前端 token 和用户缓存。
- 使用 TipTap 生成 ProseMirror JSON。
- 通过 API 获取 AI 生成结果、审核结果和榜单数据。
- 草稿自动保存时做 debounce。
- 断网时缓存未同步内容，恢复网络后重放保存请求。
- 页面性能优化：SSR/SSG、图片懒加载、虚拟滚动或分页、避免首屏大包。

当前 MVP 前端业务链路：

```text
内容首页 `/`
  -> 登录 `/login`
  -> 用户名称 hover 菜单
      -> 工作台 `/workspace`
          -> POST /ai/generate-article
          -> POST /drafts
          -> 草稿编辑 `/drafts/:id`
              -> PATCH /drafts/:id
              -> GET /drafts/:id/versions
      -> 草稿箱 `/drafts`
      -> 退出登录
```

不同路由需要呈现不同网页标题，便于演示和浏览器标签识别：

| 路由 | 网页标题 |
| --- | --- |
| `/` | 内容首页 - 文舟 |
| `/workspace` | 创作工作台 - 文舟 |
| `/drafts` | 草稿箱 - 文舟 |
| `/drafts/:id` | 草稿编辑 - 文舟 |
| `/login` | 登录 - 文舟 |
| `/docs` | 发文规范 - 文舟 |

### 5.3 样式策略

前端样式采用 Tailwind CSS 主导，全局 CSS 辅助。

选择 Tailwind 作为主导的原因：

- 页面以表单、编辑器、榜单、详情页和状态反馈为主，组件粒度清晰，utility-first 写法能让布局、间距、响应式和状态样式贴近 JSX，减少跨文件查找成本。
- Tailwind 的约束化 token 有利于保持颜色、间距、字号和断点一致，适合训练营 MVP 快速迭代，也便于后续沉淀组件。
- 全局 CSS 容易形成隐式覆盖和选择器耦合，因此不承载业务页面样式，避免页面之间互相影响。

全局 CSS 仅用于：

- Tailwind base 引入、浏览器 reset 和基础 `html/body` 样式。
- 项目级 CSS 变量，如颜色、背景、边框、阴影和字体族。
- 富文本编辑器、第三方组件或 Markdown 内容中难以直接挂 Tailwind class 的局部基础样式。

## 6. 后端架构

```text
apps/api/src
├── auth/          # JWT 鉴权、登录注册
├── users/         # 用户资料
├── drafts/        # 草稿与版本
├── prompts/       # Prompt 库
├── news/          # 每日 AI 资讯和每日热点资讯接入
├── assets/        # 素材上传与校验
├── ai-gateway/    # 模型适配与 Prompt 装配
├── audit/         # 安全审核
├── scoring/       # 质量评分
├── publish/       # 发布与快照
├── feed/          # 内容流
├── ranking/       # 榜单计算
├── analytics/     # 阅读与互动数据
├── prisma/        # Prisma Service
└── common/        # 过滤器、管道、工具
```

### 6.1 AI Gateway

AI Gateway 统一处理：

- 模型供应商配置。
- OpenAI compatible SDK 调用。
- Prompt 模板渲染。
- JSON schema 输出约束。
- SSE 流式返回。
- 超时、重试、降级。
- 请求日志和 token 使用量统计。

### 6.2 审核流水线

审核不是单个接口，而是贯穿内容生命周期：

| 阶段 | 触发点 | 动作 |
| --- | --- | --- |
| 输入阶段 | 用户提交主题/素材 | 基础风险校验 |
| 生成阶段 | AI 输出后 | 审核生成内容片段 |
| 发布前 | 点击发布 | 强制安全审核和质量评分 |
| 发布后 | 举报/巡检 | 下线、回滚、复审 |

风险等级：

- `BLOCK`：高危，禁止发布。
- `WARN`：中风险，允许用户修改后重审。
- `PASS`：通过。

### 6.3 质量评分

评分服务接收文章标题、正文、素材摘要、目标受众和热点上下文，输出结构化评分：

```json
{
  "contentValue": 86,
  "expressionQuality": 82,
  "readerExperience": 78,
  "spreadPotential": 74,
  "safetyScore": 95,
  "overall": 83,
  "reasons": ["结构清晰", "标题吸引力一般"],
  "suggestions": ["补充案例", "优化结尾行动号召"]
}
```

## 7. 数据模型

核心表：

| 表 | 说明 |
| --- | --- |
| users | 用户 |
| drafts | 草稿当前态 |
| draft_versions | 草稿版本快照 |
| prompts | 平台和用户 Prompt |
| assets | 用户素材 |
| audit_records | 审核记录 |
| quality_scores | 内容质量分 |
| articles | 已发布文章 |
| article_revisions | 发布后编辑版本 |
| engagement_events | 阅读、点赞、收藏等事件 |
| ranking_snapshots | 榜单快照 |

## 8. Redis 设计

| Key | 用途 |
| --- | --- |
| `rank:hot` | 热点榜 sorted set |
| `rank:top` | 爆文榜 sorted set |
| `draft:lock:{id}` | 编辑锁/版本冲突辅助 |
| `audit:rate:{userId}` | 审核接口限流 |
| `cache:prompt:platform` | 平台 Prompt 缓存 |

## 9. API 设计

### 9.1 用户

```text
POST /auth/register
POST /auth/login
GET  /users/me
```

### 9.2 创作

```text
POST /ai/generate-outline
POST /ai/generate-article
POST /ai/rewrite
GET  /prompts
POST /prompts
```

### 9.3 草稿

```text
POST   /drafts
GET    /drafts/mine
GET    /drafts/:id
PATCH  /drafts/:id
GET    /drafts/:id/versions
POST   /drafts/:id/restore
```

### 9.4 审核与发布

```text
POST /audit/check
POST /scoring/article
POST /publish/:draftId
PATCH /articles/:id
POST /articles/:id/withdraw
```

### 9.5 分发

```text
GET /feed
GET /rankings/hot
GET /rankings/top
GET /articles/:id
POST /articles/:id/events
```

### 9.6 每日资讯

```text
GET /news/creator-daily
```

该接口由后端调用外部日更资讯服务，统一返回每日 AI 资讯和每日热点资讯。Creator 页面只消费本项目后端接口，不直接访问外部服务。外部接口平均返回时间按 5 到 10 秒处理，后端默认超时为 12 秒；接口不可用时按“实时接口 -> 最近缓存 -> 内置演示数据 -> 前端空状态”降级。

## 10. 榜单排序

基础分：

```text
rank_score =
  quality_score * 0.45 +
  hot_score * 0.35 +
  freshness_score * 0.15 +
  feedback_score * 0.05
```

热度分：

```text
hot_score = views * 1 + likes * 4 + favorites * 6 + comments * 8
```

时间衰减：

```text
freshness_score = 100 / (1 + hours_since_publish / 12)
```

Redis 中存储实时榜单，PostgreSQL 中定期保存榜单快照，便于复盘和展示。

## 11. 部署架构

MVP 推荐：

- Web：Vercel。
- API：Railway / Render / 云服务器 Docker。
- PostgreSQL：Railway Postgres / Supabase / Neon。
- Redis：Upstash / Railway Redis。

生产环境变量：

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `AI_BASE_URL`
- `AI_API_KEY`
- `AI_MODEL`
- `NEWS_PROVIDER_MODE`
- `NEWS_FETCH_TIMEOUT_MS`
- `NEXT_PUBLIC_API_BASE_URL`

## 12. 测试策略

| 类型 | 工具 | 覆盖 |
| --- | --- | --- |
| 单元测试 | Vitest/Jest | 评分、排序、Prompt 渲染 |
| 接口测试 | Jest + Supertest | 登录、草稿、发布、审核 |
| E2E | Playwright | 创作到发布完整链路 |
| 性能 | Lighthouse | 首页、榜单、详情页 LCP |

### 12.1 E2E 测试

E2E 使用 Playwright，验证用户视角下的核心闭环，不替代单元测试和接口测试。

覆盖范围：

- 注册/登录/退出：验证鉴权态、token 写入与受保护页面跳转。
- 创作工作台：输入主题、选择风格、触发 AI 生成标题、大纲和正文。
- 编辑器与草稿：修改正文、主动保存、自动保存、刷新后草稿内容可恢复。
- 审核与评分：发布前触发审核和质量评分，覆盖 `PASS`、`WARN`、`BLOCK` 三类结果。
- 发布与分发：审核通过后生成文章详情页，文章出现在推荐流、热点榜或爆文榜中。
- 互动反馈：打开详情页、点赞、收藏等事件能被记录，并影响展示数据。

测试数据与外部依赖：

- E2E 环境使用独立测试数据库或可重置 seed 数据。
- AI Gateway、审核和评分可使用 mock provider，固定返回可预测结果，避免模型波动导致测试不稳定。
- 每个用例创建独立测试用户和草稿，结束后清理或重置数据。

关键断言：

- 页面关键状态可见，例如生成中、保存成功、审核警告、发布成功。
- 后端状态流转正确，例如草稿版本、审核记录、质量分、文章快照和互动事件被写入。
- 浏览器控制台无未处理异常，关键 API 无 5xx。

执行策略：

- 本地开发优先运行关键 smoke 用例：登录 -> 创作 -> 审核通过 -> 发布 -> 查看详情。
- CI 在完成 `pnpm typecheck`、后端接口测试和前端 build 后启动 Web/API 测试服务，再运行 Playwright。
- 耗时较长或依赖复杂数据的完整 E2E 用例可按标签区分为 `smoke` 和 `full`，MVP 阶段至少保证 smoke 用例稳定。

## 13. 可观测与容错

- AI 请求记录 requestId、模型、耗时、token、状态。
- 审核记录保存模型输出和最终决策。
- 发布失败保留草稿，不丢失编辑内容。
- AI 服务不可用时返回明确错误和重试入口。
- Redis 不可用时回退到 PostgreSQL 排序。
