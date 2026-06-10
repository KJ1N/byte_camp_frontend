# 多模态生成工作台技术方案

## 1. 功能目标和用户价值

本轮开发目标是在不改动现有 `/workspace` 创作工作台行为和页面结构的前提下，新增一个“多模态生成”工作台：

```text
用户进入 /creator
  -> 左侧侧栏展开“创作”
  -> 选择“多模态生成”
  -> 输入图文生成需求
  -> 后端先生成正文与图片生成计划
  -> 使用 doubao-seedream-4-5-251128 生成配图
  -> 组合成可编辑富文本草稿
  -> 保存草稿
  -> 后续审核阶段文字和图片分开审核
  -> 其余草稿、评分、发布、分发链路保持一致
```

用户价值：

- 创作者可以用一句话生成“正文 + 配图”的图文初稿，例如“生成一份关于上海租界的100字小文章，包含2张图片”。
- 页面布局继续贴近现有工作台，学习和操作成本低。
- 现有文章工作台不被改动，避免影响已经稳定的文章生成、改写、保存和素材插入链路。
- 文生图耗时较长时，前端通过分阶段状态展示正文、图片占位和图片完成结果，降低等待焦虑。
- 发布前审核仍由后端负责，并把文字审核和图片审核分离，避免图片风险被正文审核掩盖。

本轮不引入 Redis + BullMQ 队列；该能力作为后续待开发事项写入作业提交文档。当前版本优先复用已有 AI Gateway SSE 能力做可演示的分段返回：先返回标题、正文，再逐张返回图片状态和 URL。

## 2. 涉及模块

### 前端 `apps/web`

- `creator` 页面：
  - 将左侧“创作”从单个直达链接调整为可展开分组。
  - 分组内包含“文章工作台”和“多模态生成”两个入口。
  - “文章工作台”继续指向 `/workspace`。
  - “多模态生成”指向新路由，不改变现有工作台。
- 新增多模态工作台页面：
  - 页面分布与现有工作台一致：浅灰背景、顶部白色栏、左侧白色编辑画布、右侧浅色 AI 助手栏、底部保存操作区。
  - 复用富文本编辑器、草稿保存、本地暂存、最近草稿入口等已有能力。
  - 替换生成 Prompt、空状态文案和右侧助手展示逻辑，使其围绕“图文生成”和“图片状态”展开。
  - 生成结果中图片以富文本 `image` 节点进入正文，用户可以继续编辑、保存和发布。

### 后端 `apps/api`

- `ai-gateway`：
  - 新增多模态生成入口和 SSE 流式事件。
  - 文本模型负责理解用户需求，输出标题、大纲、正文、图片位置信息和图片 prompt。
  - 图片模型固定使用 `doubao-seedream-4-5-251128`，API key 与现有 AI 调用共用 `AI_API_KEY`，图片生成接口默认固定为 `https://ark.cn-beijing.volces.com/api/v3/images/generations`。
  - 图片调用与现有 provider 适配层隔离，统一归一化为 `{ url, caption, alt, prompt, model }`。
- `audit` / `publish`：
  - 审核草稿时拆分正文文本和图片节点。
  - 正文走现有 `AuditService.checkText`。
  - 图片走图片审核能力，优先复用 `AssetAuditService` 并补充 URL 图片审核入口。
  - 审核记录可以按阶段区分为 `PUBLISH_PRECHECK_TEXT` 和 `PUBLISH_PRECHECK_IMAGE`，最终对外仍返回聚合后的 `PASS / WARN / BLOCK` 结果，保持前端发布链路不变。
- `drafts` / `scoring` / `ranking`：
  - 草稿保存、版本、评分、发布、榜单分发继续复用现有链路。
  - 质量评分仍以标题和正文文本为主，合规安全分使用文字与图片聚合审核结果。

### 共享包 `packages/shared`

- 新增多模态生成输入、图片计划、图片结果和 SSE 事件类型。
- 保持现有 `GeneratedArticleDraft` 不变，避免影响文章工作台。
- 新增独立 `GeneratedMultimodalDraft` 或扩展型 DTO，供多模态页面使用。

## 3. 需要新增或修改的文件

### 新增文件

- `apps/web/src/app/multimodal-workspace/page.tsx`
  - 多模态生成工作台页面。
- `apps/web/src/app/multimodal-workspace/layout.tsx`
  - 页面标题：`多模态生成 - 文舟`。
- `apps/web/src/lib/multimodal-generated-body.ts`
  - 将正文、图片结果、caption 转换为 ProseMirror JSON。
- `apps/web/src/lib/multimodal-generated-body.test.ts`
  - 覆盖图片节点插入、纯文本统计、失败图片不插入等逻辑。
