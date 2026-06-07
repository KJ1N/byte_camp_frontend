# Playwright Smoke E2E 与交付稳定性技术方案

## 1. 功能目标和用户价值

本阶段从“继续增加产品功能”转向“证明核心业务闭环稳定可演示”。当前项目已经具备登录、创作、草稿、审核、评分、发布、详情、榜单、互动和 Prompt 管理能力，但 README 与架构文档中仍缺少一条自动化端到端验证：

```text
登录 -> 工作台创作 -> 保存草稿 -> 发布前审核评分 -> 发布 -> 查看文章详情 -> 首页/榜单可见
```

用户价值：

- 对演示者：每次改动后都能快速验证主链路是否仍然可跑，减少现场演示风险。
- 对初学者：把“前端页面操作、后端接口、数据库状态、发布结果”串成一条可观察链路，理解全栈闭环不是孤立页面或孤立接口。
- 对交付评估：补齐 PRD、架构和 README 中要求的 E2E 验证、演示 seed 数据和 CI 工程化检查。
- 对后续开发：新增发布、榜单、审核、Prompt 等功能时，smoke 用例能及时发现登录态、接口契约、页面跳转和发布状态流转的回归。

## 2. 下一步范围选择

### 推荐方案：先做 Playwright smoke E2E + 演示 seed 风险数据 + CI 校准

本阶段实现：

- 新增 Playwright 配置和 smoke 用例，覆盖登录、工作台生成、保存草稿、发布前审核、发布成功、文章详情可见。
- 让 E2E 使用 `AI_PROVIDER_MODE=mock`，避免依赖真实模型密钥和外部网络。
- 扩展演示 seed 数据，补充正常内容、WARN 内容、BLOCK 内容和榜单内容，满足演示脚本中的审核风险场景。
- 校准 CI：继续运行 `pnpm typecheck`、单元测试和 build，并预留 smoke E2E 的本地/CI 运行命令。
- 更新 README 的交付待办状态，并在实现完成后生成 `docs/learn/013-playwright-smoke-e2e-delivery-learning.md`。

优点：

- 直接补齐 README 第 7 组“测试、部署与交付”中最关键的自动化验证缺口。
- 不新增业务表结构，主要围绕测试、seed 和脚本，风险相对可控。
- 可以复用现有 mock AI、mock 审核/评分、seed 演示账号和发布链路。
- 对后续部署、性能评估和答辩材料都有支撑作用。

代价：

- E2E 需要同时启动 PostgreSQL、API 和 Web，本地与 CI 环境差异要处理好。
- 页面选择器需要稳定，可能需要为关键按钮和状态增加少量 `aria-label` 或可访问文本。
- 如果现有页面在 mock 模式下仍存在偶发异步状态，需要先把等待条件收敛清楚。

### 备选方案 A：优先做断网本地暂存与同步

优点：

- 对草稿编辑体验有直接价值。
- 对 PRD 中“断网编辑”能力有补强。

代价：

- 当前主链路已经可演示，断网同步属于增强体验。
- 实现会触碰编辑器保存状态、本地缓存和重放机制，范围比 smoke E2E 更容易扩散。

本阶段暂不采用。

### 备选方案 B：优先接入 Redis Sorted Set 榜单

优点：

- 更贴近架构文档中的 Redis 榜单设计。
- 对生产环境榜单性能和可扩展性更好。

代价：

- 当前 PostgreSQL 排序已经可演示推荐流和榜单。
- Redis 引入会增加本地、CI 和部署环境配置成本。

本阶段暂不采用。

## 3. 涉及的前端、后端、共享包模块

### 前端 `apps/web`

- 页面本身不做大规模 UI 改造。
- 必要时为关键交互增加稳定、可访问的定位文本或 `aria-label`：
  - 登录提交按钮。
  - 工作台主题输入、生成按钮、保存草稿按钮。
  - 发布页开始审核、确认发布按钮。
  - 文章详情页标题与正文容器。
- 不把审核、评分、发布、榜单逻辑迁移到前端。

### 后端 `apps/api`

