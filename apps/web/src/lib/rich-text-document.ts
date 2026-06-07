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

export function normalizeRichTextDocument(doc: RichTextDocument): RichTextDocument {
  const content = doc.content
    .map((node) => normalizeRichTextNode(node))
    .filter((node): node is RichTextNode => Boolean(node));

  return {
    type: "doc",
    content: content.length ? content : [createParagraph("")],
  };
}

export function plainTextFromRichText(doc: RichTextDocument): string {
  return richTextToPlainText(doc);
}

function normalizeRichTextNode(node: RichTextNode): RichTextNode | null {
  if (node.type === "text") {
    return node.text ? node : null;
  }

  const content = (node.content ?? [])
    .map((child) => normalizeRichTextNode(child))
    .filter((child): child is RichTextNode => Boolean(child));
  const next: RichTextNode = { ...node };

  if (content.length || canHaveEmptyContent(node.type)) {
    next.content = content;
  } else {
    delete next.content;
  }

  return next;
}

function canHaveEmptyContent(type: string) {
  return ["blockquote", "bulletList", "heading", "listItem", "orderedList", "paragraph"].includes(type);
}

function createParagraph(text: string): RichTextNode {
  return {
    type: "paragraph",
    content: text ? [{ type: "text", text }] : [],
  };
}
