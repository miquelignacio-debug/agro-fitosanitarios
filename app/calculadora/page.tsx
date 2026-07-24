"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import { useEmpresa } from "@/lib/useEmpresa";
import type { Cuartel, Producto } from "@/lib/types";

type CalcRow   = { cuartel_id: string; superficie_ha: string; mojamiento: string };
type RowResult = { cuartel: Cuartel | undefined; sup: number; agua: number; cantidad: number };
type AltResult = { producto: Producto; stock: number };

function CalculadoraContent() {
  const router       = useRouter();
  const { empresaId } = useEmpresa();

  const [cuarteles, setCuarteles] = useState<Cuartel[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [stockMap,  setStockMap]  = useState<Map<string, number>>(new Map());
  const [loading,   setLoading]   = useState(true);

  const [rows,        setRows]        = useState<CalcRow[]>([{ cuartel_id: "", superficie_ha: "", mojamiento: "" }]);
  const [mojGlobal,   setMojGlobal]   = useState("");
  const [productoId,  setProductoId]  = useState("");
  const [dosis,       setDosis]       = useState("");
  const [dosisUnidad, setDosisUnidad] = useState("cc/100lt");

  // ── Carga inicial ──────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: prod } = await supabase.from("productos").select("*").eq("activo", true).order("nombre_comercial").limit(5000);
      setProductos((prod as Producto[]) || []);
      setLoading(false);
    };
    init();
  }, []);

  // ── Stock + cuarteles por empresa ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!empresaId) return;
    Promise.all([
      supabase.from("cuarteles").select("*").eq("empresa_id", empresaId).eq("activo", true).order("codigo"),
      supabase.from("stock_actual").select("producto_id, cantidad_disponible").eq("empresa_id", empresaId).gt("cantidad_disponible", 0),
    ]).then(([{ data: cuaData }, { data: stockData }]) => {
      if (cancelled) return;
      setCuarteles((cuaData as Cuartel[]) || []);
      const map = new Map<string, number>();
      for (const s of ((stockData || []) as { producto_id: string; cantidad_disponible: number }[])) {
        map.set(s.producto_id, s.cantidad_disponible);
      }
      setStockMap(map);
    });
    return () => { cancelled = true; };
  }, [empresaId]);

  // ── Especies únicas de los cuarteles cargados ─────────────────────────────
  const especiesUnicas = useMemo(() => {
    const s = new Set(cuarteles.map(c => c.especie));
    return Array.from(s).sort();
  }, [cuarteles]);

  // ── Selección masiva de cuarteles ─────────────────────────────────────────
  const seleccionarEspecie = (especie: string | null) => {
    const lista = especie ? cuarteles.filter(c => c.especie === especie) : cuarteles;
    if (!lista.length) return;
    setRows(lista.map(c => ({
      cuartel_id: c.id,
      superficie_ha: c.superficie_real != null ? String(c.superficie_real) : "",
      mojamiento: mojGlobal,
    })));
  };

  // ── Mojamiento global ─────────────────────────────────────────────────────
  const aplicarMojGlobal = () => {
    if (!mojGlobal) return;
    setRows(prev => prev.map(r => ({ ...r, mojamiento: mojGlobal })));
  };

  // ── Cálculo ────────────────────────────────────────────────────────────────
  const resultado = useMemo(() => {
    const dosisNum = parseFloat(dosis);
    if (!dosisNum || !productoId) return null;
    const prefix = dosisUnidad.split("/")[0].toLowerCase();
    const validas: RowResult[] = [];
    for (const r of rows) {
      const sup = parseFloat(r.superficie_ha) || 0;
      if (!sup) continue;
      const moj = parseFloat(r.mojamiento) || 0;
      let cantidad = 0;
      if (dosisUnidad.includes("/100")) {
        if (!moj) continue;
        cantidad = dosisNum * moj * sup / 100;
      } else if (dosisUnidad.includes("/ha")) {
        cantidad = dosisNum * sup;
      } else {
        continue;
      }
      // Convertir a unidad de bodega: cc/ml → lt, g → kg
      if (prefix === "cc" || prefix === "ml") cantidad /= 1000;
      else if (prefix === "g") cantidad /= 1000;
      validas.push({ cuartel: cuarteles.find(c => c.id === r.cuartel_id), sup, agua: moj > 0 ? sup * moj : 0, cantidad });
    }
    if (!validas.length) return null;
    const totalCantidad = validas.reduce((s, r) => s + r.cantidad, 0);
    const totalAgua     = validas.reduce((s, r) => s + r.agua, 0);
    const stockActual   = stockMap.get(productoId) ?? 0;
    const prod          = productos.find(p => p.id === productoId);
    return { validas, totalCantidad, totalAgua, stockActual, prod, suficiente: stockActual >= totalCantidad };
  }, [rows, productoId, dosis, dosisUnidad, cuarteles, stockMap, productos]);

  // ── Alternativas ───────────────────────────────────────────────────────────
  const alternativas = useMemo((): AltResult[] => {
    if (!productoId) return [];
    const prod = productos.find(p => p.id === productoId);
    if (!prod?.tipo_funcion?.length) return [];
    return productos
      .filter(p => p.id !== productoId && (stockMap.get(p.id) ?? 0) > 0 && p.tipo_funcion?.some(f => prod.tipo_funcion!.includes(f)))
      .map(p => ({ producto: p, stock: stockMap.get(p.id)! }))
      .sort((a, b) => b.stock - a.stock)
      .slice(0, 6);
  }, [productoId, productos, stockMap]);

  // ── Helpers de filas ───────────────────────────────────────────────────────
  const handleSelectCuartel = (i: number, cid: string) => {
    const c = cuarteles.find(c => c.id === cid);
    setRows(prev => prev.map((r, idx) => idx !== i ? r : {
      ...r, cuartel_id: cid,
      superficie_ha: c?.superficie_real != null ? String(c.superficie_real) : r.superficie_ha,
    }));
  };
  const setRow    = (i: number, field: keyof CalcRow, val: string) => setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const addRow    = () => setRows(prev => [...prev, { cuartel_id: "", superficie_ha: "", mojamiento: "" }]);
  const removeRow = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i));

  const fmt = (n: number) =>
    n >= 1000 ? Math.round(n).toLocaleString("es-CL") : n < 10 ? n.toFixed(3) : n.toFixed(2);
  const rawPrefix = dosisUnidad.split("/")[0].toLowerCase();
  const unit = (rawPrefix === "cc" || rawPrefix === "ml") ? "lt" : rawPrefix === "g" ? "kg" : rawPrefix;
  const productoConStock  = productos.filter(p => stockMap.has(p.id));
  const productoSinStock  = productos.filter(p => !stockMap.has(p.id));
  const mostrarAgua       = resultado?.validas.some(r => r.agua > 0);

  if (loading) return <><Nav /><main style={container}><p style={{ color: "#6b7280" }}>Cargando...</p></main></>;

  return (
    <>
      <Nav />
      <main style={container}>
        <div style={pageHeader}>
          <h1 style={pageTitle}>Calculadora de productos</h1>
          <p style={pageSubtitle}>Calculá el total necesario y verificá el stock antes de armar la OT</p>
        </div>

        <div style={mainGrid}>
          {/* ── Columna inputs ── */}
          <div style={col}>

            {/* Cuarteles */}
            <div style={card}>
              <h2 style={sectionTitle}>Cuarteles a aplicar</h2>

              {/* Selección rápida por especie */}
              {cuarteles.length > 0 && (
                <div style={quickSelWrap}>
                  <span style={quickSelLabel}>Selección rápida:</span>
                  <button onClick={() => seleccionarEspecie(null)} style={quickSelBtn} type="button">
                    Todos ({cuarteles.length})
                  </button>
                  {especiesUnicas.map(e => (
                    <button key={e} onClick={() => seleccionarEspecie(e)} style={quickSelBtn} type="button">
                      {e} ({cuarteles.filter(c => c.especie === e).length})
                    </button>
                  ))}
                </div>
              )}

              {/* Mojamiento global */}
              <div style={mojGlobalWrap}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#374151", whiteSpace: "nowrap" }}>
                  Moj. global (lt/ha)
                </span>
                <input
                  type="number" min="0" value={mojGlobal} onChange={e => setMojGlobal(e.target.value)}
                  placeholder="ej. 500" style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                />
                <button onClick={aplicarMojGlobal} style={applyBtn} type="button">
                  Aplicar a todos
                </button>
              </div>

              {/* Filas de cuarteles */}
              {rows.map((row, i) => (
                <div key={i} style={rowWrap}>
                  <div style={{ flex: "3 1 160px" }}>
                    {i === 0 && <label style={labelStyle}>Cuartel</label>}
                    <select value={row.cuartel_id} onChange={e => handleSelectCuartel(i, e.target.value)} style={inputStyle}>
                      <option value="">— Seleccionar —</option>
                      {cuarteles.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.codigo} — {c.especie} {c.variedad} ({c.superficie_real ?? "?"}ha)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: "0 0 80px" }}>
                    {i === 0 && <label style={labelStyle}>Ha</label>}
                    <input
                      type="number" min="0" step="0.01" value={row.superficie_ha} placeholder="ha"
                      onChange={e => setRow(i, "superficie_ha", e.target.value)}
                      onFocus={() => {
                        if (!row.superficie_ha && row.cuartel_id) {
                          const c = cuarteles.find(c => c.id === row.cuartel_id);
                          if (c?.superficie_real) setRow(i, "superficie_ha", String(c.superficie_real));
                        }
                      }}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ flex: "0 0 100px" }}>
                    {i === 0 && <label style={labelStyle}>Moj. (lt/ha)</label>}
                    <input type="number" min="0" value={row.mojamiento} placeholder="500"
                      onChange={e => setRow(i, "mojamiento", e.target.value)}
                      style={inputStyle} />
                  </div>
                  {rows.length > 1 && (
                    <button onClick={() => removeRow(i)} style={removeBtn} type="button">✕</button>
                  )}
                </div>
              ))}
              <button onClick={addRow} style={addBtn} type="button">+ Agregar cuartel</button>
            </div>

            {/* Producto y dosis */}
            <div style={card}>
              <h2 style={sectionTitle}>Producto y dosis</h2>
              <>
                <div style={{ marginBottom: "10px" }}>
                  <label style={labelStyle}>Producto</label>
                  <select value={productoId} onChange={e => { setProductoId(e.target.value); setDosis(""); }} style={inputStyle}>
                    <option value="">— Seleccionar —</option>
                    {productoConStock.length > 0 && (
                      <optgroup label="Con stock en bodega">
                        {productoConStock.map(p => (
                          <option key={p.id} value={p.id}>{p.nombre_comercial}</option>
                        ))}
                      </optgroup>
                    )}
                    {productoSinStock.length > 0 && (
                      <optgroup label="Sin stock en bodega">
                        {productoSinStock.map(p => (
                          <option key={p.id} value={p.id}>{p.nombre_comercial}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  {productoId && (() => {
                    const stock = stockMap.get(productoId) ?? 0;
                    const prod  = productos.find(p => p.id === productoId);
                    const enStock = stockMap.has(productoId);
                    return (
                      <span style={{ fontSize: "11px", color: enStock ? "#15803d" : "#dc2626", fontWeight: 700, marginTop: "4px", display: "block" }}>
                        {enStock
                          ? `Stock disponible: ${fmt(stock)} ${prod?.unidad_bodega ?? ""}`
                          : "Sin stock en bodega"}
                      </span>
                    );
                  })()}
                </div>
                <div style={rowWrap}>
                  <div style={{ flex: "1 1 100px" }}>
                    <label style={labelStyle}>Dosis</label>
                    <input type="number" min="0" step="0.001" value={dosis}
                      onChange={e => setDosis(e.target.value)} style={inputStyle} placeholder="0.00" />
                  </div>
                  <div style={{ flex: "1 1 120px" }}>
                    <label style={labelStyle}>Unidad</label>
                    <select value={dosisUnidad} onChange={e => setDosisUnidad(e.target.value)} style={inputStyle}>
                      {["cc/100lt", "g/100lt", "lt/ha", "cc/ha", "kg/ha", "g/ha"].map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            </div>

          </div>

          {/* ── Columna resultados ── */}
          <div style={col}>
            {resultado ? (
              <>
                {/* Tabla por cuartel */}
                <div style={card}>
                  <h2 style={sectionTitle}>Detalle por cuartel</h2>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={th}>Cuartel</th>
                          <th style={{ ...th, textAlign: "right" }}>Ha</th>
                          {mostrarAgua && <th style={{ ...th, textAlign: "right" }}>Agua (lt)</th>}
                          <th style={{ ...th, textAlign: "right" }}>{unit} necesarios</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resultado.validas.map((r, i) => (
                          <tr key={i}>
                            <td style={{ ...td, fontWeight: 700 }}>{r.cuartel?.codigo ?? "—"}</td>
                            <td style={{ ...td, textAlign: "right" }}>{fmt(r.sup)}</td>
                            {mostrarAgua && <td style={{ ...td, textAlign: "right", color: "#6b7280" }}>{r.agua > 0 ? fmt(r.agua) : "—"}</td>}
                            <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#1a4731" }}>{fmt(r.cantidad)} {unit}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: "2px solid #d1d5db" }}>
                          <td style={{ ...td, fontWeight: 800, color: "#111" }}>TOTAL</td>
                          <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>
                            {fmt(resultado.validas.reduce((s, r) => s + r.sup, 0))} ha
                          </td>
                          {mostrarAgua && (
                            <td style={{ ...td, textAlign: "right", fontWeight: 800, color: "#6b7280" }}>
                              {resultado.totalAgua > 0 ? `${fmt(resultado.totalAgua)} lt` : "—"}
                            </td>
                          )}
                          <td style={{ ...td, textAlign: "right", fontWeight: 900, fontSize: "16px", color: "#1a4731" }}>
                            {fmt(resultado.totalCantidad)} {unit}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Estado de stock */}
                <div style={{
                  ...card,
                  border: `1.5px solid ${resultado.suficiente ? "#86efac" : "#fca5a5"}`,
                  background: resultado.suficiente ? "#f0fdf4" : "#fef2f2",
                }}>
                  <h2 style={{ ...sectionTitle, color: resultado.suficiente ? "#15803d" : "#dc2626" }}>
                    {resultado.suficiente ? "✓ Stock suficiente" : resultado.stockActual === 0 && !stockMap.has(productoId) ? "⚠️ Sin stock en bodega" : "⚠️ Stock insuficiente"}
                  </h2>
                  <div style={{ display: "flex", gap: "28px", flexWrap: "wrap" }}>
                    <div>
                      <div style={statLabel}>Total necesario</div>
                      <div style={{ ...statValue, color: "#1a4731" }}>{fmt(resultado.totalCantidad)} {unit}</div>
                    </div>
                    <div>
                      <div style={statLabel}>En bodega</div>
                      <div style={{ ...statValue, color: resultado.suficiente ? "#15803d" : "#dc2626" }}>
                        {fmt(resultado.stockActual)} {resultado.prod?.unidad_bodega ?? unit}
                      </div>
                    </div>
                    {resultado.stockActual > 0 && (
                      <div>
                        <div style={statLabel}>{resultado.suficiente ? "Quedará disponible" : "Faltante"}</div>
                        <div style={{ ...statValue, color: resultado.suficiente ? "#374151" : "#dc2626" }}>
                          {fmt(Math.abs(resultado.stockActual - resultado.totalCantidad))} {resultado.prod?.unidad_bodega ?? unit}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Alternativas */}
                {alternativas.length > 0 && (
                  <div style={card}>
                    <h2 style={sectionTitle}>Alternativas disponibles en stock</h2>
                    <p style={{ fontSize: "12px", color: "#6b7280", marginBottom: "12px" }}>
                      Misma función fitosanitaria · clic para seleccionar
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {alternativas.map(({ producto: p, stock }) => (
                        <button key={p.id} type="button"
                          onClick={() => { setProductoId(p.id); setDosis(""); setDosisUnidad(p.unidad_dosis || dosisUnidad); }}
                          style={altCard}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: "13px", color: "#1a4731" }}>{p.nombre_comercial}</div>
                              {p.ingrediente_activo && (
                                <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>{p.ingrediente_activo}</div>
                              )}
                              {p.tipo_funcion && (
                                <div style={{ display: "flex", gap: "4px", marginTop: "6px", flexWrap: "wrap" }}>
                                  {p.tipo_funcion.map(f => <span key={f} style={funcChip}>{f}</span>)}
                                </div>
                              )}
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <div style={{ fontSize: "16px", fontWeight: 800, color: "#15803d" }}>
                                {fmt(stock)} {p.unidad_bodega ?? ""}
                              </div>
                              <div style={{ fontSize: "10px", color: "#6b7280", marginTop: "1px" }}>en stock</div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ ...card, textAlign: "center", padding: "60px 24px" }}>
                <div style={{ fontSize: "48px", marginBottom: "14px" }}>🧮</div>
                <p style={{ color: "#9ca3af", fontSize: "14px" }}>
                  Seleccioná los cuarteles, el producto y la dosis para ver el cálculo.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

const container: React.CSSProperties        = { maxWidth: "1300px", margin: "0 auto", padding: "28px 20px" };
const pageHeader: React.CSSProperties       = { marginBottom: "20px" };
const pageTitle: React.CSSProperties        = { fontSize: "24px", fontWeight: 800, color: "#1a4731" };
const pageSubtitle: React.CSSProperties     = { fontSize: "13px", color: "#6b7280", marginTop: "4px" };
const mainGrid: React.CSSProperties         = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))", gap: "20px", alignItems: "start" };
const col: React.CSSProperties              = { display: "flex", flexDirection: "column", gap: "16px" };
const card: React.CSSProperties             = { background: "#fff", borderRadius: "16px", border: "1px solid #e5e7eb", padding: "20px 24px" };
const sectionTitle: React.CSSProperties     = { fontSize: "13px", fontWeight: 700, color: "#1a4731", marginBottom: "14px", textTransform: "uppercase" as const, letterSpacing: "0.05em" };
const quickSelWrap: React.CSSProperties     = { display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" };
const quickSelLabel: React.CSSProperties    = { fontSize: "11px", fontWeight: 700, color: "#6b7280", whiteSpace: "nowrap" };
const quickSelBtn: React.CSSProperties      = { padding: "4px 12px", borderRadius: "999px", border: "1.5px solid #1a4731", background: "transparent", color: "#1a4731", fontSize: "12px", fontWeight: 700, cursor: "pointer" };
const mojGlobalWrap: React.CSSProperties    = { display: "flex", gap: "8px", alignItems: "center", marginBottom: "14px", padding: "10px 12px", background: "#f9fafb", borderRadius: "10px", border: "1px solid #e5e7eb" };
const applyBtn: React.CSSProperties         = { padding: "7px 14px", borderRadius: "8px", border: "1.5px solid #1a4731", background: "#1a4731", color: "#fff", fontSize: "12px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" };
const rowWrap: React.CSSProperties          = { display: "flex", gap: "10px", alignItems: "flex-end", marginBottom: "10px", flexWrap: "wrap" };
const labelStyle: React.CSSProperties       = { display: "block", fontSize: "12px", fontWeight: 700, color: "#374151", marginBottom: "5px" };
const inputStyle: React.CSSProperties       = { padding: "9px 12px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "14px", background: "#fafafa", color: "#111", width: "100%", boxSizing: "border-box" };
const addBtn: React.CSSProperties           = { marginTop: "6px", padding: "6px 14px", borderRadius: "8px", border: "1.5px solid #1a4731", background: "transparent", color: "#1a4731", fontSize: "13px", fontWeight: 700, cursor: "pointer" };
const removeBtn: React.CSSProperties        = { padding: "8px 10px", borderRadius: "8px", border: "1px solid #fca5a5", background: "transparent", color: "#dc2626", fontSize: "14px", cursor: "pointer", flexShrink: 0 };
const th: React.CSSProperties               = { padding: "8px 10px", background: "#f0f4f2", fontWeight: 700, fontSize: "11px", color: "#374151", textAlign: "left", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" };
const td: React.CSSProperties               = { padding: "8px 10px", fontSize: "13px", color: "#374151", borderBottom: "1px solid #f3f4f6" };
const statLabel: React.CSSProperties        = { fontSize: "11px", color: "#6b7280", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: "3px" };
const statValue: React.CSSProperties        = { fontSize: "22px", fontWeight: 800 };
const altCard: React.CSSProperties          = { background: "#fafafa", borderRadius: "10px", border: "1px solid #e5e7eb", padding: "12px 16px", textAlign: "left", cursor: "pointer", width: "100%" };
const funcChip: React.CSSProperties         = { padding: "2px 8px", borderRadius: "999px", background: "#f0fdf4", border: "1px solid #86efac", fontSize: "10px", fontWeight: 700, color: "#15803d" };

export default function CalculadoraPage() { return <Suspense><CalculadoraContent /></Suspense>; }
