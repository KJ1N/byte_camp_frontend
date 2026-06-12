# Prisma 迁移读取根目录环境变量技术方案

## 功能目标和用户价值

修复新 clone 仓库后执行 `pnpm prisma:migrate` 时无法读取根目录 `.env` 的问题，让开发者只需要在仓库根目录维护一份环境变量文件，不再需要手动复制 `.env` 到 `apps/api`。

用户价值：

- 降低本地启动成本，符合 monorepo 根目录统一配置的使用习惯。
- 避免根目录 `.env` 与 `apps/api/.env` 两份配置不一致导致连接错误。
- 保持后端运行时与 Prisma CLI 使用同一套数据库配置。

## 涉及模块

- 前端：不涉及。
- 后端：`apps/api` 的 Prisma CLI 脚本。
- 共享包：不涉及。
- 根目录脚本：`package.json` 中的 Prisma 转发脚本保持面向开发者的统一入口。

## 需要新增或修改的文件

计划修改：

- `apps/api/package.json`
  - 将 `prisma:generate`
  - `prisma:migrate`
  - `prisma:seed`
  调整为显式从仓库根目录 `.env` 加载环境变量后再执行 Prisma CLI。

可能新增：

- `apps/api/scripts/run-prisma-with-root-env.mjs`
  - 如果直接在 package script 中跨平台加载根目录 `.env` 不够稳定，则新增一个小型 Node 脚本。
  - 脚本职责只做三件事：
    1. 从当前包目录向上查找 `pnpm-workspace.yaml`，定位仓库根目录。
    2. 读取根目录 `.env`，把未显式传入进程的变量写入 `process.env`。
    3. 调用本包内 Prisma CLI，并透传参数。

## 数据模型或 API 变更

无数据模型变更。

无 HTTP API 变更。

无 Prisma schema 变更。

## 前端交互与页面状态设计

不涉及前端页面或交互。

## 后端服务、鉴权、审核、评分、发布或榜单逻辑

不改动业务服务逻辑。

本次只影响本地/CI 执行 Prisma CLI 的环境变量来源：

- Nest API 运行时已经通过 `ConfigModule.forRoot({ envFilePath: getRootEnvFilePath() })` 读取根目录 `.env`。
- Prisma CLI 当前不会使用 Nest 的 `ConfigModule`，因此需要在 Prisma 脚本入口显式加载根目录 `.env`。
- 继续保留命令行或 CI 中显式传入的环境变量优先级，避免覆盖部署平台注入的 `DATABASE_URL`。

## 风险、边界情况和回滚方案

风险：

- 如果脚本实现不当，Windows PowerShell 与 macOS/Linux shell 之间可能出现路径或参数转义问题。
- 如果强制覆盖 `process.env.DATABASE_URL`，可能影响 CI 或临时指定数据库的迁移命令。

边界情况：

- 根目录 `.env` 不存在时，应让 Prisma 保持原有错误提示，而不是吞掉错误。
- `DATABASE_URL` 已经由外部环境传入时，应优先使用外部环境变量。
- 用户本地仍保留 `apps/api/.env` 时，新脚本应避免继续依赖这份文件。

回滚方案：

- 将 `apps/api/package.json` 的 Prisma 脚本恢复为原始 `prisma generate`、`prisma migrate dev`、`prisma db seed`。
- 删除新增的 Prisma env 加载脚本。

## 验证方式和测试计划

本地验证：

1. 确认根目录 `.env` 包含 `DATABASE_URL`。
2. 临时移除或忽略 `apps/api/.env` 后执行：
   - `pnpm prisma:generate`
   - `pnpm prisma:migrate`
3. 使用不会写库的命令验证 schema：
   - `corepack pnpm --filter @bytecamp-aigc/api exec prisma validate`
4. 运行相关检查：
   - `pnpm typecheck`

如果本地数据库未启动，`prisma:migrate` 可能会在连接数据库阶段失败；这种情况下只要错误从“找不到 `DATABASE_URL`”变为数据库连接错误，即可证明环境变量加载问题已解决。
