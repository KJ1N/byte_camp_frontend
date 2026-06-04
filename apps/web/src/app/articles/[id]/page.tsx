"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ArticleDetail, RichTextDocument, RichTextNode } from "@bytecamp-aigc/shared";

import { apiFetch, getApiErrorMessage, readApiJson } from "@/lib/api";

function textFromNode(node: RichTextNode): string {
  return [node.text ?? "", ...(node.content ?? []).map((child) => textFromNode(child))].join("");
}

function linesFromDoc(doc: RichTextDocument) {
  return doc.content.map((node) => textFromNode(node).trim()).filter(Boolean);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function ArticleDetailPage() {
  const params = useParams<{ id: string }>();
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const paragraphs = useMemo(() => (article ? linesFromDoc(article.body) : []), [article]);

  useEffect(() => {
    void loadArticle();
  }, [params.id]);

  async function loadArticle() {
    setLoading(true);
    setError("");

    const response = await apiFetch(`/articles/${params.id}`);
    const payload = await readApiJson<ArticleDetail | { message?: string | string[] }>(response);

    if (!response.ok || !payload || "message" in payload) {
      setError(getApiErrorMessage(payload, "文章加载失败，请稍后重试。"));
      setLoading(false);
      return;
    }

    setArticle(payload as ArticleDetail);
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] text-[#1f2329]">
      <header className="sticky top-0 z-20 border-b border-[#ededed] bg-white">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-5">
          <Link className="text-lg font-semibold text-[#ff4d4f]" href="/">
            AI Creator Hub
          </Link>
          <Link className="rounded-md bg-[#f6f7f9] px-3 py-2 text-sm font-medium hover:bg-[#eeeeee]" href="/drafts">
            草稿箱
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1180px] gap-5 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article className="min-h-[calc(100vh-8rem)] bg-white px-8 py-10">
          {loading ? (
            <div className="py-16 text-center text-sm text-[#8f959e]">文章加载中...</div>
          ) : error ? (
            <div className="rounded-md border border-[#ffd4d4] bg-[#fff6f6] px-4 py-3 text-sm text-[#d92d2d]">
              {error}
            </div>
          ) : article ? (
            <>
              <h1 className="text-[32px] font-semibold leading-tight">{article.title}</h1>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[#8f959e]">
                <span>{article.author.nickname}</span>
                <span>{formatTime(article.publishedAt)}</span>
              </div>
              <div className="mt-9 max-w-[820px] space-y-5 text-[17px] leading-9 text-[#2f3640]">
                {paragraphs.map((paragraph, index) => (
                  <p key={`${paragraph}-${index}`}>{paragraph}</p>
                ))}
              </div>
            </>
          ) : null}
        </article>

        <aside className="h-fit bg-white px-5 py-6 lg:sticky lg:top-20">
          <h2 className="mb-4 text-base font-semibold">发布记录</h2>
          <div className="grid gap-3 text-sm text-[#4e5661]">
            <div className="rounded-md bg-[#f8f9fb] p-4">
              <div className="text-xs text-[#8f959e]">审核摘要</div>
              <div className="mt-2">{article?.latestAudit?.result.summary ?? "暂无审核记录"}</div>
            </div>
            <div className="rounded-md bg-[#f8f9fb] p-4">
              <div className="text-xs text-[#8f959e]">质量总分</div>
              <div className="mt-2 text-3xl font-semibold text-[#ff4d4f]">{article?.latestScore?.overall ?? "--"}</div>
            </div>
            {article?.latestScore ? (
              <div className="rounded-md bg-[#f8f9fb] p-4">
                <div className="text-xs text-[#8f959e]">优化建议</div>
                <div className="mt-2 space-y-2">
                  {article.latestScore.suggestions.map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}

