# 登录界面技术方案

## 1. 功能目标和用户价值

本阶段只实现登录界面，范围控制在最小可演示入口：

```text
用户进入 /login -> 输入邮箱和密码 -> 调用现有登录接口 -> 保存 access token -> 返回首页
```

用户价值：

- 为后续创作工作台、我的草稿、发布流程提供身份入口。
- 演示时可直接使用 seed 账号快速进入系统。
- 先完成稳定的视觉与交互基础，避免一次性开发过多业务链路。

## 2. 涉及模块

### 前端 `apps/web`

- 新增 `/login` 页面。
- 新增轻量登录态存取工具。
- 调整 API 请求封装，使登录后可携带 token。
- 补充登录页所需样式。

### 后端 `apps/api`

- 本阶段不新增后端接口。
- 复用现有：

```text
POST /auth/login
POST /auth/register
```

### 共享包 `packages/shared`

- 本阶段暂不新增共享类型，优先保持变更小。
- 如实现时发现登录响应类型被多处复用，再补充 `AuthResponse`。

## 3. 需要新增或修改的文件

### 新增文件

- `apps/web/src/app/login/page.tsx`
- `apps/web/src/lib/auth.ts`

### 修改文件

- `apps/web/src/lib/api.ts`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/page.tsx`：仅在导航或行动按钮中增加登录入口。

### 暂不修改

- `apps/api/**`
- `apps/api/prisma/schema.prisma`
- `packages/shared/src/index.ts`
- 草稿、AI 生成、审核、评分、发布、榜单相关文件

## 4. 数据模型或 API 变更

不新增数据表，不修改 Prisma schema。

登录请求沿用现有后端 DTO：

```json
{
  "email": "demo@bytecamp.local",
  "password": "bytecamp123"
}
```

登录响应沿用现有结构：

```json
{
  "accessToken": "...",
  "user": {
    "id": "...",
    "email": "demo@bytecamp.local",
    "nickname": "训练营创作者"
  }
}
```

前端本地存储：

- `aigc_creator_token`
- `aigc_creator_user`

## 5. 前端交互与页面状态设计

### 页面结构

- 顶部品牌：文舟。
- 左侧或上方展示登录价值点：创作、审核、分发闭环。
- 登录表单：
  - 邮箱输入框
  - 密码输入框
  - 登录按钮
  - 演示账号快捷填充按钮
- 辅助链接：
  - 返回首页
  - 切换到注册模式

### 登录状态

- `idle`：默认可输入。
- `submitting`：按钮进入 loading，禁止重复提交。
- `success`：保存 token 和 user，跳转首页。
- `error`：展示错误提示，不清空用户输入。

### 注册模式

为后续账号体系预留注册入口，但保持轻量：

- 点击“注册账号”切换为注册表单。
- 注册表单比登录多一个昵称字段。
- 调用现有 `/auth/register`。
- 注册成功后同样保存 token 和 user。

### 视觉设计

- 延续现有首页的浅色背景、蓝色主按钮和 8px 圆角。
- 页面首屏就是登录表单，不做营销长页。
- 移动端表单单列展示，避免输入框和按钮挤压。

## 6. 后端服务、鉴权、审核、评分、发布或榜单逻辑

- 后端服务：不变，继续使用现有 `AuthController` 和 `AuthService`。
- 鉴权：本阶段只保存 token；后续受保护接口再接入 JWT Guard。
- 审核、评分、发布、榜单：本阶段不涉及，不能迁移到前端。

## 7. 风险、边界情况和回滚方案

| 风险 | 处理 |
| --- | --- |
| API 服务未启动 | 显示“无法连接服务，请稍后重试” |
| 邮箱或密码错误 | 展示后端错误或通用错误提示 |
| 重复点击提交 | `submitting` 状态禁用按钮 |
| localStorage 不可用 | 捕获异常，仍展示登录失败提示 |
| 移动端布局拥挤 | 使用单列布局和稳定宽度 |

回滚方案：

- 本阶段只改前端页面、样式和轻量工具函数。
- 如登录 API 调用阻塞，可保留静态登录页 UI，不影响现有首页和后端。

## 8. 验证方式和测试计划

### 本地检查

- `pnpm typecheck`
- 因新增 Next.js 页面，运行 `pnpm --filter @bytecamp-aigc/web build`

### 手动验证

1. 打开 `/login`。
2. 点击演示账号快捷填充，表单填入 `demo@bytecamp.local / bytecamp123`。
3. API 已启动时，点击登录后保存 token 并跳转首页。
4. API 未启动或账号错误时，页面显示错误提示。
5. 切换注册模式，昵称字段显示正常。
6. 移动端宽度下表单不重叠、不裁切。

## 9. 与总体架构的一致性

- 前端只负责登录界面、表单状态和 token 本地保存。
- 密码校验、JWT 签发仍由 `apps/api` 负责。
- 不在前端加入审核、评分、发布、榜单等后端职责。
- 本阶段变更为后续创作工作台提供登录入口，但不提前展开后续业务。
