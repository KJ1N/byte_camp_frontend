import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "内容榜单 - 文舟",
};

export default function RankingsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
