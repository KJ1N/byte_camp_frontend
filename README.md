# byte_camp_frontend

2026 字节前端训练营项目：AI 创作者辅助生产与分发平台。

AI Creator Hub 是面向图文创作者的 AIGC 辅助生产与分发平台。项目目标是把“AI 生成器”升级为完整的内容生产闭环：创作、编辑、审核、发布、分发、数据反馈与二次优化。

## 项目结构

```text
.
├── apps
│   ├── api      # NestJS 后端服务
│   └── web      # Next.js 前端应用
├── packages
│   └── shared   # 前后端共享 DTO、枚举和常量
├── docs         # PRD、技术架构、审核规则、评估方案
└── docker-compose.yml
```

## 技术栈

| 层级 | 选型 |
| --- | --- |
| Monorepo | pnpm workspace |
| 前端 | Next.js + React + TypeScript + Tailwind CSS |
| 后端 | NestJS + TypeScript |
| 数据库 | PostgreSQL + Prisma |
| 缓存/榜单 | Redis Sorted Set |
| AI 接入 | OpenAI SDK 兼容模式，适配火山方舟/豆包等模型 |
| 测试 | Vitest + Jest + Playwright |
| 部署 | 前端 Vercel，后端 Railway/Render/ECS，数据库托管 PostgreSQL |

## 开发进度清单

> 勾选前建议先确认对应功能已经完成页面验证、接口验证和必要的 `typecheck` / `build` / 测试。新增关键功能时，仍按 `AGENTS.md` 要求先写 `docs/dev_plan/` 技术方案，完成后补充 `docs/learn/` 本地学习文档。

### 已完成基础

- [x] 建立 pnpm workspace monorepo，拆分 `apps/web`、`apps/api`、`packages/shared`。
- [x] 完成 PRD、技术架构、审核规则、评估方案等基础文档。
- [x] 完成用户注册、登录、JWT 鉴权、bcrypt 密码哈希和前端退出登录。
- [x] 完成首页内容入口、登录态用户名展示、hover 菜单和创作者主页入口。
- [x] 完成创作工作台的主题输入、AI 生成文章、草稿保存链路。
- [x] 完成草稿箱列表和草稿编辑页基础能力。
- [x] 完成创作者主页 `/creator`，包含左侧导航、草稿动态、AI 创作灵感和工作台主题预填。
- [x] 完成 Prisma 核心数据模型：用户、草稿、版本、审核记录、质量分、文章、互动事件、榜单快照。
- [x] 完成创作者灵感接口和工作台 topic 预填 helper 的基础测试。

### 待开发事项

#### 1. 编辑器与草稿闭环

- [ ] 完善富文本编辑器工具栏：加粗、列表、引用、图片插入等 PRD 中的基础编辑能力。
- [ ] 实现草稿 30 秒自动保存，增加保存中、已保存、保存失败的页面状态。
- [ ] 实现断网本地暂存，网络恢复后同步到后端。
- [ ] 完成草稿版本历史 UI，支持查看历史版本。
- [ ] 完成草稿版本回滚 API 和页面操作。
- [ ] 增加草稿编辑冲突提示，避免多端编辑覆盖内容。

#### 2. AI 创作能力

- [ ] 完成 Prompt 模板接口和工作台模板选择 UI。
- [ ] 支持平台 Prompt 模板只读、用户复制为私人模板。
- [ ] 增加标题优化能力，生成多个标题候选。
- [ ] 增加正文改写能力：润色、扩写、缩写、风格转换。
- [ ] 增加 AI 请求超时、重试和降级提示。
- [ ] 记录 AI 请求日志：requestId、模型、耗时、token、状态。

#### 3. 审核、评分与发布

- [ ] 新增 `POST /audit/check` 接口，返回 PASS / WARN / BLOCK、风险片段和修改建议。
- [ ] 新增 `POST /scoring/article` 接口，返回五维质量分、总分、原因和优化建议。
- [ ] 实现发布入口：从草稿编辑页触发发布前审核和质量评分。
- [ ] 实现 `POST /publish/:draftId`，审核通过后生成文章快照。
- [ ] BLOCK 内容禁止发布，WARN 内容展示原因并引导修改后重审。
- [ ] 增加一键合规改写能力，用 AI 生成替代表达。
- [ ] 在草稿或发布确认页展示审核记录和质量评分结果。

#### 4. 内容详情、信息流与榜单

- [ ] 新增文章详情页 `/articles/[id]`，展示作者、发布时间、正文和互动数据。
- [ ] 新增推荐信息流接口 `GET /feed`，首页内容从后端读取。
- [ ] 新增热点榜 `GET /rankings/hot` 和爆文榜 `GET /rankings/top`。
- [ ] 使用 Redis Sorted Set 维护榜单，Redis 不可用时回退到 PostgreSQL。
- [ ] 首页、榜单和信息流支持分页或无限滚动。
- [ ] 实现阅读、点赞、收藏等互动事件写入。
- [ ] 让互动数据进入榜单排序和创作者数据反馈。

#### 5. 创作者管理与数据反馈

- [ ] 发布功能完成后，把创作者主页的“作品管理”从占位改成真实列表。
- [ ] 创作者主页统计接入真实数据：粉丝数、阅读量、作品数、互动数据。
- [ ] 增加用户资料页，支持头像、昵称和基础创作者信息展示。
- [ ] 增加“我的内容”统一列表，区分草稿、待审核、已发布、已撤回。
- [ ] 支持已发布内容二次编辑，并重新进入审核发布流程。
- [ ] 支持作者撤回已发布内容。

#### 6. 素材与多媒体

- [ ] 新增素材上传模块，支持图片或资料文件上传。
- [ ] 对上传素材进行基础合规校验。
- [ ] 在编辑器中插入和管理图片素材。
- [ ] 预留多模态生成能力入口，但 MVP 阶段不阻塞主链路。

#### 7. 测试、部署与交付

- [ ] 增加 Auth、Drafts、Audit、Scoring、Publish 的后端接口测试。
- [ ] 增加登录 -> 创作 -> 保存草稿 -> 审核 -> 发布 -> 查看详情的 Playwright smoke E2E。
- [ ] 准备演示 seed 数据，覆盖正常内容、WARN 内容、BLOCK 内容和榜单内容。
- [ ] 配置 CI，至少运行 typecheck、测试和前端 build。
- [ ] 完成线上部署：Web、API、PostgreSQL、Redis 和必要环境变量。
- [ ] 完成效果评估报告，覆盖生成、审核、分发、性能和工程化指标。
- [ ] 使用 Lighthouse 或等价工具检查首页和榜单 LCP，目标不超过 2.5 秒。

## 本地启动

```bash
cp .env.example .env
pnpm install
pnpm db:up
pnpm prisma:migrate
pnpm prisma:seed
pnpm dev
```

如果前后端端口冲突，建议使用：

```bash
# API
PORT=3001 pnpm --filter @bytecamp-aigc/api start:dev

# Web
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001 pnpm --filter @bytecamp-aigc/web dev
```

Windows PowerShell:

```powershell
$env:PORT="3001"; pnpm --filter @bytecamp-aigc/api start:dev
$env:NEXT_PUBLIC_API_BASE_URL="http://localhost:3001"; pnpm --filter @bytecamp-aigc/web dev
```

## 文档

- [完整 PRD](./docs/PRD.md)
- [技术架构](./docs/architecture.md)
- [内容安全审核规则与质量体系](./docs/audit-rules.md)
- [评估与交付方案](./docs/evaluation-plan.md)
