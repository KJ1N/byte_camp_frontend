import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "内容详情 - AI Creator Hub",
};

export default function ArticleLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}

