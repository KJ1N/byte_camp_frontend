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
    <main className="login-page">
      <nav className="login-nav">
        <Link href="/" className="brand-link">
          AI Creator Hub
        </Link>
        <Link href="/" className="back-link">
          返回首页
        </Link>
      </nav>

      <section className="login-shell">
        <div className="login-copy">
          <p className="eyebrow">创作者身份入口</p>
          <h1>登录后开始管理你的 AI 内容生产链路</h1>
          <p>
            先进入账号体系，后续创作、草稿、审核、评分和发布都会围绕同一个创作者身份沉淀数据。
          </p>
          <div className="trust-list" aria-label="登录后可用能力">
            <span>AI 初稿生成</span>
            <span>草稿自动保存</span>
            <span>发布前审核</span>
          </div>
        </div>

        <form className="login-card" onSubmit={submit}>
          <div className="login-card-heading">
            <div>
              <span>账号访问</span>
              <h2>{isRegister ? "注册新账号" : "欢迎回来"}</h2>
            </div>
            <button className="demo-fill" type="button" onClick={fillDemoAccount}>
              填入演示账号
            </button>
          </div>

          <div className="mode-toggle" role="tablist" aria-label="账号模式">
            <button
              aria-selected={!isRegister}
              className={!isRegister ? "active" : ""}
              role="tab"
              type="button"
              onClick={() => switchMode("login")}
            >
              登录
            </button>
            <button
              aria-selected={isRegister}
              className={isRegister ? "active" : ""}
              role="tab"
              type="button"
              onClick={() => switchMode("register")}
            >
              注册
            </button>
          </div>

          {isRegister ? (
            <label className="form-field">
              <span>昵称</span>
              <input
                autoComplete="nickname"
                placeholder="例如：训练营创作者"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
              />
            </label>
          ) : null}

          <label className="form-field">
            <span>邮箱</span>
            <input
              autoComplete="email"
              inputMode="email"
              placeholder="demo@bytecamp.local"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="form-field">
            <span>密码</span>
            <input
              autoComplete={isRegister ? "new-password" : "current-password"}
              placeholder="请输入密码"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="submit-button" disabled={!canSubmit || status === "submitting"} type="submit">
            {status === "submitting" ? "提交中..." : isRegister ? "注册并进入" : "登录并进入"}
          </button>

          <p className="form-hint">
            演示账号：<strong>{demoAccount.email}</strong> / <strong>{demoAccount.password}</strong>
          </p>
        </form>
      </section>
    </main>
  );
}
