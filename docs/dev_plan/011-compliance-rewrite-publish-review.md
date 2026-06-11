# 发布前一键合规改写技术方案

## 1. 功能目标和用户价值

本阶段承接已经完成的草稿编辑、发布前审核、质量评分、AI 正文改写和发布链路，补齐 PRD 与演示脚本中“审核发现风险后，使用一键合规改写，再重新审核发布”的关键闭环。

目标业务链路为：

```text
草稿编辑完成 -> 发布确认页开始审核
  -> 审核结果为 WARN 或 BLOCK
  -> 用户点击一键合规改写
  -> 后端基于草稿正文、审核证据和修改建议生成改写稿
  -> 前端预览改写结果
  -> 用户确认应用到草稿
  -> 重新审核评分
  -> 审核通过后发布
```

用户价值：

- 创作者不只看到“内容有风险”，还能获得可直接参考的安全改写版本，降低修改门槛。
- 审核结果中的证据片段和建议会进入 AI 改写上下文，改写更贴合风险原因，而不是普通润色。
- 高风险内容不会被绕过，应用改写后仍必须重新审核和评分，符合“审核是发布强约束”的架构原则。
- 发布确认页从单纯拦截变成“发现风险 -> 辅助修复 -> 重新审核”的人机协同流程，更适合演示和答辩。
- 前端只负责触发、预览和应用草稿修改，合规改写 Prompt、权限校验、草稿读取和审核记录读取都放在后端。

## 2. 下一步范围选择

### 推荐方案：发布确认页一键合规改写

本阶段实现：

- 新增 `POST /audit/rewrite/stream`，按当前登录用户校验草稿归属，读取草稿正文和最近一次审核记录。
- 后端基于审核证据、风险分类、修改建议和正文内容构造合规改写 Prompt，并以 SSE 返回改写正文与建议。
- 发布确认页 `/publish/[id]` 在 WARN/BLOCK 结果下展示“一键合规改写”入口。
- 改写结果先展示为预览，不自动覆盖草稿。
- 用户点击“应用到草稿”后，前端调用现有 `PATCH /drafts/:id` 保存改写正文，清空当前审核评分结果，并提示重新审核。
- 完成后更新 README 待办，并生成 `docs/learn/011-compliance-rewrite-publish-review-learning.md`。

优点：

- 直接补齐 README 中“一键合规改写能力”和评估方案演示脚本第 10 到 12 步。
- 复用已有审核记录、草稿更新、AI provider、SSE 和富文本转换能力，不需要 Prisma schema 迁移。
- 对发布主链路价值高，能让 WARN/BLOCK 场景从“退回编辑”变成“辅助修复后重审”。
- 审核、AI 和草稿职责边界清晰，前端负责确认和展示，服务端保障审核规则、模型调用和草稿写回安全。

代价：

- 需要新增一个横跨 Audit 与 AI Gateway 的服务编排点。
- 发布确认页状态会更复杂，需要抽取少量纯函数，避免页面继续膨胀。

### 备选方案 A：优先做 Playwright smoke E2E

优点：

- 能提高交付稳定性，覆盖登录、创作、保存草稿、审核、发布、查看详情的核心闭环。
- 对后续开发有回归保护。

代价：

- 不直接补齐产品体验缺口。
- 当前 WARN/BLOCK 后仍只能返回编辑，演示中的“合规改写”仍然缺失。

### 备选方案 B：优先做 Redis 榜单缓存

优点：

- 更贴近技术架构中 Redis Sorted Set 的设计。
- 对榜单性能和生产一致性有帮助。

代价：

- 对当前演示链路的用户感知弱于合规改写。
- 需要处理 Redis 配置、连接失败回退和本地开发环境差异，范围容易扩散到运维配置。

本阶段采用推荐方案。

## 3. 涉及模块

### 前端 `apps/web`

- `apps/web/src/app/publish/[id]/page.tsx`
  - 在审核结果为 WARN 或 BLOCK 时展示合规改写入口。
  - 通过 SSE 接收改写正文和建议。
  - 展示改写预览、应用到草稿、重新审核等状态。
  - 应用改写后调用现有 `PATCH /drafts/:id`，并重新加载草稿预览。
- `apps/web/src/lib/publish-compliance-rewrite.ts`
  - 新增纯函数，封装是否允许合规改写、改写状态文案、SSE done 数据转换和按钮禁用逻辑。
