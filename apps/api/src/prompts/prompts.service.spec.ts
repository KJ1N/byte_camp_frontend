import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NotFoundException } from "@nestjs/common";
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

function createService(prompts = [platformPrompt, privatePrompt]) {
  const prisma = {
    prompt: {
      findMany: async ({ where }: { where: { category?: string; OR: Array<Record<string, unknown>> } }) =>
        prompts.filter((prompt) => {
          const categoryMatches = !where.category || prompt.category === where.category;
          const ownerMatches = where.OR.some((condition) => {
            if (condition.owner === PromptOwner.Platform) return prompt.owner === PromptOwner.Platform;
            return prompt.owner === PromptOwner.Private && prompt.authorId === condition.authorId;
          });
          return categoryMatches && ownerMatches;
        }),
      findFirst: async ({ where }: { where: { id?: string; category?: string; OR?: Array<Record<string, unknown>> } }) =>
        prompts.find((prompt) => {
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
    },
  };

  return new PromptsService(prisma as never);
}

describe("PromptsService", () => {
  it("lists platform prompts and current user private prompts by category", async () => {
    const service = createService();

    const response = await service.listAvailablePrompts("user-1", "article_generation");

    assert.deepEqual(response.items.map((item) => item.id), ["platform-1"]);
    assert.equal(response.items[0].description, "Platform prompt");
  });

  it("does not list another user's private prompts", async () => {
    const service = createService();

    const response = await service.listAvailablePrompts("user-2");

    assert.deepEqual(response.items.map((item) => item.id), ["platform-1"]);
  });

  it("returns a usable platform prompt for generation", async () => {
    const service = createService();

    const prompt = await service.getUsablePrompt("platform-1", "user-2", "article_generation");

    assert.equal(prompt.systemPrompt, "System");
    assert.equal(prompt.userTemplate, "User");
  });

  it("rejects missing or unauthorized prompts", async () => {
    const service = createService();

    await assert.rejects(
      () => service.getUsablePrompt("private-1", "user-2", "article_rewrite"),
      NotFoundException,
    );
  });
});
