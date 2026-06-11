# 真实模型能力接入技术方案

## 1. 功能目标和用户价值

本阶段承接已经完成的创作工作台、草稿、审核评分、发布和分发链路，优先把当前 `AiGatewayService` 的 mock 文章生成升级为可配置的真实模型调用能力。

当前用户在工作台点击“AI 生成初稿”时，后端返回固定模板内容。引入模型能力后，用户输入的主题、受众和风格会真正进入后端 AI Gateway，由 OpenAI-compatible 模型生成标题、大纲和正文，再返回给前端保存为草稿。

用户价值：

- 创作者得到更贴合主题和风格的动态内容，而不是固定演示文本。
- 项目演示能展示真实 AIGC 能力，符合 PRD 中“AI 辅助生产”的核心定位。
- 模型密钥、base URL、模型名和 Prompt 编排由服务端统一保障，前端专注创作体验与流式状态展示。
- 本地没有模型密钥时仍可使用 mock 模式完成开发、测试和演示，不阻塞初学者搭建全栈链路。

## 2. 范围选择

### 推荐方案：只接入文章生成的真实模型能力

本阶段实现：

- `POST /ai/generate-article` 接入 OpenAI-compatible Chat Completions。
- 使用 `AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL` 配置火山方舟、豆包或其他兼容供应商。
- 新增 `AI_PROVIDER_MODE=auto | mock | live` 控制模型模式。
- 从 Prompt 数据或后端默认模板组装系统提示词和用户提示词。
- 要求模型返回结构化 JSON：`title`、`outline`、`bodyText`。
- 后端解析模型输出，转换为现有 `GeneratedArticleDraft` 和 ProseMirror JSON。
- 模型不可用、超时、JSON 解析失败时返回可解释错误，前端沿用现有错误展示和重试入口。
- 无密钥或显式 mock 模式下继续使用当前 mock 结果，保证本地开发稳定。

优点：

- 直接补齐 PRD 的 P0 “主题生成文章”能力。
- API 契约保持稳定，前端和草稿模块不需要重写。
- 风险集中在 `apps/api/src/ai-gateway`，不会影响审核、评分、发布、榜单等已完成闭环。
- 后续可以在同一网关上继续扩展标题优化、正文改写、一键合规改写和 AI 审核。

代价：

- 需要处理模型输出不稳定、网络超时和供应商兼容差异。
- 真实模型调用无法在 CI 中依赖外部网络和密钥，因此测试必须通过 fake client 或 mock provider 完成。

### 备选方案 A：一次性把生成、审核、评分和改写都接入模型

优点：

- AI 能力覆盖更完整，演示效果更强。

代价：

- 审核裁决和质量评分会从确定性逻辑变成模型输出，测试稳定性下降。
- 发布链路会同时承担模型生成、审核、评分和发布风险，改动面过大。
- 审核和评分规则已经有可解释实现，本阶段不应破坏稳定闭环。

### 备选方案 B：只在前端直接调用模型 API

优点：

- 实现看似更快。

代价：

- 会把模型密钥暴露到浏览器，违反架构和 AGENTS.md 的模块边界。
- Prompt、重试、降级、日志和安全策略散落在前端，不利于后续审核和评分扩展。
- 本方案不采用。

本阶段采用推荐方案。审核、评分、榜单排序和发布裁决仍由后端现有服务负责，不把这些职责迁移到前端或一次性交给模型。

## 3. 涉及模块

### 前端 `apps/web`

- 工作台 `/workspace`：继续调用 `POST /ai/generate-article`，不接触模型密钥。
- 错误展示：复用当前 `AI 生成失败，请稍后重试。` 状态，并根据后端 message 展示更具体原因。
- 不新增直接模型调用，不新增前端环境变量。

### 后端 `apps/api`

- `ai-gateway`：新增真实 provider client、Prompt 渲染、结构化解析、超时和错误映射。
- `prompts`：补齐轻量 Prompt 查询服务，让文章生成优先使用平台 Prompt 数据。
- `prisma`：只读取现有 `prompts` 表，不修改 schema。
- `config`：读取 AI provider 相关环境变量。

### 共享包 `packages/shared`

- 复用现有 `GenerateArticleInput`、`GeneratedArticleDraft`、`RichTextDocument`。
- 本阶段默认不改 API DTO，避免前端和草稿模块联动修改。
- 如实现时发现需要暴露模型调用状态，仅增加向后兼容字段，例如 `provider?: "mock" | "live"`，不得破坏现有字段。

## 4. 需要新增或修改的文件