- `docs/learn/020-multimodal-generation-workbench-learning.md`
  - 实现完成后的初学者学习复盘文档。

### 修改文件

- `apps/web/src/app/creator/page.tsx`
  - 左侧侧栏新增“创作”可展开分组，加入“文章工作台”和“多模态生成”入口。
- `packages/shared/src/index.ts`
  - 新增多模态 DTO 和 SSE 事件类型。
- `apps/api/src/ai-gateway/ai-gateway.controller.ts`
  - 新增 `POST /ai/generate-multimodal/stream`。
- `apps/api/src/ai-gateway/ai-gateway.service.ts`
  - 新增多模态编排逻辑：文本计划、图片生成、事件输出、mock 降级。
- `apps/api/src/ai-gateway/ai-gateway.prompts.ts`
  - 新增多模态生成 prompt builder 和 JSON parser。
- `apps/api/src/ai-gateway/ai-provider.client.ts`
  - 新增图片生成调用方法，复用同一 API key 和 provider 错误处理。
- `apps/api/src/ai-gateway/ai-request-log.ts`
  - 如需要，新增 `multimodal_generation` 和 `image_generation` 特征名。
- `apps/api/src/audit/audit.service.ts`
  - 新增聚合文字 / 图片审核结果的服务方法。
- `apps/api/src/assets/asset-audit.service.ts`
  - 补充 URL 图片审核入口，或为生成图片提供可复用的图片审核方法。
- `apps/api/src/publish/publish.service.ts`
  - 发布前审核拆分文字和图片，写入分阶段审核记录，最终保持发布响应结构不变。
- `.temp/AI-Creator-Hub-作业提交文档.md`
  - 写入 Redis + BullMQ 多模态生成队列作为待开发事项。

### 暂不修改

- `apps/web/src/app/workspace/page.tsx`
- `apps/web/src/app/workspace/layout.tsx`
- 现有文章生成接口 `/ai/generate-article/stream`
- 现有草稿数据模型
- 现有榜单排序模型

如果实现时发现必须抽取公共工作台组件，抽取后的代码必须保持 `/workspace` 呈现和行为不变，并通过回归验证确认不影响现有工作台。

## 4. 数据模型或 API 变更

### 数据模型

本轮优先不修改 Prisma schema，不新增迁移。

原因：

- 生成后的正文和图片可以直接保存为现有 `drafts.body` 的 ProseMirror JSON。
- 图片节点可写入：

```json
{
  "type": "image",
  "attrs": {
    "src": "https://...",
    "alt": "上海外滩租界时期建筑",
    "caption": "外滩一带保留了许多租界时期建筑",
    "generatedImage": true,
    "model": "doubao-seedream-4-5-251128"
  }
}
```

- 审核记录继续写入 `audit_records`，通过 `stage` 区分文字和图片审核。

如果图片模型返回的 URL 有过期风险，后续再把图片下载并转存到 `assets` / 云存储；本轮先把该项列为风险和后续优化。

### API

新增接口：

```text
POST /ai/generate-multimodal/stream
```

请求：

```ts
interface GenerateMultimodalInput {
  topic: string;
  audience: string;
  style: string;
  promptId?: string;
  imagePrompt?: string;
  imageCount?: number;
}
```

约束：

- `topic` 必填。
- `audience` 默认 `内容创作者`。
- `style` 默认 `科普`。
- `imagePrompt` 由页面的“图片 Prompt”切换面板填写，默认是通货膨胀信息图示例。
- `imageCount` 默认 2，页面以 1 到 4 张的选项选择图片数量。
- 图片模型固定为 `doubao-seedream-4-5-251128`，可通过 `AI_IMAGE_MODEL` 覆盖，但默认值必须是该模型。

SSE 事件设计：

```ts
type MultimodalStreamEvent =
  | { event: "meta"; data: { textModel: string; imageModel: string } }
  | { event: "title"; data: { text: string } }
  | { event: "outline"; data: { items: string[] } }
  | { event: "body-delta"; data: { text: string } }
  | { event: "image-plan"; data: { images: ImagePlan[] } }
  | { event: "image-status"; data: { index: number; status: "generating" | "failed"; message?: string } }
  | { event: "image"; data: GeneratedImageResult }
  | { event: "done"; data: GeneratedMultimodalDraft }
  | { event: "error"; data: { message: string } };
```

后续正式异步队列版本再新增：

```text
POST /ai/multimodal-generations
GET  /ai/multimodal-generations/:taskId
```

并由 Redis + BullMQ Worker 执行耗时图片生成。

## 5. 前端交互与页面状态设计

### Creator 侧栏

