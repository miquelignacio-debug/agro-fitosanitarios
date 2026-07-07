import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agro Fitosanitarios",
  description: "Gestión de aplicaciones fitosanitarias",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
