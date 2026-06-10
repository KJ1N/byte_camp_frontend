import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "内容详情 - 文舟",
};

export default function ArticleLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
