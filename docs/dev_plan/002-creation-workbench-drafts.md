# 创作工作台与草稿闭环技术方案

## 1. 功能目标和用户价值

本阶段承接已完成的登录入口，建立 MVP 第一段可演示创作闭环：

```text
登录用户 -> 输入主题/受众/风格 -> AI 生成标题、大纲、正文 -> 保存草稿 -> 进入编辑器修改 -> 自动保存与版本记录 -> 我的草稿列表
```

用户价值：

- 创作者登录后可以直接开始生成文章初稿，不再停留在项目介绍页。
- AI 生成结果可以被保存为结构化草稿，为后续审核、评分、发布提供数据基础。
- 编辑器支持手动保存、自动保存和版本记录，演示脚本中的“自动保存和版本记录”可以先跑通。

## 2. 涉及模块

### 前端 `apps/web`

- 首页 `/` 保持为内容信息流页面，不直接作为创作工作台。
- 新增独立工作台路由 `/workspace`，未登录时展示登录引导，已登录时展示创作表单和最近草稿。
- 首页右上角用户名称 hover 后出现入口菜单，包含“工作台”“草稿箱”和“退出登录”。
- 新增我的草稿列表页。
- 新增草稿编辑页，使用 TipTap / ProseMirror JSON 编辑和保存正文。
- 扩展前端 API 与登录态工具，统一携带 JWT token。

### 后端 `apps/api`

- 新增轻量 JWT 鉴权 Guard 和当前用户解析工具，保护 AI 生成和草稿接口。
- 为现有 `AiGatewayService` 增加控制器，提供 `POST /ai/generate-article`。
- 实现 `DraftsModule` 的 controller/service，提供草稿创建、列表、详情、更新、版本列表接口。
- 继续使用现有 mock AI 生成逻辑，暂不真实接入外部模型。

### 共享包 `packages/shared`

- 新增创作输入、AI 生成结果、草稿摘要、草稿详情、草稿版本等共享类型。
- 复用现有 `DraftMode`、`DraftStatus` 枚举，避免前后端重复定义状态字符串。

## 3. 需要新增或修改的文件

### 新增文件

- `apps/api/src/auth/auth.guard.ts`
- `apps/api/src/auth/current-user.decorator.ts`
- `apps/api/src/ai-gateway/ai-gateway.controller.ts`
- `apps/api/src/drafts/drafts.controller.ts`
- `apps/api/src/drafts/drafts.service.ts`
- `apps/web/src/app/workspace/page.tsx`
- `apps/web/src/app/workspace/layout.tsx`
- `apps/web/src/app/drafts/page.tsx`
- `apps/web/src/app/drafts/layout.tsx`
- `apps/web/src/app/drafts/[id]/page.tsx`
- `apps/web/src/app/drafts/[id]/layout.tsx`
- `apps/web/src/app/login/layout.tsx`
- `apps/web/src/app/docs/layout.tsx`
- `apps/web/src/components/editor/rich-text-editor.tsx`

### 修改文件

