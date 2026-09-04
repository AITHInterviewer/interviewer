import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AInterviewer",
  description: "Frontend scaffold for the interviewer app.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className={`${inter.className} app`}>{children}</body>
    </html>
  );
}
