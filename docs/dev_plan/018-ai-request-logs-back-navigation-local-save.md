# AI 请求日志、文章返回和编辑本地保存技术方案

## 1. 功能目标和用户价值

本轮开发覆盖三项小而关键的体验与可观测性改进：

1. 后端记录 AI 请求日志，至少包含 `requestId`、模型、耗时、token、状态，方便确认模型链路是否跑通、定位失败请求和估算调用成本。
2. 已发布文章详情页的返回箭头不再固定跳首页，只返回浏览器上一页；其他页面路由控制保持不变。
3. 创作工作台和草稿编辑页增加本地即时保存能力，避免刷新页面后编辑内容丢失。草稿编辑页在本地即时保存基础上继续做服务端自动保存。

用户价值：

- 调试模型审核、生成、评分和改写时，不再只能看前端现象，可以通过后端日志追踪每次 AI 调用。
- 从榜单、创作者主页、草稿发布流程进入文章详情后，点击返回能回到原上下文，阅读路径更自然。
- 用户在创作工作台或草稿编辑页输入后即使刷新、误关页面、短暂断网，也能恢复最近编辑内容。

本轮按用户要求先写技术方案，方案确认后再进入代码开发。

## 2. 涉及模块

### 前端 `apps/web`

- `apps/web/src/app/articles/[id]/page.tsx`
  - 将文章详情页左上角返回箭头从 `Link href="/"` 调整为当前页面内的返回操作。
- `apps/web/src/app/workspace/page.tsx`
  - 创作工作台增加本地草稿状态读取、写入、清理和保存状态提示。
  - 保存草稿成功后清理工作台本地缓存。
- `apps/web/src/app/drafts/[id]/page.tsx`
  - 草稿标题和正文一发生变化即写入本地快照。
  - 服务端保存由当前 30 秒轮询式自动保存升级为编辑后的防抖自动保存。
- `apps/web/src/lib/draft-offline-state.ts`
  - 扩展草稿本地快照原因，支持普通编辑中的本地即时保存。
- `apps/web/src/lib/workspace-local-draft-state.ts`
  - 新增工作台本地保存 helper，统一 localStorage key、读写、清理、异常吞掉策略。

### 后端 `apps/api`

- `apps/api/src/ai-gateway/ai-gateway.service.ts`
  - 为文章生成、标题优化、正文改写、合规改写、内容审核、质量评分统一包一层 AI 请求日志。
- `apps/api/src/ai-gateway/ai-provider.client.ts`
  - 解析 provider 返回中的 token usage，并把 usage 传回 `AiGatewayService`。
- `apps/api/src/ai-gateway/doubao-chat-format.ts`
  - 扩展豆包流式响应解析，保留正文 delta 的同时识别 usage chunk。
- `apps/api/src/ai-gateway/ai-gateway.module.ts`
  - 如采用独立日志服务，则注册 `AiRequestLoggerService`。

### 共享包 `packages/shared`

- 预计不需要新增业务 DTO。
- 如果最终决定在 SSE `meta` 事件中透出 `requestId`，只扩展 `AiStreamEvent` 的 `meta.data`，不改变现有前端消费逻辑。

## 3. 需要新增或修改的文件

新增：

- `docs/dev_plan/018-ai-request-logs-back-navigation-local-save.md`
- `apps/api/src/ai-gateway/ai-request-log.ts`
- `apps/web/src/lib/workspace-local-draft-state.ts`
- `apps/web/src/lib/workspace-local-draft-state.test.ts`

修改：

- `apps/api/src/ai-gateway/ai-gateway.service.ts`
- `apps/api/src/ai-gateway/ai-provider.client.ts`
- `apps/api/src/ai-gateway/doubao-chat-format.ts`
- `apps/api/src/ai-gateway/doubao-chat-format.spec.ts`
- `apps/api/src/ai-gateway/ai-provider.client.spec.ts`
- `apps/api/src/ai-gateway/ai-gateway.service.spec.ts`
- `apps/web/src/app/articles/[id]/page.tsx`
- `apps/web/src/app/workspace/page.tsx`
- `apps/web/src/app/drafts/[id]/page.tsx`
- `apps/web/src/lib/draft-offline-state.ts`
- `apps/web/src/lib/draft-offline-state.test.ts`

