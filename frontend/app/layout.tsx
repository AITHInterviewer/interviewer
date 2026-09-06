import type { Metadata } from "next";

import { ThemeProvider } from "@/lib/theme";
import { ToastProvider } from "@/lib/toast";

import "./globals.css";

export const metadata: Metadata = {
  title: "Napoleon Interview",
  description: "Доказательное асинхронное техническое интервью",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" data-theme="light" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
