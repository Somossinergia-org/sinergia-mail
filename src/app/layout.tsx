import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sinergia Mail — Dashboard Inteligente",
  description:
    "Panel de control de emails con IA para Somos Sinergia. Categorización automática, gestión de facturas y respuestas inteligentes.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.className} gradient-bg`}>{children}</body>
    </html>
  );
}
