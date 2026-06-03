const docs = [
  {
    title: "完整 PRD",
    description: "产品定位、用户流程、功能范围、MVP 边界和验收标准。",
    path: "docs/PRD.md",
  },
  {
    title: "技术架构",
    description: "前后端分层、AI Gateway、审核流水线、数据模型和部署方案。",
    path: "docs/architecture.md",
  },
  {
    title: "审核规则与质量体系",
    description: "风险分类、处理策略、审核输出和内容质量评分标准。",
    path: "docs/audit-rules.md",
  },
  {
    title: "评估与交付方案",
    description: "答辩演示脚本、评估指标、交付物和风险应对。",
    path: "docs/evaluation-plan.md",
  },
];

export default function DocsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-[1180px] px-5 py-11 text-[#18202f] md:px-[5vw]">
      <a className="font-bold text-[#1d4ed8]" href="/">
        返回首页
      </a>
      <h1 className="my-3 text-[clamp(36px,6vw,60px)] leading-tight font-bold">项目文档</h1>
      <p className="mb-7 leading-8 text-[#5f6d83]">这些文档位于仓库根目录的 docs 文件夹中，覆盖产品、架构、审核和交付评估。</p>
      <div className="grid gap-4 md:grid-cols-3">
        {docs.map((doc) => (
          <article className="rounded-lg border border-[#e0e5ee] bg-white p-5" key={doc.title}>
            <h3 className="mt-0 text-lg font-bold">{doc.title}</h3>
            <p className="m-0 leading-7 text-[#5f6d83]">{doc.description}</p>
            <p className="mt-3.5 font-bold text-[#1d4ed8]">{doc.path}</p>
          </article>
        ))}
      </div>
    </main>
  );
}
