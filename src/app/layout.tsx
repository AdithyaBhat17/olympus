import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

// System fonts only (SF Pro / SF Pro Rounded on Apple devices): nothing to download.
export const metadata: Metadata = {
  title: "Olympus — LiftLog",
  description: "Personal training log, programmed by your PT",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
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
  themeColor: "#FBF6F4",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        {children}
        <Toaster
          theme="light"
          position="top-center"
          offset="max(12px, env(safe-area-inset-top))"
          toastOptions={{
            style: {
              background: "#1E1412",
              border: "0",
              boxShadow: "0 12px 32px rgba(30,20,18,.25)",
              color: "#FFFFFF",
              borderRadius: "22px",
              fontSize: "15px",
              fontWeight: 600,
            },
          }}
        />
      </body>
    </html>
  );
}
