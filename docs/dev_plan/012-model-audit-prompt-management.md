# 模型审核与工作台 Prompt 管理技术方案

## 1. 功能目标和用户价值

本阶段继续补齐创作到发布闭环里的两个关键点：

```text
工作台选择/管理 Prompt -> AI 生成初稿 -> 保存草稿
  -> 发布前模型审核 -> 质量评分 -> PASS 后发布
```

用户价值：

- 发布前审核不再只依赖本地关键词规则，而是通过后端 AI Gateway 调用模型能力完成结构化审核，能覆盖更复杂的低俗、虚假宣传、不良价值观、广告引流、低质量和隐私泄露场景。
- 工作台不只选择平台预设 Prompt，还可以基于默认模板新增或修改用户私有 Prompt，让创作者按自己的内容风格设定生成要求。
- Prompt 编辑格式参考 `默认prompt.docx` 的结构，采用 `Identity`、`Instructions`、维度定义、固定输出规范和 Examples 的组织方式，便于初学者理解 Prompt 不是一段随意文本。
- 自定义 Prompt 不允许改变现有模型输出规范。后端始终追加并强制解析当前 `GeneratedArticleDraft` 和 `AuditResult` JSON 契约，前端不能通过 Prompt 绕过输出结构、审核裁决、质量评分或发布规则。

## 2. 下一步范围选择

### 推荐方案：模型审核 + 受控的用户私有 Prompt 管理

本阶段实现：

- `AuditService.checkText` 改为通过 `AiGatewayService.auditContent` 获取模型审核结果。
- `AiGateway` 增加审核 Prompt builder、审核 JSON parser、live/mock 审核实现。
- 发布确认页和 `POST /publish/:draftId` 继续调用同一条后端审核服务，发布接口内部仍重新审核，不能复用前端预检查结果。
- `PromptsService` 增加私有 Prompt 新增、复制平台模板、修改、读取详情能力。
- 工作台 `/workspace` 增加 Prompt 管理入口：选择默认平台 Prompt、复制并修改、自定义新增、保存后立即选择。
- 自定义 Prompt 仅影响文章生成的业务指令和风格约束，后端固定输出 JSON schema，不暴露模型密钥和最终结构约束给前端改写。

优点：

- 直接满足“发布前的审核用模型能力审核”。
- 复用已有 `AI_PROVIDER_MODE`、OpenAI-compatible provider、SSE、Prompt 表和工作台样式，不引入新模型客户端。
- 不修改 Prisma schema，降低迁移和回滚成本。
- 保持厚后端边界：Prompt 渲染、模型调用、审核裁决、输出解析都在 `apps/api`。

代价：

- `AuditService` 需要从纯规则服务变成依赖 AI Gateway 的异步模型编排服务，相关单测要改为注入 mock gateway。
- 工作台页面已经较大，需要抽取 Prompt 管理组件和纯函数，避免继续膨胀。

### 备选方案 A：开放完整 system/user Prompt 编辑

优点：

- 用户自由度最高，可以完全自定义模型行为。

代价：

- 用户可能写入“不要返回 JSON”“忽略审核规则”等内容，破坏现有前后端解析契约。
- 不符合“不要改变现有预设模型输出规范”的要求。

本阶段不采用。

### 备选方案 B：只在前端 localStorage 保存 Prompt

优点：

- 改动最小，不需要新增 API。

代价：

- 违反架构中“Prompt 是数据，不是散落在前端字符串”的原则。
- 无法做后端权限校验、模板归属、后续复制平台模板和跨页面复用。

本阶段不采用。

## 3. 涉及的前端、后端、共享包模块

### 前端 `apps/web`

- `apps/web/src/app/workspace/page.tsx`
  - 保留现有双栏工作台风格。
  - Prompt 选择区增加“修改”“新增 Prompt”入口。
  - 生成文章时继续提交 `promptId`，后端读取选中 Prompt。
- `apps/web/src/components/prompt-manager-panel.tsx`
  - 新增 Prompt 管理面板或弹窗组件。
  - 支持平台模板只读预览、复制为自定义、编辑私有 Prompt、保存、取消。
