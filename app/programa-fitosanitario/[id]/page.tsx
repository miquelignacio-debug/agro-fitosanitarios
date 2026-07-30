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
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState("");
  const [toggleSaving, setToggleSaving] = useState(false);

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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", margin: "16px 0" }}>
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