- `apps/web/src/lib/publish-compliance-rewrite.test.ts`
  - 覆盖发布页合规改写相关纯函数。
- `apps/web/src/lib/rich-text-document.ts`
  - 复用 `replaceWithPlainText`，不新增富文本解析方式。

### 后端 `apps/api`

- `apps/api/src/audit/audit.controller.ts`
  - 新增 `POST /audit/rewrite/stream`。
  - 使用 `JwtAuthGuard` 和 `CurrentUser`，不接受前端传入 `authorId`。
  - 使用 SSE 返回 AI 改写过程。
- `apps/api/src/audit/compliance-rewrite.service.ts`
  - 新增合规改写编排服务。
  - 校验当前用户拥有草稿。
  - 读取指定审核记录或最近一次审核记录。
  - 调用 AI Gateway 生成合规改写结果。
- `apps/api/src/audit/compliance-rewrite.service.spec.ts`
  - 覆盖权限、无审核记录、WARN/BLOCK、mock 改写和事件输出。
- `apps/api/src/ai-gateway/ai-gateway.service.ts`
  - 增加 `streamComplianceRewrite`。
  - 复用 mock/live provider 模式。
- `apps/api/src/ai-gateway/ai-gateway.prompts.ts`
  - 增加合规改写 Prompt builder。
  - 复用改写 JSON 解析结构。
- `apps/api/src/ai-gateway/ai-gateway.prompts.spec.ts`
  - 覆盖合规改写 Prompt 包含审核证据、风险分类、修改建议和正文。
- `apps/api/src/common/sse.ts`
  - 可选新增通用 SSE 写入 helper，避免 `AiGatewayController` 和 `AuditController` 重复写 `writeSse` 与 `encodeSseEvent`。

### 共享包 `packages/shared`

- `packages/shared/src/index.ts`
  - 新增合规改写请求、响应和 done 数据类型。
  - 继续复用 `AiStreamEvent`。

### 文档

- `README.md`
  - 实现完成并验证后，勾选“一键合规改写能力”。
  - 若验证确认创作者主页统计和断网本地暂存已经完整，也在同次实现总结中说明是否同步 README。
- `docs/learn/011-compliance-rewrite-publish-review-learning.md`
  - 实现完成后生成本地学习文档，继续保持 `docs/learn/` 不进入 GitHub。

## 4. 需要新增或修改的文件

### 新增文件

- `apps/api/src/audit/compliance-rewrite.service.ts`
- `apps/api/src/audit/compliance-rewrite.service.spec.ts`
- `apps/api/src/common/sse.ts`
- `apps/web/src/lib/publish-compliance-rewrite.ts`
- `apps/web/src/lib/publish-compliance-rewrite.test.ts`
- `docs/learn/011-compliance-rewrite-publish-review-learning.md`，实现完成后生成

### 修改文件

- `packages/shared/src/index.ts`
- `apps/api/src/audit/audit.controller.ts`
- `apps/api/src/audit/audit.module.ts`
- `apps/api/src/ai-gateway/ai-gateway.service.ts`
- `apps/api/src/ai-gateway/ai-gateway.prompts.ts`
- `apps/api/src/ai-gateway/ai-gateway.prompts.spec.ts`
- `apps/api/src/ai-gateway/ai-gateway.controller.ts`
- `apps/web/src/app/publish/[id]/page.tsx`
- `README.md`

