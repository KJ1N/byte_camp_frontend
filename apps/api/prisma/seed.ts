import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("bytecamp123", 10);

  const demoUser = await prisma.user.upsert({
    where: { email: "demo@bytecamp.local" },
    update: {},
    create: {
      email: "demo@bytecamp.local",
      nickname: "训练营创作者",
      passwordHash,
    },
  });

  await prisma.prompt.upsert({
    where: { id: "platform-news-starter" },
    update: {
      systemPrompt: "你是一个严谨的中文内容创作助手，擅长生成结构清晰、可读性强、适合资讯平台分发的图文内容。",
      userTemplate: "请围绕主题 {{topic}}，面向 {{audience}}，用 {{style}} 风格生成标题、大纲和正文。",
      paramsSchema: { topic: "string", audience: "string", style: "string" },
      fewShots: [],
      isStarter: true,
    },
    create: {
      id: "platform-news-starter",
      owner: "PLATFORM",
      name: "头条资讯图文生成",
      category: "article_generation",
      systemPrompt: "你是一个严谨的中文内容创作助手，擅长生成结构清晰、可读性强、适合资讯平台分发的图文内容。",
      userTemplate: "请围绕主题 {{topic}}，面向 {{audience}}，用 {{style}} 风格生成标题、大纲和正文。",
      paramsSchema: { topic: "string", audience: "string", style: "string" },
      fewShots: [],
      isStarter: true,
    },
  });

  const platformPrompts = [
    {
      id: "platform-method-starter",
      name: "方法论图文生成",
      category: "article_generation",
      description: "适合步骤清晰、可操作的经验方法类内容。",
      systemPrompt: "你是擅长方法论写作的中文内容创作助手，输出结构清晰、步骤明确、适合图文平台发布的文章初稿。",
      userTemplate: "请围绕主题 {{topic}}，面向 {{audience}}，使用 {{style}} 风格，生成包含标题、大纲和正文的方法论图文。",
    },
    {
      id: "platform-seeding-starter",
      name: "种草图文生成",
      category: "article_generation",
      description: "适合生活方式、工具体验和产品推荐类内容。",
      systemPrompt: "你是擅长种草图文的中文内容创作助手，输出真实克制、体验感明确、避免夸大承诺的文章初稿。",
      userTemplate: "请围绕主题 {{topic}}，面向 {{audience}}，使用 {{style}} 风格，生成包含标题、大纲和正文的种草图文。",
    },
    {
      id: "platform-title-optimizer",
      name: "标题优化",
      category: "title_optimization",
      description: "根据主题、受众、风格和正文摘要生成多个标题候选。",
      systemPrompt: "你是中文图文标题优化助手，擅长生成清晰、具体、不夸张的标题候选。",
      userTemplate: "请基于主题 {{topic}}，面向 {{audience}}，使用 {{style}} 风格优化标题。",
    },
    {
      id: "platform-article-rewrite",
      name: "正文改写",
      category: "article_rewrite",
      description: "支持润色、扩写、缩写和风格转换。",
      systemPrompt: "你是中文正文改写助手，擅长在保持事实边界的前提下改进表达。",
      userTemplate: "请根据用户选择的改写模式处理正文片段。",
    },
  ];

  for (const prompt of platformPrompts) {
    await prisma.prompt.upsert({
      where: { id: prompt.id },
      update: {
        name: prompt.name,
        category: prompt.category,
        systemPrompt: prompt.systemPrompt,
        userTemplate: prompt.userTemplate,
        paramsSchema: {
          topic: "string",
          audience: "string",
          style: "string",
          description: prompt.description,
        },
        fewShots: [],
        isStarter: false,
      },
      create: {
        id: prompt.id,
        owner: "PLATFORM",
        name: prompt.name,
        category: prompt.category,
        systemPrompt: prompt.systemPrompt,
        userTemplate: prompt.userTemplate,
        paramsSchema: {
          topic: "string",
          audience: "string",
          style: "string",
          description: prompt.description,
        },
        fewShots: [],
        isStarter: false,
      },
    });
  }

  await prisma.draft.upsert({
    where: { id: "demo-draft-001" },
    update: {},
    create: {
      id: "demo-draft-001",
      authorId: demoUser.id,
      title: "AI 如何改变内容创作",
      body: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "这是一篇用于演示创作、审核与分发闭环的示例草稿。" }],
          },
        ],
      },
    },
  });

  const publishedArticles = [
    {
      draftId: "demo-published-draft-001",
      articleId: "demo-article-001",
      revisionId: "demo-revision-001",
      auditId: "demo-audit-001",
      scoreId: "demo-score-001",
      title: "AI 如何改变内容创作：从灵感到发布的完整链路",
      summary: "从选题、初稿、编辑、审核到分发，AI 正在把创作者的工作流从单点生成推进到完整闭环。",
      bodyText: [
        "AI 已经不只是生成一段文案的工具，它正在进入内容生产的每个关键环节。",
        "创作者可以先输入主题和受众，让系统生成标题、大纲和初稿，再通过编辑器补充个人经验。",
        "发布前的审核和质量评分让内容更安全，也让后续分发有了可以解释的数据基础。",
      ],
      score: {
        contentValue: 90,
        expressionQuality: 88,
        readerExperience: 86,
        spreadPotential: 84,
        safetyScore: 95,
        overall: 88,
      },
      events: { views: 320, likes: 34, favorites: 18 },
      publishedAt: new Date("2026-06-05T09:00:00.000Z"),
    },
    {
      draftId: "demo-published-draft-002",
      articleId: "demo-article-002",
      revisionId: "demo-revision-002",
      auditId: "demo-audit-002",
      scoreId: "demo-score-002",
      title: "内容质量分为什么重要：让好文章进入榜单",
      summary: "质量分、热度、时间衰减和互动反馈共同影响排序，让内容运营拥有可解释的分发依据。",
      bodyText: [
        "内容平台不能只看发布时间，也不能只看点击量。",
        "质量分负责衡量内容价值、表达质量和读者体验，互动数据负责反映读者反馈。",
        "当这两类信号一起进入排序公式，榜单就能同时兼顾好内容和真实热度。",
      ],
      score: {
        contentValue: 86,
        expressionQuality: 84,
        readerExperience: 82,
        spreadPotential: 80,
        safetyScore: 95,
        overall: 84,
      },
      events: { views: 260, likes: 28, favorites: 12 },
      publishedAt: new Date("2026-06-05T08:00:00.000Z"),
    },
    {
      draftId: "demo-published-draft-003",
      articleId: "demo-article-003",
      revisionId: "demo-revision-003",
      auditId: "demo-audit-003",
      scoreId: "demo-score-003",
      title: "发布前审核不是阻碍，而是创作者的安全网",
      summary: "高危拦截、中低风险建议和审核记录，可以帮助创作者更稳定地完成内容发布。",
      bodyText: [
        "审核系统的目标不是让创作者寸步难行，而是把明显风险挡在发布之前。",
        "高危内容会被阻止，中低风险内容会给出证据片段和修改建议。",
        "这种可解释的审核结果，也方便团队复盘规则是否有效。",
      ],
      score: {
        contentValue: 82,
        expressionQuality: 83,
        readerExperience: 80,
        spreadPotential: 76,
        safetyScore: 95,
        overall: 82,
      },
      events: { views: 180, likes: 19, favorites: 9 },
      publishedAt: new Date("2026-06-05T07:00:00.000Z"),
    },
  ];

  for (const item of publishedArticles) {
    const body = {
      type: "doc",
      content: item.bodyText.map((text) => ({
        type: "paragraph",
        content: [{ type: "text", text }],
      })),
    };

    await prisma.draft.upsert({
      where: { id: item.draftId },
      update: {
        title: item.title,
        body,
        status: "PUBLISHED",
      },
      create: {
        id: item.draftId,
        authorId: demoUser.id,
        title: item.title,
        body,
        status: "PUBLISHED",
      },
    });

    await prisma.article.upsert({
      where: { id: item.articleId },
      update: {
        title: item.title,
        body,
        summary: item.summary,
        publishedAt: item.publishedAt,
      },
      create: {
        id: item.articleId,
        authorId: demoUser.id,
        draftId: item.draftId,
        title: item.title,
        body,
        summary: item.summary,
        publishedAt: item.publishedAt,
      },
    });

    await prisma.articleRevision.upsert({
      where: { id: item.revisionId },
      update: {
        title: item.title,
        body,
      },
      create: {
        id: item.revisionId,
        articleId: item.articleId,
        title: item.title,
        body,
        reason: "演示 seed 初始发布",
      },
    });

    await prisma.auditRecord.upsert({
      where: { id: item.auditId },
      update: {},
      create: {
        id: item.auditId,
        draftId: item.draftId,
        articleId: item.articleId,
        stage: "PUBLISH_PRECHECK",
        decision: "PASS",
        riskLevel: "none",
        categories: [],
        evidence: [],
        suggestions: [],
        rawResult: {
          decision: "PASS",
          riskLevel: "none",
          categories: [],
          evidence: [],
          rewriteSuggestions: [],
          summary: "未发现明显风险。",
        },
      },
    });

    await prisma.qualityScore.upsert({
      where: { id: item.scoreId },
      update: item.score,
      create: {
        id: item.scoreId,
        draftId: item.draftId,
        articleId: item.articleId,
        ...item.score,
        reasons: ["结构完整", "信息密度较高"],
        suggestions: ["补充更多案例", "结尾增加行动建议"],
      },
    });

    await seedEngagementEvent(`${item.articleId}-view`, item.articleId, "VIEW", item.events.views);
    await seedEngagementEvent(`${item.articleId}-like`, item.articleId, "LIKE", item.events.likes);
    await seedEngagementEvent(`${item.articleId}-favorite`, item.articleId, "FAVORITE", item.events.favorites);
  }
}

async function seedEngagementEvent(id: string, articleId: string, type: string, value: number) {
  await prisma.engagementEvent.upsert({
    where: { id },
    update: { value },
    create: {
      id,
      articleId,
      type,
      value,
      userKey: "seed",
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
