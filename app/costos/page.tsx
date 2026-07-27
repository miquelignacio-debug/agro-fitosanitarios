"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Suspense } from "react";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import { useEmpresa } from "@/lib/useEmpresa";
import { useCampo } from "@/lib/useCampo";

type Dimension = "producto" | "cuartel" | "funcion" | "objetivo" | "mes";

type OTData = {
  id: string;
  funcion: string[] | null;
  plagas_objetivo: string | null;
  objetivo_principal: string | null;
  fecha_aplicacion: string | null;
  mojamiento_solicitado_ltha: number | null;
  mojamiento_real_ltha: number | null;
  ot_cuarteles: { superficie_ha: number; cuartel: { codigo: string; especie: string; variedad: string } }[];
  ot_productos: { producto_id: string; dosis_real: number; dosis_unidad: string; producto: { nombre_comercial: string } | null }[];
};

type Row = { label: string; aplicaciones: number; ha: number; costoTotal: number; costoHa: number };

const DIMS: { key: Dimension; label: string; nota?: string }[] = [
  { key: "producto",  label: "Por producto" },
  { key: "cuartel",  label: "Por cuartel",  nota: "El costo se distribuye proporcionalmente a la superficie de cada cuartel en cada OT." },
  { key: "funcion",  label: "Por función",  nota: "Una OT con múltiples funciones suma su costo completo en cada una, por lo que el total puede superar el costo global." },
  { key: "objetivo", label: "Por objetivo" },
  { key: "mes",      label: "Por mes" },
];

function calcConsumoPlaneado(dosis: number, dosisUnidad: string, totalHa: number, mojamientoLtha: number): number {
  const u = dosisUnidad.toLowerCase().replace(/\s+/g, "");
  const volTotal = totalHa * mojamientoLtha;
  if (u.includes("/100lt") || u.includes("/100l")) {
    const raw = dosis * volTotal / 100;
    return (u.startsWith("cc") || u.startsWith("ml") || u.startsWith("g")) ? raw / 1000 : raw;
  }
  if (u.startsWith("lt/ha") || u.startsWith("l/ha")) return dosis * totalHa;
  if (u.startsWith("cc/ha") || u.startsWith("ml/ha")) return dosis * totalHa / 1000;
  if (u.startsWith("kg/ha")) return dosis * totalHa;
  if (u.startsWith("g/ha")) return dosis * totalHa / 1000;
  return 0;
}