实现完成后按项目规则新增学习复盘：

- `docs/learn/018-ai-request-logs-back-navigation-local-save-learning.md`

## 4. 数据模型或 API 变更

### 数据模型

本轮不新增 Prisma 表，不做数据库迁移。

AI 请求日志先使用 Nest `Logger` 输出结构化 JSON 到服务端日志，避免为了训练营 MVP 引入新的日志表、查询页和清理策略。后续如果需要运营后台检索日志，再单独设计 `AiRequestLog` 表和分页接口。

### 后端日志字段

每次 AI 调用输出一条完成日志：

```ts
interface AiRequestLogPayload {
  requestId: string;
  feature:
    | "article_generation"
    | "title_optimization"
    | "article_rewrite"
    | "compliance_rewrite"
    | "content_audit"
    | "quality_scoring";
  providerMode: "mock" | "live";
  model: string;
  durationMs: number;
  tokenUsage: {
    totalTokens: number | null;
    promptTokens?: number | null;
    completionTokens?: number | null;
  };
  status: "success" | "error";
  errorCode?: string;
}
```

约束：

- 不记录 prompt 原文、正文全文、用户隐私或 API key。
- mock 链路也记录日志，`providerMode` 为 `mock`，`tokenUsage.totalTokens` 为 `null`。
- provider 没有返回 usage 时，token 记为 `null`，不能用字符数假装 token。
- 流式接口只在流结束或抛错时记录一次日志。

### Provider usage 解析

豆包请求已经携带：

```ts
stream_options: {
  include_usage: true;
}
```

本轮会把 usage chunk 从流里解析出来。优先兼容：

- `usage.total_tokens`
- `usage.prompt_tokens`
- `usage.completion_tokens`
- `bot_usage.model_usage[0].total_tokens`

### 前端本地存储

工作台新增 localStorage key：

```text
aigc_workspace_local_draft
```

保存内容包括：

```ts
interface WorkspaceLocalDraftState {
  topic: string;
  audience: string;
  style: string;
  selectedPromptId: string;
  draftTitle: string;
  generated: GeneratedArticleDraft | null;
  localUpdatedAt: string;
}
```

草稿编辑页继续使用现有按 draftId 区分的 key：

```text
aigc_draft_offline_${draftId}
```

并新增快照原因：

```ts
type DraftOfflineSaveReason =
  | "local_edit"
  | "offline"
  | "save_failed"
  | "sync_failed";
```

## 5. 前端交互与页面状态设计

### 已发布文章详情页返回

- 仅修改 `apps/web/src/app/articles/[id]/page.tsx`。
- 返回箭头视觉保持不变，语义改为当前页内的 `button`，点击执行 `router.back()`。
- `aria-label` 从“返回首页”改为“返回上一页”。
- 不改首页、榜单、创作者主页、草稿箱、发布页等其他路由行为。

说明：Next.js `Link` 适合跳固定地址，但“上一页”来自浏览器 history，实际应使用 `router.back()`。为了满足用户看到的交互仍像返回链接，样式保持当前箭头链接样式。

### 创作工作台本地保存

- 页面初次加载时读取 `aigc_workspace_local_draft`。
- 如果 URL 上带 `topic` 参数，URL 主题优先覆盖本地保存的 `topic`，其他字段仍可从本地恢复。
- 用户修改主题、受众、风格、Prompt、生成标题、生成正文、手动编辑正文后，立即写入 localStorage。
- 页面底部或工具栏增加轻量状态文案，例如“已本地保存 14:32”，不阻塞创作。
- 点击“保存草稿”成功后清理工作台本地缓存，避免下次进入工作台误恢复已保存内容。
- localStorage 不可用时吞掉异常，页面仍可正常编辑，只是不提供本地恢复。

