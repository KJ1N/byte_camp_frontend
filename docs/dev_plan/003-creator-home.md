# 创作者主页技术方案

## 1. 功能目标和用户价值

本阶段新增一个独立的创作者主页，用来承接“首页内容消费页”和“创作工作台”之间的过渡入口。

现有首页 `/` 偏内容消费与推荐信息流，用户登录后需要通过右上角账号入口进入创作链路。本次改造后：

```text
首页 `/`
  -> 点击右上角使用者名称
  -> 创作者主页 `/creator`
      -> 左侧导航进入工作台 `/workspace`
      -> 管理菜单进入草稿箱 `/drafts`
      -> 点击 AI 创作灵感进入 `/workspace?topic=...`
  -> hover 右上角使用者名称
      -> 继续展开工作台 / 草稿箱 / 退出登录菜单
```

用户价值：

- 给创作者一个类似头条号后台的个人创作首页，降低从内容消费页进入创作工具的跳转成本。
- 在不移除原有 hover 菜单的前提下，为创作者增加一个更完整的后台主页入口。
- 右侧“创作灵感”由后端 AI Gateway 提供，点击后直接预填工作台创作主题，形成更顺滑的创作启动路径。
- 保持 MVP 边界：不实现发布后作品管理、收益、广告、推荐课程等尚未开发模块。

## 2. 涉及模块

### 前端 `apps/web`

- 新增 `/creator` 页面，按参考图构建创作者主页布局。
- 修改首页 `/` 的登录态入口：保留 hover 菜单，并新增点击使用者名称跳转 `/creator`。
- 修改工作台 `/workspace`：支持从 query 参数读取 `topic`，用于 AI 创作灵感预填创作主题。
- 继续使用 Tailwind CSS utility class 搭建页面主体样式。

### 后端 `apps/api`

- 在现有 `ai-gateway` 模块中补充创作灵感接口。
- 该接口返回结构化灵感列表，不在前端硬编码“AI 生成结果”。
- 接口继续通过 `JwtAuthGuard` 保护，避免匿名滥用 AI 能力。

### 共享包 `packages/shared`

- 增加创作灵感相关共享类型，供前后端共用：
  - `CreatorInspiration`
  - `CreatorInspirationsResponse`

## 3. 需要新增或修改的文件

### 新增文件

- `apps/web/src/app/creator/page.tsx`
- `apps/web/src/app/creator/layout.tsx`

### 修改文件

- `apps/web/src/app/page.tsx`
  - 保留登录后右上角使用者名称 hover 展开工作台、草稿箱、退出登录菜单。
  - 为使用者名称新增点击跳转 `/creator` 的行为。
  - 首页保留内容消费页定位，不直接放创作者后台主体。

- `apps/web/src/app/workspace/page.tsx`
  - 使用 `useSearchParams` 读取 `topic`。
  - 如果 URL 中存在 `topic`，优先作为创作设定的创作主题初始值。

- `apps/api/src/ai-gateway/ai-gateway.controller.ts`
  - 新增 `GET /ai/creator-inspirations` 或 `POST /ai/creator-inspirations`。
  - 继续挂载 `JwtAuthGuard`。

- `apps/api/src/ai-gateway/ai-gateway.service.ts`
  - 新增 `generateCreatorInspirations()`，MVP 阶段返回 mock AI 灵感列表。
  - 后续真实接入模型时，仍在该 service 内部替换，不影响前端。

- `packages/shared/src/index.ts`
  - 新增创作灵感 DTO 类型。

### 后续实现完成后新增本地学习文档

- `docs/learn/003-creator-home-learning.md`
  - 该目录已在 `.gitignore` 中，不上传 GitHub。

## 4. 数据模型或 API 变更

### 数据模型

本阶段不修改 Prisma schema，不新增数据库表。

原因：

- 创作者主页当前展示的是轻量统计、草稿摘要和 AI 灵感入口。
- 发布、收益、展现、评论等能力尚未完成，不应该提前落库或伪造完整数据模型。
- 草稿数据继续复用现有 `GET /drafts/mine`。

### 新增共享类型

计划在 `packages/shared/src/index.ts` 增加：

```ts
export interface CreatorInspiration {
  id: string;
  topic: string;
  reason: string;
  category: string;
}

export interface CreatorInspirationsResponse {
  model: string;
  items: CreatorInspiration[];
}
```

### 新增 API

建议新增：

```text
GET /ai/creator-inspirations
Authorization: Bearer <accessToken>
```

响应：

