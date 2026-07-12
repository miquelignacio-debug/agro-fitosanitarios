"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import type { Cuartel, Personal } from "@/lib/types";
import {
  getChecklist,
  getEstadosFenologicos,
  getAllItems,
  INCIDENCIA_CONFIG,
  type ChecklistItem,
} from "@/lib/monitoreoData";

type LineaForm = ChecklistItem & {
  incidencia: number;
  observaciones: string;
  foto: File | null;
  fotoPreview: string | null;
  showMetodo: boolean;
};

function NuevaMonitoreoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const empresaId = searchParams.get("empresa") || "";

  const [cuarteles, setCuarteles] = useState<Cuartel[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [cuartelId, setCuartelId] = useState("");
  const [cuartel, setCuartel] = useState<Cuartel | null>(null);
  const [monitorId, setMonitorId] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [horaInicio, setHoraInicio] = useState("");
  const [estadoFenologico, setEstadoFenologico] = useState("");
  const [temperatura, setTemperatura] = useState("");
  const [humedad, setHumedad] = useState("");
  const [obsGenerales, setObsGenerales] = useState("");
  const [fotoGeneral, setFotoGeneral] = useState<File | null>(null);
  const [fotoGeneralPreview, setFotoGeneralPreview] = useState<string | null>(null);
  const [lineas, setLineas] = useState<LineaForm[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fotoGeneralRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!empresaId) return;
    supabase.from("cuarteles").select("*").eq("empresa_id", empresaId).eq("activo", true).order("codigo")
      .then(({ data }) => setCuarteles((data as Cuartel[]) || []));
    supabase.from("personal").select("*").eq("activo", true).order("nombre")
      .then(({ data }) => setPersonal((data as Personal[]) || []));
  }, [empresaId]);

  const handleCuartelChange = (id: string) => {
    setCuartelId(id);
    setEstadoFenologico("");
    if (!id) {
      setCuartel(null);
      setLineas([]);
      return;
    }
    const c = cuarteles.find((x) => x.id === id) || null;
    setCuartel(c);
    if (c) {
      const checklist = getChecklist(c.especie);
      if (checklist) {
        setLineas(
          getAllItems(checklist).map((item) => ({
            ...item,
            incidencia: 0,
            observaciones: "",
            foto: null,
            fotoPreview: null,
            showMetodo: false,
          }))
        );
      } else {
        setLineas([]);
      }
    }
  };

  const setLineaField = <K extends keyof LineaForm>(
    index: number,
    field: K,
    value: LineaForm[K]
  ) => {
    setLineas((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [field]: value } : l))
    );
  };

  const handleFotoLinea = (index: number, file: File | null) => {
    if (file === null) {
      setLineas((prev) =>
        prev.map((l, i) => (i === index ? { ...l, foto: null, fotoPreview: null } : l))
      );
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("La foto no puede superar 10 MB. Por favor usá una resolución menor.");
      return;
    }
    const preview = URL.createObjectURL(file);
    setLineas((prev) =>
      prev.map((l, i) =>
        i === index ? { ...l, foto: file, fotoPreview: preview } : l
      )
    );
  };

  const handleFotoGeneral = (file: File | null) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("La foto no puede superar 10 MB.");
      return;
    }
    setFotoGeneral(file);
    setFotoGeneralPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (targetEstado: "borrador" | "enviado") => {
    setError("");
    if (!cuartelId) { setError("Seleccioná un cuartel."); return; }
    if (!estadoFenologico) { setError("Seleccioná el estado fenológico."); return; }

    if (targetEstado === "enviado") {
      if (!fotoGeneral) {
        setError("Se requiere una foto general del cuartel para enviar a revisión.");
        return;
      }
      const sinFoto = lineas.filter((l) => l.incidencia > 0 && !l.foto);
      if (sinFoto.length > 0) {
        setError(
          `Falta foto de evidencia en: ${sinFoto.map((l) => l.nombre).join(", ")}`
        );
        return;
      }
    }

    setSaving(true);
    const monitoreoId = crypto.randomUUID();

    // Subir foto general
    let fotoGeneralUrl: string | null = null;
    if (fotoGeneral) {
      const path = `${empresaId}/${monitoreoId}/general.jpg`;
      const { error: upErr } = await supabase.storage
        .from("monitoreo-fotos")
        .upload(path, fotoGeneral);
      if (!upErr) {
        fotoGeneralUrl = supabase.storage
          .from("monitoreo-fotos")
          .getPublicUrl(path).data.publicUrl;
      }
    }

    // Subir fotos de líneas en paralelo
    const urlsLineas = await Promise.all(
      lineas.map(async (l, i) => {
        if (!l.foto) return null;
        const path = `${empresaId}/${monitoreoId}/linea_${i}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("monitoreo-fotos")
          .upload(path, l.foto);
        if (upErr) return null;
        return supabase.storage
          .from("monitoreo-fotos")
          .getPublicUrl(path).data.publicUrl;
      })
    );

    // Número correlativo
    const { data: nextNum, error: fnErr } = await supabase.rpc(
      "siguiente_numero_monitoreo",
      { p_empresa_id: empresaId }
    );
    if (fnErr) {
      setError(`Error al obtener número: ${fnErr.message}`);
      setSaving(false);
      return;
    }

    // Insertar sesión
    const { error: sesErr } = await supabase.from("monitoreos").insert({
      id: monitoreoId,
      numero: nextNum as number,
      empresa_id: empresaId,
      cuartel_id: cuartelId,
      monitor_id: monitorId || null,
      fecha,
      hora_inicio: horaInicio || null,
      especie: cuartel?.especie || "",
      estado_fenologico: estadoFenologico,
      temperatura_c: temperatura ? parseFloat(temperatura) : null,
      humedad_pct: humedad ? parseFloat(humedad) : null,
      observaciones_generales: obsGenerales.trim() || null,
      foto_general_url: fotoGeneralUrl,
      estado: targetEstado,
    });
    if (sesErr) {
      setError(`Error al guardar: ${sesErr.message}`);
      setSaving(false);
      return;
    }

    // Insertar líneas
    if (lineas.length > 0) {
      const lineasPayload = lineas.map((l, i) => ({
        monitoreo_id: monitoreoId,
        problema: l.nombre,
        tipo: l.tipo,
        metodologia: l.metodologia,
        presencia: l.incidencia > 0,
        incidencia: l.incidencia,
        observaciones: l.observaciones.trim() || null,
        foto_url: urlsLineas[i] || null,
      }));
      const { error: linErr } = await supabase
        .from("monitoreo_lineas")
        .insert(lineasPayload);
      if (linErr) {
        setError(
          `Monitoreo guardado pero error en checklist: ${linErr.message}`
        );
        setSaving(false);
        return;
      }
    }

    router.push(`/monitoreos/${monitoreoId}?empresa=${empresaId}`);
  };

  const checklist = cuartel ? getChecklist(cuartel.especie) : null;
  const estFenos = cuartel ? getEstadosFenologicos(cuartel.especie) : [];

  const plagas = lineas.filter((l) => l.tipo === "plaga");
  const enfermedades = lineas.filter((l) => l.tipo === "enfermedad");
  const tieneChecklist = lineas.length > 0;
  const tienePresencias = lineas.some((l) => l.incidencia > 0);

  return (
    <>
      <Nav empresaId={empresaId} />
      <main style={container}>
        <h1 style={pageTitle}>Nueva sesión de monitoreo</h1>

        {/* ── INFORMACIÓN GENERAL ── */}
        <section style={section}>
          <h2 style={sectionTitle}>Información general</h2>
          <div style={formGrid}>
            <div>
              <label style={lbl}>Cuartel *</label>
              <select
                value={cuartelId}
                onChange={(e) => handleCuartelChange(e.target.value)}
                style={inp}
              >
                <option value="">Seleccioná un cuartel...</option>
                {cuarteles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} — {c.especie} {c.variedad}
                  </option>
                ))}
              </select>
              {cuartel && !checklist && (
                <p style={warn}>
                  ⚠ La especie "{cuartel.especie}" no tiene checklist definido.
                  Disponible para: cereza, uva de mesa.
                </p>
              )}
            </div>
            <div>
              <label style={lbl}>Fecha *</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                style={inp}
              />
            </div>
            <div>
              <label style={lbl}>Monitor (quien recorre)</label>
              <select
                value={monitorId}
                onChange={(e) => setMonitorId(e.target.value)}
                style={inp}
              >
                <option value="">Sin asignar</option>
                {personal.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} {p.cargo ? `— ${p.cargo}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={lbl}>Hora inicio</label>
              <input
                type="time"
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
                style={inp}
              />
            </div>
          </div>
        </section>

        {/* ── CONDICIONES CLIMÁTICAS ── */}
        <section style={section}>
          <h2 style={sectionTitle}>Condiciones climáticas</h2>
          <div style={formGrid}>
            <div>
              <label style={lbl}>Temperatura (°C)</label>
              <input
                type="number"
                value={temperatura}
                onChange={(e) => setTemperatura(e.target.value)}
                style={inp}
                placeholder="Ej: 22"
                min={-10}
                max={60}
                step={0.5}
              />
            </div>
            <div>
              <label style={lbl}>Humedad relativa (%)</label>
              <input
                type="number"
                value={humedad}
                onChange={(e) => setHumedad(e.target.value)}
                style={inp}
                placeholder="Ej: 65"
                min={0}
                max={100}
              />
            </div>
          </div>
        </section>

        {/* ── ESTADO FENOLÓGICO ── */}
        {tieneChecklist && (
          <section style={section}>
            <h2 style={sectionTitle}>Estado fenológico *</h2>
            <p style={hint}>
              Indicá el estado actual del cultivo en el cuartel {cuartel?.codigo}.
            </p>
            <select
              value={estadoFenologico}
              onChange={(e) => setEstadoFenologico(e.target.value)}
              style={{ ...inp, maxWidth: "500px" }}
            >
              <option value="">Seleccioná el estado fenológico...</option>
              {estFenos.map((ef) => (
                <option key={ef} value={ef}>
                  {ef}
                </option>
              ))}
            </select>
          </section>
        )}

        {/* ── FOTO GENERAL ── */}
        {tieneChecklist && (
          <section style={section}>
            <h2 style={sectionTitle}>
              Foto general del cuartel{" "}
              <span style={{ color: "#dc2626", fontSize: "13px" }}>
                * (requerida para enviar)
              </span>
            </h2>
            <p style={hint}>
              Tomá una foto representativa del cuartel al inicio del recorrido.
            </p>
            <div style={fotoUploadArea}>
              {fotoGeneralPreview ? (
                <div style={fotoPreviewWrap}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fotoGeneralPreview}
                    alt="Vista general"
                    style={fotoPreviewImg}
                  />
                  <button
                    onClick={() => {
                      setFotoGeneral(null);
                      setFotoGeneralPreview(null);
                    }}
                    style={removeFotoBtn}
                  >
                    ✕ Quitar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fotoGeneralRef.current?.click()}
                  style={fotoBtn}
                >
                  📷 Tomar / Seleccionar foto
                </button>
              )}
              <input
                ref={fotoGeneralRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => handleFotoGeneral(e.target.files?.[0] || null)}
              />
            </div>
          </section>
        )}

        {/* ── CHECKLIST ── */}
        {tieneChecklist && (
          <>
            {/* Plagas */}
            <section style={section}>
              <h2 style={sectionTitle}>
                🐛 Plagas ({plagas.length} ítems)
              </h2>
              <p style={hint}>
                Para cada plaga: seleccioná el nivel de incidencia y adjuntá foto
                si hay presencia.
              </p>
              <div style={checklistGrid}>
                {plagas.map((l, rawIdx) => {
                  const idx = lineas.indexOf(l);
                  return (
                    <ChecklistCard
                      key={l.id}
                      linea={l}
                      onIncidencia={(v) => setLineaField(idx, "incidencia", v)}
                      onObs={(v) => setLineaField(idx, "observaciones", v)}
                      onFoto={(f) => handleFotoLinea(idx, f)}
                      onToggleMetodo={() =>
                        setLineaField(idx, "showMetodo", !l.showMetodo)
                      }
                    />
                  );
                })}
              </div>
            </section>

            {/* Enfermedades */}
            <section style={section}>
              <h2 style={sectionTitle}>
                🍄 Enfermedades ({enfermedades.length} ítems)
              </h2>
              <div style={checklistGrid}>
                {enfermedades.map((l) => {
                  const idx = lineas.indexOf(l);
                  return (
                    <ChecklistCard
                      key={l.id}
                      linea={l}
                      onIncidencia={(v) => setLineaField(idx, "incidencia", v)}
                      onObs={(v) => setLineaField(idx, "observaciones", v)}
                      onFoto={(f) => handleFotoLinea(idx, f)}
                      onToggleMetodo={() =>
                        setLineaField(idx, "showMetodo", !l.showMetodo)
                      }
                    />
                  );
                })}
              </div>
            </section>
          </>
        )}

        {/* ── OBSERVACIONES GENERALES ── */}
        {tieneChecklist && (
          <section style={section}>
            <h2 style={sectionTitle}>Observaciones generales</h2>
            <textarea
              value={obsGenerales}
              onChange={(e) => setObsGenerales(e.target.value)}
              style={{ ...inp, height: "90px", resize: "vertical" }}
              placeholder="Condiciones generales del cuartel, notas adicionales..."
            />
          </section>
        )}

        {/* ── RESUMEN ── */}
        {tienePresencias && (
          <section style={{ ...section, background: "#fff7ed", borderColor: "#fdba74" }}>
            <h2 style={{ ...sectionTitle, color: "#92400e" }}>
              Resumen de presencias detectadas
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {lineas
                .filter((l) => l.incidencia > 0)
                .map((l) => {
                  const cfg = INCIDENCIA_CONFIG[l.incidencia];
                  return (
                    <span
                      key={l.id}
                      style={{
                        padding: "5px 12px",
                        borderRadius: "999px",
                        background: cfg.bg,
                        color: cfg.color,
                        border: `1px solid ${cfg.border}`,
                        fontSize: "12px",
                        fontWeight: 700,
                      }}
                    >
                      {l.nombre.split("(")[0].trim()} — Nivel {l.incidencia}
                    </span>
                  );
                })}
            </div>
          </section>
        )}

        {/* ── ERROR ── */}
        {error && (
          <div style={errorBox}>{error}</div>
        )}

        {/* ── BOTONES ── */}
        {tieneChecklist && (
          <div style={actionBar}>
            <button
              onClick={() => router.back()}
              style={cancelBtn}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              onClick={() => handleSubmit("borrador")}
              style={draftBtn}
              disabled={saving}
            >
              {saving ? "Guardando..." : "Guardar borrador"}
            </button>
            <button
              onClick={() => handleSubmit("enviado")}
              style={sendBtn}
              disabled={saving}
            >
              {saving ? "Enviando..." : "Enviar para revisión →"}
            </button>
          </div>
        )}

        {!tieneChecklist && !cuartelId && (
          <div style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}>
            Seleccioná un cuartel para comenzar el monitoreo.
          </div>
        )}
      </main>
    </>
  );
}

