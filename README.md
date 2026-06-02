# byte_camp_frontend

2026 字节前端训练营项目：AI 创作者辅助生产与分发平台。

AI Creator Hub 是面向图文创作者的 AIGC 辅助生产与分发平台。项目目标是把“AI 生成器”升级为完整的内容生产闭环：创作、编辑、审核、发布、分发、数据反馈与二次优化。

## 项目结构

```text
.
├── apps
│   ├── api      # NestJS 后端服务
│   └── web      # Next.js 前端应用
├── packages
│   └── shared   # 前后端共享 DTO、枚举和常量
├── docs         # PRD、技术架构、审核规则、评估方案
└── docker-compose.yml
```

## 技术栈

| 层级 | 选型 |
| --- | --- |
| Monorepo | pnpm workspace |
| 前端 | Next.js + React + TypeScript + Tailwind CSS |
| 后端 | NestJS + TypeScript |
| 数据库 | PostgreSQL + Prisma |
| 缓存/榜单 | Redis Sorted Set |
| AI 接入 | OpenAI SDK 兼容模式，适配火山方舟/豆包等模型 |
| 测试 | Vitest + Jest + Playwright |
| 部署 | 前端 Vercel，后端 Railway/Render/ECS，数据库托管 PostgreSQL |

## 本地启动

```bash
cp .env.example .env
pnpm install
pnpm db:up
pnpm prisma:migrate
pnpm prisma:seed
pnpm dev
```

如果前后端端口冲突，建议使用：

```bash
# API
PORT=3001 pnpm --filter @bytecamp-aigc/api start:dev

# Web
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001 pnpm --filter @bytecamp-aigc/web dev
```

Windows PowerShell:

```powershell
$env:PORT="3001"; pnpm --filter @bytecamp-aigc/api start:dev
$env:NEXT_PUBLIC_API_BASE_URL="http://localhost:3001"; pnpm --filter @bytecamp-aigc/web dev
```

## 文档

- [完整 PRD](./docs/PRD.md)
- [技术架构](./docs/architecture.md)
- [内容安全审核规则与质量体系](./docs/audit-rules.md)
- [评估与交付方案](./docs/evaluation-plan.md)

