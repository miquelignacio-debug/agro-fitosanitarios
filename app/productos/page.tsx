"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import { useRol } from "@/lib/useRol";
import type { Producto } from "@/lib/types";
import { TOXICIDAD_ABEJAS_LABEL, TOXICIDAD_ABEJAS_COLOR } from "@/lib/types";

type EditPrecios = { id: string; nombre: string; precio: string; minimo: string };
const PAGE_SIZE = 200;

export default function ProductosPage() {
  const router = useRouter();
  const { isAdmin, isSuperAdmin, isEncargado, isVisualizador } = useRol();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroFuente, setFiltroFuente] = useState<"todos" | "sag" | "manual">("todos");
  const [editPrecios, setEditPrecios] = useState<EditPrecios | null>(null);
  const [savingPrecios, setSavingPrecios] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (p: number, q: string, fuente: "todos" | "sag" | "manual") => {
    setLoading(true);
    const from = (p - 1) * PAGE_SIZE;
    let query = supabase.from("productos").select("*", { count: "exact" }).order("nombre_comercial");
    if (q.trim()) {
      query = query.or(`nombre_comercial.ilike.%${q}%,numero_registro.ilike.%${q}%,ingrediente_activo.ilike.%${q}%`);
    }
    if (fuente !== "todos") query = query.eq("fuente", fuente);
    const { data, count } = await query.range(from, from + PAGE_SIZE - 1);
    setProductos((data as Producto[]) || []);
    setTotalCount(count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      load(1, "", "todos");
    };
    init();
  }, [load, router]);

  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPage(1);
      load(1, val, filtroFuente);
    }, 400);
  };

  const handleFuente = (val: "todos" | "sag" | "manual") => {
    setFiltroFuente(val);
    setPage(1);
    load(1, search, val);
  };

  const handlePage = (p: number) => {
    setPage(p);
    load(p, search, filtroFuente);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <>
      <Nav />
      <main style={container}>
        <div style={pageHeader}>
          <div>
            <h1 style={pageTitle}>Catálogo de productos</h1>
            <p style={pageSubtitle}>{totalCount} productos registrados</p>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {isSuperAdmin && (
              <Link href="/productos/importar" style={secondaryBtn}>
                Importar desde SAG
              </Link>
            )}
            {(isAdmin || isEncargado) && (
              <Link href="/productos/nuevo" style={primaryBtn}>
                + Nuevo producto
              </Link>
            )}
          </div>
        </div>

        <div style={toolbar}>
          <input
            placeholder="Buscar por nombre, N° registro, ingrediente activo..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            style={{ ...searchInput, flex: 1, minWidth: "240px" }}
          />
          <select
            value={filtroFuente}
            onChange={(e) => handleFuente(e.target.value as typeof filtroFuente)}
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
            {editPrecios && (
              <div style={modalOverlay}>
                <div style={modalBox}>
                  <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#1a4731", marginBottom: "4px" }}>Precio y stock mínimo</h3>
                  <p style={{ fontSize: "12px", color: "#6b7280", marginBottom: "16px" }}>{editPrecios.nombre}</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "18px" }}>
                    <div>
                      <label style={lbl}>Precio costo ($/unidad)</label>
                      <input type="number" min="0" step="0.01" value={editPrecios.precio}
                        onChange={e => setEditPrecios(p => p ? { ...p, precio: e.target.value } : null)}
                        style={minp} placeholder="0.00" autoFocus />
                    </div>
                    <div>
                      <label style={lbl}>Stock mínimo (unidad)</label>
                      <input type="number" min="0" step="0.1" value={editPrecios.minimo}
                        onChange={e => setEditPrecios(p => p ? { ...p, minimo: e.target.value } : null)}
                        style={minp} placeholder="0" />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button disabled={savingPrecios} style={mSaveBtn} onClick={async () => {
                      setSavingPrecios(true);
                      await supabase.from("productos").update({
                        precio_costo: editPrecios.precio ? parseFloat(editPrecios.precio) : null,
                        stock_minimo: editPrecios.minimo ? parseFloat(editPrecios.minimo) : 0,
                      }).eq("id", editPrecios.id);
                      setSavingPrecios(false);
                      setEditPrecios(null);
                      load(page, search, filtroFuente);
                    }}>
                      {savingPrecios ? "Guardando..." : "Guardar"}
                    </button>
                    <button style={mCancelBtn} onClick={() => setEditPrecios(null)}>Cancelar</button>
                  </div>
                </div>
              </div>
            )}

            <table style={table}>
              <thead>
                <tr>
                  {["Producto", "N° Registro", "Ingrediente activo", "Función", "Dosis / unidad", "Carencia (d)", "Reingreso (h)", "Precio costo", "Stock mín.", "Abejas 🐝", "Fuente", ""].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {productos.map((p) => (
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
                    <td style={{ ...td, textAlign: "right", color: p.precio_costo ? "#1a4731" : "#d1d5db", fontWeight: p.precio_costo ? 700 : 400 }}>
                      {p.precio_costo != null ? `$${p.precio_costo.toLocaleString("es-CL")}` : "—"}
                    </td>
                    <td style={{ ...td, textAlign: "right", color: p.stock_minimo ? "#374151" : "#d1d5db" }}>
                      {p.stock_minimo != null && p.stock_minimo > 0 ? `${p.stock_minimo} ${p.unidad_dosis || "u"}` : "—"}
                    </td>
                    <td style={td}>
                      {p.toxicidad_abejas ? (
                        <span style={{
                          fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "999px",
                          background: TOXICIDAD_ABEJAS_COLOR[p.toxicidad_abejas] + "18",
                          color: TOXICIDAD_ABEJAS_COLOR[p.toxicidad_abejas],
                          border: `1px solid ${TOXICIDAD_ABEJAS_COLOR[p.toxicidad_abejas]}40`,
                          whiteSpace: "nowrap" as const,
                        }}>
                          {TOXICIDAD_ABEJAS_LABEL[p.toxicidad_abejas]}
                        </span>
                      ) : (
                        <span style={{ fontSize: "11px", color: "#d1d5db" }}>Sin clasificar</span>
                      )}
                    </td>
                    <td style={td}>
                      <span style={p.fuente === "sag" ? sagBadge : manualBadge}>
                        {p.fuente === "sag" ? "SAG" : "Manual"}
                      </span>
                    </td>
                    <td style={td}>
                      {!isVisualizador && (
                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <Link href={`/productos/${p.id}`} style={editLink}>Editar</Link>
                        {isAdmin && (
                          <button style={editLink} onClick={() => setEditPrecios({
                            id: p.id, nombre: p.nombre_comercial,
                            precio: p.precio_costo != null ? String(p.precio_costo) : "",
                            minimo: p.stock_minimo != null ? String(p.stock_minimo) : "",
                          })}>
                            $ Precio / Mín.
                          </button>
                        )}
                      </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {productos.length === 0 && (
              <p style={{ textAlign: "center", color: "#9ca3af", padding: "30px", background: "#fff" }}>
                No se encontraron productos.
              </p>
            )}

            {totalPages > 1 && (
              <div style={paginationRow}>
                <button
                  disabled={page <= 1}
                  onClick={() => handlePage(page - 1)}
                  style={{ ...pageBtn, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? "default" : "pointer" }}
                >
                  ← Anterior
                </button>
                <span style={{ fontSize: "13px", color: "#6b7280" }}>
                  Página {page} de {totalPages} · {totalCount} productos
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => handlePage(page + 1)}
                  style={{ ...pageBtn, opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? "default" : "pointer" }}
                >
                  Siguiente →
                </button>
              </div>
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
const editLink: React.CSSProperties = { fontSize: "12px", fontWeight: 700, color: "#1a4731", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" };
const modalOverlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" };
const modalBox: React.CSSProperties = { background: "#fff", borderRadius: "16px", padding: "24px 28px", width: "380px", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" };
const lbl: React.CSSProperties = { display: "block", fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "5px" };
const minp: React.CSSProperties = { padding: "9px 12px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "14px", background: "#fff", color: "#111", width: "100%", boxSizing: "border-box" };
const mSaveBtn: React.CSSProperties = { padding: "9px 22px", background: "#1a4731", color: "#fff", border: "none", borderRadius: "9px", fontWeight: 700, fontSize: "14px", cursor: "pointer" };
const mCancelBtn: React.CSSProperties = { padding: "9px 18px", background: "#fff", border: "1.5px solid #d1d5db", borderRadius: "9px", fontWeight: 600, fontSize: "14px", cursor: "pointer", color: "#374151" };
const paginationRow: React.CSSProperties = { display: "flex", justifyContent: "center", alignItems: "center", gap: "16px", padding: "14px 16px", background: "#fff", borderTop: "1px solid #e5e7eb", borderRadius: "0 0 14px 14px" };
const pageBtn: React.CSSProperties = { padding: "7px 16px", borderRadius: "8px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "13px" };