import type { Metadata } from "next";

import { ThemeProvider } from "@/lib/theme";

import "./globals.css";

export const metadata: Metadata = {
  title: "Napoleon Interview",
  description: "Доказательное асинхронное техническое интервью",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" data-theme="light" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
