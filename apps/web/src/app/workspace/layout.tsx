import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "创作工作台 - 文舟",
};

export default function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
