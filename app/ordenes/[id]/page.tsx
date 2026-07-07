"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import type { OrdenTrabajo } from "@/lib/types";
import { ESTADOS_OT, ESTADOS_OT_COLOR } from "@/lib/types";
import { generateOTPdf } from "@/lib/generateOTPdf";

type OTCompleta = OrdenTrabajo & {
  empresa: { nombre: string } | null;
  solicitante: { nombre: string } | null;
  responsable: { nombre: string } | null;
  dosificador: { nombre: string } | null;
  ot_cuarteles: { id: string; superficie_ha: number; cuartel: { codigo: string; especie: string; variedad: string; patron: string | null } }[];
  ot_aplicadores: { id: string; operador: { nombre: string }; tractor: { codigo: string } | null; pulverizador: { codigo: string } | null; cantidad_maquinadas: number | null }[];
  ot_productos: { id: string; producto_id: string; dosis_real: number; dosis_unidad: string; carencia_dias: number; rei_horas: number; fecha_viable: string | null; consumo_total: number | null; producto: { nombre_comercial: string; ingrediente_activo: string | null; formulacion: string | null; especies_autorizadas: string[] | null } }[];
};

const TRANSICIONES: Record<OrdenTrabajo["estado"], OrdenTrabajo["estado"][]> = {
  borrador: ["emitida", "anulada"],
  emitida: ["en_ejecucion", "anulada"],
  en_ejecucion: ["finalizada", "anulada"],
  finalizada: [],
  anulada: [],
};

const TRANS_LABEL: Record<string, string> = {
  emitida: "Emitir",
  en_ejecucion: "Iniciar ejecución",
  finalizada: "Finalizar",
  anulada: "Anular",
};

