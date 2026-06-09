import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GeneratedImageResult } from "@bytecamp-aigc/shared";

import { buildMultimodalGeneratedBody } from "./multimodal-generated-body.ts";
import { plainTextFromRichText } from "./rich-text-document.ts";

const image: GeneratedImageResult = {
  index: 0,
  status: "completed",
  url: "https://example.test/shanghai.png",
  model: "doubao-seedream-4-5-251128",
  prompt: "近代上海外滩租界街景",
  caption: "外滩一带保留了许多租界时期建筑",
  alt: "上海外滩租界建筑",
};

describe("buildMultimodalGeneratedBody", () => {
  it("inserts completed image nodes with captions between paragraphs", () => {
    const doc = buildMultimodalGeneratedBody("第一段。\n\n第二段。\n\n第三段。", [image]);

    assert.equal(doc.type, "doc");
    assert.equal(doc.content.some((node) => node.type === "image"), true);
    assert.deepEqual(
      doc.content.find((node) => node.type === "image")?.attrs,
      {
        src: "https://example.test/shanghai.png",
        alt: "上海外滩租界建筑",
        title: "外滩一带保留了许多租界时期建筑",
      },
    );
    assert.match(plainTextFromRichText(doc), /图 1: 外滩一带保留了许多租界时期建筑/);
  });

  it("keeps plain text body when there are no usable image urls", () => {
    const doc = buildMultimodalGeneratedBody("只有正文。", [
      {
        ...image,
        url: "",
      },
    ]);

    assert.equal(doc.content.length, 1);
    assert.equal(doc.content[0].type, "paragraph");
    assert.equal(plainTextFromRichText(doc), "只有正文。");
  });
});
