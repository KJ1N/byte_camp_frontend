import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "发布确认 - AI Creator Hub",
};

export default function PublishLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}

