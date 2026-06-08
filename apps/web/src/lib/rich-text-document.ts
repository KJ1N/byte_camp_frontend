import type { RichTextDocument, RichTextNode } from "@bytecamp-aigc/shared";
import { richTextToPlainText } from "@bytecamp-aigc/shared";

export function replaceWithPlainText(text: string): RichTextDocument {
  return {
    type: "doc",
    content: parseTextNodes(text),
  };
}

export function appendPlainTextParagraph(doc: RichTextDocument, text: string): RichTextDocument {
  const nextNodes = parseTextNodes(text);
  if (nextNodes.length === 1 && nextNodes[0].type === "paragraph" && !(nextNodes[0].content?.length ?? 0)) {
    return doc;
  }

  return {
    ...doc,
    content: [...doc.content, ...nextNodes],
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

function parseTextNodes(text: string): RichTextNode[] {
  const imagePattern = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
  const nodes: RichTextNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(imagePattern)) {
    const index = match.index ?? 0;
    appendParagraphNodes(nodes, text.slice(lastIndex, index));
    nodes.push(createImageNode(match[2], match[1]));
    lastIndex = index + match[0].length;
  }

  appendParagraphNodes(nodes, text.slice(lastIndex));

  return nodes.length ? nodes : [createParagraph("")];
}

function appendParagraphNodes(nodes: RichTextNode[], text: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  for (const paragraph of paragraphs) {
    nodes.push(createParagraph(paragraph));
  }
}

function createParagraph(text: string): RichTextNode {
  return {
    type: "paragraph",
    content: text ? [{ type: "text", text }] : [],
  };
}

function createImageNode(src: string, alt: string): RichTextNode {
  return {
    type: "image",
    attrs: alt ? { src, alt } : { src },
  };
}
