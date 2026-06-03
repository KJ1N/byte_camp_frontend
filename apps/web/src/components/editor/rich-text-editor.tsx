"use client";

import { useEffect } from "react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { RichTextDocument } from "@bytecamp-aigc/shared";

interface RichTextEditorProps {
  value: RichTextDocument;
  onChange: (value: RichTextDocument) => void;
}

const toolbarGroups = [
  [
    { label: "撤销", action: "undo" },
    { label: "重做", action: "redo" },
  ],
  [
    { label: "H", action: "heading" },
    { label: "B", action: "bold" },
    { label: "引用", action: "blockquote" },
  ],
  [
    { label: "列表", action: "bulletList" },
    { label: "编号", action: "orderedList" },
    { label: "分割", action: "horizontalRule" },
  ],
] as const;

export function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit],
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
      editor.commands.setContent(value as unknown as JSONContent);
    }
  }, [editor, value]);

  function run(action: (typeof toolbarGroups)[number][number]["action"]) {
    if (!editor) return;

    if (action === "undo") editor.chain().focus().undo().run();
    if (action === "redo") editor.chain().focus().redo().run();
    if (action === "heading") editor.chain().focus().toggleHeading({ level: 2 }).run();
    if (action === "bold") editor.chain().focus().toggleBold().run();
    if (action === "blockquote") editor.chain().focus().toggleBlockquote().run();
    if (action === "bulletList") editor.chain().focus().toggleBulletList().run();
    if (action === "orderedList") editor.chain().focus().toggleOrderedList().run();
    if (action === "horizontalRule") editor.chain().focus().setHorizontalRule().run();
  }

  function isActive(action: (typeof toolbarGroups)[number][number]["action"]) {
    if (!editor) return false;
    if (action === "heading") return editor.isActive("heading", { level: 2 });
    if (action === "bold") return editor.isActive("bold");
    if (action === "blockquote") return editor.isActive("blockquote");
    if (action === "bulletList") return editor.isActive("bulletList");
    if (action === "orderedList") return editor.isActive("orderedList");
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
                aria-label={item.label}
                className={[
                  "h-9 min-w-9 rounded-md px-2 text-sm font-semibold transition",
                  isActive(item.action)
                    ? "bg-[#fff1f1] text-[#ff4d4f]"
                    : "text-[#3b3f45] hover:bg-[#f4f5f7]",
                ].join(" ")}
                disabled={!editor}
                key={item.action}
                type="button"
                onClick={() => run(item.action)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}
        <div className="ml-auto hidden items-center gap-2 text-sm text-[#8f959e] md:flex">
          <span>图片</span>
          <span>链接</span>
          <span>表情</span>
          <span>更多</span>
        </div>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}