### 新增文件

- `apps/api/src/ai-gateway/ai-provider.client.ts`
- `apps/api/src/ai-gateway/ai-gateway.prompts.ts`
- `apps/api/src/ai-gateway/ai-gateway.errors.ts`
- `apps/api/src/prompts/prompts.service.ts`
- `docs/learn/007-model-provider-integration-learning.md`（实现完成后生成，本地学习文档，不上传 GitHub）

### 修改文件

- `apps/api/src/ai-gateway/ai-gateway.service.ts`
- `apps/api/src/ai-gateway/ai-gateway.service.spec.ts`
- `apps/api/src/ai-gateway/ai-gateway.module.ts`
- `apps/api/src/prompts/prompts.module.ts`
- `apps/api/prisma/seed.ts`
- `.env.example`
- `README.md`

### 暂不修改

- `apps/web/src/app/workspace/page.tsx` 的页面结构和主要样式。
- `apps/api/prisma/schema.prisma`
- `apps/api/src/audit/**`
- `apps/api/src/scoring/**`
- `apps/api/src/publish/**`
- `apps/api/src/feed/**`
- `apps/api/src/ranking/**`

## 5. 数据模型或 API 变更

### 数据模型

本阶段不修改 Prisma schema，复用现有 `prompts` 表。

原因：

- 架构已经定义 Prompt 是数据。
- `seed.ts` 已经写入 `platform-news-starter` 平台 Prompt。
- 当前只需要读取平台 Prompt，不需要增加用户私有 Prompt、版本、审核或发布模型。

### 环境变量

在 `.env.example` 中补充或明确：

```text
# mock: 永远使用本地 mock；live: 必须调用真实模型；auto: 有可用密钥和模型时走 live，否则走 mock
AI_PROVIDER_MODE=auto

# OpenAI-compatible provider
AI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
AI_API_KEY=replace-with-your-key
AI_MODEL=replace-with-your-model

# AI request controls
AI_TIMEOUT_MS=60000
AI_MAX_RETRIES=1
```

模式规则：

- `mock`：始终返回本地 mock 内容，用于无网络、无密钥或课堂演示兜底。
- `live`：必须配置有效 `AI_API_KEY` 和 `AI_MODEL`，否则返回 503 配置错误。
- `auto`：默认模式；当 key/model 缺失或仍是 `replace-with-*` 占位值时使用 mock，否则使用真实模型。

### API 契约

`POST /ai/generate-article` 请求保持不变：

```json
{
  "topic": "AI 如何改变内容创作",
  "audience": "内容创作者",
  "style": "科普"
}
```

响应保持兼容：

```json
{
  "model": "doubao-seed-1-6",
  "title": "AI 如何改变内容创作：从效率工具到生产闭环",
  "outline": ["趋势背景", "创作链路", "人机协作", "风险边界", "行动建议"],
  "bodyText": "正文纯文本，段落之间用空行分隔。",
  "body": {
    "type": "doc",
    "content": []
  }
}
```

错误响应由 NestJS 标准异常返回：

- 400：主题为空或输入格式错误。
- 503：`live` 模式缺少模型配置。
- 502：模型服务返回异常或输出不是可解析 JSON。
- 504：模型请求超时。

## 6. 前端交互与页面状态设计

工作台页面不新增复杂 UI，保持当前今日头条发布页风格。

状态延续：

- `idle`：可输入主题、受众和风格。
- `generating`：请求后端模型生成中，按钮禁用并展示“生成中...”。
- `generated`：展示模型生成的标题、大纲和正文，允许保存草稿。
- `error`：展示后端错误 message，例如“模型服务暂时不可用，请稍后重试”或“AI 配置缺失，请检查后端环境变量”。

交互规则：

- 前端仍只调用 `apiFetch("/ai/generate-article")`。
- 不在浏览器端拼接 provider URL、API key 或系统 Prompt。
- 不在前端解析模型原始输出，只展示后端已经结构化后的结果。
- 生成失败不清空用户输入，方便用户重试或调整主题。
- 如果后端处于 mock 模式，前端无需特殊处理；`model` 字段会展示 mock 或真实模型名。

## 7. 后端服务、鉴权、审核、评分、发布或榜单逻辑

### AI Gateway 服务

`AiGatewayService.generateArticleDraft()` 调整为：

```text
读取 provider mode
  -> mock 模式或 auto 缺少配置：返回 mock draft
  -> live 模式或 auto 配置完整：调用真实模型
      -> 读取平台 Prompt
      -> 组装 messages
      -> 请求 OpenAI-compatible Chat Completions
      -> 解析 JSON
      -> 转换为 GeneratedArticleDraft
```

