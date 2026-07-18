import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flowwright",
  description:
    "Turn a browser task into tested software. Record a task once; Flowwright generates an inspectable workflow, tested code, and a reusable application.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
