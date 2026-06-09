import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "多模态生成 - AI Creator Hub",
};

export default function MultimodalWorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
