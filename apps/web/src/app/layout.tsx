import type { Metadata } from "next";
import { Fragment_Mono, IBM_Plex_Mono, IBM_Plex_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Nav } from "./nav";
import { Providers } from "./providers";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
});
const fragmentMono = Fragment_Mono({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-fragment-mono",
});
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-sans",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: "PopOrSlop — startup markets",
  description:
    "Every startup has a tradable token and prediction markets that resolve against public records. Play money.",
};

/** Applies the saved theme before first paint so there's no flash of the wrong one. */
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('pos-theme');document.documentElement.dataset.theme=(t==='terminal'||t==='broadsheet')?t:'broadsheet'}catch(e){document.documentElement.dataset.theme='broadsheet'}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="broadsheet"
      className={`${spaceGrotesk.variable} ${fragmentMono.variable} ${plexSans.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-dvh">
        <Providers>
          <Nav />
          <main className="mx-auto w-full max-w-[var(--shell)] px-5 pb-20">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
