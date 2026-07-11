"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import type { OrdenTrabajo } from "@/lib/types";
import { ESTADOS_OT, ESTADOS_OT_COLOR } from "@/lib/types";
import { generateOTPdf } from "@/lib/generateOTPdf";

type OTProducto = {
  id: string;
  producto_id: string;
  dosis_real: number;
  dosis_unidad: string;
  carencia_dias: number;
  rei_horas: number;
  fecha_viable: string | null;
  consumo_total: number | null;
  producto: {
    nombre_comercial: string;
    ingrediente_activo: string | null;
    formulacion: string | null;
    especies_autorizadas: string[] | null;
    unidad_dosis: string | null;
  };
};

type OTCompleta = OrdenTrabajo & {
  empresa: { nombre: string } | null;
  solicitante: { nombre: string } | null;
  responsable: { nombre: string } | null;
  dosificador: { nombre: string } | null;
  ot_cuarteles: { id: string; superficie_ha: number; cuartel: { codigo: string; especie: string; variedad: string; patron: string | null } }[];
  ot_aplicadores: { id: string; operador: { nombre: string } | null; personal: { nombre: string } | null; tractor: { codigo: string } | null; pulverizador: { codigo: string } | null; cantidad_maquinadas: number | null }[];
  ot_productos: OTProducto[];
};

const PASOS_FLUJO: OrdenTrabajo["estado"][] = ["borrador", "emitida", "en_ejecucion", "finalizada"];
const PASO_LABEL: Record<string, string> = {
  borrador: "Borrador", emitida: "Emitida", en_ejecucion: "En ejecución", finalizada: "Finalizada",
};

const TRANSICIONES: Record<OrdenTrabajo["estado"], OrdenTrabajo["estado"][]> = {
  borrador:     ["emitida",      "anulada"],
  emitida:      ["en_ejecucion", "anulada"],
  en_ejecucion: ["finalizada",   "anulada"],
  finalizada:   [],
  anulada:      [],
};

const TRANS_LABEL: Record<string, string> = {
  emitida: "Emitir / Aprobar", en_ejecucion: "Iniciar ejecución", finalizada: "Finalizar", anulada: "Anular",
};

// Calcula consumo total dado dosis, unidad, mojamiento real y superficie
function calcConsumo(dosis: number, unidad: string, mojReal: number, supTotal: number): number {
  if (unidad.includes("/ha")) {
    return Math.round(dosis * supTotal * 1000) / 1000;
  }
  // /100lt o /100L
  if (mojReal > 0) {
    return Math.round((dosis / 100) * mojReal * supTotal * 1000) / 1000;
  }
  return 0;
}

