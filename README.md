# 文舟 Content Harbor · AI 创作者辅助生产与分发平台

文舟是面向图文创作者的 AI 辅助生产、审核与分发平台，也是 2026 字节前端训练营的全栈交付项目。它把单点式“AI 生成器”扩展为**可创作、可编辑、可审核、可评分、可发布、可分发、可反馈**的内容生产闭环。

当前仓库为最终代码交付版，已包含前端应用、后端服务、共享类型、数据库模型、演示数据、自动化测试、E2E 脚本、技术文档和效果评估报告。本地可完整演示主链路，线上地址由实际部署平台提供。

```text
技术栈   Next.js · React · NestJS · Prisma · PostgreSQL · Redis · TypeScript · Tailwind CSS
模型     OpenAI-compatible Provider（适配火山方舟 / 豆包等），支持 mock / auto / live 三种模式
```

### 项目覆盖度

本项目完整实现训练营 MVP 的核心闭环，并补充多模态、素材审核、每日资讯和性能 E2E 等扩展能力。

| 项目要求                        | 实现情况                     | 位置                                                          |
| ------------------------------- | ---------------------------- | ------------------------------------------------------------- |
| **基础要求**                    |                              |                                                               |
| 用户登录与创作者入口            | 完整实现                     | [一、项目能力](#一项目能力)                                   |
| AI 生成标题、大纲和正文         | 完整实现，支持 SSE 流式输出  | [一、项目能力](#一项目能力)                                   |
| 富文本草稿编辑与自动保存        | 完整实现，含离线暂存和版本   | [一、项目能力](#一项目能力)                                   |
| 发布前安全审核与质量评分        | 完整实现，后端强制执行       | [二、系统架构与关键实现](#二系统架构与关键实现)               |
| 内容发布、详情页、信息流与榜单  | 完整实现，互动数据参与排序   | [一、项目能力](#一项目能力)                                   |
| 自动化测试与交付文档            | 已覆盖 typecheck/test/E2E/CI | [三、快速开始](#三快速开始) · [八、交付与验收](#八交付与验收) |
| **扩展能力**                    |                              |                                                               |
| Prompt 模板管理、标题优化和改写 | 完整实现                     | [一、项目能力](#一项目能力)                                   |
| 一键合规改写                    | 完整实现                     | [二、系统架构与关键实现](#二系统架构与关键实现)               |
| 多模态图文生成                  | 完整实现                     | [一、项目能力](#一项目能力)                                   |
| 图片/资料素材上传、抽取与审核   | 完整实现                     | [一、项目能力](#一项目能力)                                   |
| 每日 AI 资讯/热点资讯开放 API   | 完整实现，支持 Redis 快照    | [一、项目能力](#一项目能力)                                   |
| 榜单 LCP 与无限滚动性能 E2E     | 完整实现                     | [三、快速开始](#三快速开始)                                   |

详细产品、架构、审核与评估文档见 [docs](./docs)，协作规则见 [AGENTS.md](./AGENTS.md)。

### 演示入口

| 服务     | 地址                           |
| -------- | ------------------------------ |
| Web      | `http://localhost:3200`        |
| API      | `http://localhost:3201`        |
| 健康检查 | `http://localhost:3201/health` |

Seed 演示账号：

```text
邮箱：demo@bytecamp.local
密码：bytecamp123
```

---

## 目录

1. [项目能力](#一项目能力)
2. [系统架构与关键实现](#二系统架构与关键实现)
3. [快速开始](#三快速开始)
4. [目录结构](#四目录结构)
5. [常见问题](#五常见问题)
6. [技术栈一览](#六技术栈一览)
7. [开发过程](#七开发过程)
8. [交付与验收](#八交付与验收)

---

## 一、项目能力

文舟围绕图文内容的**生产、审核、发布、分发、反馈**构建完整闭环。

| 能力             | 说明                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 账号与创作者入口 | 支持注册、登录、JWT 鉴权、退出登录；首页用户菜单可进入工作台、草稿箱和创作者主页；Creator 页面展示真实作品、统计和“我的内容”。                                       |
| AI 内容创作      | 支持主题生成文章、Prompt 模板选择、标题优化、正文润色/扩写/缩写/风格转换；文章生成、标题优化、正文改写和合规改写均支持 SSE 流式体验。                                |
| 富文本草稿       | 基于 TipTap / ProseMirror JSON 存储内容；支持标题、段落、加粗、列表、引用、图片、资料附件、自动保存、离线暂存、刷新恢复、版本历史和版本回滚。                        |
| Prompt 管理      | 平台 Prompt 只读，用户可复制为私人模板；工作台支持新增、修改、删除自定义 Prompt，并在生成链路中使用。                                                                |
| 审核与评分       | 发布前由后端强制执行安全审核和质量评分；支持 PASS / WARN / BLOCK、风险片段、风险类别、改写建议、质量五维分和审核记录持久化。                                         |
| 合规改写         | WARN / BLOCK 内容可触发 AI 一键合规改写，生成替代表达后回写草稿，再重新审核发布。                                                                                    |
| 发布与二次编辑   | 审核通过后生成文章快照和详情页；已发布内容可撤回，也可二次编辑并重新进入审核发布流程。                                                                               |
| 信息流与榜单     | 首页推荐流、热点榜、爆文榜均由后端提供；Redis Sorted Set 缓存榜单，Redis 不可用时回退 PostgreSQL；阅读、点赞、收藏会影响排序和创作者数据反馈。                       |
| 素材与多媒体     | 支持图片、txt、md、docx 资料上传；图片写入 OSS/S3-compatible 对象存储，编辑器保存稳定渲染路径 `/assets/:id/view`；资料文本抽取后参与审核。                           |
| 多模态工作台     | 独立 `/multimodal-workspace` 支持生成正文、图片计划、图片状态和 1 到 4 张配图；生成结果可保存为富文本草稿并继续审核发布。                                            |
| 每日资讯选题     | Creator 页面展示每日 AI 资讯和热点资讯；后端接入 `60s.viki.moe` 开放 API 获取 AI 资讯与热点数据，支持 Redis 当天快照、最近非空快照和手动刷新；资讯可一键预填工作台。 |
| 自动化验证       | 已覆盖后端 Service/Controller 测试、前端 helper 测试、Playwright 主链路 smoke E2E、榜单 LCP 与无限滚动性能 E2E、GitHub Actions CI。                                  |

核心演示路径：

```text
登录 -> 首页 -> 创作者主页 / 工作台 -> AI 生成 -> 保存草稿 -> 富文本编辑
  -> 发布前审核与评分 -> 合规改写或发布 -> 文章详情 -> 信息流/榜单 -> 互动反馈
```

---

## 二、系统架构与关键实现

### Monorepo 布局

```text
apps/web          Next.js App Router 前端，负责页面、组件、编辑器、SSE 消费和本地状态
apps/api          NestJS 后端，负责鉴权、AI 编排、审核、评分、发布、榜单、素材和资讯
packages/shared   前后端共享类型、枚举、DTO、评分权重和内容结构契约
docs              PRD、架构、审核规则、评估报告和每个关键功能的 dev plan
e2e               Playwright 主链路与榜单性能用例
scripts           本地开发端口避让、E2E 环境和种子数据脚本
```

`packages/shared` 是前后端契约的单点来源；`apps/web` 承载创作、编辑、榜单和内容消费体验；`apps/api` 保障 AI 密钥安全、审核裁决、质量评分、榜单排序和数据持久化。

### 总体架构

```text
Browser
  |
  | HTTP / SSE
  v
Next.js Web
  |
  | REST / SSE
  v
NestJS API
  |        |         |
  |        |         +--> OpenAI-compatible Provider / Volcano Ark / Doubao
  |        +------------> Redis
  +---------------------> PostgreSQL + Prisma
```

### 后端领域模块

```text
auth          注册、登录、JWT、bcrypt、当前用户上下文
users         创作者概览、作品统计、我的内容聚合
drafts        草稿 CRUD、版本快照、版本回滚、删除联动
prompts       平台 Prompt、私人 Prompt、复制与编辑
ai-gateway    模型适配、Prompt 装配、结构化输出、SSE、请求日志、mock/live 降级
audit         内容审核与合规改写
scoring       五维质量评分
publish       审核评分聚合、发布快照、文章详情、撤回
feed          推荐信息流
ranking       热点榜、爆文榜、Redis 缓存与 PostgreSQL 回退
analytics     阅读、点赞、收藏事件
assets        素材上传、资料抽取、云存储契约、图片视觉审核
news          开放 API 每日资讯接入、Redis 快照、显式 mock 模式
common        SSE 工具、健康检查、环境路径
```

### 关键设计与核心实现

| 技术支柱       | 核心实现                                                                                                                                    | 深入阅读                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| AI 集中编排    | AI Gateway 统一处理模型配置、OpenAI-compatible 调用、Prompt 渲染、结构化解析、SSE 流、超时重试和 mock 降级。                                | [技术架构](./docs/architecture.md) · [模型接入方案](./docs/dev_plan/007-model-provider-integration.md)                                       |
| 草稿编辑闭环   | 工作台生成后保存为草稿；编辑页支持富文本、自动保存、离线暂存、刷新恢复、版本历史、版本回滚和冲突提示。                                      | [草稿方案](./docs/dev_plan/002-creation-workbench-drafts.md) · [离线同步方案](./docs/dev_plan/015-draft-offline-sync-and-redis-ranking.md)   |
| 发布审核流水线 | 发布由后端强制触发审核和评分；正文与图片节点可拆分审核后聚合裁决；BLOCK 不发布，WARN 引导修改后重审。                                       | [审核发布方案](./docs/dev_plan/004-audit-scoring-publish.md) · [审核规则](./docs/audit-rules.md)                                             |
| 合规改写       | 对有风险的审核结果生成替代表达，返回富文本正文和建议，用户确认后写回草稿。                                                                  | [合规改写方案](./docs/dev_plan/011-compliance-rewrite-publish-review.md)                                                                     |
| 分发与榜单     | 基于质量分、热度、时间新鲜度和互动反馈计算 rank score；Redis 缓存榜单，失败时回退 PostgreSQL。                                              | [分发方案](./docs/dev_plan/006-feed-ranking-analytics.md) · [榜单性能方案](./docs/dev_plan/019-ranking-infinite-scroll-lcp.md)               |
| 素材与视觉审核 | 图片和资料上传后进行基础校验、资料文本抽取、视觉审核；图片经 OSS/S3-compatible 存储后通过稳定 view URL 渲染，发布前对正文图片进行同源审核。 | [素材方案](./docs/dev_plan/016-assets-cloud-vision-audit.md) · [图片审核方案](./docs/dev_plan/023-publish-image-download-base64-audit.md)    |
| 多模态生成     | 流式返回正文、图片计划、图片生成状态和完成图片；结果组合为 ProseMirror 富文本草稿。                                                         | [多模态方案](./docs/dev_plan/020-multimodal-generation-workbench.md)                                                                         |
| 每日资讯选题   | 后端接入 `60s.viki.moe` 开放 API 获取每日 AI 资讯与热点数据，支持 Redis 当天快照、最近非空快照、显式 mock 模式和工作台预填。                | [资讯预填方案](./docs/dev_plan/021-creator-daily-news-prefill.md) · [资讯缓存方案](./docs/dev_plan/022-creator-daily-news-redis-snapshot.md) |

---

## 三、快速开始

### 前置依赖

- Node.js `>= 22`
- pnpm `>= 10`，如本机未启用可先执行 `corepack enable`
- Docker Desktop，或可用的本地 PostgreSQL / Redis

### 环境变量

复制环境变量模板：

```bash
cp .env.example .env
```

本项目统一读取仓库根目录 `.env`。不要在 `apps/api/.env` 或 `apps/web/.env` 维护另一份配置，避免端口、模型或密钥配置看起来已修改但运行时未生效。

`pnpm prisma:generate`、`pnpm prisma:migrate` 和 `pnpm prisma:seed` 也会先加载仓库根目录 `.env`，无需把 `.env` 复制到 `apps/api`。

重点检查：

| 变量                                                       | 用途                         | 说明                                           |
| ---------------------------------------------------------- | ---------------------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL`                                 | Web 访问 API 的基础地址      | `pnpm dev` 会自动注入可用 API 地址             |
| `PORT`                                                     | API 服务端口                 | 默认 `3201`                                    |
| `JWT_SECRET` / `JWT_EXPIRES_IN`                            | 登录态签名与过期时间         | 生产环境必须使用强 secret                      |
| `DATABASE_URL`                                             | PostgreSQL 连接              | Prisma migration、seed、API 运行依赖           |
| `E2E_DATABASE_URL`                                         | E2E 专用数据库               | 必须和 `DATABASE_URL` 不同                     |
| `REDIS_URL`                                                | Redis 连接                   | 榜单缓存和每日资讯快照依赖；不可用时有降级     |
| `AI_PROVIDER_MODE`                                         | 文本模型模式                 | `auto` / `mock` / `live`                       |
| `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL`                  | OpenAI-compatible 文本模型   | live 模式必须配置                              |
| `AI_IMAGE_MODEL` / `AI_IMAGE_TIMEOUT_MS` / `AI_IMAGE_SIZE` | 图片生成配置                 | 多模态工作台可选                               |
| `ASSET_STORAGE_MODE`                                       | 素材存储模式                 | `mock` 或 `s3`                                 |
| `ASSET_CDN_BASE_URL` / `ASSET_ENDPOINT` / `ASSET_BUCKET`   | OSS/S3-compatible 渲染与上传 | 生产环境用于图片上传、读取和 CDN URL 拼接      |
| `ASSET_AUDIT_MODE` / `ASSET_VISION_MODEL`                  | 图片与资料审核               | `auto` 会在凭据齐备时使用真实模型，否则 mock   |
| `PUBLIC_API_BASE_URL`                                      | 稳定图片 URL 的 API 公网地址 | 生产部署建议配置                               |
| `NEWS_PROVIDER_MODE` / `NEWS_FETCH_TIMEOUT_MS`             | 每日资讯开放 API 模式与超时  | `auto` 默认接入开放 API，`mock` 仅用于离线兜底 |

本地演示推荐：

```env
AI_PROVIDER_MODE=mock
ASSET_AUDIT_MODE=mock
NEWS_PROVIDER_MODE=auto
```

`NEWS_PROVIDER_MODE=auto` 会优先请求开放 API；只有需要完全离线演示时，才显式改为 `NEWS_PROVIDER_MODE=mock`。

真实模型调用示例：

```env
AI_PROVIDER_MODE=live
AI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3/chat/completions
AI_API_KEY=your-provider-key
AI_MODEL=your-model-name
AI_TIMEOUT_MS=60000
AI_MAX_RETRIES=1

AI_IMAGE_MODEL=doubao-seedream-4-5-251128
AI_IMAGE_TIMEOUT_MS=120000
AI_IMAGE_MAX_RETRIES=1
AI_IMAGE_SIZE=2K
```

### 启动步骤

```bash
# 1. 安装依赖
pnpm install

# 2. 启动本地 PostgreSQL + Redis
pnpm db:up

# 3. 执行 Prisma migration 并写入演示数据
pnpm prisma:migrate
pnpm prisma:seed

# 4. 启动 Web + API
pnpm dev
```

`pnpm dev` 会检测本机端口并自动启动：

| 服务 | 默认优先地址            |
| ---- | ----------------------- |
| Web  | `http://localhost:3200` |
| API  | `http://localhost:3201` |

如端口被占用，脚本会自动尝试下一个可用端口，并把 `NEXT_PUBLIC_API_BASE_URL` 注入 Web 进程。也可以手动指定：

```powershell
$env:WEB_PORT="3200"
$env:API_PORT="3201"
pnpm dev
```

如需绕过端口自检脚本：

```bash
pnpm dev:raw
```

### 质量检查

本地检查命令与 CI 保持一致：

```bash
pnpm typecheck
pnpm test
pnpm build
```

提交前建议至少确保 typecheck、test、build 通过。功能验收还需要真实启动应用，按演示路径走一遍关键流程。

### E2E 验证

Smoke E2E 会创建草稿、审核评分、发布文章并写入互动数据，必须使用独立测试数据库。

先创建 E2E 数据库，例如：

```sql
CREATE DATABASE bytecamp_aigc_e2e;
```

在 `.env` 中确保：

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bytecamp_aigc
E2E_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bytecamp_aigc_e2e
```

运行：

```bash
pnpm test:e2e:smoke
pnpm test:e2e:rankings-performance
```

E2E 脚本会校验 `E2E_DATABASE_URL`，避免误写开发库；运行时强制使用 `AI_PROVIDER_MODE=mock`，不依赖真实模型密钥。

### 常用脚本

| 命令                                 | 用途                                     |
| ------------------------------------ | ---------------------------------------- |
| `pnpm dev`                           | 启动本地 Web/API，自动避让端口           |
| `pnpm dev:raw`                       | 使用 workspace 原始并行 dev              |
| `pnpm build`                         | 构建 shared、API 和 Web                  |
| `pnpm typecheck`                     | 全 workspace 类型检查                    |
| `pnpm test`                          | 运行后端、前端 helper 和 Controller 测试 |
| `pnpm test:e2e:smoke`                | 运行创作到发布主链路 E2E                 |
| `pnpm test:e2e:rankings-performance` | 运行榜单 LCP 与无限滚动性能 E2E          |
| `pnpm playwright:install`            | 安装 Playwright Chromium                 |
| `pnpm prisma:migrate`                | 执行 Prisma migration                    |
| `pnpm prisma:seed`                   | 写入演示账号、Prompt 和榜单文章          |
| `pnpm db:up` / `pnpm db:down`        | 启动或停止本地 PostgreSQL / Redis        |

---

## 四、目录结构

```text
apps/web/src/app                      前端页面与路由
  ├── page.tsx                        内容首页 / 推荐信息流入口
  ├── login/                          登录注册
  ├── creator/                        创作者主页、作品管理、每日资讯
  ├── workspace/                      创作工作台
  ├── multimodal-workspace/           多模态图文生成工作台
  ├── drafts/                         草稿箱与草稿编辑器
  ├── publish/                        发布确认、审核评分、合规改写
  ├── articles/                       文章详情与互动
  ├── rankings/                       热点榜 / 爆文榜
  └── docs/                           发文规范

apps/web/src/components               前端复用组件
  ├── editor/                         TipTap 富文本编辑器与查看器
  ├── ai-writing-assistant.tsx        AI 创作助手面板
  ├── asset-panel.tsx                 素材管理面板
  └── prompt-manager-panel.tsx        Prompt 管理面板

apps/web/src/lib                      前端状态与数据处理 helper
  ├── ai-stream.ts                    SSE 解析与流式正文组装
  ├── rich-text-document.ts           ProseMirror 文档工具
  ├── draft-offline-state.ts          草稿离线暂存
  ├── workspace-prefill.ts            每日资讯预填
  └── ranking-guidance.ts             榜单解释文案

apps/api/src                          NestJS 后端
  ├── auth/                           注册、登录、JWT Guard
  ├── users/                          创作者概览
  ├── drafts/                         草稿、版本、回滚、删除
  ├── prompts/                        Prompt 模板
  ├── ai-gateway/                     模型适配、SSE、生成、改写、多模态
  ├── audit/                          内容审核与合规改写
  ├── scoring/                        质量评分
  ├── publish/                        发布、详情、撤回
  ├── feed/                           推荐信息流
  ├── ranking/                        榜单计算与 Redis 缓存
  ├── analytics/                      互动事件
  ├── assets/                         素材上传、存储、审核
  ├── news/                           每日资讯与 Redis 快照
  ├── prisma/                         Prisma Service
  └── common/                         SSE、健康检查、环境路径

apps/api/prisma                       Prisma schema、migration、seed
packages/shared/src                   前后端共享枚举、DTO、内容结构和评分权重
docs                                  PRD、架构、审核规则、评估方案、dev plan、评估报告
e2e                                  Playwright smoke 与榜单性能用例
scripts                              本地 dev 和 E2E 编排脚本
```

---

## 五、常见问题

### pnpm 命令找不到

项目要求 Node.js 22+ 和 pnpm 10+。如果系统没有全局 pnpm，可先启用 Corepack：

```bash
corepack enable
corepack pnpm install
```

也可以直接使用仓库中的脚本命令，例如 `corepack pnpm typecheck`。

### AI 为什么返回 mock 内容

默认 `AI_PROVIDER_MODE=auto`。当 `.env` 中的 `AI_API_KEY` 或 `AI_MODEL` 仍是占位值时，后端会自动使用 mock，保证无密钥也能演示。要强制真实模型调用，需要配置：

```env
AI_PROVIDER_MODE=live
AI_API_KEY=your-provider-key
AI_MODEL=your-model-name
```

### 发布时为什么被 WARN 或 BLOCK

发布前审核是强制流程。`BLOCK` 会禁止发布，`WARN` 会给出风险片段和修改建议。可以修改草稿后重新审核，也可以使用“一键合规改写”生成替代表达。

### Redis 不可用会不会影响演示

不会中断核心链路。热点榜和爆文榜会回退到 PostgreSQL 查询与内存排序；每日资讯默认走开放 API，并可回退到 Redis/内存最近缓存或空状态。`mock` 只在显式配置 `NEWS_PROVIDER_MODE=mock` 时启用。

### E2E 为什么必须配置独立数据库

E2E 会创建草稿、发布文章并写入互动事件。为避免污染开发/演示数据，脚本会强制校验 `E2E_DATABASE_URL`，并要求它不能等于 `DATABASE_URL`。

### 端口被占用怎么办

优先使用 `pnpm dev`。脚本会自动检测 Web/API 端口并避让。如果需要固定端口，可设置：

```powershell
$env:WEB_PORT="3200"
$env:API_PORT="3201"
pnpm dev
```

### 图片或资料审核不符合预期

本地演示可使用 `ASSET_AUDIT_MODE=mock`。真实视觉审核需要配置 `AI_API_KEY`、`AI_MODEL` 或 `ASSET_VISION_MODEL`。发布前还会对正文中的图片节点进行聚合审核。

### 图片上传后如何渲染

图片上传后，API 先完成 MIME/大小校验和视觉审核，再把文件写入 `CloudStorageService` 管理的 OSS/S3-compatible 对象存储。数据库保存 `assets.metadata.storageKey` 和原始 `cdnUrl`，但返回给前端的是稳定路径 `/assets/:id/view`。编辑器把这个稳定路径写入 ProseMirror 图片节点；浏览器渲染时请求 API，API 再 302 到 OSS/CDN 真实读取地址。

多模态生成图片也会被转存到对象存储，草稿中保存 `/assets/generated/:userId/:filename/view`。生产环境需要配置 `PUBLIC_API_BASE_URL`，保证已发布文章里的图片地址可以从公网访问。

这条链路也属于性能优化：应用服务不承担大图静态分发，正文和数据库不保存图片二进制，图片读取交给 OSS/CDN 边缘缓存，文章详情页只保留轻量 URL 引用。

---

## 六、技术栈一览

| 层级     | 选型                                                                    |
| -------- | ----------------------------------------------------------------------- |
| Monorepo | pnpm workspace                                                          |
| 前端     | Next.js App Router · React · TypeScript · Tailwind CSS                  |
| 编辑器   | TipTap · ProseMirror JSON                                               |
| 后端     | NestJS · TypeScript                                                     |
| 数据库   | PostgreSQL · Prisma ORM                                                 |
| 缓存     | Redis Sorted Set                                                        |
| AI       | OpenAI SDK 兼容模式 · 火山方舟 / 豆包等 OpenAI-compatible provider      |
| 鉴权     | JWT · bcryptjs                                                          |
| 素材     | OSS/S3-compatible object storage · stable `/assets/:id/view` render URL |
| 测试     | Node test runner · Controller/Service/helper tests · Playwright E2E     |
| 工程     | TypeScript · Prettier · GitHub Actions CI                               |
| 部署建议 | Vercel · Railway / Render / ECS · 托管 PostgreSQL · Upstash / Redis     |

---

## 七、开发过程

本项目按“业务闭环”而不是按技术栈孤立推进。每一轮功能都先明确用户价值和端到端链路，再拆出前端、后端、共享包、数据模型、API、页面状态、风险边界和验证方式。

已沉淀的关键技术方案包括：

| 阶段               | 技术方案                                                                                                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 登录与基础链路     | [登录界面](./docs/dev_plan/001-login-page-ui.md)、[创作工作台与草稿](./docs/dev_plan/002-creation-workbench-drafts.md)、[创作者主页](./docs/dev_plan/003-creator-home.md)                                                                                                                  |
| 审核发布闭环       | [审核评分发布](./docs/dev_plan/004-audit-scoring-publish.md)、[合规改写](./docs/dev_plan/011-compliance-rewrite-publish-review.md)、[模型审核与 Prompt 管理](./docs/dev_plan/012-model-audit-prompt-management.md)                                                                         |
| 分发与反馈         | [信息流榜单互动](./docs/dev_plan/006-feed-ranking-analytics.md)、[创作者作品管理](./docs/dev_plan/010-creator-works-feedback.md)、[我的内容统一管理](./docs/dev_plan/014-creator-content-management.md)                                                                                    |
| 稳定性与性能       | [端口避让](./docs/dev_plan/005-dev-port-resilience.md)、[Playwright Smoke E2E](./docs/dev_plan/013-playwright-smoke-e2e-delivery.md)、[榜单 LCP](./docs/dev_plan/019-ranking-infinite-scroll-lcp.md)                                                                                       |
| 素材、多模态与资讯 | [素材与视觉审核](./docs/dev_plan/016-assets-cloud-vision-audit.md)、[多模态工作台](./docs/dev_plan/020-multimodal-generation-workbench.md)、[每日资讯预填](./docs/dev_plan/021-creator-daily-news-prefill.md)、[资讯 Redis 快照](./docs/dev_plan/022-creator-daily-news-redis-snapshot.md) |

效果评估见 [docs/evaluation-report.md](./docs/evaluation-report.md)。该报告从 AI 生成、审核评分、分发反馈、性能和工程化五个维度总结当前 MVP 的完成情况和上线前建议。

---

## 八、交付与验收

### 文档交付

- [PRD](./docs/PRD.md)
- [技术架构](./docs/architecture.md)
- [内容安全审核规则与质量评估体系](./docs/audit-rules.md)
- [评估与交付方案](./docs/evaluation-plan.md)
- [效果评估报告](./docs/evaluation-report.md)
- [功能技术方案目录](./docs/dev_plan)

### CI 与本地验收

GitHub Actions 已配置在 [.github/workflows/ci.yml](./.github/workflows/ci.yml)，推送到 `main/master` 或创建 Pull Request 时会执行：

```text
pnpm install
pnpm prisma:generate
pnpm typecheck
pnpm test
pnpm build
```

本地建议按以下顺序验收：

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e:smoke
pnpm test:e2e:rankings-performance
```

### 部署建议

| 服务       | 推荐平台                                      |
| ---------- | --------------------------------------------- |
| Web        | Vercel                                        |
| API        | Railway / Render / ECS / 其他 Node 运行环境   |
| PostgreSQL | Railway Postgres / Supabase / Neon / 云数据库 |
| Redis      | Upstash / Railway Redis / 云 Redis            |
| 对象存储   | mock 演示或 S3-compatible 存储                |

生产部署要点：

- Web 设置 `NEXT_PUBLIC_API_BASE_URL` 指向 API 公网地址。
- API 设置 `DATABASE_URL`、`REDIS_URL`、`JWT_SECRET`、AI provider 和素材存储变量。
- 图片渲染需要配置 `PUBLIC_API_BASE_URL`，对象存储需要配置 `ASSET_STORAGE_MODE=s3`、`ASSET_CDN_BASE_URL`、`ASSET_ENDPOINT`、`ASSET_BUCKET`、`ASSET_ACCESS_KEY_ID` 和 `ASSET_SECRET_ACCESS_KEY`。
- 首次部署后执行 Prisma migration；是否执行 seed 取决于是否需要演示数据。
- API 部署后先检查 `/health`，再验证登录、创作、审核、发布和榜单链路。
- Redis 不可用时，榜单会回退 PostgreSQL 排序；每日资讯默认请求开放 API，并按缓存或空状态降级。演示数据只在显式 `NEWS_PROVIDER_MODE=mock` 时使用。
- 真实生产环境应使用强 `JWT_SECRET`，不得提交真实 AI 密钥、数据库密码或对象存储密钥。

### API 速览

| 模块         | 接口                                                                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 鉴权         | `POST /auth/register`、`POST /auth/login`                                                                                                                |
| 用户与创作者 | `GET /users/me/creator-overview`                                                                                                                         |
| AI 创作      | `POST /ai/generate-article`、`POST /ai/generate-article/stream`、`POST /ai/optimize-titles/stream`、`POST /ai/rewrite/stream`                            |
| 多模态       | `POST /ai/generate-multimodal/stream`                                                                                                                    |
| Prompt       | `GET /prompts`、`GET /prompts/:id`、`POST /prompts`、`POST /prompts/:id/copy`、`PATCH /prompts/:id`、`DELETE /prompts/:id`                               |
| 草稿         | `POST /drafts`、`GET /drafts/mine`、`GET /drafts/:id`、`PATCH /drafts/:id`、`DELETE /drafts/:id`、`GET /drafts/:id/versions`、`POST /drafts/:id/restore` |
| 素材         | `GET /assets/mine`、`POST /assets`、`GET /assets/:id/view`、`DELETE /assets/:id`、素材文件夹 CRUD                                                        |
| 审核与评分   | `POST /audit/check`、`POST /audit/rewrite/stream`、`POST /scoring/article`                                                                               |
| 发布与文章   | `POST /publish/:draftId`、`GET /articles/:id`、`POST /articles/:id/withdraw`                                                                             |
| 分发与互动   | `GET /feed`、`GET /rankings/hot`、`GET /rankings/top`、`POST /articles/:id/events`                                                                       |
| 每日资讯     | `GET /news/creator-daily`                                                                                                                                |
