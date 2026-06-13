"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  AssetSummary,
  CancelMultimodalGenerationTaskResponse,
  CreateMultimodalGenerationTaskResponse,
  DraftSummary,
  GeneratedImageResult,
  GeneratedMultimodalDraft,
  ListPromptsResponse,
  MultimodalGenerationTaskResponse,
  MultimodalImagePlan,
  MultimodalImageResult,
  PromptTemplateDetail,
  PromptTemplateSummary,
  RichTextDocument,
} from "@bytecamp-aigc/shared";

import { AiWritingAssistant } from "@/components/ai-writing-assistant";
import { AssetPanel } from "@/components/asset-panel";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { PromptManagerPanel } from "@/components/prompt-manager-panel";
import { apiFetch, getApiErrorMessage, readApiJson } from "@/lib/api";
import { formatAssetSize, resolveAssetUrl } from "@/lib/assets";
import { clearAuthSession, getStoredToken, getStoredUser, type AuthUser } from "@/lib/auth";
import { buildMultimodalGeneratedBody } from "@/lib/multimodal-generated-body";
import {
  defaultMultimodalTaskPollIntervalMs,
  getMultimodalTaskMessage,
  getWorkbenchStatusFromMultimodalTask,
  multimodalImagesFromProgress,
  shouldPollMultimodalTask,
} from "@/lib/multimodal-task";
import { nextSelectedPromptIdAfterDelete } from "@/lib/prompt-management";
import {
  appendDocumentAttachment,
  appendPlainTextParagraph,
  plainTextFromRichText,
  replaceWithPlainText,
} from "@/lib/rich-text-document";
import {
  createWorkspaceImageInsertRequest,
  workspaceSidePanelTabs,
  type EditorImageInsertRequest,
  type WorkspaceSidePanelTab,
} from "@/lib/workspace-assets";
import { normalizeWorkspaceTopic } from "@/lib/workspace-topic";

const styleOptions = ["科普", "新闻", "轻松", "严谨", "种草"];
const localDraftKey = "aigc_multimodal_workspace_local_draft";
const defaultTopic = "";
const defaultAudience = "内容创作者";
const defaultStyle = "科普";
const defaultImageCount = 2;
const imageCountOptions = [1, 2, 3, 4] as const;
const defaultImagePrompt = "绘制一张信息图，展示通货膨胀的成因，每条成因独立呈现，并配有简洁图标。";
const imagePromptGuide =
  "采用清晰明确的自然语言描述画面内容，对于细节比较丰富的图像，可通过详细的文本描述精准控制画面细节。";

type WorkbenchStatus =
  | "loading"
  | "idle"
  | "queued"
  | "planning"
  | "text_ready"
  | "streaming_text"
  | "generating_images"
  | "completed"
  | "saving"
  | "failed";
type ImageStatus = "pending" | "generating" | "completed" | "failed";
type PromptPanelMode = "text" | "image";

interface ImageViewState extends MultimodalImagePlan {
  index: number;
  status: ImageStatus;
  url?: string;
  model?: string;
  message?: string;
}

interface LocalDraftState {
  taskId?: string;
  topic: string;
  audience: string;
  style: string;
  imagePrompt: string;
  imageCount: number;
  selectedPromptId: string;
  draftTitle: string;
  generated: GeneratedMultimodalDraft | null;
  imageStates: ImageViewState[];
  localUpdatedAt: string;
}

const emptyDoc = replaceWithPlainText("");

function createEmptyGenerated(textModel = "streaming", imageModel = "doubao-seedream-4-5-251128"): GeneratedMultimodalDraft {
  return {
    textModel,
    imageModel,
    title: "",
    outline: [],
    bodyText: "",
    body: emptyDoc,
    images: [],
  };
}