- `packages/shared/src/index.ts`
- `apps/api/src/auth/auth.module.ts`
- `apps/api/src/ai-gateway/ai-gateway.module.ts`
- `apps/api/src/ai-gateway/ai-gateway.service.ts`
- `apps/api/src/drafts/drafts.module.ts`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/auth.ts`
- `apps/web/src/app/globals.css`

### 暂不修改

- `apps/api/prisma/schema.prisma`
- `apps/api/src/audit/**`
- `apps/api/src/scoring/**`
- `apps/api/src/publish/**`
- `apps/api/src/feed/**`
- `apps/api/src/ranking/**`

## 4. 数据模型或 API 变更

本阶段不修改 Prisma schema，复用现有表：

- `drafts`
- `draft_versions`
- `prompts`
- `users`

新增或补齐 API：

```text
POST /ai/generate-article

POST  /drafts
GET   /drafts/mine
GET   /drafts/:id
PATCH /drafts/:id
GET   /drafts/:id/versions
```

`POST /ai/generate-article` 请求：

```json
{
  "topic": "AI 如何改变内容创作",
  "audience": "内容创作者",
  "style": "科普"
}
```

响应：

```json
{
  "model": "mock-model",
  "title": "AI 如何改变内容创作：创作者需要知道的 5 个变化",
  "outline": ["趋势背景", "核心机会", "实践方法", "风险与边界", "行动建议"],
  "bodyText": "文章正文纯文本",
  "body": {
    "type": "doc",
    "content": []
  }
}
```

`POST /drafts` 请求：

```json
{
  "title": "AI 如何改变内容创作",
  "body": {
    "type": "doc",
    "content": []
  },
  "mode": "FAST"
}
```

`PATCH /drafts/:id` 请求：

```json
{
  "title": "更新后的标题",
  "body": {
    "type": "doc",
    "content": []
  }
}
```

保存策略：

- 创建草稿时写入 `drafts`，并创建第 1 条 `draft_versions`。
- 每次保存更新 `drafts.version + 1`，并追加一条 `draft_versions`。
- 草稿接口只能访问当前登录用户自己的草稿。

## 5. 前端交互与页面状态设计

### 首页内容页与创作入口

首页 `/` 是内容消费页，承载推荐内容、热点榜/爆文榜入口和平台内容概览，不直接展示创作编辑器。

- 顶部右侧展示当前用户名称；hover 名称后展开菜单。
- hover 菜单至少包含“工作台”和“草稿箱”两个入口，分别跳转 `/workspace` 和 `/drafts`。
- hover 菜单包含“退出登录”，点击后清理本地 token 和 user，并停留或回到首页未登录状态。
- 未登录时展示登录入口；登录后才展示用户名称菜单。
- 首页的视觉应保持内容浏览页气质，避免出现创作工具栏和编辑器画布。

### 路由标题

不同路由需要设置不同网页标题：

| 路由 | 网页标题 |
| --- | --- |
| `/` | 内容首页 - AI Creator Hub |
| `/workspace` | 创作工作台 - AI Creator Hub |
| `/drafts` | 草稿箱 - AI Creator Hub |
| `/drafts/:id` | 草稿编辑 - AI Creator Hub |
| `/login` | 登录 - AI Creator Hub |
| `/docs` | 项目文档 - AI Creator Hub |

### 创作工作台

工作台从首页迁移到 `/workspace`，并采用用户提供的今日头条发布页参考图作为视觉模板：

- 未登录：展示紧凑登录引导和文档入口。
- 已登录：展示创作表单、AI 生成结果、保存草稿按钮、最近草稿入口。
- 使用 Tailwind CSS utility class 搭建页面主体样式，减少新增全局 CSS。
- 顶部为白色发布栏，左侧包含返回/发布文章入口，右侧包含规范、消息和用户入口。
- 主体为浅灰背景上的双栏工作区：左侧白色编辑画布，右侧浅色 AI 创作助手面板。
- 左侧编辑画布包含工具栏、标题输入、正文编辑区和底部发布操作栏。
- 右侧助手面板包含“AI 创作 / 内容建议”标签、生成内容、添加正文/复制/重试按钮和底部输入框。
- 视觉保持工具型产品气质：白、浅灰、深灰文字、细边框、6px 到 8px 圆角、红色强调和少量红到紫渐变按钮。

表单字段：

- 主题：必填。
- 目标受众：默认“内容创作者”。
- 风格：使用下拉或分段选择，默认“科普”，候选包含严肃、轻松、种草、科普、新闻。

页面状态：

- `idle`：可输入。
- `generating`：AI 生成中，禁用重复提交。
- `generated`：展示标题、大纲、正文预览和保存草稿按钮。
- `saving`：保存草稿中。
- `error`：展示 API 或鉴权错误。

### 我的草稿列表

- 展示标题、状态、版本号、更新时间。
- 支持进入编辑页。
- 空状态提示回到工作台创建第一篇草稿。

### 草稿编辑页

- 使用 TipTap StarterKit 编辑正文，数据保存为 ProseMirror JSON。
- 标题单独输入。
- 页面布局延续参考图：编辑器占主宽度，AI 助手固定在右侧，底部操作栏展示草稿保存状态、字数、预览、定时发布、预览并发布。
- 支持手动保存。
- 默认每 30 秒自动保存一次，仅在内容变化时触发。
- 保存成功后展示版本号和保存时间。
- 断网或 API 失败时，把最近一次未同步内容写入 localStorage；页面重新进入时提示可恢复。
- 右侧或下方展示最近版本记录，先只读展示，不做回滚。

## 6. 后端服务、鉴权、审核、评分、发布或榜单逻辑

### 鉴权

- 新增自定义 `JwtAuthGuard`，读取 `Authorization: Bearer <token>`。
- 使用现有 `JwtService` 和 `JWT_SECRET` 校验 token。
- 将 `{ userId, email }` 挂到 request，供控制器读取。
- 保护 AI 生成和草稿接口。

### AI Gateway

- `AiGatewayController` 接收创作输入。
- `AiGatewayService.generateArticleDraft` 继续使用 mock 生成，补齐 `bodyText` 和 ProseMirror JSON。
- 暂不在前端拼 Prompt，不暴露模型配置。

### 草稿服务

- `DraftsService.createDraft`：创建草稿和初始版本。
- `DraftsService.listMine`：按更新时间倒序返回当前用户草稿。
- `DraftsService.getMineById`：校验归属后返回详情。
- `DraftsService.updateDraft`：校验归属、更新当前态、追加版本。
- `DraftsService.listVersions`：返回版本列表。

### 审核、评分、发布、榜单

- 本阶段不实现发布前审核、质量评分、文章发布和榜单排序。
- 草稿状态保持 `DRAFT`，不会绕过后续发布强审核流程。
- 后续开发发布模块时，再从草稿进入 `audit -> scoring -> publish` 链路。

## 7. 风险、边界情况和回滚方案

| 风险 | 处理 |
| --- | --- |
| 用户未登录访问工作台接口 | 返回 401，前端提示登录 |
| token 过期或格式错误 | 清理本地登录态并引导重新登录 |
| AI mock 返回内容过短 | 前端仍允许编辑，后续评分阶段再处理质量问题 |
| 自动保存频繁产生版本 | MVP 先按保存追加版本；后续可引入最小间隔或手动版本快照 |
| TipTap SSR 不兼容 | 编辑器组件使用 client component 动态渲染 |
| 断网导致草稿丢失 | localStorage 暂存未同步内容，恢复后人工确认覆盖 |
| 草稿归属校验遗漏 | 所有详情、更新、版本接口都带 `authorId` 条件 |

回滚方案：

- 后端变更集中在 AI 控制器、草稿模块和鉴权工具，删除这些文件并恢复模块引用即可回退。
- 前端新增草稿页面和编辑器，若编辑器阻塞，可以保留工作台和草稿列表，暂时用纯文本编辑兜底。
- 不修改 Prisma schema，避免数据库迁移回滚成本。

## 8. 验证方式和测试计划

### 自动检查

- `corepack pnpm -r typecheck`
- `corepack pnpm --filter @bytecamp-aigc/web build`
- `corepack pnpm --filter @bytecamp-aigc/api build`

说明：当前环境 PATH 中没有裸 `pnpm`，已验证 `corepack pnpm -r typecheck` 可以正常运行。

### 手动验证

1. 使用演示账号登录。
2. 首页显示内容信息流，不显示创作编辑器。
3. hover 首页右上角用户名称，出现“工作台”“草稿箱”和“退出登录”入口。
4. 点击“工作台”进入 `/workspace`，显示创作表单和当前用户信息。
5. 输入主题、受众、风格后生成标题、大纲和正文。
6. 保存为草稿并跳转到编辑页。
7. 修改标题或正文，点击手动保存，版本号递增。
8. 等待自动保存触发，确认保存状态变化。
9. 返回我的草稿列表，草稿标题、版本号、更新时间正确。
10. 点击“退出登录”，确认本地登录态被清理，首页恢复登录入口。
11. 使用无 token 或错误 token 请求草稿接口，确认返回 401。

## 9. 与总体架构的一致性

- `apps/web` 只负责 UI、路由、编辑器交互、前端状态和本地临时缓存。
- `apps/api` 负责 JWT 校验、AI mock 编排、草稿持久化和版本记录。
- `packages/shared` 承载前后端共享 DTO、枚举和 ProseMirror 文档类型。
- AI 密钥、审核裁决、质量评分、发布状态和榜单排序仍保留在后端，且本阶段不提前迁移到前端。
