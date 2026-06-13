# 多模态工作台 Redis + BullMQ 技术方案

## 1. 功能目标和用户价值

本轮开发目标是把现有多模态生成工作台从“一次 HTTP/SSE 请求内串行完成正文规划和图片生成”，升级为“Redis + BullMQ 承载长任务”的异步生成链路。

现有 `docs/dev_plan/020-multimodal-generation-workbench.md` 明确将 Redis + BullMQ 列为后续待开发事项；本方案作为 `020` 的队列化升级方案，正式将该能力纳入本轮实现。

用户价值：

- 多模态生成涉及文本规划、图片生成、图片转存，耗时明显长于普通文章生成。使用 BullMQ 后，请求不再长时间占用浏览器连接，页面刷新或短暂离开后仍能恢复任务进度。
- 图片生成失败可以按单张图片记录失败原因，不影响正文和其他成功图片。
- Redis 队列能支持失败重试、并发控制、任务取消和后续扩展 Worker 独立部署。
- 前端仍保持今日头条发布页参考风格：左侧编辑画布、右侧 AI 助手、底部操作栏，不把 AI 密钥、图片生成、审核裁决放到前端。
- 生成完成后仍由用户确认并保存草稿，后续发布前审核、质量评分、发布和榜单分发沿用现有闭环。

目标业务链路：

```text
用户进入 /multimodal-workspace
  -> 输入图文需求、受众、风格、图片 Prompt、图片数量
  -> POST /ai/multimodal-generations 创建 BullMQ 任务
  -> API 返回 taskId
  -> Worker 执行文本规划、图片生成、图片转存
  -> 前端轮询 GET /ai/multimodal-generations/:taskId
  -> 页面按任务进度展示标题、正文、图片计划、单张图片状态
  -> 任务完成后回填可编辑富文本正文
  -> 用户保存为草稿
  -> 草稿编辑、发布前审核、质量评分、发布和榜单链路保持一致
```

本轮不把生成任务直接变成已保存草稿。原因是当前多模态工作台已有“本地暂存、用户确认、保存草稿”的产品行为，队列化只改变生成执行方式，不改变用户是否保存的决策权。

## 2. 涉及模块

### 前端 `apps/web`

- `apps/web/src/app/multimodal-workspace/page.tsx`
  - 生成请求从 `POST /ai/generate-multimodal/stream` 改为 `POST /ai/multimodal-generations`。
  - 新增 `taskId`、任务状态、轮询状态、取消状态和恢复提示。
  - 根据任务查询结果更新标题、大纲、正文、图片状态和最终富文本。
  - 保留现有本地暂存、保存草稿、素材插入、AI 助手和离开确认逻辑。
- `apps/web/src/lib/multimodal-task.ts`
  - 新增任务状态归一化、轮询间隔、任务结果到页面状态的纯函数，便于测试。
- `apps/web/src/lib/multimodal-generated-body.ts`
  - 继续负责把正文和成功图片组合成 ProseMirror JSON。

### 后端 `apps/api`

- `ai-gateway`
  - 新增队列化多模态任务 API。
  - 抽取现有 `streamMultimodalDraft` 内的生成编排能力为可被 Worker 调用的服务方法。
  - 保留现有图片模型调用、图片转存和 mock 生成能力。
- 新增 `multimodal-generation` 队列能力，建议放在 `apps/api/src/ai-gateway/` 下，避免新增跨模块业务边界：
  - Queue Service：负责创建任务、读取任务、取消任务、映射 BullMQ 状态。
  - Worker Processor：负责执行文本规划、图片生成、图片转存、进度更新和失败处理。
  - Queue Module 或直接注册在 `AiGatewayModule`：复用 `AiGatewayService`、`ConfigService`、`PromptsService`、`GeneratedImageStorageService`。
- Redis
  - BullMQ 使用 `REDIS_URL` 建立连接。
  - 现有 `RankingCacheService` 和 `NewsCacheService` 保持不变，本轮不混用业务缓存 key 和 BullMQ 内部 key。

### 共享包 `packages/shared`

- 新增多模态任务输入、任务状态、任务进度、任务响应和取消响应类型。
- 保留已有 `GenerateMultimodalInput`、`GeneratedMultimodalDraft`、`MultimodalImageResult` 类型，减少前端和 Worker 重复定义。

