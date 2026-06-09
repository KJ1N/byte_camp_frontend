import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRootEnv } from "./e2e-env.mjs";

const prefix = "e2e-ranking-lcp";
const userId = `${prefix}-user`;
const userEmail = `${prefix}@bytecamp.local`;
const defaultDatabaseName = "bytecamp_aigc";
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiRequire = createRequire(path.join(rootDir, "apps/api/package.json"));
const { PrismaClient } = apiRequire("@prisma/client");
const loadedEnv = loadRootEnv(rootDir);

function normalizeUrl(value) {
  return value ? value.trim().replace(/\/+$/, "") : "";
}

function databaseName(value) {
  try {
    return new URL(value).pathname.replace(/^\/+/, "");
  } catch {
    return "";
  }
}

function requireE2eDatabaseUrl(env = loadedEnv) {
  const e2eDatabaseUrl = normalizeUrl(env.E2E_DATABASE_URL);
  if (!e2eDatabaseUrl) {
    throw new Error("E2E_DATABASE_URL is required before seeding rankings performance data.");
  }

  const regularDatabaseUrl = normalizeUrl(env.DATABASE_URL);
  if (regularDatabaseUrl && regularDatabaseUrl === e2eDatabaseUrl) {
    throw new Error("E2E_DATABASE_URL must be different from the normal DATABASE_URL when seeding test data.");
  }

  const name = databaseName(e2eDatabaseUrl);
  if (!name || name === defaultDatabaseName) {
    throw new Error(`E2E_DATABASE_URL must point to a dedicated test database, not ${defaultDatabaseName}.`);
  }

  return e2eDatabaseUrl;
}

function richTextDoc(text) {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

function rankDate(index) {
  return new Date(Date.now() - index * 60 * 60 * 1000);
}

async function main() {
  const e2eDatabaseUrl = requireE2eDatabaseUrl(loadedEnv);
  const articleCount = Number.parseInt(loadedEnv.E2E_RANKING_ARTICLE_COUNT ?? "24", 10);
  const total = Number.isFinite(articleCount) ? Math.max(articleCount, 12) : 24;
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: e2eDatabaseUrl,
      },
    },
  });

  try {
    await prisma.user.deleteMany({
      where: {
        OR: [{ id: userId }, { email: userEmail }],
      },
    });

    await prisma.user.create({
      data: {
        id: userId,
        email: userEmail,
        nickname: "E2E Ranking Test Author",
        passwordHash: "e2e-not-used",
      },
    });

    for (let index = 1; index <= total; index += 1) {
      const padded = String(index).padStart(2, "0");
      const draftId = `${prefix}-draft-${padded}`;
      const articleId = `${prefix}-article-${padded}`;
      const score = 75 + (index % 20);
      const views = 900 - index * 13;
      const likes = 60 - (index % 11);
      const favorites = 28 - (index % 7);
      const body = richTextDoc(
        `This is E2E ranking performance article ${index}, used only for first-screen LCP and infinite-scroll checks.`,
      );

      await prisma.draft.create({
        data: {
          id: draftId,
          authorId: userId,
          title: `E2E Ranking Performance Article ${padded}`,
          status: "PUBLISHED",
          body,
        },
      });

      await prisma.article.create({
        data: {
          id: articleId,
          authorId: userId,
          draftId,
          title: `E2E Ranking Performance Article ${padded}`,
          summary: `Dedicated E2E database ranking seed article ${padded}.`,
          body,
          publishedAt: rankDate(index),
        },
      });

      await prisma.qualityScore.create({
        data: {
          id: `${prefix}-score-${padded}`,
          draftId,
          articleId,
          contentValue: score,
          expressionQuality: score - 1,
          readerExperience: score - 2,
          spreadPotential: score - 3,
          safetyScore: 95,
          overall: score,
          reasons: ["E2E test data"],
          suggestions: ["Use only in the dedicated E2E database"],
        },
      });

      await prisma.engagementEvent.createMany({
        data: [
          {
            id: `${prefix}-event-view-${padded}`,
            articleId,
            type: "VIEW",
            userKey: prefix,
            value: views,
          },
          {
            id: `${prefix}-event-like-${padded}`,
            articleId,
            type: "LIKE",
            userKey: prefix,
            value: likes,
          },
          {
            id: `${prefix}-event-favorite-${padded}`,
            articleId,
            type: "FAVORITE",
            userKey: prefix,
            value: favorites,
          },
        ],
      });
    }

    console.log(`Seeded ${total} ranking performance articles into ${databaseName(e2eDatabaseUrl)}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
