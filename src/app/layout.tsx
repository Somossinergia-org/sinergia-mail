import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sinergia Mail — Dashboard Inteligente",
  description:
    "Panel de control de emails con IA para Somos Sinergia. Categorización automática, gestión de facturas y respuestas inteligentes.",
  applicationName: "Sinergia Mail",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sinergia",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a1a",
  width: "device-width",
  initialScale: 1,
  // No maximumScale — allow users to pinch-zoom for accessibility (WCAG 1.4.4)
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.className} gradient-bg`}>
        {children}
        <Script id="register-sw" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').then((reg) => {
                  // Force check for updates every 60 seconds while tab is open
                  setInterval(() => reg.update().catch(() => {}), 60000);
                  reg.addEventListener('updatefound', () => {
                    const w = reg.installing;
                    if (!w) return;
                    w.addEventListener('statechange', () => {
                      if (w.state === 'installed' && navigator.serviceWorker.controller) {
                        // New SW installed — claim and reload to use fresh assets
                        w.postMessage({ type: 'SKIP_WAITING' });
                      }
                    });
                  });
                  let refreshing = false;
                  navigator.serviceWorker.addEventListener('controllerchange', () => {
                    if (refreshing) return;
                    refreshing = true;
                    window.location.reload();
                  });
                }).catch(() => {});
              });
            }
          `}
        </Script>
      </body>
    </html>
  );
}
