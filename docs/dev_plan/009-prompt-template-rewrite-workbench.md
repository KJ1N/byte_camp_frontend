# Prompt 模板、标题优化与正文改写工作台增强技术方案

## 1. 功能目标和用户价值

本阶段承接已经完成的 AI 生成、草稿保存、富文本编辑、审核评分、发布和分发链路，补齐 PRD 中 AI 内容创作 P0 范围里仍缺失的三类能力：

```text
选择 Prompt 模板 -> 生成文章初稿 -> 优化标题 -> 改写正文片段 -> 保存草稿 -> 继续编辑/发布审核
```

用户价值：

- 新手创作者不只输入主题，还可以选择平台预置模板，快速得到更贴近场景的文章初稿。
- 熟练创作者可以在生成后继续让 AI 产出多个标题候选，降低标题打磨成本。
- 草稿编辑前或编辑中可以对正文做润色、扩写、缩写和风格转换，提升二次编辑效率。
- Prompt、标题优化和正文改写都通过后端 AI Gateway 编排，避免把模型密钥、Prompt 策略和解析逻辑散落到前端。
- 本阶段先做平台只读模板和 AI 辅助改写闭环，不引入复杂个人 Prompt 管理页面，保持 MVP 范围可控。

## 2. 下一步范围选择

### 推荐方案：Prompt 模板选择 + 标题优化 + 正文改写

本阶段实现：

- 新增 `GET /prompts`，返回当前用户可使用的平台 Prompt 模板列表。
- 工作台 `/workspace` 增加 Prompt 模板选择区域，生成文章时携带 `promptId`。
- `POST /ai/generate-article/stream` 支持按 `promptId` 读取平台模板，并以 SSE 流式返回标题、大纲和正文片段；未传时继续使用 starter prompt 或默认 prompt。
- 新增 `POST /ai/optimize-titles/stream`，根据主题、受众、风格和当前标题流式生成多个标题候选。
- 新增 `POST /ai/rewrite/stream`，支持润色、扩写、缩写、风格转换四类正文改写，并流式返回改写文本和建议。
- 工作台右侧 AI 助手面板增加“标题优化 / 正文改写”交互，所有模型生成文本都逐块渲染，不直接绕过草稿保存和发布审核。
- 实现完成后补充 `docs/learn/009-prompt-template-rewrite-workbench-learning.md`，用初学者能理解的话解释完整链路。

优点：

- 直接补齐 PRD 中 AI 创作 P0 的 Prompt 模板、标题优化和正文改写能力。
- 复用现有 `Prompt` Prisma 模型、`PromptsService`、`AiGatewayService` 和工作台视觉结构，改动集中。
- 能形成适合演示的闭环：选择模板 -> 生成初稿 -> 选标题 -> 改写正文 -> 保存草稿。

代价：

- 需要新增多组 DTO、Prompt 构造、AI JSON 解析、mock 降级和工作台状态。
- 工作台页面已经较大，需要谨慎拆分少量 helper，避免单文件继续膨胀。

### 备选方案 A：只做 Prompt 模板列表与选择

优点：

- 改动最小，能快速让已有 `prompts` 模块从内部服务变成可见功能。

代价：

- 标题优化和正文改写仍缺失，AI 创作链路增强有限。
- 用户生成后仍只能手工编辑，不能体现“AI 辅助二次优化”的产品价值。

### 备选方案 B：优先做一键合规改写

优点：

- 贴近审核 WARN 后的修订链路，能加强发布前安全闭环。

代价：

- 需要更深地绑定审核证据片段、改写建议和草稿局部替换交互。
- 当前 AI 创作 P0 仍有 Prompt 模板、标题优化、正文改写缺口，先做合规改写容易把范围拉到审核模块。

本阶段采用推荐方案。

## 3. 涉及模块

### 前端 `apps/web`

- `apps/web/src/app/workspace/page.tsx`：增加模板选择、标题候选、正文改写输入与结果预览，继续使用今日头条发布页风格的双栏工作台。
- `apps/web/src/lib/api.ts`：继续复用 `apiFetch`、`readApiJson` 和错误解析，不新增全局请求库。
- 视实现复杂度新增 `apps/web/src/lib/ai-assistant-state.ts`：封装标题候选选择、正文改写结果替换和复制等纯状态逻辑，便于测试。

### 后端 `apps/api`

