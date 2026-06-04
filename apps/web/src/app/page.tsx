"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { clearAuthSession, getStoredUser, type AuthUser } from "@/lib/auth";

const featuredArticles = [
  {
    id: "seed-1",
    title: "AI 如何改变内容创作：从灵感到发布的完整链路",
    summary: "从选题、初稿、编辑、审核到分发，AI 正在把创作者的工作流从单点生成推进到完整闭环。",
    author: "训练营创作者",
    score: 86,
    reads: "1.2w",
    tag: "AI 创作",
  },
  {
    id: "seed-2",
    title: "内容质量分为什么重要：让好文章进入榜单",
    summary: "质量分、热度、时间衰减和互动反馈共同影响分发排序，也让内容运营有可解释依据。",
    author: "内容运营",
    score: 82,
    reads: "8.4k",
    tag: "质量评分",
  },
  {
    id: "seed-3",
    title: "发布前审核不是阻碍，而是创作者的安全网",
    summary: "高危内容拦截、中低风险建议和可追溯记录，能帮助创作者更稳定地完成发布。",
    author: "审核助手",
    score: 79,
    reads: "6.7k",
    tag: "安全审核",
  },
];

const rankings = [
  { title: "AI 写作从 prompt 到工作流", metric: "热度 98" },
  { title: "图文创作者如何用 AI 做选题", metric: "热度 91" },
  { title: "内容审核的三类风险信号", metric: "热度 87" },
];

export default function ContentHomePage() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  function logout() {
    clearAuthSession();
    setUser(null);
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] text-[#1f2329]">
      <header className="sticky top-0 z-20 border-b border-[#ededed] bg-white">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-5">
          <Link className="text-lg font-semibold" href="/">
            AI Creator Hub
          </Link>

          <nav className="hidden items-center gap-7 text-sm text-[#4e5661] md:flex">
            <a className="font-semibold text-[#1f2329]" href="#feed">
              推荐
            </a>
            <a href="#rankings">热点榜</a>
            <a href="#rankings">爆文榜</a>
            <Link href="/docs">文档</Link>
          </nav>

          <div className="flex items-center gap-4 text-sm">
            {user ? (
              <div className="group relative">
                <Link
                  className="rounded-md bg-[#f6f7f9] px-4 py-2 font-semibold text-[#1f2329] hover:bg-[#eeeeee]"
                  href="/creator"
                >
                  {user.nickname}
                </Link>
                <div className="invisible absolute right-0 top-full z-30 w-40 pt-2 opacity-0 transition group-hover:visible group-hover:opacity-100">
                  <div className="rounded-md border border-[#eeeeee] bg-white py-2 shadow-[0_12px_36px_rgba(31,35,41,0.12)]">
                    <Link className="block px-4 py-2 text-[#4e5661] hover:bg-[#fff1f1] hover:text-[#ff4d4f]" href="/workspace">
                      工作台
                    </Link>
                    <Link className="block px-4 py-2 text-[#4e5661] hover:bg-[#fff1f1] hover:text-[#ff4d4f]" href="/drafts">
                      草稿箱
                    </Link>
                    <button
                      className="block w-full px-4 py-2 text-left text-[#4e5661] hover:bg-[#fff1f1] hover:text-[#ff4d4f]"
                      type="button"
                      onClick={logout}
                    >
                      退出登录
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <Link className="rounded-md bg-[#ff4d4f] px-4 py-2 font-semibold text-white" href="/login">
                登录
              </Link>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1280px] gap-5 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div id="feed" className="bg-white">
          <div className="border-b border-[#eeeeee] px-6 py-6">
            <p className="text-sm font-semibold text-[#ff4d4f]">推荐内容</p>
            <h1 className="mt-2 text-3xl font-semibold">发现值得发布和复盘的 AI 图文内容</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#6b7280]">
              首页保留为内容消费页，创作入口从右上角账号菜单进入，读者可以先浏览推荐、热点和爆文内容。
            </p>
          </div>

          <div className="divide-y divide-[#eeeeee]">
            {featuredArticles.map((article) => (
              <article className="grid gap-5 px-6 py-6 transition hover:bg-[#fafafa] md:grid-cols-[minmax(0,1fr)_120px]" key={article.id}>
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
                    <span className="rounded bg-[#fff1f1] px-2 py-1 font-semibold text-[#ff4d4f]">{article.tag}</span>
                    <span className="text-[#8f959e]">{article.author}</span>
                  </div>
                  <h2 className="text-xl font-semibold leading-8">{article.title}</h2>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-[#5d6673]">{article.summary}</p>
                </div>
                <div className="flex items-end justify-between gap-4 md:block md:text-right">
                  <div>
                    <div className="text-sm text-[#8f959e]">质量分</div>
                    <div className="mt-1 text-2xl font-semibold text-[#1f2329]">{article.score}</div>
                  </div>
                  <div className="mt-4 text-sm text-[#8f959e]">{article.reads} 阅读</div>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside id="rankings" className="space-y-5">
          <div className="bg-white px-5 py-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">热点榜</h2>
              <span className="text-xs text-[#8f959e]">实时排序</span>
            </div>
            <div className="grid gap-3">
              {rankings.map((item, index) => (
                <div className="flex gap-3 rounded-md border border-[#eeeeee] px-3 py-3" key={item.title}>
                  <span className="font-semibold text-[#ff4d4f]">{index + 1}</span>
                  <div>
                    <div className="text-sm font-semibold leading-6">{item.title}</div>
                    <div className="mt-1 text-xs text-[#8f959e]">{item.metric}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white px-5 py-5">
            <h2 className="text-lg font-semibold">创作者入口</h2>
            <p className="mt-3 text-sm leading-7 text-[#6b7280]">
              登录后 hover 右上角昵称，可进入工作台或草稿箱。创作、审核和发布能力不会放在首页直接暴露。
            </p>
            <Link className="mt-5 inline-flex rounded-md bg-[#ff4d4f] px-4 py-2 text-sm font-semibold text-white" href="/workspace">
              进入工作台
            </Link>
          </div>
        </aside>
      </section>
    </main>
  );
}
