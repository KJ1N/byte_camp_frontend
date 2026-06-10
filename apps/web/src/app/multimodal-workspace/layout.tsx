import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "多模态生成 - 文舟",
};

export default function MultimodalWorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
