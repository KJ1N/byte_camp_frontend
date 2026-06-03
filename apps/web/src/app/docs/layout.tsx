import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "项目文档 - AI Creator Hub",
};

export default function DocsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
