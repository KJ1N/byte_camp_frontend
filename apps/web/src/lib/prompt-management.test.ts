import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PromptOwner, type PromptTemplateSummary } from "@bytecamp-aigc/shared";

import {
  createDefaultPromptTemplate,
  getPromptEditButtonLabel,
  getPromptEditAction,
  groupPromptTemplates,
  isPromptDraftValid,
  nextSelectedPromptIdAfterSave,
  shouldDisablePromptEdit,
} from "./prompt-management.ts";

const platformPrompt: PromptTemplateSummary = {
  id: "platform-1",
  name: "头条资讯图文生成",
  category: "article_generation",
  owner: PromptOwner.Platform,
  isStarter: true,
  description: "平台默认模板",
};

const privatePrompt: PromptTemplateSummary = {
  id: "private-1",
  name: "我的 Prompt",
  category: "article_generation",
  owner: PromptOwner.Private,
  isStarter: false,
  description: "自定义模板",
};

describe("prompt management helpers", () => {
  it("creates a default editable prompt using the docx-inspired sections", () => {
    const template = createDefaultPromptTemplate();

    assert.match(template, /# Identity/);
    assert.match(template, /# Instructions/);
    assert.match(template, /固定输出规范/);
    assert.match(template, /# Examples/);
    assert.match(template, /{{topic}}/);
    assert.match(template, /{{audience}}/);
    assert.match(template, /{{style}}/);
  });

  it("groups platform and private prompts for the workspace selector", () => {
    const groups = groupPromptTemplates([privatePrompt, platformPrompt]);

    assert.deepEqual(groups.platform.map((prompt) => prompt.id), ["platform-1"]);
    assert.deepEqual(groups.private.map((prompt) => prompt.id), ["private-1"]);
  });

  it("copies platform prompts before editing and directly edits private prompts", () => {
    assert.equal(getPromptEditAction(platformPrompt), "copy");
    assert.equal(getPromptEditAction(privatePrompt), "edit");
  });

  it("does not show the fallback prompt as copying when no copy is in progress", () => {
    const fallbackPrompt: PromptTemplateSummary = {
      id: "",
      name: "默认生成模板",
      category: "article_generation",
      owner: PromptOwner.Platform,
      isStarter: true,
      description: "使用后端默认 Prompt",
    };

    assert.equal(getPromptEditButtonLabel(fallbackPrompt, ""), "修改");
    assert.equal(shouldDisablePromptEdit(fallbackPrompt, null), true);
  });

  it("validates prompt drafts before saving", () => {
    assert.equal(
      isPromptDraftValid({
        name: "我的 Prompt",
        description: "说明",
        userTemplate: createDefaultPromptTemplate(),
      }),
      true,
    );
    assert.equal(
      isPromptDraftValid({
        name: " ",
        description: "说明",
        userTemplate: createDefaultPromptTemplate(),
      }),
      false,
    );
    assert.equal(
      isPromptDraftValid({
        name: "我的 Prompt",
        description: "说明",
        userTemplate: "太短",
      }),
      false,
    );
    assert.equal(
      isPromptDraftValid({
        name: "我的 Prompt",
        description: "说明",
        userTemplate: "x".repeat(4001),
      }),
      false,
    );
  });

  it("selects the saved prompt after create or update", () => {
    assert.equal(nextSelectedPromptIdAfterSave("created-1", "platform-1"), "created-1");
    assert.equal(nextSelectedPromptIdAfterSave(undefined, "private-1"), "private-1");
  });
});