- 复用现有 Auth、Drafts、Audit、Scoring、Publish、Feed、Ranking、Analytics 模块。
- E2E 运行时使用 mock AI provider，后端继续负责 AI 编排、审核裁决、评分和发布写库。
- 扩展 `prisma/seed.ts`，让演示数据覆盖：
  - 可直接发布的 PASS 内容。
  - 会命中 WARN 的虚假医疗/绝对化表述草稿。
  - 会命中 BLOCK 的赌博或违法引导草稿。
  - 已发布文章与互动事件，用于首页和榜单展示。

### 共享包 `packages/shared`

- 原则上不新增共享业务类型。
- 如 E2E helper 需要引用 API 状态字符串，优先使用已有 shared 枚举和 DTO，不新增测试专用契约。

### 根目录与 CI

- 新增 Playwright 配置和 E2E 测试目录。
- 复用 `scripts/dev.mjs` 的端口自适应能力，或新增专用 E2E 启动脚本以降低 CI 不确定性。
- `.github/workflows/ci.yml` 保持基础检查，并在 E2E 环境稳定后加入 smoke E2E job。

## 4. 需要新增或修改的文件

### 新增文件

- `playwright.config.ts`
  - Playwright 全局配置、baseURL、webServer 或外部启动方式。
- `e2e/smoke.spec.ts`
  - 登录到发布成功的核心 smoke 用例。
- `e2e/helpers/api.ts`
  - 可选：封装测试前清理、登录 API、等待健康检查等测试辅助逻辑。
- `e2e/helpers/selectors.ts`
  - 可选：集中维护页面关键可访问定位，避免测试里散落字符串。
- `docs/learn/013-playwright-smoke-e2e-delivery-learning.md`
  - 实现完成后生成，面向初学者复盘 E2E 如何串起全栈链路。

### 修改文件

- `package.json`
  - 增加 `test:e2e` 或 `test:e2e:smoke` 脚本。
- `apps/api/prisma/seed.ts`
  - 补充 WARN/BLOCK 草稿和必要审核演示数据。
- `.github/workflows/ci.yml`
  - 根据本地验证结果决定是否加入 smoke E2E job；如果 CI 数据库环境尚未就绪，先保留注释化或文档化运行方式，不虚假勾选。
- `README.md`
  - 实现和验证完成后更新测试、seed、CI 待办状态。
- `apps/web/src/app/**`
  - 仅在 E2E 定位不稳定时做小范围可访问性补充，不改变页面视觉风格。

