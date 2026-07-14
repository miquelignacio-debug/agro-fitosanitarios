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

// Componente interno que lee searchParams (necesita Suspense en el padre)
function NavContent({ empresaId }: { empresaId?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentEmpresa = empresaId || searchParams.get("empresa") || "";
  const { isAdmin } = useRol();
  const [borradoresCount, setBorradoresCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) { setBorradoresCount(0); return; }
    supabase
      .from("ordenes_trabajo")
      .select("id", { count: "exact", head: true })
      .eq("estado", "borrador")
      .then(({ count }) => setBorradoresCount(count ?? 0));
  }, [isAdmin, pathname]);

  const buildHref = (base: string) =>
    currentEmpresa ? `${base}?empresa=${currentEmpresa}` : base;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <nav style={navStyle}>
      <div style={navInner}>
        <span style={logo}>🌿 Agro Fitosanitarios</span>

        <div style={links}>
          {NAV_LINKS.map((l) => {
            const active = pathname.startsWith(l.href);
            const showBadge = l.href === "/ordenes" && isAdmin && borradoresCount > 0;
            return (
              <Link
                key={l.href}
                href={buildHref(l.href)}
                style={{ ...linkStyle, ...(active ? activeLinkStyle : {}), position: "relative" }}
              >
                {l.label}
                {showBadge && (
                  <span style={badge}>{borradoresCount > 9 ? "9+" : borradoresCount}</span>
                )}
              </Link>
            );
          })}
        </div>

        <button onClick={handleLogout} style={logoutBtn}>
          Salir
        </button>
      </div>
    </nav>
  );
}

// Fallback mientras carga el searchParams
function NavFallback() {
  return (
    <nav style={navStyle}>
      <div style={navInner}>
        <span style={logo}>🌿 Agro Fitosanitarios</span>
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
  padding: "0 20px",
  height: "56px",
  display: "flex",
  alignItems: "center",
  gap: "20px",
};

const logo: React.CSSProperties = {
  color: "#fff",
  fontWeight: 800,
  fontSize: "16px",
  whiteSpace: "nowrap",
  marginRight: "8px",
};

const links: React.CSSProperties = {
  display: "flex",
  gap: "4px",
  flex: 1,
  flexWrap: "wrap",
};

const linkStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.75)",
  padding: "6px 12px",
  borderRadius: "8px",
  fontSize: "14px",
  fontWeight: 600,
  textDecoration: "none",
  transition: "background 0.15s",
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
};
