import type { Metadata, Viewport } from "next";
import { SITE_URL, SITE_TITLE, SITE_DESCRIPTION } from "@/lib/site";
import { Inter, JetBrains_Mono, Newsreader } from "next/font/google";
import "./globals.css";
// The Human Quest family look (The Path) on every page: the kit, then this
// site's Path layer, which maps the hub's paper-and-ink tokens to day and night.
import "@/components/hq-path/hq-path.css";
import "./home.css";
import { HqThemeSync } from "@/components/hq-theme-sync";

// The Path: day or night before first paint (the same key every Human Quest
// site uses). It lives in this server component so React never renders the
// script on the client.
const themeScript = `try{var t=localStorage.getItem("hq-theme");if(!t)t=matchMedia("(prefers-color-scheme: dark)").matches?"night":"day";document.documentElement.dataset.theme=t}catch(e){}`;

// The family type (Fraunces, Instrument Sans). The kit CSS @imports it too,
// but Next drops an @import that does not open the final stylesheet.
const HQ_FONTS =
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..800;1,9..144,300..600&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap";

/**
 * Three faces, three jobs.
 *
 * Newsreader carries every heading and the display type — it's a newspaper
 * serif with a narrow set and real italics, which is what makes the app read
 * as a document rather than an admin panel.
 *
 * Inter carries UI chrome: labels, chips, buttons, table data. It's
 * deliberately unremarkable; the serif is doing the talking.
 *
 * JetBrains Mono carries literals — routes, screen names, commands, git shas.
 * Anything a reader might need to copy character-for-character is monospaced,
 * so a stray space or an l-versus-1 is visible.
 */
const serif = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif-stack",
  display: "swap",
  // Newsreader is variable across 200–800; we only ever use 400 and 500, but
  // loading the range lets optical sizing work at display sizes.
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans-stack",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-stack",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  // The verified public origin resolves every share image consistently.
  // Override NEXT_PUBLIC_SITE_URL for a different verified deployment.
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s · Walkthrough Studio",
  },
  description:
    "Walk any app — web, mobile, desktop or command line — and publish what you actually saw. Captured feature by feature, persona by persona, with the drift tracked between runs.",
  manifest: "/manifest.webmanifest",
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION, images: [`${SITE_URL}/art/og-card.png`] },
  applicationName: "Walkthrough Studio",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: SITE_TITLE,
    siteName: "Walkthrough Studio",
    description:
      "Walk any app — web, mobile, desktop or command line — and publish what you actually saw.",
    images: ["/art/og-card.png"],
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#faf8f5",
  colorScheme: "light",
};

/**
 * Never prerender, never cache.
 *
 * Every page in this app derives from files on disk — `projects.json`, the
 * catalogs, the capture PNGs — plus live `git log` calls against each target
 * checkout. Next will happily prerender a page like `/` at build time, since
 * from its point of view nothing dynamic is referenced. The result is a
 * library page frozen at whatever the filesystem held when the image was
 * built: new captures never appear and the staleness pill, whose entire job is
 * to notice change, reports the state of the world at build time forever.
 *
 * Declared on the root layout so it applies to every segment and a new route
 * can't opt out by omission.
 */
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr" data-hqp-t="pattern" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={HQ_FONTS} />
      </head>
      <body
        className={`${sans.variable} ${serif.variable} ${mono.variable} min-h-screen bg-paper font-sans text-ink antialiased`}
      >
        <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({"@context":"https://schema.org","@type":"SoftwareApplication",name:"Walkthrough Studio",url:SITE_URL,description:SITE_DESCRIPTION,applicationCategory:"DeveloperApplication",operatingSystem:"Web",codeRepository:"https://github.com/alibad/walkthrough-studio",publisher:{"@type":"Organization",name:"Human Quest",url:"https://www.humanquest.net/"}}).replace(/</g,"\\u003c")}}/>
        <HqThemeSync />
        {children}
      </body>
    </html>
  );
}
