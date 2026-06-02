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
    update: {},
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

