import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import { SessionProvider } from "@/lib/session";
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
  description: "Obavia sales operating system.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0c0d10" },
    { media: "(prefers-color-scheme: light)", color: "#f4f3f0" },
  ],
  viewportFit: "cover",
};

/** Applies the stored theme and role before first paint so there is no flash. */
const bootScript = `(function(){try{var t=localStorage.getItem("sos-theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}try{var s=JSON.parse(localStorage.getItem("sos-session")||"null");if(s&&(s.role==="setter"||s.role==="closer"||s.role==="owner")){document.documentElement.setAttribute("data-role",s.role);}}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <SessionProvider>
          <AppShell tenantName="Obavia">{children}</AppShell>
        </SessionProvider>
      </body>
    </html>
  );
}
