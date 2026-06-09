import type { GeneratedImageResult, RichTextDocument, RichTextNode } from "@bytecamp-aigc/shared";

function createParagraph(text: string): RichTextNode {
  return {
    type: "paragraph",
    content: text ? [{ type: "text", text }] : [],
  };
}

function createImageNode(image: GeneratedImageResult): RichTextNode {
  return {
    type: "image",
    attrs: {
      src: image.url,
      alt: image.alt,
      title: image.caption,
    },
  };
}

export function buildMultimodalGeneratedBody(
  bodyText: string,
  images: GeneratedImageResult[],
): RichTextDocument {
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const nodes = paragraphs.length ? paragraphs.map(createParagraph) : [createParagraph("")];
  const validImages = images.filter((image) => image.status === "completed" && /^https?:\/\//i.test(image.url));

  if (!validImages.length) {
    return { type: "doc", content: nodes };
  }

  const content: RichTextNode[] = [];
  const insertAfterIndexes = getImageInsertIndexes(nodes.length, validImages.length);
  let imageCursor = 0;

  for (const [index, node] of nodes.entries()) {
    content.push(node);

    while (insertAfterIndexes[imageCursor] === index) {
      const image = validImages[imageCursor];
      content.push(createImageNode(image));
      if (image.caption.trim()) {
        content.push(createParagraph(`图 ${image.index + 1}: ${image.caption.trim()}`));
      }
      imageCursor += 1;
    }
  }

  while (imageCursor < validImages.length) {
    const image = validImages[imageCursor];
    content.push(createImageNode(image));
    if (image.caption.trim()) {
      content.push(createParagraph(`图 ${image.index + 1}: ${image.caption.trim()}`));
    }
    imageCursor += 1;
  }

  return { type: "doc", content };
}

function getImageInsertIndexes(paragraphCount: number, imageCount: number) {
  return Array.from({ length: imageCount }, (_, imageIndex) => {
    const ratio = (imageIndex + 1) / (imageCount + 1);
    return Math.max(0, Math.min(paragraphCount - 1, Math.floor(ratio * paragraphCount)));
  });
}
