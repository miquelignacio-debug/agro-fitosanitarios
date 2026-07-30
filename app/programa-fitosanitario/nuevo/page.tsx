"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/lib/nav";
import { useEmpresa } from "@/lib/useEmpresa";
import { useRol } from "@/lib/useRol";

// ── Tipos ────────────────────────────────────────────────────────────────────
type LineaForm = {
  key: number;
  objetivo: string;
  productoId: string;
  productoNombre: string;
  dosisValor: string;
  dosisUnidad: string;
  destacado: boolean;
};

type EtapaForm = {
  key: number;
  etapaFenologica: string;
  mojamientoLtha: string;
  lineas: LineaForm[];
};

type CuartelOpt = {
  id: string;
  codigo: string;
  nombre: string;
  especie: string;
  campo_nombre: string;
};

type ProdOpt = { id: string; nombre_comercial: string };

const DOSIS_UNIDADES = ["cc/100lt", "lt/100lt", "g/100lt", "kg/100lt", "cc/ha", "lt/ha", "g/ha", "kg/ha"];

function newLinea(): LineaForm {
  return { key: Date.now() + Math.random(), objetivo: "", productoId: "", productoNombre: "", dosisValor: "", dosisUnidad: "cc/100lt", destacado: false };
}

function newEtapa(): EtapaForm {
  return { key: Date.now() + Math.random(), etapaFenologica: "", mojamientoLtha: "", lineas: [newLinea()] };
}