// ── Componente tarjeta de checklist ───────────────────────────────────────

function ChecklistCard({
  linea,
  onIncidencia,
  onObs,
  onFoto,
  onToggleMetodo,
}: {
  linea: LineaForm;
  onIncidencia: (v: number) => void;
  onObs: (v: string) => void;
  onFoto: (f: File | null) => void;
  onToggleMetodo: () => void;
}) {
  const fotoRef = useRef<HTMLInputElement>(null);
  const cfg = INCIDENCIA_CONFIG[linea.incidencia];
  const needsFoto = linea.incidencia > 0 && !linea.foto;

  return (
    <div
      style={{
        ...itemCard,
        borderColor: linea.incidencia > 0 ? cfg.border : "#e5e7eb",
        background: linea.incidencia > 0 ? cfg.bg : "#fff",
      }}
    >
      {/* Header */}
      <div style={itemHeader}>
        <div style={itemNameWrap}>
          <span
            style={{
              ...tipoBadge,
              background:
                linea.tipo === "plaga"
                  ? "#fef2f2"
                  : "#f0fdf4",
              color:
                linea.tipo === "plaga"
                  ? "#dc2626"
                  : "#15803d",
            }}
          >
            {linea.tipo === "plaga" ? "PLAGA" : "ENFERMEDAD"}
          </span>
          <span style={itemName}>{linea.nombre}</span>
        </div>
        <button onClick={onToggleMetodo} style={metodoToggle}>
          {linea.showMetodo ? "▲ Ocultar" : "ℹ Metodología"}
        </button>
      </div>

      {/* Metodología expandible */}
      {linea.showMetodo && (
        <div style={metodoBox}>{linea.metodologia}</div>
      )}

      {/* Incidencia */}
      <div>
        <label style={lbl}>Nivel de incidencia</label>
        <div style={incidenciaRow}>
          {[0, 1, 2, 3, 4].map((v) => {
            const c = INCIDENCIA_CONFIG[v];
            const active = linea.incidencia === v;
            return (
              <button
                key={v}
                onClick={() => onIncidencia(v)}
                title={c.label}
                style={{
                  ...incBtn,
                  background: active ? c.color : "#fff",
                  color: active ? "#fff" : c.color,
                  borderColor: c.color,
                  fontWeight: active ? 800 : 600,
                }}
              >
                {v}
              </button>
            );
          })}
        </div>
        {linea.incidencia > 0 && (
          <p style={{ fontSize: "12px", color: cfg.color, marginTop: "4px", fontWeight: 600 }}>
            {cfg.label}
          </p>
        )}
      </div>

      {/* Foto */}
      <div>
        <label style={lbl}>
          Foto de evidencia
          {needsFoto && (
            <span style={{ color: "#dc2626", marginLeft: "6px" }}>
              * Requerida
            </span>
          )}
        </label>
        {linea.fotoPreview ? (
          <div style={fotoPreviewWrap}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={linea.fotoPreview}
              alt={linea.nombre}
              style={fotoPreviewImg}
            />
            <button
              onClick={() => {
                onFoto(null);
                // Clear preview — handled by parent
              }}
              style={removeFotoBtn}
            >
              ✕ Quitar
            </button>
          </div>
        ) : (
          <button
            onClick={() => fotoRef.current?.click()}
            style={{
              ...fotoBtn,
              borderColor: needsFoto ? "#dc2626" : "#d1d5db",
              color: needsFoto ? "#dc2626" : "#374151",
            }}
          >
            📷 {needsFoto ? "Tomarla es obligatorio" : "Agregar foto (opcional si 0)"}
          </button>
        )}
        <input
          ref={fotoRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFoto(f); }}
        />
      </div>

      {/* Observaciones */}
      <div>
        <label style={lbl}>Observaciones</label>
        <textarea
          value={linea.observaciones}
          onChange={(e) => onObs(e.target.value)}
          style={{ ...inp, height: "64px", resize: "vertical" }}
          placeholder="Descripción de síntomas, localización, plantas afectadas..."
        />
      </div>
    </div>
  );
}

