import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "内容首页 - 文舟",
  description: "文舟，AI 创作者辅助生产与分发平台",
  applicationName: "文舟",
  icons: {
    icon: [{ url: "/icon.png?v=20260610-glow-logo-large", sizes: "any", type: "image/png" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
