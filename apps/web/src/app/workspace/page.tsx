"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { DraftSummary, GeneratedArticleDraft, RichTextDocument } from "@bytecamp-aigc/shared";

import { apiFetch, getApiErrorMessage, readApiJson } from "@/lib/api";
import { clearAuthSession, getStoredToken, getStoredUser, type AuthUser } from "@/lib/auth";

const styleOptions = ["科普", "新闻", "轻松", "严肃", "种草"];

const emptyDoc: RichTextDocument = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
};

function textFromDoc(doc: RichTextDocument) {
  return doc.content
    .flatMap((node) => node.content ?? [])
    .map((node) => node.text ?? "")
    .join("");
}

export default function WorkspacePage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [topic, setTopic] = useState("AI 如何改变内容创作");
  const [audience, setAudience] = useState("内容创作者");
  const [style, setStyle] = useState("科普");
  const [generated, setGenerated] = useState<GeneratedArticleDraft | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "generating" | "saving">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const storedToken = getStoredToken();
    setToken(storedToken);
    setUser(getStoredUser());
    setStatus("idle");

    if (storedToken) {
      void loadDrafts(storedToken);
    }
  }, []);

  const wordCount = useMemo(() => {
    if (!generated) return 0;
    return textFromDoc(generated.body).length;
  }, [generated]);

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

  async function generateArticle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      router.push("/login");
      return;
    }

    setStatus("generating");
    setError("");

    try {
      const response = await apiFetch("/ai/generate-article", {
        method: "POST",
        authToken: token,
        body: JSON.stringify({ topic, audience, style }),
      });
      const payload = await readApiJson<GeneratedArticleDraft | { message?: string | string[] }>(response);

      if (!response.ok || !payload || "message" in payload) {
        setError(getApiErrorMessage(payload, "AI 生成失败，请稍后重试。"));
        setStatus("idle");
        return;
      }

      const article = payload as GeneratedArticleDraft;
      setGenerated(article);
      setDraftTitle(article.title);
      setStatus("idle");
    } catch {
      setError("无法连接 API 服务，请确认后端已启动。");
      setStatus("idle");
    }
  }

  async function saveDraft() {
    if (!token || !generated) return;

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
        return;
      }

      router.push(`/drafts/${(payload as { id: string }).id}`);
    } catch {
      setError("无法连接 API 服务，请稍后重试。");
      setStatus("idle");
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] text-[#1f2329]">
      <header className="sticky top-0 z-20 border-b border-[#ededed] bg-white">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-5">
          <div className="flex items-center gap-4">
            <Link
              aria-label="返回首页"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f5] text-xl text-[#7b8088] hover:bg-[#eeeeee]"
              href="/"
            >
              ‹
            </Link>
            <div className="absolute left-1/2 -translate-x-1/2 text-center">
              <div className="text-lg font-semibold">发布文章</div>
              <div className="text-xs text-[#8f959e]">AI Creator Hub 工作台</div>
            </div>
          </div>

          <div className="flex items-center gap-5 text-sm text-[#4e5661]">
            <Link className="hidden hover:text-[#ff4d4f] sm:block" href="/docs">
              头条号发文规范
            </Link>
            <span className="hidden sm:block">消息</span>
            {user ? (
              <Link className="rounded-md bg-[#f6f7f9] px-3 py-2 font-medium hover:bg-[#eeeeee]" href="/drafts">
                {user.nickname}
              </Link>
            ) : (
              <Link className="rounded-md bg-[#ff4d4f] px-4 py-2 font-medium text-white" href="/login">
                登录
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-5 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="min-h-[calc(100vh-8rem)] bg-white rounded-lg">
          <div className="flex flex-wrap items-center gap-2 border-b border-[#eeeeee] px-8 py-4">
            {["撤销", "重做", "清除", "格式", "H", "B", "引用", "列表", "对齐", "代码", "图片", "链接", "更多"].map(
              (item, index) => (
                <button
                  className="h-9 rounded-md px-2 text-sm font-semibold text-[#3b3f45] hover:bg-[#f4f5f7]"
                  key={`${item}-${index}`}
                  type="button"
                >
                  {item}
                </button>
              ),
            )}
          </div>

          <div className="mx-auto max-w-[920px] px-8 py-9">
            <form className="mb-9 rounded-lg border border-[#eeeeee] bg-[#fbfbfb] p-5" onSubmit={generateArticle}>
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-base font-semibold">创作设定</div>
                  <p className="mt-1 text-sm text-[#8f959e]">输入主题后，AI 会先生成标题、大纲和正文草稿。</p>
                </div>
                <Link className="text-sm font-medium text-[#ff4d4f]" href="/drafts">
                  我的草稿
                </Link>
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[#4e5661]">创作主题</span>
                  <input
                    className="h-11 w-full rounded-md border border-[#dedede] bg-white px-3 text-sm outline-none focus:border-[#ff4d4f]"
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[#4e5661]">目标受众</span>
                  <input
                    className="h-11 w-full rounded-md border border-[#dedede] bg-white px-3 text-sm outline-none focus:border-[#ff4d4f]"
                    value={audience}
                    onChange={(event) => setAudience(event.target.value)}
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
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
                <button
                  className="h-11 rounded-md bg-[#ff4d4f] px-5 text-sm font-semibold text-white transition hover:bg-[#f04446] disabled:bg-[#f3a5a6]"
                  disabled={status === "generating" || !topic.trim() || !token}
                  type="submit"
                >
                  {status === "generating" ? "生成中..." : "AI 生成初稿"}
                </button>
              </div>
            </form>

            {error ? (
              <div className="mb-6 rounded-md border border-[#ffd4d4] bg-[#fff6f6] px-4 py-3 text-sm text-[#d92d2d]">
                {error}
              </div>
            ) : null}

            {!token ? (
              <div className="rounded-lg border border-dashed border-[#dedede] bg-white px-8 py-14 text-center">
                <h1 className="text-3xl font-semibold text-[#1f2329]">登录后开始创作</h1>
                <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-[#6b7280]">
                  工作台会把 AI 生成、草稿保存、编辑器和后续发布审核连成一条链路。先登录即可使用演示账号体验。
                </p>
                <Link className="mt-6 inline-flex rounded-md bg-[#ff4d4f] px-5 py-3 text-sm font-semibold text-white" href="/login">
                  进入登录
                </Link>
              </div>
            ) : (
              <>
                <input
                  className="w-full border-0 border-b border-[#eeeeee] px-0 pb-5 text-[30px] font-semibold text-[#1f2329] outline-none placeholder:text-[#a8adb5]"
                  placeholder="请输入文章标题（2～30个字）"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                />

                <article className="min-h-[520px] py-10 text-[17px] leading-9 text-[#1f2329]">
                  {generated ? (
                    <>
                      <div className="mb-8 rounded-md bg-[#fafafa] p-4">
                        <div className="mb-3 text-sm font-semibold text-[#4e5661]">生成大纲</div>
                        <ol className="grid gap-2 pl-5 text-sm leading-7 text-[#5d6673]">
                          {generated.outline.map((item) => (
                            <li className="list-decimal" key={item}>
                              {item}
                            </li>
                          ))}
                        </ol>
                      </div>
                      {generated.body.content.map((node, index) => (
                        <p className="my-6" key={index}>
                          {node.content?.map((child) => child.text ?? "").join("")}
                        </p>
                      ))}
                    </>
                  ) : (
                    <div className="pt-20 text-center text-[#a8adb5]">
                      <p className="text-xl font-semibold">左侧填写主题，右侧助手会同步展示 AI 结果</p>
                      <p className="mt-3 text-sm">生成后可以保存为草稿并进入编辑器继续修改。</p>
                    </div>
                  )}
                </article>
              </>
            )}
          </div>

          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-4 border-t border-[#eeeeee] bg-white px-8 py-4">
            <div className="flex flex-wrap items-center gap-6 text-sm text-[#8f959e]">
              <span>草稿已保存</span>
              <span>共 {wordCount} 字</span>
              <span>发文设置</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/*
              <button className="rounded-md border border-[#dedede] px-6 py-2.5 text-sm font-medium text-[#4e5661]" type="button">
                预览
              </button>
              <button className="rounded-md border border-[#dedede] px-6 py-2.5 text-sm font-medium text-[#4e5661]" type="button">
                定时发布
              </button>
              */}
              <button
                className="rounded-md bg-[#ff4d4f] px-6 py-2.5 text-sm font-semibold text-white disabled:bg-[#f3a5a6]"
                disabled={!generated || status === "saving"}
                type="button"
                onClick={saveDraft}
              >
                {status === "saving" ? "保存中..." : "保存草稿"}
              </button>
            </div>
          </div>
        </section>

        <aside className="h-fit min-h-[calc(100vh-8rem)] bg-[#fbfdff] px-6 py-8 lg:sticky lg:top-20 rounded-lg">
          <div className="mb-8 flex items-center justify-center gap-3">
            <span className="h-6 w-6 rounded-md bg-gradient-to-br from-[#ff5f62] to-[#8c7bff]" />
            <h2 className="text-lg font-semibold">AI创作助手</h2>
          </div>

          <div className="mb-8 flex gap-8 border-b border-transparent text-sm">
            <button className="border-b-2 border-[#1f2329] pb-3 font-semibold text-[#1f2329]" type="button">
              AI 创作
            </button>
            <button className="pb-3 text-[#8f959e]" type="button">
              内容建议
            </button>
          </div>

          <div className="max-h-[58vh] overflow-y-auto pr-2 text-[15px] leading-8 text-[#2f3640]">
            <h3 className="mb-4 text-base font-semibold">{generated?.title ?? "等待生成创作建议"}</h3>
            {generated ? (
              <>
                {generated.bodyText.split("\n\n").map((paragraph) => (
                  <p className="mb-4" key={paragraph}>
                    {paragraph}
                  </p>
                ))}
                <p className="mt-6 text-xs text-[#a8adb5]">以上文本由 AI 基于用户指令生成，请谨慎参考和使用</p>
              </>
            ) : (
              <p className="text-[#8f959e]">输入创作主题后，助手会给出标题、大纲和正文草稿。生成结果可以添加到正文并保存为草稿。</p>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              className="rounded-md bg-gradient-to-r from-[#ff4d4f] to-[#8c7bff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-45"
              disabled={!generated}
              type="button"
              onClick={saveDraft}
            >
              添加到正文
            </button>
            <button className="rounded-md bg-[#f0f1f3] px-4 py-2 text-sm font-medium text-[#4e5661]" type="button">
              复制
            </button>
            <button className="rounded-md bg-[#f0f1f3] px-4 py-2 text-sm font-medium text-[#4e5661]" type="button">
              重试
            </button>
          </div>

          <div className="mt-7 rounded-md bg-white p-3 shadow-[0_8px_28px_rgba(31,35,41,0.06)]">
            <div className="flex items-center gap-2">
              <input
                className="min-w-0 flex-1 border-0 px-2 py-3 text-sm outline-none placeholder:text-[#b5bac2]"
                placeholder="输入创作主题、观点或大纲，AI 帮你写"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
              />
              <button
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ffe4ea] font-semibold text-[#ff4d4f]"
                type="button"
              >
                ↑
              </button>
            </div>
          </div>

          {drafts.length ? (
            <div className="mt-8 border-t border-[#eeeeee] pt-5">
              <div className="mb-3 text-sm font-semibold text-[#4e5661]">最近草稿</div>
              <div className="grid gap-2">
                {drafts.slice(0, 3).map((draft) => (
                  <Link
                    className="rounded-md border border-[#eeeeee] bg-white px-3 py-2 text-sm hover:border-[#ffb6b7]"
                    href={`/drafts/${draft.id}`}
                    key={draft.id}
                  >
                    <div className="line-clamp-1 font-medium text-[#1f2329]">{draft.title}</div>
                    <div className="mt-1 text-xs text-[#8f959e]">v{draft.version}</div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