```json
{
  "model": "mock-model",
  "items": [
    {
      "id": "inspiration-1",
      "topic": "普通人如何用 AI 建立稳定的写作流程",
      "reason": "贴合内容创作者的效率痛点，适合生成方法型图文",
      "category": "AI 创作"
    }
  ]
}
```

选择 `GET` 的原因：

- 本接口暂不需要复杂输入。
- 返回当前用户进入创作者主页时可用的一组灵感建议。
- 后续如果需要根据用户画像、草稿历史或热点上下文生成，可改为带 body 的 `POST` 或增加 query 参数。

## 5. 前端交互与页面状态设计

### 首页 `/`

登录后右上角使用者名称行为调整：

```text
保留：hover 用户名 -> 展开工作台/草稿箱/退出
新增：点击用户名 -> 跳转 `/creator`
```

原因：

- 用户明确要求“首页点击右上角使用者名称时，转跳创作者首页”。
- 用户补充要求保留“hover 用户名 -> 展开工作台/草稿箱/退出”的现有功能，点击进入 `/creator` 是新增能力，不是替换能力。
- 创作者主页会承接工作台、管理、草稿箱等入口。

### 创作者主页 `/creator`

整体视觉贴近参考图，但按用户要求裁剪：

- 顶部 nav 只保留：
  - 左侧 App 名称：`HEADLINE`，红色字体。
  - 右侧使用者姓名。
  - 桌面端顶部 nav 与页面主体使用同一套三栏宽度：`HEADLINE` 左边缘与左侧栏左边缘对齐，使用者姓名右边缘与右侧“创作灵感”栏右边缘对齐。
  - 创作者主页的使用者姓名与首页姓名栏保持同样功能：hover 展开 `工作台`、`草稿箱`、`退出登录`，点击姓名仍停留或进入 `/creator`。
- 左侧栏只保留：
  - `主页`：当前页，高亮。
  - `创作`：点击跳转 `/workspace`。
  - `管理`：点击展开子项：
    - `作品管理`：显示“发布功能尚未开发”的禁用/占位状态，不跳转发布页。
    - `草稿箱列表`：点击跳转 `/drafts`。
- 中间区域只保留参考图中广告以上的核心区域，不包含广告和活动推荐：
  - 顶部浅色提示条：提醒完善账号信息或开始创作，按钮跳转工作台。
  - 数据概览卡：保留 `粉丝数`、`总阅读量`，删除 `累计收益`。
  - 最近内容/草稿动态：可以展示最近草稿标题、更新时间、版本。
  - 删除每条内容中的 `展现量` 和 `评论`，避免展示尚未实现的数据。
- 右侧栏只保留：
  - `创作灵感`
  - 数据由后端 AI Gateway 返回。
  - 点击任意灵感跳转：

```text
/workspace?topic=<encodeURIComponent(topic)>
```

### 工作台 `/workspace`

新增 URL 预填逻辑：

```text
访问 `/workspace?topic=普通人如何用 AI 建立稳定的写作流程`
-> 创作设定中的“创作主题”自动填入该 topic
```

如果没有 query 参数，保留当前默认主题。

### 移动端

移动端保持单列工具型布局：

- 顶部 nav 固定在上方。
- 左侧导航变为横向入口或折叠入口。
- 主内容在前，创作灵感在后。
- 不让底部或侧栏遮挡主要内容。

## 6. 后端服务、鉴权、审核、评分、发布或榜单逻辑

### 后端服务

创作灵感归入 `ai-gateway` 模块：

- 前端不硬编码“AI 生成”的灵感内容。
- 当前 MVP 使用 mock provider，保持可演示和可测试。
- 后续真实接入 OpenAI-compatible provider 时，只替换 service 内部实现。

### 鉴权

`GET /ai/creator-inspirations` 使用 `JwtAuthGuard`：

- 无 token 返回 401。
- token 过期返回 401。
- 有效 token 返回创作灵感。

这样符合架构中“AI 能力集中在后端编排，不暴露给前端”的要求。

### 审核、评分、发布、榜单

本阶段不新增审核、评分、发布或榜单逻辑。

原因：

- 用户明确说“作品管理【还未开发发布功能】”。
- 创作者主页只能展示草稿和创作入口，不能假装已经有完整作品发布管理。
- 发布相关能力后续仍必须走：

```text
draft -> audit -> scoring -> publish -> feed/ranking
```

## 7. 风险、边界情况和回滚方案