export default function NuevaMonitoreoPage() {
  return (
    <Suspense>
      <NuevaMonitoreoContent />
    </Suspense>
  );
}

// ── Estilos ────────────────────────────────────────────────────────────────
const container: React.CSSProperties = { maxWidth: "900px", margin: "0 auto", padding: "28px 20px 80px" };
const pageTitle: React.CSSProperties = { fontSize: "22px", fontWeight: 800, color: "#1a4731", marginBottom: "24px" };
const section: React.CSSProperties = { background: "#fff", borderRadius: "14px", border: "1px solid #e5e7eb", padding: "20px 22px", marginBottom: "18px" };
const sectionTitle: React.CSSProperties = { fontSize: "15px", fontWeight: 700, color: "#1a4731", marginBottom: "14px" };
const formGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" };
const lbl: React.CSSProperties = { display: "block", fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "5px" };
const inp: React.CSSProperties = { padding: "9px 12px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "14px", background: "#fff", color: "#111", width: "100%", boxSizing: "border-box" };
const hint: React.CSSProperties = { fontSize: "13px", color: "#6b7280", marginBottom: "12px" };
const warn: React.CSSProperties = { fontSize: "12px", color: "#b45309", marginTop: "6px", background: "#fffbeb", padding: "6px 10px", borderRadius: "6px", border: "1px solid #fcd34d" };
const checklistGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "14px" };
const itemCard: React.CSSProperties = { borderRadius: "12px", border: "1.5px solid", padding: "16px", display: "flex", flexDirection: "column", gap: "12px", transition: "border-color 0.15s" };
const itemHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" };
const itemNameWrap: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "4px" };
const tipoBadge: React.CSSProperties = { fontSize: "10px", fontWeight: 800, padding: "2px 8px", borderRadius: "999px", width: "fit-content", letterSpacing: "0.04em" };
const itemName: React.CSSProperties = { fontSize: "14px", fontWeight: 700, color: "#111827", lineHeight: 1.3 };
const metodoToggle: React.CSSProperties = { padding: "4px 10px", borderRadius: "6px", border: "1px solid #d1d5db", background: "#f9fafb", color: "#6b7280", fontSize: "12px", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 };
const metodoBox: React.CSSProperties = { fontSize: "12px", color: "#374151", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "10px 12px", lineHeight: 1.6 };
const incidenciaRow: React.CSSProperties = { display: "flex", gap: "6px" };
const incBtn: React.CSSProperties = { flex: 1, minHeight: "44px", fontSize: "16px", fontWeight: 700, borderRadius: "8px", border: "2px solid", cursor: "pointer", transition: "all 0.1s" };
const fotoUploadArea: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "10px" };
const fotoBtn: React.CSSProperties = { padding: "12px 18px", borderRadius: "10px", border: "2px dashed #d1d5db", background: "#f9fafb", color: "#374151", fontSize: "14px", fontWeight: 600, cursor: "pointer", textAlign: "left" };
const fotoPreviewWrap: React.CSSProperties = { position: "relative", display: "inline-block" };
const fotoPreviewImg: React.CSSProperties = { width: "100%", maxWidth: "280px", height: "160px", objectFit: "cover", borderRadius: "10px", border: "1px solid #d1d5db", display: "block" };
const removeFotoBtn: React.CSSProperties = { position: "absolute", top: "6px", right: "6px", padding: "4px 8px", borderRadius: "6px", background: "rgba(0,0,0,0.7)", color: "#fff", border: "none", fontSize: "12px", fontWeight: 700, cursor: "pointer" };
const actionBar: React.CSSProperties = { display: "flex", gap: "10px", justifyContent: "flex-end", flexWrap: "wrap", marginTop: "8px", padding: "16px 0" };
const cancelBtn: React.CSSProperties = { padding: "12px 20px", borderRadius: "10px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "14px", cursor: "pointer" };
const draftBtn: React.CSSProperties = { padding: "12px 20px", borderRadius: "10px", border: "1.5px solid #1a4731", background: "#fff", color: "#1a4731", fontWeight: 700, fontSize: "14px", cursor: "pointer" };
const sendBtn: React.CSSProperties = { padding: "12px 24px", borderRadius: "10px", border: "none", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "14px", cursor: "pointer" };
const errorBox: React.CSSProperties = { background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: "10px", padding: "14px 18px", color: "#dc2626", fontWeight: 600, fontSize: "14px", marginTop: "8px" };