## 3. 需要新增或修改的文件

### 新增文件

- `apps/api/src/ai-gateway/multimodal-generation.queue.ts`
  - BullMQ queue 名称、job name、Redis 连接配置、任务配置常量。
- `apps/api/src/ai-gateway/multimodal-generation-queue.service.ts`
  - 创建任务、查询任务、取消任务、映射返回 DTO。
- `apps/api/src/ai-gateway/multimodal-generation.worker.ts`
  - BullMQ Worker，执行多模态生成并写入 `job.updateProgress()`。
- `apps/api/src/ai-gateway/multimodal-generation.types.ts`
  - 后端内部 job data、progress、return value 类型。
- `apps/api/src/ai-gateway/multimodal-generation-queue.service.spec.ts`
  - 覆盖任务创建、无 Redis 降级错误、任务归属校验、状态映射。
- `apps/api/src/ai-gateway/multimodal-generation.worker.spec.ts`
  - 覆盖 Worker 成功路径、单张图片失败、整体失败、进度上报。
- `apps/web/src/lib/multimodal-task.ts`
  - 前端任务状态归一化和轮询辅助。
- `apps/web/src/lib/multimodal-task.test.ts`
  - 覆盖队列状态到页面状态的转换。
- `docs/learn/024-multimodal-workbench-redis-bullmq-learning.md`
  - 实现完成后的初学者学习复盘文档。

### 修改文件

- `apps/api/package.json`
  - 新增依赖 `bullmq`。
- `apps/api/src/ai-gateway/ai-gateway.module.ts`
  - 注册 Queue Service 和 Worker。
- `apps/api/src/ai-gateway/ai-gateway.controller.ts`
  - 新增任务创建、任务查询、任务取消接口。
- `apps/api/src/ai-gateway/ai-gateway.service.ts`
  - 抽取 `generateMultimodalDraftWithProgress()`，供 Worker 和旧 SSE 接口复用。
  - 旧 `streamMultimodalDraft()` 可暂时保留，作为回滚入口和测试兼容，不再作为页面默认路径。
- `apps/api/src/ai-gateway/ai-gateway.service.spec.ts`
  - 更新多模态生成测试，覆盖抽取后的进度回调。
- `packages/shared/src/index.ts`
  - 新增任务 DTO 和状态枚举。
- `apps/web/src/app/multimodal-workspace/page.tsx`
  - 改为创建任务并轮询进度。
  - 生成中禁用重复提交，展示任务状态和取消入口。
  - 任务完成后回填现有编辑器。
- `apps/web/src/lib/api.ts`
  - 如现有封装已满足需求，则不改；否则补充 DELETE 请求调用支持。
- `docs/architecture.md`
  - 更新 Redis 设计，补充 BullMQ 多模态长任务队列 key 与 Worker 说明。
- `.env.example` 或项目已有环境变量文档
  - 补充 `MULTIMODAL_QUEUE_CONCURRENCY`、`MULTIMODAL_TASK_RETENTION_SECONDS` 等可选配置。

### 暂不修改

- `apps/web/src/app/workspace/page.tsx`
- 普通文章生成接口 `/ai/generate-article/stream`
- 草稿、发布、榜单的核心数据模型
- Prisma schema

本轮默认不新增 Prisma 迁移。BullMQ job id、progress、returnvalue 和失败原因存放在 Redis 中，任务完成结果由用户保存为草稿后进入 PostgreSQL。如果后续需要“生成任务历史列表”或“任务结果永久可追溯”，再新增数据库任务表。

## 4. 数据模型或 API 变更

### 依赖与环境变量

新增依赖：

```text
bullmq
```

复用现有：

```text
REDIS_URL
```

新增可选环境变量：

```text
MULTIMODAL_QUEUE_CONCURRENCY=1
MULTIMODAL_TASK_REMOVE_ON_COMPLETE_SECONDS=86400
MULTIMODAL_TASK_REMOVE_ON_FAIL_SECONDS=604800
MULTIMODAL_TASK_POLL_INTERVAL_MS=1500
```

### Redis / BullMQ

队列：

```text
Queue name: ai-multimodal-generation
Job name: generate
```

Job data：