- `apps/api/src/prompts/prompts.controller.ts`：新增平台模板列表接口。
- `apps/api/src/prompts/prompts.service.ts`：补充模板列表查询、模板归属校验和公开返回结构。
- `apps/api/src/ai-gateway/ai-gateway.controller.ts`：新增标题优化、正文改写流式接口；生成文章流式接口支持 `promptId`。
- `apps/api/src/ai-gateway/ai-gateway.service.ts`：新增标题优化、正文改写编排，复用 live/mock provider 模式，并提供前端可消费的异步流事件。
- `apps/api/src/ai-gateway/ai-gateway.prompts.ts`：增加标题优化与正文改写 prompt builder、JSON 解析器、流式事件组装和模板渲染逻辑。
- `apps/api/src/ai-gateway/*.spec.ts`、`apps/api/src/prompts/*.spec.ts`：覆盖新增服务逻辑。
- `apps/api/prisma/seed.ts`：补充多个平台 Prompt 模板 seed。

### 共享包 `packages/shared`

- `packages/shared/src/index.ts`：新增 Prompt 列表、标题优化、正文改写相关 DTO 和枚举。

## 4. 需要新增或修改的文件

### 新增文件

- `apps/api/src/prompts/prompts.controller.ts`
- `apps/api/src/prompts/prompts.service.spec.ts`
- `apps/web/src/lib/ai-assistant-state.ts`
- `apps/web/src/lib/ai-assistant-state.test.ts`
- `docs/learn/009-prompt-template-rewrite-workbench-learning.md`，实现完成后生成，本地学习文档，不作为 GitHub 交付要求。

### 修改文件

- `packages/shared/src/index.ts`
- `apps/api/src/prompts/prompts.module.ts`
- `apps/api/src/prompts/prompts.service.ts`
- `apps/api/src/ai-gateway/ai-gateway.controller.ts`
- `apps/api/src/ai-gateway/ai-gateway.service.ts`
- `apps/api/src/ai-gateway/ai-gateway.prompts.ts`
- `apps/api/src/ai-gateway/ai-gateway.prompts.spec.ts`
- `apps/api/src/ai-gateway/ai-gateway.service.spec.ts`
- `apps/api/prisma/seed.ts`
- `apps/web/src/app/workspace/page.tsx`
- `README.md`