function OTDetalleContent() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const empresaId = searchParams.get("empresa") || "";

  const [ot, setOT] = useState<OTCompleta | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [transError, setTransError] = useState("");
  const [transitioning, setTransitioning] = useState(false);
  const [confirmAnular,   setConfirmAnular]   = useState(false);
  const [confirmEliminar, setConfirmEliminar] = useState(false);
  const [notas, setNotas] = useState("");

  // Datos de ejecución (para finalizar)
  const [horaInicio,     setHoraInicio]     = useState("05:00");
  const [horaFin,        setHoraFin]        = useState("12:00");
  const [viento,         setViento]         = useState("");
  const [temperatura,    setTemperatura]    = useState("");
  const [mojamientoReal, setMojamientoReal] = useState("");
  const [enjuage,        setEnjuage]        = useState("");
  const [showEjecucion,  setShowEjecucion]  = useState(false);

  const PRODUCTOS_SELECT = "id, producto_id, dosis_real, dosis_unidad, carencia_dias, rei_horas, fecha_viable, consumo_total, producto:productos(nombre_comercial, ingrediente_activo, formulacion, especies_autorizadas, unidad_dosis)";
  const APLICADORES_SELECT_V10 = "id, cantidad_maquinadas, operador:operadores(nombre), personal:personal!personal_id(nombre), tractor:maquinaria!tractor_id(codigo), pulverizador:maquinaria!pulverizador_id(codigo)";
  const APLICADORES_SELECT_FALLBACK = "id, cantidad_maquinadas, operador:operadores(nombre), tractor:maquinaria!tractor_id(codigo), pulverizador:maquinaria!pulverizador_id(codigo)";

  const load = async () => {
    setLoading(true);
    setPageError("");

    let result = await supabase
      .from("ordenes_trabajo")
      .select(`*, empresa:empresas(nombre), solicitante:personal!solicitante_id(nombre), responsable:personal!responsable_id(nombre), dosificador:personal!dosificador_id(nombre), ot_cuarteles(id, superficie_ha, cuartel:cuarteles(codigo, especie, variedad, patron)), ot_aplicadores(${APLICADORES_SELECT_V10}), ot_productos(${PRODUCTOS_SELECT})`)
      .eq("id", params.id)
      .single();

    if (result.error && (result.error.message?.includes("personal_id") || result.error.code === "PGRST200")) {
      result = await supabase
        .from("ordenes_trabajo")
        .select(`*, empresa:empresas(nombre), solicitante:personal!solicitante_id(nombre), responsable:personal!responsable_id(nombre), dosificador:personal!dosificador_id(nombre), ot_cuarteles(id, superficie_ha, cuartel:cuarteles(codigo, especie, variedad, patron)), ot_aplicadores(${APLICADORES_SELECT_FALLBACK}), ot_productos(${PRODUCTOS_SELECT})`)
        .eq("id", params.id)
        .single();
    }

    const { data, error } = result;
    if (error) { setPageError(`Error al cargar la OT: ${error.message}`); setLoading(false); return; }
    if (!data) { setPageError("No se encontró la orden de trabajo."); setLoading(false); return; }

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

  // ── Transición de estado simple ───────────────────────────────────────────
  const handleTransicion = async (nuevoEstado: OrdenTrabajo["estado"]) => {
    if (nuevoEstado === "anulada" && !confirmAnular) { setConfirmAnular(true); return; }
    setConfirmAnular(false);
    setTransError("");
    setTransitioning(true);
    const { error } = await supabase.from("ordenes_trabajo")
      .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
      .eq("id", params.id);
    if (error) { setTransError(`Error: ${error.message}`); setTransitioning(false); return; }
    setTransitioning(false);
    await load();
  };

  // ── Finalizar con datos de ejecución ──────────────────────────────────────
  const handleFinalizar = async () => {
    if (!ot) return;
    setTransError("");
    setTransitioning(true);

    const mojReal = parseFloat(mojamientoReal) || 0;
    const supTotal = ot.ot_cuarteles.reduce((s, c) => s + c.superficie_ha, 0);

    // Calcular consumo una sola vez por producto
    const consumos = ot.ot_productos.map(p => ({
      p,
      consumo: calcConsumo(p.dosis_real, p.dosis_unidad, mojReal, supTotal),
      unidadStock: p.producto.unidad_dosis || p.dosis_unidad.split("/")[0] || "lt",
    }));

    // Actualizar consumo_total en ot_productos
    const updateResults = await Promise.all(
      consumos.map(({ p, consumo }) =>
        supabase.from("ot_productos").update({ consumo_total: consumo }).eq("id", p.id)
      )
    );
    const updateErr = updateResults.find(r => r.error)?.error;
    if (updateErr) {
      setTransError(`Error al guardar consumos: ${updateErr.message}`);
      setTransitioning(false);
      return;
    }

    // Actualizar OT
    const { error: otError } = await supabase.from("ordenes_trabajo").update({
      estado: "finalizada",
      hora_inicio: horaInicio || null,
      hora_fin: horaFin || null,
      viento_kmh:              viento      ? parseFloat(viento)      : null,
      temperatura_c:           temperatura ? parseFloat(temperatura) : null,
      mojamiento_real_ltha:    mojReal     || null,
      enjuage_pulverizador_lt: enjuage     ? parseFloat(enjuage)     : null,
      notas:        notas || null,
      updated_at:   new Date().toISOString(),
    }).eq("id", ot.id);

    if (otError) { setTransError(`Error al finalizar: ${otError.message}`); setTransitioning(false); return; }

    // Insertar movimientos de stock
    const stockInserts = consumos
      .filter(({ consumo }) => consumo > 0)
      .map(({ p, consumo, unidadStock }) => ({
        empresa_id:  ot.empresa_id,
        producto_id: p.producto_id,
        tipo:        "salida" as const,
        cantidad:    consumo,
        unidad:      unidadStock,
        fecha:       ot.fecha_aplicacion || new Date().toISOString().slice(0, 10),
        ot_id:       ot.id,
      }));

    if (stockInserts.length) {
      const { error: stockError } = await supabase.from("stock_movimientos").insert(stockInserts);
      if (stockError) {
        setTransError(`OT finalizada, pero error al descontar stock: ${stockError.message}`);
        setTransitioning(false);
        setShowEjecucion(false);
        await load();
        return;
      }
    }

    setTransitioning(false);
    setShowEjecucion(false);
    await load();
  };

  // ── Reabrir OT finalizada (revierte stock y vuelve a en_ejecucion) ────────
  const handleReabrir = async () => {
    if (!ot) return;
    setTransError("");
    setTransitioning(true);

    // Buscar movimientos de salida de esta OT
    const { data: movs, error: movsError } = await supabase
      .from("stock_movimientos")
      .select("*")
      .eq("ot_id", ot.id)
      .eq("tipo", "salida");

    if (movsError) { setTransError(`Error al buscar movimientos: ${movsError.message}`); setTransitioning(false); return; }

    // Insertar reversiones como ajuste_entrada
    if (movs && movs.length > 0) {
      const reversiones = movs.map((m: { empresa_id: string; producto_id: string; cantidad: number; unidad: string; fecha: string }) => ({
        empresa_id:  m.empresa_id,
        producto_id: m.producto_id,
        tipo:        "ajuste_entrada" as const,
        cantidad:    m.cantidad,
        unidad:      m.unidad,
        fecha:       new Date().toISOString().slice(0, 10),
        notas:       `Reversión por reapertura de OT #${ot.numero}`,
      }));
      const { error: revError } = await supabase.from("stock_movimientos").insert(reversiones);
      if (revError) { setTransError(`Error al revertir stock: ${revError.message}`); setTransitioning(false); return; }
    }

    // Limpiar datos de ejecución y volver a en_ejecucion
    const { error: reopenError } = await supabase.from("ordenes_trabajo").update({
      estado:                  "en_ejecucion",
      mojamiento_real_ltha:    null,
      hora_inicio:             null,
      hora_fin:                null,
      viento_kmh:              null,
      temperatura_c:           null,
      enjuage_pulverizador_lt: null,
      updated_at:              new Date().toISOString(),
    }).eq("id", ot.id);

    if (reopenError) { setTransError(`Error al reabrir: ${reopenError.message}`); setTransitioning(false); return; }

    // Limpiar consumo_total de productos
    await Promise.all(
      ot.ot_productos.map(p =>
        supabase.from("ot_productos").update({ consumo_total: null }).eq("id", p.id)
      )
    );

    setTransitioning(false);
    await load();
  };

  // ── Eliminar OT (con reversión de stock si estaba finalizada) ─────────────
  const handleEliminar = async () => {
    if (!ot) return;
    setConfirmEliminar(false);
    setTransError("");
    setTransitioning(true);

    // Revertir stock si estaba finalizada
    if (ot.estado === "finalizada") {
      const { data: movs } = await supabase
        .from("stock_movimientos")
        .select("*")
        .eq("ot_id", ot.id)
        .eq("tipo", "salida");

      if (movs && movs.length > 0) {
        const reversiones = movs.map((m: { empresa_id: string; producto_id: string; cantidad: number; unidad: string }) => ({
          empresa_id:  m.empresa_id,
          producto_id: m.producto_id,
          tipo:        "ajuste_entrada" as const,
          cantidad:    m.cantidad,
          unidad:      m.unidad,
          fecha:       new Date().toISOString().slice(0, 10),
          notas:       `Reversión por eliminación de OT #${ot.numero}`,
        }));
        const { error: revError } = await supabase.from("stock_movimientos").insert(reversiones);
        if (revError) { setTransError(`Error al revertir stock: ${revError.message}`); setTransitioning(false); return; }
      }
    }

    // Eliminar sub-tablas y la OT
    await supabase.from("ot_aplicadores").delete().eq("ot_id", ot.id);
    await supabase.from("ot_cuarteles").delete().eq("ot_id", ot.id);
    await supabase.from("ot_productos").delete().eq("ot_id", ot.id);
    const { error: delError } = await supabase.from("ordenes_trabajo").delete().eq("id", ot.id);

    if (delError) { setTransError(`Error al eliminar: ${delError.message}`); setTransitioning(false); return; }

    router.push(`/ordenes${empresaId ? `?empresa=${empresaId}` : ""}`);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <><Nav empresaId={empresaId} /><main style={container}><p style={{ color: "#6b7280" }}>Cargando...</p></main></>;

  if (pageError) return (
    <>
      <Nav empresaId={empresaId} />
      <main style={container}>
        <button onClick={() => router.push(`/ordenes${empresaId ? `?empresa=${empresaId}` : ""}`)} style={backBtn}>← Volver</button>
        <div style={{ marginTop: "20px", padding: "16px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "10px", color: "#dc2626", fontSize: "14px" }}>
          <strong>Error:</strong> {pageError}
          <br /><br />
          <span style={{ fontSize: "12px", color: "#92400e" }}>Si es la primera vez que carga esta OT, asegúrate de haber ejecutado migration_v10 en Supabase (SQL Editor).</span>
        </div>
      </main>
    </>
  );

  if (!ot) return null;

  const estadoColor    = ESTADOS_OT_COLOR[ot.estado];
  const transiciones   = TRANSICIONES[ot.estado];
  const superficieTotal = ot.ot_cuarteles.reduce((s, c) => s + c.superficie_ha, 0);
  const pasoActualIdx  = PASOS_FLUJO.indexOf(ot.estado);
  const puedeEditar    = ot.estado === "borrador" || ot.estado === "emitida";
  const estaFinalizada = ot.estado === "finalizada";
  const estaAnulada    = ot.estado === "anulada";

  return (
    <>
      <Nav empresaId={empresaId} />
      <main style={container}>

        {/* ── Header ── */}
        <div style={pageHeader}>
          <div>
            <button onClick={() => router.push(`/ordenes${empresaId ? `?empresa=${empresaId}` : ""}`)} style={backBtn}>← Volver</button>
            <h1 style={pageTitle}>OT N° {ot.numero}</h1>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "6px", flexWrap: "wrap" }}>
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

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-start" }}>
            {!estaAnulada && (
              <button onClick={() => generateOTPdf(ot as unknown as Parameters<typeof generateOTPdf>[0])} style={printBtn}>
                Imprimir OT
              </button>
            )}
            {puedeEditar && (
              <button onClick={() => router.push(`/ordenes/${ot.id}/editar${empresaId ? `?empresa=${empresaId}` : ""}`)} style={secondaryBtn}>
                Editar OT
              </button>
            )}
            {estaFinalizada && (
              <>
                <button onClick={handleReabrir} style={secondaryBtn} disabled={transitioning}>
                  {transitioning ? "..." : "Reabrir OT"}
                </button>
                <button onClick={() => setConfirmEliminar(true)} style={dangerBtn} disabled={transitioning}>
                  Eliminar OT
                </button>
              </>
            )}
            {estaAnulada && (
              <button onClick={() => setConfirmEliminar(true)} style={dangerBtn} disabled={transitioning}>
                Eliminar OT
              </button>
            )}
            {transiciones.includes("finalizada") && (
              <button onClick={() => setShowEjecucion(true)} style={primaryBtn}>
                Registrar finalización
              </button>
            )}
            {transiciones.filter(t => t !== "finalizada").map(t => (
              <button key={t} onClick={() => handleTransicion(t)}
                style={t === "anulada" ? dangerBtn : secondaryBtn} disabled={transitioning}>
                {transitioning ? "..." : (TRANS_LABEL[t] || t)}
              </button>
            ))}
          </div>
        </div>

        {/* ── Barra de progreso ── */}
        {!estaAnulada && (
          <div style={progressBar}>
            {PASOS_FLUJO.map((paso, i) => {
              const isDone    = PASOS_FLUJO.indexOf(paso) < pasoActualIdx;
              const isCurrent = paso === ot.estado;
              return (
                <div key={paso} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{
                    width: "26px", height: "26px", borderRadius: "50%", flexShrink: 0,
                    background: isCurrent ? "#1a4731" : isDone ? "#86efac" : "#e5e7eb",
                    color: isCurrent ? "#fff" : isDone ? "#15803d" : "#9ca3af",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "12px", fontWeight: 700,
                  }}>
                    {isDone ? "✓" : i + 1}
                  </div>
                  <span style={{ fontSize: "12px", fontWeight: isCurrent ? 700 : 400, color: isCurrent ? "#1a4731" : isDone ? "#15803d" : "#9ca3af", whiteSpace: "nowrap" }}>
                    {PASO_LABEL[paso]}
                  </span>
                  {i < PASOS_FLUJO.length - 1 && (
                    <div style={{ width: "28px", height: "2px", background: isDone ? "#86efac" : "#e5e7eb", flexShrink: 0, margin: "0 4px" }} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Confirmaciones ── */}
        {confirmAnular && (
          <div style={alertBox}>
            <span>¿Confirmas la anulación? Esta acción no se puede deshacer.</span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => setConfirmAnular(false)} style={cancelSmall}>No</button>
              <button onClick={() => handleTransicion("anulada")} style={confirmDanger}>Sí, anular</button>
            </div>
          </div>
        )}

        {confirmEliminar && (
          <div style={alertBox}>
            <span>
              ¿Eliminar definitivamente esta OT{estaFinalizada ? " y revertir el stock descontado" : ""}?
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => setConfirmEliminar(false)} style={cancelSmall}>No</button>
              <button onClick={handleEliminar} style={confirmDanger}>Sí, eliminar</button>
            </div>
          </div>
        )}

        {transError && (
          <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", fontSize: "13px", color: "#dc2626", marginBottom: "12px" }}>
            {transError}
          </div>
        )}

        {/* ── Detalle en dos columnas ── */}
        <div style={grid2}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={card}>
              <h3 style={cardTitle}>Responsables</h3>
              <Row label="Solicitante"        value={ot.solicitante?.nombre} />
              <Row label="Responsable técnico" value={ot.responsable?.nombre} />
              <Row label="Dosificador"         value={ot.dosificador?.nombre} />
              {ot.funcion?.length   && <Row label="Función"          value={ot.funcion.join(", ")} />}
              {ot.plagas_objetivo   && <Row label="Objetivo"         value={ot.plagas_objetivo} />}
              {ot.objetivo_principal && <Row label="Objetivo principal" value={ot.objetivo_principal} />}
            </div>

            <div style={card}>
              <h3 style={cardTitle}>Cuarteles ({superficieTotal.toFixed(2)} ha total)</h3>
              {ot.ot_cuarteles.map(c => (
                <div key={c.id} style={tableRow}>
                  <span style={{ fontWeight: 600 }}>{c.cuartel.codigo}</span>
                  <span style={{ color: "#6b7280", fontSize: "13px" }}>{c.cuartel.especie} {c.cuartel.variedad}</span>
                  <span style={{ marginLeft: "auto", fontSize: "13px", fontWeight: 600 }}>{c.superficie_ha} ha</span>
                </div>
              ))}
            </div>

            {ot.ot_aplicadores.length > 0 && (
              <div style={card}>
                <h3 style={cardTitle}>Aplicador y maquinaria</h3>
                {ot.ot_aplicadores.map(a => (
                  <div key={a.id} style={tableRow}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{a.personal?.nombre ?? a.operador?.nombre ?? "—"}</div>
                      <div style={{ fontSize: "12px", color: "#6b7280" }}>
                        {a.tractor?.codigo && `Tractor: ${a.tractor.codigo}`}
                        {a.pulverizador?.codigo && ` · Implemento: ${a.pulverizador.codigo}`}
                        {a.cantidad_maquinadas != null && ` · ${a.cantidad_maquinadas} maquinadas`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(ot.ppe_traje || ot.ppe_guantes || ot.ppe_anteojos || ot.ppe_gorro || ot.ppe_mascarilla || ot.ppe_botas) && (
              <div style={card}>
                <h3 style={cardTitle}>Equipos de protección</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {ot.ppe_traje      && <span style={ppeBadge}>Traje</span>}
                  {ot.ppe_guantes    && <span style={ppeBadge}>Guantes</span>}
                  {ot.ppe_anteojos   && <span style={ppeBadge}>Anteojos</span>}
                  {ot.ppe_gorro      && <span style={ppeBadge}>Gorro</span>}
                  {ot.ppe_mascarilla && <span style={ppeBadge}>Mascarilla</span>}
                  {ot.ppe_botas      && <span style={ppeBadge}>Botas</span>}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {(ot.mojamiento_solicitado_ltha || ot.mojamiento_real_ltha) && (
              <div style={card}>
                <h3 style={cardTitle}>Mojamiento</h3>
                {ot.mojamiento_solicitado_ltha != null && <Row label="Solicitado" value={`${ot.mojamiento_solicitado_ltha} lt/ha`} />}
                {ot.mojamiento_real_ltha       != null && <Row label="Real"       value={`${ot.mojamiento_real_ltha} lt/ha`} />}
              </div>
            )}

            <div style={card}>
              <h3 style={cardTitle}>Productos a aplicar</h3>
              {ot.ot_productos.map(p => {
                const unidadDisplay = p.producto.unidad_dosis || p.dosis_unidad.split("/")[0];
                return (
                  <div key={p.id} style={{ ...tableRow, flexDirection: "column", alignItems: "flex-start", gap: "4px" }}>
                    <div style={{ fontWeight: 700 }}>{p.producto.nombre_comercial}</div>
                    {p.producto.ingrediente_activo && (
                      <div style={{ fontSize: "12px", color: "#6b7280" }}>{p.producto.ingrediente_activo}</div>
                    )}
                    <div style={{ display: "flex", gap: "16px", fontSize: "13px", marginTop: "2px", flexWrap: "wrap" }}>
                      <span>Dosis: <strong>{p.dosis_real} {p.dosis_unidad}</strong></span>
                      {p.consumo_total != null && p.consumo_total > 0 && (
                        <span>Total: <strong>{p.consumo_total} {unidadDisplay}</strong></span>
                      )}
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
                );
              })}
            </div>

            {estaFinalizada && (ot.hora_inicio || ot.viento_kmh != null || ot.temperatura_c != null) && (
              <div style={card}>
                <h3 style={cardTitle}>Datos de ejecución</h3>
                {ot.hora_inicio     && <Row label="Inicio"       value={ot.hora_inicio} />}
                {ot.hora_fin        && <Row label="Fin"          value={ot.hora_fin} />}
                {ot.viento_kmh      != null && <Row label="Viento"      value={`${ot.viento_kmh} km/h`} />}
                {ot.temperatura_c   != null && <Row label="Temperatura" value={`${ot.temperatura_c} °C`} />}
                {ot.enjuage_pulverizador_lt != null && <Row label="Enjuague" value={`${ot.enjuage_pulverizador_lt} lt`} />}
              </div>
            )}

            {ot.notas && (
              <div style={card}>
                <h3 style={cardTitle}>Notas</h3>
                <p style={{ fontSize: "14px", color: "#374151", margin: 0 }}>{ot.notas}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Modal finalizar ── */}
        {showEjecucion && (
          <div style={overlay}>
            <div style={modal}>
              <h2 style={modalTitle}>Registrar finalización</h2>
              <p style={{ fontSize: "13px", color: "#6b7280", marginBottom: "20px" }}>
                Completa los datos reales. El consumo de productos y la salida de bodega se calcularán automáticamente.
              </p>
              <div style={grid2modal}>
                <ModalField label="Hora inicio">
                  <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} style={inputStyle} />
                </ModalField>
                <ModalField label="Hora fin">
                  <input type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)} style={inputStyle} />
                </ModalField>
                <ModalField label="Viento (km/h)">
                  <input type="number" min="0" step="0.1" value={viento} onChange={e => setViento(e.target.value)} style={inputStyle} placeholder="0.0" />
                </ModalField>
                <ModalField label="Temperatura (°C)">
                  <input type="number" step="0.1" value={temperatura} onChange={e => setTemperatura(e.target.value)} style={inputStyle} placeholder="0.0" />
                </ModalField>
                <ModalField label="Mojamiento real (lt/ha) *">
                  <input type="number" min="0" step="1" value={mojamientoReal} onChange={e => setMojamientoReal(e.target.value)} style={inputStyle} placeholder="Ej. 500" />
                </ModalField>
                <ModalField label="Enjuague implemento (lt)">
                  <input type="number" min="0" step="1" value={enjuage} onChange={e => setEnjuage(e.target.value)} style={inputStyle} placeholder="0" />
                </ModalField>
              </div>
              <ModalField label="Notas finales">
                <textarea value={notas} onChange={e => setNotas(e.target.value)} style={{ ...inputStyle, height: "60px", resize: "vertical" }} />
              </ModalField>
              {!mojamientoReal && ot.ot_productos.some(p => p.dosis_unidad.includes("/100")) && (
                <p style={{ fontSize: "12px", color: "#d97706", marginTop: "8px" }}>
                  Hay productos con dosis /100lt — ingresa el mojamiento real para calcular su consumo.
                </p>
              )}
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

const container: React.CSSProperties     = { maxWidth: "1100px", margin: "0 auto", padding: "24px 20px" };
const pageHeader: React.CSSProperties    = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", flexWrap: "wrap", gap: "12px" };
const pageTitle: React.CSSProperties     = { fontSize: "24px", fontWeight: 800, color: "#1a4731", margin: "4px 0" };
const backBtn: React.CSSProperties       = { background: "transparent", border: "none", color: "#6b7280", fontSize: "13px", cursor: "pointer", padding: "0", marginBottom: "4px", fontWeight: 600 };
const estadoBadge: React.CSSProperties   = { padding: "3px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: 700, border: "1px solid" };
const progressBar: React.CSSProperties   = { display: "flex", alignItems: "center", gap: "4px", marginBottom: "20px", flexWrap: "wrap", padding: "14px 18px", background: "#f9fafb", borderRadius: "12px", border: "1px solid #e5e7eb" };
const primaryBtn: React.CSSProperties    = { padding: "8px 18px", borderRadius: "8px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "13px", border: "none", cursor: "pointer" };
const secondaryBtn: React.CSSProperties  = { padding: "8px 18px", borderRadius: "8px", border: "1.5px solid #1a4731", background: "#fff", color: "#1a4731", fontWeight: 700, fontSize: "13px", cursor: "pointer" };
const printBtn: React.CSSProperties      = { padding: "8px 18px", borderRadius: "8px", border: "1.5px solid #6b7280", background: "#fff", color: "#374151", fontWeight: 700, fontSize: "13px", cursor: "pointer" };
const dangerBtn: React.CSSProperties     = { padding: "8px 18px", borderRadius: "8px", border: "1.5px solid #fca5a5", background: "#fff", color: "#dc2626", fontWeight: 700, fontSize: "13px", cursor: "pointer" };
const alertBox: React.CSSProperties      = { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: "#dc2626", gap: "12px", flexWrap: "wrap" };
const cancelSmall: React.CSSProperties   = { padding: "6px 14px", borderRadius: "7px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "13px", cursor: "pointer" };
const confirmDanger: React.CSSProperties = { padding: "6px 14px", borderRadius: "7px", background: "#dc2626", color: "#fff", fontWeight: 700, fontSize: "13px", border: "none", cursor: "pointer" };
const grid2: React.CSSProperties         = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" };
const card: React.CSSProperties          = { background: "#fff", borderRadius: "14px", border: "1px solid #e5e7eb", padding: "18px 20px" };
const cardTitle: React.CSSProperties     = { fontSize: "13px", fontWeight: 700, color: "#1a4731", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "12px" };
const tableRow: React.CSSProperties      = { display: "flex", alignItems: "center", gap: "8px", padding: "8px 0", borderBottom: "1px solid #f3f4f6" };
const ppeBadge: React.CSSProperties      = { padding: "3px 10px", borderRadius: "999px", background: "#f0fdf4", color: "#15803d", fontSize: "12px", fontWeight: 600, border: "1px solid #86efac" };
const overlay: React.CSSProperties       = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 };
const modal: React.CSSProperties         = { background: "#fff", borderRadius: "16px", padding: "28px", width: "90%", maxWidth: "560px", boxShadow: "0 8px 32px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" };
const modalTitle: React.CSSProperties    = { fontSize: "18px", fontWeight: 800, color: "#1a4731", marginBottom: "8px" };
const grid2modal: React.CSSProperties    = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" };
const inputStyle: React.CSSProperties    = { padding: "9px 12px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "14px", background: "#fafafa", color: "#111", width: "100%", boxSizing: "border-box" };

export default function OTDetallePage() { return <Suspense><OTDetalleContent /></Suspense>; }
