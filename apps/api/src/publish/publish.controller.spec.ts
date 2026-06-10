import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PublishController } from "./publish.controller";

describe("PublishController", () => {
  it("publishes a draft for the current user", async () => {
    const calls: unknown[][] = [];
    const publishService = {
      publishDraft: async (...args: unknown[]) => {
        calls.push(args);
        return { articleId: "article-1" };
      },
      getPublishedArticle: async () => ({ id: "unused" }),
      withdrawArticle: async () => ({ ok: true }),
    };
    const controller = new PublishController(publishService as never);

    const result = await controller.publish("user-1", "draft-1");

    assert.deepEqual(calls, [["user-1", "draft-1"]]);
    assert.deepEqual(result, { articleId: "article-1" });
  });

  it("returns a public published article without a user context", async () => {
    const calls: unknown[][] = [];
    const publishService = {
      publishDraft: async () => ({ articleId: "unused" }),
      getPublishedArticle: async (...args: unknown[]) => {
        calls.push(args);
        return { id: "article-1" };
      },
      withdrawArticle: async () => ({ ok: true }),
    };
    const controller = new PublishController(publishService as never);

    const result = await controller.getArticle("article-1");

    assert.deepEqual(calls, [["article-1"]]);
    assert.deepEqual(result, { id: "article-1" });
  });

  it("withdraws an article for the current user", async () => {
    const calls: unknown[][] = [];
    const publishService = {
      publishDraft: async () => ({ articleId: "unused" }),
      getPublishedArticle: async () => ({ id: "unused" }),
      withdrawArticle: async (...args: unknown[]) => {
        calls.push(args);
        return { id: "article-1", status: "WITHDRAWN" };
      },
    };
    const controller = new PublishController(publishService as never);

    const result = await controller.withdrawArticle("user-1", "article-1");

    assert.deepEqual(calls, [["user-1", "article-1"]]);
    assert.deepEqual(result, { id: "article-1", status: "WITHDRAWN" });
  });
});