### 草稿编辑页即时保存

- 保留现有离线快照机制和冲突判断。
- 标题或正文一变化，立即写入对应 draftId 的本地快照，原因标记为 `local_edit`。
- 服务端自动保存改为编辑停止后的短防抖触发，建议 1500ms 左右；防止每个按键都打 PATCH。
- 当前 30 秒定时自动保存可以保留为兜底，也可以改成只在 dirty 状态下做兜底保存。
- 服务端保存成功后清理本地快照，并更新草稿版本、更新时间和版本列表。
- 服务端保存失败、离线或同步失败时，沿用现有本地快照和恢复提示。
- 页面刷新后如果本地快照比服务器内容新且无冲突，优先恢复本地编辑内容；如果存在版本冲突，则继续让用户确认是否同步本地内容。

### Zustand 取舍

用户提到“可用 zustand 将该项目所有 props 做优化”。当前仓库未引入 `zustand` 依赖，本轮需求的核心风险是数据丢失和日志可观测性，不适合顺手做全项目状态迁移。

本轮计划：

- 不新增 `zustand` 依赖。
- 不做全项目 props 重构。
- 通过局部 localStorage helper 和页面内状态整理完成当前目标。

如果后续工作台状态继续膨胀，再单独设计 Zustand store，把“创作输入、AI 生成态、资产面板、保存状态”拆到可测试 store 中。

## 6. 后端服务、鉴权、审核、评分、发布或榜单逻辑

### AI 请求日志范围

统一覆盖以下 `AiGatewayService` 能力：

- `generateArticleDraft`
- `streamArticleDraft`
- `streamTitleOptimization`
- `streamRewrite`
- `streamComplianceRewrite`
- `auditContent`
- `scoreArticleQuality`

### 日志实现方式

- 新增 `ai-request-log.ts`，封装：
  - `createAiRequestId()`
  - `createInitialAiRequestMetric()`
  - `finishAiRequestMetric()`
  - `logAiRequestMetric()`
- `AiGatewayService` 在每个 AI 入口创建 requestId 和开始时间。
- mock 与 live 都走同一套日志 wrapper。
- 成功时记录 `status: "success"`。
- 捕获异常后先记录 `status: "error"` 和错误类型，再继续抛出原异常，让现有错误映射保持不变。

### 流式调用处理

- 流式方法返回 async generator，日志 wrapper 包住整个 generator。
- 当 generator 正常结束时记录成功日志。
- 当 provider 或业务解析抛错时记录失败日志。
- 前端 SSE 协议不要求展示 requestId；如实现时变动很小，可在 `meta` 事件中附带 requestId，便于浏览器网络面板和后端日志对齐。

### 鉴权、审核、评分、发布、榜单

- 本轮不改变鉴权边界。
- 审核、评分、发布仍由后端负责，前端不迁移任何裁决逻辑。
- 榜单排序不变。
- AI 日志只观测 `AiGatewayService` 层，不影响审核结论、评分结果、发布状态和榜单数据。

## 7. 风险、边界情况和回滚方案

| 风险 | 处理 |
| --- | --- |
| provider usage 字段不稳定 | 支持多种 usage 结构，拿不到就记 `null` |
| 流式请求中途报错 | generator wrapper 记录 `error` 后继续抛错，保持前端现有错误提示 |
| 日志泄露正文或 prompt | 日志 payload 只允许记录元数据，不记录用户输入正文 |
| 本地保存覆盖 URL 预填主题 | URL `topic` 优先级高于本地 topic |
| localStorage 容量或权限异常 | helper 内 try/catch，失败不影响编辑 |
| 草稿本地快照和服务器版本冲突 | 复用现有 conflict 判断，需要用户确认同步 |
| 服务端自动保存过于频繁 | 本地即时保存，服务端防抖保存，不做每按键一次 PATCH |
| `router.back()` 无历史记录时没有明显跳转 | 这是浏览器上一页语义；本轮不改其他页面路由，也不引入全局 fallback |
| 引入 Zustand 造成大范围回归 | 本轮不引入 Zustand，不做全项目状态迁移 |