- `apps/web/src/lib/prompt-management.ts`
  - 新增纯函数：默认 Prompt 文本生成、编辑表单校验、保存按钮禁用、列表分组。
- `apps/web/src/lib/api.ts`
  - 复用现有 `apiFetch` 和 `readApiJson`，不新增请求库。

### 后端 `apps/api`

- `apps/api/src/audit/audit.service.ts`
  - 从本地规则审核升级为模型审核服务。
  - 保留 deterministic mock 审核，供本地开发和单测使用。
- `apps/api/src/ai-gateway/ai-gateway.prompts.ts`
  - 新增审核 Prompt builder，结构参考 docx 示例。
  - 新增审核 JSON parser，将模型输出规范化为现有 `AuditResult`。
- `apps/api/src/ai-gateway/ai-gateway.service.ts`
  - 新增 `auditContent(text)`。
  - `live/auto/mock` 行为与文章生成保持一致。
- `apps/api/src/prompts/prompts.controller.ts`
  - 增加 Prompt 详情、新增、复制、修改接口。
- `apps/api/src/prompts/prompts.service.ts`
  - 增加私有 Prompt 的创建、复制、修改和权限校验。
  - 平台 Prompt 仍只读。

### 共享包 `packages/shared`

- 新增 Prompt 管理 DTO：
  - `PromptTemplateDetail`
  - `CreatePromptInput`
  - `UpdatePromptInput`
  - `CopyPromptInput`
  - `PromptTemplateMutationResponse`
- 可选扩展 `AuditResult`：
  - `model?: string`
  - `source?: "MODEL" | "MOCK"`

`AuditResult` 现有字段不删除、不改名，确保发布页、文章详情页和历史测试继续兼容。

## 4. 需要新增或修改的文件

### 新增文件

- `apps/web/src/components/prompt-manager-panel.tsx`
- `apps/web/src/lib/prompt-management.ts`
- `apps/web/src/lib/prompt-management.test.ts`
- `docs/learn/012-model-audit-prompt-management-learning.md`，实现完成后生成，本地学习文档，不上传 GitHub

### 修改文件

- `packages/shared/src/index.ts`
- `apps/api/src/audit/audit.service.ts`
- `apps/api/src/audit/audit.service.spec.ts`
- `apps/api/src/publish/publish.service.spec.ts`
- `apps/api/src/ai-gateway/ai-gateway.prompts.ts`
- `apps/api/src/ai-gateway/ai-gateway.prompts.spec.ts`
- `apps/api/src/ai-gateway/ai-gateway.service.ts`
- `apps/api/src/ai-gateway/ai-gateway.service.spec.ts`
- `apps/api/src/prompts/prompts.controller.ts`
- `apps/api/src/prompts/prompts.service.ts`
- `apps/api/src/prompts/prompts.service.spec.ts`
- `apps/api/prisma/seed.ts`
- `apps/web/src/app/workspace/page.tsx`
- `apps/web/src/components/ai-writing-assistant.tsx`，仅在需要把 Prompt 管理入口放入右侧助手时修改
- `README.md`，实现和验证完成后更新能力说明

