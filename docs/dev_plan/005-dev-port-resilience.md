# 本地开发端口自检与自动避让技术方案

## 1. 功能目标和用户价值

当前本地开发默认使用 Web `3000`、API `3001`。在 Windows 上，如果 Docker、WSL2、Hyper-V、VPN 或系统更新把 `3000/3001` 放入 TCP excluded port range，服务即使没有被进程占用，也会因为 `EACCES: permission denied 0.0.0.0:3000` 无法启动。

本次改造目标是让开发者继续使用一条命令启动项目，同时启动脚本自动选择可用端口并把前端 API 地址同步到正确后端端口，减少本地环境问题对业务开发的阻断。

用户价值：

- 新手不用理解 Windows 端口保留机制，也能稳定启动项目。
- 前后端端口自动配对，避免 Web 指向错误 API 地址。
- 保留环境变量覆盖能力，方便部署、调试和团队差异化配置。

## 2. 涉及模块

### 前端 `apps/web`

- 不修改页面和业务逻辑。
- 启动时通过 `PORT` 指定 Web dev server 端口。
- 启动时通过 `NEXT_PUBLIC_API_BASE_URL` 指向 API dev server。

### 后端 `apps/api`

- 不修改 Controller、Service、Prisma 或业务模块。
- 继续通过 `PORT` 决定 NestJS 监听端口。
- 保留 `apps/api/src/main.ts` 现有 `PORT` 读取方式。

### 共享包 `packages/shared`

- 不修改共享类型、枚举或 API 契约。

### 根目录工具链

- 新增本地 dev 启动脚本，由根目录 `pnpm dev` 调用。
- 更新 README 的本地启动说明。

## 3. 新增或修改文件

计划新增：

- `scripts/dev.mjs`
  - 负责选择可用端口。
  - 负责启动 shared watch、API dev、Web dev。
  - 负责把 API 端口注入 `NEXT_PUBLIC_API_BASE_URL`。

计划修改：

- `package.json`
  - 将根目录 `dev` 从 `pnpm -r --parallel dev` 改为 `node scripts/dev.mjs`。
  - 可新增保留脚本 `dev:raw`，用于需要 pnpm 原生并行启动时回退。

- `README.md`
  - 更新本地启动端口说明。
  - 说明 Windows `EACCES 0.0.0.0:3000` 的处理方式。

计划不修改：

- `apps/web/package.json`
- `apps/api/package.json`
- `apps/api/src/main.ts`
- `apps/web/src/lib/api.ts`

除非实现验证发现必须修改，否则保持这些文件不动，降低影响面。

## 4. 数据模型或 API 变更

无数据库、Prisma schema、业务 API 或共享 DTO 变更。

环境变量约定：

- `WEB_PORT`：可选，指定 Web 优先端口。
- `API_PORT`：可选，指定 API 优先端口。
- `PORT`：单独运行某个 app 时仍按原有方式生效。
- `NEXT_PUBLIC_API_BASE_URL`：如果用户显式设置，脚本尊重用户设置；否则自动设置为 `http://localhost:<apiPort>`。

默认端口策略：

- Web 优先 `3200`。
- API 优先 `3201`。
- 如果不可用，脚本继续尝试后续候选端口。

## 5. 前端交互与页面状态设计

本次不涉及页面交互改造。

开发者终端可见状态：

- 启动前输出最终端口选择，例如：

```text
Dev ports:
- Web: http://localhost:3200
- API: http://localhost:3201
```

- 如果用户显式设置了端口但端口不可用，脚本输出可读错误，提示换端口或取消覆盖。

## 6. 后端服务、鉴权、审核、评分、发布或榜单逻辑

不修改后端业务逻辑。

脚本只影响本地开发进程的环境变量：

- API 进程收到 `PORT=<apiPort>`。
- Web 进程收到 `PORT=<webPort>` 和 `NEXT_PUBLIC_API_BASE_URL=<apiUrl>`。

