import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "草稿箱 - AI Creator Hub",
};

export default function DraftsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
