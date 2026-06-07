import type { ReactNode } from "react";
import type { RichTextDocument, RichTextMark, RichTextNode } from "@bytecamp-aigc/shared";

import { normalizeRichTextDocument } from "@/lib/rich-text-document";

interface RichTextViewerProps {
  value: RichTextDocument;
  emptyText?: string;
}

export function RichTextViewer({ value, emptyText = "正文为空。" }: RichTextViewerProps) {
  const doc = normalizeRichTextDocument(value);
  const nodes = doc.content.filter((node) => hasRenderableContent(node));

  if (!nodes.length) {
    return <p className="text-[#8f959e]">{emptyText}</p>;
  }

  return <>{nodes.map((node, index) => renderBlockNode(node, index))}</>;
}

function renderBlockNode(node: RichTextNode, index: number): ReactNode {
  const key = `${node.type}-${index}`;
  const children = renderInlineChildren(node);

  if (node.type === "heading") {
    const level = getHeadingLevel(node);
    const className = "mt-8 mb-3 font-semibold leading-snug text-[#1f2329]";
    if (level === 1) return <h1 className={`${className} text-3xl`} key={key}>{children}</h1>;
    if (level === 3) return <h3 className={`${className} text-xl`} key={key}>{children}</h3>;
    return <h2 className={`${className} text-2xl`} key={key}>{children}</h2>;
  }

  if (node.type === "bulletList") {
    return (
      <ul className="my-5 list-disc space-y-2 pl-6" key={key}>
        {(node.content ?? []).map((child, childIndex) => renderListItem(child, childIndex))}
      </ul>
    );
  }

  if (node.type === "orderedList") {
    return (
      <ol className="my-5 list-decimal space-y-2 pl-6" key={key}>
        {(node.content ?? []).map((child, childIndex) => renderListItem(child, childIndex))}
      </ol>
    );
  }

  if (node.type === "blockquote") {
    return (
      <blockquote className="my-5 border-l-4 border-[#ffd4d4] bg-[#fff8f8] px-4 py-3 text-[#4e5661]" key={key}>
        {(node.content ?? []).map((child, childIndex) => renderBlockNode(child, childIndex))}
      </blockquote>
    );
  }

  if (node.type === "horizontalRule") {
    return <hr className="my-8 border-[#eeeeee]" key={key} />;
  }

  if (node.type === "image") {
    return renderImage(node, key);
  }

  return (
    <p className="my-5 text-[17px] leading-9 text-[#2f3640]" key={key}>
      {children}
    </p>
  );
}

function renderListItem(node: RichTextNode, index: number) {
  return (
    <li className="leading-8" key={`${node.type}-${index}`}>
      {(node.content ?? []).map((child, childIndex) =>
        child.type === "paragraph" ? (
          <span key={`${child.type}-${childIndex}`}>{renderInlineChildren(child)}</span>
        ) : (
          renderBlockNode(child, childIndex)
        ),
      )}
    </li>
  );
}

function renderInlineChildren(node: RichTextNode) {
  return (node.content ?? []).map((child, index) => renderInlineNode(child, index));
}

function renderInlineNode(node: RichTextNode, index: number): ReactNode {
  if (node.type === "hardBreak") {
    return <br key={`${node.type}-${index}`} />;
  }

  if (node.type === "image") {
    return renderImage(node, `${node.type}-${index}`);
  }

  if (node.type !== "text") {
    return renderInlineChildren(node);
  }

  return applyMarks(node.text ?? "", node.marks ?? [], `${node.type}-${index}`);
}

function applyMarks(text: string, marks: RichTextMark[], key: string): ReactNode {
  return marks.reduce<ReactNode>((content, mark, index) => {
    const markKey = `${key}-${mark.type}-${index}`;
    if (mark.type === "bold") return <strong key={markKey}>{content}</strong>;
    if (mark.type === "italic") return <em key={markKey}>{content}</em>;
    if (mark.type === "underline") return <u key={markKey}>{content}</u>;
    if (mark.type === "strike") return <s key={markKey}>{content}</s>;
    if (mark.type === "code") {
      return (
        <code className="rounded bg-[#f4f5f7] px-1 py-0.5 font-mono text-[0.92em]" key={markKey}>
          {content}
        </code>
      );
    }
    if (mark.type === "link") {
      const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
      return href ? (
        <a className="text-[#d92d2d] underline underline-offset-4" href={href} key={markKey} rel="noreferrer" target="_blank">
          {content}
        </a>
      ) : (
        content
      );
    }
    return content;
  }, text);
}

function renderImage(node: RichTextNode, key: string) {
  const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
  if (!src) return null;

  const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
  return (
    <img
      alt={alt}
      className="my-6 max-h-[520px] w-full rounded-md object-contain"
      key={key}
      src={src}
    />
  );
}

function getHeadingLevel(node: RichTextNode) {
  return node.attrs?.level === 1 || node.attrs?.level === 3 ? node.attrs.level : 2;
}

function hasRenderableContent(node: RichTextNode): boolean {
  if (node.type === "text") return Boolean(node.text);
  if (node.type === "horizontalRule" || node.type === "image") return true;
  return (node.content ?? []).some((child) => hasRenderableContent(child));
}