左侧侧栏调整为：

```text
主页
创作  展开/收起
  - 文章工作台
  - 多模态生成
管理  展开/收起
  - 我的内容
  - 草稿箱列表
```

交互要求：

- “创作”默认展开，用户可以收起。
- 当前在 `/creator` 时不强制跳转，点击子项再进入对应工作台。
- 现有“管理”折叠逻辑保留。

### 多模态工作台

页面主体保持现有工作台视觉风格：

- 浅灰应用背景。
- 顶部白色导航栏。
- 左侧白色编辑画布。
- 右侧浅色 AI 创作助手面板。
- 底部粘性保存操作栏。
- 移动端单列，编辑区优先，助手面板下移。

状态设计：

```ts
type MultimodalWorkbenchStatus =
  | "loading"
  | "idle"
  | "planning"
  | "streaming_text"
  | "generating_images"
  | "saving";
```

图片状态：

```ts
type GeneratedImageStatus =
  | "pending"
  | "generating"
  | "completed"
  | "failed";
```

页面行为：

- 用户输入主题后点击“生成图文初稿”。
- 正文先流式展示。
- 图片计划返回后，在正文合适位置显示图片占位。
- 每张图片开始生成时显示“第 N 张图片生成中”。
- 图片成功后插入富文本图片节点，并在右侧展示 caption、prompt 和模型名。
- 单张图片失败时不清空正文，展示失败提示；保存草稿时只保存已完成图片。
- 保存草稿仍使用 `POST /drafts`，进入 `/drafts/:id` 继续编辑。

## 6. 后端服务、鉴权、审核、评分、发布和榜单逻辑

### 多模态编排

后端是多模型编排器，不让文字模型和图片模型直接互相调用。

步骤：

1. 校验登录态和输入。
2. 文字模型生成结构化 JSON：

```json
{
  "title": "上海租界掠影",
  "outline": ["历史背景", "城市风貌", "今日遗存"],
  "bodyText": "约100字正文...",
  "images": [
    {
      "prompt": "近代上海外滩租界街景，历史建筑，写实风格",
      "caption": "外滩一带保留了许多租界时期建筑",
      "alt": "上海外滩租界时期建筑"
    }
  ]
}
```

3. 后端根据 `images` 数组调用图片模型。
4. 图片模型固定使用 `doubao-seedream-4-5-251128`。
5. 后端把正文和图片组合成 `RichTextDocument`。
6. 通过 SSE 持续推送状态和结果。

### 图片生成调用

图片模型配置：

```text
AI_API_KEY=与现有文本模型共用
AI_IMAGE_BASE_URL=可选；默认 https://ark.cn-beijing.volces.com/api/v3/images/generations
AI_IMAGE_MODEL=doubao-seedream-4-5-251128
AI_IMAGE_TIMEOUT_MS=120000
AI_IMAGE_MAX_RETRIES=1
AI_IMAGE_SIZE=可选；默认 2K
```

调用适配层负责：

- 使用 Bearer token。
- 图片生成请求体包含 `model`、`prompt`、`sequential_image_generation: "disabled"`、`response_format: "url"`、`size: "2K"` 和 `stream: false`。
- 处理 provider 的 URL / base64 返回差异。
- 将结果统一为 HTTP 图片 URL。
- 记录 requestId、模型、耗时、状态。
- mock 模式下返回稳定可演示的图片占位结果。

### 审核与发布

现有发布链路保持：

```text
草稿 -> 审核 -> 评分 -> 发布 -> 文章详情 -> 榜单 / 推荐流
```

变化点只在审核内部：

```text
draft.body
  -> 提取纯文本
      -> 文字审核
  -> 提取 image 节点
      -> 图片审核
  -> 聚合裁决
      -> PASS / WARN / BLOCK
```

聚合规则：

- 任一文字或图片结果为 `BLOCK`，最终 `BLOCK`。
- 没有 `BLOCK` 但任一结果为 `WARN`，最终 `WARN`。
- 全部通过才是 `PASS`。

记录方式：

- 文字审核记录：`stage = PUBLISH_PRECHECK_TEXT`
- 图片审核记录：`stage = PUBLISH_PRECHECK_IMAGE`
- 对外 `AuditCheckResponse` 仍返回一个聚合结果，前端发布页不需要大改。

评分逻辑：

- 质量评分继续基于标题和正文文本。
- `safetyScore` 由聚合审核结果决定。
- 发布、撤回、榜单缓存失效、文章详情展示继续沿用现有实现。

## 7. 风险、边界情况和回滚方案

### 风险

