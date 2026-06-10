import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "发文规范 - 文舟",
};

export default function DocsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
