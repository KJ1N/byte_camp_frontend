import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "创作者主页 - HEADLINE",
  description: "HEADLINE 创作者主页、草稿入口和 AI 创作灵感",
};

export default function CreatorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
