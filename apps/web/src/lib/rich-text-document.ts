import type { RichTextDocument, RichTextNode } from "@bytecamp-aigc/shared";
import { richTextToPlainText } from "@bytecamp-aigc/shared";

export function replaceWithPlainText(text: string): RichTextDocument {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return {
    type: "doc",
    content: (paragraphs.length ? paragraphs : [""]).map((paragraph) => createParagraph(paragraph)),
  };
}

export function appendPlainTextParagraph(doc: RichTextDocument, text: string): RichTextDocument {
  const paragraphText = text.trim();
  if (!paragraphText) return doc;

  return {
    ...doc,
    content: [...doc.content, createParagraph(paragraphText)],
  };
}

export function plainTextFromRichText(doc: RichTextDocument): string {
  return richTextToPlainText(doc);
}

function createParagraph(text: string): RichTextNode {
  return {
    type: "paragraph",
    content: text ? [{ type: "text", text }] : [],
  };
}
