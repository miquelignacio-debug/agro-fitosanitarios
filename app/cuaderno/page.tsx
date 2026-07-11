"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import { generateSAGPdf } from "@/lib/generateSAGPdf";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type OTRaw = {
  id: string;
  numero: number;
  estado: string;
  fecha_aplicacion: string | null;
  mojamiento_real_ltha: number | null;
  viento_kmh: number | null;
  temperatura_c: number | null;
  plagas_objetivo: string | null;
  objetivo_principal: string | null;
  empresa: { nombre: string } | null;
  solicitante: { nombre: string } | null;
  responsable: { nombre: string } | null;
  dosificador: { nombre: string } | null;
  ot_cuarteles: {
    superficie_ha: number;
    cuartel: { codigo: string; especie: string; variedad: string; patron: string | null } | null;
  }[];
  ot_aplicadores: {
    personal: { nombre: string } | null;
    operador: { nombre: string } | null;
    tractor: { codigo: string } | null;
    pulverizador: { codigo: string } | null;
  }[];
  ot_productos: {
    dosis_real: number;
    dosis_unidad: string;
    carencia_dias: number;
    rei_horas: number;
    fecha_viable: string | null;
    consumo_total: number | null;
    producto: { nombre_comercial: string; ingrediente_activo: string | null; concentracion_ia: string | null; formulacion: string | null } | null;
  }[];
};

