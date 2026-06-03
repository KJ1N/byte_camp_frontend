import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "内容首页 - AI Creator Hub",
  description: "AI 创作者辅助生产与分发平台",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
