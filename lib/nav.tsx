"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { supabase } from "./supabaseClient";
import { useRouter } from "next/navigation";
import { useRol } from "./useRol";

const NAV_LINKS = [
  { href: "/dashboard",    label: "Inicio" },
  { href: "/ordenes",      label: "Órdenes" },
  { href: "/cuaderno",     label: "Cuaderno" },
  { href: "/bodega",       label: "Bodega" },
  { href: "/calculadora",  label: "Calcular" },
  { href: "/cuarteles",    label: "Cuarteles" },
  { href: "/productos",    label: "Productos" },
  { href: "/ajustes",      label: "Ajustes" },
];

function NavContent({ empresaId }: { empresaId?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentEmpresa = empresaId || searchParams.get("empresa") || "";
  const { isAdmin } = useRol();
  const [borradoresCount, setBorradoresCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!isAdmin) { setBorradoresCount(0); return; }
    supabase
      .from("ordenes_trabajo")
      .select("id", { count: "exact", head: true })
      .eq("estado", "borrador")
      .then(({ count }) => setBorradoresCount(count ?? 0));
  }, [isAdmin, pathname]);

  // Cerrar menú al cambiar de ruta
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const buildHref = (base: string) =>
    currentEmpresa ? `${base}?empresa=${currentEmpresa}` : base;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <>
      <style>{`
        .nav-hamburger { display: none; }
        .nav-links-mobile { display: none !important; }
        @media (max-width: 700px) {
          .nav-hamburger { display: flex; }
          .nav-links-desktop { display: none !important; }
          .nav-links-mobile { display: flex !important; }
          .nav-logout-desktop { display: none !important; }
        }
      `}</style>
      <nav style={navStyle}>
        <div style={navInner}>
          <span style={logo}>🌿 AgroFito</span>

          {/* Links desktop */}
          <div className="nav-links-desktop" style={links}>
            {NAV_LINKS.map((l) => {
              const active = pathname.startsWith(l.href);
              const showBadge = l.href === "/ordenes" && isAdmin && borradoresCount > 0;
              return (
                <Link key={l.href} href={buildHref(l.href)}
                  style={{ ...linkStyle, ...(active ? activeLinkStyle : {}), position: "relative" }}>
                  {l.label}
                  {showBadge && <span style={badge}>{borradoresCount > 9 ? "9+" : borradoresCount}</span>}
                </Link>
              );
            })}
          </div>

          <button onClick={handleLogout} className="nav-logout-desktop" style={logoutBtn}>Salir</button>

          {/* Hamburger button — solo mobile */}
          <button
            className="nav-hamburger"
            onClick={() => setMenuOpen(o => !o)}
            style={hamburgerBtn}
            aria-label="Menú"
          >
            <span style={{ display: "block", width: "22px", height: "2px", background: "#fff", margin: "4px 0", transition: "all 0.2s", transform: menuOpen ? "rotate(45deg) translate(4px, 6px)" : "none" }} />
            <span style={{ display: "block", width: "22px", height: "2px", background: "#fff", margin: "4px 0", opacity: menuOpen ? 0 : 1, transition: "all 0.2s" }} />
            <span style={{ display: "block", width: "22px", height: "2px", background: "#fff", margin: "4px 0", transition: "all 0.2s", transform: menuOpen ? "rotate(-45deg) translate(4px, -6px)" : "none" }} />
          </button>
        </div>

        {/* Menú desplegable mobile */}
        <div className="nav-links-mobile" style={{ ...mobileMenu, maxHeight: menuOpen ? "500px" : "0", opacity: menuOpen ? 1 : 0 }}>
          {NAV_LINKS.map((l) => {
            const active = pathname.startsWith(l.href);
            const showBadge = l.href === "/ordenes" && isAdmin && borradoresCount > 0;
            return (
              <Link key={l.href} href={buildHref(l.href)}
                style={{ ...mobileLinkStyle, ...(active ? activeLinkStyle : {}), position: "relative" }}>
                {l.label}
                {showBadge && <span style={badge}>{borradoresCount > 9 ? "9+" : borradoresCount}</span>}
              </Link>
            );
          })}
          <button onClick={handleLogout} style={{ ...logoutBtn, margin: "8px 16px 16px", width: "calc(100% - 32px)" }}>
            Salir
          </button>
        </div>
      </nav>
    </>
  );
}

function NavFallback() {
  return (
    <nav style={navStyle}>
      <div style={navInner}>
        <span style={logo}>🌿 AgroFito</span>
        <div style={links}>
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} style={linkStyle}>{l.label}</Link>
          ))}
        </div>
      </div>
    </nav>
  );
}

export default function Nav({ empresaId }: { empresaId?: string }) {
  return (
    <Suspense fallback={<NavFallback />}>
      <NavContent empresaId={empresaId} />
    </Suspense>
  );
}

const navStyle: React.CSSProperties = {
  background: "#1a4731",
  borderBottom: "3px solid #14532d",
  position: "sticky",
  top: 0,
  zIndex: 100,
};

const navInner: React.CSSProperties = {
  maxWidth: "1300px",
  margin: "0 auto",
  padding: "0 16px",
  minHeight: "56px",
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const logo: React.CSSProperties = {
  color: "#fff",
  fontWeight: 800,
  fontSize: "15px",
  whiteSpace: "nowrap",
  marginRight: "4px",
  flexShrink: 0,
};

const links: React.CSSProperties = {
  display: "flex",
  gap: "2px",
  flex: 1,
  flexWrap: "wrap",
};

const linkStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.75)",
  padding: "6px 10px",
  borderRadius: "8px",
  fontSize: "13px",
  fontWeight: 600,
  textDecoration: "none",
  transition: "background 0.15s",
  whiteSpace: "nowrap",
};

const mobileLinkStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.85)",
  padding: "12px 20px",
  fontSize: "15px",
  fontWeight: 600,
  textDecoration: "none",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const activeLinkStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.15)",
  color: "#fff",
};

const badge: React.CSSProperties = {
  position: "absolute",
  top: "-5px",
  right: "-7px",
  background: "#dc2626",
  color: "#fff",
  borderRadius: "999px",
  fontSize: "10px",
  fontWeight: 800,
  minWidth: "16px",
  height: "16px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 4px",
  lineHeight: "1",
  pointerEvents: "none",
};

const logoutBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(255,255,255,0.35)",
  color: "rgba(255,255,255,0.8)",
  padding: "6px 14px",
  borderRadius: "8px",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const hamburgerBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: "8px",
  marginLeft: "auto",
  flexShrink: 0,
};

const mobileMenu: React.CSSProperties = {
  flexDirection: "column",
  background: "#14532d",
  overflow: "hidden",
  transition: "max-height 0.3s ease, opacity 0.2s ease",
};