function CostosContent() {
  const router = useRouter();
  const { empresaId, empresaNombre } = useEmpresa();
  const { campoId, campoNombre } = useCampo();

  const currentYear = new Date().getFullYear();
  const [desde, setDesde] = useState(`${currentYear}-01`);
  const [hasta, setHasta] = useState(`${currentYear}-12`);
  const [dim, setDim] = useState<Dimension>("producto");
  const [loading, setLoading] = useState(true);
  const [ots, setOts] = useState<OTData[]>([]);
  const [costosAvg, setCostosAvg] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      if (!empresaId) return;
      await load(empresaId);
    };
    init();
  }, [empresaId, campoId, desde, hasta]);

  const load = async (eid: string) => {
    setLoading(true);
    const desdeDate = `${desde}-01`;
    const [hastaY, hastaM] = hasta.split("-").map(Number);
    const hastaDate = new Date(hastaY, hastaM, 0).toISOString().slice(0, 10);

    const baseOT = supabase
      .from("ordenes_trabajo")
      .select(`id, funcion, plagas_objetivo, objetivo_principal, fecha_aplicacion,
        mojamiento_solicitado_ltha, mojamiento_real_ltha,
        ot_cuarteles(superficie_ha, cuartel:cuarteles(codigo, especie, variedad)),
        ot_productos(producto_id, dosis_real, dosis_unidad, producto:productos(nombre_comercial))`)
      .eq("empresa_id", eid)
      .eq("estado", "finalizada")
      .gte("fecha_aplicacion", desdeDate)
      .lte("fecha_aplicacion", hastaDate);
    const { data: otData } = await (campoId ? baseOT.eq("campo_id", campoId) : baseOT);
    setOts(((otData ?? []) as unknown as OTData[]));

    // Costo promedio ponderado por producto desde entradas de bodega
    const { data: costosData } = await supabase
      .from("stock_movimientos")
      .select("producto_id, cantidad, precio_unitario")
      .eq("empresa_id", eid)
      .eq("tipo", "entrada")
      .not("precio_unitario", "is", null);
    const costoAcc = new Map<string, { v: number; q: number }>();
    for (const c of (costosData ?? []) as { producto_id: string; cantidad: number; precio_unitario: number }[]) {
      const acc = costoAcc.get(c.producto_id) ?? { v: 0, q: 0 };
      acc.v += Number(c.cantidad) * Number(c.precio_unitario);
      acc.q += Number(c.cantidad);
      costoAcc.set(c.producto_id, acc);
    }
    const newCostosAvg = new Map<string, number>();
    for (const [pid, acc] of costoAcc) {
      if (acc.q > 0) newCostosAvg.set(pid, acc.v / acc.q);
    }
    setCostosAvg(newCostosAvg);
    setLoading(false);
  };

  // ── Cálculo ─────────────────────────────────────────────────────────────────

  // Costo total por OT: dosis × ha × mojamiento × precio promedio de cada producto
  const otCostMap = new Map<string, { costo: number; ha: number; ot: OTData }>();
  for (const ot of ots) {
    const ha  = ot.ot_cuarteles.reduce((s, c) => s + c.superficie_ha, 0);
    const moj = ot.mojamiento_real_ltha ?? ot.mojamiento_solicitado_ltha ?? 0;
    let costo = 0;
    for (const p of ot.ot_productos) {
      const consumo = calcConsumoPlaneado(Number(p.dosis_real), p.dosis_unidad, ha, moj);
      costo += consumo * (costosAvg.get(p.producto_id) ?? 0);
    }
    otCostMap.set(ot.id, { costo, ha, ot });
  }

  const otEntries  = [...otCostMap.values()].filter(e => e.costo > 0);
  const totalCosto = otEntries.reduce((s, e) => s + e.costo, 0);
  const totalHa    = otEntries.reduce((s, e) => s + e.ha, 0);

  // Agrupar por dimensión
  type G = { costoTotal: number; ha: number; aplicaciones: number };
  const grouped = new Map<string, G>();

  if (dim === "producto") {
    const prodData = new Map<string, { costo: number; otSet: Set<string> }>();
    for (const ot of ots) {
      const ha  = ot.ot_cuarteles.reduce((s, c) => s + c.superficie_ha, 0);
      const moj = ot.mojamiento_real_ltha ?? ot.mojamiento_solicitado_ltha ?? 0;
      for (const p of ot.ot_productos) {
        const consumo = calcConsumoPlaneado(Number(p.dosis_real), p.dosis_unidad, ha, moj);
        const costo   = consumo * (costosAvg.get(p.producto_id) ?? 0);
        if (costo === 0) continue;
        const nombre  = p.producto?.nombre_comercial ?? "Sin nombre";
        const entry   = prodData.get(nombre) ?? { costo: 0, otSet: new Set() };
        entry.costo += costo;
        entry.otSet.add(ot.id);
        prodData.set(nombre, entry);
      }
    }
    for (const [nombre, { costo, otSet }] of prodData) {
      const ha = [...otSet].reduce((s, id) => s + (otCostMap.get(id)?.ha ?? 0), 0);
      grouped.set(nombre, { costoTotal: costo, ha, aplicaciones: otSet.size });
    }
  } else {
    for (const { costo, ha, ot } of otCostMap.values()) {
      if (costo === 0) continue;

      if (dim === "cuartel") {
        const totalHaOT = ot.ot_cuarteles.reduce((s, c) => s + c.superficie_ha, 0);
        const n = Math.max(ot.ot_cuarteles.length, 1);
        for (const oc of ot.ot_cuarteles) {
          const label = `${oc.cuartel.codigo} — ${oc.cuartel.especie} ${oc.cuartel.variedad}`;
          const frac  = totalHaOT > 0 ? oc.superficie_ha / totalHaOT : 1 / n;
          const p = grouped.get(label) ?? { costoTotal: 0, ha: 0, aplicaciones: 0 };
          p.costoTotal  += costo * frac;
          p.ha          += oc.superficie_ha;
          p.aplicaciones++;
          grouped.set(label, p);
        }
      } else if (dim === "funcion") {
        const funciones = ot.funcion?.length ? ot.funcion : ["Sin función"];
        for (const f of funciones) {
          const label = f.charAt(0).toUpperCase() + f.slice(1);
          const p = grouped.get(label) ?? { costoTotal: 0, ha: 0, aplicaciones: 0 };
          p.costoTotal += costo; p.ha += ha; p.aplicaciones++;
          grouped.set(label, p);
        }
      } else if (dim === "objetivo") {
        const label = ot.plagas_objetivo || ot.objetivo_principal || "Sin objetivo";
        const p = grouped.get(label) ?? { costoTotal: 0, ha: 0, aplicaciones: 0 };
        p.costoTotal += costo; p.ha += ha; p.aplicaciones++;
        grouped.set(label, p);
      } else if (dim === "mes") {
        if (!ot.fecha_aplicacion) continue;
        const d = new Date(ot.fecha_aplicacion + "T12:00:00");
        const label = d.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
        const p = grouped.get(label) ?? { costoTotal: 0, ha: 0, aplicaciones: 0 };
        p.costoTotal += costo; p.ha += ha; p.aplicaciones++;
        grouped.set(label, p);
      }
    }
  }

  const rows: Row[] = Array.from(grouped.entries())
    .map(([label, { costoTotal, ha, aplicaciones }]) => ({
      label, aplicaciones, ha, costoTotal,
      costoHa: ha > 0 ? costoTotal / ha : 0,
    }));

  if (dim === "mes") {
    const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    rows.sort((a, b) => {
      const [ma, ya] = a.label.split(" de ");
      const [mb, yb] = b.label.split(" de ");
      const ya2 = parseInt(ya ?? a.label), yb2 = parseInt(yb ?? b.label);
      if (ya2 !== yb2) return ya2 - yb2;
      return MESES.indexOf(ma?.toLowerCase() ?? "") - MESES.indexOf(mb?.toLowerCase() ?? "");
    });
  } else {
    rows.sort((a, b) => b.costoTotal - a.costoTotal);
  }

  const totalRows = rows.reduce((s, r) => s + r.costoTotal, 0);
  const fmt$  = (n: number) => `$${n.toLocaleString("es-CL", { maximumFractionDigits: 0 })}`;
  const fmtMM = (n: number) => `$${(n / 1_000_000).toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MM`;
  const fmtHa = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 1 });
  const dimInfo = DIMS.find(d => d.key === dim)!;

  return (
    <>
      <Nav />
      <main style={container}>

        {/* ── Header ── */}
        <div style={pageHeader}>
          <div>
            <h1 style={pageTitle}>Análisis de costos — {campoNombre || empresaNombre}</h1>
            <p style={pageSubtitle}>Costo calculado desde dosis de OTs × costo promedio ponderado de ingresos a bodega</p>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <input type="month" value={desde} onChange={e => setDesde(e.target.value)} style={yearSelect} />
            <span style={{ color: "#6b7280", fontSize: "13px" }}>hasta</span>
            <input type="month" value={hasta} onChange={e => setHasta(e.target.value)} style={yearSelect} />
          </div>
        </div>

        {/* ── Tabs dimensión ── */}
        <div style={tabBar}>
          {DIMS.map(d => (
            <button key={d.key} onClick={() => setDim(d.key)} style={dim === d.key ? tabActive : tab}>
              {d.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: "#6b7280", marginTop: "24px" }}>Cargando…</p>
        ) : (
          <>
            {/* ── KPI cards ── */}
            <div style={kpiBar}>
              <div style={kpiCard}>
                <span style={kpiLabel}>Costo total período</span>
                <span style={kpiValue}>{fmtMM(totalCosto)}</span>
              </div>
              <div style={kpiCard}>
                <span style={kpiLabel}>Hectáreas tratadas</span>
                <span style={kpiValue}>{fmtHa(totalHa)} ha</span>
              </div>
              <div style={kpiCard}>
                <span style={kpiLabel}>Costo / ha promedio</span>
                <span style={kpiValue}>{fmt$(totalHa > 0 ? totalCosto / totalHa : 0)}</span>
              </div>
              <div style={kpiCard}>
                <span style={kpiLabel}>OTs con costo</span>
                <span style={kpiValue}>{otEntries.length} / {ots.length}</span>
              </div>
            </div>

            {/* ── Nota de la dimensión ── */}
            {dimInfo.nota && (
              <p style={notaStyle}>ⓘ {dimInfo.nota}</p>
            )}

            {rows.length === 0 ? (
              <div style={emptyBox}>
                <p style={{ fontSize: "15px", color: "#6b7280", marginBottom: "6px" }}>
                  Sin datos de costo para el período seleccionado{campoNombre ? ` · ${campoNombre}` : ""}.
                </p>
                <p style={{ fontSize: "13px", color: "#9ca3af" }}>
                  Registrá ingresos de bodega con precio para que los costos de las OTs puedan calcularse.
                </p>
              </div>
            ) : (
              <div style={tableCard}>
                <div style={{ overflowX: "auto" }}>
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={{ ...th, width: "35%" }}>
                          {dim === "producto" ? "Producto" : dim === "cuartel" ? "Cuartel" : dim === "funcion" ? "Función" : dim === "objetivo" ? "Objetivo / Plaga" : "Mes"}
                        </th>
                        <th style={{ ...th, textAlign: "right" }}>Aplic.</th>
                        <th style={{ ...th, textAlign: "right" }}>Ha</th>
                        <th style={{ ...th, textAlign: "right" }}>Costo total</th>
                        <th style={{ ...th, textAlign: "right" }}>$/ha</th>
                        <th style={{ ...th, minWidth: "140px" }}>Participación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => {
                        const pct = totalRows > 0 ? (r.costoTotal / totalRows) * 100 : 0;
                        return (
                          <tr key={r.label} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                            <td style={{ ...td, fontWeight: 600, color: "#111" }}>{r.label}</td>
                            <td style={{ ...td, textAlign: "right", color: "#6b7280" }}>{r.aplicaciones}</td>
                            <td style={{ ...td, textAlign: "right", color: "#6b7280" }}>{fmtHa(r.ha)}</td>
                            <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#1a4731" }}>{fmt$(r.costoTotal)}</td>
                            <td style={{ ...td, textAlign: "right", color: "#374151" }}>{fmt$(r.costoHa)}</td>
                            <td style={td}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <div style={{ flex: 1, background: "#e5e7eb", borderRadius: "999px", height: "6px", overflow: "hidden" }}>
                                  <div style={{ background: "#1a4731", height: "100%", width: `${Math.min(pct, 100)}%`, borderRadius: "999px" }} />
                                </div>
                                <span style={{ fontSize: "11px", color: "#6b7280", minWidth: "32px", textAlign: "right" }}>
                                  {pct.toFixed(0)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: "#f0f4f2" }}>
                        <td style={{ ...td, fontWeight: 800, color: "#1a4731" }}>TOTAL</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>
                          {dim === "producto" || dim === "objetivo" || dim === "mes"
                            ? otEntries.length
                            : rows.reduce((s, r) => s + r.aplicaciones, 0)}
                        </td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>
                          {dim === "cuartel"
                            ? fmtHa(rows.reduce((s, r) => s + r.ha, 0))
                            : fmtHa(totalHa)}
                        </td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 800, color: "#1a4731" }}>
                          {fmt$(dim === "funcion" ? totalCosto : totalRows)}
                        </td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>
                          {fmt$(totalHa > 0 ? totalCosto / totalHa : 0)}
                        </td>
                        <td style={td} />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* ── Gráfico de barras ── */}
                {rows.length > 1 && (
                  <div style={chartSection}>
                    <p style={chartTitle}>Distribución de costos</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {rows.slice(0, 10).map(r => {
                        const pct = totalRows > 0 ? (r.costoTotal / totalRows) * 100 : 0;
                        return (
                          <div key={r.label} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <span style={{ fontSize: "12px", color: "#374151", minWidth: "160px", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>
                              {r.label}
                            </span>
                            <div style={{ flex: 1, background: "#e5e7eb", borderRadius: "999px", height: "16px", overflow: "hidden" }}>
                              <div
                                style={{
                                  background: `hsl(${142 - rows.indexOf(r) * 12}, 60%, ${35 + rows.indexOf(r) * 3}%)`,
                                  height: "100%",
                                  width: `${Math.min(pct, 100)}%`,
                                  borderRadius: "999px",
                                  transition: "width 0.4s ease",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "flex-end",
                                  paddingRight: "6px",
                                }}
                              >
                                {pct > 8 && (
                                  <span style={{ fontSize: "10px", fontWeight: 700, color: "#fff" }}>
                                    {pct.toFixed(0)}%
                                  </span>
                                )}
                              </div>
                            </div>
                            <span style={{ fontSize: "12px", fontWeight: 700, color: "#1a4731", minWidth: "80px" }}>
                              {fmt$(r.costoTotal)}
                            </span>
                          </div>
                        );
                      })}
                      {rows.length > 10 && (
                        <p style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px" }}>
                          + {rows.length - 10} más (ver tabla completa arriba)
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

// ── Estilos ──────────────────────────────────────────────────────────────────

const container: React.CSSProperties    = { maxWidth: "1200px", margin: "0 auto", padding: "28px 20px" };
const pageHeader: React.CSSProperties  = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap", gap: "12px" };
const pageTitle: React.CSSProperties   = { fontSize: "24px", fontWeight: 800, color: "#1a4731" };
const pageSubtitle: React.CSSProperties = { fontSize: "13px", color: "#6b7280", marginTop: "4px" };
const yearSelect: React.CSSProperties  = { padding: "8px 12px", borderRadius: "10px", border: "1.5px solid #d1d5db", fontSize: "15px", fontWeight: 700, color: "#1a4731", background: "#fff", cursor: "pointer" };
const tabBar: React.CSSProperties      = { display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "20px" };
const tab: React.CSSProperties         = { padding: "7px 16px", borderRadius: "999px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "13px", cursor: "pointer" };
const tabActive: React.CSSProperties   = { ...tab, background: "#1a4731", color: "#fff", border: "1.5px solid #1a4731" };
const kpiBar: React.CSSProperties      = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "20px" };
const kpiCard: React.CSSProperties     = { background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: "14px", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "6px" };
const kpiLabel: React.CSSProperties    = { fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" };
const kpiValue: React.CSSProperties    = { fontSize: "26px", fontWeight: 800, color: "#1a4731", lineHeight: 1 };
const notaStyle: React.CSSProperties   = { fontSize: "12px", color: "#6b7280", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "8px 12px", marginBottom: "14px" };
const emptyBox: React.CSSProperties    = { background: "#f9fafb", border: "1.5px solid #e5e7eb", borderRadius: "14px", padding: "40px 24px", textAlign: "center", marginTop: "8px" };
const tableCard: React.CSSProperties   = { background: "#fff", borderRadius: "16px", border: "1px solid #e5e7eb", overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" };
const table: React.CSSProperties       = { width: "100%", borderCollapse: "collapse" };
const th: React.CSSProperties          = { padding: "11px 14px", background: "#f0f4f2", fontWeight: 700, fontSize: "12px", color: "#374151", textAlign: "left", whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" };
const td: React.CSSProperties          = { padding: "11px 14px", fontSize: "13px", color: "#374151", borderBottom: "1px solid #f3f4f6", whiteSpace: "nowrap" };
const chartSection: React.CSSProperties = { padding: "20px 24px", borderTop: "1px solid #f0f0f0" };
const chartTitle: React.CSSProperties  = { fontSize: "12px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "14px" };

export default function CostosPage() { return <Suspense><CostosContent /></Suspense>; }