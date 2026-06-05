"use client";

import { useEffect } from "react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import type { RichTextDocument } from "@bytecamp-aigc/shared";

interface RichTextEditorProps {
  value: RichTextDocument;
  onChange: (value: RichTextDocument) => void;
}

type ToolbarAction =
  | "undo"
  | "redo"
  | "heading"
  | "bold"
  | "italic"
  | "underline"
  | "blockquote"
  | "bulletList"
  | "orderedList"
  | "horizontalRule"
  | "link"
  | "image";

const toolbarGroups: Array<Array<{ label: string; action: ToolbarAction; title: string }>> = [
  [
    { label: "↶", action: "undo", title: "撤销" },
    { label: "↷", action: "redo", title: "重做" },
  ],
  [
    { label: "H2", action: "heading", title: "二级标题" },
    { label: "B", action: "bold", title: "加粗" },
    { label: "I", action: "italic", title: "斜体" },
    { label: "U", action: "underline", title: "下划线" },
    { label: "“”", action: "blockquote", title: "引用" },
  ],
  [
    { label: "•", action: "bulletList", title: "无序列表" },
    { label: "1.", action: "orderedList", title: "有序列表" },
    { label: "—", action: "horizontalRule", title: "分割线" },
  ],
  [
    { label: "链", action: "link", title: "插入链接" },
    { label: "图", action: "image", title: "插入图片 URL" },
  ],
];

export function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: false,
        underline: false,
      }),
      Underline,
      Link.configure({
        autolink: true,
        openOnClick: false,
        protocols: ["http", "https"],
      }),
      Image.configure({
        allowBase64: false,
      }),
    ],
    content: value as unknown as JSONContent,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "min-h-[520px] outline-none px-2 py-8 text-[17px] leading-9 text-[#1f2329] prose-p:my-5 prose-strong:text-[#1f2329]",
      },
    },
    onUpdate({ editor: currentEditor }) {
      onChange(currentEditor.getJSON() as RichTextDocument);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(value);
    if (current !== next) {
      editor.commands.setContent(value as unknown as JSONContent, { emitUpdate: false });
    }
  }, [editor, value]);

  function run(action: ToolbarAction) {
    if (!editor) return;

    if (action === "undo") editor.chain().focus().undo().run();
    if (action === "redo") editor.chain().focus().redo().run();
    if (action === "heading") editor.chain().focus().toggleHeading({ level: 2 }).run();
    if (action === "bold") editor.chain().focus().toggleBold().run();
    if (action === "italic") editor.chain().focus().toggleItalic().run();
    if (action === "underline") editor.chain().focus().toggleUnderline().run();
    if (action === "blockquote") editor.chain().focus().toggleBlockquote().run();
    if (action === "bulletList") editor.chain().focus().toggleBulletList().run();
    if (action === "orderedList") editor.chain().focus().toggleOrderedList().run();
    if (action === "horizontalRule") editor.chain().focus().setHorizontalRule().run();
    if (action === "link") setLink();
    if (action === "image") insertImage();
  }

  function setLink() {
    if (!editor) return;

    const currentHref = editor.getAttributes("link").href as string | undefined;
    const nextHref = window.prompt("请输入 http/https 链接地址", currentHref ?? "https://");
    if (nextHref === null) return;

    const href = nextHref.trim();
    if (!href) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    if (!/^https?:\/\//i.test(href)) {
      window.alert("链接仅支持 http 或 https 地址。");
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }

  function insertImage() {
    if (!editor) return;

    const nextSrc = window.prompt("请输入 http/https 图片地址");
    if (nextSrc === null) return;

    const src = nextSrc.trim();
    if (!src) return;

    if (!/^https?:\/\//i.test(src)) {
      window.alert("图片地址仅支持 http 或 https。");
      return;
    }

    editor.chain().focus().setImage({ src }).run();
  }

  function isActive(action: ToolbarAction) {
    if (!editor) return false;
    if (action === "heading") return editor.isActive("heading", { level: 2 });
    if (action === "bold") return editor.isActive("bold");
    if (action === "italic") return editor.isActive("italic");
    if (action === "underline") return editor.isActive("underline");
    if (action === "blockquote") return editor.isActive("blockquote");
    if (action === "bulletList") return editor.isActive("bulletList");
    if (action === "orderedList") return editor.isActive("orderedList");
    if (action === "link") return editor.isActive("link");
    return false;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-[#eeeeee] px-8 py-4">
        {toolbarGroups.map((group, groupIndex) => (
          <div className="flex items-center gap-2" key={groupIndex}>
            {groupIndex > 0 ? <span className="mx-2 h-6 w-px bg-[#dddddd]" /> : null}
            {group.map((item) => (
              <button
                aria-label={item.title}
                className={[
                  "h-9 min-w-9 rounded-md px-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff4d4f]",
                  isActive(item.action)
                    ? "bg-[#fff1f1] text-[#ff4d4f]"
                    : "text-[#3b3f45] hover:bg-[#f4f5f7]",
                ].join(" ")}
                disabled={!editor}
                key={item.action}
                title={item.title}
                type="button"
                onClick={() => run(item.action)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}
        <div className="ml-auto hidden items-center gap-2 text-sm text-[#8f959e] md:flex">
          <span>正文支持图片 URL、链接、列表和引用</span>
        </div>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}
