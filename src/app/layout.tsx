import type { Metadata, Viewport } from "next";
import { Archivo, Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

// Self-hosted through next/font: no layout shift (size-adjusted fallbacks), no
// third-party request on cold open.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Olympus — LiftLog",
  description: "Personal training log, programmed by your PT",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Olympus",
  },
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/icons/icon-180x180.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#0A0A0B",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${archivo.variable} ${geist.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <Toaster
          theme="dark"
          position="top-center"
          offset="max(12px, env(safe-area-inset-top))"
          toastOptions={{
            style: {
              background: "#1C1C1F",
              border: "0",
              boxShadow: "inset 0 0 0 1px #2A2A2E, 0 12px 32px rgba(0,0,0,.5)",
              color: "#F5F3EE",
              borderRadius: "16px",
              fontFamily: "var(--font-geist), system-ui, sans-serif",
            },
          }}
        />
      </body>
    </html>
  );
}