### 暂不修改

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/**`
- `apps/api/src/scoring/**`
- `apps/api/src/publish/publish.service.ts` 的发布强约束逻辑
- `apps/api/src/feed/**`
- `apps/api/src/ranking/**`
- `apps/web/src/app/drafts/**`
- `apps/web/src/app/articles/**`

## 5. 数据模型或 API 变更

### 数据模型

本阶段不修改 Prisma schema，复用已有表：

- `drafts`：读取当前草稿标题和正文，应用改写时继续使用现有 `PATCH /drafts/:id`。
- `audit_records`：读取最近一次审核记录，包含 `decision`、`riskLevel`、`categories`、`evidence`、`suggestions` 和 `rawResult`。
- `quality_scores`：不由合规改写直接修改，重新审核评分时由现有流程生成新记录。

合规改写不直接写入数据库。只有用户点击“应用到草稿”后，前端才调用草稿更新接口持久化。

### 共享类型

计划在 `packages/shared/src/index.ts` 增加：

```ts
export interface ComplianceRewriteInput {
  draftId: string;
  auditRecordId?: string;
}

export interface ComplianceRewriteContext {
  title: string;
  bodyText: string;
  audit: AuditResult;
}

export interface ComplianceRewriteDoneData {
  draftId: string;
  auditRecordId: string;
  bodyText: string;
  body: RichTextDocument;
  suggestions: string[];
}
```

说明：

- `draftId` 来自发布页路由，但后端仍按 token 校验归属。
- `auditRecordId` 可选；未传时后端读取该草稿最近一次审核记录。
- `ComplianceRewriteContext` 是 AI Gateway 内部 prompt builder 使用的结构，前端不需要构造审核上下文。
- SSE 过程中继续使用现有事件：
  - `meta`：模型信息。
  - `text-delta`：改写正文增量。
  - `suggestion`：改写建议。
  - `done`：完整正文、富文本结构和建议。
  - `error`：流式错误。

### API 设计

#### `POST /audit/rewrite/stream`

鉴权：需要 `Authorization: Bearer <token>`。

请求：

```json
{
  "draftId": "draft_1",
  "auditRecordId": "audit_1"
}
```

行为：

- 只允许当前用户改写自己的草稿。
- 如果未传 `auditRecordId`，读取当前草稿最近一次审核记录。
- 如果指定 `auditRecordId`，必须属于同一个草稿。
- 没有审核记录时返回 400，提示先执行审核。
- 审核结果为 `PASS` 时返回 400，避免用户误以为必须改写。
- 审核结果为 `WARN` 或 `BLOCK` 时允许生成改写稿，但不会直接发布。
- 模型不可用时，`auto` 模式使用 mock 改写，`live` 模式返回明确错误。

响应示例：

```text
event: meta
data: {"model":"mock-model"}

event: text-delta
data: {"text":"改写后的合规正文片段"}

event: suggestion
data: {"text":"已删除敏感个人信息并降低绝对化表达"}

event: done
data: {
  "draftId": "draft_1",
  "auditRecordId": "audit_1",
  "bodyText": "完整合规正文",
  "body": {"type":"doc","content":[]},
  "suggestions": ["重新审核后再发布"]
}
```

错误：

- 400：草稿未审核、审核已通过无需改写、请求体缺少草稿 ID。
- 401：未登录或 token 无效。
- 404：草稿不存在、审核记录不存在或不属于该草稿。
- 502：AI provider 返回不可解析内容。
- 503：强制 live 模式但模型配置不可用。

#### 应用改写仍使用 `PATCH /drafts/:id`

请求：

```json
{
  "body": { "type": "doc", "content": [] }
}
```

行为：

- 使用现有草稿更新接口保存改写正文。
- 保存后草稿版本号递增。
- 发布页清空旧审核和评分展示，回到 `ready` 状态，提示用户重新审核。

## 6. 前端交互与页面状态设计

发布确认页保持当前双栏结构：

- 左侧：草稿标题和正文预览。
- 右侧：发布前检查、审核结果、质量评分、修改建议和操作按钮。

### 触发入口

当审核结果为 `WARN` 或 `BLOCK`，右侧操作区展示：

- “一键合规改写”主按钮。
- “返回编辑修改”次按钮。

`PASS` 状态不展示合规改写按钮，只展示确认发布。

### 流式改写状态

新增页面状态：

- `rewriteState`：`idle | streaming | ready | applying | applied | error`。
- `rewriteText`：流式累积的改写正文。
- `rewriteSuggestions`：AI 给出的改写说明。
- `rewriteBody`：后端返回的 ProseMirror JSON。
- `rewriteError`：改写失败提示。

交互规则：

- 点击“一键合规改写”后按钮进入加载态，发布按钮保持禁用。
- `text-delta` 到达时，右侧面板逐步展示改写结果。
- 流未结束前，“应用到草稿”按钮禁用。
- 收到 `done` 后展示“应用到草稿”和“重新生成”。
- 用户点击“应用到草稿”后调用 `PATCH /drafts/:id`。
- 应用成功后：
  - 更新左侧草稿正文预览。
  - 清空旧 `audit`、`score`、`publishResult`。
  - 页面状态回到 `ready`。
  - 展示“已应用改写，请重新审核评分后发布”。
- 应用失败时保留改写预览，允许重试保存。

### WARN 与 BLOCK 的差异

- `WARN`：文案强调“建议修改后重新审核”。
- `BLOCK`：文案强调“当前内容禁止发布，改写后仍需重新审核，不能绕过审核”。
- 两者都不允许直接发布改写稿。

### 移动端

- 继续使用当前单列堆叠行为。
- 合规改写预览放在发布前检查区域下方。
- 按钮换行后不能遮挡正文预览。

## 7. 后端服务、鉴权、审核、评分、发布或榜单逻辑

### 鉴权

- `AuditController` 的合规改写接口使用 `JwtAuthGuard`。
- 通过 `CurrentUser("userId")` 获取当前用户。
- 请求体不接受 `authorId`。
- `ComplianceRewriteService` 用 `draftId + authorId` 查询草稿，防止越权改写其他用户内容。

### 合规改写编排

`ComplianceRewriteService.streamComplianceRewrite(userId, input)`：

```text
validate draftId
  -> load draft by draftId + authorId
  -> load audit record by auditRecordId or latest draft audit
  -> reject PASS audit
  -> convert draft.body to plain text
  -> build ComplianceRewriteContext
  -> call AiGatewayService.streamComplianceRewrite(context)
  -> attach draftId and auditRecordId to done event
```

### AI Gateway

新增 `streamComplianceRewrite(context)`：

```text
validate bodyText and audit context
  -> choose live or mock provider
  -> build compliance rewrite messages
  -> parse rewrite JSON
  -> emit text-delta/suggestion events
  -> emit done event with bodyText and RichTextDocument
```

mock 模式要求：

- 不依赖外部 AI。
- 根据审核证据生成可预测的“已替换风险表达”的正文。
- 便于单元测试断言。

live 模式要求：

- Prompt 必须要求模型保留原文结构和主要观点，只处理风险表达、敏感信息和绝对化表述。
- 模型输出必须是 JSON：

```json
{
  "text": "改写后的完整正文",
  "suggestions": ["已处理的风险点"]
}
```

### 审核、评分和发布

本阶段不改变发布强约束：

- 合规改写不会生成文章。
- 合规改写不会修改审核结果。
- 合规改写不会修改质量评分。
- 应用到草稿后必须重新点击“开始审核”，再通过“确认发布”进入现有发布流程。
- `PublishService.publishDraft` 仍然重新执行审核和评分，不能复用旧 PASS 或 WARN 结果。

### 榜单和数据反馈

本阶段不修改 feed、ranking 和 analytics：

- 只有最终发布成功的文章进入信息流和榜单。
- 合规改写过程不产生阅读、点赞、收藏等互动事件。

## 8. 风险、边界情况和回滚方案

| 风险                         | 处理                                                               |
| ---------------------------- | ------------------------------------------------------------------ |
| 高危内容被误认为可绕过       | BLOCK 下明确提示“改写后仍需重新审核”，发布按钮继续禁用             |
| 旧审核记录和新草稿内容不一致 | 应用改写后清空旧审核评分状态，强制重新审核                         |
| 指定的审核记录不属于草稿     | 后端用 `auditRecord.draftId === draft.id` 校验，不匹配返回 404     |
| 没有审核记录就点击改写       | 后端返回 400，前端提示先开始审核                                   |
| 模型改写丢失原文结构         | Prompt 要求保留段落结构，done 数据转换为段落富文本                 |
| 模型返回空文本或非 JSON      | 复用 `AiProviderBadOutputException`，SSE 返回 error 事件           |
| 流式中断                     | 前端保留已收到文本，但不允许应用，提示重试                         |
| 发布页状态过复杂             | 抽取 `publish-compliance-rewrite.ts` 纯函数并补测试                |
| 与普通正文改写重复           | 普通改写用于创作助手，合规改写绑定审核证据和发布重审流程，职责不同 |
| README 勾选早于实现          | 只有实现和验证完成后再更新 README                                  |

回滚方案：

- 移除 `POST /audit/rewrite/stream` 和 `ComplianceRewriteService`。
- 删除 AI Gateway 中合规改写方法和 prompt builder。
- 发布确认页移除一键合规改写 UI，恢复 WARN/BLOCK 仅返回编辑修改。
- 移除新增共享类型和前端 helper。
- 不涉及 Prisma schema 和迁移，数据库无需回滚。

## 9. 验证方式和测试计划

### 后端单元测试

新增 `apps/api/src/audit/compliance-rewrite.service.spec.ts`：

- 当前用户没有该草稿时返回 NotFound。
- 草稿没有审核记录时返回 BadRequest。
- 指定审核记录不属于草稿时返回 NotFound。
- 审核结果为 PASS 时拒绝合规改写。
- 审核结果为 WARN 时返回 meta、text-delta、suggestion、done 事件。
- 审核结果为 BLOCK 时也可生成改写稿，但 done 不包含任何发布状态。
- done 事件包含 `draftId`、`auditRecordId`、`bodyText` 和合法 `RichTextDocument`。

扩展 `apps/api/src/ai-gateway/ai-gateway.prompts.spec.ts`：

- 合规改写 Prompt 包含风险分类、风险等级、证据片段和修改建议。
- 合规改写 Prompt 要求保留主要观点和段落结构。
- 解析空文本时抛出 bad output。

扩展 `apps/api/src/ai-gateway/ai-gateway.service.spec.ts`：

- mock 模式生成稳定合规改写事件。
- live 模式调用 provider 时使用合规改写 messages。
- provider 输出异常时 SSE 产生 error 事件。

### 前端纯函数测试

新增 `apps/web/src/lib/publish-compliance-rewrite.test.ts`：

- `PASS` 状态不允许合规改写。
- `WARN` 和 `BLOCK` 状态允许合规改写。
- 流式进行中禁用应用按钮。
- done 数据缺少 `body` 或 `bodyText` 时视为无效。
- 应用成功后的状态重置为需要重新审核。

### 类型检查

```bash
pnpm typecheck
```

### 构建检查

因为会修改 NestJS controller/service、共享类型和 Next.js 页面，运行：

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
3. 进入工作台生成文章，保存草稿。
4. 在草稿中加入会命中 WARN 或 BLOCK 的风险表达。
5. 进入 `/publish/:id`。
6. 点击“开始审核”，确认显示审核证据和修改建议。
7. 点击“一键合规改写”，确认改写内容逐步出现。
8. 点击“应用到草稿”，确认左侧正文预览更新。
9. 确认旧审核评分结果被清空，页面提示重新审核。
10. 再次点击“开始审核”。
11. 如果审核通过，点击“确认发布”，确认进入文章详情页。
12. 如果仍然 WARN/BLOCK，确认发布按钮仍然不可用。

### 数据库验证

- 一键合规改写本身不新增 `articles`。
- 应用改写后，`drafts.version` 递增。
- 应用改写后，旧 `audit_records` 和 `quality_scores` 保留为历史记录。
- 重新审核后，新 `audit_records` 写入。
- 发布成功后，新文章或文章修订仍由 `publish` 流程生成。

## 10. 与总体架构的一致性

- `apps/web` 只负责发布确认页状态、SSE 展示、改写预览和调用草稿保存接口。
- `apps/api` 负责当前用户鉴权、草稿归属校验、审核记录读取、合规改写 Prompt 编排和 AI 调用。
- `packages/shared` 负责前后端共享 DTO 与 SSE done 数据结构。
- AI 密钥、Prompt 策略、审核证据处理和模型输出解析都保留在后端。
- 合规改写不会绕过审核、评分和发布强约束。
- 页面主体样式继续使用 Tailwind CSS utility class，保持发布后台的克制工具感。

## 11. 实现完成后的学习文档

实现完成后，根据 `AGENTS.md` 生成：

```text
docs/learn/011-compliance-rewrite-publish-review-learning.md
```

学习文档面向第一次做全栈应用的初学者，重点解释：

- 这个功能解决了什么业务问题：为什么审核发现风险后不能只给错误提示，还要提供可修复路径。
- 用户从发布页点击审核、看到 WARN/BLOCK、触发合规改写、应用到草稿、重新审核、最终发布的完整链路。
- `publish/[id]/page.tsx`、`AuditController`、`ComplianceRewriteService`、`AiGatewayService`、`ai-gateway.prompts.ts`、`Draft`、`AuditRecord` 和共享 DTO 分别承担什么责任。
- 为什么合规改写必须由后端读取审核记录，而不是让前端把风险片段拼成 Prompt。
- 为什么改写完成后仍然必须重新审核和评分。
- 成功路径和失败路径分别发生什么。
- 初学者需要重点理解的 React 状态、SSE、Controller、Service、Prisma relation、JWT Guard、DTO、Prompt builder、mock/live provider。
- 如何通过页面、接口、数据库、类型检查、测试和构建命令验证功能正确。
- 常见误区：把合规改写当作审核通过、前端暴露 Prompt 和模型密钥、改写后不保存草稿、保存后不重新审核、BLOCK 内容绕过发布限制。
