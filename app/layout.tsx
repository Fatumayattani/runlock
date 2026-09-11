import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Runlock — Treasury Survival",
  description: "Policy-bound treasury recovery executed through KeeperHub.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
