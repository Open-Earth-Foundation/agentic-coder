import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OEF Analytics — Engineering Operating System",
  description: "Live engineering metrics, AI estimation accuracy, sprint velocity, and cost-per-initiative dashboard for Open Earth Foundation.",
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
