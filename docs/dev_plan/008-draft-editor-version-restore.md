# 草稿编辑器增强与版本回滚技术方案

## 1. 功能目标和用户价值

本阶段承接已经完成的 AI 生成、草稿保存、审核评分、发布和分发链路，回到 PRD 中仍未完全闭合的 P0 编辑器能力：

```text
草稿编辑 -> 富文本排版 -> 自动保存/本地暂存 -> 版本记录 -> 选择历史版本 -> 回滚并继续编辑
```

用户价值：

- 创作者可以在草稿页完成更接近真实发布后台的排版操作，而不是只编辑普通段落。
- 自动保存、断网暂存和版本记录从“可展示”升级为“可恢复、可回滚”的稳定编辑闭环。
- 当用户误删正文或改坏内容时，可以从历史版本恢复，降低编辑风险。
- 后续发布审核继续读取草稿当前态，不会绕过审核、评分和发布强约束。

## 2. 下一步范围选择

### 推荐方案：编辑器工具栏增强 + 版本回滚 + 保存状态收口

本阶段实现：

- 完善 TipTap 工具栏，补齐加粗、斜体、下划线、标题、引用、无序列表、有序列表、分割线、链接、图片 URL 插入等基础操作。
- 将当前“图片 / 链接 / 表情 / 更多”静态文字改为真实按钮或明确禁用入口。
- 新增 `POST /drafts/:id/restore`，允许当前作者把某个 `draft_versions` 快照恢复为草稿当前态。
- 版本记录从只读列表升级为可预览、可回滚的交互区。
- 优化自动保存和本地暂存状态文案，明确区分“已保存到服务器”和“已暂存到本地”。
- 实现完成后补充 `docs/learn/008-draft-editor-version-restore-learning.md`，面向初学者解释编辑器、自动保存、localStorage、版本记录和回滚链路。

优点：

- 直接补齐 README 待开发事项中的“富文本工具栏”和“版本回滚 API / 页面操作”。
- 改动集中在 `drafts`、编辑器组件和共享类型，不影响模型、审核、发布和榜单。
- 可形成一个适合演示的业务闭环：改坏内容 -> 查看历史版本 -> 恢复 -> 保存 -> 发布。

代价：

- 需要同时处理 TipTap 扩展、前端状态和后端事务。
- 图片插入本阶段只支持 URL 图片，不做文件上传；真实素材上传仍留给后续素材模块。

### 备选方案 A：只做富文本工具栏增强

优点：

- 前端改动小，能快速提升编辑体验。

代价：

- 版本记录仍只能看不能用，PRD 中“版本管理”链路仍不完整。
- 对误操作恢复的用户价值有限。

### 备选方案 B：只做版本回滚 API 和 UI

优点：

- 后端职责清晰，数据闭环更稳。

代价：

- 编辑器工具仍偏演示级，PRD 中“加粗、列表、引用、图片”等基础编辑能力没有补齐。

### 备选方案 C：一次性做素材上传、图片管理和多媒体合规

优点：

- 图片能力更完整。

代价：

- 会引入文件存储、素材审核和上传安全边界，范围超过当前编辑器闭环。
- PRD 将多媒体素材列为 P1，多模态列为 P2，不应阻塞当前 P0 编辑器能力。

本阶段采用推荐方案。

## 3. 涉及模块

### 前端 `apps/web`

- `apps/web/src/components/editor/rich-text-editor.tsx`：增强 TipTap 扩展和工具栏按钮。
- `apps/web/src/app/drafts/[id]/page.tsx`：新增版本预览、回滚确认、回滚中状态和保存状态收口。
- `apps/web/src/lib/api.ts`：如有复用价值，补充轻量 API helper；否则页面内继续使用 `apiFetch`。
- 页面主体样式继续使用 Tailwind CSS utility class，保持今日头条发布后台风格。

### 后端 `apps/api`

- `apps/api/src/drafts/drafts.controller.ts`：新增 `POST /drafts/:id/restore`。
- `apps/api/src/drafts/drafts.service.ts`：新增 `restoreVersion()`，校验草稿归属和版本归属后恢复快照。
- `apps/api/src/drafts/drafts.service.spec.ts`：新增版本回滚服务测试。
- 继续使用 `JwtAuthGuard` 和 `PrismaService`。

### 共享包 `packages/shared`