### 暂不修改

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/**`
- `apps/api/src/audit/**`
- `apps/api/src/scoring/**`
- `apps/api/src/publish/**`
- `apps/api/src/feed/**`
- `apps/api/src/ranking/**`
- `apps/api/src/analytics/**`

## 5. 数据模型或 API 变更

### 数据模型

本阶段不修改 Prisma schema，复用已有 `prompts` 表：

- `owner` 区分 `PLATFORM` 和 `PRIVATE`。
- `category` 区分文章生成、标题优化、正文改写等模板类型。
- `isStarter` 标记默认模板。
- `paramsSchema` 和 `fewShots` 暂按 JSON 保留，MVP 阶段先展示基础模板信息，不做可视化 Prompt 编辑器。

需要在 seed 中新增平台模板：

- `article_generation`：资讯图文、方法论图文、种草图文。
- `title_optimization`：标题优化模板。
- `article_rewrite`：正文改写模板。

### 共享类型

计划在 `packages/shared/src/index.ts` 增加：

```ts
export interface PromptTemplateSummary {
  id: string;
  name: string;
  category: string;
  owner: PromptOwner;
  isStarter: boolean;
  description?: string;
}

export interface ListPromptsResponse {
  items: PromptTemplateSummary[];
}

export interface GenerateArticleInput {
  topic: string;
  audience: string;
  style: string;
  promptId?: string;
}

export interface OptimizeTitlesInput {
  topic: string;
  audience: string;
  style: string;
  currentTitle?: string;
  bodyText?: string;
}

export interface OptimizeTitlesResponse {
  model: string;
  titles: string[];
}

export enum RewriteMode {
  Polish = "POLISH",
  Expand = "EXPAND",
  Shorten = "SHORTEN",
  ChangeStyle = "CHANGE_STYLE",
}

export interface RewriteArticleInput {
  text: string;
  mode: RewriteMode;
  targetStyle?: string;
  topic?: string;
  audience?: string;
}

export interface RewriteArticleResponse {
  model: string;
  text: string;
  suggestions: string[];
}
```

### API 设计

#### `GET /prompts?category=article_generation`

鉴权：需要 `Authorization: Bearer <token>`。

行为：

- 返回平台模板，以及后续可扩展的当前用户私有模板。
- MVP 阶段工作台默认请求 `article_generation` 分类。

响应：

```json
{
  "items": [
    {
      "id": "platform-news-starter",
      "name": "头条资讯图文生成",
      "category": "article_generation",
      "owner": "PLATFORM",
      "isStarter": true,
      "description": "适合资讯型中长图文初稿"
    }
  ]
}
```

#### `POST /ai/generate-article/stream`

新增可选字段：

```json
{
  "topic": "AI 如何改变内容创作",
  "audience": "内容创作者",
  "style": "科普",
  "promptId": "platform-news-starter"
}
```

行为：

- 未传 `promptId` 时保持现有行为。
- 传入 `promptId` 时，后端校验模板可被当前用户使用，且分类适用于文章生成。
- 模板不存在或不可用时返回 404 或 400，不回退到任意模板，避免用户误以为选择已生效。
- 使用 SSE 返回事件，前端随着事件更新标题、大纲和正文预览。

流式事件：

```text
event: meta
data: {"model":"mock-model"}

event: title
data: {"text":"AI 正在重塑内容创作的完整链路"}

event: outline
data: {"items":["趋势背景","核心机会"]}

event: body-delta
data: {"text":"AI 已经不只是生成一段文案的工具。"}

event: done
data: {"body":{"type":"doc","content":[]},"bodyText":"完整正文"}
```

#### `POST /ai/optimize-titles/stream`

请求：

```json
{
  "topic": "AI 如何改变内容创作",
  "audience": "内容创作者",
  "style": "科普",
  "currentTitle": "AI 如何改变内容创作",
  "bodyText": "正文纯文本摘要"
}
```

响应：

```text
event: meta
data: {"model":"mock-model"}

event: title
data: {"text":"AI 正在重塑内容创作的完整链路"}

event: title
data: {"text":"内容创作者如何用 AI 提升生产效率"}

event: done
data: {"titles":["AI 正在重塑内容创作的完整链路","内容创作者如何用 AI 提升生产效率"]}
```

#### `POST /ai/rewrite/stream`

请求：

```json
{
  "text": "需要改写的正文片段",
  "mode": "POLISH",
  "targetStyle": "科普",
  "topic": "AI 如何改变内容创作",
  "audience": "内容创作者"
}
```

响应：

```text
event: meta
data: {"model":"mock-model"}

event: text-delta
data: {"text":"改写后的正文片段"}

event: suggestion
data: {"text":"补充一个具体案例"}

event: done
data: {"text":"改写后的正文片段","suggestions":["补充一个具体案例"]}
```

错误：

- 400：输入为空、改写文本过长、改写模式非法、标题优化上下文不足。
- 401：未登录或 token 无效。
- 404：指定 Prompt 模板不存在或不可用。
- 502：AI provider 返回不可解析内容。
- 503：强制 live 模式但模型配置不可用。

兼容说明：

- 现有 `POST /ai/generate-article` 可在本阶段保留，便于旧页面或测试继续使用，但工作台必须改为调用流式接口。
- 标题优化和正文改写不新增非流式前端入口。

## 6. 前端交互与页面状态设计

工作台继续保持浅灰应用背景、顶部白色导航栏、左侧白色编辑画布、右侧浅色 AI 创作助手面板。

### Prompt 模板选择

- 在“创作设定”表单中增加模板选择，显示为克制的 segmented/list button 样式。
- 默认选中平台 starter 模板。
- 模板加载失败时不阻断页面，可继续使用默认生成能力，但展示轻量错误提示。
- 生成文章时将 `promptId` 随请求提交给后端。

### 标题优化

- 在右侧 AI 助手面板的“AI 创作”区域增加“优化标题”按钮。
- 触发后调用 `POST /ai/optimize-titles/stream`，每收到一个标题事件就追加展示候选。
- 点击候选标题会写入左侧标题输入框，但不会自动保存草稿。
- 若已有生成正文，则携带正文纯文本摘要；若还没有正文，则基于主题、受众和风格生成候选。

### 正文改写

- 右侧面板增加“正文改写”区域，包含：
  - 改写模式选择：润色、扩写、缩写、换风格。
  - 改写文本输入框，默认可从当前生成正文中复制片段，MVP 不做富文本选区联动。
  - 目标风格输入或复用当前风格。
- 改写结果预览。
- “替换预览正文”“复制结果”“重试”按钮。
- 改写过程中正文结果逐字或逐段增长，按钮在流结束前保持禁用或显示加载态。
- 若用户还没有保存草稿，改写结果只影响工作台当前生成预览；保存草稿时仍走 `POST /drafts`。
- 若用户已经进入草稿编辑页，本阶段暂不在 `/drafts/:id` 添加改写浮层，避免把范围扩散到 TipTap 选区操作。

### 页面状态

新增或细化状态：

- `promptsLoading`：模板加载中。
- `selectedPromptId`：当前模板。
- `titleStatus`：`idle | streaming | error`。
- `titleCandidates`：标题候选列表。
- `rewriteStatus`：`idle | streaming | error`。
- `rewriteMode`：当前改写模式。
- `rewriteInput`：待改写正文。
- `rewriteResult`：改写结果和建议。

发布入口不变：

- 工作台只保存草稿。
- 审核、评分和发布仍由草稿编辑页与发布确认页触发。
- 前端不得绕过后端审核直接生成文章详情。

## 7. 后端服务、鉴权、审核、评分、发布或榜单逻辑

### 鉴权

- `GET /prompts`、`POST /ai/optimize-titles`、`POST /ai/rewrite` 继续使用 `JwtAuthGuard`。
- 控制器只读取当前用户、请求参数和 body，不接受前端传入 `authorId`。

### Prompt 服务

`PromptsService` 增加：

- `listAvailablePrompts(userId, category?)`：返回平台模板和当前用户私有模板，MVP 阶段私有模板即使暂无 UI 也保留服务边界。
- `getUsablePrompt(promptId, userId, category)`：校验模板存在、分类匹配、归属可用。
- `getStarterPrompt(category)`：保留现有能力。

### AI Gateway

标题优化流程：

```text
validate input
  -> choose live or mock provider
  -> build title optimization messages
  -> parse or assemble title result
  -> emit title events one by one
  -> emit done event
```

正文改写流程：

```text
validate text and mode
  -> choose live or mock provider
  -> build rewrite messages by mode
  -> parse or assemble rewrite result
  -> emit text-delta/suggestion events
  -> emit done event
```

mock 模式要求：

- 不依赖外部 AI，也能稳定返回标题候选和改写结果。
- 用固定结构和可预测的分块顺序便于单元测试和课堂演示。

live 模式要求：

- 优先使用 provider 的流式能力；如果当前 provider SDK/兼容接口暂不支持真实 token stream，则后端可以先完整接收模型 JSON，再切分为 SSE 事件发给前端。
- 不论 live provider 是否原生流式，前端观察到的体验都必须是流式渲染。

### 审核、评分、发布和榜单

本阶段不修改这些模块。

- 标题优化和正文改写只是创作辅助，不代表内容安全通过。
- 用户保存草稿后，发布仍必须走 `/publish/:draftId`，由后端执行审核和评分。
- 榜单只读取已发布文章，不读取工作台生成结果。

## 8. 风险、边界情况和回滚方案

| 风险 | 处理 |
| --- | --- |
| Prompt 模板不存在或分类不匹配 | 后端返回 404/400，前端提示重新选择模板 |
| 模型返回非 JSON 或字段缺失 | 复用 `AiProviderBadOutputException`，SSE 发送 error 事件或返回错误响应，前端展示重试入口 |
| 标题候选为空或重复 | 解析后去重，少于 1 个则视为模型输出失败 |
| 改写文本过长导致请求慢或费用高 | MVP 限制输入长度，例如 2000 个字符以内 |
| 改写结果被误认为已保存 | 页面文案明确“替换预览正文后仍需保存草稿” |
| 流式连接中断 | 前端保留已收到内容并提示可重试，未收到 done 事件时不允许保存为已完成结果 |
| 工作台页面继续膨胀 | 把纯状态逻辑抽到 `ai-assistant-state.ts`，页面只保留 UI 和请求编排 |
| live provider 未配置 | `auto` 模式继续使用 mock，`live` 模式返回明确配置错误 |
| 私有 Prompt 权限越权 | `getUsablePrompt` 同时校验 `owner` 和 `authorId` |
| 前端绕过审核发布 | 不新增任何直接发布文章的前端逻辑，仍通过草稿和发布接口 |

回滚方案：

- 删除新增的 `/prompts` 控制器入口和 AI Gateway 新接口。
- `GenerateArticleInput.promptId` 保留为可选字段或移除，生成文章恢复使用 starter prompt。
- 工作台移除模板选择、标题优化和正文改写 UI。
- seed 中新增的 Prompt 模板可保留，不影响现有功能；若需要彻底回滚，可删除对应 seed upsert。
- 不涉及 Prisma schema 和迁移，数据库回滚成本低。

## 9. 验证方式和测试计划

### 后端单元测试

新增或扩展测试：

- `apps/api/src/prompts/prompts.service.spec.ts`
  - 返回平台模板列表。
  - 按分类过滤模板。
  - 校验可用模板时允许平台模板。
  - 校验私有模板时只允许作者本人。
  - 模板不存在时抛出明确异常。
- `apps/api/src/ai-gateway/ai-gateway.prompts.spec.ts`
  - 标题优化 prompt 构造包含主题、受众、风格和当前标题。
  - 标题优化 JSON 解析去重并过滤空标题。
  - 正文改写 prompt 根据 mode 输出不同要求。
  - 正文改写 JSON 解析校验 `text` 和 `suggestions`。
- `apps/api/src/ai-gateway/ai-gateway.service.spec.ts`
  - mock 模式按顺序流式返回标题候选。
  - mock 模式按顺序流式返回改写文本片段和建议。
  - `generateArticleDraft` 传入 `promptId` 时读取指定模板。
  - `streamArticleDraft` 传入 `promptId` 时先返回 meta/title/outline，再返回 body-delta 和 done。
  - 模型配置缺失时仍符合现有 `auto/mock/live` 行为。

### 前端纯函数测试

新增 `apps/web/src/lib/ai-assistant-state.test.ts`：

- 选择标题候选后返回新的标题状态。
- 改写结果替换预览正文时保持 `RichTextDocument` 结构合法。
- 空改写结果不覆盖当前正文。
- 复制/重试状态不会清空已生成正文。
- SSE 解析器能正确处理分块事件、多个事件和 done 事件。

### 类型检查

```bash
pnpm typecheck
```

### 构建检查

因为会修改 Next.js 页面和 NestJS controller/service，运行：

```bash
pnpm --filter @bytecamp-aigc/api build
pnpm --filter @bytecamp-aigc/web build
```

### 相关测试

```bash
pnpm --filter @bytecamp-aigc/api test
pnpm --filter @bytecamp-aigc/web test
```

### 手动页面验证

1. 启动数据库、API 和 Web。
2. 使用演示账号登录。
3. 进入 `/workspace`。
4. 确认 Prompt 模板列表加载成功，默认模板被选中。
5. 切换不同模板，输入主题、受众和风格，点击 AI 生成初稿。
6. 确认标题、大纲和正文逐步出现，而不是等待接口结束后一次性渲染。
7. 点击“优化标题”，确认标题候选逐条出现。
8. 点击某个候选标题，确认左侧标题输入框更新。
9. 输入一段正文片段，选择润色、扩写、缩写、换风格分别触发改写。
10. 确认改写结果流式增长，流结束后可以复制，也可以替换当前生成预览。
11. 保存为草稿并进入 `/drafts/:id`。
12. 从草稿页继续发布，确认仍触发审核和评分。

### 数据库验证

- `prompts` 表存在多个 `PLATFORM` 模板。
- 不新增草稿时，标题优化和正文改写不会写入 `drafts`。
- 保存草稿后，`drafts.title` 和 `drafts.body` 等于用户最终选择和替换后的内容。

## 10. 与总体架构的一致性

- `apps/web` 只负责模板选择、AI 辅助交互、状态展示和 API 调用。
- `apps/api` 负责 Prompt 查询、Prompt 可用性校验、AI 调用编排、mock/live 降级和结构化输出解析。
- `packages/shared` 负责前后端共享 DTO、枚举和 API 契约。
- AI 密钥、Prompt 策略、模型输出解析、标题优化、正文改写规则和流式事件组装都保留在后端。
- 审核、评分、发布和榜单排序不迁移到前端。
- 页面主体样式继续使用 Tailwind CSS utility class，保持工作台克制、高密度的生产工具风格。

## 11. 实现完成后的学习文档

实现完成后，根据 `AGENTS.md` 生成：

```text
docs/learn/009-prompt-template-rewrite-workbench-learning.md
```

学习文档面向第一次做全栈应用的初学者，重点解释：

- 这个功能解决了什么业务问题：为什么创作者需要模板、标题优化和正文改写。
- 用户从工作台选择模板、点击生成、优化标题、改写正文、保存草稿，到后端读取 Prompt、调用 AI、返回结构化结果的完整链路。
- `workspace/page.tsx`、`PromptsController`、`PromptsService`、`AiGatewayController`、`AiGatewayService`、`ai-gateway.prompts.ts`、Prisma `Prompt` 模型和共享 DTO 分别承担什么责任。
- 为什么 Prompt 模板属于后端数据，而不是写死在前端按钮里。
- 为什么 AI 返回结果要尽量约束为 JSON 或后端可解析结构，再转换成前端可逐块渲染的 SSE 事件。
- 成功路径和失败路径分别发生什么。
- 初学者需要重点理解的 React 状态、HTTP 请求、Controller、Service、Prisma、JWT、DTO、mock/live provider 和后端鉴权。
- 如何通过页面、接口、数据库、类型检查、测试和构建命令验证功能正确。
- 常见误区：在前端暴露模型密钥、绕过后端模板校验、改写结果未保存却误以为已持久化、标题优化绕过审核、把 Prompt 字符串散落到多个页面。