```ts
interface MultimodalGenerationJobData {
  userId: string;
  input: GenerateMultimodalInput;
  createdAt: string;
}
```

Job progress：

```ts
interface MultimodalGenerationProgress {
  stage:
    | "queued"
    | "planning"
    | "text_ready"
    | "generating_images"
    | "completed"
    | "failed"
    | "cancelled";
  percent: number;
  textModel?: string;
  imageModel?: string;
  title?: string;
  outline?: string[];
  bodyText?: string;
  images: Array<{
    index: number;
    prompt: string;
    caption: string;
    alt: string;
    status: "pending" | "generating" | "completed" | "failed";
    url?: string;
    model?: string;
    message?: string;
  }>;
  updatedAt: string;
}
```

Job returnvalue：

```ts
interface MultimodalGenerationReturnValue {
  result: GeneratedMultimodalDraft;
  completedAt: string;
}
```

### API

新增任务创建接口：

```text
POST /ai/multimodal-generations
```

请求体沿用：

```ts
GenerateMultimodalInput
```

响应：

```ts
interface CreateMultimodalGenerationTaskResponse {
  taskId: string;
  status: "queued";
  pollUrl: string;
}
```

新增任务查询接口：

```text
GET /ai/multimodal-generations/:taskId
```

响应：

```ts
interface MultimodalGenerationTaskResponse {
  taskId: string;
  status:
    | "queued"
    | "active"
    | "completed"
    | "failed"
    | "cancelled"
    | "not_found";
  progress: MultimodalGenerationProgress;
  result?: GeneratedMultimodalDraft;
  failedReason?: string;
  createdAt?: string;
  finishedAt?: string;
}
```

新增任务取消接口：

```text
DELETE /ai/multimodal-generations/:taskId
```

响应：

```ts
interface CancelMultimodalGenerationTaskResponse {
  taskId: string;
  status: "cancelled" | "completed" | "failed" | "not_found";
  message: string;
}
```

接口鉴权规则：

- 三个接口均使用 `JwtAuthGuard`。
- 任务查询和取消必须校验 `job.data.userId === currentUserId`。
- 不允许用户读取或取消其他用户任务。
- Redis 未配置或不可用时，创建任务返回明确错误，不回退到前端直接调模型。

## 5. 前端交互与页面状态设计

页面整体布局不变：

- 浅灰应用背景。
- 顶部白色导航栏。
- 主体左右双栏，左侧白色编辑画布，右侧浅色 AI 创作助手面板。
- 底部粘性操作栏。
- 移动端单列，编辑区优先，AI 助手下移。

页面状态从当前状态扩展为：

```ts
type MultimodalWorkbenchStatus =
  | "loading"
  | "idle"
  | "queued"
  | "planning"
  | "text_ready"
  | "generating_images"
  | "completed"
  | "saving"
  | "failed";
```

交互流程：

1. 用户点击“生成图文初稿”。
2. 前端调用 `POST /ai/multimodal-generations`。
3. 返回 `taskId` 后：
   - 保存到 React state。
   - 写入 `localStorage`，字段可加入现有本地草稿对象。
   - 进入轮询状态。
4. 每 1.5 秒调用 `GET /ai/multimodal-generations/:taskId`：
   - `queued`：显示“任务排队中”。
   - `active + planning`：显示“正在理解需求并规划图文结构”。
   - `active + text_ready`：回填标题、大纲、正文。
   - `active + generating_images`：展示每张图片状态。
   - `completed`：回填最终 `GeneratedMultimodalDraft`，停止轮询。
   - `failed`：展示失败原因，保留已返回的进度内容。
5. 用户可以在任务完成后继续编辑并点击“保存草稿”。
6. 用户点击“取消生成”时调用 DELETE 接口：
   - 如果任务仍在等待或活动中，取消后停止轮询。
   - 如果任务已完成，则提示已完成，保留结果。

页面恢复：

- 刷新页面时，如果本地草稿中存在未完成 `taskId`，自动查询任务状态。
- 如果任务已完成，回填结果并允许保存草稿。
- 如果任务已过期或不存在，提示“任务结果已过期，请重新生成”，不清空用户已编辑内容。

错误处理：

