import { ModuleCard } from "@/components/module-card";
import { StatusCard } from "@/components/status-card";

const modules = [
  {
    title: "AI 创作工作台",
    description: "从主题、素材和风格出发，生成标题、大纲和图文正文。",
    items: ["Prompt 模板", "富文本编辑", "草稿自动保存", "版本回滚"],
  },
  {
    title: "内容安全防火墙",
    description: "发布前强制进行安全审核、风险解释和质量评分。",
    items: ["高危拦截", "一键合规改写", "质量评分", "审核记录"],
  },
  {
    title: "热点与爆文分发",
    description: "综合质量分、热度、发布时间和用户反馈生成榜单。",
    items: ["推荐流", "热点榜", "爆文榜", "无限滚动"],
  },
];

export default function Home() {
  return (
    <main>
      <section className="hero">
        <nav className="nav">
          <strong>AI Creator Hub</strong>
          <div>
            <a href="#workspace">工作台</a>
            <a href="#architecture">技术框架</a>
            <a href="/docs">文档</a>
          </div>
        </nav>

        <div className="hero-grid">
          <div>
            <p className="eyebrow">字节头条 AI 前端训练营</p>
            <h1>创作、审核、分发一体化的 AI 内容生产平台</h1>
            <p className="lead">
              让 AI 不只负责生成文本，而是贯穿灵感输入、富文本编辑、发布前审核、质量评分、榜单分发和数据反馈。
            </p>
            <div className="actions">
              <a className="primary" href="#workspace">查看项目模块</a>
              <a className="secondary" href="https://github.com/KJ1N/byte_camp_frontend">GitHub 仓库</a>
            </div>
          </div>

          <div className="panel" aria-label="创作流程预览">
            <div className="flow-row active">主题输入：AI 如何改变内容创作</div>
            <div className="flow-row">AI 生成：标题、大纲、正文</div>
            <div className="flow-row">人工编辑：富文本和素材</div>
            <div className="flow-row">审核评分：PASS / WARN / BLOCK</div>
            <div className="flow-row">分发榜单：质量分 + 热度 + 时间衰减</div>
          </div>
        </div>
      </section>

      <section id="workspace" className="content-band">
        <div className="stats-grid">
          <StatusCard label="目标链路" value="7 步闭环" description="创作到分发再到反馈" />
          <StatusCard label="性能目标" value="LCP ≤ 2.5s" description="首页和榜单首屏指标" />
          <StatusCard label="审核策略" value="4 阶段" description="输入、生成、发布前、发布后" />
          <StatusCard label="交付周期" value="3 周" description="工程、功能、部署和文档" />
        </div>

        <div className="module-grid">
          {modules.map((module) => (
            <ModuleCard key={module.title} {...module} />
          ))}
        </div>
      </section>

      <section id="architecture" className="architecture">
        <h2>整体技术框架</h2>
        <div className="architecture-grid">
          <div>
            <h3>前端</h3>
            <p>Next.js + React + TypeScript + Tailwind CSS，承载工作台、编辑器、榜单和详情页。</p>
          </div>
          <div>
            <h3>后端</h3>
            <p>NestJS 负责业务编排、AI Gateway、审核、评分、发布和榜单排序。</p>
          </div>
          <div>
            <h3>数据</h3>
            <p>PostgreSQL 存内容主数据，Redis 承载实时榜单、缓存和限流。</p>
          </div>
          <div>
            <h3>AI</h3>
            <p>通过 OpenAI SDK 兼容模式接入火山方舟/豆包模型，集中管理 Prompt 和模型调用。</p>
          </div>
        </div>
      </section>
    </main>
  );
}

