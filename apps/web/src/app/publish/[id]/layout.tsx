import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "发布确认 - 文舟",
};

export default function PublishLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
