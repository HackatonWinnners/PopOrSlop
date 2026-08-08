import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "./nav";

export const metadata: Metadata = {
  title: "PopOrSlop — startup prediction markets",
  description:
    "Play-money prediction markets on startup outcomes, resolved against public records.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <Providers>
          <Nav />
          <main className="mx-auto w-full max-w-3xl px-4 pb-16">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