回滚方案：

- AI 日志可删除 wrapper 或只关闭 `logAiRequestMetric()` 调用，不影响业务输出。
- 文章详情页返回按钮可恢复为 `Link href="/"`。
- 工作台本地保存可移除 helper 调用；草稿编辑页可恢复为当前 30 秒自动保存和失败快照机制。

## 8. 验证方式和测试计划

### 单元测试

后端：

- `apps/api/src/ai-gateway/doubao-chat-format.spec.ts`
  - 能解析正文 delta。
  - 能解析 `usage.total_tokens`。
  - 能解析 `bot_usage.model_usage[0].total_tokens`。
  - `[DONE]` 和空行不会造成异常。
- `apps/api/src/ai-gateway/ai-provider.client.spec.ts`
  - provider completion 返回内容和 usage。
  - provider 没有 usage 时返回 `null`。
- `apps/api/src/ai-gateway/ai-gateway.service.spec.ts`
  - mock 生成记录成功日志。
  - live provider 成功记录模型、耗时、token 和状态。
  - provider 抛错时记录失败日志且原错误继续抛出。

前端：

- `apps/web/src/lib/workspace-local-draft-state.test.ts`
  - 工作台状态可写入、读取、清理。
  - malformed JSON 返回 `null`。
  - storage 抛错时不影响调用方。
- `apps/web/src/lib/draft-offline-state.test.ts`
  - 支持 `local_edit` 原因。
  - `local_edit` 的状态文案正确。
  - legacy 快照仍能兼容。

### 类型检查和构建

需要运行：

```bash
corepack pnpm --filter @bytecamp-aigc/api test
corepack pnpm --filter @bytecamp-aigc/web test
corepack pnpm typecheck
corepack pnpm --filter @bytecamp-aigc/web build
```

如果只改服务端日志和前端页面，不涉及 Prisma schema，本轮不运行迁移。

### 手动验证

1. 启动 API 和 Web。
2. 在 `AI_PROVIDER_MODE=mock` 下生成文章，确认后端日志有 requestId、model、durationMs、status，token 为 `null`。
3. 在真实模型环境下生成文章、标题优化、正文改写、审核和评分，确认日志状态为 success，能拿到 provider 返回的 token 时 token 不为空。
4. 故意配置错误 API key 或模型名，确认日志状态为 error，前端仍显示现有错误提示。
5. 从首页或创作者主页进入文章详情，点击左上角返回箭头，确认回到上一页。
6. 在工作台输入主题、生成正文、修改标题，直接刷新页面，确认内容恢复。
7. 工作台保存为草稿成功后重新进入工作台，确认不会误恢复刚才已保存内容。
8. 在草稿编辑页修改标题或正文，立刻刷新页面，确认最新输入仍在。
9. 草稿编辑页停止输入后等待防抖保存，确认服务器草稿更新时间和版本状态正常。

## 9. 初学者学习文档计划

实现完成后生成：

```text
docs/learn/018-ai-request-logs-back-navigation-local-save-learning.md
```

学习文档会解释：

- 为什么 AI 调用要记录 requestId、耗时、模型、token 和状态。
- 为什么日志不能记录正文全文、prompt 和密钥。
- mock 和 live 模型链路的区别。
- 流式接口为什么要在 generator 结束时才记录一次日志。
- Next.js 中固定跳转 `Link` 和浏览器上一页 `router.back()` 的区别。
- localStorage 适合解决什么问题，不适合当成数据库的原因。
- 工作台本地保存和草稿服务端保存分别承担什么责任。
- 防抖保存为什么比每个按键都请求后端更稳。
- 如何用页面刷新、接口日志、类型检查和测试验证功能正确。
