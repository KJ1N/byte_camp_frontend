"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { apiFetch } from "@/lib/api";
import { saveAuthSession, type AuthSession } from "@/lib/auth";

type AuthMode = "login" | "register";
type SubmitState = "idle" | "submitting" | "success";

const demoAccount = {
  email: "demo@bytecamp.local",
  password: "bytecamp123",
  nickname: "训练营创作者",
};

function errorMessageFromResponse(status: number, fallback: string, payload: unknown) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: string | string[] }).message;
    if (Array.isArray(message)) return message.join("；");
    if (message) return message;
  }

  if (status >= 500) return "服务暂时不可用，请稍后重试。";
  return fallback;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [nickname, setNickname] = useState("");
  const [status, setStatus] = useState<SubmitState>("idle");
  const [error, setError] = useState("");

  const isRegister = mode === "register";
  const canSubmit = email.trim() && password && (!isRegister || nickname.trim());

  function fillDemoAccount() {
    setEmail(demoAccount.email);
    setPassword(demoAccount.password);
    setNickname(demoAccount.nickname);
    setError("");
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || status === "submitting") return;

    setStatus("submitting");
    setError("");

    const endpoint = isRegister ? "/auth/register" : "/auth/login";
    const fallback = isRegister ? "注册失败，请检查信息后重试。" : "登录失败，请检查邮箱或密码。";
    const body = isRegister
      ? { email: email.trim(), password, nickname: nickname.trim() }
      : { email: email.trim(), password };

    try {
      const response = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      });

      const payload = (await response.json().catch(() => null)) as AuthSession | unknown;

      if (!response.ok) {
        setError(errorMessageFromResponse(response.status, fallback, payload));
        setStatus("idle");
        return;
      }

      const session = payload as AuthSession;
      if (!session.accessToken || !session.user) {
        setError("登录响应格式异常，请稍后重试。");
        setStatus("idle");
        return;
      }

      const saved = saveAuthSession(session);
      if (!saved) {
        setError("登录成功，但浏览器无法保存登录状态，请检查本地存储权限。");
        setStatus("idle");
        return;
      }

      setStatus("success");
      router.push("/");
    } catch {
      setError("无法连接 API 服务，请确认后端已启动后重试。");
      setStatus("idle");
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] px-5 py-7 text-[#1f2329] md:px-[5vw]">
      <nav className="mx-auto mb-14 flex max-w-[1080px] flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <Link href="/" className="font-extrabold">
          AI Creator Hub
        </Link>
        <Link href="/" className="font-bold text-[#ff4d4f]">
          返回首页
        </Link>
      </nav>

      <section className="mx-auto grid max-w-[1080px] items-start gap-12 pt-10 md:grid-cols-[minmax(0,1fr)_minmax(360px,430px)] md:pt-20">
        <div>
          <p className="mb-3.5 text-sm font-bold tracking-[0.08em] text-[#ff4d4f]">创作者身份入口</p>
          <h1 className="max-w-[680px] text-[clamp(38px,6vw,62px)] leading-[1.05] font-bold">
            登录后开始管理你的 AI 内容生产链路
          </h1>
          <p className="mt-5 max-w-[620px] text-lg leading-8 text-[#6b7280]">
            先进入账号体系，后续创作、草稿、审核、评分和发布都会围绕同一个创作者身份沉淀数据。
          </p>
          <div className="mt-7 flex flex-wrap gap-3" aria-label="登录后可用能力">
            <span className="rounded-md border border-[#eeeeee] bg-white px-3 py-2.5 font-bold text-[#4e5661]">AI 初稿生成</span>
            <span className="rounded-md border border-[#eeeeee] bg-white px-3 py-2.5 font-bold text-[#4e5661]">草稿自动保存</span>
            <span className="rounded-md border border-[#eeeeee] bg-white px-3 py-2.5 font-bold text-[#4e5661]">发布前审核</span>
          </div>
        </div>

        <form className="rounded-lg border border-[#eeeeee] bg-white p-6 shadow-[0_22px_64px_rgba(31,35,41,0.12)]" onSubmit={submit}>
          <div className="mb-5 flex flex-col items-start justify-between gap-4 sm:flex-row">
            <div>
              <span className="text-[13px] font-extrabold tracking-[0.06em] text-[#ff4d4f]">账号访问</span>
              <h2 className="mt-1.5 text-[28px] leading-tight font-bold">{isRegister ? "注册新账号" : "欢迎回来"}</h2>
            </div>
            <button
              className="whitespace-nowrap rounded-lg border border-[#ffb2b3] bg-[#fff1f1] px-3 py-2.5 font-bold text-[#ff4d4f]"
              type="button"
              onClick={fillDemoAccount}
            >
              填入演示账号
            </button>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-[#f6f7f9] p-1" role="tablist" aria-label="账号模式">
            <button
              aria-selected={!isRegister}
              className={[
                "rounded-md px-3 py-2.5 font-extrabold text-[#6b7280]",
                !isRegister ? "bg-white text-[#1f2329] shadow-[0_1px_6px_rgba(31,35,41,0.12)]" : "",
              ].join(" ")}
              role="tab"
              type="button"
              onClick={() => switchMode("login")}
            >
              登录
            </button>
            <button
              aria-selected={isRegister}
              className={[
                "rounded-md px-3 py-2.5 font-extrabold text-[#6b7280]",
                isRegister ? "bg-white text-[#1f2329] shadow-[0_1px_6px_rgba(31,35,41,0.12)]" : "",
              ].join(" ")}
              role="tab"
              type="button"
              onClick={() => switchMode("register")}
            >
              注册
            </button>
          </div>

          {isRegister ? (
            <label className="mt-3.5 block">
              <span className="mb-2 block text-sm font-extrabold text-[#4e5661]">昵称</span>
              <input
                autoComplete="nickname"
                className="w-full rounded-lg border border-[#dedede] bg-[#fbfbfb] px-3.5 py-3 text-inherit outline-none transition focus:border-[#ff4d4f] focus:shadow-[0_0_0_3px_rgba(255,77,79,0.13)]"
                placeholder="例如：训练营创作者"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
              />
            </label>
          ) : null}

          <label className="mt-3.5 block">
            <span className="mb-2 block text-sm font-extrabold text-[#4e5661]">邮箱</span>
            <input
              autoComplete="email"
              className="w-full rounded-lg border border-[#dedede] bg-[#fbfbfb] px-3.5 py-3 text-inherit outline-none transition focus:border-[#ff4d4f] focus:shadow-[0_0_0_3px_rgba(255,77,79,0.13)]"
              inputMode="email"
              placeholder="demo@bytecamp.local"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <div className="mt-3.5 block">
            <label className="mb-2 block text-sm font-extrabold text-[#4e5661]" htmlFor="login-password">
              密码
            </label>
            <div className="relative">
              <input
                id="login-password"
                autoComplete={isRegister ? "new-password" : "current-password"}
                className="w-full rounded-lg border border-[#dedede] bg-[#fbfbfb] px-3.5 py-3 pr-[76px] text-inherit outline-none transition focus:border-[#ff4d4f] focus:shadow-[0_0_0_3px_rgba(255,77,79,0.13)]"
                placeholder="请输入密码"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                aria-pressed={showPassword}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md border border-[#dedede] bg-[#f6f7f9] px-2.5 py-1.5 text-[13px] font-extrabold text-[#ff4d4f] hover:bg-[#eeeeee] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[rgba(255,77,79,0.2)]"
                type="button"
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? "隐藏" : "显示"}
              </button>
            </div>
          </div>

          {error ? (
            <p className="mt-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] p-3 leading-6 text-[#b91c1c]" role="alert">
              {error}
            </p>
          ) : null}

          <button
            className="mt-4 w-full rounded-lg bg-[#ff4d4f] px-4 py-3 font-extrabold text-white disabled:cursor-not-allowed disabled:bg-[#f3a5a6]"
            disabled={!canSubmit || status === "submitting"}
            type="submit"
          >
            {status === "submitting" ? "提交中..." : isRegister ? "注册并进入" : "登录并进入"}
          </button>

          <p className="mt-3.5 text-[13px] leading-6 text-[#6b7280]">
            演示账号：<strong>{demoAccount.email}</strong> / <strong>{demoAccount.password}</strong>
          </p>
        </form>
      </section>
    </main>
  );
}