// ── Subcomponente busqueda producto ─────────────────────────────────────────
function ProductoSearch({
  value, productoId, onChange,
}: {
  value: string;
  productoId: string;
  onChange: (nombre: string, id: string) => void;
}) {
  const [results, setResults] = useState<ProdOpt[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (text: string) => {
    onChange(text, "");
    if (timer.current) clearTimeout(timer.current);
    if (text.length >= 2) {
      timer.current = setTimeout(async () => {
        const { data } = await supabase
          .from("productos")
          .select("id, nombre_comercial")
          .eq("activo", true)
          .ilike("nombre_comercial", `%${text}%`)
          .order("nombre_comercial")
          .limit(10);
        setResults((data as ProdOpt[]) || []);
        setOpen(true);
      }, 300);
    } else {
      setResults([]);
      setOpen(false);
    }
  };

  return (
    <div style={{ position: "relative", flex: 1 }}>
      <input
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{ ...cellInput, paddingRight: productoId ? "60px" : undefined }}
        placeholder="Nombre o buscar..."
      />
      {productoId && (
        <span style={{ position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)", fontSize: "10px", color: "#059669", fontWeight: 700, background: "#f0fdf4", padding: "1px 5px", borderRadius: "4px", pointerEvents: "none" }}>
          ✓ cat.
        </span>
      )}
      {open && results.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, background: "#fff", border: "1px solid #d1d5db", borderRadius: "8px", zIndex: 100, maxHeight: "200px", overflowY: "auto", boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}>
          {results.map((r) => (
            <div
              key={r.id}
              onMouseDown={() => { onChange(r.nombre_comercial, r.id); setOpen(false); }}
              style={{ padding: "8px 12px", cursor: "pointer", fontSize: "13px", borderBottom: "1px solid #f3f4f6" }}
            >
              {r.nombre_comercial}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────
function NuevoProgramaContent() {
  const router = useRouter();
  const { empresaId } = useEmpresa();
  const { isSuperAdmin, rol } = useRol();

  // Header
  const [nombre, setNombre] = useState("");
  const [temporada, setTemporada] = useState(new Date().getFullYear().toString());
  const [notas, setNotas] = useState("");

  // Cuarteles
  const [cuartelesDisp, setCuartelesDisp] = useState<CuartelOpt[]>([]);
  const [cuartelSel, setCuartelSel] = useState<Set<string>>(new Set());

  // Etapas
  const [etapas, setEtapas] = useState<EtapaForm[]>([newEtapa()]);

  // UI
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Redirigir si no es superadmin
  useEffect(() => {
    if (rol === null) return;
    if (!isSuperAdmin) { router.push("/dashboard"); }
  }, [rol, isSuperAdmin, router]);

  // Cargar cuarteles
  useEffect(() => {
    if (!empresaId) return;
    const load = async () => {
      const { data } = await supabase
        .from("cuarteles")
        .select("id, codigo, nombre, especie, campo:campos(nombre)")
        .eq("empresa_id", empresaId)
        .eq("activo", true)
        .order("codigo");
      const rows = ((data as unknown as { id: string; codigo: string; nombre: string; especie: string; campo: { nombre: string } | null }[]) || []).map((r) => ({
        id: r.id,
        codigo: r.codigo,
        nombre: r.nombre,
        especie: r.especie,
        campo_nombre: r.campo?.nombre ?? "",
      }));
      setCuartelesDisp(rows);
    };
    load();
  }, [empresaId]);

  // Helpers para etapas/lineas
  const updateEtapa = (key: number, patch: Partial<EtapaForm>) =>
    setEtapas((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));

  const updateLinea = (etapaKey: number, lineaKey: number, patch: Partial<LineaForm>) =>
    setEtapas((prev) =>
      prev.map((e) =>
        e.key !== etapaKey
          ? e
          : { ...e, lineas: e.lineas.map((l) => (l.key === lineaKey ? { ...l, ...patch } : l)) }
      )
    );

  const addLinea = (etapaKey: number) =>
    setEtapas((prev) =>
      prev.map((e) => (e.key === etapaKey ? { ...e, lineas: [...e.lineas, newLinea()] } : e))
    );

  const removeLinea = (etapaKey: number, lineaKey: number) =>
    setEtapas((prev) =>
      prev.map((e) =>
        e.key !== etapaKey ? e : { ...e, lineas: e.lineas.filter((l) => l.key !== lineaKey) }
      )
    );

  const toggleCuartel = (id: string) =>
    setCuartelSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleSave = async () => {
    setError("");
    if (!empresaId) { setError("No hay empresa activa."); return; }
    if (!nombre.trim()) { setError("El nombre del programa es obligatorio."); return; }
    if (cuartelSel.size === 0) { setError("Seleccioná al menos un cuartel."); return; }
    if (etapas.length === 0) { setError("Agregá al menos una etapa."); return; }
    for (const e of etapas) {
      if (!e.etapaFenologica.trim()) { setError("Todas las etapas deben tener estado fenológico."); return; }
      for (const l of e.lineas) {
        if (!l.productoNombre.trim()) { setError("Cada línea debe tener nombre de producto."); return; }
      }
    }

    setSaving(true);

    const { data: prog, error: progErr } = await supabase
      .from("programas_fitosanitarios")
      .insert({
        empresa_id: empresaId,
        nombre: nombre.trim(),
        temporada: temporada.trim() || new Date().getFullYear().toString(),
        notas: notas.trim() || null,
        activo: true,
      })
      .select("id")
      .single();
    if (progErr || !prog) { setError(progErr?.message ?? "Error al guardar."); setSaving(false); return; }

    const { error: cuarErr } = await supabase
      .from("programa_cuarteles")
      .insert([...cuartelSel].map((cid) => ({ programa_id: prog.id, cuartel_id: cid })));
    if (cuarErr) { setError(cuarErr.message); setSaving(false); return; }

    for (let i = 0; i < etapas.length; i++) {
      const e = etapas[i];
      const { data: etapa, error: etErr } = await supabase
        .from("programa_etapas")
        .insert({
          programa_id: prog.id,
          numero: i + 1,
          etapa_fenologica: e.etapaFenologica.trim(),
          mojamiento_ltha: e.mojamientoLtha ? parseFloat(e.mojamientoLtha) : null,
        })
        .select("id")
        .single();
      if (etErr || !etapa) { setError(etErr?.message ?? "Error en etapa."); setSaving(false); return; }

      if (e.lineas.length > 0) {
        const { error: lErr } = await supabase.from("programa_etapa_lineas").insert(
          e.lineas.map((l, idx) => ({
            etapa_id: etapa.id,
            objetivo: l.objetivo.trim() || null,
            producto_id: l.productoId || null,
            producto_nombre: l.productoNombre.trim(),
            dosis_valor: l.dosisValor ? parseFloat(l.dosisValor) : null,
            dosis_unidad: l.dosisUnidad,
            destacado: l.destacado,
            orden: idx,
          }))
        );
        if (lErr) { setError(lErr.message); setSaving(false); return; }
      }
    }

    router.push(`/programa-fitosanitario/${prog.id}`);
  };

  if (isSuperAdmin === null) return null;

  // Agrupar cuarteles por campo
  const cuartelesPorCampo: Record<string, CuartelOpt[]> = {};
  cuartelesDisp.forEach((c) => {
    const key = c.campo_nombre || "Sin campo";
    if (!cuartelesPorCampo[key]) cuartelesPorCampo[key] = [];
    cuartelesPorCampo[key].push(c);
  });

  return (
    <>
      <Nav />
      <main style={container}>
        <div style={{ marginBottom: "24px" }}>
          <button onClick={() => router.back()} style={backBtn}>← Volver</button>
          <h1 style={pageTitle}>Nuevo programa fitosanitario</h1>
        </div>

        {/* ── Sección 1: Info general ── */}
        <div style={card}>
          <h2 style={sectionTitle}>Información general</h2>
          <div style={grid2}>
            <Field label="Nombre del programa *">
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} style={inputStyle} placeholder="Ej: Programa de Invierno 2025" />
            </Field>
            <Field label="Temporada">
              <input value={temporada} onChange={(e) => setTemporada(e.target.value)} style={inputStyle} placeholder={new Date().getFullYear().toString()} />
            </Field>
          </div>
          <div style={{ marginTop: "14px" }}>
            <Field label="Notas (opcional)">
              <textarea value={notas} onChange={(e) => setNotas(e.target.value)} style={{ ...inputStyle, height: "64px", resize: "vertical" }} placeholder="Observaciones generales del programa..." />
            </Field>
          </div>
        </div>

        {/* ── Sección 2: Cuarteles ── */}
        <div style={{ ...card, marginTop: "16px" }}>
          <h2 style={sectionTitle}>Cuarteles aplicables</h2>
          <p style={{ fontSize: "12px", color: "#6b7280", marginBottom: "14px" }}>
            El programa aplica a los cuarteles seleccionados. Podés crear versiones distintas por cuartel si los tratamientos difieren.
          </p>
          {Object.keys(cuartelesPorCampo).length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: "13px" }}>Sin cuarteles disponibles</p>
          ) : (
            Object.entries(cuartelesPorCampo).map(([campo, list]) => (
              <div key={campo} style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>{campo}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {list.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCuartel(c.id)}
                      style={{
                        padding: "6px 14px",
                        borderRadius: "8px",
                        border: `1.5px solid ${cuartelSel.has(c.id) ? "#1a4731" : "#d1d5db"}`,
                        background: cuartelSel.has(c.id) ? "#f0fdf4" : "#fff",
                        color: cuartelSel.has(c.id) ? "#1a4731" : "#374151",
                        fontWeight: cuartelSel.has(c.id) ? 700 : 500,
                        fontSize: "13px",
                        cursor: "pointer",
                      }}
                    >
                      {cuartelSel.has(c.id) ? "✓ " : ""}{c.codigo}
                      {c.especie ? ` (${c.especie})` : ""}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
          {cuartelSel.size > 0 && (
            <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
              {cuartelSel.size} cuartel{cuartelSel.size !== 1 ? "es" : ""} seleccionado{cuartelSel.size !== 1 ? "s" : ""}
            </div>
          )}
        </div>

        {/* ── Sección 3: Etapas ── */}
        <div style={{ marginTop: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h2 style={{ fontSize: "17px", fontWeight: 800, color: "#1a4731" }}>Etapas fenológicas</h2>
            <button
              type="button"
              onClick={() => setEtapas((prev) => [...prev, newEtapa()])}
              style={addBtn}
            >
              + Agregar etapa
            </button>
          </div>

          {etapas.map((etapa, etapaIdx) => (
            <div key={etapa.key} style={{ ...card, marginBottom: "16px", borderLeft: "4px solid #1a4731" }}>
              {/* Header etapa */}
              <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "16px" }}>
                <div style={{ background: "#1a4731", color: "#fff", borderRadius: "50%", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "13px", flexShrink: 0 }}>
                  {etapaIdx + 1}
                </div>
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <label style={labelStyle}>Estado fenológico *</label>
                  <input
                    value={etapa.etapaFenologica}
                    onChange={(e) => updateEtapa(etapa.key, { etapaFenologica: e.target.value })}
                    style={inputStyle}
                    placeholder="Ej: Brotación, Flor, Cuaja..."
                  />
                </div>
                <div style={{ minWidth: "140px" }}>
                  <label style={labelStyle}>Mojamiento (lt/ha)</label>
                  <input
                    type="number" min="0" step="10"
                    value={etapa.mojamientoLtha}
                    onChange={(e) => updateEtapa(etapa.key, { mojamientoLtha: e.target.value })}
                    style={inputStyle}
                    placeholder="Ej: 1000"
                  />
                </div>
                {etapas.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setEtapas((prev) => prev.filter((e) => e.key !== etapa.key))}
                    style={deleteEtapaBtn}
                  >
                    Eliminar etapa
                  </button>
                )}
              </div>

              {/* Tabla lineas */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      <th style={th}>Objetivo</th>
                      <th style={{ ...th, minWidth: "180px" }}>Producto *</th>
                      <th style={{ ...th, width: "90px" }}>Dosis</th>
                      <th style={{ ...th, width: "110px" }}>Unidad</th>
                      <th style={{ ...th, width: "60px" }}>Dest.</th>
                      <th style={{ ...th, width: "40px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {etapa.lineas.map((linea) => (
                      <tr key={linea.key} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={td}>
                          <input
                            value={linea.objetivo}
                            onChange={(e) => updateLinea(etapa.key, linea.key, { objetivo: e.target.value })}
                            style={cellInput}
                            placeholder="Ej: Botrytis..."
                          />
                        </td>
                        <td style={td}>
                          <ProductoSearch
                            value={linea.productoNombre}
                            productoId={linea.productoId}
                            onChange={(nombre, id) => updateLinea(etapa.key, linea.key, { productoNombre: nombre, productoId: id })}
                          />
                        </td>
                        <td style={td}>
                          <input
                            type="number" min="0" step="0.1"
                            value={linea.dosisValor}
                            onChange={(e) => updateLinea(etapa.key, linea.key, { dosisValor: e.target.value })}
                            style={cellInput}
                            placeholder="0"
                          />
                        </td>
                        <td style={td}>
                          <select
                            value={linea.dosisUnidad}
                            onChange={(e) => updateLinea(etapa.key, linea.key, { dosisUnidad: e.target.value })}
                            style={cellInput}
                          >
                            {DOSIS_UNIDADES.map((u) => (
                              <option key={u} value={u}>{u.replace("/100lt", "/HL")}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ ...td, textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={linea.destacado}
                            onChange={(e) => updateLinea(etapa.key, linea.key, { destacado: e.target.checked })}
                            style={{ width: "16px", height: "16px", cursor: "pointer" }}
                            title="Destacado"
                          />
                        </td>
                        <td style={{ ...td, textAlign: "center" }}>
                          {etapa.lineas.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLinea(etapa.key, linea.key)}
                              style={deleteLineaBtn}
                              title="Eliminar línea"
                            >
                              ×
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={() => addLinea(etapa.key)}
                style={{ ...addBtn, marginTop: "10px", fontSize: "12px", padding: "5px 12px" }}
              >
                + Agregar producto
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        {error && (
          <div style={errorStyle}>{error}</div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px", paddingBottom: "40px" }}>
          <button onClick={() => router.back()} style={cancelBtn} disabled={saving}>Cancelar</button>
          <button onClick={handleSave} style={saveBtn} disabled={saving}>
            {saving ? "Guardando..." : "Guardar programa"}
          </button>
        </div>
      </main>
    </>
  );
}

export default function NuevoProgramaPage() {
  return <Suspense><NuevoProgramaContent /></Suspense>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

// ── Estilos ──────────────────────────────────────────────────────────────────
const container: React.CSSProperties = { maxWidth: "1000px", margin: "0 auto", padding: "28px 20px" };
const pageTitle: React.CSSProperties = { fontSize: "24px", fontWeight: 800, color: "#1a4731", marginTop: "8px" };
const card: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: "14px", padding: "22px 24px" };
const sectionTitle: React.CSSProperties = { fontSize: "13px", fontWeight: 700, color: "#1a4731", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "16px" };
const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" };
const labelStyle: React.CSSProperties = { fontSize: "12px", fontWeight: 700, color: "#374151" };
const inputStyle: React.CSSProperties = { padding: "9px 12px", borderRadius: "8px", border: "1.5px solid #d1d5db", fontSize: "14px", background: "#fafafa", color: "#111", width: "100%", boxSizing: "border-box" };
const cellInput: React.CSSProperties = { padding: "6px 8px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "12px", background: "#fafafa", color: "#111", width: "100%", boxSizing: "border-box" };
const th: React.CSSProperties = { padding: "8px 10px", textAlign: "left", fontWeight: 700, fontSize: "11px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e5e7eb" };
const td: React.CSSProperties = { padding: "6px 6px" };
const addBtn: React.CSSProperties = { background: "#f0fdf4", color: "#1a4731", border: "1.5px solid #86efac", borderRadius: "8px", padding: "7px 14px", fontWeight: 700, fontSize: "13px", cursor: "pointer" };
const deleteEtapaBtn: React.CSSProperties = { background: "transparent", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: "6px", padding: "5px 10px", fontSize: "12px", cursor: "pointer" };
const deleteLineaBtn: React.CSSProperties = { background: "transparent", color: "#9ca3af", border: "none", fontSize: "18px", cursor: "pointer", lineHeight: 1, padding: "0 4px" };
const errorStyle: React.CSSProperties = { padding: "12px 16px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", color: "#dc2626", fontSize: "13px", marginTop: "16px" };
const cancelBtn: React.CSSProperties = { padding: "10px 22px", borderRadius: "8px", border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "14px", cursor: "pointer" };
const saveBtn: React.CSSProperties = { padding: "10px 28px", borderRadius: "8px", background: "#1a4731", color: "#fff", fontWeight: 700, fontSize: "14px", border: "none", cursor: "pointer" };
const backBtn: React.CSSProperties = { background: "transparent", border: "none", color: "#6b7280", fontSize: "13px", cursor: "pointer", padding: "0 0 6px", fontWeight: 600 };