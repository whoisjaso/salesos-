import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Sales OS",
    template: "%s, Sales OS",
  },
  description: "Obavia sales operating system. Funnel, assignments, coaching, and fair comparisons.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0c0d10" },
    { media: "(prefers-color-scheme: light)", color: "#f4f3f0" },
  ],
  viewportFit: "cover",
};

/** Applies the stored theme before first paint so there is no flash. */
const themeScript = `(function(){try{var t=localStorage.getItem("sos-theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

/** Reading timestamp for the current fixture set. Replaced by live data later. */
const AS_OF = "2026-08-31T09:00:00Z";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <AppShell tenantName="Obavia" asOf={AS_OF}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
