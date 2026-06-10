import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "登录 - 文舟",
};

export default function LoginLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