### 暂不修改

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/**`
- `apps/api/src/scoring/**`
- `apps/api/src/feed/**`
- `apps/api/src/ranking/**`
- `apps/api/src/analytics/**`

## 5. 数据模型或 API 变更

### 数据模型

不修改 Prisma schema，继续复用 `prompts` 表：

- `owner = PLATFORM`：平台预设，只读。
- `owner = PRIVATE`：当前用户私有 Prompt，可新增、修改。
- `sourcePromptId`：用户从平台 Prompt 复制时记录来源。
- `systemPrompt`：后端控制的基础角色和输出约束，不在工作台开放直接编辑。
- `userTemplate`：用户可编辑的业务指令模板，支持 `{{topic}}`、`{{audience}}`、`{{style}}` 占位符。
- `paramsSchema.description`：列表说明。

说明：

- 工作台可以将当前选择的 `promptId` 写入页面状态和 localStorage，提升下次进入的体验。
- 本阶段不做跨设备“默认 Prompt 偏好”持久化。如果后续需要每个用户跨设备默认 Prompt，可新增 `UserSetting` 或 `PromptPreference` 表。

### Prompt API

#### `GET /prompts?category=article_generation`

已有接口继续保留，响应增加私有 Prompt。

#### `GET /prompts/:id`

鉴权：需要 JWT。

行为：

- 平台 Prompt：可读取详情，但返回 `readonly: true`。
- 私有 Prompt：只允许作者读取。
- 返回编辑器所需字段和只读输出规范预览。

响应示例：

```json
{
  "id": "prompt_1",
  "name": "我的科普图文 Prompt",
  "category": "article_generation",
  "owner": "PRIVATE",
  "readonly": false,
  "description": "适合稳定输出科普型文章",
  "userTemplate": "# Identity\n你是中文科普图文创作助手。\n# Instructions\n* 围绕 {{topic}} 展开，面向 {{audience}} 写作，使用 {{style}} 风格。",
  "outputContractPreview": "后端固定要求模型返回 title、outline、bodyText JSON，不允许自定义 Prompt 修改。"
}
```

#### `POST /prompts`

请求：

```json
{
  "name": "我的科普图文 Prompt",
  "category": "article_generation",
  "description": "适合稳定输出科普型文章",
  "userTemplate": "# Identity\n你是中文科普图文创作助手。\n# Instructions\n* 围绕 {{topic}} 展开，面向 {{audience}} 写作，使用 {{style}} 风格。"
}
```

行为：

- 创建 `owner = PRIVATE` 的 Prompt。
- 后端写入受控 `systemPrompt`，不接收前端传入 system prompt。
- 校验 `name`、`category`、`userTemplate` 长度。
- `article_generation` 模板建议至少包含 `{{topic}}`，允许缺省 `{{audience}}` 和 `{{style}}`，后端仍会追加输入上下文。

#### `POST /prompts/:id/copy`

行为：

- 将平台 Prompt 复制为当前用户私有 Prompt。
- 默认名称为 `原名称 - 自定义`。
- `sourcePromptId` 指向平台 Prompt。
- 复制后返回私有 Prompt 详情，前端自动打开编辑状态。

#### `PATCH /prompts/:id`

行为：

- 只允许修改当前用户私有 Prompt。
- 只允许修改 `name`、`description`、`userTemplate`。
- 平台 Prompt 返回 403 或 400。

### 审核 API

外部 API 不改：

```text
POST /audit/check
POST /publish/:draftId
```

内部行为改变：

- `POST /audit/check` 加载草稿后调用模型审核。
- `POST /publish/:draftId` 内部重新调用同一个模型审核服务。
- 审核失败、模型配置错误或模型输出不可解析时，不创建文章。

## 6. 前端交互与页面状态设计

### 工作台 Prompt 选择

保留当前“Prompt 模板”区，但调整为更明确的管理体验：

- 平台 Prompt 和我的 Prompt 分组展示。
- 平台 Prompt 卡片：
  - `使用`：选中该 Prompt。
  - `修改`：实际执行“复制为自定义并打开编辑”，不直接改平台模板。
- 私有 Prompt 卡片：
  - `使用`：选中该 Prompt。
  - `修改`：打开编辑面板。
- 顶部增加 `新增 Prompt` 按钮。

### Prompt 编辑面板

形式：

- 桌面端：右侧助手栏内的管理面板或覆盖式弹窗，宽度保持克制，不做营销式大卡片。
- 移动端：单列弹窗或面板，下方按钮不遮挡正文编辑器。

字段：

- Prompt 名称。
- 说明。
- Prompt 内容 textarea，默认填充 docx 风格模板。
- 只读“固定输出规范”区域，展示后端会强制追加的 JSON 契约。

默认文本格式：

```text
# Identity
你是 AI Creator Hub 的中文图文创作助手，负责根据创作者输入生成结构清晰、可编辑、适合发布前审核的文章初稿。

# Instructions
* 围绕主题 {{topic}} 展开，面向 {{audience}} 写作。
* 使用 {{style}} 风格，但避免夸大承诺、虚假数据和导流表达。
* 输出内容要便于后续人工编辑、保存草稿、审核评分和发布。

## 内容要求
- 标题具体清晰，不做标题党。
- 大纲覆盖背景、核心观点、实践建议和风险边界。
- 正文保持段落清楚，每段只讲一个重点。

## 固定输出规范
由后端强制追加：模型必须返回 title、outline、bodyText JSON。这里的自定义内容不能改变输出字段。

# Examples
<user_query>
主题：AI 如何改变内容创作
受众：内容创作者
风格：科普
</user_query>
<assistant_response>
{"title":"AI 如何改变内容创作：从灵感到发布的完整链路","outline":["趋势背景","核心变化","实践方法","风险边界"],"bodyText":"AI 正在把内容创作从单点生成推进到完整工作流。\n\n创作者可以先用 AI 生成初稿，再通过人工编辑补充真实经验。\n\n发布前仍需要经过审核和评分，确保内容可读且合规。"}
</assistant_response>
```

交互状态：

- `promptsLoading`：加载模板列表。
- `promptPanelOpen`：是否打开管理面板。
- `promptEditing`：当前编辑的 Prompt 详情。
- `promptSaving`：保存中。
- `promptError`：保存/加载失败提示。
- `selectedPromptId`：当前生成使用的 Prompt。

保存成功后：

- 刷新 Prompt 列表。
- 自动选中新建或修改后的私有 Prompt。
- 关闭面板或保留在详情状态，并提示“已保存，下一次生成会使用该 Prompt”。

### 发布前模型审核状态

发布确认页 UI 不需要大改：

- `开始审核` 仍调用 `POST /audit/check`。
- 右侧审核结果仍展示 `decision`、`riskLevel`、`evidence`、`rewriteSuggestions`、`summary`。
- 如果 `AuditResult.model` 存在，可在辅助信息中展示模型名，便于答辩说明“本次为模型审核”。
- 模型调用失败时展示明确错误和重试入口，不允许确认发布。

## 7. 后端服务、鉴权、审核、评分、发布或榜单逻辑

### 鉴权

- Prompt 管理接口全部使用 `JwtAuthGuard`。
- 创建、复制、修改私有 Prompt 时只使用 `CurrentUser("userId")`，不接受前端传入 `authorId`。
- `getUsablePrompt(promptId, userId, category)` 继续校验平台或本人私有 Prompt。

### Prompt 输出规范保护

后端生成文章时采用三层拼装：

```text
受控 system prompt
  -> 用户私有 userTemplate 渲染后的业务指令
  -> 后端固定 JSON 输出契约和字段要求
```

关键规则：

- 前端不能提交 `systemPrompt`。
- 后端在 `buildArticleGenerationMessages` 中始终追加 JSON schema。
- 模型返回后仍必须通过 `parseArticleGenerationJson`，缺字段直接失败。
- 自定义 Prompt 只能影响写作角度、风格、内容要求，不能改变 `title`、`outline`、`bodyText` 输出规范。

### 模型审核 Prompt

审核 Prompt 参考 `默认prompt.docx` 的组织方式，但输出结构使用项目现有 `AuditResult`：

```text
# Identity
你是 AI Creator Hub 的内容安全审核助理，负责对待发布文章做合规审核，并输出可程序解析的审核结果。

# Instructions
* 严格识别违法、低俗色情、虚假医疗/金融、不良价值观、广告引流、低质灌水、隐私泄露等风险。
* 只输出 JSON，不输出 Markdown、解释性自然语言或额外备注。
* decision 只能是 PASS、WARN、BLOCK。
* riskLevel 只能是 none、low、medium、high。
* categories 只能使用 ADULT、GAMBLING、DRUGS、SENSITIVE_INFO、ILLEGAL、LOW_QUALITY、MISLEADING。
* evidence 必须给出命中的原文片段和原因。
* PASS 内容必须返回空 categories、空 evidence、空 rewriteSuggestions。

## 固定输出结构
{
  "decision": "PASS | WARN | BLOCK",
  "riskLevel": "none | low | medium | high",
  "categories": ["SENSITIVE_INFO"],
  "evidence": [{"text": "命中的片段", "reason": "为什么有风险"}],
  "rewriteSuggestions": ["替代表达或修改建议"],
  "summary": "整体审核说明"
}

# Examples
<user_query id="audit-pass">
请审核内容：AI 可以帮助创作者梳理选题、生成大纲，并在发布前检查内容质量。
</user_query>
<assistant_response id="audit-pass">
{"decision":"PASS","riskLevel":"none","categories":[],"evidence":[],"rewriteSuggestions":[],"summary":"未发现明显风险。"}
</assistant_response>
<user_query id="audit-warn">
请审核内容：每天喝白糖水就能治好颈椎病，不用吃药，百分百见效。
</user_query>
<assistant_response id="audit-warn">
{"decision":"WARN","riskLevel":"medium","categories":["MISLEADING"],"evidence":[{"text":"每天喝白糖水就能治好颈椎病","reason":"包含未经证实的医疗效果承诺。"}],"rewriteSuggestions":["删除绝对化疗效表达，补充医学建议需咨询专业医生的提示。"],"summary":"内容存在虚假医疗或夸大效果风险，需要修改后重审。"}
</assistant_response>
<user_query id="audit-block">
请审核内容：参与赌博可以快速回本，还能稳赚不赔。
</user_query>
<assistant_response id="audit-block">
{"decision":"BLOCK","riskLevel":"high","categories":["GAMBLING","MISLEADING"],"evidence":[{"text":"参与赌博可以快速回本","reason":"包含赌博引导表达。"},{"text":"稳赚不赔","reason":"包含绝对化虚假收益承诺。"}],"rewriteSuggestions":["删除赌博相关表达，改为风险教育或合规案例。"],"summary":"内容命中高风险赌博引导，禁止发布。"}
</assistant_response>
```

### `AiGatewayService.auditContent(text)`

流程：

```text
normalize text
  -> if AI_PROVIDER_MODE=mock or auto without usable config: deterministic mock audit
  -> if live/auto with usable config: call provider with audit messages
  -> parse JSON to AuditResult
  -> validate enum/category/evidence/suggestions
  -> return normalized AuditResult
```

live 模式边界：

- `AI_PROVIDER_MODE=live` 但缺少 `AI_API_KEY` 或 `AI_MODEL` 时返回配置错误，不降级为 PASS。
- 模型输出非 JSON 或字段非法时抛出 bad output，发布接口不创建文章。
- `AI_PROVIDER_MODE=auto` 在本地未配置模型时使用 mock，方便课堂演示和测试。

mock 审核：

- 继续覆盖现有关键词用例：赌博、毒品、违法犯罪、身份证号、手机号、低俗、医疗偏方、稳赚不赔。
- mock 结果的结构与模型结果完全一致。
- 旧规则不再作为生产发布的最终审核路径，只作为 mock 和测试数据来源。

### 发布与评分

- `PublishService.checkDraft` 和 `PublishService.publishDraft` 不改变对外接口。
- 发布接口内部仍重新执行模型审核和评分。
- 发布流程先在事务外读取草稿、调用 AI 审核并计算质量评分；事务内先校验草稿版本仍未变化，再执行审核记录、评分记录、文章快照、修订记录和草稿状态写入，避免模型调用时间过长导致 Prisma interactive transaction 超时，也避免审核期间用户保存新版本后继续发布旧结果。
- `BLOCK` 和 `WARN` 仍不创建文章。
- `PASS` 才能创建或更新 `articles` 和 `article_revisions`。
- 质量评分逻辑暂不改，仍根据审核 decision 调整安全分。

### 榜单

本阶段不修改 feed、ranking、analytics：

- 只有发布成功的文章进入信息流和榜单。
- Prompt 创建/修改不影响已发布文章。

## 8. 风险、边界情况和回滚方案

| 风险 | 处理 |
| --- | --- |
| 自定义 Prompt 破坏输出 JSON | 前端不开放 systemPrompt，后端固定追加 JSON schema，返回后强解析 |
| 用户编辑平台 Prompt | 平台 Prompt 只读，修改时先复制为私有 Prompt |
| 用户读取或修改他人私有 Prompt | 所有 Prompt 查询加入 `authorId` 校验 |
| 模型审核输出非法 | 抛出 bad output，前端提示重试，发布接口不创建文章 |
| live 模型不可用 | live 模式返回明确错误；auto 本地可 mock；不静默放行发布 |
| mock 与 live 判断不一致 | mock 仅用于测试和本地演示，生产配置使用 live |
| Prompt 内容过长导致费用或延迟升高 | 限制 `userTemplate` 长度，例如 4000 字符以内 |
| 用户删除必须变量 | 后端仍追加 topic/audience/style 输入上下文；编辑器提示建议保留 `{{topic}}` |
| 发布预检查 PASS 后内容被改 | `POST /publish/:draftId` 内部重新审核 |
| AI 审核耗时超过 Prisma 事务超时 | 模型审核和评分在打开事务前完成，事务只包住数据库写入，并用发布回归测试防止再次把审核移回事务内 |
| AI 审核期间草稿被再次保存 | 事务内按审核前的 `draft.version` 做校验，版本变化则返回冲突错误，要求用户重新审核和发布 |
| 工作台页面过大 | 新增 `PromptManagerPanel` 和 `prompt-management.ts` 分担 UI 与纯状态逻辑 |

回滚方案：

- `AuditService` 恢复本地规则实现，保留新增 AI Gateway 审核方法不被调用。
- 移除 Prompt 新增/修改接口和工作台管理面板。
- 保留数据库中已创建的私有 Prompt，不影响现有平台 Prompt；如需清理，可按 `owner=PRIVATE` 删除。
- 不涉及 Prisma schema 和迁移，回滚无需处理数据库结构。

## 9. 验证方式和测试计划

### 后端单元测试

`apps/api/src/ai-gateway/ai-gateway.prompts.spec.ts`：

- 审核 Prompt 包含身份、规则、风险维度和固定输出结构。
- 模型审核 JSON 能解析为 `AuditResult`。
- 非法 decision、非法 category、空 JSON 会抛出 bad output。
- PASS 内容会规范化为空 categories/evidence/rewriteSuggestions。

`apps/api/src/ai-gateway/ai-gateway.service.spec.ts`：

- mock 审核返回 PASS/WARN/BLOCK。
- live 审核调用 provider 并传入审核 messages。
- provider 输出非法时抛错。
- live 配置缺失时抛配置错误。

`apps/api/src/audit/audit.service.spec.ts`：

- `AuditService.checkText` 调用 AI Gateway。
- 高风险内容返回 BLOCK。
- 敏感信息内容返回 WARN。
- 正常内容返回 PASS。

`apps/api/src/prompts/prompts.service.spec.ts`：

- 创建私有 Prompt。
- 复制平台 Prompt 为私有 Prompt。
- 修改本人私有 Prompt。
- 禁止修改平台 Prompt。
- 禁止读取/修改他人私有 Prompt。
- `getUsablePrompt` 能返回本人私有 Prompt 用于文章生成。

`apps/api/src/publish/publish.service.spec.ts`：

- 发布接口使用注入的模型审核结果。
- WARN/BLOCK 不创建文章。
- 模型审核异常时不创建文章。
- 模型审核必须发生在发布事务打开之前，避免慢 AI 请求占用 Prisma interactive transaction。
- 模型审核完成后如果草稿版本已变化，发布应中止且不写入审核、评分或文章记录。

### 前端测试

`apps/web/src/lib/prompt-management.test.ts`：

- 默认 Prompt 模板包含 `Identity`、`Instructions`、固定输出规范提示和示例。
- 平台 Prompt 点击修改会进入复制流程。
- 私有 Prompt 点击修改会进入编辑流程。
- 空名称、空模板、超长模板禁用保存。
- 保存成功后应选中新 Prompt。

### 类型检查

```bash
pnpm typecheck
```

### 构建检查

因为会修改 NestJS service/controller、共享类型、Next.js 页面和组件，运行：

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
3. 进入 `/workspace`，确认平台 Prompt 列表加载。
4. 选择平台默认 Prompt，生成文章，确认输出标题、大纲和正文。
5. 点击平台 Prompt 的“修改”，确认复制为私有 Prompt 并打开编辑面板。
6. 修改 Prompt 名称、说明和内容，保存后确认列表出现“我的 Prompt”。
7. 使用自定义 Prompt 重新生成文章，确认仍能得到标题、大纲和正文，不破坏生成结构。
8. 新增一个 Prompt，保存后确认可选择并用于生成。
9. 保存草稿并进入发布确认页。
10. 对正常内容点击“开始审核”，确认模型审核 PASS 并可继续发布。
11. 对包含隐私或虚假宣传风险的内容审核，确认 WARN 展示证据和修改建议，不能发布。
12. 对包含赌博、毒品、违法犯罪引导的内容审核，确认 BLOCK 拦截，不能发布。
13. 临时切换 `AI_PROVIDER_MODE=live` 且移除模型配置，确认审核失败时不允许发布。

### 数据库验证

- 新增 Prompt 后，`prompts.owner = PRIVATE`，`authorId` 为当前用户。
- 复制平台 Prompt 后，`sourcePromptId` 指向平台 Prompt。
- 修改私有 Prompt 后，`updatedAt` 更新，平台 Prompt 不变。
- 生成文章不会直接写入草稿，只有点击保存草稿才写入 `drafts`。
- 审核后 `audit_records.rawResult` 保存模型归一化后的审核结果。
- WARN/BLOCK 不新增 `articles`。
- PASS 发布后 `articles`、`article_revisions`、`audit_records`、`quality_scores` 状态一致。

## 10. 与总体架构的一致性

- `apps/web` 只负责 Prompt 管理交互、选择状态、编辑表单、按钮状态和 API 调用。
- `apps/api` 负责 Prompt 持久化、权限校验、Prompt 装配、模型审核、输出解析、发布强约束。
- `packages/shared` 负责 Prompt 管理 DTO、审核结果类型和 API 契约。
- AI 密钥、审核裁决、质量评分、发布事务和榜单排序不进入前端。
- Prompt 自定义不允许改变模型输出规范，后端仍以结构化 parser 作为最终边界。
- 工作台样式继续使用 Tailwind CSS utility class，保持浅灰应用背景、左侧编辑画布、右侧 AI 助手面板的生产工具风格。

## 11. 实现完成后的学习文档

实现完成后，根据 `AGENTS.md` 生成：

```text
docs/learn/012-model-audit-prompt-management-learning.md
```

学习文档面向第一次做全栈应用的初学者，重点解释：

- 这个功能解决了什么业务问题：为什么发布前审核要用模型能力，为什么创作者需要管理 Prompt。
- 用户从工作台选择/新增/修改 Prompt，到后端保存私有 Prompt，再到生成文章的完整链路。
- 用户从发布页点击审核，到后端调用模型、解析审核 JSON、写入审核记录、决定能否发布的完整链路。
- `workspace/page.tsx`、`PromptManagerPanel`、`PromptsController`、`PromptsService`、`AuditService`、`AiGatewayService`、`ai-gateway.prompts.ts`、`PublishService`、Prisma `Prompt` 和 `AuditRecord` 分别承担什么责任。
- 为什么不能把 system prompt 和输出规范完全交给前端编辑。
- 为什么模型返回后仍必须做 JSON parser 和 enum 校验。
- PASS、WARN、BLOCK 三条路径分别发生什么。
- 初学者需要重点理解的 React 状态、HTTP 请求、Controller、Service、Prisma、JWT Guard、DTO、Prompt builder、mock/live provider、结构化输出解析。
- 如何通过页面、接口、数据库、类型检查、测试和构建命令验证功能正确。
- 常见误区：前端存 Prompt 当业务数据、前端暴露模型密钥、自定义 Prompt 改坏 JSON 输出、模型审核失败仍允许发布、发布接口信任前端预检查结果。
