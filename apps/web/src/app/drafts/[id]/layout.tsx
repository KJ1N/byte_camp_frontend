import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "草稿编辑 - AI Creator Hub",
};

export default function DraftEditorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
