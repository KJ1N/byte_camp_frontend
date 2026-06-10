import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "草稿箱 - 文舟",
};

export default function DraftsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