- 创建任务失败：保持 `idle`，展示错误。
- 查询任务失败：短暂网络错误可重试 3 次；连续失败后停止轮询，保留 `taskId` 和本地内容。
- 单张图片失败：右侧图片状态标记为失败，正文和成功图片保留。
- 整体失败：展示失败原因，可重新生成。

## 6. 后端服务、鉴权、审核、评分、发布和榜单逻辑

### 队列服务

`MultimodalGenerationQueueService` 负责：

- 初始化 BullMQ `Queue`。
- `createTask(userId, input)` 创建 job。
- `getTask(userId, taskId)` 读取 job 状态、progress、returnvalue 和失败原因。
- `cancelTask(userId, taskId)` 取消等待中的任务，或对运行中任务设置取消标记。
- Redis 不可用时返回 `ServiceUnavailableException`。

BullMQ 配置建议：

```ts
defaultJobOptions: {
  attempts: 2,
  backoff: { type: "exponential", delay: 3000 },
  removeOnComplete: { age: 86400 },
  removeOnFail: { age: 604800 },
}
```

### Worker 执行

`MultimodalGenerationWorker` 负责：

1. 接收 job data。
2. `job.updateProgress({ stage: "planning", percent: 10 })`。
3. 调用 AI Gateway 生成多模态规划。
4. 上报 `text_ready`，包含标题、大纲和正文。
5. 上报图片计划，所有图片先设为 `pending`。
6. 逐张调用图片模型和转存服务：
   - 开始前设为 `generating`。
   - 成功后设为 `completed`，写入 URL 和模型名。
   - 失败后设为 `failed`，写入失败原因。
7. 组装 `GeneratedMultimodalDraft`。
8. `job.updateProgress({ stage: "completed", percent: 100 })`。
9. 返回 `returnvalue`。

并发策略：

- 默认 `MULTIMODAL_QUEUE_CONCURRENCY=1`，避免本地演示时图片生成并发过高。
- 后续可以单独扩展为图片子队列，但本轮保持一个 job 内顺序处理 1 到 4 张图片。

取消策略：

- 等待中的任务直接 `job.remove()`。
- 运行中的任务无法强行中断正在进行的外部模型请求，本轮采用“协作式取消”：
  - Job data 写入 `cancelRequested`，并通过 `job.updateProgress()` 标记取消状态。
  - Worker 在文本规划完成、每张图片生成前检查取消标记。
  - 如果已取消，停止后续步骤并将进度设为 `cancelled`。

### AI Gateway 复用

现有 `AiGatewayService.streamMultimodalDraft()` 内已有：

- mock 多模态规划。
- live 文本规划。
- 图片模型调用。
- 生成图片转存。
- 富文本组装。

本轮不复制这套逻辑，而是抽取为：

```ts
generateMultimodalDraftWithProgress(
  input: GenerateMultimodalInput,
  userId: string,
  reporter?: MultimodalGenerationProgressReporter,
): Promise<GeneratedMultimodalDraft>
```

旧 SSE 接口可以调用该方法并把 progress 翻译成 SSE 事件，暂时保留作为回滚入口。前端默认改用队列接口。

### 审核、评分、发布和榜单

本轮不改变发布链路。

已有 `PublishService` 已经支持：

```text
draft.body
  -> 提取纯文本
  -> 文字审核
  -> 提取 image 节点
  -> 图片审核
  -> 聚合 PASS / WARN / BLOCK
  -> 评分
  -> 发布
  -> 榜单缓存失效
```

队列生成只负责生成 `GeneratedMultimodalDraft`。用户保存后，草稿依然通过现有发布前审核和评分链路进入发布闭环。

质量评分仍基于标题和正文文本，合规安全分继续由发布前聚合审核结果影响。

榜单排序、Redis Sorted Set 缓存和 `ranking_snapshots` 不受影响。

## 7. 风险、边界情况和回滚方案

### 风险

- BullMQ 依赖 Redis，可用性从“可选缓存”升级为“多模态生成必需依赖”。本轮需要清楚提示 Redis 未配置时无法创建任务。
- Worker 与 API 同进程部署简单，但生产环境中长任务可能影响 API 响应。后续可以把 Worker 独立成单独进程。
- BullMQ job result 不是永久存储，任务完成结果会按保留策略过期。用户应及时保存草稿。
- 运行中任务无法立即中断外部图片模型请求，只能在步骤边界协作式取消。
- 单个 job 顺序生成图片更稳定，但总耗时会比并发生成更长。
- 如果 Redis 被清空，未保存的生成结果会丢失；已保存草稿不受影响。