### 暂不修改

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/**`
- `apps/api/src/publish/publish.service.ts` 的发布强约束逻辑
- `apps/api/src/audit/**` 的模型审核裁决逻辑
- `apps/api/src/ranking/**` 的排序公式
- `packages/shared/src/index.ts`，除非发现现有 DTO 无法表达测试需要

## 5. 数据模型或 API 变更

### 数据模型

本阶段不修改 Prisma schema，不新增迁移。

`seed.ts` 继续使用 `upsert`，保证重复执行安全：

- 演示账号：
  - `demo@bytecamp.local`
  - 密码 `bytecamp123`
- 正常发布内容：
  - 已有 `demo-article-*` 保留，用于首页、详情和榜单初始数据。
- WARN 草稿：
  - 示例标题：`需要修改的健康建议草稿`
  - 正文包含“百分百治好”“不用就医”等虚假医疗或绝对化表达。
  - 状态保持 `DRAFT`，用于发布页审核演示。
- BLOCK 草稿：
  - 示例标题：`禁止发布的高风险草稿`
  - 正文包含赌博引导或违法犯罪引导。
  - 状态保持 `DRAFT`，用于 BLOCK 拦截演示。

E2E 主用例优先创建自己的新草稿，避免依赖固定草稿版本变化。seed 风险草稿主要服务手动演示和后续风险分支 E2E。

### API 变更

不新增业务 API。

测试会使用现有接口和页面链路：

```text
POST /auth/login
GET  /users/me
POST /ai/generate-article
POST /drafts
GET  /drafts/:id
POST /audit/check
POST /publish/:draftId
GET  /articles/:id
GET  /feed
GET  /rankings/hot
GET  /rankings/top
```

如果测试清理需要专用 API，本阶段不新增测试后门。优先用唯一主题、唯一邮箱或 seed 固定数据隔离测试。

## 6. 前端交互与页面状态设计

E2E 以用户真实操作为主，不绕过关键页面：

1. 打开 `/login`。
2. 输入 `demo@bytecamp.local` 和 `bytecamp123`。
3. 登录成功后进入首页或目标页，确认右上角用户信息可见。
4. 进入 `/workspace`。
5. 输入唯一主题，例如 `E2E smoke AI 内容创作 ${timestamp}`。
6. 选择默认 Prompt 和风格，触发 AI 生成。
7. 等待标题、大纲和正文出现在工作台编辑区或助手区。
8. 点击保存草稿，等待保存成功并跳转或显示草稿入口。
9. 进入草稿编辑页，确认标题和正文可见。
10. 点击发布，进入 `/publish/:id`。
11. 点击开始审核，等待 PASS 审核结果和质量评分。
12. 点击确认发布。
13. 到达 `/articles/:id`，确认文章标题、正文、质量分或审核信息可见。
14. 回到首页或榜单，确认至少能看到已发布内容列表，若排序异步则只断言列表可加载和无错误。

定位策略：

- 优先使用 `getByRole`、`getByLabel`、`getByText` 等可访问定位。
- 如果现有按钮只有视觉文本且不稳定，给按钮补 `aria-label`。
- 不使用 CSS class 作为主要定位方式，避免 Tailwind class 调整导致测试失效。

页面状态要求：

- 生成中、保存中、审核中、发布中必须有可等待文本或按钮状态。
- 错误提示必须保留在页面上，便于 E2E 失败时截图定位。
- 移动端布局本阶段不新增专门 E2E，但不能因可访问性补充影响现有响应式样式。

## 7. 后端服务、鉴权、审核、评分、发布或榜单逻辑

### 鉴权

- E2E 通过真实登录页面获取 token，不直接写 localStorage 作为主路径。
- 后端仍使用 `JwtAuthGuard` 和 `CurrentUser` 识别当前用户。
- 测试数据只操作当前 demo 用户自己的草稿。

### AI 生成

- E2E 环境使用：

```env
AI_PROVIDER_MODE=mock
```

- mock 生成必须返回结构化标题、大纲和正文，满足现有 `GeneratedArticleDraft` 契约。
- 不依赖真实 `AI_API_KEY`、`AI_MODEL` 或外部网络。

### 审核与评分

- 正常 smoke 用例的主题和正文应稳定命中 `PASS`。
- WARN/BLOCK seed 数据用于手动演示；后续可扩展独立 E2E：
  - WARN：确认展示证据和修改建议，不能直接发布。
  - BLOCK：确认禁止发布，文章不会创建。
- 发布接口内部仍重新审核和评分，E2E 不复用前端预检查结果。

### 发布

- 只有 `PASS` 后才能点击确认发布。
- 发布成功后生成 `articles` 和 `article_revisions`。
- 若发布失败，页面必须展示错误，E2E 不能静默通过。

### 榜单

- 本阶段不实现 Redis Sorted Set。
- 首页、热点榜、爆文榜仍使用现有 PostgreSQL 排序和互动数据。
- E2E 只做 smoke 级验证：页面可加载，至少存在 seed 或刚发布内容，不校验复杂排序细节。

## 8. 风险、边界情况和回滚方案

| 风险 | 处理 |
| --- | --- |
| E2E 依赖真实模型导致不稳定 | 强制 `AI_PROVIDER_MODE=mock`，测试不访问外部模型 |
| 端口占用导致测试启动失败 | 复用 `scripts/dev.mjs` 端口探测，或在 Playwright webServer 中固定测试端口并失败时输出日志 |
| 数据库未启动 | 文档和脚本明确先运行 `pnpm db:up`、`pnpm prisma:migrate`、`pnpm prisma:seed`；CI 如加入 E2E job 则使用 service container |
| seed 重复执行产生脏数据 | 所有演示数据使用固定 ID `upsert`；E2E 新数据使用唯一主题 |
| 页面文案调整导致测试失效 | 优先使用 role/label，必要时补稳定 `aria-label` |
| 发布后榜单排序异步变化 | smoke 用例只断言详情页和列表加载，不强依赖排序第一位 |
| CI 时间过长 | 首阶段只跑一个 smoke 用例；完整 E2E 后续再扩展 |
| 当前 GitHub Actions 没有数据库服务 | 先在本地验证 smoke；CI 是否启用 E2E 取决于 service container 配置是否完成 |
| E2E 修改页面导致视觉回归 | 只加可访问属性，不改变 Tailwind 主体布局和视觉样式 |

回滚方案：

- 删除 `playwright.config.ts`、`e2e/**` 和新增 npm 脚本。
- 恢复 `seed.ts` 中新增的 WARN/BLOCK 演示数据。
- CI 恢复为当前 `typecheck/test/build` 三步。
- 页面如只新增 `aria-label`，可保留，不影响业务功能。

## 9. 验证方式和测试计划

### 新增 E2E 验证

本地运行前置：

```bash
pnpm db:up
pnpm prisma:migrate
pnpm prisma:seed
```

运行 smoke：

```bash
pnpm test:e2e:smoke
```

预期：

- Playwright 启动 Web/API 或连接已启动服务。
- 登录成功。
- 工作台生成并保存草稿。
- 发布页审核结果为 PASS。
- 发布成功后进入文章详情页。
- 测试结束无浏览器 console error 和关键 API 5xx。

### 后端/前端已有测试

继续运行：

```bash
pnpm --filter @bytecamp-aigc/api test
pnpm --filter @bytecamp-aigc/web test
```

### 类型检查

```bash
pnpm typecheck
```

### 构建检查

因为会新增 Playwright 配置、脚本、seed 和可能的前端可访问属性，运行：

```bash
pnpm --filter @bytecamp-aigc/api build
pnpm --filter @bytecamp-aigc/web build
```

### CI 检查

如果本阶段完成 GitHub Actions E2E job，则验证：

```bash
pnpm test
pnpm build
pnpm test:e2e:smoke
```

如果 CI 暂时不接入 E2E，则 README 只说明本地 smoke 命令，不勾选“配置 CI 跑 E2E”。

### 手动页面验证

1. 启动数据库、API 和 Web。
2. 用 `demo@bytecamp.local / bytecamp123` 登录。
3. 进入工作台，生成并保存一篇正常草稿。
4. 发布前审核，确认 PASS、质量评分和确认发布按钮可见。
5. 发布后进入文章详情页。
6. 回到首页和榜单，确认内容列表加载正常。
7. 打开 seed 的 WARN 草稿，确认审核给出风险证据和修改建议，不能发布。
8. 打开 seed 的 BLOCK 草稿，确认审核拦截，不能发布。

### 数据库验证

- E2E 新草稿写入 `drafts`。
- 发布成功后写入 `audit_records`、`quality_scores`、`articles`、`article_revisions`。
- WARN/BLOCK seed 草稿不会因为 seed 或 smoke 自动发布。
- 互动 seed 数据仍能支撑首页和榜单展示。

## 10. 与总体架构的一致性

- `apps/web` 仍只负责页面操作、状态展示、路由跳转和 API 调用。
- `apps/api` 继续负责鉴权、AI mock/live 编排、审核裁决、评分、发布和数据持久化。
- `packages/shared` 仍负责共享契约，不为测试引入前端私有业务规则。
- E2E 从用户视角验证完整链路，但不绕过发布前审核和质量评分。
- 测试环境使用 mock AI 是为了稳定验证工程链路，不改变生产 live 模型接入方式。
- 页面样式仍遵守工作台风格规范；如需补定位，优先补可访问属性，不新增全局 CSS。

## 11. 实现完成后的学习文档

实现完成后，根据 `AGENTS.md` 生成：

```text
docs/learn/013-playwright-smoke-e2e-delivery-learning.md
```

学习文档面向第一次做全栈应用的初学者，重点解释：

- 为什么全栈项目不能只靠单元测试，还需要 smoke E2E。
- 用户从登录页面到发布文章详情页的完整链路。
- `playwright.config.ts`、`e2e/smoke.spec.ts`、`seed.ts`、`AuthController`、`DraftsController`、`AuditService`、`ScoringService`、`PublishService`、Next.js 页面分别承担什么责任。
- Playwright 如何通过浏览器操作触发真实 HTTP 请求。
- 为什么 E2E 使用 mock AI，而不是依赖真实模型。
- PASS、WARN、BLOCK seed 数据分别服务什么演示场景。
- 成功路径和失败路径分别会出现什么页面状态。
- 如何通过页面、接口、数据库、类型检查、构建命令和 E2E 命令验证功能正确。
- 常见误区：用 CSS class 写脆弱选择器、测试绕过登录和发布审核、依赖真实模型、seed 不可重复、CI 没有数据库却盲目启用 E2E。