import { Suspense } from "react";
function OTDetalleContent() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const empresaId = searchParams.get("empresa") || "";

  const [ot, setOT] = useState<OTCompleta | null>(null);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [confirmAnular, setConfirmAnular] = useState(false);
  const [notas, setNotas] = useState("");

  // Datos de ejecución (para finalizar) — horas default 05:00–12:00
  const [horaInicio, setHoraInicio] = useState("05:00");
  const [horaFin, setHoraFin] = useState("12:00");
  const [viento, setViento] = useState("");
  const [temperatura, setTemperatura] = useState("");
  const [mojamientoReal, setMojamientoReal] = useState("");
  const [enjuage, setEnjuage] = useState("");
  const [showEjecucion, setShowEjecucion] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ordenes_trabajo")
      .select(`
        *,
        empresa:empresas(nombre),
        solicitante:personal!solicitante_id(nombre),
        responsable:personal!responsable_id(nombre),
        dosificador:personal!dosificador_id(nombre),
        ot_cuarteles(id, superficie_ha, cuartel:cuarteles(codigo, especie, variedad, patron)),
        ot_aplicadores(id, cantidad_maquinadas, operador:operadores(nombre), tractor:maquinaria!tractor_id(codigo), pulverizador:maquinaria!pulverizador_id(codigo)),
        ot_productos(id, producto_id, dosis_real, dosis_unidad, carencia_dias, rei_horas, fecha_viable, consumo_total, producto:productos(nombre_comercial, ingrediente_activo, formulacion, especies_autorizadas))
      `)
      .eq("id", params.id)
      .single();

    if (error || !data) { router.push(`/ordenes${empresaId ? `?empresa=${empresaId}` : ""}`); return; }
    setOT(data as unknown as OTCompleta);
    setNotas(data.notas || "");
    setHoraInicio(data.hora_inicio || "05:00");
    setHoraFin(data.hora_fin || "12:00");
    setViento(String(data.viento_kmh || ""));
    setTemperatura(String(data.temperatura_c || ""));
    setMojamientoReal(String(data.mojamiento_real_ltha || ""));
    setEnjuage(String(data.enjuage_pulverizador_lt || ""));
    setLoading(false);
  };

  useEffect(() => { load(); }, [params.id]);

  const handleTransicion = async (nuevoEstado: OrdenTrabajo["estado"]) => {
    if (nuevoEstado === "anulada" && !confirmAnular) { setConfirmAnular(true); return; }
    setConfirmAnular(false);
    setTransitioning(true);

    const update: Record<string, unknown> = { estado: nuevoEstado, updated_at: new Date().toISOString() };
    if (nuevoEstado === "finalizada") {
      update.hora_inicio = horaInicio || null;
      update.hora_fin = horaFin || null;
      update.viento_kmh = viento ? parseFloat(viento) : null;
      update.temperatura_c = temperatura ? parseFloat(temperatura) : null;
      update.mojamiento_real_ltha = mojamientoReal ? parseFloat(mojamientoReal) : null;
      update.enjuage_pulverizador_lt = enjuage ? parseFloat(enjuage) : null;
      update.notas = notas || null;
    }

    await supabase.from("ordenes_trabajo").update(update).eq("id", params.id);

    setTransitioning(false);
    await load();
  };

  const handleFinalizar = async () => {
    if (!ot) return;
    setTransitioning(true);

    const mojReal = parseFloat(mojamientoReal) || 0;
    const supTotal = ot.ot_cuarteles.reduce((s, c) => s + c.superficie_ha, 0);

    // Calcular consumo real y actualizar ot_productos
    const stockInserts: { empresa_id: string; producto_id: string; tipo: "salida"; cantidad: number; unidad: string; fecha: string; ot_id: string }[] = [];
    for (const p of ot.ot_productos) {
      const unidad = p.dosis_unidad;
      const consumo = unidad.endsWith("/ha")
        ? Math.round(p.dosis_real * supTotal * 1000) / 1000
        : Math.round((p.dosis_real / 100) * mojReal * supTotal * 1000) / 1000;

      await supabase.from("ot_productos").update({ consumo_total: consumo }).eq("id", p.id);

      if (consumo > 0) {
        stockInserts.push({
          empresa_id: ot.empresa_id,
          producto_id: p.producto_id,
          tipo: "salida",
          cantidad: consumo,
          unidad: unidad.split("/")[0] || "lt",
          fecha: ot.fecha_aplicacion || new Date().toISOString().slice(0, 10),
          ot_id: ot.id,
        });
      }
    }

    await supabase.from("ordenes_trabajo").update({
      estado: "finalizada",
      hora_inicio: horaInicio || null,
      hora_fin: horaFin || null,
      viento_kmh: viento ? parseFloat(viento) : null,
      temperatura_c: temperatura ? parseFloat(temperatura) : null,
      mojamiento_real_ltha: mojReal || null,
      enjuage_pulverizador_lt: enjuage ? parseFloat(enjuage) : null,
      notas: notas || null,
      updated_at: new Date().toISOString(),
    }).eq("id", ot.id);

    if (stockInserts.length) {
      await supabase.from("stock_movimientos").insert(stockInserts);
    }

    setTransitioning(false);
    setShowEjecucion(false);
    await load();
  };

  if (loading) return <><Nav empresaId={empresaId} /><main style={container}><p style={{ color: "#6b7280" }}>Cargando...</p></main></>;
  if (!ot) return null;

  const estadoColor = ESTADOS_OT_COLOR[ot.estado];
  const transiciones = TRANSICIONES[ot.estado];
  const superficieTotal = ot.ot_cuarteles.reduce((s, c) => s + c.superficie_ha, 0);

  return (
    <>
      <Nav empresaId={empresaId} />
      <main style={container}>
        {/* Header */}
        <div style={pageHeader}>
          <div>
            <button onClick={() => router.push(`/ordenes${empresaId ? `?empresa=${empresaId}` : ""}`)} style={backBtn}>
              ← Volver
            </button>
            <h1 style={pageTitle}>OT N° {ot.numero}</h1>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "6px" }}>
              <span style={{ ...estadoBadge, background: estadoColor + "22", color: estadoColor, borderColor: estadoColor + "55" }}>
                {ESTADOS_OT[ot.estado]}
              </span>
              <span style={{ fontSize: "13px", color: "#6b7280" }}>{ot.empresa?.nombre}</span>
              {ot.fecha_aplicacion && (
                <span style={{ fontSize: "13px", color: "#6b7280" }}>
                  Aplicación: {new Date(ot.fecha_aplicacion + "T12:00:00").toLocaleDateString("es-CL")}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {ot.estado !== "anulada" && (
              <button onClick={() => generateOTPdf(ot as unknown as Parameters<typeof generateOTPdf>[0])} style={printBtn}>
                Imprimir OT
              </button>
            )}
            {transiciones.includes("finalizada") && (
              <button onClick={() => setShowEjecucion(true)} style={primaryBtn}>
                Registrar finalización
              </button>
            )}
            {transiciones.filter((t) => t !== "finalizada").map((t) => (
              <button
                key={t}
                onClick={() => handleTransicion(t)}
                style={t === "anulada" ? dangerBtn : secondaryBtn}
                disabled={transitioning}
              >
                {TRANS_LABEL[t] || t}
              </button>
            ))}
          </div>
        </div>

        {confirmAnular && (
          <div style={alertBox}>
            <span>¿Confirmás la anulación de esta OT? Esta acción no se puede deshacer.</span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => setConfirmAnular(false)} style={cancelSmall}>No</button>
              <button onClick={() => handleTransicion("anulada")} style={confirmDanger}>Sí, anular</button>
            </div>
          </div>
        )}

        <div style={grid2}>
          {/* Columna izquierda */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Responsables */}
            <div style={card}>
              <h3 style={cardTitle}>Responsables</h3>
              <Row label="Solicitante" value={ot.solicitante?.nombre} />
              <Row label="Responsable técnico" value={ot.responsable?.nombre} />
              <Row label="Dosificador" value={ot.dosificador?.nombre} />
              {ot.funcion?.length && <Row label="Función" value={ot.funcion.join(", ")} />}
              {ot.plagas_objetivo && <Row label="Objetivo" value={ot.plagas_objetivo} />}
              {ot.objetivo_principal && <Row label="Objetivo principal" value={ot.objetivo_principal} />}
            </div>

            {/* Cuarteles */}
            <div style={card}>
              <h3 style={cardTitle}>Cuarteles ({superficieTotal.toFixed(2)} ha total)</h3>
              {ot.ot_cuarteles.map((c) => (
                <div key={c.id} style={tableRow}>
                  <span style={{ fontWeight: 600 }}>{c.cuartel.codigo}</span>
                  <span style={{ color: "#6b7280", fontSize: "13px" }}>{c.cuartel.especie} {c.cuartel.variedad}</span>
                  <span style={{ marginLeft: "auto", fontSize: "13px", fontWeight: 600 }}>{c.superficie_ha} ha</span>
                </div>
              ))}
            </div>

            {/* Aplicadores */}
            <div style={card}>
              <h3 style={cardTitle}>Aplicadores</h3>
              {ot.ot_aplicadores.map((a) => (
                <div key={a.id} style={tableRow}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{a.operador.nombre}</div>
                    <div style={{ fontSize: "12px", color: "#6b7280" }}>
                      {a.tractor?.codigo && `Tractor: ${a.tractor.codigo}`}
                      {a.pulverizador?.codigo && ` · Pulv: ${a.pulverizador.codigo}`}
                      {a.cantidad_maquinadas && ` · ${a.cantidad_maquinadas} maquinadas`}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* PPE */}
            {(ot.ppe_traje || ot.ppe_guantes || ot.ppe_anteojos || ot.ppe_gorro || ot.ppe_mascarilla || ot.ppe_botas) && (
              <div style={card}>
                <h3 style={cardTitle}>Equipos de protección</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {ot.ppe_traje && <span style={ppeBadge}>Traje</span>}
                  {ot.ppe_guantes && <span style={ppeBadge}>Guantes</span>}
                  {ot.ppe_anteojos && <span style={ppeBadge}>Anteojos</span>}
                  {ot.ppe_gorro && <span style={ppeBadge}>Gorro</span>}
                  {ot.ppe_mascarilla && <span style={ppeBadge}>Mascarilla</span>}
                  {ot.ppe_botas && <span style={ppeBadge}>Botas</span>}
                </div>
              </div>
            )}
          </div>

          {/* Columna derecha */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Productos */}
            <div style={card}>
              <h3 style={cardTitle}>Productos a aplicar</h3>
              {ot.ot_productos.map((p) => (
                <div key={p.id} style={{ ...tableRow, flexDirection: "column", alignItems: "flex-start", gap: "4px" }}>
                  <div style={{ fontWeight: 700 }}>{p.producto.nombre_comercial}</div>
                  {p.producto.ingrediente_activo && (
                    <div style={{ fontSize: "12px", color: "#6b7280" }}>{p.producto.ingrediente_activo}</div>
                  )}
                  <div style={{ display: "flex", gap: "16px", fontSize: "13px", marginTop: "2px" }}>
                    <span>Dosis: <strong>{p.dosis_real} {p.dosis_unidad}</strong></span>
                    {p.consumo_total && <span>Total: <strong>{p.consumo_total} {p.dosis_unidad.split("/")[0]}</strong></span>}
                    <span style={{ color: "#d97706" }}>Carencia: {p.carencia_dias}d</span>
                    <span style={{ color: "#7c3aed" }}>Reingreso: {p.rei_horas}h</span>
                  </div>
                  {p.fecha_viable && (
                    <div style={{ fontSize: "12px", color: "#dc2626", fontWeight: 600 }}>
                      Cosecha viable desde: {new Date(p.fecha_viable + "T12:00:00").toLocaleDateString("es-CL")}
                    </div>
                  )}
                  {p.producto.especies_autorizadas && (
                    <div style={{ fontSize: "11px", color: "#9ca3af" }}>
                      Autorizado: {p.producto.especies_autorizadas.join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Datos de ejecución (si finalizada) */}
            {ot.estado === "finalizada" && (ot.hora_inicio || ot.viento_kmh || ot.temperatura_c) && (
              <div style={card}>
                <h3 style={cardTitle}>Datos de ejecución</h3>
                {ot.hora_inicio && <Row label="Inicio" value={ot.hora_inicio} />}
                {ot.hora_fin && <Row label="Fin" value={ot.hora_fin} />}
                {ot.viento_kmh !== null && <Row label="Viento" value={`${ot.viento_kmh} km/h`} />}
                {ot.temperatura_c !== null && <Row label="Temperatura" value={`${ot.temperatura_c} °C`} />}
                {ot.mojamiento_real_ltha !== null && <Row label="Mojamiento real" value={`${ot.mojamiento_real_ltha} lt/ha`} />}
                {ot.enjuage_pulverizador_lt !== null && <Row label="Enjuague" value={`${ot.enjuage_pulverizador_lt} lt`} />}
              </div>
            )}

            {/* Notas */}
            {ot.notas && (
              <div style={card}>
                <h3 style={cardTitle}>Notas</h3>
                <p style={{ fontSize: "14px", color: "#374151", margin: 0 }}>{ot.notas}</p>
              </div>
            )}

            {/* Mojamiento solicitado */}
            {ot.mojamiento_solicitado_ltha && (
              <div style={card}>
                <h3 style={cardTitle}>Mojamiento</h3>
                <Row label="Solicitado" value={`${ot.mojamiento_solicitado_ltha} lt/ha`} />
              </div>
            )}
          </div>
        </div>

        {/* Modal finalizar */}
        {showEjecucion && (
          <div style={overlay}>
            <div style={modal}>
              <h2 style={modalTitle}>Registrar finalización</h2>
              <div style={grid2modal}>
                <ModalField label="Hora inicio">
                  <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} style={inputStyle} />
                </ModalField>
                <ModalField label="Hora fin">
                  <input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} style={inputStyle} />
                </ModalField>
                <ModalField label="Viento (km/h)">
                  <input type="number" min="0" step="0.1" value={viento} onChange={(e) => setViento(e.target.value)} style={inputStyle} placeholder="0.0" />
                </ModalField>
                <ModalField label="Temperatura (°C)">
                  <input type="number" step="0.1" value={temperatura} onChange={(e) => setTemperatura(e.target.value)} style={inputStyle} placeholder="0.0" />
                </ModalField>
                <ModalField label="Mojamiento real (lt/ha)">
                  <input type="number" min="0" step="1" value={mojamientoReal} onChange={(e) => setMojamientoReal(e.target.value)} style={inputStyle} placeholder="0" />
                </ModalField>
                <ModalField label="Enjuague pulverizadora (lt)">
                  <input type="number" min="0" step="1" value={enjuage} onChange={(e) => setEnjuage(e.target.value)} style={inputStyle} placeholder="0" />
                </ModalField>
              </div>
              <ModalField label="Notas finales">
                <textarea value={notas} onChange={(e) => setNotas(e.target.value)} style={{ ...inputStyle, height: "60px", resize: "vertical" }} />
              </ModalField>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                <button onClick={() => setShowEjecucion(false)} style={cancelSmall}>Cancelar</button>
                <button onClick={handleFinalizar} style={primaryBtn} disabled={transitioning}>
                  {transitioning ? "Guardando..." : "Finalizar OT"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f3f4f6", fontSize: "13px" }}>
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: "right", maxWidth: "60%" }}>{value}</span>
    </div>
  );
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <label style={{ fontSize: "12px", fontWeight: 700, color: "#374151" }}>{label}</label>
      {children}
    </div>
  );
}

const container: React.CSSProperties = { maxWidth: "1100px", margin: "0 auto", padding: "24px 20px" };
const pageHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px", flexWrap: "wrap", gap: "12px" };
const pageTitle: React.CSSProperties = { fontSize: "24px", fontWeight: 800, color: "#1a4731", margin: "4px 0" };
const backBtn: React.CSSProperties = { background: "transparent", border: "none", color: "#6b7280", fontSize: "13px", cursor: "pointer", padding: "0", marginBottom: "4px", fontWeight: 600 };
const estadoBadge: React.CSSProperties = { padding: "3px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: 700, border: "1px solid" };
const primaryBtn: React.CSSProperties = { padding: "8px 18px", borderRadius: "8px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "13px", border: "none", cursor: "pointer" };
const secondaryBtn: React.CSSProperties = { padding: "8px 18px", borderRadius: "8px", border: "1.5px solid #1a4731", background: "#fff", color: "#1a4731", fontWeight: 700, fontSize: "13px", cursor: "pointer" };
const printBtn: React.CSSProperties = { padding: "8px 18px", borderRadius: "8px", border: "1.5px solid #6b7280", background: "#fff", color: "#374151", fontWeight: 700, fontSize: "13px", cursor: "pointer" };
const dangerBtn: React.CSSProperties = { padding: "8px 18px", borderRadius: "8px", border: "1.5px solid #fca5a5", background: "#fff", color: "#dc2626", fontWeight: 700, fontSize: "13px", cursor: "pointer" };
const alertBox: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: "#dc2626", gap: "12px" };
const cancelSmall: React.CSSProperties = { padding: "6px 14px", borderRadius: "7px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "13px", cursor: "pointer" };
const confirmDanger: React.CSSProperties = { padding: "6px 14px", borderRadius: "7px", background: "#dc2626", color: "#fff", fontWeight: 700, fontSize: "13px", border: "none", cursor: "pointer" };
const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" };
const card: React.CSSProperties = { background: "#fff", borderRadius: "14px", border: "1px solid #e5e7eb", padding: "18px 20px" };
const cardTitle: React.CSSProperties = { fontSize: "13px", fontWeight: 700, color: "#1a4731", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "12px" };
const tableRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: "8px", padding: "8px 0", borderBottom: "1px solid #f3f4f6" };
const ppeBadge: React.CSSProperties = { padding: "3px 10px", borderRadius: "999px", background: "#f0fdf4", color: "#15803d", fontSize: "12px", fontWeight: 600, border: "1px solid #86efac" };
const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 };
const modal: React.CSSProperties = { background: "#fff", borderRadius: "16px", padding: "28px", width: "90%", maxWidth: "560px", boxShadow: "0 8px 32px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" };
const modalTitle: React.CSSProperties = { fontSize: "18px", fontWeight: 800, color: "#1a4731", marginBottom: "20px" };
const grid2modal: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" };
const inputStyle: React.CSSProperties = { padding: "9px 12px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "14px", background: "#fafafa", color: "#111", width: "100%", boxSizing: "border-box" };
export default function OTDetallePage() { return <Suspense><OTDetalleContent /></Suspense>; }
