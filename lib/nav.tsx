"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "./supabaseClient";
import { useRouter } from "next/navigation";
import { useRol } from "./useRol";
import { useEmpresa } from "./useEmpresa";

const NAV_LINKS = [
  { href: "/dashboard",   label: "Inicio" },
  { href: "/ordenes",     label: "Órdenes" },
  { href: "/cuaderno",    label: "Cuaderno" },
  { href: "/bodega",      label: "Bodega" },
  { href: "/calculadora", label: "Calcular" },
  { href: "/cuarteles",   label: "Cuarteles" },
  { href: "/productos",   label: "Productos" },
  { href: "/ajustes",     label: "Ajustes" },
];

function NavContent() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin, isSuperAdmin } = useRol();
  const { empresaId, empresaNombre, allEmpresas, switchEmpresa } = useEmpresa();
  const [borradoresCount, setBorradoresCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [userNombre, setUserNombre] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const selectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserEmail(user.email ?? "");
      supabase.from("usuarios").select("nombre").eq("id", user.id).single()
        .then(({ data }) => setUserNombre(data?.nombre ?? ""));
    });
  }, []);

  useEffect(() => {
    if (!isAdmin || !empresaId) { setBorradoresCount(0); return; }
    supabase
      .from("ordenes_trabajo")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", empresaId)
      .eq("estado", "borrador")
      .then(({ count }) => setBorradoresCount(count ?? 0));
  }, [isAdmin, empresaId, pathname]);

  useEffect(() => { setMenuOpen(false); setSelectorOpen(false); }, [pathname]);

  // Cerrar selector al hacer click fuera
  useEffect(() => {
    if (!selectorOpen) return;
    const handler = (e: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(e.target as Node)) {
        setSelectorOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [selectorOpen]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const adminLinks = isSuperAdmin
    ? [...NAV_LINKS, { href: "/admin", label: "Admin" }]
    : NAV_LINKS;

  const initials = userNombre
    ? userNombre.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()
    : "?";

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
        .empresa-option:hover { background: #f0f4f2 !important; }
      `}</style>
      <nav style={navStyle}>
        <div style={navInner}>
          {/* Logo */}
          <div style={{ display: "flex", flexDirection: "column", flexShrink: 0, marginRight: "4px" }}>
            <span style={logo}>🌿 AgroFito</span>
            {empresaNombre && <span style={empresaLabel}>{empresaNombre}</span>}
          </div>

          {/* Links desktop */}
          <div className="nav-links-desktop" style={links}>
            {adminLinks.map((l) => {
              const active = pathname.startsWith(l.href);
              const showBadge = l.href === "/ordenes" && isAdmin && borradoresCount > 0;
              return (
                <Link key={l.href} href={l.href}
                  style={{ ...linkStyle, ...(active ? activeLinkStyle : {}), position: "relative" }}>
                  {l.label}
                  {showBadge && <span style={badge}>{borradoresCount > 9 ? "9+" : borradoresCount}</span>}
                </Link>
              );
            })}
          </div>

          {/* Área derecha: usuario + empresa + salir */}
          <div className="nav-logout-desktop" style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>

            {/* Chip usuario */}
            {userNombre && (
              <div style={userChip}>
                <div style={userAvatar}>{initials}</div>
                <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
                  <span style={{ color: "#fff", fontSize: "12px", fontWeight: 700, whiteSpace: "nowrap" }}>
                    {userNombre}
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "10px", whiteSpace: "nowrap" }}>
                    {userEmail}
                  </span>
                </div>
              </div>
            )}

            {/* Selector empresa custom (solo superadmin) */}
            {isSuperAdmin && allEmpresas.length > 1 && (
              <div ref={selectorRef} style={{ position: "relative" }}>
                <button
                  onClick={() => setSelectorOpen(o => !o)}
                  style={empresaSelectorBtn}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "130px" }}>
                    {empresaNombre || "Seleccionar empresa"}
                  </span>
                  <span style={{ marginLeft: "6px", fontSize: "10px", opacity: 0.7 }}>
                    {selectorOpen ? "▲" : "▼"}
                  </span>
                </button>
                {selectorOpen && (
                  <div style={dropdownList}>
                    {allEmpresas.map(e => (
                      <button
                        key={e.id}
                        className="empresa-option"
                        onClick={() => { switchEmpresa(e.id); setSelectorOpen(false); }}
                        style={{
                          ...dropdownItem,
                          background: e.id === empresaId ? "#e8f5ee" : "#fff",
                          color: e.id === empresaId ? "#1a4731" : "#374151",
                          fontWeight: e.id === empresaId ? 700 : 500,
                        }}
                      >
                        {e.id === empresaId && <span style={{ marginRight: "6px", color: "#1a4731" }}>✓</span>}
                        {e.nombre}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button onClick={handleLogout} style={logoutBtn}>Salir</button>
          </div>

          {/* Hamburger — solo mobile */}
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
        <div className="nav-links-mobile" style={{ ...mobileMenu, maxHeight: menuOpen ? "600px" : "0", opacity: menuOpen ? 1 : 0 }}>
          {/* Info usuario mobile */}
          {userNombre && (
            <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ ...userAvatar, flexShrink: 0 }}>{initials}</div>
              <div>
                <div style={{ color: "#fff", fontSize: "13px", fontWeight: 700 }}>{userNombre}</div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "11px" }}>{userEmail}</div>
              </div>
            </div>
          )}
          {adminLinks.map((l) => {
            const active = pathname.startsWith(l.href);
            const showBadge = l.href === "/ordenes" && isAdmin && borradoresCount > 0;
            return (
              <Link key={l.href} href={l.href}
                style={{ ...mobileLinkStyle, ...(active ? activeLinkStyle : {}), position: "relative" }}>
                {l.label}
                {showBadge && <span style={badge}>{borradoresCount > 9 ? "9+" : borradoresCount}</span>}
              </Link>
            );
          })}
          {isSuperAdmin && allEmpresas.length > 1 && (
            <div style={{ padding: "8px 16px" }}>
              {allEmpresas.map(e => (
                <button
                  key={e.id}
                  onClick={() => { switchEmpresa(e.id); setMenuOpen(false); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "8px 12px", marginBottom: "4px", borderRadius: "8px",
                    border: "none", cursor: "pointer",
                    background: e.id === empresaId ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.07)",
                    color: "#fff", fontSize: "13px", fontWeight: e.id === empresaId ? 700 : 500,
                  }}
                >
                  {e.id === empresaId ? "✓ " : ""}{e.nombre}
                </button>
              ))}
            </div>
          )}
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

export default function Nav() {
  return (
    <Suspense fallback={<NavFallback />}>
      <NavContent />
    </Suspense>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
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
  lineHeight: 1.2,
};
const empresaLabel: React.CSSProperties = {
  color: "rgba(255,255,255,0.55)",
  fontSize: "10px",
  fontWeight: 600,
  whiteSpace: "nowrap",
  letterSpacing: "0.03em",
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
const userChip: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "4px 10px 4px 4px",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.15)",
};
const userAvatar: React.CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "50%",
  background: "rgba(255,255,255,0.2)",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "11px",
  fontWeight: 800,
  flexShrink: 0,
};
const empresaSelectorBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  background: "rgba(255,255,255,0.12)",
  border: "1px solid rgba(255,255,255,0.25)",
  color: "#fff",
  padding: "5px 10px",
  borderRadius: "8px",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
  maxWidth: "180px",
};
const dropdownList: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  right: 0,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: "10px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
  minWidth: "180px",
  overflow: "hidden",
  zIndex: 200,
};
const dropdownItem: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "10px 14px",
  border: "none",
  cursor: "pointer",
  fontSize: "13px",
  transition: "background 0.1s",
};