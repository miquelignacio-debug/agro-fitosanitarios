"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import type { Cuartel } from "@/lib/types";

type Nivel = "bajo" | "medio" | "alto" | "sobre_umbral";

type Monitoreo = {
  id: string;
  cuartel_id: string | null;
  fecha: string;
  plaga: string;
  nivel: Nivel;
  decision: string | null;
  notas: string | null;
  created_at: string;
  cuartel?: { codigo: string; especie: string; variedad: string } | null;
};

const NIVEL_CONFIG: Record<Nivel, { label: string; color: string; bg: string; icon: string }> = {
  bajo:          { label: "Bajo",          color: "#15803d", bg: "#f0fdf4", icon: "🟢" },
  medio:         { label: "Medio",         color: "#d97706", bg: "#fffbeb", icon: "🟡" },
  alto:          { label: "Alto",          color: "#ea580c", bg: "#fff7ed", icon: "🟠" },
  sobre_umbral:  { label: "Sobre umbral",  color: "#dc2626", bg: "#fef2f2", icon: "🔴" },
};

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-CL", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function MonitoreosContent() {
  const searchParams = useSearchParams();
  const empresa = searchParams.get("empresa") || "";

  const [monitoreos, setMonitoreos] = useState<Monitoreo[]>([]);
  const [cuarteles, setCuarteles] = useState<Cuartel[]>([]);
  const [catalogPlagas, setCatalogPlagas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const emptyForm = { cuartel_id: "", fecha: new Date().toISOString().slice(0, 10), plaga: "", nivel: "medio" as Nivel, decision: "", notas: "" };
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Filtros
  const [filtroCuartel, setFiltroCuartel] = useState("");
  const [filtroNivel, setFiltroNivel] = useState<"" | Nivel>("");

  useEffect(() => {
    supabase.from("plagas_objetivos").select("nombre").eq("activo", true).order("tipo").order("nombre")
      .then(({ data }) => setCatalogPlagas((data || []).map((r: { nombre: string }) => r.nombre)));
  }, []);

  useEffect(() => {
    if (!empresa) { setLoading(false); return; }
    Promise.all([loadMonitoreos(), loadCuarteles()]);
  }, [empresa]);

  const loadMonitoreos = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("monitoreos")
      .select("*, cuartel:cuarteles(codigo, especie, variedad)")
      .eq("empresa_id", empresa)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });
    setMonitoreos((data as unknown as Monitoreo[]) || []);
    setLoading(false);
  };

  const loadCuarteles = async () => {
    const { data } = await supabase.from("cuarteles").select("*").eq("empresa_id", empresa).eq("activo", true).order("codigo");
    setCuarteles((data as Cuartel[]) || []);
  };

  const handleEdit = (m: Monitoreo) => {
    setEditId(m.id);
    setForm({ cuartel_id: m.cuartel_id || "", fecha: m.fecha, plaga: m.plaga, nivel: m.nivel, decision: m.decision || "", notas: m.notas || "" });
    setShowForm(true);
  };

  const handleNuevo = (cuartelId?: string) => {
    setEditId(null);
    setForm({ ...emptyForm, cuartel_id: cuartelId || "", fecha: new Date().toISOString().slice(0, 10) });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.plaga.trim() || !form.nivel) return;
    setSaving(true);
    const payload = {
      empresa_id: empresa,
      cuartel_id: form.cuartel_id || null,
      fecha: form.fecha,
      plaga: form.plaga.trim(),
      nivel: form.nivel,
      decision: form.decision.trim() || null,
      notas: form.notas.trim() || null,
    };
    if (editId) {
      await supabase.from("monitoreos").update(payload).eq("id", editId);
    } else {
      await supabase.from("monitoreos").insert(payload);
    }
    setSaving(false);
    setShowForm(false);
    setEditId(null);
    setForm(emptyForm);
    await loadMonitoreos();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("monitoreos").delete().eq("id", id);
    setDeleteId(null);
    await loadMonitoreos();
  };

  // Alarmas activas: sobre_umbral de los últimos 14 días
  const alarmas = useMemo(() => {
    const limite = new Date();
    limite.setDate(limite.getDate() - 14);
    const limiStr = limite.toISOString().slice(0, 10);
    return monitoreos.filter(m => m.nivel === "sobre_umbral" && m.fecha >= limiStr);
  }, [monitoreos]);

  const filtered = useMemo(() => monitoreos.filter(m => {
    if (filtroCuartel && m.cuartel_id !== filtroCuartel) return false;
    if (filtroNivel && m.nivel !== filtroNivel) return false;
    return true;
  }), [monitoreos, filtroCuartel, filtroNivel]);

  return (
    <>
      <Nav empresaId={empresa} />
      <main style={container}>
        {/* Header */}
        <div style={pageHeader}>
          <div>
            <h1 style={pageTitle}>Monitoreos</h1>
            <p style={pageSub}>Registro de monitoreo de plagas y enfermedades por cuartel</p>
          </div>
          <button onClick={() => handleNuevo()} style={addBtn}>+ Nuevo monitoreo</button>
        </div>

        {/* Alarmas activas */}
        {alarmas.length > 0 && (
          <div style={alarmasBanner}>
            <span style={{ fontWeight: 700, fontSize: "14px" }}>🔴 {alarmas.length} alarma{alarmas.length > 1 ? "s" : ""} activa{alarmas.length > 1 ? "s" : ""} (últimos 14 días)</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
              {alarmas.map(m => (
                <div key={m.id} style={alarmaPill}>
                  <strong>{m.cuartel?.codigo || "Sin cuartel"}</strong> — {m.plaga} ({fmtDate(m.fecha)})
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filtros */}
        <div style={filtrosBar}>
          <select value={filtroCuartel} onChange={e => setFiltroCuartel(e.target.value)} style={filtroInput}>
            <option value="">Todos los cuarteles</option>
            {cuarteles.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.especie}</option>)}
          </select>
          <select value={filtroNivel} onChange={e => setFiltroNivel(e.target.value as "" | Nivel)} style={filtroInput}>
            <option value="">Todos los niveles</option>
            {(Object.keys(NIVEL_CONFIG) as Nivel[]).map(n => (
              <option key={n} value={n}>{NIVEL_CONFIG[n].icon} {NIVEL_CONFIG[n].label}</option>
            ))}
          </select>
          {(filtroCuartel || filtroNivel) && (
            <button onClick={() => { setFiltroCuartel(""); setFiltroNivel(""); }} style={clearBtn}>Limpiar</button>
          )}
          <span style={{ fontSize: "13px", color: "#6b7280", marginLeft: "auto" }}>{filtered.length} registros</span>
        </div>

        {/* Formulario */}
        {showForm && (
          <div style={formCard}>
            <h3 style={formTitle}>{editId ? "Editar monitoreo" : "Nuevo monitoreo"}</h3>
            <div style={formGrid}>
              <div>
                <label style={lbl}>Fecha *</label>
                <input type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Cuartel</label>
                <select value={form.cuartel_id} onChange={e => setForm(p => ({ ...p, cuartel_id: e.target.value }))} style={inp}>
                  <option value="">Sin cuartel específico</option>
                  {cuarteles.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.especie} {c.variedad}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Plaga / Enfermedad *</label>
                <input
                  list="catalog-plagas"
                  value={form.plaga}
                  onChange={e => setForm(p => ({ ...p, plaga: e.target.value }))}
                  style={inp}
                  placeholder="Buscar o escribir..."
                  autoFocus={!editId}
                />
                <datalist id="catalog-plagas">
                  {catalogPlagas.map(nombre => <option key={nombre} value={nombre} />)}
                </datalist>
              </div>
              <div>
                <label style={lbl}>Nivel de infestación *</label>
                <select value={form.nivel} onChange={e => setForm(p => ({ ...p, nivel: e.target.value as Nivel }))} style={inp}>
                  {(Object.keys(NIVEL_CONFIG) as Nivel[]).map(n => (
                    <option key={n} value={n}>{NIVEL_CONFIG[n].icon} {NIVEL_CONFIG[n].label}</option>
                  ))}
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Decisión tomada</label>
                <input value={form.decision} onChange={e => setForm(p => ({ ...p, decision: e.target.value }))} style={inp} placeholder="Ej: Generar OT de control, Continuar monitoreando, Sin acción" />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Notas</label>
                <textarea value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} style={{ ...inp, height: "70px", resize: "vertical" }} placeholder="Observaciones adicionales..." />
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
              <button onClick={handleSave} style={saveBtn} disabled={saving || !form.plaga.trim()}>
                {saving ? "Guardando..." : editId ? "Guardar cambios" : "Agregar"}
              </button>
              <button onClick={() => { setShowForm(false); setEditId(null); }} style={cancelBtn}>Cancelar</button>
            </div>
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <p style={{ color: "#6b7280", padding: "40px 0", textAlign: "center" }}>Cargando...</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: "#9ca3af", padding: "40px 0", textAlign: "center", fontStyle: "italic" }}>
            {empresa ? "Sin registros de monitoreo." : "Seleccioná una empresa en el nav."}
          </p>
        ) : (
          <div style={tableWrap}>
            <table style={tbl}>
              <thead>
                <tr>
                  {["Fecha", "Cuartel", "Especie / Variedad", "Plaga / Enfermedad", "Nivel", "Decisión", "Notas", ""].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => {
                  const cfg = NIVEL_CONFIG[m.nivel];
                  return (
                    <tr key={m.id} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                      <td style={td}>{fmtDate(m.fecha)}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{m.cuartel?.codigo || <span style={{ color: "#9ca3af" }}>—</span>}</td>
                      <td style={{ ...td, fontSize: "12px", color: "#6b7280" }}>
                        {m.cuartel ? `${m.cuartel.especie} ${m.cuartel.variedad}` : "—"}
                      </td>
                      <td style={{ ...td, fontWeight: 600 }}>{m.plaga}</td>
                      <td style={td}>
                        <span style={{ padding: "3px 10px", borderRadius: "999px", background: cfg.bg, color: cfg.color, fontSize: "12px", fontWeight: 700, border: `1px solid ${cfg.color}40`, whiteSpace: "nowrap" }}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </td>
                      <td style={{ ...td, fontSize: "13px" }}>{m.decision || <span style={{ color: "#9ca3af" }}>—</span>}</td>
                      <td style={{ ...td, fontSize: "12px", color: "#6b7280", maxWidth: "200px" }}>{m.notas || <span style={{ color: "#e5e7eb" }}>—</span>}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        <button onClick={() => handleEdit(m)} style={editBtn}>Editar</button>
                        {deleteId === m.id ? (
                          <>
                            <button onClick={() => handleDelete(m.id)} style={confirmDel}>Confirmar</button>
                            <button onClick={() => setDeleteId(null)} style={cancelSmall}>No</button>
                          </>
                        ) : (
                          <button onClick={() => setDeleteId(m.id)} style={delBtn}>Eliminar</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const container: React.CSSProperties   = { maxWidth: "1300px", margin: "0 auto", padding: "28px 20px" };
const pageHeader: React.CSSProperties  = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", gap: "12px", flexWrap: "wrap" };
const pageTitle: React.CSSProperties   = { fontSize: "24px", fontWeight: 800, color: "#1a4731" };
const pageSub: React.CSSProperties     = { fontSize: "13px", color: "#6b7280", marginTop: "4px" };
const addBtn: React.CSSProperties      = { padding: "10px 22px", background: "#1a4731", color: "#fff", border: "none", borderRadius: "10px", fontWeight: 700, fontSize: "14px", cursor: "pointer" };
const alarmasBanner: React.CSSProperties = { background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: "12px", padding: "14px 18px", marginBottom: "18px" };
const alarmaPill: React.CSSProperties  = { padding: "4px 12px", borderRadius: "999px", background: "#fee2e2", color: "#dc2626", fontSize: "12px", fontWeight: 600 };
const filtrosBar: React.CSSProperties  = { display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", marginBottom: "16px" };
const filtroInput: React.CSSProperties = { padding: "8px 12px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "13px", background: "#fff", color: "#111" };
const clearBtn: React.CSSProperties    = { padding: "8px 14px", borderRadius: "8px", border: "1px solid #d1d5db", background: "#fff", color: "#6b7280", fontSize: "13px", cursor: "pointer" };
const formCard: React.CSSProperties    = { background: "#f9fafb", borderRadius: "12px", border: "1px solid #e5e7eb", padding: "20px 22px", marginBottom: "20px" };
const formTitle: React.CSSProperties   = { fontSize: "15px", fontWeight: 700, color: "#1a4731", marginBottom: "14px" };
const formGrid: React.CSSProperties    = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" };
const lbl: React.CSSProperties         = { display: "block", fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "5px" };
const inp: React.CSSProperties         = { padding: "9px 12px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "14px", background: "#fff", color: "#111", width: "100%", boxSizing: "border-box" };
const saveBtn: React.CSSProperties     = { padding: "9px 22px", background: "#1a4731", color: "#fff", border: "none", borderRadius: "9px", fontWeight: 700, fontSize: "14px", cursor: "pointer" };
const cancelBtn: React.CSSProperties   = { padding: "9px 18px", background: "#fff", border: "1.5px solid #d1d5db", borderRadius: "9px", fontWeight: 600, fontSize: "14px", cursor: "pointer", color: "#374151" };
const tableWrap: React.CSSProperties   = { background: "#fff", borderRadius: "14px", border: "1px solid #e5e7eb", overflow: "hidden" };
const tbl: React.CSSProperties         = { width: "100%", borderCollapse: "collapse", fontSize: "13px" };
const th: React.CSSProperties          = { padding: "10px 12px", background: "#1a4731", color: "#fff", textAlign: "left", fontWeight: 700, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" };
const td: React.CSSProperties          = { padding: "10px 12px", borderBottom: "1px solid #f3f4f6", verticalAlign: "middle" };
const editBtn: React.CSSProperties     = { padding: "4px 10px", borderRadius: "6px", border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontSize: "12px", fontWeight: 600, cursor: "pointer", marginRight: "4px" };
const delBtn: React.CSSProperties      = { padding: "4px 10px", borderRadius: "6px", border: "1px solid #fca5a5", background: "#fff", color: "#dc2626", fontSize: "12px", fontWeight: 600, cursor: "pointer" };
const confirmDel: React.CSSProperties  = { padding: "4px 10px", borderRadius: "6px", background: "#dc2626", color: "#fff", fontSize: "12px", fontWeight: 700, border: "none", cursor: "pointer", marginRight: "4px" };
const cancelSmall: React.CSSProperties = { padding: "4px 10px", borderRadius: "6px", border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontSize: "12px", fontWeight: 600, cursor: "pointer" };

export default function MonitoreosPage() {
  return <Suspense><MonitoreosContent /></Suspense>;
}