Prompt 约束：

- system prompt：定义模型角色、输出质量和安全边界。
- user prompt：包含 `topic`、`audience`、`style`，要求返回中文内容。
- 输出格式必须是 JSON object，不允许 Markdown 代码块。
- JSON 字段为：
  - `title: string`
  - `outline: string[]`
  - `bodyText: string`

### AI Provider Client

新增 `AiProviderClient`，负责：

- 根据 `AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL` 创建 OpenAI SDK client。
- 设置 `AI_TIMEOUT_MS` 和 `AI_MAX_RETRIES`。
- 发送 Chat Completions 请求。
- 返回模型原始文本和实际模型名。
- 将 SDK、网络、超时错误转换为项目内部错误类型。

不在 controller 中直接使用 OpenAI SDK，保持 controller 只负责 HTTP 输入输出。

### Prompts 服务

新增 `PromptsService`：

- 从 `prompts` 表读取 `category = "article_generation"` 且 `owner = "PLATFORM"` 的 starter prompt。
- 找不到数据库 Prompt 时使用后端默认 Prompt 兜底，并在学习文档中解释这是本地开发兜底，不是长期最佳实践。
- 后续 Prompt 模板 UI、用户私有 Prompt 可以复用该服务继续扩展。

### 鉴权

- `POST /ai/generate-article` 继续使用 `JwtAuthGuard`。
- 未登录用户不能调用模型，避免开放接口被滥用。
- 本阶段不新增按用户限流；后续可结合 Redis 增加 `ai:rate:{userId}`。

### 审核、评分、发布和榜单

本阶段不改变这些模块。

- 真实模型生成出的内容仍然要保存为草稿后进入审核、评分和发布流程。
- 审核和评分仍由后端现有确定性服务执行，避免模型生成绕过发布强约束。
- 榜单排序不受模型调用方式影响，只读取已发布文章、质量分和互动数据。

## 8. 风险、边界情况和回滚方案

| 风险                        | 处理                                                                |
| --------------------------- | ------------------------------------------------------------------- |
| 本地没有模型密钥            | `AI_PROVIDER_MODE=auto` 时自动走 mock；`live` 模式返回清晰配置错误  |
| 模型输出 Markdown 或非 JSON | 后端剥离常见代码块后解析；仍失败则返回 502，不保存草稿              |
| 模型返回字段缺失            | 后端校验 `title`、`outline`、`bodyText`，缺失则返回 502             |
| 模型请求超时                | 使用 `AI_TIMEOUT_MS`，超时返回 504，前端保留输入便于重试            |
| 供应商 base URL 不兼容      | 将 OpenAI SDK 初始化集中在 `AiProviderClient`，后续只改客户端适配层 |
| 真实模型生成高风险内容      | 不在生成阶段发布，必须经过草稿保存后的审核和评分                    |
| Prompt 表未 seed            | 使用默认 Prompt 兜底，并保持 seed 可重复写入平台 Prompt             |
| CI 无外部网络和密钥         | 单元测试使用 fake provider client，不访问真实模型                   |
| 用户以为 mock 就是真模型    | README 和学习文档明确说明三种 provider mode                         |

回滚方案：

- 将 `AiGatewayService.generateArticleDraft()` 恢复为当前 mock 实现。
- 删除 `ai-provider.client.ts`、`ai-gateway.prompts.ts`、`ai-gateway.errors.ts`。
- `PromptsModule` 恢复为空模块。
- `.env.example` 移除新增 AI 控制变量。
- 不涉及数据库迁移，回滚无需处理 schema。

## 9. 验证方式和测试计划

### 单元测试

`apps/api/src/ai-gateway/ai-gateway.service.spec.ts` 增加：

- mock 模式返回稳定内容，且 `body` 为合法 ProseMirror JSON。
- auto 模式在 key/model 缺失或为占位值时走 mock。
- live 模式缺少 key/model 时抛出 503 类错误。
- fake provider 返回合法 JSON 时，服务能解析为 `GeneratedArticleDraft`。
- fake provider 返回 Markdown 代码块包裹的 JSON 时，服务能解析。
- fake provider 返回非 JSON 或缺字段时，服务返回可解释错误。
- provider 超时时映射为 504 类错误。

### 类型检查

```bash
pnpm typecheck
```

如当前环境没有裸 `pnpm`，使用：

```bash
corepack pnpm -r typecheck
```

### 后端构建

因为会新增 provider client、Prompt service 和错误类型，运行：

