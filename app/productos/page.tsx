"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import type { Producto } from "@/lib/types";

export default function ProductosPage() {
  const router = useRouter();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroFuente, setFiltroFuente] = useState<"todos" | "sag" | "manual">("todos");

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data } = await supabase
        .from("productos")
        .select("*")
        .order("nombre_comercial");
      setProductos((data as Producto[]) || []);
      setLoading(false);
    };
    init();
  }, []);

  const filtered = productos.filter((p) => {
    const matchSearch =
      p.nombre_comercial.toLowerCase().includes(search.toLowerCase()) ||
      (p.numero_registro || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.ingrediente_activo || "").toLowerCase().includes(search.toLowerCase());
    const matchFuente = filtroFuente === "todos" || p.fuente === filtroFuente;
    return matchSearch && matchFuente;
  });

  return (
    <>
      <Nav />
      <main style={container}>
        <div style={pageHeader}>
          <div>
            <h1 style={pageTitle}>Catálogo de productos</h1>
            <p style={pageSubtitle}>{productos.length} productos registrados</p>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link href="/productos/importar" style={secondaryBtn}>
              Importar desde SAG
            </Link>
            <Link href="/productos/nuevo" style={primaryBtn}>
              + Nuevo producto
            </Link>
          </div>
        </div>

        <div style={toolbar}>
          <input
            placeholder="Buscar por nombre, N° registro, ingrediente activo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...searchInput, flex: 1, minWidth: "240px" }}
          />
          <select
            value={filtroFuente}
            onChange={(e) => setFiltroFuente(e.target.value as typeof filtroFuente)}
            style={selectStyle}
          >
            <option value="todos">Todos</option>
            <option value="sag">SAG</option>
            <option value="manual">Manual</option>
          </select>
        </div>

        {loading ? (
          <p style={{ color: "#6b7280", marginTop: "20px" }}>Cargando...</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  {["Producto", "N° Registro", "Ingrediente activo", "Función", "Dosis / unidad", "PHI (días)", "REI (h)", "Fuente", ""].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td style={{ ...td, fontWeight: 700 }}>{p.nombre_comercial}</td>
                    <td style={td}>{p.numero_registro || "—"}</td>
                    <td style={{ ...td, maxWidth: "200px", whiteSpace: "normal" }}>{p.ingrediente_activo || "—"}</td>
                    <td style={td}>
                      {p.tipo_funcion?.map((f) => (
                        <span key={f} style={funcionTag}>{f}</span>
                      ))}
                    </td>
                    <td style={td}>{p.unidad_dosis || "—"}</td>
                    <td style={{ ...td, textAlign: "center" }}>{p.phi_dias ?? "—"}</td>
                    <td style={{ ...td, textAlign: "center" }}>{p.rei_horas ?? "—"}</td>
                    <td style={td}>
                      <span style={p.fuente === "sag" ? sagBadge : manualBadge}>
                        {p.fuente === "sag" ? "SAG" : "Manual"}
                      </span>
                    </td>
                    <td style={td}>
                      <Link href={`/productos/${p.id}`} style={editLink}>Ver / Editar</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p style={{ textAlign: "center", color: "#9ca3af", padding: "30px", background: "#fff" }}>
                No se encontraron productos.
              </p>
            )}
          </div>
        )}
      </main>
    </>
  );
}

const container: React.CSSProperties = { maxWidth: "1400px", margin: "0 auto", padding: "28px 20px" };
const pageHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap", gap: "12px" };
const pageTitle: React.CSSProperties = { fontSize: "24px", fontWeight: 800, color: "#1a4731" };
const pageSubtitle: React.CSSProperties = { fontSize: "13px", color: "#6b7280", marginTop: "4px" };
const toolbar: React.CSSProperties = { display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" };
const searchInput: React.CSSProperties = { padding: "9px 14px", borderRadius: "10px", border: "1.5px solid #d1d5db", fontSize: "14px", background: "#fff" };
const selectStyle: React.CSSProperties = { padding: "9px 14px", borderRadius: "10px", border: "1.5px solid #d1d5db", fontSize: "14px", background: "#fff" };
const primaryBtn: React.CSSProperties = { padding: "9px 18px", borderRadius: "10px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "14px" };
const secondaryBtn: React.CSSProperties = { padding: "9px 18px", borderRadius: "10px", border: "1.5px solid #1a4731", color: "#1a4731", fontWeight: 700, fontSize: "14px" };
const table: React.CSSProperties = { width: "100%", background: "#fff", borderRadius: "14px", overflow: "hidden", border: "1px solid #e5e7eb" };
const th: React.CSSProperties = { padding: "10px 12px", background: "#f0f4f2", fontWeight: 700, fontSize: "12px", color: "#374151", textAlign: "left", whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: "13px", color: "#374151", borderBottom: "1px solid #f3f4f6", verticalAlign: "middle" };
const funcionTag: React.CSSProperties = { display: "inline-block", padding: "2px 7px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, background: "#dcfce7", color: "#15803d", marginRight: "4px", marginBottom: "2px" };
const sagBadge: React.CSSProperties = { padding: "2px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, background: "#dbeafe", color: "#1d4ed8" };
const manualBadge: React.CSSProperties = { padding: "2px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, background: "#f3f4f6", color: "#6b7280" };
const editLink: React.CSSProperties = { fontSize: "12px", fontWeight: 700, color: "#1a4731" };
