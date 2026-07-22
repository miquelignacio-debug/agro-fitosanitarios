"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import { useRol } from "@/lib/useRol";
import type { Empresa, OrdenTrabajo, StockActual } from "@/lib/types";
import { ESTADOS_OT, ESTADOS_OT_COLOR } from "@/lib/types";
import { Suspense } from "react";

// ── Tipos internos ────────────────────────────────────────────────────────────

type BorradorOT = OrdenTrabajo & {
  ot_cuarteles: { cuartel: { codigo: string } }[];
};

type CarenciaInfo = {
  cuartel_codigo: string;
  especie: string;
  variedad: string;
  plaga: string;
  producto: string;
  fecha_viable: string;
  dias_restantes: number;
};

type Costo = {
  producto: string;
  consumo: number;
  unidad: string;
  precio: number | null;
  costo: number | null;
};

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const empresaParam = searchParams.get("empresa") || "";
  const { isAdmin, isOperador } = useRol();

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState(empresaParam);
  const [ordenes, setOrdenes] = useState<OrdenTrabajo[]>([]);
  const [borradores, setBorradores] = useState<BorradorOT[]>([]);
  const [proximas, setProximas] = useState<OrdenTrabajo[]>([]);
  const [kpiFinalizadas, setKpiFinalizadas] = useState(0);
  const [stockBajo, setStockBajo] = useState<StockActual[]>([]);
  const [carencias, setCarencias] = useState<CarenciaInfo[]>([]);
  const [costos, setCostos] = useState<{ total: number; porHa: number; top: Costo[] }>({ total: 0, porHa: 0, top: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: emp } = await supabase.from("empresas").select("*").order("nombre");
      if (!emp || emp.length === 0) return;
      setEmpresas(emp);
      const eid = empresaParam || emp[0].id;
      setEmpresaId(eid);
      await loadData(eid);
    };
    init();
  }, [empresaParam]);

  const loadData = async (eid: string) => {
    setLoading(true);
    await Promise.all([
      loadOrdenes(eid), loadStock(eid), loadCarencias(eid),
      loadCostos(eid), loadBorradores(eid), loadKpiFinalizadas(eid), loadProximas(eid),
    ]);
    setLoading(false);
  };

  const loadProximas = async (eid: string) => {
    const hoy = new Date().toISOString().slice(0, 10);
    const en14dias = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
    const { data } = await supabase
      .from("ordenes_trabajo")
      .select("*")
      .eq("empresa_id", eid)
      .in("estado", ["borrador", "emitida", "en_ejecucion"])
      .not("fecha_aplicacion", "is", null)
      .gte("fecha_aplicacion", hoy)
      .lte("fecha_aplicacion", en14dias)
      .order("fecha_aplicacion", { ascending: true })
      .limit(10);
    setProximas((data as OrdenTrabajo[]) || []);
  };

  const loadBorradores = async (eid: string) => {
    const { data } = await supabase
      .from("ordenes_trabajo")
      .select("*, ot_cuarteles(cuartel:cuarteles(codigo))")
      .eq("empresa_id", eid)
      .eq("estado", "borrador")
      .order("created_at", { ascending: false })
      .limit(6);
    setBorradores((data as BorradorOT[]) || []);
  };

  const loadKpiFinalizadas = async (eid: string) => {
    const year = new Date().getFullYear();
    const { count } = await supabase
      .from("ordenes_trabajo")
      .select("*", { count: "exact", head: true })
      .eq("empresa_id", eid)
      .eq("estado", "finalizada")
      .gte("fecha_aplicacion", `${year}-01-01`);
    setKpiFinalizadas(count ?? 0);
  };

  const loadOrdenes = async (eid: string) => {
    const { data } = await supabase
      .from("ordenes_trabajo")
      .select("*")
      .eq("empresa_id", eid)
      .in("estado", ["emitida", "en_ejecucion"])
      .order("fecha_solicitud", { ascending: false })
      .limit(8);
    setOrdenes((data as OrdenTrabajo[]) || []);
  };

  const loadStock = async (eid: string) => {
    const { data } = await supabase
      .from("stock_actual")
      .select("*, producto:productos(nombre_comercial, unidad_dosis, stock_minimo)")
      .eq("empresa_id", eid);
    const items = ((data as StockActual[]) || []).filter(s => {
      const min = (s.producto as unknown as { stock_minimo?: number })?.stock_minimo ?? 5;
      return Number(s.cantidad_disponible) < Number(min);
    });
    setStockBajo(items);
  };

  const loadCarencias = async (eid: string) => {
    const hoy = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("ordenes_trabajo")
      .select(`
        plagas_objetivo,
        ot_cuarteles(cuartel:cuarteles(codigo, especie, variedad)),
        ot_productos(fecha_viable, carencia_dias, producto:productos(nombre_comercial))
      `)
      .eq("empresa_id", eid)
      .eq("estado", "finalizada")
      .gte("fecha_aplicacion", new Date(Date.now() - 180 * 86400 * 1000).toISOString().slice(0, 10));

    if (!data) return;

    const result: CarenciaInfo[] = [];
    const hoyMs = new Date(hoy).getTime();

    for (const ot of data as unknown as {
      plagas_objetivo: string | null;
      ot_cuarteles: { cuartel: { codigo: string; especie: string; variedad: string } }[];
      ot_productos: { fecha_viable: string | null; producto: { nombre_comercial: string } }[];
    }[]) {
      for (const oc of ot.ot_cuarteles) {
        for (const op of ot.ot_productos) {
          if (!op.fecha_viable) continue;
          const fvMs = new Date(op.fecha_viable + "T12:00:00").getTime();
          const diasRest = Math.ceil((fvMs - hoyMs) / 86400000);
          if (diasRest >= -3) {
            result.push({
              cuartel_codigo: oc.cuartel.codigo,
              especie: oc.cuartel.especie,
              variedad: oc.cuartel.variedad,
              plaga: ot.plagas_objetivo || "",
              producto: op.producto.nombre_comercial,
              fecha_viable: op.fecha_viable,
              dias_restantes: diasRest,
            });
          }
        }
      }
    }

    // Dedup: por cuartel + producto, mantener el más restrictivo
    const map = new Map<string, CarenciaInfo>();
    for (const r of result) {
      const key = `${r.cuartel_codigo}||${r.producto}`;
      const existing = map.get(key);
      if (!existing || r.dias_restantes > existing.dias_restantes) map.set(key, r);
    }

    setCarencias(Array.from(map.values()).sort((a, b) => b.dias_restantes - a.dias_restantes));
  };

  const loadCostos = async (eid: string) => {
    const anoActual = new Date().getFullYear();
    const desde = `${anoActual}-01-01`;

    const { data } = await supabase
      .from("ordenes_trabajo")
      .select(`
        ot_cuarteles(superficie_ha),
        ot_productos(consumo_total, dosis_unidad, producto:productos(nombre_comercial, precio_costo))
      `)
      .eq("empresa_id", eid)
      .eq("estado", "finalizada")
      .gte("fecha_aplicacion", desde);

    if (!data) return;

    const costoMap = new Map<string, Costo>();
    let totalHa = 0;

    for (const ot of data as unknown as {
      ot_cuarteles: { superficie_ha: number }[];
      ot_productos: { consumo_total: number | null; dosis_unidad: string; producto: { nombre_comercial: string; precio_costo: number | null } }[];
    }[]) {
      const supTotal = ot.ot_cuarteles.reduce((s, c) => s + c.superficie_ha, 0);
      totalHa += supTotal;

      for (const op of ot.ot_productos) {
        if (op.consumo_total == null) continue;
        const nombre = op.producto.nombre_comercial;
        const precio = op.producto.precio_costo;
        const costo = precio != null ? op.consumo_total * precio : null;
        const unidad = op.dosis_unidad.split("/")[0];

        const prev = costoMap.get(nombre);
        if (prev) {
          prev.consumo += op.consumo_total;
          prev.costo = (prev.costo ?? 0) + (costo ?? 0);
        } else {
          costoMap.set(nombre, { producto: nombre, consumo: op.consumo_total, unidad, precio, costo });
        }
      }
    }

    const top = Array.from(costoMap.values())
      .filter(c => c.costo != null && c.costo > 0)
      .sort((a, b) => (b.costo ?? 0) - (a.costo ?? 0))
      .slice(0, 5);

    const total = top.reduce((s, c) => s + (c.costo ?? 0), 0);
    const porHa = totalHa > 0 ? total / totalHa : 0;

    setCostos({ total, porHa, top });
  };

  const switchEmpresa = (eid: string) => {
    setEmpresaId(eid);
    router.push(`/dashboard?empresa=${eid}`);
    // No llamar loadData aquí — el useEffect lo dispara al cambiar empresaParam
  };

  const empresa = empresas.find(e => e.id === empresaId);
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Nav empresaId={empresaId} />
      <main style={container}>
        {/* Selector empresa */}
        <div style={empresaBar}>
          {empresas.map(e => (
            <button key={e.id} onClick={() => switchEmpresa(e.id)}
              style={{ ...empresaBtn, ...(e.id === empresaId ? empresaBtnActive : {}) }}>
              {e.nombre}
            </button>
          ))}
        </div>

        <div style={pageHeader}>
          <div>
            <h1 style={pageTitle}>{empresa?.nombre || "—"}</h1>
            <p style={pageSubtitle}>Panel de gestión fitosanitaria · v2</p>
          </div>
          {(isAdmin || isOperador) && (
            <Link href={`/ordenes/nueva?empresa=${empresaId}`} style={primaryBtn}>+ Nueva orden</Link>
          )}
        </div>

        {/* ── KPI bar ── */}
        <div style={kpiBar}>
          <div style={kpiCard}>
            <span style={kpiLabel}>Finalizadas {new Date().getFullYear()}</span>
            <span style={kpiValue}>{loading ? "—" : kpiFinalizadas}</span>
          </div>
          <div style={kpiCard}>
            <span style={kpiLabel}>OTs activas</span>
            <span style={kpiValue}>{loading ? "—" : ordenes.length}</span>
          </div>
          <div style={{ ...kpiCard, borderColor: borradores.length > 0 ? "#fde68a" : "#e5e7eb", background: borradores.length > 0 ? "#fffbeb" : "#fff" }}>
            <span style={kpiLabel}>Pendientes aprobación</span>
            <span style={{ ...kpiValue, color: borradores.length > 0 ? "#d97706" : "#9ca3af" }}>
              {loading ? "—" : borradores.length}
            </span>
          </div>
          <div style={{ ...kpiCard, borderColor: stockBajo.length > 0 ? "#fca5a5" : "#e5e7eb", background: stockBajo.length > 0 ? "#fef2f2" : "#fff" }}>
            <span style={kpiLabel}>Bajo stock</span>
            <span style={{ ...kpiValue, color: stockBajo.length > 0 ? "#dc2626" : "#9ca3af" }}>
              {loading ? "—" : stockBajo.length}
            </span>
          </div>
        </div>

        {loading ? (
          <p style={{ color: "#6b7280", marginTop: "20px" }}>Cargando...</p>
        ) : (
          <>
            {/* ── Panel carencias (ancho completo) ── */}
            {carencias.length > 0 && (
              <section style={{ ...panel, marginBottom: "20px" }}>
                <div style={panelHeader}>
                  <h2 style={panelTitle}>Carencias activas por cuartel</h2>
                  <Link href={`/cuaderno?empresa=${empresaId}`} style={linkMore}>Ver cuaderno →</Link>
                </div>
                <div style={carenciasGrid}>
                  {carencias.map((c, i) => {
                    const enCarencia = c.dias_restantes > 0;
                    const urgente = c.dias_restantes > 0 && c.dias_restantes <= 7;
                    const color = enCarencia ? (urgente ? "#d97706" : "#dc2626") : "#15803d";
                    const bg = enCarencia ? (urgente ? "#fffbeb" : "#fef2f2") : "#f0fdf4";
                    const border = enCarencia ? (urgente ? "#fde68a" : "#fca5a5") : "#bbf7d0";
                    const icon = enCarencia ? (urgente ? "🟡" : "🔴") : "🟢";
                    return (
                      <div key={i} style={{ ...carenciaCard, background: bg, borderColor: border }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <span style={{ fontWeight: 800, fontSize: "15px", color: "#1a4731" }}>
                            {icon} {c.cuartel_codigo}
                          </span>
                          <span style={{ fontSize: "11px", fontWeight: 700, color, background: `${color}18`, padding: "2px 8px", borderRadius: "999px" }}>
                            {enCarencia ? `${c.dias_restantes}d restantes` : "Habilitado"}
                          </span>
                        </div>
                        <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
                          {c.especie} {c.variedad}
                        </div>
                        <div style={{ fontSize: "12px", color: "#374151", marginTop: "6px", fontWeight: 600 }}>
                          {c.producto}
                        </div>
                        <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>
                          Cosecha viable: {new Date(c.fecha_viable + "T12:00:00").toLocaleDateString("es-CL")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── Próximas OTs (ancho completo) ── */}
            {proximas.length > 0 && (
              <section style={{ ...panel, marginBottom: "20px", borderColor: "#bfdbfe", background: "#eff6ff" }}>
                <div style={panelHeader}>
                  <h2 style={{ ...panelTitle, color: "#1e40af" }}>Próximas aplicaciones (14 días)</h2>
                  <Link href={`/ordenes?empresa=${empresaId}`} style={{ ...linkMore, color: "#1e40af" }}>Ver todas →</Link>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "10px" }}>
                  {proximas.map(ot => {
                    const hoyMs = Date.now();
                    const aplMs = new Date(ot.fecha_aplicacion! + "T12:00:00").getTime();
                    const dias = Math.ceil((aplMs - hoyMs) / 86400000);
                    const esHoy = dias === 0;
                    const esMañana = dias === 1;
                    const label = esHoy ? "Hoy" : esMañana ? "Mañana" : `En ${dias} días`;
                    const labelColor = dias <= 1 ? "#dc2626" : dias <= 3 ? "#d97706" : "#1e40af";
                    return (
                      <Link key={ot.id} href={`/ordenes/${ot.id}?empresa=${empresaId}`}
                        style={{ background: "#fff", borderRadius: "12px", border: "1.5px solid #bfdbfe", padding: "12px 14px", textDecoration: "none", display: "block" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                          <span style={{ fontWeight: 700, fontSize: "13px", color: "#1a4731" }}>OT #{ot.numero}</span>
                          <span style={{ fontSize: "11px", fontWeight: 700, color: labelColor, background: `${labelColor}18`, padding: "2px 8px", borderRadius: "999px" }}>
                            {label}
                          </span>
                        </div>
                        <div style={{ fontSize: "13px", color: "#374151", fontWeight: 600 }}>
                          {new Date(ot.fecha_aplicacion! + "T12:00:00").toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" })}
                        </div>
                        <div style={{ marginTop: "4px" }}>
                          <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: ESTADOS_OT_COLOR[ot.estado] + "20", color: ESTADOS_OT_COLOR[ot.estado], border: `1px solid ${ESTADOS_OT_COLOR[ot.estado]}40` }}>
                            {ESTADOS_OT[ot.estado]}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            <div style={grid}>
              {/* Borradores pendientes de aprobación (admin y operador) */}
              {(isAdmin || isOperador) && borradores.length > 0 && (
                <section style={{ ...panel, borderColor: "#fde68a", background: "#fffdf0" }}>
                  <div style={panelHeader}>
                    <h2 style={{ ...panelTitle, color: "#92400e" }}>
                      {isAdmin ? "Borradores por aprobar" : "Mis borradores"}
                    </h2>
                    <Link href={`/ordenes?empresa=${empresaId}`} style={linkMore}>Ver todas →</Link>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {borradores.map(ot => (
                      <Link key={ot.id} href={`/ordenes/${ot.id}?empresa=${empresaId}`} style={{ ...otRow, background: "#fefce8", borderColor: "#fde68a" }}>
                        <span style={otNum}>OT #{ot.numero}</span>
                        <span style={{ flex: 1, fontSize: "13px", color: "#374151" }}>
                          {ot.fecha_solicitud}
                          {ot.ot_cuarteles?.length > 0 && (
                            <span style={{ color: "#6b7280", marginLeft: "6px" }}>
                              — {ot.ot_cuarteles.map(c => c.cuartel?.codigo).filter(Boolean).join(", ")}
                            </span>
                          )}
                        </span>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: "#92400e", background: "#fef3c7", padding: "2px 8px", borderRadius: "999px", border: "1px solid #fde68a" }}>
                          {isAdmin ? "Aprobar →" : "Borrador"}
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {/* Órdenes activas */}
              <section style={panel}>
                <div style={panelHeader}>
                  <h2 style={panelTitle}>Órdenes activas</h2>
                  <Link href={`/ordenes?empresa=${empresaId}`} style={linkMore}>Ver todas →</Link>
                </div>
                {ordenes.length === 0 ? (
                  <p style={empty}>No hay órdenes emitidas o en ejecución.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {ordenes.map(ot => (
                      <Link key={ot.id} href={`/ordenes/${ot.id}?empresa=${empresaId}`} style={otRow}>
                        <span style={otNum}>OT #{ot.numero}</span>
                        <span style={{ flex: 1, fontSize: "13px", color: "#374151" }}>
                          {ot.fecha_aplicacion || ot.fecha_solicitud}
                        </span>
                        <span style={{
                          ...estadoPill,
                          background: ESTADOS_OT_COLOR[ot.estado] + "20",
                          color: ESTADOS_OT_COLOR[ot.estado],
                          border: `1px solid ${ESTADOS_OT_COLOR[ot.estado]}40`,
                        }}>
                          {ESTADOS_OT[ot.estado]}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </section>

              {/* Stock bajo */}
              <section style={panel}>
                <div style={panelHeader}>
                  <h2 style={panelTitle}>⚠ Stock bajo mínimo</h2>
                  <Link href={`/bodega?empresa=${empresaId}`} style={linkMore}>Ver bodega →</Link>
                </div>
                {stockBajo.length === 0 ? (
                  <p style={empty}>Sin alertas de stock.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {stockBajo.map(s => {
                      const min = (s.producto as unknown as { stock_minimo?: number })?.stock_minimo ?? 5;
                      return (
                        <div key={s.producto_id} style={stockRow}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "#111" }}>
                              {s.producto?.nombre_comercial || "—"}
                            </div>
                            <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>
                              Mínimo: {min} {s.producto?.unidad_dosis || "u"}
                            </div>
                          </div>
                          <span style={stockBadge}>
                            {Number(s.cantidad_disponible).toFixed(2)} {s.producto?.unidad_dosis || "u"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Costos temporada */}
              <section style={panel}>
                <div style={panelHeader}>
                  <h2 style={panelTitle}>Costos {new Date().getFullYear()}</h2>
                  <Link href={`/cuaderno?empresa=${empresaId}`} style={linkMore}>Detalle →</Link>
                </div>
                {costos.total === 0 && costos.top.length === 0 ? (
                  <div>
                    <p style={empty}>Sin datos de costo. Configurá el precio de los productos en el catálogo.</p>
                    <Link href="/productos" style={{ fontSize: "13px", color: "#1a4731", fontWeight: 600 }}>
                      Ir a Productos →
                    </Link>
                  </div>
                ) : (
                  <>
                    <div style={costoResumen}>
                      <div style={costoKpi}>
                        <span style={costoLabel}>Total temporada</span>
                        <span style={costoValor}>${costos.total.toLocaleString("es-CL", { maximumFractionDigits: 0 })}</span>
                      </div>
                      <div style={costoKpi}>
                        <span style={costoLabel}>Costo / ha</span>
                        <span style={costoValor}>${costos.porHa.toLocaleString("es-CL", { maximumFractionDigits: 0 })}</span>
                      </div>
                    </div>
                    {costos.top.length > 0 && (
                      <div style={{ marginTop: "14px" }}>
                        <p style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
                          Top productos por costo
                        </p>
                        {costos.top.map((c, i) => {
                          const pct = costos.total > 0 ? ((c.costo ?? 0) / costos.total) * 100 : 0;
                          return (
                            <div key={i} style={{ marginBottom: "8px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "3px" }}>
                                <span style={{ fontWeight: 600, color: "#374151" }}>{c.producto}</span>
                                <span style={{ color: "#1a4731", fontWeight: 700 }}>
                                  ${(c.costo ?? 0).toLocaleString("es-CL", { maximumFractionDigits: 0 })}
                                </span>
                              </div>
                              <div style={{ background: "#e5e7eb", borderRadius: "999px", height: "5px", overflow: "hidden" }}>
                                <div style={{ background: "#1a4731", height: "100%", width: `${pct}%`, borderRadius: "999px" }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>
          </>
        )}
      </main>
    </>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const container: React.CSSProperties     = { maxWidth: "1300px", margin: "0 auto", padding: "28px 20px" };
const kpiBar: React.CSSProperties        = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "24px" };
const kpiCard: React.CSSProperties       = { background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: "14px", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "6px" };
const kpiLabel: React.CSSProperties      = { fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" };
const kpiValue: React.CSSProperties      = { fontSize: "32px", fontWeight: 800, color: "#1a4731", lineHeight: 1 };
const empresaBar: React.CSSProperties    = { display: "flex", gap: "8px", marginBottom: "22px", flexWrap: "wrap" };
const empresaBtn: React.CSSProperties    = { padding: "8px 18px", borderRadius: "999px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "13px", cursor: "pointer" };
const empresaBtnActive: React.CSSProperties = { background: "#1a4731", border: "1.5px solid #1a4731", color: "#fff" };
const pageHeader: React.CSSProperties   = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "12px" };
const pageTitle: React.CSSProperties    = { fontSize: "28px", fontWeight: 800, color: "#1a4731" };
const pageSubtitle: React.CSSProperties = { fontSize: "14px", color: "#6b7280", marginTop: "4px" };
const primaryBtn: React.CSSProperties   = { padding: "10px 20px", borderRadius: "10px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "14px", textDecoration: "none" };
const grid: React.CSSProperties         = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "20px" };
const panel: React.CSSProperties        = { background: "#fff", borderRadius: "16px", padding: "20px", border: "1px solid #e5e7eb", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" };
const panelHeader: React.CSSProperties  = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" };
const panelTitle: React.CSSProperties   = { fontSize: "16px", fontWeight: 700, color: "#1a4731" };
const linkMore: React.CSSProperties     = { fontSize: "13px", color: "#1a4731", fontWeight: 600, textDecoration: "none" };
const empty: React.CSSProperties        = { fontSize: "14px", color: "#9ca3af", padding: "12px 0" };
const carenciasGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px" };
const carenciaCard: React.CSSProperties = { borderRadius: "12px", border: "1.5px solid", padding: "12px 14px" };
const otRow: React.CSSProperties        = { display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "10px", background: "#f9fafb", border: "1px solid #f3f4f6", textDecoration: "none" };
const otNum: React.CSSProperties        = { fontWeight: 700, fontSize: "13px", color: "#1a4731", whiteSpace: "nowrap" };
const estadoPill: React.CSSProperties   = { padding: "3px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 700, whiteSpace: "nowrap" };
const stockRow: React.CSSProperties     = { display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "10px", background: "#fef9f0", border: "1px solid #fed7aa" };
const stockBadge: React.CSSProperties   = { padding: "3px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 700, background: "#dc262610", color: "#dc2626", border: "1px solid #fca5a5", whiteSpace: "nowrap" };
const costoResumen: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "4px" };
const costoKpi: React.CSSProperties     = { background: "#f0fdf4", borderRadius: "10px", padding: "12px", display: "flex", flexDirection: "column", gap: "4px" };
const costoLabel: React.CSSProperties   = { fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em" };
const costoValor: React.CSSProperties   = { fontSize: "20px", fontWeight: 800, color: "#1a4731" };

export default function DashboardPage() { return <Suspense><DashboardContent /></Suspense>; }