function formatLocalSavedAt(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export default function MultimodalWorkspacePage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [topic, setTopic] = useState(defaultTopic);
  const [audience, setAudience] = useState(defaultAudience);
  const [style, setStyle] = useState(defaultStyle);
  const [imagePrompt, setImagePrompt] = useState(defaultImagePrompt);
  const [imageCount, setImageCount] = useState(defaultImageCount);
  const [promptPanelMode, setPromptPanelMode] = useState<PromptPanelMode>("text");
  const [prompts, setPrompts] = useState<PromptTemplateSummary[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [promptsLoading, setPromptsLoading] = useState(false);
  const [generated, setGenerated] = useState<GeneratedMultimodalDraft | null>(null);
  const [imageStates, setImageStates] = useState<ImageViewState[]>([]);
  const [draftTitle, setDraftTitle] = useState("");
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<WorkbenchStatus>("loading");
  const [error, setError] = useState("");
  const [sidePanelTab, setSidePanelTab] = useState<WorkspaceSidePanelTab>("ai");
  const [imageInsertRequest, setImageInsertRequest] = useState<EditorImageInsertRequest | null>(null);
  const [localSaveReady, setLocalSaveReady] = useState(false);
  const [localSavedAt, setLocalSavedAt] = useState<string | null>(null);
  const [pendingExitHref, setPendingExitHref] = useState<string | null>(null);
  const [exitSaveStatus, setExitSaveStatus] = useState<"idle" | "saving">("idle");
  const activeTaskIdRef = useRef<string | null>(null);

  const completedImages = useMemo(
    () =>
      generated?.images.filter((image): image is GeneratedImageResult => image.status === "completed") ?? [],
    [generated?.images],
  );
  const wordCount = useMemo(() => (generated ? plainTextFromRichText(generated.body).length : 0), [generated]);
  const isGenerating = status === "queued" || status === "planning" || status === "text_ready" || status === "streaming_text" || status === "generating_images";
  const canSaveDraft = Boolean(token && generated && status !== "saving" && !isGenerating);
  const hasLocalContent = Boolean(
    taskId ||
    topic.trim() ||
      draftTitle.trim() ||
      generated?.title.trim() ||
      generated?.bodyText.trim() ||
      generated?.images.length ||
      imagePrompt.trim() !== defaultImagePrompt,
  );

  useEffect(() => {
    const storedToken = getStoredToken();
    const queryTopic = normalizeWorkspaceTopic(new URLSearchParams(window.location.search).get("topic"));
    const localDraft = readLocalDraft();
    const restoredTaskId = localDraft?.taskId ?? null;

    if (localDraft) {
      setTaskId(restoredTaskId);
      setTopic(queryTopic || localDraft.topic || defaultTopic);
      setAudience(localDraft.audience);
      setStyle(localDraft.style);
      setImagePrompt(localDraft.imagePrompt);
      setImageCount(localDraft.imageCount);
      setSelectedPromptId(localDraft.selectedPromptId);
      setDraftTitle(localDraft.draftTitle);
      setGenerated(localDraft.generated);
      setImageStates(localDraft.imageStates);
      setLocalSavedAt(localDraft.localUpdatedAt || null);
    } else if (queryTopic) {
      setTopic(queryTopic);
    }

    setToken(storedToken);
    setUser(getStoredUser());
    setStatus(restoredTaskId ? "queued" : "idle");
    setLocalSaveReady(true);

    if (storedToken) {
      void loadDrafts(storedToken);
      void loadPrompts(storedToken, localDraft?.selectedPromptId ?? "");
      if (restoredTaskId) {
        activeTaskIdRef.current = restoredTaskId;
        void pollMultimodalTask(storedToken, restoredTaskId);
      }
    }
  }, []);

  useEffect(() => {
    if (!localSaveReady) return;

    if (!hasLocalContent) {
      clearLocalDraft();
      setLocalSavedAt(null);
      return;
    }

    const savedAt = new Date().toISOString();
    writeLocalDraft({
      topic,
      audience,
      style,
      imagePrompt,
      imageCount,
      taskId: taskId ?? undefined,
      selectedPromptId,
      draftTitle,
      generated,
      imageStates,
      localUpdatedAt: savedAt,
    });
    setLocalSavedAt(savedAt);
  }, [
    audience,
    draftTitle,
    generated,
    hasLocalContent,
    imagePrompt,
    imageCount,
    imageStates,
    localSaveReady,
    selectedPromptId,
    style,
    taskId,
    topic,
  ]);

  async function loadPrompts(authToken: string, preferredPromptId = "") {
    setPromptsLoading(true);
    const response = await apiFetch("/prompts?category=multimodal_generation", { authToken });
    const payload = await readApiJson<ListPromptsResponse | { message?: string | string[] }>(response);
    setPromptsLoading(false);

    if (!response.ok || !payload || !("items" in payload)) {
      setError(getApiErrorMessage(payload, "多模态 Prompt 模板加载失败，已使用默认模板。"));
      return;
    }

    setPrompts(payload.items);
    setSelectedPromptId((currentPromptId) => {
      const restoredPromptId = preferredPromptId || currentPromptId;
      if (restoredPromptId && payload.items.some((item) => item.id === restoredPromptId)) return restoredPromptId;
      return payload.items.find((item) => item.isStarter)?.id ?? payload.items[0]?.id ?? "";
    });
  }

  function handlePromptSaved(prompt: PromptTemplateDetail) {
    const summary: PromptTemplateSummary = {
      id: prompt.id,
      name: prompt.name,
      category: prompt.category,
      owner: prompt.owner,
      isStarter: prompt.isStarter,
      description: prompt.description,
    };

    setPrompts((items) => {
      const exists = items.some((item) => item.id === summary.id);
      if (exists) return items.map((item) => (item.id === summary.id ? summary : item));
      return [...items, summary];
    });
    setSelectedPromptId(prompt.id);
  }

  function handlePromptDeleted(promptId: string) {
    setPrompts((items) => {
      const remaining = items.filter((item) => item.id !== promptId);
      setSelectedPromptId((currentPromptId) =>
        nextSelectedPromptIdAfterDelete(promptId, currentPromptId, remaining),
      );
      return remaining;
    });
  }

  async function loadDrafts(authToken: string) {
    const response = await apiFetch("/drafts/mine", { authToken });
    const payload = await readApiJson<DraftSummary[] | { message?: string | string[] }>(response);

    if (response.status === 401) {
      clearAuthSession();
      setToken(null);
      setUser(null);
      setDrafts([]);
      return;
    }

    if (!response.ok) {
      setError(getApiErrorMessage(payload, "草稿列表加载失败，请稍后重试。"));
      return;
    }

    setDrafts(Array.isArray(payload) ? payload : []);
  }

  async function generateMultimodalDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      router.push("/login");
      return;
    }

    setStatus("queued");
    setError("");
    setDraftTitle("");
    setImageStates([]);
    setGenerated(createEmptyGenerated());
    setTaskId(null);
    activeTaskIdRef.current = null;

    try {
      const response = await apiFetch("/ai/multimodal-generations", {
        method: "POST",
        authToken: token,
        body: JSON.stringify({
          topic,
          audience,
          style,
          imagePrompt,
          imageCount,
          promptId: selectedPromptId || undefined,
        }),
      });
      const payload = await readApiJson<CreateMultimodalGenerationTaskResponse | { message?: string | string[] }>(
        response,
      );

      if (!response.ok || !payload || !("taskId" in payload)) {
        setError(getApiErrorMessage(payload, "多模态任务创建失败，请稍后重试。"));
        setStatus("idle");
        return;
      }

      setTaskId(payload.taskId);
      activeTaskIdRef.current = payload.taskId;
      void pollMultimodalTask(token, payload.taskId);
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "多模态任务创建失败，请稍后重试。");
      setStatus("idle");
    }
  }

  async function pollMultimodalTask(authToken: string, nextTaskId: string) {
    let failedReads = 0;

    while (activeTaskIdRef.current === nextTaskId) {
      try {
        const response = await apiFetch(`/ai/multimodal-generations/${encodeURIComponent(nextTaskId)}`, {
          authToken,
        });
        const payload = await readApiJson<MultimodalGenerationTaskResponse | { message?: string | string[] }>(
          response,
        );

        if (!response.ok || !payload || !("status" in payload)) {
          throw new Error(getApiErrorMessage(payload, "任务状态查询失败，请稍后重试。"));
        }

        failedReads = 0;
        applyMultimodalTaskResponse(payload);

        if (!shouldPollMultimodalTask(payload)) {
          activeTaskIdRef.current = null;
          setTaskId(null);
          return;
        }
      } catch (pollError) {
        failedReads += 1;
        if (failedReads >= 3) {
          activeTaskIdRef.current = null;
          setError(pollError instanceof Error ? pollError.message : "任务状态查询失败，请稍后重试。");
          setStatus("failed");
          return;
        }
      }

      await sleep(defaultMultimodalTaskPollIntervalMs);
    }
  }

  function applyMultimodalTaskResponse(task: MultimodalGenerationTaskResponse) {
    const nextStatus = getWorkbenchStatusFromMultimodalTask(task);
    const message = getMultimodalTaskMessage(task);
    const imageResults = task.result?.images ?? multimodalImagesFromProgress(task.progress);
    const completed = imageResults.filter(isCompletedImage);
    const nextTitle = task.result?.title ?? task.progress.title;
    const nextOutline = task.result?.outline ?? task.progress.outline;
    const nextBodyText = task.result?.bodyText ?? task.progress.bodyText;

    setStatus(nextStatus);
    if (message) {
      setError(message);
    } else if (nextStatus !== "failed") {
      setError("");
    }

    setImageStates(readImageStatesFromTask(task));

    if (nextTitle) setDraftTitle(nextTitle);

    if (task.result) {
      setGenerated({
        ...task.result,
        body: isRichTextDocument(task.result.body)
          ? task.result.body
          : buildMultimodalGeneratedBody(task.result.bodyText, completed),
      });
      return;
    }

    if (!nextTitle && !nextOutline?.length && !nextBodyText && !imageResults.length) return;

    setGenerated((current) => {
      const base = current ?? createEmptyGenerated(task.progress.textModel, task.progress.imageModel);
      const bodyText = nextBodyText ?? base.bodyText;
      return {
        ...base,
        textModel: task.progress.textModel ?? base.textModel,
        imageModel: task.progress.imageModel ?? base.imageModel,
        title: nextTitle ?? base.title,
        outline: nextOutline ?? base.outline,
        bodyText,
        images: imageResults,
        body: buildMultimodalGeneratedBody(bodyText, completed),
      };
    });
  }

  async function cancelMultimodalTask() {
    if (!token || !taskId) return;

    const cancellingTaskId = taskId;
    activeTaskIdRef.current = null;

    try {
      const response = await apiFetch(`/ai/multimodal-generations/${encodeURIComponent(cancellingTaskId)}`, {
        method: "DELETE",
        authToken: token,
      });
      const payload = await readApiJson<CancelMultimodalGenerationTaskResponse | { message?: string | string[] }>(
        response,
      );

      if (!response.ok || !payload || !("status" in payload)) {
        setError(getApiErrorMessage(payload, "取消任务失败，请稍后重试。"));
        return;
      }

      setTaskId(null);
      setStatus("idle");
      setError(payload.message);
    } catch {
      setError("无法连接 API 服务，请稍后重试。");
    }
  }

  function updateGeneratedBody(nextBody: RichTextDocument) {
    setGenerated((current) => ({
      ...(current ?? createEmptyGenerated()),
      body: nextBody,
      bodyText: plainTextFromRichText(nextBody),
    }));
  }

  function replaceGeneratedBody(text: string) {
    if (!text.trim()) return;
    const body = replaceWithPlainText(text);
    setGenerated((current) => ({
      ...(current ?? createEmptyGenerated()),
      body,
      bodyText: text,
    }));
  }

  function appendGeneratedBody(text: string) {
    if (!text.trim()) return;
    setGenerated((current) => {
      const base = current ?? createEmptyGenerated();
      const body = appendPlainTextParagraph(base.body, text);
      return {
        ...base,
        body,
        bodyText: plainTextFromRichText(body),
      };
    });
  }

  function insertAssetImage(asset: AssetSummary) {
    setError("");
    setGenerated((current) => current ?? createEmptyGenerated());
    setImageInsertRequest(createWorkspaceImageInsertRequest(asset));
  }

  function insertAssetDocumentAttachment(asset: AssetSummary) {
    setError("");
    setGenerated((current) => {
      const base = current ?? createEmptyGenerated();
      const body = appendDocumentAttachment(base.body, {
        name: asset.metadata.originalName || asset.filename,
        url: resolveAssetUrl(asset.url),
        sizeLabel: formatAssetSize(asset.metadata.size),
      });
      return {
        ...base,
        body,
        bodyText: plainTextFromRichText(body),
      };
    });
  }

  function insertAssetDocumentText(text: string) {
    appendGeneratedBody(text);
  }

  function requestMultimodalExit(href: string) {
    if (!hasLocalContent) {
      router.push(href);
      return;
    }

    setPendingExitHref(href);
  }

  function discardMultimodalDraftAndExit() {
    if (!pendingExitHref) return;

    setLocalSaveReady(false);
    clearLocalDraft();
    setLocalSavedAt(null);
    setPendingExitHref(null);
    router.push(pendingExitHref);
  }

  async function saveDraft(options?: { afterSaveHref?: string }) {
    if (!canSaveDraft || !token || !generated) return false;

    setStatus("saving");
    setError("");

    try {
      const response = await apiFetch("/drafts", {
        method: "POST",
        authToken: token,
        body: JSON.stringify({
          title: draftTitle || generated.title,
          body: generated.body,
          mode: "FAST",
        }),
      });
      const payload = await readApiJson<{ id: string } | { message?: string | string[] }>(response);

      if (!response.ok || !payload || "message" in payload) {
        setError(getApiErrorMessage(payload, "保存草稿失败，请稍后重试。"));
        setStatus("idle");
        return false;
      }

      setLocalSaveReady(false);
      clearLocalDraft();
      setLocalSavedAt(null);
      setPendingExitHref(null);
      setTaskId(null);
      activeTaskIdRef.current = null;
      router.push(options?.afterSaveHref ?? `/drafts/${(payload as { id: string }).id}`);
      return true;
    } catch {
      setError("无法连接 API 服务，请稍后重试。");
      setStatus("idle");
      return false;
    }
  }

  async function saveDraftAndExit() {
    if (!pendingExitHref || !canSaveDraft || exitSaveStatus === "saving") return;

    setExitSaveStatus("saving");
    const saved = await saveDraft({ afterSaveHref: pendingExitHref });
    if (!saved) setExitSaveStatus("idle");
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] text-[#1f2329]">
      <header className="sticky top-0 z-20 border-b border-[#ededed] bg-white">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-5">
          <div className="flex items-center gap-4">
            <button
              aria-label="返回创作者主页"
              className="flex h-9 w-9 items-center justify-center rounded-md bg-[#f5f5f5] text-lg text-[#7b8088] hover:bg-[#eeeeee]"
              type="button"
              onClick={() => requestMultimodalExit("/creator")}
            >
              ←
            </button>
            <div>
              <div className="text-lg font-semibold">多模态生成</div>
              <div className="text-xs text-[#8f959e]">正文和配图由后端统一编排生成</div>
            </div>
          </div>

          <div className="flex items-center gap-5 text-sm text-[#4e5661]">
            <button
              className="hidden hover:text-[#ff4d4f] sm:block"
              type="button"
              onClick={() => requestMultimodalExit("/workspace")}
            >
              文章工作台
            </button>
            <button
              className="hidden hover:text-[#ff4d4f] sm:block"
              type="button"
              onClick={() => requestMultimodalExit("/drafts")}
            >
              草稿箱
            </button>
            <span className="rounded-md bg-[#f6f7f9] px-3 py-2 text-xs font-semibold">
              {user?.nickname ?? "未登录"}
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-5 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_440px]">
        <section className="min-h-[calc(100vh-8rem)] rounded-lg bg-white">
          <div className="mx-auto max-w-[920px] px-8 py-9">
            <form className="mb-9 rounded-lg border border-[#eeeeee] bg-[#fbfbfb] p-5" onSubmit={generateMultimodalDraft}>
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-base font-semibold">图文生成设定</div>
                  <p className="mt-1 text-sm text-[#8f959e]">文字模型先规划正文和配图，图片模型再按 prompt 出图。</p>
                </div>
                <span className="rounded-md bg-[#fff1f1] px-3 py-1.5 text-xs font-semibold text-[#ff4d4f]">
                  Seedream
                </span>
              </div>

              <div className="mb-5">
                <div className="mb-3 inline-flex rounded-md bg-[#f0f1f3] p-1 text-sm font-semibold">
                  {[
                    { id: "text" as const, label: "文字 Prompt" },
                    { id: "image" as const, label: "图片 Prompt" },
                  ].map((item) => (
                    <button
                      className={[
                        "rounded-md px-3 py-2 transition",
                        promptPanelMode === item.id
                          ? "bg-white text-[#ff4d4f] shadow-sm"
                          : "text-[#6b7280] hover:bg-white/70",
                      ].join(" ")}
                      key={item.id}
                      type="button"
                      onClick={() => setPromptPanelMode(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {promptPanelMode === "text" ? (
                  <PromptManagerPanel
                    authToken={token}
                    prompts={prompts}
                    promptsLoading={promptsLoading}
                    selectedPromptId={selectedPromptId}
                    category="multimodal_generation"
                    onPromptSaved={handlePromptSaved}
                    onPromptDeleted={handlePromptDeleted}
                    onError={setError}
                    onSelectPrompt={setSelectedPromptId}
                  />
                ) : (
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-[#4e5661]">图片 Prompt 模板</span>
                    <p className="mb-3 rounded-md border border-[#ffe2e2] bg-[#fff8f8] px-3 py-2 text-sm leading-6 text-[#8a5556]">
                      {imagePromptGuide}
                    </p>
                    <textarea
                      className="min-h-28 w-full resize-y rounded-md border border-[#dedede] bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-[#ff4d4f]"
                      value={imagePrompt}
                      onChange={(event) => setImagePrompt(event.target.value)}
                    />
                  </label>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[#4e5661]">图文需求</span>
                  <input
                    className="h-11 w-full rounded-md border border-[#dedede] bg-white px-3 text-sm outline-none transition focus:border-[#ff4d4f]"
                    placeholder="例如：生成一份关于上海租界的100字小文章，包含2张图片"
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[#4e5661]">目标受众</span>
                  <input
                    className="h-11 w-full rounded-md border border-[#dedede] bg-white px-3 text-sm outline-none transition focus:border-[#ff4d4f]"
                    value={audience}
                    onChange={(event) => setAudience(event.target.value)}
                  />
                </label>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
                <div>
                  <span className="mb-2 block text-sm font-medium text-[#4e5661]">内容风格</span>
                  <div className="flex flex-wrap gap-2">
                    {styleOptions.map((option) => (
                      <button
                        className={[
                          "rounded-md border px-3 py-2 text-sm font-medium transition",
                          style === option
                            ? "border-[#ff4d4f] bg-[#fff1f1] text-[#ff4d4f]"
                            : "border-[#dedede] bg-white text-[#4e5661] hover:border-[#ff9a9b]",
                        ].join(" ")}
                        key={option}
                        type="button"
                        onClick={() => setStyle(option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
                <fieldset className="block">
                  <legend className="mb-2 block text-sm font-medium text-[#4e5661]">图片数量</legend>
                  <div className="grid grid-cols-4 gap-2">
                    {imageCountOptions.map((count) => (
                      <button
                        className={[
                          "h-11 rounded-md border text-sm font-semibold transition",
                          imageCount === count
                            ? "border-[#ff4d4f] bg-[#fff1f1] text-[#ff4d4f]"
                            : "border-[#dedede] bg-white text-[#4e5661] hover:border-[#ff9a9b]",
                        ].join(" ")}
                        key={count}
                        type="button"
                        onClick={() => setImageCount(count)}
                      >
                        {count}张
                      </button>
                    ))}
                  </div>
                </fieldset>
                <div className="flex gap-2">
                  <button
                    className="h-11 rounded-md bg-[#ff4d4f] px-5 text-sm font-semibold text-white transition hover:bg-[#f04446] disabled:bg-[#f3a5a6]"
                    disabled={isGenerating || status === "saving" || !topic.trim() || !token}
                    type="submit"
                  >
                    {isGenerating ? "生成图文中..." : "生成图文初稿"}
                  </button>
                  {taskId && isGenerating ? (
                    <button
                      className="h-11 rounded-md border border-[#dedede] bg-white px-4 text-sm font-semibold text-[#4e5661] transition hover:bg-[#f6f7f9]"
                      type="button"
                      onClick={() => void cancelMultimodalTask()}
                    >
                      取消
                    </button>
                  ) : null}
                </div>
              </div>
            </form>

            {error ? (
              <div className="mb-6 rounded-md border border-[#ffd4d4] bg-[#fff6f6] px-4 py-3 text-sm text-[#d92d2d]">
                {error}
              </div>
            ) : null}

            {!token ? (
              <div className="rounded-lg border border-dashed border-[#dedede] bg-white px-8 py-14 text-center">
                <h1 className="text-3xl font-semibold text-[#1f2329]">登录后开始多模态创作</h1>
                <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-[#6b7280]">
                  多模态工作台会把正文生成、图片生成和草稿保存连成一条链路，发布前仍由后端审核。
                </p>
                <button
                  className="mt-6 inline-flex rounded-md bg-[#ff4d4f] px-5 py-3 text-sm font-semibold text-white"
                  type="button"
                  onClick={() => requestMultimodalExit("/login")}
                >
                  进入登录
                </button>
              </div>
            ) : (
              <>
                <input
                  className="w-full border-0 border-b border-[#eeeeee] px-0 pb-5 text-[30px] font-semibold text-[#1f2329] outline-none placeholder:text-[#a8adb5]"
                  placeholder="请输入图文标题"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                />

                {generated ? (
                  <>
                    {generated.outline.length ? (
                      <div className="mt-8 rounded-md bg-[#fafafa] p-4">
                        <div className="mb-3 text-sm font-semibold text-[#4e5661]">生成大纲</div>
                        <ol className="grid gap-2 pl-5 text-sm leading-7 text-[#5d6673]">
                          {generated.outline.map((item) => (
                            <li className="list-decimal" key={item}>
                              {item}
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                    <div className="mt-8">
                      <RichTextEditor
                        value={generated.body}
                        insertImageRequest={imageInsertRequest}
                        onChange={updateGeneratedBody}
                      />
                    </div>
                  </>
                ) : (
                  <div className="min-h-[520px] pt-20 text-center text-[#a8adb5]">
                    <p className="text-xl font-semibold">输入图文需求，AI 会生成正文和配图</p>
                    <p className="mt-3 text-sm">正文会先出现，图片生成完成后自动插入编辑区。</p>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="sticky bottom-0 z-30 flex flex-wrap items-center justify-between gap-4 border-t border-[#eeeeee] bg-white px-8 py-4">
            <div className="flex flex-wrap items-center gap-6 text-sm text-[#8f959e]">
              <span>
                {isGenerating
                  ? getGenerationStatusLabel(status)
                  : localSavedAt
                    ? `已本地保存 ${formatLocalSavedAt(localSavedAt)}`
                    : "草稿未保存"}
              </span>
              <span>共 {wordCount} 字</span>
              <span>已完成 {completedImages.length} 张图片</span>
            </div>
            <button
              className="rounded-md bg-[#ff4d4f] px-6 py-2.5 text-sm font-semibold text-white disabled:bg-[#f3a5a6]"
              disabled={!canSaveDraft}
              type="button"
              onClick={() => void saveDraft()}
            >
              {status === "saving" ? "保存中..." : "保存草稿"}
            </button>
          </div>
        </section>

        <div className="grid h-fit gap-3">
          <div className="flex rounded-lg bg-white p-1 text-sm font-semibold">
            {workspaceSidePanelTabs.map((item) => (
              <button
                className={[
                  "min-w-0 flex-1 rounded-md px-3 py-2",
                  sidePanelTab === item.id ? "bg-[#fff1f1] text-[#ff4d4f]" : "text-[#6b7280] hover:bg-[#f6f7f9]",
                ].join(" ")}
                key={item.id}
                type="button"
                onClick={() => setSidePanelTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {sidePanelTab === "assets" ? (
            <AssetPanel
              authToken={token}
              onInsertDocumentAttachment={insertAssetDocumentAttachment}
              onInsertDocumentText={insertAssetDocumentText}
              onInsertImage={insertAssetImage}
            />
          ) : (
            <AiWritingAssistant
              authToken={token}
              topic={topic}
              audience={audience}
              style={style}
              currentTitle={draftTitle}
              bodyText={generated?.bodyText ?? ""}
              previewTitle={generated?.title}
              previewBodyText={generated?.bodyText}
              recentDrafts={drafts}
              leadingContent={
                <section className="rounded-md border border-[#eeeeee] bg-white p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[#1f2329]">图片状态</h3>
                    <span className="text-xs text-[#8f959e]">{imageStates.length || imageCount} 张</span>
                  </div>
                  <div className="grid gap-3">
                    {imageStates.length ? (
                      imageStates.map((image) => (
                        <div className="rounded-md border border-[#eeeeee] bg-white p-3" key={image.index}>
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold">配图 {image.index + 1}</div>
                            <span className={getImageStatusClass(image.status)}>{getImageStatusLabel(image.status)}</span>
                          </div>
                          {image.url ? (
                            <img
                              alt={image.alt}
                              className="mb-3 aspect-video w-full rounded-md border border-[#eeeeee] object-cover"
                              src={image.url}
                            />
                          ) : null}
                          <p className="text-sm leading-6 text-[#4e5661]">{image.caption}</p>
                          <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#8f959e]">{image.prompt}</p>
                          {image.message ? <p className="mt-2 text-xs text-[#d92d2d]">{image.message}</p> : null}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-md border border-dashed border-[#dedede] px-4 py-8 text-center text-sm text-[#8f959e]">
                        图片计划会在正文生成后出现。
                      </div>
                    )}
                  </div>
                </section>
              }
              onSelectTitle={setDraftTitle}
              onReplaceBody={replaceGeneratedBody}
              onAppendBody={appendGeneratedBody}
              onOpenDraft={(draftId) => requestMultimodalExit(`/drafts/${draftId}`)}
            />
          )}
        </div>
      </div>
      {pendingExitHref ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div
            aria-modal="true"
            className="w-full max-w-[420px] rounded-lg bg-white p-5 shadow-[0_18px_56px_rgba(31,35,41,0.18)]"
            role="dialog"
          >
            <h2 className="text-base font-semibold text-[#1f2329]">离开多模态工作台前保存草稿吗？</h2>
            <p className="mt-3 text-sm leading-6 text-[#5d6673]">
              选择保存会先创建草稿再离开；选择不保存会清空本地暂存内容，下次进入多模态工作台创作区为空。
            </p>
            {!canSaveDraft ? (
              <p className="mt-3 rounded-md bg-[#fff7e8] px-3 py-2 text-xs leading-5 text-[#9a6200]">
                当前还没有可保存的正文，或 AI 正在生成中。可以继续编辑，也可以不保存退出。
              </p>
            ) : null}
            {error ? (
              <p className="mt-3 rounded-md border border-[#ffd4d4] bg-[#fff6f6] px-3 py-2 text-xs leading-5 text-[#d92d2d]">
                {error}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                className="rounded-md border border-[#dedede] px-4 py-2 text-sm font-medium text-[#4e5661] hover:bg-[#f6f7f9]"
                disabled={exitSaveStatus === "saving"}
                type="button"
                onClick={() => setPendingExitHref(null)}
              >
                继续编辑
              </button>
              <button
                className="rounded-md border border-[#ffd4d4] px-4 py-2 text-sm font-medium text-[#d92d2d] hover:bg-[#fff6f6] disabled:text-[#d6a4a5]"
                disabled={exitSaveStatus === "saving"}
                type="button"
                onClick={discardMultimodalDraftAndExit}
              >
                不保存退出
              </button>
              <button
                className="rounded-md bg-[#ff4d4f] px-4 py-2 text-sm font-semibold text-white disabled:bg-[#f3a5a6]"
                disabled={!canSaveDraft || exitSaveStatus === "saving"}
                type="button"
                onClick={() => void saveDraftAndExit()}
              >
                {exitSaveStatus === "saving" ? "保存中..." : "保存草稿"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function getImageStatusLabel(status: ImageStatus) {
  if (status === "completed") return "已完成";
  if (status === "generating") return "生成中";
  if (status === "failed") return "失败";
  return "等待中";
}

function getGenerationStatusLabel(status: WorkbenchStatus) {
  if (status === "queued") return "任务排队中";
  if (status === "planning") return "AI 正在规划图文";
  if (status === "text_ready") return "正文已生成，等待配图";
  if (status === "generating_images") return "AI 正在生成配图";
  return "AI 正在生成图文";
}

function getImageStatusClass(status: ImageStatus) {
  const base = "rounded-md px-2 py-1 text-xs font-semibold";
  if (status === "completed") return `${base} bg-[#ecfdf3] text-[#067647]`;
  if (status === "generating") return `${base} bg-[#fff7e8] text-[#9a6200]`;
  if (status === "failed") return `${base} bg-[#fff1f1] text-[#d92d2d]`;
  return `${base} bg-[#f0f1f3] text-[#6b7280]`;
}

function normalizeImageCountInput(value: string | number | undefined) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(4, Math.round(parsed))) : defaultImageCount;
}

function readImageStatesFromTask(task: MultimodalGenerationTaskResponse): ImageViewState[] {
  if (task.progress.images.length) {
    return task.progress.images.map((image) => ({
      index: image.index,
      prompt: image.prompt,
      caption: image.caption,
      alt: image.alt,
      status: image.status,
      url: image.url,
      model: image.model,
      message: image.message,
    }));
  }

  return task.result?.images.map(imageResultToViewState) ?? [];
}

function imageResultToViewState(image: MultimodalImageResult): ImageViewState {
  if (image.status === "completed") {
    return {
      index: image.index,
      prompt: image.prompt,
      caption: image.caption,
      alt: image.alt,
      status: "completed",
      url: image.url,
      model: image.model,
    };
  }

  return {
    index: image.index,
    prompt: image.prompt,
    caption: image.caption,
    alt: image.alt,
    status: "failed",
    model: image.model,
    message: image.message,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isImagePlan(value: unknown): value is MultimodalImagePlan {
  return (
    isRecord(value) &&
    typeof value.prompt === "string" &&
    typeof value.caption === "string" &&
    typeof value.alt === "string"
  );
}

function isCompletedImage(value: unknown): value is GeneratedImageResult {
  return isImagePlan(value) &&
    isRecord(value) &&
    value.status === "completed" &&
    typeof value.index === "number" &&
    typeof value.url === "string" &&
    typeof value.model === "string";
}

function isGeneratedMultimodalDraft(value: unknown): value is GeneratedMultimodalDraft {
  return (
    isRecord(value) &&
    typeof value.textModel === "string" &&
    typeof value.imageModel === "string" &&
    typeof value.title === "string" &&
    Array.isArray(value.outline) &&
    typeof value.bodyText === "string" &&
    Array.isArray(value.images)
  );
}

function isRichTextDocument(value: unknown): value is RichTextDocument {
  return isRecord(value) && value.type === "doc" && Array.isArray(value.content);
}

function readLocalDraft(): LocalDraftState | null {
  try {
    const raw = window.localStorage.getItem(localDraftKey);
    if (!raw) return null;
    const value = JSON.parse(raw) as unknown;
    if (!isRecord(value)) return null;
    if (
      typeof value.topic !== "string" ||
      typeof value.audience !== "string" ||
      typeof value.style !== "string" ||
      typeof value.selectedPromptId !== "string" ||
      typeof value.draftTitle !== "string"
    ) {
      return null;
    }

    return {
      taskId: typeof value.taskId === "string" && value.taskId.trim() ? value.taskId.trim() : undefined,
      topic: value.topic,
      audience: value.audience,
      style: value.style,
      imagePrompt: typeof value.imagePrompt === "string" ? value.imagePrompt : defaultImagePrompt,
      imageCount: normalizeImageCountInput(typeof value.imageCount === "number" ? value.imageCount : defaultImageCount),
      selectedPromptId: value.selectedPromptId,
      draftTitle: value.draftTitle,
      generated: value.generated && isGeneratedMultimodalDraft(value.generated) ? value.generated : null,
      imageStates: Array.isArray(value.imageStates) ? value.imageStates.filter(isImageViewState) : [],
      localUpdatedAt: typeof value.localUpdatedAt === "string" ? value.localUpdatedAt : "",
    };
  } catch {
    return null;
  }
}

function writeLocalDraft(state: LocalDraftState) {
  try {
    window.localStorage.setItem(localDraftKey, JSON.stringify(state));
  } catch {
    // The page should remain usable when localStorage is disabled or full.
  }
}

function clearLocalDraft() {
  try {
    window.localStorage.removeItem(localDraftKey);
  } catch {
    // Clearing local state is best-effort after a server save succeeds.
  }
}

function isImageViewState(value: unknown): value is ImageViewState {
  return isImagePlan(value) &&
    isRecord(value) &&
    typeof value.index === "number" &&
    (value.status === "pending" ||
      value.status === "generating" ||
      value.status === "completed" ||
      value.status === "failed");
}
