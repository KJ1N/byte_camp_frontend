import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { PromptOwner } from "@bytecamp-aigc/shared";
import { PromptsService } from "./prompts.service";

const platformPrompt = {
  id: "platform-1",
  owner: PromptOwner.Platform,
  authorId: null,
  name: "Platform article prompt",
  category: "article_generation",
  systemPrompt: "System",
  userTemplate: "User",
  paramsSchema: { description: "Platform prompt" },
  fewShots: [],
  sourcePromptId: null,
  isStarter: true,
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-01T00:00:00.000Z"),
};

const privatePrompt = {
  ...platformPrompt,
  id: "private-1",
  owner: PromptOwner.Private,
  authorId: "user-1",
  name: "Private rewrite prompt",
  category: "article_rewrite",
  isStarter: false,
};

interface PromptRecord {
  id: string;
  owner: PromptOwner;
  authorId: string | null;
  name: string;
  category: string;
  systemPrompt: string;
  userTemplate: string;
  paramsSchema: unknown;
  fewShots: unknown;
  sourcePromptId: string | null;
  isStarter: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function createService(prompts = [platformPrompt, privatePrompt]) {
  const records: PromptRecord[] = prompts.map((prompt) => ({ ...prompt }));
  let createdCount = 0;

  const prisma = {
    prompt: {
      findMany: async ({ where }: { where: { category?: string; OR: Array<Record<string, unknown>> } }) =>
        records.filter((prompt) => {
          const categoryMatches = !where.category || prompt.category === where.category;
          const ownerMatches = where.OR.some((condition) => {
            if (condition.owner === PromptOwner.Platform) return prompt.owner === PromptOwner.Platform;
            return prompt.owner === PromptOwner.Private && prompt.authorId === condition.authorId;
          });
          return categoryMatches && ownerMatches;
        }),
      findFirst: async ({ where }: { where: { id?: string; category?: string; OR?: Array<Record<string, unknown>> } }) =>
        records.find((prompt) => {
          const idMatches = !where.id || prompt.id === where.id;
          const categoryMatches = !where.category || prompt.category === where.category;
          const ownerMatches =
            !where.OR ||
            where.OR.some((condition) => {
              if (condition.owner === PromptOwner.Platform) return prompt.owner === PromptOwner.Platform;
              return prompt.owner === PromptOwner.Private && prompt.authorId === condition.authorId;
            });
          return idMatches && categoryMatches && ownerMatches;
        }) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdCount += 1;
        const record = {
          ...platformPrompt,
          id: `created-${createdCount}`,
          owner: data.owner as PromptOwner,
          authorId: data.authorId as string,
          name: data.name as string,
          category: data.category as string,
          systemPrompt: data.systemPrompt as string,
          userTemplate: data.userTemplate as string,
          paramsSchema: data.paramsSchema ?? {},
          fewShots: data.fewShots ?? [],
          sourcePromptId: (data.sourcePromptId as string | undefined) ?? null,
          isStarter: false,
        };
        records.push(record);
        return record;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const index = records.findIndex((prompt) => prompt.id === where.id);
        if (index < 0) throw new Error("not found");
        records[index] = {
          ...records[index],
          ...(data.name ? { name: data.name as string } : {}),
          ...(data.userTemplate ? { userTemplate: data.userTemplate as string } : {}),
          ...(data.paramsSchema ? { paramsSchema: data.paramsSchema } : {}),
        };
        return records[index];
      },
    },
  };

  return {
    service: new PromptsService(prisma as never),
    records,
  };
}

describe("PromptsService", () => {
  it("lists platform prompts and current user private prompts by category", async () => {
    const { service } = createService();

    const response = await service.listAvailablePrompts("user-1", "article_generation");

    assert.deepEqual(response.items.map((item) => item.id), ["platform-1"]);
    assert.equal(response.items[0].description, "Platform prompt");
  });

  it("does not list another user's private prompts", async () => {
    const { service } = createService();

    const response = await service.listAvailablePrompts("user-2");

    assert.deepEqual(response.items.map((item) => item.id), ["platform-1"]);
  });

  it("returns a usable platform prompt for generation", async () => {
    const { service } = createService();

    const prompt = await service.getUsablePrompt("platform-1", "user-2", "article_generation");

    assert.equal(prompt.systemPrompt, "System");
    assert.equal(prompt.userTemplate, "User");
  });

  it("rejects missing or unauthorized prompts", async () => {
    const { service } = createService();

    await assert.rejects(
      () => service.getUsablePrompt("private-1", "user-2", "article_rewrite"),
      NotFoundException,
    );
  });

  it("creates a private article generation prompt with a controlled system prompt", async () => {
    const { service, records } = createService();

    const response = await service.createPrivatePrompt("user-1", {
      name: "我的科普 Prompt",
      category: "article_generation",
      description: "适合科普图文",
      userTemplate: "# Identity\n你是科普创作助手。\n# Instructions\n* 围绕 {{topic}} 展开。",
    });

    assert.equal(response.prompt.owner, PromptOwner.Private);
    assert.equal(response.prompt.readonly, false);
    assert.equal(response.prompt.description, "适合科普图文");
    assert.match(response.prompt.outputContractPreview, /title、outline、bodyText/);
    const created = records.find((prompt) => prompt.id === response.prompt.id);
    assert.equal(created?.authorId, "user-1");
    assert.match(created?.systemPrompt ?? "", /AI Creator Hub/);
  });

  it("copies a platform prompt into a user-editable private prompt", async () => {
    const { service, records } = createService();

    const response = await service.copyPrompt("platform-1", "user-1");

    assert.equal(response.prompt.owner, PromptOwner.Private);
    assert.equal(response.prompt.readonly, false);
    assert.equal(response.prompt.sourcePromptId, "platform-1");
    assert.match(response.prompt.name, /自定义/);
    const copied = records.find((prompt) => prompt.id === response.prompt.id);
    assert.equal(copied?.sourcePromptId, "platform-1");
  });

  it("updates only the current user's private prompt", async () => {
    const { service } = createService();

    const response = await service.updatePrivatePrompt("private-1", "user-1", {
      name: "更新后的 Prompt",
      description: "新的说明",
      userTemplate: "# Identity\n你是新的助手。\n# Instructions\n* 围绕 {{topic}} 展开。",
    });

    assert.equal(response.prompt.name, "更新后的 Prompt");
    assert.equal(response.prompt.description, "新的说明");
    assert.match(response.prompt.userTemplate, /新的助手/);
  });

  it("rejects updates to platform prompts", async () => {
    const { service } = createService();

    await assert.rejects(
      () =>
        service.updatePrivatePrompt("platform-1", "user-1", {
          name: "不能改平台模板",
          userTemplate: "# Identity\n测试",
        }),
      ForbiddenException,
    );
  });

  it("returns prompt details only when the prompt is usable by the current user", async () => {
    const { service } = createService();

    const detail = await service.getPromptDetail("platform-1", "user-2");

    assert.equal(detail.readonly, true);
    assert.equal(detail.owner, PromptOwner.Platform);

    await assert.rejects(() => service.getPromptDetail("private-1", "user-2"), NotFoundException);
  });
});
