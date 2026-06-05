import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "内容榜单 - AI Creator Hub",
};

export default function RankingsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