- 新增 `RestoreDraftVersionInput`、`RestoreDraftVersionResponse` 或复用 `DraftDetail` 返回结构。
- 如编辑器新增图片节点和链接 mark，需要扩展 `RichTextNode` 的 attrs 说明，但不改变 ProseMirror JSON 基础结构。

## 4. 需要新增或修改的文件

### 新增文件

- `apps/api/src/drafts/drafts.service.spec.ts`
- `apps/web/src/lib/draft-offline-state.ts`
- `apps/web/src/lib/draft-offline-state.test.ts`
- `docs/learn/008-draft-editor-version-restore-learning.md`（实现完成后生成，本地学习文档，不上传 GitHub）

### 修改文件

- `packages/shared/src/index.ts`
- `apps/api/src/drafts/drafts.controller.ts`
- `apps/api/src/drafts/drafts.service.ts`
- `apps/web/src/components/editor/rich-text-editor.tsx`
- `apps/web/src/app/drafts/[id]/page.tsx`
- `apps/web/package.json`
- `pnpm-lock.yaml`
- `README.md`

### 暂不修改

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/**`
- `apps/api/src/ai-gateway/**`
- `apps/api/src/audit/**`
- `apps/api/src/scoring/**`
- `apps/api/src/publish/**`
- `apps/api/src/feed/**`
- `apps/api/src/ranking/**`
- `apps/api/src/analytics/**`

## 5. 数据模型或 API 变更

### 数据模型

本阶段不修改 Prisma schema，复用现有表：

- `drafts`
- `draft_versions`

原因：

- `draft_versions` 已经保存每次草稿保存的 `title`、`snapshot` 和 `version`。
- 回滚只需要把某条历史快照写回 `drafts` 当前态，并追加一条新的版本记录。
- 不新增迁移可以降低实现和回滚成本。

### 共享类型

计划在 `packages/shared/src/index.ts` 增加：

```ts
export interface RestoreDraftVersionInput {
  versionId: string;
}

export interface RestoreDraftVersionResponse extends DraftDetail {
  restoredFromVersion: number;
}
```

### API 设计

#### `POST /drafts/:id/restore`

鉴权：需要 `Authorization: Bearer <token>`。

请求：

```json
{
  "versionId": "draft_version_id"
}
```

行为：

- 后端根据当前用户和 `draftId` 查询草稿，确保只能恢复自己的草稿。
- 查询 `draft_versions`，确保 `versionId` 属于同一个 `draftId`。
- 将历史版本的 `title` 和 `snapshot` 写回 `drafts` 当前态。
- `drafts.version` 自增。
- 追加一条新的 `draft_versions`，记录“回滚后的当前版本”。
- 返回恢复后的 `DraftDetail` 和 `restoredFromVersion`。

响应：

```json
{
  "id": "draft_id",
  "title": "历史版本标题",
  "status": "DRAFT",
  "mode": "FAST",
  "version": 8,
  "updatedAt": "2026-06-05T10:00:00.000Z",
  "createdAt": "2026-06-04T10:00:00.000Z",
  "body": {
    "type": "doc",
    "content": []
  },
  "restoredFromVersion": 3
}
```

错误：

- 400：缺少 `versionId`。
- 401：未登录或 token 无效。
- 404：草稿不存在、草稿不属于当前用户、版本不存在或版本不属于该草稿。
- 409：草稿已经发布，暂不允许直接回滚已发布草稿；后续二次编辑阶段再处理发布后修订。

## 6. 前端交互与页面状态设计

### 编辑器工具栏

工具栏保持克制的发布后台风格，使用 36px 左右的图标/文字按钮、细边框 hover 和红色激活态。

新增或完善按钮：

- 撤销、重做。
- 标题二级。
- 加粗、斜体、下划线。
- 引用。
- 无序列表、有序列表。
- 分割线。
- 链接：点击后输入 URL，对选中文本设置链接；未选中文本时提示先选择文字。
- 图片：点击后输入图片 URL，插入图片节点；本阶段不做本地文件上传。

依赖策略：

- 继续使用 `@tiptap/starter-kit`。
- 如当前依赖中可用，新增 `@tiptap/extension-link`、`@tiptap/extension-underline`、`@tiptap/extension-image`。
- 若安装 `@tiptap/extension-image` 因网络受限无法完成，则保留图片按钮为禁用状态，并在 README 和学习文档说明图片上传进入素材模块阶段。

### 草稿编辑页保存状态

现有状态基础上细化：

- `loading`：草稿加载中。
- `idle`：草稿已保存到服务器。
- `dirty`：有未保存修改。
- `saving`：正在保存到服务器。
- `localSaved`：接口失败或断网，内容已暂存到本地。
- `restoring`：正在回滚历史版本。
- `error`：加载、保存或回滚失败。

交互规则：

- 自动保存仍按 30 秒触发，仅在 `dirty` 且不在 `saving/restoring` 时执行。
- 手动保存成功后清除对应草稿的本地暂存。
- 保存失败时写入 localStorage，并展示“已暂存到本地，恢复网络后请点击保存”。
- 页面加载时检测 localStorage，有本地暂存则展示恢复提示。
- 恢复本地内容只改变页面状态，不立即覆盖服务器；用户仍需手动保存。

### 版本记录与回滚

右侧助手面板中的“版本记录”升级为：

- 列表展示版本号、保存时间、标题摘要。
- 点击版本项可展开预览，展示标题和正文纯文本摘要。
- 点击“恢复此版本”前弹出确认，说明当前未保存修改可能被覆盖。
- 回滚成功后：
  - 标题和正文更新为历史版本内容。
  - 当前草稿版本号更新为最新版本。
  - `dirty` 变为 false，因为服务器当前态已经恢复成功。
  - 重新加载版本列表，顶部出现新版本记录。
- 回滚失败时保持当前编辑内容不变。

### 发布入口保护

- 有未保存修改、正在保存、正在回滚、存在本地未同步内容时，禁用“预览并发布”。
- 提示用户先保存到服务器，再进入发布审核。
- 后端发布接口仍会重新读取服务器草稿当前态并执行审核、评分和发布，不信任前端状态。

## 7. 后端服务、鉴权、审核、评分、发布或榜单逻辑

### 鉴权

- `POST /drafts/:id/restore` 继续使用 `JwtAuthGuard`。
- 控制器只读取当前用户 id、草稿 id 和版本 id。
- 前端不得传入 authorId、目标版本号或草稿状态。

### 草稿服务

`DraftsService.restoreVersion()` 伪流程：

```text
load draft by { id, authorId }
  -> if not found: 404
  -> if draft.status = PUBLISHED: 409
  -> load draftVersion by { id: versionId, draftId }
  -> if not found: 404
  -> update draft title/body and increment version
  -> create new draft_versions snapshot with incremented version
  -> return restored DraftDetail + restoredFromVersion
```

事务要求：

- 更新 `drafts` 和追加 `draft_versions` 必须放在同一个 Prisma transaction 中。
- 事务失败时不能只更新当前态而漏写版本记录。

### 审核、评分、发布和榜单

本阶段不修改这些模块。

- 回滚后的草稿如果要发布，仍走 `/publish/:draftId`。
- 审核裁决、质量评分和发布状态仍在后端完成。
- 榜单只读取已发布文章，不受草稿回滚直接影响。

## 8. 风险、边界情况和回滚方案

| 风险 | 处理 |
| --- | --- |
| 用户回滚他人草稿版本 | 后端同时校验草稿作者和版本所属草稿 |
| 回滚已发布草稿导致文章快照不一致 | 本阶段对 `PUBLISHED` 草稿返回 409，二次编辑阶段再设计发布后修订 |
| 回滚时有未保存本地修改 | 前端确认提示；未确认不发送请求 |
| 回滚事务中途失败 | 使用 Prisma transaction，失败时保持草稿当前态不变 |
| 自动保存与回滚同时发生 | 前端 `restoring` 时暂停自动保存，后端按事务保证一致性 |
| 版本列表过多 | 继续沿用最近 20 条，后续可分页 |
| 图片 URL 无效 | 前端只插入 URL，图片加载失败由浏览器显示破图；后续素材模块做上传和校验 |
| 链接 URL 危险 | 前端要求 `http/https`，后端发布审核后续仍可检查正文链接 |
| localStorage 不可用 | 工具函数捕获异常，页面仍可编辑和保存服务器 |
| 新增 TipTap 扩展安装失败 | 先完成版本回滚和已有 StarterKit 工具，图片扩展降级为禁用入口 |

回滚方案：

- 删除 `POST /drafts/:id/restore` 控制器入口和 `restoreVersion()`。
- 恢复版本记录为只读展示。
- 移除新增编辑器扩展和按钮。
- README 待开发清单恢复对应未完成状态。
- 不涉及 Prisma schema，回滚无需数据库迁移。

## 9. 验证方式和测试计划

### 后端服务测试

新增 `apps/api/src/drafts/drafts.service.spec.ts`，覆盖：

- 当前作者可以恢复自己的历史版本。
- 恢复后 `drafts.version` 自增。
- 恢复后追加新的 `draft_versions` 快照。
- 他人草稿不能恢复。
- 不属于当前草稿的版本不能恢复。
- 已发布草稿不能直接恢复。
- 缺少 `versionId` 返回 400。

### 前端工具函数测试

新增 `apps/web/src/lib/draft-offline-state.test.ts`，覆盖：

- 可以写入和读取本地暂存。
- 可以清除某个草稿的本地暂存。
- localStorage 抛错时函数不让页面崩溃。

### 类型检查

```bash
pnpm typecheck
```

如当前环境没有裸 `pnpm`，使用：

```bash
corepack pnpm -r typecheck
```

### 构建检查

因为会修改 Next.js 页面、TipTap 组件和 NestJS controller/service，运行：

```bash
pnpm --filter @bytecamp-aigc/api build
pnpm --filter @bytecamp-aigc/web build
```

如需要 `corepack`：

```bash
corepack pnpm --filter @bytecamp-aigc/api build
corepack pnpm --filter @bytecamp-aigc/web build
```

### 手动页面验证

1. 启动数据库、API 和 Web。
2. 登录演示账号。
3. 进入 `/workspace` 生成文章并保存为草稿。
4. 进入 `/drafts/:id`。
5. 使用加粗、斜体、下划线、列表、引用、分割线、链接和图片 URL 插入工具。
6. 点击手动保存，确认版本号递增。
7. 修改标题和正文，等待 30 秒，确认自动保存触发。
8. 模拟 API 不可用或断网，修改正文后保存失败，确认出现本地暂存提示。
9. 恢复网络后点击保存，确认本地暂存被清除。
10. 在版本记录中选择较早版本，预览内容并点击恢复。
11. 确认标题、正文、版本号和保存时间更新。
12. 回滚成功后点击“预览并发布”，确认仍进入发布审核页。
13. 尝试在有未保存修改时发布，确认入口被禁用并提示先保存。

### 数据库验证

回滚成功后检查：

- `drafts.title` 和 `drafts.body` 等于被恢复版本的 `title` 和 `snapshot`。
- `drafts.version` 自增。
- `draft_versions` 新增一条快照，`version` 等于新的草稿版本号。
- 被恢复的历史版本记录仍保留，不被删除。

## 10. 与总体架构的一致性

- `apps/web` 只负责编辑器交互、保存/回滚状态展示、本地暂存和 API 调用。
- `apps/api` 负责草稿归属校验、版本归属校验、回滚事务和版本快照持久化。
- `packages/shared` 负责共享 DTO 和 ProseMirror JSON 类型。
- 图片上传、素材审核和素材存储不在本阶段实现，避免把 P1 素材模块混入 P0 草稿编辑闭环。
- 审核、评分、发布和榜单排序继续保留在后端，不因草稿回滚迁移到前端。

## 11. 实现完成后的学习文档

实现完成后，根据 `AGENTS.md` 生成：

```text
docs/learn/008-draft-editor-version-restore-learning.md
```

学习文档面向第一次做全栈应用的初学者，重点解释：

- 这个功能解决了什么业务问题：编辑误操作如何恢复。
- 用户从点击版本回滚，到后端事务更新草稿，再到页面刷新版本列表的完整链路。
- `RichTextEditor`、草稿编辑页、`DraftsController`、`DraftsService`、Prisma、DTO 和 localStorage 分别承担什么责任。
- TipTap 为什么保存 ProseMirror JSON，而不是直接保存 HTML。
- 自动保存、本地暂存和服务器版本记录的区别。
- 成功路径、保存失败路径、回滚失败路径分别发生什么。
- 如何通过页面、接口、数据库、类型检查和构建命令验证功能正确。
- 常见误区：只在前端回滚不写数据库、回滚他人版本、回滚后不追加新版本、断网暂存覆盖服务器内容、已发布草稿直接回滚导致文章快照不一致。
