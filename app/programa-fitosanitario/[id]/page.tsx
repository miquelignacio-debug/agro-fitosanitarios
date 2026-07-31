"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import { useEmpresa } from "@/lib/useEmpresa";
import { useRol } from "@/lib/useRol";

// ── Tipos ────────────────────────────────────────────────────────────────────
type Linea = {
  id: string;
  objetivo: string | null;
  producto_id: string | null;
  producto_nombre: string;
  dosis_valor: number | null;
  dosis_unidad: string;
  destacado: boolean;
  orden: number;
};

type Etapa = {
  id: string;
  numero: number;
  etapa_fenologica: string;
  mojamiento_ltha: number | null;
  notas: string | null;
  programa_etapa_lineas: Linea[];
};

type Programa = {
  id: string;
  nombre: string;
  temporada: string;
  activo: boolean;
  notas: string | null;
  empresa_id: string;
  programa_cuarteles: {
    cuartel_id: string;
    cuartel: { codigo: string; especie: string; campo: { nombre: string } | null } | null;
  }[];
  programa_etapas: Etapa[];
};

type OTPrograma = {
  id: string;
  numero: number;
  estado: string;
  fecha_aplicacion: string | null;
  es_adicional_programa: boolean;
  programa_etapa_id: string;
  ot_cuarteles: { cuartel_id: string }[];
  ot_productos: { producto_id: string | null; dosis_real: number | null; dosis_unidad: string }[];
};

function getCellState(
  etapa: Etapa,
  cuartelId: string,
  ots: OTPrograma[],
): { status: "applied" | "deviated" | "scheduled" | "none"; otNumero?: number; otId?: string } {
  const relevant = ots.filter(
    o => o.programa_etapa_id === etapa.id &&
         !o.es_adicional_programa &&
         o.estado !== "anulada" && o.estado !== "borrador" &&
         o.ot_cuarteles.some(c => c.cuartel_id === cuartelId),
  );
  if (relevant.length === 0) return { status: "none" };

  const finalizada = relevant.find(o => o.estado === "finalizada");
  if (finalizada) {
    const planIds = etapa.programa_etapa_lineas.filter(l => l.producto_id).map(l => l.producto_id!);
    const otIds   = new Set(finalizada.ot_productos.map(p => p.producto_id).filter(Boolean));
    const hasDeviation = planIds.some(pid => !otIds.has(pid));
    return { status: hasDeviation ? "deviated" : "applied", otNumero: finalizada.numero, otId: finalizada.id };
  }

  const best = relevant[0];
  return { status: "scheduled", otNumero: best.numero, otId: best.id };
}

function formatDosisUnidad(u: string) {
  return u.replace("/100lt", "/HL");
}