鉴权、审核、评分、发布、榜单排序仍全部在后端现有模块内处理。

## 7. 端口检测方案

使用 Node.js 标准库实现跨平台检测，不新增依赖。

核心策略：

1. 使用 `node:net` 尝试监听候选端口。
2. 如果监听成功，立即关闭测试 server，认为端口可用。
3. 如果出现 `EADDRINUSE` 或 `EACCES`，认为端口不可用，继续尝试下一个候选端口。
4. Windows excluded port range 导致的 `EACCES` 会被自动避让。
5. 最多尝试有限数量端口，避免无限循环。

进程编排：

- 使用 `node:child_process` 的 `spawn` 启动：
  - `corepack pnpm --filter @bytecamp-aigc/shared dev`
  - `corepack pnpm --filter @bytecamp-aigc/api dev`
  - `corepack pnpm --filter @bytecamp-aigc/web dev`
- Windows 下 `corepack` 是 `.cmd` shim，Node 不能稳定地直接无 shell `spawn` 这类命令，因此脚本使用 `cmd.exe /d /s /c corepack pnpm ...` 启动 pnpm。
- 非 Windows 环境继续直接 `spawn("corepack", ["pnpm", ...])`。
- 使用 `stdio: "inherit"`，保留原始日志。
- 任一子进程退出时，脚本结束其余子进程，避免后台残留 watcher。

## 8. 风险、边界情况和回滚方案

### 风险

- Next.js 和 NestJS watcher 都是长驻进程，脚本需要正确处理 Ctrl+C。
- Windows 下终止子进程可能存在残留，需要使用 `SIGTERM` 并在必要时兜底退出。
- 如果 `corepack` 不可用，脚本会启动失败；当前项目已有 `corepack pnpm` 用法，风险可接受。

### 边界情况

- 用户显式设置 `WEB_PORT` 或 `API_PORT`：
  - 如果端口可用，优先使用。
  - 如果端口不可用，输出明确错误，不静默改到别的端口，避免用户误以为服务在指定端口。

- 用户显式设置 `NEXT_PUBLIC_API_BASE_URL`：
  - 脚本尊重该值。
  - 终端提示当前 Web 指向的 API 地址。

- 两个端口不能相同：
  - 如果 `WEB_PORT` 和 `API_PORT` 相同，脚本直接报错。

### 回滚方案

- 将根目录 `package.json` 的 `dev` 恢复为 `pnpm -r --parallel dev`。
- 删除 `scripts/dev.mjs`。
- README 恢复原启动说明。

## 9. 验证方式和测试计划

### 自动化验证

- 运行 `corepack pnpm -r typecheck`，确认脚本和配置改动不破坏类型检查。
- 运行 `corepack pnpm --filter @bytecamp-aigc/web build`，确认前端构建不受影响。
- 运行 `corepack pnpm --filter @bytecamp-aigc/api build`，确认后端构建不受影响。

### 启动验证

在当前 Windows 环境中运行：

```powershell
corepack pnpm dev
```

期望：

- 不再尝试使用系统保留的 `3000/3001`。
- 终端输出 Web/API 实际端口。
- Web 可通过输出 URL 访问。
- Web 请求 API 时使用同一个脚本注入的 API 地址。

### 手动端口覆盖验证

验证可选：

```powershell
$env:WEB_PORT="3200"
$env:API_PORT="3201"
corepack pnpm dev
```

期望：

- 端口可用时按用户指定端口启动。
- 如果指定端口不可用，脚本给出明确错误。

## 10. 初学者学习文档

实现完成后新增本地学习文档：

- `docs/learn/005-dev-port-resilience-learning.md`

内容说明：

- Windows 为什么会出现 `EACCES 0.0.0.0:3000`。
- 端口占用和系统端口保留有什么区别。
- Node.js 如何用 `net` 模块检测端口。
- 为什么 Web 和 API 的端口需要一起编排。
- `PORT` 和 `NEXT_PUBLIC_API_BASE_URL` 在本项目中的作用。