| 风险 | 处理 |
| --- | --- |
| 用户未登录访问 `/creator` | 页面显示登录引导，或跳转 `/login`。优先选择显示登录引导，避免突兀跳转。 |
| token 过期 | 请求灵感或草稿返回 401 时清理本地登录态，并提示重新登录。 |
| AI 灵感接口失败 | 右侧栏显示轻量错误提示和重试按钮；不影响左侧导航和中间数据区。 |
| 草稿为空 | 中间最近动态显示空状态，引导去工作台创作。 |
| 作品管理未开发 | 菜单项保留但标记“暂未开放”，不跳转不存在页面。 |
| query topic 过长 | 工作台只读取合理长度的 topic；如果超过 80 字，前端截断或后端保存草稿时继续按现有 title 限制校验。 |
| 参考图过度复杂 | 严格按用户要求裁剪，不实现公告、广告、课程、收益、展现量、评论等模块。 |

回滚方案：

- 删除 `/creator` 新增页面文件。
- 首页移除点击跳转 `/creator` 的新增行为，保留原本 hover 菜单。
- 工作台移除 query 参数读取逻辑。
- AI Gateway 移除创作灵感接口与共享类型。
- 不涉及数据库迁移，回滚成本较低。

## 8. 验证方式和测试计划

### TDD / 自动化验证

后续实现时遵守测试先行：

1. 先为 `AiGatewayService.generateCreatorInspirations()` 增加单元测试或最小服务测试。
2. 确认测试在实现前失败。
3. 实现 mock 灵感返回。
4. 确认测试通过。

如果当前测试框架不足以覆盖前端交互，本阶段至少补充轻量可验证逻辑，剩余部分用 typecheck、build 和 Playwright 手动验证兜底。

### 类型检查

实现完成后运行：

```bash
pnpm typecheck
```

如当前环境 `pnpm` 不可用，则使用：

```bash
corepack pnpm -r typecheck
```

### 构建检查

因为会新增 Next.js 路由和后端 API，建议运行：

```bash
pnpm --filter @bytecamp-aigc/web build
pnpm --filter @bytecamp-aigc/api build
```

如当前环境需要 `corepack`，则使用对应 `corepack pnpm ...` 命令。

### 手动页面验证

1. 登录后回到首页 `/`。
2. hover 右上角使用者名称，确认仍展开工作台、草稿箱、退出登录菜单。
3. 点击右上角使用者名称，确认跳转 `/creator`。
4. 确认创作者主页顶部只显示红色 `HEADLINE` 和用户姓名。
5. 确认创作者主页顶部 `HEADLINE` 与左侧栏左边缘对齐，用户姓名与右侧栏右边缘对齐。
6. hover 创作者主页顶部用户姓名，确认仍展开工作台、草稿箱、退出登录菜单。
7. 确认左侧栏只有 `主页`、`创作`、`管理`。
8. 点击 `创作`，确认跳转 `/workspace`。
9. 点击 `管理`，确认出现 `作品管理` 和 `草稿箱列表`。
10. 点击 `作品管理`，确认提示“发布功能尚未开发”或保持禁用。
11. 点击 `草稿箱列表`，确认跳转 `/drafts`。
12. 确认中间区域不包含广告、不包含累计收益、不展示展现量和评论。
13. 确认右侧只显示 `创作灵感`。
14. 点击任一创作灵感，确认跳转 `/workspace?topic=...`。
15. 确认工作台创作主题已填充为对应灵感内容。
16. 缩小到移动端宽度，确认布局不重叠、不遮挡主要内容。

### 浏览器验证

实现完成后启动本地 dev server，并使用 Browser 插件查看：

- `/`
- `/creator`
- `/workspace?topic=...`
- `/drafts`

重点检查：

- 截图视觉是否贴近参考图裁剪版。
- 移动端文字和按钮不溢出。
- 右侧灵感点击后预填主题是否生效。

## 9. 与现有文档的一致性

- 符合 PRD 中“创作者登录后进入创作、草稿、编辑闭环”的目标。
- 符合架构中 `apps/web` 负责 UI 和路由、`apps/api` 负责 AI 编排的边界。
- 不将 AI 生成逻辑、发布裁决、审核评分、榜单排序迁移到前端。
- 不提前实现未完成的发布作品管理功能，只做明确占位。
- 页面主体样式继续使用 Tailwind CSS utility class。

## 10. 实现完成后的学习文档

实现完成后，根据 `AGENTS.md` 的学习方法论，生成：

```text
docs/learn/003-creator-home-learning.md
```

学习文档将面向初学者解释：

- 为什么要新增创作者主页而不是把后台功能继续塞在首页菜单。
- 首页、创作者主页、工作台、草稿箱之间的前端路由链路。
- AI 创作灵感为什么要由后端返回。
- query 参数如何把灵感主题传给工作台。
- React 状态、Next.js 路由、受保护 API、共享类型在这次功能里的作用。
