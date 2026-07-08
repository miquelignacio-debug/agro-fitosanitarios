"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Already installed as PWA
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true
    ) return;

    // Already dismissed
    if (localStorage.getItem("pwa-dismissed")) return;

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !(window.navigator as { standalone?: boolean }).standalone;

    if (ios) {
      setIsIOS(true);
      setShow(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShow(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem("pwa-dismissed", "1");
  };

  if (!show) return null;

  return (
    <div style={banner}>
      <div style={left}>
        <div style={iconWrap}>AF</div>
        <div>
          <p style={title}>Agro Fitosanitarios</p>
          <p style={sub}>
            {isIOS
              ? "Tocá el ícono Compartir ↑ y luego \"Agregar a inicio\""
              : "Instalá la app para acceso rápido desde tu pantalla de inicio"}
          </p>
        </div>
      </div>
      <div style={right}>
        {!isIOS && (
          <button onClick={handleInstall} style={installBtn}>
            Instalar
          </button>
        )}
        <button onClick={handleDismiss} style={closeBtn} aria-label="Cerrar">
          ✕
        </button>
      </div>
    </div>
  );
}

const banner: React.CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 9999,
  background: "#fff",
  borderTop: "3px solid #1a4731",
  padding: "14px 20px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "16px",
  boxShadow: "0 -4px 24px rgba(0,0,0,0.12)",
};

const left: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "14px",
  flex: 1,
  minWidth: 0,
};

const iconWrap: React.CSSProperties = {
  width: "48px",
  height: "48px",
  background: "#1a4731",
  borderRadius: "12px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#fff",
  fontWeight: 800,
  fontSize: "16px",
  flexShrink: 0,
  letterSpacing: "-1px",
};

const title: React.CSSProperties = {
  fontWeight: 700,
  fontSize: "14px",
  color: "#111",
  marginBottom: "2px",
};

const sub: React.CSSProperties = {
  fontSize: "12px",
  color: "#6b7280",
  lineHeight: "1.4",
};

const right: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  flexShrink: 0,
};

const installBtn: React.CSSProperties = {
  padding: "9px 20px",
  background: "#1a4731",
  color: "#fff",
  border: "none",
  borderRadius: "10px",
  fontWeight: 700,
  fontSize: "14px",
  cursor: "pointer",
};

const closeBtn: React.CSSProperties = {
  padding: "8px 10px",
  background: "transparent",
  border: "none",
  color: "#9ca3af",
  fontSize: "16px",
  cursor: "pointer",
  borderRadius: "6px",
};