- 图片模型接口的真实返回结构可能与文本 chat completions 不同，需要在 provider adapter 内隔离兼容。
- 文生图耗时较长，SSE 连接仍可能被浏览器、代理或平台超时中断。
- 图片 URL 可能有有效期，长期保存草稿和文章时可能需要转存到云存储。
- 图片审核如果需要下载远程图片，会增加发布前耗时。
- 用户要求图片数量过多会增加成本和等待时间，页面固定提供 1 到 4 张选项，后续用 Redis + BullMQ 队列承载长任务和失败重试。
- 图片生成失败时不能阻断正文保存，但需要清楚提示未完成图片不会进入草稿。

### 边界情况

- 用户没有登录：跳转 `/login`。
- `topic` 为空：禁止生成并提示。
- 文字模型没有返回图片计划：仍可展示正文，并提示图片计划失败。
- 某张图片失败：保留正文和其他成功图片。
- 图片审核失败：聚合结果至少按 `WARN` 处理，避免未审核图片直接发布。
- 草稿中没有图片：按普通文章审核链路执行。
- 图片节点缺少 URL：跳过图片审核并记录 WARN 证据。

### 回滚方案

- 新工作台是独立路由，出现问题时可以从 `/creator` 侧栏移除“多模态生成”入口，不影响 `/workspace`。
- 后端新增接口不影响现有 `/ai/generate-article/stream`。
- 发布审核如图片审核不稳定，可临时仅对生成图片 prompt / alt / caption 做文字审核，并保留图片审核待完善提示，但不能绕过最终审核记录。
- 如果图片模型不可用，mock 模式仍应保证演示链路可走通。

## 8. 验证方式和测试计划

实现完成后计划运行：

```text
corepack pnpm --filter @bytecamp-aigc/web test
corepack pnpm --filter @bytecamp-aigc/api test -- src/ai-gateway/ai-gateway.service.spec.ts
corepack pnpm --filter @bytecamp-aigc/api test -- src/ai-gateway/ai-provider.client.spec.ts
corepack pnpm --filter @bytecamp-aigc/api test -- src/publish/publish.service.spec.ts
corepack pnpm typecheck
corepack pnpm --filter @bytecamp-aigc/web build
```

如果实现中不修改 Prisma schema，则不运行迁移；如果后续为了生成任务表或图片持久化修改 schema，需要运行 Prisma schema 校验和迁移。

手动验证：

1. 登录后进入 `/creator`。
2. 展开左侧“创作”，确认出现“文章工作台”和“多模态生成”。
3. 点击“文章工作台”，确认现有 `/workspace` 行为不变。
4. 点击“多模态生成”，进入新工作台。
5. 输入“生成一份关于上海租界的100字小文章，包含2张图片”。
6. 确认正文先生成，图片占位随后进入生成状态。
7. 确认成功图片插入编辑器正文。
8. 保存草稿并进入 `/drafts/:id`。
9. 点击发布前审核，确认文字和图片分别产生审核记录，页面看到聚合审核结果。
10. 审核通过后发布，确认文章详情能展示正文和图片，榜单/推荐流链路不受影响。

## 9. Redis + BullMQ 后续待开发事项

本轮先通过 SSE 做分阶段生成，不引入后台队列。

后续应补充 Redis + BullMQ：

- `POST /ai/multimodal-generations` 只创建任务并返回 `taskId`。
- BullMQ Worker 执行文字规划、图片生成、图片审核、草稿写入。
- Redis 保存任务队列和进度，数据库保存最终任务结果和草稿 ID。
- 前端通过轮询、SSE 或 WebSocket 查询任务进度。
- 支持服务重启后的任务恢复、失败重试、单张图片重试和任务取消。

该事项已同步写入 `.temp/AI-Creator-Hub-作业提交文档.md` 的未来优化方向。

## 10. 初学者学习文档计划

实现完成后新增：

```text
docs/learn/020-multimodal-generation-workbench-learning.md
```

学习文档会按业务闭环解释：

- 多模态生成解决了什么内容创作问题。
- 为什么后端要做模型编排，而不是让前端分别调用文字模型和图片模型。
- 从用户输入到正文生成、图片 prompt 生成、图片模型调用、富文本草稿保存的完整链路。
- React 状态如何表示正文流、图片占位、图片完成和保存草稿。
- Controller、Service、Provider Client、Prompt Builder、DTO 在本功能中的职责。
- 为什么发布前要把文字和图片分开审核。
- 成功路径和失败路径分别发生什么。
- 如何通过页面、接口、数据库记录、类型检查和构建命令验证功能正确。
- 常见误区：前端暴露 AI key、把图片审核混在正文审核里、长时间同步等待、忽略图片 URL 过期、一次生成过多图片。