```bash
pnpm --filter @bytecamp-aigc/api build
```

如需要 `corepack`：

```bash
corepack pnpm --filter @bytecamp-aigc/api build
```

### 手动验证：mock 模式

1. `.env` 设置 `AI_PROVIDER_MODE=mock`。
2. 启动 API 和 Web。
3. 使用演示账号登录。
4. 进入 `/workspace`，输入主题并生成文章。
5. 确认页面展示 mock 生成内容，保存草稿正常。

### 手动验证：auto 无密钥

1. `.env` 设置 `AI_PROVIDER_MODE=auto`，保持 `AI_API_KEY=replace-with-your-key`。
2. 生成文章。
3. 确认后端自动降级为 mock，不阻塞本地开发。

### 手动验证：live 模式

1. `.env` 设置真实：

```text
AI_PROVIDER_MODE=live
AI_BASE_URL=<OpenAI-compatible base url>
AI_API_KEY=<真实 key>
AI_MODEL=<真实模型名>
```

2. 启动 API 和 Web。
3. 在 `/workspace` 输入一个新主题，例如“普通人如何用 AI 建立稳定写作流程”。
4. 点击“AI 生成初稿”。
5. 确认返回内容不再是固定 mock 文案，标题、大纲和正文与主题高度相关。
6. 保存草稿并进入编辑页，确认草稿正文是结构化 JSON。
7. 点击发布，确认仍然经过审核和评分。

### 错误验证

- `AI_PROVIDER_MODE=live` 且不配置 key：生成接口返回配置错误。
- 将 `AI_TIMEOUT_MS` 设置为极小值：生成接口返回超时错误。
- fake provider 返回非 JSON：单测断言服务返回可解释错误。

## 10. 与总体架构的一致性

- `apps/web` 只负责输入、状态反馈和展示结构化生成结果。
- `apps/api` 负责模型供应商配置、SDK 调用、Prompt 编排、错误映射和结构化解析。
- `packages/shared` 继续承载前后端共享 DTO 和富文本 JSON 类型。
- AI 密钥不会进入前端，也不会写入 Git。
- 审核裁决、质量评分、发布和榜单排序仍保留在后端，不被真实模型生成绕过。
- 页面主体样式仍用 Tailwind utility class，保持当前工具型工作台风格。

## 11. 实现完成后的学习文档

实现完成后，根据 `AGENTS.md` 生成：

```text
docs/learn/007-model-provider-integration-learning.md
```

学习文档面向第一次做全栈应用的初学者，重点解释：

- 为什么模型调用必须放在后端，而不是前端。
- 用户从工作台点击生成，到后端读取环境变量、组装 Prompt、调用模型、解析 JSON、返回页面的完整链路。
- `AiGatewayController`、`AiGatewayService`、`AiProviderClient`、`PromptsService` 分别承担什么责任。
- `AI_PROVIDER_MODE`、`AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL` 的作用。
- mock、auto、live 三种模式分别适合什么场景。
- 为什么真实模型生成后仍然必须经过草稿、审核、评分和发布流程。
- 成功路径和失败路径分别发生什么。
- 如何通过单元测试、页面生成、草稿保存、发布审核和构建命令验证模型能力正确。
- 常见误区：前端暴露 key、相信模型一定返回 JSON、把模型失败静默伪装成成功、不保留 mock 模式、让生成内容绕过审核。

## 12. Doubao chat completions format update

根据本地 `豆包模型接口.docx` 和用户确认后的接口地址，真实模型请求不再通过 OpenAI SDK 自动组装，而是在后端显式使用豆包 Chat Completions 格式：

- 请求地址：`https://ark.cn-beijing.volces.com/api/v3/chat/completions`
- 请求 body：`model`、`messages`、`stream: true`、`stream_options.include_usage: true`
- 返回格式：按行读取流式 JSON chunk，只拼接 `choices[].delta.content`，忽略 `reasoning_content`、usage chunk 和 `[DONE]`

新增 `apps/api/src/ai-gateway/doubao-chat-format.ts` 专门负责：

- 根据 `AI_BASE_URL` 拼出 `/chat/completions` 完整 URL。
- 生成豆包请求 body，确保中文 prompt 作为 UTF-8 JSON 字符串发送。
- 解析豆包流式返回，把多个 chunk 合并为后续业务层可解析的文章 JSON 文本。

`AiProviderClient` 只负责调用该格式文件、设置鉴权 header、处理超时和 provider 错误，不再把豆包协议细节散落到 `AiGatewayService`。
