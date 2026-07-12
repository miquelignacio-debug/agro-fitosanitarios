"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import type { MonitoreoSesion, MonitoreoLinea, Personal } from "@/lib/types";
import { ESTADOS_MONITOREO, ESTADOS_MONITOREO_COLOR } from "@/lib/types";
import { INCIDENCIA_CONFIG } from "@/lib/monitoreoData";

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function MonitoreoDetailContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const empresaId = searchParams.get("empresa") || "";
  const id = params.id as string;

  const [sesion, setSesion] = useState<MonitoreoSesion | null>(null);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Review state
  const [revisorId, setRevisorId] = useState("");
  const [notasRevision, setNotasRevision] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!id) return;
    load();
    supabase
      .from("personal")
      .select("*")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => setPersonal((data as Personal[]) || []));
  }, [id]);

  const load = async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from("monitoreos")
      .select(
        `*,
        cuartel:cuarteles(codigo,especie,variedad,superficie_real),
        monitor:personal!monitor_id(nombre,cargo),
        revisor:personal!revisor_id(nombre),
        lineas:monitoreo_lineas(*)`
      )
      .eq("id", id)
      .single();
    if (err || !data) {
      setError("No se encontró la sesión de monitoreo.");
    } else {
      setSesion(data as MonitoreoSesion);
    }
    setLoading(false);
  };

  const handleEnviar = async () => {
    setSaving(true);
    const { error: err } = await supabase
      .from("monitoreos")
      .update({ estado: "enviado", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (err) { setError(err.message); setSaving(false); return; }
    await load();
    setSaving(false);
  };

  const handleRevisar = async () => {
    if (!revisorId) { setError("Seleccioná el revisor."); return; }
    setSaving(true);
    const { error: err } = await supabase
      .from("monitoreos")
      .update({
        estado: "revisado",
        revisor_id: revisorId,
        fecha_revision: new Date().toISOString().slice(0, 10),
        notas_revision: notasRevision.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (err) { setError(err.message); setSaving(false); return; }
    await load();
    setSaving(false);
  };

  const handleDelete = async () => {
    setSaving(true);
    const { error: err } = await supabase
      .from("monitoreos")
      .delete()
      .eq("id", id);
    if (err) { setError(err.message); setSaving(false); return; }
    router.push(`/monitoreos?empresa=${empresaId}`);
  };

  if (loading) {
    return (
      <>
        <Nav empresaId={empresaId} />
        <main style={container}>
          <p style={{ color: "#6b7280" }}>Cargando...</p>
        </main>
      </>
    );
  }

  if (error && !sesion) {
    return (
      <>
        <Nav empresaId={empresaId} />
        <main style={container}>
          <p style={{ color: "#dc2626" }}>{error}</p>
          <Link href={`/monitoreos?empresa=${empresaId}`} style={backLink}>
            ← Volver a monitoreos
          </Link>
        </main>
      </>
    );
  }

  if (!sesion) return null;

  const lineas: MonitoreoLinea[] = (sesion.lineas || []).slice().sort(
    (a, b) => a.tipo.localeCompare(b.tipo)
  );
  const plagas = lineas.filter((l) => l.tipo === "plaga");
  const enfermedades = lineas.filter((l) => l.tipo === "enfermedad");
  const con_presencia = lineas.filter((l) => l.incidencia > 0);
  const altos = lineas.filter((l) => l.incidencia >= 3);
  const estadoColor = ESTADOS_MONITOREO_COLOR[sesion.estado];
  const monitor = sesion.monitor as unknown as { nombre: string; cargo: string | null } | undefined;
  const revisor = sesion.revisor as unknown as { nombre: string } | undefined;
  const cuartel = sesion.cuartel as unknown as { codigo: string; especie: string; variedad: string; superficie_real: number | null } | undefined;

  return (
    <>
      <Nav empresaId={empresaId} />
      <main style={container}>
        {/* Back */}
        <Link href={`/monitoreos?empresa=${empresaId}`} style={backLink}>
          ← Monitoreos
        </Link>

        {/* Header */}
        <div style={headerRow}>
          <div>
            <h1 style={pageTitle}>
              MON-{String(sesion.numero).padStart(3, "0")}
            </h1>
            <p style={pageSubtitle}>
              {cuartel?.codigo} · {sesion.especie} {cuartel?.variedad}
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
            <span
              style={{
                ...estadoPill,
                background: estadoColor + "18",
                color: estadoColor,
                borderColor: estadoColor + "50",
              }}
            >
              {ESTADOS_MONITOREO[sesion.estado]}
            </span>
            {sesion.estado === "borrador" && (
              <button onClick={handleEnviar} style={sendBtn} disabled={saving}>
                Enviar para revisión →
              </button>
            )}
          </div>
        </div>

        {/* Alertas altas */}
        {altos.length > 0 && (
          <div style={alertaBanner}>
            <strong>🔴 {altos.length} nivel(es) ALTO detectado(s):</strong>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
              {altos.map((l) => (
                <span
                  key={l.id}
                  style={{
                    padding: "4px 12px",
                    borderRadius: "999px",
                    background: "#fef2f2",
                    color: "#dc2626",
                    fontSize: "12px",
                    fontWeight: 700,
                    border: "1px solid #fca5a5",
                  }}
                >
                  {l.problema.split("(")[0].trim()} — Nivel {l.incidencia}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── INFORMACIÓN GENERAL ── */}
        <section style={section}>
          <h2 style={sectionTitle}>Información de la sesión</h2>
          <div style={infoGrid}>
            <InfoRow label="Fecha" value={fmtDate(sesion.fecha)} />
            <InfoRow label="Cuartel" value={cuartel?.codigo || "—"} />
            <InfoRow label="Especie / Variedad" value={`${sesion.especie} ${cuartel?.variedad || ""}`} />
            {cuartel?.superficie_real && (
              <InfoRow label="Superficie" value={`${cuartel.superficie_real} ha`} />
            )}
            <InfoRow
              label="Monitor"
              value={monitor ? `${monitor.nombre}${monitor.cargo ? ` — ${monitor.cargo}` : ""}` : "Sin asignar"}
            />
            {sesion.hora_inicio && (
              <InfoRow label="Hora inicio" value={sesion.hora_inicio} />
            )}
            {sesion.temperatura_c !== null && (
              <InfoRow label="Temperatura" value={`${sesion.temperatura_c} °C`} />
            )}
            {sesion.humedad_pct !== null && (
              <InfoRow label="Humedad relativa" value={`${sesion.humedad_pct} %`} />
            )}
          </div>
          <div style={{ marginTop: "14px" }}>
            <span style={fenoBadge}>{sesion.estado_fenologico}</span>
          </div>
          {sesion.observaciones_generales && (
            <p style={{ marginTop: "12px", fontSize: "13px", color: "#374151", lineHeight: 1.6 }}>
              {sesion.observaciones_generales}
            </p>
          )}
        </section>

        {/* Foto general */}
        {sesion.foto_general_url && (
          <section style={section}>
            <h2 style={sectionTitle}>Foto general del cuartel</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sesion.foto_general_url}
              alt="Vista general del cuartel"
              style={fotoGeneral}
            />
          </section>
        )}

        {/* ── RESUMEN DE RESULTADOS ── */}
        <section style={section}>
          <h2 style={sectionTitle}>Resumen — {lineas.length} ítems evaluados</h2>
          <div style={resumenBar}>
            <div style={resumenStat}>
              <span style={{ fontSize: "22px", fontWeight: 800, color: con_presencia.length > 0 ? "#ea580c" : "#15803d" }}>
                {con_presencia.length}
              </span>
              <span style={{ fontSize: "12px", color: "#6b7280" }}>con presencia</span>
            </div>
            <div style={resumenStat}>
              <span style={{ fontSize: "22px", fontWeight: 800, color: altos.length > 0 ? "#dc2626" : "#9ca3af" }}>
                {altos.length}
              </span>
              <span style={{ fontSize: "12px", color: "#6b7280" }}>nivel alto</span>
            </div>
            <div style={resumenStat}>
              <span style={{ fontSize: "22px", fontWeight: 800, color: "#1a4731" }}>
                {lineas.length - con_presencia.length}
              </span>
              <span style={{ fontSize: "12px", color: "#6b7280" }}>sin presencia</span>
            </div>
          </div>
        </section>

        {/* ── PLAGAS ── */}
        {plagas.length > 0 && (
          <section style={section}>
            <h2 style={sectionTitle}>🐛 Plagas</h2>
            <div style={lineasGrid}>
              {plagas.map((l) => (
                <LineaCard key={l.id} linea={l} />
              ))}
            </div>
          </section>
        )}

        {/* ── ENFERMEDADES ── */}
        {enfermedades.length > 0 && (
          <section style={section}>
            <h2 style={sectionTitle}>🍄 Enfermedades</h2>
            <div style={lineasGrid}>
              {enfermedades.map((l) => (
                <LineaCard key={l.id} linea={l} />
              ))}
            </div>
          </section>
        )}

        {/* ── REVISIÓN ── */}
        {sesion.estado === "enviado" && (
          <section style={{ ...section, border: "2px solid #fcd34d", background: "#fffbeb" }}>
            <h2 style={{ ...sectionTitle, color: "#92400e" }}>
              ✍ Revisión técnica
            </h2>
            <p style={{ fontSize: "13px", color: "#78350f", marginBottom: "16px" }}>
              Revisá los resultados y confirmá la sesión. Podés agregar notas y,
              si corresponde, generar una OT de control.
            </p>
            <div style={formGrid}>
              <div>
                <label style={lbl}>Revisor *</label>
                <select
                  value={revisorId}
                  onChange={(e) => setRevisorId(e.target.value)}
                  style={inp}
                >
                  <option value="">Seleccioná el revisor...</option>
                  {personal.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} {p.cargo ? `— ${p.cargo}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ marginTop: "14px" }}>
              <label style={lbl}>Notas de revisión</label>
              <textarea
                value={notasRevision}
                onChange={(e) => setNotasRevision(e.target.value)}
                style={{ ...inp, height: "90px", resize: "vertical" }}
                placeholder="Evaluación técnica, decisiones, observaciones adicionales..."
              />
            </div>
            {error && <p style={{ color: "#dc2626", fontSize: "13px", marginTop: "8px" }}>{error}</p>}
            <div style={{ display: "flex", gap: "10px", marginTop: "16px", flexWrap: "wrap" }}>
              <button
                onClick={handleRevisar}
                style={reviewBtn}
                disabled={saving}
              >
                {saving ? "Guardando..." : "✓ Marcar como revisado"}
              </button>
              {con_presencia.length > 0 && (
                <Link
                  href={`/ordenes/nueva?empresa=${empresaId}&cuartel_id=${sesion.cuartel_id}&monitoreo=${sesion.id}`}
                  style={otBtn}
                >
                  + Crear OT de control
                </Link>
              )}
            </div>
          </section>
        )}

        {/* ── REVISADO ── */}
        {sesion.estado === "revisado" && (
          <section style={{ ...section, border: "2px solid #86efac", background: "#f0fdf4" }}>
            <h2 style={{ ...sectionTitle, color: "#15803d" }}>
              ✓ Revisión completada
            </h2>
            <div style={infoGrid}>
              <InfoRow label="Revisado por" value={revisor?.nombre || "—"} />
              <InfoRow
                label="Fecha revisión"
                value={sesion.fecha_revision ? fmtDate(sesion.fecha_revision) : "—"}
              />
            </div>
            {sesion.notas_revision && (
              <div
                style={{
                  marginTop: "12px",
                  background: "#dcfce7",
                  border: "1px solid #86efac",
                  borderRadius: "8px",
                  padding: "12px 14px",
                  fontSize: "13px",
                  color: "#14532d",
                  lineHeight: 1.6,
                }}
              >
                <strong>Notas técnicas:</strong> {sesion.notas_revision}
              </div>
            )}
            {con_presencia.length > 0 && (
              <div style={{ marginTop: "14px" }}>
                <Link
                  href={`/ordenes/nueva?empresa=${empresaId}&cuartel_id=${sesion.cuartel_id}`}
                  style={otBtn}
                >
                  + Crear OT de control
                </Link>
              </div>
            )}
          </section>
        )}

        {/* ── ACCIONES ── */}
        <section style={{ ...section, background: "#f9fafb" }}>
          <h2 style={{ ...sectionTitle, color: "#6b7280" }}>Acciones</h2>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {sesion.estado === "borrador" && (
              <button onClick={handleEnviar} style={sendBtn} disabled={saving}>
                Enviar para revisión →
              </button>
            )}
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                style={deleteBtn}
              >
                Eliminar sesión
              </button>
            ) : (
              <>
                <button
                  onClick={handleDelete}
                  style={confirmDeleteBtn}
                  disabled={saving}
                >
                  Confirmar eliminación
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={cancelBtn}
                >
                  Cancelar
                </button>
              </>
            )}
          </div>
        </section>
      </main>
    </>
  );
}

// ── Componente línea individual ──────────────────────────────────────────

function LineaCard({ linea }: { linea: MonitoreoLinea }) {
  const cfg = INCIDENCIA_CONFIG[linea.incidencia];
  const [showMetodo, setShowMetodo] = useState(false);

  return (
    <div
      style={{
        ...lineaCard,
        borderColor: linea.incidencia > 0 ? cfg.border : "#e5e7eb",
        background: linea.incidencia > 0 ? cfg.bg : "#fafafa",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
        <div style={{ flex: 1 }}>
          <span
            style={{
              ...tipoBadge,
              background: linea.tipo === "plaga" ? "#fef2f2" : "#f0fdf4",
              color: linea.tipo === "plaga" ? "#dc2626" : "#15803d",
            }}
          >
            {linea.tipo === "plaga" ? "PLAGA" : "ENFERMEDAD"}
          </span>
          <p style={{ fontWeight: 700, fontSize: "14px", color: "#111827", marginTop: "4px", lineHeight: 1.3 }}>
            {linea.problema}
          </p>
        </div>
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              background: cfg.color,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "18px",
              fontWeight: 900,
            }}
          >
            {linea.incidencia}
          </div>
          <p style={{ fontSize: "10px", color: cfg.color, fontWeight: 700, marginTop: "3px", maxWidth: "60px", textAlign: "center", lineHeight: 1.2 }}>
            {cfg.label.split("(")[0].trim()}
          </p>
        </div>
      </div>

      {/* Metodología */}
      <button onClick={() => setShowMetodo(!showMetodo)} style={metodoToggle}>
        {showMetodo ? "▲ Ocultar metodología" : "ℹ Ver metodología"}
      </button>
      {showMetodo && (
        <div style={metodoBox}>{linea.metodologia}</div>
      )}

      {/* Foto */}
      {linea.foto_url && (
        <a href={linea.foto_url} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={linea.foto_url}
            alt={`Foto: ${linea.problema}`}
            style={{ width: "100%", maxHeight: "180px", objectFit: "cover", borderRadius: "8px", border: "1px solid #e5e7eb", display: "block" }}
          />
        </a>
      )}

      {/* Observaciones */}
      {linea.observaciones && (
        <p style={{ fontSize: "13px", color: "#374151", background: "#f9fafb", borderRadius: "6px", padding: "8px 10px", lineHeight: 1.5 }}>
          {linea.observaciones}
        </p>
      )}

      {/* Sin foto cuando hay presencia */}
      {linea.incidencia > 0 && !linea.foto_url && (
        <p style={{ fontSize: "12px", color: "#b45309", fontWeight: 600 }}>
          ⚠ Sin foto de evidencia
        </p>
      )}
    </div>
  );
}

// ── Info row helper ───────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ fontSize: "11px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </span>
      <p style={{ fontSize: "14px", fontWeight: 600, color: "#111827", marginTop: "2px" }}>
        {value}
      </p>
    </div>
  );
}

export default function MonitoreoDetailPage() {
  return (
    <Suspense>
      <MonitoreoDetailContent />
    </Suspense>
  );
}

// ── Estilos ────────────────────────────────────────────────────────────────
const container: React.CSSProperties = { maxWidth: "900px", margin: "0 auto", padding: "20px 20px 80px" };
const backLink: React.CSSProperties = { fontSize: "13px", fontWeight: 700, color: "#1a4731", textDecoration: "none", display: "inline-block", marginBottom: "16px" };
const headerRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", gap: "12px", flexWrap: "wrap" };
const pageTitle: React.CSSProperties = { fontSize: "28px", fontWeight: 900, color: "#1a4731" };
const pageSubtitle: React.CSSProperties = { fontSize: "14px", color: "#6b7280", marginTop: "4px" };
const estadoPill: React.CSSProperties = { padding: "5px 14px", borderRadius: "999px", fontSize: "13px", fontWeight: 700, border: "1px solid" };
const sendBtn: React.CSSProperties = { padding: "10px 20px", borderRadius: "10px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "13px", border: "none", cursor: "pointer" };
const alertaBanner: React.CSSProperties = { background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: "12px", padding: "14px 18px", marginBottom: "18px" };
const section: React.CSSProperties = { background: "#fff", borderRadius: "14px", border: "1px solid #e5e7eb", padding: "20px 22px", marginBottom: "18px" };
const sectionTitle: React.CSSProperties = { fontSize: "15px", fontWeight: 700, color: "#1a4731", marginBottom: "14px" };
const infoGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "14px" };
const fenoBadge: React.CSSProperties = { display: "inline-block", padding: "6px 14px", borderRadius: "8px", background: "#f0fdf4", border: "1px solid #86efac", color: "#14532d", fontSize: "13px", fontWeight: 600 };
const fotoGeneral: React.CSSProperties = { width: "100%", maxHeight: "300px", objectFit: "cover", borderRadius: "10px", border: "1px solid #e5e7eb", display: "block" };
const resumenBar: React.CSSProperties = { display: "flex", gap: "24px", flexWrap: "wrap" };
const resumenStat: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" };
const lineasGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "14px" };
const lineaCard: React.CSSProperties = { borderRadius: "12px", border: "1.5px solid", padding: "14px", display: "flex", flexDirection: "column", gap: "10px" };
const tipoBadge: React.CSSProperties = { fontSize: "10px", fontWeight: 800, padding: "2px 8px", borderRadius: "999px", letterSpacing: "0.04em", display: "inline-block" };
const metodoToggle: React.CSSProperties = { padding: "4px 10px", borderRadius: "6px", border: "1px solid #d1d5db", background: "#f9fafb", color: "#6b7280", fontSize: "12px", cursor: "pointer", textAlign: "left" };
const metodoBox: React.CSSProperties = { fontSize: "12px", color: "#374151", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "10px 12px", lineHeight: 1.6 };
const formGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" };
const lbl: React.CSSProperties = { display: "block", fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "5px" };
const inp: React.CSSProperties = { padding: "9px 12px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "14px", background: "#fff", color: "#111", width: "100%", boxSizing: "border-box" };
const reviewBtn: React.CSSProperties = { padding: "11px 22px", borderRadius: "10px", background: "#15803d", color: "#fff", fontWeight: 700, fontSize: "14px", border: "none", cursor: "pointer" };
const otBtn: React.CSSProperties = { padding: "11px 22px", borderRadius: "10px", background: "#1d4ed8", color: "#fff", fontWeight: 700, fontSize: "14px", textDecoration: "none", display: "inline-block" };
const deleteBtn: React.CSSProperties = { padding: "10px 18px", borderRadius: "10px", border: "1px solid #fca5a5", background: "#fff", color: "#dc2626", fontWeight: 600, fontSize: "13px", cursor: "pointer" };
const confirmDeleteBtn: React.CSSProperties = { padding: "10px 18px", borderRadius: "10px", background: "#dc2626", color: "#fff", fontWeight: 700, fontSize: "13px", border: "none", cursor: "pointer" };
const cancelBtn: React.CSSProperties = { padding: "10px 18px", borderRadius: "10px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "13px", cursor: "pointer" };
