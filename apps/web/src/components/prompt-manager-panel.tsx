"use client";

import { useState } from "react";
import {
  type DeletePromptResponse,
  PromptOwner,
  type PromptTemplateDetail,
  type PromptTemplateMutationResponse,
  type PromptTemplateSummary,
} from "@bytecamp-aigc/shared";

import { apiFetch, getApiErrorMessage, readApiJson } from "@/lib/api";
import {
  canDeletePrompt,
  createDefaultPromptTemplate,
  getPromptEditButtonLabel,
  getPromptEditAction,
  groupPromptTemplates,
  isPromptDraftValid,
  shouldDisablePromptEdit,
  type PromptDraft,
} from "@/lib/prompt-management";

interface PromptManagerPanelProps {
  authToken: string | null;
  prompts: PromptTemplateSummary[];
  promptsLoading: boolean;
  selectedPromptId: string;
  category?: string;
  onSelectPrompt: (promptId: string) => void;
  onPromptSaved: (prompt: PromptTemplateDetail) => void;
  onPromptDeleted: (promptId: string) => void;
  onError: (message: string) => void;
}

type EditorMode = "new" | "edit";

interface EditorState {
  mode: EditorMode;
  promptId?: string;
  draft: PromptDraft;
}

export function PromptManagerPanel({
  authToken,
  prompts,
  promptsLoading,
  selectedPromptId,
  category = "article_generation",
  onSelectPrompt,
  onPromptSaved,
  onPromptDeleted,
  onError,
}: PromptManagerPanelProps) {
  const groups = groupPromptTemplates(prompts);
  const visiblePrompts = prompts.length
    ? prompts
    : [
        {
          id: "",
          name: "默认生成模板",
          category,
          owner: PromptOwner.Platform,
          isStarter: true,
          description: "使用后端默认 Prompt",
        },
      ];

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [copyingId, setCopyingId] = useState("");
  const [deletingId, setDeletingId] = useState("");

  function openNewPrompt() {
    setEditor({
      mode: "new",
      draft: {
        name: "我的图文生成 Prompt",
        description: "适合我的图文创作习惯",
        userTemplate: createDefaultPromptTemplate(),
      },
    });
  }

  async function editPrompt(prompt: PromptTemplateSummary) {
    if (!authToken) return;

    const action = getPromptEditAction(prompt);

    if (action === "copy") {
      await copyPlatformPrompt(prompt.id);
      return;
    }

    const response = await apiFetch(`/prompts/${prompt.id}`, { authToken });
    const payload = await readApiJson<PromptTemplateDetail | { message?: string | string[] }>(response);

    if (!response.ok || !isPromptTemplateDetail(payload)) {
      onError(getApiErrorMessage(payload, "Prompt 详情加载失败，请稍后重试。"));
      return;
    }

    setEditor({
      mode: "edit",
      promptId: payload.id,
      draft: {
        name: payload.name,
        description: payload.description ?? "",
        userTemplate: payload.userTemplate,
      },
    });
  }

  async function copyPlatformPrompt(promptId: string) {
    if (!authToken) return;

    setCopyingId(promptId);
    const response = await apiFetch(`/prompts/${promptId}/copy`, {
      method: "POST",
      authToken,
      body: JSON.stringify({}),
    });
    const payload = await readApiJson<PromptTemplateMutationResponse | { message?: string | string[] }>(response);
    setCopyingId("");

    if (!response.ok || !isPromptMutationResponse(payload)) {
      onError(getApiErrorMessage(payload, "复制平台 Prompt 失败，请稍后重试。"));
      return;
    }

    onPromptSaved(payload.prompt);
    setEditor({
      mode: "edit",
      promptId: payload.prompt.id,
      draft: {
        name: payload.prompt.name,
        description: payload.prompt.description ?? "",
        userTemplate: payload.prompt.userTemplate,
      },
    });
  }

  async function savePrompt() {
    if (!authToken || !editor || !isPromptDraftValid(editor.draft)) return;

    setSaving(true);
    const isEdit = editor.mode === "edit" && editor.promptId;
    const response = await apiFetch(isEdit ? `/prompts/${editor.promptId}` : "/prompts", {
      method: isEdit ? "PATCH" : "POST",
      authToken,
      body: JSON.stringify({
        name: editor.draft.name,
        category,
        description: editor.draft.description,
        userTemplate: editor.draft.userTemplate,
      }),
    });
    const payload = await readApiJson<PromptTemplateMutationResponse | { message?: string | string[] }>(response);
    setSaving(false);

    if (!response.ok || !isPromptMutationResponse(payload)) {
      onError(getApiErrorMessage(payload, "Prompt 保存失败，请稍后重试。"));
      return;
    }

    onPromptSaved(payload.prompt);
    setEditor({
      mode: "edit",
      promptId: payload.prompt.id,
      draft: {
        name: payload.prompt.name,
        description: payload.prompt.description ?? "",
        userTemplate: payload.prompt.userTemplate,
      },
    });
  }

  async function deletePrompt(prompt: PromptTemplateSummary) {
    if (!authToken || !canDeletePrompt(prompt, authToken) || deletingId) return;
    if (!window.confirm("确定删除这个 Prompt 吗？删除后不可恢复。")) return;

    setDeletingId(prompt.id);
    const response = await apiFetch(`/prompts/${prompt.id}`, {
      method: "DELETE",
      authToken,
    });
    const payload = await readApiJson<DeletePromptResponse | { message?: string | string[] }>(response);
    setDeletingId("");

    if (!response.ok || !isDeletePromptResponse(payload)) {
      onError(getApiErrorMessage(payload, "Prompt 删除失败，请稍后重试。"));
      return;
    }

    onPromptDeleted(payload.promptId);
    setEditor((current) => (current?.promptId === payload.promptId ? null : current));
  }

  const canSave = Boolean(editor && isPromptDraftValid(editor.draft) && !saving);

  return (
    <div className="mb-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <span className="block text-sm font-medium text-[#4e5661]">
          Prompt 模板 {promptsLoading ? "加载中..." : ""}
        </span>
        <button
          className="rounded-md border border-[#ffb6b7] bg-white px-3 py-1.5 text-xs font-semibold text-[#d92d2d] hover:bg-[#fff6f6] disabled:opacity-50"
          disabled={!authToken}
          type="button"
          onClick={openNewPrompt}
        >
          新增 Prompt
        </button>
      </div>

      {prompts.length ? (
        <div className="grid gap-3">
          <PromptGroup
            authToken={authToken}
            copyingId={copyingId}
            deletingId={deletingId}
            items={groups.platform}
            selectedPromptId={selectedPromptId}
            title="平台默认"
            onDelete={deletePrompt}
            onEdit={editPrompt}
            onSelect={onSelectPrompt}
          />
          <PromptGroup
            authToken={authToken}
            copyingId={copyingId}
            deletingId={deletingId}
            emptyText="还没有自定义 Prompt，可从平台模板复制或直接新增。"
            items={groups.private}
            selectedPromptId={selectedPromptId}
            title="我的 Prompt"
            onDelete={deletePrompt}
            onEdit={editPrompt}
            onSelect={onSelectPrompt}
          />
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-3">
          {visiblePrompts.map((prompt) => (
            <PromptCard
              copyingId={copyingId}
              deletingId={deletingId}
              key={prompt.id || "default"}
              prompt={prompt}
              selected={selectedPromptId === prompt.id || (!selectedPromptId && !prompt.id)}
              authToken={authToken}
              onDelete={deletePrompt}
              onEdit={editPrompt}
              onSelect={onSelectPrompt}
            />
          ))}
        </div>
      )}

      {editor ? (
        <section className="mt-4 rounded-md border border-[#ffd8d8] bg-white p-4">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-[#1f2329]">
                {editor.mode === "new" ? "新增自定义 Prompt" : "修改自定义 Prompt"}
              </div>
              <p className="mt-1 text-xs leading-5 text-[#8f959e]">
                自定义内容只影响写作要求，后端仍会强制要求模型返回标题、大纲和正文 JSON。
              </p>
            </div>
            <button
              className="rounded-md bg-[#f0f1f3] px-2.5 py-1.5 text-xs text-[#5d6673] hover:bg-[#e7e9ed]"
              type="button"
              onClick={() => setEditor(null)}
            >
              关闭
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[#4e5661]">名称</span>
              <input
                className="h-10 w-full rounded-md border border-[#dedede] px-3 text-sm outline-none focus:border-[#ff4d4f]"
                value={editor.draft.name}
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    draft: { ...editor.draft, name: event.target.value },
                  })
                }
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[#4e5661]">说明</span>
              <input
                className="h-10 w-full rounded-md border border-[#dedede] px-3 text-sm outline-none focus:border-[#ff4d4f]"
                value={editor.draft.description ?? ""}
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    draft: { ...editor.draft, description: event.target.value },
                  })
                }
              />
            </label>
          </div>

          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-medium text-[#4e5661]">Prompt 内容</span>
            <textarea
              className="min-h-72 w-full resize-y rounded-md border border-[#dedede] px-3 py-2 font-mono text-xs leading-6 outline-none focus:border-[#ff4d4f]"
              value={editor.draft.userTemplate}
              onChange={(event) =>
                setEditor({
                  ...editor,
                  draft: { ...editor.draft, userTemplate: event.target.value },
                })
              }
            />
          </label>

          <div className="mt-3 rounded-md bg-[#f7f8fa] px-3 py-2 text-xs leading-5 text-[#5d6673]">
            固定输出规范：后端会强制追加 `title`、`outline`、`bodyText` JSON 契约，并在返回后做结构化解析。
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              className="rounded-md bg-[#f0f1f3] px-4 py-2 text-sm font-medium text-[#4e5661]"
              type="button"
              onClick={() => setEditor(null)}
            >
              取消
            </button>
            <button
              className="rounded-md bg-[#ff4d4f] px-4 py-2 text-sm font-semibold text-white disabled:bg-[#f3a5a6]"
              disabled={!canSave}
              type="button"
              onClick={() => void savePrompt()}
            >
              {saving ? "保存中..." : "保存 Prompt"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PromptGroup({
  title,
  items,
  selectedPromptId,
  authToken,
  copyingId,
  deletingId,
  emptyText = "暂无模板",
  onSelect,
  onEdit,
  onDelete,
}: {
  title: string;
  items: PromptTemplateSummary[];
  selectedPromptId: string;
  authToken: string | null;
  copyingId: string;
  deletingId: string;
  emptyText?: string;
  onSelect: (promptId: string) => void;
  onEdit: (prompt: PromptTemplateSummary) => void | Promise<void>;
  onDelete: (prompt: PromptTemplateSummary) => void | Promise<void>;
}) {
  return (
    <section>
      <div className="mb-2 text-xs font-semibold text-[#8f959e]">{title}</div>
      {items.length ? (
        <div className="grid gap-2 md:grid-cols-3">
          {items.map((prompt) => (
            <PromptCard
              copyingId={copyingId}
              deletingId={deletingId}
              key={prompt.id}
              prompt={prompt}
              selected={selectedPromptId === prompt.id}
              authToken={authToken}
              onDelete={onDelete}
              onEdit={onEdit}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-[#dedede] bg-white px-3 py-3 text-xs text-[#8f959e]">
          {emptyText}
        </div>
      )}
    </section>
  );
}

function PromptCard({
  prompt,
  selected,
  authToken,
  copyingId,
  deletingId,
  onSelect,
  onEdit,
  onDelete,
}: {
  prompt: PromptTemplateSummary;
  selected: boolean;
  authToken: string | null;
  copyingId: string;
  deletingId: string;
  onSelect: (promptId: string) => void;
  onEdit: (prompt: PromptTemplateSummary) => void | Promise<void>;
  onDelete: (prompt: PromptTemplateSummary) => void | Promise<void>;
}) {
  const deleteEnabled = canDeletePrompt(prompt, authToken);

  return (
    <div
      className={[
        "rounded-md border bg-white px-3 py-2 text-left text-sm transition flex flex-col h-full",
        selected ? "border-[#ff4d4f] bg-[#fffafa] text-[#d92d2d]" : "border-[#dedede] text-[#4e5661]",
      ].join(" ")}
    >
      <button className="block w-full text-left" type="button" onClick={() => onSelect(prompt.id)}>
        <span className="block font-semibold">{prompt.name}</span>
        <span className="mt-1 line-clamp-2 block text-xs text-[#8f959e]">{prompt.description}</span>
      </button>
      <div className="mt-auto flex items-center justify-between gap-2">
        <button
          className="rounded-md bg-[#f0f1f3] px-2 py-1 text-xs font-medium text-[#4e5661] hover:bg-[#e7e9ed]"
          type="button"
          onClick={() => onSelect(prompt.id)}
        >
          使用
        </button>
        <div className="flex items-center gap-1.5">
          {deleteEnabled ? (
            <button
              className="rounded-md bg-[#f0f1f3] px-2 py-1 text-xs font-medium text-[#5d6673] hover:bg-[#e7e9ed] disabled:opacity-45"
              disabled={deletingId === prompt.id}
              type="button"
              onClick={() => void onDelete(prompt)}
            >
              {deletingId === prompt.id ? "删除中..." : "删除"}
            </button>
          ) : null}
          <button
            className="rounded-md bg-[#fff1f1] px-2 py-1 text-xs font-semibold text-[#d92d2d] hover:bg-[#ffe7e7] disabled:opacity-45"
            disabled={shouldDisablePromptEdit(prompt, authToken)}
            type="button"
            onClick={() => void onEdit(prompt)}
          >
            {getPromptEditButtonLabel(prompt, copyingId)}
          </button>
        </div>
      </div>
    </div>
  );
}

function isPromptTemplateDetail(value: unknown): value is PromptTemplateDetail {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { name?: unknown }).name === "string" &&
    typeof (value as { userTemplate?: unknown }).userTemplate === "string"
  );
}

function isPromptMutationResponse(value: unknown): value is PromptTemplateMutationResponse {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    isPromptTemplateDetail((value as { prompt?: unknown }).prompt)
  );
}

function isDeletePromptResponse(value: unknown): value is DeletePromptResponse {
  return Boolean(value) && typeof value === "object" && typeof (value as { promptId?: unknown }).promptId === "string";
}
