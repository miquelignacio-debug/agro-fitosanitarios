import type { Metadata, Viewport } from "next";
import "./globals.css";
import SWRegister from "@/lib/SWRegister";
import InstallPrompt from "@/lib/InstallPrompt";
import { EmpresaProvider } from "@/lib/useEmpresa";

export const metadata: Metadata = {
  title: "Agro Fitosanitarios",
  description: "Gestión de aplicaciones fitosanitarias agrícolas",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AgroFito",
  },
};

export const viewport: Viewport = {
  themeColor: "#1a4731",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <EmpresaProvider>
          {children}
        </EmpresaProvider>
        <SWRegister />
        <InstallPrompt />
      </body>
    </html>
  );
}