### 边界情况

- 未登录：API 返回 401，前端跳转登录。
- `topic` 为空：创建任务前端禁用按钮，后端仍校验并返回 400。
- Redis 未配置：创建任务返回 503，前端提示“多模态队列服务未启用”。
- 任务不存在或过期：查询返回 `not_found`，前端允许重新生成。
- 任务属于其他用户：返回 404 或 403，不暴露任务存在性。
- Worker 生成文本成功但图片全部失败：任务可完成，结果只包含正文和失败图片状态；保存草稿只保存正文和成功图片。
- Worker 整体失败：任务状态为 `failed`，前端展示失败原因并允许重新生成。
- 页面刷新：根据本地 `taskId` 恢复查询。
- 草稿保存失败：不影响队列结果，前端保留本地生成内容。

### 回滚方案

- 保留旧 `POST /ai/generate-multimodal/stream`，页面如遇严重问题可切回 SSE 路径。
- `/workspace` 普通文章工作台不受影响。
- 新增队列文件集中在 `ai-gateway` 模块，撤回时可以只移除新 API 和页面调用。
- 不修改 Prisma schema，回滚不涉及数据库迁移。
- 已保存草稿仍是标准 `drafts.body` 富文本 JSON，不依赖 BullMQ。

## 8. 验证方式和测试计划

实现完成后计划运行：

```text
corepack pnpm --filter @bytecamp-aigc/api test -- src/ai-gateway/multimodal-generation-queue.service.spec.ts
corepack pnpm --filter @bytecamp-aigc/api test -- src/ai-gateway/multimodal-generation.worker.spec.ts
corepack pnpm --filter @bytecamp-aigc/api test -- src/ai-gateway/ai-gateway.service.spec.ts
corepack pnpm --filter @bytecamp-aigc/web test -- src/lib/multimodal-task.test.ts
corepack pnpm typecheck
corepack pnpm --filter @bytecamp-aigc/web build
```

如果实现中不修改 Prisma schema，则不运行迁移；如实际实现中新增任务表，需要补充 Prisma 迁移和 schema 校验。

手动验证：

1. 启动 PostgreSQL 和 Redis。
2. 启动 API 和 Web。
3. 登录后进入 `/multimodal-workspace`。
4. 输入“生成一份关于上海租界的100字小文章，包含2张图片”。
5. 点击“生成图文初稿”，确认页面进入排队或规划状态。
6. 确认前端不再等待长 SSE，而是通过 `taskId` 轮询任务。
7. 观察标题、大纲、正文先回填。
8. 观察右侧图片状态从等待、生成中到完成或失败。
9. 刷新页面，确认可通过本地 `taskId` 恢复任务状态。
10. 任务完成后保存草稿，进入 `/drafts/:id`。
11. 发布前审核，确认文字和图片仍分别产生审核记录并聚合结果。
12. 发布通过后，确认文章详情展示正文和图片，榜单链路不受影响。

## 9. 初学者学习文档计划

实现完成后新增：

```text
docs/learn/024-multimodal-workbench-redis-bullmq-learning.md
```

学习文档会用初学者视角解释：

- 为什么多模态生成适合用队列，而普通文章生成可以继续用 SSE。
- Redis 在 BullMQ 中承担什么职责。
- Queue、Job、Worker、Progress、ReturnValue 分别是什么。
- 用户点击按钮后，从前端创建任务、后端入队、Worker 调模型、前端轮询、保存草稿的完整链路。
- React 状态如何表示排队、规划、生成图片、完成和失败。
- Controller、Queue Service、Worker、AiGatewayService、Provider Client、Drafts API 分别负责什么。
- 为什么不能把 AI key 或图片生成逻辑放到前端。
- 成功路径和失败路径分别发生什么。
- 如何通过页面、接口、Redis、数据库、类型检查和构建命令验证功能正确。
- 常见误区：把 Redis 当永久数据库、运行中任务误以为能瞬间取消、任务完成后不保存草稿、Worker 和 API 职责混在一起。