type Fila = {
  fecha: string;
  numero: number;
  estado: string;
  empresa: string;
  cuartel: string;
  especie: string;
  variedad: string;
  patron: string;
  sup_cuartel: number;
  sup_total: number;
  producto: string;
  ia: string;
  concentracion_ia: string;
  formulacion: string;
  dosis_real: number;
  unidad_dosis: string;
  consumo_ot: number | null;
  consumo_cuartel: number | null;
  carencia: number;
  reingreso: number;
  fecha_viable: string;
  mojamiento_real: number | null;
  aplicador: string;
  tractor: string;
  pulverizador: string;
  viento: number | null;
  temperatura: number | null;
  objetivo: string;
  solicitante: string;
  responsable: string;
  dosificador: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("es-CL", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function flattenOTs(ots: OTRaw[]): Fila[] {
  const rows: Fila[] = [];
  for (const ot of ots) {
    const supTotal = ot.ot_cuarteles.reduce((s, c) => s + c.superficie_ha, 0);
    for (const oc of ot.ot_cuarteles) {
      if (!oc.cuartel) continue;
      for (const op of ot.ot_productos) {
        if (!op.producto) continue;
        const consumoCuartel =
          op.consumo_total !== null && supTotal > 0
            ? Math.round((op.consumo_total * oc.superficie_ha / supTotal) * 1000) / 1000
            : null;
        rows.push({
          fecha: ot.fecha_aplicacion ?? "",
          numero: ot.numero,
          estado: ot.estado,
          empresa: ot.empresa?.nombre ?? "",
          cuartel: oc.cuartel.codigo,
          especie: oc.cuartel.especie,
          variedad: oc.cuartel.variedad,
          patron: oc.cuartel.patron ?? "",
          sup_cuartel: oc.superficie_ha,
          sup_total: supTotal,
          producto: op.producto.nombre_comercial,
          ia: op.producto.ingrediente_activo ?? "",
          concentracion_ia: op.producto.concentracion_ia ?? "",
          formulacion: op.producto.formulacion ?? "",
          dosis_real: op.dosis_real,
          unidad_dosis: op.dosis_unidad,
          consumo_ot: op.consumo_total,
          consumo_cuartel: consumoCuartel,
          carencia: op.carencia_dias,
          reingreso: op.rei_horas,
          fecha_viable: op.fecha_viable ?? "",
          mojamiento_real: ot.mojamiento_real_ltha,
          aplicador: ot.ot_aplicadores.map(a => a.personal?.nombre ?? a.operador?.nombre ?? "").filter(Boolean).join(", "),
          tractor: ot.ot_aplicadores.map(a => a.tractor?.codigo ?? "").filter(Boolean).join(", "),
          pulverizador: ot.ot_aplicadores.map(a => a.pulverizador?.codigo ?? "").filter(Boolean).join(", "),
          viento: ot.viento_kmh,
          temperatura: ot.temperatura_c,
          objetivo: [ot.plagas_objetivo, ot.objetivo_principal].filter(Boolean).join(" — "),
          solicitante: ot.solicitante?.nombre ?? "",
          responsable: ot.responsable?.nombre ?? "",
          dosificador: ot.dosificador?.nombre ?? "",
        });
      }
    }
  }
  return rows.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

// ── Componente principal ───────────────────────────────────────────────────────

function CuadernoContent() {
  const searchParams = useSearchParams();
  const empresa = searchParams.get("empresa") || "";

  const [filas, setFilas] = useState<Fila[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filtros
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [filtroCuartel, setFiltroCuartel] = useState("");
  const [filtroProducto, setFiltroProducto] = useState("");
  const [soloFinalizadas, setSoloFinalizadas] = useState(false);

  useEffect(() => {
    if (!empresa) { setLoading(false); return; }
    load();
  }, [empresa]);

  const load = async () => {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase
      .from("ordenes_trabajo")
      .select(`
        id, numero, estado, fecha_aplicacion, mojamiento_real_ltha, viento_kmh, temperatura_c, plagas_objetivo, objetivo_principal,
        empresa:empresas(nombre),
        solicitante:personal!solicitante_id(nombre),
        responsable:personal!responsable_id(nombre),
        dosificador:personal!dosificador_id(nombre),
        ot_cuarteles(
          superficie_ha,
          cuartel:cuarteles(codigo, especie, variedad, patron)
        ),
        ot_aplicadores(
          personal:personal!personal_id(nombre),
          operador:operadores(nombre),
          tractor:maquinaria!tractor_id(codigo),
          pulverizador:maquinaria!pulverizador_id(codigo)
        ),
        ot_productos(
          dosis_real, dosis_unidad, carencia_dias, rei_horas, fecha_viable, consumo_total,
          producto:productos(nombre_comercial, ingrediente_activo, concentracion_ia, formulacion)
        )
      `)
      .eq("empresa_id", empresa)
      .neq("estado", "anulada")
      .order("fecha_aplicacion", { ascending: false });

    setLoading(false);
    if (err) { setError(err.message); return; }
    setFilas(flattenOTs((data as unknown as OTRaw[]) || []));
  };

  // Opciones únicas para filtros
  const cuarteles = useMemo(() => [...new Set(filas.map(f => f.cuartel))].sort(), [filas]);
  const productos = useMemo(() => [...new Set(filas.map(f => f.producto))].sort(), [filas]);

  // Filas filtradas
  const filtered = useMemo(() => filas.filter(f => {
    if (soloFinalizadas && f.estado !== "finalizada") return false;
    if (desde && f.fecha < desde) return false;
    if (hasta && f.fecha > hasta) return false;
    if (filtroCuartel && f.cuartel !== filtroCuartel) return false;
    if (filtroProducto && f.producto !== filtroProducto) return false;
    return true;
  }), [filas, desde, hasta, filtroCuartel, filtroProducto, soloFinalizadas]);

  // ── Excel export ──────────────────────────────────────────────────────────
  const exportar = async () => {
    const { utils, writeFile } = await import("xlsx");
    const encabezados = [
      "Fecha Aplicación", "OT N°", "Estado", "Empresa",
      "Cuartel", "Especie", "Variedad", "Patrón",
      "Sup. Cuartel (ha)", "Sup. Total OT (ha)",
      "Producto", "Ingrediente Activo", "Formulación",
      "Dosis Real", "Unidad Dosis",
      "Consumo Total OT", "Consumo Est. Cuartel",
      "Carencia (días)", "Reingreso (h)", "Fecha Viable Cosecha",
      "Mojamiento Real (lt/ha)", "Aplicador", "Tractor", "Implemento",
      "Viento (km/h)", "Temperatura (°C)", "Plaga/Objetivo",
      "Solicitante", "Responsable", "Dosificador",
    ];
    const filasFmt = filtered.map(f => [
      f.fecha ? new Date(f.fecha + "T12:00:00").toLocaleDateString("es-CL") : "",
      f.numero,
      f.estado,
      f.empresa,
      f.cuartel,
      f.especie,
      f.variedad,
      f.patron,
      f.sup_cuartel,
      f.sup_total,
      f.producto,
      f.ia,
      f.formulacion,
      f.dosis_real,
      f.unidad_dosis,
      f.consumo_ot ?? "",
      f.consumo_cuartel ?? "",
      f.carencia,
      f.reingreso,
      f.fecha_viable ? new Date(f.fecha_viable + "T12:00:00").toLocaleDateString("es-CL") : "",
      f.mojamiento_real ?? "",
      f.aplicador,
      f.tractor,
      f.pulverizador,
      f.viento ?? "",
      f.temperatura ?? "",
      f.objetivo,
      f.solicitante,
      f.responsable,
      f.dosificador,
    ]);

    const ws = utils.aoa_to_sheet([encabezados, ...filasFmt]);
    ws["!cols"] = encabezados.map((_, i) => ({ wch: i < 4 ? 14 : i < 10 ? 12 : i < 14 ? 36 : 14 }));
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Cuaderno de Campo");
    writeFile(wb, `cuaderno-campo-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Nav empresaId={empresa} />
      <main style={container}>

        {/* Header */}
        <div style={pageHeader}>
          <div>
            <h1 style={pageTitle}>Cuaderno de Campo</h1>
            <p style={pageSub}>
              Todas las aplicaciones en formato plano para tabla dinámica
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button onClick={exportar} style={exportBtn} disabled={filtered.length === 0}>
              Exportar Excel ({filtered.length} filas)
            </button>
            <button
              onClick={() => generateSAGPdf({
                empresa: filtered[0]?.empresa || "Empresa",
                temporada: new Date().getFullYear().toString(),
                filas: filtered.map(f => ({
                  fecha: f.fecha, numero_ot: f.numero, cuartel: f.cuartel,
                  especie: f.especie, variedad: f.variedad,
                  plaga: f.objetivo, nombre_comercial: f.producto,
                  numero_registro: "", ia: f.ia, formulacion: f.formulacion,
                  dosis_real: f.dosis_real, unidad_dosis: f.unidad_dosis,
                  consumo_ot: f.consumo_ot, consumo_cuartel: f.consumo_cuartel,
                  mojamiento_real: f.mojamiento_real,
                  carencia: f.carencia, reingreso: f.reingreso,
                  aplicador: f.aplicador, tractor: f.tractor, pulverizador: f.pulverizador,
                  viento: f.viento, temperatura: f.temperatura,
                  solicitante: f.solicitante, responsable: f.responsable, dosificador: f.dosificador,
                })),
              })}
              style={{ ...exportBtn, background: "#374151" }}
              disabled={filtered.length === 0}
            >
              Informe SAG (PDF)
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div style={filtrosBar}>
          <div style={filtroGrp}>
            <label style={filtroLabel}>Desde</label>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={filtroInput} />
          </div>
          <div style={filtroGrp}>
            <label style={filtroLabel}>Hasta</label>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={filtroInput} />
          </div>
          <div style={filtroGrp}>
            <label style={filtroLabel}>Cuartel</label>
            <select value={filtroCuartel} onChange={e => setFiltroCuartel(e.target.value)} style={filtroInput}>
              <option value="">Todos</option>
              {cuarteles.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={filtroGrp}>
            <label style={filtroLabel}>Producto</label>
            <select value={filtroProducto} onChange={e => setFiltroProducto(e.target.value)} style={filtroInput}>
              <option value="">Todos</option>
              {productos.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <label style={checkLabel}>
            <input
              type="checkbox"
              checked={soloFinalizadas}
              onChange={e => setSoloFinalizadas(e.target.checked)}
              style={{ marginRight: "6px" }}
            />
            Solo finalizadas
          </label>
          {(desde || hasta || filtroCuartel || filtroProducto || soloFinalizadas) && (
            <button
              onClick={() => { setDesde(""); setHasta(""); setFiltroCuartel(""); setFiltroProducto(""); setSoloFinalizadas(false); }}
              style={clearBtn}
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {!empresa && (
          <div style={emptyMsg}>Seleccioná una empresa en el selector del nav para ver el cuaderno.</div>
        )}

        {error && <div style={errorBox}>{error}</div>}

        {loading && (
          <div style={emptyMsg}>Cargando datos...</div>
        )}

        {!loading && !error && empresa && filtered.length === 0 && (
          <div style={emptyMsg}>Sin datos para los filtros aplicados.</div>
        )}

        {/* Tabla */}
        {filtered.length > 0 && (
          <div style={tableWrap}>
            <div style={{ overflowX: "auto" }}>
              <table style={tbl}>
                <thead>
                  <tr>
                    {[
                      "Fecha", "OT N°", "Estado", "Cuartel", "Especie / Variedad",
                      "Sup. Cuartel (ha)", "Sup. Total (ha)",
                      "Producto", "Ingrediente Activo",
                      "Dosis Real", "Consumo OT", "Consumo Cuartel",
                      "Carencia (d)", "Reingreso (h)", "Fecha Viable",
                      "Moj. Real (lt/ha)", "Aplicador", "Tractor", "Implemento",
                      "Viento (km/h)", "Temp. (°C)", "Objetivo",
                      "Solicitante", "Responsable", "Dosificador",
                    ].map(h => <th key={h} style={th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((f, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                      <td style={td}>{fmtDate(f.fecha)}</td>
                      <td style={{ ...td, textAlign: "center", fontWeight: 700 }}>{f.numero}</td>
                      <td style={td}>
                        <span style={estadoBadge(f.estado)}>{f.estado}</span>
                      </td>
                      <td style={{ ...td, fontWeight: 600 }}>{f.cuartel}</td>
                      <td style={td}>{f.especie}{f.variedad ? ` / ${f.variedad}` : ""}</td>
                      <td style={{ ...td, textAlign: "right" }}>{f.sup_cuartel.toFixed(2)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{f.sup_total.toFixed(2)}</td>
                      <td style={{ ...td, fontWeight: 600, maxWidth: "180px" }}>{f.producto}</td>
                      <td style={{ ...td, fontSize: "12px", color: "#6b7280" }}>
                        {f.ia}{f.concentracion_ia ? ` (${f.concentracion_ia})` : ""}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>{f.dosis_real} {f.unidad_dosis}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {f.consumo_ot !== null ? `${f.consumo_ot} ${f.unidad_dosis.split("/")[0]}` : "—"}
                      </td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 600, color: "#15803d" }}>
                        {f.consumo_cuartel !== null ? `${f.consumo_cuartel} ${f.unidad_dosis.split("/")[0]}` : "—"}
                      </td>
                      <td style={{ ...td, textAlign: "center" }}>{f.carencia}</td>
                      <td style={{ ...td, textAlign: "center" }}>{f.reingreso}</td>
                      <td style={td}>{fmtDate(f.fecha_viable)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{f.mojamiento_real ?? "—"}</td>
                      <td style={{ ...td, fontSize: "12px" }}>{f.aplicador || "—"}</td>
                      <td style={{ ...td, fontSize: "12px" }}>{f.tractor || "—"}</td>
                      <td style={{ ...td, fontSize: "12px" }}>{f.pulverizador || "—"}</td>
                      <td style={{ ...td, textAlign: "right" }}>{f.viento ?? "—"}</td>
                      <td style={{ ...td, textAlign: "right" }}>{f.temperatura ?? "—"}</td>
                      <td style={{ ...td, fontSize: "12px", maxWidth: "160px" }}>{f.objetivo || "—"}</td>
                      <td style={{ ...td, fontSize: "12px" }}>{f.solicitante || "—"}</td>
                      <td style={{ ...td, fontSize: "12px" }}>{f.responsable || "—"}</td>
                      <td style={{ ...td, fontSize: "12px" }}>{f.dosificador || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const container: React.CSSProperties = { maxWidth: "1600px", margin: "0 auto", padding: "28px 20px" };
const pageHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", gap: "12px", flexWrap: "wrap" };
const pageTitle: React.CSSProperties = { fontSize: "24px", fontWeight: 800, color: "#1a4731" };
const pageSub: React.CSSProperties = { fontSize: "13px", color: "#6b7280", marginTop: "4px" };
const exportBtn: React.CSSProperties = { padding: "10px 22px", background: "#1a4731", color: "#fff", border: "none", borderRadius: "10px", fontWeight: 700, fontSize: "14px", cursor: "pointer", flexShrink: 0 };
const filtrosBar: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-end", background: "#fff", borderRadius: "12px", border: "1px solid #e5e7eb", padding: "16px 18px", marginBottom: "20px" };
const filtroGrp: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "4px" };
const filtroLabel: React.CSSProperties = { fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em" };
const filtroInput: React.CSSProperties = { padding: "7px 10px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "13px", background: "#fff", color: "#111", minWidth: "130px" };
const checkLabel: React.CSSProperties = { display: "flex", alignItems: "center", fontSize: "13px", fontWeight: 600, color: "#374151", cursor: "pointer", paddingBottom: "1px" };
const clearBtn: React.CSSProperties = { padding: "7px 14px", borderRadius: "8px", border: "1px solid #d1d5db", background: "#fff", color: "#6b7280", fontSize: "13px", cursor: "pointer" };
const emptyMsg: React.CSSProperties = { fontSize: "14px", color: "#6b7280", fontStyle: "italic", textAlign: "center", padding: "40px 0" };
const errorBox: React.CSSProperties = { fontSize: "13px", color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px" };
const tableWrap: React.CSSProperties = { background: "#fff", borderRadius: "14px", border: "1px solid #e5e7eb", overflow: "hidden" };
const tbl: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: "13px" };
const th: React.CSSProperties = { padding: "10px 12px", background: "#1a4731", color: "#fff", textAlign: "left", fontWeight: 700, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap", position: "sticky", top: 0 };
const td: React.CSSProperties = { padding: "9px 12px", borderBottom: "1px solid #f3f4f6", verticalAlign: "middle", whiteSpace: "nowrap" };

function estadoBadge(estado: string): React.CSSProperties {
  const colores: Record<string, { bg: string; color: string }> = {
    borrador:      { bg: "#f3f4f6", color: "#6b7280" },
    emitida:       { bg: "#eff6ff", color: "#1d4ed8" },
    en_ejecucion:  { bg: "#fefce8", color: "#a16207" },
    finalizada:    { bg: "#f0fdf4", color: "#15803d" },
  };
  const c = colores[estado] ?? { bg: "#f3f4f6", color: "#6b7280" };
  return { padding: "2px 8px", borderRadius: "999px", background: c.bg, color: c.color, fontSize: "11px", fontWeight: 700 };
}

export default function CuadernoPage() {
  return <Suspense><CuadernoContent /></Suspense>;
}