function ProgramaDetalleContent() {
  const router = useRouter();
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : params.id?.[0] ?? "";
  const { empresaId } = useEmpresa();
  const { isSuperAdmin, rol } = useRol();

  const [programa, setPrograma] = useState<Programa | null>(null);
  const [otsData,  setOtsData]  = useState<OTPrograma[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState("");
  const [toggleSaving,  setToggleSaving]  = useState(false);
  const [vincularEtapa,  setVincularEtapa]  = useState<Etapa | null>(null);
  const [otsBusqueda,    setOtsBusqueda]    = useState<{ id: string; numero: number; fecha_aplicacion: string | null; estado: string }[]>([]);
  const [otsVinculadas,  setOtsVinculadas]  = useState<{ id: string; numero: number; fecha_aplicacion: string | null; estado: string }[]>([]);
  const [otFiltro,       setOtFiltro]       = useState("");
  const [vincularSaving, setVincularSaving] = useState(false);

  useEffect(() => {
    if (!id || !empresaId || rol === null) return;
    if (!isSuperAdmin) { router.push("/dashboard"); return; }
    const load = async () => {
      const { data, error } = await supabase
        .from("programas_fitosanitarios")
        .select(`
          id, nombre, temporada, activo, notas, empresa_id,
          programa_cuarteles(cuartel_id, cuartel:cuarteles(codigo, especie, campo:campos(nombre))),
          programa_etapas(
            id, numero, etapa_fenologica, mojamiento_ltha, notas,
            programa_etapa_lineas(id, objetivo, producto_id, producto_nombre, dosis_valor, dosis_unidad, destacado, orden)
          )
        `)
        .eq("id", id)
        .eq("empresa_id", empresaId)
        .single();
      if (error || !data) { router.push("/programa-fitosanitario"); return; }
      const prog = data as unknown as Programa;
      prog.programa_etapas = prog.programa_etapas
        .sort((a, b) => a.numero - b.numero)
        .map((e) => ({
          ...e,
          programa_etapa_lineas: [...e.programa_etapa_lineas].sort((a, b) => a.orden - b.orden),
        }));
      setPrograma(prog);
      // Query OTs vinculadas a las etapas de este programa
      const etapaIds = prog.programa_etapas.map(e => e.id);
      if (etapaIds.length > 0) {
        const { data: otsRaw } = await supabase
          .from("ordenes_trabajo")
          .select("id, numero, estado, fecha_aplicacion, es_adicional_programa, programa_etapa_id, ot_cuarteles(cuartel_id), ot_productos(producto_id, dosis_real, dosis_unidad)")
          .in("programa_etapa_id", etapaIds);
        setOtsData((otsRaw as unknown as OTPrograma[]) || []);
      }
      setLoading(false);
    };
    load();
  }, [id, empresaId, rol, isSuperAdmin, router]);

  const handleToggleActivo = async () => {
    if (!programa) return;
    setToggleSaving(true);
    await supabase.from("programas_fitosanitarios").update({ activo: !programa.activo }).eq("id", programa.id);
    setPrograma((p) => p ? { ...p, activo: !p.activo } : p);
    setToggleSaving(false);
  };

  const handleEliminar = async () => {
    if (!programa) return;
    if (!window.confirm(`¿Eliminar el programa "${programa.nombre}"? Esta acción no se puede deshacer.`)) return;
    setDeletingId(programa.id);
    await supabase.from("programas_fitosanitarios").delete().eq("id", programa.id);
    router.push("/programa-fitosanitario");
  };

  const refreshOts = async (prog: Programa) => {
    const ids = prog.programa_etapas.map(e => e.id);
    if (!ids.length) return;
    const { data } = await supabase
      .from("ordenes_trabajo")
      .select("id, numero, estado, fecha_aplicacion, es_adicional_programa, programa_etapa_id, ot_cuarteles(cuartel_id), ot_productos(producto_id, dosis_real, dosis_unidad)")
      .in("programa_etapa_id", ids);
    setOtsData((data as unknown as OTPrograma[]) || []);
  };

  const abrirVincular = async (etapa: Etapa) => {
    if (!programa) return;
    setVincularEtapa(etapa);
    setOtFiltro("");
    const [{ data: libres }, { data: vinculadas }] = await Promise.all([
      supabase.from("ordenes_trabajo").select("id, numero, fecha_aplicacion, estado").eq("empresa_id", programa.empresa_id).is("programa_etapa_id", null).order("numero", { ascending: false }).limit(200),
      supabase.from("ordenes_trabajo").select("id, numero, fecha_aplicacion, estado").eq("programa_etapa_id", etapa.id).order("numero", { ascending: false }),
    ]);
    setOtsBusqueda((libres as unknown as typeof otsBusqueda) || []);
    setOtsVinculadas((vinculadas as unknown as typeof otsVinculadas) || []);
  };

  const handleVincularOT = async (otId: string) => {
    if (!vincularEtapa || !programa) return;
    setVincularSaving(true);
    await supabase.from("ordenes_trabajo").update({ programa_etapa_id: vincularEtapa.id }).eq("id", otId);
    await refreshOts(programa);
    // Mover OT del panel libre al panel vinculado
    const ot = otsBusqueda.find(o => o.id === otId);
    if (ot) {
      setOtsBusqueda(prev => prev.filter(o => o.id !== otId));
      setOtsVinculadas(prev => [ot, ...prev]);
    }
    setVincularSaving(false);
  };

  const handleDesvincularOT = async (otId: string) => {
    if (!programa) return;
    setVincularSaving(true);
    await supabase.from("ordenes_trabajo").update({ programa_etapa_id: null }).eq("id", otId);
    await refreshOts(programa);
    // Mover OT del panel vinculado al panel libre
    const ot = otsVinculadas.find(o => o.id === otId);
    if (ot) {
      setOtsVinculadas(prev => prev.filter(o => o.id !== otId));
      setOtsBusqueda(prev => [ot, ...prev]);
    }
    setVincularSaving(false);
  };

  if (isSuperAdmin === null || loading) {
    return (
      <>
        <Nav />
        <main style={container}><p style={{ color: "#6b7280" }}>Cargando...</p></main>
      </>
    );
  }

  if (!programa) return null;

  // Agrupar cuarteles por campo
  const cuartelesPorCampo: Record<string, typeof programa.programa_cuarteles> = {};
  programa.programa_cuarteles.forEach((pc) => {
    const key = pc.cuartel?.campo?.nombre ?? "Sin campo";
    if (!cuartelesPorCampo[key]) cuartelesPorCampo[key] = [];
    cuartelesPorCampo[key].push(pc);
  });

  return (
    <>
      <Nav />
      <main style={container}>
        {/* ── Header ── */}
        <div style={{ marginBottom: "24px" }}>
          <Link href="/programa-fitosanitario" style={backLink}>← Programas</Link>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginTop: "8px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <h1 style={pageTitle}>{programa.nombre}</h1>
                <span style={{
                  padding: "3px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: 700,
                  background: programa.activo ? "#dcfce7" : "#f3f4f6",
                  color: programa.activo ? "#15803d" : "#6b7280",
                }}>
                  {programa.activo ? "Activo" : "Inactivo"}
                </span>
              </div>
              <p style={{ fontSize: "14px", color: "#6b7280", marginTop: "4px" }}>Temporada {programa.temporada}</p>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <Link href={`/programa-fitosanitario/${programa.id}/editar`} style={{ ...secBtn, textDecoration: "none", display: "inline-block" }}>
                ✏ Editar
              </Link>
              <button onClick={handleToggleActivo} disabled={toggleSaving} style={secBtn}>
                {toggleSaving ? "..." : programa.activo ? "Desactivar" : "Activar"}
              </button>
              <button
                onClick={handleEliminar}
                disabled={!!deletingId}
                style={{ ...secBtn, color: "#dc2626", borderColor: "#fca5a5" }}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>

        {/* ── Cuarteles ── */}
        <div style={card}>
          <h2 style={sectionTitle}>Cuarteles</h2>
          {Object.keys(cuartelesPorCampo).length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: "13px" }}>Sin cuarteles asociados</p>
          ) : (
            Object.entries(cuartelesPorCampo).map(([campo, list]) => (
              <div key={campo} style={{ marginBottom: "10px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", marginRight: "8px" }}>{campo}</span>
                <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "6px" }}>
                  {list.map((pc) => (
                    <span key={pc.cuartel_id} style={cuartelChip}>
                      {pc.cuartel?.codigo ?? "—"}
                      {pc.cuartel?.especie ? ` · ${pc.cuartel.especie}` : ""}
                    </span>
                  ))}
                </span>
              </div>
            ))
          )}
          {programa.notas && (
            <p style={{ marginTop: "12px", fontSize: "13px", color: "#374151", fontStyle: "italic" }}>{programa.notas}</p>
          )}
        </div>

        {/* ── Resumen estadístico ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "12px", margin: "16px 0" }}>
          {[
            { label: "Etapas", value: programa.programa_etapas.length },
            { label: "Cuarteles", value: programa.programa_cuarteles.length },
            { label: "Productos totales", value: programa.programa_etapas.reduce((s, e) => s + e.programa_etapa_lineas.length, 0) },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "16px 20px", textAlign: "center" }}>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#1a4731" }}>{value}</div>
              <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* ── Dashboard de progreso ── */}
        <div style={{ marginTop: "20px" }}>
          <h2 style={{ fontSize: "17px", fontWeight: 800, color: "#1a4731", marginBottom: "14px" }}>Dashboard de progreso</h2>

          {programa.programa_etapas.length === 0 || programa.programa_cuarteles.length === 0 ? (
            <div style={{ ...card, color: "#6b7280", textAlign: "center", padding: "32px", fontSize: "14px" }}>
              Cargá etapas y cuarteles para ver el progreso.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {programa.programa_etapas.map(etapa => {
                const cuartelIds   = programa.programa_cuarteles.map(pc => pc.cuartel_id);
                const adicionales  = otsData.filter(o => o.programa_etapa_id === etapa.id && o.es_adicional_programa);
                const aplicados    = cuartelIds.filter(cid => { const s = getCellState(etapa, cid, otsData); return s.status === "applied" || s.status === "deviated"; });
                const conDevio     = cuartelIds.filter(cid => getCellState(etapa, cid, otsData).status === "deviated");
                const pct          = cuartelIds.length ? Math.round((aplicados.length / cuartelIds.length) * 100) : 0;

                return (
                  <div key={etapa.id} style={{ ...card, borderLeft: "4px solid #1a4731", padding: "16px 20px" }}>
                    {/* Header etapa */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={etapaNumBadge}>{etapa.numero}</div>
                        <div>
                          <div style={{ fontWeight: 700, color: "#1a4731", fontSize: "14px" }}>{etapa.etapa_fenologica}</div>
                          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "1px" }}>
                            {aplicados.length}/{cuartelIds.length} cuarteles aplicados
                            {conDevio.length > 0 && ` · ${conDevio.length} con desvíos`}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ width: "100px", height: "6px", background: "#e5e7eb", borderRadius: "3px", overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "#15803d" : "#1a4731", borderRadius: "3px", transition: "width 0.3s" }} />
                        </div>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: "#1a4731", minWidth: "34px" }}>{pct}%</span>
                      </div>
                    </div>

                    {/* Chips cuarteles */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {programa.programa_cuarteles.map(pc => {
                        const cell   = getCellState(etapa, pc.cuartel_id, otsData);
                        const codigo = pc.cuartel?.codigo ?? "—";
                        const base: React.CSSProperties = { padding: "4px 10px", borderRadius: "8px", fontSize: "12px", fontWeight: 700, textDecoration: "none", display: "inline-block", cursor: cell.otId ? "pointer" : "default" };
                        const colors: React.CSSProperties =
                          cell.status === "applied"   ? { background: "#dcfce7", color: "#15803d", border: "1px solid #86efac" } :
                          cell.status === "deviated"  ? { background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d" } :
                          cell.status === "scheduled" ? { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" } :
                                                        { background: "#f9fafb", color: "#9ca3af", border: "1px solid #e5e7eb" };
                        const icon = cell.status === "applied" ? "✓" : cell.status === "deviated" ? "⚠" : cell.status === "scheduled" ? "⏳" : "·";
                        const title = cell.status === "deviated" ? `OT #${cell.otNumero} — productos con desvíos` : cell.otId ? `OT #${cell.otNumero}` : "Sin OT";
                        return cell.otId ? (
                          <Link key={pc.cuartel_id} href={`/ordenes/${cell.otId}`} style={{ ...base, ...colors }} title={title}>
                            {icon} {codigo}
                          </Link>
                        ) : (
                          <span key={pc.cuartel_id} style={{ ...base, ...colors }}>{icon} {codigo}</span>
                        );
                      })}
                    </div>

                    {/* OTs adicionales */}
                    {adicionales.length > 0 && (
                      <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px solid #f3f4f6" }}>
                        <span style={{ fontSize: "11px", color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em" }}>Adicionales:</span>
                        <span style={{ display: "inline-flex", gap: "6px", marginLeft: "8px", flexWrap: "wrap" }}>
                          {adicionales.map(o => (
                            <Link key={o.id} href={`/ordenes/${o.id}`} style={{ fontSize: "12px", color: "#7c3aed", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: "6px", padding: "2px 8px", textDecoration: "none" }}>
                              OT #{o.numero}
                            </Link>
                          ))}
                        </span>
                      </div>
                    )}
                    <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px solid #f3f4f6" }}>
                      <button onClick={() => abrirVincular(etapa)} style={{ fontSize: "12px", color: "#1a4731", background: "transparent", border: "1.5px dashed #1a4731", borderRadius: "7px", padding: "4px 12px", cursor: "pointer", fontWeight: 600 }}>
                        + Vincular OT existente
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Leyenda */}
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginTop: "10px", fontSize: "12px", color: "#6b7280" }}>
            <span style={{ color: "#15803d", fontWeight: 600 }}>✓ Aplicado</span>
            <span style={{ color: "#92400e", fontWeight: 600 }}>⚠ Con desvíos</span>
            <span style={{ color: "#1d4ed8", fontWeight: 600 }}>⏳ Emitida / en proceso</span>
            <span>· Sin OT</span>
          </div>
        </div>

        {/* ── Etapas ── */}
        <div style={{ marginTop: "8px" }}>
          <h2 style={{ fontSize: "17px", fontWeight: 800, color: "#1a4731", marginBottom: "14px" }}>Etapas fenológicas</h2>

          {programa.programa_etapas.length === 0 ? (
            <div style={{ ...card, textAlign: "center", padding: "40px", color: "#6b7280" }}>Sin etapas cargadas</div>
          ) : (
            programa.programa_etapas.map((etapa) => (
              <div key={etapa.id} style={{ ...card, marginBottom: "16px", borderLeft: "4px solid #1a4731" }}>
                {/* Etapa header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px", marginBottom: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={etapaNumBadge}>{etapa.numero}</div>
                    <div>
                      <div style={{ fontSize: "16px", fontWeight: 800, color: "#1a4731" }}>{etapa.etapa_fenologica}</div>
                      {etapa.mojamiento_ltha != null && (
                        <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>
                          Mojamiento: <strong>{etapa.mojamiento_ltha.toLocaleString("es-CL")} lt/ha</strong>
                        </div>
                      )}
                    </div>
                  </div>

                  <Link
                    href={`/ordenes/nueva?etapa_id=${etapa.id}`}
                    style={crearOtBtn}
                  >
                    Crear OT desde esta etapa →
                  </Link>
                </div>

                {etapa.notas && (
                  <p style={{ fontSize: "12px", color: "#6b7280", fontStyle: "italic", marginBottom: "10px" }}>{etapa.notas}</p>
                )}

                {/* Tabla lineas */}
                {etapa.programa_etapa_lineas.length === 0 ? (
                  <p style={{ fontSize: "13px", color: "#6b7280" }}>Sin productos cargados</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                      <thead>
                        <tr style={{ background: "#f9fafb" }}>
                          <th style={th}>Objetivo</th>
                          <th style={th}>Producto</th>
                          <th style={{ ...th, textAlign: "right" }}>Dosis</th>
                          <th style={th}>Unidad</th>
                          <th style={{ ...th, width: "60px", textAlign: "center" }}>Dest.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {etapa.programa_etapa_lineas.map((l) => (
                          <tr
                            key={l.id}
                            style={{
                              borderBottom: "1px solid #f3f4f6",
                              background: l.destacado ? "#fffbeb" : "transparent",
                            }}
                          >
                            <td style={td}>{l.objetivo ?? "—"}</td>
                            <td style={td}>
                              <span style={{ fontWeight: l.destacado ? 700 : 500 }}>{l.producto_nombre}</span>
                              {l.producto_id && (
                                <span style={{ marginLeft: "6px", fontSize: "10px", color: "#059669", fontWeight: 700, background: "#f0fdf4", padding: "1px 5px", borderRadius: "4px" }}>
                                  ✓ catálogo
                                </span>
                              )}
                            </td>
                            <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>
                              {l.dosis_valor != null ? l.dosis_valor.toLocaleString("es-CL") : "—"}
                            </td>
                            <td style={td}>{formatDosisUnidad(l.dosis_unidad)}</td>
                            <td style={{ ...td, textAlign: "center" }}>
                              {l.destacado ? <span title="Destacado">⭐</span> : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Botón imprimir / exportar */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", paddingBottom: "40px", marginTop: "8px" }}>
          <button onClick={() => window.print()} style={secBtn}>
            🖨 Imprimir programa
          </button>
        </div>
        {/* ── Modal: Vincular / Desvincular OTs ── */}
        {vincularEtapa && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}>
            <div style={{ background: "#fff", borderRadius: "16px", padding: "28px", width: "90%", maxWidth: "520px", boxShadow: "0 8px 32px rgba(0,0,0,0.2)", maxHeight: "85vh", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: 800, color: "#1a4731", marginBottom: "2px" }}>
                  Etapa {vincularEtapa.numero} — {vincularEtapa.etapa_fenologica}
                </h3>
                <p style={{ fontSize: "12px", color: "#6b7280" }}>Hacé clic en una OT para vincularla o desvincularla.</p>
              </div>

              {/* OTs ya vinculadas a esta etapa */}
              {otsVinculadas.length > 0 && (
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                    Vinculadas a esta etapa
                  </div>
                  <div style={{ border: "1px solid #bbf7d0", borderRadius: "10px", overflow: "hidden", maxHeight: "220px", overflowY: "auto" }}>
                    {otsVinculadas.map(o => (
                      <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #f0fdf4", gap: "10px" }}>
                        <span style={{ fontWeight: 700, fontSize: "14px", color: "#15803d" }}>OT #{o.numero}</span>
                        <span style={{ fontSize: "12px", color: "#6b7280", flex: 1 }}>
                          {o.fecha_aplicacion ? new Date(o.fecha_aplicacion + "T12:00:00").toLocaleDateString("es-CL") : "Sin fecha"}
                        </span>
                        <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "999px", background: "#dcfce7", color: "#15803d" }}>
                          {o.estado}
                        </span>
                        <button
                          onClick={() => handleDesvincularOT(o.id)}
                          disabled={vincularSaving}
                          style={{ fontSize: "12px", color: "#dc2626", background: "transparent", border: "1px solid #fca5a5", borderRadius: "6px", padding: "3px 10px", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
                        >
                          Desvincular
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* OTs libres para vincular */}
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                  Agregar OT a esta etapa
                </div>
                <input
                  value={otFiltro}
                  onChange={e => setOtFiltro(e.target.value)}
                  placeholder="Filtrar por número..."
                  style={{ padding: "9px 12px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "14px", marginBottom: "8px", width: "100%", boxSizing: "border-box" }}
                />
                <div style={{ overflowY: "auto", flex: 1, border: "1px solid #e5e7eb", borderRadius: "10px" }}>
                  {otsBusqueda.filter(o => !otFiltro || String(o.numero).includes(otFiltro)).length === 0 ? (
                    <p style={{ padding: "20px", textAlign: "center", color: "#9ca3af", fontSize: "13px" }}>Sin OTs sin vincular</p>
                  ) : (
                    otsBusqueda
                      .filter(o => !otFiltro || String(o.numero).includes(otFiltro))
                      .map(o => (
                        <button
                          key={o.id}
                          onClick={() => handleVincularOT(o.id)}
                          disabled={vincularSaving}
                          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "10px 14px", background: "none", border: "none", borderBottom: "1px solid #f3f4f6", cursor: "pointer", textAlign: "left", gap: "10px" }}
                        >
                          <span style={{ fontWeight: 700, fontSize: "14px", color: "#1a4731" }}>OT #{o.numero}</span>
                          <span style={{ fontSize: "12px", color: "#6b7280", flex: 1 }}>
                            {o.fecha_aplicacion ? new Date(o.fecha_aplicacion + "T12:00:00").toLocaleDateString("es-CL") : "Sin fecha"}
                          </span>
                          <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "999px", background: o.estado === "finalizada" ? "#dcfce7" : "#f3f4f6", color: o.estado === "finalizada" ? "#15803d" : "#6b7280" }}>
                            {o.estado}
                          </span>
                        </button>
                      ))
                  )}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button onClick={() => setVincularEtapa(null)} style={{ padding: "8px 20px", borderRadius: "8px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

export default function ProgramaDetallePage() {
  return <Suspense><ProgramaDetalleContent /></Suspense>;
}

// ── Estilos ──────────────────────────────────────────────────────────────────
const container: React.CSSProperties = { maxWidth: "1000px", margin: "0 auto", padding: "28px 20px" };
const pageTitle: React.CSSProperties = { fontSize: "24px", fontWeight: 800, color: "#1a4731" };
const card: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: "14px", padding: "20px 24px" };
const sectionTitle: React.CSSProperties = { fontSize: "12px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" };
const cuartelChip: React.CSSProperties = { background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0", borderRadius: "6px", padding: "2px 10px", fontSize: "12px", fontWeight: 600 };
const etapaNumBadge: React.CSSProperties = { background: "#1a4731", color: "#fff", borderRadius: "50%", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "14px", flexShrink: 0 };
const crearOtBtn: React.CSSProperties = { background: "#1a4731", color: "#fff", padding: "8px 16px", borderRadius: "8px", fontWeight: 700, fontSize: "13px", textDecoration: "none", display: "inline-block", whiteSpace: "nowrap" };
const th: React.CSSProperties = { padding: "8px 10px", textAlign: "left", fontWeight: 700, fontSize: "11px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e5e7eb" };
const td: React.CSSProperties = { padding: "9px 10px", color: "#374151" };
const backLink: React.CSSProperties = { color: "#6b7280", fontSize: "13px", fontWeight: 600, textDecoration: "none" };
const secBtn: React.CSSProperties = { background: "#fff", border: "1.5px solid #d1d5db", color: "#374151", padding: "7px 16px", borderRadius: "8px", fontWeight: 600, fontSize: "13px", cursor: "pointer" };